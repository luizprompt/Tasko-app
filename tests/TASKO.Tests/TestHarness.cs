using Microsoft.EntityFrameworkCore;
using Tasko.Application.Abstractions;
using Tasko.Application.Contracts;
using Tasko.Application.Services;
using Tasko.Domain;
using Tasko.Domain.Entities;
using Tasko.Domain.Repositories;
using Tasko.Infrastructure.Persistence;

namespace Tasko.Tests;

internal sealed class FakeClock : IClock
{
    public FakeClock(DateTimeOffset now) => UtcNow = now;

    public DateTimeOffset UtcNow { get; set; }

    public void Advance(TimeSpan delta) => UtcNow = UtcNow.Add(delta);
}

internal sealed class FakeCurrentUser : ICurrentUser
{
    public Guid? UserId { get; set; }
    public string? IpAddress { get; set; } = "127.0.0.1";
    public HashSet<RoleType> Roles { get; set; } = [];

    public bool IsInRole(RoleType role) => Roles.Contains(role);
}

internal sealed class FakePasswordHasher : IPasswordHasher
{
    public string Hash(string password) => "hash:" + password;

    public bool Verify(string password, string passwordHash) => passwordHash == "hash:" + password;
}

internal sealed class FakeTokenService(IClock clock) : ITokenService
{
    public AccessTokenResult CreateAccessToken(User user) =>
        new($"access-{user.Id}", clock.UtcNow.AddMinutes(15));

    public OpaqueTokenResult CreateOpaqueToken(TimeSpan lifetime)
    {
        var token = Guid.NewGuid().ToString("N");
        return new OpaqueTokenResult(token, HashToken(token), clock.UtcNow.Add(lifetime));
    }

    public string HashToken(string token) => "hash:" + token;
}

internal sealed class FakeEmailSender : IEmailSender
{
    public List<(string To, string Subject, string Body)> Sent { get; } = [];

    public Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        Sent.Add((to, subject, body));
        return Task.CompletedTask;
    }
}

internal sealed class TestHarness : IAsyncDisposable
{
    public TestHarness(DbContextOptions<TaskoDbContext>? databaseOptions = null)
    {
        var options = new DbContextOptionsBuilder<TaskoDbContext>()
            .UseInMemoryDatabase($"tasko-tests-{Guid.NewGuid()}")
            .Options;

        Db = new TaskoDbContext(databaseOptions ?? options);
        Clock = new FakeClock(new DateTimeOffset(2026, 1, 10, 12, 0, 0, TimeSpan.Zero));
        CurrentUser = new FakeCurrentUser();

        var unitOfWork = new UnitOfWork(Db);
        var audit = new AuditService(new ActivityLogRepository(Db), CurrentUser, Clock);

        Users = new UserRepository(Db);
        Categories = new CategoryRepository(Db);
        PublicationsRepository = new PublicationRepository(Db);
        ProposalsRepository = new ProposalRepository(Db);
        EngagementsRepository = new EngagementRepository(Db);
        ReviewsRepository = new ReviewRepository(Db);
        NotificationsRepository = new NotificationRepository(Db);
        ReportsRepository = new ReportRepository(Db);
        RefreshTokens = new RefreshTokenRepository(Db, Clock);
        ResetTokens = new PasswordResetTokenRepository(Db, Clock);

        Email = new FakeEmailSender();
        PasswordHasher = new FakePasswordHasher();
        var jwt = new JwtOptions { SigningKey = new string('k', 48) };
        var authOptions = new AuthOptions { ExposeSensitiveTokens = true };

        Auth = new AuthService(
            Users, RefreshTokens, ResetTokens, unitOfWork, PasswordHasher, new FakeTokenService(Clock),
            Email, CurrentUser, Clock, jwt, authOptions, audit);
        Profiles = new ProfileService(Users, Categories, ReviewsRepository, unitOfWork, CurrentUser, Clock, audit);
        Publications = new PublicationService(
            PublicationsRepository, Categories, EngagementsRepository, unitOfWork, CurrentUser, Clock, audit);
        Proposals = new ProposalService(
            ProposalsRepository, PublicationsRepository, EngagementsRepository, Users, ReviewsRepository,
            NotificationsRepository, unitOfWork, CurrentUser, Clock, audit);
        Engagements = new EngagementService(
            EngagementsRepository, PublicationsRepository, NotificationsRepository, unitOfWork, CurrentUser, Clock, audit);
        Reviews = new ReviewService(
            ReviewsRepository, PublicationsRepository, EngagementsRepository, Users, NotificationsRepository,
            unitOfWork, CurrentUser, Clock, audit);
        Reports = new ReportService(
            ReportsRepository, PublicationsRepository, Users, NotificationsRepository, unitOfWork, CurrentUser,
            Clock, audit);
    }

    public TaskoDbContext Db { get; }
    public FakeClock Clock { get; }
    public FakeCurrentUser CurrentUser { get; }
    public FakeEmailSender Email { get; }
    public FakePasswordHasher PasswordHasher { get; }

    public UserRepository Users { get; }
    public CategoryRepository Categories { get; }
    public PublicationRepository PublicationsRepository { get; }
    public ProposalRepository ProposalsRepository { get; }
    public EngagementRepository EngagementsRepository { get; }
    public ReviewRepository ReviewsRepository { get; }
    public NotificationRepository NotificationsRepository { get; }
    public ReportRepository ReportsRepository { get; }
    public RefreshTokenRepository RefreshTokens { get; }
    public PasswordResetTokenRepository ResetTokens { get; }

    public AuthService Auth { get; }
    public ProfileService Profiles { get; }
    public PublicationService Publications { get; }
    public ProposalService Proposals { get; }
    public EngagementService Engagements { get; }
    public ReviewService Reviews { get; }
    public ReportService Reports { get; }

    public void ActAs(User? user)
    {
        CurrentUser.UserId = user?.Id;
        CurrentUser.Roles = user is null
            ? []
            : user.Roles.Select(r => r.Role).ToHashSet();
    }

    public async Task<User> CreateUserAsync(string name, string email, params RoleType[] roles)
    {
        var now = Clock.UtcNow;
        var user = User.Create(name, email, PasswordHasher.Hash("Senha123"), now);
        foreach (var role in roles)
        {
            user.AddRole(role, now);
        }

        user.EnsureProfile(now);
        Db.Users.Add(user);
        await Db.SaveChangesAsync();
        return user;
    }

    public async Task<Category> CreateCategoryAsync(string name)
    {
        var category = Category.Create(name, null, Clock.UtcNow);
        Db.Categories.Add(category);
        await Db.SaveChangesAsync();
        return category;
    }

    public async Task<Publication> CreatePublicationAsync(
        User author,
        PublicationType type,
        string city = "São Paulo",
        string region = "Zona Central",
        Category? category = null)
    {
        category ??= await CreateCategoryAsync("Elétrica");

        var input = new PublicationInput(
            type,
            category.Id,
            "Preciso de eletricista",
            "Troca de disjuntor e revisão da fiação antiga do imóvel.",
            city,
            "Centro",
            region,
            type == PublicationType.Request ? 100m : null,
            type == PublicationType.Request ? 300m : null,
            type == PublicationType.Offer ? 250m : null,
            type == PublicationType.Request ? Clock.UtcNow.AddDays(5) : null);

        var publication = Publication.Create(author.Id, input, Clock.UtcNow);
        Db.Publications.Add(publication);
        await Db.SaveChangesAsync();
        return publication;
    }

    public async Task<Proposal> CreateProposalAsync(Publication publication, User proposer, decimal? price = 200m)
    {
        ActAs(proposer);
        var response = await Proposals.CreateAsync(
            publication.Id,
            new CreateProposalRequest("Posso executar o serviço amanhã pela manhã.", price),
            CancellationToken.None);

        return await Db.Proposals.FindAsync(response.Id)
            ?? throw new InvalidOperationException("Proposta não encontrada.");
    }

    public async Task<Engagement> AcceptAsync(Proposal proposal, User author)
    {
        ActAs(author);
        var response = await Proposals.AcceptAsync(proposal.Id, CancellationToken.None);
        return await Db.Engagements.FindAsync(response.Id)
            ?? throw new InvalidOperationException("Contratação não encontrada.");
    }

    /// <summary>Fluxo completo: aceite → confirmação → conclusão.</summary>
    public async Task<Engagement> CompleteAsync(Proposal proposal, User author)
    {
        var engagement = await AcceptAsync(proposal, author);

        ActAs(author);
        await Engagements.ConfirmAsync(engagement.Id, CancellationToken.None);
        await Engagements.CompleteAsync(engagement.Id, CancellationToken.None);

        return engagement;
    }

    public async ValueTask DisposeAsync()
    {
        await Db.DisposeAsync();
    }
}

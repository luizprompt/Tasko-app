using Microsoft.EntityFrameworkCore;
using Tasko.Domain;
using Tasko.Domain.Entities;
using Tasko.Domain.Repositories;

namespace Tasko.Infrastructure.Persistence;

public sealed class UserRepository(TaskoDbContext db) : IUserRepository
{
    public Task<User?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Users
            .Include(u => u.Roles)
            .Include(u => u.Profile)
            .Include(u => u.Skills).ThenInclude(s => s.Category)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    public Task<User?> GetByEmailAsync(string email, CancellationToken ct = default) =>
        db.Users
            .Include(u => u.Roles)
            .Include(u => u.Profile)
            .FirstOrDefaultAsync(u => u.Email == email && u.DeletedAt == null, ct);

    public Task<bool> EmailExistsAsync(string email, CancellationToken ct = default) =>
        db.Users.AnyAsync(u => u.Email == email && u.DeletedAt == null, ct);

    public async Task AddAsync(User user, CancellationToken ct = default) =>
        await db.Users.AddAsync(user, ct);

    public async Task ReplaceSkillsAsync(
        Guid userId,
        IReadOnlyList<(Guid CategoryId, string Name)> skills,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw DomainException.NotFound("user.not_found", "Usuário não encontrado.");

        var existing = await db.UserSkills.Where(s => s.UserId == userId).ToListAsync(ct);
        db.UserSkills.RemoveRange(existing);

        foreach (var (categoryId, name) in skills)
        {
            await db.UserSkills.AddAsync(UserSkill.Create(userId, categoryId, name, now), ct);
        }

        user.MarkSkillsUpdated(now);
    }
}

public sealed class CategoryRepository(TaskoDbContext db) : ICategoryRepository
{
    public async Task<IReadOnlyList<Category>> ListAsync(CancellationToken ct = default) =>
        await db.Categories.AsNoTracking().OrderBy(c => c.Name).ToListAsync(ct);

    public Task<Category?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Categories.FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<bool> ExistsAsync(Guid id, CancellationToken ct = default) =>
        db.Categories.AnyAsync(c => c.Id == id, ct);

    public async Task AddRangeAsync(IEnumerable<Category> categories, CancellationToken ct = default) =>
        await db.Categories.AddRangeAsync(categories, ct);
}

public sealed class PublicationRepository(TaskoDbContext db) : IPublicationRepository
{
    public Task<Publication?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Publications
            .Include(p => p.Author)
            .Include(p => p.Category)
            .Include(p => p.Proposals)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public Task<Publication?> GetDetailAsync(Guid id, CancellationToken ct = default) =>
        db.Publications
            .Include(p => p.Author)
            .Include(p => p.Category)
            .Include(p => p.Proposals)
            .Include(p => p.StatusHistory)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<Publication?> GetForUpdateAsync(Guid id, CancellationToken ct = default)
    {
        if (!db.Database.IsRelational())
        {
            return await GetByIdAsync(id, ct);
        }

        // Lock pessimista: serializa aceites concorrentes da mesma publicação (RN04/RN05).
        var publication = await db.Publications
            .FromSqlRaw("SELECT * FROM publications WHERE id = {0} FOR UPDATE", id)
            .Include(p => p.Author)
            .Include(p => p.Category)
            .Include(p => p.Proposals)
            .FirstOrDefaultAsync(ct);
        // A proposta pode ter carregado esta publicação antes de esperar pelo lock.
        // EF mantém a instância rastreada: recarregue o estado após adquirir o lock
        // para não decidir com o snapshot anterior ao aceite concorrente.
        if (publication is not null)
            await db.Entry(publication).ReloadAsync(ct);
        return publication;
    }

    public async Task<PagedResult<Publication>> SearchAsync(PublicationQuery query, CancellationToken ct = default)
    {
        var source = db.Publications
            .AsNoTracking()
            .Include(p => p.Author)
            .Include(p => p.Category)
            .Include(p => p.Proposals)
            .Where(p => p.Status != PublicationStatus.Hidden);

        if (query.Type is not null)
        {
            source = source.Where(p => p.Type == query.Type);
        }

        if (query.CategoryId is not null)
        {
            source = source.Where(p => p.CategoryId == query.CategoryId);
        }

        if (query.AuthorId is not null)
        {
            source = source.Where(p => p.AuthorId == query.AuthorId);
        }

        if (query.Status is not null)
        {
            source = source.Where(p => p.Status == query.Status);
        }

        if (!string.IsNullOrWhiteSpace(query.City))
        {
            var city = query.City.Trim().ToLower();
            source = source.Where(p => p.City.ToLower() == city);
        }

        if (!string.IsNullOrWhiteSpace(query.ServiceRegion))
        {
            var region = query.ServiceRegion.Trim().ToLower();
            source = source.Where(p => p.ServiceRegion.ToLower() == region);
        }

        if (!string.IsNullOrWhiteSpace(query.Term))
        {
            var term = query.Term.Trim().ToLower();
            source = source.Where(p =>
                p.Title.ToLower().Contains(term) ||
                p.Description.ToLower().Contains(term));
        }

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(p => p.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);

        return new PagedResult<Publication>(items, total);
    }

    public async Task<PagedResult<Publication>> ListByAuthorAsync(
        Guid authorId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = db.Publications
            .AsNoTracking()
            .Include(p => p.Author)
            .Include(p => p.Category)
            .Include(p => p.Proposals)
            .Where(p => p.AuthorId == authorId);

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Publication>(items, total);
    }

    public async Task AddAsync(Publication publication, CancellationToken ct = default) =>
        await db.Publications.AddAsync(publication, ct);

    public void AddStatusHistory(PublicationStatusHistory history) => db.PublicationStatusHistories.Add(history);
}

public sealed class ProposalRepository(TaskoDbContext db) : IProposalRepository
{
    public Task<Proposal?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Proposals
            .Include(p => p.Publication)
            .Include(p => p.Proposer).ThenInclude(u => u!.Profile)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IReadOnlyList<Proposal>> ListByPublicationAsync(Guid publicationId, CancellationToken ct = default) =>
        await db.Proposals
            .AsNoTracking()
            .Include(p => p.Proposer).ThenInclude(u => u!.Profile)
            .Where(p => p.PublicationId == publicationId)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Proposal>> ListPendingByPublicationAsync(Guid publicationId, CancellationToken ct = default) =>
        await db.Proposals
            .Where(p => p.PublicationId == publicationId && p.Status == ProposalStatus.Pending)
            .ToListAsync(ct);

    public async Task<PagedResult<Proposal>> ListByProposerAsync(
        Guid proposerId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = db.Proposals
            .AsNoTracking()
            .Include(p => p.Publication)
            .Where(p => p.ProposerId == proposerId);

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Proposal>(items, total);
    }

    public Task<bool> HasPendingAsync(Guid publicationId, Guid proposerId, CancellationToken ct = default) =>
        db.Proposals.AnyAsync(
            p => p.PublicationId == publicationId &&
                 p.ProposerId == proposerId &&
                 p.Status == ProposalStatus.Pending,
            ct);

    public async Task AddAsync(Proposal proposal, CancellationToken ct = default) =>
        await db.Proposals.AddAsync(proposal, ct);
}

public sealed class EngagementRepository(TaskoDbContext db) : IEngagementRepository
{
    private IQueryable<Engagement> Query() => db.Engagements
        .Include(e => e.Publication)
        .Include(e => e.Proposer).ThenInclude(u => u!.Profile)
        .Include(e => e.Receiver).ThenInclude(u => u!.Profile)
        .Include(e => e.Provider);

    public Task<Engagement?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        Query().FirstOrDefaultAsync(e => e.Id == id, ct);

    public Task<Engagement?> GetByPublicationAsync(Guid publicationId, CancellationToken ct = default) =>
        Query()
            .Where(e => e.PublicationId == publicationId)
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync(ct);

    public async Task<PagedResult<Engagement>> ListByUserAsync(
        Guid userId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = Query().AsNoTracking().Where(e => e.ProposerId == userId || e.ReceiverId == userId);

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Engagement>(items, total);
    }

    public Task<bool> AnyActiveByPublicationAsync(Guid publicationId, CancellationToken ct = default) =>
        db.Engagements.AnyAsync(
            e => e.PublicationId == publicationId && e.Status == EngagementStatus.Active,
            ct);

    public async Task AddAsync(Engagement engagement, CancellationToken ct = default) =>
        await db.Engagements.AddAsync(engagement, ct);
}

public sealed class ReviewRepository(TaskoDbContext db) : IReviewRepository
{
    public Task<bool> ExistsAsync(Guid publicationId, Guid reviewerId, CancellationToken ct = default) =>
        db.Reviews.AnyAsync(r => r.PublicationId == publicationId && r.ReviewerId == reviewerId, ct);

    public async Task<PagedResult<Review>> ListByReviewedUserAsync(
        Guid userId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = db.Reviews
            .AsNoTracking()
            .Include(r => r.Reviewer)
            .Where(r => r.ReviewedId == userId);

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Review>(items, total);
    }

    public async Task<PagedResult<Review>> ListByPublicationAsync(
        Guid publicationId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = db.Reviews
            .AsNoTracking()
            .Include(r => r.Reviewer)
            .Where(r => r.PublicationId == publicationId);

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Review>(items, total);
    }

    public async Task<(double? Average, int Count)> GetRatingAsync(Guid userId, CancellationToken ct = default)
    {
        var query = db.Reviews.AsNoTracking().Where(r => r.ReviewedId == userId);
        var count = await query.CountAsync(ct);
        if (count == 0)
        {
            return (null, 0);
        }

        var average = await query.AverageAsync(r => (double)r.Rating, ct);
        return (Math.Round(average, 2), count);
    }

    public async Task AddAsync(Review review, CancellationToken ct = default) =>
        await db.Reviews.AddAsync(review, ct);
}

public sealed class NotificationRepository(TaskoDbContext db) : INotificationRepository
{
    public Task<Notification?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Notifications.FirstOrDefaultAsync(n => n.Id == id, ct);

    public async Task<PagedResult<Notification>> ListByUserAsync(
        Guid userId,
        bool unreadOnly,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        if (unreadOnly)
        {
            source = source.Where(n => n.ReadAt == null);
        }

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Notification>(items, total);
    }

    public Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default) =>
        db.Notifications.CountAsync(n => n.UserId == userId && n.ReadAt == null, ct);

    public async Task<IReadOnlyList<Notification>> ListUnreadByUserAsync(Guid userId, CancellationToken ct = default) =>
        await db.Notifications.Where(n => n.UserId == userId && n.ReadAt == null).ToListAsync(ct);

    public async Task AddAsync(Notification notification, CancellationToken ct = default) =>
        await db.Notifications.AddAsync(notification, ct);
}

public sealed class ReportRepository(TaskoDbContext db) : IReportRepository
{
    public Task<Report?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Reports
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .Include(r => r.Publication)
            .Include(r => r.Moderator)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    public async Task<PagedResult<Report>> ListAsync(
        ReportStatus? status,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var source = db.Reports
            .AsNoTracking()
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .Include(r => r.Publication)
            .AsQueryable();

        if (status is not null)
        {
            source = source.Where(r => r.Status == status);
        }

        var total = await source.CountAsync(ct);
        var items = await source
            .OrderBy(r => r.Status == ReportStatus.Pending ? 0 : 1)
            .ThenByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Report>(items, total);
    }

    public async Task AddAsync(Report report, CancellationToken ct = default) =>
        await db.Reports.AddAsync(report, ct);
}

public sealed class RefreshTokenRepository(TaskoDbContext db, Tasko.Application.Abstractions.IClock clock) : IRefreshTokenRepository
{
    public Task<RefreshToken?> GetByHashAsync(string tokenHash, CancellationToken ct = default) =>
        db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

    public async Task<IReadOnlyList<RefreshToken>> ListActiveByUserAsync(Guid userId, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        return await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.ExpiresAt > now)
            .ToListAsync(ct);
    }

    public async Task AddAsync(RefreshToken token, CancellationToken ct = default) =>
        await db.RefreshTokens.AddAsync(token, ct);
}

public sealed class PasswordResetTokenRepository(TaskoDbContext db, Tasko.Application.Abstractions.IClock clock) : IPasswordResetTokenRepository
{
    public Task<PasswordResetToken?> GetByHashAsync(string tokenHash, CancellationToken ct = default) =>
        db.PasswordResetTokens.FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

    public async Task<IReadOnlyList<PasswordResetToken>> ListActiveByUserAsync(Guid userId, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        return await db.PasswordResetTokens
            .Where(t => t.UserId == userId && t.UsedAt == null && t.ExpiresAt > now)
            .ToListAsync(ct);
    }

    public async Task AddAsync(PasswordResetToken token, CancellationToken ct = default) =>
        await db.PasswordResetTokens.AddAsync(token, ct);
}

public sealed class ActivityLogRepository(TaskoDbContext db) : IActivityLogRepository
{
    public void Add(ActivityLog log) => db.ActivityLogs.Add(log);
}

public sealed class UnitOfWork(TaskoDbContext db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);

    public async Task<IUnitOfWorkTransaction> BeginTransactionAsync(CancellationToken ct = default)
    {
        if (!db.Database.IsRelational())
        {
            return new NoopTransaction();
        }

        var transaction = await db.Database.BeginTransactionAsync(ct);
        return new EfTransaction(transaction);
    }

    private sealed class EfTransaction(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction)
        : IUnitOfWorkTransaction
    {
        public Task CommitAsync(CancellationToken ct = default) => transaction.CommitAsync(ct);

        public Task RollbackAsync(CancellationToken ct = default) => transaction.RollbackAsync(ct);

        public ValueTask DisposeAsync() => transaction.DisposeAsync();
    }

    private sealed class NoopTransaction : IUnitOfWorkTransaction
    {
        public Task CommitAsync(CancellationToken ct = default) => Task.CompletedTask;

        public Task RollbackAsync(CancellationToken ct = default) => Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}

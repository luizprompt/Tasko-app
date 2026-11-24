using Microsoft.EntityFrameworkCore;
using Npgsql;
using Tasko.Application.Contracts;
using Tasko.Domain;
using Tasko.Domain.Entities;
using Tasko.Infrastructure.Persistence;

namespace Tasko.Tests.Integration;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TASKO_TEST_POSTGRES")))
            Skip = "Defina TASKO_TEST_POSTGRES para executar em PostgreSQL real (cria banco temporário).";
    }
}

public sealed class PostgresTests
{
    [PostgresFact]
    [Trait("Category", "Postgres")]
    public async Task Migrations_persistence_concurrent_acceptance_and_rollback()
    {
        // Nunca usa EnsureDeleted no banco informado. Cada execução cria seu próprio banco.
        var admin = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("TASKO_TEST_POSTGRES"));
        var name = $"tasko_test_{Guid.NewGuid():N}";
        await using var connection = new NpgsqlConnection(admin.ConnectionString);
        await connection.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection))
            await create.ExecuteNonQueryAsync();
        var target = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = name };
        var options = new DbContextOptionsBuilder<TaskoDbContext>().UseNpgsql(target.ConnectionString).Options;
        try
        {
            Guid ownerId, publicationId, firstId, secondId;
            await using (var seed = new TestHarness(options))
            {
                await seed.Db.Database.MigrateAsync();
                var owner = await seed.CreateUserAsync("Solicitante", "owner@test.local", RoleType.Requester);
                var provider = await seed.CreateUserAsync("Prestador", "provider@test.local", RoleType.Provider);
                var other = await seed.CreateUserAsync("Outro", "other@test.local", RoleType.Provider);
                var publication = await seed.CreatePublicationAsync(owner, PublicationType.Request);
                firstId = (await seed.CreateProposalAsync(publication, provider)).Id;
                secondId = (await seed.CreateProposalAsync(publication, other)).Id;
                ownerId = owner.Id;
                publicationId = publication.Id;
            }

            var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var waiting = 0;
            async Task<bool> Accept(Guid proposalId)
            {
                await using var harness = new TestHarness(options);
                harness.CurrentUser.UserId = ownerId;
                // Ambos os DbContexts rastreiam o estado aberto antes de disputar o lock.
                _ = await harness.ProposalsRepository.GetByIdAsync(proposalId);
                if (Interlocked.Increment(ref waiting) == 2) ready.SetResult();
                await ready.Task.WaitAsync(TimeSpan.FromSeconds(30));
                try
                {
                    await harness.Proposals.AcceptAsync(proposalId, CancellationToken.None);
                    return true;
                }
                catch (DomainException ex) when (ex.Code == "publication.not_open")
                {
                    return false;
                }
            }

            var results = await Task.WhenAll(Accept(firstId), Accept(secondId));
            Assert.Single(results, success => success);

            await using (var check = new TaskoDbContext(options))
            {
                Assert.Equal(PublicationStatus.InNegotiation,
                    (await check.Publications.SingleAsync(p => p.Id == publicationId)).Status);
                Assert.Single(await check.Engagements.ToListAsync());
                Assert.Single(await check.Proposals.Where(p => p.Status == ProposalStatus.Accepted).ToListAsync());
                Assert.Single(await check.Proposals.Where(p => p.Status == ProposalStatus.Rejected).ToListAsync());
                Assert.Equal(3, await check.Notifications.CountAsync());
                Assert.Single(await check.Notifications
                    .Where(n => n.Type == NotificationType.ProposalAccepted).ToListAsync());
                Assert.True(await check.ActivityLogs.AnyAsync(a => a.Action == "proposal.accept"));
                Assert.Single(await check.PublicationStatusHistories.ToListAsync());
                var publication = await check.Publications.SingleAsync(p => p.Id == publicationId);
                var accepted = await check.Proposals.SingleAsync(p => p.Status == ProposalStatus.Accepted);
                check.Engagements.Add(Engagement.Create(publication, accepted, DateTimeOffset.UtcNow));
                var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => check.SaveChangesAsync());
                Assert.Equal(PostgresErrorCodes.UniqueViolation, ((PostgresException)duplicate.InnerException!).SqlState);
                check.ChangeTracker.Clear();
            }

            // Conclusão e índice único de avaliações no banco real.
            await using (var reviews = new TestHarness(options))
            {
                reviews.CurrentUser.UserId = ownerId;
                var engagement = await reviews.Db.Engagements.SingleAsync();
                await reviews.Engagements.ConfirmAsync(engagement.Id, CancellationToken.None);
                await reviews.Engagements.CompleteAsync(engagement.Id, CancellationToken.None);
                await reviews.Reviews.CreateAsync(publicationId,
                    new CreateReviewRequest(engagement.ProposerId, 5, "Teste com PostgreSQL."), CancellationToken.None);
                Assert.Single(await reviews.Db.Reviews.ToListAsync());
                var publication = await reviews.Db.Publications.SingleAsync(p => p.Id == publicationId);
                reviews.Db.Reviews.Add(Review.Create(publication, engagement, ownerId,
                    engagement.ProposerId, 4, "Duplicada", reviews.Clock.UtcNow));
                var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => reviews.Db.SaveChangesAsync());
                Assert.Equal(PostgresErrorCodes.UniqueViolation, ((PostgresException)duplicate.InnerException!).SqlState);
            }

            // Rollback da operação inteira: inclusive histórico/notificação/auditoria.
            await using (var rollback = new TestHarness(options))
            {
                var owner = (await rollback.Users.GetByIdAsync(ownerId))!;
                var provider = await rollback.CreateUserAsync("Terceiro", "third@test.local", RoleType.Provider);
                var category = await rollback.Db.Categories.FirstAsync();
                var publication = await rollback.CreatePublicationAsync(owner, PublicationType.Request, category: category);
                var proposal = await rollback.CreateProposalAsync(publication, provider);
                rollback.ActAs(owner);
                var before = await rollback.Db.Notifications.CountAsync();
                var logsBefore = await rollback.Db.ActivityLogs.CountAsync();
                await rollback.Db.Database.ExecuteSqlRawAsync("""
                    CREATE FUNCTION fail_notification() RETURNS trigger AS $$
                    BEGIN
                        RAISE EXCEPTION 'Falha de persistência injetada pelo teste';
                    END;
                    $$ LANGUAGE plpgsql;
                    CREATE TRIGGER fail_notification BEFORE INSERT ON notifications
                    FOR EACH ROW EXECUTE FUNCTION fail_notification();
                    """);
                await Assert.ThrowsAsync<DbUpdateException>(() =>
                    rollback.Proposals.AcceptAsync(proposal.Id, CancellationToken.None));
                rollback.Db.ChangeTracker.Clear();
                Assert.Equal(PublicationStatus.Open,
                    (await rollback.Db.Publications.SingleAsync(p => p.Id == publication.Id)).Status);
                Assert.Equal(before, await rollback.Db.Notifications.CountAsync());
                Assert.Equal(logsBefore, await rollback.Db.ActivityLogs.CountAsync());
                Assert.Single(await rollback.Db.Engagements.ToListAsync());
                Assert.Equal(3, await rollback.Db.PublicationStatusHistories.CountAsync());
                Assert.Equal(ProposalStatus.Pending,
                    (await rollback.Db.Proposals.SingleAsync(p => p.Id == proposal.Id)).Status);
            }
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\" WITH (FORCE)", connection);
            await drop.ExecuteNonQueryAsync();
        }
    }
}

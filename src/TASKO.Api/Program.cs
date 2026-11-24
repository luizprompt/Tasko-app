using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using Tasko.Api.Filters;
using Tasko.Api.Middleware;
using Tasko.Api.Seed;
using Tasko.Api.Services;
using Tasko.Application;
using Tasko.Application.Abstractions;
using Tasko.Domain;
using Tasko.Infrastructure;
using Tasko.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// "InMemory" liga o modo demonstração (sem PostgreSQL). Qualquer outro valor usa Npgsql.
var databaseProvider = builder.Configuration["Database:Provider"] ?? "Postgres";

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default não configurada.");

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
var authOptions = builder.Configuration.GetSection(AuthOptions.SectionName).Get<AuthOptions>() ?? new AuthOptions();
var localEnvironment = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Demo");
if (!localEnvironment && (authOptions.ExposeSensitiveTokens
    || builder.Configuration.GetValue("Seed:DemoData", false)
    || databaseProvider.Equals("InMemory", StringComparison.OrdinalIgnoreCase)))
{
    throw new InvalidOperationException("Tokens sensíveis e dados em memória/demo só são permitidos em Development ou Demo.");
}

if (string.IsNullOrWhiteSpace(jwtOptions.SigningKey) || jwtOptions.SigningKey.Length < 32)
{
    throw new InvalidOperationException("Jwt:SigningKey deve ser configurada com ao menos 32 caracteres.");
}

builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton(authOptions);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(connectionString, databaseProvider);

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("AuthAttempts", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("Security:AuthAttemptsPerMinute", 10),
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.OnRejected = async (context, ct) =>
    {
        var response = context.HttpContext.Response;
        response.StatusCode = StatusCodes.Status429TooManyRequests;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString(System.Globalization.CultureInfo.InvariantCulture);
        await response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = 429,
            Title = "Muitas tentativas",
            Detail = "Aguarde antes de tentar novamente.",
            Instance = context.HttpContext.Request.Path,
            Extensions = { ["code"] = "auth.rate_limited" }
        }, options: null, contentType: "application/problem+json", cancellationToken: ct);
    };
});

builder.Services
    .AddControllers(options => options.Filters.Add<ValidationFilter>())
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnChallenge = context =>
            {
                context.HandleResponse();
                context.Response.Headers.WWWAuthenticate = "Bearer";
                return WriteAuthProblem(context.HttpContext, 401, "auth.required", "Autenticação necessária ou sessão expirada.");
            },
            OnForbidden = context => WriteAuthProblem(context.HttpContext, 403,
                "auth.forbidden", "Você não tem permissão para acessar este recurso.")
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = ClaimTypes.Role
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Moderator", policy => policy.RequireRole(nameof(RoleType.Moderator)));
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "TASKO API",
        Version = "v1",
        Description = "Backend do marketplace de serviços TASKO (MVP). Autentique em /api/v1/auth/login e use o botão Authorize."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Informe apenas o token JWT (sem o prefixo Bearer)."
    });

    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (allowedOrigins.Length > 0)
{
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("Frontend", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        });
    });
}

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    if (context.Request.Path.StartsWithSegments("/api"))
        context.Response.Headers.CacheControl = "no-store";
    await next();
});

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Demo"))
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "TASKO API v1"));
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();

if (allowedOrigins.Length > 0)
{
    app.UseCors("Frontend");
}
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", (IConfiguration config) => Results.Ok(new
{
    status = "ok",
    database = config["Database:Provider"] ?? "Postgres",
    timestamp = DateTimeOffset.UtcNow
}));

if (app.Configuration.GetValue("Database:AutoMigrate", false))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TaskoDbContext>();

    if (db.Database.IsRelational())
    {
        await db.Database.MigrateAsync();
    }
    else
    {
        // O provider InMemory não usa migrations: cria o modelo em memória.
        await db.Database.EnsureCreatedAsync();
    }
}

await DatabaseSeeder.SeedAsync(app.Services, app.Configuration);

if (app.Configuration.GetValue("Seed:DemoData", false))
{
    await DemoDataSeeder.SeedAsync(app.Services, app.Configuration);
}

app.Run();

static Task WriteAuthProblem(HttpContext context, int status, string code, string detail)
{
    context.Response.StatusCode = status;
    return context.Response.WriteAsJsonAsync(new ProblemDetails
    {
        Status = status,
        Title = status == 401 ? "Não autenticado" : "Acesso negado",
        Detail = detail,
        Instance = context.Request.Path,
        Extensions = { ["code"] = code, ["traceId"] = context.TraceIdentifier }
    }, options: null, contentType: "application/problem+json", cancellationToken: context.RequestAborted);
}

/// <summary>Exposto para testes de integração com WebApplicationFactory.</summary>
public partial class Program
{
}

using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Tasko.Tests.Integration;

public sealed class DemoApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseEnvironment("Demo").ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Security:AuthAttemptsPerMinute"] = "3",
                ["Seed:DemoData"] = "false",
                ["Seed:ModeratorEmail"] = "",
                ["Seed:ModeratorPassword"] = ""
            }));
}

public sealed class ApiSecurityTests
{
    [Fact]
    public async Task Login_is_limited_and_returns_problem_details()
    {
        await using var factory = new DemoApiFactory();
        using var client = factory.CreateClient();
        for (var i = 0; i < 3; i++)
        {
            var failed = await client.PostAsJsonAsync("/api/v1/auth/login",
                new { email = "absent@example.com", password = "Wrong1234" });
            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        }
        var rejected = await client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = "absent@example.com", password = "Wrong1234" });
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
        var problem = await rejected.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("auth.rate_limited", problem.GetProperty("code").GetString());
        Assert.NotNull(rejected.Headers.RetryAfter);
    }

    [Fact]
    public async Task Anonymous_cannot_read_contact_and_api_responses_are_not_cached()
    {
        await using var factory = new DemoApiFactory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/engagements/{Guid.NewGuid()}/contact");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("auth.required", problem.GetProperty("code").GetString());
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }
}

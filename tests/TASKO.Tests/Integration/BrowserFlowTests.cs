using System.Text.RegularExpressions;
using Microsoft.Playwright;
using static Microsoft.Playwright.Assertions;

namespace Tasko.Tests.Integration;

public sealed class BrowserFactAttribute : FactAttribute
{
    public BrowserFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TASKO_E2E_URL")))
            Skip = "Defina TASKO_E2E_URL apontando para uma instância Demo descartável.";
    }
}

public sealed class BrowserFlowTests
{
    [BrowserFact]
    [Trait("Category", "Browser")]
    public async Task Marketplace_flow_in_two_browsers_and_mobile_layout()
    {
        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
        var url = Environment.GetEnvironmentVariable("TASKO_E2E_URL")!.TrimEnd('/');
        await using var requester = await browser.NewContextAsync(new() { BaseURL = url });
        await using var provider = await browser.NewContextAsync(new() { BaseURL = url });
        var page = await requester.NewPageAsync();
        var professional = await provider.NewPageAsync();
        var scriptErrors = new List<string>();
        page.PageError += (_, error) => scriptErrors.Add(error);
        professional.PageError += (_, error) => scriptErrors.Add(error);

        async Task Register(IPage target, string name, string email, bool isProvider)
        {
            await target.GotoAsync("/");
            var authLogo = target.Locator("#auth-view .brand__logo");
            await Expect(authLogo).ToBeVisibleAsync();
            await Expect(authLogo).ToHaveAttributeAsync("src", "/assets/brand/logos/tasko-horizontal-negativa.svg");
            if (!isProvider)
            {
                await target.SetViewportSizeAsync(1280, 900);
                await target.ScreenshotAsync(new()
                {
                    Path = Path.Combine(AppContext.BaseDirectory, "brand-login-desktop.png"),
                    Animations = ScreenshotAnimations.Disabled
                });
                await target.SetViewportSizeAsync(390, 844);
                await Expect(target.Locator("#login-email")).ToBeVisibleAsync();
                await Expect(target.Locator(".auth__features, .auth__stats")).ToHaveCountAsync(0);
                var loginButton = await target.Locator("#login-form button[type=submit]").BoundingBoxAsync();
                Assert.NotNull(loginButton);
                Assert.True(loginButton.Y + loginButton.Height <= 844, "Entrar deve aparecer sem rolar a tela.");
                Assert.False(await target.EvaluateAsync<bool>(
                    "() => document.documentElement.scrollWidth > innerWidth"));
                await target.ScreenshotAsync(new()
                {
                    Path = Path.Combine(AppContext.BaseDirectory, "login-mobile.png"),
                    Animations = ScreenshotAnimations.Disabled
                });
                await target.SetViewportSizeAsync(1280, 900);
                await target.GetByRole(AriaRole.Tab, new() { Name = "Criar conta" }).ClickAsync();
                await Expect(target.Locator("#register-name")).ToBeVisibleAsync();
                await target.ScreenshotAsync(new()
                {
                    Path = Path.Combine(AppContext.BaseDirectory, "register-desktop.png"),
                    Animations = ScreenshotAnimations.Disabled
                });
                await target.GetByRole(AriaRole.Tab, new() { Name = "Entrar", Exact = true }).ClickAsync();
                await Expect(target.Locator("#login-email")).ToBeVisibleAsync();
            }
            await target.GetByRole(AriaRole.Tab, new() { Name = "Criar conta" }).ClickAsync();
            await target.Locator("#register-name").FillAsync(name);
            await target.Locator("#register-email").FillAsync(email);
            await target.Locator("#register-password").FillAsync("Teste1234");
            if (isProvider) await target.Locator("input[value=provider]").CheckAsync();
            await target.GetByRole(AriaRole.Button, new() { Name = "Criar minha conta" }).ClickAsync();
            await Expect(target.Locator("#shell")).ToBeVisibleAsync();
            await Expect(target.Locator("#auth-view")).ToBeHiddenAsync();
        }

        var suffix = Guid.NewGuid().ToString("N");
        await Register(page, "Cliente E2E", $"cliente{suffix}@test.local", false);
        await Register(professional, "Profissional E2E", $"prestador{suffix}@test.local", true);
        await page.GotoAsync("/#/publish");
        await page.GetByRole(AriaRole.Button, new() { Name = "Preciso de um serviço" }).ClickAsync();
        await page.Locator("#publish-title").FillAsync($"Demanda E2E {suffix}");
        await page.Locator("#publish-description").FillAsync("Instalação de luminária residencial com revisão do ponto de energia.");
        await page.Locator("#publish-city").FillAsync("São Paulo");
        await page.Locator("#publish-region").FillAsync("Zona Sul");
        await page.Locator("#publish-deadline").FillAsync(DateTime.Now.AddDays(7).ToString("yyyy-MM-ddTHH:mm"));
        await page.GetByRole(AriaRole.Button, new() { Name = "Publicar anúncio", Exact = true }).ClickAsync();
        await Expect(page).ToHaveURLAsync(new Regex("#/publication/"));
        var publicationUrl = page.Url;
        await professional.GotoAsync(publicationUrl);
        await professional.GetByRole(AriaRole.Button, new() { Name = "Enviar proposta", Exact = true }).ClickAsync();
        await professional.Locator("#propose-message").FillAsync("Posso atender amanhã com material incluso.");
        await professional.Locator("#propose-price").FillAsync("200");
        await professional.Locator(".modal").GetByRole(AriaRole.Button, new() { Name = "Enviar proposta" }).ClickAsync();
        await Expect(professional.Locator(".modal")).ToHaveCountAsync(0);

        await page.ReloadAsync();
        await page.GetByRole(AriaRole.Button, new() { Name = "Aceitar proposta" }).ClickAsync();
        await page.Locator("[data-confirm-ok]").ClickAsync();
        await page.GetByRole(AriaRole.Button, new() { Name = "Ver contato" }).ClickAsync();
        await Expect(page.Locator(".modal")).ToContainTextAsync($"prestador{suffix}@test.local");
        await page.Keyboard.PressAsync("Escape");
        await Expect(page.Locator(".modal")).ToHaveCountAsync(0);
        await page.GetByRole(AriaRole.Button, new() { Name = "Confirmar combinação" }).ClickAsync();
        await page.Locator("[data-confirm-ok]").ClickAsync();
        await page.GetByRole(AriaRole.Button, new() { Name = "Concluir serviço" }).ClickAsync();
        await page.Locator("[data-confirm-ok]").ClickAsync();
        await page.GetByRole(AriaRole.Button, new() { Name = "Avaliar Profissional" }).ClickAsync();
        await page.Locator("#review-comment").FillAsync("Ótimo serviço, pontual e cuidadoso.");
        await page.GetByRole(AriaRole.Button, new() { Name = "Enviar avaliação" }).ClickAsync();
        await Expect(page.Locator("#main")).ToContainTextAsync("Você já avaliou");
        await page.ReloadAsync();
        await Expect(page.GetByRole(AriaRole.Button, new() { Name = "Avaliar Profissional" })).ToHaveCountAsync(0);

        // A ocultação de publicação já concluída é bloqueada pelo domínio.
        // Cria uma oferta aberta para testar a decisão de moderação separadamente.
        await professional.GotoAsync("/#/publish");
        await professional.Locator("#publish-title").FillAsync($"Oferta moderada {suffix}");
        await professional.Locator("#publish-description").FillAsync("Oferta de serviço de pintura para o cenário de moderação automatizado.");
        await professional.Locator("#publish-city").FillAsync("São Paulo");
        await professional.Locator("#publish-region").FillAsync("Zona Sul");
        await professional.GetByRole(AriaRole.Button, new() { Name = "Publicar anúncio", Exact = true }).ClickAsync();
        await Expect(professional).ToHaveURLAsync(new Regex("#/publication/"));
        var reportedUrl = professional.Url;
        await page.GotoAsync(reportedUrl);
        await page.GetByRole(AriaRole.Button, new() { Name = "Denunciar anúncio" }).ClickAsync();
        await page.Locator("#report-description").FillAsync($"Relato E2E {suffix}");
        await page.GetByRole(AriaRole.Button, new() { Name = "Enviar denúncia" }).ClickAsync();
        await Expect(page.Locator(".modal")).ToHaveCountAsync(0);
        // Denunciar não oculta: o participante ainda enxerga a publicação.
        await page.ReloadAsync();
        await Expect(page.Locator("#main")).ToContainTextAsync($"Oferta moderada {suffix}");

        await using var moderator = await browser.NewContextAsync(new() { BaseURL = url });
        var moderation = await moderator.NewPageAsync();
        await moderation.GotoAsync("/");
        await moderation.Locator("#login-email").FillAsync("moderador@tasko.local");
        await moderation.Locator("#login-password").FillAsync("Moderador123");
        await moderation.Locator("#login-form button[type=submit]").ClickAsync();
        await Expect(moderation.Locator("#shell")).ToBeVisibleAsync();
        await moderation.GotoAsync("/#/moderation");
        var report = moderation.Locator(".report-card").Filter(new() { HasText = $"Relato E2E {suffix}" });
        await report.GetByRole(AriaRole.Button, new() { Name = "Ocultar publicação" }).ClickAsync();
        await moderation.Locator("#resolve-note").FillAsync("Decisão justificada para o cenário de teste.");
        await moderation.Locator(".modal").GetByRole(AriaRole.Button, new() { Name = "Ocultar publicação" }).ClickAsync();
        await Expect(moderation.Locator(".modal")).ToHaveCountAsync(0);
        await Expect(report).ToHaveCountAsync(0);

        await page.SetViewportSizeAsync(390, 844);
        await page.GotoAsync("/#/home");
        await Expect(page.Locator(".bottom-nav")).ToBeVisibleAsync();
        await page.Locator(".hero").WaitForAsync();
        await page.Locator(".page").EvaluateAsync(
            "node => Promise.all(node.getAnimations().map(animation => animation.finished))");
        await page.EvaluateAsync("() => window.scrollTo({top: 0, behavior: 'instant'})");
        var banner = await page.Locator(".hero").BoundingBoxAsync();
        Assert.NotNull(banner);
        Assert.InRange(banner.X, -1, 1);
        Assert.InRange(banner.Width, 389, 391);
        var header = await page.Locator(".topbar").BoundingBoxAsync();
        Assert.NotNull(header);
        Assert.InRange(banner.Y - (header.Y + header.Height), -1, 1);
        var logo = page.Locator(".topbar .brand__logo");
        await Expect(logo).ToHaveAttributeAsync("src", "/assets/brand/logos/tasko-horizontal-principal.svg");
        var logoBox = await logo.BoundingBoxAsync();
        Assert.NotNull(logoBox);
        Assert.InRange(logoBox.Width / logoBox.Height, 3.12f, 3.13f);
        await page.ScreenshotAsync(new()
        {
            Path = Path.Combine(AppContext.BaseDirectory, "mobile-home.png"),
            Animations = ScreenshotAnimations.Disabled
        });
        var overflows = await page.EvaluateAsync<bool>(
            "() => document.documentElement.scrollWidth > window.innerWidth");
        Assert.False(overflows);
        await page.GotoAsync("/#/explore");
        await Expect(page.GetByRole(AriaRole.Textbox, new() { Name = "Região de atendimento" })).ToBeHiddenAsync();
        await Expect(page.Locator(".pub-card").First).ToBeVisibleAsync();
        await page.ScreenshotAsync(new()
        {
            Path = Path.Combine(AppContext.BaseDirectory, "mobile-explore.png"),
            FullPage = false, Animations = ScreenshotAnimations.Disabled
        });
        await page.Locator("[data-action=toggle-explore-filters]").ClickAsync();
        await Expect(page.GetByRole(AriaRole.Textbox, new() { Name = "Região de atendimento" })).ToBeVisibleAsync();
        foreach (var width in new[] { 360, 390, 448 })
        {
            await page.SetViewportSizeAsync(width, 844);
            Assert.False(await page.EvaluateAsync<bool>(
                "() => document.documentElement.scrollWidth > window.innerWidth"));
        }
        Assert.Empty(scriptErrors);
    }

    [BrowserFact]
    [Trait("Category", "Browser")]
    public async Task Pagination_region_filter_and_load_error_are_visible()
    {
        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
        await using var context = await browser.NewContextAsync(new()
        {
            BaseURL = Environment.GetEnvironmentVariable("TASKO_E2E_URL")!.TrimEnd('/')
        });
        var page = await context.NewPageAsync();
        await page.GotoAsync("/");
        await page.Locator("#login-email").FillAsync("ana@tasko.demo");
        await page.Locator("#login-password").FillAsync("Demo1234");
        await page.Locator("#login-form button[type=submit]").ClickAsync();
        await Expect(page.Locator("#shell")).ToBeVisibleAsync();
        await page.RouteAsync("**/api/v1/publications/mine?*", async route =>
        {
            var second = route.Request.Url.Contains("page=2&");
            var start = second ? 10 : 1;
            var items = Enumerable.Range(start, second ? 1 : 9).Select(i => new
            {
                id = Guid.NewGuid(), title = $"Anúncio paginado {i}", type = "offer", status = "open",
                categoryName = "Elétrica", city = "São Paulo", offeredPrice = 100, proposalCount = 0,
                createdAt = DateTimeOffset.UtcNow
            });
            await route.FulfillAsync(new()
            {
                ContentType = "application/json",
                Body = System.Text.Json.JsonSerializer.Serialize(new
                {
                    items, page = second ? 2 : 1, pageSize = 9, total = 10, totalPages = 2
                })
            });
        });
        await page.GotoAsync("/#/activities");
        await Expect(page.Locator("#main")).ToContainTextAsync("Página 1 de 2");
        await page.GetByRole(AriaRole.Link, new() { Name = "Próxima", Exact = true }).ClickAsync();
        await Expect(page.Locator("#main")).ToContainTextAsync("Anúncio paginado 10");
        await Expect(page.Locator("#main")).ToContainTextAsync("Página 2 de 2");
        await page.GotoAsync("/#/explore");
        await page.GetByRole(AriaRole.Textbox, new() { Name = "Região de atendimento" }).FillAsync("Zona Sul");
        await page.GetByRole(AriaRole.Button, new() { Name = "Filtrar", Exact = true }).ClickAsync();
        await Expect(page).ToHaveURLAsync(new Regex("serviceRegion=Zona"));

        await page.UnrouteAsync("**/api/v1/publications/mine?*");
        await page.RouteAsync("**/api/v1/publications/mine?*", route => route.FulfillAsync(new()
        {
            Status = 503, ContentType = "application/problem+json",
            Body = """{"status":503,"detail":"Serviço temporariamente indisponível."}"""
        }));
        await page.GotoAsync("/#/activities");
        await Expect(page.Locator(".error-state")).ToContainTextAsync("Serviço temporariamente indisponível.");
        await Expect(page.Locator("#main")).Not.ToContainTextAsync("Você ainda não publicou nada");
    }
}

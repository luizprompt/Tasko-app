using System.Buffers.Binary;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Tasko.Tests.Integration;

public sealed class BrandAssetsTests
{
    [Fact]
    public async Task Official_logos_favicon_and_manifest_icons_are_served_without_modification()
    {
        await using var factory = new DemoApiFactory();
        using var client = factory.CreateClient();
        // SHA-256 dos SVGs originais do kit Emerald Trust V1.0, sem recoloração/edição.
        var originals = new Dictionary<string, string>
        {
            ["/assets/brand/logos/tasko-horizontal-principal.svg"] =
                "FA102BFF4655F2A31C64CD7C7A1BCE7154DB36E6846D657A0941DC6D3ADBFBEE",
            ["/assets/brand/logos/tasko-horizontal-negativa.svg"] =
                "E86B88BF1940B3B4BC26D5EE11B775004D805B30A474A5A7D551F4555D545BFA",
            ["/favicon.svg"] =
                "6E383064A5F4637EE56A90D50B27B21BFE006A59EC0FFAABA521AA6B78958601"
        };
        foreach (var (path, hash) in originals)
            Assert.Equal(hash, Convert.ToHexString(SHA256.HashData(await client.GetByteArrayAsync(path))));

        var manifest = await client.GetFromJsonAsync<JsonElement>("/manifest.webmanifest");
        Assert.Equal("#064E3B", manifest.GetProperty("theme_color").GetString());
        Assert.Equal("#F8FAFC", manifest.GetProperty("background_color").GetString());
        Assert.Equal("/#/home", manifest.GetProperty("start_url").GetString());
        Assert.Equal(4, manifest.GetProperty("icons").GetArrayLength());
        foreach (var icon in manifest.GetProperty("icons").EnumerateArray())
        {
            var bytes = await client.GetByteArrayAsync(icon.GetProperty("src").GetString());
            var width = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(16, 4));
            var height = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(20, 4));
            Assert.Equal($"{width}x{height}", icon.GetProperty("sizes").GetString());
        }
        using var apple = await client.GetAsync("/apple-touch-icon.png");
        Assert.True(apple.IsSuccessStatusCode);
        using var ico = await client.GetAsync("/favicon.ico");
        Assert.True(ico.IsSuccessStatusCode);
    }
}

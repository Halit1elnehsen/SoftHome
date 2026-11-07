using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SoftHome.Api.Models;
using SoftHome.Api.Services;

namespace SoftHome.Tests;

public sealed class CapturedEmail : IEmailSender
{
    public bool IsConfigured { get; set; } = true;
    public ConcurrentDictionary<string, string> Tokens { get; } = new();
    public Task SendConfirmationAsync(string recipient, string url)
    { Tokens[recipient] = QueryHelpers.ParseQuery(new Uri(url).Query)["verify"]!; return Task.CompletedTask; }
}

public sealed class AccountFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    public CapturedEmail Email { get; } = new();
    public AccountFactory() => connection.Open();
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> {
            ["PublicUrl"] = "https://localhost", ["Auth:RateLimit"] = "1000",
            ["DataDirectory"] = Path.Combine(Path.GetTempPath(), "SoftHome.Tests", Guid.NewGuid().ToString("N"))
        }));
        builder.ConfigureServices(services => {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(connection));
            services.RemoveAll<IEmailSender>(); services.AddSingleton<IEmailSender>(Email);
        });
    }
    public HttpClient Client() => CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
    protected override void Dispose(bool disposing) { base.Dispose(disposing); if (disposing) connection.Dispose(); }
}

public class AccountsAndReceiptsTests
{
    private const string Password = "TestOnly-long-password-2026";
    private static async Task<HttpResponseMessage> Send(HttpClient client, string method, string path, object? body = null, HttpContent? content = null)
    {
        var csrfResponse = await client.GetAsync("/api/auth/csrf");
        if (!csrfResponse.IsSuccessStatusCode) throw new InvalidOperationException(await csrfResponse.Content.ReadAsStringAsync());
        var csrf = await csrfResponse.Content.ReadFromJsonAsync<JsonElement>();
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        request.Headers.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        request.Content = content ?? (body is null ? null : JsonContent.Create(body));
        return await client.SendAsync(request);
    }
    private static Task<HttpResponseMessage> Login(HttpClient c, string email, string password = Password) => Send(c, "POST", "/api/auth/login", new { email, password });
    private static async Task<int> Register(AccountFactory factory, HttpClient c, string name, string email)
    {
        var response = await Send(c, "POST", "/api/auth/register", new { name, email, password = Password, householdName = name + " evi" });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var confirmed = await Send(c, "POST", "/api/auth/confirm-email", new { token = factory.Email.Tokens[email] });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(c, email)).StatusCode);
        var workspace = await c.GetFromJsonAsync<JsonElement>("/api/workspace");
        return workspace.GetProperty("me").GetProperty("id").GetInt32();
    }

    [Fact]
    public async Task OnlyRegisteredConfirmedAccountsCanLogin_AndCsrfIsRequired()
    {
        using var f = new AccountFactory(); using var c = f.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/auth/login", new { email = "nobody@example.org", password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(c, "nobody@example.org")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(c, "POST", "/api/auth/register", new { name = "Gerçek Kayıt", email = "wrong-address", password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await Send(c, "POST", "/api/auth/register", new { name = "Gerçek Kayıt", email = "account@example.org", password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Login(c, "account@example.org")).StatusCode);
        var token = f.Email.Tokens["account@example.org"];
        Assert.Equal(HttpStatusCode.OK, (await Send(c, "POST", "/api/auth/confirm-email", new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(c, "POST", "/api/auth/confirm-email", new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(c, "account@example.org", "wrong-password")).StatusCode);
        var login = await Login(c, "ACCOUNT@example.org"); Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookies = string.Join(" ", login.Headers.GetValues("Set-Cookie"));
        Assert.Contains("httponly", cookies, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookies, StringComparison.OrdinalIgnoreCase);
        var workspace = await c.GetFromJsonAsync<JsonElement>("/api/workspace");
        Assert.Equal("Gerçek Kayıt", workspace.GetProperty("me").GetProperty("name").GetString());
        Assert.Empty(workspace.GetProperty("expenses").EnumerateArray());
        using var scope = f.Services.CreateScope();
        var user = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Users.SingleAsync();
        Assert.NotEqual(Password, user.PasswordHash); Assert.True(user.EmailConfirmed);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(c, "POST", "/api/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/workspace")).StatusCode);
    }

    [Fact]
    public async Task MissingMailConfigurationNeverPretendsAnEmailWasSent()
    {
        using var f = new AccountFactory(); f.Email.IsConfigured = false; using var c = f.Client();
        var response = await Send(c, "POST", "/api/auth/register", new { name = "Yeni Kullanıcı", email = "new@example.org", password = Password });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var scope = f.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<AppDbContext>().Users.ToListAsync());
    }

    private static MultipartFormDataContent ExpenseBody(int payer, int[] participants, byte[]? bytes = null, string filename = "fatura.png")
    {
        var body = new MultipartFormDataContent();
        body.Add(new StringContent(JsonSerializer.Serialize(new { name = "Kayıtlı harcama", cents = 10001L, category = "market", payerId = payer, date = DateTime.UtcNow.ToString("yyyy-MM-dd"), participantIds = participants })), "payload");
        if (bytes is not null) { var file = new ByteArrayContent(bytes); file.Headers.ContentType = new("image/png"); body.Add(file, "receipt", filename); }
        return body;
    }

    [Fact]
    public async Task ReceiptIsStoredAtomically_AndHiddenFromOtherHouseholds()
    {
        using var f = new AccountFactory(); using var owner = f.Client(); using var outsider = f.Client();
        var id = await Register(f, owner, "Kayıt Sahibi", "owner@example.org");
        await Register(f, outsider, "Başka Hesap", "other@example.org");
        using var spoof = ExpenseBody(id, [id], Encoding.UTF8.GetBytes("<svg onload='alert(1)'></svg>"));
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(owner, "POST", "/api/workspace/expenses", content: spoof)).StatusCode);
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement>("/api/workspace")).GetProperty("expenses").EnumerateArray());
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
        using var valid = ExpenseBody(id, [id], png);
        var saved = await Send(owner, "POST", "/api/workspace/expenses", content: valid);
        Assert.Equal(HttpStatusCode.Created, saved.StatusCode);
        var json = await saved.Content.ReadFromJsonAsync<JsonElement>();
        var url = json.GetProperty("receiptUrl").GetString()!;
        Assert.Equal(png, await owner.GetByteArrayAsync(url));
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(url)).StatusCode);
        using var anonymous = f.Client(); Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
        Assert.Empty((await outsider.GetFromJsonAsync<JsonElement>("/api/workspace")).GetProperty("expenses").EnumerateArray());
        using var oversized = ExpenseBody(id, [id], new byte[ReceiptValidator.MaxBytes + 1]);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(owner, "POST", "/api/workspace/expenses", content: oversized)).StatusCode);
        Assert.Single((await owner.GetFromJsonAsync<JsonElement>("/api/workspace")).GetProperty("expenses").EnumerateArray());
    }

    [Fact]
    public async Task JoiningUsesRegisteredNames_AndPaymentsCannotBeDuplicatedOrForged()
    {
        using var f = new AccountFactory(); using var owner = f.Client(); using var member = f.Client(); using var outsider = f.Client();
        var ownerId = await Register(f, owner, "Ev Sahibi", "home@example.org");
        var memberId = await Register(f, member, "Ev Arkadaşı", "member@example.org");
        var outsideId = await Register(f, outsider, "Diğer Ev", "outside@example.org");
        var invite = await Send(owner, "POST", "/api/workspace/household/invitation");
        var code = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(member, "POST", "/api/workspace/household/join", new { code = "fake-code" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/household/join", new { code })).StatusCode);
        using var invalid = ExpenseBody(ownerId, [ownerId, outsideId]);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(owner, "POST", "/api/workspace/expenses", content: invalid)).StatusCode);
        using var valid = ExpenseBody(ownerId, [ownerId, memberId]);
        Assert.Equal(HttpStatusCode.Created, (await Send(owner, "POST", "/api/workspace/expenses", content: valid)).StatusCode);
        var workspace = await member.GetFromJsonAsync<JsonElement>("/api/workspace");
        Assert.Equal(2, workspace.GetProperty("members").GetArrayLength());
        var requestId = Guid.NewGuid();
        var payment = new { fromUserId = memberId, toUserId = ownerId, cents = 5000, month = DateTime.UtcNow.ToString("yyyy-MM"), requestId };
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(member, "POST", "/api/workspace/payments", new { fromUserId = memberId, toUserId = ownerId, cents = 5001, month = payment.month, requestId })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/payments", payment)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/payments", payment)).StatusCode);
        Assert.Single((await owner.GetFromJsonAsync<JsonElement>("/api/workspace")).GetProperty("payments").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(outsider, "POST", "/api/workspace/payments", payment)).StatusCode);
    }

    [Fact]
    public async Task FiveWrongPasswordsTemporarilyLockTheAccount()
    {
        using var f = new AccountFactory(); using var c = f.Client();
        await Register(f, c, "Güvenli Hesap", "locked@example.org");
        await Send(c, "POST", "/api/auth/logout");
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(c, "locked@example.org", "incorrect")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(c, "locked@example.org")).StatusCode);
    }
}

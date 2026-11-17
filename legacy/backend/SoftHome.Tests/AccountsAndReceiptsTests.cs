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
    public ConcurrentDictionary<string, string> ResetTokens { get; } = new();
    public Task SendConfirmationAsync(string recipient, string url)
    { Tokens[recipient] = QueryHelpers.ParseQuery(new Uri(url).Query)["verify"]!; return Task.CompletedTask; }
    public Task SendPasswordResetAsync(string recipient, string url)
    { ResetTokens[recipient] = QueryHelpers.ParseQuery(new Uri(url).Query)["reset"]!; return Task.CompletedTask; }
}

public sealed class AccountFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection connection;
    public CapturedEmail Email { get; } = new();
    public AccountFactory(string connectionString = "Data Source=:memory:")
    { connection = new SqliteConnection(connectionString); connection.Open(); }
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
    public async Task HouseholdNotificationsPersistAcrossLogin_ArePrivate_AndReadPerAccount()
    {
        using var f = new AccountFactory(); using var owner = f.Client(); using var member = f.Client(); using var outsider = f.Client();
        var ownerId = await Register(f, owner, "Ev Sahibi", "notify-owner@example.org");
        var memberId = await Register(f, member, "Ev Arkadaşı", "notify-member@example.org");
        await Register(f, outsider, "Diğer Ev", "notify-outside@example.org");
        var invite = await Send(owner, "POST", "/api/workspace/household/invitation");
        var code = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/household/join", new { code })).StatusCode);
        var ownerFeed = await owner.GetFromJsonAsync<JsonElement>("/api/workspace/notifications");
        Assert.Contains("Ev Arkadaşı eve katıldı", ownerFeed.GetProperty("items")[0].GetProperty("message").GetString());
        Assert.Equal(1, ownerFeed.GetProperty("unreadCount").GetInt32());
        await Send(member, "POST", "/api/auth/logout");
        Assert.Equal(HttpStatusCode.Unauthorized, (await member.GetAsync("/api/workspace/notifications")).StatusCode);
        using var expense = ExpenseBody(ownerId, [ownerId, memberId]);
        Assert.Equal(HttpStatusCode.Created, (await Send(owner, "POST", "/api/workspace/expenses", content: expense)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(owner, "PUT", "/api/workspace/household", new { name = "Ortak Ev", budgetCents = 500000 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(member, "notify-member@example.org")).StatusCode);
        var feed = await member.GetFromJsonAsync<JsonElement>("/api/workspace/notifications");
        Assert.Equal(2, feed.GetProperty("unreadCount").GetInt32());
        Assert.Contains("Ev Sahibi", feed.GetProperty("items")[0].GetProperty("message").GetString());
        var latest = feed.GetProperty("latestId").GetInt32();
        var workspace = await member.GetFromJsonAsync<JsonElement>("/api/workspace");
        Assert.Equal(latest, workspace.GetProperty("revision").GetInt32());
        Assert.Equal("Ortak Ev", workspace.GetProperty("household").GetProperty("name").GetString());
        Assert.Single(workspace.GetProperty("expenses").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await member.PostAsJsonAsync("/api/workspace/notifications/read", new { throughId = latest })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(member, "POST", "/api/workspace/notifications/read", new { throughId = latest + 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/notifications/read", new { throughId = latest })).StatusCode);
        // A stale tab cannot move the read cursor backwards.
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/notifications/read", new { throughId = 0 })).StatusCode);
        Assert.Equal(0, (await member.GetFromJsonAsync<JsonElement>("/api/workspace/notifications")).GetProperty("unreadCount").GetInt32());
        Assert.Equal(1, (await owner.GetFromJsonAsync<JsonElement>("/api/workspace/notifications")).GetProperty("unreadCount").GetInt32());
        var outsideFeed = await outsider.GetFromJsonAsync<JsonElement>("/api/workspace/notifications");
        Assert.Empty(outsideFeed.GetProperty("items").EnumerateArray());
        Assert.Equal(0, outsideFeed.GetProperty("latestId").GetInt32());
        // Repeated/rejected payments must never produce extra notifications.
        var payment = new { fromUserId = memberId, toUserId = ownerId, cents = 5000, month = DateTime.UtcNow.ToString("yyyy-MM"), requestId = Guid.NewGuid() };
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/payments", payment)).StatusCode);
        var afterPayment = (await owner.GetFromJsonAsync<JsonElement>("/api/workspace/notifications")).GetProperty("latestId").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await Send(member, "POST", "/api/workspace/payments", payment)).StatusCode);
        Assert.Equal(afterPayment, (await owner.GetFromJsonAsync<JsonElement>("/api/workspace/notifications")).GetProperty("latestId").GetInt32());
    }

    [Fact]
    public async Task ExistingSqliteDatabaseGainsNotificationsWithoutLosingAccountsOrExpenses()
    {
        var path = Path.Combine(Path.GetTempPath(), $"softhome-upgrade-{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={path};Pooling=False";
        try
        {
            using (var f = new AccountFactory(connectionString))
            using (var c = f.Client())
            {
                var id = await Register(f, c, "Kalıcı Hesap", "upgrade@example.org");
                using var expense = ExpenseBody(id, [id]);
                Assert.Equal(HttpStatusCode.Created, (await Send(c, "POST", "/api/workspace/expenses", content: expense)).StatusCode);
                using var scope = f.Services.CreateScope();
                // Simulate the previous schema, which had no notification tables.
                await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.ExecuteSqlRawAsync(
                    "DROP TABLE HouseholdActivities; DROP TABLE NotificationReadStates; DROP TABLE PasswordRecoveries;");
            }
            using var upgraded = new AccountFactory(connectionString); using var client = upgraded.Client();
            Assert.Equal(HttpStatusCode.OK, (await Login(client, "upgrade@example.org")).StatusCode);
            Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/workspace")).GetProperty("expenses").EnumerateArray());
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace/notifications")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await Send(client, "POST", "/api/workspace/notifications/read", new { throughId = 0 })).StatusCode);
            Assert.Equal(HttpStatusCode.Accepted, (await Send(client, "POST", "/api/auth/forgot-password", new { email = "upgrade@example.org" })).StatusCode);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task PasswordRecoveryUsesExpiringOneTimeLinks_AndRevokesExistingSessions()
    {
        using var f = new AccountFactory(); using var account = f.Client(); using var recovery = f.Client();
        await Register(f, account, "Hesap Sahibi", "recover@example.org");
        var known = await Send(recovery, "POST", "/api/auth/forgot-password", new { email = "recover@example.org" });
        var unknown = await Send(recovery, "POST", "/api/auth/forgot-password", new { email = "unknown@example.org" });
        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        var token = f.Email.ResetTokens["recover@example.org"];
        using (var scope = f.Services.CreateScope())
        {
            var stored = await scope.ServiceProvider.GetRequiredService<AppDbContext>().PasswordRecoveries.SingleAsync();
            Assert.NotEqual(token, stored.TokenHash);
            Assert.True(stored.ExpiresAt < DateTime.UtcNow.AddMinutes(31));
        }
        Assert.Equal(HttpStatusCode.Accepted, (await Send(recovery, "POST", "/api/auth/forgot-password", new { email = "recover@example.org" })).StatusCode);
        Assert.Equal(token, f.Email.ResetTokens["recover@example.org"]); // One-minute resend cooldown.
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(recovery, "POST", "/api/auth/reset-password", new { token, password = "short" })).StatusCode);
        const string newPassword = "New-test-only-password-2026";
        Assert.Equal(HttpStatusCode.OK, (await Send(recovery, "POST", "/api/auth/reset-password", new { token, password = newPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(recovery, "POST", "/api/auth/reset-password", new { token, password = newPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await account.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(recovery, "recover@example.org")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(recovery, "recover@example.org", newPassword)).StatusCode);
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.SingleAsync();
            db.PasswordRecoveries.Add(new PasswordRecovery { UserId = user.Id, TokenHash = SoftHome.Api.Controllers.AuthController.TokenHash("expired-token"), ExpiresAt = DateTime.UtcNow.AddMinutes(-1) });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(recovery, "POST", "/api/auth/reset-password", new { token = "expired-token", password = newPassword })).StatusCode);
        f.Email.IsConfigured = false;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Send(recovery, "POST", "/api/auth/forgot-password", new { email = "recover@example.org" })).StatusCode);
    }

    [Fact]
    public async Task VerificationCanBeResentWithoutPassword_AndOldLinkIsInvalidated()
    {
        using var f = new AccountFactory(); using var c = f.Client();
        const string email = "resend@example.org";
        Assert.Equal(HttpStatusCode.Accepted, (await Send(c, "POST", "/api/auth/register", new { name = "Yeni Hesap", email, password = Password })).StatusCode);
        var oldToken = f.Email.Tokens[email];
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Users.SingleAsync()).VerificationSentAt = DateTime.UtcNow.AddMinutes(-2);
            await db.SaveChangesAsync();
        }
        var existing = await Send(c, "POST", "/api/auth/resend-verification", new { email });
        var unknown = await Send(c, "POST", "/api/auth/resend-verification", new { email = "unknown@example.org" });
        Assert.Equal(HttpStatusCode.Accepted, existing.StatusCode);
        Assert.Equal(await existing.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        var newToken = f.Email.Tokens[email];
        Assert.NotEqual(oldToken, newToken);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(c, "POST", "/api/auth/confirm-email", new { token = oldToken })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Send(c, "POST", "/api/auth/confirm-email", new { token = newToken })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(c, email)).StatusCode);
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

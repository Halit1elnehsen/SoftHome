using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;
using SoftHome.Api.Services;

namespace SoftHome.Api.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(AppDbContext db, IPasswordHasher<User> hasher, IEmailSender emailSender,
    IConfiguration config, ILogger<AuthController> logger) : ControllerBase
{
    private static readonly User DummyUser = new();
    private static readonly string DummyHash = new PasswordHasher<User>(Microsoft.Extensions.Options.Options.Create(
        new PasswordHasherOptions { IterationCount = 210000 })).HashPassword(DummyUser, "unusable-comparison-password");
    public record Credentials(string Email, string Password);
    public record Registration(string Name, string Email, string Password, string? HouseholdName);
    public record Confirmation(string Token);

    public static string TokenHash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static string NewToken() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 254) return null;
        var trimmed = value.Trim();
        if (!MailAddress.TryCreate(trimmed, out var parsed) || parsed.Address != trimmed
            || !parsed.Host.Contains('.') || parsed.Host.EndsWith('.') || trimmed.Any(char.IsWhiteSpace)) return null;
        return trimmed.ToUpperInvariant();
    }

    [HttpGet("csrf")]
    public IActionResult Csrf([FromServices] IAntiforgery antiforgery)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });
    }

    [HttpPost("register"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Register(Registration request)
    {
        var normalized = Normalize(request.Email);
        if (normalized is null) return BadRequest(new { message = "Geçerli bir e-posta adresi gir." });
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 80)
            return BadRequest(new { message = "Adını ve soyadını gir (en fazla 80 karakter)." });
        if (request.Password is null || request.Password.Length < 12 || request.Password.Length > 128)
            return BadRequest(new { message = "Şifren 12–128 karakter arasında olmalı." });
        if (!emailSender.IsConfigured)
            return StatusCode(503, new { message = "E-posta doğrulama hizmeti henüz hazır değil. Kayıt şu anda tamamlanamıyor." });
        var publicUrl = config["PublicUrl"]?.TrimEnd('/');
        if (!Uri.TryCreate(publicUrl, UriKind.Absolute, out var publicUri)
            || (publicUri.Scheme != "https" && !publicUri.IsLoopback))
            return StatusCode(503, new { message = "Doğrulama bağlantısı şu anda hazırlanamadı." });
        await using var transaction = await db.Database.BeginTransactionAsync();
        var user = await db.Users.SingleOrDefaultAsync(u => u.NormalizedEmail == normalized);
        if (user is not null)
        {
            if (user.EmailConfirmed || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
                return Accepted(new { message = "Bu adresle bir hesabın varsa giriş yapabilir veya doğrulama e-postanı kontrol edebilirsin." });
            if (user.VerificationSentAt > DateTime.UtcNow.AddMinutes(-1))
                return StatusCode(429, new { message = "Yeni doğrulama e-postası için bir dakika bekle." });
        }
        else
        {
            var houseName = string.IsNullOrWhiteSpace(request.HouseholdName) ? "Evim" : request.HouseholdName.Trim();
            if (houseName.Length > 80) return BadRequest(new { message = "Ev adı en fazla 80 karakter olabilir." });
            var household = new Household { Name = houseName };
            db.Households.Add(household);
            await db.SaveChangesAsync();
            user = new User { Username = request.Name.Trim(), Email = request.Email.Trim(), NormalizedEmail = normalized, HouseholdId = household.Id };
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            db.Users.Add(user);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Conflict(new { message = "Bu adres için kayıt oluşturulamadı. Giriş yapmayı deneyebilirsin." }); }
            household.OwnerId = user.Id;
        }
        var token = NewToken();
        user.VerificationTokenHash = TokenHash(token);
        user.VerificationExpiresAt = DateTime.UtcNow.AddHours(24);
        user.VerificationSentAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        try { await emailSender.SendConfirmationAsync(user.Email, $"{publicUrl}/?verify={Uri.EscapeDataString(token)}"); }
        catch (Exception ex) { logger.LogWarning("Confirmation delivery failed ({Type}).", ex.GetType().Name); return StatusCode(503, new { message = "Doğrulama e-postası gönderilemedi. Biraz sonra tekrar dene." }); }
        return Accepted(new { message = "Doğrulama bağlantısı e-posta adresine gönderildi. Adresini doğruladıktan sonra giriş yapabilirsin." });
    }

    [HttpPost("confirm-email"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Confirm(Confirmation request)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || request.Token.Length > 100) return BadRequest(new { message = "Doğrulama bağlantısı geçersiz." });
        var hash = TokenHash(request.Token);
        var user = await db.Users.SingleOrDefaultAsync(u => u.VerificationTokenHash == hash);
        if (user is null || user.VerificationExpiresAt is null || user.VerificationExpiresAt <= DateTime.UtcNow)
            return BadRequest(new { message = "Doğrulama bağlantısı geçersiz veya süresi dolmuş. Kayıt formunu aynı bilgilerle tekrar göndererek yeni bağlantı isteyebilirsin." });
        user.EmailConfirmed = true;
        user.VerificationTokenHash = null;
        user.VerificationExpiresAt = null;
        await db.SaveChangesAsync();
        return Ok(new { message = "E-posta adresin doğrulandı. Şimdi giriş yapabilirsin." });
    }

    [HttpPost("login"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Login(Credentials request)
    {
        var normalized = Normalize(request.Email);
        if (normalized is null || request.Password is null || request.Password.Length > 128)
            return BadRequest(new { message = "Geçerli e-posta adresini ve şifreni gir." });
        var user = await db.Users.SingleOrDefaultAsync(u => u.NormalizedEmail == normalized);
        var result = hasher.VerifyHashedPassword(user ?? DummyUser,
            string.IsNullOrEmpty(user?.PasswordHash) ? DummyHash : user.PasswordHash, request.Password);
        if (user is null || string.IsNullOrEmpty(user.PasswordHash) || user.LockedUntil > DateTime.UtcNow)
            return Unauthorized(new { message = "E-posta veya şifre hatalı. Kayıtlı hesabınla giriş yap." });
        if (result == PasswordVerificationResult.Failed)
        {
            user.FailedLogins++;
            if (user.FailedLogins >= 5) { user.LockedUntil = DateTime.UtcNow.AddMinutes(15); user.FailedLogins = 0; }
            await db.SaveChangesAsync();
            return Unauthorized(new { message = "E-posta veya şifre hatalı. Kayıtlı hesabınla giriş yap." });
        }
        if (!user.EmailConfirmed) return StatusCode(403, new { message = "Giriş yapmadan önce e-posta adresini doğrula." });
        user.FailedLogins = 0;
        user.LockedUntil = null;
        if (result == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = hasher.HashPassword(user, request.Password);
        await db.SaveChangesAsync();
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Username)], CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = false, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(8), AllowRefresh = false });
        return Ok(new { id = user.Id, name = user.Username });
    }

    [Authorize, HttpPost("logout")]
    public async Task<IActionResult> Logout() { await HttpContext.SignOutAsync(); return NoContent(); }
}

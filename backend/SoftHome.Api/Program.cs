using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using SoftHome.Api.Models;
using SoftHome.Api.Services;

var builder = WebApplication.CreateBuilder(args);
DotNetEnv.Env.Load();
builder.Configuration.AddEnvironmentVariables();
var postgres = Environment.GetEnvironmentVariable("SUPABASE_CONNECTION");
var usePostgres = !string.IsNullOrWhiteSpace(postgres) || builder.Configuration["Database:Provider"] == "Postgres";
var dataDirectory = Path.GetFullPath(builder.Configuration["DataDirectory"] ?? Path.Combine(builder.Environment.ContentRootPath, "data"));
Directory.CreateDirectory(dataDirectory);
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDirectory, "keys")));
builder.Services.AddDbContext<AppDbContext>(options => {
    if (usePostgres) options.UseNpgsql(postgres ?? builder.Configuration.GetConnectionString("DefaultConnection"));
    else options.UseSqlite(builder.Configuration["Database:SqliteConnection"] ?? $"Data Source={Path.Combine(dataDirectory, "softhome.db")}");
});
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210000);
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<IExpenseService, ExpenseService>();
builder.Services.AddControllersWithViews(o => o.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
builder.Services.AddAntiforgery(o => {
    o.HeaderName = "X-CSRF-TOKEN";
    o.Cookie.Name = "SoftHome.Csrf";
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o => {
    o.Cookie.Name = "SoftHome.Session";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.SlidingExpiration = false;
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
    o.Events.OnValidatePrincipal = async c => {
        var db = c.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        if (!int.TryParse(c.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            || !await db.Users.AnyAsync(u => u.Id == id && u.EmailConfirmed)) c.RejectPrincipal();
    };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions {
            PermitLimit = builder.Configuration.GetValue("Auth:RateLimit", 20), Window = TimeSpan.FromMinutes(5), QueueLimit = 0
        }));
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var app = builder.Build();
if (!app.Environment.IsDevelopment()) { app.UseHsts(); app.UseHttpsRedirection(); }
app.Use(async (context, next) => {
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
var frontend = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "../../frontend"));
if (!Directory.Exists(frontend)) frontend = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
if (Directory.Exists(frontend)) {
    var files = new PhysicalFileProvider(frontend);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files, OnPrepareResponse = c => {
        if (c.File.Name.EndsWith(".html") || c.File.Name.EndsWith(".js")) c.Context.Response.Headers.CacheControl = "no-cache";
    }});
}
app.MapControllers();
// Local SQLite has a real, persistent database. No example users or expenses are seeded.
if (!usePostgres) {
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
}
app.Run();
public partial class Program { }

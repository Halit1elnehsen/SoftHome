using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;
using SoftHome.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// .env dosyasını sisteme yükle
DotNetEnv.Env.Load();

// Add services to the container.
var connectionString = Environment.GetEnvironmentVariable("SUPABASE_CONNECTION");
if (string.IsNullOrEmpty(connectionString))
{
    DotNetEnv.Env.TraversePath().Load();
    connectionString = Environment.GetEnvironmentVariable("SUPABASE_CONNECTION");
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddScoped<IExpenseService, ExpenseService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors("AllowAll");

// Configure the HTTP request pipeline.
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "SoftHome API v1");
    c.RoutePrefix = "swagger";
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapGet("/", () => Results.Redirect("/swagger"));

app.MapControllers();

// DataSeeder: Test kullanıcıları ve karmaşık borç senaryosu
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();
        context.Database.EnsureCreated();

        if (!context.Users.Any())
        {
            var halit = new User { Username = "Halit", Email = "halit@softhome.com" };
            var nedim = new User { Username = "Nedim", Email = "nedim@softhome.com" };
            var muhammed = new User { Username = "Muhammed", Email = "muhammed@softhome.com" };

            context.Users.AddRange(halit, nedim, muhammed);
            context.SaveChanges();

            // Harcama 1: Halit 900 TL ödedi (Nedim ve Muhammed'e eşit paylaştırıldı. İkisi de Halit'e 300'er TL borçlu)
            var expense1 = new Expense
            {
                Title = "Ev Alışverişi",
                TotalAmount = 900m,
                CreatedAt = DateTime.UtcNow,
                PayerId = halit.Id,
                Participants = new List<ExpenseParticipant>
                {
                    new ExpenseParticipant { UserId = halit.Id, OwedAmount = 300m, IsPaid = false },
                    new ExpenseParticipant { UserId = nedim.Id, OwedAmount = 300m, IsPaid = false },
                    new ExpenseParticipant { UserId = muhammed.Id, OwedAmount = 300m, IsPaid = false }
                }
            };

            // Harcama 2: Nedim 400 TL ödedi (Sadece Halit ve Muhammed için harcadı. Halit ve Muhammed, Nedim'e 200'er TL borçlu)
            var expense2 = new Expense
            {
                Title = "İnternet ve Faturalar",
                TotalAmount = 400m,
                CreatedAt = DateTime.UtcNow,
                PayerId = nedim.Id,
                Participants = new List<ExpenseParticipant>
                {
                    new ExpenseParticipant { UserId = halit.Id, OwedAmount = 200m, IsPaid = false },
                    new ExpenseParticipant { UserId = muhammed.Id, OwedAmount = 200m, IsPaid = false }
                }
            };

            context.Expenses.AddRange(expense1, expense2);
            context.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(ex, "DataSeeder çalıştırılırken bir hata oluştu veya veritabanına bağlanılamadı.");
    }
}

app.Run();

using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;
using SoftHome.Api.Services;
using Xunit;

namespace SoftHome.Tests;

public class ExpenseServiceTests
{
    private AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        var context = new AppDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    /// <summary>
    /// a) Basit Bölüştürme Senaryosu:
    /// A kişisi 300 TL öder ve gider A, B, C arasında eşit bölünür.
    /// B ve C'nin A'ya 100'er TL borçlu olduğunu doğrular.
    /// </summary>
    [Fact]
    public async Task CalculateSettlements_SimpleSplit_ReturnsExpectedDebts()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var userA = new User { Id = 1, Username = "A", Email = "a@test.com" };
        var userB = new User { Id = 2, Username = "B", Email = "b@test.com" };
        var userC = new User { Id = 3, Username = "C", Email = "c@test.com" };
        context.Users.AddRange(userA, userB, userC);
        await context.SaveChangesAsync();

        var service = new ExpenseService(context);

        var expense = new Expense
        {
            Id = 1,
            Title = "Ortak Yemek",
            TotalAmount = 300m,
            PayerId = userA.Id,
            CreatedAt = DateTime.UtcNow
        };

        // A, B, C eşit paylaşır (her birine 100 TL)
        await service.AddExpenseAsync(expense, new List<int> { userA.Id, userB.Id, userC.Id });

        // Act
        var settlements = await service.CalculateSettlementsAsync();

        // Assert
        Assert.NotNull(settlements);
        Assert.Equal(2, settlements.Count);

        // B -> A'ya 100 TL ve C -> A'ya 100 TL ödemelidir
        Assert.Contains(settlements, s => s.Contains("B kullanıcısı A kullanıcısına") && s.Contains("100"));
        Assert.Contains(settlements, s => s.Contains("C kullanıcısı A kullanıcısına") && s.Contains("100"));
    }

    /// <summary>
    /// b) Döngüsel Borç (Circular Debt) Senaryosu:
    /// A, B'ye 100 TL; B, C'ye 100 TL; C de A'ya 100 TL borçlanır.
    /// Algoritmanın bu zinciri kırıp "kimsenin kimseye borcu yoktur" (boş liste) sonucunu döndürdüğünü doğrular.
    /// </summary>
    [Fact]
    public async Task CalculateSettlements_CircularDebt_CancelsOutToZero()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var userA = new User { Id = 1, Username = "A", Email = "a@test.com" };
        var userB = new User { Id = 2, Username = "B", Email = "b@test.com" };
        var userC = new User { Id = 3, Username = "C", Email = "c@test.com" };
        context.Users.AddRange(userA, userB, userC);
        await context.SaveChangesAsync();

        var service = new ExpenseService(context);

        // 1. B, A için 100 TL öder (A, B'ye 100 TL borçlu)
        var expense1 = new Expense
        {
            Id = 1,
            Title = "B ödedi A için",
            TotalAmount = 100m,
            PayerId = userB.Id
        };
        await service.AddExpenseAsync(expense1, new List<int> { userA.Id });

        // 2. C, B için 100 TL öder (B, C'ye 100 TL borçlu)
        var expense2 = new Expense
        {
            Id = 2,
            Title = "C ödedi B için",
            TotalAmount = 100m,
            PayerId = userC.Id
        };
        await service.AddExpenseAsync(expense2, new List<int> { userB.Id });

        // 3. A, C için 100 TL öder (C, A'ya 100 TL borçlu)
        var expense3 = new Expense
        {
            Id = 3,
            Title = "A ödedi C için",
            TotalAmount = 100m,
            PayerId = userA.Id
        };
        await service.AddExpenseAsync(expense3, new List<int> { userC.Id });

        // Act
        var settlements = await service.CalculateSettlementsAsync();

        // Assert: Tüm net bakiyeler 0 olduğu için hiçbir transfer gerekmez
        Assert.NotNull(settlements);
        Assert.Empty(settlements);
    }

    /// <summary>
    /// c) Karmaşık Asimetrik Borç Senaryosu:
    /// Farklı tutarlarda çapraz harcamalar girildiğinde sistemin borçları başarıyla tekilleştirdiğini doğrular.
    /// Halit 900 TL öder (Halit, Nedim, Muhammed 300'er TL).
    /// Nedim 400 TL öder (Halit ve Muhammed için 200'er TL).
    /// Net bakiyeler: Halit (+400), Nedim (+100), Muhammed (-500).
    /// Sonuçta Muhammed -> Halit'e 400 TL, Muhammed -> Nedim'e 100 TL ödemelidir.
    /// </summary>
    [Fact]
    public async Task CalculateSettlements_ComplexAsymmetricDebt_SimplifiesCorrectly()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var halit = new User { Id = 1, Username = "Halit", Email = "halit@test.com" };
        var nedim = new User { Id = 2, Username = "Nedim", Email = "nedim@test.com" };
        var muhammed = new User { Id = 3, Username = "Muhammed", Email = "muhammed@test.com" };
        context.Users.AddRange(halit, nedim, muhammed);
        await context.SaveChangesAsync();

        var service = new ExpenseService(context);

        // Harcama 1: Halit 900 TL öder, 3 kişi paylaşır (Halit: 300, Nedim: 300, Muhammed: 300)
        var expense1 = new Expense
        {
            Id = 1,
            Title = "Market",
            TotalAmount = 900m,
            PayerId = halit.Id
        };
        await service.AddExpenseAsync(expense1, new List<int> { halit.Id, nedim.Id, muhammed.Id });

        // Harcama 2: Nedim 400 TL öder, sadece Halit ve Muhammed için (Halit: 200, Muhammed: 200)
        var expense2 = new Expense
        {
            Id = 2,
            Title = "Fatura",
            TotalAmount = 400m,
            PayerId = nedim.Id
        };
        await service.AddExpenseAsync(expense2, new List<int> { halit.Id, muhammed.Id });

        // Act
        var settlements = await service.CalculateSettlementsAsync();

        // Assert
        Assert.NotNull(settlements);
        Assert.Equal(2, settlements.Count);

        // Muhammed -> Halit'e 400 TL
        Assert.Contains(settlements, s => s.Contains("Muhammed kullanıcısı Halit kullanıcısına") && s.Contains("400"));

        // Muhammed -> Nedim'e 100 TL
        Assert.Contains(settlements, s => s.Contains("Muhammed kullanıcısı Nedim kullanıcısına") && s.Contains("100"));
    }

    /// <summary>
    /// Var olmayan harcama veya kullanıcı ID'si girildiğinde MarkAsPaidAsync metodunun false döndüğünü doğrular.
    /// </summary>
    [Fact]
    public async Task MarkAsPaidAsync_WhenRecordDoesNotExist_ReturnsFalse()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = new ExpenseService(context);

        // Act
        var result = await service.MarkAsPaidAsync(expenseId: 999, userId: 999);

        // Assert
        Assert.False(result);
    }
}

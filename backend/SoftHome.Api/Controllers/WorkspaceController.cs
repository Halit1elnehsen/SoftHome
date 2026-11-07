using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;
using SoftHome.Api.Services;

namespace SoftHome.Api.Controllers;

[ApiController, Authorize, Route("api/workspace")]
public class WorkspaceController(AppDbContext db) : ControllerBase
{
    private static readonly string[] Categories = ["home", "market", "bill", "food", "internet", "other"];
    private async Task<User?> CurrentUser() => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
        ? await db.Users.SingleOrDefaultAsync(u => u.Id == id && u.EmailConfirmed) : null;
    private object ExpenseDto(Expense e) => new { id = e.Id, name = e.Title, cents = (long)(e.TotalAmount * 100), category = e.Category,
        payer = e.PayerId, date = e.OccurredAt.ToString("yyyy-MM-dd"), split = e.Participants.OrderBy(p => p.Id).Select(p => p.UserId),
        receiptUrl = e.ReceiptData is null ? null : $"/api/workspace/expenses/{e.Id}/receipt" };

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        var house = await db.Households.SingleAsync(h => h.Id == me.HouseholdId);
        var members = await db.Users.Where(u => u.HouseholdId == house.Id && u.EmailConfirmed).OrderBy(u => u.Id)
            .Select(u => new { id = u.Id, name = u.Username }).ToListAsync();
        var expenses = await db.Expenses.Where(e => e.HouseholdId == house.Id).Include(e => e.Participants).ToListAsync();
        var payments = await db.Payments.Where(p => p.HouseholdId == house.Id).OrderBy(p => p.Id)
            .Select(p => new { id = p.Id, from = p.FromUserId, to = p.ToUserId, cents = p.Cents, month = p.Month }).ToListAsync();
        Response.Headers.CacheControl = "no-store";
        return Ok(new { me = new { id = me.Id, name = me.Username, email = me.Email },
            household = new { id = house.Id, name = house.Name, ownerId = house.OwnerId, budgetCents = (long)(house.MonthlyBudget * 100) },
            members, expenses = expenses.Select(ExpenseDto), payments });
    }

    public record ExpenseInput(string Name, long Cents, string Category, int PayerId, string Date, List<int> ParticipantIds);

    [HttpPost("expenses"), RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> CreateExpense([FromForm] string payload, [FromForm] IFormFile? receipt)
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        ExpenseInput? input;
        try { input = JsonSerializer.Deserialize<ExpenseInput>(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
        catch (JsonException) { return BadRequest(new { message = "Harcama bilgileri okunamadı." }); }
        if (input is null || string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 80
            || input.Cents <= 0 || input.Cents > 100000000 || !Categories.Contains(input.Category)
            || input.ParticipantIds is null || input.ParticipantIds.Count == 0 || input.ParticipantIds.Count > 100
            || input.ParticipantIds.Distinct().Count() != input.ParticipantIds.Count
            || !DateOnly.TryParseExact(input.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return BadRequest(new { message = "Harcama açıklamasını, tutarı, tarihi ve paylaşacak kişileri kontrol et." });
        var memberIds = await db.Users.Where(u => u.HouseholdId == me.HouseholdId && u.EmailConfirmed).Select(u => u.Id).ToListAsync();
        if (!memberIds.Contains(input.PayerId) || input.ParticipantIds.Any(id => !memberIds.Contains(id)))
            return BadRequest(new { message = "Yalnızca bu eve kayıtlı kişileri seçebilirsin." });
        byte[]? receiptData = null; string? contentType = null;
        if (receipt is not null)
        {
            try { (receiptData, contentType) = await ReceiptValidator.ReadAsync(receipt); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }
        var e = new Expense { Title = input.Name.Trim(), TotalAmount = input.Cents / 100m, PayerId = input.PayerId,
            HouseholdId = me.HouseholdId, CreatedById = me.Id, Category = input.Category,
            OccurredAt = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc),
            ReceiptData = receiptData, ReceiptContentType = contentType };
        var centsEach = input.Cents / input.ParticipantIds.Count;
        var remainder = input.Cents % input.ParticipantIds.Count;
        e.Participants = input.ParticipantIds.Select((id, i) => new ExpenseParticipant { UserId = id,
            OwedAmount = (centsEach + (i < remainder ? 1 : 0)) / 100m, IsPaid = false }).ToList();
        db.Expenses.Add(e);
        await db.SaveChangesAsync();
        return StatusCode(201, ExpenseDto(e));
    }

    [HttpGet("expenses/{id:int}/receipt")]
    public async Task<IActionResult> Receipt(int id)
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        var e = await db.Expenses.SingleOrDefaultAsync(e => e.Id == id && e.HouseholdId == me.HouseholdId);
        if (e?.ReceiptData is null || e.ReceiptContentType is null) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(e.ReceiptData, e.ReceiptContentType);
    }

    [HttpPut("expenses/{id:int}/receipt"), RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> ReplaceReceipt(int id, [FromForm] IFormFile receipt)
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        var house = await db.Households.FindAsync(me.HouseholdId);
        var e = await db.Expenses.SingleOrDefaultAsync(e => e.Id == id && e.HouseholdId == me.HouseholdId);
        if (e is null) return NotFound();
        if (e.CreatedById != me.Id && house!.OwnerId != me.Id) return Forbid();
        try { (e.ReceiptData, e.ReceiptContentType) = await ReceiptValidator.ReadAsync(receipt); }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        await db.SaveChangesAsync(); return NoContent();
    }

    public record HouseholdInput(string Name, long BudgetCents);
    [HttpPut("household")]
    public async Task<IActionResult> UpdateHousehold(HouseholdInput input)
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        var house = await db.Households.FindAsync(me.HouseholdId);
        if (house!.OwnerId != me.Id) return Forbid();
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 80 || input.BudgetCents <= 0 || input.BudgetCents > 100000000)
            return BadRequest(new { message = "Geçerli bir ev adı ve bütçe gir." });
        house.Name = input.Name.Trim(); house.MonthlyBudget = input.BudgetCents / 100m;
        await db.SaveChangesAsync(); return NoContent();
    }

    [HttpPost("household/invitation")]
    public async Task<IActionResult> Invite()
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        var house = await db.Households.FindAsync(me.HouseholdId);
        if (house!.OwnerId != me.Id) return Forbid();
        var token = AuthController.NewToken(); house.InvitationHash = AuthController.TokenHash(token);
        house.InvitationExpiresAt = DateTime.UtcNow.AddDays(7);
        await db.SaveChangesAsync();
        return Ok(new { code = token, expiresAt = house.InvitationExpiresAt });
    }

    public record JoinInput(string Code);
    [HttpPost("household/join")]
    public async Task<IActionResult> Join(JoinInput input)
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(input.Code) || input.Code.Length > 100) return BadRequest(new { message = "Geçerli bir katılım kodu gir." });
        var hash = AuthController.TokenHash(input.Code.Trim());
        var target = await db.Households.SingleOrDefaultAsync(h => h.InvitationHash == hash);
        if (target is null || target.InvitationExpiresAt is null || target.InvitationExpiresAt <= DateTime.UtcNow) return BadRequest(new { message = "Katılım kodu geçersiz veya süresi dolmuş." });
        if (target.Id == me.HouseholdId) return BadRequest(new { message = "Zaten bu evin üyesisin." });
        if (await db.Expenses.AnyAsync(e => e.HouseholdId == me.HouseholdId) || await db.Users.CountAsync(u => u.HouseholdId == me.HouseholdId) > 1)
            return BadRequest(new { message = "Kayıtları bulunan bir evden doğrudan ayrılamazsın. Ev yöneticisiyle görüş." });
        me.HouseholdId = target.Id;
        await db.SaveChangesAsync(); return NoContent();
    }

    public record PaymentInput(int FromUserId, int ToUserId, long Cents, string Month, Guid RequestId);
    [HttpPost("payments")]
    public async Task<IActionResult> RecordPayment(PaymentInput input)
    {
        var me = await CurrentUser();
        if (me?.HouseholdId is null) return Unauthorized();
        var house = await db.Households.FindAsync(me.HouseholdId);
        if (me.Id != input.FromUserId && me.Id != house!.OwnerId) return Forbid();
        if (input.Cents <= 0 || input.RequestId == Guid.Empty || !DateOnly.TryParseExact(input.Month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start))
            return BadRequest(new { message = "Ödeme bilgilerini kontrol et." });
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        if (await db.Payments.AnyAsync(p => p.HouseholdId == me.HouseholdId && p.RequestId == input.RequestId)) return NoContent();
        var memberIds = await db.Users.Where(u => u.HouseholdId == me.HouseholdId && u.EmailConfirmed).Select(u => u.Id).ToListAsync();
        if (!memberIds.Contains(input.FromUserId) || !memberIds.Contains(input.ToUserId) || input.FromUserId == input.ToUserId)
            return BadRequest(new { message = "Ödeme yalnızca aynı evin üyeleri arasında kaydedilebilir." });
        var monthStart = DateTime.SpecifyKind(start.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);
        var expenses = await db.Expenses.Where(e => e.HouseholdId == me.HouseholdId && e.OccurredAt >= monthStart && e.OccurredAt < monthEnd).Include(e => e.Participants).ToListAsync();
        var net = memberIds.ToDictionary(id => id, _ => 0L);
        foreach (var e in expenses)
        {
            net[e.PayerId] += (long)(e.TotalAmount * 100);
            foreach (var p in e.Participants) net[p.UserId] -= (long)(p.OwedAmount * 100);
        }
        foreach (var p in await db.Payments.Where(p => p.HouseholdId == me.HouseholdId && p.Month == input.Month).ToListAsync())
        { net[p.FromUserId] += p.Cents; net[p.ToUserId] -= p.Cents; }
        if (net[input.FromUserId] >= 0 || net[input.ToUserId] <= 0 || input.Cents > Math.Min(-net[input.FromUserId], net[input.ToUserId]))
            return BadRequest(new { message = "Bakiyeler değişmiş. Sayfayı yenileyip güncel ödemeyi seç." });
        db.Payments.Add(new Payment { HouseholdId = house!.Id, FromUserId = input.FromUserId, ToUserId = input.ToUserId,
            Cents = input.Cents, Month = input.Month, RequestId = input.RequestId });
        await db.SaveChangesAsync(); await transaction.CommitAsync(); return NoContent();
    }
}

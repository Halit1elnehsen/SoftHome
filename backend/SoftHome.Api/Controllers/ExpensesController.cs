using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.DTOs;
using SoftHome.Api.Models;
using SoftHome.Api.Services;

namespace SoftHome.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExpensesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IExpenseService _expenseService;

    public ExpensesController(AppDbContext context, IExpenseService expenseService)
    {
        _context = context;
        _expenseService = expenseService;
    }

    /// <summary>
    /// Tüm harcamaları liste halinde JSON formatında döndürür.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Expense>>> GetExpenses()
    {
        var expenses = await _context.Expenses
            .Include(e => e.Payer)
            .Include(e => e.Participants)
                .ThenInclude(p => p.User)
            .ToListAsync();

        return Ok(expenses);
    }

    /// <summary>
    /// Harcama ekler ve katılımcı listesine göre eşit bölüştürme yapar.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Expense>> CreateExpense([FromBody] CreateExpenseRequest request)
    {
        if (request == null || request.Expense == null)
        {
            return BadRequest("Geçersiz harcama verisi.");
        }

        var createdExpense = await _expenseService.AddExpenseAsync(request.Expense, request.ParticipantIds);

        return CreatedAtAction(nameof(GetExpenses), new { id = createdExpense.Id }, createdExpense);
    }

    /// <summary>
    /// Kimin kime ne kadar ödeyeceğini hesaplayan borç sadeleştirme sonucunu döner.
    /// </summary>
    [HttpGet("settlements")]
    public async Task<ActionResult<List<string>>> GetSettlements()
    {
        var settlements = await _expenseService.CalculateSettlementsAsync();
        return Ok(settlements);
    }

    /// <summary>
    /// Belirtilen harcamada kullanıcının borcunu ödendi olarak işaretler.
    /// </summary>
    [HttpPut("{expenseId}/pay/{userId}")]
    public async Task<IActionResult> MarkAsPaid(int expenseId, int userId)
    {
        var success = await _expenseService.MarkAsPaidAsync(expenseId, userId);
        if (!success)
        {
            return NotFound("İlgili harcama veya katılımcı kaydı bulunamadı.");
        }

        return NoContent();
    }

    /// <summary>
    /// Belirtilen harcamayı ve katılımcılarını veritabanından siler.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteExpense(int id)
    {
        var success = await _expenseService.DeleteExpenseAsync(id);
        if (!success)
        {
            return NotFound("Silinecek harcama bulunamadı.");
        }

        return NoContent();
    }
}

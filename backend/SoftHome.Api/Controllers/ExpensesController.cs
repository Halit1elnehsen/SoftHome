using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;

namespace SoftHome.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExpensesController : ControllerBase
{
    private readonly AppDbContext _context;

    public ExpensesController(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Tüm harcamaları listeler.
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
    /// Yeni bir harcama kaydı oluşturur.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Expense>> CreateExpense([FromBody] Expense expense)
    {
        _context.Expenses.Add(expense);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetExpenses), new { id = expense.Id }, expense);
    }
}

namespace SoftHome.Api.Models;

public class ExpenseParticipant
{
    public int Id { get; set; }
    public int ExpenseId { get; set; }
    public Expense Expense { get; set; } = null!;
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public decimal OwedAmount { get; set; }
    public bool IsPaid { get; set; }
}

namespace SoftHome.Api.Models;

public class Expense
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int PayerId { get; set; }
    public User Payer { get; set; } = null!;
    public ICollection<ExpenseParticipant> Participants { get; set; } = new List<ExpenseParticipant>();
}

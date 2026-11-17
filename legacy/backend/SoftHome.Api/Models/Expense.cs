namespace SoftHome.Api.Models;

public class Expense
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int PayerId { get; set; }
    public int? HouseholdId { get; set; }
    public int? CreatedById { get; set; }
    public string Category { get; set; } = "other";
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    [System.Text.Json.Serialization.JsonIgnore]
    public byte[]? ReceiptData { get; set; }
    public string? ReceiptContentType { get; set; }
    public User Payer { get; set; } = null!;
    public ICollection<ExpenseParticipant> Participants { get; set; } = new List<ExpenseParticipant>();
}

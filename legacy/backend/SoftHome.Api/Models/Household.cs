namespace SoftHome.Api.Models;

public class Household
{
    public int Id { get; set; }
    public string Name { get; set; } = "Evim";
    public int? OwnerId { get; set; }
    public decimal MonthlyBudget { get; set; } = 30000m;
    public string? InvitationHash { get; set; }
    public DateTime? InvitationExpiresAt { get; set; }
}

public class Payment
{
    public int Id { get; set; }
    public int HouseholdId { get; set; }
    public int FromUserId { get; set; }
    public int ToUserId { get; set; }
    public long Cents { get; set; }
    public string Month { get; set; } = "";
    public Guid RequestId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

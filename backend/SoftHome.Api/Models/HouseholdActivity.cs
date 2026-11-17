namespace SoftHome.Api.Models;

public class HouseholdActivity
{
    public int Id { get; set; }
    public int HouseholdId { get; set; }
    public int ActorId { get; set; }
    public string Message { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class NotificationReadState
{
    public int UserId { get; set; }
    public int HouseholdId { get; set; }
    public int LastReadId { get; set; }
}

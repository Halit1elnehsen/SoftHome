namespace SoftHome.Api.Models;

public class PasswordRecovery
{
    public int UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
}

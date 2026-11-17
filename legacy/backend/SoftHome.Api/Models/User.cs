namespace SoftHome.Api.Models;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? NormalizedEmail { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public string PasswordHash { get; set; } = string.Empty;
    public bool EmailConfirmed { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public string? VerificationTokenHash { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public DateTime? VerificationExpiresAt { get; set; }
    public DateTime? VerificationSentAt { get; set; }
    public int FailedLogins { get; set; }
    public DateTime? LockedUntil { get; set; }
    public int? HouseholdId { get; set; }
}

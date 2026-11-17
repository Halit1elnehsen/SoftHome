using SoftHome.Api.Models;

namespace SoftHome.Api.DTOs;

public class CreateExpenseRequest
{
    public Expense Expense { get; set; } = new();
    public List<int> ParticipantIds { get; set; } = new();
}

using SoftHome.Api.Models;

namespace SoftHome.Api.Services;

public interface IExpenseService
{
    /// <summary>
    /// Gideri ekleyip belirtilen katılımcılara eşit olarak böler.
    /// </summary>
    Task<Expense> AddExpenseAsync(Expense expense, List<int> participantIds);

    /// <summary>
    /// Kimin kime net ne kadar ödeyeceğini Minimum Cash Flow algoritması ile hesaplar.
    /// </summary>
    Task<List<string>> CalculateSettlementsAsync();

    /// <summary>
    /// Belirtilen harcamadaki kullanıcının borcunu ödendi olarak işaretler.
    /// </summary>
    Task<bool> MarkAsPaidAsync(int expenseId, int userId);

    /// <summary>
    /// Belirtilen harcamayı ve ilişkili katılımcı kayıtlarını siler.
    /// </summary>
    Task<bool> DeleteExpenseAsync(int expenseId);
}

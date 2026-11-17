using Microsoft.EntityFrameworkCore;
using SoftHome.Api.Models;

namespace SoftHome.Api.Services;

public class ExpenseService : IExpenseService
{
    private readonly AppDbContext _context;

    public ExpenseService(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Gideri ekleyip katılımcılara eşit bölen metot.
    /// </summary>
    public async Task<Expense> AddExpenseAsync(Expense expense, List<int> participantIds)
    {
        if (participantIds == null || participantIds.Count == 0)
        {
            throw new ArgumentException("En az bir katılımcı belirtilmelidir.", nameof(participantIds));
        }

        // Toplam tutarı katılımcı sayısına böl (2 ondalık basamak hassasiyeti ile)
        decimal splitAmount = Math.Round(expense.TotalAmount / participantIds.Count, 2);

        expense.Participants = new List<ExpenseParticipant>();

        foreach (var participantId in participantIds)
        {
            expense.Participants.Add(new ExpenseParticipant
            {
                UserId = participantId,
                Expense = expense,
                OwedAmount = splitAmount,
                IsPaid = false
            });
        }

        _context.Expenses.Add(expense);
        await _context.SaveChangesAsync();

        return expense;
    }

    /// <summary>
    /// Kimin kime net ne kadar ödeyeceğini hesaplayan borç sadeleştirme (Minimum Cash Flow) algoritması.
    /// </summary>
    public async Task<List<string>> CalculateSettlementsAsync()
    {
        // 1. Ödenmemiş tüm katılımcı borçlarını ve ilgili harcama/kullanıcı bilgilerini çek
        var unpaidParticipants = await _context.ExpenseParticipants
            .Include(ep => ep.Expense)
            .Include(ep => ep.User)
            .Where(ep => !ep.IsPaid)
            .ToListAsync();

        if (!unpaidParticipants.Any())
        {
            return new List<string>();
        }

        // İsim gösterimleri için kullanıcı bilgilerini çek
        var users = await _context.Users.ToDictionaryAsync(u => u.Id, u => u.Username);

        // 2. Her kullanıcı için Net Bakiye (Net Balance) hesapla:
        //    Alacaklı olduğu tutarlar (+) eksi Borçlu olduğu tutarlar (-)
        var netBalances = new Dictionary<int, decimal>();

        foreach (var ep in unpaidParticipants)
        {
            int payerId = ep.Expense.PayerId;
            int debtorId = ep.UserId;

            // Kullanıcı kendi ödediği harcamada kendi payı için kendine borçlu sayılmaz
            if (payerId == debtorId)
            {
                continue;
            }

            if (!netBalances.ContainsKey(payerId))
            {
                netBalances[payerId] = 0;
            }

            if (!netBalances.ContainsKey(debtorId))
            {
                netBalances[debtorId] = 0;
            }

            netBalances[payerId] += ep.OwedAmount; // Faturayı ödeyen alacaklı
            netBalances[debtorId] -= ep.OwedAmount; // Katılımcı borçlu
        }

        // 3. Alacaklıları (pozitif bakiye) ve Borçluları (negatif bakiye) ayır ve büyükten küçüğe sırala
        var creditors = netBalances
            .Where(b => b.Value > 0.01m)
            .Select(b => new SettlementParty { UserId = b.Key, Amount = b.Value })
            .OrderByDescending(c => c.Amount)
            .ToList();

        var debtors = netBalances
            .Where(b => b.Value < -0.01m)
            .Select(b => new SettlementParty { UserId = b.Key, Amount = Math.Abs(b.Value) })
            .OrderByDescending(d => d.Amount)
            .ToList();

        // 4. Greedy (açgözlü) algoritma ile en büyük borçluyu en büyük alacaklı ile eşleştir
        var settlements = new List<string>();
        int debtorIndex = 0;
        int creditorIndex = 0;

        while (debtorIndex < debtors.Count && creditorIndex < creditors.Count)
        {
            var currentDebtor = debtors[debtorIndex];
            var currentCreditor = creditors[creditorIndex];

            decimal settleAmount = Math.Min(currentDebtor.Amount, currentCreditor.Amount);

            if (settleAmount > 0.01m)
            {
                string debtorName = users.TryGetValue(currentDebtor.UserId, out var dName) && !string.IsNullOrWhiteSpace(dName)
                    ? dName
                    : $"Kullanıcı {currentDebtor.UserId}";

                string creditorName = users.TryGetValue(currentCreditor.UserId, out var cName) && !string.IsNullOrWhiteSpace(cName)
                    ? cName
                    : $"Kullanıcı {currentCreditor.UserId}";

                settlements.Add($"{debtorName} kullanıcısı {creditorName} kullanıcısına {settleAmount:N2} TL ödemelidir.");
            }

            currentDebtor.Amount -= settleAmount;
            currentCreditor.Amount -= settleAmount;

            if (currentDebtor.Amount <= 0.01m)
            {
                debtorIndex++;
            }

            if (currentCreditor.Amount <= 0.01m)
            {
                creditorIndex++;
            }
        }

        return settlements;
    }

    /// <summary>
    /// İlgili harcamadaki kullanıcının borcunu ödendi (IsPaid = true) olarak işaretler.
    /// </summary>
    public async Task<bool> MarkAsPaidAsync(int expenseId, int userId)
    {
        var participant = await _context.ExpenseParticipants
            .FirstOrDefaultAsync(ep => ep.ExpenseId == expenseId && ep.UserId == userId);

        if (participant == null)
        {
            return false;
        }

        participant.IsPaid = true;
        await _context.SaveChangesAsync();

        return true;
    }

    /// <summary>
    /// İlgili harcamayı ve ilişkili katılımcı kayıtlarını siler.
    /// </summary>
    public async Task<bool> DeleteExpenseAsync(int expenseId)
    {
        var expense = await _context.Expenses.FindAsync(expenseId);

        if (expense == null)
        {
            return false;
        }

        _context.Expenses.Remove(expense);
        await _context.SaveChangesAsync();

        return true;
    }

    private class SettlementParty
    {
        public int UserId { get; set; }
        public decimal Amount { get; set; }
    }
}

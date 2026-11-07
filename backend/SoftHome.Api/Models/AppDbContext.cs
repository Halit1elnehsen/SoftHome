using Microsoft.EntityFrameworkCore;

namespace SoftHome.Api.Models;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ExpenseParticipant> ExpenseParticipants => Set<ExpenseParticipant>();
    public DbSet<Household> Households => Set<Household>();
    public DbSet<Payment> Payments => Set<Payment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<User>().HasIndex(u => u.NormalizedEmail).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.VerificationTokenHash).IsUnique();
        modelBuilder.Entity<User>().HasOne<Household>().WithMany().HasForeignKey(u => u.HouseholdId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Household>().Property(h => h.MonthlyBudget).HasPrecision(12, 2);
        modelBuilder.Entity<Household>().HasIndex(h => h.InvitationHash).IsUnique();
        modelBuilder.Entity<Expense>().HasOne<Household>().WithMany().HasForeignKey(e => e.HouseholdId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Payment>().HasIndex(p => new { p.HouseholdId, p.RequestId }).IsUnique();

        modelBuilder.Entity<Expense>(entity =>
        {
            entity.Property(e => e.TotalAmount)
                  .HasPrecision(12, 2);
        });

        modelBuilder.Entity<ExpenseParticipant>(entity =>
        {
            entity.Property(ep => ep.OwedAmount)
                  .HasPrecision(12, 2);
        });
    }
}

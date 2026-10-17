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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

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

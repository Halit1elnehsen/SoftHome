using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SoftHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class SupabaseServerOnlyTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider != "Npgsql.EntityFrameworkCore.PostgreSQL") return;

            // Authentication and household authorization run in the ASP.NET API.
            // These tables must not be reachable through Supabase's public Data API.
            // The trusted backend uses its server-side owner/bypassrls connection;
            // no database credentials belong in the frontend or Android package.
            migrationBuilder.Sql("""
                DO $softhome_security$
                DECLARE
                    target_table text;
                BEGIN
                    FOREACH target_table IN ARRAY ARRAY[
                        'Users', 'Expenses', 'ExpenseParticipants', '__EFMigrationsHistory',
                        'Households', 'Payments', 'HouseholdActivities',
                        'NotificationReadStates', 'PasswordRecoveries',
                        'users', 'houses', 'house_members', 'categories',
                        'expenses', 'expense_splits', 'settlements'
                    ] LOOP
                        IF to_regclass(format('%I.%I', 'public', target_table)) IS NOT NULL THEN
                            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', target_table);
                            IF NOT EXISTS (
                                SELECT 1 FROM pg_policies
                                WHERE schemaname = 'public' AND tablename = target_table
                                  AND policyname = 'softhome_server_only'
                            ) THEN
                                EXECUTE format(
                                    'CREATE POLICY softhome_server_only ON %I.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
                                    'public', target_table
                                );
                            END IF;
                        END IF;
                    END LOOP;
                END
                $softhome_security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally retain access protection on rollback. Disabling RLS
            // would expose passwords, reset tokens, invitations and household data.
        }
    }
}

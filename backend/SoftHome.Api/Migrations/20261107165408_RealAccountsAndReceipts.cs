using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SoftHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class RealAccountsAndReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EmailConfirmed",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "FailedLogins",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "HouseholdId",
                table: "Users",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedUntil",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedEmail",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "VerificationExpiresAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "VerificationSentAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerificationTokenHash",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Expenses",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "CreatedById",
                table: "Expenses",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HouseholdId",
                table: "Expenses",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "OccurredAt",
                table: "Expenses",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "ReceiptContentType",
                table: "Expenses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "ReceiptData",
                table: "Expenses",
                type: "bytea",
                nullable: true);

            // Preserve the dates and records from the original version; assigning verified accounts to a household is a separate administrative operation.
            migrationBuilder.Sql("UPDATE \"Expenses\" SET \"OccurredAt\" = \"CreatedAt\", \"Category\" = 'other'");

            migrationBuilder.CreateTable(
                name: "Households",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OwnerId = table.Column<int>(type: "integer", nullable: true),
                    MonthlyBudget = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    InvitationHash = table.Column<string>(type: "text", nullable: true),
                    InvitationExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Households", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    HouseholdId = table.Column<int>(type: "integer", nullable: false),
                    FromUserId = table.Column<int>(type: "integer", nullable: false),
                    ToUserId = table.Column<int>(type: "integer", nullable: false),
                    Cents = table.Column<long>(type: "bigint", nullable: false),
                    Month = table.Column<string>(type: "text", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_HouseholdId",
                table: "Users",
                column: "HouseholdId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_VerificationTokenHash",
                table: "Users",
                column: "VerificationTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_HouseholdId",
                table: "Expenses",
                column: "HouseholdId");

            migrationBuilder.CreateIndex(
                name: "IX_Households_InvitationHash",
                table: "Households",
                column: "InvitationHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_HouseholdId_RequestId",
                table: "Payments",
                columns: new[] { "HouseholdId", "RequestId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Expenses_Households_HouseholdId",
                table: "Expenses",
                column: "HouseholdId",
                principalTable: "Households",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Households_HouseholdId",
                table: "Users",
                column: "HouseholdId",
                principalTable: "Households",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Expenses_Households_HouseholdId",
                table: "Expenses");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Households_HouseholdId",
                table: "Users");

            migrationBuilder.DropTable(
                name: "Households");

            migrationBuilder.DropTable(
                name: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Users_HouseholdId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_VerificationTokenHash",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Expenses_HouseholdId",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "EmailConfirmed",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "FailedLogins",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "HouseholdId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LockedUntil",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "NormalizedEmail",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "VerificationExpiresAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "VerificationSentAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "VerificationTokenHash",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "CreatedById",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "HouseholdId",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "OccurredAt",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "ReceiptContentType",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "ReceiptData",
                table: "Expenses");
        }
    }
}

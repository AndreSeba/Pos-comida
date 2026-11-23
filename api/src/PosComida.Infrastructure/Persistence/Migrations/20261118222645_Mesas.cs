using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace PosComida.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Mesas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Agotado",
                table: "productos",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<int>(
                name: "UsuarioId",
                table: "pedidos",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<string>(
                name: "Estado",
                table: "pedidos",
                type: "character varying(12)",
                maxLength: 12,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(10)",
                oldMaxLength: 10);

            migrationBuilder.AddColumn<string>(
                name: "Aviso",
                table: "pedidos",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ClienteId",
                table: "pedidos",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MesaId",
                table: "pedidos",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "mesas",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Token = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Activa = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mesas", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_pedidos_MesaId_Estado",
                table: "pedidos",
                columns: new[] { "MesaId", "Estado" });

            migrationBuilder.CreateIndex(
                name: "IX_mesas_Nombre",
                table: "mesas",
                column: "Nombre",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_mesas_Token",
                table: "mesas",
                column: "Token",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_pedidos_mesas_MesaId",
                table: "pedidos",
                column: "MesaId",
                principalTable: "mesas",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_pedidos_mesas_MesaId",
                table: "pedidos");

            migrationBuilder.DropTable(
                name: "mesas");

            migrationBuilder.DropIndex(
                name: "IX_pedidos_MesaId_Estado",
                table: "pedidos");

            migrationBuilder.DropColumn(
                name: "Agotado",
                table: "productos");

            migrationBuilder.DropColumn(
                name: "Aviso",
                table: "pedidos");

            migrationBuilder.DropColumn(
                name: "ClienteId",
                table: "pedidos");

            migrationBuilder.DropColumn(
                name: "MesaId",
                table: "pedidos");

            migrationBuilder.AlterColumn<int>(
                name: "UsuarioId",
                table: "pedidos",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Estado",
                table: "pedidos",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(12)",
                oldMaxLength: 12);
        }
    }
}

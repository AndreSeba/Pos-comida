using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosComida.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OrdenMenu : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Orden",
                table: "productos",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "OrdenCategorias",
                table: "configuracion",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Orden",
                table: "productos");

            migrationBuilder.DropColumn(
                name: "OrdenCategorias",
                table: "configuracion");
        }
    }
}

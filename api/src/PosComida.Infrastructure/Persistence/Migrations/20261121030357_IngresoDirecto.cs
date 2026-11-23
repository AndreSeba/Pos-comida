using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosComida.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class IngresoDirecto : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IngresoMesaConPermiso",
                table: "configuracion",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IngresoMesaConPermiso",
                table: "configuracion");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace PosComida.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SesionesMesa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MesaSesionId",
                table: "pedidos",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "mesa_sesiones",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MesaId = table.Column<int>(type: "integer", nullable: false),
                    Codigo = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Inicio = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Fin = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Intentos = table.Column<int>(type: "integer", nullable: false),
                    AbiertaPorId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mesa_sesiones", x => x.Id);
                    table.ForeignKey(
                        name: "FK_mesa_sesiones_mesas_MesaId",
                        column: x => x.MesaId,
                        principalTable: "mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "mesa_sesion_clientes",
                columns: table => new
                {
                    MesaSesionId = table.Column<int>(type: "integer", nullable: false),
                    ClienteId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mesa_sesion_clientes", x => new { x.MesaSesionId, x.ClienteId });
                    table.ForeignKey(
                        name: "FK_mesa_sesion_clientes_mesa_sesiones_MesaSesionId",
                        column: x => x.MesaSesionId,
                        principalTable: "mesa_sesiones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_pedidos_MesaSesionId",
                table: "pedidos",
                column: "MesaSesionId");

            migrationBuilder.CreateIndex(
                name: "IX_mesa_sesiones_MesaId_Fin",
                table: "mesa_sesiones",
                columns: new[] { "MesaId", "Fin" });

            migrationBuilder.AddForeignKey(
                name: "FK_pedidos_mesa_sesiones_MesaSesionId",
                table: "pedidos",
                column: "MesaSesionId",
                principalTable: "mesa_sesiones",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_pedidos_mesa_sesiones_MesaSesionId",
                table: "pedidos");

            migrationBuilder.DropTable(
                name: "mesa_sesion_clientes");

            migrationBuilder.DropTable(
                name: "mesa_sesiones");

            migrationBuilder.DropIndex(
                name: "IX_pedidos_MesaSesionId",
                table: "pedidos");

            migrationBuilder.DropColumn(
                name: "MesaSesionId",
                table: "pedidos");
        }
    }
}

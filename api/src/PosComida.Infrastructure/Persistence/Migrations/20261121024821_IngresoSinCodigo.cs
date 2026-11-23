using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace PosComida.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class IngresoSinCodigo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Codigo",
                table: "mesa_sesiones");

            migrationBuilder.DropColumn(
                name: "Intentos",
                table: "mesa_sesiones");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "IngresoHasta",
                table: "mesa_sesiones",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Nombre",
                table: "mesa_sesion_clientes",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "mesa_solicitudes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MesaId = table.Column<int>(type: "integer", nullable: false),
                    ClienteId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Nombre = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Creado = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Estado = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Resuelta = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mesa_solicitudes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_mesa_solicitudes_mesas_MesaId",
                        column: x => x.MesaId,
                        principalTable: "mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_mesa_solicitudes_ClienteId_MesaId",
                table: "mesa_solicitudes",
                columns: new[] { "ClienteId", "MesaId" });

            migrationBuilder.CreateIndex(
                name: "IX_mesa_solicitudes_MesaId_Estado",
                table: "mesa_solicitudes",
                columns: new[] { "MesaId", "Estado" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mesa_solicitudes");

            migrationBuilder.DropColumn(
                name: "IngresoHasta",
                table: "mesa_sesiones");

            migrationBuilder.DropColumn(
                name: "Nombre",
                table: "mesa_sesion_clientes");

            migrationBuilder.AddColumn<string>(
                name: "Codigo",
                table: "mesa_sesiones",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "Intentos",
                table: "mesa_sesiones",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}

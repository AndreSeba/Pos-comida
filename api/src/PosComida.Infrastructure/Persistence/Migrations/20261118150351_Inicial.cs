using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace PosComida.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Inicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auditoria",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UsuarioId = table.Column<int>(type: "integer", nullable: true),
                    UsuarioNombre = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Entidad = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    EntidadId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Accion = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ValorAnterior = table.Column<string>(type: "text", nullable: true),
                    ValorNuevo = table.Column<string>(type: "text", nullable: true),
                    Motivo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auditoria", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "configuracion",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    Negocio = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Moneda = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    ColorMarca = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Logo = table.Column<string>(type: "text", nullable: true),
                    Descripcion = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Whatsapp = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: true),
                    CartaPublicada = table.Column<bool>(type: "boolean", nullable: false),
                    MostrarPrecios = table.Column<bool>(type: "boolean", nullable: false),
                    PedidosWhatsapp = table.Column<bool>(type: "boolean", nullable: false),
                    PedidosAbiertos = table.Column<bool>(type: "boolean", nullable: false),
                    SeguimientoEntrega = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configuracion", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "gastos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Concepto = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Monto = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_gastos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ingredientes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Unidad = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    Cantidad = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    Precio = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Stock = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    StockMinimo = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ingredientes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "permisos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Codigo = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Grupo = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_permisos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "productos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Icono = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Porciones = table.Column<int>(type: "integer", nullable: false),
                    Otros = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    MargenObjetivo = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    Precio = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Activo = table.Column<bool>(type: "boolean", nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    EnCarta = table.Column<bool>(type: "boolean", nullable: false),
                    CostoManual = table.Column<decimal>(type: "numeric(12,4)", precision: 12, scale: 4, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_productos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "roles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    EsSistema = table.Column<bool>(type: "boolean", nullable: false),
                    Activo = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "producto_imagenes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProductoId = table.Column<int>(type: "integer", nullable: false),
                    Orden = table.Column<int>(type: "integer", nullable: false),
                    TipoMime = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Datos = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_producto_imagenes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_producto_imagenes_productos_ProductoId",
                        column: x => x.ProductoId,
                        principalTable: "productos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "receta_lineas",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProductoId = table.Column<int>(type: "integer", nullable: false),
                    IngredienteId = table.Column<int>(type: "integer", nullable: false),
                    Cantidad = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receta_lineas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_receta_lineas_ingredientes_IngredienteId",
                        column: x => x.IngredienteId,
                        principalTable: "ingredientes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_receta_lineas_productos_ProductoId",
                        column: x => x.ProductoId,
                        principalTable: "productos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rol_permisos",
                columns: table => new
                {
                    RolId = table.Column<int>(type: "integer", nullable: false),
                    PermisoId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rol_permisos", x => new { x.RolId, x.PermisoId });
                    table.ForeignKey(
                        name: "FK_rol_permisos_permisos_PermisoId",
                        column: x => x.PermisoId,
                        principalTable: "permisos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_rol_permisos_roles_RolId",
                        column: x => x.RolId,
                        principalTable: "roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "usuarios",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    RolId = table.Column<int>(type: "integer", nullable: false),
                    PinHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Activo = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_usuarios", x => x.Id);
                    table.ForeignKey(
                        name: "FK_usuarios_roles_RolId",
                        column: x => x.RolId,
                        principalTable: "roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "compras",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Proveedor = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Nota = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    UsuarioId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compras", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compras_usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "movimientos_insumo",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    IngredienteId = table.Column<int>(type: "integer", nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Cantidad = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    Saldo = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    Nota = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    UsuarioId = table.Column<int>(type: "integer", nullable: true),
                    VentaId = table.Column<int>(type: "integer", nullable: true),
                    CompraId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_movimientos_insumo", x => x.Id);
                    table.ForeignKey(
                        name: "FK_movimientos_insumo_ingredientes_IngredienteId",
                        column: x => x.IngredienteId,
                        principalTable: "ingredientes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_movimientos_insumo_usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "pedidos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Numero = table.Column<int>(type: "integer", nullable: false),
                    Etiqueta = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Nota = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Creado = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UsuarioId = table.Column<int>(type: "integer", nullable: false),
                    Estado = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    VentaId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pedidos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_pedidos_usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ventas",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UsuarioId = table.Column<int>(type: "integer", nullable: false),
                    Nota = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Costo = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Anulada = table.Column<bool>(type: "boolean", nullable: false),
                    Etiqueta = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Entregado = table.Column<bool>(type: "boolean", nullable: false),
                    FechaEntrega = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PedidoId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ventas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ventas_usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "compra_items",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CompraId = table.Column<int>(type: "integer", nullable: false),
                    IngredienteId = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Cantidad = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compra_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compra_items_compras_CompraId",
                        column: x => x.CompraId,
                        principalTable: "compras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pedido_items",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PedidoId = table.Column<int>(type: "integer", nullable: false),
                    ProductoId = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Cantidad = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pedido_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_pedido_items_pedidos_PedidoId",
                        column: x => x.PedidoId,
                        principalTable: "pedidos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "venta_items",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    VentaId = table.Column<int>(type: "integer", nullable: false),
                    ProductoId = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Precio = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Costo = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Cantidad = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_venta_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_venta_items_ventas_VentaId",
                        column: x => x.VentaId,
                        principalTable: "ventas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "venta_pagos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    VentaId = table.Column<int>(type: "integer", nullable: false),
                    Metodo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Monto = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_venta_pagos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_venta_pagos_ventas_VentaId",
                        column: x => x.VentaId,
                        principalTable: "ventas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_auditoria_Entidad_EntidadId",
                table: "auditoria",
                columns: new[] { "Entidad", "EntidadId" });

            migrationBuilder.CreateIndex(
                name: "IX_auditoria_Fecha",
                table: "auditoria",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_compra_items_CompraId",
                table: "compra_items",
                column: "CompraId");

            migrationBuilder.CreateIndex(
                name: "IX_compras_Fecha",
                table: "compras",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_compras_UsuarioId",
                table: "compras",
                column: "UsuarioId");

            migrationBuilder.CreateIndex(
                name: "IX_gastos_Fecha",
                table: "gastos",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_movimientos_insumo_IngredienteId_Fecha",
                table: "movimientos_insumo",
                columns: new[] { "IngredienteId", "Fecha" });

            migrationBuilder.CreateIndex(
                name: "IX_movimientos_insumo_UsuarioId",
                table: "movimientos_insumo",
                column: "UsuarioId");

            migrationBuilder.CreateIndex(
                name: "IX_movimientos_insumo_VentaId",
                table: "movimientos_insumo",
                column: "VentaId");

            migrationBuilder.CreateIndex(
                name: "IX_pedido_items_PedidoId",
                table: "pedido_items",
                column: "PedidoId");

            migrationBuilder.CreateIndex(
                name: "IX_pedido_items_ProductoId",
                table: "pedido_items",
                column: "ProductoId");

            migrationBuilder.CreateIndex(
                name: "IX_pedidos_Estado_Creado",
                table: "pedidos",
                columns: new[] { "Estado", "Creado" });

            migrationBuilder.CreateIndex(
                name: "IX_pedidos_UsuarioId",
                table: "pedidos",
                column: "UsuarioId");

            migrationBuilder.CreateIndex(
                name: "IX_permisos_Codigo",
                table: "permisos",
                column: "Codigo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_producto_imagenes_ProductoId_Orden",
                table: "producto_imagenes",
                columns: new[] { "ProductoId", "Orden" });

            migrationBuilder.CreateIndex(
                name: "IX_receta_lineas_IngredienteId",
                table: "receta_lineas",
                column: "IngredienteId");

            migrationBuilder.CreateIndex(
                name: "IX_receta_lineas_ProductoId_IngredienteId",
                table: "receta_lineas",
                columns: new[] { "ProductoId", "IngredienteId" });

            migrationBuilder.CreateIndex(
                name: "IX_rol_permisos_PermisoId",
                table: "rol_permisos",
                column: "PermisoId");

            migrationBuilder.CreateIndex(
                name: "IX_roles_Nombre",
                table: "roles",
                column: "Nombre",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_usuarios_Nombre",
                table: "usuarios",
                column: "Nombre",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_usuarios_RolId",
                table: "usuarios",
                column: "RolId");

            migrationBuilder.CreateIndex(
                name: "IX_venta_items_VentaId",
                table: "venta_items",
                column: "VentaId");

            migrationBuilder.CreateIndex(
                name: "IX_venta_pagos_VentaId",
                table: "venta_pagos",
                column: "VentaId");

            migrationBuilder.CreateIndex(
                name: "IX_ventas_Entregado",
                table: "ventas",
                column: "Entregado");

            migrationBuilder.CreateIndex(
                name: "IX_ventas_Fecha",
                table: "ventas",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_ventas_UsuarioId",
                table: "ventas",
                column: "UsuarioId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auditoria");

            migrationBuilder.DropTable(
                name: "compra_items");

            migrationBuilder.DropTable(
                name: "configuracion");

            migrationBuilder.DropTable(
                name: "gastos");

            migrationBuilder.DropTable(
                name: "movimientos_insumo");

            migrationBuilder.DropTable(
                name: "pedido_items");

            migrationBuilder.DropTable(
                name: "producto_imagenes");

            migrationBuilder.DropTable(
                name: "receta_lineas");

            migrationBuilder.DropTable(
                name: "rol_permisos");

            migrationBuilder.DropTable(
                name: "venta_items");

            migrationBuilder.DropTable(
                name: "venta_pagos");

            migrationBuilder.DropTable(
                name: "compras");

            migrationBuilder.DropTable(
                name: "pedidos");

            migrationBuilder.DropTable(
                name: "ingredientes");

            migrationBuilder.DropTable(
                name: "productos");

            migrationBuilder.DropTable(
                name: "permisos");

            migrationBuilder.DropTable(
                name: "ventas");

            migrationBuilder.DropTable(
                name: "usuarios");

            migrationBuilder.DropTable(
                name: "roles");
        }
    }
}

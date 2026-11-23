using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PosComida.Domain;

namespace PosComida.Infrastructure.Persistence;

public class PosDbContext(DbContextOptions<PosDbContext> options) : DbContext(options)
{
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Rol> Roles => Set<Rol>();
    public DbSet<Permiso> Permisos => Set<Permiso>();
    public DbSet<RolPermiso> RolPermisos => Set<RolPermiso>();
    public DbSet<Auditoria> Auditorias => Set<Auditoria>();
    public DbSet<Configuracion> Configuraciones => Set<Configuracion>();
    public DbSet<Ingrediente> Ingredientes => Set<Ingrediente>();
    public DbSet<Producto> Productos => Set<Producto>();
    public DbSet<ProductoImagen> ProductoImagenes => Set<ProductoImagen>();
    public DbSet<RecetaLinea> RecetaLineas => Set<RecetaLinea>();
    public DbSet<Venta> Ventas => Set<Venta>();
    public DbSet<VentaItem> VentaItems => Set<VentaItem>();
    public DbSet<VentaPago> VentaPagos => Set<VentaPago>();
    public DbSet<Gasto> Gastos => Set<Gasto>();
    public DbSet<Pedido> Pedidos => Set<Pedido>();
    public DbSet<MovimientoInsumo> MovimientosInsumo => Set<MovimientoInsumo>();
    public DbSet<Compra> Compras => Set<Compra>();
    public DbSet<CompraItem> CompraItems => Set<CompraItem>();
    public DbSet<PedidoItem> PedidoItems => Set<PedidoItem>();
    public DbSet<Mesa> Mesas => Set<Mesa>();
    public DbSet<MesaSesion> MesaSesiones => Set<MesaSesion>();
    public DbSet<MesaSesionCliente> MesaSesionClientes => Set<MesaSesionCliente>();
    public DbSet<MesaSolicitud> MesaSolicitudes => Set<MesaSolicitud>();

    protected override void OnModelCreating(ModelBuilder b) =>
        b.ApplyConfigurationsFromAssembly(typeof(PosDbContext).Assembly);
}

internal class UsuarioConfig : IEntityTypeConfiguration<Usuario>
{
    public void Configure(EntityTypeBuilder<Usuario> e)
    {
        e.ToTable("usuarios");
        e.Property(x => x.Nombre).HasMaxLength(60).IsRequired();
        e.HasOne(x => x.Rol).WithMany().HasForeignKey(x => x.RolId).OnDelete(DeleteBehavior.Restrict);
        e.Property(x => x.PinHash).HasMaxLength(100).IsRequired();
        e.HasIndex(x => x.Nombre).IsUnique();
    }
}

internal class ConfiguracionConfig : IEntityTypeConfiguration<Configuracion>
{
    public void Configure(EntityTypeBuilder<Configuracion> e)
    {
        e.ToTable("configuracion");
        e.Property(x => x.Id).ValueGeneratedNever();
        e.Property(x => x.Negocio).HasMaxLength(80).IsRequired();
        e.Property(x => x.Moneda).HasMaxLength(8).IsRequired();
        e.Property(x => x.ColorMarca).HasMaxLength(7).IsRequired();
        e.Property(x => x.Logo).HasColumnType("text");
        e.Property(x => x.Descripcion).HasMaxLength(200).IsRequired();
        e.Property(x => x.Whatsapp).HasMaxLength(15);
    }
}

internal class IngredienteConfig : IEntityTypeConfiguration<Ingrediente>
{
    public void Configure(EntityTypeBuilder<Ingrediente> e)
    {
        e.ToTable("ingredientes");
        e.Property(x => x.Nombre).HasMaxLength(100).IsRequired();
        e.Property(x => x.Unidad).HasConversion<string>().HasMaxLength(4);
        e.Property(x => x.Cantidad).HasPrecision(14, 3);
        e.Property(x => x.Precio).HasPrecision(12, 2);
        e.Property(x => x.Stock).HasPrecision(14, 3);
        e.Property(x => x.StockMinimo).HasPrecision(14, 3);
        e.Ignore(x => x.CostoUnitario);
    }
}

internal class ProductoConfig : IEntityTypeConfiguration<Producto>
{
    public void Configure(EntityTypeBuilder<Producto> e)
    {
        e.ToTable("productos");
        e.Property(x => x.Nombre).HasMaxLength(100).IsRequired();
        e.Property(x => x.Categoria).HasMaxLength(60).IsRequired();
        e.Property(x => x.Icono).HasMaxLength(24).IsRequired();
        e.Property(x => x.Otros).HasPrecision(12, 2);
        e.Property(x => x.CostoManual).HasPrecision(12, 4);
        e.Property(x => x.MargenObjetivo).HasPrecision(5, 2);
        e.Property(x => x.Precio).HasPrecision(12, 2);
        e.Property(x => x.Descripcion).HasMaxLength(300).IsRequired();
        e.HasMany(x => x.Receta).WithOne().HasForeignKey(x => x.ProductoId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal class ProductoImagenConfig : IEntityTypeConfiguration<ProductoImagen>
{
    public void Configure(EntityTypeBuilder<ProductoImagen> e)
    {
        e.ToTable("producto_imagenes");
        e.Property(x => x.TipoMime).HasMaxLength(20).IsRequired();
        e.HasOne<Producto>().WithMany().HasForeignKey(x => x.ProductoId).OnDelete(DeleteBehavior.Cascade);
        e.HasIndex(x => new { x.ProductoId, x.Orden });
    }
}

internal class RecetaLineaConfig : IEntityTypeConfiguration<RecetaLinea>
{
    public void Configure(EntityTypeBuilder<RecetaLinea> e)
    {
        e.ToTable("receta_lineas");
        e.Property(x => x.Cantidad).HasPrecision(14, 3);
        // un ingrediente "borrado" (Activo=false) queda en la receta histórica sin romperla
        e.HasOne(x => x.Ingrediente).WithMany().HasForeignKey(x => x.IngredienteId).OnDelete(DeleteBehavior.Restrict);
        e.HasIndex(x => new { x.ProductoId, x.IngredienteId });
    }
}

internal class VentaConfig : IEntityTypeConfiguration<Venta>
{
    public void Configure(EntityTypeBuilder<Venta> e)
    {
        e.ToTable("ventas");
        e.Ignore(x => x.MetodoTexto);
        e.Property(x => x.Nota).HasMaxLength(200).IsRequired();
        e.Property(x => x.Etiqueta).HasMaxLength(40).IsRequired();
        e.Property(x => x.Total).HasPrecision(12, 2);
        e.Property(x => x.Costo).HasPrecision(12, 2);
        e.HasIndex(x => x.Entregado);
        e.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Restrict);
        e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.VentaId).OnDelete(DeleteBehavior.Cascade);
        e.HasMany(x => x.Pagos).WithOne().HasForeignKey(x => x.VentaId).OnDelete(DeleteBehavior.Cascade);
        e.HasIndex(x => x.Fecha);
    }
}

internal class VentaPagoConfig : IEntityTypeConfiguration<VentaPago>
{
    public void Configure(EntityTypeBuilder<VentaPago> e)
    {
        e.ToTable("venta_pagos");
        e.Property(x => x.Metodo).HasConversion<string>().HasMaxLength(10);
        e.Property(x => x.Monto).HasPrecision(12, 2);
        e.HasIndex(x => x.VentaId);
    }
}

internal class VentaItemConfig : IEntityTypeConfiguration<VentaItem>
{
    public void Configure(EntityTypeBuilder<VentaItem> e)
    {
        e.ToTable("venta_items");
        e.Property(x => x.Nombre).HasMaxLength(100).IsRequired();
        e.Property(x => x.Precio).HasPrecision(12, 2);
        e.Property(x => x.Costo).HasPrecision(12, 2);
    }
}

internal class GastoConfig : IEntityTypeConfiguration<Gasto>
{
    public void Configure(EntityTypeBuilder<Gasto> e)
    {
        e.ToTable("gastos");
        e.Property(x => x.Concepto).HasMaxLength(150).IsRequired();
        e.Property(x => x.Categoria).HasMaxLength(60).IsRequired();
        e.Property(x => x.Monto).HasPrecision(12, 2);
        e.HasIndex(x => x.Fecha);
    }
}

internal class PedidoConfig : IEntityTypeConfiguration<Pedido>
{
    public void Configure(EntityTypeBuilder<Pedido> e)
    {
        e.ToTable("pedidos");
        e.Property(x => x.Etiqueta).HasMaxLength(40).IsRequired();
        e.Property(x => x.Nota).HasMaxLength(200).IsRequired();
        e.Property(x => x.Estado).HasConversion<string>().HasMaxLength(12);
        e.Property(x => x.ClienteId).HasMaxLength(40);
        e.Property(x => x.Aviso).HasMaxLength(200).IsRequired();
        e.Property(x => x.NombreCliente).HasMaxLength(120).IsRequired();
        e.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne(x => x.Mesa).WithMany().HasForeignKey(x => x.MesaId).OnDelete(DeleteBehavior.Restrict);
        e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.PedidoId).OnDelete(DeleteBehavior.Cascade);
        e.HasIndex(x => new { x.Estado, x.Creado });
        e.HasOne<MesaSesion>().WithMany().HasForeignKey(x => x.MesaSesionId).OnDelete(DeleteBehavior.SetNull);
        e.HasIndex(x => new { x.MesaId, x.Estado });
    }
}

internal class MesaConfig : IEntityTypeConfiguration<Mesa>
{
    public void Configure(EntityTypeBuilder<Mesa> e)
    {
        e.ToTable("mesas");
        e.Property(x => x.Nombre).HasMaxLength(40).IsRequired();
        e.Property(x => x.Token).HasMaxLength(40).IsRequired();
        e.HasIndex(x => x.Nombre).IsUnique();
        e.HasIndex(x => x.Token).IsUnique();
    }
}

internal class MesaSesionConfig : IEntityTypeConfiguration<MesaSesion>
{
    public void Configure(EntityTypeBuilder<MesaSesion> e)
    {
        e.ToTable("mesa_sesiones");
        e.HasOne(x => x.Mesa).WithMany().HasForeignKey(x => x.MesaId).OnDelete(DeleteBehavior.Cascade);
        e.HasIndex(x => new { x.MesaId, x.Fin });
    }
}

internal class MesaSesionClienteConfig : IEntityTypeConfiguration<MesaSesionCliente>
{
    public void Configure(EntityTypeBuilder<MesaSesionCliente> e)
    {
        e.ToTable("mesa_sesion_clientes");
        e.Property(x => x.ClienteId).HasMaxLength(40).IsRequired();
        e.Property(x => x.Nombre).HasMaxLength(40).IsRequired();
        e.HasKey(x => new { x.MesaSesionId, x.ClienteId });
        e.HasOne<MesaSesion>().WithMany().HasForeignKey(x => x.MesaSesionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal class MesaSolicitudConfig : IEntityTypeConfiguration<MesaSolicitud>
{
    public void Configure(EntityTypeBuilder<MesaSolicitud> e)
    {
        e.ToTable("mesa_solicitudes");
        e.Property(x => x.ClienteId).HasMaxLength(40).IsRequired();
        e.Property(x => x.Nombre).HasMaxLength(40).IsRequired();
        e.Property(x => x.Estado).HasConversion<string>().HasMaxLength(10);
        e.HasOne<Mesa>().WithMany().HasForeignKey(x => x.MesaId).OnDelete(DeleteBehavior.Cascade);
        e.HasIndex(x => new { x.MesaId, x.Estado });
        e.HasIndex(x => new { x.ClienteId, x.MesaId });
    }
}

internal class PedidoItemConfig : IEntityTypeConfiguration<PedidoItem>
{
    public void Configure(EntityTypeBuilder<PedidoItem> e)
    {
        e.ToTable("pedido_items");
        e.Property(x => x.Nombre).HasMaxLength(100).IsRequired();
        e.HasIndex(x => x.ProductoId);
    }
}

internal class MovimientoInsumoConfig : IEntityTypeConfiguration<MovimientoInsumo>
{
    public void Configure(EntityTypeBuilder<MovimientoInsumo> e)
    {
        e.ToTable("movimientos_insumo");
        e.Property(x => x.Tipo).HasConversion<string>().HasMaxLength(20);
        e.Property(x => x.Cantidad).HasPrecision(14, 3);
        e.Property(x => x.Saldo).HasPrecision(14, 3);
        e.Property(x => x.Nota).HasMaxLength(200).IsRequired();
        // si se borra un insumo que no se usa en recetas, su historial se va con él
        e.HasOne<Ingrediente>().WithMany().HasForeignKey(x => x.IngredienteId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.SetNull);
        e.HasIndex(x => new { x.IngredienteId, x.Fecha });
        e.HasIndex(x => x.VentaId);
    }
}

internal class CompraConfig : IEntityTypeConfiguration<Compra>
{
    public void Configure(EntityTypeBuilder<Compra> e)
    {
        e.ToTable("compras");
        e.Property(x => x.Proveedor).HasMaxLength(80).IsRequired();
        e.Property(x => x.Nota).HasMaxLength(200).IsRequired();
        e.Property(x => x.Total).HasPrecision(12, 2);
        e.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Restrict);
        e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.CompraId).OnDelete(DeleteBehavior.Cascade);
        e.HasIndex(x => x.Fecha);
    }
}

internal class CompraItemConfig : IEntityTypeConfiguration<CompraItem>
{
    public void Configure(EntityTypeBuilder<CompraItem> e)
    {
        e.ToTable("compra_items");
        e.Property(x => x.Nombre).HasMaxLength(100).IsRequired();
        e.Property(x => x.Cantidad).HasPrecision(14, 3);
        e.Property(x => x.Total).HasPrecision(12, 2);
    }
}

internal class PermisoConfig : IEntityTypeConfiguration<Permiso>
{
    public void Configure(EntityTypeBuilder<Permiso> e)
    {
        e.ToTable("permisos");
        e.Property(x => x.Codigo).HasMaxLength(60).IsRequired();
        e.Property(x => x.Nombre).HasMaxLength(100).IsRequired();
        e.Property(x => x.Grupo).HasMaxLength(40).IsRequired();
        e.HasIndex(x => x.Codigo).IsUnique();
    }
}

internal class RolConfig : IEntityTypeConfiguration<Rol>
{
    public void Configure(EntityTypeBuilder<Rol> e)
    {
        e.ToTable("roles");
        e.Property(x => x.Nombre).HasMaxLength(40).IsRequired();
        e.Property(x => x.Descripcion).HasMaxLength(200).IsRequired();
        e.HasIndex(x => x.Nombre).IsUnique();
        e.HasMany(x => x.Permisos).WithOne().HasForeignKey(x => x.RolId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal class RolPermisoConfig : IEntityTypeConfiguration<RolPermiso>
{
    public void Configure(EntityTypeBuilder<RolPermiso> e)
    {
        e.ToTable("rol_permisos");
        e.HasKey(x => new { x.RolId, x.PermisoId });
        e.HasOne(x => x.Permiso).WithMany().HasForeignKey(x => x.PermisoId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal class AuditoriaConfig : IEntityTypeConfiguration<Auditoria>
{
    public void Configure(EntityTypeBuilder<Auditoria> e)
    {
        e.ToTable("auditoria");
        e.Property(x => x.UsuarioNombre).HasMaxLength(60).IsRequired();
        e.Property(x => x.Entidad).HasMaxLength(40).IsRequired();
        e.Property(x => x.EntidadId).HasMaxLength(40).IsRequired();
        e.Property(x => x.Accion).HasMaxLength(40).IsRequired();
        e.Property(x => x.ValorAnterior).HasColumnType("text");
        e.Property(x => x.ValorNuevo).HasColumnType("text");
        e.Property(x => x.Motivo).HasMaxLength(200);
        e.HasIndex(x => x.Fecha);
        e.HasIndex(x => new { x.Entidad, x.EntidadId });
    }
}

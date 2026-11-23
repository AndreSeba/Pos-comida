using PosComida.Domain;

namespace PosComida.Application;

public class DominioException(string mensaje, int estado = 400) : Exception(mensaje)
{
    public int Estado { get; } = estado;
}

// ---- auth
public record LoginRequest(int UsuarioId, string Pin);
public record LoginResponse(string Token, int UsuarioId, string Nombre, string Rol, DateTimeOffset Expira, List<string> Permisos);
public record UsuarioPublicoDto(int Id, string Nombre, string Rol, bool Admin);

public record UsuarioDto(int Id, string Nombre, string Rol, int RolId, bool Activo);
public record UsuarioGuardarDto(string Nombre, int RolId, string? Pin, bool Activo);

// ---- roles y permisos
public record PermisoDto(string Codigo, string Nombre, string Grupo);
public record RolDto(int Id, string Nombre, string Descripcion, bool EsSistema, bool Activo, int Usuarios, List<string> Permisos);
public record RolGuardarDto(string Nombre, string? Descripcion, bool Activo, List<string> Permisos);

// ---- auditoría
public record AuditoriaDto(long Id, DateTimeOffset Fecha, int? UsuarioId, string Usuario, string Entidad, string EntidadId, string Accion, string? ValorAnterior, string? ValorNuevo, string? Motivo);
public record AuditoriaFiltro(string? Entidad, string? Accion, int? UsuarioId, DateTimeOffset? Desde, DateTimeOffset? Hasta, int Limite = 200);
public record AuditoriaCatalogoDto(List<string> Entidades, List<string> Acciones, List<UsuarioRefDto> Usuarios);
public record UsuarioRefDto(int Id, string Nombre);

// ---- config
public record ConfigDto(
    string Negocio, string Moneda, string ColorMarca, string? Logo,
    string Descripcion, string? Whatsapp, bool CartaPublicada, bool MostrarPrecios, bool PedidosWhatsapp,
    bool PedidosAbiertos, bool SeguimientoEntrega, bool IngresoMesaConPermiso = false);
/// <summary>Lo único que se muestra antes de iniciar sesión.</summary>
public record ConfigPublicaDto(string Negocio, string Moneda, string ColorMarca, string? Logo);

// ---- catalogo
public record IngredienteDto(int Id, string Nombre, string Unidad, decimal Cantidad, decimal Precio, decimal Stock, decimal StockMinimo);
/// <summary>Stock solo cuenta al crear (stock inicial); después el stock cambia con compras, ventas y ajustes.</summary>
public record IngredienteGuardarDto(string Nombre, string Unidad, decimal Cantidad, decimal Precio, decimal Stock = 0, decimal StockMinimo = 0);

// ---- inventario
public record MovimientoDto(int Id, DateTimeOffset Fecha, string Tipo, decimal Cantidad, decimal Saldo, string Nota, string? Usuario, int? VentaId, int? CompraId);
/// <summary>StockReal = lo que contaste. El sistema calcula la diferencia y la anota como ajuste.</summary>
public record AjusteRequest(int IngredienteId, decimal StockReal, string? Motivo);
public record CompraItemRequest(int IngredienteId, decimal Cantidad, decimal Total);
public record CompraRequest(string? Proveedor, DateTimeOffset? Fecha, string? Nota, bool ActualizarCostos, bool RegistrarGasto, List<CompraItemRequest> Items);
public record CompraItemDto(int IngredienteId, string Nombre, decimal Cantidad, decimal Total);
public record CompraDto(int Id, DateTimeOffset Fecha, string Proveedor, string Nota, decimal Total, string Usuario, List<CompraItemDto> Items);

public record RecetaLineaDto(int IngredienteId, decimal Cantidad);

/// <summary>Una imagen ya guardada. La dirección sirve para mostrarla (y es pública).</summary>
public record ImagenDto(int Id, string Url);
/// <summary>Imagen en la lista final de un producto: una ya guardada (solo Id) o una nueva (Datos = data URL).</summary>
public record ImagenGuardarDto(int? Id, string? Datos);

public static class Urls
{
    public static string Imagen(int id) => $"/api/publico/imagenes/{id}";
}

/// <summary>Vista completa para el administrador (incluye costos).</summary>
public record ProductoDto(
    int Id, string Nombre, string Categoria, string Icono, int Porciones, decimal Otros, decimal MargenObjetivo,
    decimal Precio, bool Activo, decimal Costo, List<RecetaLineaDto> Receta, string Descripcion, bool EnCarta, List<ImagenDto> Imagenes,
    /// <summary>Lo que cuesta según la receta (la sugerencia). Costo = CostoManual si hay, si no esto.</summary>
    decimal CostoCalculado, decimal? CostoManual, bool Agotado = false);

public record ProductoGuardarDto(
    string Nombre, string Categoria, string Icono, int Porciones, decimal Otros, decimal MargenObjetivo,
    decimal Precio, bool Activo, List<RecetaLineaDto> Receta, string? Descripcion = null, bool EnCarta = true,
    /// <summary>La lista FINAL de imágenes, en orden (la primera es la portada). null = no tocar las imágenes.</summary>
    List<ImagenGuardarDto>? Imagenes = null,
    /// <summary>Costo por unidad anotado a mano; null = usar el calculado con la receta.</summary>
    decimal? CostoManual = null);

/// <summary>Un producto en la lista de orden del menú: su posición es la de la lista, y aquí se decide dónde se muestra.</summary>
public record OrdenMenuItemDto(int Id, bool Activo, bool EnCarta);

/// <summary>El menú como lo quiere el dueño: categorías en orden y productos en orden (con dónde se muestra cada uno).</summary>
public record OrdenMenuDto(List<string> Categorias, List<OrdenMenuItemDto> Productos);

/// <summary>Vista para el panel de ventas: sin costos ni recetas.</summary>
public record ProductoVentaDto(int Id, string Nombre, string Categoria, string Icono, decimal Precio, string? FotoUrl, bool Agotado = false);

// ---- carta pública (sin sesión)
public record CartaProductoDto(int Id, string Nombre, string Descripcion, string Icono, decimal? Precio, List<string> Imagenes, bool Agotado = false);
public record CartaCategoriaDto(string Nombre, List<CartaProductoDto> Productos);
public record CartaDto(
    string Negocio, string Moneda, string ColorMarca, string? Logo, string Descripcion, string? Whatsapp,
    bool MostrarPrecios, bool PedidosWhatsapp, List<CartaCategoriaDto> Categorias);

// ---- ventas
public record VentaItemRequest(int ProductoId, int Cantidad);
public record PagoRequest(string Metodo, decimal Monto);
/// <summary>Los pagos deben sumar exactamente el total de la venta; con más de un pago es un pago mixto.</summary>
public record VentaCrearRequest(List<VentaItemRequest> Items, List<PagoRequest> Pagos, string? Nota, string? Etiqueta = null);
public record PagoDto(string Metodo, decimal Monto);
public record VentaItemDto(int ProductoId, string Nombre, decimal Precio, int Cantidad);
public record VentaDto(
    int Id, DateTimeOffset Fecha, string Metodo, List<PagoDto> Pagos, string Vendedor, string Nota, decimal Total, bool Anulada, List<VentaItemDto> Items,
    string Etiqueta, bool Entregado);
public record VentaAdminDto(
    int Id, DateTimeOffset Fecha, string Metodo, List<PagoDto> Pagos, string Vendedor, string Nota, decimal Total, decimal Costo, bool Anulada, List<VentaItemDto> Items,
    string Etiqueta, bool Entregado);
public record ResumenTurnoDto(int Cantidad, decimal Total, List<VentaDto> Ventas);

// ---- pedidos abiertos
public record PedidoItemDto(int ProductoId, string Nombre, decimal Precio, int Cantidad, bool Disponible);
/// <summary>DeMesa = lo pidió un cliente desde su mesa. Aviso = lo último que el personal le dijo (ej. «Sin stock: Gaseosa»).</summary>
public record PedidoDto(int Id, int Numero, string Etiqueta, string Nota, DateTimeOffset Creado, string Mesero, string Estado, decimal Total, List<PedidoItemDto> Items,
    bool DeMesa = false, string Aviso = "", string Cliente = "");
public record PedidoGuardarRequest(string? Etiqueta, string? Nota, List<VentaItemRequest> Items);
public record CobrarPedidoRequest(List<PagoRequest> Pagos, string? Nota);
public record RechazarPedidoRequest(string? Motivo);
public record AgotadoRequest(bool Agotado);

// ---- mesas y pedidos que hacen los clientes desde su mesa (QR)
/// <summary>El Token es el secreto del enlace del QR: solo lo ve quien administra las mesas.</summary>
public record MesaDto(int Id, string Nombre, bool Activa, string Token);
public record MesaGuardarDto(string Nombre, bool Activa = true);
public record PedidoMesaItemDto(int ProductoId, string Nombre, decimal Precio, int Cantidad);
/// <summary>Lo que ve el cliente de su propio pedido. Estado: PorConfirmar, Abierto (aceptado), Cobrado o Cancelado.</summary>
public record PedidoMesaDto(int Id, int Numero, string Estado, string Nota, string Aviso, DateTimeOffset Creado, decimal Total, List<PedidoMesaItemDto> Items, string Nombre = "");
/// <summary>Estado: Entrar (falta escribir el nombre para entrar), Pendiente (espera que el personal lo deje entrar), Rechazada o Activa (ya puede pedir).</summary>
public record MesaCartaDto(string Mesa, string Estado, CartaDto? Carta, List<PedidoMesaDto> Pedidos, string? Mensaje = null);
public record EntrarMesaRequest(string? Nombre);
/// <summary>Quién espera que lo dejen entrar a una mesa.</summary>
public record SolicitudIngresoDto(int Id, string Nombre, DateTimeOffset Creado);
/// <summary>Lo que ve el personal de cada mesa: si está abierta, hasta cuándo se entra solo, los celulares adentro, los pedidos por aceptar y quién espera entrar.</summary>
public record MesaServicioDto(int Id, string Nombre, bool Activa, bool Abierta, DateTimeOffset? Desde, DateTimeOffset? IngresoHasta, int Clientes, int Pendientes, List<SolicitudIngresoDto> Solicitudes);
/// <summary>El nombre es obligatorio: el personal necesita saber quién pidió.</summary>
public record PedidoMesaRequest(string? Nota, List<VentaItemRequest> Items, string? Nombre = null);

// ---- gastos
public record GastoDto(int Id, DateTimeOffset Fecha, string Concepto, string Categoria, decimal Monto);
public record GastoGuardarDto(DateTimeOffset Fecha, string Concepto, string Categoria, decimal Monto);

// ---- reportes
public record TopProductoDto(string Nombre, int Cantidad, decimal Total, decimal Ganancia);
public record VentaDiaDto(DateTimeOffset Dia, decimal Total);
public record ResumenDto(
    decimal Ventas, decimal Costo, decimal Gastos, int Pedidos, int CantGastos,
    decimal Efectivo, decimal Qr, decimal Tarjeta,
    List<TopProductoDto> Top, List<VentaDiaDto> PorDia);

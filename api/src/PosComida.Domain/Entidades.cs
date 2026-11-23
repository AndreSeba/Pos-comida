namespace PosComida.Domain;

/// <summary>PorConfirmar = lo pidió un cliente desde la mesa (QR) y el personal todavía no lo aceptó; no se puede cobrar hasta confirmarlo.</summary>
/// Unido = el pedido de un cliente se sumó a la cuenta que su mesa ya tenía abierta (se cobra todo junto en esa cuenta).
public enum EstadoPedido { Abierto = 1, Cobrado = 2, Cancelado = 3, PorConfirmar = 4, Unido = 5 }

/// <summary>Unidad en la que se guardan las cantidades de un ingrediente (todo se calcula en unidad base).</summary>
public enum UnidadBase { G = 1, Ml = 2, U = 3 }

public enum MetodoPago { Efectivo = 1, Qr = 2, Tarjeta = 3 }

public class Usuario
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public int RolId { get; set; }
    public Rol? Rol { get; set; }
    public string PinHash { get; set; } = "";
    public bool Activo { get; set; } = true;
}

public class Configuracion
{
    public int Id { get; set; } = 1;
    public string Negocio { get; set; } = "Mi Negocio";
    public string Moneda { get; set; } = "Bs";
    /// <summary>Color de la marca del negocio (#RRGGBB). Es el color de acento de todos los dispositivos, salvo que uno elija otro.</summary>
    public string ColorMarca { get; set; } = "#D9481C";
    /// <summary>Logo como data URL (png, jpeg o webp) ya reducido en el navegador; null = sin logo.</summary>
    public string? Logo { get; set; }
    /// <summary>Frase corta que se ve en la carta pública.</summary>
    public string Descripcion { get; set; } = "";
    /// <summary>WhatsApp del negocio con código de país (591 + 8 dígitos); a este número llegan los pedidos de la carta.</summary>
    public string? Whatsapp { get; set; }
    public bool CartaPublicada { get; set; }
    public bool MostrarPrecios { get; set; } = true;
    public bool PedidosWhatsapp { get; set; } = true;
    /// <summary>Permite dejar pedidos abiertos (por mesa o nombre), agregarles cosas y cobrarlos al final.</summary>
    public bool PedidosAbiertos { get; set; }
    /// <summary>Las ventas quedan "por entregar" hasta que alguien las marca como entregadas.</summary>
    public bool SeguimientoEntrega { get; set; }
    /// <summary>false (lo normal) = el cliente escanea el QR de su mesa, escribe su nombre y ya puede pedir. true = además el personal tiene que dejarlo entrar (se usa si hay clientes que escanean desde fuera del local).</summary>
    public bool IngresoMesaConPermiso { get; set; }
    /// <summary>Orden en que se muestran las categorías (lista JSON de nombres). Vacío = alfabético; las que no estén en la lista van al final.</summary>
    public string OrdenCategorias { get; set; } = "";
}

public class Ingrediente
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public UnidadBase Unidad { get; set; }
    /// <summary>Cantidad que compras, en unidad base (ej. 1000 g).</summary>
    public decimal Cantidad { get; set; }
    /// <summary>Lo que pagas por esa cantidad.</summary>
    public decimal Precio { get; set; }
    /// <summary>Lo que debería haber, en unidad base. Se mueve con compras, ventas y ajustes. PUEDE ser negativo: si se vendió antes de registrar la compra, se corrige después.</summary>
    public decimal Stock { get; set; }
    /// <summary>Se avisa que hay que reponer cuando el stock baja de esta cantidad (0 = sin aviso).</summary>
    public decimal StockMinimo { get; set; }

    public decimal CostoUnitario => Cantidad > 0 ? Precio / Cantidad : 0;
}

public enum TipoMovimiento { Inicial = 1, Compra = 2, Venta = 3, AnulacionVenta = 4, Ajuste = 5, RestauracionVenta = 6 }

/// <summary>El historial (kardex) de un insumo: cada vez que su stock cambia queda una línea con lo que pasó y el saldo resultante.</summary>
public class MovimientoInsumo
{
    public int Id { get; set; }
    public int IngredienteId { get; set; }
    public DateTimeOffset Fecha { get; set; } = DateTimeOffset.UtcNow;
    public TipoMovimiento Tipo { get; set; }
    /// <summary>Con signo: + entra, − sale (en unidad base).</summary>
    public decimal Cantidad { get; set; }
    public decimal Saldo { get; set; }
    public string Nota { get; set; } = "";
    public int? UsuarioId { get; set; }
    public Usuario? Usuario { get; set; }
    public int? VentaId { get; set; }
    public int? CompraId { get; set; }
}

/// <summary>Una compra de insumos a un proveedor. Al registrarla, el stock de cada insumo sube.</summary>
public class Compra
{
    public int Id { get; set; }
    public DateTimeOffset Fecha { get; set; } = DateTimeOffset.UtcNow;
    public string Proveedor { get; set; } = "";
    public string Nota { get; set; } = "";
    public decimal Total { get; set; }
    public int UsuarioId { get; set; }
    public Usuario? Usuario { get; set; }
    public List<CompraItem> Items { get; set; } = [];
}

public class CompraItem
{
    public int Id { get; set; }
    public int CompraId { get; set; }
    public int IngredienteId { get; set; }
    public string Nombre { get; set; } = "";
    /// <summary>En unidad base del insumo.</summary>
    public decimal Cantidad { get; set; }
    /// <summary>Lo que se pagó por esa cantidad.</summary>
    public decimal Total { get; set; }
}

public class Producto
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string Categoria { get; set; } = "";
    /// <summary>Clave del icono (hamburguesa, papas, bebida…); el frontend la dibuja.</summary>
    public string Icono { get; set; } = "plato";
    /// <summary>Cuántas porciones salen de la receta.</summary>
    public int Porciones { get; set; } = 1;
    /// <summary>Otros costos por unidad: empaque, gas, etc.</summary>
    public decimal Otros { get; set; }
    public decimal MargenObjetivo { get; set; } = 65;
    public decimal Precio { get; set; }
    public bool Activo { get; set; } = true;
    /// <summary>Texto que acompaña al producto en la carta pública.</summary>
    public string Descripcion { get; set; } = "";
    /// <summary>Si aparece en la carta pública (aparte de Activo, que controla el panel de ventas).</summary>
    public bool EnCarta { get; set; } = true;
    /// <summary>Se acabó por hoy: los clientes no pueden pedirlo desde la mesa hasta que se vuelva a marcar disponible.</summary>
    public bool Agotado { get; set; }
    /// <summary>Posición dentro de su categoría en el panel de ventas y la carta (menor = primero).</summary>
    public int Orden { get; set; }
    public List<RecetaLinea> Receta { get; set; } = [];

    /// <summary>Costo por unidad que el dueño ya tiene anotado. Si está, manda sobre el calculado con la receta (que queda como sugerencia).</summary>
    public decimal? CostoManual { get; set; }

    /// <summary>Lo que cuesta hacer una unidad según la receta y los precios de compra actuales.</summary>
    public decimal CostoCalculado() =>
        Receta.Sum(l => l.Ingrediente is null ? 0 : l.Ingrediente.CostoUnitario * l.Cantidad) / Math.Max(1, Porciones) + Otros;

    /// <summary>El costo que se usa al vender: el manual si lo hay, si no el calculado.</summary>
    public decimal CostoActual() => CostoManual ?? CostoCalculado();
}

/// <summary>Imágenes de un producto (hasta 6). Van aparte para no cargar bytes al listar productos. La de Orden 0 es la portada.</summary>
public class ProductoImagen
{
    public int Id { get; set; }
    public int ProductoId { get; set; }
    public int Orden { get; set; }
    public string TipoMime { get; set; } = "";
    public byte[] Datos { get; set; } = [];
}

public class RecetaLinea
{
    public int Id { get; set; }
    public int ProductoId { get; set; }
    public int IngredienteId { get; set; }
    public Ingrediente? Ingrediente { get; set; }
    /// <summary>En la unidad base del ingrediente.</summary>
    public decimal Cantidad { get; set; }
}

public class Venta
{
    public int Id { get; set; }
    public DateTimeOffset Fecha { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>Una venta puede pagarse con varias formas de pago (pago mixto). La suma de los pagos es el total.</summary>
    public List<VentaPago> Pagos { get; set; } = [];
    /// <summary>Efectivo, Qr, Tarjeta o Mixto.</summary>
    public string MetodoTexto => Pagos.Count switch { 0 => "", 1 => Pagos[0].Metodo.ToString(), _ => "Mixto" };
    public int UsuarioId { get; set; }
    public Usuario? Usuario { get; set; }
    public string Nota { get; set; } = "";
    public decimal Total { get; set; }
    /// <summary>Costo de lo vendido, congelado al momento de la venta.</summary>
    public decimal Costo { get; set; }
    public bool Anulada { get; set; }
    /// <summary>Mesa, nombre del cliente… (opcional).</summary>
    public string Etiqueta { get; set; } = "";
    /// <summary>true = ya se entregó (o el negocio no hace seguimiento de entrega).</summary>
    public bool Entregado { get; set; } = true;
    public DateTimeOffset? FechaEntrega { get; set; }
    /// <summary>Pedido abierto del que salió esta venta, si lo hubo.</summary>
    public int? PedidoId { get; set; }
    public List<VentaItem> Items { get; set; } = [];
}

/// <summary>Un pedido que todavía no se cobró (cuenta abierta). Al cobrarlo se convierte en una venta.</summary>
public class Pedido
{
    public int Id { get; set; }
    /// <summary>Número corto del día (1, 2, 3…) para llamarlo en voz alta.</summary>
    public int Numero { get; set; }
    public string Etiqueta { get; set; } = "";
    public string Nota { get; set; } = "";
    public DateTimeOffset Creado { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>Quien lo tomó o lo confirmó. null = lo pidió un cliente desde la mesa y todavía nadie del personal lo aceptó.</summary>
    public int? UsuarioId { get; set; }
    public Usuario? Usuario { get; set; }
    public EstadoPedido Estado { get; set; } = EstadoPedido.Abierto;
    public int? VentaId { get; set; }
    /// <summary>Mesa desde donde lo pidió el cliente (null = lo tomó el personal).</summary>
    public int? MesaId { get; set; }
    public Mesa? Mesa { get; set; }
    /// <summary>Código anónimo del celular del cliente (para que solo vea y edite lo que pidió él).</summary>
    public string? ClienteId { get; set; }
    /// <summary>Nombre de quien pidió desde la mesa (varios, separados por coma, si se juntaron pedidos de la misma mesa).</summary>
    public string NombreCliente { get; set; } = "";
    /// <summary>La sesión de la mesa en la que se hizo este pedido (null = lo tomó el personal).</summary>
    public int? MesaSesionId { get; set; }
    /// <summary>Mensaje del personal al cliente (ej. «Sin stock: Gaseosa»).</summary>
    public string Aviso { get; set; } = "";
    public List<PedidoItem> Items { get; set; } = [];
}

/// <summary>
/// Una mesa con su código QR. El enlace del QR lleva un <see cref="Token"/> secreto e impredecible (no el número de mesa),
/// así nadie llega a otra mesa cambiando el enlace. Si el QR se filtra o se pierde, se genera un token nuevo y el anterior deja de servir.
/// </summary>
public class Mesa
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string Token { get; set; } = "";
    public bool Activa { get; set; } = true;
}

/// <summary>
/// El tiempo que una mesa está ocupada: empieza cuando el personal la abre (o acepta a un cliente que la pidió) y termina cuando pagan o el
/// personal la cierra. El QR de la mesa es fijo y se queda en el historial de quien lo escaneó, así que por sí solo no basta: para pedir hay que
/// haber entrado a la sesión. Se entra solo durante la <see cref="IngresoHasta"/> que abre el personal, o con el permiso del personal (una solicitud).
/// Al cerrarse la sesión todos los celulares dejan de poder pedir.
/// </summary>
public class MesaSesion
{
    public int Id { get; set; }
    public int MesaId { get; set; }
    public Mesa? Mesa { get; set; }
    public DateTimeOffset Inicio { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>null = la sesión sigue abierta.</summary>
    public DateTimeOffset? Fin { get; set; }
    /// <summary>Hasta cuándo quien escanee el QR entra solo. Pasado ese momento, cada celular nuevo tiene que pedir permiso al personal.</summary>
    public DateTimeOffset? IngresoHasta { get; set; }
    public int? AbiertaPorId { get; set; }
}

/// <summary>Un celular que ya entró a la sesión (solo estos pueden pedir) y el nombre con el que entró.</summary>
public class MesaSesionCliente
{
    public int MesaSesionId { get; set; }
    public string ClienteId { get; set; } = "";
    public string Nombre { get; set; } = "";
}

public enum EstadoSolicitud { Pendiente = 1, Aceptada = 2, Rechazada = 3 }

/// <summary>Un cliente escaneó el QR fuera de la ventana de ingreso (o con la mesa libre) y espera que el personal lo deje entrar.</summary>
public class MesaSolicitud
{
    public int Id { get; set; }
    public int MesaId { get; set; }
    public string ClienteId { get; set; } = "";
    public string Nombre { get; set; } = "";
    public DateTimeOffset Creado { get; set; } = DateTimeOffset.UtcNow;
    public EstadoSolicitud Estado { get; set; } = EstadoSolicitud.Pendiente;
    public DateTimeOffset? Resuelta { get; set; }
}

/// <summary>El precio no se guarda: un pedido abierto se cobra al precio de ese momento.</summary>
public class PedidoItem
{
    public int Id { get; set; }
    public int PedidoId { get; set; }
    public int ProductoId { get; set; }
    public string Nombre { get; set; } = "";
    public int Cantidad { get; set; }
}

public class VentaPago
{
    public int Id { get; set; }
    public int VentaId { get; set; }
    public MetodoPago Metodo { get; set; }
    /// <summary>Monto aplicado a la venta con este método (sin contar el vuelto).</summary>
    public decimal Monto { get; set; }
}

public class VentaItem
{
    public int Id { get; set; }
    public int VentaId { get; set; }
    public int ProductoId { get; set; }
    public string Nombre { get; set; } = "";
    public decimal Precio { get; set; }
    public decimal Costo { get; set; }
    public int Cantidad { get; set; }
}

public class Gasto
{
    public int Id { get; set; }
    public DateTimeOffset Fecha { get; set; } = DateTimeOffset.UtcNow;
    public string Concepto { get; set; } = "";
    public string Categoria { get; set; } = "Otros";
    public decimal Monto { get; set; }
}

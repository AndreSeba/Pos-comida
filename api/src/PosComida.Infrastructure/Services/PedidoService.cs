using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

public class PedidoService(PosDbContext db, IVentaService ventas, IAuditoriaService auditoria) : IPedidoService
{
    /// <summary>Bolivia no cambia de hora en el año: el "día" del número de pedido es el día local.</summary>
    private static readonly TimeSpan Bolivia = TimeSpan.FromHours(-4);

    private async Task ExigirActivoAsync(CancellationToken ct)
    {
        var activo = await db.Configuraciones.AsNoTracking().Select(c => c.PedidosAbiertos).FirstOrDefaultAsync(ct);
        if (!activo) throw new DominioException("Los pedidos abiertos no están activados. Actívalos en Ajustes.", 409);
    }

    /// <summary>Valida las líneas del pedido (productos activos, cantidades razonables) y las agrupa por producto.</summary>
    private async Task<List<(Producto Producto, int Cantidad)>> LeerLineasAsync(List<VentaItemRequest>? items, CancellationToken ct)
    {
        var pedido = (items ?? []).Where(i => i.Cantidad > 0).GroupBy(i => i.ProductoId)
            .Select(g => (ProductoId: g.Key, Cantidad: g.Sum(x => x.Cantidad))).ToList();
        if (pedido.Count == 0) throw new DominioException("El pedido está vacío");
        if (pedido.Any(p => p.Cantidad > 500)) throw new DominioException("Cantidad demasiado grande");
        var ids = pedido.Select(p => p.ProductoId).ToList();
        var productos = await db.Productos.AsNoTracking().Where(p => ids.Contains(p.Id) && p.Activo).ToDictionaryAsync(p => p.Id, ct);
        if (productos.Count != ids.Count) throw new DominioException("Hay productos que ya no están disponibles. Actualiza el menú.", 409);
        return pedido.Select(p => (productos[p.ProductoId], p.Cantidad)).ToList();
    }

    private static object Foto(Pedido p) => new { p.Numero, p.Etiqueta, p.Nota, Estado = p.Estado.ToString(), p.Aviso, Cliente = p.NombreCliente, Items = p.Items.Select(i => new { i.Nombre, i.Cantidad }) };

    private static string Limpiar(string? texto, int max)
    {
        var t = (texto ?? "").Trim();
        return t.Length > max ? t[..max] : t;
    }

    private async Task<List<PedidoDto>> MapearAsync(List<Pedido> pedidos, CancellationToken ct)
    {
        var ids = pedidos.SelectMany(p => p.Items).Select(i => i.ProductoId).Distinct().ToList();
        var actuales = await db.Productos.AsNoTracking().Where(p => ids.Contains(p.Id)).Select(p => new { p.Id, p.Precio, p.Activo }).ToDictionaryAsync(p => p.Id, ct);
        return pedidos.Select(p =>
        {
            var items = p.Items.Select(i =>
            {
                actuales.TryGetValue(i.ProductoId, out var a);
                return new PedidoItemDto(i.ProductoId, i.Nombre, a?.Precio ?? 0, i.Cantidad, a is { Activo: true });
            }).ToList();
            return new PedidoDto(p.Id, p.Numero, p.Etiqueta, p.Nota, p.Creado, p.Usuario?.Nombre ?? (p.MesaId is null ? "" : "Cliente"), p.Estado.ToString(),
                items.Where(i => i.Disponible).Sum(i => i.Precio * i.Cantidad), items, p.MesaId is not null, p.Aviso, p.NombreCliente);
        }).ToList();
    }

    public async Task<List<PedidoDto>> ListarAbiertosAsync(CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        var lista = await db.Pedidos.AsNoTracking().Include(p => p.Items).Include(p => p.Usuario)
            .Where(p => p.Estado == EstadoPedido.Abierto || p.Estado == EstadoPedido.PorConfirmar).OrderBy(p => p.Creado).Take(200).ToListAsync(ct);
        return await MapearAsync(lista, ct);
    }

    public async Task<PedidoDto> CrearAsync(int usuarioId, PedidoGuardarRequest req, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        var lineas = await LeerLineasAsync(req.Items, ct);

        var inicioDia = new DateTimeOffset((DateTimeOffset.UtcNow + Bolivia).Date, Bolivia).ToUniversalTime();
        var ultimo = await db.Pedidos.Where(p => p.Creado >= inicioDia).MaxAsync(p => (int?)p.Numero, ct) ?? 0;

        var pedido = new Pedido
        {
            Numero = ultimo + 1, UsuarioId = usuarioId, Etiqueta = Limpiar(req.Etiqueta, 40), Nota = Limpiar(req.Nota, 200),
            Items = lineas.Select(l => new PedidoItem { ProductoId = l.Producto.Id, Nombre = l.Producto.Nombre, Cantidad = l.Cantidad }).ToList(),
        };
        db.Pedidos.Add(pedido);
        await db.SaveChangesAsync(ct);
        await db.Entry(pedido).Reference(p => p.Usuario).LoadAsync(ct);
        await auditoria.RegistrarAsync("Pedido", pedido.Id.ToString(), "Crear", null, auditoria.Capturar(Foto(pedido)), ct: ct);
        return (await MapearAsync([pedido], ct))[0];
    }

    public async Task<PedidoDto> ActualizarAsync(int id, PedidoGuardarRequest req, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        var lineas = await LeerLineasAsync(req.Items, ct);
        var pedido = await db.Pedidos.Include(p => p.Items).Include(p => p.Usuario).FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new DominioException("Pedido no encontrado", 404);
        if (pedido.Estado is not (EstadoPedido.Abierto or EstadoPedido.PorConfirmar)) throw new DominioException("Este pedido ya fue cobrado o cancelado.", 409);

        var antes = auditoria.Capturar(Foto(pedido));
        pedido.Etiqueta = Limpiar(req.Etiqueta, 40);
        pedido.Nota = Limpiar(req.Nota, 200);
        db.PedidoItems.RemoveRange(pedido.Items);
        pedido.Items = lineas.Select(l => new PedidoItem { ProductoId = l.Producto.Id, Nombre = l.Producto.Nombre, Cantidad = l.Cantidad }).ToList();
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Pedido", pedido.Id.ToString(), "Actualizar", antes, auditoria.Capturar(Foto(pedido)), ct: ct);
        return (await MapearAsync([pedido], ct))[0];
    }

    public async Task CancelarAsync(int id, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        var filas = await db.Pedidos.Where(p => p.Id == id && (p.Estado == EstadoPedido.Abierto || p.Estado == EstadoPedido.PorConfirmar))
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Estado, EstadoPedido.Cancelado), ct);
        if (filas == 0)
        {
            if (!await db.Pedidos.AnyAsync(p => p.Id == id, ct)) throw new DominioException("Pedido no encontrado", 404);
            throw new DominioException("Este pedido ya fue cobrado o cancelado.", 409);
        }
        await auditoria.RegistrarAsync("Pedido", id.ToString(), "Cancelar", auditoria.Capturar(new { Estado = "Abierto" }), auditoria.Capturar(new { Estado = "Cancelado" }), ct: ct);
    }

    /// <summary>
    /// Cobra el pedido: lo marca como cobrado y crea la venta, todo en una transacción. El cambio de estado se hace primero y de forma
    /// atómica, así dos cajas que cobren el mismo pedido a la vez no lo cobran dos veces (la segunda recibe 409).
    /// </summary>
    public async Task<VentaDto> CobrarAsync(int id, int usuarioId, CobrarPedidoRequest req, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        if (await db.Pedidos.AnyAsync(p => p.Id == id && p.Estado == EstadoPedido.PorConfirmar, ct))
            throw new DominioException("Este pedido lo hizo un cliente desde la mesa: confírmalo antes de cobrarlo.", 409);
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var filas = await db.Pedidos.Where(p => p.Id == id && p.Estado == EstadoPedido.Abierto)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Estado, EstadoPedido.Cobrado), ct);
        if (filas == 0)
        {
            if (!await db.Pedidos.AnyAsync(p => p.Id == id, ct)) throw new DominioException("Pedido no encontrado", 404);
            throw new DominioException("Este pedido ya fue cobrado o cancelado.", 409);
        }

        var pedido = await db.Pedidos.AsNoTracking().Include(p => p.Items).FirstAsync(p => p.Id == id, ct);
        var items = pedido.Items.Select(i => new VentaItemRequest(i.ProductoId, i.Cantidad)).ToList();
        var nota = string.Join(" · ", new[] { pedido.Nota, req.Nota?.Trim() }.Where(t => !string.IsNullOrEmpty(t)));
        var venta = await ventas.CrearDesdePedidoAsync(usuarioId, new VentaCrearRequest(items, req.Pagos, nota, pedido.Etiqueta), id, ct);

        await db.Pedidos.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.VentaId, venta.Id), ct);
        // al pagar la cuenta de una mesa y no quedar nada abierto, termina su sesión: el QR del cliente ya no deja pedir
        if (pedido.MesaId is { } mesaId && !await db.Pedidos.AnyAsync(p => p.MesaId == mesaId && p.Id != id && (p.Estado == EstadoPedido.Abierto || p.Estado == EstadoPedido.PorConfirmar), ct))
            await Sesiones.CerrarAsync(db, mesaId, "Gracias por tu visita. Tu mesa se cerró.", ct);
        await tx.CommitAsync(ct);
        return venta;
    }

    /// <summary>
    /// Acepta un pedido hecho por un cliente desde la mesa. El cambio de estado es atómico (dos personas del personal no lo aceptan dos veces).
    /// Si la mesa ya tenía una cuenta abierta, los productos se suman a esa cuenta para cobrar todo junto.
    /// </summary>
    public async Task<PedidoDto> ConfirmarAsync(int id, int usuarioId, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var filas = await db.Pedidos.Where(p => p.Id == id && p.Estado == EstadoPedido.PorConfirmar)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Estado, EstadoPedido.Abierto).SetProperty(p => p.UsuarioId, usuarioId), ct);
        if (filas == 0)
        {
            if (!await db.Pedidos.AnyAsync(p => p.Id == id, ct)) throw new DominioException("Pedido no encontrado", 404);
            throw new DominioException("Este pedido ya fue aceptado, rechazado o cancelado.", 409);
        }

        var pedido = await db.Pedidos.Include(p => p.Items).Include(p => p.Usuario).FirstAsync(p => p.Id == id, ct);
        var resultado = pedido;
        if (pedido.MesaId is { } mesaId)
        {
            var principal = await db.Pedidos.Include(p => p.Items).Include(p => p.Usuario)
                .Where(p => p.MesaId == mesaId && p.Estado == EstadoPedido.Abierto && p.Id != pedido.Id).OrderBy(p => p.Creado).FirstOrDefaultAsync(ct);
            if (principal is not null)
            {
                var antesPrincipal = auditoria.Capturar(Foto(principal));
                foreach (var it in pedido.Items)
                {
                    var existente = principal.Items.FirstOrDefault(x => x.ProductoId == it.ProductoId);
                    if (existente is not null) existente.Cantidad = Math.Min(500, existente.Cantidad + it.Cantidad);
                    else principal.Items.Add(new PedidoItem { ProductoId = it.ProductoId, Nombre = it.Nombre, Cantidad = it.Cantidad });
                }
                // en la cuenta de la mesa quedan los nombres de todos los que pidieron
                var nombres = principal.NombreCliente.Split(", ", StringSplitOptions.RemoveEmptyEntries).ToList();
                foreach (var n in pedido.NombreCliente.Split(", ", StringSplitOptions.RemoveEmptyEntries))
                    if (!nombres.Contains(n, StringComparer.OrdinalIgnoreCase)) nombres.Add(n);
                principal.NombreCliente = Limpiar(string.Join(", ", nombres), 120);
                pedido.Estado = EstadoPedido.Unido;
                pedido.Aviso = Limpiar($"Se sumó a la cuenta #{principal.Numero} de tu mesa", 200);
                await db.SaveChangesAsync(ct);
                await auditoria.RegistrarAsync("Pedido", principal.Id.ToString(), "Actualizar", antesPrincipal, auditoria.Capturar(Foto(principal)), $"Se unió el pedido #{pedido.Numero} de la mesa", ct: ct);
                resultado = principal;
            }
        }
        await auditoria.RegistrarAsync("Pedido", pedido.Id.ToString(), "Confirmar", auditoria.Capturar(new { Estado = "PorConfirmar" }), auditoria.Capturar(Foto(pedido)), ct: ct);
        await tx.CommitAsync(ct);
        return (await MapearAsync([resultado], ct))[0];
    }

    public async Task RechazarAsync(int id, string? motivo, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        var aviso = Limpiar(motivo, 200);
        if (aviso.Length == 0) aviso = "El local no pudo aceptar tu pedido. Pide ayuda al personal.";
        var filas = await db.Pedidos.Where(p => p.Id == id && p.Estado == EstadoPedido.PorConfirmar)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Estado, EstadoPedido.Cancelado).SetProperty(p => p.Aviso, aviso), ct);
        if (filas == 0)
        {
            if (!await db.Pedidos.AnyAsync(p => p.Id == id, ct)) throw new DominioException("Pedido no encontrado", 404);
            throw new DominioException("Este pedido ya fue aceptado, rechazado o cancelado.", 409);
        }
        await auditoria.RegistrarAsync("Pedido", id.ToString(), "Rechazar", auditoria.Capturar(new { Estado = "PorConfirmar" }), auditoria.Capturar(new { Estado = "Cancelado", Aviso = aviso }), aviso, ct: ct);
    }

    /// <summary>
    /// «No hay»: quita el producto de este pedido, lo marca agotado (así nadie más lo pide desde la mesa) y deja un aviso para el cliente.
    /// Si el pedido se queda sin productos, se cancela.
    /// </summary>
    public async Task<PedidoDto> SinStockAsync(int pedidoId, int productoId, CancellationToken ct)
    {
        await ExigirActivoAsync(ct);
        var pedido = await db.Pedidos.Include(p => p.Items).Include(p => p.Usuario).FirstOrDefaultAsync(p => p.Id == pedidoId, ct)
            ?? throw new DominioException("Pedido no encontrado", 404);
        if (pedido.Estado is not (EstadoPedido.Abierto or EstadoPedido.PorConfirmar)) throw new DominioException("Este pedido ya fue cobrado o cancelado.", 409);
        var item = pedido.Items.FirstOrDefault(i => i.ProductoId == productoId)
            ?? throw new DominioException("Ese producto no está en el pedido.", 404);

        var antes = auditoria.Capturar(Foto(pedido));
        pedido.Items.Remove(item);
        db.PedidoItems.Remove(item);
        await db.Productos.Where(p => p.Id == productoId).ExecuteUpdateAsync(s => s.SetProperty(p => p.Agotado, true), ct);

        var nombres = pedido.Aviso.StartsWith("Sin stock: ", StringComparison.Ordinal) ? pedido.Aviso["Sin stock: ".Length..].Split(", ").ToList() : [];
        if (!nombres.Contains(item.Nombre)) nombres.Add(item.Nombre);
        pedido.Aviso = Limpiar("Sin stock: " + string.Join(", ", nombres), 200);
        if (pedido.Items.Count == 0) pedido.Estado = EstadoPedido.Cancelado;

        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Pedido", pedido.Id.ToString(), "Actualizar", antes, auditoria.Capturar(Foto(pedido)), $"Sin stock: {item.Nombre}", ct: ct);
        await auditoria.RegistrarAsync("Producto", productoId.ToString(), "Agotar", auditoria.Capturar(new { Agotado = false }), auditoria.Capturar(new { Agotado = true }), "Sin stock desde un pedido", ct: ct);
        return (await MapearAsync([pedido], ct))[0];
    }

    public async Task MarcarAgotadoAsync(int productoId, bool agotado, CancellationToken ct)
    {
        var anterior = await db.Productos.Where(p => p.Id == productoId).Select(p => (bool?)p.Agotado).FirstOrDefaultAsync(ct)
            ?? throw new DominioException("Producto no encontrado", 404);
        if (anterior == agotado) return;
        await db.Productos.Where(p => p.Id == productoId).ExecuteUpdateAsync(s => s.SetProperty(p => p.Agotado, agotado), ct);
        await auditoria.RegistrarAsync("Producto", productoId.ToString(), agotado ? "Agotar" : "Reponer", auditoria.Capturar(new { Agotado = anterior }), auditoria.Capturar(new { Agotado = agotado }), ct: ct);
    }
}

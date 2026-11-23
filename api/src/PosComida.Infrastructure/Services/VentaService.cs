using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

public class VentaService(PosDbContext db, IAuditoriaService auditoria) : IVentaService
{
    private static List<PagoDto> Pagos(Venta v) => v.Pagos.Select(p => new PagoDto(p.Metodo.ToString(), p.Monto)).ToList();

    private static VentaDto Mapear(Venta v) => new(
        v.Id, v.Fecha, v.MetodoTexto, Pagos(v), v.Usuario?.Nombre ?? "", v.Nota, v.Total, v.Anulada,
        v.Items.Select(i => new VentaItemDto(i.ProductoId, i.Nombre, i.Precio, i.Cantidad)).ToList(), v.Etiqueta, v.Entregado);

    public Task<VentaDto> CrearAsync(int usuarioId, VentaCrearRequest req, CancellationToken ct) => CrearNucleoAsync(usuarioId, req, null, ct);

    public Task<VentaDto> CrearDesdePedidoAsync(int usuarioId, VentaCrearRequest req, int pedidoId, CancellationToken ct) => CrearNucleoAsync(usuarioId, req, pedidoId, ct);

    private async Task<VentaDto> CrearNucleoAsync(int usuarioId, VentaCrearRequest req, int? pedidoId, CancellationToken ct)
    {
        var pedido = (req.Items ?? []).Where(i => i.Cantidad > 0).GroupBy(i => i.ProductoId)
            .Select(g => (ProductoId: g.Key, Cantidad: g.Sum(x => x.Cantidad))).ToList();
        if (pedido.Count == 0) throw new DominioException("El pedido está vacío");
        if (pedido.Any(p => p.Cantidad > 500)) throw new DominioException("Cantidad demasiado grande");
        var pagos = LeerPagos(req.Pagos);

        // el precio y el costo salen SIEMPRE del servidor, nunca del cliente
        var ids = pedido.Select(p => p.ProductoId).ToList();
        var productos = await db.Productos.Include(p => p.Receta).ThenInclude(l => l.Ingrediente)
            .Where(p => ids.Contains(p.Id) && p.Activo).ToDictionaryAsync(p => p.Id, ct);
        if (productos.Count != ids.Count) throw new DominioException("Hay productos que ya no están disponibles. Actualiza el menú.", 409);

        var nota = (req.Nota ?? "").Trim();
        var etiqueta = (req.Etiqueta ?? "").Trim();
        // si el negocio hace seguimiento de entrega, la venta queda "por entregar" hasta que alguien la marque
        var seguimiento = await db.Configuraciones.AsNoTracking().Select(c => c.SeguimientoEntrega).FirstOrDefaultAsync(ct);
        var venta = new Venta
        {
            Fecha = DateTimeOffset.UtcNow,
            UsuarioId = usuarioId,
            PedidoId = pedidoId,
            Nota = nota.Length > 200 ? nota[..200] : nota,
            Etiqueta = etiqueta.Length > 40 ? etiqueta[..40] : etiqueta,
            Entregado = !seguimiento,
        };
        foreach (var (productoId, cantidad) in pedido)
        {
            var p = productos[productoId];
            venta.Items.Add(new VentaItem
            {
                ProductoId = p.Id, Nombre = p.Nombre, Precio = p.Precio, Costo = Math.Round(p.CostoActual(), 4), Cantidad = cantidad,
            });
        }
        venta.Total = venta.Items.Sum(i => i.Precio * i.Cantidad);
        venta.Costo = venta.Items.Sum(i => i.Costo * i.Cantidad);

        // los pagos deben cubrir el total exacto (el vuelto del efectivo se calcula en el dispositivo y no se guarda)
        if (Math.Abs(pagos.Sum(p => p.Monto) - venta.Total) > 0.005m)
            throw new DominioException($"Los pagos suman {pagos.Sum(p => p.Monto):0.00} y el total es {venta.Total:0.00}. Deben coincidir.");
        venta.Pagos = pagos;

        // la venta y el descuento de insumos van juntos: o pasan los dos o no pasa ninguno (si ya hay una transacción afuera, se une a ella)
        await using var tx = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        db.Ventas.Add(venta);
        await db.SaveChangesAsync(ct);

        // cada producto vendido descuenta lo que lleva su receta (por porción). El stock puede quedar negativo: se corrige luego con una compra o un ajuste.
        var consumo = new Dictionary<int, decimal>();
        foreach (var (productoId, cantidad) in pedido)
        {
            var prod = productos[productoId];
            var porciones = Math.Max(1, prod.Porciones);
            foreach (var l in prod.Receta)
                consumo[l.IngredienteId] = consumo.GetValueOrDefault(l.IngredienteId) + l.Cantidad / porciones * cantidad;
        }
        foreach (var (ingredienteId, cantidad) in consumo)
            await InventarioMotor.MoverAsync(db, ingredienteId, -Math.Round(cantidad, 3), TipoMovimiento.Venta, usuarioId, "", venta.Id, null, ct);
        await db.SaveChangesAsync(ct);
        if (tx is not null) await tx.CommitAsync(ct);
        await auditoria.RegistrarAsync("Venta", venta.Id.ToString(), pedidoId is null ? "Crear" : "Cobrar pedido", null,
            auditoria.Capturar(new
            {
                venta.Total, venta.Costo, venta.Etiqueta, venta.Nota, PedidoId = pedidoId,
                Pagos = venta.Pagos.Select(p => new { Metodo = p.Metodo.ToString(), p.Monto }),
                Items = venta.Items.Select(i => new { i.Nombre, i.Cantidad, i.Precio }),
            }), ct: ct);

        await db.Entry(venta).Reference(v => v.Usuario).LoadAsync(ct);
        return Mapear(venta);
    }

    /// <summary>Valida y agrupa los pagos por método (dos montos de efectivo se suman en uno).</summary>
    private static List<VentaPago> LeerPagos(List<PagoRequest>? pagos)
    {
        if (pagos is null || pagos.Count == 0) throw new DominioException("Indica cómo se paga la venta");
        if (pagos.Count > 3) throw new DominioException("Demasiadas formas de pago");
        var lista = new List<VentaPago>();
        foreach (var g in pagos.GroupBy(p => (p.Metodo ?? "").Trim().ToLowerInvariant()))
        {
            if (!Enum.TryParse<MetodoPago>(g.Key, true, out var metodo)) throw new DominioException("Método de pago inválido");
            var monto = Math.Round(g.Sum(p => p.Monto), 2);
            if (monto <= 0) throw new DominioException("Cada forma de pago debe tener un monto mayor que 0");
            lista.Add(new VentaPago { Metodo = metodo, Monto = monto });
        }
        return lista;
    }

    public async Task<ResumenTurnoDto> TurnoAsync(int usuarioId, DateTimeOffset desde, CancellationToken ct)
    {
        var lista = await db.Ventas.AsNoTracking().Include(v => v.Items).Include(v => v.Pagos).Include(v => v.Usuario)
            .Where(v => v.UsuarioId == usuarioId && !v.Anulada && v.Fecha >= desde)
            .OrderByDescending(v => v.Fecha).ToListAsync(ct);
        return new ResumenTurnoDto(lista.Count, lista.Sum(v => v.Total), lista.Take(15).Select(Mapear).ToList());
    }

    public async Task<List<VentaAdminDto>> ListarAsync(DateTimeOffset? desde, DateTimeOffset? hasta, int limite, CancellationToken ct)
    {
        var q = db.Ventas.AsNoTracking().Include(v => v.Items).Include(v => v.Pagos).Include(v => v.Usuario).AsQueryable();
        if (desde is not null) q = q.Where(v => v.Fecha >= desde);
        if (hasta is not null) q = q.Where(v => v.Fecha < hasta);
        var lista = await q.OrderByDescending(v => v.Fecha).Take(Math.Clamp(limite, 1, 500)).ToListAsync(ct);
        return lista.Select(v => new VentaAdminDto(
            v.Id, v.Fecha, v.MetodoTexto, Pagos(v), v.Usuario?.Nombre ?? "", v.Nota, v.Total, v.Costo, v.Anulada,
            v.Items.Select(i => new VentaItemDto(i.ProductoId, i.Nombre, i.Precio, i.Cantidad)).ToList(), v.Etiqueta, v.Entregado)).ToList();
    }

    public async Task AnularAsync(int id, bool anulada, CancellationToken ct)
    {
        var v = await db.Ventas.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Venta no encontrada", 404);
        if (v.Anulada == anulada) return;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        v.Anulada = anulada;
        // anular devuelve los insumos que la venta había descontado; restaurarla los vuelve a descontar
        var consumo = await db.MovimientosInsumo.Where(m => m.VentaId == id && m.Tipo == TipoMovimiento.Venta)
            .GroupBy(m => m.IngredienteId).Select(g => new { Id = g.Key, Total = g.Sum(m => m.Cantidad) }).ToListAsync(ct);
        foreach (var c in consumo)
            await InventarioMotor.MoverAsync(db, c.Id, anulada ? -c.Total : c.Total, anulada ? TipoMovimiento.AnulacionVenta : TipoMovimiento.RestauracionVenta, null,
                anulada ? "Venta anulada" : "Venta restaurada", id, null, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await auditoria.RegistrarAsync("Venta", id.ToString(), anulada ? "Anular" : "Restaurar", auditoria.Capturar(new { Anulada = !anulada, v.Total }), auditoria.Capturar(new { Anulada = anulada, v.Total }), ct: ct);
    }

    public async Task<List<VentaDto>> PorEntregarAsync(CancellationToken ct)
    {
        var lista = await db.Ventas.AsNoTracking().Include(v => v.Items).Include(v => v.Pagos).Include(v => v.Usuario)
            .Where(v => !v.Anulada && !v.Entregado).OrderBy(v => v.Fecha).Take(100).ToListAsync(ct);
        return lista.Select(Mapear).ToList();
    }

    public async Task MarcarEntregadaAsync(int id, CancellationToken ct)
    {
        var v = await db.Ventas.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Venta no encontrada", 404);
        if (v.Anulada) throw new DominioException("Esa venta está anulada.", 409);
        if (v.Entregado) return;
        v.Entregado = true;
        v.FechaEntrega = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Venta", id.ToString(), "Entregar", auditoria.Capturar(new { Entregado = false }), auditoria.Capturar(new { Entregado = true }), ct: ct);
    }
}

public class GastoService(PosDbContext db, IAuditoriaService auditoria) : IGastoService
{
    private static GastoDto Mapear(Gasto g) => new(g.Id, g.Fecha, g.Concepto, g.Categoria, g.Monto);

    public async Task<List<GastoDto>> ListarAsync(DateTimeOffset? desde, DateTimeOffset? hasta, CancellationToken ct)
    {
        var q = db.Gastos.AsNoTracking().AsQueryable();
        if (desde is not null) q = q.Where(g => g.Fecha >= desde);
        if (hasta is not null) q = q.Where(g => g.Fecha < hasta);
        return await q.OrderByDescending(g => g.Fecha).ThenByDescending(g => g.Id).Take(500).Select(g => Mapear(g)).ToListAsync(ct);
    }

    public async Task<GastoDto> CrearAsync(GastoGuardarDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Concepto)) throw new DominioException("Escribe en qué gastaste");
        if (dto.Monto <= 0) throw new DominioException("El monto debe ser mayor que 0");
        var g = new Gasto
        {
            Fecha = dto.Fecha.ToUniversalTime(), Concepto = dto.Concepto.Trim(),
            Categoria = string.IsNullOrWhiteSpace(dto.Categoria) ? "Otros" : dto.Categoria.Trim(), Monto = dto.Monto,
        };
        db.Gastos.Add(g);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Gasto", g.Id.ToString(), "Crear", null, auditoria.Capturar(new { g.Concepto, g.Categoria, g.Monto, g.Fecha }), ct: ct);
        return Mapear(g);
    }

    public async Task BorrarAsync(int id, CancellationToken ct)
    {
        var g = await db.Gastos.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Gasto no encontrado", 404);
        var foto = auditoria.Capturar(new { g.Concepto, g.Categoria, g.Monto, g.Fecha });
        db.Gastos.Remove(g);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Gasto", id.ToString(), "Borrar", foto, null, ct: ct);
    }
}

public class ReporteService(PosDbContext db) : IReporteService
{
    public async Task<ResumenDto> ResumenAsync(DateTimeOffset desde, DateTimeOffset hasta, int offsetMinutos, CancellationToken ct)
    {
        var ventas = await db.Ventas.AsNoTracking().Include(v => v.Items).Include(v => v.Pagos)
            .Where(v => !v.Anulada && v.Fecha >= desde && v.Fecha < hasta).ToListAsync(ct);
        var gastos = await db.Gastos.AsNoTracking().Where(g => g.Fecha >= desde && g.Fecha < hasta).ToListAsync(ct);

        // un pago mixto reparte su monto entre las formas de pago que usó
        decimal PorMetodo(MetodoPago m) => ventas.SelectMany(v => v.Pagos).Where(p => p.Metodo == m).Sum(p => p.Monto);

        var top = ventas.SelectMany(v => v.Items).GroupBy(i => i.ProductoId)
            .Select(g => new TopProductoDto(
                g.First().Nombre, g.Sum(i => i.Cantidad), g.Sum(i => i.Precio * i.Cantidad), g.Sum(i => (i.Precio - i.Costo) * i.Cantidad)))
            .OrderByDescending(t => t.Cantidad).Take(6).ToList();

        // agrupa por día LOCAL del cliente (offsetMinutos = minutos que el cliente va por delante/detrás de UTC)
        var offset = TimeSpan.FromMinutes(offsetMinutos);
        var porDia = ventas.GroupBy(v => (v.Fecha + offset).Date)
            .OrderBy(g => g.Key)
            .Select(g => new VentaDiaDto(new DateTimeOffset(g.Key, TimeSpan.Zero), g.Sum(v => v.Total))).ToList();

        return new ResumenDto(
            ventas.Sum(v => v.Total), ventas.Sum(v => v.Costo), gastos.Sum(g => g.Monto), ventas.Count, gastos.Count,
            PorMetodo(MetodoPago.Efectivo), PorMetodo(MetodoPago.Qr), PorMetodo(MetodoPago.Tarjeta), top, porDia);
    }
}

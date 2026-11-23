using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

public class InventarioService(PosDbContext db, IAuditoriaService auditoria) : IInventarioService
{
    private static IngredienteDto Mapear(Ingrediente i) =>
        new(i.Id, i.Nombre, i.Unidad.ToString().ToLowerInvariant(), i.Cantidad, i.Precio, i.Stock, i.StockMinimo);

    private static CompraDto Mapear(Compra c) => new(
        c.Id, c.Fecha, c.Proveedor, c.Nota, c.Total, c.Usuario?.Nombre ?? "",
        c.Items.Select(i => new CompraItemDto(i.IngredienteId, i.Nombre, i.Cantidad, i.Total)).ToList());

    public async Task<List<MovimientoDto>> MovimientosAsync(int? ingredienteId, int limite, CancellationToken ct)
    {
        var q = db.MovimientosInsumo.AsNoTracking().Include(m => m.Usuario).AsQueryable();
        if (ingredienteId is not null) q = q.Where(m => m.IngredienteId == ingredienteId);
        var lista = await q.OrderByDescending(m => m.Fecha).ThenByDescending(m => m.Id).Take(Math.Clamp(limite, 1, 500)).ToListAsync(ct);
        return lista.Select(m => new MovimientoDto(m.Id, m.Fecha, m.Tipo.ToString(), m.Cantidad, m.Saldo, m.Nota, m.Usuario?.Nombre, m.VentaId, m.CompraId)).ToList();
    }

    /// <summary>Conteo físico: se dice cuánto hay de verdad y el sistema anota la diferencia. Sirve para corregir cuando no dio tiempo de registrar algo.</summary>
    public async Task<IngredienteDto> AjustarAsync(int usuarioId, AjusteRequest req, CancellationToken ct)
    {
        var i = await db.Ingredientes.FirstOrDefaultAsync(x => x.Id == req.IngredienteId, ct) ?? throw new DominioException("Insumo no encontrado", 404);
        var stockAntes = i.Stock;
        var delta = Math.Round(req.StockReal, 3) - i.Stock;
        if (delta == 0) return Mapear(i);
        var motivo = (req.Motivo ?? "").Trim();
        await InventarioMotor.MoverAsync(db, i.Id, delta, TipoMovimiento.Ajuste, usuarioId, motivo.Length == 0 ? "Ajuste de inventario" : motivo, null, null, ct);
        await db.SaveChangesAsync(ct);
        await db.Entry(i).ReloadAsync(ct);
        await auditoria.RegistrarAsync("Insumo", i.Id.ToString(), "Ajuste", auditoria.Capturar(new { i.Nombre, Stock = stockAntes }), auditoria.Capturar(new { i.Nombre, i.Stock }), motivo, ct: ct);
        return Mapear(i);
    }

    public async Task<CompraDto> RegistrarCompraAsync(int usuarioId, CompraRequest req, CancellationToken ct)
    {
        var items = req.Items ?? [];
        if (items.Count == 0) throw new DominioException("Agrega al menos un insumo a la compra");
        if (items.Count > 50) throw new DominioException("Demasiados insumos en una sola compra");
        if (items.Any(i => i.Cantidad <= 0)) throw new DominioException("Cada insumo necesita una cantidad mayor que 0");
        if (items.Any(i => i.Total < 0)) throw new DominioException("El total pagado no puede ser negativo");
        if (items.GroupBy(i => i.IngredienteId).Any(g => g.Count() > 1)) throw new DominioException("Hay un insumo repetido en la compra");

        var ids = items.Select(i => i.IngredienteId).ToList();
        var insumos = await db.Ingredientes.Where(i => ids.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        if (insumos.Count != ids.Count) throw new DominioException("La compra usa un insumo que no existe");

        var proveedor = (req.Proveedor ?? "").Trim();
        var nota = (req.Nota ?? "").Trim();
        var compra = new Compra
        {
            Fecha = (req.Fecha ?? DateTimeOffset.UtcNow).ToUniversalTime(), Proveedor = proveedor.Length > 80 ? proveedor[..80] : proveedor,
            Nota = nota.Length > 200 ? nota[..200] : nota, UsuarioId = usuarioId,
            Items = items.Select(i => new CompraItem { IngredienteId = i.IngredienteId, Nombre = insumos[i.IngredienteId].Nombre, Cantidad = Math.Round(i.Cantidad, 3), Total = Math.Round(i.Total, 2) }).ToList(),
        };
        compra.Total = compra.Items.Sum(i => i.Total);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Compras.Add(compra);
        await db.SaveChangesAsync(ct);
        foreach (var it in compra.Items)
        {
            await InventarioMotor.MoverAsync(db, it.IngredienteId, it.Cantidad, TipoMovimiento.Compra, usuarioId,
                compra.Proveedor.Length > 0 ? $"Compra a {compra.Proveedor}" : "Compra", null, compra.Id, ct);
            // el costo del insumo sigue lo último que se pagó (si hay precio): así el costo de las recetas se mantiene al día
            if (req.ActualizarCostos && it.Total > 0)
            {
                insumos[it.IngredienteId].Cantidad = it.Cantidad;
                insumos[it.IngredienteId].Precio = it.Total;
            }
        }
        if (req.RegistrarGasto && compra.Total > 0)
        {
            db.Gastos.Add(new Gasto
            {
                Fecha = compra.Fecha, Concepto = compra.Proveedor.Length > 0 ? $"Compra de insumos a {compra.Proveedor}" : "Compra de insumos",
                Categoria = "Insumos", Monto = compra.Total,
            });
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await db.Entry(compra).Reference(c => c.Usuario).LoadAsync(ct);
        await auditoria.RegistrarAsync("Compra", compra.Id.ToString(), "Registrar", null,
            auditoria.Capturar(new { compra.Proveedor, compra.Total, compra.Fecha, req.ActualizarCostos, req.RegistrarGasto, Items = compra.Items.Select(i => new { i.Nombre, i.Cantidad, i.Total }) }), ct: ct);
        return Mapear(compra);
    }

    public async Task<List<CompraDto>> ComprasAsync(int limite, CancellationToken ct)
    {
        var lista = await db.Compras.AsNoTracking().Include(c => c.Items).Include(c => c.Usuario)
            .OrderByDescending(c => c.Fecha).ThenByDescending(c => c.Id).Take(Math.Clamp(limite, 1, 200)).ToListAsync(ct);
        return lista.Select(Mapear).ToList();
    }
}

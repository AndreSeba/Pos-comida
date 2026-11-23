using Microsoft.EntityFrameworkCore;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

/// <summary>El único lugar donde se mueve el stock de un insumo, para que siempre quede anotado en el historial.</summary>
internal static class InventarioMotor
{
    /// <summary>
    /// Suma (o resta, si delta es negativo) al stock con UNA instrucción SQL, así dos ventas a la vez no se pisan, y anota el movimiento con el saldo resultante.
    /// El stock puede quedar negativo a propósito: si se vende antes de registrar la compra, luego se corrige. El llamador guarda los cambios.
    /// </summary>
    public static async Task<decimal> MoverAsync(
        PosDbContext db, int ingredienteId, decimal delta, TipoMovimiento tipo, int? usuarioId, string nota, int? ventaId, int? compraId, CancellationToken ct)
    {
        await db.Ingredientes.Where(i => i.Id == ingredienteId).ExecuteUpdateAsync(s => s.SetProperty(i => i.Stock, i => i.Stock + delta), ct);
        var saldo = await db.Ingredientes.AsNoTracking().Where(i => i.Id == ingredienteId).Select(i => i.Stock).FirstAsync(ct);
        db.MovimientosInsumo.Add(new MovimientoInsumo
        {
            IngredienteId = ingredienteId, Fecha = DateTimeOffset.UtcNow, Tipo = tipo, Cantidad = delta, Saldo = saldo,
            Nota = nota.Length > 200 ? nota[..200] : nota, UsuarioId = usuarioId, VentaId = ventaId, CompraId = compraId,
        });
        return saldo;
    }
}

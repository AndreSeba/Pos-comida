using Microsoft.EntityFrameworkCore;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

/// <summary>Reglas comunes de las sesiones de mesa (abrir, vigencia, entrada y cerrar).</summary>
internal static class Sesiones
{
    /// <summary>Una sesión que nadie cerró deja de valer sola pasado este tiempo (se olvidaron de cerrarla).</summary>
    public static readonly TimeSpan Maxima = TimeSpan.FromHours(12);
    /// <summary>Cuánto tiempo, desde que el personal abre la mesa (o toca «dejar entrar»), entra solo quien escanee el QR.</summary>
    public static readonly TimeSpan VentanaIngreso = TimeSpan.FromMinutes(10);
    /// <summary>Una solicitud que nadie atiende en este tiempo se olvida (el cliente puede volver a pedirla).</summary>
    public static readonly TimeSpan VigenciaSolicitud = TimeSpan.FromMinutes(15);
    /// <summary>Tras un rechazo, ese celular no puede volver a pedir entrada a esa mesa durante este tiempo.</summary>
    public static readonly TimeSpan EsperaTrasRechazo = TimeSpan.FromMinutes(10);
    public const int MaxCelulares = 15;
    public const int MaxSolicitudesPorMesa = 5;

    public static Task<MesaSesion?> VigenteAsync(PosDbContext db, int mesaId, CancellationToken ct)
    {
        var limite = DateTimeOffset.UtcNow - Maxima;
        return db.MesaSesiones.AsNoTracking().FirstOrDefaultAsync(s => s.MesaId == mesaId && s.Fin == null && s.Inicio > limite, ct);
    }

    /// <summary>Cierra la sesión de la mesa: ningún celular puede seguir pidiendo y los pedidos que nadie aceptó se cancelan con un aviso.</summary>
    public static async Task CerrarAsync(PosDbContext db, int mesaId, string aviso, CancellationToken ct)
    {
        var abiertas = await db.MesaSesiones.Where(s => s.MesaId == mesaId && s.Fin == null).Select(s => s.Id).ToListAsync(ct);
        if (abiertas.Count == 0) return;
        var ahora = DateTimeOffset.UtcNow;
        await db.MesaSesiones.Where(s => abiertas.Contains(s.Id)).ExecuteUpdateAsync(x => x.SetProperty(s => s.Fin, ahora), ct);
        await db.Pedidos.Where(p => p.Estado == EstadoPedido.PorConfirmar && p.MesaSesionId != null && abiertas.Contains(p.MesaSesionId.Value))
            .ExecuteUpdateAsync(x => x.SetProperty(p => p.Estado, EstadoPedido.Cancelado).SetProperty(p => p.Aviso, aviso), ct);
    }

    /// <summary>Abre una sesión nueva (cerrando la anterior si la había).</summary>
    public static async Task<MesaSesion> AbrirAsync(PosDbContext db, Mesa mesa, int? usuarioId, bool conVentanaDeIngreso, CancellationToken ct)
    {
        await CerrarAsync(db, mesa.Id, "La mesa se volvió a abrir. Vuelve a escanear el QR para entrar.", ct);
        var sesion = new MesaSesion { MesaId = mesa.Id, AbiertaPorId = usuarioId, IngresoHasta = conVentanaDeIngreso ? DateTimeOffset.UtcNow + VentanaIngreso : null };
        db.MesaSesiones.Add(sesion);
        await db.SaveChangesAsync(ct);
        return sesion;
    }

    /// <summary>
    /// La sesión abierta de la mesa o, si no hay, una nueva (sin tocar la ventana de ingreso). Si varios celulares escanean a la vez, la fila de la mesa se
    /// bloquea un instante para que se cree UNA sola sesión (si no, una cerraría a la otra y alguien se quedaría afuera).
    /// </summary>
    public static async Task<MesaSesion> ObtenerOCrearAsync(PosDbContext db, Mesa mesa, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM mesas WHERE \"Id\" = {mesa.Id} FOR UPDATE", ct);
        var sesion = await VigenteAsync(db, mesa.Id, ct);
        if (sesion is null)
        {
            sesion = new MesaSesion { MesaId = mesa.Id };
            db.MesaSesiones.Add(sesion);
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return sesion;
    }

    /// <summary>Autoriza un celular en la sesión (si ya estaba, solo actualiza el nombre).</summary>
    public static async Task DejarEntrarAsync(PosDbContext db, int sesionId, string clienteId, string nombre, CancellationToken ct)
    {
        var fila = await db.MesaSesionClientes.FirstOrDefaultAsync(c => c.MesaSesionId == sesionId && c.ClienteId == clienteId, ct);
        if (fila is not null) { fila.Nombre = nombre; await db.SaveChangesAsync(ct); return; }
        db.MesaSesionClientes.Add(new MesaSesionCliente { MesaSesionId = sesionId, ClienteId = clienteId, Nombre = nombre });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { /* el mismo celular entró dos veces a la vez: ya está autorizado */ }
    }
}

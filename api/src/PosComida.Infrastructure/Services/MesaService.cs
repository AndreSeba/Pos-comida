using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

/// <summary>Las mesas y el secreto de su código QR. Solo las ve quien tiene el permiso de gestionar mesas.</summary>
public class MesaService(PosDbContext db, IAuditoriaService auditoria, IUsuarioActual usuario) : IMesaService
{
    /// <summary>192 bits al azar en base64 de URL: 32 caracteres que nadie puede adivinar ni recorrer probando enlaces.</summary>
    public static string NuevoToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace('+', '-').Replace('/', '_');

    private static MesaDto Mapear(Mesa m) => new(m.Id, m.Nombre, m.Activa, m.Token);

    private static string LimpiarNombre(string? nombre)
    {
        var n = (nombre ?? "").Trim();
        if (n.Length == 0) throw new DominioException("Ponle un nombre a la mesa (ej. «Mesa 3»).");
        if (n.Length > 40) throw new DominioException("El nombre de la mesa es muy largo (máximo 40 letras).");
        return n;
    }

    public async Task<List<MesaDto>> ListarAsync(CancellationToken ct) =>
        (await db.Mesas.AsNoTracking().ToListAsync(ct))
        .OrderBy(m => m.Nombre.Length).ThenBy(m => m.Nombre, StringComparer.OrdinalIgnoreCase).Select(Mapear).ToList();

    public async Task<MesaDto> CrearAsync(MesaGuardarDto dto, CancellationToken ct)
    {
        var nombre = LimpiarNombre(dto.Nombre);
        if (await db.Mesas.AnyAsync(m => m.Nombre.ToLower() == nombre.ToLower(), ct)) throw new DominioException($"Ya existe «{nombre}».", 409);
        var mesa = new Mesa { Nombre = nombre, Token = NuevoToken(), Activa = dto.Activa };
        db.Mesas.Add(mesa);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Crear", null, auditoria.Capturar(new { mesa.Nombre, mesa.Activa }), ct: ct);
        return Mapear(mesa);
    }

    public async Task<MesaDto> ActualizarAsync(int id, MesaGuardarDto dto, CancellationToken ct)
    {
        var mesa = await db.Mesas.FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw new DominioException("Mesa no encontrada", 404);
        var nombre = LimpiarNombre(dto.Nombre);
        if (await db.Mesas.AnyAsync(m => m.Id != id && m.Nombre.ToLower() == nombre.ToLower(), ct)) throw new DominioException($"Ya existe «{nombre}».", 409);
        var antes = auditoria.Capturar(new { mesa.Nombre, mesa.Activa });
        mesa.Nombre = nombre;
        mesa.Activa = dto.Activa;
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Actualizar", antes, auditoria.Capturar(new { mesa.Nombre, mesa.Activa }), ct: ct);
        return Mapear(mesa);
    }

    public async Task<MesaDto> RegenerarTokenAsync(int id, CancellationToken ct)
    {
        var mesa = await db.Mesas.FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw new DominioException("Mesa no encontrada", 404);
        mesa.Token = NuevoToken();
        await db.SaveChangesAsync(ct);
        // el token es un secreto: en la auditoría solo queda que se cambió, nunca su valor
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Nuevo QR", null, null, "El QR anterior dejó de servir", ct: ct);
        return Mapear(mesa);
    }

    // ------------------------------------------------------------ el servicio del día

    private async Task<MesaServicioDto> DeLaMesaAsync(Mesa mesa, CancellationToken ct)
    {
        var s = await Sesiones.VigenteAsync(db, mesa.Id, ct);
        var clientes = s is null ? 0 : await db.MesaSesionClientes.CountAsync(c => c.MesaSesionId == s.Id, ct);
        var pendientes = await db.Pedidos.CountAsync(p => p.MesaId == mesa.Id && p.Estado == EstadoPedido.PorConfirmar, ct);
        var limite = DateTimeOffset.UtcNow - Sesiones.VigenciaSolicitud;
        var solicitudes = await db.MesaSolicitudes.AsNoTracking().Where(x => x.MesaId == mesa.Id && x.Estado == EstadoSolicitud.Pendiente && x.Creado > limite)
            .OrderBy(x => x.Creado).Select(x => new SolicitudIngresoDto(x.Id, x.Nombre, x.Creado)).ToListAsync(ct);
        return new MesaServicioDto(mesa.Id, mesa.Nombre, mesa.Activa, s is not null, s?.Inicio, s?.IngresoHasta, clientes, pendientes, solicitudes);
    }

    public async Task<List<MesaServicioDto>> EstadoAsync(CancellationToken ct)
    {
        var mesas = await db.Mesas.AsNoTracking().ToListAsync(ct);
        var ahora = DateTimeOffset.UtcNow;
        var limite = ahora - Sesiones.Maxima;
        var sesiones = (await db.MesaSesiones.AsNoTracking().Where(s => s.Fin == null && s.Inicio > limite).ToListAsync(ct))
            .GroupBy(s => s.MesaId).ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.Inicio).First());
        var ids = sesiones.Values.Select(s => s.Id).ToList();
        var clientes = await db.MesaSesionClientes.Where(c => ids.Contains(c.MesaSesionId)).GroupBy(c => c.MesaSesionId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        var pendientes = await db.Pedidos.Where(p => p.MesaId != null && p.Estado == EstadoPedido.PorConfirmar).GroupBy(p => p.MesaId!.Value).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        var vigencia = ahora - Sesiones.VigenciaSolicitud;
        var solicitudes = (await db.MesaSolicitudes.AsNoTracking().Where(x => x.Estado == EstadoSolicitud.Pendiente && x.Creado > vigencia).OrderBy(x => x.Creado).ToListAsync(ct))
            .GroupBy(x => x.MesaId).ToDictionary(g => g.Key, g => g.Select(x => new SolicitudIngresoDto(x.Id, x.Nombre, x.Creado)).ToList());
        return mesas.OrderBy(m => m.Nombre.Length).ThenBy(m => m.Nombre, StringComparer.OrdinalIgnoreCase)
            .Select(m =>
            {
                sesiones.TryGetValue(m.Id, out var s);
                return new MesaServicioDto(m.Id, m.Nombre, m.Activa, s is not null, s?.Inicio, s?.IngresoHasta,
                    s is null ? 0 : clientes.GetValueOrDefault(s.Id), pendientes.GetValueOrDefault(m.Id), solicitudes.GetValueOrDefault(m.Id) ?? []);
            }).ToList();
    }

    private async Task<Mesa> ActivaAsync(int id, CancellationToken ct)
    {
        var mesa = await db.Mesas.FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw new DominioException("Mesa no encontrada", 404);
        if (!mesa.Activa) throw new DominioException($"«{mesa.Nombre}» está desactivada. Actívala en Administración → Mesas.", 409);
        return mesa;
    }

    public async Task<MesaServicioDto> AbrirAsync(int id, CancellationToken ct)
    {
        var mesa = await ActivaAsync(id, ct);
        // una mesa que se vuelve a abrir empieza de cero: los celulares de la sesión anterior ya no sirven
        await Sesiones.AbrirAsync(db, mesa, usuario.Id, conVentanaDeIngreso: true, ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Abrir", null, null, $"Se abrió {mesa.Nombre}", ct: ct);
        return await DeLaMesaAsync(mesa, ct);
    }

    public async Task<MesaServicioDto> CerrarAsync(int id, CancellationToken ct)
    {
        var mesa = await db.Mesas.FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw new DominioException("Mesa no encontrada", 404);
        await Sesiones.CerrarAsync(db, mesa.Id, "La mesa se cerró. Escanea el QR otra vez si quieres seguir pidiendo.", ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Cerrar", null, null, $"Se cerró {mesa.Nombre}", ct: ct);
        return await DeLaMesaAsync(mesa, ct);
    }

    public async Task<MesaServicioDto> PermitirIngresoAsync(int id, CancellationToken ct)
    {
        var mesa = await ActivaAsync(id, ct);
        var vigente = await Sesiones.VigenteAsync(db, mesa.Id, ct) ?? throw new DominioException($"«{mesa.Nombre}» no está abierta.", 409);
        var hasta = DateTimeOffset.UtcNow + Sesiones.VentanaIngreso;
        await db.MesaSesiones.Where(s => s.Id == vigente.Id).ExecuteUpdateAsync(x => x.SetProperty(s => s.IngresoHasta, hasta), ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Dejar entrar", null, null, $"Entrada abierta en {mesa.Nombre}", ct: ct);
        return await DeLaMesaAsync(mesa, ct);
    }

    public async Task<MesaServicioDto> AceptarSolicitudAsync(int solicitudId, CancellationToken ct)
    {
        var limite = DateTimeOffset.UtcNow - Sesiones.VigenciaSolicitud;
        var ahora = DateTimeOffset.UtcNow;
        // el cambio es atómico: si dos personas del personal la atienden a la vez, solo una la acepta
        var filas = await db.MesaSolicitudes.Where(x => x.Id == solicitudId && x.Estado == EstadoSolicitud.Pendiente && x.Creado > limite)
            .ExecuteUpdateAsync(x => x.SetProperty(s => s.Estado, EstadoSolicitud.Aceptada).SetProperty(s => s.Resuelta, ahora), ct);
        if (filas == 0) throw new DominioException("Esa solicitud ya se atendió o venció. Si el cliente sigue esperando, que vuelva a escanear el QR.", 409);
        var sol = await db.MesaSolicitudes.AsNoTracking().FirstAsync(x => x.Id == solicitudId, ct);
        var mesa = await ActivaAsync(sol.MesaId, ct);
        // si la mesa estaba libre, aceptar a alguien la abre (sin ventana abierta: los demás tendrán que pedir permiso)
        var sesion = await Sesiones.VigenteAsync(db, mesa.Id, ct) ?? await Sesiones.AbrirAsync(db, mesa, usuario.Id, conVentanaDeIngreso: false, ct);
        await Sesiones.DejarEntrarAsync(db, sesion.Id, sol.ClienteId, sol.Nombre, ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Aceptar ingreso", null, null, $"{sol.Nombre} entró a {mesa.Nombre}", ct: ct);
        return await DeLaMesaAsync(mesa, ct);
    }

    public async Task<MesaServicioDto> RechazarSolicitudAsync(int solicitudId, CancellationToken ct)
    {
        var ahora = DateTimeOffset.UtcNow;
        var filas = await db.MesaSolicitudes.Where(x => x.Id == solicitudId && x.Estado == EstadoSolicitud.Pendiente)
            .ExecuteUpdateAsync(x => x.SetProperty(s => s.Estado, EstadoSolicitud.Rechazada).SetProperty(s => s.Resuelta, ahora), ct);
        if (filas == 0) throw new DominioException("Esa solicitud ya se atendió o venció.", 409);
        var sol = await db.MesaSolicitudes.AsNoTracking().FirstAsync(x => x.Id == solicitudId, ct);
        var mesa = await db.Mesas.AsNoTracking().FirstAsync(m => m.Id == sol.MesaId, ct);
        await auditoria.RegistrarAsync("Mesa", mesa.Id.ToString(), "Rechazar ingreso", null, null, $"No se dejó entrar a {sol.Nombre} en {mesa.Nombre}", ct: ct);
        return await DeLaMesaAsync(mesa, ct);
    }
}

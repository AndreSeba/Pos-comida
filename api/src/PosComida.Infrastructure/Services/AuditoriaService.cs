using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

public class AuditoriaService(PosDbContext db, IUsuarioActual actor) : IAuditoriaService
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = false };

    public string Capturar(object foto) => JsonSerializer.Serialize(foto, Json);

    public async Task RegistrarAsync(string entidad, string entidadId, string accion, string? anterior, string? nuevo, string? motivo = null,
        int? usuarioId = null, string? usuarioNombre = null, CancellationToken ct = default)
    {
        db.Auditorias.Add(new Auditoria
        {
            Fecha = DateTimeOffset.UtcNow, UsuarioId = usuarioId ?? actor.Id,
            UsuarioNombre = usuarioNombre ?? (actor.Id is null ? "Sistema" : actor.Nombre),
            Entidad = entidad, EntidadId = entidadId, Accion = accion, ValorAnterior = anterior, ValorNuevo = nuevo,
            Motivo = motivo is { Length: > 200 } ? motivo[..200] : motivo,
        });
        await db.SaveChangesAsync(ct);
    }

    public async Task<List<AuditoriaDto>> ListarAsync(AuditoriaFiltro f, CancellationToken ct)
    {
        var q = db.Auditorias.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(f.Entidad)) q = q.Where(a => a.Entidad == f.Entidad);
        if (!string.IsNullOrWhiteSpace(f.Accion)) q = q.Where(a => a.Accion == f.Accion);
        if (f.UsuarioId is not null) q = q.Where(a => a.UsuarioId == f.UsuarioId);
        if (f.Desde is not null) q = q.Where(a => a.Fecha >= f.Desde);
        if (f.Hasta is not null) q = q.Where(a => a.Fecha < f.Hasta);
        var lista = await q.OrderByDescending(a => a.Fecha).ThenByDescending(a => a.Id).Take(Math.Clamp(f.Limite, 1, 1000)).ToListAsync(ct);
        return lista.Select(a => new AuditoriaDto(a.Id, a.Fecha, a.UsuarioId, a.UsuarioNombre, a.Entidad, a.EntidadId, a.Accion, a.ValorAnterior, a.ValorNuevo, a.Motivo)).ToList();
    }

    /// <summary>Las entidades y acciones que REALMENTE hay en la tabla: alimenta los filtros sin una lista fija que se desactualice.</summary>
    public async Task<AuditoriaCatalogoDto> CatalogoAsync(CancellationToken ct)
    {
        var entidades = await db.Auditorias.AsNoTracking().Select(a => a.Entidad).Distinct().OrderBy(x => x).ToListAsync(ct);
        var acciones = await db.Auditorias.AsNoTracking().Select(a => a.Accion).Distinct().OrderBy(x => x).ToListAsync(ct);
        var usuarios = await db.Auditorias.AsNoTracking().Where(a => a.UsuarioId != null).Select(a => new { Id = a.UsuarioId!.Value, a.UsuarioNombre }).Distinct().ToListAsync(ct);
        return new AuditoriaCatalogoDto(entidades, acciones, usuarios.GroupBy(u => u.Id).Select(g => new UsuarioRefDto(g.Key, g.First().UsuarioNombre)).OrderBy(u => u.Nombre).ToList());
    }
}

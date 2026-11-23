using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

/// <summary>
/// Valida un token contra el estado ACTUAL de la persona: si la desactivaron, o si cambiaron los permisos de su rol, el token viejo
/// deja de servir y debe volver a entrar. Guarda lo consultado 30 segundos; Invalidar() lo borra al instante cuando algo cambia.
/// </summary>
public class SesionUsuarioCache(IServiceScopeFactory scopes)
{
    private readonly ConcurrentDictionary<int, (DateTime Vence, string? Firma)> _cache = new();
    private static readonly TimeSpan Vida = TimeSpan.FromSeconds(30);

    /// <summary>Los permisos actuales como texto ordenado, o null si la persona (o su rol) está desactivada o no existe.</summary>
    public async Task<string?> FirmaAsync(int usuarioId, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(usuarioId, out var c) && c.Vence > DateTime.UtcNow) return c.Firma;
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosDbContext>();
        var u = await db.Usuarios.AsNoTracking().Where(x => x.Id == usuarioId && x.Activo && x.Rol!.Activo)
            .Select(x => x.Rol!.Permisos.Select(p => p.Permiso!.Codigo).ToList()).FirstOrDefaultAsync(ct);
        var firma = u is null ? null : string.Join(",", u.OrderBy(p => p, StringComparer.Ordinal));
        _cache[usuarioId] = (DateTime.UtcNow + Vida, firma);
        return firma;
    }

    public void Invalidar() => _cache.Clear();
}

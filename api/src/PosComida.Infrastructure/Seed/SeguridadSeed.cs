using Microsoft.EntityFrameworkCore;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Seed;

public static class SeguridadSeed
{
    /// <summary>
    /// Deja la seguridad lista, y se puede repetir sin problema: crea los permisos que falten, los roles que trae el sistema y
    /// vuelve a darle TODOS los permisos al Administrador (así un permiso nuevo llega solo, sin migraciones a mano).
    /// </summary>
    public static async Task AsegurarAsync(PosDbContext db, CancellationToken ct = default)
    {
        var existentes = await db.Permisos.ToDictionaryAsync(p => p.Codigo, ct);
        foreach (var (codigo, nombre, grupo) in Permisos.Catalogo)
        {
            if (existentes.TryGetValue(codigo, out var p)) { p.Nombre = nombre; p.Grupo = grupo; }
            else db.Permisos.Add(existentes[codigo] = new Permiso { Codigo = codigo, Nombre = nombre, Grupo = grupo });
        }
        await db.SaveChangesAsync(ct);

        var admin = await db.Roles.Include(r => r.Permisos).FirstOrDefaultAsync(r => r.Nombre == Permisos.RolAdministrador, ct);
        if (admin is null)
        {
            admin = new Rol { Nombre = Permisos.RolAdministrador, Descripcion = "Acceso total. No se puede editar.", EsSistema = true };
            db.Roles.Add(admin);
        }
        var tiene = admin.Permisos.Select(rp => rp.PermisoId).ToHashSet();
        foreach (var p in existentes.Values.Where(p => !tiene.Contains(p.Id))) admin.Permisos.Add(new RolPermiso { PermisoId = p.Id });
        await db.SaveChangesAsync(ct);

        foreach (var (nombre, descripcion, codigos) in Permisos.RolesIniciales)
        {
            if (await db.Roles.AnyAsync(r => r.Nombre == nombre, ct)) continue;
            db.Roles.Add(new Rol
            {
                Nombre = nombre, Descripcion = descripcion, EsSistema = true,
                Permisos = codigos.Select(c => new RolPermiso { PermisoId = existentes[c].Id }).ToList(),
            });
        }
        await db.SaveChangesAsync(ct);
    }
}

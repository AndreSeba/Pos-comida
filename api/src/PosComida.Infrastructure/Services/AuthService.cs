using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

public class JwtOptions
{
    public string Key { get; set; } = "";
    public string Issuer { get; set; } = "PosComida";
    public string Audience { get; set; } = "PosComida";
    public int HorasAdmin { get; set; } = 8;
    /// <summary>Los vendedores trabajan turnos largos en una tablet; se les da una sesión más larga.</summary>
    public int HorasVentas { get; set; } = 14;
}

public class AuthService(PosDbContext db, IOptions<JwtOptions> opts, IAuditoriaService auditoria) : IAuthService
{
    private readonly JwtOptions _jwt = opts.Value;

    public async Task<List<UsuarioPublicoDto>> UsuariosParaLoginAsync(CancellationToken ct) =>
        await db.Usuarios.AsNoTracking().Where(u => u.Activo && u.Rol!.Activo)
            .Select(u => new { u.Id, u.Nombre, Rol = u.Rol!.Nombre, Admin = u.Rol!.Permisos.Any(p => p.Permiso!.Codigo == Permisos.PanelAdmin) })
            .OrderBy(u => u.Admin).ThenBy(u => u.Rol).ThenBy(u => u.Nombre).Select(u => new UsuarioPublicoDto(u.Id, u.Nombre, u.Rol, u.Admin)).ToListAsync(ct);

    public async Task<LoginResponse> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var u = await db.Usuarios.AsNoTracking().Include(x => x.Rol).ThenInclude(r => r!.Permisos).ThenInclude(p => p.Permiso)
            .FirstOrDefaultAsync(x => x.Id == req.UsuarioId && x.Activo && x.Rol!.Activo, ct);
        // mismo mensaje para usuario inexistente y PIN malo
        if (u is null || !BCrypt.Net.BCrypt.Verify(req.Pin ?? "", u.PinHash))
        {
            await auditoria.RegistrarAsync("Sesion", req.UsuarioId.ToString(), "IngresoFallido", null, null, "PIN incorrecto", u?.Id, u?.Nombre ?? "Desconocido", ct);
            throw new DominioException("PIN incorrecto", 401);
        }

        var permisos = u.Rol!.Permisos.Select(p => p.Permiso!.Codigo).OrderBy(c => c, StringComparer.Ordinal).ToList();
        var horas = permisos.Contains(Permisos.PanelAdmin) ? _jwt.HorasAdmin : _jwt.HorasVentas;
        var expira = DateTimeOffset.UtcNow.AddHours(horas);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, u.Id.ToString()), new(ClaimTypes.Name, u.Nombre), new(ClaimTypes.Role, u.Rol.Nombre),
        };
        claims.AddRange(permisos.Select(p => new Claim("permiso", p)));
        var cred = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(_jwt.Issuer, _jwt.Audience, claims, expires: expira.UtcDateTime, signingCredentials: cred);
        await auditoria.RegistrarAsync("Sesion", u.Id.ToString(), "Ingreso", null, null, null, u.Id, u.Nombre, ct);
        return new LoginResponse(new JwtSecurityTokenHandler().WriteToken(token), u.Id, u.Nombre, u.Rol.Nombre, expira, permisos);
    }
}

public class UsuarioService(PosDbContext db, IAuditoriaService auditoria, SesionUsuarioCache sesiones) : IUsuarioService
{
    private static UsuarioDto Mapear(Usuario u) => new(u.Id, u.Nombre, u.Rol?.Nombre ?? "", u.RolId, u.Activo);

    /// <summary>La foto de la persona para la auditoría: nunca el PIN ni su hash.</summary>
    private object Foto(Usuario u) => new { u.Nombre, u.RolId, Rol = u.Rol?.Nombre, u.Activo };

    private static void ValidarPin(string? pin)
    {
        if (pin is null || pin.Length < 4 || pin.Length > 12 || !pin.All(char.IsDigit))
            throw new DominioException("El PIN debe tener entre 4 y 12 dígitos");
    }

    private async Task<Rol> LeerRolAsync(int rolId, CancellationToken ct) =>
        await db.Roles.FirstOrDefaultAsync(r => r.Id == rolId && r.Activo, ct) ?? throw new DominioException("Rol inválido o desactivado");

    public async Task<List<UsuarioDto>> ListarAsync(CancellationToken ct) =>
        await db.Usuarios.AsNoTracking().Include(u => u.Rol).OrderBy(u => u.Rol!.Nombre).ThenBy(u => u.Nombre).Select(u => Mapear(u)).ToListAsync(ct);

    public async Task<UsuarioDto> CrearAsync(UsuarioGuardarDto dto, CancellationToken ct)
    {
        var nombre = dto.Nombre?.Trim() ?? "";
        if (nombre.Length == 0) throw new DominioException("El nombre es obligatorio");
        ValidarPin(dto.Pin);
        if (await db.Usuarios.AnyAsync(u => u.Nombre == nombre, ct)) throw new DominioException("Ya existe un usuario con ese nombre", 409);
        var rol = await LeerRolAsync(dto.RolId, ct);
        var u = new Usuario { Nombre = nombre, RolId = rol.Id, Rol = rol, PinHash = BCrypt.Net.BCrypt.HashPassword(dto.Pin), Activo = dto.Activo };
        db.Usuarios.Add(u);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Usuario", u.Id.ToString(), "Crear", null, auditoria.Capturar(Foto(u)), ct: ct);
        return Mapear(u);
    }

    public async Task<UsuarioDto> ActualizarAsync(int id, UsuarioGuardarDto dto, int usuarioActualId, CancellationToken ct)
    {
        var u = await db.Usuarios.Include(x => x.Rol).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Usuario no encontrado", 404);
        var nombre = dto.Nombre?.Trim() ?? "";
        if (nombre.Length == 0) throw new DominioException("El nombre es obligatorio");
        if (await db.Usuarios.AnyAsync(x => x.Nombre == nombre && x.Id != id, ct)) throw new DominioException("Ya existe un usuario con ese nombre", 409);
        var rol = await LeerRolAsync(dto.RolId, ct);
        // nadie se quita el acceso a sí mismo: ni se desactiva ni se cambia de rol
        if (id == usuarioActualId && (!dto.Activo || rol.Id != u.RolId))
            throw new DominioException("No puedes desactivarte ni cambiar tu propio rol");

        var antes = auditoria.Capturar(Foto(u));
        u.Nombre = nombre;
        u.RolId = rol.Id;
        u.Rol = rol;
        u.Activo = dto.Activo;
        var cambioPin = !string.IsNullOrWhiteSpace(dto.Pin);
        if (cambioPin)
        {
            ValidarPin(dto.Pin);
            u.PinHash = BCrypt.Net.BCrypt.HashPassword(dto.Pin);
        }
        await db.SaveChangesAsync(ct);
        sesiones.Invalidar();
        await auditoria.RegistrarAsync("Usuario", u.Id.ToString(), "Actualizar", antes, auditoria.Capturar(Foto(u)), cambioPin ? "Se cambió el PIN" : null, ct: ct);
        return Mapear(u);
    }
}

public class RolService(PosDbContext db, IAuditoriaService auditoria, SesionUsuarioCache sesiones) : IRolService
{
    private static RolDto Mapear(Rol r, int usuarios) =>
        new(r.Id, r.Nombre, r.Descripcion, r.EsSistema, r.Activo, usuarios, r.Permisos.Select(p => p.Permiso!.Codigo).OrderBy(c => c, StringComparer.Ordinal).ToList());

    private static object Foto(Rol r) => new { r.Nombre, r.Descripcion, r.Activo, Permisos = r.Permisos.Select(p => p.Permiso!.Codigo).OrderBy(c => c, StringComparer.Ordinal).ToList() };

    private IQueryable<Rol> ConPermisos() => db.Roles.Include(r => r.Permisos).ThenInclude(p => p.Permiso);

    public async Task<List<RolDto>> ListarAsync(CancellationToken ct)
    {
        var roles = await ConPermisos().AsNoTracking().OrderBy(r => r.Id).ToListAsync(ct);
        var usos = await db.Usuarios.Where(u => u.Activo).GroupBy(u => u.RolId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        return roles.Select(r => Mapear(r, usos.GetValueOrDefault(r.Id))).ToList();
    }

    public async Task<List<PermisoDto>> PermisosDisponiblesAsync(CancellationToken ct) =>
        await db.Permisos.AsNoTracking().OrderBy(p => p.Grupo).ThenBy(p => p.Nombre).Select(p => new PermisoDto(p.Codigo, p.Nombre, p.Grupo)).ToListAsync(ct);

    private async Task<Dictionary<string, Permiso>> LeerPermisosAsync(List<string>? codigos, CancellationToken ct)
    {
        var pedidos = (codigos ?? []).Distinct().ToList();
        var permisos = await db.Permisos.Where(p => pedidos.Contains(p.Codigo)).ToDictionaryAsync(p => p.Codigo, ct);
        if (permisos.Count != pedidos.Count) throw new DominioException("Hay un permiso que no existe");
        return permisos;
    }

    private static string LeerNombre(string? nombre)
    {
        var n = (nombre ?? "").Trim();
        if (n.Length == 0) throw new DominioException("El nombre del rol es obligatorio");
        if (n.Length > 40) throw new DominioException("El nombre puede tener hasta 40 caracteres");
        return n;
    }

    public async Task<RolDto> CrearAsync(RolGuardarDto dto, CancellationToken ct)
    {
        var nombre = LeerNombre(dto.Nombre);
        if (await db.Roles.AnyAsync(r => r.Nombre == nombre, ct)) throw new DominioException("Ya existe un rol con ese nombre", 409);
        var permisos = await LeerPermisosAsync(dto.Permisos, ct);
        var r = new Rol { Nombre = nombre, Descripcion = (dto.Descripcion ?? "").Trim(), Activo = dto.Activo, Permisos = permisos.Values.Select(p => new RolPermiso { PermisoId = p.Id, Permiso = p }).ToList() };
        db.Roles.Add(r);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Rol", r.Id.ToString(), "Crear", null, auditoria.Capturar(Foto(r)), ct: ct);
        return Mapear(r, 0);
    }

    public async Task<RolDto> ActualizarAsync(int id, RolGuardarDto dto, CancellationToken ct)
    {
        var r = await ConPermisos().FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Rol no encontrado", 404);
        if (r.EsSistema && r.Nombre == Permisos.RolAdministrador) throw new DominioException("El rol Administrador no se puede modificar: siempre tiene todos los permisos.", 409);
        var nombre = LeerNombre(dto.Nombre);
        if (r.EsSistema && nombre != r.Nombre) throw new DominioException("Los roles del sistema conservan su nombre", 409);
        if (await db.Roles.AnyAsync(x => x.Nombre == nombre && x.Id != id, ct)) throw new DominioException("Ya existe un rol con ese nombre", 409);
        var usuarios = await db.Usuarios.CountAsync(u => u.RolId == id && u.Activo, ct);
        if (!dto.Activo && usuarios > 0) throw new DominioException($"No se puede desactivar: {usuarios} persona(s) activa(s) lo usan. Cámbiales el rol primero.", 409);
        var permisos = await LeerPermisosAsync(dto.Permisos, ct);

        var antes = auditoria.Capturar(Foto(r));
        r.Nombre = nombre;
        r.Descripcion = (dto.Descripcion ?? "").Trim();
        r.Activo = dto.Activo;
        db.RolPermisos.RemoveRange(r.Permisos);
        r.Permisos = permisos.Values.Select(p => new RolPermiso { RolId = r.Id, PermisoId = p.Id, Permiso = p }).ToList();
        await db.SaveChangesAsync(ct);
        sesiones.Invalidar(); // quien ya tenía sesión debe volver a entrar con sus permisos nuevos
        await auditoria.RegistrarAsync("Rol", r.Id.ToString(), "Actualizar", antes, auditoria.Capturar(Foto(r)), ct: ct);
        return Mapear(r, usuarios);
    }
}

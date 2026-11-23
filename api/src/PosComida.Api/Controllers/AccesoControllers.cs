using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

[ApiController]
[Route("api/roles")]
public class RolesController(IRolService svc) : ControllerBase
{
    /// <summary>También lo necesita quien gestiona personas (para elegir el rol al crearlas).</summary>
    [HttpGet]
    [Authorize(Policy = "roles.gestionar|usuarios.gestionar")]
    public Task<List<RolDto>> Listar(CancellationToken ct) => svc.ListarAsync(ct);

    [HttpGet("permisos")]
    [Authorize(Policy = Permisos.RolesGestionar)]
    public Task<List<PermisoDto>> PermisosDisponibles(CancellationToken ct) => svc.PermisosDisponiblesAsync(ct);

    [HttpPost]
    [Authorize(Policy = Permisos.RolesGestionar)]
    public Task<RolDto> Crear(RolGuardarDto dto, CancellationToken ct) => svc.CrearAsync(dto, ct);

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permisos.RolesGestionar)]
    public Task<RolDto> Actualizar(int id, RolGuardarDto dto, CancellationToken ct) => svc.ActualizarAsync(id, dto, ct);
}

[ApiController]
[Authorize(Policy = Permisos.AuditoriaVer)]
[Route("api/auditoria")]
public class AuditoriaController(IAuditoriaService svc) : ControllerBase
{
    [HttpGet]
    public Task<List<AuditoriaDto>> Listar([FromQuery] string? entidad, [FromQuery] string? accion, [FromQuery] int? usuarioId,
        [FromQuery] DateTimeOffset? desde, [FromQuery] DateTimeOffset? hasta, [FromQuery] int limite = 200, CancellationToken ct = default) =>
        svc.ListarAsync(new AuditoriaFiltro(entidad, accion, usuarioId, desde, hasta, limite), ct);

    /// <summary>Las entidades, acciones y personas que de verdad aparecen en la auditoría (alimenta los filtros).</summary>
    [HttpGet("catalogo")]
    public Task<AuditoriaCatalogoDto> Catalogo(CancellationToken ct) => svc.CatalogoAsync(ct);
}

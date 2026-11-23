using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

public static class UserExtensions
{
    public static int UsuarioId(this ClaimsPrincipal u) => int.Parse(u.FindFirstValue(ClaimTypes.NameIdentifier)!);
}

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService auth) : ControllerBase
{
    /// <summary>Lista de personas que pueden entrar (solo nombres) para la pantalla de inicio.</summary>
    [HttpGet("usuarios")]
    public Task<List<UsuarioPublicoDto>> Usuarios(CancellationToken ct) => auth.UsuariosParaLoginAsync(ct);

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public Task<LoginResponse> Login(LoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
}

[ApiController]
[Authorize(Policy = Permisos.UsuariosGestionar)]
[Route("api/usuarios")]
public class UsuariosController(IUsuarioService svc) : ControllerBase
{
    [HttpGet]
    public Task<List<UsuarioDto>> Listar(CancellationToken ct) => svc.ListarAsync(ct);

    [HttpPost]
    public Task<UsuarioDto> Crear(UsuarioGuardarDto dto, CancellationToken ct) => svc.CrearAsync(dto, ct);

    [HttpPut("{id:int}")]
    public Task<UsuarioDto> Actualizar(int id, UsuarioGuardarDto dto, CancellationToken ct) =>
        svc.ActualizarAsync(id, dto, User.UsuarioId(), ct);
}

[ApiController]
[Route("api/config")]
public class ConfigController(ICatalogoService svc) : ControllerBase
{
    [HttpGet]
    [Authorize]
    public Task<ConfigDto> Obtener(CancellationToken ct) => svc.ObtenerConfigAsync(ct);

    /// <summary>El nombre del negocio se muestra en la pantalla de inicio, antes de entrar.</summary>
    [HttpGet("publica")]
    public Task<ConfigPublicaDto> Publica(CancellationToken ct) => svc.ObtenerConfigPublicaAsync(ct);

    [HttpPut]
    [Authorize(Policy = Permisos.ConfigEditar)]
    public Task<ConfigDto> Guardar(ConfigDto dto, CancellationToken ct) => svc.GuardarConfigAsync(dto, ct);
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

/// <summary>Administrar las mesas y sus códigos QR (solo quien tiene el permiso).</summary>
[ApiController]
[Authorize(Policy = Permisos.MesasGestionar)]
[Route("api/mesas")]
public class MesasController(IMesaService svc) : ControllerBase
{
    [HttpGet]
    public Task<List<MesaDto>> Listar(CancellationToken ct) => svc.ListarAsync(ct);

    [HttpPost]
    public Task<MesaDto> Crear(MesaGuardarDto dto, CancellationToken ct) => svc.CrearAsync(dto, ct);

    [HttpPut("{id:int}")]
    public Task<MesaDto> Actualizar(int id, MesaGuardarDto dto, CancellationToken ct) => svc.ActualizarAsync(id, dto, ct);

    /// <summary>Genera un secreto nuevo para el QR: el QR impreso anterior deja de servir.</summary>
    [HttpPost("{id:int}/nuevo-qr")]
    public Task<MesaDto> NuevoQr(int id, CancellationToken ct) => svc.RegenerarTokenAsync(id, ct);
}

/// <summary>El servicio del día: el personal (quien toma pedidos) abre la mesa cuando los clientes se sientan y la cierra al terminar.</summary>
[ApiController]
[Authorize(Policy = Permisos.PedidosTomar)]
[Route("api/mesas-servicio")]
public class MesasServicioController(IMesaService svc) : ControllerBase
{
    [HttpGet]
    public Task<List<MesaServicioDto>> Estado(CancellationToken ct) => svc.EstadoAsync(ct);

    [HttpPost("{id:int}/abrir")]
    public Task<MesaServicioDto> Abrir(int id, CancellationToken ct) => svc.AbrirAsync(id, ct);

    [HttpPost("{id:int}/cerrar")]
    public Task<MesaServicioDto> Cerrar(int id, CancellationToken ct) => svc.CerrarAsync(id, ct);

    /// <summary>Vuelve a abrir la entrada de la mesa unos minutos (llega alguien más).</summary>
    [HttpPost("{id:int}/permitir-ingreso")]
    public Task<MesaServicioDto> PermitirIngreso(int id, CancellationToken ct) => svc.PermitirIngresoAsync(id, ct);

    /// <summary>Un cliente pidió entrar (escaneó el QR fuera de la entrada abierta): el personal lo acepta o lo rechaza.</summary>
    [HttpPost("solicitudes/{solicitudId:int}/aceptar")]
    public Task<MesaServicioDto> Aceptar(int solicitudId, CancellationToken ct) => svc.AceptarSolicitudAsync(solicitudId, ct);

    [HttpPost("solicitudes/{solicitudId:int}/rechazar")]
    public Task<MesaServicioDto> Rechazar(int solicitudId, CancellationToken ct) => svc.RechazarSolicitudAsync(solicitudId, ct);
}

/// <summary>
/// Lo que usa el cliente desde su mesa, sin iniciar sesión. La mesa se identifica SOLO por el token secreto del QR (nunca por número),
/// y cada celular se identifica por un código anónimo que manda en la cabecera X-Cliente-Id.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/publico/mesa/{token}")]
public class PublicoMesaController(IPedidoMesaService svc) : ControllerBase
{
    private string? Cliente => Request.Headers["X-Cliente-Id"].FirstOrDefault();

    private void SinCache() => Response.Headers.CacheControl = "no-store";

    [HttpGet]
    public Task<MesaCartaDto> Obtener(string token, CancellationToken ct)
    {
        SinCache();
        return svc.ObtenerAsync(token, Cliente, ct);
    }

    /// <summary>El cliente escribe su nombre para entrar a la mesa: entra solo si la entrada está abierta; si no, espera que el personal lo deje entrar.</summary>
    [HttpPost("entrar")]
    public Task<MesaCartaDto> Entrar(string token, EntrarMesaRequest req, CancellationToken ct)
    {
        SinCache();
        return svc.EntrarAsync(token, Cliente, req.Nombre, ct);
    }

    [HttpPost("pedidos")]
    public Task<PedidoMesaDto> Crear(string token, PedidoMesaRequest req, CancellationToken ct)
    {
        SinCache();
        return svc.CrearAsync(token, Cliente, req, ct);
    }

    [HttpPut("pedidos/{id:int}")]
    public Task<PedidoMesaDto> Actualizar(string token, int id, PedidoMesaRequest req, CancellationToken ct)
    {
        SinCache();
        return svc.ActualizarAsync(token, Cliente, id, req, ct);
    }

    [HttpDelete("pedidos/{id:int}")]
    public async Task<IActionResult> Cancelar(string token, int id, CancellationToken ct)
    {
        await svc.CancelarAsync(token, Cliente, id, ct);
        return NoContent();
    }
}

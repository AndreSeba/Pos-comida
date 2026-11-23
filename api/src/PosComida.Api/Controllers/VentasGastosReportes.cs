using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

[ApiController]
[Route("api/ventas")]
public class VentasController(IVentaService svc) : ControllerBase
{
    /// <summary>Registrar una venta (cobrar): solo quien cobra. El mesero toma pedidos pero no cobra.</summary>
    [HttpPost]
    [Authorize(Policy = Permisos.VentasCobrar)]
    public Task<VentaDto> Crear(VentaCrearRequest req, CancellationToken ct) => svc.CrearAsync(User.UsuarioId(), req, ct);

    /// <summary>Lo vendido por la persona que consulta desde <c>desde</c> (el inicio de su día, calculado en su dispositivo).</summary>
    [HttpGet("turno")]
    [Authorize(Policy = Permisos.VentasTurno)]
    public Task<ResumenTurnoDto> Turno([FromQuery] DateTimeOffset desde, CancellationToken ct) => svc.TurnoAsync(User.UsuarioId(), desde, ct);

    /// <summary>Ventas ya cobradas que falta entregar (cuando el negocio hace seguimiento de entrega).</summary>
    [HttpGet("por-entregar")]
    [Authorize(Policy = Permisos.EntregasMarcar)]
    public Task<List<VentaDto>> PorEntregar(CancellationToken ct) => svc.PorEntregarAsync(ct);

    [HttpPut("{id:int}/entregada")]
    [Authorize(Policy = Permisos.EntregasMarcar)]
    public async Task<IActionResult> Entregada(int id, CancellationToken ct)
    {
        await svc.MarcarEntregadaAsync(id, ct);
        return NoContent();
    }

    [HttpGet]
    [Authorize(Policy = Permisos.VentasVer)]
    public Task<List<VentaAdminDto>> Listar([FromQuery] DateTimeOffset? desde, [FromQuery] DateTimeOffset? hasta, [FromQuery] int limite = 100, CancellationToken ct = default) =>
        svc.ListarAsync(desde, hasta, limite, ct);

    [HttpPut("{id:int}/anulada")]
    [Authorize(Policy = Permisos.VentasAnular)]
    public async Task<IActionResult> Anular(int id, [FromBody] bool anulada, CancellationToken ct)
    {
        await svc.AnularAsync(id, anulada, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize(Policy = Permisos.GastosGestionar)]
[Route("api/gastos")]
public class GastosController(IGastoService svc) : ControllerBase
{
    [HttpGet]
    public Task<List<GastoDto>> Listar([FromQuery] DateTimeOffset? desde, [FromQuery] DateTimeOffset? hasta, CancellationToken ct) =>
        svc.ListarAsync(desde, hasta, ct);

    [HttpPost]
    public Task<GastoDto> Crear(GastoGuardarDto dto, CancellationToken ct) => svc.CrearAsync(dto, ct);

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Borrar(int id, CancellationToken ct)
    {
        await svc.BorrarAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize(Policy = Permisos.ReportesVer)]
[Route("api/reportes")]
public class ReportesController(IReporteService svc) : ControllerBase
{
    /// <param name="offsetMinutos">Diferencia del dispositivo con UTC en minutos (Bolivia = -240), para agrupar por día local.</param>
    [HttpGet("resumen")]
    public Task<ResumenDto> Resumen([FromQuery] DateTimeOffset desde, [FromQuery] DateTimeOffset hasta, [FromQuery] int offsetMinutos, CancellationToken ct) =>
        svc.ResumenAsync(desde, hasta, offsetMinutos, ct);
}

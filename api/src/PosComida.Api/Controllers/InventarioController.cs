using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

/// <summary>Compras de insumos, ajustes por conteo y el historial de cada insumo. Solo el administrador.</summary>
[ApiController]
[Route("api/inventario")]
public class InventarioController(IInventarioService svc) : ControllerBase
{
    [HttpGet("movimientos")]
    [Authorize(Policy = Permisos.InventarioVer)]
    public Task<List<MovimientoDto>> Movimientos([FromQuery] int? ingredienteId, [FromQuery] int limite = 100, CancellationToken ct = default) =>
        svc.MovimientosAsync(ingredienteId, limite, ct);

    [HttpPost("ajustes")]
    [Authorize(Policy = Permisos.InventarioAjustar)]
    public Task<IngredienteDto> Ajustar(AjusteRequest req, CancellationToken ct) => svc.AjustarAsync(User.UsuarioId(), req, ct);

    [HttpGet("compras")]
    [Authorize(Policy = Permisos.InventarioVer)]
    public Task<List<CompraDto>> Compras([FromQuery] int limite = 50, CancellationToken ct = default) => svc.ComprasAsync(limite, ct);

    [HttpPost("compras")]
    [Authorize(Policy = Permisos.InventarioCompras)]
    public Task<CompraDto> RegistrarCompra(CompraRequest req, CancellationToken ct) => svc.RegistrarCompraAsync(User.UsuarioId(), req, ct);
}

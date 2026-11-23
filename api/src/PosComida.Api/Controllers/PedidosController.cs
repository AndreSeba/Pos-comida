using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

/// <summary>Pedidos abiertos (cuentas por mesa o nombre). Los toma cualquiera del personal; los cobra solo quien tiene caja.</summary>
[ApiController]
[Authorize(Policy = Permisos.PedidosTomar)]
[Route("api/pedidos")]
public class PedidosController(IPedidoService svc) : ControllerBase
{
    [HttpGet]
    public Task<List<PedidoDto>> Abiertos(CancellationToken ct) => svc.ListarAbiertosAsync(ct);

    [HttpPost]
    public Task<PedidoDto> Crear(PedidoGuardarRequest req, CancellationToken ct) => svc.CrearAsync(User.UsuarioId(), req, ct);

    [HttpPut("{id:int}")]
    public Task<PedidoDto> Actualizar(int id, PedidoGuardarRequest req, CancellationToken ct) => svc.ActualizarAsync(id, req, ct);

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Cancelar(int id, CancellationToken ct)
    {
        await svc.CancelarAsync(id, ct);
        return NoContent();
    }

    /// <summary>Acepta el pedido que hizo un cliente desde su mesa.</summary>
    [HttpPost("{id:int}/confirmar")]
    public Task<PedidoDto> Confirmar(int id, CancellationToken ct) => svc.ConfirmarAsync(id, User.UsuarioId(), ct);

    [HttpPost("{id:int}/rechazar")]
    public async Task<IActionResult> Rechazar(int id, RechazarPedidoRequest? req, CancellationToken ct)
    {
        await svc.RechazarAsync(id, req?.Motivo, ct);
        return NoContent();
    }

    /// <summary>«No hay»: quita ese producto del pedido, lo marca agotado y avisa al cliente.</summary>
    [HttpPost("{id:int}/sin-stock/{productoId:int}")]
    public Task<PedidoDto> SinStock(int id, int productoId, CancellationToken ct) => svc.SinStockAsync(id, productoId, ct);

    /// <summary>Marca un producto como agotado (o disponible otra vez): los clientes no pueden pedir lo agotado desde la mesa.</summary>
    [HttpPut("productos/{productoId:int}/agotado")]
    public async Task<IActionResult> Agotado(int productoId, AgotadoRequest req, CancellationToken ct)
    {
        await svc.MarcarAgotadoAsync(productoId, req.Agotado, ct);
        return NoContent();
    }

    /// <summary>Cobrar el pedido: se convierte en venta. Solo Admin y Ventas (la suma de los roles se exige junto a la del controlador).</summary>
    [HttpPost("{id:int}/cobrar")]
    [Authorize(Policy = Permisos.PedidosCobrar)]
    public Task<VentaDto> Cobrar(int id, CobrarPedidoRequest req, CancellationToken ct) => svc.CobrarAsync(id, User.UsuarioId(), req, ct);
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;

namespace PosComida.Api.Controllers;

/// <summary>Lo que ven los clientes de la carta: sin sesión y sin datos internos.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/publico")]
public class PublicoController(ICartaService svc) : ControllerBase
{
    [HttpGet("carta")]
    public Task<CartaDto> Carta(CancellationToken ct) => svc.ObtenerAsync(ct);

    /// <summary>Una imagen de producto. Cada imagen tiene su propio id y nunca cambia, así que el navegador puede guardarla para siempre.</summary>
    [HttpGet("imagenes/{id:int}")]
    public async Task<IActionResult> Imagen(int id, CancellationToken ct)
    {
        var foto = await svc.ObtenerImagenAsync(id, ct);
        if (foto is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return File(foto.Value.Datos, foto.Value.Tipo);
    }
}

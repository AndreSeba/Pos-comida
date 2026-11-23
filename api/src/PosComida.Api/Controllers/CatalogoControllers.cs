using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosComida.Application;
using PosComida.Domain;

namespace PosComida.Api.Controllers;

[ApiController]
[Route("api/ingredientes")]
public class IngredientesController(ICatalogoService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "ingredientes.gestionar|inventario.ver|productos.ver")]
    public Task<List<IngredienteDto>> Listar(CancellationToken ct) => svc.ListarIngredientesAsync(ct);

    [HttpPost]
    [Authorize(Policy = Permisos.IngredientesGestionar)]
    public Task<IngredienteDto> Crear(IngredienteGuardarDto dto, CancellationToken ct) => svc.CrearIngredienteAsync(dto, ct);

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permisos.IngredientesGestionar)]
    public Task<IngredienteDto> Actualizar(int id, IngredienteGuardarDto dto, CancellationToken ct) => svc.ActualizarIngredienteAsync(id, dto, ct);

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permisos.IngredientesGestionar)]
    public async Task<IActionResult> Borrar(int id, CancellationToken ct)
    {
        await svc.BorrarIngredienteAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/productos")]
public class ProductosController(ICatalogoService svc) : ControllerBase
{
    /// <summary>Menú para vender: solo activos, sin costos ni recetas. Lo usan ventas y admin.</summary>
    [HttpGet("menu")]
    [Authorize]
    public Task<List<ProductoVentaDto>> Menu(CancellationToken ct) => svc.ListarProductosVentaAsync(ct);

    [HttpGet]
    [Authorize(Policy = Permisos.ProductosVer)]
    public Task<List<ProductoDto>> Listar(CancellationToken ct) => svc.ListarProductosAsync(ct);

    [HttpPost]
    [Authorize(Policy = Permisos.ProductosEditar)]
    public Task<ProductoDto> Crear(ProductoGuardarDto dto, CancellationToken ct) => svc.CrearProductoAsync(dto, ct);

    /// <summary>Orden de las categorías y de los productos, y dónde se muestra cada uno (ventas y carta).</summary>
    [HttpPut("orden")]
    [Authorize(Policy = Permisos.ProductosEditar)]
    public async Task<IActionResult> GuardarOrden(OrdenMenuDto dto, CancellationToken ct)
    {
        await svc.GuardarOrdenMenuAsync(dto, ct);
        return NoContent();
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permisos.ProductosEditar)]
    public Task<ProductoDto> Actualizar(int id, ProductoGuardarDto dto, CancellationToken ct) => svc.ActualizarProductoAsync(id, dto, ct);

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permisos.ProductosEditar)]
    public async Task<IActionResult> Borrar(int id, CancellationToken ct)
    {
        await svc.BorrarProductoAsync(id, ct);
        return NoContent();
    }
}

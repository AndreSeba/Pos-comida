using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

/// <summary>La carta pública: lo que ve un cliente sin iniciar sesión. Nunca incluye costos, recetas ni márgenes.</summary>
public class CartaService(PosDbContext db) : ICartaService
{
    public async Task<CartaDto> ObtenerAsync(CancellationToken ct)
    {
        var c = await db.Configuraciones.AsNoTracking().FirstOrDefaultAsync(ct);
        if (c is null || !c.CartaPublicada) throw new DominioException("Esta carta no está disponible por ahora.", 404);
        return await ConstruirAsync(c, paraMesa: false, ct);
    }

    /// <summary>Para pedir desde una mesa: siempre con precios (el cliente ve su total) y sin depender de «Publicar mi carta».</summary>
    public async Task<CartaDto> ObtenerParaMesaAsync(CancellationToken ct)
    {
        var c = await db.Configuraciones.AsNoTracking().FirstOrDefaultAsync(ct)
            ?? throw new DominioException("Este código ya no es válido. Pídele ayuda al personal.", 404);
        return await ConstruirAsync(c, paraMesa: true, ct);
    }

    private async Task<CartaDto> ConstruirAsync(Configuracion c, bool paraMesa, CancellationToken ct)
    {
        var productos = OrdenMenu.Ordenar(
            await db.Productos.AsNoTracking()
                .Where(p => p.Activo && p.EnCarta)
                .Select(p => new { p.Id, p.Nombre, p.Descripcion, p.Icono, p.Categoria, p.Precio, p.Agotado, p.Orden })
                .ToListAsync(ct),
            c.OrdenCategorias, p => p.Categoria, p => p.Orden, p => p.Nombre);

        var filas = await db.ProductoImagenes.AsNoTracking().OrderBy(i => i.ProductoId).ThenBy(i => i.Orden)
            .Select(i => new { i.ProductoId, i.Id }).ToListAsync(ct);
        var imagenes = filas.GroupBy(f => f.ProductoId).ToDictionary(g => g.Key, g => g.Select(f => Urls.Imagen(f.Id)).ToList());

        var mostrarPrecios = paraMesa || c.MostrarPrecios;
        var categorias = productos
            .GroupBy(p => OrdenMenu.Nombre(p.Categoria), StringComparer.OrdinalIgnoreCase)
            .Select(g => new CartaCategoriaDto(g.Key, g.Select(p => new CartaProductoDto(
                p.Id, p.Nombre, p.Descripcion, p.Icono,
                mostrarPrecios ? p.Precio : null,
                imagenes.GetValueOrDefault(p.Id) ?? [], p.Agotado)).ToList()))
            .ToList();

        // los pedidos por WhatsApp solo se ofrecen si hay un número al que mandarlos
        var pedidos = !paraMesa && c.PedidosWhatsapp && c.Whatsapp is not null;
        return new CartaDto(c.Negocio, c.Moneda, c.ColorMarca, c.Logo, c.Descripcion, paraMesa ? null : c.Whatsapp, mostrarPrecios, pedidos, categorias);
    }

    public async Task<(byte[] Datos, string Tipo)?> ObtenerImagenAsync(int imagenId, CancellationToken ct)
    {
        var f = await db.ProductoImagenes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == imagenId, ct);
        return f is null ? null : (f.Datos, f.TipoMime);
    }
}

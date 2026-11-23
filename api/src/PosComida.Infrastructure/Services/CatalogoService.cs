using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

public class CatalogoService(PosDbContext db, IAuditoriaService auditoria) : ICatalogoService
{
    // ---------------------------------------------------------------- config
    public async Task<ConfigDto> ObtenerConfigAsync(CancellationToken ct)
    {
        var c = await db.Configuraciones.AsNoTracking().FirstOrDefaultAsync(ct) ?? new Configuracion();
        return MapearConfig(c);
    }

    private static object FotoCfg(Configuracion c) => new
    {
        c.Negocio, c.Moneda, c.ColorMarca, TieneLogo = c.Logo != null, c.Descripcion, c.Whatsapp, c.CartaPublicada, c.MostrarPrecios,
        c.PedidosWhatsapp, c.PedidosAbiertos, c.SeguimientoEntrega, c.IngresoMesaConPermiso,
    };

    private static ConfigDto MapearConfig(Configuracion c) =>
        new(c.Negocio, c.Moneda, c.ColorMarca, c.Logo, c.Descripcion, c.Whatsapp, c.CartaPublicada, c.MostrarPrecios, c.PedidosWhatsapp,
            c.PedidosAbiertos, c.SeguimientoEntrega, c.IngresoMesaConPermiso);

    public async Task<ConfigPublicaDto> ObtenerConfigPublicaAsync(CancellationToken ct)
    {
        var c = await db.Configuraciones.AsNoTracking().FirstOrDefaultAsync(ct) ?? new Configuracion();
        return new ConfigPublicaDto(c.Negocio, c.Moneda, c.ColorMarca, c.Logo);
    }

    /// <summary>Cuántos dígitos tiene un celular de Bolivia sin el código de país.</summary>
    private static string? ValidarWhatsapp(string? w)
    {
        var limpio = new string((w ?? "").Where(char.IsDigit).ToArray());
        if (limpio.Length == 0) return null;
        if (limpio.Length == 8) limpio = "591" + limpio;
        if (limpio.Length != 11 || !limpio.StartsWith("591", StringComparison.Ordinal))
            throw new DominioException("El WhatsApp debe tener 8 dígitos (sin el +591).");
        return limpio;
    }

    private static readonly string[] PrefijosLogo = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"];
    private const int MaxLogo = 150_000; // ~110 KB de imagen

    /// <summary>Acepta solo un data URL de imagen bien formado y de tamaño razonable (el navegador ya lo reduce a 256 px).</summary>
    private static string? ValidarLogo(string? logo)
    {
        if (string.IsNullOrWhiteSpace(logo)) return null;
        if (logo.Length > MaxLogo) throw new DominioException("El logo es demasiado pesado. Usa una imagen más pequeña.");
        var prefijo = PrefijosLogo.FirstOrDefault(p => logo.StartsWith(p, StringComparison.Ordinal))
            ?? throw new DominioException("El logo debe ser una imagen PNG, JPG o WebP.");
        var datos = logo.AsSpan(prefijo.Length);
        if (datos.IsEmpty || !Convert.TryFromBase64Chars(datos, new byte[datos.Length], out _))
            throw new DominioException("La imagen del logo está dañada.");
        return logo;
    }

    private static string ValidarColor(string? color)
    {
        var c = (color ?? "").Trim();
        if (c.Length != 7 || c[0] != '#' || !c.Skip(1).All(Uri.IsHexDigit)) throw new DominioException("El color debe tener el formato #RRGGBB");
        return c.ToUpperInvariant();
    }

    public async Task<ConfigDto> GuardarConfigAsync(ConfigDto dto, CancellationToken ct)
    {
        var c = await db.Configuraciones.FirstOrDefaultAsync(ct);
        if (c is null) db.Configuraciones.Add(c = new Configuracion());
        var antesCfg = auditoria.Capturar(FotoCfg(c));
        c.Negocio = string.IsNullOrWhiteSpace(dto.Negocio) ? "Mi Negocio" : dto.Negocio.Trim();
        c.Moneda = string.IsNullOrWhiteSpace(dto.Moneda) ? "Bs" : dto.Moneda.Trim();
        c.ColorMarca = ValidarColor(dto.ColorMarca);
        c.Logo = ValidarLogo(dto.Logo);
        var descripcion = (dto.Descripcion ?? "").Trim();
        if (descripcion.Length > 200) throw new DominioException("La descripción puede tener hasta 200 caracteres.");
        c.Descripcion = descripcion;
        c.Whatsapp = ValidarWhatsapp(dto.Whatsapp);
        if (dto.CartaPublicada && dto.PedidosWhatsapp && c.Whatsapp is null)
            throw new DominioException("Para recibir pedidos por WhatsApp escribe el número de tu negocio.");
        c.PedidosAbiertos = dto.PedidosAbiertos;
        c.SeguimientoEntrega = dto.SeguimientoEntrega;
        c.IngresoMesaConPermiso = dto.IngresoMesaConPermiso;
        c.CartaPublicada = dto.CartaPublicada;
        c.MostrarPrecios = dto.MostrarPrecios;
        c.PedidosWhatsapp = dto.PedidosWhatsapp;
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Configuracion", c.Id.ToString(), "Actualizar", antesCfg, auditoria.Capturar(FotoCfg(c)), ct: ct);
        return MapearConfig(c);
    }

    // ---------------------------------------------------------------- ingredientes
    private static object FotoIng(Ingrediente i) => new { i.Nombre, Unidad = i.Unidad.ToString(), i.Cantidad, i.Precio, i.StockMinimo };
    private static object FotoProd(Producto p) => new
    {
        p.Nombre, p.Categoria, p.Precio, p.Activo, p.EnCarta, p.Porciones, p.Otros, p.MargenObjetivo, p.CostoManual,
        Receta = p.Receta.Select(l => new { l.IngredienteId, l.Cantidad }),
    };

    private static string Texto(UnidadBase u) => u.ToString().ToLowerInvariant();
    private static IngredienteDto Mapear(Ingrediente i) => new(i.Id, i.Nombre, Texto(i.Unidad), i.Cantidad, i.Precio, i.Stock, i.StockMinimo);

    private static UnidadBase LeerUnidad(string u) =>
        Enum.TryParse<UnidadBase>(u, true, out var x) ? x : throw new DominioException("Unidad inválida (g, ml o u)");

    private static void Validar(IngredienteGuardarDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre)) throw new DominioException("El nombre es obligatorio");
        if (dto.Cantidad <= 0) throw new DominioException("La cantidad comprada debe ser mayor que 0");
        if (dto.Precio < 0) throw new DominioException("El precio no puede ser negativo");
        if (dto.StockMinimo < 0) throw new DominioException("El stock mínimo no puede ser negativo");
    }

    public async Task<List<IngredienteDto>> ListarIngredientesAsync(CancellationToken ct) =>
        await db.Ingredientes.AsNoTracking().OrderBy(i => i.Nombre).Select(i => Mapear(i)).ToListAsync(ct);

    public async Task<IngredienteDto> CrearIngredienteAsync(IngredienteGuardarDto dto, CancellationToken ct)
    {
        Validar(dto);
        var i = new Ingrediente { Nombre = dto.Nombre.Trim(), Unidad = LeerUnidad(dto.Unidad), Cantidad = dto.Cantidad, Precio = dto.Precio, StockMinimo = dto.StockMinimo };
        db.Ingredientes.Add(i);
        await db.SaveChangesAsync(ct);
        // el stock con el que se empieza queda anotado como primer movimiento del historial
        if (dto.Stock != 0)
        {
            await InventarioMotor.MoverAsync(db, i.Id, Math.Round(dto.Stock, 3), TipoMovimiento.Inicial, null, "Stock inicial", null, null, ct);
            await db.SaveChangesAsync(ct);
            await db.Entry(i).ReloadAsync(ct);
        }
        await auditoria.RegistrarAsync("Ingrediente", i.Id.ToString(), "Crear", null, auditoria.Capturar(FotoIng(i)), ct: ct);
        return Mapear(i);
    }

    public async Task<IngredienteDto> ActualizarIngredienteAsync(int id, IngredienteGuardarDto dto, CancellationToken ct)
    {
        Validar(dto);
        var i = await db.Ingredientes.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Ingrediente no encontrado", 404);
        var antes = auditoria.Capturar(FotoIng(i));
        var unidad = LeerUnidad(dto.Unidad);
        // cambiar la unidad dejaría mal todas las recetas que lo usan
        if (unidad != i.Unidad && await db.RecetaLineas.AnyAsync(l => l.IngredienteId == id, ct))
            throw new DominioException("Este ingrediente está en recetas; no se puede cambiar su unidad");
        i.Nombre = dto.Nombre.Trim();
        i.Unidad = unidad;
        i.Cantidad = dto.Cantidad;
        i.Precio = dto.Precio;
        i.StockMinimo = dto.StockMinimo;
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Ingrediente", i.Id.ToString(), "Actualizar", antes, auditoria.Capturar(FotoIng(i)), ct: ct);
        return Mapear(i);
    }

    public async Task BorrarIngredienteAsync(int id, CancellationToken ct)
    {
        var i = await db.Ingredientes.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Ingrediente no encontrado", 404);
        var usos = await db.RecetaLineas.Where(l => l.IngredienteId == id).Select(l => l.ProductoId).Distinct().CountAsync(ct);
        if (usos > 0) throw new DominioException($"No se puede borrar: lo usan {usos} producto(s). Quítalo primero de sus recetas.", 409);
        var foto = auditoria.Capturar(FotoIng(i));
        db.Ingredientes.Remove(i);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Ingrediente", id.ToString(), "Borrar", foto, null, ct: ct);
    }

    // ---------------------------------------------------------------- productos
    private const int MaxImagenes = 6;

    private static ProductoDto Mapear(Producto p, IReadOnlyList<int> imagenes) => new(
        p.Id, p.Nombre, p.Categoria, p.Icono, p.Porciones, p.Otros, p.MargenObjetivo, p.Precio, p.Activo, Math.Round(p.CostoActual(), 4),
        p.Receta.Select(l => new RecetaLineaDto(l.IngredienteId, l.Cantidad)).ToList(),
        p.Descripcion, p.EnCarta, imagenes.Select(i => new ImagenDto(i, Urls.Imagen(i))).ToList(),
        Math.Round(p.CostoCalculado(), 4), p.CostoManual, p.Agotado);

    /// <summary>Ids de las imágenes por producto, en orden. No carga los bytes. productoIds = null trae todas.</summary>
    private async Task<Dictionary<int, List<int>>> IdsDeImagenesAsync(IEnumerable<int>? productoIds, CancellationToken ct)
    {
        var q = db.ProductoImagenes.AsNoTracking().AsQueryable();
        if (productoIds is not null)
        {
            var ids = productoIds.ToList();
            q = q.Where(i => ids.Contains(i.ProductoId));
        }
        var filas = await q.OrderBy(i => i.ProductoId).ThenBy(i => i.Orden).Select(i => new { i.ProductoId, i.Id }).ToListAsync(ct);
        return filas.GroupBy(f => f.ProductoId).ToDictionary(g => g.Key, g => g.Select(f => f.Id).ToList());
    }

    private static readonly string[] TiposImagen = ["image/png", "image/jpeg", "image/webp"];

    /// <summary>Convierte un data URL de imagen en bytes; valida tipo y tamaño (el navegador ya la reduce a ~640 px).</summary>
    private static (byte[] Datos, string Tipo) LeerImagen(string imagen)
    {
        const string marca = ";base64,";
        var i = imagen.IndexOf(marca, StringComparison.Ordinal);
        if (!imagen.StartsWith("data:", StringComparison.Ordinal) || i < 0) throw new DominioException("Una imagen no es válida.");
        var tipo = imagen[5..i];
        if (!TiposImagen.Contains(tipo)) throw new DominioException("Las imágenes deben ser PNG, JPG o WebP.");
        if (imagen.Length > 400_000) throw new DominioException("Una imagen es demasiado pesada.");
        try
        {
            var datos = Convert.FromBase64String(imagen[(i + marca.Length)..]);
            if (datos.Length == 0) throw new FormatException();
            return (datos, tipo);
        }
        catch (FormatException)
        {
            throw new DominioException("Una imagen está dañada.");
        }
    }

    /// <summary>Valida la lista final de imágenes y decodifica las nuevas, antes de tocar la base de datos.</summary>
    private static List<(int? Id, byte[]? Datos, string? Tipo)> PrepararImagenes(List<ImagenGuardarDto> lista)
    {
        if (lista.Count > MaxImagenes) throw new DominioException($"Un producto admite hasta {MaxImagenes} imágenes.");
        if (lista.Where(i => i.Id is not null).GroupBy(i => i.Id).Any(g => g.Count() > 1)) throw new DominioException("Hay una imagen repetida.");
        var resultado = new List<(int? Id, byte[]? Datos, string? Tipo)>();
        foreach (var i in lista)
        {
            if (i.Id is not null) resultado.Add((i.Id, null, null));
            else if (!string.IsNullOrEmpty(i.Datos))
            {
                var (datos, tipo) = LeerImagen(i.Datos);
                resultado.Add((null, datos, tipo));
            }
            else throw new DominioException("Hay una imagen vacía.");
        }
        return resultado;
    }

    /// <summary>Deja las imágenes del producto exactamente como dice la lista: orden, nuevas agregadas y las que faltan, borradas.</summary>
    private async Task GuardarImagenesAsync(int productoId, List<(int? Id, byte[]? Datos, string? Tipo)> lista, CancellationToken ct)
    {
        var existentes = await db.ProductoImagenes.Where(i => i.ProductoId == productoId).Select(i => i.Id).ToListAsync(ct);
        var pedidas = lista.Where(i => i.Id is not null).Select(i => i.Id!.Value).ToList();
        if (pedidas.Any(id => !existentes.Contains(id))) throw new DominioException("Una de las imágenes ya no existe. Recarga el producto.", 409);

        var quitar = existentes.Except(pedidas).ToList();
        if (quitar.Count > 0) await db.ProductoImagenes.Where(i => quitar.Contains(i.Id)).ExecuteDeleteAsync(ct);

        for (var orden = 0; orden < lista.Count; orden++)
        {
            var (id, datos, tipo) = lista[orden];
            if (id is not null)
            {
                var o = orden;
                var idImagen = id.Value;
                await db.ProductoImagenes.Where(i => i.Id == idImagen).ExecuteUpdateAsync(s => s.SetProperty(i => i.Orden, o), ct);
            }
            else db.ProductoImagenes.Add(new ProductoImagen { ProductoId = productoId, Orden = orden, TipoMime = tipo!, Datos = datos! });
        }
        await db.SaveChangesAsync(ct);
    }

    private Task<string?> OrdenCategoriasAsync(CancellationToken ct) =>
        db.Configuraciones.AsNoTracking().Select(c => (string?)c.OrdenCategorias).FirstOrDefaultAsync(ct);

    public async Task GuardarOrdenMenuAsync(OrdenMenuDto dto, CancellationToken ct)
    {
        var categorias = (dto.Categorias ?? []).Select(OrdenMenu.Nombre).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (categorias.Count > 200) throw new DominioException("Hay demasiadas categorías.");
        var items = dto.Productos ?? [];
        if (items.GroupBy(i => i.Id).Any(g => g.Count() > 1)) throw new DominioException("Hay un producto repetido en la lista.");

        var ids = items.Select(i => i.Id).ToList();
        var productos = await db.Productos.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
        if (productos.Count != ids.Count) throw new DominioException("Un producto de la lista ya no existe. Recarga la pantalla.", 409);

        var antes = auditoria.Capturar(new { Categorias = OrdenMenu.Leer(await OrdenCategoriasAsync(ct)) });
        for (var i = 0; i < items.Count; i++)
        {
            var p = productos[items[i].Id];
            p.Orden = i;
            p.Activo = items[i].Activo;
            p.EnCarta = items[i].EnCarta;
        }
        var c = await db.Configuraciones.FirstOrDefaultAsync(ct);
        if (c is null) db.Configuraciones.Add(c = new Configuracion());
        c.OrdenCategorias = OrdenMenu.Escribir(categorias);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Menú", "orden", "Reordenar", antes, auditoria.Capturar(new { Categorias = categorias, Productos = items.Count }), ct: ct);
    }

    private IQueryable<Producto> ConReceta() => db.Productos.Include(p => p.Receta).ThenInclude(l => l.Ingrediente);

    private async Task AplicarAsync(Producto p, ProductoGuardarDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Nombre)) throw new DominioException("El nombre es obligatorio");
        if (dto.Precio < 0 || dto.Otros < 0) throw new DominioException("Los montos no pueden ser negativos");
        if (dto.Porciones < 1) throw new DominioException("La receta debe rendir al menos 1 porción");
        var lineas = dto.Receta ?? [];
        if (lineas.Any(l => l.Cantidad <= 0)) throw new DominioException("Cada ingrediente de la receta necesita una cantidad mayor que 0");
        if (lineas.GroupBy(l => l.IngredienteId).Any(g => g.Count() > 1)) throw new DominioException("Hay un ingrediente repetido en la receta");

        var ids = lineas.Select(l => l.IngredienteId).ToList();
        var existentes = await db.Ingredientes.Where(i => ids.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        if (existentes.Count != ids.Count) throw new DominioException("La receta usa un ingrediente que no existe");

        p.Nombre = dto.Nombre.Trim();
        p.Categoria = dto.Categoria?.Trim() ?? "";
        var icono = dto.Icono?.Trim().ToLowerInvariant() ?? "";
        p.Icono = icono.Length is > 0 and <= 24 && icono.All(c => char.IsAsciiLetterOrDigit(c) || c == '-') ? icono : "plato";
        p.Porciones = dto.Porciones;
        p.Otros = dto.Otros;
        if (dto.CostoManual is < 0) throw new DominioException("El costo no puede ser negativo");
        p.CostoManual = dto.CostoManual;
        p.MargenObjetivo = Math.Clamp(dto.MargenObjetivo, 0, 95);
        p.Precio = dto.Precio;
        p.Activo = dto.Activo;
        var descripcion = (dto.Descripcion ?? "").Trim();
        if (descripcion.Length > 300) throw new DominioException("La descripción puede tener hasta 300 caracteres.");
        p.Descripcion = descripcion;
        p.EnCarta = dto.EnCarta;

        db.RecetaLineas.RemoveRange(p.Receta);
        p.Receta = lineas.Select(l => new RecetaLinea { IngredienteId = l.IngredienteId, Cantidad = l.Cantidad, Ingrediente = existentes[l.IngredienteId] }).ToList();
    }

    public async Task<List<ProductoDto>> ListarProductosAsync(CancellationToken ct)
    {
        var lista = OrdenMenu.Ordenar(await ConReceta().AsNoTracking().ToListAsync(ct), await OrdenCategoriasAsync(ct), p => p.Categoria, p => p.Orden, p => p.Nombre);
        var imagenes = await IdsDeImagenesAsync(lista.Select(p => p.Id), ct);
        return lista.Select(p => Mapear(p, imagenes.GetValueOrDefault(p.Id) ?? [])).ToList();
    }

    public async Task<ProductoDto> CrearProductoAsync(ProductoGuardarDto dto, CancellationToken ct)
    {
        var imagenes = dto.Imagenes is null ? null : PrepararImagenes(dto.Imagenes);
        var p = new Producto { Orden = await db.Productos.Select(x => (int?)x.Orden).MaxAsync(ct) + 1 ?? 0 };
        await AplicarAsync(p, dto, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Productos.Add(p);
        await db.SaveChangesAsync(ct);
        if (imagenes is not null) await GuardarImagenesAsync(p.Id, imagenes, ct);
        await tx.CommitAsync(ct);
        await auditoria.RegistrarAsync("Producto", p.Id.ToString(), "Crear", null, auditoria.Capturar(FotoProd(p)), ct: ct);

        return Mapear(p, (await IdsDeImagenesAsync([p.Id], ct)).GetValueOrDefault(p.Id) ?? []);
    }

    public async Task<ProductoDto> ActualizarProductoAsync(int id, ProductoGuardarDto dto, CancellationToken ct)
    {
        var imagenes = dto.Imagenes is null ? null : PrepararImagenes(dto.Imagenes);
        var p = await ConReceta().FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Producto no encontrado", 404);
        var antes = auditoria.Capturar(FotoProd(p));
        await AplicarAsync(p, dto, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.SaveChangesAsync(ct);
        if (imagenes is not null) await GuardarImagenesAsync(p.Id, imagenes, ct);
        await tx.CommitAsync(ct);
        await auditoria.RegistrarAsync("Producto", p.Id.ToString(), "Actualizar", antes, auditoria.Capturar(FotoProd(p)), ct: ct);

        return Mapear(p, (await IdsDeImagenesAsync([p.Id], ct)).GetValueOrDefault(p.Id) ?? []);
    }

    public async Task BorrarProductoAsync(int id, CancellationToken ct)
    {
        var p = await db.Productos.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new DominioException("Producto no encontrado", 404);
        var enPedidos = await db.PedidoItems
            .Join(db.Pedidos.Where(x => x.Estado == EstadoPedido.Abierto), i => i.PedidoId, x => x.Id, (i, _) => i.ProductoId)
            .AnyAsync(pid => pid == id, ct);
        if (enPedidos) throw new DominioException("Este producto está en pedidos abiertos. Cóbralos o cancélalos antes de borrarlo.", 409);
        // las ventas guardan una copia del nombre/precio/costo, así que borrar el producto no daña el historial
        var fotoProd = auditoria.Capturar(FotoProd(p));
        db.Productos.Remove(p);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Producto", id.ToString(), "Borrar", fotoProd, null, ct: ct);
    }

    public async Task<List<ProductoVentaDto>> ListarProductosVentaAsync(CancellationToken ct)
    {
        var productos = OrdenMenu.Ordenar(
            await db.Productos.AsNoTracking().Where(p => p.Activo).Select(p => new { p.Id, p.Nombre, p.Categoria, p.Icono, p.Precio, p.Agotado, p.Orden }).ToListAsync(ct),
            await OrdenCategoriasAsync(ct), p => p.Categoria, p => p.Orden, p => p.Nombre);
        var imagenes = await IdsDeImagenesAsync(null, ct);
        return productos.Select(p => new ProductoVentaDto(
            p.Id, p.Nombre, p.Categoria, p.Icono, p.Precio,
            imagenes.TryGetValue(p.Id, out var l) && l.Count > 0 ? Urls.Imagen(l[0]) : null, p.Agotado)).ToList();
    }
}

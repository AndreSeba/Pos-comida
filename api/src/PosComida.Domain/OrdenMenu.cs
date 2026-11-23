using System.Text.Json;

namespace PosComida.Domain;

/// <summary>Cómo se ordena el menú: primero las categorías en el orden que eligió el dueño, y dentro de cada una los productos en su orden.</summary>
public static class OrdenMenu
{
    /// <summary>Nombre con el que se ve una categoría (la vacía se llama «Otros»).</summary>
    public static string Nombre(string? categoria) => string.IsNullOrWhiteSpace(categoria) ? "Otros" : categoria.Trim();

    public static List<string> Leer(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string Escribir(IEnumerable<string> categorias) => JsonSerializer.Serialize(categorias.ToList());

    public static List<T> Ordenar<T>(IEnumerable<T> items, string? ordenCategorias, Func<T, string?> categoria, Func<T, int> orden, Func<T, string> nombre)
    {
        var lista = Leer(ordenCategorias);
        int Rango(T x)
        {
            var i = lista.FindIndex(c => string.Equals(c, Nombre(categoria(x)), StringComparison.OrdinalIgnoreCase));
            return i < 0 ? int.MaxValue : i;
        }
        return items.OrderBy(Rango).ThenBy(x => Nombre(categoria(x)), StringComparer.OrdinalIgnoreCase)
            .ThenBy(orden).ThenBy(nombre, StringComparer.OrdinalIgnoreCase).ToList();
    }
}

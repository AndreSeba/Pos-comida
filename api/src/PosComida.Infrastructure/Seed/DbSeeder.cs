using Microsoft.EntityFrameworkCore;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Seed;

public class SeedOptions
{
    /// <summary>PIN con el que se crea el primer administrador (solo si no existe ningún usuario). Cámbialo después de entrar.</summary>
    public string AdminPin { get; set; } = "";
    public string AdminNombre { get; set; } = "Admin";
    /// <summary>Carga ingredientes y productos de ejemplo la primera vez (útil en desarrollo).</summary>
    public bool Ejemplo { get; set; }
}

public static class DbSeeder
{
    public static async Task SembrarAsync(PosDbContext db, SeedOptions opts, CancellationToken ct = default)
    {
        await SeguridadSeed.AsegurarAsync(db, ct);
        var rolAdminId = await db.Roles.Where(r => r.Nombre == Permisos.RolAdministrador).Select(r => r.Id).FirstAsync(ct);

        if (!await db.Configuraciones.AnyAsync(ct))
            db.Configuraciones.Add(new Configuracion());

        if (!await db.Usuarios.AnyAsync(ct))
        {
            if (opts.AdminPin.Length < 4)
                throw new InvalidOperationException("No hay usuarios y falta Seed:AdminPin (mínimo 4 dígitos) para crear el administrador inicial.");
            db.Usuarios.Add(new Usuario
            {
                Nombre = opts.AdminNombre, RolId = rolAdminId, PinHash = BCrypt.Net.BCrypt.HashPassword(opts.AdminPin),
            });
        }

        if (opts.Ejemplo && !await db.Productos.AnyAsync(ct) && !await db.Ingredientes.AnyAsync(ct))
        {
            Ingrediente I(string n, UnidadBase u, decimal c, decimal p) => new() { Nombre = n, Unidad = u, Cantidad = c, Precio = p };
            var carne = I("Carne molida", UnidadBase.G, 1000, 70);
            var pan = I("Pan de hamburguesa", UnidadBase.U, 12, 18);
            var queso = I("Queso laminado", UnidadBase.U, 20, 24);
            var lechuga = I("Lechuga", UnidadBase.G, 500, 6);
            var tomate = I("Tomate", UnidadBase.G, 1000, 10);
            var salsa = I("Salsa de la casa", UnidadBase.Ml, 1000, 25);
            var papa = I("Papa", UnidadBase.G, 5000, 40);
            var aceite = I("Aceite", UnidadBase.Ml, 1000, 18);
            var gaseosa = I("Gaseosa 500 ml", UnidadBase.U, 1, 4);
            db.Ingredientes.AddRange(carne, pan, queso, lechuga, tomate, salsa, papa, aceite, gaseosa);

            RecetaLinea L(Ingrediente i, decimal c) => new() { Ingrediente = i, Cantidad = c };
            db.Productos.AddRange(
                new Producto
                {
                    Nombre = "Hamburguesa clásica", Categoria = "Hamburguesas", Icono = "hamburguesa", Otros = 1.5m, MargenObjetivo = 65, Precio = 22,
                    Receta = [L(carne, 120), L(pan, 1), L(queso, 1), L(lechuga, 15), L(tomate, 30), L(salsa, 20)],
                },
                new Producto
                {
                    Nombre = "Papas fritas", Categoria = "Acompañamientos", Icono = "papas", Otros = 0.5m, MargenObjetivo = 70, Precio = 10,
                    Receta = [L(papa, 250), L(aceite, 40)],
                },
                new Producto
                {
                    Nombre = "Gaseosa", Categoria = "Bebidas", Icono = "bebida", MargenObjetivo = 50, Precio = 7, Receta = [L(gaseosa, 1)],
                });
        }

        await db.SaveChangesAsync(ct);
    }
}

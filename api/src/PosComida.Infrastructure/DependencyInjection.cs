using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PosComida.Application;
using PosComida.Infrastructure.Persistence;
using PosComida.Infrastructure.Seed;
using PosComida.Infrastructure.Services;

namespace PosComida.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var cs = config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Falta ConnectionStrings:Default");
        services.AddDbContext<PosDbContext>(o => o.UseNpgsql(cs));

        services.Configure<JwtOptions>(config.GetSection("Jwt"));
        services.Configure<SeedOptions>(config.GetSection("Seed"));

        services.AddSingleton<SesionUsuarioCache>();
        services.AddScoped<IAuditoriaService, AuditoriaService>();
        services.AddScoped<IRolService, RolService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUsuarioService, UsuarioService>();
        services.AddScoped<ICatalogoService, CatalogoService>();
        services.AddScoped<ICartaService, CartaService>();
        services.AddScoped<IVentaService, VentaService>();
        services.AddScoped<IPedidoService, PedidoService>();
        services.AddScoped<IMesaService, MesaService>();
        services.AddScoped<IPedidoMesaService, PedidoMesaService>();
        services.AddScoped<IInventarioService, InventarioService>();
        services.AddScoped<IGastoService, GastoService>();
        services.AddScoped<IReporteService, ReporteService>();
        return services;
    }
}

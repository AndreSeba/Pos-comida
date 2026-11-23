using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using PosComida.Api.Seguridad;
using PosComida.Application;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PosComida.Api.Middleware;
using PosComida.Infrastructure;
using PosComida.Infrastructure.Persistence;
using PosComida.Infrastructure.Seed;
using PosComida.Infrastructure.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();
builder.Services.AddInfrastructure(builder.Configuration);

var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (jwt.Key.Length < 32)
    throw new InvalidOperationException("Jwt:Key debe tener al menos 32 caracteres (usa user-secrets o una variable de entorno, no el repositorio).");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = jwt.Issuer,
        ValidateAudience = true, ValidAudience = jwt.Audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1),
        NameClaimType = System.Security.Claims.ClaimTypes.Name,
        RoleClaimType = System.Security.Claims.ClaimTypes.Role,
    };
    // un token solo sirve mientras la persona siga activa y con los mismos permisos (si cambian, debe volver a entrar)
    o.Events = new JwtBearerEvents
    {
        OnTokenValidated = async ctx =>
        {
            var cache = ctx.HttpContext.RequestServices.GetRequiredService<SesionUsuarioCache>();
            if (!int.TryParse(ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) { ctx.Fail("Sesión inválida"); return; }
            var actual = await cache.FirmaAsync(id, ctx.HttpContext.RequestAborted);
            var delToken = string.Join(",", ctx.Principal!.FindAll("permiso").Select(c => c.Value).OrderBy(c => c, StringComparer.Ordinal));
            if (actual is null || actual != delToken) ctx.Fail("Sesión desactualizada");
        },
    };
});
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUsuarioActual, UsuarioActualHttp>();
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, PermisoAuthorizationHandler>();
builder.Services.AddAuthorization();

// frena el adivinar PINs: 8 intentos por minuto por dirección IP
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "desconocida",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    // Los clientes de la mesa no tienen sesión y comparten la wifi del local (misma IP), así que no se limita solo por IP:
    // 1) un tope amplio por IP frena a quien prueba códigos a ciegas; 2) un tope por mesa (por token) frena el abuso de un QR.
    var porIp = builder.Configuration.GetValue("RateLimit:MesaPorIpPorMinuto", 600);
    var leer = builder.Configuration.GetValue("RateLimit:MesaLeerPorMinuto", 90);
    var escribir = builder.Configuration.GetValue("RateLimit:MesaEscribirPorMinuto", 20);
    const string prefijoMesa = "/api/publico/mesa/";
    RateLimitPartition<string> Ventana(string clave, int limite) => RateLimitPartition.GetFixedWindowLimiter(clave,
        _ => new FixedWindowRateLimiterOptions { PermitLimit = limite, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
    o.GlobalLimiter = PartitionedRateLimiter.CreateChained(
        PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
            ctx.Request.Path.StartsWithSegments("/api/publico/mesa")
                ? Ventana("ip:" + (ctx.Connection.RemoteIpAddress?.ToString() ?? "desconocida"), porIp)
                : RateLimitPartition.GetNoLimiter("libre")),
        PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        {
            var ruta = ctx.Request.Path.Value ?? "";
            if (!ruta.StartsWith(prefijoMesa, StringComparison.OrdinalIgnoreCase)) return RateLimitPartition.GetNoLimiter("libre");
            var token = ruta[prefijoMesa.Length..].Split('/')[0];
            if (token.Length is 0 or > 64) token = "x:" + (ctx.Connection.RemoteIpAddress?.ToString() ?? "desconocida");
            var lectura = HttpMethods.IsGet(ctx.Request.Method);
            return Ventana((lectura ? "leer:" : "escribir:") + token, lectura ? leer : escribir);
        }));
});

var origenes = builder.Configuration.GetSection("Cors:Origenes").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origenes).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.UseMiddleware<ExcepcionesMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

// Modo sin internet: si existe wwwroot/index.html (el resultado de `pnpm build`), esta misma API entrega la aplicación.
// Así un solo programa en el local atiende a la caja, a los meseros y a los celulares de los clientes por la wifi, sin depender de internet.
// Se lee la carpeta tal cual está en el disco (no la lista de archivos que se fijó al compilar), para que funcione apenas se copie la app.
var carpetaWeb = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var haySitio = File.Exists(Path.Combine(carpetaWeb, "index.html"));
var archivosWeb = haySitio ? new Microsoft.Extensions.FileProviders.PhysicalFileProvider(carpetaWeb) : null;
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
// La aplicación (archivos de wwwroot) se entrega aquí mismo: si la ruta es un archivo que existe, ese archivo; cualquier otra ruta de la
// aplicación (/carta, /mesa/<código>…) devuelve index.html. Las rutas /api desconocidas siguen dando 404.
if (archivosWeb is not null)
{
    var tipos = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
    RequestDelegate entregarApp = async ctx =>
    {
        if (!HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method)) { ctx.Response.StatusCode = StatusCodes.Status404NotFound; return; }
        var ruta = (ctx.Request.Path.Value ?? "/").TrimStart('/');
        var archivo = ruta.Length == 0 ? null : archivosWeb.GetFileInfo(ruta); // el proveedor rechaza rutas con «..»
        if (archivo is { Exists: true, IsDirectory: false } && tipos.TryGetContentType(archivo.Name, out var tipo))
        {
            ctx.Response.ContentType = tipo;
            // los archivos de /assets llevan su huella en el nombre (nunca cambian); lo demás se revisa siempre para ver versiones nuevas
            ctx.Response.Headers.CacheControl = ruta.StartsWith("assets/", StringComparison.Ordinal) ? "public, max-age=31536000, immutable" : "no-cache";
            await ctx.Response.SendFileAsync(archivo);
            return;
        }
        ctx.Response.ContentType = "text/html; charset=utf-8";
        ctx.Response.Headers.CacheControl = "no-cache";
        await ctx.Response.SendFileAsync(archivosWeb.GetFileInfo("index.html"));
    };
    app.MapGet("/", entregarApp);
    app.MapFallback("{*ruta:regex(^(?!api/).*$)}", entregarApp);
}

// migra y siembra al arrancar (en producción solo si Db:MigrarAlIniciar=true)
if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Db:MigrarAlIniciar"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<PosDbContext>();
    await db.Database.MigrateAsync();
    var seed = app.Configuration.GetSection("Seed").Get<SeedOptions>() ?? new SeedOptions();
    await DbSeeder.SembrarAsync(db, seed);
}

app.Run();

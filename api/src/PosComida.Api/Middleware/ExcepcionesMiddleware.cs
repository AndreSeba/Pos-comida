using Microsoft.AspNetCore.Mvc;
using PosComida.Application;

namespace PosComida.Api.Middleware;

public class ExcepcionesMiddleware(RequestDelegate next, ILogger<ExcepcionesMiddleware> log)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (DominioException ex)
        {
            await Responder(ctx, ex.Estado, ex.Message);
        }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            ctx.Response.StatusCode = 499;
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error no controlado en {Metodo} {Ruta}", ctx.Request.Method, ctx.Request.Path);
            await Responder(ctx, 500, "Ocurrió un error inesperado. Intenta de nuevo.");
        }
    }

    private static Task Responder(HttpContext ctx, int estado, string detalle)
    {
        ctx.Response.StatusCode = estado;
        return ctx.Response.WriteAsJsonAsync(new ProblemDetails { Status = estado, Title = detalle, Detail = detalle });
    }
}

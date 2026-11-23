using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using PosComida.Application;

namespace PosComida.Api.Seguridad;

/// <summary>Cualquier nombre de política se lee como un código de permiso: [Authorize(Policy = Permisos.VentasCobrar)] funciona sin registrar nada más.</summary>
public class PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : IAuthorizationPolicyProvider
{
    private readonly DefaultAuthorizationPolicyProvider _base = new(options);

    public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => _base.GetDefaultPolicyAsync();
    public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => _base.GetFallbackPolicyAsync();

    public async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName) =>
        await _base.GetPolicyAsync(policyName) ?? new AuthorizationPolicyBuilder().RequireAuthenticatedUser().AddRequirements(new PermisoRequirement(policyName)).Build();
}

/// <summary>Un código de permiso, o varios separados por «|» (basta con tener alguno).</summary>
public class PermisoRequirement(string codigo) : IAuthorizationRequirement
{
    public string[] Codigos { get; } = codigo.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

public class PermisoAuthorizationHandler : AuthorizationHandler<PermisoRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermisoRequirement requirement)
    {
        if (requirement.Codigos.Any(c => context.User.HasClaim("permiso", c))) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

public class UsuarioActualHttp(IHttpContextAccessor http) : IUsuarioActual
{
    public int? Id => int.TryParse(http.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;
    public string Nombre => http.HttpContext?.User.Identity?.Name ?? "Sistema";
}

namespace PosComida.Application;

public interface IAuthService
{
    Task<List<UsuarioPublicoDto>> UsuariosParaLoginAsync(CancellationToken ct);
    Task<LoginResponse> LoginAsync(LoginRequest req, CancellationToken ct);
}

/// <summary>Quién está haciendo la petición (lo llena la API desde el token). Así los servicios pueden auditar sin recibirlo en cada método.</summary>
public interface IUsuarioActual
{
    int? Id { get; }
    string Nombre { get; }
}

public interface IAuditoriaService
{
    /// <summary>Convierte a JSON una foto de los campos de negocio de una entidad (nunca la entidad de EF completa ni datos binarios).</summary>
    string Capturar(object foto);
    /// <summary>Escribe la línea de auditoría (con su propio guardado). Llamar DESPUÉS de guardar el cambio real. Sin usuario autenticado se usa el indicado o "Sistema".</summary>
    Task RegistrarAsync(string entidad, string entidadId, string accion, string? anterior, string? nuevo, string? motivo = null, int? usuarioId = null, string? usuarioNombre = null, CancellationToken ct = default);
    Task<List<AuditoriaDto>> ListarAsync(AuditoriaFiltro filtro, CancellationToken ct);
    Task<AuditoriaCatalogoDto> CatalogoAsync(CancellationToken ct);
}

public interface IRolService
{
    Task<List<RolDto>> ListarAsync(CancellationToken ct);
    Task<List<PermisoDto>> PermisosDisponiblesAsync(CancellationToken ct);
    Task<RolDto> CrearAsync(RolGuardarDto dto, CancellationToken ct);
    Task<RolDto> ActualizarAsync(int id, RolGuardarDto dto, CancellationToken ct);
}

public interface IUsuarioService
{
    Task<List<UsuarioDto>> ListarAsync(CancellationToken ct);
    Task<UsuarioDto> CrearAsync(UsuarioGuardarDto dto, CancellationToken ct);
    Task<UsuarioDto> ActualizarAsync(int id, UsuarioGuardarDto dto, int usuarioActualId, CancellationToken ct);
}

public interface ICatalogoService
{
    Task<ConfigDto> ObtenerConfigAsync(CancellationToken ct);
    Task<ConfigPublicaDto> ObtenerConfigPublicaAsync(CancellationToken ct);
    Task<ConfigDto> GuardarConfigAsync(ConfigDto dto, CancellationToken ct);

    Task<List<IngredienteDto>> ListarIngredientesAsync(CancellationToken ct);
    Task<IngredienteDto> CrearIngredienteAsync(IngredienteGuardarDto dto, CancellationToken ct);
    Task<IngredienteDto> ActualizarIngredienteAsync(int id, IngredienteGuardarDto dto, CancellationToken ct);
    Task BorrarIngredienteAsync(int id, CancellationToken ct);

    Task<List<ProductoDto>> ListarProductosAsync(CancellationToken ct);
    Task<ProductoDto> CrearProductoAsync(ProductoGuardarDto dto, CancellationToken ct);
    Task<ProductoDto> ActualizarProductoAsync(int id, ProductoGuardarDto dto, CancellationToken ct);
    Task BorrarProductoAsync(int id, CancellationToken ct);
    Task<List<ProductoVentaDto>> ListarProductosVentaAsync(CancellationToken ct);
    /// <summary>Guarda el orden de categorías y productos y dónde se muestra cada producto (ventas y carta).</summary>
    Task GuardarOrdenMenuAsync(OrdenMenuDto dto, CancellationToken ct);
}

public interface IInventarioService
{
    Task<List<MovimientoDto>> MovimientosAsync(int? ingredienteId, int limite, CancellationToken ct);
    Task<IngredienteDto> AjustarAsync(int usuarioId, AjusteRequest req, CancellationToken ct);
    Task<CompraDto> RegistrarCompraAsync(int usuarioId, CompraRequest req, CancellationToken ct);
    Task<List<CompraDto>> ComprasAsync(int limite, CancellationToken ct);
}

public interface ICartaService
{
    /// <summary>La carta pública; falla con 404 si no está publicada.</summary>
    Task<CartaDto> ObtenerAsync(CancellationToken ct);
    /// <summary>La misma carta pero para pedir desde una mesa: no depende de que la carta esté publicada y marca lo agotado.</summary>
    Task<CartaDto> ObtenerParaMesaAsync(CancellationToken ct);
    Task<(byte[] Datos, string Tipo)?> ObtenerImagenAsync(int imagenId, CancellationToken ct);
}

public interface IVentaService
{
    Task<VentaDto> CrearAsync(int usuarioId, VentaCrearRequest req, CancellationToken ct);
    Task<ResumenTurnoDto> TurnoAsync(int usuarioId, DateTimeOffset desde, CancellationToken ct);
    Task<List<VentaAdminDto>> ListarAsync(DateTimeOffset? desde, DateTimeOffset? hasta, int limite, CancellationToken ct);
    Task AnularAsync(int id, bool anulada, CancellationToken ct);
    /// <summary>Cobra un pedido abierto como venta (lo usa PedidoService dentro de su transacción).</summary>
    Task<VentaDto> CrearDesdePedidoAsync(int usuarioId, VentaCrearRequest req, int pedidoId, CancellationToken ct);
    Task<List<VentaDto>> PorEntregarAsync(CancellationToken ct);
    Task MarcarEntregadaAsync(int id, CancellationToken ct);
}

public interface IPedidoService
{
    Task<List<PedidoDto>> ListarAbiertosAsync(CancellationToken ct);
    Task<PedidoDto> CrearAsync(int usuarioId, PedidoGuardarRequest req, CancellationToken ct);
    Task<PedidoDto> ActualizarAsync(int id, PedidoGuardarRequest req, CancellationToken ct);
    Task CancelarAsync(int id, CancellationToken ct);
    Task<VentaDto> CobrarAsync(int id, int usuarioId, CobrarPedidoRequest req, CancellationToken ct);
    /// <summary>Acepta un pedido que hizo un cliente desde la mesa; si la mesa ya tiene una cuenta abierta, se une a ella.</summary>
    Task<PedidoDto> ConfirmarAsync(int id, int usuarioId, CancellationToken ct);
    Task RechazarAsync(int id, string? motivo, CancellationToken ct);
    /// <summary>Quita un producto del pedido porque no hay, lo marca agotado y le avisa al cliente.</summary>
    Task<PedidoDto> SinStockAsync(int pedidoId, int productoId, CancellationToken ct);
    Task MarcarAgotadoAsync(int productoId, bool agotado, CancellationToken ct);
}

public interface IMesaService
{
    Task<List<MesaDto>> ListarAsync(CancellationToken ct);
    Task<MesaDto> CrearAsync(MesaGuardarDto dto, CancellationToken ct);
    Task<MesaDto> ActualizarAsync(int id, MesaGuardarDto dto, CancellationToken ct);
    /// <summary>Cambia el secreto del enlace: el QR impreso anterior deja de servir.</summary>
    Task<MesaDto> RegenerarTokenAsync(int id, CancellationToken ct);

    // ---- el servicio del día: el personal abre la mesa cuando los clientes se sientan y la cierra al terminar
    Task<List<MesaServicioDto>> EstadoAsync(CancellationToken ct);
    /// <summary>Abre una sesión nueva y deja entrar solo, por unos minutos, a quien escanee el QR (si había una abierta, se cierra: sus celulares dejan de poder pedir).</summary>
    Task<MesaServicioDto> AbrirAsync(int id, CancellationToken ct);
    Task<MesaServicioDto> CerrarAsync(int id, CancellationToken ct);
    /// <summary>Vuelve a abrir la entrada de la sesión unos minutos (llega alguien más a la mesa).</summary>
    Task<MesaServicioDto> PermitirIngresoAsync(int id, CancellationToken ct);
    /// <summary>Deja entrar a quien lo pidió; si la mesa estaba libre, la abre.</summary>
    Task<MesaServicioDto> AceptarSolicitudAsync(int solicitudId, CancellationToken ct);
    Task<MesaServicioDto> RechazarSolicitudAsync(int solicitudId, CancellationToken ct);
}

/// <summary>Lo que hace el cliente desde su mesa, sin iniciar sesión. Todo se autoriza con el token del QR: nada se identifica por número de mesa.</summary>
public interface IPedidoMesaService
{
    Task<MesaCartaDto> ObtenerAsync(string token, string? clienteId, CancellationToken ct);
    /// <summary>El cliente escribe su nombre para entrar: si la entrada de la mesa está abierta entra solo; si no, queda esperando que el personal lo deje entrar.</summary>
    Task<MesaCartaDto> EntrarAsync(string token, string? clienteId, string? nombre, CancellationToken ct);
    Task<PedidoMesaDto> CrearAsync(string token, string? clienteId, PedidoMesaRequest req, CancellationToken ct);
    Task<PedidoMesaDto> ActualizarAsync(string token, string? clienteId, int pedidoId, PedidoMesaRequest req, CancellationToken ct);
    Task CancelarAsync(string token, string? clienteId, int pedidoId, CancellationToken ct);
}

public interface IGastoService
{
    Task<List<GastoDto>> ListarAsync(DateTimeOffset? desde, DateTimeOffset? hasta, CancellationToken ct);
    Task<GastoDto> CrearAsync(GastoGuardarDto dto, CancellationToken ct);
    Task BorrarAsync(int id, CancellationToken ct);
}

public interface IReporteService
{
    Task<ResumenDto> ResumenAsync(DateTimeOffset desde, DateTimeOffset hasta, int offsetMinutos, CancellationToken ct);
}

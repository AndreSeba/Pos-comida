using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using PosComida.Application;
using PosComida.Domain;
using PosComida.Infrastructure.Persistence;

namespace PosComida.Infrastructure.Services;

/// <summary>
/// Pedidos que hace el cliente escaneando el QR de su mesa. Sin sesión de usuario: todo se autoriza con el token del QR
/// MÁS la sesión de mesa que abre el personal. Reglas de seguridad:
///  - el token del QR es secreto e impredecible (no el número de mesa), así que cambiar el enlace no lleva a otra mesa;
///  - el QR es fijo y queda en el historial de quien lo escaneó, así que por sí solo NO deja pedir: hace falta haber entrado a la sesión de la mesa.
///    La abre el personal cuando los clientes se sientan (entra solo quien escanee en los minutos siguientes) o la abre al aceptar la solicitud
///    de un cliente; se cierra al pagar y desde ese momento el enlace de esa visita ya no sirve;
///  - cada consulta, cambio o cancelación se filtra por la mesa del token, la sesión abierta y el celular que hizo el pedido, así que
///    conocer o adivinar el número de un pedido ajeno no sirve (siempre responde «no encontrado»);
///  - el precio nunca viene del cliente y hay límites de tamaño, de pedidos esperando y de solicitudes de entrada.
/// </summary>
public partial class PedidoMesaService(PosDbContext db, ICartaService carta, IAuditoriaService auditoria) : IPedidoMesaService
{
    private const int MaxLineas = 30, MaxPorProducto = 20, MaxPendientesMesa = 6, MaxPendientesCliente = 3;
    private static readonly TimeSpan Bolivia = TimeSpan.FromHours(-4);

    [GeneratedRegex("^[A-Za-z0-9_-]{32}$")] private static partial Regex FormaToken();
    [GeneratedRegex("^[A-Za-z0-9-]{16,40}$")] private static partial Regex FormaCliente();

    private static DominioException Invalido() => new("Este código ya no es válido. Pídele ayuda al personal.", 404);
    private static DominioException SinAcceso() => new("Tu mesa no está abierta para ti. Recarga la página y vuelve a entrar.", 409);

    /// <summary>Busca la mesa del token. Un token mal formado, inexistente o de una mesa desactivada responde exactamente igual.</summary>
    private async Task<Mesa> MesaAsync(string? token, CancellationToken ct)
    {
        if (token is null || !FormaToken().IsMatch(token)) throw Invalido();
        var mesa = await db.Mesas.AsNoTracking().FirstOrDefaultAsync(m => m.Token == token, ct);
        if (mesa is null || !mesa.Activa) throw Invalido();
        var activo = await db.Configuraciones.AsNoTracking().Select(c => c.PedidosAbiertos).FirstOrDefaultAsync(ct);
        if (!activo) throw new DominioException("Por ahora esta mesa no recibe pedidos desde el celular. Pídele ayuda al personal.", 409);
        return mesa;
    }

    private static string? ClienteValido(string? clienteId) => clienteId is not null && FormaCliente().IsMatch(clienteId) ? clienteId : null;

    private static string ClienteExigido(string? clienteId) =>
        ClienteValido(clienteId) ?? throw new DominioException("No pudimos identificar tu celular. Recarga la página.");

    /// <summary>La mesa, su sesión abierta y el celular, ya comprobado: sin sesión abierta o sin haber entrado a ella no se puede pedir.</summary>
    private async Task<(Mesa Mesa, MesaSesion Sesion, string Cliente, string Nombre)> ContextoAsync(string? token, string? clienteId, CancellationToken ct)
    {
        var mesa = await MesaAsync(token, ct);
        var cliente = ClienteExigido(clienteId);
        var sesion = await Sesiones.VigenteAsync(db, mesa.Id, ct) ?? throw SinAcceso();
        var fila = await db.MesaSesionClientes.AsNoTracking().FirstOrDefaultAsync(c => c.MesaSesionId == sesion.Id && c.ClienteId == cliente, ct) ?? throw SinAcceso();
        return (mesa, sesion, cliente, fila.Nombre);
    }

    /// <summary>El nombre es obligatorio (máximo 40 letras); se juntan los espacios repetidos.</summary>
    private static string NombreExigido(string? nombre)
    {
        var n = string.Join(' ', (nombre ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (n.Length == 0) throw new DominioException("Escribe tu nombre para que el personal sepa quién pidió.");
        if (n.Length > 40) throw new DominioException("Tu nombre es muy largo (máximo 40 letras).");
        return n.Replace(",", " ").Trim();
    }

    private static string Limpiar(string? texto, int max)
    {
        var t = (texto ?? "").Trim();
        return t.Length > max ? t[..max] : t;
    }

    /// <summary>Valida las líneas: solo productos activos, en la carta y NO agotados; cantidades razonables.</summary>
    private async Task<List<(Producto Producto, int Cantidad)>> LeerLineasAsync(List<VentaItemRequest>? items, CancellationToken ct)
    {
        var pedido = (items ?? []).Where(i => i.Cantidad > 0).GroupBy(i => i.ProductoId)
            .Select(g => (ProductoId: g.Key, Cantidad: g.Sum(x => x.Cantidad))).ToList();
        if (pedido.Count == 0) throw new DominioException("Tu pedido está vacío.");
        if (pedido.Count > MaxLineas) throw new DominioException($"Un pedido puede tener hasta {MaxLineas} productos distintos.");
        if (pedido.Any(p => p.Cantidad > MaxPorProducto)) throw new DominioException($"Máximo {MaxPorProducto} unidades de cada producto por pedido. Si necesitas más, pídelo al personal.");
        var ids = pedido.Select(p => p.ProductoId).ToList();
        var productos = await db.Productos.AsNoTracking().Where(p => ids.Contains(p.Id) && p.Activo && p.EnCarta).ToDictionaryAsync(p => p.Id, ct);
        if (productos.Count != ids.Count) throw new DominioException("Hay productos que ya no están disponibles. Actualiza la carta y vuelve a intentar.", 409);
        var agotados = productos.Values.Where(p => p.Agotado).Select(p => p.Nombre).OrderBy(n => n).ToList();
        if (agotados.Count > 0)
            throw new DominioException($"Se acabó: {string.Join(", ", agotados)}. Quítalo de tu pedido y vuelve a enviar.", 409);
        return pedido.Select(p => (productos[p.ProductoId], p.Cantidad)).ToList();
    }

    private async Task<List<PedidoMesaDto>> MapearAsync(List<Pedido> pedidos, CancellationToken ct)
    {
        var ids = pedidos.SelectMany(p => p.Items).Select(i => i.ProductoId).Distinct().ToList();
        var precios = await db.Productos.AsNoTracking().Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Precio, ct);
        return pedidos.Select(p =>
        {
            var items = p.Items.Select(i => new PedidoMesaItemDto(i.ProductoId, i.Nombre, precios.GetValueOrDefault(i.ProductoId), i.Cantidad)).ToList();
            return new PedidoMesaDto(p.Id, p.Numero, p.Estado.ToString(), p.Nota, p.Aviso, p.Creado, items.Sum(i => i.Precio * i.Cantidad), items, p.NombreCliente);
        }).ToList();
    }

    private static object Foto(Pedido p) => new { p.Numero, p.Etiqueta, p.Nota, Estado = p.Estado.ToString(), p.Aviso, Cliente = p.NombreCliente, Items = p.Items.Select(i => new { i.Nombre, i.Cantidad }) };

    /// <summary>Lo que ve el cliente según en qué punto esté: falta entrar, espera permiso, lo rechazaron, o ya puede pedir.</summary>
    private async Task<MesaCartaDto> VistaAsync(Mesa mesa, string? clienteId, CancellationToken ct)
    {
        var cliente = ClienteValido(clienteId);
        var sesion = await Sesiones.VigenteAsync(db, mesa.Id, ct);
        if (cliente is not null && sesion is not null && await db.MesaSesionClientes.AnyAsync(c => c.MesaSesionId == sesion.Id && c.ClienteId == cliente, ct))
        {
            var menu = await carta.ObtenerParaMesaAsync(ct);
            var mios = await db.Pedidos.AsNoTracking().Include(p => p.Items)
                .Where(p => p.MesaSesionId == sesion.Id && p.ClienteId == cliente)
                .OrderByDescending(p => p.Creado).Take(20).ToListAsync(ct);
            return new MesaCartaDto(mesa.Nombre, "Activa", menu, await MapearAsync(mios, ct));
        }

        if (cliente is not null)
        {
            var ahora = DateTimeOffset.UtcNow;
            var ultima = await db.MesaSolicitudes.AsNoTracking().Where(x => x.MesaId == mesa.Id && x.ClienteId == cliente).OrderByDescending(x => x.Creado).FirstOrDefaultAsync(ct);
            if (ultima is { Estado: EstadoSolicitud.Pendiente } && ultima.Creado > ahora - Sesiones.VigenciaSolicitud)
                return new MesaCartaDto(mesa.Nombre, "Pendiente", null, [], "Ya avisamos al personal. En cuanto te dejen entrar, aquí aparece la carta.");
            if (ultima is { Estado: EstadoSolicitud.Rechazada, Resuelta: { } resuelta } && resuelta > ahora - Sesiones.EsperaTrasRechazo)
                return new MesaCartaDto(mesa.Nombre, "Rechazada", null, [], "El personal no pudo dejarte entrar. Pídele ayuda en el local.");
        }
        var conPermiso = await db.Configuraciones.AsNoTracking().Select(c => c.IngresoMesaConPermiso).FirstOrDefaultAsync(ct);
        var abierta = sesion?.IngresoHasta is { } hasta && hasta > DateTimeOffset.UtcNow;
        return new MesaCartaDto(mesa.Nombre, "Entrar", null, [],
            !conPermiso || abierta ? "Escribe tu nombre para empezar a pedir." : "Escribe tu nombre y el personal te deja entrar.");
    }

    public async Task<MesaCartaDto> ObtenerAsync(string token, string? clienteId, CancellationToken ct) =>
        await VistaAsync(await MesaAsync(token, ct), clienteId, ct);

    public async Task<MesaCartaDto> EntrarAsync(string token, string? clienteId, string? nombre, CancellationToken ct)
    {
        var mesa = await MesaAsync(token, ct);
        var cliente = ClienteExigido(clienteId);
        var nombreLimpio = NombreExigido(nombre);
        var sesion = await Sesiones.VigenteAsync(db, mesa.Id, ct);

        if (sesion is not null && await db.MesaSesionClientes.AnyAsync(c => c.MesaSesionId == sesion.Id && c.ClienteId == cliente, ct))
            return await VistaAsync(mesa, cliente, ct);

        // lo normal: escanear y escribir el nombre basta, sin avisar a nadie. Cada celular queda atado a la mesa del enlace y a esta sesión,
        // que termina al cobrar la cuenta. Solo si el negocio pidió permiso (o la entrada está abierta unos minutos) se hace como sigue abajo.
        var conPermiso = await db.Configuraciones.AsNoTracking().Select(c => c.IngresoMesaConPermiso).FirstOrDefaultAsync(ct);
        var ventanaAbierta = sesion?.IngresoHasta is { } hasta && hasta > DateTimeOffset.UtcNow;
        if (!conPermiso || ventanaAbierta)
        {
            sesion ??= await Sesiones.ObtenerOCrearAsync(db, mesa, ct);
            if (await db.MesaSesionClientes.CountAsync(c => c.MesaSesionId == sesion.Id, ct) >= Sesiones.MaxCelulares)
                throw new DominioException("Ya hay muchos celulares conectados a esta mesa. Pídele ayuda al personal.", 409);
            await Sesiones.DejarEntrarAsync(db, sesion.Id, cliente, nombreLimpio, ct);
            return await VistaAsync(mesa, cliente, ct);
        }

        // fuera de esos minutos (o con la mesa libre) hay que pedir permiso: el personal lo ve y lo acepta con un toque
        var ahora = DateTimeOffset.UtcNow;
        var propias = db.MesaSolicitudes.Where(x => x.MesaId == mesa.Id && x.ClienteId == cliente);
        if (await propias.AnyAsync(x => x.Estado == EstadoSolicitud.Rechazada && x.Resuelta > ahora - Sesiones.EsperaTrasRechazo, ct))
            throw new DominioException("El personal no pudo dejarte entrar. Pídele ayuda en el local.", 409);
        var pendiente = await propias.FirstOrDefaultAsync(x => x.Estado == EstadoSolicitud.Pendiente && x.Creado > ahora - Sesiones.VigenciaSolicitud, ct);
        if (pendiente is not null)
        {
            if (pendiente.Nombre != nombreLimpio) { pendiente.Nombre = nombreLimpio; await db.SaveChangesAsync(ct); }
        }
        else
        {
            if (await db.MesaSolicitudes.CountAsync(x => x.MesaId == mesa.Id && x.Estado == EstadoSolicitud.Pendiente && x.Creado > ahora - Sesiones.VigenciaSolicitud, ct) >= Sesiones.MaxSolicitudesPorMesa)
                throw new DominioException("Hay muchas personas esperando entrar a esta mesa. Pídele ayuda al personal.", 409);
            db.MesaSolicitudes.Add(new MesaSolicitud { MesaId = mesa.Id, ClienteId = cliente, Nombre = nombreLimpio });
            await db.SaveChangesAsync(ct);
        }
        return await VistaAsync(mesa, cliente, ct);
    }

    public async Task<PedidoMesaDto> CrearAsync(string token, string? clienteId, PedidoMesaRequest req, CancellationToken ct)
    {
        var (mesa, sesion, cliente, nombreEntrada) = await ContextoAsync(token, clienteId, ct);
        var nombre = NombreExigido(string.IsNullOrWhiteSpace(req.Nombre) ? nombreEntrada : req.Nombre);
        var lineas = await LeerLineasAsync(req.Items, ct);

        var pendientes = db.Pedidos.Where(p => p.MesaId == mesa.Id && p.Estado == EstadoPedido.PorConfirmar);
        if (await pendientes.CountAsync(ct) >= MaxPendientesMesa || await pendientes.CountAsync(p => p.ClienteId == cliente, ct) >= MaxPendientesCliente)
            throw new DominioException("Ya hay pedidos esperando que el personal los acepte. Espera un momento o pide ayuda en la mesa.", 409);

        var inicioDia = new DateTimeOffset((DateTimeOffset.UtcNow + Bolivia).Date, Bolivia).ToUniversalTime();
        var ultimo = await db.Pedidos.Where(p => p.Creado >= inicioDia).MaxAsync(p => (int?)p.Numero, ct) ?? 0;
        var pedido = new Pedido
        {
            Numero = ultimo + 1, Etiqueta = mesa.Nombre, NombreCliente = nombre, Nota = Limpiar(req.Nota, 200), Estado = EstadoPedido.PorConfirmar,
            MesaId = mesa.Id, MesaSesionId = sesion.Id, ClienteId = cliente,
            Items = lineas.Select(l => new PedidoItem { ProductoId = l.Producto.Id, Nombre = l.Producto.Nombre, Cantidad = l.Cantidad }).ToList(),
        };
        db.Pedidos.Add(pedido);
        await db.SaveChangesAsync(ct);
        await auditoria.RegistrarAsync("Pedido", pedido.Id.ToString(), "Crear", null, auditoria.Capturar(Foto(pedido)), "Pedido del cliente desde la mesa", usuarioNombre: $"Cliente · {mesa.Nombre}", ct: ct);
        return (await MapearAsync([pedido], ct))[0];
    }

    /// <summary>El cliente corrige su pedido mientras el personal todavía no lo aceptó (por ejemplo, si le avisaron que algo se acabó).</summary>
    public async Task<PedidoMesaDto> ActualizarAsync(string token, string? clienteId, int pedidoId, PedidoMesaRequest req, CancellationToken ct)
    {
        var (mesa, sesion, cliente, nombreEntrada) = await ContextoAsync(token, clienteId, ct);
        // primero se comprueba que el pedido sea de ESTE celular, de ESTA mesa y de esta sesión: así quien no es dueño siempre recibe «no encontrado»,
        // sin importar lo que mande en el cuerpo (no se puede descubrir si un número de pedido existe)
        if (!await db.Pedidos.AsNoTracking().AnyAsync(p => p.Id == pedidoId && p.MesaId == mesa.Id && p.MesaSesionId == sesion.Id && p.ClienteId == cliente, ct))
            throw new DominioException("Pedido no encontrado", 404);
        var nombre = NombreExigido(string.IsNullOrWhiteSpace(req.Nombre) ? nombreEntrada : req.Nombre);
        var lineas = await LeerLineasAsync(req.Items, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // el cambio de estado «reserva» la fila: si el personal lo acepta al mismo tiempo, uno de los dos recibe 409 y nunca se mezclan
        var nota = Limpiar(req.Nota, 200);
        var filas = await db.Pedidos.Where(p => p.Id == pedidoId && p.MesaId == mesa.Id && p.MesaSesionId == sesion.Id && p.ClienteId == cliente && p.Estado == EstadoPedido.PorConfirmar)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Nota, nota).SetProperty(p => p.Aviso, "").SetProperty(p => p.NombreCliente, nombre), ct);
        if (filas == 0) throw new DominioException("El personal ya aceptó o cerró este pedido. Si necesitas un cambio, pídelo en la mesa o haz un pedido nuevo.", 409);

        var pedido = await db.Pedidos.Include(p => p.Items).FirstAsync(p => p.Id == pedidoId, ct);
        var antes = auditoria.Capturar(Foto(pedido));
        db.PedidoItems.RemoveRange(pedido.Items);
        pedido.Items = lineas.Select(l => new PedidoItem { ProductoId = l.Producto.Id, Nombre = l.Producto.Nombre, Cantidad = l.Cantidad }).ToList();
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await auditoria.RegistrarAsync("Pedido", pedido.Id.ToString(), "Actualizar", antes, auditoria.Capturar(Foto(pedido)), "El cliente corrigió su pedido", usuarioNombre: $"Cliente · {mesa.Nombre}", ct: ct);
        return (await MapearAsync([pedido], ct))[0];
    }

    public async Task CancelarAsync(string token, string? clienteId, int pedidoId, CancellationToken ct)
    {
        var (mesa, sesion, cliente, _) = await ContextoAsync(token, clienteId, ct);
        if (!await db.Pedidos.AsNoTracking().AnyAsync(p => p.Id == pedidoId && p.MesaId == mesa.Id && p.MesaSesionId == sesion.Id && p.ClienteId == cliente, ct))
            throw new DominioException("Pedido no encontrado", 404);
        var filas = await db.Pedidos.Where(p => p.Id == pedidoId && p.MesaId == mesa.Id && p.MesaSesionId == sesion.Id && p.ClienteId == cliente && p.Estado == EstadoPedido.PorConfirmar)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Estado, EstadoPedido.Cancelado), ct);
        if (filas == 0) throw new DominioException("El personal ya aceptó o cerró este pedido. Si necesitas un cambio, pídelo en la mesa o haz un pedido nuevo.", 409);
        await auditoria.RegistrarAsync("Pedido", pedidoId.ToString(), "Cancelar", auditoria.Capturar(new { Estado = "PorConfirmar" }), auditoria.Capturar(new { Estado = "Cancelado" }), "El cliente canceló su pedido", usuarioNombre: $"Cliente · {mesa.Nombre}", ct: ct);
    }
}

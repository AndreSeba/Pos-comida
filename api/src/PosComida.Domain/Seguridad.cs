namespace PosComida.Domain;

/// <summary>
/// Códigos de permiso. Viajan como claim "permiso" en el JWT y se usan directo como nombre de política en los controladores
/// ([Authorize(Policy = Permisos.VentasCobrar)]). Agregar uno aquí (y a Catalogo) basta: se crea solo al arrancar y se le da al rol Administrador.
/// </summary>
public static class Permisos
{
    public const string PanelAdmin = "panel.admin";

    public const string VentasCobrar = "ventas.cobrar";
    public const string VentasTurno = "ventas.turno";
    public const string VentasVer = "ventas.ver";
    public const string VentasAnular = "ventas.anular";

    public const string PedidosTomar = "pedidos.tomar";
    public const string PedidosCobrar = "pedidos.cobrar";
    public const string EntregasMarcar = "entregas.marcar";
    public const string MesasGestionar = "mesas.gestionar";

    public const string ProductosVer = "productos.ver";
    public const string ProductosEditar = "productos.editar";
    public const string IngredientesGestionar = "ingredientes.gestionar";

    public const string InventarioVer = "inventario.ver";
    public const string InventarioCompras = "inventario.compras";
    public const string InventarioAjustar = "inventario.ajustar";

    public const string GastosGestionar = "gastos.gestionar";
    public const string ReportesVer = "reportes.ver";
    public const string ConfigEditar = "config.editar";

    public const string UsuariosGestionar = "usuarios.gestionar";
    public const string RolesGestionar = "roles.gestionar";
    public const string AuditoriaVer = "auditoria.ver";

    public static readonly (string Codigo, string Nombre, string Grupo)[] Catalogo =
    [
        (PanelAdmin, "Entrar al panel de administración", "Acceso"),
        (VentasCobrar, "Cobrar ventas", "Ventas"),
        (VentasTurno, "Ver su propio turno", "Ventas"),
        (VentasVer, "Ver el historial de ventas", "Ventas"),
        (VentasAnular, "Anular ventas", "Ventas"),
        (PedidosTomar, "Tomar y editar pedidos abiertos", "Pedidos"),
        (PedidosCobrar, "Cobrar pedidos abiertos", "Pedidos"),
        (EntregasMarcar, "Marcar entregas", "Pedidos"),
        (MesasGestionar, "Gestionar mesas y códigos QR", "Pedidos"),
        (ProductosVer, "Ver productos, recetas y costos", "Catálogo"),
        (ProductosEditar, "Crear y editar productos", "Catálogo"),
        (IngredientesGestionar, "Gestionar ingredientes", "Catálogo"),
        (InventarioVer, "Ver inventario y su historial", "Inventario"),
        (InventarioCompras, "Registrar compras de insumos", "Inventario"),
        (InventarioAjustar, "Ajustar el stock (conteo físico)", "Inventario"),
        (GastosGestionar, "Registrar y borrar gastos", "Finanzas"),
        (ReportesVer, "Ver reportes y resúmenes", "Finanzas"),
        (ConfigEditar, "Editar el negocio, la carta y los flujos", "Configuración"),
        (UsuariosGestionar, "Gestionar personas y PIN", "Accesos"),
        (RolesGestionar, "Gestionar roles y permisos", "Accesos"),
        (AuditoriaVer, "Ver la auditoría", "Accesos"),
    ];

    /// <summary>Roles que trae el sistema y qué pueden hacer al empezar (el Administrador siempre tiene todo).</summary>
    public static readonly (string Nombre, string Descripcion, string[] Permisos)[] RolesIniciales =
    [
        ("Ventas", "Vende y cobra, atiende pedidos y marca entregas.", [VentasCobrar, VentasTurno, PedidosTomar, PedidosCobrar, EntregasMarcar]),
        ("Mesero", "Solo toma pedidos y marca entregas; no cobra ni ve ventas.", [PedidosTomar, EntregasMarcar]),
    ];

    public const string RolAdministrador = "Administrador";
}

public class Permiso
{
    public int Id { get; set; }
    public string Codigo { get; set; } = "";
    public string Nombre { get; set; } = "";
    public string Grupo { get; set; } = "";
}

public class Rol
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string Descripcion { get; set; } = "";
    /// <summary>Los roles del sistema no se borran; el Administrador además no se puede editar.</summary>
    public bool EsSistema { get; set; }
    public bool Activo { get; set; } = true;
    public List<RolPermiso> Permisos { get; set; } = [];
}

public class RolPermiso
{
    public int RolId { get; set; }
    public int PermisoId { get; set; }
    public Permiso? Permiso { get; set; }
}

/// <summary>Quién hizo qué y cuándo. El valor anterior y el nuevo son una foto JSON de la entidad para ver qué cambió campo por campo.</summary>
public class Auditoria
{
    public long Id { get; set; }
    public DateTimeOffset Fecha { get; set; } = DateTimeOffset.UtcNow;
    public int? UsuarioId { get; set; }
    /// <summary>El nombre con el que firmó en ese momento (se guarda aparte: la persona puede cambiar de nombre o ser desactivada).</summary>
    public string UsuarioNombre { get; set; } = "";
    public string Entidad { get; set; } = "";
    public string EntidadId { get; set; } = "";
    public string Accion { get; set; } = "";
    public string? ValorAnterior { get; set; }
    public string? ValorNuevo { get; set; }
    public string? Motivo { get; set; }
}

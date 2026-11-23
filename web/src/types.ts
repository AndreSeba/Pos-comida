/** Nombre del rol de la persona (los roles los define el negocio). Lo que puede hacer lo dicen sus permisos. */
export type Rol = string
export type UnidadBase = 'g' | 'ml' | 'u'
export type UnidadCompra = 'kg' | 'g' | 'l' | 'ml' | 'u'
export type Metodo = 'Efectivo' | 'Qr' | 'Tarjeta'
/** lo que muestra una venta: una forma de pago o Mixto (varias) */
export type MetodoVenta = Metodo | 'Mixto'

export interface PagoVenta {
  metodo: Metodo
  monto: number
}

export interface Sesion {
  token: string
  usuarioId: number
  nombre: string
  rol: Rol
  /** códigos de permiso del rol (ej. 'ventas.cobrar') */
  permisos: string[]
  expira: string
}

export interface Config {
  negocio: string
  moneda: string
  /** color de la marca (#RRGGBB) */
  colorMarca: string
  /** logo como data URL; null = sin logo */
  logo: string | null
  /** frase corta de la carta pública */
  descripcion: string
  /** WhatsApp con código de país (591 + 8 dígitos) o null */
  whatsapp: string | null
  cartaPublicada: boolean
  mostrarPrecios: boolean
  pedidosWhatsapp: boolean
  /** se pueden dejar pedidos abiertos (por mesa o nombre) y cobrarlos al final */
  pedidosAbiertos: boolean
  /** lo cobrado queda "por entregar" hasta marcarlo entregado */
  seguimientoEntrega: boolean
  /** false (lo normal): el cliente escanea, escribe su nombre y ya pide. true: el personal tiene que dejarlo entrar */
  ingresoMesaConPermiso: boolean
}

/** lo único que se ve antes de iniciar sesión */
export type ConfigPublica = Pick<Config, 'negocio' | 'moneda' | 'colorMarca' | 'logo'>

export interface UsuarioPublico {
  id: number
  nombre: string
  rol: Rol
  /** tiene acceso de administración */
  admin: boolean
}

export interface Usuario {
  id: number
  nombre: string
  rol: Rol
  rolId: number
  activo: boolean
}

export interface Permiso {
  codigo: string
  nombre: string
  grupo: string
}

export interface RolInfo {
  id: number
  nombre: string
  descripcion: string
  esSistema: boolean
  activo: boolean
  usuarios: number
  permisos: string[]
}

export interface RegistroAuditoria {
  id: number
  fecha: string
  usuarioId: number | null
  usuario: string
  entidad: string
  entidadId: string
  accion: string
  valorAnterior: string | null
  valorNuevo: string | null
  motivo: string | null
}

export interface CatalogoAuditoria {
  entidades: string[]
  acciones: string[]
  usuarios: { id: number; nombre: string }[]
}

export type TipoMovimiento = 'Inicial' | 'Compra' | 'Venta' | 'AnulacionVenta' | 'Ajuste' | 'RestauracionVenta'

export interface Movimiento {
  id: number
  fecha: string
  tipo: TipoMovimiento
  /** con signo, en unidad base */
  cantidad: number
  saldo: number
  nota: string
  usuario: string | null
  ventaId: number | null
  compraId: number | null
}

export interface CompraRegistrada {
  id: number
  fecha: string
  proveedor: string
  nota: string
  total: number
  usuario: string
  items: { ingredienteId: number; nombre: string; cantidad: number; total: number }[]
}

export interface Ingrediente {
  id: number
  nombre: string
  unidad: UnidadBase
  /** cantidad que compras, en unidad base (ej. 1000 g) */
  cantidad: number
  /** lo que pagas por esa cantidad */
  precio: number
  /** lo que debería haber (en unidad base); puede ser negativo */
  stock: number
  /** se avisa que hay que reponer por debajo de esto (0 = sin aviso) */
  stockMinimo: number
}

export interface LineaReceta {
  ingredienteId: number
  /** en la unidad base del ingrediente */
  cantidad: number
}

export interface Producto {
  id: number
  nombre: string
  categoria: string
  icono: string
  porciones: number
  otros: number
  margenObjetivo: number
  precio: number
  activo: boolean
  /** se acabó por hoy */
  agotado?: boolean
  /** costo calculado por el servidor con los precios actuales */
  costo: number
  /** lo que cuesta según la receta (la sugerencia) */
  costoCalculado: number
  /** costo anotado a mano; null = se usa el calculado */
  costoManual: number | null
  receta: LineaReceta[]
  descripcion: string
  /** si aparece en la carta pública */
  enCarta: boolean
  /** hasta 6; la primera es la portada */
  imagenes: ImagenProducto[]
}

export interface ImagenProducto {
  id: number
  url: string
}

/** una imagen en la lista final al guardar: una ya guardada (id) o una nueva (datos = data URL) */
export interface ImagenGuardar {
  id?: number
  datos?: string
}

/** lo que se envía al guardar; `imagenes` es la lista final en orden (null o ausente = no tocar las imágenes) */
export type ProductoGuardar = Omit<Producto, 'id' | 'costo' | 'costoCalculado' | 'imagenes'> & { imagenes?: ImagenGuardar[] | null }

export interface ProductoVenta {
  id: number
  nombre: string
  categoria: string
  icono: string
  precio: number
  /** portada del producto, si tiene */
  fotoUrl: string | null
  /** se acabó por hoy: los clientes no lo pueden pedir desde la mesa */
  agotado?: boolean
}

export interface CartaProducto {
  id: number
  nombre: string
  descripcion: string
  icono: string
  /** null cuando el negocio decidió no mostrar precios */
  precio: number | null
  /** direcciones de las imágenes; la primera es la portada */
  imagenes: string[]
  agotado?: boolean
}

export interface CartaCategoria {
  nombre: string
  productos: CartaProducto[]
}

export interface Carta {
  negocio: string
  moneda: string
  colorMarca: string
  logo: string | null
  descripcion: string
  whatsapp: string | null
  mostrarPrecios: boolean
  pedidosWhatsapp: boolean
  categorias: CartaCategoria[]
}

export interface VentaItem {
  productoId: number
  nombre: string
  precio: number
  cantidad: number
}

export interface Venta {
  id: number
  fecha: string
  metodo: MetodoVenta
  pagos: PagoVenta[]
  vendedor: string
  nota: string
  total: number
  anulada: boolean
  items: VentaItem[]
  etiqueta: string
  entregado: boolean
}

export interface PedidoItem {
  productoId: number
  nombre: string
  /** precio actual del producto (un pedido abierto se cobra al precio de ese momento) */
  precio: number
  cantidad: number
  /** false si el producto se desactivó o borró después de tomar el pedido */
  disponible: boolean
}

/** Un pedido abierto: tomado pero todavía sin cobrar. */
export interface Pedido {
  id: number
  /** número corto del día, para llamarlo en voz alta */
  numero: number
  etiqueta: string
  nota: string
  creado: string
  mesero: string
  estado: 'Abierto' | 'Cobrado' | 'Cancelado' | 'PorConfirmar' | 'Unido'
  total: number
  items: PedidoItem[]
  /** lo pidió un cliente desde su mesa (QR) */
  deMesa?: boolean
  /** lo último que el personal le dijo al cliente (ej. «Sin stock: Gaseosa») */
  aviso?: string
  /** quién pidió desde la mesa (varios nombres si se juntaron pedidos de la misma mesa) */
  cliente?: string
}

export interface Mesa {
  id: number
  nombre: string
  activa: boolean
  /** secreto del enlace del QR: solo lo ve quien administra las mesas */
  token: string
}

export interface PedidoMesaItem {
  productoId: number
  nombre: string
  precio: number
  cantidad: number
}

/** El pedido de un cliente visto por él mismo. */
export interface PedidoMesa {
  id: number
  numero: number
  estado: 'PorConfirmar' | 'Abierto' | 'Unido' | 'Cobrado' | 'Cancelado'
  nota: string
  aviso: string
  creado: string
  total: number
  items: PedidoMesaItem[]
  nombre: string
}

/** Entrar: falta escribir el nombre. Pendiente: espera que el personal lo deje entrar. Rechazada: no lo dejaron entrar. Activa: ya puede pedir. */
export interface MesaCarta {
  mesa: string
  estado: 'Entrar' | 'Pendiente' | 'Rechazada' | 'Activa'
  carta: Carta | null
  pedidos: PedidoMesa[]
  mensaje: string | null
}

/** Quién espera que lo dejen entrar a una mesa. */
export interface SolicitudIngreso {
  id: number
  nombre: string
  creado: string
}

/** Una mesa vista por el personal durante el servicio. */
export interface MesaServicio {
  id: number
  nombre: string
  activa: boolean
  abierta: boolean
  desde: string | null
  /** hasta cuándo entra solo quien escanee el QR (después, cada celular pide permiso) */
  ingresoHasta: string | null
  clientes: number
  pendientes: number
  solicitudes: SolicitudIngreso[]
}

export interface VentaAdmin extends Venta {
  costo: number
}

export interface Turno {
  cantidad: number
  total: number
  ventas: Venta[]
}

export interface Gasto {
  id: number
  fecha: string
  concepto: string
  categoria: string
  monto: number
}

export interface Resumen {
  ventas: number
  costo: number
  gastos: number
  pedidos: number
  cantGastos: number
  efectivo: number
  qr: number
  tarjeta: number
  top: { nombre: string; cantidad: number; total: number; ganancia: number }[]
  porDia: { dia: string; total: number }[]
}

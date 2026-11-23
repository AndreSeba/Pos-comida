import type { Carta, CartaProducto, Producto } from './types'
import { money } from './util'

/** Base pública de los enlaces que se comparten. En desarrollo es esta misma dirección; en producción conviene fijarla con VITE_PUBLIC_URL. */
export const urlPublica = (): string => (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/+$/, '') || window.location.origin
export const enlaceCarta = () => `${urlPublica()}/carta`

/** Abre WhatsApp con un texto escrito. Sin número, WhatsApp deja elegir a quién mandárselo. */
export function enlaceWhatsapp(texto: string, numeroConPais?: string | null): string {
  return `https://wa.me/${numeroConPais ?? ''}?text=${encodeURIComponent(texto)}`
}

/* ------------------------------ pedido del cliente ------------------------------ */
export type TipoPedido = 'local' | 'llevar' | 'delivery'

export const TIPOS_PEDIDO: { id: TipoPedido; nombre: string; texto: string }[] = [
  { id: 'local', nombre: 'Comer en el local', texto: 'Para comer en el local' },
  { id: 'llevar', nombre: 'Para llevar', texto: 'Para llevar (paso a recoger)' },
  { id: 'delivery', nombre: 'Delivery', texto: 'Delivery (a domicilio)' },
]

export interface DatosPedido {
  nombre: string
  entrega: TipoPedido
  /** delivery: la dirección escrita por el cliente */
  direccion: string
  /** delivery: enlace de mapa con la ubicación del celular (si el cliente la compartió) */
  mapa: string
  /** delivery: una referencia para encontrar la casa (color de la puerta, tienda cercana…) */
  referencia: string
  nota: string
}

/** ¿Faltan datos para el tipo de pedido elegido? En delivery hacen falta la ubicación (escrita o compartida) y una referencia. */
export function faltaDelivery(d: DatosPedido): boolean {
  return d.entrega === 'delivery' && ((!d.direccion.trim() && !d.mapa) || !d.referencia.trim())
}

/** Enlace de mapa para unas coordenadas (lo abre cualquier celular; no hace falta que el negocio tenga internet para recibirlo en WhatsApp). */
export const enlaceMapa = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`

export function mensajePedido(carta: Carta, lineas: { producto: CartaProducto; cantidad: number }[], d: DatosPedido): string {
  const m = carta.moneda
  const filas = lineas.map(({ producto, cantidad }) =>
    carta.mostrarPrecios && producto.precio !== null
      ? `• ${cantidad} × ${producto.nombre} — ${money(producto.precio * cantidad, m)}`
      : `• ${cantidad} × ${producto.nombre}`,
  )
  const total = lineas.reduce((s, l) => s + (l.producto.precio ?? 0) * l.cantidad, 0)
  return [
    `Hola ${carta.negocio}! Quiero hacer un pedido:`,
    '',
    ...filas,
    ...(carta.mostrarPrecios ? ['', `Total: ${money(total, m)}`] : []),
    '',
    `Nombre: ${d.nombre.trim()}`,
    `Tipo de pedido: ${TIPOS_PEDIDO.find((t) => t.id === d.entrega)?.texto ?? d.entrega}`,
    ...(d.entrega === 'delivery'
      ? [
          ...(d.direccion.trim() ? [`Ubicación: ${d.direccion.trim()}`] : []),
          ...(d.mapa ? [`Mapa: ${d.mapa}`] : []),
          `Referencia: ${d.referencia.trim()}`,
        ]
      : []),
    ...(d.nota.trim() ? [`Nota: ${d.nota.trim()}`] : []),
  ].join('\n')
}

/* ------------------------------ compartir la carta ------------------------------ */
export function mensajeEnlace(negocio: string, enlace: string): string {
  return `Mira la carta de ${negocio} y haz tu pedido por WhatsApp:\n${enlace}`
}

/** La carta escrita (por categorías) para mandarla como mensaje. Si es muy larga, se corta y se invita a abrir el enlace. */
export function mensajeCartaEnTexto(negocio: string, moneda: string, productos: Producto[], mostrarPrecios: boolean, enlace: string): string {
  const activos = productos.filter((p) => p.activo && p.enCarta)
  const porCategoria = new Map<string, Producto[]>()
  for (const p of activos) {
    const c = p.categoria?.trim() || 'Otros'
    porCategoria.set(c, [...(porCategoria.get(c) ?? []), p])
  }
  const cierre = `\nPide por aquí: ${enlace}`
  const limite = 1500 // WhatsApp acepta textos largos, pero los enlaces de wa.me se rompen si pasan de ~2000 caracteres
  let texto = `*${negocio}*\nNuestra carta:\n`
  let cortada = false
  for (const [categoria, lista] of porCategoria) {
    const bloque = `\n*${categoria}*\n` + lista.map((p) => `• ${p.nombre}${mostrarPrecios ? ` — ${money(p.precio, moneda)}` : ''}`).join('\n') + '\n'
    if ((texto + bloque + cierre).length > limite) {
      cortada = true
      break
    }
    texto += bloque
  }
  return texto + (cortada ? '\n…y más en la carta completa.\n' : '') + cierre
}

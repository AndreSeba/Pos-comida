import type { Ingrediente, LineaReceta, UnidadBase, UnidadCompra } from './types'

export function money(n: number, moneda = 'Bs'): string {
  const v = Number.isFinite(n) ? n : 0
  return `${moneda} ${v.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`

/** convierte una cantidad de compra (ej. 2 kg) a unidad base (2000 g) */
export function aBase(cant: number, u: UnidadCompra): number {
  return u === 'kg' || u === 'l' ? cant * 1000 : cant
}

export function baseDe(u: UnidadCompra): UnidadBase {
  return u === 'kg' || u === 'g' ? 'g' : u === 'l' || u === 'ml' ? 'ml' : 'u'
}

export const costoUnitario = (i: Ingrediente) => (i.cantidad > 0 ? i.precio / i.cantidad : 0)

/** vista previa en la calculadora; el costo "oficial" lo calcula el servidor */
export function costoReceta(p: { receta: LineaReceta[]; porciones: number; otros: number }, ings: Ingrediente[]): number {
  const total = p.receta.reduce((s, l) => {
    const ing = ings.find((x) => x.id === l.ingredienteId)
    return s + (ing ? costoUnitario(ing) * l.cantidad : 0)
  }, 0)
  return total / Math.max(1, p.porciones) + (p.otros || 0)
}

/** precio para lograr el margen (sobre el precio) y redondeado hacia arriba a 0.50 */
export function precioSugerido(costo: number, margen: number): number {
  const m = Math.min(Math.max(margen, 0), 95) / 100
  const bruto = costo / (1 - m)
  return Math.ceil(bruto * 2) / 2
}

export const margenReal = (precio: number, costo: number) => (precio > 0 ? ((precio - costo) / precio) * 100 : 0)

export const inicioDia = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const fechaCorta = (f: string | number) =>
  new Date(f).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })

export const horaCorta = (f: string | number) =>
  new Date(f).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

export const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const metodoTexto = (m: string) => (m === 'Qr' ? 'QR' : m)

/** "Efectivo Bs 20,00 + QR Bs 24,00" para un pago mixto; el nombre simple si hay un solo método */
export function pagosTexto(v: { metodo: string; pagos: { metodo: string; monto: number }[] }, moneda = 'Bs'): string {
  if (v.pagos.length <= 1) return metodoTexto(v.metodo)
  return v.pagos.map((p) => `${metodoTexto(p.metodo)} ${money(p.monto, moneda)}`).join(' + ')
}

/** ¿la sesión tiene el permiso? Acepta alternativas con "a|b". */
export const puede = (s: { permisos: string[] } | null | undefined, codigos: string) =>
  !!s && codigos.split('|').some((c) => s.permisos.includes(c))

/** cantidad en unidad base mostrada legible: 1500 g -> "1.5 kg" */
export function cantidadTexto(n: number, unidad: UnidadBase): string {
  const f = (v: number) => v.toLocaleString('es-BO', { maximumFractionDigits: 2 })
  if (unidad === 'u') return `${f(n)} u`
  if (Math.abs(n) >= 1000) return `${f(n / 1000)} ${unidad === 'g' ? 'kg' : 'l'}`
  return `${f(n)} ${unidad}`
}

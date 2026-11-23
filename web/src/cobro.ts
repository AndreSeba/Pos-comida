import type { Metodo } from './types'
import { num } from './util'

/** Lo que el vendedor puede elegir al cobrar: una forma de pago o "Mixto" (varias a la vez). */
export type MetodoUI = Metodo | 'Mixto'

export interface Pago {
  metodo: Metodo
  monto: number
}

export interface Cobro {
  /** pagos que se envían al servidor; siempre suman el total (el vuelto no se guarda) */
  pagos: Pago[]
  /** parte del total que se cobra en efectivo (0 si no hay efectivo) */
  efectivo: number
  vuelto: number
  /** cuánto falta por recibir en efectivo, si lo recibido no alcanza */
  falta: number
  /** por qué no se puede confirmar todavía (null = listo) */
  error: 'sin-total' | 'superan-total' | 'minimo-dos' | 'efectivo-insuficiente' | null
}

const c2 = (n: number) => Math.round(n * 100) / 100

/**
 * En pago mixto el vendedor escribe lo que se paga con QR y con tarjeta; el resto de la cuenta es efectivo.
 * Así los montos siempre cuadran con el total y solo queda por calcular el vuelto del efectivo.
 */
export function calcularCobro(total: number, metodo: MetodoUI, recibidoTxt: string, qrTxt: string, tarjetaTxt: string): Cobro {
  const t = c2(total)
  const recibido = num(recibidoTxt)
  let pagos: Pago[]
  let error: Cobro['error'] = t <= 0 ? 'sin-total' : null

  if (metodo === 'Mixto') {
    const qr = c2(Math.max(0, num(qrTxt)))
    const tarjeta = c2(Math.max(0, num(tarjetaTxt)))
    const efectivo = c2(t - qr - tarjeta)
    pagos = []
    if (efectivo > 0) pagos.push({ metodo: 'Efectivo', monto: efectivo })
    if (qr > 0) pagos.push({ metodo: 'Qr', monto: qr })
    if (tarjeta > 0) pagos.push({ metodo: 'Tarjeta', monto: tarjeta })
    if (!error && efectivo < 0) error = 'superan-total'
    else if (!error && pagos.length < 2) error = 'minimo-dos'
  } else {
    pagos = [{ metodo, monto: t }]
  }

  const efectivo = pagos.find((p) => p.metodo === 'Efectivo')?.monto ?? 0
  const falta = efectivo > 0 && recibido > 0 && recibido < efectivo ? c2(efectivo - recibido) : 0
  if (!error && falta > 0) error = 'efectivo-insuficiente'
  const vuelto = efectivo > 0 && recibido > efectivo ? c2(recibido - efectivo) : 0

  return { pagos, efectivo, vuelto, falta, error }
}

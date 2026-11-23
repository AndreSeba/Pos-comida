import { useState } from 'react'
import { calcularCobro, type MetodoUI, type Pago } from './cobro'
import { Icono } from './Icono'
import { Modal } from './ui'
import { money } from './util'

const METODOS: { id: MetodoUI; label: string; icono: string }[] = [
  { id: 'Efectivo', label: 'Efectivo', icono: 'billete' },
  { id: 'Qr', label: 'QR', icono: 'qr' },
  { id: 'Tarjeta', label: 'Tarjeta', icono: 'tarjeta' },
  { id: 'Mixto', label: 'Mixto', icono: 'mixto' },
]

/** La ventana de cobro (efectivo con vuelto, QR, tarjeta o mixto). La usan la venta directa y el cobro de un pedido abierto. */
export function CobroModal({
  total, moneda: m, titulo, notaInicial = '', enviando, onCerrar, onConfirmar,
}: {
  total: number
  moneda: string
  titulo?: string
  notaInicial?: string
  enviando: boolean
  onCerrar: () => void
  onConfirmar: (pagos: Pago[], nota: string, vuelto: number) => void
}) {
  const [metodo, setMetodo] = useState<MetodoUI>('Efectivo')
  const [recibido, setRecibido] = useState('')
  const [qrTxt, setQrTxt] = useState('')
  const [tarjetaTxt, setTarjetaTxt] = useState('')
  const [nota, setNota] = useState(notaInicial)
  const cobro = calcularCobro(total, metodo, recibido, qrTxt, tarjetaTxt)

  return (
    <Modal
      titulo={titulo ?? `Cobrar ${money(total, m)}`}
      onCerrar={() => !enviando && onCerrar()}
      pie={
        <>
          <button className="btn btn-outline-secondary" disabled={enviando} onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary flex-grow-1" disabled={!!cobro.error || enviando} onClick={() => onConfirmar(cobro.pagos, nota.trim(), cobro.vuelto)}>
            {enviando ? 'Guardando…' : `Confirmar cobro · ${money(total, m)}`}
          </button>
        </>
      }
    >
      <div className="btn-group w-100 mb-3" role="group" aria-label="Forma de pago">
        {METODOS.map((x) => (
          <button
            key={x.id}
            className={'btn btn-outline-primary d-flex align-items-center justify-content-center gap-1 px-1' + (x.id === metodo ? ' active' : '')}
            onClick={() => setMetodo(x.id)}
          >
            <Icono nombre={x.icono} size={18} /> {x.label}
          </button>
        ))}
      </div>

      {metodo === 'Mixto' && (
        <div className="mb-3">
          <p className="small text-secondary mb-2">Escribe cuánto se paga con QR y con tarjeta; el resto de la cuenta se cobra en efectivo.</p>
          {([['qr', 'QR', qrTxt, setQrTxt], ['tarjeta', 'Tarjeta', tarjetaTxt, setTarjetaTxt]] as const).map(([ico, nombre, valor, poner]) => (
            <div key={nombre} className="input-group mb-2">
              <span className="input-group-text gap-2 pago-etiqueta"><Icono nombre={ico} size={18} /> {nombre}</span>
              <input className="form-control" aria-label={`Monto pagado con ${nombre}`} inputMode="decimal" value={valor} onChange={(e) => poner(e.target.value)} placeholder="0" />
              <span className="input-group-text">{m}</span>
            </div>
          ))}
          <div className="d-flex justify-content-between align-items-center rounded-3 bg-body-secondary px-3 py-2">
            <span className="d-inline-flex align-items-center gap-2"><Icono nombre="billete" size={18} /> Efectivo (el resto)</span>
            <strong>{money(cobro.efectivo, m)}</strong>
          </div>
          {cobro.error === 'superan-total' && <p className="text-danger fw-semibold mt-2 mb-0">QR y tarjeta superan el total de la cuenta.</p>}
          {cobro.error === 'minimo-dos' && <p className="text-secondary small mt-2 mb-0">Para pago mixto usa al menos dos formas de pago.</p>}
        </div>
      )}

      {cobro.efectivo > 0 && (
        <>
          <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="recibido">
            {metodo === 'Mixto' ? `Recibido en efectivo (de ${money(cobro.efectivo, m)})` : 'Recibido'}
          </label>
          <input id="recibido" className="form-control form-control-lg" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={String(cobro.efectivo)} autoFocus={metodo !== 'Mixto'} />
          <div className="d-flex flex-wrap gap-2 my-2">
            {[cobro.efectivo, 10, 20, 50, 100, 200].map((v, i) => (
              <button key={i} className="btn btn-sm btn-outline-secondary rounded-pill" onClick={() => setRecibido(String(v))}>{i === 0 ? 'Justo' : v}</button>
            ))}
          </div>
          {cobro.error === 'efectivo-insuficiente' && <p className="text-danger fw-semibold">Faltan {money(cobro.falta, m)} en efectivo</p>}
          {cobro.vuelto > 0 && <p className="text-success fw-bold fs-5">Vuelto: {money(cobro.vuelto, m)}</p>}
        </>
      )}

      <label className="form-label small fw-semibold text-secondary mb-1 mt-2" htmlFor="nota-cobro">Nota (opcional)</label>
      <input id="nota-cobro" className="form-control" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Sin cebolla, mesa 3…" />
    </Modal>
  )
}

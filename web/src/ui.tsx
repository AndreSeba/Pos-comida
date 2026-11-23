import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { mensajeError } from './api'
import { Icono } from './Icono'
import { fijarMarca } from './tema'
import type { Config } from './types'

/* ------------------------------ avisos ------------------------------ */
type Aviso = { id: number; texto: string; tipo: 'ok' | 'error' }
const avisos = new Set<(a: Aviso) => void>()
let contador = 0

export function avisar(texto: string, tipo: Aviso['tipo'] = 'ok') {
  const a = { id: ++contador, texto, tipo }
  avisos.forEach((f) => f(a))
}
export const avisarError = (e: unknown) => avisar(mensajeError(e), 'error')

export function Avisos() {
  const [lista, setLista] = useState<Aviso[]>([])
  useEffect(() => {
    const f = (a: Aviso) => {
      setLista((l) => [...l, a])
      window.setTimeout(() => setLista((l) => l.filter((x) => x.id !== a.id)), a.tipo === 'error' ? 6000 : 3500)
    }
    avisos.add(f)
    return () => {
      avisos.delete(f)
    }
  }, [])
  return (
    <div className="toast-container position-fixed top-0 start-50 translate-middle-x p-3 avisos" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={'toast show border-0 mb-2 ' + (a.tipo === 'ok' ? 'text-bg-success' : 'text-bg-danger')} role="alert">
          <div className="toast-body d-flex align-items-center gap-2 fw-semibold">
            <Icono nombre={a.tipo === 'ok' ? 'check' : 'alerta'} size={18} /> {a.texto}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ ventana modal (clases de Bootstrap, sin su JavaScript) ------------------------------ */
export function Modal({ titulo, onCerrar, children, pie }: { titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [onCerrar])
  return (
    <div className="modal d-block modal-fondo" tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo} onClick={onCerrar}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{titulo}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onCerrar} />
          </div>
          <div className="modal-body">{children}</div>
          {pie && <div className="modal-footer">{pie}</div>}
        </div>
      </div>
    </div>
  )
}

/** El color de la marca del negocio viene del servidor: al conocerlo, toda la interfaz lo usa. */
export function useMarca(config: Pick<Config, 'colorMarca'> | null) {
  const color = config?.colorMarca
  useEffect(() => {
    if (color) fijarMarca(color)
  }, [color])
}

/* ------------------------------ carga de datos ------------------------------ */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const ultima = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recargar = useCallback(async () => {
    const mia = ++ultima.current
    setCargando(true)
    try {
      const r = await fnRef.current()
      if (mia === ultima.current) {
        setDatos(r)
        setError('')
      }
    } catch (e) {
      if (mia === ultima.current) setError(mensajeError(e))
    } finally {
      if (mia === ultima.current) setCargando(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void recargar() }, [recargar, ...deps])
  return { datos, error, cargando, recargar }
}

export function Estado({ cargando, error, onReintentar }: { cargando: boolean; error: string; onReintentar: () => void }) {
  if (error)
    return (
      <div className="card shadow-sm mb-3 p-3">
        <p className="text-danger fw-semibold">{error}</p>
        <button className="btn btn-outline-secondary" onClick={onReintentar}>Reintentar</button>
      </div>
    )
  if (cargando) return <p className="text-center text-secondary py-4">Cargando…</p>
  return null
}

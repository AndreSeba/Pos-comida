import { useState } from 'react'
import { api } from '../api'
import type { CatalogoAuditoria, RegistroAuditoria } from '../types'
import { Estado, useCarga } from '../ui'
import { fechaCorta, horaCorta } from '../util'
import { Paginador, usePaginas } from '../paginacion'

type Json = Record<string, unknown>

const leer = (t: string | null): Json | null => {
  if (!t) return null
  try {
    const v = JSON.parse(t)
    return v && typeof v === 'object' ? (v as Json) : { valor: v }
  } catch {
    return { valor: t }
  }
}

const texto = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Quién hizo qué y cuándo. Lo que cambió se ve campo por campo (antes → después). */
export default function Auditoria() {
  const cat = useCarga(() => api.get<CatalogoAuditoria>('/api/auditoria/catalogo'))
  const [entidad, setEntidad] = useState('')
  const [accion, setAccion] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)

  const consulta = new URLSearchParams()
  if (entidad) consulta.set('entidad', entidad)
  if (accion) consulta.set('accion', accion)
  if (usuarioId) consulta.set('usuarioId', usuarioId)
  if (desde) consulta.set('desde', new Date(`${desde}T00:00:00`).toISOString())
  if (hasta) consulta.set('hasta', new Date(`${hasta}T23:59:59`).toISOString())
  consulta.set('limite', '200')
  const filtro = consulta.toString()
  const regs = useCarga(() => api.get<RegistroAuditoria[]>(`/api/auditoria?${filtro}`), [filtro])

  const pag = usePaginas(regs.datos ?? [])
  const hayFiltro = !!(entidad || accion || usuarioId || desde || hasta)

  return (
    <section className="card shadow-sm mb-3 p-3">
      <h3 className="h5">Auditoría</h3>
      <p className="text-secondary">Registro de lo que se hizo en el sistema: quién, cuándo y qué cambió. No se puede editar ni borrar.</p>
      <div className="row g-2 mb-2">
        <div className="col-6 col-md-3">
          <select className="form-select" aria-label="Qué" value={entidad} onChange={(e) => setEntidad(e.target.value)}>
            <option value="">Todo</option>
            {cat.datos?.entidades.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3">
          <select className="form-select" aria-label="Acción" value={accion} onChange={(e) => setAccion(e.target.value)}>
            <option value="">Toda acción</option>
            {cat.datos?.acciones.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="col-12 col-md-3">
          <select className="form-select" aria-label="Persona" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            <option value="">Cualquier persona</option>
            {cat.datos?.usuarios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3"><input className="form-control" type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="col-6 col-md-3"><input className="form-control" type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        {hayFiltro && (
          <div className="col-12 col-md-auto">
            <button className="btn btn-outline-secondary" onClick={() => { setEntidad(''); setAccion(''); setUsuarioId(''); setDesde(''); setHasta('') }}>Quitar filtros</button>
          </div>
        )}
      </div>

      <Estado cargando={regs.cargando && !regs.datos} error={regs.error} onReintentar={regs.recargar} />
      {regs.datos && !regs.datos.length && <p className="text-center text-secondary py-4">No hay registros con estos filtros</p>}
      <div className="list-group list-group-flush">
        {pag.visibles.map((r) => (
          <div key={r.id} className="list-group-item px-0 bg-transparent">
            <button type="button" className="btn p-0 w-100 text-start d-flex justify-content-between gap-3 border-0" aria-expanded={abierto === r.id} onClick={() => setAbierto(abierto === r.id ? null : r.id)}>
              <span>
                <strong>{r.accion}</strong> · {r.entidad}{r.entidadId && r.entidadId !== '0' ? ` #${r.entidadId}` : ''}
                <span className="d-block small text-secondary">{r.usuario || 'Sistema'}{r.motivo ? ` · ${r.motivo}` : ''}</span>
              </span>
              <span className="small text-secondary text-end flex-shrink-0">{fechaCorta(r.fecha)}<br />{horaCorta(r.fecha)}</span>
            </button>
            {abierto === r.id && <Cambios r={r} />}
          </div>
        ))}
      </div>
      <Paginador p={pag} />
      {regs.datos && regs.datos.length >= 200 && <p className="small text-secondary mt-2 mb-0">Se muestran los 200 más recientes. Usa los filtros para acotar.</p>}
    </section>
  )
}

function Cambios({ r }: { r: RegistroAuditoria }) {
  const antes = leer(r.valorAnterior)
  const despues = leer(r.valorNuevo)
  const campos = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])]
  // en un cambio solo interesan los campos distintos; en alta o baja, todos
  const filas = campos.filter((c) => !(antes && despues) || texto(antes[c]) !== texto(despues[c]))
  if (!filas.length) return <p className="small text-secondary mt-2 mb-0">Sin detalle.</p>
  return (
    <div className="table-responsive mt-2">
      <table className="table table-sm mb-0 small">
        <thead>
          <tr><th>Campo</th>{antes && <th>Antes</th>}{despues && <th>Después</th>}</tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c}>
              <td className="text-secondary">{c}</td>
              {antes && <td className="text-break">{texto(antes[c])}</td>}
              {despues && <td className="text-break fw-semibold">{texto(despues[c])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

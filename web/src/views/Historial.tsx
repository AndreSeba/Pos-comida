import { api } from '../api'
import type { VentaAdmin } from '../types'
import { Estado, avisarError, useCarga } from '../ui'
import { fechaCorta, horaCorta, money, pagosTexto } from '../util'
import { Icono } from '../Icono'
import { Paginador, usePaginas } from '../paginacion'

export default function Historial({ moneda: m }: { moneda: string }) {
  const r = useCarga(() => api.get<VentaAdmin[]>('/api/ventas?limite=100'))
  const pag = usePaginas(r.datos ?? [])

  const cambiar = async (v: VentaAdmin) => {
    if (!v.anulada && !confirm('¿Anular esta venta? Dejará de contar en los reportes.')) return
    try {
      await api.put(`/api/ventas/${v.id}/anulada`, !v.anulada)
      await r.recargar()
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <section className="card shadow-sm mb-3 p-3">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <h3 className="h5">Últimas ventas</h3>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => void r.recargar()}><Icono nombre="refrescar" size={16} /> Actualizar</button>
      </div>
      <Estado cargando={r.cargando && !r.datos} error={r.error} onReintentar={r.recargar} />
      {r.datos && !r.datos.length && <p className="text-center text-secondary py-4">Todavía no hay ventas</p>}
      <div className="list-group list-group-flush">
        {pag.visibles.map((v) => (
          <div key={v.id} className={'list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent' + (v.anulada ? ' opacity-50' : '')}>
            <div>
              <strong>{money(v.total, m)}</strong>{' '}
              <small className="text-secondary">
                {fechaCorta(v.fecha)} {horaCorta(v.fecha)} · {v.vendedor} · {pagosTexto(v, m)}{v.etiqueta ? ` · ${v.etiqueta}` : ''}
              </small>
              <div className="text-secondary small">
                {v.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}
                {v.nota && ` — “${v.nota}”`}
                {v.anulada && ' — ANULADA'}
              </div>
            </div>
            <button className={'btn btn-sm ' + (v.anulada ? 'btn-outline-secondary' : 'btn-outline-danger')} onClick={() => void cambiar(v)}>
              {v.anulada ? 'Restaurar' : 'Anular'}
            </button>
          </div>
        ))}
      </div>
      <Paginador p={pag} />
    </section>
  )
}

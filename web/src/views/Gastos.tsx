import { useState } from 'react'
import { api } from '../api'
import type { Gasto } from '../types'
import { Estado, avisar, avisarError, useCarga } from '../ui'
import { fechaCorta, money, num } from '../util'
import { Icono } from '../Icono'
import { Paginador, usePaginas } from '../paginacion'

const CATEGORIAS = ['Insumos', 'Alquiler', 'Servicios', 'Sueldos', 'Gas', 'Transporte', 'Otros']

const aInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Gastos({ moneda: m }: { moneda: string }) {
  const g = useCarga(() => api.get<Gasto[]>('/api/gastos'))
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [fecha, setFecha] = useState(aInput(new Date()))
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!concepto.trim() || num(monto) <= 0 || guardando) return
    const [y, mo, d] = fecha.split('-').map(Number)
    setGuardando(true)
    try {
      // mediodía local: evita que una zona horaria lo mande al día anterior
      await api.post('/api/gastos', {
        fecha: new Date(y, mo - 1, d, 12).toISOString(), concepto: concepto.trim(), categoria, monto: num(monto),
      })
      setConcepto('')
      setMonto('')
      avisar('Gasto guardado')
      await g.recargar()
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (x: Gasto) => {
    if (!confirm(`¿Borrar el gasto "${x.concepto}"?`)) return
    try {
      await api.del(`/api/gastos/${x.id}`)
      await g.recargar()
    } catch (e) {
      avisarError(e)
    }
  }

  const lista = g.datos ?? []
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
  const delMes = lista.filter((x) => new Date(x.fecha).getTime() >= inicioMes)
  const totalMes = delMes.reduce((s, x) => s + x.monto, 0)
  const porCat = new Map<string, number>()
  for (const x of delMes) porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + x.monto)
  const pag = usePaginas(lista)
  const categorias = Array.from(new Set([...CATEGORIAS, ...lista.map((x) => x.categoria)]))

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Anotar un gasto</h3>
        <div className="row g-3 my-1">
          <label className="col-12"><span className="form-label small fw-semibold text-secondary mb-1">¿En qué gastaste?</span>
            <input className="form-control" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Compra de carne, alquiler, gas…" />
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Monto ({m})</span>
            <input className="form-control" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Categoría</span>
            <select className="form-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Fecha</span>
            <input className="form-control" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        <button className="btn btn-primary" onClick={() => void guardar()} disabled={!concepto.trim() || num(monto) <= 0 || guardando}>Guardar gasto</button>
      </section>

      <Estado cargando={g.cargando && !g.datos} error={g.error} onReintentar={g.recargar} />

      {g.datos && (
        <>
          <section className="card shadow-sm mb-3 p-3">
            <h3 className="h5">Este mes: {money(totalMes, m)}</h3>
            <div className="d-flex flex-wrap gap-2">
              {[...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                <span key={c} className="badge rounded-pill text-bg-secondary fs-6 fw-semibold">{c}: {money(v, m)}</span>
              ))}
              {!porCat.size && <p className="text-center text-secondary py-4">Sin gastos este mes</p>}
            </div>
          </section>

          <section className="card shadow-sm mb-3 p-3">
            <h3 className="h5">Últimos gastos</h3>
            <div className="list-group list-group-flush">
              {pag.visibles.map((x) => (
                <div key={x.id} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent">
                  <div>
                    <strong>{x.concepto}</strong>
                    <div className="text-secondary small">{fechaCorta(x.fecha)} · {x.categoria}</div>
                  </div>
                  <div className="d-flex align-items-center gap-2 mt-2">
                    <strong>{money(x.monto, m)}</strong>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => void borrar(x)} aria-label={`Borrar ${x.concepto}`}><Icono nombre="x" size={16} /></button>
                  </div>
                </div>
              ))}
              {!lista.length && <p className="text-center text-secondary py-4">Aún no anotaste gastos</p>}
            </div>
            <Paginador p={pag} />
          </section>
        </>
      )}
    </>
  )
}

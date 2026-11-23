import { useState } from 'react'
import { api } from '../api'
import type { Ingrediente, UnidadCompra } from '../types'
import { avisar, avisarError } from '../ui'
import { aBase, baseDe, costoUnitario, money, num } from '../util'
import type { Catalogo } from './Admin'
import { Icono } from '../Icono'
import { Paginador, usePaginas } from '../paginacion'

const UNIDADES: UnidadCompra[] = ['kg', 'g', 'l', 'ml', 'u']
const ETIQ: Record<UnidadCompra, string> = { kg: 'kilos', g: 'gramos', l: 'litros', ml: 'ml', u: 'unidades' }

export default function Ingredientes({ cat }: { cat: Catalogo }) {
  const m = cat.config.moneda
  const [nombre, setNombre] = useState('')
  const [cant, setCant] = useState('1')
  const [unidad, setUnidad] = useState<UnidadCompra>('kg')
  const [precio, setPrecio] = useState('')
  const [stockIni, setStockIni] = useState('')
  const [stockMin, setStockMin] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [guardando, setGuardando] = useState(false)

  const limpiar = () => {
    setNombre('')
    setCant('1')
    setUnidad('kg')
    setPrecio('')
    setStockIni('')
    setStockMin('')
    setEditId(null)
  }

  const guardar = async () => {
    if (!nombre.trim() || num(cant) <= 0 || guardando) return
    setGuardando(true)
    const cuerpo = { nombre: nombre.trim(), unidad: baseDe(unidad), cantidad: aBase(num(cant), unidad), precio: num(precio), stockMinimo: aBase(num(stockMin), unidad), ...(editId ? {} : { stock: aBase(num(stockIni), unidad) }) }
    try {
      if (editId) await api.put(`/api/ingredientes/${editId}`, cuerpo)
      else await api.post('/api/ingredientes', cuerpo)
      await cat.recargar()
      avisar(editId ? 'Ingrediente actualizado' : 'Ingrediente agregado')
      limpiar()
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  const editar = (i: Ingrediente) => {
    setEditId(i.id)
    setNombre(i.nombre)
    const grande = i.unidad !== 'u' && i.cantidad >= 1000 && i.cantidad % 1000 === 0
    setUnidad(grande ? (i.unidad === 'g' ? 'kg' : 'l') : i.unidad)
    setCant(String(grande ? i.cantidad / 1000 : i.cantidad))
    setPrecio(String(i.precio))
    setStockMin(i.stockMinimo ? String(grande ? i.stockMinimo / 1000 : i.stockMinimo) : '')
    setStockIni('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const borrar = async (i: Ingrediente) => {
    if (!confirm(`¿Borrar "${i.nombre}"?`)) return
    try {
      await api.del(`/api/ingredientes/${i.id}`)
      await cat.recargar()
      avisar('Ingrediente borrado')
    } catch (e) {
      avisarError(e)
    }
  }

  const usos = (id: number) => cat.productos.filter((p) => p.receta.some((l) => l.ingredienteId === id)).length
  const lista = cat.ingredientes
    .filter((i) => i.nombre.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  const pag = usePaginas(lista)

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">{editId ? 'Editar ingrediente' : 'Nuevo ingrediente'}</h3>
        <p className="text-secondary">Anota lo que compras y cuánto pagaste; el costo por gramo, ml o unidad se calcula solo.</p>
        <div className="row g-3 my-1">
          <label className="col-12"><span className="form-label small fw-semibold text-secondary mb-1">Nombre</span>
            <input className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Carne molida" />
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Compré</span>
            <input className="form-control" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} />
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Unidad</span>
            <select className="form-select" value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadCompra)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{ETIQ[u]}</option>)}
            </select>
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Pagué ({m})</span>
            <input className="form-control" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="70" />
          </label>
          {!editId && (
            <label className="col-12 col-sm-6"><span className="form-label small fw-semibold text-secondary mb-1">Tengo ahora ({unidad}) · opcional</span>
              <input className="form-control" inputMode="decimal" value={stockIni} onChange={(e) => setStockIni(e.target.value)} placeholder="Lo que hay hoy en el local" />
            </label>
          )}
          <label className="col-12 col-sm-6"><span className="form-label small fw-semibold text-secondary mb-1">Avisar cuando quede menos de ({unidad}) · opcional</span>
            <input className="form-control" inputMode="decimal" value={stockMin} onChange={(e) => setStockMin(e.target.value)} placeholder="0 = sin aviso" />
          </label>
        </div>
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-primary" onClick={() => void guardar()} disabled={!nombre.trim() || guardando}>
            {editId ? 'Guardar cambios' : 'Agregar'}
          </button>
          {editId && <button className="btn btn-outline-secondary" onClick={limpiar}>Cancelar</button>}
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <div className="d-flex justify-content-between align-items-center gap-2">
          <h3 className="h5">Ingredientes ({lista.length})</h3>
          <input className="form-control search" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {!lista.length && <p className="text-center text-secondary py-4">No hay ingredientes</p>}
        <div className="list-group list-group-flush">
          {pag.visibles.map((i) => {
            const cu = costoUnitario(i)
            return (
              <div key={i.id} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent">
                <div>
                  <strong>{i.nombre}</strong>
                  <small className="text-secondary"> · {i.cantidad} {i.unidad} por {money(i.precio, m)}</small>
                  <div className="text-secondary small">
                    {i.unidad === 'u' ? `${money(cu, m)} c/u` : `${money(cu * 1000, m)} por ${i.unidad === 'g' ? 'kg' : 'litro'}`} · usado en {usos(i.id)} producto(s)
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2 mt-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => editar(i)}>Editar</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => void borrar(i)} aria-label={`Borrar ${i.nombre}`}><Icono nombre="x" size={16} /></button>
                </div>
              </div>
            )
          })}
        </div>
        <Paginador p={pag} />
      </section>
    </>
  )
}

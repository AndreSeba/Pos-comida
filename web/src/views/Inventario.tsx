import { useState } from 'react'
import { api } from '../api'
import type { CompraRegistrada, Ingrediente, Movimiento, Sesion, TipoMovimiento, UnidadCompra } from '../types'
import { Estado, Modal, avisar, avisarError, useCarga } from '../ui'
import { aBase, cantidadTexto, fechaCorta, horaCorta, money, num, puede } from '../util'
import type { Catalogo } from './Admin'
import { Icono } from '../Icono'
import { Paginador, usePaginas } from '../paginacion'

const ETIQUETA_MOV: Record<TipoMovimiento, string> = {
  Inicial: 'Stock inicial',
  Compra: 'Compra',
  Venta: 'Venta',
  AnulacionVenta: 'Venta anulada (devuelve)',
  Ajuste: 'Ajuste por conteo',
  RestauracionVenta: 'Venta restaurada',
}

/** unidades en las que se puede escribir una cantidad de este insumo */
const unidadesDe = (i: Ingrediente): UnidadCompra[] => (i.unidad === 'g' ? ['g', 'kg'] : i.unidad === 'ml' ? ['ml', 'l'] : ['u'])

type Fila = { ingredienteId: number; cant: string; unidad: UnidadCompra; total: string }

export default function Inventario({ cat, sesion }: { cat: Catalogo; sesion: Sesion }) {
  const m = cat.config.moneda
  const puedeComprar = puede(sesion, 'inventario.compras')
  const puedeAjustar = puede(sesion, 'inventario.ajustar')
  const [busca, setBusca] = useState('')
  const [soloReponer, setSoloReponer] = useState(false)
  const [comprando, setComprando] = useState(false)
  const [ajustando, setAjustando] = useState<Ingrediente | null>(null)
  const [historial, setHistorial] = useState<Ingrediente | null>(null)
  const compras = useCarga(() => api.get<CompraRegistrada[]>('/api/inventario/compras'))

  const estado = (i: Ingrediente) => (i.stock < 0 ? 'neg' : i.stockMinimo > 0 && i.stock <= i.stockMinimo ? 'bajo' : 'ok')
  const lista = cat.ingredientes
    .filter((i) => i.nombre.toLowerCase().includes(busca.toLowerCase()))
    .filter((i) => !soloReponer || estado(i) !== 'ok')
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  const pag = usePaginas(lista)
  const pagCompras = usePaginas(compras.datos ?? [], 8)
  const nReponer = cat.ingredientes.filter((i) => estado(i) !== 'ok').length

  if (comprando)
    return (
      <FormCompra
        cat={cat}
        onCerrar={() => setComprando(false)}
        onHecha={async () => {
          setComprando(false)
          await Promise.all([cat.recargar(), compras.recargar()])
        }}
      />
    )

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <h3 className="h5 mb-0">Inventario de insumos</h3>
          {puedeComprar && <button className="btn btn-primary" onClick={() => setComprando(true)}>+ Registrar compra</button>}
        </div>
        <p className="text-secondary mt-2 mb-2">
          Esto es lo que <strong>debería haber</strong>: sube con las compras y baja solo con cada venta, según la receta. Si todavía no anotaste una compra, puede quedar en negativo; cuando la registres o cuentes lo que hay, se corrige.
        </p>
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <input className="form-control search" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="form-check form-switch mb-0">
            <input className="form-check-input" type="checkbox" role="switch" id="solo-reponer" checked={soloReponer} onChange={(e) => setSoloReponer(e.target.checked)} />
            <label className="form-check-label" htmlFor="solo-reponer">Solo por reponer {nReponer > 0 && <span className="badge rounded-pill text-bg-danger">{nReponer}</span>}</label>
          </div>
        </div>
        {!lista.length && <p className="text-center text-secondary py-4">{cat.ingredientes.length ? 'Nada que mostrar' : 'Primero agrega insumos en la pestaña Ingredientes.'}</p>}
        <div className="list-group list-group-flush mt-2">
          {pag.visibles.map((i) => {
            const e = estado(i)
            return (
              <div key={i.id} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent flex-wrap">
                <div>
                  <strong>{i.nombre}</strong>{' '}
                  {e === 'neg' && <span className="badge text-bg-danger">Negativo: falta anotar una compra</span>}
                  {e === 'bajo' && <span className="badge text-bg-warning">Por reponer</span>}
                  <div className={'fs-5 fw-semibold ' + (e === 'neg' ? 'text-danger' : e === 'bajo' ? 'text-warning-emphasis' : '')}>{cantidadTexto(i.stock, i.unidad)}</div>
                  <small className="text-secondary">{i.stockMinimo > 0 ? `Mínimo ${cantidadTexto(i.stockMinimo, i.unidad)}` : 'Sin mínimo'}</small>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setHistorial(i)}>Historial</button>
                  {puedeAjustar && <button className="btn btn-sm btn-outline-primary" onClick={() => setAjustando(i)}>Ajustar</button>}
                </div>
              </div>
            )
          })}
        </div>
        <Paginador p={pag} />
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Compras recientes</h3>
        <Estado cargando={compras.cargando && !compras.datos} error={compras.error} onReintentar={compras.recargar} />
        {compras.datos && !compras.datos.length && <p className="text-secondary mb-0">Todavía no registraste compras.</p>}
        <div className="list-group list-group-flush">
          {pagCompras.visibles.map((c) => (
            <div key={c.id} className="list-group-item px-0 bg-transparent">
              <div className="d-flex justify-content-between gap-2">
                <strong>{c.proveedor || 'Sin proveedor'}</strong>
                <strong>{money(c.total, m)}</strong>
              </div>
              <div className="small text-secondary">{fechaCorta(c.fecha)} · {c.usuario}{c.nota && ` · ${c.nota}`}</div>
              <div className="small">{c.items.map((x) => x.nombre).join(', ')}</div>
            </div>
          ))}
        </div>
        <Paginador p={pagCompras} />
      </section>

      {ajustando && (
        <Ajuste
          ing={ajustando}
          onCerrar={() => setAjustando(null)}
          onHecho={async () => {
            setAjustando(null)
            await cat.recargar()
          }}
        />
      )}
      {historial && <Historial ing={historial} onCerrar={() => setHistorial(null)} />}
    </>
  )
}

/* ------------------------------ registrar compra ------------------------------ */
function FormCompra({ cat, onCerrar, onHecha }: { cat: Catalogo; onCerrar: () => void; onHecha: () => Promise<void> }) {
  const m = cat.config.moneda
  const nuevaFila = (usados: number[]): Fila | null => {
    const i = cat.ingredientes.find((x) => !usados.includes(x.id))
    return i ? { ingredienteId: i.id, cant: '', unidad: unidadesDe(i)[unidadesDe(i).length - 1], total: '' } : null
  }
  const [proveedor, setProveedor] = useState('')
  const [nota, setNota] = useState('')
  const [filas, setFilas] = useState<Fila[]>(() => {
    const f = nuevaFila([])
    return f ? [f] : []
  })
  const [actualizarCostos, setActualizarCostos] = useState(true)
  const [registrarGasto, setRegistrarGasto] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const total = filas.reduce((s, f) => s + num(f.total), 0)
  const validas = filas.filter((f) => num(f.cant) > 0 && num(f.total) >= 0 && f.total !== '')
  const cambiar = (idx: number, c: Partial<Fila>) => setFilas(filas.map((f, i) => (i === idx ? { ...f, ...c } : f)))
  const agregar = () => {
    const f = nuevaFila(filas.map((x) => x.ingredienteId))
    if (f) setFilas([...filas, f])
    else avisar('Ya agregaste todos los insumos', 'error')
  }

  const guardar = async () => {
    if (!validas.length || guardando) return
    setGuardando(true)
    try {
      await api.post('/api/inventario/compras', {
        proveedor: proveedor.trim(),
        nota: nota.trim(),
        actualizarCostos,
        registrarGasto,
        items: validas.map((f) => ({ ingredienteId: f.ingredienteId, cantidad: aBase(num(f.cant), f.unidad), total: num(f.total) })),
      })
      avisar('Compra registrada: el inventario se actualizó')
      await onHecha()
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="card shadow-sm mb-3 p-3">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <h3 className="h5 mb-0">Registrar compra</h3>
        <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={onCerrar}><Icono nombre="atras" size={16} /> Volver</button>
      </div>
      <p className="text-secondary mt-2">Anota lo que compraste y cuánto pagaste en total por cada cosa. Sirve para platos, empaques, carne, verduras… cualquier insumo que tengas creado.</p>
      <div className="row g-3 mb-2">
        <label className="col-12 col-sm-6"><span className="form-label small fw-semibold text-secondary mb-1">Proveedor (opcional)</span>
          <input className="form-control" value={proveedor} maxLength={80} onChange={(e) => setProveedor(e.target.value)} placeholder="Mercado, distribuidora…" />
        </label>
        <label className="col-12 col-sm-6"><span className="form-label small fw-semibold text-secondary mb-1">Nota (opcional)</span>
          <input className="form-control" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} />
        </label>
      </div>

      {filas.map((f, idx) => {
        const ing = cat.ingredientes.find((i) => i.id === f.ingredienteId)!
        const usados = filas.map((x) => x.ingredienteId)
        return (
          <div key={idx} className="row g-2 align-items-center mb-2">
            <div className="col-12 col-md-4">
              <select
                className="form-select"
                aria-label="Insumo"
                value={f.ingredienteId}
                onChange={(e) => {
                  const nuevo = cat.ingredientes.find((i) => i.id === Number(e.target.value))!
                  cambiar(idx, { ingredienteId: nuevo.id, unidad: unidadesDe(nuevo)[unidadesDe(nuevo).length - 1] })
                }}
              >
                {cat.ingredientes.map((i) => <option key={i.id} value={i.id} disabled={usados.includes(i.id) && i.id !== f.ingredienteId}>{i.nombre}</option>)}
              </select>
            </div>
            <div className="col-7 col-md-3">
              <div className="input-group">
                <input className="form-control" aria-label="Cantidad comprada" inputMode="decimal" placeholder="Cantidad" value={f.cant} onChange={(e) => cambiar(idx, { cant: e.target.value })} />
                {unidadesDe(ing).length > 1 ? (
                  <select className="form-select flex-grow-0 w-auto" aria-label="Unidad" value={f.unidad} onChange={(e) => cambiar(idx, { unidad: e.target.value as UnidadCompra })}>
                    {unidadesDe(ing).map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : (
                  <span className="input-group-text">u</span>
                )}
              </div>
            </div>
            <div className="col-5 col-md-3">
              <div className="input-group">
                <span className="input-group-text">{m}</span>
                <input className="form-control" aria-label="Total pagado" inputMode="decimal" placeholder="Pagué" value={f.total} onChange={(e) => cambiar(idx, { total: e.target.value })} />
              </div>
            </div>
            <div className="col-auto ms-auto">
              {filas.length > 1 && <button className="btn btn-sm btn-outline-danger" aria-label="Quitar" onClick={() => setFilas(filas.filter((_, i) => i !== idx))}><Icono nombre="x" size={16} /></button>}
            </div>
          </div>
        )
      })}
      <button className="btn btn-outline-secondary align-self-start" onClick={agregar}>+ Agregar otro insumo</button>

      <div className="d-grid gap-2 mt-3">
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="c-costos" checked={actualizarCostos} onChange={(e) => setActualizarCostos(e.target.checked)} />
          <label className="form-check-label" htmlFor="c-costos">Actualizar el costo de estos insumos con este precio (cambia lo que cuesta cada producto)</label>
        </div>
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="c-gasto" checked={registrarGasto} onChange={(e) => setRegistrarGasto(e.target.checked)} />
          <label className="form-check-label" htmlFor="c-gasto">Anotarla también como gasto de «Insumos»</label>
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between gap-2 mt-3 flex-wrap">
        <strong className="fs-5">Total: {money(total, m)}</strong>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!validas.length || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Registrar compra'}</button>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ ajustar por conteo ------------------------------ */
function Ajuste({ ing, onCerrar, onHecho }: { ing: Ingrediente; onCerrar: () => void; onHecho: () => Promise<void> }) {
  const opciones = unidadesDe(ing)
  const [unidad, setUnidad] = useState<UnidadCompra>(opciones[0])
  const [real, setReal] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const stockReal = aBase(num(real), unidad)
  const dif = stockReal - ing.stock

  const guardar = async () => {
    if (real.trim() === '' || guardando) return
    setGuardando(true)
    try {
      await api.post('/api/inventario/ajustes', { ingredienteId: ing.id, stockReal, motivo: motivo.trim() })
      avisar('Inventario ajustado')
      await onHecho()
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo={`Ajustar ${ing.nombre}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn btn-outline-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" disabled={real.trim() === '' || guardando} onClick={() => void guardar()}>Guardar ajuste</button>
        </>
      }
    >
      <p className="text-secondary">Cuenta lo que hay de verdad. El sistema anota la diferencia y el motivo.</p>
      <p className="mb-2">El sistema dice que hay: <strong>{cantidadTexto(ing.stock, ing.unidad)}</strong></p>
      <label className="form-label small fw-semibold text-secondary mb-1">Lo que hay realmente</label>
      <div className="input-group mb-2">
        <input className="form-control" inputMode="decimal" autoFocus value={real} onChange={(e) => setReal(e.target.value)} placeholder="0" />
        {opciones.length > 1 ? (
          <select className="form-select flex-grow-0 w-auto" aria-label="Unidad" value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadCompra)}>
            {opciones.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span className="input-group-text">u</span>
        )}
      </div>
      {real.trim() !== '' && (
        <p className={'fw-semibold ' + (dif === 0 ? 'text-secondary' : dif > 0 ? 'text-success' : 'text-danger')}>
          {dif === 0 ? 'Sin diferencia' : `${dif > 0 ? 'Sobran' : 'Faltan'} ${cantidadTexto(Math.abs(dif), ing.unidad)}`}
        </p>
      )}
      <label className="form-label small fw-semibold text-secondary mb-1">Motivo (opcional)</label>
      <input className="form-control" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Conteo del cierre, merma, se cayó…" />
    </Modal>
  )
}

/* ------------------------------ historial (kardex) ------------------------------ */
function Historial({ ing, onCerrar }: { ing: Ingrediente; onCerrar: () => void }) {
  const mov = useCarga(() => api.get<Movimiento[]>(`/api/inventario/movimientos?ingredienteId=${ing.id}`))
  const pagMov = usePaginas(mov.datos ?? [], 8)
  return (
    <Modal titulo={`Historial · ${ing.nombre}`} onCerrar={onCerrar}>
      <Estado cargando={mov.cargando && !mov.datos} error={mov.error} onReintentar={mov.recargar} />
      {mov.datos && !mov.datos.length && <p className="text-secondary">Sin movimientos todavía.</p>}
      <div className="list-group list-group-flush">
        {pagMov.visibles.map((x) => (
          <div key={x.id} className="list-group-item px-0 bg-transparent d-flex justify-content-between gap-3">
            <div>
              <strong>{ETIQUETA_MOV[x.tipo] ?? x.tipo}</strong>
              <div className="small text-secondary">
                {fechaCorta(x.fecha)} {horaCorta(x.fecha)}{x.usuario && ` · ${x.usuario}`}{x.ventaId && ` · venta #${x.ventaId}`}{x.nota && ` · ${x.nota}`}
              </div>
            </div>
            <div className="text-end flex-shrink-0">
              <div className={x.cantidad >= 0 ? 'text-success fw-semibold' : 'text-danger fw-semibold'}>{x.cantidad > 0 ? '+' : ''}{cantidadTexto(x.cantidad, ing.unidad)}</div>
              <div className="small text-secondary">queda {cantidadTexto(x.saldo, ing.unidad)}</div>
            </div>
          </div>
        ))}
      </div>
      <Paginador p={pagMov} />
    </Modal>
  )
}

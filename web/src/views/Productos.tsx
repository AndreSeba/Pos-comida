import { useMemo, useState } from 'react'
import { api } from '../api'
import type { LineaReceta, Producto, ProductoGuardar, UnidadCompra } from '../types'
import { avisar, avisarError } from '../ui'
import { aBase, costoReceta, costoUnitario, margenReal, money, num, pct, precioSugerido } from '../util'
import type { Catalogo } from './Admin'
import { Icono } from '../Icono'
import { ICONOS_PRODUCTO } from '../iconos'
import { Galeria, aGuardar, aItems, type ItemImagen } from '../Galeria'
import { Paginador, usePaginas } from '../paginacion'

/** galeria es la lista de imágenes en edición; galeriaTocada dice si hay que enviarla al guardar */
type Borrador = Omit<ProductoGuardar, 'imagenes'> & { id: number | null; galeria: ItemImagen[]; galeriaTocada: boolean }

const nuevo = (): Borrador => ({
  id: null, nombre: '', categoria: '', icono: 'plato', receta: [], porciones: 1, otros: 0, margenObjetivo: 65, precio: 0, activo: true,
  descripcion: '', enCarta: true, costoManual: null, galeria: [], galeriaTocada: false,
})

const aBorrador = (p: Producto): Borrador => ({
  id: p.id, nombre: p.nombre, categoria: p.categoria, icono: p.icono, receta: p.receta.map((l) => ({ ...l })),
  porciones: p.porciones, otros: p.otros, margenObjetivo: p.margenObjetivo, precio: p.precio, activo: p.activo,
  descripcion: p.descripcion, enCarta: p.enCarta, costoManual: p.costoManual, galeria: aItems(p.imagenes), galeriaTocada: false,
})

export default function Productos({ cat }: { cat: Catalogo }) {
  const m = cat.config.moneda
  const [b, setB] = useState<Borrador | null>(null)
  const [precioTxt, setPrecioTxt] = useState('')
  const pag = usePaginas(cat.productos)

  const empezar = (x: Borrador) => {
    setB(x)
    setPrecioTxt(x.precio ? String(x.precio) : '')
  }

  const alternarAgotado = async (p: Producto) => {
    try {
      await api.put(`/api/pedidos/productos/${p.id}/agotado`, { agotado: !p.agotado })
      await cat.recargar()
    } catch (e) {
      avisarError(e)
    }
  }

  const borrar = async (p: Producto) => {
    if (!confirm(`¿Borrar "${p.nombre}"? Las ventas ya hechas no se pierden.`)) return
    try {
      await api.del(`/api/productos/${p.id}`)
      await cat.recargar()
      avisar('Producto borrado')
    } catch (e) {
      avisarError(e)
    }
  }

  if (b) return <Editor cat={cat} b={b} setB={setB} precioTxt={precioTxt} setPrecioTxt={setPrecioTxt} onCerrar={() => setB(null)} />

  return (
    <section className="card shadow-sm mb-3 p-3">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <h3 className="h5 mb-0">Productos y costos</h3>
        <button className="btn btn-primary" onClick={() => empezar(nuevo())}>+ Nuevo producto</button>
      </div>
      <p className="text-secondary">Cada producto tiene su receta: aquí ves cuánto te cuesta hacerlo y cuánto ganas al venderlo.</p>
      {!cat.productos.length && <p className="text-center text-secondary py-4">Crea tu primer producto para empezar a vender</p>}
      <div className="list-group list-group-flush">
        {pag.visibles.map((x) => {
          const mr = margenReal(x.precio, x.costo)
          return (
            <div key={x.id} className={'list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent' + (x.activo ? '' : ' opacity-50')}>
              <div className="d-flex align-items-center gap-3 min-w-0">
                <span className="prod-ico">{x.imagenes[0] ? <img className="prod-foto" src={x.imagenes[0].url} alt="" loading="lazy" /> : <Icono nombre={x.icono} size={26} />}</span>
                <div>
                  <strong>{x.nombre}</strong> <small className="text-secondary">· {x.categoria || 'Sin categoría'}</small>
                  <div className="text-secondary small">
                    Costo {money(x.costo, m)}{x.costoManual !== null && ' (tuyo)'} · Precio {money(x.precio, m)} ·{' '}
                    <b className={mr >= 50 ? 'text-success' : mr >= 30 ? 'text-warning' : 'text-danger'}>ganas {money(x.precio - x.costo, m)} ({pct(mr)})</b>
                    {!x.activo && ' · oculto en ventas'}
                    {x.agotado && <b className="text-danger"> · AGOTADO</b>}
                  </div>
                </div>
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <button className={'btn btn-sm ' + (x.agotado ? 'btn-danger' : 'btn-outline-secondary')} onClick={() => void alternarAgotado(x)} title="Los clientes no pueden pedir un producto agotado desde la mesa">{x.agotado ? 'Volver a vender' : 'Se acabó'}</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => empezar(aBorrador(x))}>Editar</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => void borrar(x)} aria-label={`Borrar ${x.nombre}`}><Icono nombre="x" size={16} /></button>
              </div>
            </div>
          )
        })}
      </div>
      <Paginador p={pag} />
    </section>
  )
}

const grande = (u?: UnidadCompra) => u === 'kg' || u === 'l'

function Editor({
  cat, b, setB, precioTxt, setPrecioTxt, onCerrar,
}: {
  cat: Catalogo
  b: Borrador
  setB: (b: Borrador) => void
  precioTxt: string
  setPrecioTxt: (s: string) => void
  onCerrar: () => void
}) {
  const m = cat.config.moneda
  const [guardando, setGuardando] = useState(false)
  const costoCalc = costoReceta(b, cat.ingredientes)
  const manual = b.costoManual !== null
  const costo = b.costoManual ?? costoCalc
  // unidad en la que se ve cada línea de la receta (se guarda siempre en g/ml/u)
  const [unidadLinea, setUnidadLinea] = useState<Record<number, UnidadCompra>>({})
  const sugerido = precioSugerido(costo, b.margenObjetivo)
  const precio = num(precioTxt)
  const ganancia = precio - costo
  const mr = margenReal(precio, costo)
  const foodCost = precio > 0 ? (costo / precio) * 100 : 0
  const categorias = useMemo(() => Array.from(new Set(cat.productos.map((x) => x.categoria).filter(Boolean))), [cat.productos])

  const cambiarLinea = (idx: number, cambio: Partial<LineaReceta>) =>
    setB({ ...b, receta: b.receta.map((l, i) => (i === idx ? { ...l, ...cambio } : l)) })
  const quitar = (idx: number) => setB({ ...b, receta: b.receta.filter((_, i) => i !== idx) })
  const agregar = () => {
    const libre = cat.ingredientes.find((i) => !b.receta.some((l) => l.ingredienteId === i.id))
    if (libre) setB({ ...b, receta: [...b.receta, { ingredienteId: libre.id, cantidad: 0 }] })
    else avisar('Ya usaste todos los ingredientes disponibles', 'error')
  }

  const guardar = async () => {
    if (!b.nombre.trim() || guardando) return
    const { id, galeria, galeriaTocada, ...resto } = b
    const cuerpo: ProductoGuardar = {
      ...resto, nombre: b.nombre.trim(), descripcion: b.descripcion.trim(), precio, receta: b.receta.filter((l) => l.cantidad > 0),
      imagenes: galeriaTocada ? aGuardar(galeria) : null,
    }
    setGuardando(true)
    try {
      if (id) await api.put(`/api/productos/${id}`, cuerpo)
      else await api.post('/api/productos', cuerpo)
      await cat.recargar()
      avisar('Producto guardado')
      onCerrar()
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <div className="d-flex justify-content-between align-items-center gap-2">
          <h3 className="h5 mb-0">{b.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={onCerrar}><Icono nombre="atras" size={16} /> Volver</button>
        </div>
        <div className="row g-3 mt-1">
          <div className="col-12 col-md-8">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="p-nombre">Nombre</label>
            <input id="p-nombre" className="form-control" value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} placeholder="Hamburguesa doble" />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="p-cat">Categoría</label>
            <input id="p-cat" className="form-control" list="cats" value={b.categoria} onChange={(e) => setB({ ...b, categoria: e.target.value })} placeholder="Hamburguesas" />
            <datalist id="cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="col-12">
            <span className="form-label small fw-semibold text-secondary mb-1 d-block">Icono en el panel de ventas</span>
            <div className="d-flex flex-wrap gap-2 picker" role="radiogroup" aria-label="Icono del producto">
              {ICONOS_PRODUCTO.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  role="radio"
                  aria-checked={b.icono === i.id}
                  aria-label={i.nombre}
                  title={i.nombre}
                  className={'btn d-flex align-items-center justify-content-center ' + (b.icono === i.id ? 'btn-primary' : 'btn-outline-secondary')}
                  onClick={() => setB({ ...b, icono: i.id })}
                >
                  <Icono nombre={i.id} size={26} />
                </button>
              ))}
            </div>
          </div>
          <div className="col-12 col-md-7">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="p-desc">Descripción para la carta</label>
            <textarea id="p-desc" className="form-control" rows={3} maxLength={300} value={b.descripcion} onChange={(e) => setB({ ...b, descripcion: e.target.value })} placeholder="Carne de res, queso, lechuga y salsa de la casa" />
            <div className="form-check form-switch mt-3">
              <input className="form-check-input" type="checkbox" role="switch" id="p-carta" checked={b.enCarta} onChange={(e) => setB({ ...b, enCarta: e.target.checked })} />
              <label className="form-check-label" htmlFor="p-carta">Mostrar en la carta pública</label>
            </div>
          </div>
          <div className="col-12">
            <Galeria items={b.galeria} alCambiar={(g) => setB({ ...b, galeria: g, galeriaTocada: true })} />
          </div>
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">1 · Receta</h3>
        {!cat.ingredientes.length && <p className="text-center text-secondary py-4">Primero agrega ingredientes en la pestaña Ingredientes.</p>}
        {b.receta.map((l, idx) => {
          const ing = cat.ingredientes.find((i) => i.id === l.ingredienteId)
          return (
            <div key={idx} className="row g-2 align-items-center mb-2">
              <div className="col-12 col-sm">
                <select className="form-select" aria-label="Ingrediente" value={l.ingredienteId} onChange={(e) => cambiarLinea(idx, { ingredienteId: Number(e.target.value) })}>
                  {cat.ingredientes.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </div>
              <div className="col-7 col-sm-4">
                <div className="input-group">
                  <input className="form-control" aria-label="Cantidad" inputMode="decimal" value={l.cantidad ? String(l.cantidad / (grande(unidadLinea[idx]) ? 1000 : 1)) : ''} placeholder="0" onChange={(e) => cambiarLinea(idx, { cantidad: aBase(num(e.target.value), unidadLinea[idx] ?? (ing?.unidad as UnidadCompra)) })} />
                  {ing && ing.unidad !== 'u' ? (
                    <select className="form-select flex-grow-0 w-auto" aria-label="Unidad" value={unidadLinea[idx] ?? ing.unidad} onChange={(e) => setUnidadLinea({ ...unidadLinea, [idx]: e.target.value as UnidadCompra })}>
                      {(ing.unidad === 'g' ? ['g', 'kg'] : ['ml', 'l']).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  ) : (
                    <span className="input-group-text">{ing?.unidad}</span>
                  )}
                </div>
              </div>
              <div className="col text-end text-secondary small">{money(ing ? costoUnitario(ing) * l.cantidad : 0, m)}</div>
              <div className="col-auto">
                <button className="btn btn-sm btn-outline-danger" onClick={() => quitar(idx)} aria-label="Quitar ingrediente"><Icono nombre="x" size={16} /></button>
              </div>
            </div>
          )
        })}
        {!!cat.ingredientes.length && <button className="btn btn-outline-secondary align-self-start" onClick={agregar}>+ Agregar ingrediente</button>}

        <div className="row g-3 mt-1">
          <div className="col-12 col-sm-6">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="p-porc">Esta receta rinde (porciones)</label>
            <input id="p-porc" className="form-control" inputMode="numeric" value={b.porciones} onChange={(e) => setB({ ...b, porciones: Math.max(1, Math.round(num(e.target.value)) || 1) })} />
          </div>
          <div className="col-12 col-sm-6">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="p-otros">Otros costos por unidad ({m})</label>
            <input id="p-otros" className="form-control" inputMode="decimal" value={b.otros || ''} placeholder="empaque, gas…" onChange={(e) => setB({ ...b, otros: num(e.target.value) })} />
          </div>
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3 calc">
        <h3 className="h5">2 · Calculadora</h3>
        <div className="row g-3 mb-3">
          <div className="col-12 col-sm-4">
            <span className="small fw-semibold text-secondary d-block">Te cuesta hacerla</span>
            <strong className="fs-3">{money(costo, m)}</strong>
            <small className="d-block text-secondary">{manual ? 'costo anotado por ti' : 'calculado con la receta'}</small>
          </div>
          <div className="col-6 col-sm-4">
            <label className="small fw-semibold text-secondary d-block mb-1" htmlFor="p-margen">Margen que buscas</label>
            <div className="input-group">
              <input id="p-margen" className="form-control" inputMode="numeric" value={b.margenObjetivo} onChange={(e) => setB({ ...b, margenObjetivo: Math.min(95, num(e.target.value)) })} />
              <span className="input-group-text">%</span>
            </div>
          </div>
          <div className="col-6 col-sm-4">
            <span className="small fw-semibold text-secondary d-block">Precio sugerido</span>
            <strong className="fs-3 text-success d-block">{money(sugerido, m)}</strong>
            <button className="btn btn-sm btn-outline-secondary mt-1" onClick={() => setPrecioTxt(String(sugerido))}>Usar este precio</button>
          </div>
        </div>
        <div className="rounded-3 border p-3 mb-3">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" role="switch" id="p-manual" checked={manual} onChange={(e) => setB({ ...b, costoManual: e.target.checked ? Math.round(costoCalc * 100) / 100 : null })} />
            <label className="form-check-label" htmlFor="p-manual">Ya tengo anotado cuánto me cuesta (usar mi costo)</label>
          </div>
          {manual ? (
            <div className="row g-2 align-items-center mt-1">
              <div className="col-12 col-sm-5">
                <div className="input-group">
                  <span className="input-group-text">{m}</span>
                  <input className="form-control" aria-label="Costo por unidad" inputMode="decimal" value={b.costoManual || ''} placeholder="0" onChange={(e) => setB({ ...b, costoManual: num(e.target.value) })} />
                </div>
              </div>
              <div className="col-12 col-sm text-secondary small">
                La app sugiere <b>{money(costoCalc, m)}</b> según tus compras{costoCalc > 0 && b.costoManual !== null && Math.abs(b.costoManual - costoCalc) / costoCalc > 0.1 && ' (hay más de 10% de diferencia)'}.{' '}
                <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setB({ ...b, costoManual: Math.round(costoCalc * 100) / 100 })}>Usar la sugerencia</button>
              </div>
            </div>
          ) : (
            <p className="text-secondary small mb-0 mt-1">Ahora se calcula con la receta: cada ingrediente según lo que pagaste por su unidad de compra (kilos, litros…) y la cantidad que lleva.</p>
          )}
        </div>
        <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="p-precio">Tu precio de venta ({m})</label>
        <input id="p-precio" className="form-control form-control-lg fw-bold" inputMode="decimal" value={precioTxt} onChange={(e) => setPrecioTxt(e.target.value)} placeholder={String(sugerido)} />
        <div className={'row g-0 text-center rounded-3 p-3 my-3 ' + (precio <= 0 ? 'bg-body-secondary' : ganancia <= 0 ? 'bg-danger-subtle' : mr < 30 ? 'bg-warning-subtle' : 'bg-success-subtle')}>
          <div className="col-4"><span className="small text-secondary d-block">Ganas por unidad</span><strong className="fs-5">{money(ganancia, m)}</strong></div>
          <div className="col-4"><span className="small text-secondary d-block">Margen real</span><strong className="fs-5">{pct(mr)}</strong></div>
          <div className="col-4"><span className="small text-secondary d-block">Costo sobre precio</span><strong className="fs-5">{pct(foodCost)}</strong></div>
        </div>
        {precio > 0 && ganancia <= 0 && <div className="alert alert-danger py-2">Con este precio pierdes dinero. Súbelo a por lo menos {money(costo, m)}.</div>}
        {precio > 0 && ganancia > 0 && mr < 30 && <div className="alert alert-warning py-2">Margen bajo: lo normal en comida es 60% o más sobre el precio.</div>}
        <div className="form-check my-2">
          <input className="form-check-input" type="checkbox" id="p-activo" checked={b.activo} onChange={(e) => setB({ ...b, activo: e.target.checked })} />
          <label className="form-check-label" htmlFor="p-activo">Mostrar en el panel de ventas</label>
        </div>
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-primary" onClick={() => void guardar()} disabled={!b.nombre.trim() || guardando}>
            {guardando ? 'Guardando…' : 'Guardar producto'}
          </button>
          <button className="btn btn-outline-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
      </section>
    </>
  )
}

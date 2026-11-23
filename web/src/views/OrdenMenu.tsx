import { useState } from 'react'
import { api } from '../api'
import { Icono } from '../Icono'
import { avisar, avisarError } from '../ui'
import type { Catalogo } from './Admin'

type Item = { id: number; nombre: string; foto: string | null; activo: boolean; enCarta: boolean }
type Grupo = { nombre: string; items: Item[] }

/** Los productos ya vienen del servidor en el orden vigente: se agrupan por categoría respetando ese orden. */
function agrupar(cat: Catalogo): Grupo[] {
  const grupos: Grupo[] = []
  for (const p of cat.productos) {
    const nombre = p.categoria.trim() || 'Otros'
    let g = grupos.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase())
    if (!g) grupos.push((g = { nombre, items: [] }))
    g.items.push({ id: p.id, nombre: p.nombre, foto: p.imagenes[0]?.url ?? null, activo: p.activo, enCarta: p.enCarta })
  }
  return grupos
}

const mover = <T,>(lista: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d
  if (j < 0 || j >= lista.length) return lista
  const copia = [...lista]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}

/** En Ajustes: el dueño decide qué categorías y productos se muestran (ventas y carta) y en qué orden. */
export default function OrdenMenu({ cat }: { cat: Catalogo }) {
  const [grupos, setGrupos] = useState<Grupo[]>(() => agrupar(cat))
  const [cambiado, setCambiado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cambiar = (g: Grupo[]) => {
    setGrupos(g)
    setCambiado(true)
  }
  const tocarItem = (gi: number, pi: number, cambio: Partial<Item>) =>
    cambiar(grupos.map((g, i) => (i !== gi ? g : { ...g, items: g.items.map((it, j) => (j === pi ? { ...it, ...cambio } : it)) })))
  const ponerTodos = (gi: number, campo: 'activo' | 'enCarta', valor: boolean) =>
    cambiar(grupos.map((g, i) => (i !== gi ? g : { ...g, items: g.items.map((it) => ({ ...it, [campo]: valor })) })))

  const guardar = async () => {
    setGuardando(true)
    try {
      await api.put('/api/productos/orden', {
        categorias: grupos.map((g) => g.nombre),
        productos: grupos.flatMap((g) => g.items.map((it) => ({ id: it.id, activo: it.activo, enCarta: it.enCarta }))),
      })
      await cat.recargar()
      setCambiado(false)
      avisar('Menú guardado')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="card shadow-sm mb-3 p-3">
      <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <h3 className="h5 mb-0">Menú: qué mostrar y en qué orden</h3>
        <div className="d-flex gap-2">
          {cambiado && <button className="btn btn-outline-secondary" disabled={guardando} onClick={() => { setGrupos(agrupar(cat)); setCambiado(false) }}>Descartar</button>}
          <button className="btn btn-primary" disabled={!cambiado || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar menú'}</button>
        </div>
      </div>
      <p className="text-secondary mt-2">
        Sube o baja las categorías y los productos con las flechas: ese es el orden del panel de ventas, de la carta y del pedido por QR.
        <strong> Ventas</strong> controla si el producto sale en la caja; <strong>Carta</strong>, si lo ven los clientes.
      </p>
      {!grupos.length && <p className="text-center text-secondary py-3">Todavía no hay productos.</p>}
      <div className="d-grid gap-3">
        {grupos.map((g, gi) => (
          <div key={g.nombre} className="orden-grupo">
            <div className="orden-cab d-flex align-items-center gap-2">
              <div className="btn-group btn-group-sm">
                <button className="btn btn-outline-secondary" disabled={gi === 0} onClick={() => cambiar(mover(grupos, gi, -1))} aria-label={`Subir la categoría ${g.nombre}`}><Icono nombre="subir" size={14} /></button>
                <button className="btn btn-outline-secondary" disabled={gi === grupos.length - 1} onClick={() => cambiar(mover(grupos, gi, 1))} aria-label={`Bajar la categoría ${g.nombre}`}><Icono nombre="bajar" size={14} /></button>
              </div>
              <strong className="flex-grow-1 text-truncate">{g.nombre} <small className="text-secondary fw-normal">({g.items.length})</small></strong>
              <button className="btn btn-sm btn-link p-0" onClick={() => ponerTodos(gi, 'activo', !g.items.every((i) => i.activo))}>Ventas: todos</button>
              <button className="btn btn-sm btn-link p-0" onClick={() => ponerTodos(gi, 'enCarta', !g.items.every((i) => i.enCarta))}>Carta: todos</button>
            </div>
            <div className="list-group list-group-flush">
              {g.items.map((it, pi) => (
                <div key={it.id} className="list-group-item bg-transparent d-flex align-items-center gap-2 px-2">
                  <div className="btn-group btn-group-sm flex-shrink-0">
                    <button className="btn btn-outline-secondary" disabled={pi === 0} onClick={() => cambiar(grupos.map((x, i) => (i === gi ? { ...x, items: mover(x.items, pi, -1) } : x)))} aria-label={`Subir ${it.nombre}`}><Icono nombre="subir" size={14} /></button>
                    <button className="btn btn-outline-secondary" disabled={pi === g.items.length - 1} onClick={() => cambiar(grupos.map((x, i) => (i === gi ? { ...x, items: mover(x.items, pi, 1) } : x)))} aria-label={`Bajar ${it.nombre}`}><Icono nombre="bajar" size={14} /></button>
                  </div>
                  <span className="foto-mini">{it.foto ? <img src={it.foto} alt="" loading="lazy" /> : <Icono nombre="plato" size={18} />}</span>
                  <span className="flex-grow-1 text-truncate">{it.nombre}</span>
                  <div className="form-check form-switch mb-0 flex-shrink-0">
                    <input className="form-check-input" type="checkbox" role="switch" id={`v-${it.id}`} checked={it.activo} onChange={(e) => tocarItem(gi, pi, { activo: e.target.checked })} />
                    <label className="form-check-label small" htmlFor={`v-${it.id}`}>Ventas</label>
                  </div>
                  <div className="form-check form-switch mb-0 flex-shrink-0">
                    <input className="form-check-input" type="checkbox" role="switch" id={`c-${it.id}`} checked={it.enCarta} onChange={(e) => tocarItem(gi, pi, { enCarta: e.target.checked })} />
                    <label className="form-check-label small" htmlFor={`c-${it.id}`}>Carta</label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

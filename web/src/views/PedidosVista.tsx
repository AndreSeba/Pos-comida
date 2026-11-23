import { Icono } from '../Icono'
import type { Pedido, Venta } from '../types'
import { Estado } from '../ui'
import { horaCorta, money } from '../util'

const haceCuanto = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`
}

interface Carga<T> {
  datos: T[] | null
  cargando: boolean
  error: string
  recargar: () => Promise<void>
}

/** Pedidos abiertos: lo que se tomó y todavía no se cobró. Se actualiza solo cada pocos segundos. */
export function ListaPedidos({
  pedidos, moneda: m, puedeCobrar, onAbrir, onCobrar, onCancelar, onConfirmar, onRechazar, onSinStock,
}: {
  pedidos: Carga<Pedido>
  moneda: string
  puedeCobrar: boolean
  onAbrir: (p: Pedido) => void
  onCobrar: (p: Pedido) => void
  onCancelar: (p: Pedido) => void
  onConfirmar: (p: Pedido) => void
  onRechazar: (p: Pedido) => void
  onSinStock: (p: Pedido, productoId: number, nombre: string) => void
}) {
  const lista = pedidos.datos ?? []
  // lo que pidieron los clientes desde su mesa va primero: hay que aceptarlo antes de preparar o cobrar
  const porConfirmar = lista.filter((p) => p.estado === 'PorConfirmar')
  return (
    <div className="pos-lista p-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h5 mb-0">Pedidos abiertos <span className="text-secondary fs-6">({lista.length - porConfirmar.length})</span></h2>
        <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => void pedidos.recargar()}>
          <Icono nombre="refrescar" size={16} /> Actualizar
        </button>
      </div>
      <Estado cargando={pedidos.cargando && !pedidos.datos} error={pedidos.error} onReintentar={pedidos.recargar} />
      {pedidos.datos && !lista.length && (
        <p className="text-center text-secondary py-5">No hay pedidos abiertos. Los que se tomen aparecen aquí para cobrarlos al final.</p>
      )}
      {porConfirmar.length > 0 && (
        <div className="mb-4">
          <h3 className="h6 text-uppercase text-warning-emphasis mb-2">Pedidos de clientes por aceptar ({porConfirmar.length})</h3>
          <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
            {porConfirmar.map((p) => (
              <div key={p.id} className="col">
                <article className="card shadow-sm h-100 border-warning border-2">
                  <div className="card-body d-flex flex-column gap-2">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="min-w-0">
                        <strong className="fs-5">{p.etiqueta}</strong> <span className="badge text-bg-warning">Cliente · #{p.numero}</span>
                        {p.cliente && <div className="fw-semibold">{p.cliente}</div>}
                        <div className="small text-secondary">{haceCuanto(p.creado)}</div>
                      </div>
                      <strong className="fs-5 flex-shrink-0">{money(p.total, m)}</strong>
                    </div>
                    <ul className="list-unstyled mb-0">
                      {p.items.map((i) => (
                        <li key={i.productoId} className="d-flex justify-content-between align-items-center gap-2 py-1 border-bottom">
                          <span className={i.disponible ? '' : 'text-danger text-decoration-line-through'}>{i.cantidad} × {i.nombre}</span>
                          <button className="btn btn-sm btn-outline-danger py-0 flex-shrink-0" onClick={() => onSinStock(p, i.productoId, i.nombre)} title="Quitar del pedido, marcar agotado y avisar al cliente">No hay</button>
                        </li>
                      ))}
                    </ul>
                    {p.nota && <div className="small fst-italic text-secondary">“{p.nota}”</div>}
                    {p.aviso && <div className="small text-secondary">Aviso al cliente: {p.aviso}</div>}
                    <div className="d-flex flex-wrap gap-2 mt-auto pt-1">
                      <button className="btn btn-sm btn-primary flex-grow-1" onClick={() => onConfirmar(p)}>Aceptar</button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => onAbrir(p)}>Editar</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => onRechazar(p)}>Rechazar</button>
                    </div>
                  </div>
                </article>
              </div>
            ))}
          </div>
        </div>
      )}
      {lista.length > porConfirmar.length && porConfirmar.length > 0 && <h3 className="h6 text-uppercase text-secondary mb-2">Cuentas abiertas</h3>}
      <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
        {lista.filter((p) => p.estado !== 'PorConfirmar').map((p) => {
          const faltan = p.items.filter((i) => !i.disponible)
          return (
            <div key={p.id} className="col">
              <article className="card shadow-sm h-100">
                <div className="card-body d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="min-w-0">
                      <strong className="fs-5">#{p.numero}</strong>
                      {p.etiqueta && <span className="fs-5"> · {p.etiqueta}</span>}
                      {p.deMesa && <span className="badge text-bg-info ms-2">QR</span>}
                      <div className="small text-secondary">{p.deMesa && p.cliente ? `${p.cliente} · ` : ''}{p.mesero} · {haceCuanto(p.creado)}</div>
                    </div>
                    <strong className="fs-5 flex-shrink-0">{money(p.total, m)}</strong>
                  </div>
                  <ul className="list-unstyled mb-0 small">
                    {p.items.map((i) => (
                      <li key={i.productoId} className={'d-flex justify-content-between align-items-center gap-2 ' + (i.disponible ? '' : 'text-danger text-decoration-line-through')}>
                        <span>{i.cantidad} × {i.nombre}</span>
                        {p.deMesa && <button className="btn btn-sm btn-link text-danger p-0 flex-shrink-0" onClick={() => onSinStock(p, i.productoId, i.nombre)}>No hay</button>}
                      </li>
                    ))}
                  </ul>
                  {p.nota && <div className="small fst-italic text-secondary">“{p.nota}”</div>}
                  {faltan.length > 0 && (
                    <div className="alert alert-warning py-1 px-2 mb-0 small">
                      {faltan.length === 1 ? 'Un producto ya no está disponible.' : `${faltan.length} productos ya no están disponibles.`} Ábrelo y quítalo para poder cobrar.
                    </div>
                  )}
                  <div className="d-flex flex-wrap gap-2 mt-auto pt-1">
                    <button className="btn btn-sm btn-outline-secondary flex-grow-1" onClick={() => onAbrir(p)}>Editar / agregar</button>
                    {puedeCobrar && (
                      <button className="btn btn-sm btn-primary flex-grow-1" disabled={faltan.length > 0} onClick={() => onCobrar(p)}>Cobrar</button>
                    )}
                    <button className="btn btn-sm btn-outline-danger" onClick={() => onCancelar(p)} aria-label={`Cancelar el pedido ${p.numero}`}>
                      <Icono nombre="x" size={16} />
                    </button>
                  </div>
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Ventas ya cobradas que falta entregar. */
export function ListaEntregas({
  entregas, moneda: m, onEntregar,
}: {
  entregas: Carga<Venta>
  moneda: string
  onEntregar: (v: Venta) => void
}) {
  const lista = entregas.datos ?? []
  return (
    <div className="pos-lista p-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h5 mb-0">Por entregar <span className="text-secondary fs-6">({lista.length})</span></h2>
        <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => void entregas.recargar()}>
          <Icono nombre="refrescar" size={16} /> Actualizar
        </button>
      </div>
      <Estado cargando={entregas.cargando && !entregas.datos} error={entregas.error} onReintentar={entregas.recargar} />
      {entregas.datos && !lista.length && <p className="text-center text-secondary py-5">No hay entregas pendientes.</p>}
      <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
        {lista.map((v) => (
          <div key={v.id} className="col">
            <article className="card shadow-sm h-100">
              <div className="card-body d-flex flex-column gap-2">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div className="min-w-0">
                    <strong className="fs-5">{v.etiqueta || `Venta #${v.id}`}</strong>
                    <div className="small text-secondary">Cobrado {horaCorta(v.fecha)} · {haceCuanto(v.fecha)}</div>
                  </div>
                  <span className="badge text-bg-success flex-shrink-0">Pagado · {money(v.total, m)}</span>
                </div>
                <ul className="list-unstyled mb-0 small">
                  {v.items.map((i) => <li key={i.productoId}>{i.cantidad} × {i.nombre}</li>)}
                </ul>
                {v.nota && <div className="small fst-italic text-secondary">“{v.nota}”</div>}
                <button className="btn btn-primary mt-auto d-inline-flex align-items-center justify-content-center gap-2" onClick={() => onEntregar(v)}>
                  <Icono nombre="check" size={18} /> Entregado
                </button>
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Icono } from '../Icono'
import { LogoNegocio } from '../Personalizar'
import type { Carta, CartaProducto } from '../types'
import { Modal, avisar, useCarga, useMarca } from '../ui'
import { money } from '../util'
import { TIPOS_PEDIDO, enlaceMapa, enlaceWhatsapp, faltaDelivery, mensajePedido, type DatosPedido } from '../whatsapp'

export function Cantidad({ n, nombre, cambiar, variante = 'primary' }: { n: number; nombre: string; cambiar: (delta: number) => void; variante?: 'primary' | 'secondary' }) {
  if (n === 0) return <button className="btn btn-primary btn-sm" onClick={() => cambiar(1)}>Agregar</button>
  return (
    <div className="btn-group btn-group-sm qty" role="group" aria-label={`Cantidad de ${nombre}`}>
      <button className={`btn btn-outline-${variante}`} onClick={() => cambiar(-1)} aria-label="Quitar uno"><Icono nombre="menos" size={16} /></button>
      <span className={`btn btn-outline-${variante} disabled opacity-100 fw-bold`}>{n}</span>
      <button className={`btn btn-outline-${variante}`} onClick={() => cambiar(1)} aria-label="Agregar uno"><Icono nombre="mas" size={16} /></button>
    </div>
  )
}

/** La carta que ve el cliente: abre desde un enlace, sin iniciar sesión. Arma su pedido y se manda por WhatsApp. */
export default function PaginaCarta() {
  const r = useCarga(() => api.publico<Carta>('/api/publico/carta'))
  const carta = r.datos
  useMarca(carta)

  const [carrito, setCarrito] = useState<Record<number, number>>({})
  const [filtro, setFiltro] = useState('Todo')
  const [pidiendo, setPidiendo] = useState(false)
  const [detalle, setDetalle] = useState<CartaProducto | null>(null)
  const [imagenActiva, setImagenActiva] = useState(0)
  const [datos, setDatos] = useState<DatosPedido>({ nombre: '', entrega: 'local', direccion: '', mapa: '', referencia: '', nota: '' })

  useEffect(() => {
    document.title = carta ? `${carta.negocio} · Carta` : 'Carta'
  }, [carta])

  const productos = useMemo(() => carta?.categorias.flatMap((c) => c.productos) ?? [], [carta])
  const lineas = Object.entries(carrito)
    .map(([id, cantidad]) => ({ producto: productos.find((p) => p.id === Number(id)), cantidad }))
    .filter((l): l is { producto: CartaProducto; cantidad: number } => !!l.producto && l.cantidad > 0)
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0)
  const total = lineas.reduce((s, l) => s + (l.producto.precio ?? 0) * l.cantidad, 0)

  const cambiar = (id: number, delta: number) =>
    setCarrito((c) => {
      const n = Math.max(0, Math.min(99, (c[id] || 0) + delta))
      const copia = { ...c }
      if (n === 0) delete copia[id]
      else copia[id] = n
      return copia
    })

  if (r.error)
    return (
      <main className="min-vh-100 d-flex align-items-center justify-content-center p-3 text-center">
        <div>
          <div className="mb-3 text-secondary"><Icono nombre="carta" size={48} /></div>
          <h1 className="h4">Esta carta no está disponible por ahora</h1>
          <p className="text-secondary">Vuelve a intentarlo más tarde o escribe directamente al negocio.</p>
          <button className="btn btn-outline-secondary" onClick={() => void r.recargar()}>Reintentar</button>
        </div>
      </main>
    )
  if (!carta) return <p className="text-center text-secondary py-5">Cargando la carta…</p>

  const m = carta.moneda
  const visibles = carta.categorias.filter((c) => filtro === 'Todo' || c.nombre === filtro)
  const faltaUbicacion = faltaDelivery(datos)
  const pedidoValido = !!datos.nombre.trim() && !faltaUbicacion && lineas.length > 0
  // compartir la ubicación del celular solo funciona en una página segura (https) y si el cliente lo permite
  const puedeCompartir = typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext
  const compartirUbicacion = () =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDatos((d) => ({ ...d, mapa: enlaceMapa(p.coords.latitude, p.coords.longitude) }))
        avisar('Ubicación lista. Si puedes, escribe también la dirección.')
      },
      () => avisar('No pudimos tomar tu ubicación. Escribe tu dirección.', 'error'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )

  const enviar = () => {
    if (!pedidoValido) return
    window.open(enlaceWhatsapp(mensajePedido(carta, lineas, datos), carta.whatsapp), '_blank', 'noopener,noreferrer')
    avisar('Se abrió WhatsApp con tu pedido. ¡Envíalo para confirmarlo!')
    setCarrito({})
    setPidiendo(false)
  }

  const abrirDetalle = (p: CartaProducto) => {
    setDetalle(p)
    setImagenActiva(0)
  }

  return (
    <div className="carta-publica">
      <header className="bg-body border-bottom">
        <div className="container py-3 d-flex align-items-center gap-3">
          <LogoNegocio logo={carta.logo} tam={56} />
          <div className="min-w-0 flex-grow-1">
            <h1 className="h4 mb-0 text-truncate">{carta.negocio}</h1>
            {carta.descripcion && <p className="text-secondary mb-0">{carta.descripcion}</p>}
          </div>
          {carta.whatsapp && !carta.pedidosWhatsapp && (
            <a className="btn btn-primary d-inline-flex align-items-center gap-2" href={enlaceWhatsapp(`Hola ${carta.negocio}!`, carta.whatsapp)} target="_blank" rel="noopener noreferrer">
              <Icono nombre="whatsapp" size={18} /> <span className="d-none d-sm-inline">Escribirnos</span>
            </a>
          )}
        </div>
        {carta.categorias.length > 1 && (
          <div className="container pb-2 d-flex gap-2 overflow-auto">
            {['Todo', ...carta.categorias.map((c) => c.nombre)].map((n) => (
              <button key={n} className={'btn btn-sm rounded-pill flex-shrink-0 ' + (n === filtro ? 'btn-primary' : 'btn-outline-secondary')} onClick={() => setFiltro(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="container py-3 pb-5">
        {!carta.categorias.length && <p className="text-center text-secondary py-5">Todavía no hay productos en la carta.</p>}
        {visibles.map((cat) => (
          <section key={cat.nombre} className="mb-3">
            <h2 className="h6 text-uppercase text-secondary fw-bold mb-2">{cat.nombre}</h2>
            <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2">
              {cat.productos.map((p) => (
                <div key={p.id} className="col">
                  <article className="card h-100 shadow-sm overflow-hidden carta-item">
                    <div className="carta-foto">
                      {p.imagenes.length > 0 ? (
                        <button type="button" className="p-0 border-0 bg-transparent w-100 h-100" onClick={() => abrirDetalle(p)} aria-label={`Ver fotos de ${p.nombre}`}>
                          <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" className="foto-carta" />
                          {p.imagenes.length > 1 && <span className="badge text-bg-dark position-absolute bottom-0 end-0 m-1">{p.imagenes.length}</span>}
                        </button>
                      ) : (
                        <div className="sin-foto"><Icono nombre={p.icono} size={48} /></div>
                      )}
                    </div>
                    <div className="card-body d-flex flex-column gap-1 py-2 px-3 min-w-0">
                      <h3 className="h6 mb-0">{p.nombre}</h3>
                      {p.descripcion && <p className="small text-secondary mb-1 carta-desc">{p.descripcion}</p>}
                      <div className="mt-auto d-flex justify-content-between align-items-center gap-2">
                        {p.precio !== null ? <strong className="fs-6">{money(p.precio, m)}</strong> : <span />}
                        {carta.pedidosWhatsapp && <Cantidad n={carrito[p.id] || 0} nombre={p.nombre} cambiar={(d) => cambiar(p.id, d)} />}
                      </div>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {carta.pedidosWhatsapp && unidades > 0 && (
        <button className="fab-carta btn btn-primary btn-lg shadow d-flex align-items-center justify-content-center gap-2" onClick={() => setPidiendo(true)}>
          <Icono nombre="carrito" size={22} /> Ver mi pedido ({unidades}){carta.mostrarPrecios && ` · ${money(total, m)}`}
        </button>
      )}

      {detalle && (
        <Modal
          titulo={detalle.nombre}
          onCerrar={() => setDetalle(null)}
          pie={
            carta.pedidosWhatsapp ? (
              <div className="d-flex align-items-center justify-content-between w-100 gap-2">
                {detalle.precio !== null ? <strong className="fs-5">{money(detalle.precio, m)}</strong> : <span />}
                <Cantidad n={carrito[detalle.id] || 0} nombre={detalle.nombre} cambiar={(d) => cambiar(detalle.id, d)} />
              </div>
            ) : undefined
          }
        >
          <div className="ratio ratio-4x3 visor-principal">
            <img src={detalle.imagenes[imagenActiva] ?? detalle.imagenes[0]} alt={`${detalle.nombre}, imagen ${imagenActiva + 1}`} />
          </div>
          {detalle.imagenes.length > 1 && (
            <div className="miniaturas" role="group" aria-label="Imágenes del producto">
              {detalle.imagenes.map((u, i) => (
                <button key={u} type="button" className={i === imagenActiva ? 'activa' : ''} onClick={() => setImagenActiva(i)} aria-label={`Ver imagen ${i + 1}`} aria-pressed={i === imagenActiva}>
                  <img src={u} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {detalle.descripcion && <p className="mb-0 mt-2">{detalle.descripcion}</p>}
        </Modal>
      )}

      {pidiendo && (
        <Modal
          titulo="Tu pedido"
          onCerrar={() => setPidiendo(false)}
          pie={
            <button className="btn btn-primary flex-grow-1 d-inline-flex align-items-center justify-content-center gap-2" disabled={!pedidoValido} onClick={enviar}>
              <Icono nombre="whatsapp" size={20} /> Pedir por WhatsApp
            </button>
          }
        >
          <div className="list-group list-group-flush mb-3">
            {lineas.map(({ producto, cantidad }) => (
              <div key={producto.id} className="list-group-item d-flex align-items-center gap-2 px-0 bg-transparent">
                <div className="flex-grow-1 min-w-0">
                  {producto.nombre}
                  {carta.mostrarPrecios && producto.precio !== null && <small className="d-block text-secondary">{money(producto.precio, m)}</small>}
                </div>
                <Cantidad n={cantidad} nombre={producto.nombre} cambiar={(d) => cambiar(producto.id, d)} variante="secondary" />
              </div>
            ))}
            {!lineas.length && <p className="text-center text-secondary py-3 mb-0">Tu pedido está vacío.</p>}
          </div>
          {carta.mostrarPrecios && <div className="d-flex justify-content-between fs-5 mb-3"><span>Total</span><strong>{money(total, m)}</strong></div>}

          <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="ped-nombre">Tu nombre</label>
          <input id="ped-nombre" className="form-control mb-3" value={datos.nombre} maxLength={60} placeholder="¿A nombre de quién?" onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />

          <span className="form-label small fw-semibold text-secondary mb-1 d-block">Tipo de pedido</span>
          <div className="btn-group w-100 mb-3" role="group" aria-label="Tipo de pedido">
            {TIPOS_PEDIDO.map((t) => (
              <button key={t.id} className={'btn btn-outline-primary' + (datos.entrega === t.id ? ' active' : '')} aria-pressed={datos.entrega === t.id} onClick={() => setDatos({ ...datos, entrega: t.id })}>{t.nombre}</button>
            ))}
          </div>
          {datos.entrega === 'delivery' && (
            <>
              <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="ped-dir">Tu ubicación (dirección)</label>
              <input id="ped-dir" className="form-control mb-2" value={datos.direccion} maxLength={150} placeholder="Calle, número, zona o barrio" onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} />
              {puedeCompartir && (
                <div className="mb-2">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={compartirUbicacion}>
                    {datos.mapa ? 'Ubicación compartida ✓ (volver a tomarla)' : 'Compartir mi ubicación actual'}
                  </button>
                </div>
              )}
              <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="ped-ref">Referencia para encontrarte</label>
              <input id="ped-ref" className="form-control mb-1" value={datos.referencia} maxLength={150} placeholder="Puerta verde, frente a la farmacia…" onChange={(e) => setDatos({ ...datos, referencia: e.target.value })} />
              {faltaUbicacion && <div className="form-text text-danger mb-3">Para el delivery necesitamos tu ubicación (escrita o compartida) y una referencia.</div>}
              {!faltaUbicacion && <div className="mb-3" />}
            </>
          )}
          <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="ped-nota">Nota (opcional)</label>
          <input id="ped-nota" className="form-control" value={datos.nota} maxLength={200} placeholder="Sin cebolla, sin picante…" onChange={(e) => setDatos({ ...datos, nota: e.target.value })} />
          <p className="small text-secondary mt-3 mb-0">Al tocar el botón se abre WhatsApp con tu pedido escrito. El pago y la entrega los coordinas con el negocio.</p>
        </Modal>
      )}
    </div>
  )
}

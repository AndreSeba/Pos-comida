import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api'
import { Icono } from '../Icono'
import type { Producto, ProductoGuardar } from '../types'
import { avisar, avisarError } from '../ui'
import { money } from '../util'
import { enlaceCarta, enlaceWhatsapp, mensajeCartaEnTexto, mensajeEnlace } from '../whatsapp'
import type { Catalogo } from './Admin'

const sin591 = (w: string | null) => (w ?? '').replace(/^591/, '')
const esLocal = (url: string) => /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\./.test(url)

/** Administración de la carta pública: publicarla, compartirla por WhatsApp y elegir qué productos salen. */
export default function Carta({ cat }: { cat: Catalogo }) {
  const c = cat.config
  const m = c.moneda
  const enlace = enlaceCarta()

  const [descripcion, setDescripcion] = useState(c.descripcion)
  const [whatsapp, setWhatsapp] = useState(sin591(c.whatsapp))
  const [publicada, setPublicada] = useState(c.cartaPublicada)
  const [precios, setPrecios] = useState(c.mostrarPrecios)
  const [pedidos, setPedidos] = useState(c.pedidosWhatsapp)
  const [guardando, setGuardando] = useState(false)
  const [qr, setQr] = useState('')

  const cambiado =
    descripcion.trim() !== c.descripcion || whatsapp !== sin591(c.whatsapp) || publicada !== c.cartaPublicada ||
    precios !== c.mostrarPrecios || pedidos !== c.pedidosWhatsapp

  useEffect(() => {
    let cancelado = false
    QRCode.toDataURL(enlace, { width: 640, margin: 2 })
      .then((d) => !cancelado && setQr(d))
      .catch(() => undefined)
    return () => {
      cancelado = true
    }
  }, [enlace])

  const guardar = async () => {
    if (guardando) return
    setGuardando(true)
    try {
      await api.put('/api/config', {
        ...c, descripcion: descripcion.trim(), whatsapp: whatsapp ? `591${whatsapp}` : null,
        cartaPublicada: publicada, mostrarPrecios: precios, pedidosWhatsapp: pedidos,
      })
      await cat.recargar()
      avisar('Carta actualizada')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  const descartar = () => {
    setDescripcion(c.descripcion)
    setWhatsapp(sin591(c.whatsapp))
    setPublicada(c.cartaPublicada)
    setPrecios(c.mostrarPrecios)
    setPedidos(c.pedidosWhatsapp)
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
      avisar('Enlace copiado')
    } catch {
      avisar('No se pudo copiar. Mantén presionado el enlace y cópialo.', 'error')
    }
  }

  const abrirWhatsapp = (texto: string) => window.open(enlaceWhatsapp(texto), '_blank', 'noopener,noreferrer')

  const alternar = async (p: Producto) => {
    const cuerpo: ProductoGuardar = {
      nombre: p.nombre, categoria: p.categoria, icono: p.icono, porciones: p.porciones, otros: p.otros, margenObjetivo: p.margenObjetivo,
      precio: p.precio, activo: p.activo, receta: p.receta, descripcion: p.descripcion, enCarta: !p.enCarta, costoManual: p.costoManual,
    }
    try {
      await api.put(`/api/productos/${p.id}`, cuerpo)
      await cat.recargar()
    } catch (e) {
      avisarError(e)
    }
  }

  const textoCarta = useMemo(
    () => mensajeCartaEnTexto(c.negocio, m, cat.productos, c.mostrarPrecios, enlace),
    [c.negocio, m, cat.productos, c.mostrarPrecios, enlace],
  )
  const visibles = cat.productos.filter((p) => p.activo && p.enCarta).length

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div>
            <h3 className="h5 mb-1">Tu carta en internet</h3>
            <p className="text-secondary mb-0">Una página con tus productos que tus clientes abren desde un enlace, sin instalar nada, y piden por WhatsApp.</p>
          </div>
          <span className={'badge rounded-pill ' + (c.cartaPublicada ? 'text-bg-success' : 'text-bg-secondary')}>{c.cartaPublicada ? 'Publicada' : 'No publicada'}</span>
        </div>

        {c.cartaPublicada ? (
          <div className="row g-3 mt-1 align-items-center">
            <div className="col-12 col-md-8 d-grid gap-2">
              <div className="input-group">
                <span className="input-group-text"><Icono nombre="enlace" size={18} /></span>
                <input className="form-control" readOnly value={enlace} aria-label="Enlace de la carta" onFocus={(e) => e.currentTarget.select()} />
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={() => abrirWhatsapp(mensajeEnlace(c.negocio, enlace))}>
                  <Icono nombre="whatsapp" size={18} /> Compartir por WhatsApp
                </button>
                <button className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={() => void copiar()}>
                  <Icono nombre="copiar" size={18} /> Copiar enlace
                </button>
                <a className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" href="/carta" target="_blank" rel="noopener noreferrer">
                  <Icono nombre="ojo" size={18} /> Ver como cliente
                </a>
              </div>
              {esLocal(enlace) && (
                <div className="alert alert-warning py-2 mb-0 small">
                  Este enlace solo se abre dentro de tu red. Para que tus clientes lo vean, publica el sistema en internet (mira el README).
                </div>
              )}
            </div>
            <div className="col-12 col-md-4 text-center">
              {qr && <img className="qr-carta" src={qr} alt={`Código QR de ${enlace}`} />}
              <a className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2 mt-2" href={qr} download="qr-carta.png">
                <Icono nombre="bajar" size={16} /> Descargar QR
              </a>
            </div>
          </div>
        ) : (
          <p className="mt-3 mb-0 text-secondary">Activa «Publicar mi carta» más abajo y guarda para obtener el enlace y el código QR.</p>
        )}
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Qué ven y cómo piden tus clientes</h3>
        <div className="row g-3 mt-1">
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="c-wa">WhatsApp del negocio (a este número llegan los pedidos)</label>
            <div className="input-group">
              <span className="input-group-text">+591</span>
              <input id="c-wa" className="form-control" inputMode="numeric" maxLength={8} value={whatsapp} placeholder="71234567" onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="c-desc">Frase de presentación</label>
            <input id="c-desc" className="form-control" maxLength={200} value={descripcion} placeholder="Hamburguesas artesanales todos los días" onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="col-12 d-grid gap-2">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="c-pub" checked={publicada} onChange={(e) => setPublicada(e.target.checked)} />
              <label className="form-check-label fw-semibold" htmlFor="c-pub">Publicar mi carta</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="c-pre" checked={precios} onChange={(e) => setPrecios(e.target.checked)} />
              <label className="form-check-label" htmlFor="c-pre">Mostrar los precios</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="c-ped" checked={pedidos} onChange={(e) => setPedidos(e.target.checked)} />
              <label className="form-check-label" htmlFor="c-ped">Recibir pedidos por WhatsApp (el cliente arma su pedido y se abre WhatsApp con el mensaje listo)</label>
            </div>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 mt-3">
          <button className="btn btn-primary" disabled={!cambiado || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
          {cambiado && <button className="btn btn-outline-secondary" onClick={descartar}>Descartar</button>}
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Enviar la carta escrita por WhatsApp</h3>
        <p className="text-secondary">Un mensaje con tus productos y precios por categoría, para mandarlo a un cliente o a un grupo.</p>
        <pre className="carta-texto small mb-3">{textoCarta}</pre>
        <div>
          <button className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" disabled={!visibles} onClick={() => abrirWhatsapp(textoCarta)}>
            <Icono nombre="whatsapp" size={18} /> Enviar por WhatsApp
          </button>
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Productos en la carta <span className="text-secondary fs-6">({visibles} de {cat.productos.length})</span></h3>
        <p className="text-secondary">Elige cuáles se muestran. La descripción y la foto se editan en cada producto.</p>
        {!cat.productos.length && <p className="text-center text-secondary py-4">Todavía no tienes productos.</p>}
        <div className="list-group list-group-flush">
          {cat.productos.map((p) => (
            <div key={p.id} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent">
              <div className="d-flex align-items-center gap-3 min-w-0">
                <div className="foto-mini">{p.imagenes[0] ? <img src={p.imagenes[0].url} alt="" loading="lazy" /> : <Icono nombre={p.icono} size={22} />}</div>
                <div className="min-w-0">
                  <strong className="d-block text-truncate">{p.nombre}</strong>
                  <small className="text-secondary">{p.categoria || 'Sin categoría'} · {money(p.precio, m)}{!p.activo && ' · oculto en ventas'}</small>
                </div>
              </div>
              <div className="form-check form-switch m-0">
                <input className="form-check-input" type="checkbox" role="switch" id={`ec-${p.id}`} checked={p.enCarta} disabled={!p.activo} onChange={() => void alternar(p)} aria-label={`${p.nombre} en la carta`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

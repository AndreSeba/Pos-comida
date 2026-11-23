import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Icono } from '../Icono'
import type { Mesa } from '../types'
import { urlPublica } from '../whatsapp'
import { Estado, avisar, avisarError, useCarga } from '../ui'
import type { Catalogo } from './Admin'
import { Paginador, usePaginas } from '../paginacion'

const CLAVE_BASE = 'pos-url-qr'
const baseGuardada = (): string => {
  try {
    return localStorage.getItem(CLAVE_BASE) || urlPublica()
  } catch {
    return urlPublica()
  }
}
const enlaceDe = (m: Mesa, base: string) => `${base}/mesa/${m.token}`
const esLocal = /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\./

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** Mesas y códigos QR: cada mesa tiene su propio QR con un código secreto que no se puede adivinar ni cambiar a mano para llegar a otra mesa. */
export default function Mesas({ cat }: { cat: Catalogo }) {
  const r = useCarga(() => api.get<Mesa[]>('/api/mesas'))
  const mesas = r.datos ?? []
  const pag = usePaginas(mesas, 12)
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [nombre, setNombre] = useState('')
  const [cuantas, setCuantas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [base, setBase] = useState(baseGuardada)
  const [baseTxt, setBaseTxt] = useState(baseGuardada)
  const [guardandoPermiso, setGuardandoPermiso] = useState(false)
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null)

  // un QR por cada código (si el código cambia, se vuelve a dibujar)
  useEffect(() => {
    let vigente = true
    void (async () => {
      const nuevo: Record<string, string> = {}
      for (const m of r.datos ?? []) nuevo[m.token] = await QRCode.toDataURL(enlaceDe(m, base), { width: 480, margin: 2 })
      if (vigente) setQrs(nuevo)
    })()
    return () => { vigente = false }
  }, [r.datos, base])

  const cambiarPermiso = async (valor: boolean) => {
    setGuardandoPermiso(true)
    try {
      await api.put('/api/config', { ...cat.config, ingresoMesaConPermiso: valor })
      await cat.recargar()
      avisar('Guardado')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardandoPermiso(false)
    }
  }

  const guardarBase = () => {
    const limpia = baseTxt.trim().replace(/\/+$/, '')
    if (!/^https?:\/\/[^\s/]+/i.test(limpia)) return avisar('Escribe la dirección completa, empezando con http:// o https://', 'error')
    try {
      localStorage.setItem(CLAVE_BASE, limpia)
    } catch {
      /* modo privado: queda solo mientras la página esté abierta */
    }
    setBase(limpia)
    setBaseTxt(limpia)
    avisar('Dirección guardada. Los QR se dibujaron de nuevo: imprímelos otra vez.')
  }

  const agregar = async () => {
    const n = nombre.trim()
    if (!n || enviando) return
    setEnviando(true)
    try {
      await api.post('/api/mesas', { nombre: n, activa: true })
      setNombre('')
      await r.recargar()
    } catch (e) {
      avisarError(e)
    } finally {
      setEnviando(false)
    }
  }

  const crearVarias = async () => {
    const n = Math.floor(Number(cuantas))
    if (!(n >= 1 && n <= 60) || enviando) return avisar('Escribe cuántas mesas (de 1 a 60).', 'error')
    setEnviando(true)
    try {
      const existentes = new Set(mesas.map((m) => m.nombre.toLowerCase()))
      let creadas = 0
      for (let i = 1; i <= n; i++) {
        const nom = `Mesa ${i}`
        if (existentes.has(nom.toLowerCase())) continue
        await api.post('/api/mesas', { nombre: nom, activa: true })
        creadas++
      }
      setCuantas('')
      avisar(creadas ? `Se crearon ${creadas} mesas` : 'Esas mesas ya existen')
      await r.recargar()
    } catch (e) {
      avisarError(e)
      await r.recargar()
    } finally {
      setEnviando(false)
    }
  }

  const guardar = async (m: Mesa, cambios: Partial<Pick<Mesa, 'nombre' | 'activa'>>) => {
    try {
      await api.put(`/api/mesas/${m.id}`, { nombre: cambios.nombre ?? m.nombre, activa: cambios.activa ?? m.activa })
      setEditando(null)
      await r.recargar()
    } catch (e) {
      avisarError(e)
    }
  }

  const nuevoQr = async (m: Mesa) => {
    if (!confirm(`¿Generar un QR nuevo para «${m.nombre}»?\n\nEl QR que ya está impreso o pegado en la mesa dejará de funcionar y tendrás que reemplazarlo.`)) return
    try {
      await api.post(`/api/mesas/${m.id}/nuevo-qr`, {})
      avisar('QR nuevo generado. Imprímelo y reemplaza el anterior.')
      await r.recargar()
    } catch (e) {
      avisarError(e)
    }
  }

  const imprimir = (lista: Mesa[]) => {
    const w = window.open('', '_blank')
    if (!w) return avisar('Tu navegador bloqueó la ventana. Permite las ventanas emergentes para imprimir.', 'error')
    const tarjetas = lista.map((m) => `<section><h1>${escapar(m.nombre)}</h1><img src="${qrs[m.token] ?? ''}" alt=""><p>Escanea para pedir desde tu mesa</p><small>${escapar(cat.config.negocio)}</small></section>`).join('')
    w.document.write(`<!doctype html><meta charset="utf-8"><title>QR de las mesas</title><style>
      body{font-family:system-ui,sans-serif;margin:0;display:flex;flex-wrap:wrap}
      section{width:50%;box-sizing:border-box;padding:24px;text-align:center;border:1px dashed #bbb;page-break-inside:avoid}
      h1{margin:0 0 8px;font-size:32px} img{width:260px;height:260px} p{font-size:18px;margin:8px 0 4px} small{color:#555}
      @media print{section{width:50%}}</style>${tarjetas}`)
    w.document.close()
    w.focus()
    window.setTimeout(() => w.print(), 400)
  }

  return (
    <div className="d-flex flex-column gap-3">
      <section className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div>
              <h2 className="h5 mb-1">Mesas y códigos QR</h2>
              <p className="text-secondary mb-0">
                Cada mesa tiene su QR. El cliente lo escanea, arma su pedido y le llega al personal para aceptarlo. Necesitas tener activados los
                <strong> pedidos abiertos</strong> en Ajustes.
              </p>
            </div>
            {mesas.length > 0 && (
              <button className="btn btn-outline-primary d-inline-flex align-items-center gap-2" onClick={() => imprimir(mesas.filter((m) => m.activa))}>
                <Icono nombre="recibo" size={16} /> Imprimir todos los QR
              </button>
            )}
          </div>
          <div className="form-check form-switch mt-3">
            <input className="form-check-input" type="checkbox" role="switch" id="mesa-permiso" checked={cat.config.ingresoMesaConPermiso} disabled={guardandoPermiso} onChange={(e) => void cambiarPermiso(e.target.checked)} />
            <label className="form-check-label" htmlFor="mesa-permiso">Pedir permiso al personal para entrar a la mesa</label>
            <div className="form-text">
              Apagado (lo normal): el cliente escanea el QR, escribe su nombre y ya puede pedir, sin avisar a nadie; cada celular queda atado a la mesa de su enlace y termina al cobrar la cuenta.
              Encendido: el personal tiene que dejarlo entrar (útil si escanean desde fuera del local).
            </div>
          </div>
          <div className="mt-3">
            <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="mesa-base">Dirección que abrirán los celulares de los clientes</label>
            <div className="input-group">
              <input id="mesa-base" className="form-control" value={baseTxt} placeholder="http://192.168.1.50:5080" inputMode="url" onChange={(e) => setBaseTxt(e.target.value)} />
              <button className="btn btn-outline-primary" disabled={baseTxt.trim().replace(/\/+$/, '') === base} onClick={guardarBase}>Usar esta dirección</button>
            </div>
            <div className="form-text">
              Sin internet, funciona por la wifi del local: pon la dirección del computador del local en tu red (por ejemplo <code>http://192.168.1.50:5080</code>) y vuelve a imprimir los QR.
              Se guarda en este navegador.
            </div>
          </div>
          {esLocal.test(base) && (
            <div className="alert alert-warning mt-3 mb-0">
              Los QR apuntan a una dirección interna ({base}): los celulares tienen que estar conectados a la misma red o wifi del local. Para usarlos desde cualquier lugar, publica el sistema en internet.
            </div>
          )}
          <div className="row g-2 mt-2">
            <div className="col-12 col-md-6">
              <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="mesa-nueva">Agregar una mesa</label>
              <div className="input-group">
                <input id="mesa-nueva" className="form-control" value={nombre} maxLength={40} placeholder="Mesa 7, Terraza 2, Barra…" onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void agregar()} />
                <button className="btn btn-primary" disabled={!nombre.trim() || enviando} onClick={() => void agregar()}>Agregar</button>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="mesa-varias">O crear varias de una vez</label>
              <div className="input-group">
                <input id="mesa-varias" className="form-control" type="number" min={1} max={60} value={cuantas} placeholder="¿Cuántas mesas? (Mesa 1 a Mesa N)" onChange={(e) => setCuantas(e.target.value)} />
                <button className="btn btn-outline-primary" disabled={!cuantas || enviando} onClick={() => void crearVarias()}>Crear</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Estado cargando={r.cargando && !r.datos} error={r.error} onReintentar={r.recargar} />
      {r.datos && !mesas.length && <p className="text-center text-secondary py-4">Todavía no hay mesas. Crea la primera arriba.</p>}

      <div className="row row-cols-1 row-cols-md-2 g-3">
        {pag.visibles.map((m) => (
          <div key={m.id} className="col">
            <article className={'card shadow-sm h-100' + (m.activa ? '' : ' opacity-75')}>
              <div className="card-body d-flex gap-3">
                <div className="flex-shrink-0 text-center">
                  {qrs[m.token] ? <img className="qr-mesa" src={qrs[m.token]} alt={`Código QR de ${m.nombre}`} /> : <div className="qr-mesa d-flex align-items-center justify-content-center text-secondary">…</div>}
                </div>
                <div className="flex-grow-1 min-w-0 d-flex flex-column gap-2">
                  {editando?.id === m.id ? (
                    <div className="input-group input-group-sm">
                      <input className="form-control" value={editando.nombre} maxLength={40} autoFocus onChange={(e) => setEditando({ id: m.id, nombre: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void guardar(m, { nombre: editando.nombre })} />
                      <button className="btn btn-primary" onClick={() => void guardar(m, { nombre: editando.nombre })}>Guardar</button>
                      <button className="btn btn-outline-secondary" onClick={() => setEditando(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <h3 className="h5 mb-0 text-truncate">{m.nombre}</h3>
                      <button className="btn btn-sm btn-link p-0" onClick={() => setEditando({ id: m.id, nombre: m.nombre })}>Cambiar nombre</button>
                    </div>
                  )}
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" role="switch" id={`mesa-activa-${m.id}`} checked={m.activa} onChange={(e) => void guardar(m, { activa: e.target.checked })} />
                    <label className="form-check-label" htmlFor={`mesa-activa-${m.id}`}>{m.activa ? 'Recibe pedidos' : 'Desactivada (el QR no sirve)'}</label>
                  </div>
                  <div className="d-flex flex-wrap gap-2 mt-auto">
                    <a className="btn btn-sm btn-outline-secondary" href={qrs[m.token]} download={`qr-${m.nombre.replace(/\s+/g, '-').toLowerCase()}.png`}>Descargar QR</a>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => imprimir([m])}>Imprimir</button>
                    <a className="btn btn-sm btn-outline-secondary" href={enlaceDe(m, base)} target="_blank" rel="noopener noreferrer">Probar</a>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => void nuevoQr(m)}>QR nuevo</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        ))}
      </div>
      <Paginador p={pag} />
    </div>
  )
}

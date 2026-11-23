import { useEffect, useMemo, useState } from 'react'
import { api, mensajeError } from '../api'
import { Icono } from '../Icono'
import { LogoNegocio } from '../Personalizar'
import type { Carta, CartaProducto, ConfigPublica, MesaCarta, PedidoMesa } from '../types'
import { Modal, avisar, avisarError, useCarga, useMarca, confirmar } from '../ui'
import { money } from '../util'
import { Cantidad } from './PaginaCarta'

const CLAVE_CLIENTE = 'pos-cliente'
const CLAVE_NOMBRE = 'pos-cliente-nombre'
let enMemoria = ''

/** Un código anónimo por celular: con él cada cliente solo ve y corrige sus propios pedidos. No es un dato personal. */
function codigoCliente(): string {
  const nuevo = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    let c = localStorage.getItem(CLAVE_CLIENTE)
    if (!c || !/^[A-Za-z0-9-]{16,40}$/.test(c)) {
      c = nuevo()
      localStorage.setItem(CLAVE_CLIENTE, c)
    }
    return c
  } catch {
    return (enMemoria ||= nuevo()) // navegación privada: dura mientras la página esté abierta
  }
}

/** El nombre que el cliente puso la última vez en este celular, para no escribirlo en cada pedido. */
function nombreGuardado(): string {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) ?? ''
  } catch {
    return ''
  }
}

const ESTADOS: Record<PedidoMesa['estado'], { texto: string; clase: string }> = {
  PorConfirmar: { texto: 'Esperando que el personal lo acepte', clase: 'text-bg-warning' },
  Abierto: { texto: 'Aceptado · lo estamos preparando', clase: 'text-bg-success' },
  Unido: { texto: 'Aceptado · se sumó a tu cuenta', clase: 'text-bg-success' },
  Cobrado: { texto: 'Pagado', clase: 'text-bg-secondary' },
  Cancelado: { texto: 'Cancelado', clase: 'text-bg-danger' },
}

const SEGUNDOS_ACTUALIZAR = 6

/**
 * Lo que ve el cliente al escanear el QR de su mesa. Tres pasos de seguridad: el enlace trae un código secreto de la mesa (no hay forma
 * de llegar a otra cambiándolo); el QR es fijo y queda en el historial, así que además hace falta que el personal haya abierto la mesa y
 * poner el código corto de esa sesión; y al pagar la cuenta la sesión termina y el enlace de hoy deja de servir.
 */
export default function PaginaMesa({ token }: { token: string }) {
  const cliente = useMemo(() => codigoCliente(), [])
  const mesaApi = useMemo(() => api.mesa(cliente), [cliente])
  const ruta = `/api/publico/mesa/${encodeURIComponent(token)}`
  const r = useCarga(() => mesaApi.get<MesaCarta>(ruta), [token])
  const pub = useCarga(() => api.publico<ConfigPublica>('/api/config/publica'))
  const datos = r.datos
  useMarca(datos?.carta ?? pub.datos)

  useEffect(() => {
    document.title = datos ? `${datos.mesa} · ${datos.carta?.negocio ?? pub.datos?.negocio ?? 'Pedir desde la mesa'}` : 'Pedir desde la mesa'
  }, [datos, pub.datos])

  // el estado (mesa abierta, pedido aceptado, sin stock…) se actualiza solo
  const { recargar } = r
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void recargar()
    }, SEGUNDOS_ACTUALIZAR * 1000)
    return () => window.clearInterval(t)
  }, [recargar])

  if (r.error && !datos)
    return (
      <main className="min-vh-100 d-flex align-items-center justify-content-center p-3 text-center">
        <div>
          <div className="mb-3 text-secondary"><Icono nombre="carta" size={48} /></div>
          <h1 className="h4">No pudimos abrir esta mesa</h1>
          <p className="text-secondary">{r.error}</p>
          {!r.error.includes('ya no es válido') && <button className="btn btn-outline-secondary" onClick={() => void recargar()}>Reintentar</button>}
        </div>
      </main>
    )
  if (!datos) return <p className="text-center text-secondary py-5">Abriendo tu mesa…</p>

  if (datos.estado !== 'Activa' || !datos.carta)
    return <Entrada datos={datos} logo={pub.datos?.logo ?? null} negocio={pub.datos?.negocio ?? ''} ruta={ruta} mesaApi={mesaApi} recargar={recargar} />

  return (
    <>
      {r.error && <div className="alert alert-warning text-center rounded-0 mb-0 py-2 small">Sin conexión con el local. Reintentando… tu pedido no se pierde.</div>}
      <Pedir datos={datos} carta={datos.carta} ruta={ruta} mesaApi={mesaApi} recargar={recargar} />
    </>
  )
}

type MesaApi = ReturnType<typeof api.mesa>

/** Antes de poder pedir: escribir el nombre para entrar, esperar que el personal deje entrar, o ver que no se pudo. */
function Entrada({ datos, logo, negocio, ruta, mesaApi, recargar }: { datos: MesaCarta; logo: string | null; negocio: string; ruta: string; mesaApi: MesaApi; recargar: () => Promise<void> }) {
  const [nombre, setNombre] = useState(nombreGuardado)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entrar = async () => {
    if (!nombre.trim() || enviando) return
    setEnviando(true)
    setError('')
    try {
      try {
        localStorage.setItem(CLAVE_NOMBRE, nombre.trim())
      } catch {
        /* navegación privada: se vuelve a pedir la próxima vez */
      }
      await mesaApi.post<MesaCarta>(`${ruta}/entrar`, { nombre: nombre.trim() })
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="text-center" style={{ maxWidth: 380, width: '100%' }}>
        <div className="d-flex justify-content-center mb-3"><LogoNegocio logo={logo} tam={72} /></div>
        {negocio && <p className="text-secondary mb-0">{negocio}</p>}
        <h1 className="h3 mb-3">{datos.mesa}</h1>
        {datos.estado === 'Entrar' ? (
          <>
            <p className="fs-5 mb-1">¿A nombre de quién pedimos?</p>
            <p className="text-secondary">{datos.mensaje}</p>
            <input
              className="form-control form-control-lg text-center mb-2"
              value={nombre}
              maxLength={40}
              autoFocus
              autoComplete="given-name"
              aria-label="Tu nombre"
              placeholder="Tu nombre"
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void entrar()}
            />
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <button className="btn btn-primary btn-lg w-100" disabled={!nombre.trim() || enviando} onClick={() => void entrar()}>
              {enviando ? 'Entrando…' : 'Entrar a la mesa'}
            </button>
          </>
        ) : datos.estado === 'Pendiente' ? (
          <>
            <p className="fs-5 mb-1">Esperando al personal…</p>
            <p className="text-secondary">{datos.mensaje}</p>
            <div className="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Esperando" />
          </>
        ) : (
          <>
            <p className="fs-5 mb-1">No pudimos dejarte entrar</p>
            <p className="text-secondary">{datos.mensaje}</p>
          </>
        )}
      </div>
    </main>
  )
}

/** Ya con la mesa abierta y el código puesto: la carta, el carrito y «Mis pedidos». */
function Pedir({ datos, carta, ruta, mesaApi, recargar }: { datos: MesaCarta; carta: Carta; ruta: string; mesaApi: MesaApi; recargar: () => Promise<void> }) {
  const [carrito, setCarrito] = useState<Record<number, number>>({})
  const [nota, setNota] = useState('')
  const [filtro, setFiltro] = useState('Todo')
  const [pidiendo, setPidiendo] = useState(false)
  const [verPedidos, setVerPedidos] = useState(false)
  const [editando, setEditando] = useState<PedidoMesa | null>(null)
  const [enviando, setEnviando] = useState(false)

  const productos = useMemo(() => carta.categorias.flatMap((c) => c.productos), [carta])
  const lineas = Object.entries(carrito)
    .map(([id, cantidad]) => ({ producto: productos.find((p) => p.id === Number(id)), cantidad }))
    .filter((l): l is { producto: CartaProducto; cantidad: number } => !!l.producto && l.cantidad > 0)
  // si algo se acaba mientras el cliente arma su pedido, queda marcado y no se cuenta ni se envía hasta que lo quite
  const agotadasEnPedido = lineas.filter((l) => l.producto.agotado)
  const unidades = lineas.reduce((s, l) => s + (l.producto.agotado ? 0 : l.cantidad), 0)
  const total = lineas.reduce((s, l) => s + (l.producto.agotado ? 0 : (l.producto.precio ?? 0) * l.cantidad), 0)

  const cambiar = (id: number, delta: number) =>
    setCarrito((c) => {
      const n = Math.max(0, Math.min(20, (c[id] || 0) + delta))
      const copia = { ...c }
      if (n === 0) delete copia[id]
      else copia[id] = n
      return copia
    })

  const m = carta.moneda
  const pedidos = datos.pedidos
  const activos = pedidos.filter((p) => p.estado === 'PorConfirmar' || p.estado === 'Abierto' || p.estado === 'Unido')
  const conAviso = pedidos.filter((p) => p.estado === 'PorConfirmar' && p.aviso)
  const visibles = carta.categorias.filter((c) => filtro === 'Todo' || c.nombre === filtro)

  const limpiar = () => {
    setCarrito({})
    setNota('')
    setEditando(null)
    setPidiendo(false)
  }

  const enviar = async () => {
    if (!unidades || agotadasEnPedido.length > 0 || enviando) return
    setEnviando(true)
    try {
      const cuerpo = { nota: nota.trim(), items: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })) }
      if (editando) await mesaApi.put<PedidoMesa>(`${ruta}/pedidos/${editando.id}`, cuerpo)
      else await mesaApi.post<PedidoMesa>(`${ruta}/pedidos`, cuerpo)
      avisar(editando ? 'Cambios guardados. El personal verá tu pedido corregido.' : '¡Pedido enviado! El personal lo va a confirmar.')
      limpiar()
      setVerPedidos(true)
      void recargar()
    } catch (e) {
      avisarError(e)
      void recargar()
    } finally {
      setEnviando(false)
    }
  }

  const corregir = (p: PedidoMesa) => {
    const disponibles = new Set(productos.filter((x) => !x.agotado).map((x) => x.id))
    const nuevo: Record<number, number> = {}
    let quitados = 0
    for (const i of p.items) {
      if (disponibles.has(i.productoId)) nuevo[i.productoId] = i.cantidad
      else quitados++
    }
    setCarrito(nuevo)
    setNota(p.nota)
    setEditando(p)
    setVerPedidos(false)
    setPidiendo(true)
    if (quitados) avisar(`Se quitaron ${quitados} producto(s) que ya no están disponibles.`, 'error')
  }

  const cancelar = async (p: PedidoMesa) => {
    if (!(await confirmar({ titulo: '¿Cancelar este pedido?', mensaje: 'El personal ya no lo verá.', aceptar: 'Sí, cancelar' }))) return
    try {
      await mesaApi.del(`${ruta}/pedidos/${p.id}`)
      avisar('Pedido cancelado')
    } catch (e) {
      avisarError(e)
    } finally {
      void recargar()
    }
  }

  return (
    <div className="carta-publica">
      <header className="bg-body border-bottom">
        <div className="container py-3 d-flex align-items-center gap-3">
          <LogoNegocio logo={carta.logo} tam={48} />
          <div className="min-w-0 flex-grow-1">
            <h1 className="h5 mb-0 text-truncate">{carta.negocio}</h1>
            <p className="mb-0 fw-semibold">{datos.mesa}</p>
          </div>
          <button className="btn btn-outline-secondary position-relative" onClick={() => setVerPedidos(true)}>
            Mis pedidos
            {activos.length > 0 && <span className="badge text-bg-primary ms-2">{activos.length}</span>}
          </button>
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

      {conAviso.length > 0 && (
        <div className="container pt-3">
          {conAviso.map((p) => (
            <div key={p.id} className="alert alert-warning d-flex align-items-center justify-content-between gap-2 mb-2">
              <span><strong>Pedido #{p.numero}:</strong> {p.aviso}. Puedes corregirlo.</span>
              <button className="btn btn-sm btn-warning flex-shrink-0" onClick={() => corregir(p)}>Corregir</button>
            </div>
          ))}
        </div>
      )}

      <main className="container py-3 pb-5">
        {!carta.categorias.length && <p className="text-center text-secondary py-5">Todavía no hay productos en la carta.</p>}
        {visibles.map((cat) => (
          <section key={cat.nombre} className="mb-3">
            <h2 className="h6 text-uppercase text-secondary fw-bold mb-2">{cat.nombre}</h2>
            <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2">
              {cat.productos.map((p) => (
                <div key={p.id} className="col">
                  <article className={'card h-100 shadow-sm overflow-hidden carta-item' + (p.agotado ? ' opacity-50' : '')}>
                    <div className="carta-foto">
                      {p.imagenes.length > 0 ? <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" className="foto-carta" /> : <div className="sin-foto"><Icono nombre={p.icono} size={48} /></div>}
                      {p.agotado && <span className="badge text-bg-dark position-absolute top-0 start-0 m-2 w-auto h-auto">Agotado</span>}
                    </div>
                    <div className="card-body d-flex flex-column gap-1 py-2 px-3 min-w-0">
                      <h3 className="h6 mb-0">{p.nombre}</h3>
                      {p.descripcion && <p className="small text-secondary mb-1 carta-desc">{p.descripcion}</p>}
                      <div className="mt-auto d-flex justify-content-between align-items-center gap-2">
                        {p.precio !== null ? <strong className="fs-6">{money(p.precio, m)}</strong> : <span />}
                        {p.agotado ? <span className="small text-secondary">Se acabó por hoy</span> : <Cantidad n={carrito[p.id] || 0} nombre={p.nombre} cambiar={(d) => cambiar(p.id, d)} />}
                      </div>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {unidades > 0 && !pidiendo && (
        <button className="fab-carta btn btn-primary btn-lg shadow d-flex align-items-center justify-content-center gap-2" onClick={() => setPidiendo(true)}>
          <Icono nombre="carrito" size={22} /> {editando ? 'Terminar corrección' : 'Ver mi pedido'} ({unidades}) · {money(total, m)}
        </button>
      )}

      {pidiendo && (
        <Modal
          titulo={editando ? `Corregir pedido #${editando.numero}` : 'Tu pedido'}
          onCerrar={() => (editando ? limpiar() : setPidiendo(false))}
          pie={
            <button className="btn btn-primary flex-grow-1" disabled={!unidades || agotadasEnPedido.length > 0 || enviando} onClick={() => void enviar()}>
              {enviando ? 'Enviando…' : editando ? 'Guardar cambios' : 'Enviar pedido'}
            </button>
          }
        >
          <div className="list-group list-group-flush mb-3">
            {lineas.map(({ producto, cantidad }) => (
              <div key={producto.id} className="list-group-item d-flex align-items-center gap-2 px-0 bg-transparent">
                <div className="flex-grow-1 min-w-0">
                  {producto.nombre}
                  {producto.agotado ? <small className="d-block text-danger fw-semibold">Se acabó: quítalo para poder enviar</small> : producto.precio !== null && <small className="d-block text-secondary">{money(producto.precio, m)}</small>}
                </div>
                <Cantidad n={cantidad} nombre={producto.nombre} cambiar={(d) => cambiar(producto.id, d)} variante="secondary" />
              </div>
            ))}
            {!lineas.length && <p className="text-center text-secondary py-3 mb-0">Tu pedido está vacío.</p>}
          </div>
          <div className="d-flex justify-content-between fs-5 mb-3"><span>Total</span><strong>{money(total, m)}</strong></div>
          <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="mesa-nota">Nota (opcional)</label>
          <input id="mesa-nota" className="form-control" value={nota} maxLength={200} placeholder="Sin cebolla, sin picante…" onChange={(e) => setNota(e.target.value)} />
          <p className="small text-secondary mt-3 mb-0">
            Tu pedido le llega al personal del local, que lo acepta antes de prepararlo. El pago se hace en la caja al terminar.
          </p>
        </Modal>
      )}

      {verPedidos && (
        <Modal titulo="Mis pedidos" onCerrar={() => setVerPedidos(false)}>
          {!pedidos.length && <p className="text-center text-secondary py-3 mb-0">Todavía no hiciste ningún pedido desde este celular.</p>}
          <div className="d-flex flex-column gap-3">
            {pedidos.map((p) => {
              const e = ESTADOS[p.estado]
              return (
                <article key={p.id} className="border rounded p-3">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <strong>Pedido #{p.numero}{p.nombre && ` · ${p.nombre}`}</strong>
                    <span className={`badge ${e.clase}`}>{e.texto}</span>
                  </div>
                  <ul className="list-unstyled small mb-2">
                    {p.items.map((i) => <li key={i.productoId}>{i.cantidad} × {i.nombre}</li>)}
                  </ul>
                  {p.nota && <div className="small fst-italic text-secondary mb-2">“{p.nota}”</div>}
                  {p.aviso && <div className={'alert py-1 px-2 small mb-2 ' + (p.estado === 'Cancelado' ? 'alert-danger' : 'alert-warning')}>{p.aviso}</div>}
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <strong>{money(p.total, m)}</strong>
                    {p.estado === 'PorConfirmar' && (
                      <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => corregir(p)}>Corregir</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => void cancelar(p)}>Cancelar</button>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}

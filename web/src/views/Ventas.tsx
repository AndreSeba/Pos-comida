import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { CobroModal } from '../CobroModal'
import type { Pago } from '../cobro'
import { Icono } from '../Icono'
import { BotonModo, LogoNegocio, SelectorTema } from '../Personalizar'
import type { Config, MesaServicio, Pedido, ProductoVenta, Sesion, Turno, Venta } from '../types'
import { Estado, Modal, avisar, avisarError, useCarga, useMarca, confirmar } from '../ui'
import { horaCorta, inicioDia, money, pagosTexto, puede } from '../util'
import { ListaEntregas, ListaPedidos } from './PedidosVista'
import { ListaMesas } from './MesasServicio'

type Carrito = Record<number, number>
type Vista = 'vender' | 'pedidos' | 'entregas' | 'mesas'
/** Qué se está cobrando: lo que hay en el carrito (venta directa) o un pedido abierto. */
type Cobrando = { tipo: 'directa' } | { tipo: 'pedido'; pedido: Pedido; total: number }

const SEGUNDOS_ACTUALIZAR = 12

/**
 * Panel de ventas. Se adapta a cómo trabaja cada negocio (lo activa el administrador en Ajustes):
 * - cobrar al momento: se arma el pedido y se cobra;
 * - pedidos abiertos: se toma el pedido (por mesa o nombre), se le agrega más y se cobra al final, desde cualquier dispositivo;
 * - seguimiento de entrega: lo cobrado queda "por entregar" hasta marcarlo.
 * Un Mesero solo toma pedidos y entrega; no cobra ni ve ventas.
 */
export default function Ventas({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const puedeCobrar = puede(sesion, 'ventas.cobrar')
  const puedeTurno = puede(sesion, 'ventas.turno')
  const menu = useCarga(() => api.get<ProductoVenta[]>('/api/productos/menu'))
  const config = useCarga(() => api.get<Config>('/api/config'))
  const cfg = config.datos
  const pedidosOn = !!cfg?.pedidosAbiertos
  const entregasOn = !!cfg?.seguimientoEntrega
  useMarca(cfg ?? null)

  const turno = useCarga(
    () => (puedeTurno ? api.get<Turno>(`/api/ventas/turno?desde=${encodeURIComponent(new Date(inicioDia(Date.now())).toISOString())}`) : Promise.resolve(null)),
    [puedeTurno],
  )
  const pedidos = useCarga(() => (pedidosOn ? api.get<Pedido[]>('/api/pedidos') : Promise.resolve([] as Pedido[])), [pedidosOn])
  const mesasServicio = useCarga(() => (pedidosOn ? api.get<MesaServicio[]>('/api/mesas-servicio') : Promise.resolve([] as MesaServicio[])), [pedidosOn])
  const entregas = useCarga(() => (entregasOn ? api.get<Venta[]>('/api/ventas/por-entregar') : Promise.resolve([] as Venta[])), [entregasOn])

  // lo que toma el mesero tiene que aparecerle a la caja sin que nadie toque nada
  const { recargar: recargarPedidos } = pedidos
  const { recargar: recargarEntregas } = entregas
  const { recargar: recargarMesas } = mesasServicio
  useEffect(() => {
    if (!pedidosOn && !entregasOn) return
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (pedidosOn) { void recargarPedidos(); void recargarMesas() }
      if (entregasOn) void recargarEntregas()
    }, SEGUNDOS_ACTUALIZAR * 1000)
    return () => window.clearInterval(t)
  }, [pedidosOn, entregasOn, recargarPedidos, recargarEntregas, recargarMesas])

  const m = cfg?.moneda ?? 'Bs'
  const productos = useMemo(() => menu.datos ?? [], [menu.datos])
  const [vista, setVista] = useState<Vista>('vender')
  const [cat, setCat] = useState('Todas')
  const [carrito, setCarrito] = useState<Carrito>({})
  const [etiqueta, setEtiqueta] = useState('')
  const [nota, setNota] = useState('')
  const [editando, setEditando] = useState<Pedido | null>(null)
  const [cobrando, setCobrando] = useState<Cobrando | null>(null)
  const [verCarrito, setVerCarrito] = useState(false)
  const [verTurno, setVerTurno] = useState(false)
  const [verApariencia, setVerApariencia] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // si el administrador apaga una función mientras alguien trabaja, la pestaña desaparece: volver a "Vender"
  const vistaActual: Vista = ((vista === 'pedidos' || vista === 'mesas') && !pedidosOn) || (vista === 'entregas' && !entregasOn) ? 'vender' : vista

  const categorias = useMemo(() => ['Todas', ...Array.from(new Set(productos.map((p) => p.categoria || 'Sin categoría')))], [productos])
  const visibles = productos.filter((p) => cat === 'Todas' || (p.categoria || 'Sin categoría') === cat)

  const lineas = Object.entries(carrito)
    .map(([id, cantidad]) => ({ producto: productos.find((p) => p.id === Number(id)), cantidad }))
    .filter((l): l is { producto: ProductoVenta; cantidad: number } => !!l.producto && l.cantidad > 0)
  const total = lineas.reduce((s, l) => s + l.producto.precio * l.cantidad, 0)
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0)
  const itemsPedido = lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad }))

  const cambiar = (id: number, delta: number) =>
    setCarrito((c) => {
      const n = Math.max(0, (c[id] || 0) + delta)
      const copia = { ...c }
      if (n === 0) delete copia[id]
      else copia[id] = n
      return copia
    })

  const limpiar = useCallback(() => {
    setCarrito({})
    setEtiqueta('')
    setNota('')
    setEditando(null)
    setVerCarrito(false)
  }, [])

  const refrescarTodo = () => {
    void recargarPedidos()
    void recargarEntregas()
    void turno.recargar()
  }

  /* ------------------------------ pedidos abiertos ------------------------------ */
  const guardarPedido = async (): Promise<Pedido | null> => {
    if (!lineas.length || enviando) return null
    setEnviando(true)
    try {
      const cuerpo = { etiqueta: etiqueta.trim(), nota: nota.trim(), items: itemsPedido }
      const r = editando ? await api.put<Pedido>(`/api/pedidos/${editando.id}`, cuerpo) : await api.post<Pedido>('/api/pedidos', cuerpo)
      avisar(editando ? `Pedido #${r.numero} actualizado` : `Pedido #${r.numero} guardado${r.etiqueta ? ` · ${r.etiqueta}` : ''}`)
      setEditando(r)
      void recargarPedidos()
      return r
    } catch (e) {
      avisarError(e)
      void menu.recargar()
      return null
    } finally {
      setEnviando(false)
    }
  }

  const guardarYSalir = async () => {
    const volverAPedidos = !!editando
    if (await guardarPedido()) {
      limpiar()
      if (volverAPedidos) setVista('pedidos')
    }
  }

  const abrirPedido = (p: Pedido) => {
    const disponibles = new Set(productos.map((x) => x.id))
    const nuevo: Carrito = {}
    let quitados = 0
    for (const i of p.items) {
      if (disponibles.has(i.productoId)) nuevo[i.productoId] = i.cantidad
      else quitados++
    }
    setCarrito(nuevo)
    setEtiqueta(p.etiqueta)
    setNota(p.nota)
    setEditando(p)
    setVista('vender')
    setVerCarrito(true)
    if (quitados) avisar(`Se quitaron ${quitados} producto(s) que ya no están disponibles.`, 'error')
  }

  const cancelarPedido = async (p: Pedido) => {
    if (!(await confirmar({ titulo: `¿Cancelar el pedido #${p.numero}?`, mensaje: `${p.etiqueta ? `${p.etiqueta} · ` : ''}No se cobra.`, aceptar: 'Sí, cancelar pedido' }))) return
    try {
      await api.del(`/api/pedidos/${p.id}`)
      if (editando?.id === p.id) limpiar()
      avisar(`Pedido #${p.numero} cancelado`)
      void recargarPedidos()
    } catch (e) {
      avisarError(e)
      void recargarPedidos()
    }
  }

  /* ------------------------------ pedidos que hacen los clientes desde la mesa ------------------------------ */
  const confirmarPedido = async (p: Pedido) => {
    try {
      const r = await api.post<Pedido>(`/api/pedidos/${p.id}/confirmar`, {})
      avisar(r.id !== p.id ? `Pedido #${p.numero} sumado a la cuenta #${r.numero} de ${r.etiqueta}` : `Pedido #${p.numero} aceptado · ${p.etiqueta}`)
    } catch (e) {
      avisarError(e)
    } finally {
      void recargarPedidos()
    }
  }

  const rechazarPedido = async (p: Pedido) => {
    const motivo = window.prompt(`¿Por qué rechazas el pedido #${p.numero} (${p.etiqueta})? El cliente verá este mensaje.`, '')
    if (motivo === null) return
    try {
      await api.post(`/api/pedidos/${p.id}/rechazar`, { motivo: motivo.trim() })
      avisar(`Pedido #${p.numero} rechazado`)
    } catch (e) {
      avisarError(e)
    } finally {
      void recargarPedidos()
    }
  }

  const sinStock = async (p: Pedido, productoId: number, nombre: string) => {
    if (!(await confirmar({ titulo: `¿No hay «${nombre}»?`, mensaje: 'Se quita de este pedido, se marca como agotado (nadie podrá pedirlo desde la mesa) y el cliente ve el aviso.', aceptar: 'Marcar agotado', tono: 'aviso' }))) return
    try {
      await api.post<Pedido>(`/api/pedidos/${p.id}/sin-stock/${productoId}`, {})
      avisar(`«${nombre}» marcado como agotado`)
      if (editando?.id === p.id) limpiar()
    } catch (e) {
      avisarError(e)
    } finally {
      void recargarPedidos()
      void menu.recargar()
    }
  }

  /* ------------------------------ cobro ------------------------------ */
  const empezarCobroDesdeCarrito = async () => {
    if (!lineas.length) return
    // si es un pedido abierto, primero se guardan los cambios para cobrar lo que hay en pantalla
    if (editando) {
      const guardado = await guardarPedido()
      if (guardado) setCobrando({ tipo: 'pedido', pedido: guardado, total })
    } else setCobrando({ tipo: 'directa' })
  }

  const confirmarCobro = async (pagos: Pago[], notaCobro: string, vuelto: number) => {
    if (!cobrando || enviando) return
    setEnviando(true)
    try {
      const pagosApi = pagos.map((p) => ({ metodo: p.metodo, monto: p.monto }))
      const totalCobro = cobrando.tipo === 'directa' ? total : cobrando.total
      if (cobrando.tipo === 'directa') {
        await api.post('/api/ventas', { items: itemsPedido, pagos: pagosApi, nota: notaCobro, etiqueta: etiqueta.trim() })
        limpiar()
      } else {
        await api.post(`/api/pedidos/${cobrando.pedido.id}/cobrar`, { pagos: pagosApi, nota: notaCobro })
        if (editando?.id === cobrando.pedido.id) limpiar()
      }
      avisar(vuelto > 0 ? `Cobrado · Vuelto ${money(vuelto, m)}` : `Cobrado · ${money(totalCobro, m)}`)
      setCobrando(null)
      refrescarTodo()
    } catch (e) {
      avisarError(e)
      void menu.recargar()
      void recargarPedidos()
    } finally {
      setEnviando(false)
    }
  }

  const marcarEntregada = async (v: Venta) => {
    try {
      await api.put(`/api/ventas/${v.id}/entregada`, {})
      void recargarEntregas()
    } catch (e) {
      avisarError(e)
      void recargarEntregas()
    }
  }

  const t = turno.datos
  const hayVistas = pedidosOn || entregasOn
  const nPedidos = pedidos.datos?.length ?? 0
  const nSolicitudes = mesasServicio.datos?.reduce((s, m) => s + (m.activa ? m.solicitudes.length : 0), 0) ?? 0
  const nPorConfirmar = pedidos.datos?.filter((p) => p.estado === 'PorConfirmar').length ?? 0
  const nEntregas = entregas.datos?.length ?? 0
  const sinFuncion = !puedeCobrar && !pedidosOn && !!cfg // un mesero sin pedidos abiertos no tiene qué hacer

  return (
    <div className="pos">
      <header className="navbar sticky-top bg-body border-bottom px-3 py-2 flex-nowrap justify-content-between gap-2">
        <div className="text-truncate d-flex align-items-center gap-2">
          {cfg?.logo && <LogoNegocio logo={cfg.logo} tam={30} />}
          <span className="text-truncate"><strong>{cfg?.negocio ?? ''}</strong><span className="text-secondary"> · {sesion.nombre}</span></span>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {puedeTurno && (
            <button className="btn btn-sm btn-outline-secondary text-nowrap" onClick={() => { setVerTurno(true); void turno.recargar() }}>
              Turno · {money(t?.total ?? 0, m)}
            </button>
          )}
          <BotonModo />
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setVerApariencia(true)} aria-label="Apariencia"><Icono nombre="paleta" size={16} /></button>
          <button className="btn btn-sm btn-outline-secondary" onClick={onSalir}>Salir</button>
        </div>
      </header>

      {hayVistas && (
        <nav className="nav nav-pills nav-fill px-2 py-1 bg-body border-bottom gap-1 pos-vistas" aria-label="Secciones">
          <button className={'nav-link' + (vistaActual === 'vender' ? ' active' : '')} onClick={() => setVista('vender')}>
            {editando ? `Pedido #${editando.numero}` : 'Vender'}
          </button>
          {pedidosOn && (
            <button className={'nav-link' + (vistaActual === 'pedidos' ? ' active' : '')} onClick={() => setVista('pedidos')}>
              Pedidos {nPedidos > 0 && <span className="badge rounded-pill text-bg-danger ms-1">{nPedidos}</span>}
              {nPorConfirmar > 0 && <span className="badge rounded-pill text-bg-warning ms-1" title="Pedidos de clientes esperando que los aceptes">{nPorConfirmar} por aceptar</span>}
            </button>
          )}
          {pedidosOn && (
            <button className={'nav-link' + (vistaActual === 'mesas' ? ' active' : '')} onClick={() => setVista('mesas')}>
              Mesas {nSolicitudes > 0 && <span className="badge rounded-pill text-bg-warning ms-1" title="Clientes esperando que los dejes entrar">{nSolicitudes} quieren entrar</span>}
            </button>
          )}
          {entregasOn && (
            <button className={'nav-link' + (vistaActual === 'entregas' ? ' active' : '')} onClick={() => setVista('entregas')}>
              Entregas {nEntregas > 0 && <span className="badge rounded-pill text-bg-danger ms-1">{nEntregas}</span>}
            </button>
          )}
        </nav>
      )}

      {vistaActual === 'pedidos' && (
        <ListaPedidos
          pedidos={pedidos}
          moneda={m}
          puedeCobrar={puedeCobrar}
          onAbrir={abrirPedido}
          onCobrar={(p) => setCobrando({ tipo: 'pedido', pedido: p, total: p.total })}
          onCancelar={(p) => void cancelarPedido(p)}
          onConfirmar={(p) => void confirmarPedido(p)}
          onRechazar={(p) => void rechazarPedido(p)}
          onSinStock={(p, id, nombre) => void sinStock(p, id, nombre)}
        />
      )}
      {vistaActual === 'mesas' && <ListaMesas mesas={mesasServicio} conPermiso={!!cfg?.ingresoMesaConPermiso} />}
      {vistaActual === 'entregas' && <ListaEntregas entregas={entregas} moneda={m} onEntregar={(v) => void marcarEntregada(v)} />}

      {vistaActual === 'vender' && (
        <div className="pos-body">
          <section className="catalogo">
            {sinFuncion && (
              <div className="alert alert-warning">Los pedidos abiertos no están activados. Pídele al administrador que los active en Ajustes.</div>
            )}
            <div className="d-flex gap-2 overflow-auto pb-2">
              {categorias.map((c) => (
                <button key={c} className={'btn btn-sm rounded-pill flex-shrink-0 ' + (c === cat ? 'btn-primary' : 'btn-outline-secondary')} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
              <button className="btn btn-sm btn-outline-secondary rounded-pill flex-shrink-0" onClick={() => void menu.recargar()} aria-label="Actualizar menú">
                <Icono nombre="refrescar" size={18} />
              </button>
            </div>

            <Estado cargando={menu.cargando && !menu.datos} error={menu.error} onReintentar={menu.recargar} />
            {menu.datos && !productos.length && <p className="text-center text-secondary py-4">Aún no hay productos. Pídele al administrador que los cree.</p>}

            <div className="row row-cols-2 row-cols-sm-3 row-cols-xl-4 g-2 mt-1">
              {visibles.map((p) => {
                const n = carrito[p.id] || 0
                return (
                  <div key={p.id} className="col">
                    <button className={'tile card shadow-sm w-100 h-100 align-items-center justify-content-center text-center' + (n ? ' sel' : '')} onClick={() => cambiar(p.id, 1)}>
                      {p.fotoUrl ? <img className="tile-foto" src={p.fotoUrl} alt="" loading="lazy" /> : <Icono nombre={p.icono} size={40} className="text-primary" />}
                      <span className="fw-bold">{p.nombre}</span>
                      <span className="text-secondary fw-semibold">{money(p.precio, m)}</span>
                      {n > 0 && <span className="badge rounded-pill text-bg-primary position-absolute top-0 end-0 m-2 fs-6">{n}</span>}
                      {p.agotado && <span className="badge text-bg-danger position-absolute top-0 start-0 m-2">Agotado</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className={'ticket bg-body' + (verCarrito ? ' abierto' : '')}>
            <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <strong>{editando ? `Pedido #${editando.numero}` : 'Pedido'}</strong>
              <button className="btn btn-sm btn-outline-secondary d-md-none" onClick={() => setVerCarrito(false)}>Cerrar</button>
            </div>
            <div className="flex-grow-1 overflow-auto px-3">
              {!lineas.length && <p className="text-center text-secondary py-4">Toca un producto para agregarlo</p>}
              {lineas.map(({ producto, cantidad }) => (
                <div key={producto.id} className="d-flex align-items-center gap-2 py-2 border-bottom">
                  <div className="flex-grow-1 min-w-0">
                    {producto.nombre}
                    <small className="d-block text-secondary">{money(producto.precio, m)}</small>
                  </div>
                  <div className="btn-group qty" role="group" aria-label={`Cantidad de ${producto.nombre}`}>
                    <button className="btn btn-outline-secondary" onClick={() => cambiar(producto.id, -1)} aria-label="Quitar uno"><Icono nombre="menos" size={16} /></button>
                    <span className="btn btn-outline-secondary disabled opacity-100 fw-bold">{cantidad}</span>
                    <button className="btn btn-outline-secondary" onClick={() => cambiar(producto.id, 1)} aria-label="Agregar uno"><Icono nombre="mas" size={16} /></button>
                  </div>
                  <div className="fw-bold text-end linea-total">{money(producto.precio * cantidad, m)}</div>
                </div>
              ))}
            </div>
            <div className="p-3 border-top">
              {hayVistas && (
                <div className="row g-2 mb-2">
                  <div className="col-12">
                    <input className="form-control" aria-label="Mesa o nombre" value={etiqueta} maxLength={40} placeholder="Mesa o nombre (opcional)" onChange={(e) => setEtiqueta(e.target.value)} />
                  </div>
                  {pedidosOn && (
                    <div className="col-12">
                      <input className="form-control" aria-label="Nota del pedido" value={nota} maxLength={200} placeholder="Nota: sin cebolla, para llevar…" onChange={(e) => setNota(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
              <div className="d-flex justify-content-between fs-4 mb-2"><span>Total</span><strong>{money(total, m)}</strong></div>
              <div className="d-flex align-items-center gap-2">
                {editando ? (
                  <>
                    <button className="btn btn-outline-secondary" onClick={() => { limpiar(); setVista('pedidos') }}>Cerrar</button>
                    <button className={'btn flex-grow-1 ' + (puedeCobrar ? 'btn-outline-primary' : 'btn-primary')} disabled={!lineas.length || enviando} onClick={() => void guardarYSalir()}>
                      Guardar cambios
                    </button>
                    {puedeCobrar && (
                      <button className="btn btn-primary flex-grow-1" disabled={!lineas.length || enviando} onClick={() => void empezarCobroDesdeCarrito()}>Cobrar</button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn btn-outline-secondary" disabled={!lineas.length} onClick={limpiar}>Vaciar</button>
                    {pedidosOn && (
                      <button className={'btn flex-grow-1 ' + (puedeCobrar ? 'btn-outline-primary' : 'btn-primary')} disabled={!lineas.length || enviando} onClick={() => void guardarYSalir()}>
                        {puedeCobrar ? 'Guardar pedido' : 'Enviar pedido'}
                      </button>
                    )}
                    {puedeCobrar && (
                      <button className="btn btn-primary flex-grow-1" disabled={!lineas.length} onClick={() => void empezarCobroDesdeCarrito()}>Cobrar</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {vistaActual === 'vender' && unidades > 0 && !verCarrito && (
        <button className="fab btn btn-primary btn-lg shadow d-md-none d-flex align-items-center justify-content-center gap-2" onClick={() => setVerCarrito(true)}>
          <Icono nombre="recibo" size={22} /> Ver pedido ({unidades}) · {money(total, m)}
        </button>
      )}

      {cobrando && (
        <CobroModal
          total={cobrando.tipo === 'directa' ? total : cobrando.total}
          moneda={m}
          titulo={cobrando.tipo === 'pedido' ? `Cobrar pedido #${cobrando.pedido.numero}${cobrando.pedido.etiqueta ? ` · ${cobrando.pedido.etiqueta}` : ''}` : undefined}
          notaInicial={cobrando.tipo === 'directa' ? nota : ''}
          enviando={enviando}
          onCerrar={() => setCobrando(null)}
          onConfirmar={(pagos, notaCobro, vuelto) => void confirmarCobro(pagos, notaCobro, vuelto)}
        />
      )}

      {verApariencia && (
        <Modal titulo="Apariencia de este dispositivo" onCerrar={() => setVerApariencia(false)} pie={<button className="btn btn-primary" onClick={() => setVerApariencia(false)}>Listo</button>}>
          <SelectorTema />
        </Modal>
      )}

      {verTurno && (
        <Modal titulo="Mi turno de hoy" onCerrar={() => setVerTurno(false)} pie={<button className="btn btn-primary" onClick={() => setVerTurno(false)}>Cerrar</button>}>
          <p className="display-6 fw-bold mb-0">{money(t?.total ?? 0, m)}</p>
          <p className="text-secondary">{t?.cantidad ?? 0} ventas</p>
          <div className="list-group list-group-flush">
            {t?.ventas.map((v) => (
              <div key={v.id} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent">
                <span>{horaCorta(v.fecha)} · {v.etiqueta ? `${v.etiqueta} · ` : ''}{v.items.reduce((s, i) => s + i.cantidad, 0)} items · {pagosTexto(v, m)}</span>
                <strong>{money(v.total, m)}</strong>
              </div>
            ))}
            {t && !t.ventas.length && <p className="text-center text-secondary py-4">Todavía no hay ventas hoy</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

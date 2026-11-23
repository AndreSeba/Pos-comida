import { useEffect, useState } from 'react'
import { api } from '../api'
import type { MesaServicio } from '../types'
import { Estado, avisar, avisarError, confirmar } from '../ui'
import { horaCorta } from '../util'

interface Carga<T> {
  datos: T[] | null
  cargando: boolean
  error: string
  recargar: () => Promise<void>
}

/**
 * El servicio del día. Cuando los clientes se sientan, el personal toca «Abrir mesa»: durante unos minutos entra solo quien escanee el QR.
 * Si alguien escanea después (o con la mesa libre), le aparece aquí como solicitud y se le deja entrar con un toque. El QR de ayer no sirve:
 * para pedir hay que haber entrado a la sesión de hoy, y la sesión termina al cobrar la cuenta.
 */
export function ListaMesas({ mesas, conPermiso }: { mesas: Carga<MesaServicio>; conPermiso: boolean }) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  const lista = (mesas.datos ?? []).filter((m) => m.activa)

  const llamar = async (ruta: string, exito: string) => {
    try {
      await api.post(`/api/mesas-servicio/${ruta}`, {})
      avisar(exito)
    } catch (e) {
      avisarError(e)
    } finally {
      void mesas.recargar()
    }
  }

  const cerrar = async (m: MesaServicio) => {
    if (!(await confirmar({ titulo: `¿Cerrar ${m.nombre}?`, mensaje: 'Sus celulares dejan de poder pedir y los pedidos que todavía no aceptaste se cancelan. La cuenta abierta sigue para cobrarla.', aceptar: 'Cerrar mesa', tono: 'aviso' }))) return
    void llamar(`${m.id}/cerrar`, `${m.nombre} cerrada`)
  }

  const abrir = async (m: MesaServicio) => {
    if (m.abierta && !(await confirmar({ titulo: `${m.nombre} ya está abierta`, mensaje: 'Si la abres de nuevo, los celulares actuales tendrán que volver a entrar.', aceptar: 'Abrir de nuevo', tono: 'aviso' }))) return
    void llamar(`${m.id}/abrir`, `${m.nombre} abierta: quien escanee su QR en los próximos minutos entra solo`)
  }

  return (
    <div className="pos-lista p-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h5 mb-0">Mesas <span className="text-secondary fs-6">({lista.filter((m) => m.abierta).length} abiertas)</span></h2>
      </div>
      <p className="text-secondary small">
        {conPermiso ? (
          <>
            Toca <strong>Abrir mesa</strong> cuando se sienten los clientes: quien escanee el QR en los próximos minutos entra solo. Si alguien llega después,
            te aparece aquí para dejarlo entrar. Sin entrar no se puede pedir, aunque se tenga el QR de otro día.
          </>
        ) : (
          <>
            Los clientes entran solos: escanean el QR de su mesa, escriben su nombre y ya pueden pedir. Aquí ves qué mesas tienen gente y puedes{' '}
            <strong>cerrar</strong> una para que sus celulares dejen de pedir. Al cobrar la cuenta la mesa se cierra sola.
          </>
        )}
      </p>
      <Estado cargando={mesas.cargando && !mesas.datos} error={mesas.error} onReintentar={mesas.recargar} />
      {mesas.datos && !lista.length && <p className="text-center text-secondary py-5">Todavía no hay mesas. El administrador las crea en Administración → Mesas.</p>}
      <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-3">
        {lista.map((m) => {
          const entradaAbierta = !!m.ingresoHasta && new Date(m.ingresoHasta).getTime() > ahora
          return (
            <div key={m.id} className="col">
              <article className={'card shadow-sm h-100' + (m.solicitudes.length ? ' border-warning border-2' : m.abierta ? ' border-success border-2' : '')}>
                <div className="card-body d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <strong className="fs-5">{m.nombre}</strong>
                    {m.abierta ? <span className="badge text-bg-success">Abierta</span> : <span className="badge text-bg-secondary">Libre</span>}
                  </div>

                  {m.solicitudes.map((s) => (
                    <div key={s.id} className="border border-warning rounded p-2 bg-warning-subtle">
                      <div className="fw-semibold">{s.nombre} quiere entrar</div>
                      <div className="d-flex gap-2 mt-1">
                        <button className="btn btn-sm btn-primary flex-grow-1" onClick={() => void llamar(`solicitudes/${s.id}/aceptar`, `${s.nombre} entró a ${m.nombre}`)}>Dejar entrar</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => void llamar(`solicitudes/${s.id}/rechazar`, `No se dejó entrar a ${s.nombre}`)}>No</button>
                      </div>
                    </div>
                  ))}

                  {m.abierta ? (
                    <>
                      <div className="small text-secondary">
                        Desde las {m.desde ? horaCorta(m.desde) : ''} · {m.clientes} {m.clientes === 1 ? 'celular' : 'celulares'}
                        {m.pendientes > 0 && <span className="badge text-bg-warning ms-2">{m.pendientes} por aceptar</span>}
                      </div>
                      <div className={'small ' + (entradaAbierta ? 'text-success fw-semibold' : 'text-secondary')}>
                        {entradaAbierta ? `Entrada abierta hasta las ${horaCorta(m.ingresoHasta!)}` : 'Entrada cerrada: quien llegue pide permiso'}
                      </div>
                      <div className="d-flex flex-wrap gap-2 mt-auto">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => void llamar(`${m.id}/permitir-ingreso`, `Entrada abierta en ${m.nombre}`)}>Dejar entrar</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => cerrar(m)}>Cerrar mesa</button>
                      </div>
                    </>
                  ) : (
                    <button className="btn btn-primary mt-auto" onClick={() => abrir(m)}>Abrir mesa</button>
                  )}
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </div>
  )
}

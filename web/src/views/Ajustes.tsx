import { useRef, useState } from 'react'
import { api } from '../api'
import { avisar, avisarError } from '../ui'
import type { Catalogo } from './Admin'
import { SelectorColor, SelectorTema, VistaPreviaNegocio } from '../Personalizar'
import { reducirImagen } from '../imagen'
import { Icono } from '../Icono'
import { COLOR_MARCA_POR_DEFECTO } from '../tema'
import OrdenMenu from './OrdenMenu'

export default function Ajustes({ cat }: { cat: Catalogo }) {
  const [negocio, setNegocio] = useState(cat.config.negocio)
  const [moneda, setMoneda] = useState(cat.config.moneda)
  const [color, setColor] = useState(cat.config.colorMarca)
  const [logo, setLogo] = useState<string | null>(cat.config.logo)
  const archivo = useRef<HTMLInputElement>(null)
  const cambiado = negocio.trim() !== cat.config.negocio || moneda.trim() !== cat.config.moneda || color.toUpperCase() !== cat.config.colorMarca.toUpperCase() || logo !== cat.config.logo

  const [guardandoFlujo, setGuardandoFlujo] = useState(false)
  const cambiarFlujo = async (cambio: Partial<Pick<Catalogo['config'], 'pedidosAbiertos' | 'seguimientoEntrega'>>) => {
    setGuardandoFlujo(true)
    try {
      await api.put('/api/config', { ...cat.config, ...cambio })
      await cat.recargar()
      avisar('Guardado')
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardandoFlujo(false)
    }
  }

  const guardarNegocio = async () => {
    try {
      await api.put('/api/config', { ...cat.config, negocio: negocio.trim(), moneda: moneda.trim(), colorMarca: color, logo })
      await cat.recargar()
      avisar('Cambios guardados')
    } catch (e) {
      avisarError(e)
    }
  }

  const descartar = () => {
    setNegocio(cat.config.negocio)
    setMoneda(cat.config.moneda)
    setColor(cat.config.colorMarca)
    setLogo(cat.config.logo)
  }

  const elegirLogo = async (f: File | undefined) => {
    if (!f) return
    try {
      setLogo(await reducirImagen(f))
    } catch (e) {
      avisarError(e)
    }
  }

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Tu negocio</h3>
        <p className="text-secondary">El nombre, el logo y el color de la marca se ven en todos los dispositivos. Cada uno puede elegir su propio modo y color más abajo.</p>
        <div className="row g-4">
          <div className="col-12 col-lg-7 d-grid gap-3 align-content-start">
            <div className="row g-3">
              <div className="col-12 col-sm-8">
                <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="neg-nombre">Nombre</label>
                <input id="neg-nombre" className="form-control" value={negocio} maxLength={80} onChange={(e) => setNegocio(e.target.value)} />
              </div>
              <div className="col-12 col-sm-4">
                <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="neg-moneda">Moneda</label>
                <input id="neg-moneda" className="form-control" value={moneda} maxLength={8} onChange={(e) => setMoneda(e.target.value)} />
              </div>
            </div>

            <div>
              <span className="form-label small fw-semibold text-secondary mb-2 d-block">Logo</span>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={() => archivo.current?.click()}>
                  <Icono nombre="subir" size={18} /> {logo ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {logo && <button type="button" className="btn btn-outline-danger" onClick={() => setLogo(null)}>Quitar</button>}
                <input
                  ref={archivo}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    void elegirLogo(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
              <small className="text-secondary d-block mt-1">PNG, JPG o WebP. Se reduce solo a 256 px.</small>
            </div>

            <SelectorColor etiqueta="Color de la marca" valor={color} alCambiar={(hex) => setColor(hex ?? COLOR_MARCA_POR_DEFECTO)} />
          </div>

          <div className="col-12 col-lg-5">
            <span className="form-label small fw-semibold text-secondary mb-2 d-block">Así se ve</span>
            <VistaPreviaNegocio negocio={negocio} logo={logo} color={color} moneda={moneda || 'Bs'} />
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 mt-3">
          <button className="btn btn-primary" disabled={!cambiado || !negocio.trim()} onClick={() => void guardarNegocio()}>Guardar cambios</button>
          {cambiado && <button className="btn btn-outline-secondary" onClick={descartar}>Descartar</button>}
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Cómo trabaja tu negocio</h3>
        <p className="text-secondary">Activa lo que necesites. Cada interruptor se guarda al tocarlo y se aplica en todos los dispositivos.</p>
        <div className="d-grid gap-3">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" role="switch" id="f-pedidos" checked={cat.config.pedidosAbiertos} disabled={guardandoFlujo} onChange={(e) => void cambiarFlujo({ pedidosAbiertos: e.target.checked })} />
            <label className="form-check-label fw-semibold" htmlFor="f-pedidos">Pedidos abiertos (cobrar al final)</label>
            <div className="small text-secondary">Se toma el pedido por mesa o nombre, queda abierto, se le agrega más y se cobra al terminar. Se ve en todos los dispositivos, así un mesero toma desde su celular y la caja cobra.</div>
          </div>
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" role="switch" id="f-entrega" checked={cat.config.seguimientoEntrega} disabled={guardandoFlujo} onChange={(e) => void cambiarFlujo({ seguimientoEntrega: e.target.checked })} />
            <label className="form-check-label fw-semibold" htmlFor="f-entrega">Seguimiento de entrega (cobrar primero, entregar después)</label>
            <div className="small text-secondary">Lo cobrado queda «por entregar» hasta que alguien lo marca como entregado.</div>
          </div>
          <div className="small text-secondary">
            Para <strong>cobrar al momento</strong> no hace falta activar nada. Para que alguien solo tome pedidos sin cobrar, créalo en la pestaña <strong>Accesos</strong> con el rol <strong>Mesero</strong>.
          </div>
        </div>
      </section>

      <OrdenMenu cat={cat} />

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Apariencia de este dispositivo</h3>
        <p className="text-secondary">Solo cambia cómo ves el sistema en este celular o computadora. Se aplica al tocar.</p>
        <SelectorTema />
      </section>
    </>
  )
}

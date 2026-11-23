import type { CSSProperties } from 'react'
import { Icono } from './Icono'
import { ACENTOS, guardarTema, useTema, variablesDeAcento, type Modo } from './tema'
import { money } from './util'

/* ------------------------------ logo del negocio ------------------------------ */
export function LogoNegocio({ logo, tam = 76 }: { logo?: string | null; tam?: number }) {
  return (
    <div className={'logo' + (logo ? ' con-imagen' : '')} style={{ width: tam, height: tam, borderRadius: Math.round(tam * 0.29) }}>
      {logo ? <img src={logo} alt="" /> : <Icono nombre="hamburguesa" size={Math.round(tam * 0.58)} />}
    </div>
  )
}

/* ------------------------------ selector de color ------------------------------ */
/** Los colores de la lista y un "Otro" que abre el selector del sistema. Con `opcionNegocio`, null = "el color del negocio". */
export function SelectorColor({
  etiqueta, valor, alCambiar, opcionNegocio = false,
}: { etiqueta: string; valor: string | null; alCambiar: (hex: string | null) => void; opcionNegocio?: boolean }) {
  const actual = valor?.toUpperCase() ?? null
  const esPropio = actual !== null && !ACENTOS.some((a) => a.hex === actual)
  return (
    <div role="group" aria-label={etiqueta}>
      <span className="form-label small fw-semibold text-secondary mb-2 d-block">{etiqueta}</span>
      <div className="d-flex flex-wrap align-items-center gap-2">
        {opcionNegocio && (
          <button type="button" className={'btn btn-sm rounded-pill ' + (actual === null ? 'btn-primary' : 'btn-outline-secondary')} aria-pressed={actual === null} onClick={() => alCambiar(null)}>
            Color del negocio
          </button>
        )}
        {ACENTOS.map((a) => (
          <button
            key={a.hex}
            type="button"
            className="muestra"
            style={{ background: a.hex }}
            aria-label={a.nombre}
            title={a.nombre}
            aria-pressed={actual === a.hex}
            onClick={() => alCambiar(a.hex)}
          >
            {actual === a.hex && <Icono nombre="check" size={18} />}
          </button>
        ))}
        <label className="muestra muestra-otro" data-activo={esPropio} style={esPropio ? { background: actual! } : undefined} title="Otro color">
          <span className="visually-hidden">Otro color</span>
          <input type="color" value={actual ?? ACENTOS[0].hex} onChange={(e) => alCambiar(e.target.value.toUpperCase())} />
          {esPropio ? <Icono nombre="check" size={18} /> : <Icono nombre="paleta" size={18} />}
        </label>
      </div>
    </div>
  )
}

/* ------------------------------ apariencia de este dispositivo ------------------------------ */
const MODOS: { id: Modo; nombre: string }[] = [
  { id: 'auto', nombre: 'Automático' },
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
]

/** Se aplica y se guarda al tocar (sin botón de guardar). Vale solo para este celular o tablet. */
export function SelectorTema() {
  const { tema } = useTema()
  return (
    <div className="d-grid gap-3">
      <div role="group" aria-label="Modo">
        <span className="form-label small fw-semibold text-secondary mb-2 d-block">Modo</span>
        <div className="btn-group w-100">
          {MODOS.map((m) => (
            <button key={m.id} type="button" className={'btn btn-outline-primary' + (tema.modo === m.id ? ' active' : '')} aria-pressed={tema.modo === m.id} onClick={() => guardarTema({ ...tema, modo: m.id })}>
              {m.nombre}
            </button>
          ))}
        </div>
      </div>
      <SelectorColor etiqueta="Color en este dispositivo" valor={tema.acento} opcionNegocio alCambiar={(hex) => guardarTema({ ...tema, acento: hex })} />
    </div>
  )
}

/* ------------------------------ vista previa en vivo ------------------------------ */
/** Una miniatura del panel de ventas con el nombre, el logo y el color que se están editando (sin guardar todavía). */
export function VistaPreviaNegocio({ negocio, logo, color, moneda }: { negocio: string; logo: string | null; color: string; moneda: string }) {
  const { oscuro } = useTema()
  return (
    <div className="card p-3 vista-previa" style={variablesDeAcento(color, oscuro) as CSSProperties} aria-label="Vista previa">
      <div className="d-flex align-items-center gap-2 mb-3">
        <LogoNegocio logo={logo} tam={44} />
        <strong className="fs-5 text-truncate">{negocio.trim() || 'Mi Negocio'}</strong>
      </div>
      <div className="row g-2">
        {[['hamburguesa', 'Hamburguesa', 22, true], ['papas', 'Papas fritas', 10, false]].map(([ico, nombre, precio, sel]) => (
          <div key={String(nombre)} className="col-6">
            <div className={'tile card w-100 align-items-center justify-content-center text-center' + (sel ? ' sel' : '')}>
              <Icono nombre={String(ico)} size={36} className="text-primary" />
              <span className="fw-bold">{nombre}</span>
              <span className="text-secondary fw-semibold">{money(Number(precio), moneda)}</span>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary w-100 mt-3" tabIndex={-1}>Cobrar</button>
    </div>
  )
}

/** Botón rápido: alterna entre modo claro y oscuro en este dispositivo. */
export function BotonModo() {
  const { tema, oscuro } = useTema()
  return (
    <button
      type="button"
      className="btn btn-sm btn-outline-secondary"
      aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={oscuro ? 'Modo claro' : 'Modo oscuro'}
      onClick={() => guardarTema({ ...tema, modo: oscuro ? 'claro' : 'oscuro' })}
    >
      <Icono nombre={oscuro ? 'sol' : 'luna'} size={16} />
    </button>
  )
}

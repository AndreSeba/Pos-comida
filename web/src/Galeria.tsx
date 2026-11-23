import { useEffect, useRef, useState } from 'react'
import { Icono } from './Icono'
import { reducirImagen } from './imagen'
import type { ImagenGuardar, ImagenProducto } from './types'
import { avisarError } from './ui'

export const MAX_IMAGENES = 6

/** Una imagen del producto en el editor: ya guardada (id) o recién elegida (datos, sin guardar). */
export interface ItemImagen {
  clave: string
  id?: number
  url: string
  datos?: string
}

export const aItems = (imagenes: ImagenProducto[]): ItemImagen[] => imagenes.map((i) => ({ clave: `i${i.id}`, id: i.id, url: i.url }))

/** La lista final que entiende el servidor: las guardadas por su id y las nuevas con sus datos, en el orden elegido. */
export const aGuardar = (items: ItemImagen[]): ImagenGuardar[] => items.map((i) => (i.id !== undefined ? { id: i.id } : { datos: i.datos }))

let contador = 0

/** Mover un elemento de una posición a otra, devolviendo una lista nueva. */
function reordenar<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista]
  const [movido] = copia.splice(desde, 1)
  copia.splice(hasta, 0, movido)
  return copia
}

/**
 * Hasta 6 imágenes por producto. La primera es la portada (la que se ve en el panel de ventas y en la carta).
 * Se ordenan ARRASTRANDO (mouse o dedo): mientras se arrastra, las demás se acomodan. Con teclado: flechas izquierda/derecha.
 * Los cambios se aplican al guardar el producto, no antes: así no quedan imágenes sueltas.
 */
export function Galeria({ items, alCambiar }: { items: ItemImagen[]; alCambiar: (nuevos: ItemImagen[]) => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const libres = MAX_IMAGENES - items.length

  // los manejadores del arrastre viven fuera de React (listeners de window), así que leen siempre lo más reciente por estas referencias
  const itemsRef = useRef(items)
  const cambiarRef = useRef(alCambiar)
  useEffect(() => {
    itemsRef.current = items
    cambiarRef.current = alCambiar
  })

  const inicio = useRef<{ clave: string; x: number; y: number; activo: boolean } | null>(null)
  const [arrastre, setArrastre] = useState<{ clave: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const i = inicio.current
      if (!i) return
      if (!i.activo) {
        if (Math.hypot(e.clientX - i.x, e.clientY - i.y) < 6) return // un toque normal no es un arrastre
        i.activo = true
      }
      e.preventDefault()
      setArrastre({ clave: i.clave, x: e.clientX, y: e.clientY })

      const nodos = contenedor.current?.querySelectorAll<HTMLElement>('[data-clave]') ?? []
      for (const n of nodos) {
        const r = n.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue
        const objetivo = n.dataset.clave
        if (objetivo && objetivo !== i.clave) {
          const lista = itemsRef.current
          const desde = lista.findIndex((x) => x.clave === i.clave)
          const hasta = lista.findIndex((x) => x.clave === objetivo)
          if (desde >= 0 && hasta >= 0) cambiarRef.current(reordenar(lista, desde, hasta))
        }
        break
      }
    }
    const soltar = () => {
      inicio.current = null
      setArrastre(null)
    }
    window.addEventListener('pointermove', mover, { passive: false })
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [])

  const empezar = (e: React.PointerEvent, clave: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return // los botones de la imagen siguen funcionando como siempre
    inicio.current = { clave, x: e.clientX, y: e.clientY, activo: false }
  }

  const teclado = (e: React.KeyboardEvent, idx: number) => {
    const j = e.key === 'ArrowLeft' ? idx - 1 : e.key === 'ArrowRight' ? idx + 1 : -1
    if (j < 0 || j >= items.length) return
    e.preventDefault()
    alCambiar(reordenar(items, idx, j))
    // el foco se queda en la misma imagen aunque cambie de lugar
    const clave = items[idx].clave
    requestAnimationFrame(() => contenedor.current?.querySelector<HTMLElement>(`[data-clave="${clave}"]`)?.focus())
  }

  const agregar = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return
    const nuevas: ItemImagen[] = []
    // se procesan de una en una para no saturar un celular con varias fotos grandes a la vez
    for (const f of Array.from(archivos).slice(0, libres)) {
      try {
        const datos = await reducirImagen(f, 640, 300_000, ['image/webp', 'image/jpeg'])
        nuevas.push({ clave: `n${++contador}`, url: datos, datos })
      } catch (e) {
        avisarError(e)
      }
    }
    if (archivos.length > libres) avisarError(new Error(`Solo caben ${MAX_IMAGENES} imágenes por producto.`))
    if (nuevas.length) alCambiar([...items, ...nuevas])
  }

  const quitar = (clave: string) => alCambiar(items.filter((i) => i.clave !== clave))
  const portada = (clave: string) => {
    const desde = items.findIndex((i) => i.clave === clave)
    if (desde > 0) alCambiar(reordenar(items, desde, 0))
  }

  const arrastrada = arrastre ? items.find((i) => i.clave === arrastre.clave) : undefined

  return (
    <div>
      <div className="d-flex justify-content-between align-items-baseline gap-2 flex-wrap">
        <span className="form-label small fw-semibold text-secondary mb-2 d-block">Imágenes ({items.length} de {MAX_IMAGENES})</span>
        {items.length > 1 && <small className="text-secondary">Arrastra para ordenar · la primera es la portada</small>}
      </div>
      <div className="galeria" ref={contenedor}>
        {items.map((it, idx) => (
          <div
            key={it.clave}
            data-clave={it.clave}
            className={'galeria-item' + (idx === 0 ? ' es-portada' : '') + (arrastre?.clave === it.clave ? ' arrastrando' : '')}
            tabIndex={0}
            role="group"
            aria-label={`Imagen ${idx + 1} de ${items.length}${idx === 0 ? ', portada' : ''}. Usa las flechas izquierda y derecha para moverla.`}
            onPointerDown={(e) => empezar(e, it.clave)}
            onKeyDown={(e) => teclado(e, idx)}
          >
            <img src={it.url} alt="" loading="lazy" draggable={false} />
            {idx === 0 ? (
              <span className="badge text-bg-primary galeria-etiqueta">Portada</span>
            ) : (
              <button type="button" className="btn btn-sm btn-light galeria-etiqueta" onClick={() => portada(it.clave)} title="Hacer portada">Portada</button>
            )}
            <button type="button" className="btn btn-sm btn-light text-danger galeria-quitar" onClick={() => quitar(it.clave)} aria-label="Quitar imagen" title="Quitar">
              <Icono nombre="x" size={14} />
            </button>
          </div>
        ))}
        {libres > 0 && (
          <button type="button" className="galeria-agregar" onClick={() => entrada.current?.click()} aria-label="Agregar imágenes">
            <Icono nombre="imagen" size={26} />
            <span className="small">Agregar</span>
          </button>
        )}
      </div>
      {arrastre && arrastrada && (
        <div className="galeria-fantasma" style={{ left: arrastre.x, top: arrastre.y }} aria-hidden="true">
          <img src={arrastrada.url} alt="" draggable={false} />
        </div>
      )}
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void agregar(e.target.files)
          e.target.value = ''
        }}
      />
      <small className="text-secondary d-block mt-1">Se reducen solas. Sin imágenes se muestra el icono del producto.</small>
    </div>
  )
}

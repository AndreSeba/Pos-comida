import { useSyncExternalStore } from 'react'

/* Apariencia. Dos cosas distintas, como en Mi Casero:
   1) El MODO (automático / claro / oscuro) y, si se quiere, un color propio: son de ESTE dispositivo y se guardan en el navegador.
   2) El color de la MARCA del negocio: lo define el administrador, viaja desde el servidor y lo usan todos los dispositivos
      mientras no elijan uno propio. */

export type Modo = 'auto' | 'claro' | 'oscuro'
export type Tema = { modo: Modo; /** color propio de este dispositivo; null = usar el color del negocio */ acento: string | null }

export const ACENTOS: { nombre: string; hex: string }[] = [
  { nombre: 'Naranja', hex: '#D9481C' },
  { nombre: 'Rojo', hex: '#C62828' },
  { nombre: 'Mostaza', hex: '#D99A0B' },
  { nombre: 'Verde', hex: '#0B7A57' },
  { nombre: 'Azul', hex: '#1D5FD1' },
  { nombre: 'Violeta', hex: '#6D4AE0' },
  { nombre: 'Rosa', hex: '#C2255C' },
  { nombre: 'Grafito', hex: '#3D3F45' },
]

export const COLOR_MARCA_POR_DEFECTO = ACENTOS[0].hex
export const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/* ------------------------------ color ------------------------------ */
type Rgb = [number, number, number]
const aRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const aHex = (c: Rgb) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()
const mezclar = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v * (1 - t) + b[i] * t) as Rgb

function luminancia([r, g, b]: Rgb) {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** texto claro u oscuro según qué tan claro es el fondo, para que se lea en cualquier color elegido */
export const textoSobre = (hex: string) => (luminancia(aRgb(hex)) > 0.4 ? '#1A1410' : '#FFFFFF')

/** Variables de Bootstrap y propias para un color de acento. En modo oscuro el color se aclara para leerse sobre fondo oscuro. */
export function variablesDeAcento(hex: string, oscuro: boolean): Record<string, string> {
  const base = aRgb(esHex(hex) ? hex : COLOR_MARCA_POR_DEFECTO)
  const c = oscuro ? mezclar(base, [255, 255, 255], 0.26) : base
  const h = aHex(c)
  const rgb = c.map(Math.round).join(', ')
  return {
    '--bs-primary': h,
    '--bs-primary-rgb': rgb,
    '--bs-link-color': h,
    '--bs-link-color-rgb': rgb,
    '--bs-focus-ring-color': `rgba(${rgb}, .3)`,
    '--on-primary': textoSobre(h),
    '--primary-hover': aHex(mezclar(c, [0, 0, 0], 0.14)),
    '--primary-active': aHex(mezclar(c, [0, 0, 0], 0.26)),
  }
}

/* ------------------------------ estado (localStorage) ------------------------------ */
const CLAVE_TEMA = 'pos-tema'
const CLAVE_MARCA = 'pos-marca'
const POR_DEFECTO: Tema = { modo: 'auto', acento: null }

function leer<T>(clave: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? 'null') as T | null
  } catch {
    return null
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* modo privado: el tema vale hasta cerrar la pestaña */
  }
}

function leerTema(): Tema {
  const t = leer<Partial<Tema>>(CLAVE_TEMA)
  return {
    modo: t?.modo === 'claro' || t?.modo === 'oscuro' || t?.modo === 'auto' ? t.modo : POR_DEFECTO.modo,
    acento: esHex(t?.acento) ? t.acento.toUpperCase() : null,
  }
}

let tema: Tema = leerTema()
let marca: string = (() => {
  const m = leer<string>(CLAVE_MARCA)
  return esHex(m) ? m : COLOR_MARCA_POR_DEFECTO
})()
const oyentes = new Set<() => void>()
let version = 0

const prefiereOscuro = () => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
export const modoOscuro = (t: Tema = tema) => t.modo === 'oscuro' || (t.modo === 'auto' && prefiereOscuro())

export function aplicarTema() {
  const raiz = document.documentElement
  const oscuro = modoOscuro()
  raiz.setAttribute('data-bs-theme', oscuro ? 'dark' : 'light')
  const vars = variablesDeAcento(tema.acento ?? marca, oscuro)
  for (const [k, v] of Object.entries(vars)) raiz.style.setProperty(k, v)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bs-primary'])
  version++
  oyentes.forEach((f) => f())
}

export function guardarTema(nuevo: Tema) {
  tema = nuevo
  escribir(CLAVE_TEMA, nuevo)
  aplicarTema()
}

/** Color de la marca del negocio (viene del servidor). Se recuerda para que la próxima apertura ya salga con él. */
export function fijarMarca(hex: string) {
  if (!esHex(hex) || hex.toUpperCase() === marca) return
  marca = hex.toUpperCase()
  escribir(CLAVE_MARCA, marca)
  aplicarTema()
}

export function iniciarTema() {
  aplicarTema()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (tema.modo === 'auto') aplicarTema()
  })
}

/** Para que los componentes se redibujen cuando cambia el tema (devuelve el tema actual y si es oscuro). */
export function useTema() {
  useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => {
        oyentes.delete(f)
      }
    },
    () => version,
  )
  return { tema, oscuro: modoOscuro(), marca }
}

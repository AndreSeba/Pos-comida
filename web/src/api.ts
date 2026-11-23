import type { Sesion } from './types'

const BASE: string = import.meta.env.VITE_API_URL ?? ''
const CLAVE = 'pos-sesion'

/* ------------------------------ sesión (persiste en el dispositivo) ------------------------------ */
let sesion: Sesion | null = leer()
const oyentes = new Set<() => void>()

function leer(): Sesion | null {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Sesion | null
    // una sesión de una versión anterior (sin permisos) ya no sirve: hay que entrar de nuevo
    if (s && Array.isArray(s.permisos) && new Date(s.expira).getTime() > Date.now()) return s
  } catch {
    /* sesión dañada */
  }
  return null
}

export function getSesion(): Sesion | null {
  return sesion
}

export function setSesion(s: Sesion | null) {
  sesion = s
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s))
    else localStorage.removeItem(CLAVE)
  } catch {
    /* modo privado */
  }
  oyentes.forEach((f) => f())
}

export function suscribirSesion(f: () => void) {
  oyentes.add(f)
  return () => {
    oyentes.delete(f)
  }
}

/* ------------------------------ HTTP ------------------------------ */
export class ApiError extends Error {
  status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, conSesion = true, cabeceras?: Record<string, string>): Promise<T> {
  let r: Response
  try {
    r = await fetch(BASE + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(sesion && conSesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
        ...(cabeceras ?? {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu internet o la red del local.')
  }

  if (r.status === 401 && sesion && !ruta.startsWith('/api/auth/login')) {
    setSesion(null) // token vencido: vuelve a la pantalla de inicio
    throw new ApiError(401, 'Tu sesión venció. Entra de nuevo.')
  }
  if (r.status === 429) throw new ApiError(429, 'Demasiados intentos. Espera un minuto.')
  if (!r.ok) {
    let msg = 'Ocurrió un error'
    try {
      const p = (await r.json()) as { detail?: string; title?: string }
      msg = p.detail ?? p.title ?? msg
    } catch {
      /* respuesta sin cuerpo */
    }
    throw new ApiError(r.status, r.status === 403 ? 'No tienes permiso para hacer esto' : msg)
  }
  return (r.status === 204 ? undefined : await r.json()) as T
}

export const api = {
  get: <T>(ruta: string) => pedir<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo: unknown) => pedir<T>('POST', ruta, cuerpo),
  put: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PUT', ruta, cuerpo),
  del: (ruta: string) => pedir<void>('DELETE', ruta),
  /** para la carta pública: nunca manda la sesión */
  publico: <T>(ruta: string) => pedir<T>('GET', ruta, undefined, false),
  /** para el cliente en su mesa: nunca manda la sesión; se identifica con el código anónimo de su celular */
  mesa: (cliente: string) => {
    const h = { 'X-Cliente-Id': cliente }
    return {
      get: <T>(ruta: string) => pedir<T>('GET', ruta, undefined, false, h),
      post: <T>(ruta: string, cuerpo: unknown) => pedir<T>('POST', ruta, cuerpo, false, h),
      put: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PUT', ruta, cuerpo, false, h),
      del: (ruta: string) => pedir<void>('DELETE', ruta, undefined, false, h),
    }
  },
}

export const mensajeError = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error')

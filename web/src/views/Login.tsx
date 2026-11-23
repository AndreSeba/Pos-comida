import { useState } from 'react'
import { api, mensajeError, setSesion } from '../api'
import type { ConfigPublica, Rol, Sesion, UsuarioPublico } from '../types'
import { Estado, useCarga } from '../ui'
import { Icono } from '../Icono'
import { LogoNegocio } from '../Personalizar'
import { useMarca } from '../ui'

interface LoginResp {
  token: string
  usuarioId: number
  nombre: string
  rol: Rol
  permisos: string[]
  expira: string
}

export default function Login() {
  const usuarios = useCarga(() => api.get<UsuarioPublico[]>('/api/auth/usuarios'))
  const config = useCarga(() => api.get<ConfigPublica>('/api/config/publica'))
  useMarca(config.datos)
  const [elegido, setElegido] = useState<UsuarioPublico | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entrar = async () => {
    if (!elegido || pin.length < 4 || enviando) return
    setEnviando(true)
    try {
      const r = await api.post<LoginResp>('/api/auth/login', { usuarioId: elegido.id, pin })
      const s: Sesion = { token: r.token, usuarioId: r.usuarioId, nombre: r.nombre, rol: r.rol, permisos: r.permisos, expira: r.expira }
      setSesion(s)
    } catch (e) {
      setError(mensajeError(e))
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  const tecla = (t: string) => {
    setError('')
    if (t === 'borrar') setPin((p) => p.slice(0, -1))
    else if (pin.length < 12) setPin((p) => p + t)
  }

  const admins = usuarios.datos?.filter((u) => u.admin) ?? []
  const vendedores = usuarios.datos?.filter((u) => !u.admin) ?? []

  return (
    <main className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="card shadow border-0 p-4 text-center login-card">
        <LogoNegocio logo={config.datos?.logo} />
        <h1>{config.datos?.negocio ?? 'Punto de venta'}</h1>

        {!elegido && (
          <div className="d-grid gap-3">
            <Estado cargando={usuarios.cargando} error={usuarios.error} onReintentar={usuarios.recargar} />
            {vendedores.length > 0 && <p className="text-secondary">¿Quién eres?</p>}
            {vendedores.map((u) => (
              <button key={u.id} className="btn btn-primary btn-lg w-100" onClick={() => setElegido(u)}><Icono nombre="recibo" /> {u.nombre}</button>
            ))}
            {admins.length > 0 && <p className="text-secondary">Administración</p>}
            {admins.map((u) => (
              <button key={u.id} className="btn btn-outline-secondary btn-lg w-100" onClick={() => setElegido(u)}><Icono nombre="escudo" /> {u.nombre}</button>
            ))}
          </div>
        )}

        {elegido && (
          <div className="d-grid gap-3">
            <p className="text-secondary">Hola, <strong>{elegido.nombre}</strong>. Escribe tu PIN</p>
            <div className="d-flex justify-content-center gap-2 pin-puntos" aria-label={`${pin.length} dígitos escritos`}>
              {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
            </div>
            {error && <p className="text-danger fw-semibold">{error}</p>}
            <div className="row g-2 teclado">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'ok'].map((t) => (
                <div key={t} className="col-4"><button
                  className={'btn tecla w-100 ' + (t === 'ok' ? 'btn-primary' : 'btn-outline-secondary')}
                  aria-label={t === 'borrar' ? 'Borrar' : t === 'ok' ? 'Entrar' : undefined}
                  disabled={t === 'ok' && (pin.length < 4 || enviando)}
                  onClick={() => (t === 'ok' ? void entrar() : tecla(t))}
                >
                  {t === 'borrar' ? <Icono nombre="retroceso" size={26} /> : t === 'ok' ? <Icono nombre="check" size={28} /> : t}
                </button></div>
              ))}
            </div>
            <button className="btn btn-link text-secondary" onClick={() => { setElegido(null); setPin(''); setError('') }}><Icono nombre="atras" size={16} /> Cambiar de usuario</button>
          </div>
        )}
      </div>
    </main>
  )
}

import { useSyncExternalStore } from 'react'
import { getSesion, setSesion, suscribirSesion } from './api'
import { Avisos } from './ui'
import Login from './views/Login'
import Ventas from './views/Ventas'
import Admin from './views/Admin'
import PaginaCarta from './carta/PaginaCarta'
import PaginaMesa from './carta/PaginaMesa'
import { puede } from './util'

export default function App() {
  const sesion = useSyncExternalStore(suscribirSesion, getSesion)
  const salir = () => setSesion(null)

  // el cliente en su mesa: /mesa/<código secreto del QR>; tampoco pide iniciar sesión
  const mesa = /^\/mesa\/([^/]+)$/.exec(window.location.pathname.replace(/\/+$/, ''))
  if (mesa)
    return (
      <>
        <PaginaMesa token={mesa[1]} />
        <Avisos />
      </>
    )

  // la carta de los clientes es pública: se abre con /carta y no pide iniciar sesión
  if (window.location.pathname.replace(/\/+$/, '') === '/carta')
    return (
      <>
        <PaginaCarta />
        <Avisos />
      </>
    )

  return (
    <>
      {!sesion ? <Login /> : puede(sesion, 'panel.admin') ? <Admin sesion={sesion} onSalir={salir} /> : <Ventas sesion={sesion} onSalir={salir} />}
      <Avisos />
    </>
  )
}

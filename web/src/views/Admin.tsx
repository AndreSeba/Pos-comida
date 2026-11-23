import { useState } from 'react'
import { api } from '../api'
import type { Config, Ingrediente, Producto, Sesion } from '../types'
import { Estado, useCarga, useMarca } from '../ui'
import { BotonModo, LogoNegocio } from '../Personalizar'
import Resumen from './Resumen'
import Productos from './Productos'
import Ingredientes from './Ingredientes'
import Gastos from './Gastos'
import Historial from './Historial'
import Ajustes from './Ajustes'
import Inventario from './Inventario'
import Accesos from './Accesos'
import Auditoria from './Auditoria'
import { puede } from '../util'
import CartaAdmin from './Carta'
import Mesas from './Mesas'
import { Icono } from '../Icono'

/** cada pestaña se muestra si la persona tiene alguno de estos permisos */
const TABS = [
  { id: 'resumen', label: 'Resumen', icono: 'grafico', permiso: 'reportes.ver' },
  { id: 'productos', label: 'Productos', icono: 'hamburguesa', permiso: 'productos.ver' },
  { id: 'carta', label: 'Carta', icono: 'carta', permiso: 'productos.editar' },
  { id: 'mesas', label: 'Mesas', icono: 'qr', permiso: 'mesas.gestionar' },
  { id: 'ingredientes', label: 'Ingredientes', icono: 'hoja', permiso: 'ingredientes.gestionar' },
  { id: 'inventario', label: 'Inventario', icono: 'carrito', permiso: 'inventario.ver' },
  { id: 'gastos', label: 'Gastos', icono: 'cartera', permiso: 'gastos.gestionar' },
  { id: 'ventas', label: 'Ventas', icono: 'monedas', permiso: 'ventas.ver' },
  { id: 'accesos', label: 'Accesos', icono: 'usuario', permiso: 'usuarios.gestionar|roles.gestionar' },
  { id: 'auditoria', label: 'Auditoría', icono: 'recibo', permiso: 'auditoria.ver' },
  { id: 'ajustes', label: 'Ajustes', icono: 'ajustes', permiso: 'config.editar' },
] as const

type Tab = (typeof TABS)[number]['id']

/** datos compartidos por varias pestañas del administrador */
export interface Catalogo {
  config: Config
  ingredientes: Ingrediente[]
  productos: Producto[]
  recargar: () => Promise<void>
}

export default function Admin({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const tabs = TABS.filter((t) => puede(sesion, t.permiso))
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'ajustes')
  const config = useCarga(() => api.get<Config>('/api/config'))
  // solo se piden los datos que el rol puede ver; el resto queda vacío
  const veIngs = puede(sesion, 'ingredientes.gestionar|inventario.ver|productos.ver')
  const veProds = puede(sesion, 'productos.ver')
  const ings = useCarga(() => (veIngs ? api.get<Ingrediente[]>('/api/ingredientes') : Promise.resolve([] as Ingrediente[])))
  const prods = useCarga(() => (veProds ? api.get<Producto[]>('/api/productos') : Promise.resolve([] as Producto[])))

  useMarca(config.datos)
  const listo = config.datos && ings.datos && prods.datos
  const catalogo: Catalogo | null = listo
    ? {
        config: config.datos!,
        ingredientes: ings.datos!,
        productos: prods.datos!,
        recargar: async () => {
          await Promise.all([config.recargar(), ings.recargar(), prods.recargar()])
        },
      }
    : null

  return (
    <div className="admin">
      <div className="sticky-top bg-body admin-top">
      <header className="navbar border-bottom px-3 py-2 flex-nowrap justify-content-between gap-2 admin-header">
        <strong className="text-truncate d-flex align-items-center gap-2 admin-marca">{config.datos?.logo && <LogoNegocio logo={config.datos.logo} tam={30} />}<span className="text-truncate">{config.datos?.negocio ?? ''} · Admin <span className="text-secondary">({sesion.nombre})</span></span></strong>
        <div className="d-flex align-items-center gap-2 flex-shrink-0 admin-acciones">
          <BotonModo />
          <button className="btn btn-sm btn-outline-secondary" onClick={onSalir}>Salir</button>
        </div>
      </header>
      <nav className="nav nav-pills nav-fill flex-nowrap overflow-auto border-bottom p-1 admin-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={'nav-link d-flex flex-column align-items-center gap-1 py-2' + (t.id === tab ? ' active' : '')} onClick={() => setTab(t.id)}>
            <Icono nombre={t.icono} size={22} />
            <small>{t.label}</small>
          </button>
        ))}
      </nav>
      </div>
      <main className="container py-3 admin-main">
        {!catalogo && (
          <Estado
            cargando={config.cargando || ings.cargando || prods.cargando}
            error={config.error || ings.error || prods.error}
            onReintentar={() => { void config.recargar(); void ings.recargar(); void prods.recargar() }}
          />
        )}
        {catalogo && tab === 'resumen' && <Resumen moneda={catalogo.config.moneda} />}
        {catalogo && tab === 'productos' && <Productos cat={catalogo} />}
        {catalogo && tab === 'carta' && <CartaAdmin cat={catalogo} />}
        {catalogo && tab === 'mesas' && <Mesas cat={catalogo} />}
        {catalogo && tab === 'ingredientes' && <Ingredientes cat={catalogo} />}
        {catalogo && tab === 'inventario' && <Inventario cat={catalogo} sesion={sesion} />}
        {catalogo && tab === 'accesos' && <Accesos sesion={sesion} />}
        {catalogo && tab === 'auditoria' && <Auditoria />}
        {catalogo && tab === 'gastos' && <Gastos moneda={catalogo.config.moneda} />}
        {catalogo && tab === 'ventas' && <Historial moneda={catalogo.config.moneda} />}
        {catalogo && tab === 'ajustes' && <Ajustes cat={catalogo} />}
      </main>
    </div>
  )
}

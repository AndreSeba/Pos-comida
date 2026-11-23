import { useMemo, useState } from 'react'
import { api } from '../api'
import type { Permiso, RolInfo, Sesion, Usuario } from '../types'
import { Estado, avisar, avisarError, useCarga } from '../ui'
import { puede } from '../util'
import { Paginador, usePaginas } from '../paginacion'

/** Personas (con su PIN y rol) y roles (qué permisos tiene cada uno). */
export default function Accesos({ sesion }: { sesion: Sesion }) {
  const verRoles = puede(sesion, 'roles.gestionar|usuarios.gestionar')
  const roles = useCarga(() => api.get<RolInfo[]>('/api/roles'))
  const permisos = useCarga(() => api.get<Permiso[]>('/api/roles/permisos'))
  const us = useCarga(() => api.get<Usuario[]>('/api/usuarios'))
  const [rolEnEdicion, setRolEnEdicion] = useState<RolInfo | 'nuevo' | null>(null)

  const recargarTodo = async () => {
    await Promise.all([roles.recargar(), us.recargar()])
  }

  if (rolEnEdicion && permisos.datos)
    return (
      <EditorRol
        rol={rolEnEdicion === 'nuevo' ? null : rolEnEdicion}
        permisos={permisos.datos}
        puedeEditar={puede(sesion, 'roles.gestionar')}
        onCerrar={() => setRolEnEdicion(null)}
        onGuardado={async () => {
          setRolEnEdicion(null)
          await recargarTodo()
        }}
      />
    )

  return (
    <>
      {puede(sesion, 'usuarios.gestionar') && roles.datos && <Personas sesion={sesion} roles={roles.datos} us={us.datos} usError={us.error} onCambio={recargarTodo} />}

      {verRoles && (
        <section className="card shadow-sm mb-3 p-3">
          <div className="d-flex justify-content-between align-items-center gap-2">
            <h3 className="h5 mb-0">Roles y permisos</h3>
            {puede(sesion, 'roles.gestionar') && <button className="btn btn-primary" onClick={() => setRolEnEdicion('nuevo')}>+ Nuevo rol</button>}
          </div>
          <p className="text-secondary mt-2">Un rol es un grupo de permisos. Crea los que necesites (cajero, cocina, encargado…) y asígnalos a cada persona.</p>
          <Estado cargando={roles.cargando && !roles.datos} error={roles.error} onReintentar={roles.recargar} />
          <div className="list-group list-group-flush">
            {roles.datos?.map((r) => (
              <div key={r.id} className={'list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent' + (r.activo ? '' : ' opacity-50')}>
                <div>
                  <strong>{r.nombre}</strong>{' '}
                  {r.esSistema && <span className="badge text-bg-secondary">del sistema</span>}
                  <div className="text-secondary small">
                    {r.nombre === 'Administrador' ? 'Todos los permisos' : `${r.permisos.length} permiso(s)`} · {r.usuarios} persona(s){!r.activo && ' · desactivado'}
                  </div>
                  {r.descripcion && <div className="small">{r.descripcion}</div>}
                </div>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setRolEnEdicion(r)}>{r.nombre === 'Administrador' || !puede(sesion, 'roles.gestionar') ? 'Ver' : 'Editar'}</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/* ------------------------------ personas ------------------------------ */
function Personas({ sesion, roles, us, usError, onCambio }: { sesion: Sesion; roles: RolInfo[]; us: Usuario[] | null; usError: string; onCambio: () => Promise<void> }) {
  const activos = roles.filter((r) => r.activo)
  const pag = usePaginas(us ?? [])
  const [nombre, setNombre] = useState('')
  const [rolId, setRolId] = useState<number | ''>('')
  const [pin, setPin] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [activo, setActivo] = useState(true)
  const rolElegido = rolId === '' ? (activos.find((r) => r.nombre === 'Ventas') ?? activos[0])?.id : rolId

  const limpiar = () => {
    setNombre('')
    setRolId('')
    setPin('')
    setActivo(true)
    setEditId(null)
  }

  const guardar = async () => {
    if (!nombre.trim() || !rolElegido) return
    try {
      const cuerpo = { nombre: nombre.trim(), rolId: rolElegido, pin: pin || null, activo }
      if (editId) await api.put(`/api/usuarios/${editId}`, cuerpo)
      else await api.post('/api/usuarios', cuerpo)
      avisar(editId ? 'Persona actualizada' : 'Persona creada')
      limpiar()
      await onCambio()
    } catch (e) {
      avisarError(e)
    }
  }

  const editar = (u: Usuario) => {
    setEditId(u.id)
    setNombre(u.nombre)
    setRolId(u.rolId)
    setActivo(u.activo)
    setPin('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">{editId ? 'Editar persona' : 'Agregar persona'}</h3>
        <p className="text-secondary">Cada persona entra con su PIN (4 a 12 números). Lo que puede hacer lo decide su rol.</p>
        <div className="row g-3 my-1">
          <label className="col-12"><span className="form-label small fw-semibold text-secondary mb-1">Nombre</span><input className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="María / Caja 2" /></label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">Rol</span>
            <select className="form-select" value={rolElegido ?? ''} disabled={editId === sesion.usuarioId} onChange={(e) => setRolId(Number(e.target.value))}>
              {activos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="col-12 col-sm-6 col-md-4"><span className="form-label small fw-semibold text-secondary mb-1">{editId ? 'PIN nuevo (opcional)' : 'PIN'}</span>
            <input className="form-control" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} maxLength={12} placeholder="••••" />
          </label>
        </div>
        {editId && (
          <div className="form-check my-3"><input className="form-check-input" type="checkbox" id="puede-entrar" checked={activo} disabled={editId === sesion.usuarioId} onChange={(e) => setActivo(e.target.checked)} /><label className="form-check-label" htmlFor="puede-entrar">Puede entrar</label></div>
        )}
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-primary" onClick={() => void guardar()} disabled={!nombre.trim() || (!editId && pin.length < 4)}>
            {editId ? 'Guardar cambios' : 'Crear'}
          </button>
          {editId && <button className="btn btn-outline-secondary" onClick={limpiar}>Cancelar</button>}
        </div>
      </section>

      <section className="card shadow-sm mb-3 p-3">
        <h3 className="h5">Personas con acceso</h3>
        <Estado cargando={!us && !usError} error={usError} onReintentar={onCambio} />
        <div className="list-group list-group-flush">
          {pag.visibles.map((u) => (
            <div key={u.id} className={'list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent' + (u.activo ? '' : ' opacity-50')}>
              <div>
                <strong>{u.nombre}</strong>{u.id === sesion.usuarioId && <small className="text-secondary"> (tú)</small>}
                <div className="text-secondary small">{u.rol}{!u.activo && ' · sin acceso'}</div>
              </div>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => editar(u)}>Editar</button>
            </div>
          ))}
        </div>
        <Paginador p={pag} />
      </section>
    </>
  )
}

/* ------------------------------ editor de rol ------------------------------ */
function EditorRol({
  rol, permisos, puedeEditar, onCerrar, onGuardado,
}: {
  rol: RolInfo | null
  permisos: Permiso[]
  puedeEditar: boolean
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const esAdmin = rol?.nombre === 'Administrador'
  const soloLectura = esAdmin || !puedeEditar
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [activo, setActivo] = useState(rol?.activo ?? true)
  const [marcados, setMarcados] = useState<Set<string>>(new Set(esAdmin ? permisos.map((p) => p.codigo) : rol?.permisos ?? []))
  const [guardando, setGuardando] = useState(false)

  const grupos = useMemo(() => {
    const m = new Map<string, Permiso[]>()
    permisos.forEach((p) => m.set(p.grupo, [...(m.get(p.grupo) ?? []), p]))
    return [...m.entries()]
  }, [permisos])

  const alternar = (c: string) => {
    const n = new Set(marcados)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    setMarcados(n)
  }
  const alternarGrupo = (lista: Permiso[]) => {
    const n = new Set(marcados)
    const todos = lista.every((p) => n.has(p.codigo))
    lista.forEach((p) => (todos ? n.delete(p.codigo) : n.add(p.codigo)))
    setMarcados(n)
  }

  const guardar = async () => {
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    try {
      const cuerpo = { nombre: nombre.trim(), descripcion: descripcion.trim(), activo, permisos: [...marcados] }
      if (rol) await api.put(`/api/roles/${rol.id}`, cuerpo)
      else await api.post('/api/roles', cuerpo)
      avisar('Rol guardado')
      await onGuardado()
    } catch (e) {
      avisarError(e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="card shadow-sm mb-3 p-3">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <h3 className="h5 mb-0">{rol ? (soloLectura ? `Rol ${rol.nombre}` : 'Editar rol') : 'Nuevo rol'}</h3>
        <button className="btn btn-sm btn-outline-secondary" onClick={onCerrar}>Volver</button>
      </div>
      {esAdmin && <div className="alert alert-info py-2 mt-3 mb-0">El Administrador siempre tiene todos los permisos y no se puede cambiar, para que nadie se quede sin acceso.</div>}
      {rol?.esSistema && !esAdmin && <div className="small text-secondary mt-2">Es un rol del sistema: puedes cambiar sus permisos, pero no su nombre.</div>}
      <div className="row g-3 my-1">
        <label className="col-12 col-md-5"><span className="form-label small fw-semibold text-secondary mb-1">Nombre</span>
          <input className="form-control" value={nombre} maxLength={40} disabled={soloLectura || !!rol?.esSistema} onChange={(e) => setNombre(e.target.value)} placeholder="Cajero, Cocina…" />
        </label>
        <label className="col-12 col-md-7"><span className="form-label small fw-semibold text-secondary mb-1">Descripción (opcional)</span>
          <input className="form-control" value={descripcion} maxLength={120} disabled={soloLectura} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
      </div>

      <h4 className="h6 mt-3">Permisos</h4>
      <div className="row g-3">
        {grupos.map(([grupo, lista]) => (
          <div key={grupo} className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>{grupo}</strong>
                {!soloLectura && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => alternarGrupo(lista)}>{lista.every((p) => marcados.has(p.codigo)) ? 'Quitar todos' : 'Marcar todos'}</button>}
              </div>
              {lista.map((p) => (
                <div key={p.codigo} className="form-check">
                  <input className="form-check-input" type="checkbox" id={`perm-${p.codigo}`} checked={marcados.has(p.codigo)} disabled={soloLectura} onChange={() => alternar(p.codigo)} />
                  <label className="form-check-label" htmlFor={`perm-${p.codigo}`}>{p.nombre}</label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {rol && !soloLectura && (
        <div className="form-check form-switch mt-3">
          <input className="form-check-input" type="checkbox" role="switch" id="rol-activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <label className="form-check-label" htmlFor="rol-activo">Rol activo (se puede asignar)</label>
        </div>
      )}
      {!soloLectura && (
        <>
          <p className="small text-secondary mt-3 mb-0">Si cambias los permisos, quienes ya tengan sesión abierta deberán volver a entrar.</p>
          <div className="d-flex align-items-center gap-2 mt-2">
            <button className="btn btn-primary" disabled={!nombre.trim() || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar rol'}</button>
            <button className="btn btn-outline-secondary" onClick={onCerrar}>Cancelar</button>
          </div>
        </>
      )}
    </section>
  )
}

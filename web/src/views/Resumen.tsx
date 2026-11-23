import { useState } from 'react'
import { api } from '../api'
import type { Resumen as ResumenT } from '../types'
import { Estado, useCarga } from '../ui'
import { fechaCorta, inicioDia, money, pct } from '../util'
import { Icono } from '../Icono'

const DIA = 86_400_000

function Kpi({ titulo, valor, nota, tono = '', fondo = '' }: { titulo: string; valor: string; nota: string; tono?: string; fondo?: string }) {
  return (
    <div className="col-6 col-lg-4">
      <div className={'card shadow-sm h-100 p-3 ' + fondo}>
        <span className="text-secondary small fw-semibold">{titulo}</span>
        <strong className={'fs-4 ' + tono}>{valor}</strong>
        <small className="text-secondary">{nota}</small>
      </div>
    </div>
  )
}

export default function Resumen({ moneda: m }: { moneda: string }) {
  const [rango, setRango] = useState<'hoy' | '7' | '30'>('hoy')
  const hoy = inicioDia(Date.now())
  const dias = rango === 'hoy' ? 1 : Number(rango)
  const desde = hoy - (dias - 1) * DIA
  const hasta = hoy + DIA
  // offset del dispositivo respecto a UTC, en minutos (Bolivia: -240)
  const offset = -new Date().getTimezoneOffset()

  const r = useCarga(
    () => api.get<ResumenT>(`/api/reportes/resumen?desde=${encodeURIComponent(new Date(desde).toISOString())}&hasta=${encodeURIComponent(new Date(hasta).toISOString())}&offsetMinutos=${offset}`),
    [rango],
  )
  const d = r.datos

  const bruta = d ? d.ventas - d.costo : 0
  const neta = bruta - (d?.gastos ?? 0)

  // un valor por día del rango (los días sin ventas cuentan 0)
  const serie = Array.from({ length: dias }, (_, i) => {
    const ini = desde + i * DIA
    const f = new Date(ini)
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
    const real = d?.porDia.find((x) => x.dia.slice(0, 10) === clave)
    return { ini, total: real?.total ?? 0 }
  })
  const maxDia = Math.max(1, ...serie.map((x) => x.total))

  return (
    <>
      <div className="btn-group w-100 mb-3" role="group" aria-label="Período">
        {(['hoy', '7', '30'] as const).map((x) => (
          <button key={x} className={'btn btn-outline-primary' + (x === rango ? ' active' : '')} onClick={() => setRango(x)}>
            {x === 'hoy' ? 'Hoy' : `${x} días`}
          </button>
        ))}
      </div>

      <Estado cargando={r.cargando && !d} error={r.error} onReintentar={r.recargar} />

      {d && (
        <>
          <div className="row g-3 mb-3">
            <Kpi titulo="Ventas" valor={money(d.ventas, m)} nota={`${d.pedidos} pedidos`} />
            <Kpi titulo="Costo de lo vendido" valor={money(d.costo, m)} nota={`${pct(d.ventas ? (d.costo / d.ventas) * 100 : 0)} de las ventas`} />
            <Kpi titulo="Ganancia bruta" valor={money(bruta, m)} nota={`margen ${pct(d.ventas ? (bruta / d.ventas) * 100 : 0)}`} tono="text-success" />
            <Kpi titulo="Gastos" valor={money(d.gastos, m)} nota={`${d.cantGastos} registros`} />
            <Kpi titulo="Utilidad neta" valor={money(neta, m)} nota="ganancia bruta menos gastos" fondo={neta >= 0 ? 'bg-success-subtle' : 'bg-danger-subtle'} tono={neta >= 0 ? 'text-success' : 'text-danger'} />
            <Kpi titulo="Ticket promedio" valor={money(d.pedidos ? d.ventas / d.pedidos : 0, m)} nota="por pedido" />
          </div>

          {dias > 1 && (
            <section className="card shadow-sm mb-3 p-3">
              <h3 className="h6 fw-bold">Ventas por día</h3>
              <div className="barras">
                {serie.map((x) => (
                  <div key={x.ini} className="barra" title={`${fechaCorta(x.ini)}: ${money(x.total, m)}`}>
                    <div className="b" style={{ height: `${(x.total / maxDia) * 100}%` }} />
                    {dias <= 10 && <small>{fechaCorta(x.ini)}</small>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="row g-3">
            <div className="col-md-6">
              <section className="card shadow-sm p-3 h-100">
                <h3 className="h6 fw-bold">Más vendidos</h3>
                {!d.top.length && <p className="text-center text-secondary py-4">Sin ventas en este período</p>}
                <div className="list-group list-group-flush">
                  {d.top.map((t) => (
                    <div key={t.nombre} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent">
                      <span>{t.nombre} <small className="text-secondary">×{t.cantidad}</small></span>
                      <span>{money(t.total, m)} <small className="text-secondary">(+{money(t.ganancia, m)})</small></span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="col-md-6">
              <section className="card shadow-sm p-3 h-100">
                <h3 className="h6 fw-bold">Cómo te pagaron</h3>
                <div className="list-group list-group-flush">
                  {([['billete', 'Efectivo', d.efectivo], ['qr', 'QR', d.qr], ['tarjeta', 'Tarjeta', d.tarjeta]] as const).map(([ico, nombre, valor]) => (
                    <div key={nombre} className="list-group-item d-flex justify-content-between align-items-center gap-3 px-0 bg-transparent">
                      <span className="d-inline-flex align-items-center gap-2"><Icono nombre={ico} size={18} /> {nombre}</span>
                      <strong>{money(valor, m)}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  )
}

import { useState } from 'react'

/* Paginación en el cliente para listas largas. La página se ajusta sola si la lista se achica (filtros, borrados). */
export function usePaginas<T>(items: readonly T[], tam = 10) {
  const [pedida, setPagina] = useState(1)
  const total = Math.max(1, Math.ceil(items.length / tam))
  const pagina = Math.min(pedida, total)
  const visibles = items.slice((pagina - 1) * tam, pagina * tam)
  return { visibles, pagina, total, cantidad: items.length, tam, setPagina }
}

type Pag = { pagina: number; total: number; cantidad: number; tam: number; setPagina: (p: number) => void }

/** Controles «Anterior · 1 2 3 … · Siguiente». No se dibuja si todo cabe en una página. */
export function Paginador({ p }: { p: Pag }) {
  if (p.total <= 1) return null
  const desde = (p.pagina - 1) * p.tam + 1
  const hasta = Math.min(p.cantidad, p.pagina * p.tam)
  const nums = Array.from({ length: p.total }, (_, i) => i + 1).filter((n) => n === 1 || n === p.total || Math.abs(n - p.pagina) <= 1)
  const items: (number | 'g')[] = []
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) items.push('g')
    items.push(n)
  })
  return (
    <nav className="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-3 paginador" aria-label="Paginación">
      <small className="text-secondary">{desde}–{hasta} de {p.cantidad}</small>
      <ul className="pagination pagination-sm mb-0">
        <li className={'page-item' + (p.pagina === 1 ? ' disabled' : '')}>
          <button type="button" className="page-link" onClick={() => p.setPagina(p.pagina - 1)} disabled={p.pagina === 1}>Anterior</button>
        </li>
        {items.map((n, i) =>
          n === 'g' ? (
            <li key={'g' + i} className="page-item disabled d-none d-sm-block"><span className="page-link">…</span></li>
          ) : (
            <li key={n} className={'page-item' + (n === p.pagina ? ' active' : '') + (n !== p.pagina && Math.abs(n - p.pagina) > 1 ? ' d-none d-sm-block' : '')}>
              <button type="button" className="page-link" onClick={() => p.setPagina(n)} aria-current={n === p.pagina ? 'page' : undefined}>{n}</button>
            </li>
          ),
        )}
        <li className={'page-item' + (p.pagina === p.total ? ' disabled' : '')}>
          <button type="button" className="page-link" onClick={() => p.setPagina(p.pagina + 1)} disabled={p.pagina === p.total}>Siguiente</button>
        </li>
      </ul>
    </nav>
  )
}

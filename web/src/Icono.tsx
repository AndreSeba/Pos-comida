import type { ReactNode } from 'react'

/* Iconos propios (trazo de 2px sobre una cuadrícula de 24), sin dependencias. Heredan el color del texto (currentColor). */
const PATHS: Record<string, ReactNode> = {
  /* ---- comida: se pueden elegir para un producto ---- */
  hamburguesa: (
    <>
      <path d="M4 10c0-3.5 3.6-5.5 8-5.5s8 2 8 5.5z" />
      <path d="M3 13.5h18" />
      <path d="M4 16.5q2 2 4 0t4 0 4 0 4 0" />
      <path d="M4 19h16v.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z" />
    </>
  ),
  papas: (
    <>
      <path d="M6 11h12l-1.4 9.5a1 1 0 0 1-1 .9H8.4a1 1 0 0 1-1-.9z" />
      <path d="M8.5 11V5.5M12 11V3.5M15.5 11V5.5M10.2 11V7.5M13.8 11V7.5" />
    </>
  ),
  bebida: (
    <>
      <path d="M7 8h10l-1.3 12.2a1 1 0 0 1-1 .8H9.3a1 1 0 0 1-1-.8z" />
      <path d="M6 8h12M13 8l1.2-5H18" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 21 3.5 6.5a17 17 0 0 1 17 0z" />
      <path d="M5.3 9.5a15 15 0 0 1 13.4 0" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01M12 16h.01" />
    </>
  ),
  pollo: (
    <>
      <path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23" />
      <path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59" />
    </>
  ),
  hotdog: (
    <g transform="rotate(-45 12 12)">
      <rect x="3.5" y="7" width="17" height="10" rx="5" />
      <path d="M1 12h22" strokeWidth="3.6" />
    </g>
  ),
  ensalada: (
    <>
      <path d="M3 12h18a9 9 0 0 1-18 0z" />
      <path d="M8 12c-.5-3 1-5.5 4-6 .5 3-1 5.5-4 6zM13 12c0-3 2-5.5 6-5.5 0 3.5-2 5.5-6 5.5z" />
    </>
  ),
  postre: (
    <>
      <path d="M6 12h12l-1.6 8.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8z" />
      <path d="M6.5 12a5.5 5.5 0 0 1 11 0" />
      <circle cx="12" cy="3.6" r="1.2" />
    </>
  ),
  cafe: (
    <>
      <path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2.5M12 3v2.5" />
    </>
  ),
  plato: (
    <>
      <path d="M6 3v6a2.5 2.5 0 0 0 2.5 2.5V21M11 3v6a2.5 2.5 0 0 1-2.5 2.5" />
      <path d="M17 21V3c-2.5 1.2-3.5 4-3.5 8H17" />
    </>
  ),

  /* ---- interfaz ---- */
  recibo: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  escudo: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  grafico: <path d="M5 20V10M12 20V4M19 20v-7" />,
  hoja: (
    <>
      <path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14z" />
      <path d="m5 19 8-8" />
    </>
  ),
  cartera: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h12v4" />
      <path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1z" />
      <path d="M16 14h2" />
    </>
  ),
  monedas: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2c-.4-.9-1.4-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1 1.7 2.8 2.1 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.4 0-2.5-.6-2.9-1.5M12 6v2M12 16v2" />
    </>
  ),
  billete: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4" />
    </>
  ),
  tarjeta: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  carta: (
    <>
      <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M8 9h7M8 13h5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />
      <path d="M9.2 8.8c.2 2.6 2.4 4.8 5 5l1.2-1.3-2-1-.9.8a3.7 3.7 0 0 1-1.9-1.9l.8-.9-1-2z" />
    </>
  ),
  enlace: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  copiar: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  ojo: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bajar: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  carrito: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M3 4h2.5l2 11h11l2-8H7" />
    </>
  ),
  imagen: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </>
  ),
  paleta: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.7-.9 1.3-1.8-.4-.9.2-1.9 1.3-1.9H16a5 5 0 0 0 5-5c0-5-4-9.3-9-9.3z" />
      <path d="M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11.5h.01" />
    </>
  ),
  subir: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  mixto: (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alerta: <path d="M12 3 22 21H2zM12 10v5M12 18h.01" />,
  refrescar: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
  atras: <path d="M19 12H5M11 6l-6 6 6 6" />,
  retroceso: <path d="M21 5H9l-6 7 6 7h12zM12 9.5l5 5M17 9.5l-5 5" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  luna: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  usuario: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
}

export function Icono({ nombre, size = 20, className = '' }: { nombre: string; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={('ico ' + className).trim()}
    >
      {PATHS[nombre] ?? PATHS.plato}
    </svg>
  )
}

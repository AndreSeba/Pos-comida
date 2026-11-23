/** Reduce una imagen a un cuadrado máximo de `max` px y la devuelve como data URL liviano (PNG, o WebP/JPEG si pesa mucho). */
export async function reducirImagen(
  file: File,
  max = 256,
  limite = 140_000,
  tipos: readonly ('image/png' | 'image/webp' | 'image/jpeg')[] = ['image/png', 'image/webp', 'image/jpeg'],
): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Usa una imagen PNG, JPG o WebP.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => mal(new Error('No se pudo leer la imagen.'))
      i.src = url
    })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * k))
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * k))
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('Tu navegador no pudo procesar la imagen.')
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    // el PNG conserva la transparencia; si pesa de más se prueba WebP y luego JPEG
    for (const tipo of tipos) {
      const datos = lienzo.toDataURL(tipo, tipo === 'image/webp' ? 0.82 : tipo === 'image/jpeg' ? 0.8 : undefined)
      if (datos.startsWith(`data:${tipo}`) && datos.length <= limite) return datos
    }
    throw new Error('La imagen es demasiado pesada. Prueba con otra más simple.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

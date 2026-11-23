# Demo: tienda de muestra «Flama Smash»

Una hamburguesería ficticia con datos reales de uso (14 días de ventas, gastos, compras e inventario) para mostrarle el sistema a un cliente.

## Preparar

```bash
powershell -ExecutionPolicy Bypass -File scripts/demo-iniciar.ps1
```

Levanta la base, la API y la app, carga los datos la primera vez y abre `http://localhost:5273`. Para dejar todo como el primer día (borra lo que se haya hecho en la demo):

```bash
powershell -ExecutionPolicy Bypass -File scripts/demo-iniciar.ps1 -Recargar
```

Para apagar todo: `scripts/demo-detener.ps1`.

| Persona | PIN | Rol |
|---|---|---|
| Admin | 1234 | Administrador (todo) |
| Caja 1 | 1111 | Ventas (cobra) |
| María | 2222 | Mesero (toma pedidos, no cobra) |
| Carlos | 3333 | Mesero |

Para el cliente desde su celular: misma red wifi y `http://IP-DE-TU-PC:5273`. **Sin internet:** `scripts/servidor-local.ps1 -Demo` (ver README, «Sin internet»). La carta pública está en `/carta`.

## Recorrido sugerido (15 min)

1. **El flujo de un día real** (la historia que cuenta la venta)
   - Entra como **María** (mesero, celular): toma el pedido de «Mesa 7» con dos hamburguesas y una gaseosa. Fíjate que no ve costos ni botón de cobrar.
   - Entra como **Caja 1** en otra pestaña o dispositivo: en *Pedidos* aparece la Mesa 7; agrégale unas papas y cóbrala con pago mixto (QR + efectivo).
   - La venta queda *por entregar*; María la marca entregada desde *Entregas*.
2. **Resumen (Admin):** ventas, costo, ganancia y utilidad neta; más vendidos; forma de pago. Cambia entre hoy, 7 y 30 días.
3. **Productos y costos — la calculadora:** abre «Hamburguesa clásica».
   - La receta usa lo que pagaste: *1 kg de carne a Bs 68* y *120 g por hamburguesa* → la app convierte unidades y muestra el costo de cada ingrediente. Cada línea acepta g o kg, ml o litros.
   - Si el cliente ya tiene su costo anotado, activa **«Ya tengo anotado cuánto me cuesta»**: manda el suyo y la app sigue mostrando el calculado como sugerencia (avisa si difieren más de 10%).
   - Mueve el margen y toca «Usar este precio».
4. **Inventario:** lo que *debería haber*. Fíjate en **Empaque** (negativo: se vendió antes de anotar la compra) y en los avisos de «por reponer».
   - *Registrar compra* (unos kilos de carne): sube el stock, actualiza el costo y la anota como gasto.
   - *Ajustar* un insumo con el conteo físico; mira el *Historial* de cualquier insumo: cada venta lo descuenta sola.
5. **Accesos:** crea el rol «Cajero» marcando permisos y asigna a una persona nueva. Entra con ella y muestra que solo ve lo permitido.
6. **Auditoría:** quién anuló una venta, qué cambió de precio, ingresos fallidos; el detalle campo por campo (antes → después).
6b. **Pedir desde la mesa (QR):** en **Mesas** (administración) están las 8 mesas con su QR. Lucía ya está en la Mesa 7 con un pedido por aceptar y Marco en la Mesa 4.
   - En el celular: **Probar** en «Mesa 3» (o escanea el QR). Escribe **su nombre** y ya puede pedir, sin avisar a nadie. Arma un pedido y envíalo.
   - Caja → *Pedidos*: aparece **«por aceptar»** con el nombre del cliente. Toca **No hay** en un producto: se quita, queda agotado y el cliente ve el aviso en su celular y puede **corregir**. Luego **Aceptar**: se suma a la cuenta de la mesa y se cobra como siempre.
   - **Seguridad para mostrar:** cambia una letra del enlace → «código no válido» (no se llega a otra mesa). En la pestaña *Mesas* de la caja toca **Cerrar mesa** (o cobra la cuenta): el celular del cliente deja de poder pedir hasta que escanee de nuevo.
   - Para más control: Administración → Mesas → «Pedir permiso al personal para entrar». Entonces el cliente queda «esperando» y a la caja le aparece «quiere entrar».
7. **Carta pública:** `/carta` desde el celular; arma un pedido y se abre WhatsApp. En la pestaña *Carta* están el QR y los enlaces.
8. **Personalización:** cambia el color de la marca y el logo en *Ajustes*; se aplica en todos los dispositivos.

## Qué tener presente

- Los datos son inventados (logo, fotos y precios).
- Los pedidos por WhatsApp salen al número de ejemplo `70012345`; cámbialo en *Carta* si vas a probar el envío.
- Las fotos de los productos son reales, de Wikimedia Commons (licencias libres; autores en `scripts/fotos/CREDITOS.md`). El cliente subirá las suyas.
- Capturas listas para enviar en `docs/capturas/` y el guion de presentación en `docs/GUION-CLIENTE.md`.

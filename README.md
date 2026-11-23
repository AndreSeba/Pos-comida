# POS de comida

Punto de venta sencillo para negocios de comida: panel de **administración** (costos, recetas, gastos, reportes) y panel de **ventas** pensado para móvil y tablet.

| Capa | Tecnología |
|---|---|
| API | C# · .NET 10 · ASP.NET Core (controllers) · EF Core |
| Base de datos | PostgreSQL 17 |
| Frontend | React + TypeScript + Vite (pnpm) · Bootstrap 5.3 (solo CSS) con tema propio claro/oscuro |
| Auth | JWT, PIN por persona (bcrypt), **roles y permisos** configurables, auditoría |

```
pos-comida/
├── api/           PosComida.slnx → Domain · Application · Infrastructure · Api
├── web/           React + Vite
└── docker-compose.yml   Postgres de desarrollo (puerto 5433)
```

## Arrancar en desarrollo

```bash
# 1. Base de datos
docker compose up -d

# 2. API (migra la base y carga datos de ejemplo la primera vez) → http://localhost:5080
cd api/src/PosComida.Api
dotnet run

# 3. Frontend → http://localhost:5273
cd web
pnpm install
pnpm dev
```

Acceso de desarrollo: usuario **Admin**, PIN **1234** (cámbialo en Ajustes). La documentación de la API está en `http://localhost:5080/scalar/v1`.

Desde el celular o la tablet (misma red wifi) abre `http://IP-DE-TU-PC:5273`. Vite reenvía `/api` a la API, así que no hay nada más que configurar.

## Qué hace

- **Ventas (móvil/tablet):** menú por categorías con botones grandes, pedido, cobro en efectivo (con vuelto), QR, tarjeta o **pago mixto** (parte con QR o tarjeta y el resto en efectivo), nota por pedido y "Mi turno". Los vendedores **no ven costos ni recetas**.
- **Productos y costos:** receta por producto → cuánto te cuesta hacerlo, margen que buscas, precio sugerido, ganancia real por unidad y aviso si vendes con pérdida.
- **Ingredientes:** anotas lo que compraste y cuánto pagaste; el costo por gramo/ml/unidad sale solo.
- **Gastos:** alquiler, insumos, servicios… por categoría y fecha.
- **Resumen:** ventas, costo, ganancia bruta, gastos y **utilidad neta** de hoy, 7 o 30 días; más vendidos y forma de pago.
- **Costos:** el costo de cada producto sale de la receta y de lo que pagaste por cada ingrediente (1 kg a Bs 40 y 120 g por hamburguesa → Bs 4,80; las cantidades aceptan g/kg y ml/l). Si el dueño ya tiene su costo anotado lo escribe a mano y **manda el suyo**, con el calculado como sugerencia.
- **Inventario:** compras de insumos (platos, empaques, carne, verduras…) que suben el stock; cada venta descuenta sola lo que lleva su receta; el stock **puede quedar negativo** si aún no se anotó una compra y se corrige después con la compra o con un **ajuste por conteo físico**. Historial (kardex) por insumo, stock mínimo con aviso de reposición y compra opcionalmente anotada como gasto.
- **Roles y permisos:** cada persona tiene un rol y cada rol un conjunto de permisos (cobrar, tomar pedidos, ver costos, ajustar inventario, ver auditoría…). El rol *Administrador* es fijo y siempre tiene todo; *Ventas* y *Mesero* vienen creados y se pueden crear más. Se valida en el servidor en cada petición, y al cambiar un rol o desactivar a alguien su sesión deja de servir.
- **Auditoría:** quién hizo qué y cuándo (ventas, anulaciones, precios, compras, ajustes, roles, ingresos y ingresos fallidos) con el valor de antes y de después, filtrable por entidad, acción, persona y fecha. Nunca guarda PIN.
- **Personas:** crea personas con su PIN y asígnales un rol.
- **Carta pública y pedidos por WhatsApp (como la tienda de Mi Casero):** en la pestaña **Carta** el administrador publica una página (`/carta`) con sus productos por categoría, con foto o icono, descripción y precio. El cliente la abre desde un enlace, sin cuenta, arma su pedido, elige si es **para comer en el local, para llevar o delivery** (en delivery se piden la ubicación —escrita o compartida desde el celular— y una referencia) y se abre WhatsApp con el mensaje listo hacia el número del negocio. Desde el admin se comparte el enlace, el **código QR** o la **carta escrita** por WhatsApp. Cada producto tiene su galería de imágenes y elige si sale en la carta; se puede ocultar precios o desactivar los pedidos. La carta nunca muestra costos, recetas ni márgenes.
- **Personalización (como Mi Casero):** el administrador define el nombre, el **logo** y el **color de la marca** del negocio, con vista previa en vivo; se aplica en todos los dispositivos. Cada dispositivo puede además elegir su **modo** (automático, claro u oscuro) y un color propio; se guarda en el navegador de ese dispositivo.

- **Pedir desde la mesa con QR:** en la pestaña **Mesas** (permiso `mesas.gestionar`) se crean las mesas y se imprime el QR de cada una. El cliente lo escanea con su celular, pone su **nombre** (obligatorio, para que el personal sepa quién pidió), arma su pedido y le llega al personal en **Pedidos → «por aceptar»**; el personal lo acepta, lo edita o lo rechaza con un motivo. Si algo se acabó, el botón **No hay** quita el producto del pedido, lo marca agotado (nadie más lo puede pedir desde la mesa) y el cliente ve el aviso y puede corregir su pedido. Lo aceptado se suma a la cuenta abierta de esa mesa y se cobra como cualquier pedido.
  - **Seguridad:** el enlace lleva un código secreto de 192 bits (`/mesa/<código>`), no el número de mesa; cambiar el enlace no lleva a otra mesa. Cada cliente se identifica con un código anónimo de su celular y solo ve y corrige lo suyo; un pedido ajeno, de otra mesa o inexistente responde igual («no encontrado»). El precio siempre sale de la base de datos. Hay límites de tamaño (30 productos, 20 unidades de cada uno) y de pedidos esperando aceptación (3 por celular, 6 por mesa), y topes de peticiones por mesa y por IP (`RateLimit:MesaLeerPorMinuto`, `RateLimit:MesaEscribirPorMinuto`, `RateLimit:MesaPorIpPorMinuto`). «QR nuevo» cambia el código y el QR impreso anterior deja de servir; la auditoría registra el cambio pero nunca el código.
  - **Entrada directa, sin avisar al personal:** el cliente escanea el QR, escribe su nombre y ya puede pedir. Al entrar, su celular queda atado a la mesa de su enlace y a una **sesión de mesa** que se abre sola y termina al **cobrar la cuenta** (o con «Cerrar mesa» en la pestaña **Mesas** del panel de ventas, o a las 6 h): desde ese momento ese celular ya no puede pedir y tiene que volver a escanear. Si el negocio quiere más control (por ejemplo, porque escanean desde fuera del local), en **Administración → Mesas** puede activar «Pedir permiso al personal para entrar»: el cliente queda «esperando» y al personal le aparece «quiere entrar» para dejarlo pasar con un toque; así el QR de otro día no sirve. Hay un tope de solicitudes esperando por mesa y los rechazados no pueden insistir enseguida.
  - **Límite honesto:** quien tenga el QR de una mesa (una foto, por ejemplo) puede escanearlo y pedir para esa mesa; por eso todo pedido pasa por la aceptación del personal, que ve de qué mesa viene y el nombre de quien lo hizo, y para más control está el modo con permiso. Si un QR se filtra, se genera uno nuevo desde el panel.

## Decisiones de diseño

- El **precio y el costo de cada venta los calcula el servidor**, nunca el cliente. El costo queda congelado en la venta, así que cambiar el precio de un ingrediente después no altera la ganancia histórica.
- Borrar un producto no daña el historial (las ventas guardan una copia del nombre, precio y costo).
- Un ingrediente que está en alguna receta no se puede borrar ni cambiarle la unidad.
- Los PIN se guardan con bcrypt y el login tiene límite de 8 intentos por minuto por IP.

## Producción (pendiente de decidir dónde se despliega)

- `Jwt:Key` (32+ caracteres), `ConnectionStrings:Default`, `Cors:Origenes` y `Seed:AdminPin` se pasan por variables de entorno o user-secrets, nunca en el repositorio.
- Con `Db:MigrarAlIniciar=true` la API aplica las migraciones al arrancar.
- Servir el frontend con `pnpm build` (carpeta `web/dist`) detrás del mismo dominio que la API o con `VITE_API_URL` apuntando a ella.
- Usar HTTPS: el PIN y el token viajan en cada petición.

## Sin internet (todo el local por la wifi)

El sistema puede funcionar sin internet: un computador del local hace de servidor y la caja, los meseros y los celulares de los clientes (pedir desde la mesa con QR) se conectan a su wifi. La API entrega también la aplicación, así que es un solo programa.

```bash
powershell -ExecutionPolicy Bypass -File scripts/servidor-local.ps1 -Demo
```

El script arranca PostgreSQL, compila la aplicación (`pnpm build`) la primera vez, la copia a `api/src/PosComida.Api/wwwroot` y arranca la API escuchando en toda la red (puerto 5080). Al final imprime la dirección para los demás equipos (por ejemplo `http://192.168.1.50:5080`) y los pasos que faltan, que son del local y no se pueden automatizar:

1. En **Administración → Mesas** pon esa dirección en «Dirección que abrirán los celulares» e imprime los QR (llevan esa dirección).
2. Abrir el puerto en el Firewall de Windows, una sola vez y como administrador: `New-NetFirewallRule -DisplayName 'POS local' -Direction Inbound -Protocol TCP -LocalPort 5080 -Action Allow -Profile Private`.
3. Reservar una **IP fija** para ese computador en el router; si cambia, los QR impresos dejan de apuntar a él.
4. En Android, cuando la wifi avise «sin internet», elegir **mantener la conexión**; si no, el celular usa datos móviles y no llega al local.

La aplicación no carga nada de internet (ni fuentes ni scripts de terceros). Con `http://` plano el escaneo con la cámara y los pedidos funcionan igual. Si el local se queda sin internet a mitad del servicio, nada cambia; si se cae la wifi un momento, la pantalla del cliente avisa «sin conexión» y su pedido no se pierde.

## Carta pública: qué configurar al desplegar

- **Enlace que se comparte:** la carta vive en `/carta` del mismo sitio. En producción fija `VITE_PUBLIC_URL` (por ejemplo `https://carta.minegocio.com`) al compilar el frontend; si no, usa la dirección desde la que abre el administrador (en desarrollo es `localhost`, que los clientes no pueden abrir).
- **Rutas del frontend:** el servidor debe devolver `index.html` para cualquier ruta (`/carta` y `/mesa/<código>` incluidas), como cualquier aplicación de una sola página.
- **QR de las mesas:** se generan con la dirección pública (`VITE_PUBLIC_URL`); si cambia el dominio, hay que volver a imprimirlos. Los pedidos de mesa necesitan «Pedidos abiertos» activado en Ajustes.
- **Imágenes de productos:** hasta 6 por producto (la primera es la portada), guardadas en la base de datos (tabla `producto_imagenes`), reducidas a 640 px y servidas desde `/api/publico/imagenes/{id}` con caché larga. La portada se ve también en los botones del panel de ventas. No son secretas: cualquiera con el enlace puede verlas.
- **Los pedidos no se guardan en el sistema:** salen directo por WhatsApp. Cuando el cliente confirma, tú registras la venta en el panel de ventas.

## Probar la API de punta a punta

`scripts/prueba_api.py` recorre la API real con 244 comprobaciones (acceso, ventas con pago mixto, reportes, gastos, imágenes, personalización y carta, pedidos abiertos, inventario y descuento por receta, costo manual, roles y permisos, auditoría, y pedidos desde la mesa con QR: enlaces inválidos, acceso cruzado entre mesas y celulares, entrada directa de varios celulares a la vez, modo con permiso, enlace viejo, agotados, aceptar y unir cuentas). Necesita la API corriendo sobre una base **vacía** (crea un usuario y ventas de prueba):

```bash
python scripts/prueba_api.py http://localhost:5080
```

**Sin Docker:** si Docker/WSL2 no funciona, se puede usar un PostgreSQL portátil (zip de binarios de postgresql.org, sin instalar nada): extraerlo en `.tools/postgres` (ya está en `.gitignore`), `initdb -D .tools/pgdata -U pos` con la contraseña de `appsettings.Development.json`, y arrancarlo con `pg_ctl -D .tools/pgdata -o "-p 5433" start`. Después crea la base `poscomida` y levanta la API con `dotnet run`.

## Tienda de muestra para mostrar a un cliente

`scripts/demo-iniciar.ps1` levanta todo y carga «Flama Smash» (14 días de ventas, gastos, compras e inventario); `scripts/demo-detener.ps1` lo apaga. El guion del recorrido está en [docs/DEMO.md](docs/DEMO.md).

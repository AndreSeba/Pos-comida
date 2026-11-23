"""Carga una tienda de muestra ("Flama Smash") en una API recién creada, para enseñar el sistema a un cliente.

Uso:   python scripts/demo.py [http://localhost:5080] [--psql RUTA_A_psql.exe]

Crea: marca y logo, ingredientes con costos, 21 productos con receta, imágenes y descripción, personal (caja y meseros),
dos semanas de ventas con distintas formas de pago, gastos, la carta pública publicada y pedidos abiertos en curso.
Las imágenes se dibujan aquí mismo (ilustraciones sencillas): cámbialas por fotos reales desde Productos.
Con --psql reparte las ventas en los últimos 14 días (la API siempre fecha las ventas "ahora"); sin él, quedan todas de hoy.
Para que "Hoy" tenga ventas el día de la demo: python scripts/demo.py --solo-fechas --psql RUTA (se puede repetir).
Necesita una API con la base VACÍA y el Admin con PIN 1234 (el que crea el modo Development).
"""
import base64, json, math, os, random, struct, subprocess, sys, urllib.error, urllib.request, zlib
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding="utf-8")
random.seed(11)
N_VENTAS = 110  # las primeras ventas (ids 1..N) son el historial; después vienen las de la demo en vivo
args = [a for a in sys.argv[1:]]
PSQL = os.path.abspath(args[args.index("--psql") + 1]) if "--psql" in args else None
BASE = next((a for a in args if a.startswith("http")), "http://localhost:5080").rstrip("/")


def req(metodo, ruta, cuerpo=None, token=None, cabeceras=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    r = urllib.request.Request(BASE + ruta, data=datos, method=metodo)
    if datos is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    for k, v in (cabeceras or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            crudo = resp.read()
            return resp.status, (json.loads(crudo) if crudo and "json" in resp.headers.get("Content-Type", "") else crudo)
    except urllib.error.HTTPError as e:
        crudo = e.read()
        try:
            return e.code, json.loads(crudo)
        except Exception:
            return e.code, crudo


def bien(metodo, ruta, cuerpo=None, token=None, cabeceras=None):
    s, r = req(metodo, ruta, cuerpo, token, cabeceras)
    if s >= 400:
        raise SystemExit(f"{metodo} {ruta} falló ({s}): {r}")
    return r


# ====================================================================== dibujo (ilustraciones sencillas, sin librerías)
class Lienzo:
    def __init__(s, w, h, c1, c2):
        s.w, s.h = w, h
        s.px = bytearray(w * h * 3)
        for y in range(h):
            t = y / (h - 1)
            c = bytes(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3))
            s.px[y * w * 3:(y + 1) * w * 3] = c * w

    def _fila(s, y, x0, x1, c):
        if y < 0 or y >= s.h:
            return
        x0, x1 = max(0, int(x0)), min(s.w - 1, int(x1))
        if x1 >= x0:
            s.px[(y * s.w + x0) * 3:(y * s.w + x1 + 1) * 3] = bytes(c) * (x1 - x0 + 1)

    def rect(s, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            s._fila(y, x0, x1, c)

    def elipse(s, cx, cy, rx, ry, c, mitad=None):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            if (mitad == "arriba" and y > cy) or (mitad == "abajo" and y < cy):
                continue
            dy = (y - cy) / ry
            if abs(dy) <= 1:
                dx = rx * math.sqrt(1 - dy * dy)
                s._fila(y, cx - dx, cx + dx, c)

    def caja(s, x0, y0, x1, y1, r, c):
        s.rect(x0 + r, y0, x1 - r, y1, c)
        s.rect(x0, y0 + r, x1, y1 - r, c)
        for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
            s.elipse(cx, cy, r, r, c)

    def poligono(s, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for i in range(len(pts)):
                (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % len(pts)]
                if ya == yb or not (min(ya, yb) <= y < max(ya, yb)):
                    continue
                xs.append(xa + (y - ya) * (xb - xa) / (yb - ya))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                s._fila(y, xs[i], xs[i + 1], c)

    def png(s):
        def trozo(t, d):
            c = struct.pack(">I", len(d)) + t + d
            return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        filas = b"".join(b"\x00" + bytes(s.px[y * s.w * 3:(y + 1) * s.w * 3]) for y in range(s.h))
        cuerpo = b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", s.w, s.h, 8, 2, 0, 0, 0)) + trozo(b"IDAT", zlib.compress(filas, 6)) + trozo(b"IEND", b"")
        return "data:image/png;base64," + base64.b64encode(cuerpo).decode()


FONDOS = [((253, 230, 200), (240, 170, 110)), ((214, 232, 214), (120, 170, 130)), ((236, 222, 244), (160, 130, 200)), ((252, 214, 214), (225, 120, 120)), ((222, 236, 250), (110, 160, 215))]


def plato(l, dx=0):
    l.elipse(320 + dx, 392, 255, 52, (0, 0, 0))  # sombra dura, se aclara abajo
    l.elipse(320 + dx, 386, 255, 52, (60, 60, 60))
    l.elipse(320 + dx, 372, 250, 62, (250, 250, 250))
    l.elipse(320 + dx, 368, 205, 44, (232, 232, 232))


def hamburguesa(l, tipo="clasica", dx=0, y=0):
    cx = 320 + dx
    pan, pan_sombra = (226, 160, 72), (196, 128, 50)
    l.caja(cx - 150, 316 + y, cx + 150, 352 + y, 18, pan_sombra)
    l.caja(cx - 150, 312 + y, cx + 150, 346 + y, 18, pan)
    if tipo == "pollo":
        l.caja(cx - 158, 272 + y, cx + 158, 312 + y, 16, (214, 150, 52))
        for i in range(14):
            l.elipse(cx - 140 + i * 21, 285 + y + (i % 3) * 9, 6, 5, (244, 196, 96))
    else:
        l.caja(cx - 158, 276 + y, cx + 158, 312 + y, 15, (96, 52, 32))
    if tipo == "doble":
        l.rect(cx - 150, 262 + y, cx + 150, 276 + y, (250, 200, 50))
        l.caja(cx - 158, 236 + y, cx + 158, 266 + y, 14, (96, 52, 32))
        y -= 34
    l.rect(cx - 152, 262 + y, cx + 152, 278 + y, (250, 200, 50))
    for k in range(5):
        l.poligono([(cx - 120 + k * 60, 276 + y), (cx - 90 + k * 60, 276 + y), (cx - 105 + k * 60, 296 + y)], (250, 200, 50))
    if tipo == "bbq":
        for k in range(3):
            l.poligono([(cx - 130 + k * 90, 252 + y), (cx - 40 + k * 90, 246 + y), (cx - 36 + k * 90, 262 + y), (cx - 126 + k * 90, 268 + y)], (150, 46, 38))
        l.caja(cx - 150, 270 + y, cx + 150, 280 + y, 5, (110, 40, 20))
    l.caja(cx - 150, 238 + y, cx + 150, 254 + y, 8, (214, 48, 40))
    for x in range(cx - 150, cx + 160, 32):
        l.elipse(x, 238 + y, 26, 13, (112, 184, 62))
    l.elipse(cx, 232 + y, 165, 112, pan_sombra, "arriba")
    l.elipse(cx, 228 + y, 160, 108, pan, "arriba")
    l.elipse(cx - 40, 150 + y, 70, 26, (244, 190, 110), "arriba")
    for sx, sy in ((cx - 70, 170), (cx - 10, 150), (cx + 55, 168), (cx + 95, 196), (cx - 105, 200), (cx + 20, 190)):
        l.elipse(sx, sy + y, 9, 5, (250, 236, 200))


def papas(l, dx=0):
    cx = 320 + dx
    for i, x in enumerate(range(cx - 100, cx + 100, 19)):
        alto = 150 + (i * 37) % 55
        l.caja(x, alto, x + 14, 290, 5, (246, 200, 60) if i % 2 else (236, 182, 40))
    l.poligono([(cx - 120, 270), (cx + 120, 270), (cx + 96, 400), (cx - 96, 400)], (206, 40, 40))
    l.poligono([(cx - 112, 300), (cx + 112, 300), (cx + 106, 330), (cx - 106, 330)], (252, 214, 60))
    l.elipse(cx, 316, 38, 16, (206, 40, 40))


def vaso(l, color, dx=0, rodaja=None):
    cx = 320 + dx
    l.poligono([(cx + 40, 60), (cx + 56, 60), (cx + 36, 190), (cx + 20, 190)], (240, 240, 240))
    l.poligono([(cx - 100, 170), (cx + 100, 170), (cx + 78, 400), (cx - 78, 400)], color)
    l.caja(cx - 112, 150, cx + 112, 178, 10, (250, 250, 250))
    l.poligono([(cx - 84, 205), (cx + 84, 205), (cx + 78, 232), (cx - 78, 232)], (255, 255, 255))
    for ix, iy in ((cx - 40, 270), (cx + 20, 300), (cx - 10, 340), (cx + 45, 260)):
        l.caja(ix, iy, ix + 34, iy + 34, 5, (255, 255, 255))
    if rodaja:
        l.elipse(cx + 96, 188, 34, 34, rodaja)
        l.elipse(cx + 96, 188, 24, 24, (252, 246, 200))


def alitas(l, dx=0):
    cx = 320 + dx
    for i, (x, y, a) in enumerate(((220, 280, 0), (320, 250, 1), (420, 285, 0), (270, 330, 1), (370, 335, 0))):
        x += dx
        l.elipse(x, y, 58, 40, (196, 92, 32))
        l.elipse(x - 10, y - 10, 30, 14, (226, 132, 60))
        l.rect(x + 40, y - 6, x + 92, y + 6, (246, 232, 214))
        l.elipse(x + 94, y - 10, 9, 9, (246, 232, 214))
        l.elipse(x + 94, y + 10, 9, 9, (246, 232, 214))


def aros(l, dx=0):
    for x, y, r in ((250, 300, 64), (390, 290, 70), (320, 230, 78), (230, 220, 50)):
        x += dx
        l.elipse(x, y, r, r * 0.8, (226, 168, 66))
        l.elipse(x, y, r * 0.55, r * 0.42, (240, 230, 214))
        l.elipse(x - r * 0.2, y - r * 0.4, r * 0.4, r * 0.12, (246, 200, 110))


def brownie(l, dx=0):
    cx = 320 + dx
    l.caja(cx - 150, 280, cx + 150, 350, 12, (70, 38, 24))
    l.caja(cx - 150, 250, cx + 150, 300, 12, (96, 54, 34))
    l.rect(cx - 140, 262, cx + 140, 276, (120, 70, 44))
    for x in range(cx - 120, cx + 130, 48):
        l.elipse(x, 256, 12, 6, (150, 96, 64))
    l.elipse(cx, 200, 56, 46, (250, 214, 226))  # bola de helado
    l.elipse(cx, 168, 40, 34, (250, 232, 240))
    l.elipse(cx, 156, 8, 8, (206, 40, 60))


def helado(l, dx=0):
    cx = 320 + dx
    l.poligono([(cx - 70, 260), (cx + 70, 260), (cx, 410)], (226, 168, 90))
    for i in range(4):
        l.poligono([(cx - 60 + i * 30, 262), (cx - 40 + i * 30, 262), (cx - 6 + i * 4, 400)], (206, 140, 60))
    l.elipse(cx, 250, 92, 52, (250, 214, 226))
    l.elipse(cx, 196, 78, 56, (252, 240, 214))
    l.elipse(cx, 150, 58, 46, (214, 160, 120))
    l.elipse(cx + 18, 112, 9, 9, (206, 40, 60))


def pizza_u(l, dx=0):
    cx = 320 + dx
    l.poligono([(cx, 400), (cx - 170, 130), (cx + 170, 130)], (230, 168, 70))
    l.poligono([(cx, 380), (cx - 148, 150), (cx + 148, 150)], (250, 196, 70))
    for x, y in ((cx - 70, 190), (cx + 60, 200), (cx - 10, 260), (cx + 10, 320)):
        l.elipse(x, y, 24, 24, (190, 44, 40))


DIBUJOS = {
    "clasica": lambda l, v: (plato(l), hamburguesa(l, "clasica", 0, v * 6)),
    "doble": lambda l, v: (plato(l), hamburguesa(l, "doble", 0, 38 + v * 6)),
    "pollo": lambda l, v: (plato(l), hamburguesa(l, "pollo", 0, v * 6)),
    "bbq": lambda l, v: (plato(l), hamburguesa(l, "bbq", 0, 20 + v * 6)),
    "papas": lambda l, v: (plato(l), papas(l, v * 10)),
    "aros": lambda l, v: (plato(l), aros(l, v * 10)),
    "alitas": lambda l, v: (plato(l), alitas(l, v * 8)),
    "gaseosa": lambda l, v: vaso(l, (176, 40, 36) if v == 0 else (60, 70, 160)),
    "limonada": lambda l, v: vaso(l, (188, 214, 90), 0, (140, 190, 60)),
    "jugo": lambda l, v: vaso(l, (240, 150, 50) if v == 0 else (206, 60, 90), 0, (250, 170, 50)),
    "brownie": lambda l, v: (plato(l), brownie(l, v * 8)),
    "helado": lambda l, v: helado(l, v * 10),
    "pizza": lambda l, v: (plato(l), pizza_u(l, v * 8)),
}


def imagen(nombre_dibujo, variante):
    c1, c2 = FONDOS[(sum(map(ord, nombre_dibujo)) + variante * 2) % len(FONDOS)]
    l = Lienzo(640, 480, c1, c2)
    DIBUJOS[nombre_dibujo](l, variante)
    return l.png()


CARPETA_FOTOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fotos")


def foto(dibujo, n):
    """Foto real (scripts/fotos, créditos en CREDITOS.md); si falta, usa la ilustración."""
    ruta = os.path.join(CARPETA_FOTOS, f"{dibujo}_{n}.jpg")
    if not os.path.exists(ruta):
        return imagen(dibujo, n) if dibujo in DIBUJOS else None
    return "data:image/jpeg;base64," + base64.b64encode(open(ruta, "rb").read()).decode()


def logo():
    ruta = os.path.join(CARPETA_FOTOS, "flama_logo.png")
    if os.path.exists(ruta):
        return "data:image/png;base64," + base64.b64encode(open(ruta, "rb").read()).decode()
    return logo_dibujado()


def logo_dibujado():
    l = Lienzo(256, 256, (255, 255, 255), (255, 255, 255))
    l.caja(8, 8, 247, 247, 56, (198, 40, 40))
    l.elipse(128, 118, 78, 56, (250, 232, 200), "arriba")
    l.caja(52, 124, 204, 144, 8, (96, 52, 32))
    l.rect(56, 136, 200, 146, (250, 200, 50))
    l.caja(52, 148, 204, 172, 12, (250, 232, 200))
    for sx, sy in ((100, 86), (132, 76), (162, 92), (116, 100)):
        l.elipse(sx, sy, 5, 3, (198, 40, 40))
    return l.png()


# ====================================================================== datos de la tienda
INGREDIENTES = {  # nombre: (unidad base, cantidad que compras, lo que pagas en Bs)
    "Carne molida de res": ("g", 1000, 68), "Pan de camote": ("u", 12, 24), "Queso cheddar laminado": ("u", 20, 26),
    "Lechuga": ("g", 500, 7), "Cebolla": ("g", 1000, 6), "Cebolla crispy": ("g", 500, 20), "Pepinillos": ("g", 500, 22),
    "Salsa americana": ("ml", 1000, 28), "Salsa barbacoa": ("ml", 1000, 24), "Crema de cheddar": ("ml", 1000, 40),
    "Tocino ahumado": ("g", 500, 42), "Piña": ("g", 1000, 10), "Pechuga de pollo": ("g", 1000, 34),
    "Empanizado crocante": ("g", 1000, 18), "Limón": ("u", 20, 10), "Papa": ("g", 5000, 38), "Aceite": ("ml", 1000, 17),
    "Soda mini": ("u", 12, 24), "Soda 500 ml": ("u", 12, 50), "Soda 2 litros": ("u", 6, 66), "Empaque": ("u", 100, 60),
}


def smash(nombre, simple, doble, receta, desc, dibujo):
    """Una hamburguesa del menú: sale en versión simple (1 carne) y doble (2 carnes); todas incluyen papas fritas."""
    base = dict(receta, **{"Pan de camote": 1, "Papa": 150, "Aceite": 25, "Empaque": 1})
    out = []
    for etiqueta, precio, carne, foto_d in (("simple", simple, 90, dibujo), ("doble", doble, 180, "doble")):
        r = dict(base, **{"Carne molida de res": carne})
        out.append((f"{nombre} {etiqueta}", "Hamburguesas", "hamburguesa", precio, 62, 0.5, r, desc + " Incluye papas fritas.", foto_d))
    return out


# nombre, categoría, icono, precio, margen que busca, otros costos, receta, descripción, dibujo
PRODUCTOS = [
    *smash("Smash", 25, 35, {"Lechuga": 15, "Queso cheddar laminado": 1}, "Carne de res, lechuga fresca, salsa americana, pan de camote y queso cheddar.", "clasica"),
    *smash("Americana", 27, 37, {"Cebolla": 40, "Salsa americana": 20, "Queso cheddar laminado": 1}, "Carne de res, cebolla caramelizada, salsa americana, pan de camote y queso cheddar.", "clasica"),
    *smash("Crunchy", 33, 43, {"Cebolla crispy": 25, "Pepinillos": 15, "Queso cheddar laminado": 1, "Tocino ahumado": 25, "Salsa americana": 20}, "Carne de res, cebolla crispy, pepinillos, queso cheddar, tocino, salsa americana y pan de camote.", "pollo"),
    *smash("Tradicional", 35, 45, {"Tocino ahumado": 25, "Pepinillos": 15, "Cebolla": 40, "Salsa americana": 20, "Queso cheddar laminado": 2}, "Carne de res, tocino, pepinillos, cebolla caramelizada, salsa americana, pan de camote y doble queso cheddar.", "bbq"),
    *smash("Tropical", 33, 43, {"Piña": 50, "Salsa americana": 20, "Tocino ahumado": 25, "Queso cheddar laminado": 1}, "Carne de res, piña caramelizada, salsa americana, pan de camote, tocino y queso cheddar.", "clasica"),
    *smash("Buffalo", 39, 49, {"Cebolla": 40, "Queso cheddar laminado": 1, "Tocino ahumado": 50, "Salsa barbacoa": 25}, "Carne de res, cebolla caramelizada, queso cheddar, extra tocino, salsa barbacoa y pan de camote.", "bbq"),
    *smash("Cheeseflama", 39, 49, {"Pepinillos": 15, "Crema de cheddar": 40, "Tocino ahumado": 50, "Salsa americana": 20}, "Carne de res, pepinillos, crema cheddar fundido, extra tocino, salsa americana y pan de camote.", "doble"),
    ("Milanesa picada", "Platos extras", "plato", 30, 62, 0.5, {"Pechuga de pollo": 150, "Empanizado crocante": 40, "Papa": 200, "Aceite": 60, "Limón": 1, "Empaque": 1}, "Milanesa picada de pollo, papas fritas, salsas y limón.", "pollo"),
    ("Soda mini", "Gaseosas", "bebida", 3, 40, 0, {"Soda mini": 1}, "Soda personal bien fría.", "gaseosa"),
    ("Soda de 500 ml", "Gaseosas", "bebida", 8, 45, 0, {"Soda 500 ml": 1}, "Soda de 500 ml bien fría.", "gaseosa"),
    ("Soda de 2 litros", "Gaseosas", "bebida", 17, 35, 0, {"Soda 2 litros": 1}, "Soda de 2 litros para compartir.", None),
    ("Salsa extra", "Extras", "plato", 4, 70, 0, {"Salsa americana": 30}, "Porción extra de salsa americana.", None),
    ("Tocino extra", "Extras", "plato", 8, 55, 0, {"Tocino ahumado": 40}, "Porción extra de tocino ahumado.", None),
    ("Porción de papas", "Extras", "papas", 10, 70, 0.3, {"Papa": 250, "Aceite": 40}, "Porción extra de papas fritas.", "papas"),
]
POPULARIDAD = {"Smash simple": 10, "Smash doble": 6, "Americana simple": 8, "Americana doble": 4, "Crunchy simple": 5, "Crunchy doble": 3,
               "Tradicional simple": 5, "Tradicional doble": 3, "Tropical simple": 4, "Tropical doble": 2, "Buffalo simple": 4, "Buffalo doble": 3,
               "Cheeseflama simple": 5, "Cheeseflama doble": 3, "Milanesa picada": 4, "Soda mini": 6, "Soda de 500 ml": 9, "Soda de 2 litros": 3,
               "Salsa extra": 5, "Tocino extra": 4, "Porción de papas": 6}
GASTOS = [("Alquiler del local", "Alquiler", 1800, 1), ("Luz", "Servicios", 342.5, 3), ("Agua", "Servicios", 96, 3), ("Gas (garrafas)", "Gas", 186, 5),
          ("Compra de carnes y tocino", "Insumos", 960, 2), ("Compra de verduras y pan", "Insumos", 410, 4), ("Sueldos del mes", "Sueldos", 2600, 1),
          ("Publicidad en redes", "Otros", 150, 6), ("Compra de bebidas", "Insumos", 380, 8), ("Mantenimiento de la freidora", "Otros", 120, 10)]

def repartir_fechas():
    """Reparte las ventas del historial en los últimos 14 días (más ventas en los días recientes). Se puede repetir el día de la demo."""
    if not PSQL:
        print("  (sin --psql no se pueden repartir las fechas)")
        return
    sql = f"""
    UPDATE ventas v SET "Etiqueta" = '', "Fecha" = CASE WHEN r.f > now() THEN r.f - interval '1 day' ELSE r.f END
    FROM (
      SELECT "Id" AS id, date_trunc('day', now() - interval '4 hours') + interval '4 hours'
             - (floor(power(random(), 1.5) * 14))::int * interval '1 day'
             + (11 + floor(random() * 11))::int * interval '1 hour' + floor(random() * 60)::int * interval '1 minute' AS f
      FROM ventas WHERE "Id" <= {N_VENTAS}
    ) r WHERE v."Id" = r.id;
    """
    out = subprocess.run([PSQL, "-h", "localhost", "-p", "5433", "-U", "pos", "-d", "poscomida", "-v", "ON_ERROR_STOP=1", "-c", sql],
                         env={**os.environ, "PGPASSWORD": "pos_dev_password"}, capture_output=True, text=True, timeout=60)
    print("  ", out.stdout.strip() or out.stderr.strip())


# ====================================================================== carga
if "--solo-fechas" in args:
    print("== Repartiendo las ventas en el tiempo")
    repartir_fechas()
    sys.exit(0)

print("== Marca y acceso")
s, usuarios = req("GET", "/api/auth/usuarios")
admin = next(u for u in usuarios if u["admin"])
tok = bien("POST", "/api/auth/login", {"usuarioId": admin["id"], "pin": "1234"})["token"]
cfg_base = {"negocio": "Flama Smash", "moneda": "Bs", "colorMarca": "#D9381E", "logo": logo(), "descripcion": "Smash burgers · @flamasmashburger_ · Todas las hamburguesas incluyen papas fritas",
            "whatsapp": "70012345", "cartaPublicada": True, "mostrarPrecios": True, "pedidosWhatsapp": True, "pedidosAbiertos": False, "seguimientoEntrega": False}
bien("PUT", "/api/config", cfg_base, tok)
print("  Flama Smash, color rojo, logo y carta publicada")

print("== Personal")
ROLES = {r["nombre"]: r["id"] for r in bien("GET", "/api/roles", token=tok)}
def crear_usuario(nombre, rol, pin):
    r = bien("POST", "/api/usuarios", {"nombre": nombre, "rolId": ROLES[rol], "pin": pin, "activo": True}, tok)
    return bien("POST", "/api/auth/login", {"usuarioId": r["id"], "pin": pin})["token"]
t_caja = crear_usuario("Caja 1", "Ventas", "1111")
t_maria = crear_usuario("María", "Mesero", "2222")
t_carlos = crear_usuario("Carlos", "Mesero", "3333")
print("  Caja 1 (1111), María (2222), Carlos (3333)")

print("== Ingredientes y productos")
# lo que hay al abrir la demo, en "paquetes de compra" (por defecto 30); unos pocos quedan justos para mostrar los avisos
EXISTENCIA = {"Empaque": 0.3, "Tocino ahumado": 3.5, "Cebolla crispy": 0.9, "Soda mini": 2, "Soda 500 ml": 3, "Soda 2 litros": 2}
ing_id = {
    n: bien("POST", "/api/ingredientes", {"nombre": n, "unidad": u, "cantidad": c, "precio": p, "stock": round(c * EXISTENCIA.get(n, 30), 2), "stockMinimo": round(c * 2, 2)}, tok)["id"]
    for n, (u, c, p) in INGREDIENTES.items()
}
prod = {}
for nombre, cat, icono, precio, margen, otros, receta, desc, dibujo in PRODUCTOS:
    cuerpo = {"nombre": nombre, "categoria": cat, "icono": icono, "porciones": 1, "otros": otros, "margenObjetivo": margen, "precio": precio, "activo": True,
              "receta": [{"ingredienteId": ing_id[i], "cantidad": q} for i, q in receta.items()], "descripcion": desc, "enCarta": True,
              "imagenes": [{"datos": foto(dibujo, n)} for n in (0, 1) if dibujo and foto(dibujo, n)]}
    p = bien("POST", "/api/productos", cuerpo, tok)
    prod[nombre] = p
    print(f"  {nombre:22s} Bs {precio:>5}  costo {p['costo']:.2f}  ganancia {100 * (precio - p['costo']) / precio:.0f}%  ({len(p['imagenes'])} imágenes)")

print("== Historial de ventas (14 días)")
nombres = list(POPULARIDAD)
pesos = [POPULARIDAD[n] for n in nombres]
metodos = ["Efectivo"] * 55 + ["Qr"] * 30 + ["Tarjeta"] * 8 + ["Mixto"] * 7
for _ in range(N_VENTAS):
    elegidos = {}
    for _ in range(random.choice([1, 2, 2, 3, 3, 4])):
        n = random.choices(nombres, pesos)[0]
        elegidos[n] = elegidos.get(n, 0) + random.choice([1, 1, 1, 2])
    items = [{"productoId": prod[n]["id"], "cantidad": c} for n, c in elegidos.items()]
    total = round(sum(prod[n]["precio"] * c for n, c in elegidos.items()), 2)
    m = random.choice(metodos)
    if m == "Mixto":
        qr = round(min(total - 1, random.choice([10, 15, 20, 25])), 2)
        pagos = [{"metodo": "Efectivo", "monto": round(total - qr, 2)}, {"metodo": "Qr", "monto": qr}]
    else:
        pagos = [{"metodo": m, "monto": total}]
    bien("POST", "/api/ventas", {"items": items, "pagos": pagos, "etiqueta": "_hist"}, t_caja)
print(f"  {N_VENTAS} ventas registradas")

print("== Compras de insumos y ajuste")
def compra(proveedor, nota, lineas):
    items = [{"ingredienteId": ing_id[n], "cantidad": INGREDIENTES[n][1] * k, "total": round(INGREDIENTES[n][2] * k, 2)} for n, k in lineas]
    bien("POST", "/api/inventario/compras", {"proveedor": proveedor, "nota": nota, "actualizarCostos": True, "registrarGasto": False, "items": items}, tok)
compra("Frigorífico San Martín", "Carne y pollo de la semana", [("Carne molida de res", 12), ("Pechuga de pollo", 4), ("Tocino ahumado", 2)])
compra("Distribuidora Andina", "Pan, quesos y salsas", [("Pan de camote", 8), ("Queso cheddar laminado", 4), ("Salsa americana", 3)])
ings = {i["nombre"]: i for i in bien("GET", "/api/ingredientes", token=tok)}
aceite = ings["Aceite"]
bien("POST", "/api/inventario/ajustes", {"ingredienteId": aceite["id"], "stockReal": round(aceite["stock"] * 0.92, 2), "motivo": "Conteo del cierre: se perdió algo en la freidora"}, tok)
neg = [n for n, i in ings.items() if i["stock"] < 0]
bajo = [n for n, i in ings.items() if 0 <= i["stock"] <= i["stockMinimo"]]
print(f"  2 compras y 1 ajuste · en negativo (falta anotar compra): {', '.join(neg) or 'ninguno'} · por reponer: {', '.join(bajo) or 'ninguno'}")

print("== Gastos")
hoy = datetime.now(timezone.utc)
for concepto, categoria, monto, dias in GASTOS:
    fecha = (hoy - timedelta(days=dias)).replace(hour=16, minute=0, second=0, microsecond=0)
    bien("POST", "/api/gastos", {"fecha": fecha.isoformat().replace("+00:00", "Z"), "concepto": concepto, "categoria": categoria, "monto": monto}, tok)
print(f"  {len(GASTOS)} gastos")

print("== Repartiendo las ventas en el tiempo")
repartir_fechas()

print("== Flujos activados y pedidos en curso")
bien("PUT", "/api/config", dict(cfg_base, pedidosAbiertos=True, seguimientoEntrega=True), tok)
P = lambda n: prod[n]["id"]
bien("POST", "/api/pedidos", {"etiqueta": "Mesa 2", "nota": "una sin cebolla", "items": [{"productoId": P("Smash simple"), "cantidad": 2}, {"productoId": P("Soda de 500 ml"), "cantidad": 2}, {"productoId": P("Porción de papas"), "cantidad": 1}]}, t_maria)
bien("POST", "/api/pedidos", {"etiqueta": "Mesa 5", "nota": "", "items": [{"productoId": P("Buffalo simple"), "cantidad": 1}, {"productoId": P("Cheeseflama doble"), "cantidad": 1}, {"productoId": P("Soda mini"), "cantidad": 2}]}, t_maria)
bien("POST", "/api/pedidos", {"etiqueta": "Carlos (para llevar)", "nota": "empacar aparte", "items": [{"productoId": P("Crunchy simple"), "cantidad": 3}, {"productoId": P("Salsa extra"), "cantidad": 2}]}, t_carlos)
bien("POST", "/api/ventas", {"items": [{"productoId": P("Smash simple"), "cantidad": 1}, {"productoId": P("Soda de 500 ml"), "cantidad": 1}], "pagos": [{"metodo": "Qr", "monto": 33}], "etiqueta": "Mostrador"}, t_caja)
print("  3 pedidos abiertos (Mesa 2, Mesa 5, Carlos) y 1 venta por entregar (Mostrador)")

print("== Mesas con QR y un pedido de cliente por aceptar")
mesas = {}
for i in range(1, 9):
    mesas[i] = bien("POST", "/api/mesas", {"nombre": f"Mesa {i}", "activa": True}, tok)
# el cliente escanea el QR de su mesa, escribe su nombre y ya puede pedir (sin avisar a nadie)
cliente7 = {"X-Cliente-Id": "cliente-demo-0123456789abcdef"}
bien("POST", f"/api/publico/mesa/{mesas[7]['token']}/entrar", {"nombre": "Lucía"}, cabeceras=cliente7)
bien("POST", f"/api/publico/mesa/{mesas[7]['token']}/pedidos",
     {"nota": "sin picante", "items": [{"productoId": P("Americana doble"), "cantidad": 1}, {"productoId": P("Porción de papas"), "cantidad": 1}, {"productoId": P("Soda mini"), "cantidad": 2}]},
     cabeceras=cliente7)
bien("POST", f"/api/publico/mesa/{mesas[4]['token']}/entrar", {"nombre": "Marco"}, cabeceras={"X-Cliente-Id": "cliente-demo-marco-0123456789"})
print("  8 mesas (Mesa 1 a Mesa 8); Lucía ya está en la Mesa 7 con un pedido por aceptar y Marco en la Mesa 4 (entraron solos al escanear el QR)")

print("\nListo. Entradas:  Admin 1234 · Caja 1 1111 · María 2222 · Carlos 3333")


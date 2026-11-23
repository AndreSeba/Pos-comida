"""Prueba de punta a punta de la API real (contra Postgres). Uso: python prueba_api.py http://localhost:5080"""
import base64, json, struct, sys, urllib.error, urllib.request, zlib

sys.stdout.reconfigure(encoding="utf-8")
BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:5080"
resultados = []


def req(metodo, ruta, cuerpo=None, token=None, cabeceras=None, sin_nombre=False):
    # el nombre es obligatorio al pedir desde la mesa: las pruebas lo agregan solas (Beto para el celular B, Ana para los demás)
    if (isinstance(cuerpo, dict) and "/api/publico/mesa/" in ruta and "/pedidos" in ruta and metodo in ("POST", "PUT")
            and "nombre" not in cuerpo and not sin_nombre):
        cuerpo = dict(cuerpo, nombre="Beto" if (cabeceras or {}).get("X-Cliente-Id", "").startswith("cliente-b-") else "Ana")
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    r = urllib.request.Request(BASE + ruta, data=datos, method=metodo)
    if datos is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    for k, v in (cabeceras or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            crudo = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            cuerpo_resp = json.loads(crudo) if "json" in ctype and crudo else crudo
            return resp.status, cuerpo_resp, resp.headers
    except urllib.error.HTTPError as e:
        crudo = e.read()
        try:
            return e.code, json.loads(crudo), e.headers
        except Exception:
            return e.code, crudo, e.headers


def ok(nombre, condicion, detalle=""):
    resultados.append((nombre, bool(condicion), detalle))
    print(("  OK   " if condicion else "  FALLA") + " " + nombre + ("" if condicion or not detalle else f"  -> {detalle}"))


def png_data_url(r, g, b):
    def trozo(tipo, d):
        c = struct.pack(">I", len(d)) + tipo + d
        return c + struct.pack(">I", zlib.crc32(tipo + d) & 0xFFFFFFFF)
    fila = b"\x00" + bytes([r, g, b]) * 8
    crudo = fila * 8
    png = b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + trozo(b"IDAT", zlib.compress(crudo)) + trozo(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()


print("== Acceso")
s, usuarios, _ = req("GET", "/api/auth/usuarios")
ok("lista de usuarios pública", s == 200 and any(u["admin"] for u in usuarios), s)
admin_id = next(u["id"] for u in usuarios if u["admin"])
s, _, _ = req("POST", "/api/auth/login", {"usuarioId": admin_id, "pin": "9999"})
ok("PIN incorrecto da 401", s == 401, s)
s, login, _ = req("POST", "/api/auth/login", {"usuarioId": admin_id, "pin": "1234"})
ok("login admin", s == 200 and login.get("rol") == "Administrador" and "panel.admin" in login["permisos"], s)
tok = login["token"]
s, roles0, _ = req("GET", "/api/roles", token=tok)
ROL = {x["nombre"]: x["id"] for x in roles0}
s, _, _ = req("GET", "/api/ingredientes")
ok("sin token da 401", s == 401, s)

print("== Configuración y catálogo")
s, cfg, _ = req("GET", "/api/config", token=tok)
ok("config con color de marca por defecto", s == 200 and cfg["colorMarca"] == "#D9481C" and cfg["cartaPublicada"] is False, cfg)
s, pub, _ = req("GET", "/api/config/publica")
ok("config pública sin whatsapp ni datos internos", s == 200 and set(pub.keys()) == {"negocio", "moneda", "colorMarca", "logo"}, pub)
s, ings, _ = req("GET", "/api/ingredientes", token=tok)
ok("ingredientes de ejemplo", s == 200 and len(ings) >= 5, s)
s, prods, _ = req("GET", "/api/productos", token=tok)
ok("productos con costo calculado", s == 200 and all("costo" in p for p in prods) and any(p["costo"] > 0 for p in prods), s)
burger = next(p for p in prods if "clásica" in p["nombre"])
ok("costo hamburguesa clásica = 13.58 (ingredientes 12.08 + otros 1.50)", abs(burger["costo"] - 13.58) < 0.01, burger["costo"])

print("== Personas y permisos")
s, nuevo, _ = req("POST", "/api/usuarios", {"nombre": "Caja Prueba", "rolId": ROL["Ventas"], "pin": "4321", "activo": True}, tok)
ok("crear vendedor", s == 200 and nuevo["rol"] == "Ventas", (s, nuevo))
s, _, _ = req("POST", "/api/usuarios", {"nombre": "Caja Prueba", "rolId": ROL["Ventas"], "pin": "4321", "activo": True}, tok)
ok("nombre repetido da 409", s == 409, s)
s, lv, _ = req("POST", "/api/auth/login", {"usuarioId": nuevo["id"], "pin": "4321"})
ok("login vendedor", s == 200 and lv["rol"] == "Ventas", s)
tv = lv["token"]
s, _, _ = req("GET", "/api/ingredientes", token=tv)
ok("vendedor no ve ingredientes (403)", s == 403, s)
s, menu, _ = req("GET", "/api/productos/menu", token=tv)
ok("vendedor ve el menú sin costos", s == 200 and all("costo" not in p and "receta" not in p for p in menu), menu[:1])

print("== Ventas y pago mixto")
item = [{"productoId": burger["id"], "cantidad": 2}]
total = burger["precio"] * 2
s, v1, _ = req("POST", "/api/ventas", {"items": item, "pagos": [{"metodo": "Efectivo", "monto": total}], "nota": "prueba"}, tv)
ok("venta en efectivo", s == 200 and v1["metodo"] == "Efectivo" and abs(v1["total"] - total) < 0.01, (s, v1))
s, e, _ = req("POST", "/api/ventas", {"items": item, "pagos": [{"metodo": "Efectivo", "monto": 10}, {"metodo": "Qr", "monto": 10}]}, tv)
ok("pagos que no suman el total dan 400", s == 400, (s, e))
s, v2, _ = req("POST", "/api/ventas", {"items": item, "pagos": [{"metodo": "Efectivo", "monto": total - 14}, {"metodo": "Qr", "monto": 14}]}, tv)
ok("pago mixto efectivo + QR", s == 200 and v2["metodo"] == "Mixto" and len(v2["pagos"]) == 2, (s, v2))
s, e, _ = req("POST", "/api/ventas", {"items": [{"productoId": 999999, "cantidad": 1}], "pagos": [{"metodo": "Efectivo", "monto": 1}]}, tv)
ok("producto inexistente da 409", s == 409, (s, e))
s, e, _ = req("POST", "/api/ventas", {"items": item, "pagos": [{"metodo": "Cripto", "monto": total}]}, tv)
ok("método inválido da 400", s == 400, s)
s, turno, _ = req("GET", "/api/ventas/turno?desde=2000-01-01T00:00:00Z", token=tv)
ok("turno del vendedor", s == 200 and turno["cantidad"] == 2 and abs(turno["total"] - total * 2) < 0.01, turno if s != 200 else (turno["cantidad"], turno["total"]))
s, hist, _ = req("GET", "/api/ventas?limite=50", token=tok)
ok("historial admin con costo y pagos", s == 200 and hist and "costo" in hist[0] and "pagos" in hist[0], s)

print("== Reportes")
s, res, _ = req("GET", "/api/reportes/resumen?desde=2000-01-01T00:00:00Z&hasta=2100-01-01T00:00:00Z&offsetMinutos=-240", token=tok)
ok("resumen de ventas", s == 200 and abs(res["ventas"] - total * 2) < 0.01 and res["pedidos"] == 2, res)
ok("el mixto reparte por método (QR 14, efectivo resto)", abs(res["qr"] - 14) < 0.01 and abs(res["efectivo"] - (total + total - 14)) < 0.01, (res["efectivo"], res["qr"]))
ok("costo congelado de lo vendido", abs(res["costo"] - burger["costo"] * 4) < 0.05, res["costo"])
s, _, _ = req("PUT", f"/api/ventas/{v1['id']}/anulada", True, tok)
s2, res2, _ = req("GET", "/api/reportes/resumen?desde=2000-01-01T00:00:00Z&hasta=2100-01-01T00:00:00Z&offsetMinutos=-240", token=tok)
ok("anular una venta la saca del resumen", s == 204 and res2["pedidos"] == 1, (s, res2["pedidos"]))

print("== Gastos")
s, g, _ = req("POST", "/api/gastos", {"fecha": "2026-11-17T12:00:00Z", "concepto": "Gas", "categoria": "Servicios", "monto": 55.5}, tok)
ok("crear gasto", s == 200 and g["monto"] == 55.5, s)
s, _, _ = req("POST", "/api/gastos", {"fecha": "2026-11-17T12:00:00Z", "concepto": "", "categoria": "x", "monto": 5}, tok)
ok("gasto sin concepto da 400", s == 400, s)
s, lg, _ = req("GET", "/api/gastos", token=tok)
ok("listar gastos", s == 200 and len(lg) >= 1, s)

print("== Imágenes de producto")
img1, img2 = png_data_url(220, 60, 20), png_data_url(30, 120, 220)
cuerpo = {"nombre": "Pizza prueba", "categoria": "Pizzas", "icono": "pizza", "porciones": 1, "otros": 0, "margenObjetivo": 60, "precio": 30, "activo": True,
          "receta": [], "descripcion": "Con extra queso", "enCarta": True, "imagenes": [{"datos": img1}, {"datos": img2}]}
s, p, _ = req("POST", "/api/productos", cuerpo, tok)
ok("crear producto con 2 imágenes", s == 200 and len(p["imagenes"]) == 2, (s, p if s != 200 else len(p["imagenes"])))
ids = [i["id"] for i in p["imagenes"]]
s, datos, h = req("GET", p["imagenes"][0]["url"])
ok("imagen pública se sirve como PNG con caché larga", s == 200 and datos[:4] == b"\x89PNG" and "immutable" in (h.get("Cache-Control") or ""), (s, h.get("Content-Type"), h.get("Cache-Control")))
cuerpo2 = dict(cuerpo, imagenes=[{"id": ids[1]}, {"id": ids[0]}])
s, p2, _ = req("PUT", f"/api/productos/{p['id']}", cuerpo2, tok)
ok("reordenar imágenes", s == 200 and [i["id"] for i in p2["imagenes"]] == [ids[1], ids[0]], (s, p2))
cuerpo3 = dict(cuerpo, imagenes=[{"id": ids[1]}, {"datos": png_data_url(10, 200, 10)}])
s, p3, _ = req("PUT", f"/api/productos/{p['id']}", cuerpo3, tok)
ok("quitar una y agregar otra", s == 200 and len(p3["imagenes"]) == 2 and ids[0] not in [i["id"] for i in p3["imagenes"]], (s, p3))
s, _, _ = req("GET", f"/api/publico/imagenes/{ids[0]}")
ok("la imagen quitada ya no existe (404)", s == 404, s)
cuerpo4 = dict(cuerpo, imagenes=None)
s, p4, _ = req("PUT", f"/api/productos/{p['id']}", cuerpo4, tok)
ok("imagenes = null no toca las imágenes", s == 200 and len(p4["imagenes"]) == 2, (s, p4))
s, e, _ = req("PUT", f"/api/productos/{p['id']}", dict(cuerpo, imagenes=[{"id": 999999}]), tok)
ok("id de imagen ajeno da 409", s == 409, (s, e))
s, e, _ = req("PUT", f"/api/productos/{p['id']}", dict(cuerpo, imagenes=[{"datos": "data:text/html;base64,PGI+"}]), tok)
ok("tipo de imagen inválido da 400", s == 400, (s, e))
s, e, _ = req("PUT", f"/api/productos/{p['id']}", dict(cuerpo, imagenes=[{"datos": img1}] * 7), tok)
ok("más de 6 imágenes da 400", s == 400, (s, e))
s, menu2, _ = req("GET", "/api/productos/menu", token=tv)
pizza = next(x for x in menu2 if x["nombre"] == "Pizza prueba")
ok("el menú de ventas trae la portada", s == 200 and pizza["fotoUrl"], pizza)

print("== Personalización y carta pública")
s, _, _ = req("GET", "/api/publico/carta")
ok("carta no publicada da 404", s == 404, s)
base = {"negocio": "Burger Demo", "moneda": "Bs", "colorMarca": "#1D5FD1", "logo": img1, "descripcion": "Hamburguesas", "whatsapp": "71234567",
        "cartaPublicada": True, "mostrarPrecios": True, "pedidosWhatsapp": True}
s, c, _ = req("PUT", "/api/config", base, tok)
ok("guardar color, logo, WhatsApp y publicar", s == 200 and c["whatsapp"] == "59171234567" and c["cartaPublicada"], (s, c if s != 200 else c["whatsapp"]))
s, e, _ = req("PUT", "/api/config", dict(base, colorMarca="rojo"), tok)
ok("color inválido da 400", s == 400, (s, e))
s, e, _ = req("PUT", "/api/config", dict(base, logo="data:text/html;base64,PGI+"), tok)
ok("logo que no es imagen da 400", s == 400, (s, e))
s, e, _ = req("PUT", "/api/config", dict(base, whatsapp="123"), tok)
ok("WhatsApp inválido da 400", s == 400, (s, e))
s, e, _ = req("PUT", "/api/config", dict(base, whatsapp=""), tok)
ok("pedidos por WhatsApp sin número da 400", s == 400, (s, e))
s, e, _ = req("PUT", "/api/config", base, tv)
ok("el vendedor no puede cambiar la config (403)", s == 403, s)
s, carta, _ = req("GET", "/api/publico/carta")
ok("carta publicada con categorías", s == 200 and carta["pedidosWhatsapp"] and len(carta["categorias"]) >= 2, s)
txt = json.dumps(carta)
ok("la carta no expone costos, recetas ni márgenes", not any(k in txt for k in ["costo", "receta", "margen", "porciones", "otros"]), "")
pizza_c = next(p for c in carta["categorias"] for p in c["productos"] if p["nombre"] == "Pizza prueba")
ok("la carta lleva las imágenes del producto", len(pizza_c["imagenes"]) == 2, pizza_c)
s, _, _ = req("PUT", "/api/config", dict(base, mostrarPrecios=False), tok)
s, carta2, _ = req("GET", "/api/publico/carta")
ok("sin 'mostrar precios' la carta no manda precios", all(p["precio"] is None for c in carta2["categorias"] for p in c["productos"]), "")
s, pf, _ = req("PUT", f"/api/productos/{burger['id']}", {"nombre": burger["nombre"], "categoria": burger["categoria"], "icono": burger["icono"], "porciones": 1, "otros": burger["otros"],
                                                         "margenObjetivo": burger["margenObjetivo"], "precio": burger["precio"], "activo": True, "receta": burger["receta"],
                                                         "descripcion": "", "enCarta": False}, tok)
s, carta3, _ = req("GET", "/api/publico/carta")
nombres = [p["nombre"] for c in carta3["categorias"] for p in c["productos"]]
ok("un producto con 'en carta' apagado no aparece", burger["nombre"] not in nombres, nombres)
s, pu, _ = req("GET", "/api/config/publica")
ok("la config pública trae color y logo para el login", pu["colorMarca"] == "#1D5FD1" and pu["logo"], pu["colorMarca"])

print("== Borrado")
s, _, _ = req("DELETE", f"/api/productos/{p['id']}", token=tok)
ok("borrar producto con imágenes", s == 204, s)
s, _, _ = req("GET", f"/api/publico/imagenes/{ids[1]}")
ok("sus imágenes se borran en cascada", s == 404, s)
s, hist2, _ = req("GET", "/api/ventas?limite=50", token=tok)
ok("el historial de ventas sigue intacto", s == 200 and len(hist2) >= 2, s)

print("== Pedidos abiertos, mesero y caja")
s, e, _ = req("GET", "/api/pedidos", token=tok)
ok("con los pedidos abiertos desactivados da 409", s == 409, (s, e))
flujos = dict(base, cartaPublicada=False, pedidosAbiertos=True, seguimientoEntrega=True)
s, c2, _ = req("PUT", "/api/config", flujos, tok)
ok("activar pedidos abiertos y seguimiento de entrega", s == 200 and c2["pedidosAbiertos"] and c2["seguimientoEntrega"], (s, c2))
s, mes, _ = req("POST", "/api/usuarios", {"nombre": "Mesero Prueba", "rolId": ROL["Mesero"], "pin": "2468", "activo": True}, tok)
ok("crear un mesero", s == 200 and mes["rol"] == "Mesero", (s, mes))
s, lm, _ = req("POST", "/api/auth/login", {"usuarioId": mes["id"], "pin": "2468"})
tm = lm["token"]
ok("login del mesero", s == 200 and lm["rol"] == "Mesero", s)
papas = next(p for p in prods if "Papas" in p["nombre"])
gaseosa = next(p for p in prods if p["nombre"] == "Gaseosa")
s, _, _ = req("POST", "/api/ventas", {"items": [{"productoId": papas["id"], "cantidad": 1}], "pagos": [{"metodo": "Efectivo", "monto": papas["precio"]}]}, tm)
ok("el mesero no puede cobrar directo (403)", s == 403, s)
s, _, _ = req("GET", "/api/ventas/turno?desde=2000-01-01T00:00:00Z", token=tm)
ok("el mesero no ve el turno (403)", s == 403, s)
s, _, _ = req("GET", "/api/reportes/resumen?desde=2000-01-01T00:00:00Z&hasta=2100-01-01T00:00:00Z&offsetMinutos=0", token=tm)
ok("el mesero no ve reportes (403)", s == 403, s)
s, _, _ = req("GET", "/api/productos/menu", token=tm)
ok("el mesero ve el menú", s == 200, s)

s, ped1, _ = req("POST", "/api/pedidos", {"etiqueta": "Mesa 3", "nota": "sin cebolla", "items": [{"productoId": papas["id"], "cantidad": 2}]}, tm)
ok("el mesero crea un pedido abierto", s == 200 and ped1["numero"] == 1 and ped1["estado"] == "Abierto" and ped1["mesero"] == "Mesero Prueba", (s, ped1))
ok("el total estimado sale de los precios actuales", abs(ped1["total"] - papas["precio"] * 2) < 0.01, ped1["total"])
s, ped2, _ = req("POST", "/api/pedidos", {"etiqueta": "Juan", "items": [{"productoId": gaseosa["id"], "cantidad": 1}]}, tm)
ok("el número del día es correlativo", s == 200 and ped2["numero"] == 2, (s, ped2))
s, e, _ = req("POST", "/api/pedidos", {"etiqueta": "x", "items": []}, tm)
ok("pedido vacío da 400", s == 400, (s, e))
s, e, _ = req("POST", "/api/pedidos", {"etiqueta": "x", "items": [{"productoId": 999999, "cantidad": 1}]}, tm)
ok("producto inexistente en el pedido da 409", s == 409, (s, e))
s, abiertos, _ = req("GET", "/api/pedidos", token=tm)
ok("lista de pedidos abiertos", s == 200 and {p["id"] for p in abiertos} >= {ped1["id"], ped2["id"]}, s)
s, ped1b, _ = req("PUT", f"/api/pedidos/{ped1['id']}", {"etiqueta": "Mesa 3", "nota": "sin cebolla", "items": [{"productoId": papas["id"], "cantidad": 2}, {"productoId": gaseosa["id"], "cantidad": 2}]}, tm)
ok("agregar cosas a un pedido abierto", s == 200 and len(ped1b["items"]) == 2 and abs(ped1b["total"] - (papas["precio"] * 2 + gaseosa["precio"] * 2)) < 0.01, (s, ped1b))
s, _, _ = req("POST", f"/api/pedidos/{ped1['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": ped1b["total"]}]}, tm)
ok("el mesero no puede cobrar un pedido (403)", s == 403, s)

total1 = ped1b["total"]
s, e, _ = req("POST", f"/api/pedidos/{ped1['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": 1}]}, tv)
ok("cobrar con pagos que no suman da 400", s == 400, (s, e))
s, abiertos2, _ = req("GET", "/api/pedidos", token=tv)
ok("el pedido sigue abierto tras un cobro fallido", any(p["id"] == ped1["id"] for p in abiertos2), "")
s, venta_p, _ = req("POST", f"/api/pedidos/{ped1['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": total1 - 10}, {"metodo": "Tarjeta", "monto": 10}], "nota": "propina aparte"}, tv)
ok("la caja cobra el pedido con pago mixto", s == 200 and venta_p["metodo"] == "Mixto" and abs(venta_p["total"] - total1) < 0.01, (s, venta_p))
ok("la venta conserva la mesa y la nota del pedido", venta_p["etiqueta"] == "Mesa 3" and "sin cebolla" in venta_p["nota"] and "propina aparte" in venta_p["nota"], venta_p)
ok("con seguimiento de entrega la venta queda por entregar", venta_p["entregado"] is False, venta_p)
s, e, _ = req("POST", f"/api/pedidos/{ped1['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": total1}]}, tok)
ok("cobrar dos veces el mismo pedido da 409", s == 409, (s, e))
s, e, _ = req("PUT", f"/api/pedidos/{ped1['id']}", {"etiqueta": "x", "items": [{"productoId": papas["id"], "cantidad": 1}]}, tm)
ok("no se edita un pedido ya cobrado (409)", s == 409, (s, e))
s, abiertos3, _ = req("GET", "/api/pedidos", token=tm)
ok("un pedido cobrado sale de los abiertos", all(p["id"] != ped1["id"] for p in abiertos3), "")

print("== Carrera: varias cajas cobran el mismo pedido a la vez")
import threading
s, pr, _ = req("POST", "/api/pedidos", {"etiqueta": "Carrera", "items": [{"productoId": gaseosa["id"], "cantidad": 1}]}, tm)
codigos = []
def cobrar_hilo():
    codigos.append(req("POST", f"/api/pedidos/{pr['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": gaseosa["precio"]}]}, tv)[0])
hilos = [threading.Thread(target=cobrar_hilo) for _ in range(6)]
for h in hilos:
    h.start()
for h in hilos:
    h.join()
ok("seis cobros simultáneos del mismo pedido: solo uno lo logra", sorted(codigos) == [200, 409, 409, 409, 409, 409], sorted(codigos))
s, todas, _ = req("GET", "/api/ventas?limite=500", token=tok)
ok("y solo se registró una venta", sum(1 for v in todas if v["etiqueta"] == "Carrera") == 1, sum(1 for v in todas if v["etiqueta"] == "Carrera"))

print("== Entrega")
s, pe, _ = req("GET", "/api/ventas/por-entregar", token=tm)
ok("la venta aparece por entregar (el mesero la ve)", s == 200 and any(v["id"] == venta_p["id"] for v in pe), s)
s, _, _ = req("PUT", f"/api/ventas/{venta_p['id']}/entregada", token=tm)
ok("el mesero marca la venta como entregada", s == 204, s)
s, pe2, _ = req("GET", "/api/ventas/por-entregar", token=tm)
ok("ya no está por entregar", all(v["id"] != venta_p["id"] for v in pe2), "")
s, vd, _ = req("POST", "/api/ventas", {"items": [{"productoId": papas["id"], "cantidad": 1}], "pagos": [{"metodo": "Qr", "monto": papas["precio"]}], "etiqueta": "Barra"}, tv)
ok("una venta directa con etiqueta también queda por entregar", s == 200 and vd["entregado"] is False and vd["etiqueta"] == "Barra", (s, vd))
s, _, _ = req("PUT", f"/api/ventas/{vd['id']}/entregada", token=tv)
ok("la caja también puede marcarla entregada", s == 204, s)

print("== Cancelar y casos límite")
s, _, _ = req("DELETE", f"/api/pedidos/{ped2['id']}", token=tm)
ok("cancelar un pedido abierto", s == 204, s)
s, e, _ = req("DELETE", f"/api/pedidos/{ped2['id']}", token=tm)
ok("cancelarlo otra vez da 409", s == 409, (s, e))
s, e, _ = req("DELETE", "/api/pedidos/999999", token=tm)
ok("cancelar un pedido inexistente da 404", s == 404, (s, e))
temp = dict(cuerpo, nombre="Producto temporal", imagenes=None)
s, pt, _ = req("POST", "/api/productos", temp, tok)
s, ped3, _ = req("POST", "/api/pedidos", {"etiqueta": "Mesa 9", "items": [{"productoId": pt["id"], "cantidad": 1}]}, tm)
s, e, _ = req("DELETE", f"/api/productos/{pt['id']}", token=tok)
ok("no se borra un producto que está en un pedido abierto (409)", s == 409, (s, e))
s, _, _ = req("PUT", f"/api/productos/{pt['id']}", dict(temp, activo=False), tok)
s, ab4, _ = req("GET", "/api/pedidos", token=tv)
p3 = next(p for p in ab4 if p["id"] == ped3["id"])
ok("un producto desactivado se marca no disponible en el pedido", p3["items"][0]["disponible"] is False and p3["total"] == 0, p3)
s, e, _ = req("POST", f"/api/pedidos/{ped3['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": 1}]}, tv)
ok("cobrar un pedido con producto no disponible da 409 y sigue abierto", s == 409, (s, e))
req("DELETE", f"/api/pedidos/{ped3['id']}", token=tm)
s, _, _ = req("DELETE", f"/api/productos/{pt['id']}", token=tok)
ok("sin pedidos abiertos el producto se puede borrar", s == 204, s)
s, c3, _ = req("PUT", "/api/config", dict(flujos, seguimientoEntrega=False), tok)
s, vn, _ = req("POST", "/api/ventas", {"items": [{"productoId": papas["id"], "cantidad": 1}], "pagos": [{"metodo": "Efectivo", "monto": papas["precio"]}]}, tv)
ok("sin seguimiento de entrega la venta nace entregada", s == 200 and vn["entregado"] is True, (s, vn))
s, _, _ = req("PUT", "/api/config", dict(flujos, pedidosAbiertos=False), tok)
s, e, _ = req("POST", "/api/pedidos", {"etiqueta": "x", "items": [{"productoId": papas["id"], "cantidad": 1}]}, tm)
ok("al apagar los pedidos abiertos el mesero ya no puede crearlos (409)", s == 409, (s, e))

print("== Inventario: stock, compras, ajustes y descuento automático")
s, ing = req("POST", "/api/ingredientes", {"nombre": "Harina prueba", "unidad": "g", "cantidad": 1000, "precio": 10, "stock": 5000, "stockMinimo": 1000}, tok)[0:2]
ok("crear insumo con stock inicial y mínimo", s == 200 and ing["stock"] == 5000 and ing["stockMinimo"] == 1000, (s, ing))
s, movs, _ = req("GET", f"/api/inventario/movimientos?ingredienteId={ing['id']}", token=tok)
ok("el stock inicial queda en el historial", s == 200 and movs[0]["tipo"] == "Inicial" and movs[0]["saldo"] == 5000, movs)
cuerpo_pan = {"nombre": "Pan prueba", "categoria": "Panes", "icono": "plato", "porciones": 4, "otros": 0, "margenObjetivo": 60, "precio": 10, "activo": True,
              "receta": [{"ingredienteId": ing["id"], "cantidad": 400}], "descripcion": "", "enCarta": False, "imagenes": None}
s, pan, _ = req("POST", "/api/productos", cuerpo_pan, tok)
ok("producto con receta de 4 porciones (100 g c/u)", s == 200 and abs(pan["costo"] - 1.0) < 0.01, (s, pan.get("costo")))


def stock_de(i):
    return next(x["stock"] for x in req("GET", "/api/ingredientes", token=tok)[1] if x["id"] == i)


s, vi, _ = req("POST", "/api/ventas", {"items": [{"productoId": pan["id"], "cantidad": 3}], "pagos": [{"metodo": "Efectivo", "monto": 30}]}, tv)
ok("vender 3 unidades descuenta 300 g (por porción)", s == 200 and stock_de(ing["id"]) == 4700, stock_de(ing["id"]))
s, movs, _ = req("GET", f"/api/inventario/movimientos?ingredienteId={ing['id']}", token=tok)
ok("el movimiento de venta queda ligado a la venta", movs[0]["tipo"] == "Venta" and movs[0]["cantidad"] == -300 and movs[0]["ventaId"] == vi["id"] and movs[0]["saldo"] == 4700, movs[0])
req("PUT", f"/api/ventas/{vi['id']}/anulada", True, tok)
ok("anular la venta devuelve los insumos", stock_de(ing["id"]) == 5000, stock_de(ing["id"]))
req("PUT", f"/api/ventas/{vi['id']}/anulada", False, tok)
ok("restaurar la venta los vuelve a descontar", stock_de(ing["id"]) == 4700, stock_de(ing["id"]))
req("PUT", f"/api/ventas/{vi['id']}/anulada", True, tok)
req("PUT", f"/api/ventas/{vi['id']}/anulada", True, tok)
ok("anular dos veces no devuelve de más", stock_de(ing["id"]) == 5000, stock_de(ing["id"]))
req("PUT", f"/api/ventas/{vi['id']}/anulada", False, tok)

s, vg, _ = req("POST", "/api/ventas", {"items": [{"productoId": pan["id"], "cantidad": 60}], "pagos": [{"metodo": "Qr", "monto": 600}]}, tv)
ok("se puede vender más de lo que hay: el stock queda negativo", s == 200 and stock_de(ing["id"]) == 4700 - 6000, stock_de(ing["id"]))
s, compra, _ = req("POST", "/api/inventario/compras", {"proveedor": "Molino Sur", "nota": "se compró antes de anotarla", "actualizarCostos": True, "registrarGasto": True,
                                                       "items": [{"ingredienteId": ing["id"], "cantidad": 5000, "total": 100}]}, tok)
ok("registrar la compra después sube el stock (corrige el negativo)", s == 200 and compra["total"] == 100 and stock_de(ing["id"]) == 3700, (s, compra, stock_de(ing["id"])))
ing_act = next(x for x in req("GET", "/api/ingredientes", token=tok)[1] if x["id"] == ing["id"])
ok("la compra actualiza el costo del insumo (Bs 100 por 5000 g)", ing_act["precio"] == 100 and ing_act["cantidad"] == 5000, ing_act)
s, gs, _ = req("GET", "/api/gastos", token=tok)
ok("la compra se anota como gasto de Insumos", any(g["concepto"] == "Compra de insumos a Molino Sur" and g["monto"] == 100 and g["categoria"] == "Insumos" for g in gs), gs[:2])
s, aj, _ = req("POST", "/api/inventario/ajustes", {"ingredienteId": ing["id"], "stockReal": 4000, "motivo": "Conteo físico"}, tok)
ok("ajustar por conteo físico (hay 4000, el sistema decía 3700)", s == 200 and aj["stock"] == 4000, (s, aj))
s, movs, _ = req("GET", f"/api/inventario/movimientos?ingredienteId={ing['id']}", token=tok)
ok("el ajuste anota la diferencia y el motivo", movs[0]["tipo"] == "Ajuste" and movs[0]["cantidad"] == 300 and movs[0]["nota"] == "Conteo físico" and movs[0]["saldo"] == 4000, movs[0])
s, e, _ = req("POST", "/api/inventario/compras", {"proveedor": "x", "items": []}, tok)
ok("compra sin insumos da 400", s == 400, (s, e))
s, e, _ = req("POST", "/api/inventario/compras", {"items": [{"ingredienteId": ing["id"], "cantidad": 0, "total": 5}]}, tok)
ok("cantidad 0 da 400", s == 400, (s, e))
s, e, _ = req("POST", "/api/inventario/compras", {"items": [{"ingredienteId": 999999, "cantidad": 1, "total": 5}]}, tok)
ok("insumo inexistente da 400", s == 400, (s, e))
s, _, _ = req("GET", "/api/inventario/movimientos", token=tv)
ok("el vendedor no ve el inventario (403)", s == 403, s)
s, _, _ = req("PUT", "/api/config", dict(flujos, pedidosAbiertos=True, seguimientoEntrega=False), tok)
s, pi, _ = req("POST", "/api/pedidos", {"etiqueta": "Inv", "items": [{"productoId": pan["id"], "cantidad": 2}]}, tm)
s, vp, _ = req("POST", f"/api/pedidos/{pi['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": 20}]}, tv)
ok("cobrar un pedido abierto también descuenta insumos (2 unidades = 200 g)", s == 200 and stock_de(ing["id"]) == 3800, (s, stock_de(ing["id"])))
s, _, _ = req("DELETE", f"/api/ingredientes/{ing['id']}", token=tok)
ok("no se borra un insumo que está en una receta (409)", s == 409, s)

print("== Costo: calculado con la receta o anotado a mano")
s, ik, _ = req("POST", "/api/ingredientes", {"nombre": "Carne kilo", "unidad": "g", "cantidad": 1000, "precio": 40}, tok)
cuerpo_h = {"nombre": "Hamb costo", "categoria": "Prueba", "icono": "hamburguesa", "porciones": 1, "otros": 0, "margenObjetivo": 65, "precio": 20, "activo": True,
            "receta": [{"ingredienteId": ik["id"], "cantidad": 120}], "descripcion": "", "enCarta": False, "imagenes": None}
s, h, _ = req("POST", "/api/productos", cuerpo_h, tok)
ok("1 kg a Bs 40 y 120 g de carne -> costo calculado Bs 4.80", s == 200 and abs(h["costo"] - 4.8) < 0.001 and abs(h["costoCalculado"] - 4.8) < 0.001 and h["costoManual"] is None, h)
s, h2, _ = req("PUT", f"/api/productos/{h['id']}", dict(cuerpo_h, costoManual=6.5), tok)
ok("con costo manual manda el manual y se conserva la sugerencia", s == 200 and h2["costo"] == 6.5 and abs(h2["costoCalculado"] - 4.8) < 0.001 and h2["costoManual"] == 6.5, h2)
s, vh, _ = req("POST", "/api/ventas", {"items": [{"productoId": h["id"], "cantidad": 2}], "pagos": [{"metodo": "Efectivo", "monto": 40}]}, tv)
costo_v = next((x["costo"] for x in req("GET", "/api/ventas?limite=200", token=tok)[1] if x["id"] == vh["id"]), None)
ok("la venta congela el costo manual (2 x 6.50)", s == 200 and costo_v is not None and abs(costo_v - 13) < 0.001, costo_v)
s, e, _ = req("PUT", f"/api/productos/{h['id']}", dict(cuerpo_h, costoManual=-1), tok)
ok("costo manual negativo da 400", s == 400, (s, e))
s, h3, _ = req("PUT", f"/api/productos/{h['id']}", cuerpo_h, tok)
ok("sin costo manual vuelve al calculado", s == 200 and h3["costoManual"] is None and abs(h3["costo"] - 4.8) < 0.001, h3)

print("== Roles y permisos")
s, roles, _ = req("GET", "/api/roles", token=tok)
nombres = {r["nombre"]: r for r in roles}
ok("el sistema trae los roles Administrador, Ventas y Mesero", s == 200 and {"Administrador", "Ventas", "Mesero"} <= set(nombres) and all(nombres[n]["esSistema"] for n in ("Administrador", "Ventas", "Mesero")), list(nombres))
s, catalogo, _ = req("GET", "/api/roles/permisos", token=tok)
ok("el Administrador tiene todos los permisos del catálogo", len(nombres["Administrador"]["permisos"]) == len(catalogo) >= 18, (len(nombres["Administrador"]["permisos"]), len(catalogo)))
s, e, _ = req("PUT", f"/api/roles/{nombres['Administrador']['id']}", {"nombre": "Administrador", "descripcion": "", "activo": True, "permisos": ["ventas.cobrar"]}, tok)
ok("el rol Administrador no se puede editar (409)", s == 409, (s, e))
s, rc, _ = req("POST", "/api/roles", {"nombre": "Cocina", "descripcion": "Prepara y entrega", "activo": True, "permisos": ["entregas.marcar", "pedidos.tomar"]}, tok)
ok("crear un rol nuevo con permisos", s == 200 and sorted(rc["permisos"]) == ["entregas.marcar", "pedidos.tomar"] and not rc["esSistema"], (s, rc))
s, e, _ = req("POST", "/api/roles", {"nombre": "Cocina", "descripcion": "", "activo": True, "permisos": []}, tok)
ok("nombre de rol repetido da 409", s == 409, (s, e))
s, e, _ = req("POST", "/api/roles", {"nombre": "Raro", "descripcion": "", "activo": True, "permisos": ["no.existe"]}, tok)
ok("permiso inexistente da 400", s == 400, (s, e))
s, _, _ = req("POST", "/api/roles", {"nombre": "X", "descripcion": "", "activo": True, "permisos": []}, tv)
ok("el vendedor no puede crear roles (403)", s == 403, s)
s, coc, _ = req("POST", "/api/usuarios", {"nombre": "Cocinero", "rolId": rc["id"], "pin": "1357", "activo": True}, tok)
ok("crear una persona con el rol nuevo", s == 200 and coc["rol"] == "Cocina", (s, coc))
s, lc, _ = req("POST", "/api/auth/login", {"usuarioId": coc["id"], "pin": "1357"})
tcoc = lc["token"]
ok("el login trae los permisos del rol", s == 200 and sorted(lc["permisos"]) == ["entregas.marcar", "pedidos.tomar"] and lc["rol"] == "Cocina", lc.get("permisos"))
s, _, _ = req("GET", "/api/ventas/por-entregar", token=tcoc)
ok("puede lo que su rol permite", s == 200, s)
s, _, _ = req("GET", "/api/gastos", token=tcoc)
ok("y no lo que no permite (403)", s == 403, s)
s, e, _ = req("PUT", f"/api/roles/{rc['id']}", {"nombre": "Cocina", "descripcion": "x", "activo": False, "permisos": ["entregas.marcar"]}, tok)
ok("un rol con personas activas no se puede desactivar (409)", s == 409, (s, e))
s, rc2, _ = req("PUT", f"/api/roles/{rc['id']}", {"nombre": "Cocina", "descripcion": "Prepara", "activo": True, "permisos": ["pedidos.tomar"]}, tok)
ok("cambiar los permisos de un rol", s == 200 and rc2["permisos"] == ["pedidos.tomar"], (s, rc2))
s, _, _ = req("GET", "/api/ventas/por-entregar", token=tcoc)
ok("quien ya tenía sesión debe volver a entrar tras el cambio (401)", s == 401, s)
s, e, _ = req("PUT", f"/api/usuarios/{admin_id}", {"nombre": "Admin", "rolId": ROL["Ventas"], "pin": None, "activo": True}, tok)
ok("nadie se cambia su propio rol (400)", s == 400, (s, e))
s, lc2, _ = req("POST", "/api/auth/login", {"usuarioId": coc["id"], "pin": "1357"})
tcoc2 = lc2["token"]
req("PUT", f"/api/usuarios/{coc['id']}", {"nombre": "Cocinero", "rolId": rc["id"], "pin": None, "activo": False}, tok)
s, _, _ = req("GET", "/api/pedidos", token=tcoc2)
ok("al desactivar a una persona su sesión deja de servir (401)", s == 401, s)
s, usr, _ = req("GET", "/api/auth/usuarios")
ok("el login solo lista a las personas activas, separando a los administradores", all(u["nombre"] != "Cocinero" for u in usr) and any(u["admin"] for u in usr), usr)

print("== Auditoría")
s, aud, _ = req("GET", "/api/auditoria?limite=500", token=tok)
ok("la auditoría es solo para quien tiene el permiso (403 al vendedor)", s == 200 and req("GET", "/api/auditoria", token=tv)[0] == 403, s)
por = lambda ent, acc: [a for a in aud if a["entidad"] == ent and a["accion"] == acc]
ok("se anota cada ingreso y cada ingreso fallido", len(por("Sesion", "Ingreso")) >= 3 and len(por("Sesion", "IngresoFallido")) >= 1, (len(por("Sesion", "Ingreso")), len(por("Sesion", "IngresoFallido"))))
vc = por("Venta", "Crear")
ok("cada venta queda con quién la hizo y qué se vendió", vc and vc[0]["usuario"] and "items" in json.loads(vc[0]["valorNuevo"]) and vc[0]["valorAnterior"] is None, vc[:1])
va = por("Venta", "Anular")
ok("anular una venta guarda el antes y el después", va and json.loads(va[0]["valorAnterior"])["anulada"] is False and json.loads(va[0]["valorNuevo"])["anulada"] is True, va[:1])
ra = por("Rol", "Actualizar")
ok("cambiar un rol guarda sus permisos de antes y de después", ra and json.loads(ra[0]["valorAnterior"])["permisos"] == ["entregas.marcar", "pedidos.tomar"] and json.loads(ra[0]["valorNuevo"])["permisos"] == ["pedidos.tomar"], ra[:1])
ok("se auditan compras, ajustes, productos, ingredientes y pedidos", all([por("Compra", "Registrar"), por("Insumo", "Ajuste"), por("Producto", "Crear"), por("Ingrediente", "Crear"), por("Pedido", "Crear")]), "")
ok("el ajuste guarda el motivo", por("Insumo", "Ajuste")[0]["motivo"] == "Conteo físico", por("Insumo", "Ajuste")[0])
usuarios_aud = [a for a in aud if a["entidad"] == "Usuario"]
ok("la auditoría de personas nunca contiene el PIN", usuarios_aud and all("pin" not in (a["valorNuevo"] or "").lower() and "hash" not in (a["valorNuevo"] or "").lower() for a in usuarios_aud), "")
s, cat, _ = req("GET", "/api/auditoria/catalogo", token=tok)
ok("el catálogo lista solo lo que realmente hay", s == 200 and {"Venta", "Rol", "Sesion", "Producto"} <= set(cat["entidades"]) and "Anular" in cat["acciones"] and cat["usuarios"], cat["entidades"])
s, solo, _ = req("GET", "/api/auditoria?entidad=Rol", token=tok)
ok("filtrar por entidad", s == 200 and solo and all(a["entidad"] == "Rol" for a in solo), s)
s, solo2, _ = req("GET", f"/api/auditoria?usuarioId={admin_id}&accion=Crear", token=tok)
ok("filtrar por persona y acción", s == 200 and all(a["accion"] == "Crear" and a["usuarioId"] == admin_id for a in solo2), s)
s, fut, _ = req("GET", "/api/auditoria?desde=2100-01-01T00:00:00Z", token=tok)
ok("filtrar por fechas", s == 200 and fut == [], s)

print("== Pedidos desde la mesa (QR)")
s, _, _ = req("PUT", "/api/config", dict(base, cartaPublicada=False, pedidosAbiertos=True, seguimientoEntrega=True), tok)
ok("pedidos abiertos activos para esta sección", s == 200, s)
def nuevo_producto(nombre, precio):
    s, p, _ = req("POST", "/api/productos", {"nombre": nombre, "categoria": "Prueba mesa", "icono": "plato", "porciones": 1, "otros": 1, "margenObjetivo": 60,
                                              "precio": precio, "activo": True, "receta": [], "descripcion": "x", "enCarta": True}, tok)
    return p
papas, gaseosa, burger = nuevo_producto("Mesa Papas", 10), nuevo_producto("Mesa Gaseosa", 8), nuevo_producto("Mesa Burger", 24)
ok("productos de prueba para la mesa", all(p and p.get("id") for p in (papas, gaseosa, burger)), (papas, gaseosa, burger))

# --- administración de mesas
s, _, _ = req("GET", "/api/mesas")
ok("las mesas sin sesión dan 401", s == 401, s)
s, _, _ = req("GET", "/api/mesas", token=tm)
ok("el mesero no administra mesas (403)", s == 403, s)
s, ma, _ = req("POST", "/api/mesas", {"nombre": "Mesa 1", "activa": True}, tok)
ok("crear Mesa 1", s == 200 and ma["nombre"] == "Mesa 1" and len(ma["token"]) == 32, (s, ma))
s, mb, _ = req("POST", "/api/mesas", {"nombre": "Mesa 2", "activa": True}, tok)
ok("crear Mesa 2 con otro token", s == 200 and mb["token"] != ma["token"], (s, mb))
s, e, _ = req("POST", "/api/mesas", {"nombre": "mesa 1", "activa": True}, tok)
ok("nombre de mesa repetido (sin importar mayúsculas) da 409", s == 409, (s, e))
s, e, _ = req("POST", "/api/mesas", {"nombre": "  ", "activa": True}, tok)
ok("mesa sin nombre da 400", s == 400, (s, e))
TA, TB = ma["token"], mb["token"]
A = {"X-Cliente-Id": "cliente-a-" + "1" * 12}
B = {"X-Cliente-Id": "cliente-b-" + "2" * 12}
C = {"X-Cliente-Id": "cliente-c-" + "3" * 12}


def entrar(token, cab, nombre="Ana"):
    return req("POST", f"/api/publico/mesa/{token}/entrar", {"nombre": nombre}, cabeceras=cab)


def servicio(mesa_id):
    s_, est_, _ = req("GET", "/api/mesas-servicio", token=tm)
    return next(m for m in est_ if m["id"] == mesa_id)


# --- el QR fijo, por sí solo, no deja pedir: hace falta entrar a la sesión de la mesa
s, v0, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("mesa libre: el cliente ve «Entrar» y ni siquiera la carta", s == 200 and v0["estado"] == "Entrar" and v0["carta"] is None and v0["pedidos"] == [], v0)
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
ok("sin entrar no se puede pedir (409)", s == 409, (s, e))
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/entrar", {"nombre": "  "}, cabeceras=A)
ok("para entrar hay que escribir un nombre (400)", s == 400, (s, e))
s, _, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/abrir", {})
ok("abrir una mesa sin iniciar sesión da 401", s == 401, s)
s, ses1, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/abrir", {}, tm)
ok("el mesero abre la Mesa 1: queda la entrada abierta unos minutos", s == 200 and ses1["abierta"] and ses1["ingresoHasta"] and ses1["clientes"] == 0 and ses1["solicitudes"] == [], (s, ses1))
s, v1, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("solo mirar no deja entrar: sin escribir el nombre sigue sin carta", v1["estado"] == "Entrar" and v1["carta"] is None, v1)
s, va, _ = entrar(TA, A, "Ana")
ok("con la entrada abierta, escribir el nombre basta para entrar", s == 200 and va["estado"] == "Activa" and va["carta"], (s, va.get("estado") if va else va))
s, vb_, _ = entrar(TA, B, "Beto")
ok("otro celular de la misma mesa también entra solo", s == 200 and vb_["estado"] == "Activa", s)
s, vc_, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=C)
ok("un tercer celular que no entró no ve la carta", vc_["estado"] == "Entrar" and vc_["carta"] is None, vc_)
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=C)
ok("ni puede pedir (409)", s == 409, (s, e))
m1 = servicio(ma["id"])
ok("el personal ve la mesa abierta con 2 celulares", m1["abierta"] and m1["clientes"] == 2, m1)

# --- el enlace no se puede adivinar ni cambiar para llegar a otra mesa
for nombre, t in [("token corto", "mesa1"), ("número de mesa", "1"), ("token inventado", "A" * 32), ("token con un carácter cambiado", TA[:-1] + ("A" if TA[-1] != "A" else "B")),
                  ("token con caracteres raros", "..%2f..%2fapi" + "x" * 20)]:
    s, e, _ = req("GET", "/api/publico/mesa/" + t, cabeceras=A)
    ok(f"enlace inválido ({nombre}) da 404", s == 404, s)
s1, e1, _ = req("GET", "/api/publico/mesa/" + "A" * 32)
s2, e2, _ = req("GET", "/api/publico/mesa/short")
ok("un token inexistente y uno mal formado responden igual (no filtran información)", s1 == s2 == 404 and e1.get("detail") == e2.get("detail"), (e1, e2))

s, v, h = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
cat_productos = [p for c in v["carta"]["categorias"] for p in c["productos"]] if s == 200 else []
ok("el cliente ve su mesa y la carta con precios", s == 200 and v["mesa"] == "Mesa 1" and cat_productos and all(p["precio"] is not None for p in cat_productos), s)
ok("la respuesta de la mesa no se guarda en caché", "no-store" in (h.get("Cache-Control") or ""), h.get("Cache-Control"))
ok("la carta de la mesa no trae costos, recetas ni el token", s == 200 and not any(k in json.dumps(v) for k in ("costo", "receta", "token", ma["token"])), "")
ok("la carta de la mesa no trae el WhatsApp", v["carta"]["whatsapp"] is None, v["carta"]["whatsapp"])

# --- el nombre sale de la entrada (se puede cambiar al pedir, con un tope de largo)
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"nombre": "x" * 41, "items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
ok("un nombre de más de 40 letras al pedir da 400", s == 400, (s, e))

# --- hacer un pedido
pedido_req = {"nota": "sin cebolla", "items": [{"productoId": papas["id"], "cantidad": 2}, {"productoId": gaseosa["id"], "cantidad": 1}]}
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", pedido_req)
ok("sin identificar el celular da 400", s == 400, (s, e))
s, pa, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", dict(pedido_req, items=[dict(i, precio=0.01) for i in pedido_req["items"]]), cabeceras=A)
esperado = round(papas["precio"] * 2 + gaseosa["precio"], 2)
ok("el pedido guarda el nombre de quien lo hizo", pa.get("nombre") == "Ana", pa.get("nombre"))
ok("el cliente pide: queda por confirmar y el precio sale de la base de datos (no del cliente)", s == 200 and pa["estado"] == "PorConfirmar" and abs(pa["total"] - esperado) < 0.01, (s, pa))
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": []}, cabeceras=A)
ok("pedido vacío da 400", s == 400, (s, e))
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 21}]}, cabeceras=A)
ok("más de 20 unidades de un producto da 400", s == 400, (s, e))
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": -5}]}, cabeceras=A)
ok("cantidad negativa se ignora (queda vacío, 400)", s == 400, (s, e))
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": 999999, "cantidad": 1}]}, cabeceras=A)
ok("producto inexistente da 409", s == 409, (s, e))

# --- el personal lo ve, pero no se puede cobrar sin confirmar
s, abiertos, _ = req("GET", "/api/pedidos", token=tm)
visto = next((p for p in abiertos if p["id"] == pa["id"]), None) if s == 200 else None
ok("el personal ve el pedido de la mesa por confirmar, con el nombre del cliente", visto and visto["estado"] == "PorConfirmar" and visto["deMesa"] and visto["etiqueta"] == "Mesa 1" and visto["cliente"] == "Ana", visto)
s, e, _ = req("POST", f"/api/pedidos/{pa['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": esperado}], "nota": ""}, tok)
ok("no se puede cobrar un pedido por confirmar (409)", s == 409, (s, e))

# --- cada cliente solo ve y toca lo suyo; un pedido no se alcanza por otra mesa ni por otro celular
s, v_a, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
s, v_b, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=B)
s, v_sin, _ = req("GET", "/api/publico/mesa/" + TA)
s, v_m2, _ = req("GET", "/api/publico/mesa/" + TB, cabeceras=A)
ok("el cliente A ve su pedido", [p["id"] for p in v_a["pedidos"]] == [pa["id"]], v_a["pedidos"])
ok("otro celular en la misma mesa no ve el pedido de A", v_b["pedidos"] == [], v_b["pedidos"])
ok("sin código de celular tampoco se ve ningún pedido", v_sin["pedidos"] == [], v_sin["pedidos"])
ok("el mismo celular en OTRA mesa no ve el pedido", v_m2["pedidos"] == [], v_m2["pedidos"])
cambio = {"nota": "hackeado", "items": [{"productoId": burger["id"], "cantidad": 1}]}
s, _, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", cambio, cabeceras=B)
ok("otro celular no puede editar el pedido de A (404)", s == 404, s)
s, _, _ = req("DELETE", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", cabeceras=B)
ok("otro celular no puede cancelar el pedido de A (404)", s == 404, s)
s, _, _ = req("PUT", f"/api/publico/mesa/{TB}/pedidos/{pa['id']}", cambio, cabeceras=A)
ok("usando el enlace de OTRA mesa no se puede editar el pedido (409)", s == 409, s)
s, _, _ = req("DELETE", f"/api/publico/mesa/{TB}/pedidos/{pa['id']}", cabeceras=A)
ok("usando el enlace de OTRA mesa no se puede cancelar el pedido (409)", s == 409, s)
s, _, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/999999", cambio, cabeceras=A)
ok("un pedido que no existe responde igual que uno ajeno (404)", s == 404, s)
s, abiertos, _ = req("GET", "/api/pedidos", token=tm)
sigue = next(p for p in abiertos if p["id"] == pa["id"])
ok("los intentos ajenos no cambiaron nada", sigue["nota"] == "sin cebolla" and sum(i["cantidad"] for i in sigue["items"]) == 3, sigue)

# --- el cliente corrige su pedido mientras no lo acepten
s, pa2, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", {"nota": "sin cebolla ni picante", "items": [{"productoId": papas["id"], "cantidad": 1}, {"productoId": gaseosa["id"], "cantidad": 2}]}, cabeceras=A)
ok("el cliente edita su pedido por confirmar", s == 200 and pa2["estado"] == "PorConfirmar" and {i["productoId"]: i["cantidad"] for i in pa2["items"]} == {papas["id"]: 1, gaseosa["id"]: 2}, (s, pa2))

# --- se acaba una comida: el personal edita el pedido y avisa
s, sinstock, _ = req("POST", f"/api/pedidos/{pa['id']}/sin-stock/{gaseosa['id']}", {}, tm)
ok("el personal marca «sin stock»: quita el producto y deja un aviso", s == 200 and [i["productoId"] for i in sinstock["items"]] == [papas["id"]] and sinstock["aviso"] == "Sin stock: " + gaseosa["nombre"], (s, sinstock))
s, v_a, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
g = next(p for c in v_a["carta"]["categorias"] for p in c["productos"] if p["id"] == gaseosa["id"])
ok("el cliente ve el aviso y la comida marcada como agotada", v_a["pedidos"][0]["aviso"] == "Sin stock: " + gaseosa["nombre"] and g["agotado"] is True, (v_a["pedidos"][0]["aviso"], g["agotado"]))
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": gaseosa["id"], "cantidad": 1}]}, cabeceras=A)
ok("no se puede pedir lo agotado (409)", s == 409 and "Gaseosa" in e.get("detail", ""), (s, e))
s, e, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", {"items": [{"productoId": gaseosa["id"], "cantidad": 1}]}, cabeceras=A)
ok("tampoco al corregir el pedido (409)", s == 409, (s, e))
s, pa3, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", {"nota": "", "items": [{"productoId": papas["id"], "cantidad": 1}, {"productoId": burger["id"], "cantidad": 1}]}, cabeceras=A)
ok("el cliente cambia lo agotado por otra cosa y el aviso se limpia", s == 200 and pa3["aviso"] == "" and len(pa3["items"]) == 2, (s, pa3))
s, _, _ = req("PUT", f"/api/pedidos/productos/{gaseosa['id']}/agotado", {"agotado": False}, tm)
ok("el personal vuelve a marcar disponible la gaseosa", s == 204, s)
s, v_a, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("la gaseosa vuelve a poder pedirse", next(p for c in v_a["carta"]["categorias"] for p in c["productos"] if p["id"] == gaseosa["id"])["agotado"] is False, "")

s, pa_n, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", {"nombre": "Ana María", "items": [{"productoId": papas["id"], "cantidad": 1}, {"productoId": burger["id"], "cantidad": 1}]}, cabeceras=A)
ok("el cliente puede corregir también su nombre", s == 200 and pa_n["nombre"] == "Ana María", (s, pa_n))

# --- el personal acepta; ya no se puede cambiar desde el celular
s, conf, _ = req("POST", f"/api/pedidos/{pa['id']}/confirmar", {}, tm)
ok("el personal confirma el pedido", s == 200 and conf["estado"] == "Abierto" and conf["mesero"] == "Mesero Prueba", (s, conf))
s, e, _ = req("POST", f"/api/pedidos/{pa['id']}/confirmar", {}, tok)
ok("confirmarlo dos veces da 409", s == 409, (s, e))
s, e, _ = req("PUT", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", cambio, cabeceras=A)
ok("ya aceptado: el cliente no puede editarlo (409)", s == 409, (s, e))
s, e, _ = req("DELETE", f"/api/publico/mesa/{TA}/pedidos/{pa['id']}", cabeceras=A)
ok("ya aceptado: el cliente no puede cancelarlo (409)", s == 409, (s, e))
s, v_a, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("el cliente ve que su pedido fue aceptado", v_a["pedidos"][0]["estado"] == "Abierto", v_a["pedidos"][0]["estado"])

# --- un segundo pedido de la misma mesa se suma a la cuenta abierta
s, pb, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 2}]}, cabeceras=B)
ok("otro cliente de la misma mesa pide más", s == 200 and pb["estado"] == "PorConfirmar", (s, pb))
s, conf2, _ = req("POST", f"/api/pedidos/{pb['id']}/confirmar", {}, tm)
cant = {i["productoId"]: i["cantidad"] for i in conf2["items"]} if s == 200 else {}
ok("la cuenta de la mesa lleva los nombres de los dos clientes", s == 200 and {"Ana María", "Beto"} <= set(conf2["cliente"].split(", ")), conf2.get("cliente"))
ok("al confirmarlo se suma a la cuenta que la mesa ya tenía", s == 200 and conf2["id"] == pa["id"] and cant.get(papas["id"]) == 3 and cant.get(burger["id"]) == 1, (s, conf2))
s, abiertos, _ = req("GET", "/api/pedidos", token=tm)
de_mesa = [p for p in abiertos if p["deMesa"]]
ok("la mesa tiene una sola cuenta abierta para cobrar", len(de_mesa) == 1 and de_mesa[0]["id"] == pa["id"], de_mesa)
s, v_b, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=B)
ok("quien pidió lo ve como aceptado", v_b["pedidos"][0]["estado"] == "Unido", v_b["pedidos"][0]["estado"])
total_cuenta = de_mesa[0]["total"]
s, venta, _ = req("POST", f"/api/pedidos/{pa['id']}/cobrar", {"pagos": [{"metodo": "Efectivo", "monto": total_cuenta}], "nota": ""}, tok)
ok("la caja cobra la cuenta de la mesa y se descuenta el inventario como cualquier venta", s == 200 and abs(venta["total"] - total_cuenta) < 0.01 and venta["etiqueta"] == "Mesa 1", (s, venta))
s, v_a, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("al pagar la cuenta la sesión de la mesa termina sola: el cliente vuelve a «Entrar»", v_a["estado"] == "Entrar" and v_a["carta"] is None and v_a["pedidos"] == [], v_a)
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
ok("con el enlace de ayer ya no se puede pedir (409)", s == 409, (s, e))

# --- el caso del enlace viejo: la mesa se vuelve a abrir con gente nueva
s, ses2b, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/abrir", {}, tm)
ok("el personal vuelve a abrir la Mesa 1 para gente nueva", s == 200 and ses2b["abierta"] and ses2b["clientes"] == 0, (s, ses2b))
s, vv, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("el celular de la visita anterior NO sigue adentro: tiene que volver a entrar", vv["estado"] == "Entrar" and vv["carta"] is None and vv["pedidos"] == [], vv)
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
ok("con el QR y el celular de ayer no se puede pedir en la sesión nueva (409)", s == 409, (s, e))
s, vcn, _ = entrar(TA, C, "Carla")
ok("la gente nueva entra sola mientras la entrada está abierta", s == 200 and vcn["estado"] == "Activa", (s, vcn))

# --- lo normal (sin pedir permiso): escanear y escribir el nombre basta, sin avisar a nadie
s, _, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/cerrar", {}, tm)
s, vdir, _ = entrar(TA, A, "Ana")
ok("sin pedir permiso: escanear y escribir el nombre basta, sin avisar a nadie", s == 200 and vdir["estado"] == "Activa" and vdir["carta"], (s, vdir.get("estado") if vdir else vdir))
m1 = servicio(ma["id"])
ok("la mesa se abrió sola, con ese celular adentro y sin solicitudes", m1["abierta"] and m1["clientes"] == 1 and m1["solicitudes"] == [] and m1["ingresoHasta"] is None, m1)
s, _, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/cerrar", {}, tm)
import threading
resultados_dir = []
def entrar_hilo(i):
    resultados_dir.append(entrar(TA, {"X-Cliente-Id": f"cliente-h{i}-" + "7" * 12}, f"Hilo {i}")[0])
hilos = [threading.Thread(target=entrar_hilo, args=(i,)) for i in range(5)]
[h.start() for h in hilos]; [h.join() for h in hilos]
m1 = servicio(ma["id"])
ok("cinco celulares que escanean a la vez en una mesa libre quedan en una sola sesión", resultados_dir == [200] * 5 and m1["clientes"] == 5, (resultados_dir, m1["clientes"]))
s, _, _ = req("PUT", "/api/config", dict(base, cartaPublicada=False, pedidosAbiertos=True, seguimientoEntrega=True, ingresoMesaConPermiso=True), tok)
ok("el negocio puede exigir permiso del personal para entrar a las mesas", s == 200, s)

# --- fuera de la entrada abierta (o con la mesa libre) y con permiso exigido: pedir permiso
s, _, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/cerrar", {}, tm)
ok("el personal cierra la mesa", s == 200, s)
s, vs, _ = entrar(TA, A, "Ana")
ok("con la mesa libre, escribir el nombre deja una solicitud pendiente", s == 200 and vs["estado"] == "Pendiente" and vs["carta"] is None, (s, vs))
s, vs2, _ = entrar(TA, A, "Ana")
m1 = servicio(ma["id"])
ok("repetir la solicitud no la duplica", vs2["estado"] == "Pendiente" and len(m1["solicitudes"]) == 1 and m1["solicitudes"][0]["nombre"] == "Ana", m1["solicitudes"])
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
ok("mientras espera no puede pedir (409)", s == 409, (s, e))
s, _, _ = req("POST", f"/api/mesas-servicio/solicitudes/{m1['solicitudes'][0]['id']}/aceptar", {})
ok("aceptar una solicitud sin iniciar sesión da 401", s == 401, s)
s, acept, _ = req("POST", f"/api/mesas-servicio/solicitudes/{m1['solicitudes'][0]['id']}/aceptar", {}, tm)
ok("el personal acepta: la mesa se abre y el cliente queda adentro", s == 200 and acept["abierta"] and acept["clientes"] == 1 and acept["solicitudes"] == [] and acept["ingresoHasta"] is None, (s, acept))
s, vact, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("el cliente ve su carta sin hacer nada más", vact["estado"] == "Activa" and vact["carta"], vact["estado"])
s, e, _ = req("POST", f"/api/mesas-servicio/solicitudes/{m1['solicitudes'][0]['id']}/aceptar", {}, tm)
ok("aceptar dos veces la misma solicitud da 409", s == 409, (s, e))
s, vb2, _ = entrar(TA, B, "Beto")
ok("la entrada ya no está abierta: el siguiente celular pide permiso", vb2["estado"] == "Pendiente", vb2["estado"])
m1 = servicio(ma["id"])
s, rech, _ = req("POST", f"/api/mesas-servicio/solicitudes/{m1['solicitudes'][0]['id']}/rechazar", {}, tm)
ok("el personal puede rechazar una solicitud", s == 200 and rech["solicitudes"] == [] and rech["clientes"] == 1, (s, rech))
s, vr, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=B)
ok("el cliente rechazado lo ve", vr["estado"] == "Rechazada" and vr["carta"] is None, vr)
s, e, _ = entrar(TA, B, "Beto")
ok("y no puede insistir enseguida (409)", s == 409, (s, e))
s, abierta, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/permitir-ingreso", {}, tm)
ok("«dejar entrar» vuelve a abrir la entrada unos minutos", s == 200 and abierta["ingresoHasta"], (s, abierta))
s, vcc, _ = entrar(TA, C, "Carla")
ok("y quien llega en ese momento entra solo", vcc["estado"] == "Activa", vcc["estado"])
s, pend, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
s, _, _ = req("POST", f"/api/mesas-servicio/{ma['id']}/cerrar", {}, tm)
ok("el personal cierra la mesa con un pedido sin aceptar", s == 200, s)
s, abiertos, _ = req("GET", "/api/pedidos", token=tm)
ok("al cerrar la mesa se cancelan los pedidos que nadie aceptó", pend["id"] not in [p["id"] for p in abiertos], "")
s, e, _ = req("POST", f"/api/publico/mesa/{TA}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=A)
ok("con la mesa cerrada nadie puede pedir (409)", s == 409, (s, e))
# límite de solicitudes por mesa
for i in range(7):
    entrar(TA, {"X-Cliente-Id": f"cliente-x{i}-" + "9" * 12}, f"Curioso {i}")
ok("hay un tope de solicitudes esperando por mesa", len(servicio(ma["id"])["solicitudes"]) == 5, len(servicio(ma["id"])["solicitudes"]))
s, cfgback, _ = req("PUT", "/api/config", dict(base, cartaPublicada=False, pedidosAbiertos=True, seguimientoEntrega=True, ingresoMesaConPermiso=False), tok)
ok("y puede volver a dejar que entren solos", s == 200 and cfgback["ingresoMesaConPermiso"] is False, s)

# --- rechazar y quedarse sin productos
s, ses_b, _ = req("POST", f"/api/mesas-servicio/{mb['id']}/abrir", {}, tm)
s, _, _ = entrar(TB, B, "Beto")
s, pr, _ = req("POST", f"/api/publico/mesa/{TB}/pedidos", {"items": [{"productoId": burger["id"], "cantidad": 1}]}, cabeceras=B)
s, _, _ = req("POST", f"/api/pedidos/{pr['id']}/rechazar", {"motivo": "Cocina cerrada"}, tm)
ok("el personal rechaza un pedido con un motivo", s == 204, s)
s, v_b2, _ = req("GET", "/api/publico/mesa/" + TB, cabeceras=B)
ok("el cliente ve que fue rechazado y por qué", v_b2["pedidos"][0]["estado"] == "Cancelado" and v_b2["pedidos"][0]["aviso"] == "Cocina cerrada", v_b2["pedidos"][0])
s, pr2, _ = req("POST", f"/api/publico/mesa/{TB}/pedidos", {"items": [{"productoId": burger["id"], "cantidad": 1}]}, cabeceras=B)
s, vacio, _ = req("POST", f"/api/pedidos/{pr2['id']}/sin-stock/{burger['id']}", {}, tm)
ok("si «sin stock» deja el pedido vacío, se cancela", s == 200 and vacio["estado"] == "Cancelado" and vacio["items"] == [], (s, vacio))
req("PUT", f"/api/pedidos/productos/{burger['id']}/agotado", {"agotado": False}, tm)

# --- límites de pedidos esperando confirmación
creados = []
for i in range(4):
    s, p, _ = req("POST", f"/api/publico/mesa/{TB}/pedidos", {"items": [{"productoId": papas["id"], "cantidad": 1}]}, cabeceras=B)
    creados.append((s, p))
ok("un celular puede tener hasta 3 pedidos esperando confirmación", [c[0] for c in creados] == [200, 200, 200, 409], [c[0] for c in creados])
for s, p in creados:
    if s == 200:
        req("POST", f"/api/pedidos/{p['id']}/rechazar", {}, tm)

# --- mesa desactivada y QR nuevo
s, _, _ = req("PUT", f"/api/mesas/{mb['id']}", {"nombre": "Mesa 2", "activa": False}, tok)
s, _, _ = req("GET", "/api/publico/mesa/" + TB, cabeceras=B)
ok("una mesa desactivada deja de aceptar el QR (404)", s == 404, s)
s, _, _ = req("PUT", f"/api/mesas/{mb['id']}", {"nombre": "Mesa 2", "activa": True}, tok)
s, _, _ = req("GET", "/api/publico/mesa/" + TB, cabeceras=B)
ok("al reactivarla vuelve a servir", s == 200, s)
s, nueva, _ = req("POST", f"/api/mesas/{mb['id']}/nuevo-qr", {}, tok)
ok("se genera un QR nuevo con otro token", s == 200 and nueva["token"] != TB and len(nueva["token"]) == 32, (s, nueva))
s, _, _ = req("GET", "/api/publico/mesa/" + TB, cabeceras=B)
ok("el QR impreso anterior deja de servir (404)", s == 404, s)
s, _, _ = req("GET", "/api/publico/mesa/" + nueva["token"], cabeceras=B)
ok("el QR nuevo sirve", s == 200, s)
s, _, _ = req("PUT", "/api/config", dict(base, cartaPublicada=False, pedidosAbiertos=False), tok)
s, e, _ = req("GET", "/api/publico/mesa/" + TA, cabeceras=A)
ok("con los pedidos abiertos apagados la mesa avisa que no recibe pedidos (409)", s == 409, (s, e))
req("PUT", "/api/config", dict(base, cartaPublicada=False, pedidosAbiertos=True, seguimientoEntrega=True), tok)

# --- auditoría: queda lo que pasó, nunca el secreto del QR
s, aud, _ = req("GET", "/api/auditoria?limite=1000", token=tok)
texto = json.dumps(aud)
ok("la auditoría registra los pedidos del cliente con su mesa", any(a["entidad"] == "Pedido" and a["usuario"] == "Cliente · Mesa 1" for a in aud), "")
ok("la auditoría registra el QR nuevo", any(a["entidad"] == "Mesa" and a["accion"] == "Nuevo QR" for a in aud), "")
ok("la auditoría registra abrir, cerrar y quién entró o no a las mesas", {"Abrir", "Cerrar", "Dejar entrar", "Aceptar ingreso", "Rechazar ingreso"} <= {a["accion"] for a in aud if a["entidad"] == "Mesa"}, "")
ok("ningún token de QR aparece en la auditoría", TA not in texto and TB not in texto and nueva["token"] not in texto, "")
s, mesas_lista, _ = req("GET", "/api/mesas", token=tok)
ok("el administrador ve las mesas con su token para imprimir el QR", s == 200 and {m["nombre"] for m in mesas_lista} >= {"Mesa 1", "Mesa 2"} and all(len(m["token"]) == 32 for m in mesas_lista), s)

print()
fallas = [r for r in resultados if not r[1]]
print(f"{len(resultados) - len(fallas)} de {len(resultados)} comprobaciones pasaron")
for n, _, d in fallas:
    print("  FALLA:", n, "->", d)
sys.exit(1 if fallas else 0)

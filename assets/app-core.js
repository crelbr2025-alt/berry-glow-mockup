/*!
 * berry.Glow_py — Núcleo del mockup: utilidades, datos, buscador, componentes y navegación.
 * Todo corre en el navegador con datos de ejemplo; nada sale de esta computadora.
 */
(function () {
  'use strict';
  const C = window.BGCalc;
  const BG = (window.BG = window.BG || {});
  BG.vistas = BG.vistas || {};
  // Versión publicada como link: el visor no permite descargas ni (quizás) imprimir.
  BG.publicado = !!window.BG_PUBLICADO;

  /* ── Utilidades ──────────────────────────────────────────────────────── */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ESC[ch]);
  const pad = (n) => String(n).padStart(2, '0');
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const soloDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const gs = (n) => C.fmtGs(n);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Fechas: siempre la fecha local del dispositivo (Paraguay), nunca la de UTC.
  const isoLocal = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hoy = () => isoLocal(new Date());
  const ahora = () => { const d = new Date(); return isoLocal(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const aFecha = (iso) => { const p = iso.slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const sumarDias = (iso, n) => { const d = aFecha(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
  const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fmtFecha = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const fmtFechaCorta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
  const fmtHora = (ts) => (ts && ts.length >= 16 ? ts.slice(11, 16) : '');
  const fmtFechaLarga = (iso) => { const d = aFecha(iso); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
  const haceDias = (iso) => { const n = diasEntre(iso, hoy()); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días'; };
  const fmtRecibo = (n) => 'N° ' + String(n || 0).padStart(6, '0');
  const iniciales = (nombre) => String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  Object.assign(BG, {
    C: C, $: $, $$: $$, esc: esc, pad: pad, norm: norm, soloDigitos: soloDigitos, sum: sum, gs: gs, uid: uid,
    hoy: hoy, ahora: ahora, sumarDias: sumarDias, diasEntre: diasEntre, fmtFecha: fmtFecha, fmtFechaCorta: fmtFechaCorta,
    fmtHora: fmtHora, fmtFechaLarga: fmtFechaLarga, haceDias: haceDias, fmtRecibo: fmtRecibo, iniciales: iniciales,
    MESES: MESES, DIAS: DIAS,
  });

  /* ── Datos (en el navegador) ─────────────────────────────────────────── */

  const KEY_DB = 'berryglow.mockup.db.v1';
  const KEY_SESION = 'berryglow.mockup.sesion';
  BG.leer = (k) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  BG.escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  BG.guardar = () => BG.escribir(KEY_DB, BG.db);
  BG.reiniciarDatos = () => { BG.db = window.BGSeed.crear(hoy()); BG.guardar(); };

  BG.db = BG.leer(KEY_DB);
  if (!BG.db || BG.db.version !== 3) BG.reiniciarDatos();
  BG.sesion = BG.leer(KEY_SESION);
  if (BG.sesion && !BG.db.usuarios.some((u) => u.id === BG.sesion.usuarioId)) BG.sesion = null;
  BG.guardarSesion = () => { if (BG.sesion) BG.escribir(KEY_SESION, BG.sesion); else { try { localStorage.removeItem(KEY_SESION); } catch (e) { /* sin almacenamiento */ } } };

  BG.esDuena = () => !!BG.sesion && BG.sesion.rol === 'admin';
  BG.usuario = () => BG.db.usuarios.find((u) => u.id === (BG.sesion && BG.sesion.usuarioId)) || BG.db.usuarios[0];
  BG.nombreDuena = () => (BG.db.usuarios.find((u) => u.rol === 'admin') || { nombre: 'el dueño' }).nombre;

  /** Lo que el dueño puede habilitar o quitar a la vendedora (Ajustes → Usuarios y permisos). */
  BG.PERMISOS = [
    ['emitirRecibos', 'Emitir recibos', 'Imprimir, guardar en PDF y mandar por WhatsApp.'],
    ['registrarVentas', 'Registrar ventas', 'Nueva venta con el precio de lista, sin ver costos.'],
    ['preciosEspeciales', 'Poner precios especiales', 'Cambiar el precio de lista al vender o ajustarlo después (promoción, cliente frecuente…), siempre con el motivo.'],
    ['verGanancia', 'Ver la ganancia de sus precios especiales', 'Ve cuánto gana la tienda y el margen del precio que pone. Con eso puede deducir el costo.'],
    ['registrarCobros', 'Registrar cobros', 'Pagos, pagos mixtos y señas.'],
    ['editarClientes', 'Crear y editar clientes', 'Alta de clientes nuevos y corrección de datos.'],
    ['verPrecios', 'Ver la lista de precios', 'Precios de venta y stock, sin costos.'],
    ['verCaja', 'Caja del día', 'Ver lo cobrado y hacer el cierre (reabrir es solo del dueño).'],
    ['prepararEnvios', 'Preparar envíos', 'Cargar envíos, imprimir etiquetas y registrar el despacho.'],
  ];
  /** ¿El usuario actual puede hacer esto? El dueño puede todo; la vendedora, lo que tenga habilitado. */
  BG.puede = (permiso) => {
    if (!BG.sesion) return false;
    if (BG.esDuena()) return true;
    if (permiso === 'verVentas' || permiso === 'verClientes') return true;
    const u = BG.usuario();
    return !!(u && u.permisos && u.permisos[permiso]);
  };

  /* ── Consultas del dominio ───────────────────────────────────────────── */

  const porId = (arr, id) => arr.find((x) => x.id === id);
  BG.cliente = (id) => porId(BG.db.clientes, id);
  BG.producto = (id) => porId(BG.db.productos, id);
  BG.venta = (id) => porId(BG.db.ventas, id);
  BG.pagosDeVenta = (vid, conAnulados) => BG.db.pagos.filter((p) => p.ventaId === vid && (conAnulados || !p.anulado));
  BG.pagadoVenta = (v) => sum(BG.pagosDeVenta(v.id), (p) => p.total);
  BG.saldoVenta = (v) => (v.anulada ? 0 : v.total - BG.pagadoVenta(v));
  BG.ventasDeCliente = (cid) => BG.db.ventas.filter((v) => v.clienteId === cid);
  BG.saldoCliente = (cid) => sum(BG.ventasDeCliente(cid), (v) => BG.saldoVenta(v));
  BG.creditoCliente = (cid) => sum(BG.db.creditos.filter((c) => c.clienteId === cid), (c) => c.monto);
  BG.pendientesDe = (cid) => BG.ventasDeCliente(cid).filter((v) => BG.saldoVenta(v) > 0).sort((a, b) => a.ts.localeCompare(b.ts));
  BG.deudaMasAntigua = (cid) => { const p = BG.pendientesDe(cid); return p.length ? p[0].fecha : null; };
  BG.vendidas = (pid) => sum(BG.db.ventas.filter((v) => !v.anulada), (v) => sum(v.items.filter((it) => it.productoId === pid), (it) => it.cantidad));
  BG.disponibles = (p) => p.cantidad - BG.vendidas(p.id);
  BG.cajaCerrada = (fecha) => !!BG.db.config.cajaCerradaHasta && fecha <= BG.db.config.cajaCerradaHasta;

  BG.FORMAS = { efectivo: 'Efectivo', transferencia: 'Transferencia', qr: 'QR', tarjeta: 'Tarjeta', saldo: 'Saldo a favor' };
  BG.FORMAS_CORTAS = { efectivo: 'Efectivo', transferencia: 'Transf.', qr: 'QR', tarjeta: 'Tarjeta' };

  BG.totalesPorForma = (pagos) => {
    const t = { efectivo: 0, transferencia: 0, qr: 0, tarjeta: 0, saldo: 0 };
    for (const p of pagos) for (const x of p.partes) t[x.forma] = (t[x.forma] || 0) + x.monto;
    return t;
  };

  BG.listaDeudores = () => BG.db.clientes
    .map((c) => ({ c: c, saldo: BG.saldoCliente(c.id), desde: BG.deudaMasAntigua(c.id) }))
    .filter((d) => d.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  /** Cuadre: saldo sumado cliente por cliente contra el libro (vendido − cobrado). */
  BG.cuadre = () => {
    const porClientes = sum(BG.db.clientes, (c) => BG.saldoCliente(c.id));
    const vivas = BG.db.ventas.filter((v) => !v.anulada);
    const ids = new Set(vivas.map((v) => v.id));
    const libro = sum(vivas, (v) => v.total) - sum(BG.db.pagos.filter((p) => !p.anulado && ids.has(p.ventaId)), (p) => p.total);
    return { porClientes: porClientes, libro: libro, ok: porClientes === libro };
  };

  /** Los cuatro precios sugeridos sobre el costo congelado del producto, con el redondeo vigente. */
  BG.preciosProducto = (p) => {
    if (p.costoTotalGs == null) return [];
    return C.MARGENES.map((m) => {
      const exacto = C.precioExacto(p.costoTotalGs, m);
      return { margen: m, exacto: exacto, precio: Number(C.redondear(exacto, BG.db.config.redondeo)) };
    });
  };
  /* Precios especiales: el margen se mide sobre el costo congelado, igual que los sugeridos (50, 80, 100 y 120 %). */
  BG.MOTIVOS_PRECIO = ['Promoción', 'Cliente frecuente', 'Detalle en la prenda', 'Liquidación', 'Otro'];
  BG.margenMinimo = () => { const p = BG.db.config.precios; return p && p.margenMinimo != null ? p.margenMinimo : 30; };
  /**
   * Ganancia y margen de vender a `precio` lo que costó `costo` (sirve por unidad o para toda la venta).
   * El margen se muestra truncado a un decimal, así nunca parece más alto que el umbral que no alcanza.
   * estado: 'bien' (desde el menor sugerido), 'bajo', 'minimo' (debajo del mínimo sin autorización) o 'perdida'.
   */
  BG.evaluarPrecio = (precio, costo) => {
    if (!(costo > 0) || !(precio > 0)) return null;
    const ganancia = precio - costo;
    const margen = Math.floor((ganancia * 1000) / costo) / 10;
    let estado = 'bien';
    if (precio < costo) estado = 'perdida';
    else if (precio * 100 < costo * (100 + BG.margenMinimo())) estado = 'minimo';
    else if (precio * 100 < costo * (100 + C.MARGENES[0])) estado = 'bajo';
    return { ganancia: ganancia, margen: margen, estado: estado };
  };
  BG.fmtMargen = (m) => (Number.isInteger(m) ? String(m) : m.toFixed(1).replace('.', ',')) + ' %';
  /** ¿Hace falta el PIN del dueño? Solo cuando la vendedora baja del mínimo; el dueño decide solo. */
  BG.pideAutorizacion = (ev) => !BG.esDuena() && !!ev && (ev.estado === 'minimo' || ev.estado === 'perdida');
  /** ¿El usuario ve ganancia y margen? El dueño siempre; la vendedora, si tiene el permiso. */
  BG.veGanancia = () => BG.esDuena() || BG.puede('verGanancia');
  /** registrado: el precio ya quedó guardado (y autorizado si hacía falta), así que no se pide nada. */
  BG.pillPrecio = (ev, registrado) => {
    if (!ev) return '';
    const t = {
      bien: ['pill-good', 'Buen margen'],
      bajo: ['pill-warn', 'Margen bajo'],
      minimo: ['pill-bad', BG.esDuena() || registrado ? 'Debajo del mínimo (' + BG.margenMinimo() + ' %)' : 'Necesita autorización de ' + BG.nombreDuena()],
      perdida: ['pill-bad', 'Pérdida: menos que el costo'],
    }[ev.estado];
    return '<span class="pill ' + t[0] + '">' + t[1] + '</span>';
  };
  /** Línea con lo que gana la tienda a ese precio; sin el permiso, solo el aviso de color. */
  BG.infoPrecio = (ev, unidad, registrado) => {
    if (!ev) return '';
    if (!BG.veGanancia()) return BG.pillPrecio(ev, registrado);
    return '<span>' + (ev.ganancia < 0 ? 'La tienda pierde <strong>' + gs(-ev.ganancia) + '</strong>' : 'La tienda gana <strong>' + gs(ev.ganancia) + '</strong>')
      + (unidad ? ' por unidad' : '') + ' · margen <strong>' + BG.fmtMargen(ev.margen) + '</strong></span> ' + BG.pillPrecio(ev, registrado);
  };
  /** Motivo (obligatorio o no) y detalle de un precio especial, descuento o ajuste. sel = { motivo, nota }. */
  BG.camposMotivo = (clave, sel, req) => '<div class="field"><span class="field-label" id="mot-l-' + clave + '">Motivo '
    + (req ? '<span class="req">*</span>' : '<span class="small muted">(opcional)</span>') + '</span>'
    + '<div class="seg" role="radiogroup" aria-labelledby="mot-l-' + clave + '">'
    + BG.MOTIVOS_PRECIO.map((m) => '<label><input type="radio" name="motivo-' + clave + '" value="' + esc(m) + '"' + (sel.motivo === m ? ' checked' : '') + '>' + esc(m) + '</label>').join('') + '</div></div>'
    + '<div class="field"><label for="nota-' + clave + '">Detalle <span class="small muted">(obligatorio si el motivo es «Otro»)</span></label>'
    + '<input id="nota-' + clave + '" class="input" autocomplete="off" maxlength="120" data-nota="' + clave + '" value="' + esc(sel.nota || '') + '" placeholder="Ej.: promo de la semana"></div>';
  /** Cambios de precio de una venta (al vender y después), en orden, para la venta, el resumen y la auditoría. */
  BG.cambiosDePrecio = (v) => {
    const out = [];
    v.items.forEach((it, i) => {
      if (it.especial) {
        const lista = it.precioLista;
        const alVender = (v.ajustes || []).filter((a) => a.item === i).map((a) => a.antes)[0];
        out.push({ tipo: 'especial', ts: v.ts, usuario: it.especial.usuario, item: i, descripcion: it.descripcion, cantidad: it.cantidad, costo: it.costoUnitGs,
          antes: lista, despues: alVender != null ? alVender : it.precio, motivo: it.especial.motivo, nota: it.especial.nota });
      }
    });
    if (v.descuento && v.descuento.monto) {
      out.push({ tipo: 'descuento', ts: v.ts, usuario: v.descuento.usuario || v.usuario, monto: v.descuento.monto, porcentaje: v.descuento.tipo === 'porcentaje' ? v.descuento.valor : null,
        motivo: v.descuento.motivo || null, nota: v.descuento.nota || '' });
    }
    (v.ajustes || []).forEach((a) => out.push(Object.assign({ tipo: 'ajuste', costo: v.items[a.item] ? v.items[a.item].costoUnitGs : 0 }, a)));
    return out;
  };
  /** Cuánto se dejó de cobrar frente al precio de lista (descuentos incluidos). */
  BG.rebajaVenta = (v) => sum(v.items, (it) => (it.precioLista != null ? (it.precioLista - it.precio) * it.cantidad : 0)) + (v.descuento ? v.descuento.monto : 0);
  BG.detalleProducto = (p) => (p.costoUSD == null ? null : C.calcularProducto({
    costoUSD: p.costoUSD, envioUnitUSD: p.envioUnitUSD, cotizacion: p.cotizacion, redondeo: BG.db.config.redondeo,
  }));

  BG.auditar = (tipo, accion, detalle) => {
    BG.db.auditoria.unshift({ id: uid('a'), ts: ahora(), usuario: BG.usuario().nombre, tipo: tipo, accion: accion, detalle: detalle });
  };
  BG.nuevoRecibo = () => BG.db.config.proximoRecibo++;

  /* ── Búsqueda tolerante a errores de tipeo ───────────────────────────── */

  function distancia(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const d = [];
    for (let i = 0; i <= m; i++) d.push([i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const costo = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[m][n];
  }
  function puntajePalabra(q, w) {
    if (w.startsWith(q)) return 100;
    if (q.length >= 3 && w.includes(q)) return 60;
    if (q.length < 3) return 0;
    // Tolerancia según el largo: con 3 letras solo una letra cambiada o invertida ("lro" → "lor");
    // con 4 también una letra que falta ("mria" → "maria"); con 5 o más, una de más o de menos.
    const tolerancia = q.length >= 6 ? 2 : 1;
    const largos = q.length >= 5 ? [q.length - 1, q.length, q.length + 1] : q.length === 4 ? [4, 5] : [3];
    let mejor = q.length >= 5 ? distancia(q, w) : 99;
    for (const L of largos) if (L <= w.length) mejor = Math.min(mejor, distancia(q, w.slice(0, L)));
    return mejor <= tolerancia ? 45 - mejor * 10 : 0;
  }
  function puntajeTexto(q, texto) {
    const qs = norm(q).split(/[\s,.;]+/).filter(Boolean);
    if (!qs.length) return 0;
    const ws = norm(texto).split(/[\s,.;()/-]+/).filter(Boolean);
    let total = 0;
    for (const qw of qs) {
      let s = 0;
      for (const w of ws) s = Math.max(s, puntajePalabra(qw, w));
      if (!s) return 0;
      total += s;
    }
    return total / qs.length;
  }
  BG.buscarClientes = (q, max) => {
    const t = String(q || '').trim();
    if (!t) return [];
    const dig = soloDigitos(t);
    const esNumero = dig.length >= 2 && /^[\d\s.+-]+$/.test(t);
    const res = [];
    for (const c of BG.db.clientes) {
      let s = 0;
      if (esNumero) {
        const ci = soloDigitos(c.ci);
        const tel = soloDigitos(c.telefono);
        if (ci.startsWith(dig) || tel.startsWith(dig) || tel.replace(/^0/, '595').startsWith(dig)) s = 100;
        else if (ci.includes(dig) || tel.includes(dig)) s = 70;
      } else {
        s = puntajeTexto(t, c.nombre);
        if (s && norm(c.nombre).startsWith(norm(t))) s += 10;
      }
      if (s > 0) res.push({ c: c, s: s });
    }
    res.sort((a, b) => b.s - a.s || a.c.nombre.localeCompare(b.c.nombre, 'es'));
    return res.slice(0, max || 8).map((r) => r.c);
  };
  BG.buscarProductos = (q, max, filtro) => {
    const t = String(q || '').trim();
    if (!t) return [];
    const res = [];
    for (const p of BG.db.productos) {
      if (filtro && !filtro(p)) continue;
      const s = puntajeTexto(t, p.descripcion + ' ' + p.categoria);
      if (s > 0) res.push({ p: p, s: s });
    }
    res.sort((a, b) => b.s - a.s || a.p.descripcion.localeCompare(b.p.descripcion, 'es'));
    return res.slice(0, max || 8).map((r) => r.p);
  };
  /** Resalta el comienzo de cada palabra que coincide con lo buscado. */
  BG.resaltar = (texto, q) => {
    const qs = norm(q).split(/\s+/).filter(Boolean);
    if (!qs.length) return esc(texto);
    return String(texto).split(/(\s+)/).map((parte) => {
      if (!parte.trim()) return parte;
      const n = norm(parte);
      const qw = qs.filter((w) => n.startsWith(w)).sort((a, b) => b.length - a.length)[0];
      if (!qw) return esc(parte);
      let k = 0;
      let acc = 0;
      while (k < parte.length && acc < qw.length) { acc += norm(parte[k]).length; k++; }
      return '<mark>' + esc(parte.slice(0, k)) + '</mark>' + esc(parte.slice(k));
    }).join('');
  };

  /* ── Íconos y marca ──────────────────────────────────────────────────── */

  const ICONOS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4"/><path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
    box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    chart: '<path d="M3.5 20h17"/><path d="M6.5 16v-5M11.5 16V6M16.5 16V9"/>',
    pie: '<path d="M11 4a8 8 0 1 0 8.5 9H11V4Z"/><path d="M14 2.8a8 8 0 0 1 7 7.2h-7V2.8Z"/>',
    box2: '<path d="M4 8h16v12H4z"/><path d="M4 8l2-4h12l2 4M10 12h4"/>',
    register: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 9V4.5h10V9"/><path d="M7 13h2M11 13h2M15 13h2M7 16.5h10"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    audit: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5V5h6V3.5M9 10h6M9 13.5h6M9 17h3"/>',
    receipt: '<path d="M6 3h12v18l-3-1.8-3 1.8-3-1.8L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    chat: '<path d="M4 20l1.2-3.7A8 8 0 1 1 8 19.2L4 20Z"/><path d="M9 10.5h6M9 13.5h4"/>',
    upload: '<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3.5"/>',
    download: '<path d="M12 4v11.5M7.5 11 12 15.5 16.5 11"/><path d="M4 15.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/>',
    logout: '<path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8" r="1.5"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5"/><path d="m9 12 5 6M14 12l-5 6"/>',
    guide: '<path d="M9.5 6H20M9.5 12H20M9.5 18H20"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  };
  BG.icon = (nombre, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONOS[nombre] || '') + '</svg>';
  const icon = BG.icon;

  const MARCA_BAYA = '<path d="M20 13.5c-6.4 0-10.5 4.4-10.5 10.3 0 7.3 5.3 12.7 10.5 12.7s10.5-5.4 10.5-12.7c0-5.9-4.1-10.3-10.5-10.3Z" fill="var(--mark-berry, #A3195B)"/>'
    + '<g fill="#fff" opacity=".55"><circle cx="15.5" cy="21" r="1.3"/><circle cx="20.5" cy="19.5" r="1.3"/><circle cx="25" cy="22" r="1.3"/><circle cx="17.5" cy="26" r="1.3"/><circle cx="23" cy="27" r="1.3"/><circle cx="20" cy="31.5" r="1.3"/></g>'
    + '<path d="M20 14c-1.4-3.2-4.4-4.8-7.8-4.3 1.5 2.7 4.3 4.3 7.8 4.3Zm0 0c1.4-3.2 4.4-4.8 7.8-4.3-1.5 2.7-4.3 4.3-7.8 4.3Z" fill="#3E7B4F"/>'
    + '<path d="M32.5 4.5l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1Z" fill="var(--mark-glow, #E2A94F)"/>';
  BG.marca = () => '<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">' + MARCA_BAYA + '</svg>';
  /** Logotipo provisorio (hasta tener el definitivo). Si se subió un logo en Ajustes, se usa ese. */
  BG.logo = (usarSubido) => {
    const subido = BG.db.config.marca.logo;
    if (usarSubido && subido) return '<img class="logo-img" src="' + esc(subido) + '" alt="' + esc(BG.db.config.tienda.nombre) + '">';
    return '<svg class="logo" viewBox="0 0 250 52" role="img" aria-label="berry.Glow_py">'
      + '<g transform="translate(0 4)">' + MARCA_BAYA + '</g>'
      + '<text x="47" y="36" class="logo-word" font-size="29" fill="currentColor">berry<tspan fill="var(--mark-berry, #A3195B)">.</tspan>'
      + '<tspan font-style="italic" font-weight="600">Glow</tspan><tspan font-size="16" fill-opacity=".7">_py</tspan></text></svg>';
  };

  /* ── Piezas de interfaz ──────────────────────────────────────────────── */

  BG.edad = (iso) => {
    if (!iso) return '';
    const n = diasEntre(iso, hoy());
    const cls = n > 30 ? 'age-bad' : n >= 15 ? 'age-warn' : '';
    return '<span class="age ' + cls + '">' + (n <= 0 ? 'desde hoy' : n === 1 ? 'hace 1 día' : 'hace ' + n + ' días') + '</span>';
  };
  BG.estadoVenta = (v) => {
    if (v.anulada) return '<span class="pill pill-muted">' + icon('ban') + 'Anulada</span>';
    const s = BG.saldoVenta(v);
    return s > 0 ? '<span class="pill pill-warn">' + icon('clock') + 'Debe ' + gs(s) + '</span>'
      : '<span class="pill pill-good">' + icon('check') + 'Saldada</span>';
  };
  BG.pillSaldo = (saldo) => (saldo > 0 ? '<span class="amount">' + gs(saldo) + '</span>' : '<span class="pill pill-good">' + icon('check') + 'Al día</span>');

  /** WhatsApp: los clientes de ejemplo no tienen número real, así que se abre sin destinatario. */
  BG.waLink = (c, texto) => {
    const t = encodeURIComponent(texto);
    if (!c || c.demo) return 'https://wa.me/?text=' + t;
    const tel = soloDigitos(c.telefono).replace(/^0/, '');
    return 'https://wa.me/595' + tel + '?text=' + t;
  };

  BG.toast = (msg, tipo) => {
    const host = $('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (tipo === 'error' ? ' toast-error' : '');
    el.innerHTML = icon(tipo === 'error' ? 'alert' : 'check') + '<span></span>';
    el.lastChild.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 320); }, tipo === 'error' ? 5200 : 3400);
  };

  /**
   * Diálogo modal. acciones: [{ texto, valor, clase, submit }]. Devuelve una promesa con el valor
   * de la acción elegida (null si se cierra). validar(valor, dlg) puede devolver false para no cerrar.
   */
  BG.modal = (o) => {
    const dlg = $('#modal');
    dlg.className = 'modal' + (o.ancho ? ' modal-' + o.ancho : '');
    dlg.innerHTML = '<form method="dialog" class="modal-inner" novalidate>'
      + '<header class="modal-head"><h2>' + esc(o.titulo) + '</h2><button type="button" class="btn-icon" data-cerrar aria-label="Cerrar">' + icon('x') + '</button></header>'
      + '<div class="modal-body">' + o.cuerpo + '</div>'
      + (o.acciones && o.acciones.length ? '<footer class="modal-foot">' + o.acciones.map((a) => '<button type="' + (a.submit ? 'submit' : 'button') + '" class="btn ' + (a.clase || '') + '" data-valor="' + esc(a.valor) + '">' + a.texto + '</button>').join('') + '</footer>' : '')
      + '</form>';
    return new Promise((resolve) => {
      let hecho = false;
      const fin = (v) => { if (hecho) return; hecho = true; dlg.close(); resolve(v); };
      dlg.onclick = (e) => {
        if (hecho) return;
        if (e.target === dlg || e.target.closest('[data-cerrar]')) { fin(null); return; }
        const b = e.target.closest('[data-valor]');
        if (!b) return;
        e.preventDefault();
        const v = b.dataset.valor;
        if (v === 'cancelar') { fin(null); return; }
        if (o.validar && o.validar(v, dlg) === false) return;
        fin(v);
      };
      dlg.oncancel = (e) => { e.preventDefault(); fin(null); };
      dlg.querySelector('form').onsubmit = (e) => e.preventDefault();
      // Enter en un campo de texto confirma con el botón principal (sin depender del envío implícito del navegador).
      dlg.onkeydown = (e) => {
        const t = e.target;
        if (e.key !== 'Enter' || e.isComposing || !t || t.tagName !== 'INPUT' || /^(checkbox|radio|file|button|submit)$/.test(t.type)) return;
        const principal = dlg.querySelector('.modal-foot button[type="submit"]');
        if (principal) { e.preventDefault(); principal.click(); }
      };
      dlg.showModal();
      BG.enlazarCampos(dlg);
      if (o.onMount) o.onMount(dlg);
    });
  };

  BG.pedirPin = async (motivo) => {
    const v = await BG.modal({
      titulo: 'Autorización de ' + BG.nombreDuena(),
      cuerpo: '<p>' + esc(motivo) + '</p>'
        + '<div class="field"><label for="pin">PIN de autorización</label>'
        + '<input id="pin" class="input" type="password" inputmode="numeric" autocomplete="off" maxlength="6">'
        + '<p class="hint">En este mockup el PIN es <strong>1234</strong>.</p><p class="error-text" id="pin-error" hidden></p></div>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Autorizar', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        if ($('#pin', dlg).value === '1234') return true;
        const er = $('#pin-error', dlg);
        er.textContent = 'PIN incorrecto.';
        er.hidden = false;
        return false;
      },
      onMount: (dlg) => $('#pin', dlg).focus(),
    });
    if (v === 'ok') BG.auditar('seguridad', 'Autorización con PIN', motivo);
    return v === 'ok';
  };

  /** Campo de guaraníes: se formatea con punto de miles mientras se escribe. */
  BG.campoGs = (id, valor, attrs) => '<div class="money"><span class="money-sym" aria-hidden="true">₲</span>'
    + '<input id="' + id + '" class="input gs" type="text" inputmode="numeric" autocomplete="off" value="' + (valor ? C.groupThousands(valor) : '') + '" ' + (attrs || '') + '></div>';
  function formatearGs(e) {
    const inp = e.target;
    const pos = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
    const antes = inp.value.slice(0, pos).replace(/\D/g, '').length;
    const dig = inp.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const f = dig ? C.groupThousands(dig) : '';
    if (f === inp.value) return;
    inp.value = f;
    let i = 0;
    let c = 0;
    while (i < f.length && c < antes) { if (f[i] !== '.') c++; i++; }
    try { inp.setSelectionRange(i, i); } catch (err) { /* algunos tipos de campo no lo permiten */ }
  }
  BG.leerGs = (inp) => (inp ? C.parseGs(inp.value) || 0 : 0);
  /** Enlaza los campos de ₲ (formato en vivo) y los decimales (se reescriben al salir del campo). */
  BG.enlazarCampos = (root) => {
    $$('input.gs', root).forEach((inp) => {
      if (inp.dataset.enlazado) return;
      inp.dataset.enlazado = '1';
      inp.addEventListener('input', formatearGs);
    });
    $$('input[data-dec]', root).forEach((inp) => {
      if (inp.dataset.enlazado) return;
      inp.dataset.enlazado = '1';
      inp.addEventListener('blur', () => {
        const q = C.parseNum(inp.value, inp.dataset.kind || 'decimal');
        if (q) inp.value = C.fmtNum(q, Number(inp.dataset.dec), 6);
      });
    });
  };

  /**
   * Autocompletado accesible. cfg.buscar(q) → items (con .grupo opcional), cfg.pintar(item, q) → html,
   * cfg.elegir(item). Teclado: ↑ ↓ Enter Esc.
   */
  BG.combobox = (input, lista, cfg) => {
    let items = [];
    let activo = -1;
    const cerrar = () => {
      lista.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    };
    const marcar = () => {
      $$('.cb-option', lista).forEach((li) => {
        const on = Number(li.dataset.i) === activo;
        li.classList.toggle('is-active', on);
        li.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
      });
    };
    const abrir = () => {
      const q = input.value;
      if (!q.trim() && !cfg.mostrarVacio) { cerrar(); return; }
      items = cfg.buscar(q);
      activo = items.length ? 0 : -1;
      let html = '';
      let grupo = null;
      items.forEach((it, i) => {
        if (it.grupo && it.grupo !== grupo) { grupo = it.grupo; html += '<li class="cb-group" role="presentation">' + esc(grupo) + '</li>'; }
        html += '<li id="' + lista.id + '-o' + i + '" role="option" class="cb-option" data-i="' + i + '">' + cfg.pintar(it, q) + '</li>';
      });
      if (!items.length) html = '<li class="cb-empty">' + (cfg.vacio ? cfg.vacio(q) : 'Sin resultados para «' + esc(q) + '»') + '</li>';
      lista.innerHTML = html;
      lista.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      marcar();
    };
    const elegir = (i) => { const it = items[i]; if (!it) return; cerrar(); cfg.elegir(it); };
    input.addEventListener('input', abrir);
    input.addEventListener('focus', () => { if (input.value.trim() || cfg.mostrarVacio) abrir(); });
    input.addEventListener('blur', () => setTimeout(cerrar, 150));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) abrir(); else if (items.length) { activo = (activo + 1) % items.length; marcar(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { activo = (activo - 1 + items.length) % items.length; marcar(); } }
      else if (e.key === 'Enter') { if (!lista.hidden && activo >= 0) { e.preventDefault(); elegir(activo); } }
      else if (e.key === 'Escape') { cerrar(); }
    });
    lista.addEventListener('mousedown', (e) => e.preventDefault());
    lista.addEventListener('click', (e) => { const li = e.target.closest('.cb-option'); if (li) elegir(Number(li.dataset.i)); });
    return { cerrar: cerrar, abrir: abrir };
  };

  /** Fila de cliente para listas y autocompletado. */
  BG.filaCliente = (c, q) => {
    const saldo = BG.saldoCliente(c.id);
    return '<span class="avatar">' + esc(iniciales(c.nombre)) + '</span>'
      + '<span class="row-main"><span class="row-title">' + (q ? BG.resaltar(c.nombre, q) : esc(c.nombre)) + '</span>'
      + '<span class="row-sub">' + (c.ci ? (c.ci.includes('-') ? 'RUC ' : 'CI ') + esc(c.ci) + ' · ' : '') + esc(c.telefono) + '</span></span>'
      + '<span class="row-end">' + BG.pillSaldo(saldo) + (saldo > 0 ? BG.edad(BG.deudaMasAntigua(c.id)) : '') + '</span>';
  };

  /* ── Navegación ──────────────────────────────────────────────────────── */

  // [ruta, pantalla, requisito]: true = solo el dueño; texto = permiso que tiene que tener la vendedora.
  const RUTAS = [
    [/^\/inicio$/, 'inicio'],
    [/^\/clientes$/, 'clientes'],
    [/^\/clientes\/nuevo$/, 'clienteForm', 'editarClientes'],
    [/^\/clientes\/([\w-]+)\/editar$/, 'clienteForm', 'editarClientes'],
    [/^\/clientes\/([\w-]+)$/, 'cliente'],
    [/^\/ventas$/, 'ventas'],
    [/^\/ventas\/nueva$/, 'ventaNueva', 'registrarVentas'],
    [/^\/ventas\/([\w-]+)$/, 'venta'],
    [/^\/cobros\/nuevo$/, 'cobro', 'registrarCobros'],
    [/^\/productos$/, 'productos', 'verPrecios'],
    [/^\/productos\/nuevo$/, 'productoNuevo', true],
    [/^\/productos\/pedido$/, 'pedido', true],
    [/^\/productos\/importar$/, 'importar', true],
    [/^\/envios$/, 'envios', 'prepararEnvios'],
    [/^\/envios\/nuevo$/, 'envioForm', 'prepararEnvios'],
    [/^\/envios\/([\w-]+)\/editar$/, 'envioForm', 'prepararEnvios'],
    [/^\/envios\/([\w-]+)\/etiqueta$/, 'etiqueta', 'prepararEnvios'],
    [/^\/envios\/([\w-]+)$/, 'envio', 'prepararEnvios'],
    [/^\/resumen$/, 'resumen', true],
    [/^\/reportes$/, 'reportes', true],
    [/^\/caja$/, 'caja', 'verCaja'],
    [/^\/ajustes$/, 'ajustes', true],
    [/^\/auditoria$/, 'auditoria', true],
    [/^\/recibo\/(v|c)\/([\w-]+)$/, 'recibo', 'emitirRecibos'],
  ];
  const permitido = (req) => !req || (req === true ? BG.esDuena() : BG.puede(req));
  BG.rutaPermitida = (path) => { const x = RUTAS.find((r) => r[0].test(path)); return !x || permitido(x[2]); };

  function ruta() {
    const h = location.hash.replace(/^#/, '') || '/inicio';
    const i = h.indexOf('?');
    return { path: i >= 0 ? h.slice(0, i) : h, params: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
  }
  BG.ruta = ruta;
  BG.ir = (hash) => { if (location.hash === hash) BG.render(); else location.hash = hash; };

  function navItems() {
    const d = BG.esDuena();
    const items = [
      ['inicio', 'Inicio', 'home'],
      ['clientes', 'Clientes', 'users'],
      ['ventas', 'Ventas', 'bag'],
      BG.puede('registrarCobros') && ['cobros/nuevo', 'Cobrar', 'cash'],
      BG.puede('prepararEnvios') && ['envios', 'Envíos', 'truck'],
      BG.puede('verCaja') && ['caja', 'Caja del día', 'register'],
      ['-'],
      BG.puede('verPrecios') && ['productos', d ? 'Productos' : 'Lista de precios', 'box'],
      d && ['resumen', 'Resumen', 'pie'],
      d && ['reportes', 'Reportes', 'chart'],
      d && ['auditoria', 'Auditoría', 'audit'],
      d && ['ajustes', 'Ajustes', 'sliders'],
    ].filter(Boolean);
    return items[items.length - 1][0] === '-' ? items.slice(0, -1) : items;
  }

  function renderChrome() {
    const d = BG.esDuena();
    const u = BG.usuario();
    const cfg = BG.db.config;
    $('#nav').innerHTML = navItems().map((n) => (n[0] === '-' ? '<div class="nav-sep" role="separator"></div>'
      : '<a class="nav-item" href="#/' + n[0] + '" data-nav="' + n[0] + '">' + icon(n[2]) + '<span>' + n[1] + '</span></a>')).join('');
    $('#sidebar-foot').innerHTML = (d ? '<div class="params">'
      + '<div class="params-row"><span>Dólar</span><strong>' + C.fmtCot(cfg.cotizacion.valor) + '</strong></div>'
      + '<div class="params-row"><span>Courier</span><strong>' + C.fmtUSD(cfg.tarifa.valor) + '/kg</strong></div>'
      + '<a href="#/ajustes">Cambiar parámetros</a></div>' : '')
      + '<div class="user-box"><span class="avatar">' + esc(iniciales(u.nombre)) + '</span><div class="grow"><strong>' + esc(u.nombre) + '</strong>'
      + '<small>' + (d ? 'Dueño · ve y cambia todo' : 'Vendedora · sin costos') + '</small></div>'
      + '<button type="button" class="btn-icon" data-action="salir" aria-label="Cerrar sesión" title="Cerrar sesión">' + icon('logout') + '</button></div>';
    const duenio = BG.db.usuarios.find((x) => x.rol === 'admin');
    const vendedora = BG.db.usuarios.find((x) => x.rol === 'vendedor');
    $('#topbar-actions').innerHTML = '<span class="small muted hide-mobile">Ver como</span>'
      + '<div class="seg hide-mobile" role="group" aria-label="Ver el sistema como">'
      + '<button type="button" data-action="rol" data-rol="admin" aria-pressed="' + d + '">' + esc(duenio.nombre) + '</button>'
      + '<button type="button" data-action="rol" data-rol="vendedor" aria-pressed="' + !d + '">' + esc(vendedora.nombre) + '</button></div>'
      + '<button type="button" class="btn btn-quiet hide-mobile" data-action="guia">' + icon('guide') + '<span>Guía</span></button>'
      + (BG.puede('registrarVentas') ? '<a class="btn btn-primary hide-mobile" href="#/ventas/nueva">' + icon('plus') + '<span>Nueva venta</span></a>' : '')
      + '<button type="button" class="btn-icon show-mobile" data-action="guia" aria-label="Guía de prueba">' + icon('guide') + '</button>';
    const tabs = ['<a class="tab" href="#/inicio" data-nav="inicio">' + icon('home') + '<span>Inicio</span></a>',
      '<a class="tab" href="#/clientes" data-nav="clientes">' + icon('users') + '<span>Clientes</span></a>'];
    tabs.push(BG.puede('registrarVentas')
      ? '<a class="tab tab-main" href="#/ventas/nueva" data-nav="ventas/nueva"><span class="tab-bubble">' + icon('plus') + '</span><span>Vender</span></a>'
      : '<a class="tab" href="#/ventas" data-nav="ventas">' + icon('bag') + '<span>Ventas</span></a>');
    if (BG.puede('registrarCobros')) tabs.push('<a class="tab" href="#/cobros/nuevo" data-nav="cobros/nuevo">' + icon('cash') + '<span>Cobrar</span></a>');
    else if (BG.puede('prepararEnvios')) tabs.push('<a class="tab" href="#/envios" data-nav="envios">' + icon('truck') + '<span>Envíos</span></a>');
    tabs.push('<button type="button" class="tab" data-action="mas">' + icon('more') + '<span>Más</span></button>');
    const tabbar = $('#tabbar');
    tabbar.innerHTML = tabs.join('');
    tabbar.style.gridTemplateColumns = 'repeat(' + tabs.length + ', 1fr)';
    marcarNav(ruta().path);
  }
  BG.renderChrome = renderChrome;

  function marcarNav(path) {
    $$('[data-nav]').forEach((a) => {
      const n = '/' + a.dataset.nav;
      const exacto = a.classList.contains('tab') ? path === n : (path === n || path.startsWith(n + '/'));
      if (exacto) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function montarBuscadorGlobal() {
    const host = $('#global-search');
    host.innerHTML = '<label class="sr-only" for="q-global">Buscar cliente o producto</label>'
      + '<div class="search-box">' + icon('search') + '<input id="q-global" class="search-input" type="search" autocomplete="off" spellcheck="false"'
      + ' placeholder="Buscar cliente o producto" title="Nombre, CI/RUC o teléfono del cliente, o nombre del producto" role="combobox" aria-expanded="false" aria-controls="q-global-lista" aria-autocomplete="list">'
      + '<kbd class="kbd" aria-hidden="true">/</kbd></div>'
      + '<ul class="cb-list" id="q-global-lista" role="listbox" aria-label="Resultados" hidden></ul>';
    const input = $('#q-global');
    BG.combobox(input, $('#q-global-lista'), {
      buscar: (q) => BG.buscarClientes(q, 6).map((c) => ({ grupo: 'Clientes', c: c }))
        .concat(BG.puede('verPrecios') ? BG.buscarProductos(q, 5).map((p) => ({ grupo: BG.esDuena() ? 'Productos' : 'Lista de precios', p: p })) : []),
      pintar: (it, q) => {
        if (it.c) return BG.filaCliente(it.c, q);
        const p = it.p;
        const disp = BG.disponibles(p);
        return '<span class="avatar">' + icon('tag', 'i-sm') + '</span><span class="row-main"><span class="row-title">' + BG.resaltar(p.descripcion, q) + '</span>'
          + '<span class="row-sub">' + esc(p.categoria) + ' · ' + (disp > 0 ? disp + ' disponibles' : 'agotado') + '</span></span>'
          + '<span class="row-end"><span class="amount">' + (p.precioVenta ? gs(p.precioVenta) : 'Sin precio') + '</span></span>';
      },
      elegir: (it) => {
        input.value = '';
        input.blur();
        BG.ir(it.c ? '#/clientes/' + it.c.id : '#/productos?ver=' + it.p.id);
      },
      vacio: (q) => 'Nada coincide con «' + esc(q) + '». <a href="#/clientes/nuevo?nombre=' + encodeURIComponent(q) + '" class="cb-new">Crear cliente nuevo</a>',
    });
  }

  function montarApp() {
    $('#root').innerHTML = '<div class="app">'
      + '<aside class="sidebar" aria-label="Menú principal"><a class="brand" href="#/inicio" aria-label="Inicio">' + BG.logo() + '</a>'
      + '<nav class="nav" id="nav"></nav><div class="sidebar-foot" id="sidebar-foot"></div></aside>'
      + '<div class="main-col">'
      + '<div class="mock-strip" role="note"><span><strong>Mockup para aprobar</strong><span class="mock-largo"> · datos de ejemplo guardados solo en este navegador</span>'
      + '<span class="mock-corto"> · datos de ejemplo</span></span>'
      + '<button type="button" class="linkish" data-action="guia">Guía de prueba</button></div>'
      + '<header class="topbar"><a class="brand-mini" href="#/inicio" aria-label="Inicio">' + BG.marca() + '</a>'
      + '<div class="search" id="global-search"></div><div class="topbar-actions" id="topbar-actions"></div></header>'
      + '<main id="view" class="view" tabindex="-1"></main></div>'
      + '<nav class="tabbar" id="tabbar" aria-label="Accesos rápidos"></nav></div>'
      + '<div class="toast-host" id="toasts" aria-live="polite"></div>'
      + '<dialog class="modal" id="modal"></dialog>'
      + '<dialog class="sheet" id="sheet" aria-label="Más opciones"></dialog>'
      + '<aside class="guide" id="guide" hidden aria-label="Guía de prueba"></aside>';
    montarBuscadorGlobal();
    renderChrome();
  }

  function abrirMas() {
    const d = BG.esDuena();
    const sheet = $('#sheet');
    const item = (href, ic, texto) => '<a class="sheet-item" href="' + href + '" data-cerrar-hoja>' + icon(ic) + texto + '</a>';
    const otro = BG.db.usuarios.find((x) => x.rol === (d ? 'vendedor' : 'admin'));
    sheet.innerHTML = '<div class="sheet-grip"></div><div class="sheet-list">'
      + item('#/ventas', 'bag', 'Ventas')
      + (BG.puede('prepararEnvios') ? item('#/envios', 'truck', 'Envíos') : '')
      + (BG.puede('verPrecios') ? item('#/productos', 'box', d ? 'Productos' : 'Lista de precios') : '')
      + (BG.puede('verCaja') ? item('#/caja', 'register', 'Caja del día') : '')
      + (d ? item('#/resumen', 'pie', 'Resumen') + item('#/reportes', 'chart', 'Reportes') + item('#/auditoria', 'audit', 'Auditoría') + item('#/ajustes', 'sliders', 'Ajustes') : '')
      + '<div class="sheet-sep"></div>'
      + '<button type="button" class="sheet-item" data-action="guia" data-cerrar-hoja>' + icon('guide') + 'Guía de prueba</button>'
      + '<button type="button" class="sheet-item" data-action="rol" data-rol="' + (d ? 'vendedor' : 'admin') + '" data-cerrar-hoja>' + icon('eye') + 'Ver como ' + esc(otro.nombre) + (d ? ' (vendedora)' : ' (dueño)') + '</button>'
      + '<button type="button" class="sheet-item" data-action="salir" data-cerrar-hoja>' + icon('logout') + 'Cerrar sesión</button></div>';
    sheet.onclick = (e) => { if (e.target === sheet || e.target.closest('[data-cerrar-hoja]')) sheet.close(); };
    sheet.showModal();
  }

  BG.cambiarRol = (rol) => {
    const u = BG.db.usuarios.find((x) => x.rol === rol) || BG.db.usuarios[0];
    BG.sesion = { usuarioId: u.id, rol: u.rol };
    BG.guardarSesion();
    renderChrome();
    BG.toast(u.rol === 'admin' ? 'Vista de ' + u.nombre + ' (dueño): se ve y se cambia todo.' : 'Vista de ' + u.nombre + ' (vendedora): sin costos, dólar ni márgenes.');
    if (BG.rutaPermitida(ruta().path)) BG.render(); else BG.ir('#/inicio');
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'guia') { e.preventDefault(); if (BG.abrirGuia) BG.abrirGuia(); }
    else if (a === 'mas') { e.preventDefault(); abrirMas(); }
    else if (a === 'rol') { e.preventDefault(); BG.cambiarRol(b.dataset.rol); }
    else if (a === 'salir') {
      e.preventDefault();
      BG.sesion = null;
      BG.guardarSesion();
      location.hash = '#/inicio';
      BG.render();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const q = $('#q-global');
    if (q) { e.preventDefault(); q.focus(); }
  });

  BG.render = function () {
    const guia = $('#guide');
    if (!BG.sesion) {
      document.body.classList.remove('route-print');
      BG.vistas.login();
      return;
    }
    if (!$('.app')) montarApp();
    const r = ruta();
    let nombre = null;
    let args = [];
    for (const [re, n, req] of RUTAS) {
      const m = re.exec(r.path);
      if (m) { nombre = permitido(req) ? n : 'sinPermiso'; args = m.slice(1); break; }
    }
    if (!nombre) { location.replace('#/inicio'); return; }
    const vista = BG.vistas[nombre](args, r.params);
    // Contenedor nuevo en cada pantalla: los manejadores de la pantalla anterior no se acumulan.
    const viejo = $('#view');
    const main = viejo.cloneNode(false);
    viejo.replaceWith(main);
    main.innerHTML = vista.html;
    document.title = 'Gestión berry.Glow';
    document.body.classList.toggle('route-print', nombre === 'recibo' || nombre === 'etiqueta');
    marcarNav(r.path);
    BG.enlazarCampos(main);
    if (vista.mount) vista.mount(main, args, r.params);
    if (guia && !guia.hidden && BG.refrescarGuia) BG.refrescarGuia();
    window.scrollTo(0, 0);
  };

  BG.iniciar = () => {
    window.addEventListener('hashchange', BG.render);
    BG.render();
  };
})();

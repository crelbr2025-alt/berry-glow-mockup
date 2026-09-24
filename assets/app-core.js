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
  // Los datos reales traídos del Excel viven en otra clave: nunca se mezclan con los de ejemplo ni se publican.
  const KEY_DB_MIOS = 'berryglow.mockup.db.mios';
  const KEY_MIOS_INFO = 'berryglow.mockup.mios.info';
  const KEY_MODO = 'berryglow.mockup.modo';
  const VERSION_DB = 5;
  BG.VERSION_DB = VERSION_DB;
  BG.leer = (k) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  BG.escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const quitar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } };
  /** 'ejemplo' = los datos ficticios del mockup; 'mios' = los datos reales traídos del Excel. */
  BG.modoDatos = 'ejemplo';
  BG.guardar = () => BG.escribir(BG.modoDatos === 'mios' ? KEY_DB_MIOS : KEY_DB, BG.db);
  /** Vuelve a los datos de ejemplo del día de hoy. No toca los datos del Excel. */
  BG.reiniciarDatos = () => {
    BG.modoDatos = 'ejemplo';
    BG.escribir(KEY_MODO, 'ejemplo');
    BG.db = window.BGSeed.crear(hoy());
    BG.guardar();
  };
  /** Resumen de los datos del Excel guardados en este navegador (o null). No abre la base entera. */
  BG.infoMisDatos = () => BG.leer(KEY_MIOS_INFO);
  BG.usarDatosDeEjemplo = () => {
    BG.modoDatos = 'ejemplo';
    BG.escribir(KEY_MODO, 'ejemplo');
    BG.db = BG.leer(KEY_DB);
    if (!BG.db || BG.db.version !== VERSION_DB) BG.reiniciarDatos();
  };
  /** Pasa a los datos del Excel: los recién importados (db) o los que ya estaban guardados (sin argumento). */
  BG.usarMisDatos = (db, info) => {
    if (db) {
      if (!BG.escribir(KEY_DB_MIOS, db)) throw new Error('No hay lugar en este navegador para guardar tus datos. Liberá espacio (o usá otra computadora) y probá de nuevo.');
      BG.escribir(KEY_MIOS_INFO, info || { importado: db.origen && db.origen.importado });
    }
    const d = db || BG.leer(KEY_DB_MIOS);
    if (!d || d.version !== VERSION_DB) throw new Error('No hay datos del Excel guardados en este navegador: traelos desde Ajustes.');
    BG.modoDatos = 'mios';
    BG.escribir(KEY_MODO, 'mios');
    BG.db = d;
  };
  BG.borrarMisDatos = () => {
    quitar(KEY_DB_MIOS);
    quitar(KEY_MIOS_INFO);
    if (BG.modoDatos === 'mios') BG.usarDatosDeEjemplo();
  };

  BG.db = null;
  if (BG.leer(KEY_MODO) === 'mios') {
    try { BG.usarMisDatos(); } catch (e) { BG.escribir(KEY_MODO, 'ejemplo'); }
  }
  if (!BG.db) BG.usarDatosDeEjemplo();
  BG.sesion = BG.leer(KEY_SESION);
  if (BG.sesion && !BG.db.usuarios.some((u) => u.id === BG.sesion.usuarioId)) BG.sesion = null;
  BG.guardarSesion = () => { if (BG.sesion) BG.escribir(KEY_SESION, BG.sesion); else { try { localStorage.removeItem(KEY_SESION); } catch (e) { /* sin almacenamiento */ } } };

  /* Tema: automático (el del teléfono o la computadora), claro u oscuro. Se guarda en este navegador. */
  const KEY_TEMA = 'berryglow.mockup.tema';
  BG.TEMAS = { auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' };
  BG.ICONO_TEMA = { auto: 'auto', claro: 'sun', oscuro: 'moon' };
  BG.tema = () => { try { const t = localStorage.getItem(KEY_TEMA); return BG.TEMAS[t] ? t : 'auto'; } catch (e) { return 'auto'; } };
  BG.aplicarTema = (t) => {
    const r = document.documentElement;
    if (t === 'claro') r.setAttribute('data-theme', 'light');
    else if (t === 'oscuro') r.setAttribute('data-theme', 'dark');
    else r.removeAttribute('data-theme');
  };
  BG.cambiarTema = (t) => {
    try { localStorage.setItem(KEY_TEMA, t); } catch (e) { /* sin almacenamiento: vale hasta recargar */ }
    BG.aplicarTema(t);
    document.querySelectorAll('[data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === t)));
    document.querySelectorAll('[data-action="tema"]').forEach((b) => {
      b.innerHTML = BG.icon(BG.ICONO_TEMA[t]);
      b.setAttribute('aria-label', 'Tema: ' + BG.TEMAS[t].toLowerCase() + ' (tocá para cambiar)');
      b.title = 'Tema: ' + BG.TEMAS[t].toLowerCase();
    });
  };
  /** Botones Automático / Claro / Oscuro (hoja «Más», ingreso). */
  BG.selectorTema = () => '<div class="seg seg-tema" role="group" aria-label="Tema de la pantalla">'
    + Object.keys(BG.TEMAS).map((k) => '<button type="button" data-tema="' + k + '" aria-pressed="' + (BG.tema() === k) + '">' + BG.icon(BG.ICONO_TEMA[k], 'i-sm') + BG.TEMAS[k] + '</button>').join('') + '</div>';
  BG.aplicarTema(BG.tema());

  BG.esDuena = () => !!BG.sesion && BG.sesion.rol === 'admin';
  BG.usuario = () => BG.db.usuarios.find((u) => u.id === (BG.sesion && BG.sesion.usuarioId)) || BG.db.usuarios[0];
  BG.nombreDuena = () => (BG.db.usuarios.find((u) => u.rol === 'admin') || { nombre: 'el dueño' }).nombre;

  /** Lo que el dueño puede habilitar o quitar a la vendedora (Ajustes → Usuarios y permisos). */
  BG.PERMISOS = [
    ['emitirRecibos', 'Emitir recibos', 'Imprimir, guardar en PDF y mandar por WhatsApp.'],
    ['registrarVentas', 'Registrar ventas', 'Nueva venta con el precio de lista, sin ver costos.'],
    ['preciosEspeciales', 'Poner precios especiales', 'Cambiar el precio de lista al vender o ajustarlo después (promoción, cliente frecuente…), siempre con el motivo.'],
    ['verGanancia', 'Ver la ganancia de sus precios especiales', 'Ve cuánto gana la tienda y el margen del precio que pone. Con eso puede deducir el costo.'],
    ['registrarCobros', 'Registrar cobros', 'Pagos, pagos mixtos, señas y cuotas con fecha.'],
    ['devoluciones', 'Devoluciones y cambios', 'Devolver o cambiar un artículo de una venta. Lo que sobra queda como saldo a favor; devolver plata en efectivo pide tu PIN.'],
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
  /** Lo que la venta tiene pagado: los pagos vivos menos lo que una devolución pasó a saldo a favor (v.aFavor). */
  BG.pagadoVenta = (v) => sum(BG.pagosDeVenta(v.id), (p) => p.total) - (v.aFavor || 0);
  BG.saldoVenta = (v) => (v.anulada ? 0 : v.total - BG.pagadoVenta(v));
  BG.ventasDeCliente = (cid) => BG.db.ventas.filter((v) => v.clienteId === cid);
  BG.saldoCliente = (cid) => sum(BG.ventasDeCliente(cid), (v) => BG.saldoVenta(v));
  BG.creditoCliente = (cid) => sum(BG.db.creditos.filter((c) => c.clienteId === cid), (c) => c.monto);
  BG.pendientesDe = (cid) => BG.ventasDeCliente(cid).filter((v) => BG.saldoVenta(v) > 0).sort((a, b) => a.ts.localeCompare(b.ts));
  BG.deudaMasAntigua = (cid) => { const p = BG.pendientesDe(cid); return p.length ? p[0].fecha : null; };
  /** Unidades que la clienta se quedó de un artículo (las devueltas vuelven al stock). */
  BG.cantidadViva = (it) => it.cantidad - (it.devueltas || 0);
  BG.vendidas = (pid) => sum(BG.db.ventas.filter((v) => !v.anulada), (v) => sum(v.items.filter((it) => it.productoId === pid), BG.cantidadViva));
  /** Diferencias de los conteos de inventario (faltantes negativos, sobrantes positivos). */
  BG.ajusteStock = (pid) => sum((BG.db.ajustesStock || []).filter((a) => a.productoId === pid), (a) => a.diferencia);
  BG.disponibles = (p) => p.cantidad - BG.vendidas(p.id) + BG.ajusteStock(p.id);
  BG.cajaCerrada = (fecha) => !!BG.db.config.cajaCerradaHasta && fecha <= BG.db.config.cajaCerradaHasta;
  BG.costoVenta = (v) => sum(v.items, (it) => (it.costoUnitGs || 0) * BG.cantidadViva(it));
  BG.gananciaVenta = (v) => v.total - BG.costoVenta(v);
  /**
   * Subtotal, descuento y total de una venta con lo que la clienta se quedó (sin las unidades devueltas).
   * Un descuento en % se recalcula solo; uno en ₲ se reparte en proporción a lo que queda, así una devolución
   * no se lleva el descuento entero. Sin devoluciones da exactamente lo mismo que al vender.
   */
  BG.totalesDe = (v, items) => {
    const its = items || v.items;
    const vivos = its.map((it) => ({ precio: it.precio, cantidad: BG.cantidadViva(it) }));
    const d = v.descuento;
    if (!d || !d.valor) return C.totalesVenta(vivos, null);
    if (d.tipo === 'porcentaje') return C.totalesVenta(vivos, { tipo: 'porcentaje', valor: d.valor });
    const t = C.totalesVenta(vivos, null);
    const lleno = sum(its, (it) => it.precio * it.cantidad);
    const base = Math.min(Math.round(Number(d.valor)), lleno);
    const monto = lleno > 0 ? Math.floor((2 * base * t.subtotal + lleno) / (2 * lleno)) : 0;
    return { subtotal: t.subtotal, descuento: monto, total: t.subtotal - monto };
  };

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

  /** Cuadre: saldo sumado cliente por cliente contra el libro (vendido − cobrado + lo que una devolución pasó a saldo a favor). */
  BG.cuadre = () => {
    const porClientes = sum(BG.db.clientes, (c) => BG.saldoCliente(c.id));
    const vivas = BG.db.ventas.filter((v) => !v.anulada);
    const ids = new Set(vivas.map((v) => v.id));
    const libro = sum(vivas, (v) => v.total) - sum(BG.db.pagos.filter((p) => !p.anulado && ids.has(p.ventaId)), (p) => p.total) + sum(vivas, (v) => v.aFavor || 0);
    return { porClientes: porClientes, libro: libro, ok: porClientes === libro };
  };

  /**
   * Cuadre de los saldos a favor. Lo que dice el registro de saldos a favor de cada cliente tiene que coincidir con lo que
   * se reconstruye de los hechos: excedentes y señas de pagos vivos − saldo a favor usado para pagar + pagos de ventas
   * anuladas + lo que las devoluciones pasaron a favor − lo que se le devolvió en plata. Y ningún saldo puede quedar negativo.
   */
  BG.cuadreFavor = () => {
    const esperado = new Map();
    const sumar = (cid, m) => { if (m) esperado.set(cid, (esperado.get(cid) || 0) + m); };
    for (const p of BG.db.pagos) {
      if (p.anulado) continue;
      sumar(p.clienteId, p.excedente || 0);
      sumar(p.clienteId, -sum(p.partes.filter((x) => x.forma === 'saldo'), (x) => x.monto));
    }
    for (const v of BG.db.ventas) {
      sumar(v.clienteId, v.aFavor || 0);
      if (v.anulada) sumar(v.clienteId, BG.pagadoVenta(v));
    }
    for (const e of BG.db.egresos || []) sumar(e.clienteId, -e.monto);
    for (const k of BG.db.canjes || []) sumar(k.clienteId, k.monto);
    const negativos = [];
    const diferencias = [];
    for (const c of BG.db.clientes) {
      const r = BG.creditoCliente(c.id);
      const e = esperado.get(c.id) || 0;
      if (r < 0) negativos.push(c);
      if (r !== e) diferencias.push({ c: c, registro: r, esperado: e });
    }
    const registro = sum(BG.db.creditos, (x) => x.monto);
    const reconstruido = sum(Array.from(esperado.values()));
    return { registro: registro, reconstruido: reconstruido, negativos: negativos, diferencias: diferencias, ok: !negativos.length && !diferencias.length && registro === reconstruido };
  };
  /** Clientes con saldo a favor (la tienda les debe), de mayor a menor. */
  BG.listaAFavor = () => BG.db.clientes
    .map((c) => ({ c: c, favor: BG.creditoCliente(c.id), debe: BG.saldoCliente(c.id) }))
    .filter((x) => x.favor > 0)
    .sort((a, b) => b.favor - a.favor);

  /* ── Cuotas con fecha ──────────────────────────────────────────────── */

  BG.FRECUENCIAS = { semanal: 'Semanal', quincenal: 'Cada 15 días', mensual: 'Mensual' };
  const sumarMeses = (iso, k) => {
    const p = iso.slice(0, 10).split('-').map(Number);
    const ultimo = new Date(p[0], p[1] - 1 + k + 1, 0).getDate();
    return isoLocal(new Date(p[0], p[1] - 1 + k, Math.min(p[2], ultimo)));
  };
  BG.sumarMeses = sumarMeses;
  /** Fechas de vencimiento: la primera y las siguientes cada semana, cada 15 días o el mismo día de cada mes. */
  BG.fechasCuotas = (primera, n, frecuencia) => Array.from({ length: n }, (x, i) => (frecuencia === 'mensual' ? sumarMeses(primera, i)
    : sumarDias(primera, i * (frecuencia === 'quincenal' ? 15 : 7))));
  /** Reparte el saldo en cuotas redondas (a mil); la diferencia va en la última, así la suma da exacto. */
  BG.repartirCuotas = (saldo, n) => {
    let base = Math.floor(saldo / n / 1000) * 1000;
    if (!base) base = Math.floor(saldo / n);
    const m = Array(n).fill(base);
    m[n - 1] = saldo - base * (n - 1);
    return m;
  };
  BG.primeraCuotaSugerida = (frecuencia, desde) => (frecuencia === 'mensual' ? sumarMeses(desde || hoy(), 1) : sumarDias(desde || hoy(), frecuencia === 'quincenal' ? 15 : 7));
  /**
   * Estado de cada cuota, calculado siempre desde el saldo real de la venta, así el plan nunca contradice al saldo:
   *  · lo que se pagó después de acordar el plan cancela las cuotas en orden, de la primera a la última;
   *  · si el total de la venta bajó (rebaja de precio o devolución), se descuenta de las últimas cuotas;
   *  · si subió (un cambio por algo más caro), la diferencia se suma a la última cuota.
   * Siempre: lo que falta de todas las cuotas = saldo de la venta.
   */
  BG.estadoPlan = (v) => {
    if (!v.plan || v.anulada) return null;
    const h = hoy();
    const pl = v.plan;
    const saldo = BG.saldoVenta(v);
    const pagadoAlAcordar = (pl.totalInicial != null ? pl.totalInicial : v.total) - pl.saldoInicial;
    const pagadoDesde = Math.max(0, BG.pagadoVenta(v) - pagadoAlAcordar);
    const montos = pl.cuotas.map((c) => c.monto);
    let dif = saldo + pagadoDesde - sum(montos);
    if (dif > 0) montos[montos.length - 1] += dif;
    for (let i = montos.length - 1; dif < 0 && i >= 0; i--) {
      const baja = Math.min(montos[i], -dif);
      montos[i] -= baja;
      dif += baja;
    }
    let cubierto = pagadoDesde;
    const cuotas = pl.cuotas.map((c, i) => {
      const pagado = Math.max(0, Math.min(montos[i], cubierto));
      cubierto -= pagado;
      const falta = montos[i] - pagado;
      const dias = diasEntre(h, c.vence);
      const estado = !montos[i] ? 'sinCargo' : !falta ? 'pagada' : dias < 0 ? 'vencida' : dias === 0 ? 'hoy' : dias <= 7 ? 'semana' : 'futura';
      return { n: i + 1, de: montos.length, vence: c.vence, monto: montos[i], pagado: pagado, falta: falta, dias: dias, estado: estado };
    });
    const vencidas = cuotas.filter((c) => c.estado === 'vencida');
    return { cuotas: cuotas, proxima: cuotas.find((c) => c.falta > 0) || null, vencidas: vencidas.length, atrasado: sum(vencidas, (c) => c.falta), saldo: saldo };
  };
  /** Todas las cuotas que faltan pagar, con su venta y su cliente, de la que vence antes a la que vence después. */
  BG.cuotasPendientes = () => {
    const out = [];
    for (const v of BG.db.ventas) {
      const e = BG.estadoPlan(v);
      if (!e) continue;
      e.cuotas.filter((c) => c.falta > 0).forEach((c) => out.push({ venta: v, cliente: BG.cliente(v.clienteId), cuota: c }));
    }
    return out.sort((a, b) => a.cuota.vence.localeCompare(b.cuota.vence) || a.cliente.nombre.localeCompare(b.cliente.nombre, 'es'));
  };
  BG.pillCuota = (c) => {
    if (c.estado === 'sinCargo') return '<span class="pill pill-muted">Ya no se paga (bajó el total)</span>';
    if (c.estado === 'pagada') return '<span class="pill pill-good">' + BG.icon('check') + 'Pagada</span>';
    if (c.estado === 'vencida') return '<span class="pill pill-bad">' + BG.icon('alert') + 'Atrasada ' + (-c.dias === 1 ? '1 día' : -c.dias + ' días') + '</span>';
    if (c.estado === 'hoy') return '<span class="pill pill-warn">' + BG.icon('clock') + 'Vence hoy</span>';
    if (c.estado === 'semana') return '<span class="pill pill-warn">' + BG.icon('clock') + (c.dias === 1 ? 'Vence mañana' : 'Vence en ' + c.dias + ' días') + '</span>';
    return '<span class="pill pill-muted">' + BG.icon('calendar') + 'Vence el ' + fmtFechaCorta(c.vence) + '</span>';
  };
  BG.textoRecordatorio = (cli, v, c) => 'Hola ' + cli.nombre.split(' ')[0] + ', te escribimos de ' + BG.db.config.tienda.nombre + '. '
    + (c.estado === 'vencida' ? 'El ' + fmtFecha(c.vence) + ' venció' : c.estado === 'hoy' ? 'Hoy vence' : 'El ' + fmtFecha(c.vence) + ' vence')
    + ' tu cuota ' + c.n + ' de ' + c.de + ' por ' + gs(c.falta) + ' (compra ' + fmtRecibo(v.recibo) + '). ¡Gracias!';

  /* ── Rotación del stock ────────────────────────────────────────────── */

  BG.DIAS_QUIETO = 30;
  /** Fecha de la última venta viva del producto (null si nunca se vendió). */
  BG.ultimaVentaDe = (pid) => {
    let f = null;
    for (const v of BG.db.ventas) {
      if (v.anulada || !v.items.some((it) => it.productoId === pid && BG.cantidadViva(it) > 0)) continue;
      if (!f || v.fecha > f) f = v.fecha;
    }
    return f;
  };
  /** Días que el producto lleva sin venderse (desde la última venta, o desde que se cargó si nunca se vendió). */
  BG.diasSinVender = (p) => diasEntre(BG.ultimaVentaDe(p.id) || p.fechaCarga, hoy());
  BG.vendidasDesde = (pid, desde) => sum(BG.db.ventas.filter((v) => !v.anulada && v.fecha >= desde),
    (v) => sum(v.items.filter((it) => it.productoId === pid), BG.cantidadViva));

  /* ── Meta y comisión de la vendedora ───────────────────────────────── */

  /**
   * Comisión de un usuario en un período: sobre lo cobrado de sus ventas (por fecha de cobro), menos lo que una devolución
   * pasó a saldo a favor. Con base 'ganancia', cada guaraní cobrado cuenta en la proporción de ganancia de su venta,
   * así un descuento grande achica la comisión. Una venta sin ganancia no suma. Las ventas anuladas no cuentan.
   */
  BG.comisionDe = (u, desde, hasta) => {
    const cfg = u.comision || {};
    const en = (f) => f >= desde && f <= hasta;
    const suyas = new Map(BG.db.ventas.filter((v) => v.usuario === u.nombre && !v.anulada).map((v) => [v.id, v]));
    const porVenta = new Map();
    const mover = (v, monto) => {
      if (!porVenta.has(v.id)) porVenta.set(v.id, { v: v, cobrado: 0 });
      porVenta.get(v.id).cobrado += monto;
    };
    for (const p of BG.db.pagos) {
      const v = suyas.get(p.ventaId);
      if (!v) continue;
      if (!p.anulado) { if (en(p.fecha)) mover(v, p.total); }
      else if (p.anulado.aFavorRevertido && en(p.anulado.fecha)) mover(v, p.anulado.aFavorRevertido);
    }
    suyas.forEach((v) => (v.devoluciones || []).forEach((d) => { if (d.aFavor && en(d.fecha)) mover(v, -d.aFavor); }));
    const pct = Number(cfg.porcentaje) || 0;
    const filas = [];
    porVenta.forEach((x) => {
      const ganancia = BG.gananciaVenta(x.v);
      const proporcion = x.v.total > 0 ? Math.max(0, ganancia) / x.v.total : 0;
      const base = cfg.base === 'cobrado' ? x.cobrado : x.cobrado * proporcion;
      filas.push({ v: x.v, cobrado: x.cobrado, ganancia: ganancia, ev: BG.evaluarPrecio(x.v.total, BG.costoVenta(x.v)), base: base, comision: (base * pct) / 100 });
    });
    filas.sort((a, b) => b.v.ts.localeCompare(a.v.ts));
    const vendidas = Array.from(suyas.values()).filter((v) => en(v.fecha));
    return {
      cobrado: sum(filas, (f) => f.cobrado), comision: Math.round(sum(filas, (f) => f.comision)), filas: filas,
      ventas: vendidas.length, vendido: sum(vendidas, (v) => v.total), meta: cfg.meta || 0, base: cfg.base || 'ganancia', porcentaje: pct,
    };
  };
  BG.mesActual = () => { const h = hoy(); return [h.slice(0, 8) + '01', h]; };
  BG.mesAnterior = () => { const fin = sumarDias(hoy().slice(0, 8) + '01', -1); return [fin.slice(0, 8) + '01', fin]; };

  /* ── Límite de crédito (lo configura el dueño; en el mostrador solo se ve el aviso) ── */

  BG.configCredito = () => Object.assign({ activo: false, limite: 0, diasAtraso: 15 }, BG.db.config.credito);
  /** Límite de la clienta: el suyo si Ariel le puso uno (0 = solo contado), si no el general. */
  BG.limiteDe = (c) => (c && c.limite != null ? c.limite : BG.configCredito().limite);
  /**
   * ¿Puede llevar a cuenta `extra` guaraníes más? Mira lo que ya debe contra su límite y si tiene cuotas atrasadas
   * más días de los permitidos. Devuelve { ok, motivos: ['sinCredito'|'limite'|'atraso'], limite, debe, nuevo, atraso }.
   */
  BG.estadoCredito = (cid, extra) => {
    const cfg = BG.configCredito();
    const c = BG.cliente(cid);
    const debe = BG.saldoCliente(cid);
    const nuevo = debe + (extra || 0);
    const limite = BG.limiteDe(c);
    let atraso = 0;
    for (const x of BG.cuotasPendientes()) if (x.cliente.id === cid && x.cuota.estado === 'vencida') atraso = Math.max(atraso, -x.cuota.dias);
    const motivos = [];
    if (cfg.activo && (extra || 0) > 0) {
      if (limite === 0) motivos.push('sinCredito');
      else if (limite > 0 && nuevo > limite) motivos.push('limite');
      if (atraso > cfg.diasAtraso) motivos.push('atraso');
    }
    return { ok: !motivos.length, motivos: motivos, limite: limite, debe: debe, nuevo: nuevo, atraso: atraso, activo: cfg.activo };
  };
  /** Aviso corto y concreto para el mostrador. */
  BG.textoCredito = (e) => {
    const partes = [];
    if (e.motivos.indexOf('sinCredito') >= 0) partes.push('compra solo al contado');
    if (e.motivos.indexOf('limite') >= 0) partes.push('con esta venta debería ' + gs(e.nuevo) + ' y su límite es ' + gs(e.limite));
    if (e.motivos.indexOf('atraso') >= 0) partes.push('tiene una cuota atrasada hace ' + e.atraso + ' días');
    return partes.join(' y ');
  };

  /* ── Clientas frecuentes: puntos, cumpleaños y compras ─────────────── */

  BG.configFidelidad = () => {
    const f = Object.assign({ activo: false, cadaGs: 10000, valorPunto: 300, minimo: 50, desde: '0000-00-00' }, BG.db.config.fidelidad);
    f.cumple = Object.assign({ activo: false, porcentaje: 10 }, f.cumple);
    return f;
  };
  /** Parte de los pagos vivos de una venta que se hizo con saldo a favor que venía de puntos canjeados. */
  BG.canjeEnVenta = (v) => sum(BG.pagosDeVenta(v.id), (p) => sum(p.partes, (x) => x.deCanje || 0));
  /** Lo pagado con puntos que sigue aplicado a la venta (si una devolución pasó plata a favor, vuelve primero lo de puntos). */
  BG.canjeAplicado = (v) => { const c = BG.canjeEnVenta(v); return c - Math.min(v.aFavor || 0, c); };
  /** Saldo a favor de la clienta que viene de puntos canjeados y todavía no se usó. Se usa en compras; no se devuelve en plata. */
  BG.canjeDisponible = (cid) => {
    const canjeado = sum((BG.db.canjes || []).filter((k) => k.clienteId === cid), (k) => k.monto);
    const usado = sum(BG.ventasDeCliente(cid).filter((v) => !v.anulada), BG.canjeAplicado);
    return Math.max(0, Math.min(BG.creditoCliente(cid), canjeado - usado));
  };
  /**
   * Puntos: cada compra suma recién cuando queda pagada del todo (en contado al momento, en cuotas al pagar la última),
   * 1 punto cada `cadaGs` de su total, sin contar lo que se pagó con puntos. Los pagos parciales no suman nada.
   * Si la compra se anula no suma; si una devolución baja el total, suma sobre el total nuevo.
   * Devuelve { puntos (disponibles), valor, canjeable, ganados, canjeados, pendientes (de compras sin terminar de pagar), porGanar }.
   */
  BG.puntosDe = (cid) => {
    const f = BG.configFidelidad();
    if (!f.activo) return null;
    let ganados = 0;
    let pendientes = 0;
    const porGanar = [];
    for (const v of BG.ventasDeCliente(cid)) {
      if (v.anulada || v.fecha < f.desde) continue;
      const pts = Math.floor(Math.max(0, v.total - BG.canjeAplicado(v)) / f.cadaGs);
      if (!pts) continue;
      if (BG.saldoVenta(v) <= 0) ganados += pts;
      else { pendientes += pts; porGanar.push({ v: v, puntos: pts }); }
    }
    const canjeados = sum((BG.db.canjes || []).filter((k) => k.clienteId === cid), (k) => k.puntos);
    const puntos = Math.max(0, ganados - canjeados);
    return { puntos: puntos, valor: puntos * f.valorPunto, canjeable: puntos >= f.minimo, ganados: ganados, canjeados: canjeados, pendientes: pendientes, porGanar: porGanar };
  };
  /** Puntos que suma una venta cuando se termine de pagar (0 si el programa está apagado o no llega a 1 punto). */
  BG.puntosDeVenta = (v) => {
    const f = BG.configFidelidad();
    if (!f.activo || v.anulada || v.fecha < f.desde) return 0;
    return Math.floor(Math.max(0, v.total - BG.canjeAplicado(v)) / f.cadaGs);
  };
  /** Próximo cumpleaños: días que faltan (negativo si fue hace poco) y si está en la semana del regalo (7 días antes o después). */
  BG.cumpleDe = (c) => {
    if (!c || !c.cumple) return null;
    const h = hoy();
    const md = c.cumple.split('-').map(Number);
    const y = Number(h.slice(0, 4));
    let fecha = isoLocal(new Date(y, md[0] - 1, md[1]));
    let dias = diasEntre(h, fecha);
    if (dias < -7) { fecha = isoLocal(new Date(y + 1, md[0] - 1, md[1])); dias = diasEntre(h, fecha); }
    return { fecha: fecha, dias: dias, enSemana: Math.abs(dias) <= 7, hoy: dias === 0 };
  };
  BG.textoCumple = (k) => (k.hoy ? 'hoy' : k.dias === 1 ? 'mañana' : k.dias === -1 ? 'ayer' : k.dias > 0 ? 'en ' + k.dias + ' días' : 'hace ' + (-k.dias) + ' días');
  /** ¿Ya usó el regalo de este cumpleaños? (una venta viva con el descuento de cumpleaños dentro de la semana del regalo). */
  BG.regaloCumpleUsado = (cid) => {
    const k = BG.cumpleDe(BG.cliente(cid));
    if (!k) return false;
    const desde = sumarDias(k.fecha, -7);
    const hasta = sumarDias(k.fecha, 7);
    return BG.db.ventas.some((v) => v.clienteId === cid && !v.anulada && v.fecha >= desde && v.fecha <= hasta && v.descuento && v.descuento.motivo === 'Cumpleaños');
  };
  /** Regalo de cumpleaños disponible ahora ({ porcentaje, cumple }) o null. */
  BG.regaloCumple = (cid) => {
    const f = BG.configFidelidad();
    const k = BG.cumpleDe(BG.cliente(cid));
    if (!f.activo || !f.cumple.activo || !k || !k.enSemana || BG.regaloCumpleUsado(cid)) return null;
    return { porcentaje: f.cumple.porcentaje, cumple: k };
  };
  BG.comprasRecientes = (cid, dias) => BG.db.ventas.filter((v) => v.clienteId === cid && !v.anulada && v.fecha >= sumarDias(hoy(), -(dias || 90)));
  /** Frecuente: 2 compras o más en los últimos 90 días. */
  BG.esFrecuente = (cid) => BG.comprasRecientes(cid, 90).length >= 2;

  /* ── Gastos y ganancia neta ────────────────────────────────────────── */

  BG.CATEGORIAS_GASTO = ['Alquiler', 'Servicios (luz, agua, internet)', 'Bolsas y empaque', 'Envíos y courier', 'Publicidad', 'Sueldos', 'Otros'];
  BG.FORMAS_GASTO = { caja: 'Efectivo de la caja', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro (fuera de la caja)' };
  BG.gastosVivos = () => (BG.db.gastos || []).filter((g) => !g.anulado);
  /**
   * Estado de resultados de un período: ventas netas − costo congelado = ganancia bruta; menos los gastos cargados, los fletes
   * que pagó la tienda (de Envíos), la comisión estimada de la vendedora y los puntos canjeados = ganancia neta.
   */
  BG.resultado = (desde, hasta) => {
    const en = (f) => f >= desde && f <= hasta;
    const ventas = BG.db.ventas.filter((v) => !v.anulada && en(v.fecha));
    const ventasNetas = sum(ventas, (v) => v.total);
    const costo = sum(ventas, BG.costoVenta);
    const gastos = BG.gastosVivos().filter((g) => en(g.fecha));
    const porCategoria = {};
    gastos.forEach((g) => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.monto; });
    const fletes = sum(BG.db.envios.filter((x) => x.flete.paga === 'tienda' && x.estado !== 'cancelado' && en(x.creado.slice(0, 10))), (x) => x.flete.monto);
    const comision = sum(BG.db.usuarios.filter((u) => u.comision && u.comision.activa), (u) => BG.comisionDe(u, desde, hasta).comision);
    const beneficios = sum((BG.db.canjes || []).filter((k) => en(k.fecha)), (k) => k.monto);
    const cargados = sum(gastos, (g) => g.monto);
    const totalGastos = cargados + fletes + comision + beneficios;
    return {
      ventas: ventas.length, ventasNetas: ventasNetas, costo: costo, bruta: ventasNetas - costo, gastos: gastos, porCategoria: porCategoria,
      cargados: cargados, fletes: fletes, comision: comision, beneficios: beneficios, totalGastos: totalGastos, neta: ventasNetas - costo - totalGastos,
    };
  };

  /* ── Pedidos al proveedor ──────────────────────────────────────────── */

  BG.ESTADOS_PEDIDO = { pedido: 'Pedido', en_camino: 'En camino', recibido: 'Llegó', cancelado: 'Cancelado' };
  BG.estadoPedido = (p) => p.estado || 'recibido';
  BG.pillPedido = (p) => {
    const e = BG.estadoPedido(p);
    const cls = { pedido: 'pill-muted', en_camino: 'pill-warn', recibido: 'pill-good', cancelado: 'pill-muted' }[e];
    const ic = { pedido: 'clock', en_camino: 'truck', recibido: 'check', cancelado: 'ban' }[e];
    return '<span class="pill ' + cls + '">' + BG.icon(ic) + BG.ESTADOS_PEDIDO[e] + '</span>';
  };
  /** Costo en dólares de las filas de un pedido (costo × cantidad), con los números como se escriben acá (coma decimal). */
  BG.totalUSDPedido = (items) => {
    let t = C.Q(0n);
    for (const it of items || []) {
      const q = C.parseNum(it.costo, 'decimal');
      const n = C.parseEntero(it.cant) || 0;
      if (q) t = C.add(t, C.mul(q, C.Q(BigInt(n))));
    }
    return t;
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
  BG.MOTIVOS_PRECIO = ['Promoción', 'Cliente frecuente', 'Cumpleaños', 'Detalle en la prenda', 'Liquidación', 'Otro'];
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
  BG.rebajaVenta = (v) => sum(v.items, (it) => (it.precioLista != null ? (it.precioLista - it.precio) * BG.cantidadViva(it) : 0)) + (v.descuento ? v.descuento.monto : 0);
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
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z"/>',
    auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    wallet: '<path d="M18.5 7.5V5.8a1.3 1.3 0 0 0-1.3-1.3H6a2.5 2.5 0 0 0 0 5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a2.5 2.5 0 0 1-2.5-2.5V7"/><circle cx="16" cy="14.5" r="1.3" fill="currentColor"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    trend: '<path d="M3.5 17 9 11.5l4 4 7.5-8"/><path d="M15 7.5h5.5V13"/>',
    pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
    gasto: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M8 12h8"/>',
    count: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v14h12V6a2 2 0 0 0-2-2"/><path d="m9 11 2 2 4-4M9 17h6"/>',
    gift: '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M2.5 9h19V6h-19zM12 6v14.5"/><path d="M12 6c-1.5-3-5.5-3.5-5.5-1S10 6 12 6Zm0 0c1.5-3 5.5-3.5 5.5-1S14 6 12 6Z"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>',
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
        // Si otro control ya usó el Enter (por ejemplo, elegir una opción de un buscador), no se confirma el diálogo.
        if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || !t || t.tagName !== 'INPUT' || /^(checkbox|radio|file|button|submit)$/.test(t.type)) return;
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
    const favor = BG.creditoCliente(c.id);
    return '<span class="avatar">' + esc(iniciales(c.nombre)) + '</span>'
      + '<span class="row-main"><span class="row-title">' + (q ? BG.resaltar(c.nombre, q) : esc(c.nombre)) + '</span>'
      + '<span class="row-sub">' + (c.ci ? (c.ci.includes('-') ? 'RUC ' : 'CI ') + esc(c.ci) + ' · ' : '') + esc(c.telefono) + '</span></span>'
      + '<span class="row-end">' + (saldo > 0 || !favor ? BG.pillSaldo(saldo) : '') + (saldo > 0 ? BG.edad(BG.deudaMasAntigua(c.id)) : '')
      + (favor > 0 ? BG.pillFavor(favor) : '') + '</span>';
  };
  /** Pastilla dorada de saldo a favor: se ve en listas, buscadores y fichas para que nadie se olvide de usarlo. */
  BG.pillFavor = (monto, largo) => '<span class="pill pill-favor">' + icon('wallet') + (largo ? 'Saldo a favor ' : 'A favor ') + gs(monto) + '</span>';

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
    [/^\/cuotas$/, 'cuotas'],
    [/^\/cobros\/nuevo$/, 'cobro', 'registrarCobros'],
    [/^\/productos$/, 'productos', 'verPrecios'],
    [/^\/productos\/nuevo$/, 'productoNuevo', true],
    [/^\/productos\/pedido$/, 'pedido', true],
    [/^\/productos\/importar$/, 'importar', true],
    [/^\/productos\/conteo$/, 'conteo', true],
    [/^\/pedidos$/, 'pedidos', true],
    [/^\/pedidos\/nuevo$/, 'pedidoForm', true],
    [/^\/pedidos\/([\w-]+)\/editar$/, 'pedidoForm', true],
    [/^\/pedidos\/([\w-]+)$/, 'pedidoDetalle', true],
    [/^\/gastos$/, 'gastos', true],
    [/^\/envios$/, 'envios', 'prepararEnvios'],
    [/^\/envios\/nuevo$/, 'envioForm', 'prepararEnvios'],
    [/^\/envios\/([\w-]+)\/editar$/, 'envioForm', 'prepararEnvios'],
    [/^\/envios\/([\w-]+)\/etiqueta$/, 'etiqueta', 'prepararEnvios'],
    [/^\/envios\/([\w-]+)$/, 'envio', 'prepararEnvios'],
    [/^\/resumen$/, 'resumen', true],
    [/^\/reportes$/, 'reportes', true],
    [/^\/caja$/, 'caja', 'verCaja'],
    [/^\/ajustes$/, 'ajustes', true],
    [/^\/ajustes\/excel$/, 'migracion', true],
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
      ['cuotas', 'Cuotas', 'calendar'],
      BG.puede('registrarCobros') && ['cobros/nuevo', 'Cobrar', 'cash'],
      BG.puede('prepararEnvios') && ['envios', 'Envíos', 'truck'],
      BG.puede('verCaja') && ['caja', 'Caja del día', 'register'],
      ['-'],
      BG.puede('verPrecios') && ['productos', d ? 'Productos' : 'Lista de precios', 'box'],
      d && ['pedidos', 'Pedidos', 'box2'],
      d && ['gastos', 'Gastos', 'gasto'],
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
    // Franja de arriba: dice siempre qué datos se están viendo (los de ejemplo o los reales del Excel).
    const mios = BG.modoDatos === 'mios';
    const franja = $('#mock-strip');
    franja.classList.toggle('mock-strip-mios', mios);
    franja.innerHTML = mios
      ? '<span><strong>Tus datos del Excel</strong><span class="mock-largo"> · guardados solo en este navegador, aparte de los de ejemplo</span></span>'
        + '<button type="button" class="linkish" data-action="modo-ejemplo">Ver los de ejemplo</button>'
      : '<span><strong>Mockup para aprobar</strong><span class="mock-largo"> · datos de ejemplo guardados solo en este navegador</span>'
        + '<span class="mock-corto"> · datos de ejemplo</span></span>'
        + (d && BG.infoMisDatos() ? '<button type="button" class="linkish" data-action="modo-mios">Ver mis datos</button>' : '')
        + '<button type="button" class="linkish" data-action="guia">Guía de prueba</button>';
    const duenio = BG.db.usuarios.find((x) => x.rol === 'admin');
    const vendedora = BG.db.usuarios.find((x) => x.rol === 'vendedor');
    $('#topbar-actions').innerHTML = '<span class="small muted hide-mobile">Ver como</span>'
      + '<div class="seg hide-mobile" role="group" aria-label="Ver el sistema como">'
      + '<button type="button" data-action="rol" data-rol="admin" aria-pressed="' + d + '">' + esc(duenio.nombre) + '</button>'
      + '<button type="button" data-action="rol" data-rol="vendedor" aria-pressed="' + !d + '">' + esc(vendedora.nombre) + '</button></div>'
      + (mios ? '' : '<button type="button" class="btn btn-quiet hide-mobile" data-action="guia">' + icon('guide') + '<span>Guía</span></button>')
      + '<button type="button" class="btn-icon btn-tema" data-action="tema" aria-label="Tema: ' + BG.TEMAS[BG.tema()].toLowerCase() + ' (tocá para cambiar)" title="Tema: ' + BG.TEMAS[BG.tema()].toLowerCase() + '">' + icon(BG.ICONO_TEMA[BG.tema()]) + '</button>'
      + (BG.puede('registrarVentas') ? '<a class="btn btn-primary hide-mobile" href="#/ventas/nueva">' + icon('plus') + '<span>Nueva venta</span></a>' : '')
      + (mios ? '' : '<button type="button" class="btn-icon show-mobile" data-action="guia" aria-label="Guía de prueba">' + icon('guide') + '</button>');
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
      + '<div class="mock-strip" id="mock-strip" role="note"></div>'
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
      + item('#/cuotas', 'calendar', 'Cuotas')
      + (BG.puede('prepararEnvios') ? item('#/envios', 'truck', 'Envíos') : '')
      + (BG.puede('verPrecios') ? item('#/productos', 'box', d ? 'Productos' : 'Lista de precios') : '')
      + (BG.puede('verCaja') ? item('#/caja', 'register', 'Caja del día') : '')
      + (d ? item('#/pedidos', 'box2', 'Pedidos al proveedor') + item('#/gastos', 'gasto', 'Gastos y ganancia neta')
        + item('#/resumen', 'pie', 'Resumen') + item('#/reportes', 'chart', 'Reportes') + item('#/auditoria', 'audit', 'Auditoría') + item('#/ajustes', 'sliders', 'Ajustes') : '')
      + '<div class="sheet-sep"></div>'
      + '<div class="sheet-tema"><span class="small muted">Tema</span>' + BG.selectorTema() + '</div>'
      + (BG.modoDatos === 'mios' ? '<button type="button" class="sheet-item" data-action="modo-ejemplo" data-cerrar-hoja>' + icon('refresh') + 'Ver los datos de ejemplo</button>'
        : '<button type="button" class="sheet-item" data-action="guia" data-cerrar-hoja>' + icon('guide') + 'Guía de prueba</button>')
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
    else if (a === 'tema') {
      e.preventDefault();
      const orden = ['auto', 'claro', 'oscuro'];
      const t = orden[(orden.indexOf(BG.tema()) + 1) % orden.length];
      BG.cambiarTema(t);
      BG.toast('Tema: ' + BG.TEMAS[t].toLowerCase() + (t === 'auto' ? ' (sigue al del teléfono o la computadora)' : '') + '.');
    }
    else if (a === 'mas') { e.preventDefault(); abrirMas(); }
    else if (a === 'modo-ejemplo' || a === 'modo-mios') {
      e.preventDefault();
      try {
        if (a === 'modo-mios') BG.usarMisDatos(); else BG.usarDatosDeEjemplo();
      } catch (err) { BG.toast(err.message, 'error'); return; }
      const guia = $('#guide');
      if (guia) guia.hidden = true;
      renderChrome();
      BG.toast(a === 'modo-mios' ? 'Estás viendo tus datos del Excel.' : 'Estás viendo los datos de ejemplo. Tus datos del Excel siguen guardados.');
      if (location.hash === '#/inicio') BG.render(); else BG.ir('#/inicio');
    }
    else if (a === 'rol') { e.preventDefault(); BG.cambiarRol(b.dataset.rol); }
    else if (a === 'salir') {
      e.preventDefault();
      BG.sesion = null;
      BG.guardarSesion();
      location.hash = '#/inicio';
      BG.render();
    }
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tema]');
    if (b) { e.preventDefault(); BG.cambiarTema(b.dataset.tema); }
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

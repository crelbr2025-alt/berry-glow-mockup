/*!
 * berry.Glow_py — Traer los datos del Excel con el que trabajaba la tienda («Plan de ventas SHEIN»).
 *
 * Cada hoja del Excel es un pedido de SHEIN: una fila por prenda, con el precio de SHEIN (US$), el margen,
 * el precio sugerido en ₲, el precio al que se vendió, a quién, hasta tres entregas de plata y el saldo.
 *
 *  · analizar(hojas, opciones): entiende cada hoja, recalcula lo que el Excel suma mal, junta los nombres
 *    escritos de distintas formas y propone qué nombres son la misma clienta. No modifica nada.
 *  · construir(plan, decisiones, entorno): arma una base de datos NUEVA y separada (clientas, pedidos,
 *    productos, ventas, pagos y saldos a favor). Es una función pura: la pantalla decide si se guarda.
 *
 * Funciona igual en el navegador y en Node (las pruebas la usan con el Excel real, que nunca se publica).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BGMigracion = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const SIN_NOMBRE = 'Sin nombre (del Excel)';
  const COTIZACION_EXCEL = 8000;
  const TARIFA_EXCEL = '22';

  const sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clave = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const texto = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const pad = (n) => String(n).padStart(2, '0');
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const iso = (a, m, d) => a + '-' + pad(m + 1) + '-' + pad(d);

  function lev(a, b) {
    const m = a.length;
    const n = b.length;
    let prev = Array.from({ length: n + 1 }, (x, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  /** «ROSA GIMENEZ» o «rosa gimenez» → «Rosa Gimenez»; lo escrito con mayúsculas a propósito («Ana RD») se respeta. */
  function nombrePropio(s) {
    const t = texto(s);
    const letras = t.replace(/[^\p{L}]/gu, '');
    if (letras && letras !== letras.toLowerCase() && letras !== letras.toUpperCase()) return t;
    return t.toLowerCase().split(' ').map((w, i) => (i > 0 && ['de', 'del', 'la', 'y'].indexOf(w) >= 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  /** «MANGA LARGA A RAYAS» o «top tirantes» → «Manga larga a rayas» / «Top tirantes». */
  function descripcion(s) {
    let t = texto(s);
    const letras = t.replace(/[^\p{L}]/gu, '');
    if (letras && letras === letras.toUpperCase()) t = t.toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const ACCESORIOS = /\b(collar|collares|pulsera|aro|aros|pendiente|pendientes|pinza|pinzas|clip|clips|hebilla|funda|protector|cinto|cintos|cinturon|anillo|gorro|bolso|cartera|lentes|reloj|llavero|girasol|afeitadora|set|piezas|pesonera|pasador|vincha|diadema|broche|cadena)\b/;
  const categoria = (s) => (ACCESORIOS.test(clave(s)) ? 'Accesorio' : 'Prenda');

  /* ── Columnas por su encabezado (el Excel usa «Nombre» en la fila 1 y el resto en la fila 2) ── */

  const ENCABEZADOS = [
    ['producto', /^producto$/],
    ['shein', /^precio shein/],
    ['margen', /^margen/],
    ['sugerido', /^precio venta gs/],
    ['vendido', /^precio vendido/],
    ['cambio', /^tipo de cambio/],
    ['cliente', /^nombre$/],
    ['saldo', /^saldo$/],
    ['pagado', /^pagado$/],
  ];
  function columnas(filas) {
    const col = { entregas: [], filaEncabezado: -1 };
    for (let r = 0; r < Math.min(filas.length, 6); r++) {
      (filas[r] || []).forEach((v, c) => {
        const k = clave(v);
        if (!k) return;
        if (/^entrega \d+$/.test(k)) { col.entregas.push(c); col.filaEncabezado = Math.max(col.filaEncabezado, r); return; }
        for (const [campo, re] of ENCABEZADOS) {
          if (col[campo] == null && re.test(k)) {
            col[campo] = c;
            if (campo !== 'cliente') col.filaEncabezado = Math.max(col.filaEncabezado, r);
          }
        }
      });
    }
    col.entregas.sort((a, b) => a - b);
    return col;
  }

  /* ── Fechas: el Excel no tiene fecha por venta; se usa la del nombre de la hoja ── */

  function mesDe(w) {
    if (!w) return -1;
    const exacto = MESES.indexOf(w);
    if (exacto >= 0) return exacto;
    return w.length >= 4 ? MESES.findIndex((m) => m.startsWith(w)) : -1;
  }
  function fechaDeNombre(nombre) {
    const k = clave(nombre);
    const palabras = k.split(' ');
    let dia = null;
    let mes = null;
    const m = /(\d{1,2}) de ([a-z]+)/.exec(k);
    if (m && mesDe(m[2]) >= 0) { dia = Number(m[1]); mes = mesDe(m[2]); }
    if (mes == null) for (const w of palabras) { const i = mesDe(w); if (i >= 0) { mes = i; break; } }
    const a = /\b(20\d\d)\b/.exec(k);
    let parcial = null;
    // Nombre cortado por el límite de 31 letras de Excel: «… ma» puede ser marzo o mayo.
    if (mes == null) {
      const ult = palabras[palabras.length - 1];
      if (ult && ult.length >= 2 && /^[a-z]+$/.test(ult)) {
        const cand = MESES.map((x, i) => (x.startsWith(ult) ? i : -1)).filter((i) => i >= 0);
        if (cand.length) parcial = cand;
      }
    }
    return { dia: dia, mes: mes, anio: a ? Number(a[1]) : null, parcial: parcial };
  }
  /** Fecha de cada hoja: la del nombre; si solo dice el mes, el día 1; si no dice nada, la de la hoja anterior. */
  function resolverFechas(nombres, hoy) {
    const [ay, am] = hoy.split('-').map(Number);
    const out = [];
    let mesPrevio = null;
    for (const n of nombres) {
      const f = fechaDeNombre(n);
      let mes = f.mes;
      if (mes == null && f.parcial) mes = f.parcial.find((i) => mesPrevio == null || i >= mesPrevio) ?? f.parcial[0];
      if (mes == null) { out.push(null); continue; }
      const anio = f.anio || (mes + 1 <= am ? ay : ay - 1);
      let fecha = iso(anio, mes, f.dia || 1);
      if (fecha > hoy) fecha = hoy;
      out.push({ fecha: fecha, tipo: f.dia ? 'exacta' : 'mes' });
      mesPrevio = mes;
    }
    for (let i = 0; i < out.length; i++) {
      if (out[i]) continue;
      const antes = out.slice(0, i).reverse().find(Boolean);
      const despues = out.slice(i + 1).find(Boolean);
      out[i] = { fecha: (antes || despues || { fecha: hoy }).fecha, tipo: 'estimada' };
    }
    return out;
  }

  /* ── Lectura de una hoja ── */

  function leerHoja(h, indice) {
    const col = columnas(h.filas || []);
    const reconocida = col.producto != null && col.vendido != null && col.cliente != null;
    const hoja = { indice: indice, nombre: h.nombre, oculta: !!h.oculta, reconocida: reconocida, cambio: null, items: [], notas: [], totalesExcel: null };
    if (!reconocida) return hoja;
    for (let r = col.filaEncabezado + 1; r < (h.filas || []).length; r++) {
      const f = h.filas[r] || [];
      const producto = texto(f[col.producto]);
      if (hoja.cambio == null && col.cambio != null && num(f[col.cambio])) hoja.cambio = num(f[col.cambio]);
      if (!producto) {
        // La primera fila sin producto que tiene números es la de totales del Excel: se guarda para comparar.
        if (!hoja.totalesExcel && num(f[col.vendido]) != null) hoja.totalesExcel = { fila: r + 1, vendido: num(f[col.vendido]), saldo: col.saldo != null ? num(f[col.saldo]) : null };
        continue;
      }
      const cliente = texto(f[col.cliente]);
      const vendido = num(f[col.vendido]);
      const shein = col.shein != null ? num(f[col.shein]) : null;
      // «total gastado», «envío 270.000gs»: anotaciones de costos al pie de la hoja, no son prendas.
      if (/^(total|envio|gasto)/.test(clave(producto)) && !cliente && !vendido && shein == null) {
        const extra = col.shein != null ? texto(f[col.shein]) : '';
        hoja.notas.push({ fila: r + 1, texto: producto + (extra ? ': ' + extra : '') });
        continue;
      }
      hoja.items.push({
        hoja: indice, fila: r + 1, producto: producto, shein: shein, margen: col.margen != null ? num(f[col.margen]) : null,
        sugerido: col.sugerido != null ? num(f[col.sugerido]) : null, vendido: vendido && vendido > 0 ? Math.round(vendido) : null, cliente: cliente,
        entregas: col.entregas.map((c) => Math.round(num(f[c]) || 0)), saldoExcel: col.saldo != null ? num(f[col.saldo]) : null,
        pagadoExcel: col.pagado != null ? f[col.pagado] === true : null,
      });
    }
    hoja.cambio = hoja.cambio || COTIZACION_EXCEL;
    return hoja;
  }

  /** «Ana/luz» → Ana (compra compartida); «ana 15 luz 15» → ana (compra compartida). */
  function titular(nombre) {
    const t = texto(nombre);
    if (t.indexOf('/') >= 0) return { nombre: t.split('/')[0].trim(), compartida: true };
    const m = /^([^\d]+?)\s+\d+\s+\D/.exec(t);
    if (m) return { nombre: m[1].trim(), compartida: true };
    return { nombre: t, compartida: false };
  }

  /* ── Nombres: los que son iguales sin mayúsculas ni tildes se juntan solos; los parecidos se proponen ── */

  const GENERICOS = /^(senor|senora|sr|sra|don|dona|cliente|clienta|boutique|tienda|encomienda|local)$/;

  function agruparClientas(items) {
    const porClave = new Map();
    for (const it of items) {
      if (!it.cliente || !it.vendido) continue;
      const t = titular(it.cliente);
      const k = clave(t.nombre);
      if (!k) continue;
      if (!porClave.has(k)) porClave.set(k, { clave: k, formas: new Map(), filas: 0, vendido: 0, compartidas: [] });
      const e = porClave.get(k);
      e.formas.set(t.nombre, (e.formas.get(t.nombre) || 0) + 1);
      e.filas++;
      e.vendido += it.vendido;
      if (t.compartida) e.compartidas.push(it.cliente);
      it.claveCliente = k;
    }
    const claves = Array.from(porClave.keys());
    const pares = [];
    const partes = (k) => { const w = k.split(' '); return { nombre: w[0], apellido: w.slice(1).join(' ') }; };
    for (let i = 0; i < claves.length; i++) {
      for (let j = i + 1; j < claves.length; j++) {
        const a = claves[i];
        const b = claves[j];
        const pa = partes(a);
        const pb = partes(b);
        const d = lev(pa.nombre, pb.nombre);
        const prefijo = pa.nombre.startsWith(pb.nombre) || pb.nombre.startsWith(pa.nombre);
        let motivo = null;
        // Palabras que no son un nombre («señor», «boutique»): nunca se juntan por parecido.
        if (GENERICOS.test(pa.nombre) || GENERICOS.test(pb.nombre)) continue;
        if (pa.apellido && pa.apellido === pb.apellido && (d <= 2 || prefijo)) motivo = 'mismo apellido';
        else if (!pa.apellido && !pb.apellido && Math.min(pa.nombre.length, pb.nombre.length) >= 5 && d <= 1) motivo = 'se escribe casi igual';
        else if ((!pa.apellido) !== (!pb.apellido)) {
          // «Rosa» y «Rosa Gimenez»: solo si todas las clientas completas que se llaman así tienen el mismo
          // apellido (si hay una Rosa Gimenez y una Rosa Duarte no se sabe cuál es, así que no se propone nada).
          const corta = pa.apellido ? pb : pa;
          const larga = pa.apellido ? a : b;
          const candidatas = claves.filter((k) => partes(k).apellido && (partes(k).nombre === corta.nombre || lev(partes(k).nombre, corta.nombre) <= 1));
          const apellidos = new Set(candidatas.map((k) => partes(k).apellido));
          if (apellidos.size === 1 && (partes(larga).nombre === corta.nombre || (corta.nombre.length >= 5 && lev(partes(larga).nombre, corta.nombre) <= 1))) motivo = 'le falta el apellido';
        }
        if (motivo) pares.push([a, b, motivo]);
      }
    }
    // Componentes conectados: cada uno es una propuesta de «misma persona».
    const padre = new Map(claves.map((k) => [k, k]));
    const raiz = (k) => { while (padre.get(k) !== k) k = padre.get(k); return k; };
    pares.forEach(([a, b]) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) padre.set(ra, rb); });
    const comp = new Map();
    claves.forEach((k) => { const r = raiz(k); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(k); });
    const entidades = claves.map((k) => {
      const e = porClave.get(k);
      return { clave: k, formas: Array.from(e.formas.entries()).sort((x, y) => y[1] - x[1]), filas: e.filas, vendido: e.vendido, compartidas: e.compartidas };
    });
    const porK = new Map(entidades.map((e) => [e.clave, e]));
    const grupos = [];
    let g = 0;
    comp.forEach((ks) => {
      if (ks.length < 2) return;
      const miembros = ks.map((k) => porK.get(k)).sort((x, y) => y.filas - x.filas);
      grupos.push({
        id: 'g' + (++g), claves: miembros.map((m) => m.clave), nombre: mejorNombre(miembros.map((m) => m.formas).flat()),
        motivos: Array.from(new Set(pares.filter((p) => ks.indexOf(p[0]) >= 0).map((p) => p[2]))),
      });
    });
    return { entidades: entidades, grupos: grupos };
  }
  /** El nombre más completo: más palabras, con tildes, el más usado; con mayúsculas bien puestas. */
  function mejorNombre(formas) {
    const lista = formas.slice().sort((x, y) => {
      const px = texto(x[0]).split(' ').length;
      const py = texto(y[0]).split(' ').length;
      if (px !== py) return py - px;
      const tx = /[^\x00-\x7f]/.test(x[0]) ? 1 : 0;
      const ty = /[^\x00-\x7f]/.test(y[0]) ? 1 : 0;
      if (tx !== ty) return ty - tx;
      return y[1] - x[1];
    });
    return nombrePropio(lista[0][0].replace(/[.\s]+$/, ''));
  }

  /* ── Análisis completo ── */

  function analizar(hojasCrudas, opciones) {
    const hoy = (opciones && opciones.hoy) || new Date().toISOString().slice(0, 10);
    const hojas = hojasCrudas.map((h, i) => leerHoja(h, i));
    const fechas = resolverFechas(hojas.map((h) => h.nombre), hoy);
    hojas.forEach((h, i) => {
      h.fecha = fechas[i].fecha;
      h.fechaTipo = fechas[i].tipo;
      h.usarPorDefecto = h.reconocida && !h.oculta && h.items.length > 0;
      const vendidos = h.items.filter((it) => it.vendido);
      h.resumen = {
        articulos: h.items.length, vendidos: vendidos.length, vendido: sum(vendidos, (it) => it.vendido),
        cobrado: sum(h.items, (it) => sum(it.entregas)), enStock: h.items.filter((it) => !it.vendido).length,
        costoUSD: Math.round(sum(h.items, (it) => it.shein || 0) * 100) / 100,
      };
      // Lo que falta cobrar según las filas (vendido − entregas); negativo = pagó de más.
      h.resumen.saldo = sum(h.items, (it) => (it.vendido || 0) - sum(it.entregas));
      h.totalMal = !!(h.totalesExcel && h.totalesExcel.saldo != null && Math.round(h.totalesExcel.saldo) !== h.resumen.saldo);
    });
    const usadas = hojas.filter((h) => h.usarPorDefecto);
    const items = [].concat(...usadas.map((h) => h.items));
    const clientas = agruparClientas(items);
    const p = {
      totalesMal: usadas.filter((h) => h.totalMal).map((h) => ({ hoja: h.nombre, excel: Math.round(h.totalesExcel.saldo), real: h.resumen.saldo })),
      sinNombre: items.filter((it) => it.vendido && !it.cliente),
      sinPrecio: items.filter((it) => !it.vendido && it.cliente),
      pagoDeMas: items.filter((it) => it.vendido && sum(it.entregas) > it.vendido),
      bajoCosto: items.filter((it) => it.vendido && it.shein && it.vendido < Math.round(it.shein * (hojas[it.hoja].cambio || COTIZACION_EXCEL))),
      sinCostoShein: items.filter((it) => !it.shein),
      compartidas: items.filter((it) => it.cliente && titular(it.cliente).compartida),
      pagadoNoCoincide: items.filter((it) => it.cliente && it.vendido && it.pagadoExcel != null && it.pagadoExcel !== ((it.vendido || 0) - sum(it.entregas) <= 0)).length,
      notas: [].concat(...usadas.map((h) => h.notas.map((n) => ({ hoja: h.nombre, fila: n.fila, texto: n.texto })))),
      ocultas: hojas.filter((h) => h.oculta).map((h) => h.nombre),
      noReconocidas: hojas.filter((h) => !h.reconocida).map((h) => h.nombre),
    };
    return { hojas: hojas, clientas: clientas, problemas: p, hoy: hoy };
  }

  /* ── Decisiones por defecto (la pantalla deja cambiarlas) ── */

  function decisionesPorDefecto(plan) {
    const d = { hojas: {}, grupos: {} };
    plan.hojas.forEach((h) => { d.hojas[h.indice] = { usar: h.usarPorDefecto, fecha: h.fecha }; });
    plan.clientas.grupos.forEach((g) => { d.grupos[g.id] = { nombre: g.nombre, claves: g.claves.reduce((o, k) => { o[k] = true; return o; }, {}) }; });
    return d;
  }

  /* ── Construcción de la base nueva ── */

  const COLECCIONES = ['clientes', 'productos', 'pedidos', 'ventas', 'pagos', 'creditos', 'cierres', 'auditoria', 'emisiones', 'envios', 'egresos', 'gastos', 'canjes', 'conteos', 'ajustesStock'];
  const usd = (x) => (x ? (Math.round(x * 100) / 100).toFixed(2) : '0');
  const redondearMil = (n) => Math.round(n / 1000) * 1000;

  /**
   * entorno = { base: base de datos de ejemplo recién creada (se copian la configuración y los usuarios), ahora, archivo }
   * Devuelve { db, resumen }. No toca nada fuera de lo que devuelve.
   */
  function construir(plan, decisiones, entorno) {
    const hoy = plan.hoy;
    const ahora = entorno.ahora || hoy + 'T12:00';
    const db = JSON.parse(JSON.stringify(entorno.base));
    COLECCIONES.forEach((k) => { db[k] = []; });
    const duenio = (db.usuarios.find((u) => u.rol === 'admin') || db.usuarios[0]).nombre;
    const hojas = plan.hojas.filter((h) => h.reconocida && decisiones.hojas[h.indice] && decisiones.hojas[h.indice].usar);
    if (!hojas.length) throw new Error('Elegí al menos una hoja para traer.');
    const fechaDe = (h) => {
      const f = decisiones.hojas[h.indice].fecha;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) throw new Error('Revisá la fecha de la hoja «' + h.nombre + '».');
      if (f > hoy) throw new Error('La fecha de la hoja «' + h.nombre + '» no puede ser futura.');
      return f;
    };
    hojas.forEach(fechaDe);

    // La configuración y las reglas del sistema quedan como están: el Excel solo aporta datos. El dólar y el courier
    // del Excel (₲ 8.000, US$ 22 por kg) quedan congelados en cada prenda y pedido traídos, no en los parámetros.
    // Se limpia solo el historial ficticio del mockup, y el programa de puntos arranca hoy (las compras viejas no suman).
    const cfg = db.config;
    cfg.proximoRecibo = 1;
    cfg.cajaCerradaHasta = null;
    cfg.cotizacion = { valor: cfg.cotizacion.valor, fecha: hoy, ts: ahora, usuario: duenio };
    cfg.historialCotizacion = [cfg.cotizacion];
    cfg.tarifa = { valor: cfg.tarifa.valor, fecha: hoy, ts: ahora, usuario: duenio };
    cfg.historialTarifa = [cfg.tarifa];
    cfg.fidelidad = Object.assign({}, cfg.fidelidad, { desde: hoy });
    if (cfg.envios) cfg.envios.proximo = 1;
    db.creado = hoy;
    db.origen = { tipo: 'excel', archivo: entorno.archivo || '', importado: ahora, hojas: hojas.map((h) => h.nombre) };

    // Clientas: a qué clienta final va cada nombre escrito.
    const destino = new Map();
    const nombres = new Map();
    plan.clientas.grupos.forEach((g) => {
      const dg = decisiones.grupos[g.id] || { claves: {}, nombre: g.nombre };
      const nombre = texto(dg.nombre) || g.nombre;
      g.claves.forEach((k) => { if (dg.claves[k]) { destino.set(k, g.id); nombres.set(g.id, nombre); } });
    });
    plan.clientas.entidades.forEach((e) => {
      if (!destino.has(e.clave)) { destino.set(e.clave, 'k:' + e.clave); nombres.set('k:' + e.clave, mejorNombre(e.formas)); }
    });
    const formasPorDestino = new Map();
    plan.clientas.entidades.forEach((e) => {
      const dst = destino.get(e.clave);
      if (!formasPorDestino.has(dst)) formasPorDestino.set(dst, new Set());
      e.formas.forEach(([t]) => formasPorDestino.get(dst).add(t));
      e.compartidas.forEach((t) => formasPorDestino.get(dst).add(t));
    });
    const clientes = new Map();
    let nc = 0;
    const clienteDe = (dst, fecha) => {
      if (!clientes.has(dst)) {
        const nombre = dst === 'sin' ? SIN_NOMBRE : nombres.get(dst);
        const formas = Array.from(formasPorDestino.get(dst) || []).filter((t) => t !== nombre);
        clientes.set(dst, {
          id: 'c' + String(++nc).padStart(3, '0'), nombre: nombre, ci: '', telefono: '', direccion: '', email: '',
          notas: dst === 'sin' ? 'Ventas del Excel que no tenían el nombre de la clienta.' : 'Traída del Excel' + (formas.length ? '. Ahí figura también como: ' + formas.join(', ') + '.' : '.'),
          alta: fecha, demo: false, cumple: '',
        });
      }
      const c = clientes.get(dst);
      if (fecha < c.alta) c.alta = fecha;
      return c;
    };

    let np = 0;
    let nped = 0;
    const ventasPend = [];
    for (const h of hojas) {
      const fecha = fechaDe(h);
      const ts = fecha + 'T09:00';
      const ped = {
        id: 'pd' + String(++nped).padStart(2, '0'), estado: 'recibido', fechaPedido: fecha, fecha: fecha, ts: ts, proveedor: 'SHEIN', cotizacion: String(h.cambio),
        historial: [{ estado: 'recibido', ts: ts, usuario: duenio, nota: 'Traído del Excel (hoja «' + h.nombre + '»)' }],
        envio: { modo: 'kg', tarifa: TARIFA_EXCEL }, productos: [],
        nota: ['Hoja «' + h.nombre + '» del Excel'].concat(h.notas.map((n) => n.texto)).join(' · '),
      };
      db.pedidos.push(ped);
      const porClienta = new Map();
      for (const it of h.items) {
        const costoGs = Math.round((it.shein || 0) * h.cambio);
        const margen = it.margen != null ? Math.round(it.margen * 100) : null;
        const sugerido = it.sugerido ? redondearMil(it.sugerido) : (costoGs && margen != null ? redondearMil(costoGs * (1 + margen / 100)) : 0);
        const codigo = 'P' + String(++np).padStart(2, '0');
        const prod = {
          id: codigo, codigo: codigo, descripcion: descripcion(it.producto), categoria: categoria(it.producto), proveedor: 'SHEIN', cantidad: 1,
          costoUSD: usd(it.shein), pesoKg: '0', envioModo: 'kg', tarifa: null, envioUnitUSD: '0', cotizacion: String(h.cambio), pedidoId: ped.id,
          fechaCarga: fecha, ts: ts, nota: 'Del Excel: hoja «' + h.nombre + '», fila ' + it.fila,
          costoTotalGs: costoGs, envioGs: 0, productoGs: costoGs, margen: margen, precioVenta: it.vendido || sugerido,
        };
        db.productos.push(prod);
        ped.productos.push(codigo);
        if (!it.vendido) continue;
        const dst = it.cliente ? destino.get(clave(titular(it.cliente).nombre)) : 'sin';
        if (!porClienta.has(dst)) porClienta.set(dst, []);
        porClienta.get(dst).push({ it: it, prod: prod });
      }
      porClienta.forEach((lineas, dst) => ventasPend.push({ h: h, fecha: fecha, dst: dst, lineas: lineas }));
    }

    // Ventas en orden (fecha, hoja, fila) con recibos correlativos; las entregas 2 y 3 llevan recibos propios después.
    ventasPend.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.h.indice - b.h.indice || a.lineas[0].it.fila - b.lineas[0].it.fila);
    let recibo = 0;
    let nv = 0;
    let npg = 0;
    let ncr = 0;
    const pagosSinRecibo = [];
    for (const vp of ventasPend) {
      const cli = clienteDe(vp.dst, vp.fecha);
      const total = sum(vp.lineas, (l) => l.it.vendido);
      const v = {
        id: 'v' + String(++nv).padStart(3, '0'), recibo: ++recibo, clienteId: cli.id, fecha: vp.fecha, ts: vp.fecha + 'T10:00',
        items: vp.lineas.map((l) => ({
          productoId: l.prod.id, descripcion: l.prod.descripcion, cantidad: 1, precio: l.it.vendido, costoUnitGs: l.prod.costoTotalGs,
          margen: l.prod.margen, precioLista: l.it.vendido, especial: null,
        })),
        descuento: { tipo: 'monto', valor: 0, monto: 0, motivo: null, nota: '' }, subtotal: total, total: total, anulada: null, usuario: duenio,
        autorizadoPor: null, ajustes: [], devoluciones: [], aFavor: 0, plan: null, creditoAutorizado: null,
        origen: { hoja: vp.h.nombre, filas: vp.lineas.map((l) => l.it.fila) },
      };
      db.ventas.push(v);
      let restante = total;
      const nEntregas = Math.max(0, ...vp.lineas.map((l) => l.it.entregas.length));
      for (let k = 0; k < nEntregas; k++) {
        const monto = sum(vp.lineas, (l) => l.it.entregas[k] || 0);
        if (!(monto > 0)) continue;
        const aplicado = Math.min(monto, restante);
        const excedente = monto - aplicado;
        restante -= aplicado;
        const pg = {
          id: 'pg' + String(++npg).padStart(3, '0'), ventaId: v.id, clienteId: cli.id, fecha: vp.fecha, ts: vp.fecha + 'T10:' + pad(k),
          partes: [{ forma: 'efectivo', monto: monto }], total: aplicado, excedente: excedente, recibo: k === 0 ? v.recibo : null,
          inicial: k === 0, grupo: null, anulado: null, usuario: duenio, origen: 'Entrega ' + (k + 1) + ' del Excel',
        };
        db.pagos.push(pg);
        if (k > 0) pagosSinRecibo.push(pg);
        if (excedente > 0) {
          db.creditos.push({ id: 'cr' + String(++ncr).padStart(3, '0'), clienteId: cli.id, fecha: vp.fecha, ts: pg.ts, monto: excedente, motivo: 'Pagó de más (Excel, hoja «' + vp.h.nombre + '»)', pagoId: pg.id });
        }
      }
    }
    pagosSinRecibo.sort((a, b) => a.ts.localeCompare(b.ts)).forEach((pg) => { pg.recibo = ++recibo; });
    cfg.proximoRecibo = recibo + 1;
    db.clientes = Array.from(clientes.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const vendido = sum(db.ventas, (v) => v.total);
    const cobrado = sum(db.pagos, (p) => p.total + p.excedente);
    const aFavor = sum(db.creditos, (c) => c.monto);
    const porCobrar = sum(db.ventas, (v) => v.total - sum(db.pagos.filter((p) => p.ventaId === v.id), (p) => p.total));
    const resumen = {
      hojas: hojas.length, productos: db.productos.length, enStock: db.productos.length - sum(db.ventas, (v) => v.items.length),
      clientas: db.clientes.length, ventas: db.ventas.length, pagos: db.pagos.length, vendido: vendido, cobrado: cobrado, porCobrar: porCobrar, aFavor: aFavor,
      // Control: lo que falta cobrar menos lo que quedó a favor tiene que dar lo mismo que las filas del Excel (vendido − entregas).
      saldoFilasExcel: sum(hojas, (h) => sum(h.items.filter((it) => it.vendido), (it) => it.vendido - sum(it.entregas))),
    };
    db.auditoria = [{
      id: 'a1', ts: ahora, usuario: duenio, tipo: 'parametros', accion: 'Datos traídos del Excel',
      detalle: (entorno.archivo ? entorno.archivo + ' · ' : '') + resumen.hojas + ' hojas · ' + resumen.clientas + ' clientas · ' + resumen.ventas + ' ventas · '
        + resumen.productos + ' productos (' + resumen.enStock + ' en stock) · por cobrar ' + porCobrar,
    }];
    return { db: db, resumen: resumen };
  }

  return { analizar: analizar, decisionesPorDefecto: decisionesPorDefecto, construir: construir, clave: clave, titular: titular, SIN_NOMBRE: SIN_NOMBRE };
});

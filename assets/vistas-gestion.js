/*!
 * berry.Glow_py — Pantallas de gestión: reportes, caja del día, ajustes y auditoría.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);

  /* ── Gráfico de columnas (una sola serie) ────────────────────────────── */

  function pasoLindo(x) {
    if (x <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(x)));
    const n = x / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function compacto(v) {
    if (v >= 1e6) return C.fmtNum(C.div(C.Q(BigInt(Math.round(v))), C.Q(1000000n)), 0, 1) + ' M';
    if (v >= 1e3) return Math.round(v / 1e3) + ' mil';
    return String(v);
  }
  /** datos: [{ fecha, etiqueta, valor, n }] */
  function grafico(id, datos) {
    const W = 720;
    const H = 230;
    const ml = 58;
    const mr = 8;
    const mt = 14;
    const mb = 26;
    const pw = W - ml - mr;
    const ph = H - mt - mb;
    const paso = pasoLindo(Math.max(1, ...datos.map((d) => d.valor)) / 4);
    const tope = Math.max(paso, Math.ceil(Math.max(1, ...datos.map((d) => d.valor)) / paso) * paso);
    const y = (v) => mt + ph - (v / tope) * ph;
    const banda = pw / datos.length;
    const bw = Math.min(24, banda * 0.62);
    const cada = Math.ceil(datos.length / 10);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="' + id + '-t"><title id="' + id + '-t">Ventas por día</title>';
    for (let t = 0; t <= tope + 0.001; t += paso) {
      s += '<line class="grid-line" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/>'
        + '<text class="tick" x="' + (ml - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + compacto(t) + '</text>';
    }
    datos.forEach((d, i) => {
      const x = ml + i * banda + (banda - bw) / 2;
      const top = y(d.valor);
      const base = mt + ph;
      s += '<rect class="hit" x="' + (ml + i * banda).toFixed(1) + '" y="' + mt + '" width="' + banda.toFixed(1) + '" height="' + ph + '" tabindex="0" data-i="' + i + '" aria-label="' + esc(d.etiqueta + ': ' + gs(d.valor)) + '"/>';
      if (d.valor > 0) {
        const r = Math.min(4, base - top, bw / 2);
        s += '<path class="bar" d="M' + x.toFixed(1) + ',' + base + 'V' + (top + r).toFixed(1) + 'Q' + x.toFixed(1) + ',' + top.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + top.toFixed(1)
          + 'H' + (x + bw - r).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ',' + top.toFixed(1) + ' ' + (x + bw).toFixed(1) + ',' + (top + r).toFixed(1) + 'V' + base + 'Z"/>';
      }
      if (i % cada === 0) s += '<text class="tick" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(d.corta) + '</text>';
    });
    s += '<line class="axis-line" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (mt + ph) + '" y2="' + (mt + ph) + '"/></svg>';
    return '<div class="chart" id="' + id + '">' + s + '<div class="chart-tip" hidden></div></div>'
      + '<details class="table-toggle"><summary>Ver los datos como tabla</summary><div class="table-wrap"><table class="table table-compact"><thead><tr><th>Día</th><th class="num">Ventas</th><th class="num">Vendido</th></tr></thead><tbody>'
      + datos.map((d) => '<tr><td>' + esc(d.etiqueta) + '</td><td class="num">' + d.n + '</td><td class="num">' + gs(d.valor) + '</td></tr>').join('') + '</tbody></table></div></details>';
  }
  function enlazarGrafico(root, id, datos) {
    const cont = $('#' + id, root);
    if (!cont) return;
    const tip = $('.chart-tip', cont);
    const svg = $('svg', cont);
    const mostrar = (i) => {
      const d = datos[i];
      const hit = $('.hit[data-i="' + i + '"]', cont);
      const vb = svg.viewBox.baseVal;
      const x = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2;
      const valorY = Math.max(24, 14 + (1 - (d.valor / Math.max(1, ...datos.map((z) => z.valor)))) * 190);
      tip.innerHTML = '<strong></strong><span></span>';
      tip.firstChild.textContent = gs(d.valor);
      tip.lastChild.textContent = d.etiqueta + ' · ' + d.n + (d.n === 1 ? ' venta' : ' ventas');
      const pct = (x / vb.width) * 100;
      tip.style.left = pct + '%';
      tip.style.top = (valorY / vb.height) * 100 + '%';
      // Cerca de los bordes el globito se corre hacia adentro para no salirse de la tarjeta.
      tip.style.transform = pct > 80 ? 'translate(calc(-100% + 14px), calc(-100% - 10px))' : pct < 20 ? 'translate(-14px, calc(-100% - 10px))' : '';
      tip.hidden = false;
    };
    cont.addEventListener('pointerover', (e) => { const h = e.target.closest('.hit'); if (h) mostrar(Number(h.dataset.i)); });
    cont.addEventListener('pointerleave', () => { tip.hidden = true; });
    cont.addEventListener('focusin', (e) => { const h = e.target.closest('.hit'); if (h) mostrar(Number(h.dataset.i)); });
    cont.addEventListener('focusout', () => { tip.hidden = true; });
  }

  /* ── Reportes ────────────────────────────────────────────────────────── */

  function rango(periodo) {
    const h = BG.hoy();
    if (periodo === 'hoy') return [h, h];
    if (periodo === '7') return [BG.sumarDias(h, -6), h];
    if (periodo === 'anterior') {
      const fin = BG.sumarDias(h.slice(0, 8) + '01', -1);
      return [fin.slice(0, 8) + '01', fin];
    }
    return [h.slice(0, 8) + '01', h];
  }
  const tile = (label, valor, sub) => '<div class="tile"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';

  /** Liquidar un producto que no se mueve: se elige el precio nuevo entre el menor sugerido, el margen mínimo u otro. */
  BG.liquidarUI = async (p) => {
    const costo = p.costoTotalGs;
    const redondo = (m) => Number(C.redondear(C.precioExacto(costo, m), BG.db.config.redondeo));
    const ops = [[50, 'Menor sugerido (50 %)'], [BG.margenMinimo(), 'Margen mínimo (' + BG.margenMinimo() + ' %)']]
      .filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i)
      .map(([m, t]) => ({ m: m, t: t, precio: redondo(m) })).filter((o) => o.precio < p.precioVenta);
    let elegido = null;
    const r = await BG.modal({
      titulo: 'Precio de liquidación · ' + p.descripcion,
      cuerpo: '<p>Hoy vale <strong>' + gs(p.precioVenta) + '</strong>, lleva <strong>' + BG.diasSinVender(p) + ' días</strong> sin venderse y quedan ' + BG.disponibles(p) + ' (costo congelado ' + gs(costo) + ' c/u).</p>'
        + '<div class="dests" role="radiogroup" aria-label="Precio nuevo">'
        + ops.map((o, i) => '<label class="dest"><input type="radio" name="lq" value="' + i + '"' + (i === 0 ? ' checked' : '') + '><span class="grow"><span class="row-title">' + o.t + ': ' + gs(o.precio) + '</span>'
          + '<span class="row-sub">Gana ' + gs(o.precio - costo) + ' c/u · ' + gs(p.precioVenta - o.precio) + ' menos que hoy</span></span></label>').join('')
        + '<label class="dest"><input type="radio" name="lq" value="otro"' + (ops.length ? '' : ' checked') + '><span class="grow"><span class="row-title">Otro precio</span></span>' + BG.campoGs('lq-otro', '', 'aria-label="Otro precio de liquidación"') + '</label></div>'
        + '<p class="hint">Cambia el precio de lista (lo ven Jazmín y los recibos nuevos). Las ventas ya hechas no cambian. Queda en la auditoría.</p><p class="error-text" id="lq-e" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Poner este precio', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        const sel = $('input[name="lq"]:checked', dlg);
        const er = $('#lq-e', dlg);
        if (sel && sel.value !== 'otro') { elegido = { margen: ops[Number(sel.value)].m, precio: ops[Number(sel.value)].precio }; return true; }
        const precio = BG.leerGs($('#lq-otro', dlg));
        if (!(precio > 0)) { er.textContent = 'Escribí el precio.'; er.hidden = false; return false; }
        elegido = { margen: null, precio: precio };
        return true;
      },
      onMount: (dlg) => { dlg.querySelector('form').addEventListener('focusin', (ev) => { if (ev.target.id === 'lq-otro') $('input[name="lq"][value="otro"]', dlg).checked = true; }); },
    });
    if (r !== 'ok' || !elegido) return false;
    BG.actualizarPrecio(p.id, elegido.margen, elegido.precio, 'liquidación: ' + BG.diasSinVender(p) + ' días sin venderse');
    BG.toast(p.descripcion + ': precio de liquidación ' + gs(elegido.precio) + '.');
    return true;
  };

  BG.vistas.reportes = (args, params) => {
    const e = { tab: params.get('tab') || 'ventas', periodo: params.get('periodo') || 'mes', dias: 30, rot: 30 };
    const tabs = [['ventas', 'Ventas'], ['deudores', 'Deudores y saldos a favor'], ['stock', 'Stock y rotación'], ['clientas', 'Clientas'], ['ganancia', 'Ganancia']];
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Reportes</h1><p class="page-sub">Vista interna: solo ' + esc(BG.nombreDuena()) + ' ve costos y ganancias.</p></div></div>'
      + '<div class="tabs" role="tablist">' + tabs.map(([k, t]) => '<button type="button" class="tab-btn" role="tab" data-tab="' + k + '" aria-selected="' + (e.tab === k) + '">' + t + '</button>').join('') + '</div>'
      + '<div id="rep-filtro"></div><div id="rep-cuerpo" class="stack"></div></div>';
    let root = null;
    const pintar = () => {
      const conPeriodo = e.tab === 'ventas' || e.tab === 'ganancia';
      $('#rep-filtro', root).innerHTML = conPeriodo ? '<div class="chips" role="group" aria-label="Período">'
        + [['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['mes', 'Este mes'], ['anterior', 'Mes anterior']].map(([k, t]) => '<button type="button" class="chip" data-periodo="' + k + '" aria-pressed="' + (e.periodo === k) + '">' + t + '</button>').join('') + '</div>' : '';
      const [desde, hasta] = rango(e.periodo);
      const enRango = (f) => f >= desde && f <= hasta;
      const cuerpo = $('#rep-cuerpo', root);
      if (e.tab === 'ventas') {
        const ventas = BG.db.ventas.filter((v) => !v.anulada && enRango(v.fecha));
        const pagos = BG.db.pagos.filter((p) => !p.anulado && enRango(p.fecha));
        const f = BG.totalesPorForma(pagos);
        const vendido = sum(ventas, (v) => v.total);
        const cobrado = f.efectivo + f.transferencia + f.qr + f.tarjeta;
        const devuelto = sum((BG.db.egresos || []).filter((x) => enRango(x.fecha)), (x) => x.monto);
        const dias = [];
        for (let d = desde; d <= hasta; d = BG.sumarDias(d, 1)) {
          const del = ventas.filter((v) => v.fecha === d);
          const fd = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
          dias.push({ fecha: d, etiqueta: BG.DIAS[fd.getDay()] + ' ' + BG.fmtFechaCorta(d), corta: String(fd.getDate()), valor: sum(del, (v) => v.total), n: del.length });
        }
        cuerpo.innerHTML = '<div class="tiles">' + tile('Vendido', gs(vendido), ventas.length + ' ventas') + tile('Cobrado', gs(cobrado), 'por fecha de cobro')
          + tile('Ticket promedio', gs(ventas.length ? Math.round(vendido / ventas.length) : 0)) + tile('Quedó a cuenta', gs(sum(ventas, BG.saldoVenta)), 'de estas ventas, todavía sin cobrar') + '</div>'
          + (dias.length > 1 ? '<section class="card"><div class="card-head"><h2>Ventas por día</h2><span class="small muted">' + BG.fmtFecha(desde) + ' al ' + BG.fmtFecha(hasta) + '</span></div>' + grafico('g-ventas', dias) + '</section>' : '')
          + '<section class="card"><div class="card-head"><h2>Cobrado por forma de pago</h2></div><div class="table-wrap table-bare"><table class="table"><thead><tr><th>Forma</th><th class="num">Monto</th></tr></thead><tbody>'
          + ['efectivo', 'transferencia', 'qr', 'tarjeta'].map((k) => '<tr><td>' + BG.FORMAS[k] + '</td><td class="num">' + gs(f[k]) + '</td></tr>').join('')
          + '</tbody><tfoot><tr><td>Total cobrado</td><td class="num">' + gs(cobrado) + '</td></tr>'
          + (devuelto ? '<tr><td>Plata devuelta (devoluciones y saldo a favor)</td><td class="num">−' + gs(devuelto) + '</td></tr><tr><td>Neto que quedó</td><td class="num">' + gs(cobrado - devuelto) + '</td></tr>' : '')
          + '</tfoot></table></div>'
          + (f.saldo ? '<p class="hint list-top">Además se aplicaron ' + gs(f.saldo) + ' de saldo a favor (no es dinero nuevo).</p>' : '') + '</section>';
        if (dias.length > 1) enlazarGrafico(root, 'g-ventas', dias);
      } else if (e.tab === 'deudores') {
        const ds = BG.listaDeudores();
        const cu = BG.cuadre();
        const cf = BG.cuadreFavor();
        const lf = BG.listaAFavor();
        const vencidas = BG.cuotasPendientes().filter((x) => x.cuota.estado === 'vencida');
        const tramo = (a, b) => sum(ds.filter((d) => { const n = BG.diasEntre(d.desde, BG.hoy()); return n >= a && n <= b; }), (d) => d.saldo);
        const origen = (cid) => { const cr = BG.db.creditos.filter((x) => x.clienteId === cid && x.monto > 0).sort((a, b) => b.ts.localeCompare(a.ts))[0]; return cr ? cr.motivo + ' (' + BG.fmtFecha(cr.fecha) + ')' : ''; };
        cuerpo.innerHTML = '<div class="tiles tiles-compact">' + tile('Total por cobrar', gs(sum(ds, (d) => d.saldo)), ds.length + ' clientes')
          + tile('Hasta 15 días', gs(tramo(0, 14))) + tile('De 15 a 30 días', gs(tramo(15, 30))) + tile('Más de 30 días', gs(tramo(31, 99999)), 'reclamar primero') + '</div>'
          + '<div class="callout ' + (cu.ok ? 'callout-good' : 'callout-bad') + '">' + icon(cu.ok ? 'shield' : 'alert') + '<div><strong>Cuadre automático: ' + (cu.ok ? 'cuadra' : 'NO cuadra') + '.</strong> Suma de saldos por cliente ' + gs(cu.porClientes) + ' · total por cobrar del sistema ' + gs(cu.libro) + '.</div></div>'
          + (vencidas.length ? '<a class="callout callout-warn callout-link" href="#/cuotas?filtro=vencidas">' + icon('calendar') + '<div><strong>Cuotas atrasadas: ' + vencidas.length + ' por ' + gs(sum(vencidas, (x) => x.cuota.falta)) + '.</strong> Ver quién es y mandar el recordatorio por WhatsApp.</div></a>' : '')
          + '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th class="num">Saldo</th><th class="num col-sm-hide">Compras</th><th>Deuda más antigua</th><th><span class="sr-only">Recordar</span></th></tr></thead><tbody>'
          + ds.map((d) => '<tr class="is-link" data-href="#/clientes/' + d.c.id + '"><td><div class="t-title">' + esc(d.c.nombre) + '</div><div class="t-sub">' + esc(d.c.telefono) + '</div></td>'
            + '<td class="num"><strong>' + gs(d.saldo) + '</strong></td><td class="num col-sm-hide">' + BG.pendientesDe(d.c.id).length + '</td><td>' + BG.fmtFecha(d.desde) + ' · ' + BG.edad(d.desde) + '</td>'
            + '<td><a class="btn btn-sm" href="' + BG.waLink(d.c, 'Hola ' + d.c.nombre.split(' ')[0] + ', te recordamos desde ' + BG.db.config.tienda.nombre + ' que tu saldo pendiente es de ' + gs(d.saldo) + '. ¡Gracias!') + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Recordar</a></td></tr>').join('')
          + '</tbody></table></div>'
          + '<section class="card stack card-favor"><div class="card-head"><h2>' + icon('wallet') + 'Saldos a favor: la tienda les debe ' + gs(sum(lf, (x) => x.favor)) + '</h2></div>'
          + '<div class="callout ' + (cf.ok ? 'callout-good' : 'callout-bad') + '">' + icon(cf.ok ? 'shield' : 'alert') + '<div><strong>Cuadre de saldos a favor: ' + (cf.ok ? 'cuadra' : 'NO cuadra') + '.</strong> '
          + 'Registro ' + gs(cf.registro) + ' · reconstruido desde los pagos de más, señas, devoluciones, ventas anuladas y la plata devuelta ' + gs(cf.reconstruido) + '. '
          + (cf.negativos.length ? 'Hay ' + cf.negativos.length + ' en negativo.' : 'Ninguno en negativo.')
          + (cf.diferencias.length ? ' Diferencias: ' + cf.diferencias.map((d) => esc(d.c.nombre) + ' ' + gs(d.registro) + ' vs ' + gs(d.esperado)).join('; ') + '.' : '') + '</div></div>'
          + (lf.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th class="num">A favor</th><th class="num">También debe</th><th class="col-sm-hide">Último movimiento a favor</th></tr></thead><tbody>'
            + lf.map((x) => '<tr class="is-link" data-href="#/clientes/' + x.c.id + '"><td><div class="t-title">' + esc(x.c.nombre) + '</div><div class="t-sub">' + esc(x.c.telefono) + '</div></td>'
              + '<td class="num"><strong class="t-favor">' + gs(x.favor) + '</strong></td><td class="num">' + (x.debe ? gs(x.debe) : '—') + '</td><td class="small col-sm-hide">' + esc(origen(x.c.id)) + '</td></tr>').join('')
            + '</tbody></table></div><p class="hint">Si una clienta tiene saldo a favor y también debe, al cobrarle marcá «Usarlo para pagar». También se puede devolver en plata desde su ficha.</p>'
            : '<p class="empty">Nadie tiene saldo a favor.</p>')
          + '</section>';
      } else if (e.tab === 'stock') {
        const h = BG.hoy();
        const ps = BG.db.productos.filter((p) => BG.disponibles(p) > 0);
        const alCosto = sum(ps, (p) => BG.disponibles(p) * (p.costoTotalGs || 0));
        const aPrecio = sum(ps, (p) => BG.disponibles(p) * (p.precioVenta || 0));
        // Sin movimiento: con stock y muchos días sin venderse (desde la última venta, o desde la carga si nunca se vendió).
        const quietos = ps.map((p) => ({ p: p, dias: BG.diasSinVender(p), ultima: BG.ultimaVentaDe(p.id) })).filter((x) => x.dias >= e.dias).sort((a, b) => b.dias - a.dias);
        const parado = sum(quietos, (x) => BG.disponibles(x.p) * (x.p.costoTotalGs || 0));
        // Rotación: lo vendido en el período, a qué velocidad y cuándo se agota.
        const desde = BG.sumarDias(h, -(e.rot - 1));
        const porProd = new Map();
        BG.db.ventas.filter((v) => !v.anulada && v.fecha >= desde).forEach((v) => v.items.forEach((it) => {
          const n = BG.cantidadViva(it);
          if (!n) return;
          const x = porProd.get(it.productoId) || { u: 0, ingreso: 0, ganancia: 0 };
          x.u += n;
          x.ingreso += it.precio * n;
          x.ganancia += (it.precio - (it.costoUnitGs || 0)) * n;
          porProd.set(it.productoId, x);
        }));
        const rot = Array.from(porProd.entries()).map(([pid, x]) => {
          const p = BG.producto(pid);
          // Ritmo de venta: con al menos 14 días de observación, así un producto que llegó ayer y se vendió una vez no parece un éxito.
          const enStock = BG.diasEntre(p.fechaCarga, h) + 1;
          const dias = Math.max(14, Math.min(e.rot, enStock));
          const porDia = x.u / dias;
          const disp = BG.disponibles(p);
          const seAgota = disp > 0 ? Math.ceil(disp / porDia) : 0;
          return Object.assign({ p: p, disp: disp, porDia: porDia, seAgota: seAgota, nuevo: enStock < 14, enStock: enStock, pedir: Math.max(0, Math.ceil(porDia * 30) - disp) }, x);
        }).sort((a, b) => b.u - a.u || b.ingreso - a.ingreso);
        const pedido = rot.filter((x) => (x.disp === 0 || x.seAgota <= 21) && x.pedir > 0);
        const estado = (x) => (x.disp === 0 ? '<span class="pill pill-bad">Agotado: reponer</span>' : x.seAgota <= 14 ? '<span class="pill pill-warn">Quedan pocas</span>' : '<span class="pill pill-good">Stock bien</span>');
        const chipsD = (grupo, vals, sel) => '<div class="chips" role="group">' + vals.map((d) => '<button type="button" class="chip" data-' + grupo + '="' + d + '" aria-pressed="' + (sel === d) + '">' + d + ' días</button>').join('') + '</div>';
        const usdPedido = sum(pedido.filter((x) => x.p.costoUSD != null), (x) => Number(x.p.costoUSD) * x.pedir);
        cuerpo.innerHTML = '<div class="tiles tiles-compact">' + tile('Unidades disponibles', String(sum(ps, BG.disponibles)), ps.length + ' productos') + tile('Stock al costo', gs(alCosto))
          + tile('Stock a precio de venta', gs(aPrecio)) + tile('Ganancia si se vende todo', gs(aPrecio - alCosto)) + '</div>'
          + '<section class="card stack"><div class="card-head card-head-wrap"><h2>' + icon('pause') + 'Sin movimiento</h2>' + chipsD('dias', [30, 45, 60, 90], e.dias) + '</div>'
          + '<p class="small">' + quietos.length + (quietos.length === 1 ? ' producto' : ' productos') + ' con ' + e.dias + ' días o más sin venderse · <strong>' + gs(parado) + '</strong> parados al costo. Son candidatos a liquidación o a una promo.</p>'
          + (quietos.length ? '<div class="table-wrap"><table class="table table-compact"><thead><tr><th>Producto</th><th class="num">Quedan</th><th class="num">Sin venderse</th><th class="num col-sm-hide">Parado al costo</th><th class="num col-sm-hide">Precio</th><th><span class="sr-only">Liquidar</span></th></tr></thead><tbody>'
            + quietos.map((x) => '<tr><td><div class="t-title">' + esc(x.p.descripcion) + '</div><div class="t-sub">' + esc(x.p.categoria) + ' · cargado el ' + BG.fmtFecha(x.p.fechaCarga) + (x.ultima ? ' · última venta ' + BG.fmtFecha(x.ultima) : ' · nunca se vendió') + '</div></td>'
              + '<td class="num">' + BG.disponibles(x.p) + '</td><td class="num"><strong>' + x.dias + ' días</strong></td><td class="num col-sm-hide">' + gs(BG.disponibles(x.p) * (x.p.costoTotalGs || 0)) + '</td>'
              + '<td class="num col-sm-hide">' + (x.p.precioVenta ? gs(x.p.precioVenta) : '—') + '</td><td>' + (x.p.costoTotalGs && x.p.precioVenta ? '<button type="button" class="btn btn-sm" data-liquidar="' + x.p.id + '">' + icon('tag', 'i-sm') + 'Liquidar</button>' : '') + '</td></tr>').join('')
            + '</tbody></table></div>' : '<p class="empty">Nada lleva tanto tiempo sin venderse.</p>')
          + '</section>'
          + '<section class="card stack"><div class="card-head card-head-wrap"><h2>' + icon('trend') + 'Más vendidos</h2>' + chipsD('rot', [30, 60, 90], e.rot) + '</div>'
          + (rot.length ? '<div class="table-wrap"><table class="table table-compact"><thead><tr><th>Producto</th><th class="num">Vendidas</th><th class="num col-sm-hide">Ingresos</th><th class="num col-sm-hide">Ganancia</th><th class="num">Quedan</th><th>Estado</th></tr></thead><tbody>'
            + rot.slice(0, 12).map((x) => '<tr class="is-link" data-href="#/productos?ver=' + x.p.id + '"><td><div class="t-title">' + esc(x.p.descripcion) + '</div><div class="t-sub">' + esc(x.p.categoria)
              + (x.nuevo ? ' · llegó hace ' + (x.enStock - 1 === 1 ? '1 día' : (x.enStock - 1) + ' días') : '') + (x.disp > 0 ? ' · se agota en ~' + x.seAgota + ' días' : '') + '</div></td><td class="num"><strong>' + x.u + '</strong></td><td class="num col-sm-hide">' + gs(x.ingreso) + '</td><td class="num col-sm-hide">' + gs(x.ganancia) + '</td>'
              + '<td class="num">' + x.disp + '</td><td>' + estado(x) + '</td></tr>').join('')
            + '</tbody></table></div>' : '<p class="empty">Sin ventas en el período.</p>')
          + '</section>'
          + '<section class="card stack card-tint"><div class="card-head"><h2>' + icon('box') + 'Para el próximo pedido</h2></div>'
          + (pedido.length ? '<p class="small">Lo que se vende rápido y se está por agotar. Cantidad sugerida para cubrir unos 30 días al ritmo de los últimos ' + e.rot + ' días:</p>'
            + '<ul class="lines">' + pedido.map((x) => '<li class="line"><div class="line-top"><div class="grow"><div class="row-title">' + esc(x.p.descripcion) + '</div>'
              + '<div class="row-sub">Vendió ' + x.u + ' en ' + e.rot + ' días · quedan ' + x.disp + (x.p.costoUSD != null ? ' · costo ' + C.fmtUSD(x.p.costoUSD) + ' c/u (' + esc(x.p.proveedor) + ')' : '') + '</div></div>'
              + '<span class="pill pill-berry">Pedir ~' + x.pedir + '</span></div></li>').join('') + '</ul>'
            + (usdPedido ? '<p class="small">Costo aproximado del pedido sugerido (sin envío): <strong>' + C.fmtUSD((Math.round(usdPedido * 100) / 100).toFixed(2)) + '</strong>.</p>' : '')
            + '<p class="hint">Con talles y colores cargados como variantes, el sistema final sugiere también qué talle pedir.</p>'
            : '<p class="empty">Nada se está por agotar al ritmo actual.</p>')
          + '</section>'
          + '<details class="table-toggle"><summary>Ver todo el stock disponible</summary><div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="num">Disp.</th><th class="num">Costo c/u</th><th class="num">Precio</th><th class="num">Valor al costo</th><th class="num">Valor a precio</th></tr></thead><tbody>'
          + ps.map((p) => '<tr class="is-link" data-href="#/productos?ver=' + p.id + '"><td><div class="t-title">' + esc(p.descripcion) + '</div><div class="t-sub">' + esc(p.categoria) + ' · dólar ' + C.fmtCot(p.cotizacion) + '</div></td>'
            + '<td class="num">' + BG.disponibles(p) + '</td><td class="num">' + (p.costoTotalGs ? gs(p.costoTotalGs) : '—') + '</td><td class="num">' + (p.precioVenta ? gs(p.precioVenta) : '—') + '</td>'
            + '<td class="num">' + gs(BG.disponibles(p) * (p.costoTotalGs || 0)) + '</td><td class="num">' + gs(BG.disponibles(p) * (p.precioVenta || 0)) + '</td></tr>').join('')
          + '</tbody></table></div></details>';
      } else if (e.tab === 'clientas') {
        const h = BG.hoy();
        const fid = BG.configFidelidad();
        const tienda = BG.db.config.tienda.nombre;
        const filas = BG.db.clientes.map((c) => {
          const rec = BG.comprasRecientes(c.id, 90);
          const todas = BG.db.ventas.filter((v) => v.clienteId === c.id && !v.anulada);
          return { c: c, n90: rec.length, monto90: sum(rec, (v) => v.total), ultima: todas.map((v) => v.fecha).sort().slice(-1)[0] || null, pts: BG.puntosDe(c.id), k: BG.cumpleDe(c) };
        });
        const frecuentes = filas.filter((x) => BG.esFrecuente(x.c.id)).sort((a, b) => b.monto90 - a.monto90);
        const cumples = filas.filter((x) => x.k && x.k.dias >= -7 && x.k.dias <= 30).sort((a, b) => a.k.dias - b.k.dias);
        const dormidas = filas.filter((x) => x.ultima && BG.diasEntre(x.ultima, h) >= 60).sort((a, b) => a.ultima.localeCompare(b.ultima));
        const canjeables = filas.filter((x) => x.pts && x.pts.canjeable);
        const canjesMes = (BG.db.canjes || []).filter((k) => k.fecha.slice(0, 7) === h.slice(0, 7));
        const saludo = (x) => '¡Feliz cumpleaños, ' + x.c.nombre.split(' ')[0] + '! Te saludamos de ' + tienda + '.'
          + (fid.activo && fid.cumple.activo ? ' Tenés ' + fid.cumple.porcentaje + ' % de regalo en tu compra de esta semana.' : '');
        const extrano = (x) => 'Hola ' + x.c.nombre.split(' ')[0] + ', te extrañamos en ' + tienda + '. Llegaron cosas nuevas.'
          + (x.pts && x.pts.puntos ? ' Tenés ' + x.pts.puntos + ' puntos (' + gs(x.pts.valor) + ') para usar.' : '') + ' ¡Te esperamos!';
        cuerpo.innerHTML = '<div class="tiles tiles-compact">' + tile('Clientas frecuentes', String(frecuentes.length), '2 compras o más en 90 días')
          + tile('Cumpleaños en 30 días', String(cumples.filter((x) => x.k.dias >= 0).length), cumples.filter((x) => x.k.enSemana).length + ' en la semana del regalo')
          + tile('Puntos para canjear', gs(sum(canjeables, (x) => x.pts.valor)), canjeables.length + ' clientas ya pueden canjear')
          + tile('Canjeado este mes', gs(sum(canjesMes, (k) => k.monto)), canjesMes.length + ' canjes') + '</div>'
          + (fid.activo ? '<p class="callout">' + icon('star') + '<span>Programa: 1 punto cada ' + gs(fid.cadaGs) + ' que pagan (cada punto vale ' + gs(fid.valorPunto) + ', canje desde ' + fid.minimo + ' puntos)'
            + (fid.cumple.activo ? ' y ' + fid.cumple.porcentaje + ' % de regalo en la semana de su cumpleaños' : '') + '. Jazmín solo ve el aviso al venderle. <a href="#/ajustes">Cambiar</a></span></p>'
            : '<p class="callout callout-warn">' + icon('info') + '<span>El programa de clientas frecuentes está apagado. <a href="#/ajustes">Activarlo en Ajustes</a></span></p>')
          + '<section class="card stack"><div class="card-head"><h2>' + icon('gift') + 'Cumpleaños próximos</h2></div>'
          + (cumples.length ? '<ul class="lines">' + cumples.map((x) => '<li class="line"><div class="line-top"><div class="grow"><a class="row-title" href="#/clientes/' + x.c.id + '">' + esc(x.c.nombre) + '</a>'
            + '<div class="row-sub">' + BG.fmtFechaCorta(x.k.fecha) + ' · ' + BG.textoCumple(x.k) + (x.k.enSemana ? (BG.regaloCumple(x.c.id) ? ' · regalo disponible' : BG.regaloCumpleUsado(x.c.id) ? ' · ya usó el regalo' : '') : '') + '</div></div>'
            + '<a class="btn btn-sm" href="' + BG.waLink(x.c, saludo(x)) + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Saludar</a></div></li>').join('') + '</ul>'
            : '<p class="empty">Nadie cumple en los próximos 30 días (o faltan fechas: se cargan en la ficha de cada clienta).</p>')
          + '</section>'
          + '<section class="card stack"><div class="card-head"><h2>' + icon('star') + 'Clientas frecuentes</h2><span class="small muted">últimos 90 días</span></div>'
          + (frecuentes.length ? '<div class="table-wrap"><table class="table table-compact table-venta"><thead><tr><th>Clienta</th><th class="num">Compras</th><th class="num">Comprado</th><th class="num col-sm-hide">Última</th><th class="num">Puntos</th></tr></thead><tbody>'
            + frecuentes.map((x) => '<tr class="is-link" data-href="#/clientes/' + x.c.id + '"><td><div class="t-title">' + esc(x.c.nombre) + '</div><div class="t-sub">' + esc(x.c.telefono) + '</div></td><td class="num">' + x.n90 + '</td><td class="num">' + gs(x.monto90) + '</td>'
              + '<td class="num col-sm-hide">' + (x.ultima ? BG.fmtFechaCorta(x.ultima) : '—') + '</td><td class="num">' + (x.pts ? x.pts.puntos + (x.pts.canjeable ? ' ' + icon('star', 'i-sm') : '') : '—') + '</td></tr>').join('')
            + '</tbody></table></div>' : '<p class="empty">Todavía nadie compró dos veces en 90 días.</p>')
          + '</section>'
          + '<section class="card stack"><div class="card-head"><h2>' + icon('clock') + 'Hace mucho que no compran</h2><span class="small muted">60 días o más</span></div>'
          + (dormidas.length ? '<ul class="lines">' + dormidas.map((x) => '<li class="line"><div class="line-top"><div class="grow"><a class="row-title" href="#/clientes/' + x.c.id + '">' + esc(x.c.nombre) + '</a>'
            + '<div class="row-sub">Última compra ' + BG.fmtFecha(x.ultima) + ' (' + BG.haceDias(x.ultima) + ')' + (x.pts && x.pts.puntos ? ' · ' + x.pts.puntos + ' puntos' : '') + '</div></div>'
            + '<a class="btn btn-sm" href="' + BG.waLink(x.c, extrano(x)) + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Escribirle</a></div></li>').join('') + '</ul>'
            : '<p class="empty">Todas compraron en los últimos 60 días.</p>')
          + '</section>';
      } else {
        const ventas = BG.db.ventas.filter((v) => !v.anulada && enRango(v.fecha)).sort((a, b) => b.ts.localeCompare(a.ts));
        const neto = sum(ventas, (v) => v.total);
        const costo = sum(ventas, (v) => v.total - BG.gananciaVenta(v));
        const gan = neto - costo;
        const res = BG.resultado(desde, hasta);
        cuerpo.innerHTML = '<div class="tiles tiles-compact">' + tile('Ventas netas', gs(neto), 'con descuentos') + tile('Costo de lo vendido', gs(costo), 'costo congelado de cada artículo')
          + tile('Ganancia bruta', gs(gan), (costo ? Math.round((gan / costo) * 100) : 0) + ' % sobre el costo') + tile('Ganancia neta', gs(res.neta), 'después de gastos', res.neta < 0 ? 'tile-bad' : 'tile-good') + '</div>'
          + '<section class="card stack"><div class="card-head"><h2>De la ganancia bruta a la neta</h2><a class="small" href="#/gastos">Cargar gastos</a></div>' + BG.htmlResultado(res) + '</section>'
          + '<p class="callout">' + icon('info') + '<span>Ganancia bruta = precio al que se vendió − costo congelado del producto. El 50/80/100/120 % es solo la sugerencia al cargar; acá cuentan los descuentos y los precios editados.</span></p>'
          + '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Recibo</th><th>Cliente</th><th class="num">Vendido</th><th class="num">Costo</th><th class="num">Ganancia</th><th class="num">%</th></tr></thead><tbody>'
          + ventas.map((v) => { const g = BG.gananciaVenta(v); const c = v.total - g; return '<tr class="is-link" data-href="#/ventas/' + v.id + '"><td class="nowrap">' + BG.fmtFecha(v.fecha) + '</td><td class="nowrap">' + BG.fmtRecibo(v.recibo) + '</td><td>' + esc(BG.cliente(v.clienteId).nombre) + '</td>'
            + '<td class="num">' + gs(v.total) + '</td><td class="num">' + gs(c) + '</td><td class="num"><strong>' + gs(g) + '</strong></td><td class="num">' + (c ? Math.round((g / c) * 100) : 0) + ' %</td></tr>'; }).join('')
          + '</tbody></table></div>';
      }
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        pintar();
        root.addEventListener('click', (ev) => {
          const t = ev.target.closest('[data-tab]');
          if (t) { e.tab = t.dataset.tab; $$('[data-tab]', root).forEach((x) => x.setAttribute('aria-selected', String(x === t))); pintar(); return; }
          const p = ev.target.closest('[data-periodo]');
          if (p) { e.periodo = p.dataset.periodo; pintar(); return; }
          const d = ev.target.closest('[data-dias]');
          if (d) { e.dias = Number(d.dataset.dias); pintar(); return; }
          const ro = ev.target.closest('[data-rot]');
          if (ro) { e.rot = Number(ro.dataset.rot); pintar(); return; }
          const lq = ev.target.closest('[data-liquidar]');
          if (lq) { BG.liquidarUI(BG.producto(lq.dataset.liquidar)).then((ok) => { if (ok) pintar(); }); return; }
          const fila = ev.target.closest('tr[data-href]');
          if (fila && !ev.target.closest('a')) BG.ir(fila.dataset.href);
        });
      },
    };
  };

  /* ── Caja del día ────────────────────────────────────────────────────── */

  BG.vistas.caja = (args, params) => {
    const h = BG.hoy();
    const f = params.get('fecha') && params.get('fecha') <= h ? params.get('fecha') : h;
    const pagos = BG.db.pagos.filter((p) => p.fecha === f && !p.anulado);
    const t = BG.totalesPorForma(pagos);
    const n = (forma) => pagos.filter((p) => p.partes.some((x) => x.forma === forma)).length;
    const cobrado = t.efectivo + t.transferencia + t.qr + t.tarjeta;
    const ventas = BG.db.ventas.filter((v) => v.fecha === f && !v.anulada);
    const cerrada = BG.cajaCerrada(f);
    const cierre = BG.db.cierres.find((c) => c.fecha === f);
    const movs = BG.movimientosDelDia(f);
    // Plata que salió de la caja: devoluciones y saldos a favor devueltos, y gastos pagados con el efectivo de la caja.
    const egresos = (BG.db.egresos || []).filter((x) => x.fecha === f).sort((a, b) => a.ts.localeCompare(b.ts));
    const gastosCaja = BG.gastosVivos().filter((g) => g.fecha === f && g.forma === 'caja');
    const devueltoEf = sum(egresos.filter((x) => x.forma === 'efectivo'), (x) => x.monto);
    const gastadoEf = sum(gastosCaja, (g) => g.monto);
    const salioEf = devueltoEf + gastadoEf;
    const salidas = egresos.map((x) => ({ ts: x.ts, titulo: BG.cliente(x.clienteId).nombre, sub: x.concepto + ' · ' + BG.FORMAS[x.forma] + ' · por ' + x.usuario + (x.autorizadoPor ? ' · autorizó ' + x.autorizadoPor : ''), monto: x.monto }))
      .concat(gastosCaja.map((g) => ({ ts: g.ts, titulo: 'Gasto: ' + g.concepto, sub: g.categoria + ' · efectivo de la caja · por ' + g.usuario, monto: g.monto })))
      .sort((a, b) => a.ts.localeCompare(b.ts));
    const efectivoNeto = t.efectivo - salioEf;
    const html = '<div class="page">'
      + '<div class="page-head"><div><p class="eyebrow">' + BG.fmtFechaLarga(f) + '</p><h1 class="page-title">Caja del día</h1><p class="page-sub">Arqueo: lo que entró por cada forma de pago, para cuadrar la caja física con el sistema.</p></div>'
      + '<div class="page-actions"><a class="btn btn-quiet" href="#/caja?fecha=' + BG.sumarDias(f, -1) + '" aria-label="Día anterior">' + icon('left') + '</a>'
      + '<label class="sr-only" for="c-fecha">Fecha</label><input id="c-fecha" class="input input-date" type="date" value="' + f + '" max="' + h + '">'
      + (f < h ? '<a class="btn btn-quiet" href="#/caja?fecha=' + BG.sumarDias(f, 1) + '" aria-label="Día siguiente">' + icon('right') + '</a>' : '') + '</div></div>'
      + (cerrada ? '<div class="callout callout-good">' + icon('lock') + '<div><strong>Caja cerrada' + (cierre ? ' el ' + BG.fmtFecha(cierre.ts.slice(0, 10)) + ' a las ' + BG.fmtHora(cierre.ts) + ' por ' + esc(cierre.usuario) : '') + '.</strong> '
        + 'Los movimientos de este día ya no se pueden anular ni cambiar sin la autorización de ' + esc(BG.nombreDuena()) + '.'
        + (BG.esDuena() ? ' <button type="button" class="linkish" data-accion="reabrir">Reabrir con PIN</button>' : '') + '</div></div>' : '')
      + '<div class="grid-2"><section class="card"><div class="card-head"><h2>Lo que entró</h2><span class="small muted">' + pagos.length + ' cobros</span></div>'
      + '<div class="table-wrap table-bare"><table class="table"><thead><tr><th>Forma de pago</th><th class="num">Cobros</th><th class="num">Monto</th></tr></thead><tbody>'
      + ['efectivo', 'transferencia', 'qr', 'tarjeta'].map((k) => '<tr><td>' + BG.FORMAS[k] + '</td><td class="num">' + n(k) + '</td><td class="num">' + gs(t[k]) + '</td></tr>').join('')
      + '</tbody><tfoot><tr><td colspan="2">Total cobrado</td><td class="num">' + gs(cobrado) + '</td></tr></tfoot></table></div>'
      + '<p class="hint list-top">Ventas del día: ' + ventas.length + ' por ' + gs(sum(ventas, (v) => v.total)) + '. Quedó a cuenta: ' + gs(sum(ventas, BG.saldoVenta)) + '.'
      + (t.saldo ? ' Saldo a favor usado: ' + gs(t.saldo) + ' (no es dinero nuevo).' : '') + '</p>'
      + (salidas.length ? '<h3 class="card-sub list-top">Lo que salió</h3><div class="table-wrap table-bare"><table class="table table-compact"><thead><tr><th>Hora</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>'
        + salidas.map((x) => '<tr><td class="nowrap">' + BG.fmtHora(x.ts) + '</td><td><div class="t-title">' + esc(x.titulo) + '</div><div class="t-sub">' + esc(x.sub) + '</div></td><td class="num">−' + gs(x.monto) + '</td></tr>').join('')
        + '</tbody><tfoot><tr><td colspan="2">Total que salió</td><td class="num">−' + gs(sum(salidas, (x) => x.monto)) + '</td></tr></tfoot></table></div>' : '')
      + '</section>'
      + '<section class="card stack"><div class="card-head"><h2>Arqueo del efectivo</h2></div>'
      + '<dl class="summary">' + (salioEf ? '<dt>Cobrado en efectivo</dt><dd>' + gs(t.efectivo) + '</dd>' + (devueltoEf ? '<dt>Devuelto en efectivo</dt><dd>−' + gs(devueltoEf) + '</dd>' : '')
        + (gastadoEf ? '<dt>Gastos pagados con la caja</dt><dd>−' + gs(gastadoEf) + '</dd>' : '') : '')
      + '<dt>Efectivo según el sistema</dt><dd>' + gs(cierre ? cierre.efectivoEsperado : efectivoNeto) + '</dd>'
      + (cierre ? '<dt>Efectivo contado</dt><dd>' + gs(cierre.efectivoContado) + '</dd><div class="sep"></div><dt><strong>Diferencia</strong></dt><dd class="big ' + (cierre.efectivoContado === cierre.efectivoEsperado ? 'clear' : 'due') + '">' + gs(cierre.efectivoContado - cierre.efectivoEsperado) + '</dd>' : '')
      + '</dl>'
      + (cierre && cierre.nota ? '<p class="callout">' + icon('info') + '<span>' + esc(cierre.nota) + '</span></p>' : '')
      + (!cerrada ? '<div class="field"><label for="c-contado">Efectivo contado en la caja</label>' + BG.campoGs('c-contado', 0, 'placeholder="0"') + '</div>'
        + '<p class="summary-line" id="c-dif"></p><div class="field"><label for="c-nota">Nota (si hay diferencia)</label><input id="c-nota" class="input" autocomplete="off" placeholder="Ej.: se dio mal un vuelto"></div>'
        + '<button type="button" class="btn btn-primary" data-accion="cerrar">' + icon('lock') + 'Cerrar la caja del ' + BG.fmtFechaCorta(f) + '</button>'
        + '<p class="hint">Al cerrar, los movimientos de ese día quedan bloqueados: para anular algo hace falta la autorización de ' + esc(BG.nombreDuena()) + ' (PIN).</p>' : '')
      + '</section></div>'
      + '<section class="card card-flush"><div class="card-head pad"><h2>Movimientos del día</h2></div>'
      + (movs.length ? '<ul class="list list-plain">' + movs.map((m) => '<li><a class="list-row" href="' + m.href + '"><span class="avatar">' + icon(m.icono, 'i-sm') + '</span><span class="row-main"><span class="row-title' + (m.anulado ? ' strike' : '') + '">' + m.titulo + '</span><span class="row-sub">' + m.sub + '</span></span><span class="row-end"><span class="amount' + (m.anulado ? ' strike' : '') + '">' + gs(m.monto) + '</span>' + (m.extra || '') + '</span></a></li>').join('') + '</ul>'
        : '<p class="empty">Sin movimientos este día.</p>') + '</section></div>';
    return {
      html: html,
      mount: (root) => {
        $('#c-fecha', root).addEventListener('change', (ev) => { if (ev.target.value) BG.ir('#/caja?fecha=' + ev.target.value); });
        const cont = $('#c-contado', root);
        const dif = () => {
          const d = BG.leerGs(cont) - efectivoNeto;
          $('#c-dif', root).innerHTML = cont.value ? (d === 0 ? '<span class="pill pill-good">' + icon('check') + 'Cuadra justo</span>' : '<span class="pill pill-warn">' + icon('alert') + (d > 0 ? 'Sobran ' : 'Faltan ') + gs(Math.abs(d)) + '</span>') : '';
        };
        if (cont) { cont.addEventListener('input', dif); dif(); }
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          if (b.dataset.accion === 'cerrar') {
            if (!cont.value) { BG.toast('Contá el efectivo y escribí el monto antes de cerrar.', 'error'); cont.focus(); return; }
            const contado = BG.leerGs(cont);
            const nota = $('#c-nota', root).value.trim();
            if (contado !== efectivoNeto && !nota) { BG.toast('Hay diferencia: escribí una nota que la explique.', 'error'); $('#c-nota', root).focus(); return; }
            const ok = await BG.modal({ titulo: 'Cerrar la caja del ' + BG.fmtFecha(f), cuerpo: '<p>Efectivo según el sistema <strong>' + gs(efectivoNeto) + '</strong>' + (salioEf ? ' (cobrado ' + gs(t.efectivo) + ' − devuelto ' + gs(salioEf) + ')' : '') + ', contado <strong>' + gs(contado) + '</strong>.</p><p>Después de cerrar, los movimientos de este día quedan bloqueados.</p>', acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Cerrar caja', valor: 'ok', clase: 'btn-primary' }] });
            if (ok !== 'ok') return;
            BG.cerrarCaja(f, efectivoNeto, contado, nota);
            BG.toast('Caja del ' + BG.fmtFecha(f) + ' cerrada.');
            BG.render();
          }
          if (b.dataset.accion === 'reabrir' && (await BG.pedirPin('Reabrir la caja del ' + BG.fmtFecha(f) + ' (y los días siguientes).'))) {
            BG.reabrirCaja(f);
            BG.toast('Caja reabierta.');
            BG.render();
          }
        });
      },
    };
  };

  /* ── Ajustes ─────────────────────────────────────────────────────────── */

  function descargarCSV(nombre, filas) {
    const celda = (v) => {
      const s = v == null ? '' : String(v);
      return s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf(LF) >= 0 || s.indexOf(CR) >= 0 ? '"' + s.split('"').join('""') + '"' : s;
    };
    const texto = String.fromCharCode(0xfeff) + filas.map((f) => f.map(celda).join(';')).join(CR + LF);
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const EXPORTAR = {
    clientes: () => [['Nombre', 'CI/RUC', 'Teléfono', 'Dirección', 'Correo', 'Alta', 'Saldo pendiente', 'Saldo a favor']]
      .concat(BG.db.clientes.map((c) => [c.nombre, c.ci, c.telefono, c.direccion, c.email, BG.fmtFecha(c.alta), BG.saldoCliente(c.id), BG.creditoCliente(c.id)])),
    ventas: () => [['Recibo', 'Fecha', 'Cliente', 'Artículos', 'Subtotal', 'Descuento', 'Total', 'Pagado', 'Saldo', 'Estado']]
      .concat(BG.db.ventas.map((v) => [v.recibo, BG.fmtFecha(v.fecha), BG.cliente(v.clienteId).nombre, v.items.filter((it) => BG.cantidadViva(it) > 0).map((it) => BG.cantidadViva(it) + ' × ' + it.descripcion).join(' / '), v.subtotal, v.descuento.monto, v.total,
        BG.pagadoVenta(v), BG.saldoVenta(v), v.anulada ? 'Anulada: ' + v.anulada.motivo : BG.saldoVenta(v) > 0 ? 'Con saldo' : 'Saldada'])),
    productos: () => [['Código', 'Descripción', 'Categoría', 'Proveedor', 'Cantidad', 'Disponibles', 'Costo US$', 'Peso kg', 'Dólar usado', 'Costo total Gs', 'Precio de venta', 'Fecha de carga']]
      .concat(BG.db.productos.map((p) => [p.codigo, p.descripcion, p.categoria, p.proveedor, p.cantidad, BG.disponibles(p), p.costoUSD ? C.fmtNum(p.costoUSD, 2, 4) : '', C.fmtNum(p.pesoKg, 3, 4), C.fmtNum(p.cotizacion, 0, 2), p.costoTotalGs, p.precioVenta, BG.fmtFecha(p.fechaCarga)])),
  };

  /** Configuración de la meta y la comisión de una vendedora (se repinta sola, sin mover la pantalla). */
  function htmlComision(u) {
    const c = Object.assign({ activa: false, base: 'ganancia', porcentaje: 10, meta: 0, ve: true }, u.comision);
    const [d1, h1] = BG.mesActual();
    const com = BG.comisionDe(u, d1, h1);
    const pcts = c.base === 'cobrado' ? [1, 2, 3, 4, 5] : [5, 10, 15, 20, 25];
    return '<div class="card-head"><h2>' + icon('target') + 'Meta y comisión de ' + esc(u.nombre) + '</h2></div>'
      + '<label class="check-inline"><input type="checkbox" data-com="activa" data-usuario="' + u.id + '"' + (c.activa ? ' checked' : '') + '> Calcular meta y comisión</label>'
      + (c.activa
        ? '<div class="field"><span class="field-label" id="com-b-l">Se calcula sobre</span><div class="seg" role="radiogroup" aria-labelledby="com-b-l">'
          + '<label><input type="radio" name="com-base" data-usuario="' + u.id + '" value="ganancia"' + (c.base !== 'cobrado' ? ' checked' : '') + '>La ganancia de lo cobrado</label>'
          + '<label><input type="radio" name="com-base" data-usuario="' + u.id + '" value="cobrado"' + (c.base === 'cobrado' ? ' checked' : '') + '>Todo lo cobrado</label></div>'
          + '<span class="hint">' + (c.base === 'cobrado' ? 'Fácil de explicar, pero cobra lo mismo aunque haga descuentos grandes.' : 'Recomendado: si hace un descuento grande, gana menos comisión, así cuida el margen. Una venta sin ganancia no suma, y lo devuelto se descuenta.') + '</span></div>'
          + '<div class="field"><span class="field-label" id="com-p-l">Porcentaje</span><div class="seg" role="radiogroup" aria-labelledby="com-p-l">'
          + pcts.map((x) => '<label><input type="radio" name="com-pct" data-usuario="' + u.id + '" value="' + x + '"' + (Number(c.porcentaje) === x ? ' checked' : '') + '>' + x + ' %</label>').join('') + '</div></div>'
          + '<div class="field"><label for="com-meta">Meta de cobranza por mes <span class="small muted">(lo que se cobra de sus ventas)</span></label><div class="row row-nowrap">' + BG.campoGs('com-meta', c.meta, 'placeholder="0"')
          + '<button type="button" class="btn" data-accion="guardar-meta" data-usuario="' + u.id + '">Guardar meta</button></div></div>'
          + '<label class="check-inline"><input type="checkbox" data-com="ve" data-usuario="' + u.id + '"' + (c.ve ? ' checked' : '') + '> ' + esc(u.nombre) + ' ve su avance y su comisión en Inicio</label>'
          + '<div class="callout">' + icon('info') + '<div>Este mes: cobrado de sus ventas <strong>' + gs(com.cobrado) + '</strong>' + (c.meta ? ' de ' + gs(c.meta) : '') + ' · comisión estimada <strong>' + gs(com.comision) + '</strong>. '
          + 'El detalle venta por venta está en <a href="#/resumen">Resumen</a>.</div></div>'
        : '<p class="hint">Sin comisión: no se calcula ni se muestra.</p>');
  }

  /** Ventas a cuenta: límite general y atraso permitido. */
  function htmlCredito() {
    const c = BG.configCredito();
    return '<div class="card-head"><h2>' + icon('lock') + 'Ventas a cuenta (límite de crédito)</h2></div>'
      + '<label class="check-inline"><input type="checkbox" id="cr-activo"' + (c.activo ? ' checked' : '') + '> Controlar el límite al vender a cuenta</label>'
      + (c.activo
        ? '<div class="field"><label for="cr-limite">Límite general por clienta</label><div class="row row-nowrap">' + BG.campoGs('cr-limite', c.limite, 'placeholder="0"')
          + '<button type="button" class="btn" data-accion="guardar-limite">Guardar</button></div><span class="hint">A una clienta puntual le podés poner otro monto, o «solo al contado», desde su ficha.</span></div>'
          + '<div class="field"><span class="field-label" id="cr-dias-l">No venderle a cuenta si tiene una cuota atrasada hace más de</span><div class="seg" role="radiogroup" aria-labelledby="cr-dias-l">'
          + [7, 15, 30, 60].map((d) => '<label><input type="radio" name="cr-dias" value="' + d + '"' + (c.diasAtraso === d ? ' checked' : '') + '>' + d + ' días</label>').join('') + '</div></div>'
          + '<p class="hint">Si una venta pasa el límite, Jazmín ve el aviso y necesita tu PIN; vos podés venderle igual (queda anotado).</p>'
        : '<p class="hint">Sin control: se puede vender a cuenta sin límite.</p>');
  }
  /** Clientas frecuentes: puntos y regalo de cumpleaños. */
  function htmlFidelidad() {
    const f = BG.configFidelidad();
    const pct = (f.valorPunto * 100) / f.cadaGs;
    const seg = (name, vals, sel, fmt) => '<div class="seg" role="radiogroup">' + vals.map((v) => '<label><input type="radio" name="' + name + '" value="' + v + '"' + (sel === v ? ' checked' : '') + '>' + fmt(v) + '</label>').join('') + '</div>';
    return '<div class="card-head"><h2>' + icon('star') + 'Clientas frecuentes</h2><a class="small" href="#/reportes?tab=clientas">Ver clientas</a></div>'
      + '<label class="check-inline"><input type="checkbox" id="fi-activo"' + (f.activo ? ' checked' : '') + '> Sumar puntos por compras</label>'
      + (f.activo
        ? '<div class="field"><span class="field-label">1 punto cada</span>' + seg('fi-cada', [5000, 10000, 20000], f.cadaGs, gs) + '</div>'
          + '<div class="field"><span class="field-label">Cada punto vale</span>' + seg('fi-valor', [100, 200, 300, 500], f.valorPunto, gs) + '</div>'
          + '<div class="field"><span class="field-label">Se canjea desde</span>' + seg('fi-min', [20, 50, 100], f.minimo, (v) => v + ' puntos') + '</div>'
          + '<p class="callout">' + icon('info') + '<span>Devuelve el ' + String(Math.round(pct * 10) / 10).replace('.', ',') + ' % de lo que pagan: una compra de ' + gs(300000) + ' suma ' + Math.floor(300000 / f.cadaGs) + ' puntos = ' + gs(Math.floor(300000 / f.cadaGs) * f.valorPunto) + '. '
            + 'Al canjear, pasa a su saldo a favor y en la ganancia neta cuenta como gasto de beneficios.</span></p>'
        : '')
      + '<label class="check-inline"><input type="checkbox" id="fi-cumple"' + (f.activo && f.cumple.activo ? ' checked' : '') + (f.activo ? '' : ' disabled') + '> Regalo de cumpleaños</label>'
      + (f.activo && f.cumple.activo ? '<div class="field"><span class="field-label">Descuento en la semana de su cumpleaños</span>' + seg('fi-pct', [5, 10, 15, 20], f.cumple.porcentaje, (v) => v + ' %') + '</div>' : '')
      + '<p class="hint">Jazmín no ve esta configuración: al elegir la clienta le aparece el aviso con un botón para aplicar el beneficio.</p>';
  }

  BG.vistas.ajustes = () => {
    const cfg = BG.db.config;
    const hist = (lista, fmt) => '<ul class="hist">' + lista.slice().reverse().slice(0, 5).map((h) => '<li><span>' + fmt(h.valor) + '</span><span class="muted small">' + BG.fmtFecha(h.fecha) + ' · ' + esc(h.usuario) + '</span></li>').join('') + '</ul>';
    const t = cfg.tienda;
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Ajustes</h1><p class="page-sub">Parámetros del cálculo, datos del recibo, usuarios y respaldos. Cada cambio queda en la auditoría.</p></div></div>'
      + '<div class="grid-2">'
      + '<section class="card stack"><div class="card-head"><h2>Dólar y courier</h2></div>'
      + '<div class="setting"><div><span class="field-label">Cotización del dólar</span><p class="setting-value">' + C.fmtCot(cfg.cotizacion.valor) + '</p><p class="hint">Último cambio: ' + BG.fmtFecha(cfg.cotizacion.fecha) + ' a las ' + BG.fmtHora(cfg.cotizacion.ts) + '</p></div>'
      + '<button type="button" class="btn" data-param="cotizacion">Cambiar</button></div>' + hist(cfg.historialCotizacion, C.fmtCot)
      + '<div class="setting"><div><span class="field-label">Tarifa del courier</span><p class="setting-value">' + C.fmtUSD(cfg.tarifa.valor) + ' por kg</p><p class="hint">Desde el ' + BG.fmtFecha(cfg.tarifa.fecha) + '</p></div>'
      + '<button type="button" class="btn" data-param="tarifa">Cambiar</button></div>'
      + '<p class="hint">Los productos ya cargados conservan el dólar y el envío del día en que se cargaron.</p></section>'
      + '<section class="card stack"><div class="card-head"><h2>Precios sugeridos</h2></div>'
      + '<div class="setting"><div><span class="field-label">Redondeo</span><p class="setting-value">' + BG.textoRedondeo(cfg.redondeo) + '</p></div><button type="button" class="btn" data-param="redondeo">Cambiar</button></div>'
      + '<div class="field"><span class="field-label" id="aj-m">Margen preseleccionado al cargar</span><div class="seg" role="radiogroup" aria-labelledby="aj-m">'
      + C.MARGENES.map((m) => '<label><input type="radio" name="aj-margen" value="' + m + '"' + (cfg.margenDefecto === m ? ' checked' : '') + '>' + m + ' %</label>').join('') + '</div>'
      + '<span class="hint">Siempre se muestran los cuatro (50, 80, 100 y 120 %); este es el que viene marcado.</span></div></section>'
      + '<section class="card stack"><div class="card-head"><h2>Tienda y recibo</h2><a class="small" href="#/recibo/v/' + ultimaVentaId() + '">Ver un recibo</a></div>'
      + '<div class="fields">'
      + '<div class="field span-2"><label for="t-nombre">Nombre de la tienda</label><input id="t-nombre" class="input" value="' + esc(t.nombre) + '"></div>'
      + '<div class="field"><label for="t-wa">WhatsApp</label><input id="t-wa" class="input" type="tel" value="' + esc(t.whatsapp) + '"></div>'
      + '<div class="field"><label for="t-ig">Instagram</label><input id="t-ig" class="input" value="' + esc(t.instagram) + '"></div>'
      + '<div class="field span-2"><label for="t-dir">Dirección</label><input id="t-dir" class="input" value="' + esc(t.direccion) + '"></div>'
      + '<div class="field span-2"><label for="t-msg">Mensaje al pie del recibo</label><input id="t-msg" class="input" value="' + esc(t.mensaje) + '"></div>'
      + '</div><div class="form-actions"><button type="button" class="btn btn-primary" data-accion="guardar-tienda">Guardar datos</button></div></section>'
      + '<section class="card stack"><div class="card-head"><h2>Identidad visual del recibo</h2></div>'
      + '<p class="small">El recibo es lo único que ve la clienta: lleva el logo y los colores de la marca. Hasta tener los archivos definitivos se usa un logo provisorio.</p>'
      + '<div class="brand-preview" id="aj-logo">' + BG.logo(true) + '</div>'
      + '<div class="row"><label class="btn" for="aj-file">' + icon('upload') + 'Subir logo (PNG, JPG o SVG)</label><input id="aj-file" class="sr-only" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp">'
      + (cfg.marca.logo ? '<button type="button" class="btn btn-quiet" data-accion="quitar-logo">Volver al provisorio</button>' : '') + '</div>'
      + '<div class="row"><label class="color-field" for="aj-c1"><input id="aj-c1" type="color" value="' + esc(cfg.marca.principal) + '"> Color principal</label>'
      + '<label class="color-field" for="aj-c2"><input id="aj-c2" type="color" value="' + esc(cfg.marca.acento) + '"> Color de acento</label></div></section>'
      + '<section class="card stack"><div class="card-head"><h2>Usuarios y permisos</h2></div>'
      + BG.db.usuarios.map((u) => u.rol === 'admin'
        ? '<div class="callout">' + icon('shield') + '<div><strong>' + esc(u.nombre) + ' · dueño</strong> (usuario «' + esc(u.usuario) + '»). Ve y cambia todo: costos, dólar, precios, anulaciones, ajustes, resumen y la auditoría de lo que hace cada usuario.</div></div>'
        : '<div class="stack"><p><strong>' + esc(u.nombre) + ' · vendedora</strong> <span class="small muted">(usuario «' + esc(u.usuario) + '»)</span></p><div class="perm-list">'
          + '<label class="perm is-fixed"><input type="checkbox" checked disabled><strong>Ver ventas, clientes y cuánto debe cada uno</strong><span>Siempre, es la base de su perfil.</span></label>'
          + BG.PERMISOS.map(([k, t, desc]) => '<label class="perm"><input type="checkbox" data-permiso="' + k + '" data-usuario="' + u.id + '"' + (u.permisos && u.permisos[k] ? ' checked' : '') + '><strong>' + esc(t) + '</strong><span>' + esc(desc) + '</span></label>').join('')
          + '<label class="perm is-fixed"><input type="checkbox" disabled><strong>Costos, dólar, márgenes, anular, gastos y ganancia neta, pedidos, conteo, límites de crédito, puntos, resumen y ajustes</strong><span>Nunca: son solo del dueño. Ella solo ve los avisos al vender.</span></label>'
          + '</div></div>').join('')
      + '<div class="field"><span class="field-label" id="aj-min">Margen mínimo sin tu autorización</span><div class="seg" role="radiogroup" aria-labelledby="aj-min">'
      + [0, 20, 30, 40, 50].map((m) => '<label><input type="radio" name="aj-minimo" value="' + m + '"' + (BG.margenMinimo() === m ? ' checked' : '') + '>' + m + ' %</label>').join('') + '</div>'
      + '<span class="hint">Sobre el costo, como los precios sugeridos. Si un precio especial o un descuento de la vendedora deja menos margen, la venta pide tu PIN. Vender por debajo del costo siempre lo pide.</span></div>'
      + '<p class="hint">Probalo con «Ver como» arriba (o en «Más» desde el celular). Cada cambio de permisos queda en la auditoría.</p></section>'
      + BG.db.usuarios.filter((u) => u.rol === 'vendedor').map((u) => '<section class="card stack" id="com-' + u.id + '">' + htmlComision(u) + '</section>').join('')
      + '<section class="card stack" id="aj-credito">' + htmlCredito() + '</section>'
      + '<section class="card stack" id="aj-fidelidad">' + htmlFidelidad() + '</section>'
      + '<section class="card stack"><div class="card-head"><h2>Envíos</h2></div>'
      + '<p class="small">Salen de <strong>' + esc(cfg.envios.origen.ciudad) + ' (' + esc(cfg.envios.origen.departamento) + ')</strong>. Empresas con las que mandan (aparecen al preparar un envío):</p>'
      + '<ul class="list" id="aj-empresas">' + cfg.envios.empresas.map((x, i) => '<li class="list-row"><span class="row-main"><span class="row-title">' + esc(x.nombre) + '</span><span class="row-sub">' + esc(x.servicio) + '</span></span>'
        + '<button type="button" class="btn-icon" data-quitar-empresa="' + i + '" aria-label="Quitar ' + esc(x.nombre) + '">' + icon('x') + '</button></li>').join('') + '</ul>'
      + '<div class="fields"><div class="field"><label for="emp-nombre">Empresa</label><input id="emp-nombre" class="input" autocomplete="off" placeholder="Nombre"></div>'
      + '<div class="field"><label for="emp-servicio">Servicio</label><select id="emp-servicio" class="select"><option>Encomienda en ómnibus</option><option>Courier a domicilio</option><option>Correo</option><option>Transportadora</option></select></div></div>'
      + '<div class="form-actions"><button type="button" class="btn" data-accion="agregar-empresa">' + icon('plus') + 'Agregar empresa</button></div>'
      + '<p class="hint">Las de la lista son ejemplos: dejá las que realmente usan.</p></section>'
      + '<section class="card stack"><div class="card-head"><h2>Respaldo y exportación</h2></div>'
      + '<div class="note-mock">' + icon('info') + '<span>En el sistema real: copia de seguridad automática de la base de datos todos los días, guardada fuera del servidor. En este mockup los datos viven solo en este navegador.</span></div>'
      + (BG.publicado
        ? '<p class="small">Descargar los datos a Excel funciona en el mockup de la computadora; esta versión por link no permite descargas.</p>'
        : '<p class="small">Descargar los datos a Excel (CSV separado por punto y coma):</p><div class="row">'
          + '<button type="button" class="btn btn-sm" data-exportar="clientes">' + icon('download', 'i-sm') + 'Clientes</button>'
          + '<button type="button" class="btn btn-sm" data-exportar="ventas">' + icon('download', 'i-sm') + 'Ventas</button>'
          + '<button type="button" class="btn btn-sm" data-exportar="productos">' + icon('download', 'i-sm') + 'Productos</button></div>')
      + '<div class="card-foot"><span class="small muted">¿Probaste mucho y querés empezar de nuevo?</span><button type="button" class="btn btn-sm btn-danger" data-accion="reiniciar">' + icon('refresh', 'i-sm') + 'Reiniciar datos de ejemplo</button></div></section>'
      + '</div></div>';
    return {
      html: html,
      mount: (root) => {
        BG.enlazarParametros(root, () => BG.render());
        const repintarComision = (uid) => {
          const host = $('#com-' + uid, root);
          const u = BG.db.usuarios.find((x) => x.id === uid);
          if (host && u) { host.innerHTML = htmlComision(u); BG.enlazarCampos(host); }
        };
        const repintar = (id, fn) => { const host = $('#' + id, root); if (host) { host.innerHTML = fn(); BG.enlazarCampos(host); } };
        root.addEventListener('change', async (e) => {
          const t = e.target;
          if (t.id === 'cr-activo') { BG.guardarCredito({ activo: t.checked }); BG.toast(t.checked ? 'Límite de crédito activado.' : 'Sin control de límite.'); repintar('aj-credito', htmlCredito); return; }
          if (t.name === 'cr-dias') { BG.guardarCredito({ diasAtraso: Number(t.value) }); BG.toast('Atraso permitido: ' + t.value + ' días.'); return; }
          if (t.id === 'fi-activo') { BG.guardarFidelidad({ activo: t.checked }); BG.toast(t.checked ? 'Programa de clientas frecuentes activado.' : 'Programa desactivado.'); repintar('aj-fidelidad', htmlFidelidad); return; }
          if (t.id === 'fi-cumple') { BG.guardarFidelidad({ cumple: { activo: t.checked } }); BG.toast(t.checked ? 'Regalo de cumpleaños activado.' : 'Sin regalo de cumpleaños.'); repintar('aj-fidelidad', htmlFidelidad); return; }
          if (t.name === 'fi-cada' || t.name === 'fi-valor' || t.name === 'fi-min') {
            BG.guardarFidelidad(t.name === 'fi-cada' ? { cadaGs: Number(t.value) } : t.name === 'fi-valor' ? { valorPunto: Number(t.value) } : { minimo: Number(t.value) });
            BG.toast('Programa actualizado.');
            repintar('aj-fidelidad', htmlFidelidad);
            return;
          }
          if (t.name === 'fi-pct') { BG.guardarFidelidad({ cumple: { porcentaje: Number(t.value) } }); BG.toast('Regalo de cumpleaños: ' + t.value + ' %.'); return; }
          if (t.dataset && t.dataset.com) {
            BG.guardarComision(t.dataset.usuario, { [t.dataset.com]: t.checked });
            BG.toast(t.dataset.com === 'activa' ? (t.checked ? 'Meta y comisión activadas.' : 'Comisión desactivada.') : (t.checked ? 'Ella ve su avance en Inicio.' : 'Su avance queda oculto para ella.'));
            repintarComision(t.dataset.usuario);
            return;
          }
          if (t.name === 'com-base') {
            BG.guardarComision(t.dataset.usuario, { base: t.value, porcentaje: t.value === 'cobrado' ? 3 : 10 });
            BG.toast('Comisión sobre ' + (t.value === 'cobrado' ? 'todo lo cobrado (3 %).' : 'la ganancia de lo cobrado (10 %).'));
            repintarComision(t.dataset.usuario);
            return;
          }
          if (t.name === 'com-pct') { BG.guardarComision(t.dataset.usuario, { porcentaje: Number(t.value) }); BG.toast('Comisión: ' + t.value + ' %.'); repintarComision(t.dataset.usuario); return; }
          if (t.name === 'aj-margen') { BG.cambiarMargenDefecto(Number(t.value)); BG.toast('Margen preseleccionado: ' + t.value + ' %.'); }
          if (t.name === 'aj-minimo') { BG.cambiarMargenMinimo(Number(t.value)); BG.toast('Margen mínimo sin autorización: ' + t.value + ' %.'); }
          if (t.dataset && t.dataset.permiso) {
            const u = BG.db.usuarios.find((x) => x.id === t.dataset.usuario);
            BG.actualizarPermiso(u.id, t.dataset.permiso, t.checked);
            BG.toast((t.checked ? 'Habilitado para ' : 'Quitado a ') + u.nombre + ': ' + BG.PERMISOS.find((p) => p[0] === t.dataset.permiso)[1].toLowerCase() + '.');
          }
          if (t.id === 'aj-c1' || t.id === 'aj-c2') { BG.guardarMarca(t.id === 'aj-c1' ? { principal: t.value } : { acento: t.value }); BG.toast('Color guardado: se ve en el recibo.'); }
          if (t.id === 'aj-file' && t.files[0]) {
            const file = t.files[0];
            if (file.size > 600 * 1024) { BG.toast('El logo pesa más de 600 KB: exportalo más liviano (por ejemplo PNG de 600 px de ancho).', 'error'); return; }
            const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
            if (BG.guardarMarca({ logo: url })) BG.toast('Logo cargado. Ya aparece en el recibo.');
            else { BG.guardarMarca({ logo: null }); BG.toast('El navegador no tiene lugar para guardar ese logo: probá con uno más liviano.', 'error'); }
            BG.render();
          }
        });
        root.addEventListener('click', async (e) => {
          const q = e.target.closest('[data-quitar-empresa]');
          if (q) {
            const lista = cfg.envios.empresas.slice();
            const [quitada] = lista.splice(Number(q.dataset.quitarEmpresa), 1);
            BG.guardarEmpresasEnvio(lista);
            BG.toast('Quitada: ' + quitada.nombre + '.');
            BG.render();
            return;
          }
          const b = e.target.closest('[data-accion], [data-exportar]');
          if (!b) return;
          if (b.dataset.accion === 'guardar-limite') {
            const lim = BG.leerGs($('#cr-limite', root));
            if (!(lim > 0)) { BG.toast('Escribí el límite general (por ejemplo ₲ 1.000.000).', 'error'); return; }
            BG.guardarCredito({ limite: lim });
            BG.toast('Límite general: ' + gs(lim) + ' por clienta.');
            return;
          }
          if (b.dataset.accion === 'guardar-meta') {
            const meta = BG.leerGs($('#com-meta', root));
            BG.guardarComision(b.dataset.usuario, { meta: meta });
            BG.toast(meta ? 'Meta del mes: ' + gs(meta) + '.' : 'Sin meta de cobranza.');
            repintarComision(b.dataset.usuario);
            return;
          }
          if (b.dataset.accion === 'agregar-empresa') {
            const nombre = $('#emp-nombre', root).value.trim();
            if (nombre.length < 2) { BG.toast('Escribí el nombre de la empresa.', 'error'); $('#emp-nombre', root).focus(); return; }
            BG.guardarEmpresasEnvio(cfg.envios.empresas.concat([{ nombre: nombre, servicio: $('#emp-servicio', root).value }]));
            BG.toast('Agregada: ' + nombre + '.');
            BG.render();
            return;
          }
          if (b.dataset.exportar) { descargarCSV(b.dataset.exportar + '_' + BG.hoy() + '.csv', EXPORTAR[b.dataset.exportar]()); BG.toast('Descargado: ' + b.dataset.exportar + '.'); return; }
          const a = b.dataset.accion;
          if (a === 'guardar-tienda') {
            BG.guardarTienda({ nombre: $('#t-nombre', root).value.trim() || 'berry.Glow_py', whatsapp: $('#t-wa', root).value.trim(), instagram: $('#t-ig', root).value.trim(), direccion: $('#t-dir', root).value.trim(), mensaje: $('#t-msg', root).value.trim() });
            BG.toast('Datos de la tienda guardados.');
          } else if (a === 'quitar-logo') { BG.guardarMarca({ logo: null }); BG.render(); }
          else if (a === 'reiniciar') {
            const ok = await BG.modal({ titulo: 'Reiniciar datos de ejemplo', cuerpo: '<p>Se borran las ventas, clientes y productos que cargaste mientras probabas, y vuelven los datos de ejemplo del día de hoy.</p>', acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Reiniciar', valor: 'ok', clase: 'btn-danger-solid' }] });
            if (ok !== 'ok') return;
            BG.reiniciarDatos();
            BG.renderChrome();
            BG.toast('Datos de ejemplo reiniciados.');
            BG.ir('#/inicio');
          }
        });
      },
    };
  };
  function ultimaVentaId() {
    const v = BG.db.ventas.filter((x) => !x.anulada).sort((a, b) => b.ts.localeCompare(a.ts))[0];
    return v ? v.id : '';
  }
  BG.ultimaVentaId = ultimaVentaId;

  /* ── Auditoría ───────────────────────────────────────────────────────── */

  BG.vistas.auditoria = (args, params) => {
    const tipos = [['todo', 'Todo'], ['ventas', 'Ventas'], ['precios', 'Precios especiales'], ['cobros', 'Cobros'], ['cuotas', 'Cuotas'], ['devoluciones', 'Devoluciones'], ['recibos', 'Recibos'], ['envios', 'Envíos'],
      ['anulaciones', 'Anulaciones'], ['productos', 'Productos'], ['gastos', 'Gastos'], ['fidelidad', 'Clientas frecuentes'], ['parametros', 'Parámetros'], ['caja', 'Caja'], ['clientes', 'Clientes'], ['seguridad', 'Permisos y PIN']];
    const pedido = params && params.get('tipo');
    const e = { tipo: tipos.some((x) => x[0] === pedido) ? pedido : 'todo', usuario: 'todos', q: '', max: 120 };
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Auditoría</h1><p class="page-sub">Cada venta, precio especial, cobro, recibo emitido, envío, anulación y cambio de parámetros queda con fecha, hora y usuario. No se puede editar.</p></div></div>'
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-aud">Buscar en la auditoría</label>' + icon('search') + '<input id="q-aud" class="search-input" type="search" autocomplete="off" placeholder="Buscar (cliente, recibo, motivo…)"></div>'
      + '<div class="chips" role="group" aria-label="Usuario">' + [['todos', 'Todos']].concat(BG.db.usuarios.map((u) => [u.nombre, u.nombre]))
        .map(([k, t]) => '<button type="button" class="chip" data-usuario="' + esc(k) + '" aria-pressed="' + (e.usuario === k) + '">' + esc(t) + '</button>').join('') + '</div></div>'
      + '<div class="chips" role="group" aria-label="Tipo">' + tipos.map(([k, t]) => '<button type="button" class="chip" data-tipo="' + k + '" aria-pressed="' + (e.tipo === k) + '">' + t + '</button>').join('') + '</div>'
      + '<div id="aud-lista"></div></div>';
    const pintar = (root) => {
      const q = BG.norm(e.q.trim());
      const lista = BG.db.auditoria.filter((a) => (e.tipo === 'todo' || a.tipo === e.tipo) && (e.usuario === 'todos' || a.usuario === e.usuario)
        && (!q || BG.norm(a.accion + ' ' + a.detalle + ' ' + a.usuario).includes(q)));
      $('#aud-lista', root).innerHTML = '<div class="table-wrap"><table class="table table-compact"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>'
        + lista.slice(0, e.max).map((a) => '<tr><td class="nowrap">' + BG.fmtFecha(a.ts.slice(0, 10)) + ' ' + BG.fmtHora(a.ts) + '</td><td>' + esc(a.usuario) + '</td><td class="nowrap"><strong>' + esc(a.accion) + '</strong></td><td>' + esc(a.detalle) + '</td></tr>').join('')
        + '</tbody></table></div>' + (lista.length > e.max ? '<button type="button" class="btn btn-sm list-top" data-accion="mas">Mostrar más (' + (lista.length - e.max) + ')</button>' : '')
        + (lista.length ? '' : '<p class="empty">No hay movimientos con ese filtro.</p>');
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-aud', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        root.addEventListener('click', (ev) => {
          const c = ev.target.closest('[data-tipo]');
          if (c) { e.tipo = c.dataset.tipo; $$('[data-tipo]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === c))); pintar(root); }
          const u = ev.target.closest('[data-usuario]');
          if (u) { e.usuario = u.dataset.usuario; $$('[data-usuario]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === u))); pintar(root); }
          if (ev.target.closest('[data-accion="mas"]')) { e.max += 200; pintar(root); }
        });
      },
    };
  };
})();

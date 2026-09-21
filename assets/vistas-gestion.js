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

  BG.vistas.reportes = (args, params) => {
    const e = { tab: params.get('tab') || 'ventas', periodo: params.get('periodo') || 'mes' };
    const tabs = [['ventas', 'Ventas'], ['deudores', 'Deudores'], ['stock', 'Stock'], ['ganancia', 'Ganancia']];
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Reportes</h1><p class="page-sub">Vista interna: solo la dueña ve costos y ganancias.</p></div></div>'
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
          + '</tbody><tfoot><tr><td>Total cobrado</td><td class="num">' + gs(cobrado) + '</td></tr></tfoot></table></div>'
          + (f.saldo ? '<p class="hint list-top">Además se aplicaron ' + gs(f.saldo) + ' de saldo a favor (no es dinero nuevo).</p>' : '') + '</section>';
        if (dias.length > 1) enlazarGrafico(root, 'g-ventas', dias);
      } else if (e.tab === 'deudores') {
        const ds = BG.listaDeudores();
        const cu = BG.cuadre();
        const tramo = (a, b) => sum(ds.filter((d) => { const n = BG.diasEntre(d.desde, BG.hoy()); return n >= a && n <= b; }), (d) => d.saldo);
        cuerpo.innerHTML = '<div class="tiles">' + tile('Total por cobrar', gs(sum(ds, (d) => d.saldo)), ds.length + ' clientes')
          + tile('Hasta 15 días', gs(tramo(0, 14))) + tile('De 15 a 30 días', gs(tramo(15, 30))) + tile('Más de 30 días', gs(tramo(31, 99999)), 'reclamar primero') + '</div>'
          + '<div class="callout ' + (cu.ok ? 'callout-good' : 'callout-bad') + '">' + icon(cu.ok ? 'shield' : 'alert') + '<div><strong>Cuadre automático: ' + (cu.ok ? 'cuadra' : 'NO cuadra') + '.</strong> Suma de saldos por cliente ' + gs(cu.porClientes) + ' · total por cobrar del sistema ' + gs(cu.libro) + '.</div></div>'
          + '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th class="num">Saldo</th><th class="num">Compras</th><th>Deuda más antigua</th><th><span class="sr-only">Recordar</span></th></tr></thead><tbody>'
          + ds.map((d) => '<tr class="is-link" data-href="#/clientes/' + d.c.id + '"><td><div class="t-title">' + esc(d.c.nombre) + '</div><div class="t-sub">' + esc(d.c.telefono) + '</div></td>'
            + '<td class="num"><strong>' + gs(d.saldo) + '</strong></td><td class="num">' + BG.pendientesDe(d.c.id).length + '</td><td>' + BG.fmtFecha(d.desde) + ' · ' + BG.edad(d.desde) + '</td>'
            + '<td><a class="btn btn-sm" href="' + BG.waLink(d.c, 'Hola ' + d.c.nombre.split(' ')[0] + ', te recordamos desde ' + BG.db.config.tienda.nombre + ' que tu saldo pendiente es de ' + gs(d.saldo) + '. ¡Gracias!') + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Recordar</a></td></tr>').join('')
          + '</tbody></table></div>';
      } else if (e.tab === 'stock') {
        const ps = BG.db.productos.filter((p) => BG.disponibles(p) > 0);
        const alCosto = sum(ps, (p) => BG.disponibles(p) * (p.costoTotalGs || 0));
        const aPrecio = sum(ps, (p) => BG.disponibles(p) * (p.precioVenta || 0));
        cuerpo.innerHTML = '<div class="tiles">' + tile('Unidades disponibles', String(sum(ps, BG.disponibles)), ps.length + ' productos') + tile('Stock al costo', gs(alCosto))
          + tile('Stock a precio de venta', gs(aPrecio)) + tile('Ganancia si se vende todo', gs(aPrecio - alCosto)) + '</div>'
          + '<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="num">Disp.</th><th class="num">Costo c/u</th><th class="num">Precio</th><th class="num">Valor al costo</th><th class="num">Valor a precio</th></tr></thead><tbody>'
          + ps.map((p) => '<tr class="is-link" data-href="#/productos?ver=' + p.id + '"><td><div class="t-title">' + esc(p.descripcion) + '</div><div class="t-sub">' + esc(p.categoria) + ' · dólar ' + C.fmtCot(p.cotizacion) + '</div></td>'
            + '<td class="num">' + BG.disponibles(p) + '</td><td class="num">' + (p.costoTotalGs ? gs(p.costoTotalGs) : '—') + '</td><td class="num">' + (p.precioVenta ? gs(p.precioVenta) : '—') + '</td>'
            + '<td class="num">' + gs(BG.disponibles(p) * (p.costoTotalGs || 0)) + '</td><td class="num">' + gs(BG.disponibles(p) * (p.precioVenta || 0)) + '</td></tr>').join('')
          + '</tbody></table></div>';
      } else {
        const ventas = BG.db.ventas.filter((v) => !v.anulada && enRango(v.fecha)).sort((a, b) => b.ts.localeCompare(a.ts));
        const neto = sum(ventas, (v) => v.total);
        const costo = sum(ventas, (v) => v.total - BG.gananciaVenta(v));
        const gan = neto - costo;
        cuerpo.innerHTML = '<div class="tiles">' + tile('Ventas netas', gs(neto), 'con descuentos') + tile('Costo de lo vendido', gs(costo), 'costo congelado de cada artículo')
          + tile('Ganancia real', gs(gan)) + tile('Margen real', (costo ? Math.round((gan / costo) * 100) : 0) + ' %', 'sobre el costo') + '</div>'
          + '<p class="callout">' + icon('info') + '<span>Ganancia real = precio al que se vendió − costo congelado del producto. El 50/80/100/120 % es solo la sugerencia al cargar; acá cuentan los descuentos y los precios editados.</span></p>'
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
    const html = '<div class="page">'
      + '<div class="page-head"><div><p class="eyebrow">' + BG.fmtFechaLarga(f) + '</p><h1 class="page-title">Caja del día</h1><p class="page-sub">Arqueo: lo que entró por cada forma de pago, para cuadrar la caja física con el sistema.</p></div>'
      + '<div class="page-actions"><a class="btn btn-quiet" href="#/caja?fecha=' + BG.sumarDias(f, -1) + '" aria-label="Día anterior">' + icon('left') + '</a>'
      + '<label class="sr-only" for="c-fecha">Fecha</label><input id="c-fecha" class="input input-date" type="date" value="' + f + '" max="' + h + '">'
      + (f < h ? '<a class="btn btn-quiet" href="#/caja?fecha=' + BG.sumarDias(f, 1) + '" aria-label="Día siguiente">' + icon('right') + '</a>' : '') + '</div></div>'
      + (cerrada ? '<div class="callout callout-good">' + icon('lock') + '<div><strong>Caja cerrada' + (cierre ? ' el ' + BG.fmtFecha(cierre.ts.slice(0, 10)) + ' a las ' + BG.fmtHora(cierre.ts) + ' por ' + esc(cierre.usuario) : '') + '.</strong> '
        + 'Los movimientos de este día ya no se pueden anular ni cambiar sin la autorización de la dueña.'
        + (BG.esDuena() ? ' <button type="button" class="linkish" data-accion="reabrir">Reabrir con PIN</button>' : '') + '</div></div>' : '')
      + '<div class="grid-2"><section class="card"><div class="card-head"><h2>Lo que entró</h2><span class="small muted">' + pagos.length + ' cobros</span></div>'
      + '<div class="table-wrap table-bare"><table class="table"><thead><tr><th>Forma de pago</th><th class="num">Cobros</th><th class="num">Monto</th></tr></thead><tbody>'
      + ['efectivo', 'transferencia', 'qr', 'tarjeta'].map((k) => '<tr><td>' + BG.FORMAS[k] + '</td><td class="num">' + n(k) + '</td><td class="num">' + gs(t[k]) + '</td></tr>').join('')
      + '</tbody><tfoot><tr><td colspan="2">Total cobrado</td><td class="num">' + gs(cobrado) + '</td></tr></tfoot></table></div>'
      + '<p class="hint list-top">Ventas del día: ' + ventas.length + ' por ' + gs(sum(ventas, (v) => v.total)) + '. Quedó a cuenta: ' + gs(sum(ventas, BG.saldoVenta)) + '.'
      + (t.saldo ? ' Saldo a favor usado: ' + gs(t.saldo) + ' (no es dinero nuevo).' : '') + '</p></section>'
      + '<section class="card stack"><div class="card-head"><h2>Arqueo del efectivo</h2></div>'
      + '<dl class="summary"><dt>Efectivo según el sistema</dt><dd>' + gs(t.efectivo) + '</dd>'
      + (cierre ? '<dt>Efectivo contado</dt><dd>' + gs(cierre.efectivoContado) + '</dd><div class="sep"></div><dt><strong>Diferencia</strong></dt><dd class="big ' + (cierre.efectivoContado === cierre.efectivoEsperado ? 'clear' : 'due') + '">' + gs(cierre.efectivoContado - cierre.efectivoEsperado) + '</dd>' : '')
      + '</dl>'
      + (cierre && cierre.nota ? '<p class="callout">' + icon('info') + '<span>' + esc(cierre.nota) + '</span></p>' : '')
      + (!cerrada ? '<div class="field"><label for="c-contado">Efectivo contado en la caja</label>' + BG.campoGs('c-contado', 0, 'placeholder="0"') + '</div>'
        + '<p class="summary-line" id="c-dif"></p><div class="field"><label for="c-nota">Nota (si hay diferencia)</label><input id="c-nota" class="input" autocomplete="off" placeholder="Ej.: se dio mal un vuelto"></div>'
        + '<button type="button" class="btn btn-primary" data-accion="cerrar">' + icon('lock') + 'Cerrar la caja del ' + BG.fmtFechaCorta(f) + '</button>'
        + '<p class="hint">Al cerrar, los movimientos de ese día quedan bloqueados: para anular algo hace falta la autorización de la dueña (PIN).</p>' : '')
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
          const d = BG.leerGs(cont) - t.efectivo;
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
            if (contado !== t.efectivo && !nota) { BG.toast('Hay diferencia: escribí una nota que la explique.', 'error'); $('#c-nota', root).focus(); return; }
            const ok = await BG.modal({ titulo: 'Cerrar la caja del ' + BG.fmtFecha(f), cuerpo: '<p>Efectivo según el sistema <strong>' + gs(t.efectivo) + '</strong>, contado <strong>' + gs(contado) + '</strong>.</p><p>Después de cerrar, los movimientos de este día quedan bloqueados.</p>', acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Cerrar caja', valor: 'ok', clase: 'btn-primary' }] });
            if (ok !== 'ok') return;
            BG.cerrarCaja(f, t.efectivo, contado, nota);
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
      .concat(BG.db.ventas.map((v) => [v.recibo, BG.fmtFecha(v.fecha), BG.cliente(v.clienteId).nombre, v.items.map((it) => it.cantidad + ' × ' + it.descripcion).join(' / '), v.subtotal, v.descuento.monto, v.total,
        BG.pagadoVenta(v), BG.saldoVenta(v), v.anulada ? 'Anulada: ' + v.anulada.motivo : BG.saldoVenta(v) > 0 ? 'Con saldo' : 'Saldada'])),
    productos: () => [['Código', 'Descripción', 'Categoría', 'Proveedor', 'Cantidad', 'Disponibles', 'Costo US$', 'Peso kg', 'Dólar usado', 'Costo total Gs', 'Precio de venta', 'Fecha de carga']]
      .concat(BG.db.productos.map((p) => [p.codigo, p.descripcion, p.categoria, p.proveedor, p.cantidad, BG.disponibles(p), p.costoUSD ? C.fmtNum(p.costoUSD, 2, 4) : '', C.fmtNum(p.pesoKg, 3, 4), C.fmtNum(p.cotizacion, 0, 2), p.costoTotalGs, p.precioVenta, BG.fmtFecha(p.fechaCarga)])),
  };

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
          + '<label class="perm is-fixed"><input type="checkbox" disabled><strong>Costos, dólar, márgenes, anular, resumen y ajustes</strong><span>Nunca: son solo del dueño.</span></label>'
          + '</div></div>').join('')
      + '<p class="hint">Probalo con «Ver como» arriba (o en «Más» desde el celular). Cada cambio de permisos queda en la auditoría.</p></section>'
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
        root.addEventListener('change', async (e) => {
          const t = e.target;
          if (t.name === 'aj-margen') { BG.cambiarMargenDefecto(Number(t.value)); BG.toast('Margen preseleccionado: ' + t.value + ' %.'); }
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

  BG.vistas.auditoria = () => {
    const e = { tipo: 'todo', usuario: 'todos', q: '', max: 120 };
    const tipos = [['todo', 'Todo'], ['ventas', 'Ventas'], ['cobros', 'Cobros'], ['recibos', 'Recibos'], ['envios', 'Envíos'], ['anulaciones', 'Anulaciones'], ['productos', 'Productos'], ['parametros', 'Parámetros'], ['caja', 'Caja'], ['clientes', 'Clientes'], ['seguridad', 'Permisos y PIN']];
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Auditoría</h1><p class="page-sub">Cada venta, cobro, recibo emitido, envío, anulación y cambio de parámetros queda con fecha, hora y usuario. No se puede editar.</p></div></div>'
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

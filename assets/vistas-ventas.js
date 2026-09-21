/*!
 * berry.Glow_py — Pantallas: listado de ventas y detalle de una venta (con anulaciones).
 */
(function () {
  'use strict';
  const BG = window.BG;
  const { $, $$, esc, gs, sum, icon } = BG;

  /* ── Anular (con motivo; si el día está cerrado pide autorización) ───── */

  async function pedirMotivo(titulo, cuerpo, boton) {
    let motivo = '';
    const r = await BG.modal({
      titulo: titulo,
      cuerpo: cuerpo + '<div class="field"><label for="motivo">Motivo <span class="req">*</span></label>'
        + '<textarea id="motivo" class="textarea" rows="3" placeholder="Ej.: la clienta devolvió el artículo"></textarea>'
        + '<span class="error-text" id="motivo-error" hidden></span></div>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: boton, valor: 'ok', clase: 'btn-danger-solid' }],
      validar: (v, dlg) => {
        motivo = $('#motivo', dlg).value.trim();
        if (motivo.length >= 5) return true;
        const er = $('#motivo-error', dlg);
        er.textContent = 'Escribí el motivo (queda en la auditoría).';
        er.hidden = false;
        return false;
      },
      onMount: (dlg) => $('#motivo', dlg).focus(),
    });
    return r === 'ok' ? motivo : null;
  }

  BG.anularVentaUI = async (v) => {
    if (BG.cajaCerrada(v.fecha) && !(await BG.pedirPin('La venta es del ' + BG.fmtFecha(v.fecha) + ' y la caja de ese día ya está cerrada.'))) return false;
    const pagado = BG.pagadoVenta(v);
    const motivo = await pedirMotivo('Anular la venta ' + BG.fmtRecibo(v.recibo),
      '<p>La venta no se borra: queda en el historial marcada como anulada, con fecha, motivo y usuario. El stock vuelve a estar disponible.</p>'
      + (pagado ? '<div class="callout callout-warn">' + icon('info') + '<div>Esta venta tiene pagos por <strong>' + gs(pagado) + '</strong>. Al anularla, ese monto queda como <strong>saldo a favor</strong> del cliente.</div></div>' : ''),
      'Anular venta');
    if (!motivo) return false;
    BG.anularVenta(v.id, motivo);
    BG.toast('Venta ' + BG.fmtRecibo(v.recibo) + ' anulada.' + (pagado ? ' ' + gs(pagado) + ' quedan a favor del cliente.' : ''));
    return true;
  };

  BG.anularPagoUI = async (pg) => {
    const problema = BG.motivoNoAnulable(pg);
    if (problema) { BG.toast(problema, 'error'); return false; }
    if (BG.cajaCerrada(pg.fecha) && !(await BG.pedirPin('El pago es del ' + BG.fmtFecha(pg.fecha) + ' y la caja de ese día ya está cerrada.'))) return false;
    const motivo = await pedirMotivo('Anular el pago ' + BG.fmtRecibo(pg.recibo),
      '<p>Pago de <strong>' + gs(pg.total + pg.excedente) + '</strong> del ' + BG.fmtFecha(pg.fecha) + '. El saldo de la venta vuelve a subir; el pago queda en el historial como anulado.</p>',
      'Anular pago');
    if (!motivo) return false;
    BG.anularPago(pg.id, motivo);
    BG.toast('Pago anulado. El saldo se actualizó.');
    return true;
  };

  /* ── Listado ─────────────────────────────────────────────────────────── */

  function filaVentaConCliente(v, q) {
    const cli = BG.cliente(v.clienteId);
    const n = sum(v.items, (it) => it.cantidad);
    return '<li><a class="sale-row" href="#/ventas/' + v.id + '">'
      + '<span class="sale-date">' + BG.fmtFecha(v.fecha) + '<small>' + BG.fmtRecibo(v.recibo) + '</small></span>'
      + '<span class="sale-desc"><span class="row-title' + (v.anulada ? ' strike' : '') + '">' + (q ? BG.resaltar(cli.nombre, q) : esc(cli.nombre)) + '</span>'
      + '<span class="row-sub">' + esc(v.items.map((it) => it.descripcion).join(', ')) + ' · ' + n + (n === 1 ? ' artículo' : ' artículos') + ' · ' + gs(v.total) + '</span></span>'
      + '<span class="sale-end">' + BG.estadoVenta(v) + (!v.anulada && BG.saldoVenta(v) > 0 ? BG.edad(v.fecha) : '') + '</span></a></li>';
  }

  BG.vistas.ventas = (args, params) => {
    const e = { periodo: params.get('periodo') || 'mes', estado: params.get('estado') || 'todas', q: '' };
    const chips = (grupo, pares) => '<div class="chips" role="group">' + pares.map(([k, t]) => '<button type="button" class="chip" data-' + grupo + '="' + k + '" aria-pressed="' + (e[grupo] === k) + '">' + t + '</button>').join('') + '</div>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Ventas</h1><p class="page-sub" id="ventas-resumen"></p></div>'
      + '<div class="page-actions">' + (BG.puede('registrarCobros') ? '<a class="btn" href="#/cobros/nuevo">' + icon('cash') + 'Registrar cobro</a>' : '')
      + (BG.puede('registrarVentas') ? '<a class="btn btn-primary" href="#/ventas/nueva">' + icon('plus') + 'Nueva venta</a>' : '') + '</div></div>'
      + '<div class="toolbar">'
      + '<div class="search-box grow"><label class="sr-only" for="q-ventas">Buscar por cliente</label>' + icon('search') + '<input id="q-ventas" class="search-input" type="search" autocomplete="off" placeholder="Buscar por cliente"></div>'
      + chips('periodo', [['hoy', 'Hoy'], ['7', '7 días'], ['mes', 'Este mes'], ['todo', 'Todo']])
      + chips('estado', [['todas', 'Todas'], ['debe', 'Con saldo'], ['saldada', 'Saldadas'], ['anulada', 'Anuladas']])
      + '</div><ul class="list" id="lista-ventas"></ul></div>';
    const pintar = (root) => {
      const h = BG.hoy();
      const desde = e.periodo === 'hoy' ? h : e.periodo === '7' ? BG.sumarDias(h, -6) : e.periodo === 'mes' ? h.slice(0, 8) + '01' : '0000';
      const q = e.q.trim();
      const ids = q ? new Set(BG.buscarClientes(q, 200).map((c) => c.id)) : null;
      let lista = BG.db.ventas.filter((v) => v.fecha >= desde && (!ids || ids.has(v.clienteId)));
      if (e.estado === 'debe') lista = lista.filter((v) => BG.saldoVenta(v) > 0);
      if (e.estado === 'saldada') lista = lista.filter((v) => !v.anulada && BG.saldoVenta(v) === 0);
      if (e.estado === 'anulada') lista = lista.filter((v) => v.anulada);
      lista.sort((a, b) => b.ts.localeCompare(a.ts));
      const vivas = lista.filter((v) => !v.anulada);
      $('#ventas-resumen', root).textContent = lista.length + (lista.length === 1 ? ' venta' : ' ventas') + ' · vendido ' + gs(sum(vivas, (v) => v.total))
        + ' · cobrado ' + gs(sum(vivas, BG.pagadoVenta)) + ' · saldo ' + gs(sum(vivas, BG.saldoVenta));
      $('#lista-ventas', root).innerHTML = lista.length ? lista.map((v) => filaVentaConCliente(v, q)).join('') : '<li class="empty">No hay ventas con esos filtros.</li>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-ventas', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        $$('[data-periodo], [data-estado]', root).forEach((b) => b.addEventListener('click', () => {
          const grupo = b.dataset.periodo ? 'periodo' : 'estado';
          e[grupo] = b.dataset[grupo];
          $$('[data-' + grupo + ']', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
      },
    };
  };

  /* ── Detalle de una venta ────────────────────────────────────────────── */

  BG.vistas.venta = (args, params) => {
    const v = BG.venta(args[0]);
    if (!v) return { html: '<div class="page"><p class="empty">No encontramos esa venta. <a href="#/ventas">Ver ventas</a></p></div>' };
    const cli = BG.cliente(v.clienteId);
    const duena = BG.esDuena();
    const saldo = BG.saldoVenta(v);
    const pagos = BG.pagosDeVenta(v.id, true).sort((a, b) => a.ts.localeCompare(b.ts));
    const nueva = params.get('nueva') === '1';
    const envio = BG.envioDeVenta ? BG.envioDeVenta(v.id) : null;
    const costo = sum(v.items, (it) => (it.costoUnitGs || 0) * it.cantidad);
    const ganancia = v.total - costo;
    const textoWa = 'Hola ' + cli.nombre.split(' ')[0] + ', gracias por tu compra en ' + BG.db.config.tienda.nombre + '. Total ' + gs(v.total)
      + ', pagado ' + gs(BG.pagadoVenta(v)) + (saldo > 0 ? ', saldo pendiente ' + gs(saldo) : ', ¡quedó saldada!') + '. Recibo ' + BG.fmtRecibo(v.recibo) + '.';

    const html = '<div class="page">'
      + '<a class="back-link" href="#/clientes/' + cli.id + '">' + icon('left', 'i-sm') + esc(cli.nombre) + '</a>'
      + (nueva ? '<section class="success" aria-live="polite"><h2>' + icon('check') + 'Venta registrada · Recibo ' + BG.fmtRecibo(v.recibo) + '</h2>'
        + '<p>' + (saldo > 0 ? 'Queda un saldo de <strong>' + gs(saldo) + '</strong> en la cuenta de ' + esc(cli.nombre) + '.' : 'La venta quedó saldada.') + '</p>'
        + '<div class="row">' + (BG.puede('emitirRecibos') ? '<a class="btn btn-primary" href="#/recibo/v/' + v.id + '">' + icon('receipt') + 'Ver e imprimir recibo</a>' : '')
        + '<a class="btn" href="' + BG.waLink(cli, textoWa) + '" target="_blank" rel="noopener">' + icon('chat') + 'Enviar por WhatsApp</a>'
        + '<a class="btn btn-quiet" href="#/ventas/nueva">' + icon('plus') + 'Otra venta</a></div></section>' : '')
      + '<div class="page-head"><div><p class="eyebrow">' + BG.fmtFechaLarga(v.fecha) + ' · ' + BG.fmtHora(v.ts) + ' · por ' + esc(v.usuario) + '</p>'
      + '<h1 class="page-title">Venta ' + BG.fmtRecibo(v.recibo) + '</h1><p class="page-sub"><a href="#/clientes/' + cli.id + '">' + esc(cli.nombre) + '</a> · ' + BG.estadoVenta(v) + '</p></div>'
      + '<div class="page-actions">'
      + (saldo > 0 && BG.puede('registrarCobros') ? '<a class="btn btn-primary" href="#/cobros/nuevo?cliente=' + cli.id + '&venta=' + v.id + '">' + icon('cash') + 'Registrar cobro</a>' : '')
      + (BG.puede('emitirRecibos') ? '<a class="btn" href="#/recibo/v/' + v.id + '">' + icon('receipt') + 'Recibo</a>' : '')
      + (!v.anulada && BG.puede('prepararEnvios') ? (envio ? '<a class="btn" href="#/envios/' + envio.id + '">' + icon('truck') + 'Envío ' + esc(envio.numero) + '</a>'
        : '<a class="btn" href="#/envios/nuevo?venta=' + v.id + '">' + icon('truck') + 'Preparar envío</a>') : '')
      + (v.anulada || !BG.esDuena() ? '' : '<button type="button" class="btn btn-danger" data-accion="anular-venta">' + icon('ban') + 'Anular venta</button>')
      + '</div></div>'
      + (v.anulada ? '<div class="callout callout-bad">' + icon('ban') + '<div><strong>Venta anulada el ' + BG.fmtFecha(v.anulada.fecha) + ' a las ' + BG.fmtHora(v.anulada.ts) + ' por ' + esc(v.anulada.usuario) + '.</strong> Motivo: ' + esc(v.anulada.motivo) + '</div></div>' : '')
      + '<div class="grid-2">'
      + '<section class="card"><div class="card-head"><h2>Artículos</h2><span class="small muted">Precios congelados al vender</span></div>'
      + '<div class="table-wrap table-bare"><table class="table table-compact"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>'
      + v.items.map((it) => '<tr><td><div class="t-title">' + esc(it.descripcion) + '</div>'
        + (duena ? '<div class="t-sub">' + (it.margen ? 'Margen ' + it.margen + ' %' : 'Precio a mano') + ' · costo ' + gs(it.costoUnitGs) + '/u</div>' : '') + '</td>'
        + '<td class="num">' + it.cantidad + '</td><td class="num">' + gs(it.precio) + '</td><td class="num">' + gs(it.precio * it.cantidad) + '</td></tr>').join('')
      + '</tbody><tfoot>'
      + (v.descuento.monto ? '<tr><td colspan="3">Subtotal</td><td class="num">' + gs(v.subtotal) + '</td></tr><tr><td colspan="3">Descuento' + (v.descuento.tipo === 'porcentaje' ? ' (' + BG.C.fmtNum(v.descuento.valor, 0, 2) + ' %)' : '') + '</td><td class="num">−' + gs(v.descuento.monto) + '</td></tr>' : '')
      + '<tr><td colspan="3">Total</td><td class="num">' + gs(v.total) + '</td></tr></tfoot></table></div>'
      + (duena ? '<div class="card-foot"><span class="small muted">Solo la dueña ve esto</span><span class="small">Costo congelado <strong>' + gs(costo) + '</strong> · Ganancia real <strong>' + gs(ganancia) + '</strong>'
        + (costo ? ' (' + Math.round((ganancia / costo) * 100) + ' % sobre el costo)' : '') + '</span></div>' : '')
      + '</section>'
      + '<section class="card"><div class="card-head"><h2>Pagos</h2>' + (v.anulada ? '' : '<span class="amount">' + (saldo > 0 ? 'Debe ' + gs(saldo) : 'Saldada') + '</span>') + '</div>'
      + (pagos.length ? '<ul class="lines">' + pagos.map((p) => '<li class="line"><div class="line-top"><div class="grow">'
        + '<div class="row-title' + (p.anulado ? ' strike' : '') + '">' + gs(p.total) + (p.excedente ? ' <span class="pill pill-good">+' + gs(p.excedente) + ' a favor</span>' : '') + '</div>'
        + '<div class="row-sub">' + BG.fmtFecha(p.fecha) + ' ' + BG.fmtHora(p.ts) + ' · ' + BG.fmtRecibo(p.recibo) + (p.inicial ? ' · pago inicial' : '') + '</div>'
        + '<div class="row-sub">' + p.partes.map((x) => BG.FORMAS[x.forma] + ' ' + gs(x.monto)).join(' + ') + '</div>'
        + (p.anulado ? '<div class="row-sub">Anulado el ' + BG.fmtFecha(p.anulado.fecha) + ': ' + esc(p.anulado.motivo) + '</div>' : '')
        + '</div>' + (p.anulado || v.anulada || !BG.esDuena() ? '' : '<button type="button" class="btn btn-sm btn-quiet" data-accion="anular-pago" data-id="' + p.id + '">Anular</button>')
        + '</div></li>').join('') + '</ul>' : '<p class="empty">Todavía no hay pagos: la venta quedó a cuenta.</p>')
      + '<dl class="summary list-top"><dt>Total de la venta</dt><dd>' + gs(v.total) + '</dd><dt>Pagado</dt><dd>' + gs(BG.pagadoVenta(v)) + '</dd><div class="sep"></div>'
      + '<dt><strong>Saldo</strong></dt><dd class="big ' + (saldo > 0 ? 'due' : 'clear') + '">' + gs(saldo) + '</dd></dl>'
      + '</section></div></div>';
    return {
      html: html,
      mount: (root) => {
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          try {
            if (b.dataset.accion === 'anular-venta' && (await BG.anularVentaUI(v))) BG.render();
            if (b.dataset.accion === 'anular-pago') {
              const pg = BG.db.pagos.find((x) => x.id === b.dataset.id);
              if (await BG.anularPagoUI(pg)) BG.render();
            }
          } catch (err) {
            BG.toast(err.message, 'error');
          }
        });
      },
    };
  };
})();

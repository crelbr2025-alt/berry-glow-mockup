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

  /* ── Ajustar el precio después de vender ─────────────────────────────── */

  BG.ajustarPrecioUI = async (v) => {
    const pagado = BG.pagadoVenta(v);
    const st = { item: v.items.length === 1 ? 0 : null, precio: 0, motivo: null, nota: '' };
    const totalCon = (precio) => BG.C.totalesVenta(v.items.map((x, i) => (i === st.item ? Object.assign({}, x, { precio: precio }) : x)),
      v.descuento.valor ? { tipo: v.descuento.tipo, valor: v.descuento.valor } : null).total;
    const pintarInfo = (form) => {
      const host = $('#aj-info', form);
      if (st.item == null || !(st.precio > 0)) { host.innerHTML = ''; return; }
      const total = totalCon(st.precio);
      const ev = BG.evaluarPrecio(st.precio, v.items[st.item].costoUnitGs);
      host.innerHTML = '<dl class="summary"><dt>Total de la venta</dt><dd>' + gs(v.total) + ' → ' + gs(total) + '</dd><dt>Ya pagó</dt><dd>' + gs(pagado) + '</dd><div class="sep"></div>'
        + (total >= pagado ? '<dt><strong>Saldo nuevo</strong></dt><dd class="big ' + (total > pagado ? 'due' : 'clear') + '">' + gs(total - pagado) + '</dd>'
          : '<dd class="span error-text">Quedaría menos de lo que ya pagó: para devolver plata, ' + esc(BG.nombreDuena()) + ' tiene que anular el pago.</dd>') + '</dl>'
        + (ev ? '<p class="precio-info">' + BG.infoPrecio(ev, true) + '</p>' : '');
    };
    const r = await BG.modal({
      titulo: 'Ajustar precio · ' + BG.fmtRecibo(v.recibo),
      cuerpo: '<p class="small">El total y el saldo de la venta se recalculan. El cambio queda registrado con el motivo y quién lo hizo, y el recibo que se emita después sale con el precio nuevo.</p>'
        + (v.items.length > 1
          ? '<div class="field"><span class="field-label" id="aj-item-l">Artículo</span><div class="dests" role="radiogroup" aria-labelledby="aj-item-l">'
            + v.items.map((it, i) => '<label class="dest"><input type="radio" name="aj-item" value="' + i + '"><span class="grow"><span class="row-title">' + esc(it.descripcion) + '</span>'
              + '<span class="row-sub">' + it.cantidad + ' × ' + gs(it.precio) + '</span></span></label>').join('') + '</div></div>'
          : '<p><strong>' + esc(v.items[0].descripcion) + '</strong> · ' + v.items[0].cantidad + ' × ' + gs(v.items[0].precio) + '</p>')
        + '<div class="field"><label for="aj-precio">Precio nuevo por unidad</label>' + BG.campoGs('aj-precio', '', '') + '</div>'
        + BG.camposMotivo('aj', st, true)
        + '<div id="aj-info"></div><p class="error-text" id="aj-error" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar precio nuevo', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (val, dlg) => {
        const er = $('#aj-error', dlg);
        const falla = (m) => { er.textContent = m; er.hidden = false; return false; };
        if (st.item == null) return falla('Elegí el artículo.');
        if (!(st.precio > 0)) return falla('Escribí el precio nuevo.');
        if (st.precio === v.items[st.item].precio) return falla('Es el mismo precio que ya tiene.');
        if (!st.motivo) return falla('Elegí el motivo del cambio.');
        if (st.motivo === 'Otro' && !st.nota.trim()) return falla('Contá el motivo en «Detalle».');
        if (totalCon(st.precio) < pagado) return falla('Con ese precio la venta quedaría en menos de lo que ya pagó (' + gs(pagado) + ').');
        return true;
      },
      onMount: (dlg) => {
        // Los manejadores van en el formulario, que se crea de nuevo en cada modal (el <dialog> es siempre el mismo).
        const form = $('form', dlg);
        form.addEventListener('change', (e) => {
          if (e.target.name === 'aj-item') { st.item = Number(e.target.value); pintarInfo(form); }
          if (e.target.name === 'motivo-aj') st.motivo = e.target.value;
        });
        form.addEventListener('input', (e) => {
          if (e.target.id === 'aj-precio') { st.precio = BG.leerGs(e.target); pintarInfo(form); }
          if (e.target.id === 'nota-aj') st.nota = e.target.value;
        });
        $('#aj-precio', form).focus();
      },
    });
    if (r !== 'ok') return false;
    const it = v.items[st.item];
    let autorizadoPor = null;
    if (BG.pideAutorizacion(BG.evaluarPrecio(st.precio, it.costoUnitGs))) {
      if (!(await BG.pedirPin('Precio ajustado debajo del mínimo que fijó ' + BG.nombreDuena() + ': ' + it.descripcion + '.'))) return false;
      autorizadoPor = BG.nombreDuena();
    }
    BG.ajustarPrecio({ ventaId: v.id, item: st.item, precio: st.precio, motivo: st.motivo, nota: st.nota, autorizadoPor: autorizadoPor });
    BG.toast('Precio ajustado. La venta quedó en ' + gs(v.total) + '.');
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
    const evVenta = BG.evaluarPrecio(v.total, costo);
    const cambios = BG.cambiosDePrecio(v);
    // Debajo de cada artículo: si tuvo precio especial y, para quien la puede ver, la ganancia.
    const subItem = (it) => {
      const esp = it.precioLista != null && it.precio !== it.precioLista;
      const ev = BG.evaluarPrecio(it.precio, it.costoUnitGs);
      const partes = [];
      if (esp) partes.push('<span class="t-especial">Precio especial</span> · lista <span class="strike">' + gs(it.precioLista) + '</span>');
      if (duena) partes.push((!esp && it.margen ? 'Margen ' + it.margen + ' %' : ev ? 'margen ' + BG.fmtMargen(ev.margen) : 'Precio a mano') + ' · costo ' + gs(it.costoUnitGs) + '/u');
      else if (esp && ev && BG.veGanancia()) partes.push('gana ' + gs(ev.ganancia) + '/u · margen ' + BG.fmtMargen(ev.margen));
      return partes.length ? '<div class="t-sub">' + partes.join(' · ') + '</div>' : '';
    };
    const lineaCambio = (c) => {
      const titulo = c.tipo === 'descuento'
        ? 'Descuento' + (c.porcentaje ? ' del ' + BG.C.fmtNum(c.porcentaje, 0, 2) + ' %' : '') + ': −' + gs(c.monto)
        : esc(c.descripcion) + ': ' + gs(c.antes) + ' → ' + gs(c.despues) + (c.cantidad > 1 ? ' c/u' : '');
      const cuando = c.tipo === 'ajuste' ? 'Después de vender, el ' + BG.fmtFecha(c.fecha) + ' a las ' + BG.fmtHora(c.ts) : c.tipo === 'descuento' ? 'Al vender' : 'Al vender (precio de lista → especial)';
      const ev = c.tipo === 'descuento' ? null : BG.evaluarPrecio(c.despues, c.costo);
      return '<li class="line"><div class="row-title">' + titulo + '</div>'
        + '<div class="row-sub">' + cuando + ' · por ' + esc(c.usuario) + ' · ' + (c.motivo ? '<strong>' + esc(c.motivo) + '</strong>' : 'sin motivo') + (c.nota ? ': ' + esc(c.nota) : '') + '</div>'
        + (c.tipo === 'ajuste' ? '<div class="row-sub">Total de la venta ' + gs(c.totalAntes) + ' → ' + gs(c.totalDespues) + (c.autorizadoPor ? ' · autorizó ' + esc(c.autorizadoPor) + ' con PIN' : '') + '</div>' : '')
        + (ev ? '<p class="precio-info">' + BG.infoPrecio(ev, true, true) + '</p>' : '') + '</li>';
    };
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
      + (!v.anulada && BG.puede('preciosEspeciales') ? '<button type="button" class="btn" data-accion="ajustar-precio">' + icon('tag') + 'Ajustar precio</button>' : '')
      + (v.anulada || !BG.esDuena() ? '' : '<button type="button" class="btn btn-danger" data-accion="anular-venta">' + icon('ban') + 'Anular venta</button>')
      + '</div></div>'
      + (v.anulada ? '<div class="callout callout-bad">' + icon('ban') + '<div><strong>Venta anulada el ' + BG.fmtFecha(v.anulada.fecha) + ' a las ' + BG.fmtHora(v.anulada.ts) + ' por ' + esc(v.anulada.usuario) + '.</strong> Motivo: ' + esc(v.anulada.motivo) + '</div></div>' : '')
      + '<div class="grid-2">'
      + '<section class="card"><div class="card-head"><h2>Artículos</h2><span class="small muted">Precios congelados al vender</span></div>'
      + '<div class="table-wrap table-bare"><table class="table table-compact table-venta"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>'
      + v.items.map((it) => '<tr><td><div class="t-title">' + esc(it.descripcion) + '</div>' + subItem(it) + '</td>'
        + '<td class="num">' + it.cantidad + '</td><td class="num">' + gs(it.precio) + '</td><td class="num">' + gs(it.precio * it.cantidad) + '</td></tr>').join('')
      + '</tbody><tfoot>'
      + (v.descuento.monto ? '<tr><td colspan="3">Subtotal</td><td class="num">' + gs(v.subtotal) + '</td></tr><tr><td colspan="3">Descuento' + (v.descuento.tipo === 'porcentaje' ? ' (' + BG.C.fmtNum(v.descuento.valor, 0, 2) + ' %)' : '') + '</td><td class="num">−' + gs(v.descuento.monto) + '</td></tr>' : '')
      + '<tr><td colspan="3">Total</td><td class="num">' + gs(v.total) + '</td></tr></tfoot></table></div>'
      + (duena ? '<div class="card-foot"><span class="small muted">Solo ' + esc(BG.nombreDuena()) + ' ve esto</span><span class="small">Costo congelado <strong>' + gs(costo) + '</strong> · Ganancia real <strong>' + gs(ganancia) + '</strong>'
        + (evVenta ? ' (' + BG.fmtMargen(evVenta.margen) + ' sobre el costo)' : '') + '</span></div>'
        : cambios.length && evVenta && BG.veGanancia() ? '<div class="card-foot"><span class="small muted">Por los precios especiales</span><span class="small">' + BG.infoPrecio(evVenta, false, true) + '</span></div>' : '')
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
      + '</section></div>'
      + (cambios.length ? '<section class="card stack"><div class="card-head"><h2>Cambios de precio</h2>'
        + (v.autorizadoPor ? '<span class="pill pill-warn">Autorizó ' + esc(v.autorizadoPor) + ' con PIN</span>' : '<span class="small muted">Quedan en la auditoría</span>') + '</div>'
        + '<ul class="lines">' + cambios.map(lineaCambio).join('') + '</ul></section>' : '')
      + '</div>';
    return {
      html: html,
      mount: (root) => {
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          try {
            if (b.dataset.accion === 'anular-venta' && (await BG.anularVentaUI(v))) BG.render();
            if (b.dataset.accion === 'ajustar-precio' && (await BG.ajustarPrecioUI(v))) BG.render();
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

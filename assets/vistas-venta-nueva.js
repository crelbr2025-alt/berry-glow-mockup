/*!
 * berry.Glow_py — Pantallas: nueva venta y registrar cobro (pagos mixtos, saldo a favor, vuelto).
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, esc, gs, sum, icon } = BG;
  const FORMAS_PAGO = ['efectivo', 'transferencia', 'qr', 'tarjeta'];

  /* ── Piezas compartidas ──────────────────────────────────────────────── */

  function htmlPartes(partes) {
    return partes.map((p, i) => '<div class="pay-line" data-i="' + i + '">'
      + '<div class="seg" role="radiogroup" aria-label="Forma de pago ' + (i + 1) + '">'
      + FORMAS_PAGO.map((f) => '<label><input type="radio" name="forma-' + i + '" value="' + f + '"' + (p.forma === f ? ' checked' : '') + '>' + BG.FORMAS_CORTAS[f] + '</label>').join('')
      + '</div>'
      + BG.campoGs('monto-' + i, p.monto, 'data-i="' + i + '" aria-label="Monto de la forma de pago ' + (i + 1) + '" placeholder="0"')
      + (partes.length > 1 ? '<button type="button" class="btn-icon" data-accion="quitar-forma" data-i="' + i + '" aria-label="Quitar la forma de pago ' + (i + 1) + '">' + icon('x') + '</button>' : '<span aria-hidden="true"></span>')
      + '</div>').join('');
  }

  /** Enlaza las líneas de pago de un contenedor al estado; alCambiar(rehacer) se llama en cada cambio. */
  function enlazarPartes(cont, estado, alCambiar) {
    cont.addEventListener('change', (e) => {
      const r = e.target.closest('input[type="radio"]');
      if (!r) return;
      estado.partes[Number(r.name.split('-')[1])].forma = r.value;
      alCambiar(false);
    });
    cont.addEventListener('input', (e) => {
      const inp = e.target.closest('input.gs');
      if (!inp) return;
      estado.partes[Number(inp.dataset.i)].monto = BG.leerGs(inp);
      alCambiar(false);
    });
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion="quitar-forma"]');
      if (!b) return;
      estado.partes.splice(Number(b.dataset.i), 1);
      alCambiar(true);
    });
  }
  const siguienteForma = (partes) => FORMAS_PAGO.find((f) => !partes.some((p) => p.forma === f)) || 'efectivo';

  async function resolverExcedente(excedente, partes) {
    const efectivo = sum(partes.filter((p) => p.forma === 'efectivo'), (p) => p.monto);
    const puedeVuelto = efectivo >= excedente;
    return BG.modal({
      titulo: 'El pago supera lo que se debe',
      cuerpo: '<p>Hay <strong>' + gs(excedente) + '</strong> de más. El sistema no cobra por encima del saldo, así que hay que decidir qué es esa diferencia.</p>'
        + '<ul class="bullets"><li><strong>Vuelto:</strong> se le devuelve en efectivo y se registra solo lo que corresponde.</li>'
        + '<li><strong>Saldo a favor:</strong> queda como crédito del cliente y se ofrece en su próxima compra.</li></ul>'
        + (puedeVuelto ? '' : '<p class="hint">El vuelto solo se puede dar cuando se pagó en efectivo al menos ' + gs(excedente) + '.</p>'),
      acciones: [{ texto: 'Revisar', valor: 'cancelar', clase: 'btn-quiet' }]
        .concat(puedeVuelto ? [{ texto: 'Es vuelto', valor: 'vuelto' }] : [])
        .concat([{ texto: 'Dejar a favor', valor: 'credito', clase: 'btn-primary' }]),
    });
  }
  function aplicarVuelto(partes, excedente) {
    const out = partes.map((p) => ({ forma: p.forma, monto: p.monto }));
    let falta = excedente;
    for (let i = out.length - 1; i >= 0 && falta > 0; i--) {
      if (out[i].forma !== 'efectivo') continue;
      const baja = Math.min(falta, out[i].monto);
      out[i].monto -= baja;
      falta -= baja;
    }
    return out.filter((p) => p.monto > 0);
  }

  function buscadorCliente(host, alElegir, volver) {
    host.innerHTML = '<div class="search"><label class="sr-only" for="q-cli">Buscar cliente</label><div class="search-box">' + icon('search')
      + '<input id="q-cli" class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Nombre, CI o teléfono" role="combobox" aria-expanded="false" aria-controls="q-cli-lista" aria-autocomplete="list"></div>'
      + '<ul class="cb-list" id="q-cli-lista" role="listbox" hidden></ul></div>'
      + '<a class="btn-link" href="#/clientes/nuevo?volver=' + volver + '">' + icon('plus', 'i-sm') + 'Cliente nuevo</a>';
    BG.combobox($('#q-cli', host), $('#q-cli-lista', host), {
      buscar: (q) => BG.buscarClientes(q, 8).map((c) => ({ c: c })),
      pintar: (it, q) => BG.filaCliente(it.c, q),
      elegir: (it) => alElegir(it.c.id),
      vacio: (q) => 'No existe «' + esc(q) + '». <a class="cb-new" href="#/clientes/nuevo?volver=' + volver + '&nombre=' + encodeURIComponent(q) + '">Crearlo</a>',
    });
  }
  function clienteElegido(cid) {
    const c = BG.cliente(cid);
    const saldo = BG.saldoCliente(cid);
    const favor = BG.creditoCliente(cid);
    return '<div class="picked"><span class="avatar">' + esc(BG.iniciales(c.nombre)) + '</span><div class="grow">'
      + '<div class="row-title">' + esc(c.nombre) + '</div><div class="row-sub">' + (c.ci ? '<span>' + esc(c.ci) + '</span>' : '') + '<span>' + esc(c.telefono) + '</span></div>'
      + '<div class="row-sub">' + (saldo > 0 ? 'Ya debe ' + gs(saldo) : 'Cuenta al día') + (favor > 0 ? ' · saldo a favor ' + gs(favor) : '') + '</div></div>'
      + '<button type="button" class="btn btn-sm btn-quiet" data-accion="cambiar-cliente">Cambiar</button></div>';
  }
  function campoFecha(valor) {
    return '<div class="field"><label for="f-fecha">Fecha</label><input id="f-fecha" class="input input-date" type="date" value="' + valor + '" max="' + BG.hoy() + '">'
      + '<span class="hint" id="h-fecha">' + textoFecha(valor) + '</span></div>';
  }
  function textoFecha(f) {
    if (f === BG.hoy()) return 'Hoy (la pone el sistema; se puede cambiar).';
    if (f > BG.hoy()) return 'No se permiten fechas futuras.';
    if (BG.cajaCerrada(f)) return 'Ese día ya tiene la caja cerrada: se va a pedir autorización.';
    return 'Fecha anterior a hoy.';
  }

  /* ── Nueva venta ─────────────────────────────────────────────────────── */

  BG.vistas.ventaNueva = (args, params) => {
    const duena = BG.esDuena();
    const pre = params.get('cliente');
    const b = {
      clienteId: pre && BG.cliente(pre) ? pre : null,
      fecha: BG.hoy(),
      items: [],
      desc: { activo: false, tipo: 'monto', valor: '' },
      partes: [{ forma: 'efectivo', monto: 0 }],
      usarCredito: true,
    };
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Nueva venta</h1><p class="page-sub">Cliente, artículos y cobro en una sola pantalla. Al registrar, el precio y el saldo quedan congelados.</p></div></div>'
      + '<div class="grid-form has-sticky"><div class="stack">'
      + '<section class="card stack" aria-labelledby="t-cli"><h2 class="card-title" id="t-cli">1 · Cliente</h2><div id="s-cliente" class="stack"></div><div id="s-fecha"></div></section>'
      + '<section class="card stack" aria-labelledby="t-art"><h2 class="card-title" id="t-art">2 · Artículos</h2>'
      + '<div class="search" id="s-buscar"><label class="sr-only" for="q-prod">Buscar producto</label><div class="search-box">' + icon('search')
      + '<input id="q-prod" class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar producto para agregar" role="combobox" aria-expanded="false" aria-controls="q-prod-lista" aria-autocomplete="list"></div>'
      + '<ul class="cb-list" id="q-prod-lista" role="listbox" hidden></ul></div>'
      + '<div class="lines" id="s-items"></div><div id="s-desc" class="stack"></div></section>'
      + '</div><div class="stack sticky-col">'
      + '<section class="card stack" aria-labelledby="t-cob"><h2 class="card-title" id="t-cob">3 · Cobro</h2>'
      + '<dl class="summary" id="s-totales"></dl><div id="s-ganancia"></div><div id="s-credito"></div>'
      + '<div class="row"><span class="field-label grow">¿Cuánto paga ahora?</span>'
      + '<button type="button" class="chip" data-accion="todo">Paga todo</button><button type="button" class="chip" data-accion="nada">A cuenta</button></div>'
      + '<div class="lines" id="s-pagos"></div>'
      + '<button type="button" class="btn-link" data-accion="agregar-forma">' + icon('plus', 'i-sm') + 'Dividir en otra forma de pago (pago mixto)</button>'
      + '<dl class="summary" id="s-resto"></dl>'
      + '<p class="error-text" id="err-venta" role="alert" hidden></p>'
      + '<button type="button" class="btn btn-primary btn-lg btn-block hide-sticky" data-accion="registrar">' + icon('check') + 'Registrar venta</button>'
      + '</section></div></div>'
      + '<div class="sticky-submit"><div><span class="small muted">Total</span><div class="amount" id="ss-total">₲ 0</div></div>'
      + '<button type="button" class="btn btn-primary" data-accion="registrar">Registrar venta</button></div></div>';

    let root = null;
    const opcionesDe = (p) => {
      const ops = BG.preciosProducto(p).map((x) => ({ id: String(x.margen), etiqueta: x.margen + ' %', precio: x.precio, margen: x.margen }));
      if (p.precioVenta && !ops.some((o) => o.precio === p.precioVenta)) ops.unshift({ id: 'lista', etiqueta: 'Lista', precio: p.precioVenta, margen: p.margen });
      return ops;
    };
    const descuento = () => (!b.desc.activo || !b.desc.valor ? null : { tipo: b.desc.tipo, valor: b.desc.valor, motivo: b.desc.motivo || null, nota: b.desc.nota || '' });
    // Precio especial: cualquier precio distinto del de lista. La vendedora lo pone con motivo; el dueño, con motivo opcional.
    const puedeEspecial = duena || BG.puede('preciosEspeciales');
    const esEspecial = (it) => it.precio !== BG.producto(it.productoId).precioVenta;
    const costoDe = (it) => BG.producto(it.productoId).costoTotalGs || 0;
    const infoItem = (it) => (esEspecial(it) && it.precio > 0 ? BG.infoPrecio(BG.evaluarPrecio(it.precio, costoDe(it)), true) : '');
    const camposMotivo = BG.camposMotivo;
    const actualizarInfo = (i) => { const el = $('#pi-' + i, root); if (el) el.innerHTML = infoItem(b.items[i]); };
    const calc = () => {
      const t = C.totalesVenta(b.items.map((it) => ({ precio: it.precio || 0, cantidad: it.cantidad })), descuento());
      const favor = b.clienteId ? BG.creditoCliente(b.clienteId) : 0;
      const credito = b.usarCredito ? Math.min(favor, t.total) : 0;
      const recibido = sum(b.partes, (p) => p.monto || 0);
      return Object.assign(t, { favor: favor, credito: credito, recibido: recibido, resto: t.total - credito - recibido });
    };

    const pintarCliente = () => {
      const host = $('#s-cliente', root);
      if (b.clienteId) host.innerHTML = clienteElegido(b.clienteId);
      else buscadorCliente(host, (id) => { b.clienteId = id; pintarCliente(); pintarTotales(); }, 'venta');
    };
    const htmlLinea = (it, i) => {
      const p = BG.producto(it.productoId);
      let precio = '';
      if (duena) {
        precio = '<div class="price-opts" role="radiogroup" aria-label="Precio de ' + esc(p.descripcion) + '">'
          + opcionesDe(p).map((o) => '<label class="price-opt"><input type="radio" name="precio-' + i + '" value="' + o.id + '"' + (it.opcion === o.id ? ' checked' : '') + '><small>' + o.etiqueta + '</small><strong>' + gs(o.precio) + '</strong></label>').join('')
          + '<label class="price-opt"><input type="radio" name="precio-' + i + '" value="otro"' + (it.opcion === 'otro' ? ' checked' : '') + '><small>Otro</small><strong>A mano</strong></label></div>'
          + (it.opcion === 'otro' ? '<div class="field"><label for="otro-' + i + '">Precio para esta venta</label>' + BG.campoGs('otro-' + i, it.precio, 'data-i="' + i + '" data-otro="1"') + '</div>' : '')
          + (it.opcion === 'otro' || esEspecial(it) ? camposMotivo(i, it, false) : '')
          + '<p class="precio-info" id="pi-' + i + '">' + infoItem(it) + '</p>';
      } else if (!puedeEspecial) {
        precio = '<p class="small muted">Precio de lista ' + gs(it.precio) + '</p>';
      } else if (!it.abierto) {
        precio = '<div class="precio-lista"><span class="small muted">Precio de lista ' + gs(p.precioVenta) + '</span>'
          + '<button type="button" class="btn-link" data-accion="especial" data-i="' + i + '">' + icon('tag', 'i-sm') + 'Poner precio especial</button></div>';
      } else {
        precio = '<div class="especial">'
          + '<div class="precio-lista"><span class="small muted">Precio de lista <span class="strike">' + gs(p.precioVenta) + '</span></span>'
          + '<button type="button" class="btn-link" data-accion="lista" data-i="' + i + '">Volver al precio de lista</button></div>'
          + '<div class="field"><label for="esp-' + i + '">Precio especial por unidad</label>' + BG.campoGs('esp-' + i, it.precio, 'data-i="' + i + '" data-otro="1"') + '</div>'
          + camposMotivo(i, it, true)
          + '<p class="precio-info" id="pi-' + i + '">' + infoItem(it) + '</p></div>';
      }
      return '<div class="line"><div class="line-top"><div class="grow"><div class="row-title">' + esc(p.descripcion) + '</div>'
        + '<div class="row-sub">' + esc(p.categoria) + ' · quedan ' + BG.disponibles(p) + '</div></div>'
        + '<button type="button" class="btn-icon" data-accion="quitar-item" data-i="' + i + '" aria-label="Quitar ' + esc(p.descripcion) + '">' + icon('trash') + '</button></div>'
        + precio
        + '<div class="line-bottom"><div class="stepper"><button type="button" data-accion="menos" data-i="' + i + '" aria-label="Una unidad menos">−</button>'
        + '<input id="cant-' + i + '" value="' + it.cantidad + '" inputmode="numeric" aria-label="Cantidad de ' + esc(p.descripcion) + '" data-i="' + i + '" data-cant="1">'
        + '<button type="button" data-accion="mas" data-i="' + i + '" aria-label="Una unidad más">+</button></div>'
        + '<div class="amount" id="sub-' + i + '">' + gs((it.precio || 0) * it.cantidad) + '</div></div></div>';
    };
    const pintarItems = () => {
      const host = $('#s-items', root);
      host.innerHTML = b.items.length ? b.items.map(htmlLinea).join('')
        : '<p class="empty">Buscá un producto arriba para agregarlo. Una venta puede tener uno o varios artículos.</p>';
      BG.enlazarCampos(host);
      pintarDescuento();
    };
    const pintarDescuento = () => {
      const host = $('#s-desc', root);
      if (!b.items.length || !puedeEspecial) { host.innerHTML = ''; return; }
      host.innerHTML = '<label class="check-inline"><input type="checkbox" id="d-activo"' + (b.desc.activo ? ' checked' : '') + '> Aplicar un descuento a esta venta</label>'
        + (b.desc.activo ? '<div class="row"><div class="seg" role="radiogroup" aria-label="Tipo de descuento">'
          + '<label><input type="radio" name="d-tipo" value="monto"' + (b.desc.tipo === 'monto' ? ' checked' : '') + '>En ₲</label>'
          + '<label><input type="radio" name="d-tipo" value="porcentaje"' + (b.desc.tipo === 'porcentaje' ? ' checked' : '') + '>En %</label></div>'
          + '<div class="grow">' + (b.desc.tipo === 'monto' ? BG.campoGs('d-valor', b.desc.valor, 'aria-label="Descuento en guaraníes"')
            : '<div class="suffix-wrap"><input id="d-valor" class="input" inputmode="decimal" autocomplete="off" value="' + esc(b.desc.valor ? C.fmtNum(b.desc.valor, 0, 2) : '') + '" aria-label="Descuento en porcentaje"><span class="suffix">%</span></div>')
          + '</div></div>' + camposMotivo('d', b.desc, !duena) : '');
      BG.enlazarCampos(host);
    };
    const pintarPagos = () => {
      const host = $('#s-pagos', root);
      host.innerHTML = htmlPartes(b.partes);
      BG.enlazarCampos(host);
    };
    const pintarTotales = () => {
      const t = calc();
      $('#s-totales', root).innerHTML = (t.descuento ? '<dt>Subtotal</dt><dd>' + gs(t.subtotal) + '</dd><dt>Descuento</dt><dd>−' + gs(t.descuento) + '</dd>' : '')
        + '<dt><strong>Total de la venta</strong></dt><dd class="big">' + gs(t.total) + '</dd>';
      $('#s-credito', root).innerHTML = t.favor > 0 ? '<label class="check-inline"><input type="checkbox" id="usar-credito"' + (b.usarCredito ? ' checked' : '') + '> Usar el saldo a favor del cliente (' + gs(t.favor) + ' disponible)</label>' : '';
      $('#s-resto', root).innerHTML = (t.credito ? '<dt>Saldo a favor aplicado</dt><dd>−' + gs(t.credito) + '</dd>' : '')
        + '<dt>Recibido ahora</dt><dd>' + gs(t.recibido) + '</dd><div class="sep"></div>'
        + (t.resto >= 0 ? '<dt><strong>Queda debiendo</strong></dt><dd class="big ' + (t.resto > 0 ? 'due' : 'clear') + '">' + gs(t.resto) + '</dd>'
          : '<dt><strong>Pagó de más</strong></dt><dd class="big due">' + gs(-t.resto) + '</dd><dd class="span hint">Al registrar vas a elegir si es vuelto o saldo a favor.</dd>');
      $('#ss-total', root).textContent = gs(t.total);
      b.items.forEach((it, i) => { const s = $('#sub-' + i, root); if (s) s.textContent = gs((it.precio || 0) * it.cantidad); });
      // Ganancia de toda la venta: el dueño la ve siempre; la vendedora, cuando cambió algún precio o hizo descuento.
      const conCambios = b.items.some(esEspecial) || t.descuento > 0;
      const ev = b.items.length && t.total > 0 && (duena || (puedeEspecial && conCambios)) ? BG.evaluarPrecio(t.total, sum(b.items, (it) => costoDe(it) * it.cantidad)) : null;
      $('#s-ganancia', root).innerHTML = ev ? '<p class="precio-info"><span class="muted">En toda la venta:</span> ' + BG.infoPrecio(ev) + '</p>' : '';
    };

    const agregar = (p) => {
      if (!p.precioVenta) { BG.toast('«' + p.descripcion + '» no tiene precio de venta: asignáselo en Productos antes de venderlo.', 'error'); return; }
      const ya = b.items.find((it) => it.productoId === p.id);
      const enVenta = ya ? ya.cantidad : 0;
      if (BG.disponibles(p) - enVenta <= 0) { BG.toast('No quedan unidades de «' + p.descripcion + '».', 'error'); return; }
      if (ya) ya.cantidad++;
      else {
        const op = opcionesDe(p).find((o) => o.precio === p.precioVenta);
        b.items.push({ productoId: p.id, cantidad: 1, opcion: duena && op ? op.id : 'lista', precio: p.precioVenta, margen: p.margen, motivo: null, nota: '', abierto: false });
      }
      pintarItems();
      pintarTotales();
    };
    const registrar = async () => {
      const err = $('#err-venta', root);
      const fallar = (msg) => { err.textContent = msg; err.hidden = false; BG.toast(msg, 'error'); };
      err.hidden = true;
      if (!b.clienteId) return fallar('Elegí el cliente de la venta.');
      if (!b.items.length) return fallar('Agregá al menos un artículo.');
      const sinPrecio = b.items.find((it) => !(it.precio > 0));
      if (sinPrecio) return fallar('Falta el precio de «' + BG.producto(sinPrecio.productoId).descripcion + '».');
      for (const it of b.items) {
        const p = BG.producto(it.productoId);
        if (it.cantidad > BG.disponibles(p)) return fallar('Solo quedan ' + BG.disponibles(p) + ' de «' + p.descripcion + '».');
      }
      if (b.fecha > BG.hoy()) return fallar('La fecha de la venta no puede ser futura.');
      if (b.desc.activo && b.desc.tipo === 'porcentaje' && b.desc.valor && C.cmp(C.asQ(b.desc.valor), C.Q(100n)) > 0) return fallar('El descuento no puede pasar del 100 %.');
      for (const it of b.items.filter(esEspecial)) {
        const nombre = BG.producto(it.productoId).descripcion;
        if (!duena && !it.motivo) return fallar('Elegí el motivo del precio especial de «' + nombre + '».');
        if (it.motivo === 'Otro' && !(it.nota || '').trim()) return fallar('Contá en «Detalle» el motivo del precio especial de «' + nombre + '».');
      }
      if (descuento() && !duena && !b.desc.motivo) return fallar('Elegí el motivo del descuento.');
      if (descuento() && b.desc.motivo === 'Otro' && !(b.desc.nota || '').trim()) return fallar('Contá en «Detalle» el motivo del descuento.');
      const t = calc();
      if (t.total <= 0) return fallar('El total quedó en ₲ 0: revisá el descuento.');
      if (BG.cajaCerrada(b.fecha) && !(await BG.pedirPin('La venta tiene fecha ' + BG.fmtFecha(b.fecha) + ', un día con la caja cerrada.'))) return;
      // Si la vendedora baja del margen mínimo (o vende a pérdida), la venta necesita el PIN del dueño.
      let autorizadoPor = null;
      if (!duena) {
        const bajos = b.items.filter((it) => esEspecial(it) && BG.pideAutorizacion(BG.evaluarPrecio(it.precio, costoDe(it))));
        const ventaBaja = t.descuento > 0 && BG.pideAutorizacion(BG.evaluarPrecio(t.total, sum(b.items, (it) => costoDe(it) * it.cantidad)));
        if (bajos.length || ventaBaja) {
          const que = bajos.length
            ? 'Precio especial debajo del mínimo que fijó ' + BG.nombreDuena() + ': ' + bajos.map((it) => BG.producto(it.productoId).descripcion).join(', ') + '.'
            : 'El descuento deja la venta debajo del mínimo que fijó ' + BG.nombreDuena() + '.';
          if (!(await BG.pedirPin(que))) return;
          autorizadoPor = BG.nombreDuena();
        }
      }
      let partes = b.partes.filter((p) => p.monto > 0);
      let aCredito = 0;
      if (t.resto < 0) {
        const r = await resolverExcedente(-t.resto, partes);
        if (!r) return;
        if (r === 'vuelto') partes = aplicarVuelto(partes, -t.resto); else aCredito = -t.resto;
      }
      let res;
      try {
        res = BG.registrarVenta({
          clienteId: b.clienteId, fecha: b.fecha, descuento: descuento(), partes: partes, usarCredito: t.credito, excedenteACredito: aCredito, autorizadoPor: autorizadoPor,
          items: b.items.map((it) => ({
            productoId: it.productoId, cantidad: it.cantidad, precio: it.precio, margen: it.margen,
            motivo: esEspecial(it) ? it.motivo : null, nota: esEspecial(it) ? it.nota : '',
          })),
        });
      } catch (er) {
        return fallar(er.message);
      }
      BG.ir('#/ventas/' + res.venta.id + '?nueva=1');
    };

    return {
      html: html,
      mount: (r) => {
        root = r;
        pintarCliente();
        $('#s-fecha', root).innerHTML = campoFecha(b.fecha);
        pintarItems();
        pintarPagos();
        pintarTotales();
        BG.combobox($('#q-prod', root), $('#q-prod-lista', root), {
          buscar: (q) => BG.buscarProductos(q, 8).map((p) => ({ p: p })),
          pintar: (it, q) => {
            const p = it.p;
            const disp = BG.disponibles(p);
            return '<span class="avatar">' + icon('tag', 'i-sm') + '</span><span class="row-main"><span class="row-title">' + BG.resaltar(p.descripcion, q) + '</span>'
              + '<span class="row-sub">' + esc(p.categoria) + ' · ' + (disp > 0 ? 'quedan ' + disp : 'agotado') + '</span></span>'
              + '<span class="row-end"><span class="amount">' + (p.precioVenta ? gs(p.precioVenta) : 'Sin precio') + '</span></span>';
          },
          elegir: (it) => { $('#q-prod', root).value = ''; agregar(it.p); },
        });
        enlazarPartes($('#s-pagos', root), b, (rehacer) => { if (rehacer) pintarPagos(); pintarTotales(); });
        root.addEventListener('change', (e) => {
          const t = e.target;
          if (t.id === 'f-fecha') { b.fecha = t.value || BG.hoy(); $('#h-fecha', root).textContent = textoFecha(b.fecha); return; }
          if (t.id === 'usar-credito') { b.usarCredito = t.checked; pintarTotales(); return; }
          if (t.id === 'd-activo') { b.desc.activo = t.checked; pintarDescuento(); pintarTotales(); return; }
          if (t.name === 'd-tipo') { b.desc.tipo = t.value; b.desc.valor = ''; pintarDescuento(); pintarTotales(); return; }
          if (t.name && t.name.startsWith('motivo-')) { const k = t.name.slice(7); (k === 'd' ? b.desc : b.items[Number(k)]).motivo = t.value; return; }
          if (t.name && t.name.startsWith('precio-')) {
            const it = b.items[Number(t.name.slice(7))];
            it.opcion = t.value;
            if (t.value !== 'otro') {
              const o = opcionesDe(BG.producto(it.productoId)).find((x) => x.id === t.value);
              it.precio = o.precio;
              it.margen = o.margen;
            } else it.margen = null;
            pintarItems();
            pintarTotales();
            if (t.value === 'otro') { const f = $('#otro-' + t.name.slice(7), root); if (f) f.focus(); }
          }
          if (t.dataset && t.dataset.cant) {
            const it = b.items[Number(t.dataset.i)];
            const max = BG.disponibles(BG.producto(it.productoId));
            it.cantidad = Math.min(Math.max(C.parseEntero(t.value) || 1, 1), max);
            pintarItems();
            pintarTotales();
          }
        });
        root.addEventListener('input', (e) => {
          const t = e.target;
          if (t.dataset && t.dataset.otro) { const i = Number(t.dataset.i); b.items[i].precio = BG.leerGs(t); actualizarInfo(i); pintarTotales(); }
          if (t.dataset && t.dataset.nota != null) { const k = t.dataset.nota; (k === 'd' ? b.desc : b.items[Number(k)]).nota = t.value; }
          if (t.id === 'd-valor') {
            if (b.desc.tipo === 'monto') b.desc.valor = BG.leerGs(t);
            else { const q = C.parseNum(t.value, 'decimal'); b.desc.valor = q ? C.qToString(q) : ''; }
            pintarTotales();
          }
        });
        root.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-accion]');
          if (!btn) return;
          const a = btn.dataset.accion;
          const i = Number(btn.dataset.i);
          if (a === 'cambiar-cliente') { b.clienteId = null; pintarCliente(); pintarTotales(); $('#q-cli', root).focus(); }
          else if (a === 'quitar-item') { b.items.splice(i, 1); pintarItems(); pintarTotales(); }
          else if (a === 'especial') {
            b.items[i].abierto = true;
            pintarItems();
            const f = $('#esp-' + i, root);
            if (f) { f.focus(); f.select(); }
          } else if (a === 'lista') {
            const it = b.items[i];
            Object.assign(it, { abierto: false, precio: BG.producto(it.productoId).precioVenta, motivo: null, nota: '' });
            pintarItems();
            pintarTotales();
          }
          else if (a === 'mas' || a === 'menos') {
            const it = b.items[i];
            const max = BG.disponibles(BG.producto(it.productoId));
            if (a === 'mas' && it.cantidad >= max) BG.toast('Solo quedan ' + max + ' unidades.', 'error');
            it.cantidad = Math.min(Math.max(it.cantidad + (a === 'mas' ? 1 : -1), 1), max);
            pintarItems();
            pintarTotales();
          } else if (a === 'todo') {
            const t = calc();
            b.partes = [{ forma: b.partes[0] ? b.partes[0].forma : 'efectivo', monto: Math.max(0, t.total - t.credito) }];
            pintarPagos();
            pintarTotales();
          } else if (a === 'nada') {
            b.partes = [{ forma: 'efectivo', monto: 0 }];
            pintarPagos();
            pintarTotales();
          } else if (a === 'agregar-forma') {
            const t = calc();
            b.partes.push({ forma: siguienteForma(b.partes), monto: Math.max(0, t.resto) });
            pintarPagos();
            pintarTotales();
            const ult = $('#monto-' + (b.partes.length - 1), root);
            if (ult) ult.focus();
          } else if (a === 'registrar') registrar();
        });
      },
    };
  };

  /* ── Registrar cobro ─────────────────────────────────────────────────── */

  BG.vistas.cobro = (args, params) => {
    const pre = params.get('cliente');
    const e = { clienteId: pre && BG.cliente(pre) ? pre : null, destino: params.get('venta') || null, fecha: BG.hoy(), partes: [{ forma: 'efectivo', monto: 0 }] };
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Registrar cobro</h1><p class="page-sub">Pagos parciales, de varias compras o mixtos (efectivo + transferencia + QR + tarjeta).</p></div></div>'
      + '<div class="grid-form has-sticky"><div class="stack">'
      + '<section class="card stack" aria-labelledby="t-c1"><h2 class="card-title" id="t-c1">1 · Cliente</h2><div id="c-cliente" class="stack"></div></section>'
      + '<section class="card stack" aria-labelledby="t-c2"><h2 class="card-title" id="t-c2">2 · ¿A qué se aplica?</h2><div id="c-destino"></div></section>'
      + '</div><div class="stack sticky-col">'
      + '<section class="card stack" aria-labelledby="t-c3"><h2 class="card-title" id="t-c3">3 · Monto y forma de pago</h2>'
      + '<div id="c-fecha"></div>'
      + '<div class="row"><span class="field-label grow">Paga</span><button type="button" class="chip" data-accion="completo">Todo el saldo</button></div>'
      + '<div class="lines" id="c-pagos"></div>'
      + '<button type="button" class="btn-link" data-accion="agregar-forma">' + icon('plus', 'i-sm') + 'Dividir en otra forma de pago (pago mixto)</button>'
      + '<dl class="summary" id="c-resumen"></dl><p class="error-text" id="err-cobro" role="alert" hidden></p>'
      + '<button type="button" class="btn btn-primary btn-lg btn-block hide-sticky" data-accion="registrar">' + icon('check') + 'Registrar cobro</button>'
      + '</section></div></div>'
      + '<div class="sticky-submit"><div><span class="small muted">Recibido</span><div class="amount" id="cs-total">₲ 0</div></div>'
      + '<button type="button" class="btn btn-primary" data-accion="registrar">Registrar cobro</button></div></div>';

    let root = null;
    const objetivo = () => {
      if (!e.clienteId || !e.destino || e.destino === 'sena') return null;
      if (e.destino === 'todas') return BG.saldoCliente(e.clienteId);
      const v = BG.venta(e.destino);
      return v ? BG.saldoVenta(v) : null;
    };
    const elegirDestinoInicial = () => {
      if (!e.clienteId) { e.destino = null; return; }
      const pend = BG.pendientesDe(e.clienteId);
      if (!(e.destino && (e.destino === 'sena' || e.destino === 'todas' || pend.some((v) => v.id === e.destino)))) e.destino = pend.length ? pend[0].id : 'sena';
    };
    const pintarCliente = () => {
      const host = $('#c-cliente', root);
      if (e.clienteId) { host.innerHTML = clienteElegido(e.clienteId); return; }
      buscadorCliente(host, (id) => { e.clienteId = id; e.destino = null; elegirDestinoInicial(); pintarTodo(); }, 'cobro');
      const top = BG.listaDeudores().slice(0, 5);
      if (top.length) {
        host.insertAdjacentHTML('beforeend', '<p class="field-label">O elegí entre los que más deben</p><ul class="list">'
          + top.map((d) => '<li><button type="button" class="list-row list-btn" data-accion="elegir-cliente" data-id="' + d.c.id + '">' + BG.filaCliente(d.c) + '</button></li>').join('') + '</ul>');
      }
    };
    const pintarDestino = () => {
      const host = $('#c-destino', root);
      if (!e.clienteId) { host.innerHTML = '<p class="muted">Primero elegí el cliente.</p>'; return; }
      const pend = BG.pendientesDe(e.clienteId);
      const op = (id, titulo, sub, monto) => '<label class="dest"><input type="radio" name="destino" value="' + id + '"' + (e.destino === id ? ' checked' : '') + '>'
        + '<span class="grow"><span class="row-title">' + titulo + '</span><span class="row-sub">' + sub + '</span></span>' + (monto != null ? '<span class="amount">' + gs(monto) + '</span>' : '') + '</label>';
      host.innerHTML = '<div class="dests" role="radiogroup" aria-label="Aplicar el cobro a">'
        + pend.map((v) => op(v.id, 'Compra ' + BG.fmtRecibo(v.recibo) + ' · ' + BG.fmtFecha(v.fecha), esc(v.items.map((it) => it.descripcion).join(', ')) + ' · ' + BG.haceDias(v.fecha), BG.saldoVenta(v))).join('')
        + (pend.length > 1 ? op('todas', 'Todas las compras pendientes', 'Se aplica de la más antigua a la más nueva', BG.saldoCliente(e.clienteId)) : '')
        + op('sena', 'Seña o anticipo', 'Queda como saldo a favor para una próxima compra', null)
        + '</div>' + (pend.length ? '' : '<p class="hint list-top">Este cliente no debe nada: solo se puede registrar una seña.</p>');
    };
    const pintarPagos = () => { const host = $('#c-pagos', root); host.innerHTML = htmlPartes(e.partes); BG.enlazarCampos(host); };
    const pintarResumen = () => {
      const recibido = sum(e.partes, (p) => p.monto || 0);
      const obj = objetivo();
      let h = '<dt>Recibido</dt><dd class="big">' + gs(recibido) + '</dd>';
      if (obj != null) {
        const resto = obj - recibido;
        h += '<dt>Saldo a cubrir</dt><dd>' + gs(obj) + '</dd><div class="sep"></div>'
          + (resto >= 0 ? '<dt><strong>Después del pago debe</strong></dt><dd class="big ' + (resto > 0 ? 'due' : 'clear') + '">' + gs(resto) + '</dd>'
            : '<dt><strong>Pagó de más</strong></dt><dd class="big due">' + gs(-resto) + '</dd><dd class="span hint">Al registrar vas a elegir si es vuelto o saldo a favor.</dd>');
      } else if (e.destino === 'sena') h += '<dd class="span hint">Todo el monto queda como saldo a favor.</dd>';
      $('#c-resumen', root).innerHTML = h;
      $('#cs-total', root).textContent = gs(recibido);
    };
    const pintarTodo = () => { pintarCliente(); pintarDestino(); pintarResumen(); };
    const registrar = async () => {
      const err = $('#err-cobro', root);
      const fallar = (msg) => { err.textContent = msg; err.hidden = false; BG.toast(msg, 'error'); };
      err.hidden = true;
      if (!e.clienteId) return fallar('Elegí el cliente.');
      if (!e.destino) return fallar('Elegí a qué compra se aplica el cobro.');
      let partes = e.partes.filter((p) => p.monto > 0);
      const recibido = sum(partes, (p) => p.monto);
      if (!recibido) return fallar('Escribí cuánto paga.');
      if (e.fecha > BG.hoy()) return fallar('La fecha del cobro no puede ser futura.');
      if (BG.cajaCerrada(e.fecha) && !(await BG.pedirPin('El cobro tiene fecha ' + BG.fmtFecha(e.fecha) + ', un día con la caja cerrada.'))) return;
      let aCredito = 0;
      const obj = objetivo();
      if (obj != null && recibido > obj) {
        const r = await resolverExcedente(recibido - obj, partes);
        if (!r) return;
        if (r === 'vuelto') partes = aplicarVuelto(partes, recibido - obj); else aCredito = recibido - obj;
      }
      const res = BG.registrarCobro({ clienteId: e.clienteId, destino: e.destino, fecha: e.fecha, partes: partes, excedenteACredito: aCredito });
      BG.toast('Cobro registrado · Recibo ' + BG.fmtRecibo(res.recibo));
      const ids = res.pagos.map((p) => p.id).join(',');
      const unaVenta = res.pagos.length === 1 && res.pagos[0].ventaId;
      BG.ir(unaVenta ? '#/recibo/v/' + res.pagos[0].ventaId + '?pagos=' + ids : '#/recibo/c/' + e.clienteId + '?pagos=' + ids);
    };

    return {
      html: html,
      mount: (r) => {
        root = r;
        elegirDestinoInicial();
        $('#c-fecha', root).innerHTML = campoFecha(e.fecha);
        pintarTodo();
        pintarPagos();
        enlazarPartes($('#c-pagos', root), e, (rehacer) => { if (rehacer) pintarPagos(); pintarResumen(); });
        root.addEventListener('change', (ev) => {
          const t = ev.target;
          if (t.name === 'destino') { e.destino = t.value; pintarResumen(); }
          if (t.id === 'f-fecha') { e.fecha = t.value || BG.hoy(); $('#h-fecha', root).textContent = textoFecha(e.fecha); }
        });
        root.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          const a = b.dataset.accion;
          if (a === 'cambiar-cliente') { e.clienteId = null; e.destino = null; pintarTodo(); $('#q-cli', root).focus(); }
          else if (a === 'elegir-cliente') { e.clienteId = b.dataset.id; e.destino = null; elegirDestinoInicial(); pintarTodo(); }
          else if (a === 'completo') {
            const obj = objetivo();
            if (obj == null) { BG.toast(e.clienteId ? 'Una seña no tiene saldo: escribí el monto.' : 'Primero elegí el cliente.', 'error'); return; }
            e.partes = [{ forma: e.partes[0] ? e.partes[0].forma : 'efectivo', monto: obj }];
            pintarPagos();
            pintarResumen();
          } else if (a === 'agregar-forma') {
            const obj = objetivo();
            const falta = obj == null ? 0 : Math.max(0, obj - sum(e.partes, (p) => p.monto || 0));
            e.partes.push({ forma: siguienteForma(e.partes), monto: falta });
            pintarPagos();
            pintarResumen();
            const ult = $('#monto-' + (e.partes.length - 1), root);
            if (ult) ult.focus();
          } else if (a === 'registrar') registrar();
        });
      },
    };
  };
})();

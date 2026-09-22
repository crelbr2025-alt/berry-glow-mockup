/*!
 * berry.Glow_py — Pantallas: listado de ventas y detalle de una venta (anulaciones, precios, devoluciones y cuotas).
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
        + '<textarea id="motivo" class="textarea" rows="3" placeholder="Ej.: se cargó por error"></textarea>'
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
      + '<p class="hint">Si la clienta devuelve uno o varios artículos, usá «Devolución o cambio»: anular es para ventas cargadas por error.</p>'
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
    const vivos = v.items.map((it, i) => ({ it: it, i: i })).filter((x) => BG.cantidadViva(x.it) > 0);
    const st = { item: vivos.length === 1 ? vivos[0].i : null, precio: 0, motivo: null, nota: '' };
    const totalCon = (precio) => BG.totalesDe(v, v.items.map((x, i) => (i === st.item ? Object.assign({}, x, { precio: precio }) : x))).total;
    const pintarInfo = (form) => {
      const host = $('#aj-info', form);
      if (st.item == null || !(st.precio > 0)) { host.innerHTML = ''; return; }
      const total = totalCon(st.precio);
      const ev = BG.evaluarPrecio(st.precio, v.items[st.item].costoUnitGs);
      host.innerHTML = '<dl class="summary"><dt>Total de la venta</dt><dd>' + gs(v.total) + ' → ' + gs(total) + '</dd><dt>Ya pagó</dt><dd>' + gs(pagado) + '</dd><div class="sep"></div>'
        + (total >= pagado ? '<dt><strong>Saldo nuevo</strong></dt><dd class="big ' + (total > pagado ? 'due' : 'clear') + '">' + gs(total - pagado) + '</dd>'
          : '<dd class="span error-text">Quedaría menos de lo que ya pagó: si la clienta devuelve algo, usá «Devolución o cambio» (lo que sobra queda a su favor).</dd>') + '</dl>'
        + (ev ? '<p class="precio-info">' + BG.infoPrecio(ev, true) + '</p>' : '');
    };
    const r = await BG.modal({
      titulo: 'Ajustar precio · ' + BG.fmtRecibo(v.recibo),
      cuerpo: '<p class="small">El total y el saldo de la venta se recalculan. El cambio queda registrado con el motivo y quién lo hizo, y el recibo que se emita después sale con el precio nuevo.</p>'
        + (vivos.length > 1
          ? '<div class="field"><span class="field-label" id="aj-item-l">Artículo</span><div class="dests" role="radiogroup" aria-labelledby="aj-item-l">'
            + vivos.map((x) => '<label class="dest"><input type="radio" name="aj-item" value="' + x.i + '"><span class="grow"><span class="row-title">' + esc(x.it.descripcion) + '</span>'
              + '<span class="row-sub">' + BG.cantidadViva(x.it) + ' × ' + gs(x.it.precio) + '</span></span></label>').join('') + '</div></div>'
          : '<p><strong>' + esc(vivos[0].it.descripcion) + '</strong> · ' + BG.cantidadViva(vivos[0].it) + ' × ' + gs(vivos[0].it.precio) + '</p>')
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

  /* ── Devolución o cambio de un artículo ──────────────────────────────── */

  BG.devolucionUI = async (v) => {
    const pagado = BG.pagadoVenta(v);
    const vivos = v.items.map((it, i) => ({ it: it, i: i })).filter((x) => BG.cantidadViva(x.it) > 0);
    const st = { item: vivos.length === 1 ? vivos[0].i : null, cantidad: 1, tipo: 'devolucion', productoId: null, talle: '', motivo: null, nota: '', destino: 'favor' };
    const quedan = () => (st.item == null ? 0 : BG.cantidadViva(v.items[st.item]));
    // Lo que quedaría: mismas reglas que la acción (unidades vivas y descuento repartido).
    const simular = () => {
      if (st.item == null || st.tipo === 'talle') return { total: v.total };
      const items = v.items.map((x, i) => (i === st.item ? Object.assign({}, x, { devueltas: (x.devueltas || 0) + st.cantidad }) : x));
      if (st.tipo === 'cambio') {
        const p = st.productoId && BG.producto(st.productoId);
        if (!p) return null;
        items.push({ precio: p.precioVenta, cantidad: st.cantidad });
      }
      return { total: BG.totalesDe(v, items).total };
    };
    const MOTIVOS = BG.MOTIVOS_DEVOLUCION;
    const pintar = (form) => {
      const q = quedan();
      if (st.cantidad > q) st.cantidad = Math.max(1, q);
      $('#dv-cant', form).innerHTML = st.item == null ? '<span class="muted small">Primero elegí el artículo.</span>'
        : '<div class="seg" role="radiogroup" aria-label="Unidades que vuelven">' + Array.from({ length: Math.min(q, 6) }, (x, k) => k + 1)
          .map((n) => '<label><input type="radio" name="dv-cant" value="' + n + '"' + (st.cantidad === n ? ' checked' : '') + '>' + n + '</label>').join('') + '</div>';
      $('#dv-bloque-cambio', form).hidden = st.tipo !== 'cambio';
      $('#dv-bloque-talle', form).hidden = st.tipo !== 'talle';
      const p = st.productoId && BG.producto(st.productoId);
      $('#dv-elegido', form).innerHTML = p ? '<div class="picked"><span class="avatar">' + icon('tag', 'i-sm') + '</span><div class="grow"><div class="row-title">' + esc(p.descripcion) + '</div>'
        + '<div class="row-sub">' + gs(p.precioVenta) + ' c/u · quedan ' + BG.disponibles(p) + '</div></div></div>' : '';
      const sim = simular();
      const host = $('#dv-info', form);
      if (!sim || st.item == null) { host.innerHTML = ''; return; }
      if (st.tipo === 'talle') {
        host.innerHTML = '<p class="callout">' + icon('info') + '<span>Mismo producto en otro talle: no cambia la plata. Queda anotado en la venta y en la auditoría. (Con talles cargados por separado, el sistema final también mueve el stock de cada talle.)</span></p>';
        return;
      }
      const sobra = pagado - sim.total;
      host.innerHTML = '<dl class="summary"><dt>Total de la venta</dt><dd>' + gs(v.total) + ' → ' + gs(sim.total) + '</dd><dt>Ya pagó</dt><dd>' + gs(pagado) + '</dd><div class="sep"></div>'
        + (sobra > 0 ? '<dt><strong>Le sobra</strong></dt><dd class="big t-favor">' + gs(sobra) + '</dd>'
          : '<dt><strong>' + (sim.total > v.total ? 'Saldo nuevo (paga la diferencia)' : 'Saldo nuevo') + '</strong></dt><dd class="big ' + (sim.total - pagado > 0 ? 'due' : 'clear') + '">' + gs(sim.total - pagado) + '</dd>') + '</dl>'
        + (sobra > 0 ? '<div class="field"><span class="field-label" id="dv-dest-l">¿Qué se hace con lo que sobra?</span><div class="dests" role="radiogroup" aria-labelledby="dv-dest-l">'
          + [['favor', 'Queda como saldo a favor', 'Se descuenta solo en su próxima compra (recomendado).'],
            ['efectivo', 'Devolverle en efectivo', 'Sale de la caja de hoy.' + (BG.esDuena() ? '' : ' Pide el PIN de ' + BG.nombreDuena() + '.')],
            ['transferencia', 'Devolverle por transferencia', BG.esDuena() ? 'Queda registrado como salida.' : 'Pide el PIN de ' + BG.nombreDuena() + '.']]
            .map(([k, t, s]) => '<label class="dest"><input type="radio" name="dv-dest" value="' + k + '"' + (st.destino === k ? ' checked' : '') + '><span class="grow"><span class="row-title">' + t + '</span><span class="row-sub">' + s + '</span></span></label>').join('')
          + '</div></div>' : '');
    };
    const r = await BG.modal({
      titulo: 'Devolución o cambio · ' + BG.fmtRecibo(v.recibo),
      ancho: 'wide',
      cuerpo: '<p class="small">Sin anular la venta: lo devuelto vuelve al stock, el total se recalcula y, si ya pagó de más, la diferencia queda a su favor (o se le devuelve).</p>'
        + (vivos.length > 1
          ? '<div class="field"><span class="field-label" id="dv-item-l">Artículo que devuelve</span><div class="dests" role="radiogroup" aria-labelledby="dv-item-l">'
            + vivos.map((x) => '<label class="dest"><input type="radio" name="dv-item" value="' + x.i + '"><span class="grow"><span class="row-title">' + esc(x.it.descripcion) + '</span>'
              + '<span class="row-sub">' + BG.cantidadViva(x.it) + ' × ' + gs(x.it.precio) + (x.it.devueltas ? ' · ya devolvió ' + x.it.devueltas : '') + '</span></span></label>').join('') + '</div></div>'
          : '<p><strong>' + esc(vivos[0].it.descripcion) + '</strong> · ' + BG.cantidadViva(vivos[0].it) + ' × ' + gs(vivos[0].it.precio) + '</p>')
        + '<div class="field"><span class="field-label">Unidades</span><div id="dv-cant"></div></div>'
        + '<div class="field"><span class="field-label" id="dv-tipo-l">¿Qué se lleva a cambio?</span><div class="seg" role="radiogroup" aria-labelledby="dv-tipo-l">'
        + [['devolucion', 'Nada (devolución)'], ['talle', 'El mismo en otro talle'], ['cambio', 'Otro producto']].map(([k, t]) => '<label><input type="radio" name="dv-tipo" value="' + k + '"' + (st.tipo === k ? ' checked' : '') + '>' + t + '</label>').join('') + '</div></div>'
        + '<div id="dv-bloque-cambio" class="stack" hidden><div class="search"><label class="sr-only" for="dv-q">Buscar el producto que se lleva</label><div class="search-box">' + icon('search')
        + '<input id="dv-q" class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar el producto que se lleva" role="combobox" aria-expanded="false" aria-controls="dv-q-lista" aria-autocomplete="list"></div>'
        + '<ul class="cb-list" id="dv-q-lista" role="listbox" hidden></ul></div><div id="dv-elegido"></div></div>'
        + '<div id="dv-bloque-talle" class="field" hidden><label for="dv-talle">Talle que devuelve y talle que se lleva</label><input id="dv-talle" class="input" maxlength="60" autocomplete="off" placeholder="Ej.: devolvió M y se llevó L"></div>'
        + '<div class="field"><span class="field-label" id="dv-mot-l">Motivo <span class="req">*</span></span><div class="seg" role="radiogroup" aria-labelledby="dv-mot-l">'
        + MOTIVOS.map((m) => '<label><input type="radio" name="dv-motivo" value="' + esc(m) + '">' + esc(m) + '</label>').join('') + '</div></div>'
        + '<div class="field"><label for="dv-nota">Detalle <span class="small muted">(obligatorio si el motivo es «Otro»)</span></label><input id="dv-nota" class="input" maxlength="120" autocomplete="off" placeholder="Ej.: le quedaba chico de cintura"></div>'
        + '<div id="dv-info"></div><p class="error-text" id="dv-error" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Registrar', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (val, dlg) => {
        const er = $('#dv-error', dlg);
        const falla = (m) => { er.textContent = m; er.hidden = false; return false; };
        if (st.item == null) return falla('Elegí el artículo que devuelve.');
        if (st.tipo === 'cambio') {
          const p = st.productoId && BG.producto(st.productoId);
          if (!p) return falla('Buscá y elegí el producto que se lleva.');
          if (BG.disponibles(p) < st.cantidad) return falla('Solo quedan ' + BG.disponibles(p) + ' de «' + p.descripcion + '».');
        }
        if (st.tipo === 'talle' && !st.talle.trim()) return falla('Escribí qué talle devuelve y cuál se lleva.');
        if (!st.motivo) return falla('Elegí el motivo.');
        if (st.motivo === 'Otro' && !st.nota.trim()) return falla('Contá el motivo en «Detalle».');
        return true;
      },
      onMount: (dlg) => {
        const form = $('form', dlg);
        pintar(form);
        BG.combobox($('#dv-q', form), $('#dv-q-lista', form), {
          buscar: (q) => BG.buscarProductos(q, 8, (p) => p.precioVenta && p.id !== (st.item != null ? v.items[st.item].productoId : null)).map((p) => ({ p: p })),
          pintar: (x, q) => '<span class="avatar">' + icon('tag', 'i-sm') + '</span><span class="row-main"><span class="row-title">' + BG.resaltar(x.p.descripcion, q) + '</span>'
            + '<span class="row-sub">' + esc(x.p.categoria) + ' · ' + (BG.disponibles(x.p) > 0 ? 'quedan ' + BG.disponibles(x.p) : 'agotado') + '</span></span><span class="row-end"><span class="amount">' + gs(x.p.precioVenta) + '</span></span>',
          elegir: (x) => { st.productoId = x.p.id; $('#dv-q', form).value = ''; pintar(form); },
        });
        form.addEventListener('change', (e) => {
          const t = e.target;
          if (t.name === 'dv-item') { st.item = Number(t.value); st.productoId = null; }
          else if (t.name === 'dv-cant') st.cantidad = Number(t.value);
          else if (t.name === 'dv-tipo') st.tipo = t.value;
          else if (t.name === 'dv-motivo') { st.motivo = t.value; return; }
          else if (t.name === 'dv-dest') { st.destino = t.value; return; }
          else return;
          pintar(form);
        });
        form.addEventListener('input', (e) => {
          if (e.target.id === 'dv-talle') st.talle = e.target.value;
          if (e.target.id === 'dv-nota') st.nota = e.target.value;
        });
      },
    });
    if (r !== 'ok') return false;
    const sim = simular();
    const sobra = sim ? pagado - sim.total : 0;
    const destino = sobra > 0 ? st.destino : 'favor';
    let autorizadoPor = null;
    if (destino !== 'favor') {
      const cerrada = BG.cajaCerrada(BG.hoy());
      if (!BG.esDuena() || cerrada) {
        if (!(await BG.pedirPin((cerrada ? 'La caja de hoy ya está cerrada. ' : '') + 'Devolver ' + gs(sobra) + ' en ' + BG.FORMAS[destino].toLowerCase() + ' por la devolución de la venta ' + BG.fmtRecibo(v.recibo) + '.'))) return false;
        autorizadoPor = BG.nombreDuena();
      }
    }
    const reg = BG.registrarDevolucion({ ventaId: v.id, item: st.item, cantidad: st.cantidad, tipo: st.tipo, productoId: st.productoId, talle: st.talle,
      motivo: st.motivo, nota: st.nota, destino: destino, autorizadoPor: autorizadoPor });
    BG.toast(reg.tipo === 'talle' ? 'Cambio de talle registrado.'
      : reg.reintegro ? 'Listo: se le devuelven ' + gs(reg.reintegro) + ' en ' + BG.FORMAS[reg.forma].toLowerCase() + '.'
        : reg.aFavor ? 'Listo: ' + gs(reg.aFavor) + ' quedan a favor de la clienta.'
          : 'Listo. La venta quedó en ' + gs(v.total) + (BG.saldoVenta(v) > 0 ? ', debe ' + gs(BG.saldoVenta(v)) : '') + '.');
    return true;
  };

  /* ── Cuotas con fecha ────────────────────────────────────────────────── */

  /** Editor de cuotas: cuántas, cada cuánto y la primera fecha, con la vista previa de cada una. */
  BG.htmlPlanEditor = (pref, st) => '<div class="plan-editor">'
    + '<div class="field"><span class="field-label" id="' + pref + '-n-l">Cuotas</span><div class="seg" role="radiogroup" aria-labelledby="' + pref + '-n-l">'
    + [1, 2, 3, 4, 5, 6].map((n) => '<label><input type="radio" name="' + pref + '-n" value="' + n + '"' + (st.n === n ? ' checked' : '') + '>' + n + '</label>').join('') + '</div></div>'
    + '<div class="field"><span class="field-label" id="' + pref + '-f-l">Cada cuánto</span><div class="seg" role="radiogroup" aria-labelledby="' + pref + '-f-l">'
    + Object.keys(BG.FRECUENCIAS).map((k) => '<label><input type="radio" name="' + pref + '-f" value="' + k + '"' + (st.frecuencia === k ? ' checked' : '') + '>' + BG.FRECUENCIAS[k] + '</label>').join('') + '</div></div>'
    + '<div class="field"><label for="' + pref + '-p">Vence la primera</label><input id="' + pref + '-p" class="input input-date" type="date" value="' + st.primera + '" min="' + st.desde + '"></div>'
    + '<ol class="plan-preview" id="' + pref + '-prev" aria-live="polite"></ol></div>';
  BG.pintarPlanPreview = (root, pref, st, saldo) => {
    const host = $('#' + pref + '-prev', root);
    if (!host) return;
    if (!(saldo > 0)) { host.innerHTML = ''; return; }
    const fechas = BG.fechasCuotas(st.primera, st.n, st.frecuencia);
    const montos = BG.repartirCuotas(saldo, st.n);
    host.innerHTML = fechas.map((f, i) => '<li><span>Cuota ' + (i + 1) + ' · ' + BG.fmtFechaLarga(f).split(' ')[0].slice(0, 3) + ' ' + BG.fmtFecha(f) + '</span><strong>' + gs(montos[i]) + '</strong></li>').join('');
  };
  /** Enlaza el editor al estado; al cambiar la frecuencia se propone de nuevo la primera fecha. */
  BG.enlazarPlanEditor = (root, pref, st, alCambiar) => {
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === pref + '-n') st.n = Number(t.value);
      else if (t.name === pref + '-f') {
        st.frecuencia = t.value;
        st.primera = BG.primeraCuotaSugerida(t.value, st.desde);
        const p = $('#' + pref + '-p', root);
        if (p) p.value = st.primera;
      } else if (t.id === pref + '-p') st.primera = t.value && t.value >= st.desde ? t.value : st.primera;
      else return;
      alCambiar();
    });
  };

  BG.planUI = async (v) => {
    const saldo = BG.saldoVenta(v);
    const pl = v.plan;
    const st = { n: pl ? pl.cuotas.length : 3, frecuencia: pl ? pl.frecuencia : 'mensual', desde: BG.hoy(), primera: '' };
    st.primera = BG.primeraCuotaSugerida(st.frecuencia, st.desde);
    const r = await BG.modal({
      titulo: (pl ? 'Cambiar las cuotas · ' : 'Acordar cuotas · ') + BG.fmtRecibo(v.recibo),
      cuerpo: '<p>Saldo a repartir: <strong>' + gs(saldo) + '</strong>. Cada pago que entre va cubriendo las cuotas en orden, de la primera a la última.</p>'
        + (pl ? '<p class="hint">El plan nuevo reemplaza al anterior. Lo que ya pagó no cambia.</p>' : '')
        + BG.htmlPlanEditor('pl', st),
      acciones: (pl ? [{ texto: 'Quitar el plan', valor: 'quitar', clase: 'btn-quiet btn-danger' }] : [])
        .concat([{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: pl ? 'Guardar cuotas nuevas' : 'Acordar cuotas', valor: 'ok', clase: 'btn-primary', submit: true }]),
      onMount: (dlg) => {
        const form = $('form', dlg);
        BG.pintarPlanPreview(form, 'pl', st, saldo);
        BG.enlazarPlanEditor(form, 'pl', st, () => BG.pintarPlanPreview(form, 'pl', st, saldo));
      },
    });
    if (r === 'quitar') { BG.quitarPlan(v.id); BG.toast('Plan de cuotas quitado.'); return true; }
    if (r !== 'ok') return false;
    const plan = BG.guardarPlan({ ventaId: v.id, frecuencia: st.frecuencia, n: st.n, primera: st.primera });
    BG.toast('Cuotas acordadas: ' + plan.cuotas.length + ' de ' + gs(plan.cuotas[0].monto) + ', la primera el ' + BG.fmtFecha(plan.cuotas[0].vence) + '.');
    return true;
  };

  /* ── Listado ─────────────────────────────────────────────────────────── */

  function filaVentaConCliente(v, q) {
    const cli = BG.cliente(v.clienteId);
    const n = sum(v.items, BG.cantidadViva);
    const ep = BG.estadoPlan(v);
    return '<li><a class="sale-row" href="#/ventas/' + v.id + '">'
      + '<span class="sale-date">' + BG.fmtFecha(v.fecha) + '<small>' + BG.fmtRecibo(v.recibo) + '</small></span>'
      + '<span class="sale-desc"><span class="row-title' + (v.anulada ? ' strike' : '') + '">' + (q ? BG.resaltar(cli.nombre, q) : esc(cli.nombre)) + '</span>'
      + '<span class="row-sub">' + esc(v.items.filter((it) => BG.cantidadViva(it) > 0).map((it) => it.descripcion).join(', ') || v.items.map((it) => it.descripcion).join(', ')) + ' · ' + n + (n === 1 ? ' artículo' : ' artículos') + ' · ' + gs(v.total) + '</span></span>'
      + '<span class="sale-end">' + BG.estadoVenta(v) + (!v.anulada && BG.saldoVenta(v) > 0 ? (ep && ep.proxima ? BG.pillCuota(ep.proxima) : BG.edad(v.fecha)) : '')
      + ((v.devoluciones || []).length ? '<span class="pill pill-muted">' + icon('undo') + ((v.devoluciones || []).some((d) => d.tipo !== 'devolucion') ? 'Con cambio' : 'Con devolución') + '</span>' : '') + '</span></a></li>';
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
      + chips('estado', [['todas', 'Todas'], ['debe', 'Con saldo'], ['cuotas', 'En cuotas'], ['saldada', 'Saldadas'], ['devol', 'Con devolución'], ['anulada', 'Anuladas']])
      + '</div><ul class="list" id="lista-ventas"></ul></div>';
    const pintar = (root) => {
      const h = BG.hoy();
      const desde = e.periodo === 'hoy' ? h : e.periodo === '7' ? BG.sumarDias(h, -6) : e.periodo === 'mes' ? h.slice(0, 8) + '01' : '0000';
      const q = e.q.trim();
      const ids = q ? new Set(BG.buscarClientes(q, 200).map((c) => c.id)) : null;
      let lista = BG.db.ventas.filter((v) => v.fecha >= desde && (!ids || ids.has(v.clienteId)));
      if (e.estado === 'debe') lista = lista.filter((v) => BG.saldoVenta(v) > 0);
      if (e.estado === 'cuotas') lista = lista.filter((v) => BG.saldoVenta(v) > 0 && v.plan);
      if (e.estado === 'saldada') lista = lista.filter((v) => !v.anulada && BG.saldoVenta(v) === 0);
      if (e.estado === 'devol') lista = lista.filter((v) => (v.devoluciones || []).length);
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
    const pagado = BG.pagadoVenta(v);
    const pagos = BG.pagosDeVenta(v.id, true).sort((a, b) => a.ts.localeCompare(b.ts));
    const nueva = params.get('nueva') === '1';
    const envio = BG.envioDeVenta ? BG.envioDeVenta(v.id) : null;
    const costo = BG.costoVenta(v);
    const ganancia = v.total - costo;
    const evVenta = BG.evaluarPrecio(v.total, costo);
    const cambios = BG.cambiosDePrecio(v);
    const devs = v.devoluciones || [];
    const ep = BG.estadoPlan(v);
    const favorCliente = BG.creditoCliente(cli.id);
    const hayVivos = v.items.some((it) => BG.cantidadViva(it) > 0);
    const puedePlan = BG.puede('registrarCobros') || BG.puede('registrarVentas');
    // Debajo de cada artículo: precio especial, devoluciones o cambios y, para quien la puede ver, la ganancia.
    const subItem = (it, i) => {
      const esp = it.precioLista != null && it.precio !== it.precioLista;
      const ev = BG.evaluarPrecio(it.precio, it.costoUnitGs);
      const partes = [];
      if (it.cambioDe) partes.push('<span class="t-favor">Se lo llevó a cambio</span> de «' + esc(v.items[it.cambioDe.item].descripcion) + '»');
      if (it.devueltas) partes.push('<span class="t-devuelto">Devolvió ' + it.devueltas + (it.devueltas === it.cantidad ? (it.cantidad === 1 ? '' : ' (todas)') : ' de ' + it.cantidad) + '</span>');
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
    const lineaDevolucion = (d) => {
      const titulo = d.tipo === 'talle' ? 'Cambio de talle: ' + d.cantidad + ' × ' + esc(d.descripcion)
        : d.tipo === 'cambio' ? 'Cambio: ' + d.cantidad + ' × ' + esc(d.descripcion) + ' → ' + d.cantidad + ' × ' + esc(d.productoNuevo)
          : 'Devolución: ' + d.cantidad + ' × ' + esc(d.descripcion);
      return '<li class="line"><div class="row-title">' + titulo + '</div>'
        + '<div class="row-sub">' + BG.fmtFecha(d.fecha) + ' a las ' + BG.fmtHora(d.ts) + ' · por ' + esc(d.usuario) + ' · <strong>' + esc(d.motivo) + '</strong>' + (d.nota ? ': ' + esc(d.nota) : '') + (d.talle ? ' · ' + esc(d.talle) : '') + '</div>'
        + (d.totalAntes !== d.totalDespues ? '<div class="row-sub">Total de la venta ' + gs(d.totalAntes) + ' → ' + gs(d.totalDespues) + '</div>' : '')
        + (d.aFavor ? '<p class="precio-info">' + (d.reintegro ? '<span class="pill pill-muted">' + icon('undo') + 'Se le devolvieron ' + gs(d.reintegro) + ' en ' + BG.FORMAS[d.forma].toLowerCase() + '</span>'
          + (d.autorizadoPor ? ' <span class="small muted">autorizó ' + esc(d.autorizadoPor) + '</span>' : '') : BG.pillFavor(d.aFavor, true) + ' <span class="small muted">quedó a favor de la clienta</span>') + '</p>' : '')
        + '</li>';
    };
    const cardPlan = !v.anulada && (ep || (saldo > 0 && puedePlan)) ? '<section class="card stack" aria-labelledby="t-plan"><div class="card-head"><h2 id="t-plan">Cuotas</h2>'
      + (puedePlan && saldo > 0 ? '<button type="button" class="btn btn-sm" data-accion="plan">' + icon('calendar', 'i-sm') + (ep ? 'Cambiar cuotas' : 'Acordar cuotas') + '</button>' : '') + '</div>'
      + (ep ? '<ol class="cuotas">' + ep.cuotas.map((c) => '<li class="cuota cuota-' + c.estado + '"><span class="cuota-n">' + c.n + '</span><span class="grow"><span class="row-title">' + BG.fmtFecha(c.vence) + ' <span class="small muted">' + BG.fmtFechaLarga(c.vence).split(' ')[0] + '</span></span>'
          + '<span class="row-sub">' + (c.pagado && c.falta ? 'Pagó ' + gs(c.pagado) + ' de ' + gs(c.monto) + ' · falta ' + gs(c.falta) : gs(c.monto)) + '</span></span>' + BG.pillCuota(c) + '</li>').join('') + '</ol>'
        + '<p class="hint">' + BG.FRECUENCIAS[v.plan.frecuencia] + ' · acordado el ' + BG.fmtFecha(v.plan.fecha) + ' por ' + esc(v.plan.usuario) + '. Cada pago cubre las cuotas en orden; si el total baja, se descuenta de las últimas.</p>'
        + (ep.proxima && ep.proxima.estado !== 'futura' ? '<div class="row"><a class="btn btn-sm" href="' + BG.waLink(cli, BG.textoRecordatorio(cli, v, ep.proxima)) + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Recordarle por WhatsApp</a>'
          + (BG.puede('registrarCobros') ? '<a class="btn btn-sm btn-primary" href="#/cobros/nuevo?cliente=' + cli.id + '&venta=' + v.id + '">' + icon('cash', 'i-sm') + 'Cobrar la cuota</a>' : '') + '</div>' : '')
        : '<p class="small">Quedó a cuenta sin fechas. Acordá cuotas para ver qué vence esta semana y qué está atrasado.</p>')
      + '</section>' : '';
    const textoWa = 'Hola ' + cli.nombre.split(' ')[0] + ', gracias por tu compra en ' + BG.db.config.tienda.nombre + '. Total ' + gs(v.total)
      + ', pagado ' + gs(pagado) + (saldo > 0 ? ', saldo pendiente ' + gs(saldo) : ', ¡quedó saldada!') + '. Recibo ' + BG.fmtRecibo(v.recibo) + '.';

    const html = '<div class="page">'
      + '<a class="back-link" href="#/clientes/' + cli.id + '">' + icon('left', 'i-sm') + esc(cli.nombre) + '</a>'
      + (nueva ? '<section class="success" aria-live="polite"><h2>' + icon('check') + 'Venta registrada · Recibo ' + BG.fmtRecibo(v.recibo) + '</h2>'
        + '<p>' + (saldo > 0 ? 'Queda un saldo de <strong>' + gs(saldo) + '</strong> en la cuenta de ' + esc(cli.nombre) + (ep ? ', en ' + ep.cuotas.length + ' cuotas' : '') + '.' : 'La venta quedó saldada.') + '</p>'
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
      + (!v.anulada && hayVivos && BG.puede('devoluciones') ? '<button type="button" class="btn" data-accion="devolucion">' + icon('undo') + 'Devolución o cambio</button>' : '')
      + (!v.anulada && hayVivos && BG.puede('preciosEspeciales') ? '<button type="button" class="btn" data-accion="ajustar-precio">' + icon('tag') + 'Ajustar precio</button>' : '')
      + (v.anulada || !BG.esDuena() ? '' : '<button type="button" class="btn btn-danger" data-accion="anular-venta">' + icon('ban') + 'Anular venta</button>')
      + '</div></div>'
      + (v.anulada ? '<div class="callout callout-bad">' + icon('ban') + '<div><strong>Venta anulada el ' + BG.fmtFecha(v.anulada.fecha) + ' a las ' + BG.fmtHora(v.anulada.ts) + ' por ' + esc(v.anulada.usuario) + '.</strong> Motivo: ' + esc(v.anulada.motivo) + '</div></div>' : '')
      + (!v.anulada && saldo > 0 && favorCliente > 0 ? '<div class="favor-banner favor-banner-sm">' + '<span class="favor-ic">' + icon('wallet') + '</span><div class="grow"><strong>' + esc(cli.nombre.split(' ')[0]) + ' tiene ' + gs(favorCliente) + ' a favor.</strong> '
        + '<span class="small">Se puede usar para pagar esta venta.</span></div>'
        + (BG.puede('registrarCobros') ? '<a class="btn btn-sm btn-primary" href="#/cobros/nuevo?cliente=' + cli.id + '&venta=' + v.id + '&usar=1">' + icon('cash', 'i-sm') + 'Usarlo</a>' : '') + '</div>' : '')
      + '<div class="grid-2">'
      + '<section class="card"><div class="card-head"><h2>Artículos</h2><span class="small muted">Precios congelados al vender</span></div>'
      + '<div class="table-wrap table-bare"><table class="table table-compact table-venta"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>'
      + v.items.map((it, i) => { const n = BG.cantidadViva(it); return '<tr><td><div class="t-title' + (n ? '' : ' strike') + '">' + esc(it.descripcion) + '</div>' + subItem(it, i) + '</td>'
        + '<td class="num">' + n + '</td><td class="num">' + gs(it.precio) + '</td><td class="num">' + gs(it.precio * n) + '</td></tr>'; }).join('')
      + '</tbody><tfoot>'
      + (v.descuento.monto ? '<tr><td colspan="3">Subtotal</td><td class="num">' + gs(v.subtotal) + '</td></tr><tr><td colspan="3">Descuento' + (v.descuento.tipo === 'porcentaje' ? ' (' + BG.C.fmtNum(v.descuento.valor, 0, 2) + ' %)' : '') + '</td><td class="num">−' + gs(v.descuento.monto) + '</td></tr>' : '')
      + '<tr><td colspan="3">Total</td><td class="num">' + gs(v.total) + '</td></tr></tfoot></table></div>'
      + (duena ? '<div class="card-foot"><span class="small muted">Solo ' + esc(BG.nombreDuena()) + ' ve esto</span><span class="small">Costo congelado <strong>' + gs(costo) + '</strong> · Ganancia real <strong>' + gs(ganancia) + '</strong>'
        + (evVenta ? ' (' + BG.fmtMargen(evVenta.margen) + ' sobre el costo)' : '') + '</span></div>'
        : cambios.length && evVenta && BG.veGanancia() ? '<div class="card-foot"><span class="small muted">Por los precios especiales</span><span class="small">' + BG.infoPrecio(evVenta, false, true) + '</span></div>' : '')
      + '</section>'
      + '<section class="card"><div class="card-head"><h2>Pagos</h2>' + (v.anulada ? '' : '<span class="amount">' + (saldo > 0 ? 'Debe ' + gs(saldo) : 'Saldada') + '</span>') + '</div>'
      + (pagos.length ? '<ul class="lines">' + pagos.map((p) => '<li class="line"><div class="line-top"><div class="grow">'
        + '<div class="row-title' + (p.anulado ? ' strike' : '') + '">' + gs(p.total) + (p.excedente ? ' ' + BG.pillFavor(p.excedente) : '') + '</div>'
        + '<div class="row-sub">' + BG.fmtFecha(p.fecha) + ' ' + BG.fmtHora(p.ts) + ' · ' + BG.fmtRecibo(p.recibo) + (p.inicial ? ' · pago inicial' : '') + ' · por ' + esc(p.usuario) + '</div>'
        + '<div class="row-sub">' + p.partes.map((x) => BG.FORMAS[x.forma] + ' ' + gs(x.monto)).join(' + ') + '</div>'
        + (p.anulado ? '<div class="row-sub">Anulado el ' + BG.fmtFecha(p.anulado.fecha) + ': ' + esc(p.anulado.motivo) + '</div>' : '')
        + '</div>' + (p.anulado || v.anulada || !BG.esDuena() ? '' : '<button type="button" class="btn btn-sm btn-quiet" data-accion="anular-pago" data-id="' + p.id + '">Anular</button>')
        + '</div></li>').join('')
        + (v.aFavor ? '<li class="line line-favor"><div class="row-title">−' + gs(v.aFavor) + ' pasó a saldo a favor</div><div class="row-sub">Por la devolución: lo que había pagado de más ya no es parte de esta venta' + (devs.some((d) => d.reintegro) ? ' (y se le devolvió en plata)' : '') + '.</div></li>' : '')
        + '</ul>' : '<p class="empty">Todavía no hay pagos: la venta quedó a cuenta.</p>')
      + '<dl class="summary list-top"><dt>Total de la venta</dt><dd>' + gs(v.total) + '</dd><dt>Pagado</dt><dd>' + gs(pagado) + '</dd><div class="sep"></div>'
      + '<dt><strong>Saldo</strong></dt><dd class="big ' + (saldo > 0 ? 'due' : 'clear') + '">' + gs(saldo) + '</dd></dl>'
      + '</section></div>'
      + cardPlan
      + (devs.length ? '<section class="card stack"><div class="card-head"><h2>Devoluciones y cambios</h2><span class="small muted">Quedan en la auditoría</span></div>'
        + '<ul class="lines">' + devs.slice().reverse().map(lineaDevolucion).join('') + '</ul></section>' : '')
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
            if (b.dataset.accion === 'devolucion' && (await BG.devolucionUI(v))) BG.render();
            if (b.dataset.accion === 'plan' && (await BG.planUI(v))) BG.render();
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

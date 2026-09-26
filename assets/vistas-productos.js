/*!
 * berry.Glow_py — Módulo 2: productos, ficha con el cálculo congelado, parámetros y carga con calculadora.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  /* ── Piezas del cálculo ──────────────────────────────────────────────── */

  /** Precio sugerido en escalera: cuatro etiquetas (50/80/100/120 %) + "otro precio". */
  BG.htmlEscalera = (precios, seleccion, nombre, costoGs, otro) => '<div class="ladder" role="radiogroup" aria-label="Precio de venta">'
    + precios.map((p) => '<label class="rung"><input type="radio" name="' + nombre + '" value="' + p.margen + '"' + (String(seleccion) === String(p.margen) ? ' checked' : '') + '>'
      + '<span class="rung-m">' + p.margen + ' %</span><span class="rung-price">' + gs(p.precio) + '</span>'
      + '<span class="rung-exact">exacto ' + gs(p.exacto) + '</span><span class="rung-gain">gana ' + gs(p.precio - costoGs) + ' c/u</span></label>').join('')
    + '<label class="rung rung-custom"><input type="radio" name="' + nombre + '" value="otro"' + (seleccion === 'otro' ? ' checked' : '') + '>'
    + '<span class="grow"><strong>Otro precio</strong><span class="rung-exact"> · promoción o precio de mercado</span></span>'
    + BG.campoGs(nombre + '-otro', otro, 'aria-label="Otro precio de venta" data-otro-de="' + nombre + '"') + '</label></div>';

  /** Rastro del cálculo con sus unidades reales (envío, costo total, conversión). */
  BG.htmlRastro = (o) => {
    const fila = (label, formula, valor, total) => '<div class="t-label' + (total ? ' total' : '') + '">' + label + '</div>'
      + '<div class="formula' + (total ? ' total' : '') + '">' + formula + '</div><div class="t-val' + (total ? ' total' : '') + '">' + valor + '</div>';
    return '<div class="trail">'
      + fila('Envío', o.envioFormula, C.fmtUSD(o.r.envioUSD))
      + fila('Costo total', C.fmtUSD(o.r.costoUSD) + ' + ' + C.fmtUSD(o.r.envioUSD), C.fmtUSD(o.r.costoTotalUSD))
      + fila('En guaraníes', C.fmtUSD(o.r.costoTotalUSD) + ' × ' + C.fmtCot(C.qToString(o.r.cotizacion)) + (o.cotNota ? ' <span class="muted">(' + o.cotNota + ')</span>' : ''), gs(o.r.costoTotalGs), true)
      + '</div><p class="hint">De ese costo, ' + gs(o.r.envioGs) + ' es envío y ' + gs(o.r.productoGs) + ' es el producto (suman exacto).</p>';
  };

  const preciosDe = (r) => r.precios.map((p) => ({ margen: p.margen, exacto: p.exacto, precio: Number(p.redondeado) }));

  function envioFormulaProducto(p) {
    if (p.envioModo === 'total') {
      const ped = BG.db.pedidos.find((x) => x.id === p.pedidoId);
      return 'Prorrateado por peso: ' + C.fmtUSD(ped.envio.totalUSD) + ' del pedido ÷ ' + C.fmtKg(ped.envio.pesoKg) + ' × ' + C.fmtKg(p.pesoKg);
    }
    return C.fmtKg(p.pesoKg) + ' × ' + C.fmtUSD(p.tarifa) + '/kg';
  }

  /* ── Parámetros globales (se usan acá y en Ajustes) ──────────────────── */

  async function elegirRepreciar(valor) {
    const cot = C.qToString(valor);
    const filas = BG.db.productos.filter((p) => p.costoUSD != null && BG.disponibles(p) > 0)
      .map((p) => ({ p: p, nuevo: BG.precioConCotizacion(p, cot) })).filter((x) => x.nuevo !== x.p.precioVenta);
    if (!filas.length) { BG.toast('Con esa cotización ningún precio cambia.'); return []; }
    let ids = [];
    const r = await BG.modal({
      titulo: 'Actualizar precios de venta', ancho: 'wide',
      cuerpo: '<p>Con el dólar a <strong>' + C.fmtCot(cot) + '</strong>, estos productos con stock cambiarían de precio. El <strong>costo congelado no se toca</strong>: cambia solo el precio de venta.</p>'
        + '<div class="table-wrap"><table class="table table-compact"><thead><tr><th><span class="sr-only">Actualizar</span></th><th>Producto</th><th class="num">Stock</th><th class="num">Precio actual</th><th class="num">Precio nuevo</th></tr></thead><tbody>'
        + filas.map((x) => '<tr><td><input type="checkbox" class="rep" value="' + x.p.id + '"' + (x.p.margen ? ' checked' : '') + ' aria-label="Actualizar ' + esc(x.p.descripcion) + '"></td>'
          + '<td><div class="t-title">' + esc(x.p.descripcion) + '</div><div class="t-sub">' + (x.p.margen ? 'Margen ' + x.p.margen + ' %' : 'Precio a mano: no se marca solo') + '</div></td>'
          + '<td class="num">' + BG.disponibles(x.p) + '</td><td class="num">' + gs(x.p.precioVenta) + '</td><td class="num"><strong>' + gs(x.nuevo) + '</strong></td></tr>').join('')
        + '</tbody></table></div>',
      acciones: [{ texto: 'Solo cambiar la cotización', valor: 'ninguno', clase: 'btn-quiet' }, { texto: 'Actualizar los marcados', valor: 'ok', clase: 'btn-primary' }],
      validar: (v, dlg) => { ids = $$('.rep:checked', dlg).map((c) => c.value); return true; },
    });
    if (r === null) return null;
    return r === 'ninguno' ? [] : ids;
  }

  BG.editarCotizacionUI = async () => {
    const cfg = BG.db.config;
    let valor = null;
    let repreciar = false;
    const r = await BG.modal({
      titulo: 'Cotización del dólar',
      cuerpo: '<p>Hoy está en <strong>' + C.fmtCot(cfg.cotizacion.valor) + '</strong> por US$ 1 (cambiada el ' + BG.fmtFecha(cfg.cotizacion.fecha) + ' por ' + esc(cfg.cotizacion.usuario) + ').</p>'
        + '<div class="field"><label for="n-cot">Nueva cotización (₲ por US$ 1)</label><div class="money"><span class="money-sym" aria-hidden="true">₲</span>'
        + '<input id="n-cot" class="input" inputmode="decimal" autocomplete="off" data-dec="0" data-kind="miles" placeholder="7.500"></div>'
        + '<span class="error-text" id="n-cot-e" hidden></span></div>'
        + '<div class="callout">' + icon('info') + '<div>Se usa en los productos que cargues desde ahora. Los ya cargados conservan su costo en guaraníes (<strong>cotización congelada</strong>), así la ganancia real no se distorsiona.</div></div>'
        + '<label class="check-inline"><input type="checkbox" id="n-rep"> Además, revisar y actualizar el precio de venta de los productos con stock</label>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar cotización', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        const q = C.parseNum($('#n-cot', dlg).value, 'miles');
        if (!q || C.cmp(q, C.Q(1000n)) < 0 || C.cmp(q, C.Q(100000n)) > 0) {
          const er = $('#n-cot-e', dlg);
          er.textContent = 'Escribí una cotización válida, por ejemplo 7.550.';
          er.hidden = false;
          return false;
        }
        valor = q;
        repreciar = $('#n-rep', dlg).checked;
        return true;
      },
      onMount: (dlg) => $('#n-cot', dlg).focus(),
    });
    if (r !== 'ok') return false;
    let ids = [];
    if (repreciar) { ids = await elegirRepreciar(valor); if (ids === null) return false; }
    const n = BG.cambiarCotizacion(valor, ids);
    BG.renderChrome();
    BG.toast('Dólar actualizado a ' + C.fmtCot(C.qToString(valor)) + (n ? ' · ' + n + ' precios de venta actualizados' : '') + '.');
    return true;
  };

  BG.editarTarifaUI = async () => {
    const cfg = BG.db.config;
    let valor = null;
    const r = await BG.modal({
      titulo: 'Tarifa del courier',
      cuerpo: '<p>Hoy está en <strong>' + C.fmtUSD(cfg.tarifa.valor) + ' por kg</strong> (desde el ' + BG.fmtFecha(cfg.tarifa.fecha) + ').</p>'
        + '<div class="field"><label for="n-tar">Nueva tarifa (US$ por kg)</label><div class="suffix-wrap"><input id="n-tar" class="input" inputmode="decimal" autocomplete="off" data-dec="2" placeholder="22,50"><span class="suffix">/kg</span></div>'
        + '<span class="error-text" id="n-tar-e" hidden></span></div>'
        + '<p class="hint">Se aplica a lo que cargues desde ahora; el envío de los productos ya cargados queda congelado.</p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar tarifa', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        const q = C.parseNum($('#n-tar', dlg).value, 'decimal');
        if (!q || C.isZero(q) || C.cmp(q, C.Q(500n)) > 0) { const er = $('#n-tar-e', dlg); er.textContent = 'Escribí la tarifa en dólares por kilo, por ejemplo 22,50.'; er.hidden = false; return false; }
        valor = q;
        return true;
      },
      onMount: (dlg) => $('#n-tar', dlg).focus(),
    });
    if (r !== 'ok') return false;
    BG.cambiarTarifa(valor);
    BG.renderChrome();
    BG.toast('Tarifa del courier: ' + C.fmtUSD(valor) + ' por kg.');
    return true;
  };

  BG.editarRedondeoUI = async () => {
    const cfg = BG.db.config;
    const ejemplo = (paso, modo) => [C.Q(87300n), C.Q(421875n, 2n)].map((x) => gs(x) + ' → ' + gs(C.redondear(x, { paso: paso, modo: modo }))).join(' · ');
    const r = await BG.modal({
      titulo: 'Redondeo de precios',
      cuerpo: '<p>El precio sugerido se redondea a un valor "lindo". Se aplica a los precios que se calculen desde ahora.</p>'
        + '<div class="fields"><div class="field"><label for="r-paso">Redondear a</label><select id="r-paso" class="select">'
        + [[1, 'Sin redondeo'], [100, '100'], [500, '500'], [1000, '1.000 (millar)'], [5000, '5.000'], [10000, '10.000']].map(([v, t]) => '<option value="' + v + '"' + (cfg.redondeo.paso === v ? ' selected' : '') + '>' + t + '</option>').join('')
        + '</select></div><div class="field"><label for="r-modo">Hacia</label><select id="r-modo" class="select">'
        + Object.keys(BG.MODOS_REDONDEO).map((k) => '<option value="' + k + '"' + (cfg.redondeo.modo === k ? ' selected' : '') + '>' + BG.MODOS_REDONDEO[k] + '</option>').join('')
        + '</select></div></div><p class="callout" id="r-ej"></p>'
        + '<p class="hint">Ojo: el brief pone como ejemplo "₲ 87.300 → ₲ 90.000", que es redondear a 10.000 (al millar da ₲ 87.000). Por eso el criterio es ajustable.</p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar redondeo', valor: 'ok', clase: 'btn-primary' }],
      onMount: (dlg) => {
        const upd = () => { $('#r-ej', dlg).textContent = 'Ejemplos: ' + ejemplo(Number($('#r-paso', dlg).value), $('#r-modo', dlg).value); };
        $('#r-paso', dlg).addEventListener('change', upd);
        $('#r-modo', dlg).addEventListener('change', upd);
        upd();
      },
      validar: (v, dlg) => { BG.cambiarRedondeo(Number($('#r-paso', dlg).value), $('#r-modo', dlg).value); return true; },
    });
    if (r === 'ok') BG.toast('Redondeo: ' + BG.textoRedondeo(cfg.redondeo) + '.');
    return r === 'ok';
  };

  BG.htmlParametros = () => {
    const cfg = BG.db.config;
    return '<div class="params-bar" aria-label="Parámetros vigentes">'
      + '<span class="param-chip">' + icon('calendar', 'i-sm') + 'Dólar <strong>' + C.fmtCot(cfg.cotizacion.valor) + '</strong> desde el ' + BG.fmtFechaCorta(cfg.cotizacion.fecha)
      + '<button type="button" data-param="cotizacion">cambiar</button></span>'
      + '<span class="param-chip">' + icon('truck', 'i-sm') + 'Courier <strong>' + C.fmtUSD(cfg.tarifa.valor) + '/kg</strong><button type="button" data-param="tarifa">cambiar</button></span>'
      + '<span class="param-chip">Redondeo <strong>' + BG.textoRedondeo(cfg.redondeo) + '</strong><button type="button" data-param="redondeo">cambiar</button></span></div>';
  };
  BG.enlazarParametros = (root, alCambiar) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-param]');
      if (!b) return;
      const f = { cotizacion: BG.editarCotizacionUI, tarifa: BG.editarTarifaUI, redondeo: BG.editarRedondeoUI }[b.dataset.param];
      if (f && (await f())) alCambiar();
    });
  };

  /* ── Ficha de producto (diálogo) ─────────────────────────────────────── */

  BG.verProducto = async (id) => {
    const p = BG.producto(id);
    if (!p) return;
    const duena = BG.esDuena();
    const disp = BG.disponibles(p);
    const ultima = BG.ultimaVentaDe(p.id);
    const quieto = disp > 0 && BG.diasSinVender(p) >= BG.DIAS_QUIETO;
    // Lo que volvió al stock: unidades de ventas anuladas y unidades devueltas. Se muestra para que nadie tenga
    // que adivinar por qué el disponible subió de nuevo.
    const deAnuladas = BG.db.ventas.filter((v) => v.anulada).reduce((a, v) => a + v.items.filter((it) => it.productoId === p.id).reduce((b2, it) => b2 + BG.cantidadViva(it), 0), 0);
    const devueltas = BG.db.ventas.filter((v) => !v.anulada).reduce((a, v) => a + v.items.filter((it) => it.productoId === p.id).reduce((b2, it) => b2 + (it.devueltas || 0), 0), 0);
    const stock = '<dl class="kv"><dt>Cargados</dt><dd>' + p.cantidad + '</dd><dt>Vendidos</dt><dd>' + BG.vendidas(p.id) + '</dd>'
      + (deAnuladas ? '<dt>Volvieron de ventas anuladas</dt><dd>' + deAnuladas + '</dd>' : '')
      + (devueltas ? '<dt>Volvieron por devolución</dt><dd>' + devueltas + '</dd>' : '')
      + (BG.ajusteStock(p.id) ? '<dt>Ajuste por conteo</dt><dd>' + (BG.ajusteStock(p.id) > 0 ? '+' : '') + BG.ajusteStock(p.id) + '</dd>' : '') + '<dt>Disponibles</dt><dd>' + disp + '</dd>'
      + '<dt>Última venta</dt><dd>' + (ultima ? BG.fmtFecha(ultima) + ' (' + BG.haceDias(ultima) + ')' : 'nunca se vendió') + '</dd></dl>'
      + (quieto ? '<p class="callout callout-warn">' + icon('pause') + '<span>Lleva <strong>' + BG.diasSinVender(p) + ' días</strong> sin venderse: candidato a liquidación o promoción.</span></p>' : '');
    const cabecera = '<p class="muted small">' + esc(p.codigo) + ' · ' + esc(p.categoria) + (duena ? ' · ' + esc(p.proveedor) : '') + ' · cargado el ' + BG.fmtFecha(p.fechaCarga)
      + (p.usuario ? ' por ' + esc(p.usuario) : '') + '</p>';
    // Se cargó por error: se puede borrar solo si nunca se movió (sin ventas vivas ni conteos). Queda en la auditoría.
    // Si ya se vendió, no se borra: se archiva, y así sale de las listas sin tocar ninguna venta.
    const borrable = BG.puedeBorrarProducto(p);
    const archivable = BG.puedeArchivarProducto(p);
    const accionBorrar = borrable.ok ? [{ texto: 'Borrar', valor: 'borrar', clase: 'btn-danger' }] : [];
    const accionArchivar = (!borrable.ok && archivable.ok) || p.archivado
      ? [{ texto: p.archivado ? 'Volver a la lista' : 'Archivar', valor: 'archivar', clase: 'btn-quiet' }] : [];
    const avisoBorrar = p.archivado
      ? '<p class="hint">Este artículo está <strong>archivado</strong> desde el ' + BG.fmtFecha(p.archivado.fecha) + ': no aparece en la lista de precios ni al vender. Con «Volver a la lista» se muestra de nuevo.</p>'
      : borrable.ok
        ? '<p class="hint">¿Se cargó por error? Con <strong>Borrar</strong> desaparece de la lista (queda anotado en la auditoría). Se puede porque no está en ninguna venta viva ni en un conteo.</p>'
        : '<p class="hint">No se puede borrar: ' + esc(borrable.razon) + (archivable.ok ? '' : ' ' + esc(archivable.razon)) + '</p>';
    if (!duena) {
      const rv = await BG.modal({
        titulo: p.descripcion, cuerpo: cabecera + '<p class="hero-figure">' + (p.precioVenta ? gs(p.precioVenta) : 'Sin precio') + '</p>' + stock
          + (BG.puede('cargarProductos') ? avisoBorrar : ''),
        acciones: [{ texto: 'Cerrar', valor: 'cancelar', clase: 'btn-quiet' }].concat(BG.puede('cargarProductos') ? accionBorrar : []),
      });
      if (rv === 'borrar') await borrarProductoUI(p);
      return;
    }
    const det = BG.detalleProducto(p);
    let cuerpo = cabecera;
    let seleccion = p.margen ? p.margen : 'otro';
    if (det) {
      cuerpo += '<section class="stack"><h3 class="section-title">Cálculo congelado al cargar</h3>'
        + BG.htmlRastro({ r: det, envioFormula: envioFormulaProducto(p), cotNota: 'dólar del ' + BG.fmtFechaCorta(p.fechaCarga) }) + '</section>'
        + (p.cotizacion !== BG.db.config.cotizacion.valor ? '<div class="callout">' + icon('lock') + '<div>Se cargó con el dólar a ' + C.fmtCot(p.cotizacion) + '. Hoy está a ' + C.fmtCot(BG.db.config.cotizacion.valor) + ', pero el costo de este producto no cambia.</div></div>' : '')
        + (p.repreciado ? '<p class="hint">Precio de venta actualizado al dólar ' + C.fmtCot(p.repreciado.cotizacion) + ' el ' + BG.fmtFecha(p.repreciado.fecha) + '.</p>' : '')
        + '<section class="stack"><h3 class="section-title">Precio de venta</h3>' + BG.htmlEscalera(BG.preciosProducto(p), seleccion, 'pp', p.costoTotalGs, p.margen ? 0 : p.precioVenta) + '</section>';
    } else {
      cuerpo += '<div class="callout callout-warn">' + icon('alert') + '<div><strong>Costo pendiente.</strong> ' + esc(p.nota || 'Falta el costo en dólares.') + ' Sin costo no hay precio, y el sistema no deja venderlo.</div></div>'
        + '<div class="field"><label for="pp-costo">Costo unitario (US$)</label><div class="money"><span class="money-sym" aria-hidden="true">US$</span><input id="pp-costo" class="input input-usd" inputmode="decimal" data-dec="2" autocomplete="off" placeholder="0,00"></div>'
        + '<span class="hint">Se calcula con el dólar y el envío del día de carga (' + C.fmtCot(p.cotizacion) + ').</span><span class="error-text" id="pp-e" hidden></span></div>';
    }
    cuerpo += '<section class="stack"><h3 class="section-title">Stock</h3>' + stock + avisoBorrar + '</section>';
    let nuevo = null;
    const r = await BG.modal({
      titulo: p.descripcion, ancho: 'wide', cuerpo: cuerpo,
      acciones: [{ texto: 'Cerrar', valor: 'cancelar', clase: 'btn-quiet' }].concat(accionBorrar).concat(accionArchivar)
        .concat([{ texto: det ? 'Guardar precio' : 'Calcular y guardar', valor: 'ok', clase: 'btn-primary' }]),
      onMount: (dlg) => {
        dlg.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.otroDe) { const rd = $('input[name="pp"][value="otro"]', dlg); if (rd) rd.checked = true; } });
      },
      validar: (v, dlg) => {
        if (v === 'borrar' || v === 'archivar') return true;   // no necesitan precio: se usan cuando el artículo ya no va
        if (!det) {
          const q = C.parseNum($('#pp-costo', dlg).value, 'decimal');
          if (!q || C.isZero(q)) { const er = $('#pp-e', dlg); er.textContent = 'Escribí el costo en dólares.'; er.hidden = false; return false; }
          nuevo = { costo: q };
          return true;
        }
        const sel = $('input[name="pp"]:checked', dlg);
        if (sel && sel.value === 'otro') {
          const precio = BG.leerGs($('#pp-otro', dlg));
          if (!precio) { BG.toast('Escribí el otro precio.', 'error'); return false; }
          nuevo = { margen: null, precio: precio };
        } else if (sel) {
          const m = Number(sel.value);
          nuevo = { margen: m, precio: BG.preciosProducto(p).find((x) => x.margen === m).precio };
        }
        return true;
      },
    });
    if (r === 'borrar') { await borrarProductoUI(p); return; }
    if (r === 'archivar') { await archivarProductoUI(p); return; }
    if (r !== 'ok') return;
    // Siempre tiene que haber una respuesta: apretar «Guardar» y que no pase nada deja a la persona sin saber
    // si guardó o no. Si no cambió el precio, se lo decimos igual.
    if (!nuevo) { BG.toast('No se cambió nada: «' + p.descripcion + '» sigue en ' + (p.precioVenta ? gs(p.precioVenta) : 'sin precio') + '.'); return; }
    if (nuevo.costo) {
      const res = C.calcularProducto({ costoUSD: nuevo.costo, envioUnitUSD: p.envioUnitUSD, cotizacion: p.cotizacion, redondeo: BG.db.config.redondeo });
      p.costoUSD = C.qToString(nuevo.costo);
      p.costoTotalGs = Number(res.costoTotalGs);
      p.envioGs = Number(res.envioGs);
      p.productoGs = Number(res.productoGs);
      p.nota = '';
      BG.actualizarPrecio(p.id, BG.db.config.margenDefecto, Number(res.precios.find((x) => x.margen === BG.db.config.margenDefecto).redondeado));
      BG.toast('Costo cargado: ' + p.descripcion + ' ahora vale ' + gs(p.precioVenta) + '.');
    } else if (nuevo.precio !== p.precioVenta || nuevo.margen !== p.margen) {
      BG.actualizarPrecio(p.id, nuevo.margen, nuevo.precio);
      BG.toast('Precio de venta actualizado: ' + gs(nuevo.precio) + '.');
    } else {
      BG.toast('El precio quedó igual: ' + gs(p.precioVenta) + '.');
    }
    BG.render();
  };

  /**
   * Confirmación para borrar un artículo cargado por error: dice qué se va a borrar y pide el motivo (opcional).
   * Solo aparece cuando el artículo nunca se movió, así no hay forma de cambiar un número del pasado.
   */
  async function borrarProductoUI(p) {
    const puede = BG.puedeBorrarProducto(p);
    if (!puede.ok) { BG.toast(puede.razon, 'error'); return false; }
    let motivo = '';
    const r = await BG.modal({
      titulo: 'Borrar «' + p.descripcion + '»',
      cuerpo: '<p>Se va a borrar el artículo <strong>' + esc(p.codigo) + ' · ' + esc(p.descripcion) + '</strong> (' + p.cantidad + (p.cantidad === 1 ? ' unidad' : ' unidades')
        + (p.precioVenta ? ' a ' + gs(p.precioVenta) : ', sin precio') + ').</p>'
        + '<div class="callout callout-warn">' + icon('info') + '<div>Es para lo que se cargó <strong>por error</strong>. Nunca se vendió ni entró en un conteo, así que no cambia ninguna venta, ningún cobro ni la caja. '
        + 'Queda anotado en la auditoría con todos sus datos. Si el artículo existe pero se perdió o se dañó, no lo borres: hacé un <a href="#/productos/conteo">conteo de inventario</a>.</div></div>'
        + '<div class="field"><label for="bp-motivo">Motivo <span class="small muted">(opcional)</span></label>'
        + '<input id="bp-motivo" class="input" maxlength="120" autocomplete="off" placeholder="Ej.: lo cargué dos veces"></div>',
      acciones: [{ texto: 'Volver', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Borrar artículo', valor: 'ok', clase: 'btn-danger-solid' }],
      validar: (v, dlg) => { motivo = $('#bp-motivo', dlg).value.trim(); return true; },
      onMount: (dlg) => $('#bp-motivo', dlg).focus(),
    });
    if (r !== 'ok') return false;
    try {
      BG.borrarProducto(p.id, motivo);
      BG.toast('«' + p.descripcion + '» borrado.');
      BG.render();
      return true;
    } catch (err) { BG.toast(err.message, 'error'); return false; }
  }
  BG.borrarProductoUI = borrarProductoUI;

  /**
   * Archivar o volver a la lista. Archivar no borra nada: el artículo sale de la lista de precios y de las
   * pantallas de venta, y las ventas, los recibos y los reportes viejos quedan iguales.
   */
  async function archivarProductoUI(p) {
    if (p.archivado) {
      BG.archivarProducto(p.id, false);
      BG.toast('«' + p.descripcion + '» vuelve a la lista de precios.');
      BG.render();
      return true;
    }
    const puede = BG.puedeArchivarProducto(p);
    if (!puede.ok) { BG.toast(puede.razon, 'error'); return false; }
    let motivo = '';
    const r = await BG.modal({
      titulo: 'Archivar «' + p.descripcion + '»',
      cuerpo: '<p>Se vendió todo y no lo vas a reponer: <strong>archivarlo</strong> lo saca de la lista de precios y de las pantallas de venta.</p>'
        + '<div class="callout">' + icon('info') + '<div>No se borra nada: las ventas donde aparece, los recibos ya emitidos y los reportes quedan <strong>exactamente igual</strong>. '
        + 'Lo podés volver a la lista cuando quieras.</div></div>'
        + '<div class="field"><label for="ap-motivo">Nota <span class="small muted">(opcional)</span></label>'
        + '<input id="ap-motivo" class="input" maxlength="120" autocomplete="off" placeholder="Ej.: no se repone"></div>',
      acciones: [{ texto: 'Volver', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Archivar', valor: 'ok', clase: 'btn-primary' }],
      validar: (v, dlg) => { motivo = $('#ap-motivo', dlg).value.trim(); return true; },
      onMount: (dlg) => $('#ap-motivo', dlg).focus(),
    });
    if (r !== 'ok') return false;
    try {
      BG.archivarProducto(p.id, true, motivo);
      BG.toast('«' + p.descripcion + '» archivado: ya no aparece en las listas.');
      BG.render();
      return true;
    } catch (err) { BG.toast(err.message, 'error'); return false; }
  }
  BG.archivarProductoUI = archivarProductoUI;

  /* ── Lista de productos ──────────────────────────────────────────────── */

  BG.vistas.productos = (args, params) => {
    const duena = BG.esDuena();
    const e = { q: '', cat: 'todas', stock: 'todos' };
    const cats = Array.from(new Set(BG.db.productos.map((p) => p.categoria)));
    const chips = (grupo, pares) => '<div class="chips" role="group">' + pares.map(([k, t]) => '<button type="button" class="chip" data-' + grupo + '="' + esc(k) + '" aria-pressed="' + (e[grupo] === k) + '">' + esc(t) + '</button>').join('') + '</div>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">' + (duena ? 'Productos' : 'Lista de precios') + '</h1><p class="page-sub" id="p-resumen"></p></div>'
      + (duena || BG.puede('cargarProductos')
        ? '<div class="page-actions">'
          + (duena ? '<a class="btn" href="#/productos/conteo">' + icon('count') + 'Conteo de inventario</a><a class="btn" href="#/pedidos">' + icon('box2') + 'Pedidos al proveedor</a><a class="btn" href="#/productos/importar">' + icon('file') + 'Importar Excel</a>'
            + '<a class="btn" href="#/productos/pedido">' + icon('truck') + 'Cargar pedido</a>' : '')
          + '<a class="btn btn-primary" href="#/productos/nuevo">' + icon('plus') + 'Cargar producto</a></div>' : '') + '</div>'
      + (duena ? BG.htmlParametros() : '<div class="note-mock">' + icon('eye') + '<span>Vista de vendedor/a: se ven precio y stock; los costos, el dólar y los márgenes están ocultos.</span></div>')
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-prod-lista">Buscar producto</label>' + icon('search')
      + '<input id="q-prod-lista" class="search-input" type="search" autocomplete="off" placeholder="Buscar producto"></div>'
      + chips('cat', [['todas', 'Todas']].concat(cats.map((c) => [c, c + (c.endsWith('o') || c.endsWith('a') ? 's' : '')])))
      + chips('stock', [['todos', 'Todo'], ['con', 'Con stock'], ['sin', 'Agotados']].concat(BG.archivados() ? [['arch', 'Archivados (' + BG.archivados() + ')']] : [])) + '</div>'
      + '<div id="p-lista"></div></div>';
    const pintar = (root) => {
      let lista = e.q.trim() ? BG.buscarProductos(e.q, 500) : BG.db.productos.slice().sort((a, b) => b.ts.localeCompare(a.ts) || a.codigo.localeCompare(b.codigo));
      if (e.cat !== 'todas') lista = lista.filter((p) => p.categoria === e.cat);
      // Los archivados tienen su propio filtro: en el resto de las vistas no aparecen.
      lista = e.stock === 'arch' ? lista.filter((p) => p.archivado) : lista.filter((p) => !p.archivado);
      if (e.stock === 'con') lista = lista.filter((p) => BG.disponibles(p) > 0);
      if (e.stock === 'sin') lista = lista.filter((p) => BG.disponibles(p) <= 0);
      const valorStock = sum(lista, (p) => Math.max(0, BG.disponibles(p)) * (p.costoTotalGs || 0));
      $('#p-resumen', root).textContent = lista.length + (lista.length === 1 ? ' producto · ' : ' productos · ') + sum(lista, (p) => Math.max(0, BG.disponibles(p))) + ' unidades disponibles' + (duena ? ' · stock al costo ' + gs(valorStock) : '')
        + (e.stock !== 'arch' && BG.archivados() ? ' · ' + BG.archivados() + (BG.archivados() === 1 ? ' archivado' : ' archivados') + ' fuera de la lista' : '');
      const quieto = (p) => (p.archivado ? '<span class="pill pill-muted">' + icon('box2') + 'Archivado</span>'
        : BG.disponibles(p) > 0 && BG.diasSinVender(p) >= BG.DIAS_QUIETO ? '<span class="pill pill-warn pill-quieto">' + icon('pause') + BG.diasSinVender(p) + ' días sin venderse</span>' : '');
      const stockTxt = (p) => { const d = BG.disponibles(p); return d > 0 ? d + ' / ' + p.cantidad : '<span class="pill pill-muted">Agotado</span>'; };
      const precioTxt = (p) => (p.precioVenta ? gs(p.precioVenta) : '<span class="pill pill-warn">' + icon('alert') + 'Sin precio</span>');
      // Ícono para borrar lo que se cargó por error (solo en los que nunca se movieron; queda en la auditoría).
      const puedeCargar = duena || BG.puede('cargarProductos');
      const borrable = (p) => puedeCargar && BG.puedeBorrarProducto(p).ok;
      const btnBorrar = (p) => (borrable(p)
        ? '<button type="button" class="btn-icon btn-del" data-borrar="' + esc(p.id) + '" title="Borrar «' + esc(p.descripcion) + '»: se cargó por error" aria-label="Borrar ' + esc(p.descripcion) + '">' + icon('trash', 'i-sm') + '</button>'
        : '');
      const tabla = '<div class="table-wrap hide-narrow"><table class="table"><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Stock</th>'
        + (duena ? '<th class="num">Costo US$</th><th class="num">Costo ₲ (congelado)</th>' : '') + '<th class="num">Precio</th>' + (duena ? '<th class="num">Gana c/u</th><th>Cargado</th>' : '')
        + (puedeCargar ? '<th class="col-del"><span class="sr-only">Borrar</span></th>' : '') + '</tr></thead><tbody>'
        + lista.map((p) => '<tr class="is-link" data-ver="' + p.id + '" tabindex="0"><td><div class="t-title">' + (e.q ? BG.resaltar(p.descripcion, e.q) : esc(p.descripcion)) + '</div>'
          + '<div class="t-sub">' + esc(p.codigo) + (duena ? ' · ' + esc(p.proveedor) : '') + '</div>' + quieto(p) + '</td><td>' + esc(p.categoria) + '</td><td class="num">' + stockTxt(p) + '</td>'
          + (duena ? '<td class="num">' + (p.costoUSD ? C.fmtUSD(p.costoUSD) : '—') + '</td><td class="num">' + (p.costoTotalGs ? gs(p.costoTotalGs) : '—') + '</td>' : '')
          + '<td class="num"><strong>' + precioTxt(p) + '</strong>' + (duena && p.precioVenta ? '<div class="t-sub">' + (p.margen ? p.margen + ' %' : 'a mano') + '</div>' : '') + '</td>'
          + (duena ? '<td class="num">' + (p.precioVenta && p.costoTotalGs ? gs(p.precioVenta - p.costoTotalGs) : '—') + '</td><td class="nowrap"><div>' + BG.fmtFecha(p.fechaCarga) + '</div><div class="t-sub">dólar ' + C.fmtCot(p.cotizacion) + '</div></td>' : '')
          + (puedeCargar ? '<td class="col-del">' + btnBorrar(p) + '</td>' : '')
          + '</tr>').join('') + '</tbody></table></div>';
      const tarjetas = '<ul class="list show-narrow">' + lista.map((p) => '<li' + (borrable(p) ? ' class="list-del"' : '') + '><button type="button" class="list-row list-btn" data-ver="' + p.id + '"><span class="avatar">' + icon('tag', 'i-sm') + '</span>'
        + '<span class="row-main"><span class="row-title">' + esc(p.descripcion) + '</span><span class="row-sub">' + esc(p.categoria) + ' · ' + (BG.disponibles(p) > 0 ? 'quedan ' + BG.disponibles(p) : 'agotado')
        + (duena && p.costoTotalGs ? ' · costo ' + gs(p.costoTotalGs) : '') + '</span>' + quieto(p) + '</span><span class="row-end"><span class="amount">' + (p.precioVenta ? gs(p.precioVenta) : 'Sin precio') + '</span>'
        + (duena && p.precioVenta && p.costoTotalGs ? '<span class="small muted">gana ' + gs(p.precioVenta - p.costoTotalGs) + '</span>' : '') + '</span></button>' + btnBorrar(p) + '</li>').join('') + '</ul>';
      $('#p-lista', root).innerHTML = lista.length ? tabla + tarjetas : BG.db.productos.length ? '<p class="empty">Ningún producto coincide.</p>' : '<p class="empty">Todavía no cargaste productos. <a href="#/productos/nuevo">Cargar el primero</a></p>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-prod-lista', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        $$('[data-cat], [data-stock]', root).forEach((b) => b.addEventListener('click', () => {
          const grupo = b.dataset.cat != null ? 'cat' : 'stock';
          e[grupo] = b.dataset[grupo];
          $$('[data-' + grupo + ']', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
        root.addEventListener('click', async (ev) => {
          const del = ev.target.closest('[data-borrar]');
          if (del) { ev.stopPropagation(); await borrarProductoUI(BG.producto(del.dataset.borrar)); return; }
          const f = ev.target.closest('[data-ver]');
          if (f) BG.verProducto(f.dataset.ver);
        });
        root.addEventListener('keydown', (ev) => { const f = ev.target.closest('tr[data-ver]'); if (f && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); BG.verProducto(f.dataset.ver); } });
        if (duena) BG.enlazarParametros(root, () => BG.render());
        if (params.get('ver')) BG.verProducto(params.get('ver'));
      },
    };
  };

  /* ── Cargar un producto (calculadora) ────────────────────────────────── */

  BG.vistas.productoNuevo = () => {
    const cfg = BG.db.config;
    const s = { desc: '', cat: 'Prenda', prov: '', cant: '1', costo: '', peso: '', sel: cfg.margenDefecto, otro: 0 };
    const proveedores = Array.from(new Set(BG.db.productos.map((p) => p.proveedor).filter(Boolean)));
    const html = '<div class="page">'
      + '<a class="back-link" href="#/productos">' + icon('left', 'i-sm') + 'Productos</a>'
      + '<div class="page-head"><div><h1 class="page-title">Cargar producto</h1><p class="page-sub">Costo en dólares + envío por peso → guaraníes → precio sugerido. Se calcula mientras escribís.</p></div>'
      + '<div class="page-actions"><a class="btn btn-quiet" href="#/productos/pedido">' + icon('truck') + 'Cargar un pedido entero</a><a class="btn btn-quiet" href="#/productos/importar">' + icon('file') + 'Importar Excel</a></div></div>'
      + '<div id="pn-params"></div>'
      + '<div class="grid-form"><form id="pn-form" class="card stack" novalidate>'
      + '<div class="card-head"><h2>Datos del producto</h2><button type="button" class="btn btn-sm" data-accion="ejemplo">Usar el ejemplo del brief</button></div>'
      + '<div class="fields">'
      + '<div class="field span-2"><label for="pn-desc">Descripción <span class="req">*</span></label><input id="pn-desc" class="input" autocomplete="off" placeholder="Remera oversize negra"><span class="error-text" id="pn-desc-e" hidden></span></div>'
      + '<div class="field"><span class="field-label" id="pn-cat-l">Categoría <span class="req">*</span></span><div class="seg" role="radiogroup" aria-labelledby="pn-cat-l">'
      + ['Prenda', 'Accesorio'].map((c) => '<label><input type="radio" name="pn-cat" value="' + c + '"' + (s.cat === c ? ' checked' : '') + '>' + c + '</label>').join('') + '</div></div>'
      + '<div class="field"><label for="pn-prov">Proveedor / origen</label><input id="pn-prov" class="input" list="pn-provs" autocomplete="off" placeholder="Tienda X, EE. UU."><datalist id="pn-provs">'
      + proveedores.map((p) => '<option value="' + esc(p) + '">').join('') + '</datalist></div>'
      + '<div class="field"><label for="pn-cant">Cantidad comprada <span class="req">*</span></label><input id="pn-cant" class="input num-input" inputmode="numeric" autocomplete="off" value="1"><span class="error-text" id="pn-cant-e" hidden></span></div>'
      + '<div class="field"><label for="pn-costo">Costo unitario (US$) <span class="req">*</span></label><div class="money"><span class="money-sym" aria-hidden="true">US$</span>'
      + '<input id="pn-costo" class="input input-usd" inputmode="decimal" autocomplete="off" data-dec="2" placeholder="12,00"></div><span class="hint">Lo que salió una unidad, sin envío.</span><span class="error-text" id="pn-costo-e" hidden></span></div>'
      + '<div class="field"><label for="pn-peso">Peso unitario (kg) <span class="req">*</span></label><div class="suffix-wrap"><input id="pn-peso" class="input" inputmode="decimal" autocomplete="off" data-dec="3" placeholder="0,300"><span class="suffix">kg</span></div>'
      + '<span class="hint">300 gramos = 0,300</span><span class="error-text" id="pn-peso-e" hidden></span></div>'
      + '<div class="field"><span class="field-label">Fecha de carga</span><p class="static">' + BG.fmtFecha(BG.hoy()) + ' <span class="muted small">(automática)</span></p></div>'
      + '</div></form>'
      + '<section class="card stack sticky-col" aria-labelledby="pn-res-t" aria-live="polite"><h2 class="card-title" id="pn-res-t">Calculadora</h2><div id="pn-res" class="stack"></div></section>'
      + '</div></div>';
    let root = null;
    const calcular = () => {
      const costo = C.parseNum(s.costo, 'decimal');
      const peso = C.parseNum(s.peso, 'decimal');
      if (!costo || C.isZero(costo) || peso == null) return null;
      const c = BG.db.config;
      return { costo: costo, peso: peso, r: C.calcularProducto({ costoUSD: costo, pesoKg: peso, tarifaUSDkg: c.tarifa.valor, cotizacion: c.cotizacion.valor, redondeo: c.redondeo }) };
    };
    const precioElegido = (x) => (s.sel === 'otro' ? s.otro : Number(x.r.precios.find((p) => p.margen === Number(s.sel)).redondeado));
    const pintarLote = (x) => {
      const cant = C.parseEntero(s.cant) || 0;
      const precio = precioElegido(x);
      const lote = $('#pn-lote', root);
      if (lote) lote.innerHTML = '<div><span>Costo del lote (' + cant + ' u)</span><strong>' + gs(Number(x.r.costoTotalGs) * cant) + '</strong></div>'
        + '<div><span>Venta estimada</span><strong>' + gs(precio * cant) + '</strong></div>'
        + '<div><span>Ganancia estimada</span><strong>' + gs((precio - Number(x.r.costoTotalGs)) * cant) + '</strong></div>';
    };
    const pintarResultado = () => {
      const host = $('#pn-res', root);
      const x = calcular();
      if (!x) {
        host.innerHTML = '<div class="calc-placeholder"><p>Escribí el <strong>costo en dólares</strong> y el <strong>peso</strong>: acá aparecen el envío, el costo total en guaraníes y los cuatro precios sugeridos (50, 80, 100 y 120 %).</p>'
          + '<button type="button" class="btn btn-sm" data-accion="ejemplo">Probar con el ejemplo del brief</button></div>';
        return;
      }
      const c = BG.db.config;
      host.innerHTML = BG.htmlRastro({ r: x.r, envioFormula: C.fmtKg(x.peso) + ' × ' + C.fmtUSD(c.tarifa.valor) + '/kg', cotNota: 'dólar de hoy' })
        + '<h3 class="section-title">Precio de venta sugerido</h3>'
        + BG.htmlEscalera(preciosDe(x.r), s.sel, 'pn-precio', Number(x.r.costoTotalGs), s.otro)
        + '<div class="lot" id="pn-lote"></div>'
        + '<p class="error-text" id="pn-err" role="alert" hidden></p>'
        + '<div class="form-actions"><button type="button" class="btn" data-accion="guardar-otro">Guardar y cargar otro</button>'
        + '<button type="button" class="btn btn-primary" data-accion="guardar">' + icon('check') + 'Guardar producto</button></div>';
      BG.enlazarCampos(host);
      pintarLote(x);
    };
    const leerForm = () => {
      s.desc = $('#pn-desc', root).value;
      s.prov = $('#pn-prov', root).value;
      s.cant = $('#pn-cant', root).value;
      s.costo = $('#pn-costo', root).value;
      s.peso = $('#pn-peso', root).value;
    };
    const marcar = (id, msg) => {
      const er = $('#' + id + '-e', root);
      if (er) { er.textContent = msg || ''; er.hidden = !msg; }
      const inp = $('#' + id, root);
      if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    const guardar = async (otro) => {
      leerForm();
      const x = calcular();
      const cant = C.parseEntero(s.cant);
      marcar('pn-desc', s.desc.trim().length < 2 ? 'Escribí la descripción.' : '');
      marcar('pn-cant', !cant || cant < 1 ? 'La cantidad es un número entero de 1 o más.' : '');
      const costo = C.parseNum(s.costo, 'decimal');
      marcar('pn-costo', !costo || C.isZero(costo) ? 'Escribí el costo en dólares (ej. 12,00).' : '');
      marcar('pn-peso', C.parseNum(s.peso, 'decimal') == null ? 'Escribí el peso en kilos (ej. 0,300).' : '');
      const invalido = $('[aria-invalid="true"]', root);
      if (invalido || !x) { if (invalido) invalido.focus(); return; }
      if (s.sel === 'otro' && !(s.otro > 0)) { const er = $('#pn-err', root); er.textContent = 'Escribí el otro precio o elegí uno sugerido.'; er.hidden = false; return; }
      if (C.cmp(x.peso, C.Q(20n)) > 0) {
        const ok = await BG.modal({ titulo: '¿El peso está en kilos?', cuerpo: '<p>Pusiste <strong>' + C.fmtKg(x.peso) + '</strong> por unidad. Si son gramos, 300 gramos se escriben 0,300.</p>', acciones: [{ texto: 'Corregir', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Está bien en kilos', valor: 'ok', clase: 'btn-primary' }] });
        if (ok !== 'ok') return;
      }
      const c = BG.db.config;
      const [p] = BG.guardarProductos([{
        descripcion: s.desc.trim(), categoria: s.cat, proveedor: s.prov.trim(), cantidad: cant, costoUSD: x.costo, pesoKg: x.peso,
        envioModo: 'kg', envioUnitUSD: C.mul(x.peso, C.asQ(c.tarifa.valor)), tarifa: c.tarifa.valor, cotizacion: c.cotizacion.valor,
        margen: s.sel === 'otro' ? null : Number(s.sel), precioManual: s.sel === 'otro' ? s.otro : null,
      }], 'uno');
      BG.toast(p.codigo + ' · ' + p.descripcion + ' cargado con precio ' + gs(p.precioVenta) + '.');
      if (otro) BG.render(); else BG.ir('#/productos?ver=' + p.id);
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        const pintarParams = () => { $('#pn-params', root).innerHTML = BG.htmlParametros(); };
        pintarParams();
        BG.enlazarParametros(root, () => { pintarParams(); pintarResultado(); BG.toast('Los precios se recalcularon con el parámetro nuevo.'); });
        pintarResultado();
        $('#pn-form', root).addEventListener('input', () => { leerForm(); pintarResultado(); });
        $('#pn-form', root).addEventListener('change', (e) => { if (e.target.name === 'pn-cat') s.cat = e.target.value; });
        $('#pn-form', root).addEventListener('submit', (e) => { e.preventDefault(); guardar(false); });
        $('#pn-res', root).addEventListener('change', (e) => {
          if (e.target.name !== 'pn-precio') return;
          s.sel = e.target.value === 'otro' ? 'otro' : Number(e.target.value);
          const x = calcular();
          if (x) pintarLote(x);
          if (s.sel === 'otro') $('#pn-precio-otro', root).focus();
        });
        $('#pn-res', root).addEventListener('input', (e) => {
          if (!e.target.dataset.otroDe) return;
          s.otro = BG.leerGs(e.target);
          s.sel = 'otro';
          const rd = $('input[name="pn-precio"][value="otro"]', root);
          if (rd) rd.checked = true;
          const x = calcular();
          if (x) pintarLote(x);
        });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          if (b.dataset.accion === 'ejemplo') {
            $('#pn-desc', root).value = 'Remera oversize negra';
            $('#pn-prov', root).value = 'Tienda X, EE. UU.';
            $('#pn-cant', root).value = '3';
            $('#pn-costo', root).value = '12,00';
            $('#pn-peso', root).value = '0,300';
            $('input[name="pn-cat"][value="Prenda"]', root).checked = true;
            s.cat = 'Prenda';
            leerForm();
            pintarResultado();
          }
          if (b.dataset.accion === 'guardar') guardar(false);
          if (b.dataset.accion === 'guardar-otro') guardar(true);
        });
        $('#pn-desc', root).focus();
      },
    };
  };
})();

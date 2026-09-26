/*!
 * berry.Glow_py — Pantallas solo del dueño para manejar el negocio: gastos y ganancia neta, conteo de inventario
 * y pedidos al proveedor (de «pedido» a «llegó», y al llegar se carga al stock).
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  const tile = (label, valor, sub, cls) => '<div class="tile' + (cls ? ' ' + cls : '') + '"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';
  const rangoDe = (p) => (p === 'anterior' ? BG.mesAnterior() : p === '30' ? [BG.sumarDias(BG.hoy(), -29), BG.hoy()] : BG.mesActual());

  async function pedirTexto(titulo, cuerpo, etiqueta, boton, peligro) {
    let texto = '';
    const r = await BG.modal({
      titulo: titulo,
      cuerpo: cuerpo + '<div class="field"><label for="txt-m">' + etiqueta + ' <span class="req">*</span></label><input id="txt-m" class="input" maxlength="120" autocomplete="off"><span class="error-text" id="txt-e" hidden></span></div>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: boton, valor: 'ok', clase: peligro ? 'btn-danger-solid' : 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        texto = $('#txt-m', dlg).value.trim();
        if (texto.length >= 3) return true;
        const er = $('#txt-e', dlg);
        er.textContent = 'Escribilo en pocas palabras (queda en la auditoría).';
        er.hidden = false;
        return false;
      },
      onMount: (dlg) => $('#txt-m', dlg).focus(),
    });
    return r === 'ok' ? texto : null;
  }

  /* ── Ganancia neta: el estado de resultados en una lista corta ───────── */

  BG.htmlResultado = (r) => {
    const fila = (t, monto, sub, cls) => '<div class="pyl-fila' + (cls ? ' ' + cls : '') + '"><dt>' + t + (sub ? '<small>' + sub + '</small>' : '') + '</dt><dd>' + (monto < 0 ? '−' + gs(-monto) : gs(monto)) + '</dd></div>';
    const cats = Object.keys(r.porCategoria).sort((a, b) => r.porCategoria[b] - r.porCategoria[a]);
    const pct = r.ventasNetas > 0 ? Math.floor((r.neta * 1000) / r.ventasNetas) / 10 : 0;
    return '<dl class="pyl">'
      + fila('Ventas netas', r.ventasNetas, r.ventas + (r.ventas === 1 ? ' venta, con descuentos y devoluciones' : ' ventas, con descuentos y devoluciones'))
      + fila('Costo de lo vendido', -r.costo, 'costo congelado de cada artículo (producto + courier)')
      + fila('Ganancia bruta', r.bruta, '', 'pyl-sub')
      + cats.map((k) => fila(esc(k), -r.porCategoria[k])).join('')
      + (r.fletes ? fila('Fletes que pagó la tienda', -r.fletes, 'se suman solos desde Envíos') : '')
      + (r.comision ? fila('Comisión de la vendedora', -r.comision, 'estimada, sobre lo cobrado') : '')
      + (r.beneficios ? fila('Puntos canjeados', -r.beneficios, 'beneficios de clientas frecuentes') : '')
      + fila('Ganancia neta', r.neta, r.ventasNetas ? 'queda el ' + String(pct).replace('.', ',') + ' % de lo vendido' : '', 'pyl-total' + (r.neta < 0 ? ' pyl-neg' : ''))
      + '</dl>';
  };

  /* ── Gastos ──────────────────────────────────────────────────────────── */

  BG.gastoUI = async () => {
    const st = { fecha: BG.hoy(), categoria: BG.CATEGORIAS_GASTO[0], concepto: '', monto: 0, forma: 'transferencia' };
    const r = await BG.modal({
      titulo: 'Cargar un gasto',
      cuerpo: '<div class="fields">'
        + '<div class="field"><label for="g-fecha">Fecha</label><input id="g-fecha" class="input input-date" type="date" value="' + st.fecha + '" max="' + BG.hoy() + '"></div>'
        + '<div class="field"><label for="g-cat">Categoría</label><select id="g-cat" class="select">' + BG.CATEGORIAS_GASTO.map((c) => '<option>' + esc(c) + '</option>').join('') + '</select></div>'
        + '<div class="field span-2"><label for="g-conc">Detalle</label><input id="g-conc" class="input" maxlength="80" autocomplete="off" placeholder="Ej.: alquiler de octubre"></div>'
        + '<div class="field span-2"><label for="g-monto">Monto</label>' + BG.campoGs('g-monto', '', 'placeholder="0"') + '</div></div>'
        + '<div class="field"><span class="field-label" id="g-forma-l">Cómo se pagó</span><div class="seg" role="radiogroup" aria-labelledby="g-forma-l">'
        + Object.keys(BG.FORMAS_GASTO).map((k) => '<label><input type="radio" name="g-forma" value="' + k + '"' + (k === st.forma ? ' checked' : '') + '>' + esc(BG.FORMAS_GASTO[k]) + '</label>').join('') + '</div>'
        + '<span class="hint">«Efectivo de la caja» baja el efectivo que tiene que haber en el cierre de ese día.</span></div>'
        + '<p class="error-text" id="g-error" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar gasto', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        st.fecha = $('#g-fecha', dlg).value || BG.hoy();
        st.categoria = $('#g-cat', dlg).value;
        st.concepto = $('#g-conc', dlg).value;
        st.monto = BG.leerGs($('#g-monto', dlg));
        st.forma = $('input[name="g-forma"]:checked', dlg).value;
        const er = $('#g-error', dlg);
        const falla = (m) => { er.textContent = m; er.hidden = false; return false; };
        if (!(st.monto > 0)) return falla('Escribí el monto.');
        if (st.fecha > BG.hoy()) return falla('La fecha no puede ser futura.');
        return true;
      },
      onMount: (dlg) => $('#g-conc', dlg).focus(),
    });
    if (r !== 'ok') return false;
    if (st.forma === 'caja' && BG.cajaCerrada(st.fecha) && !(await BG.pedirPin('La caja del ' + BG.fmtFecha(st.fecha) + ' ya está cerrada y el gasto sale de esa caja.'))) return false;
    BG.guardarGasto(st);
    BG.toast('Gasto guardado: ' + gs(st.monto) + '.');
    return true;
  };

  BG.vistas.gastos = (args, params) => {
    const e = { periodo: params.get('periodo') || 'mes' };
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Gastos y ganancia neta</h1>'
      + '<p class="page-sub">Lo que cuesta mantener el local y cuánto queda de verdad después de pagar todo.</p></div>'
      + '<div class="page-actions"><button type="button" class="btn btn-primary" data-accion="gasto">' + icon('plus') + 'Cargar gasto</button></div></div>'
      + '<div class="chips" role="group" aria-label="Período">' + [['mes', 'Este mes'], ['anterior', 'Mes anterior'], ['30', 'Últimos 30 días']]
        .map(([k, t]) => '<button type="button" class="chip" data-periodo="' + k + '" aria-pressed="' + (e.periodo === k) + '">' + t + '</button>').join('') + '</div>'
      + '<div id="g-cuerpo" class="stack"></div></div>';
    let root = null;
    const pintar = () => {
      const [desde, hasta] = rangoDe(e.periodo);
      const r = BG.resultado(desde, hasta);
      const todos = (BG.db.gastos || []).filter((g) => g.fecha >= desde && g.fecha <= hasta).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ts.localeCompare(a.ts));
      const anulados = todos.filter((g) => g.anulado).length;
      const lista = BG.sinAnulados(todos, (g) => !!g.anulado);
      const barras = Object.keys(r.porCategoria).map((k) => ({ t: k, v: r.porCategoria[k] }))
        .concat(r.fletes ? [{ t: 'Fletes (Envíos)', v: r.fletes }] : []).concat(r.comision ? [{ t: 'Comisión', v: r.comision }] : []).concat(r.beneficios ? [{ t: 'Puntos canjeados', v: r.beneficios }] : [])
        .sort((a, b) => b.v - a.v);
      const max = Math.max(1, ...barras.map((x) => x.v));
      $('#g-cuerpo', root).innerHTML = '<p class="small muted">Del ' + BG.fmtFecha(desde) + ' al ' + BG.fmtFecha(hasta) + '</p>'
        + '<div class="tiles tiles-compact">' + tile('Ganancia bruta', gs(r.bruta), 'ventas − costo congelado') + tile('Gastos', gs(r.totalGastos), 'cargados y automáticos')
        + tile('Ganancia neta', gs(r.neta), r.neta >= 0 ? 'lo que queda de verdad' : 'el período dio pérdida', r.neta >= 0 ? 'tile-good' : 'tile-bad') + '</div>'
        + '<div class="grid-2 grid-charts"><section class="card stack"><div class="card-head"><h2>Cómo se llega a la ganancia neta</h2></div>' + BG.htmlResultado(r) + '</section>'
        + '<section class="card stack"><div class="card-head"><h2>En qué se va la plata</h2></div>'
        + (barras.length ? '<ul class="hbars">' + barras.map((x) => '<li class="hbar"><span class="hbar-label">' + esc(x.t) + '</span><span class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:' + Math.max(1.5, (x.v / max) * 100).toFixed(1) + '%"></span></span><span class="hbar-value">' + gs(x.v) + '</span></li>').join('') + '</ul>'
          : '<p class="empty">Sin gastos en el período.</p>')
        + '<p class="hint">El courier de la importación ya está dentro del costo de cada producto. Los fletes de Envíos que pagó la tienda, la comisión y los puntos canjeados se suman solos.</p></section></div>'
        + '<section class="card card-flush"><div class="card-head pad"><h2>Gastos cargados</h2><span class="small muted">' + lista.filter((g) => !g.anulado).length + ' · ' + gs(r.cargados) + '</span>'
        + BG.htmlVerAnulados(anulados, 'el gasto anulado', 'los ' + anulados + ' gastos anulados') + '</div>'
        + (lista.length ? '<ul class="list list-plain">' + lista.map((g) => '<li class="list-row"><span class="avatar">' + icon('gasto', 'i-sm') + '</span>'
          + '<span class="row-main"><span class="row-title' + (g.anulado ? ' strike' : '') + '">' + esc(g.concepto) + '</span><span class="row-sub">' + BG.fmtFecha(g.fecha) + ' · ' + esc(g.categoria) + ' · ' + esc(BG.FORMAS_GASTO[g.forma])
          + (g.anulado ? ' · anulado: ' + esc(g.anulado.motivo) : '') + '</span></span>'
          + '<span class="row-end"><span class="amount' + (g.anulado ? ' strike' : '') + '">' + gs(g.monto) + '</span>'
          + (g.anulado ? '' : '<button type="button" class="btn btn-sm btn-quiet" data-anular="' + g.id + '">Anular</button>') + '</span></li>').join('') + '</ul>'
          : '<p class="empty">Todavía no cargaste gastos en este período.</p>')
        + '</section>';
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        pintar();
        BG.engancharAnulados(root, pintar);
        root.addEventListener('click', async (ev) => {
          const p = ev.target.closest('[data-periodo]');
          if (p) { e.periodo = p.dataset.periodo; $$('[data-periodo]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === p))); pintar(); return; }
          try {
            if (ev.target.closest('[data-accion="gasto"]') && (await BG.gastoUI())) pintar();
            const a = ev.target.closest('[data-anular]');
            if (a) {
              const g = BG.db.gastos.find((x) => x.id === a.dataset.anular);
              if (g.forma === 'caja' && BG.cajaCerrada(g.fecha) && !(await BG.pedirPin('La caja del ' + BG.fmtFecha(g.fecha) + ' ya está cerrada.'))) return;
              const m = await BG.pedirMotivoAnulacion('gasto', 'Anular el gasto',
                '<p><strong>' + esc(g.concepto) + '</strong> · ' + gs(g.monto) + ' del ' + BG.fmtFecha(g.fecha) + '. ¿Por qué se anula?</p>', 'Anular gasto',
                () => '<div class="callout callout-warn efecto">' + icon('info') + '<div><strong>Al anular:</strong><ul class="efecto-lista">'
                  + '<li>El gasto deja de restar en la ganancia neta' + (g.forma === 'caja' ? ' y los ' + gs(g.monto) + ' vuelven al efectivo esperado en la caja de ese día' : '') + '.</li>'
                  + '<li>Queda en el historial tachado, con fecha, motivo y usuario.</li></ul></div></div>');
              if (m) { BG.anularGasto(g.id, m.texto, m.tipo); BG.toast('Gasto anulado.'); pintar(); }
            }
          } catch (err) { BG.toast(err.message, 'error'); }
        });
      },
    };
  };

  /* ── Conteo de inventario ────────────────────────────────────────────── */

  BG.vistas.conteo = () => {
    const e = { q: '', cat: 'todas', soloDif: false, agotados: false };
    const cuenta = {};
    const html = '<div class="page">'
      + '<a class="back-link" href="#/productos">' + icon('left', 'i-sm') + 'Productos</a>'
      + '<div class="page-head"><div><h1 class="page-title">Conteo de inventario</h1><p class="page-sub">Contá lo que hay en el local y escribilo: el sistema lo compara con lo que debería haber y anota las diferencias. Se puede contar por partes (una categoría por vez).</p></div></div>'
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-conteo">Buscar producto</label>' + icon('search') + '<input id="q-conteo" class="search-input" type="search" autocomplete="off" placeholder="Buscar producto"></div>'
      + '<div class="chips" role="group" aria-label="Filtrar">' + [['todas', 'Todo'], ['Prenda', 'Prendas'], ['Accesorio', 'Accesorios']].map(([k, t]) => '<button type="button" class="chip" data-cat="' + k + '" aria-pressed="' + (e.cat === k) + '">' + t + '</button>').join('')
      + '<button type="button" class="chip" data-toggle="soloDif" aria-pressed="false">Solo con diferencia</button><button type="button" class="chip" data-toggle="agotados" aria-pressed="false">Incluir agotados</button></div></div>'
      + '<div class="grid-form grid-form-wide"><section class="card card-flush"><ul class="list list-plain conteo" id="conteo-lista"></ul></section>'
      + '<section class="card stack sticky-col" aria-live="polite"><h2 class="card-title">Resumen del conteo</h2><div id="conteo-res"></div>'
      + '<div class="field"><label for="conteo-nota">Nota</label><input id="conteo-nota" class="input" maxlength="100" autocomplete="off" placeholder="Ej.: conteo de accesorios"></div>'
      + '<p class="error-text" id="conteo-err" role="alert" hidden></p>'
      + '<button type="button" class="btn btn-primary btn-lg btn-block" data-accion="guardar">' + icon('check') + 'Guardar conteo</button></section></div>'
      + '<section class="card stack"><div class="card-head"><h2>Conteos anteriores</h2></div><div id="conteo-hist"></div></section></div>';
    let root = null;
    const productos = () => BG.db.productos.filter((p) => (e.agotados || BG.disponibles(p) > 0) && (e.cat === 'todas' || p.categoria === e.cat)
      && (!e.q.trim() || BG.norm(p.descripcion + ' ' + p.codigo).includes(BG.norm(e.q.trim()))));
    const dif = (p) => { const c = cuenta[p.id]; return c && c.contado !== '' ? Number(c.contado) - BG.disponibles(p) : null; };
    const pill = (d) => (d == null ? '' : d === 0 ? '<span class="pill pill-good">' + icon('check') + 'Coincide</span>' : d < 0 ? '<span class="pill pill-bad">Faltan ' + (-d) + '</span>' : '<span class="pill pill-warn">Sobran ' + d + '</span>');
    const fila = (p) => {
      const c = cuenta[p.id] || { contado: '', motivo: '' };
      const d = dif(p);
      return '<li class="conteo-fila" data-pid="' + p.id + '"><div class="grow"><div class="row-title">' + esc(p.descripcion) + '</div><div class="row-sub">' + esc(p.codigo) + ' · ' + esc(p.categoria) + ' · según el sistema: <strong>' + BG.disponibles(p) + '</strong></div>'
        + (d ? '<select class="select conteo-motivo" data-motivo="' + p.id + '" aria-label="Motivo de la diferencia de ' + esc(p.descripcion) + '"><option value="">Motivo de la diferencia…</option>'
          + BG.MOTIVOS_CONTEO.map((m) => '<option' + (c.motivo === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>' : '') + '</div>'
        + '<div class="conteo-fin"><label class="sr-only" for="ct-' + p.id + '">Contado de ' + esc(p.descripcion) + '</label><input id="ct-' + p.id + '" class="input num-input conteo-input" inputmode="numeric" autocomplete="off" placeholder="—" value="' + esc(c.contado) + '" data-contado="' + p.id + '">'
        + '<span id="cp-' + p.id + '">' + pill(d) + '</span></div></li>';
    };
    const pintarLista = () => {
      let lista = productos();
      if (e.soloDif) lista = lista.filter((p) => dif(p));
      $('#conteo-lista', root).innerHTML = lista.length ? lista.map(fila).join('') : '<li class="empty">Nada para mostrar con ese filtro.</li>';
    };
    const pintarResumen = () => {
      const contados = Object.keys(cuenta).filter((k) => cuenta[k].contado !== '');
      const difs = contados.map((k) => ({ p: BG.producto(k), d: Number(cuenta[k].contado) - BG.disponibles(BG.producto(k)) })).filter((x) => x.d);
      const falt = sum(difs.filter((x) => x.d < 0), (x) => -x.d * (x.p.costoTotalGs || 0));
      const sobr = sum(difs.filter((x) => x.d > 0), (x) => x.d * (x.p.costoTotalGs || 0));
      $('#conteo-res', root).innerHTML = '<dl class="summary"><dt>Productos contados</dt><dd>' + contados.length + '</dd><dt>Con diferencia</dt><dd>' + difs.length + '</dd>'
        + '<div class="sep"></div><dt>Faltante al costo</dt><dd class="' + (falt ? 'due' : '') + '">' + gs(falt) + '</dd><dt>Sobrante al costo</dt><dd>' + gs(sobr) + '</dd></dl>'
        + '<p class="hint">Solo se guardan los productos con un número escrito. Las diferencias corrigen el stock con su motivo; las ventas no se tocan.</p>';
    };
    const pintarHist = () => {
      const cs = (BG.db.conteos || []).slice().sort((a, b) => b.ts.localeCompare(a.ts));
      $('#conteo-hist', root).innerHTML = cs.length ? '<ul class="lines">' + cs.map((c) => {
        const aj = (BG.db.ajustesStock || []).filter((a) => a.conteoId === c.id);
        return '<li class="line"><div class="row-title">' + BG.fmtFecha(c.fecha) + ' · ' + c.contados + ' productos contados · ' + (c.diferencias ? c.diferencias + ' con diferencia' : 'sin diferencias') + '</div>'
          + '<div class="row-sub">por ' + esc(c.usuario) + (c.nota ? ' · ' + esc(c.nota) : '') + (c.faltanteGs ? ' · faltante ' + gs(c.faltanteGs) + ' al costo' : '') + '</div>'
          + (aj.length ? '<ul class="bullets">' + aj.map((a) => '<li>' + esc(a.descripcion) + ': sistema ' + a.sistema + ', contado ' + a.contado + ' (' + (a.diferencia > 0 ? '+' : '') + a.diferencia + ') · ' + esc(a.motivo) + '</li>').join('') + '</ul>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="empty">Todavía no se hizo ningún conteo.</p>';
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        pintarLista();
        pintarResumen();
        pintarHist();
        $('#q-conteo', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintarLista(); });
        root.addEventListener('input', (ev) => {
          const t = ev.target;
          if (!t.dataset.contado) return;
          const pid = t.dataset.contado;
          const limpio = t.value.replace(/\D/g, '');
          if (limpio !== t.value) t.value = limpio;
          cuenta[pid] = Object.assign(cuenta[pid] || { motivo: '' }, { contado: limpio });
          const p = BG.producto(pid);
          const li = t.closest('.conteo-fila');
          const d = dif(p);
          $('#cp-' + pid, root).innerHTML = pill(d);
          // El selector de motivo aparece o desaparece sin rehacer la lista (así no se pierde el foco del número).
          const sel = li.querySelector('.conteo-motivo');
          if (d && !sel) li.querySelector('.grow').insertAdjacentHTML('beforeend', '<select class="select conteo-motivo" data-motivo="' + pid + '" aria-label="Motivo de la diferencia de ' + esc(p.descripcion) + '"><option value="">Motivo de la diferencia…</option>' + BG.MOTIVOS_CONTEO.map((m) => '<option>' + esc(m) + '</option>').join('') + '</select>');
          if (!d && sel) { sel.remove(); cuenta[pid].motivo = ''; }
          pintarResumen();
        });
        root.addEventListener('change', (ev) => {
          const t = ev.target;
          if (t.dataset.motivo) cuenta[t.dataset.motivo] = Object.assign(cuenta[t.dataset.motivo] || { contado: '' }, { motivo: t.value });
        });
        root.addEventListener('click', async (ev) => {
          const c = ev.target.closest('[data-cat]');
          if (c) { e.cat = c.dataset.cat; $$('[data-cat]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === c))); pintarLista(); return; }
          const tg = ev.target.closest('[data-toggle]');
          if (tg) { e[tg.dataset.toggle] = !e[tg.dataset.toggle]; tg.setAttribute('aria-pressed', String(e[tg.dataset.toggle])); pintarLista(); return; }
          if (!ev.target.closest('[data-accion="guardar"]')) return;
          const err = $('#conteo-err', root);
          err.hidden = true;
          const items = Object.keys(cuenta).filter((k) => cuenta[k].contado !== '').map((k) => ({ productoId: k, contado: cuenta[k].contado, motivo: cuenta[k].motivo }));
          const sinMotivo = items.find((x) => Number(x.contado) !== BG.disponibles(BG.producto(x.productoId)) && !x.motivo);
          if (!items.length) { err.textContent = 'Escribí cuántas unidades contaste de al menos un producto.'; err.hidden = false; return; }
          if (sinMotivo) { err.textContent = 'Elegí el motivo de la diferencia de «' + BG.producto(sinMotivo.productoId).descripcion + '».'; err.hidden = false; return; }
          const difs = items.filter((x) => Number(x.contado) !== BG.disponibles(BG.producto(x.productoId)));
          const ok = await BG.modal({
            titulo: 'Guardar el conteo',
            cuerpo: '<p>' + items.length + (items.length === 1 ? ' producto contado' : ' productos contados') + ', ' + (difs.length ? difs.length + ' con diferencia: el stock se corrige con el motivo elegido.' : 'todos coinciden con el sistema.') + '</p>',
            acciones: [{ texto: 'Revisar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar conteo', valor: 'ok', clase: 'btn-primary' }],
          });
          if (ok !== 'ok') return;
          try {
            const res = BG.registrarConteo({ items: items, nota: $('#conteo-nota', root).value });
            BG.toast('Conteo guardado: ' + res.contados + ' productos, ' + (res.diferencias ? res.diferencias + ' con diferencia.' : 'sin diferencias.'));
            BG.render();
          } catch (er) { err.textContent = er.message; err.hidden = false; }
        });
      },
    };
  };

  /* ── Pedidos al proveedor ────────────────────────────────────────────── */

  const tarjetaPedido = (p) => {
    const est = BG.estadoPedido(p);
    const n = p.items ? p.items.length : (p.productos || []).length;
    const usd = p.items ? BG.totalUSDPedido(p.items) : null;
    const llega = est === 'en_camino' && p.llegaEstimada ? BG.diasEntre(BG.hoy(), p.llegaEstimada) : null;
    return '<li><a class="list-row" href="#/pedidos/' + p.id + '"><span class="avatar">' + icon('box2', 'i-sm') + '</span>'
      + '<span class="row-main"><span class="row-title">' + esc(p.proveedor) + '</span>'
      + '<span class="row-sub">' + (est === 'recibido' ? 'Llegó el ' + BG.fmtFecha(p.fecha) : 'Pedido el ' + BG.fmtFecha(p.fechaPedido)) + ' · ' + n + (n === 1 ? ' artículo' : ' artículos') + (usd ? ' · ' + C.fmtUSD(usd) : '')
      + (llega != null ? ' · ' + (llega > 0 ? 'llega en ' + llega + (llega === 1 ? ' día' : ' días') : llega === 0 ? 'llega hoy' : 'tendría que haber llegado hace ' + (-llega) + (llega === -1 ? ' día' : ' días')) : '') + '</span></span>'
      + '<span class="row-end">' + BG.pillPedido(p) + '</span></a></li>';
  };

  BG.vistas.pedidos = () => {
    const todos = BG.db.pedidos.slice();
    const enCurso = todos.filter((p) => ['pedido', 'en_camino'].indexOf(BG.estadoPedido(p)) >= 0).sort((a, b) => (a.fechaPedido || '').localeCompare(b.fechaPedido || ''));
    const llegaron = todos.filter((p) => BG.estadoPedido(p) === 'recibido').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const cancelados = todos.filter((p) => BG.estadoPedido(p) === 'cancelado');
    const enCamino = enCurso.filter((p) => BG.estadoPedido(p) === 'en_camino');
    const mes = BG.hoy().slice(0, 7);
    let usdCamino = C.Q(0n);
    enCamino.forEach((p) => { usdCamino = C.add(usdCamino, BG.totalUSDPedido(p.items)); });
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Pedidos al proveedor</h1><p class="page-sub">Del pedido a la llegada. Cuando llega, se carga al stock con los precios calculados.</p></div>'
      + '<div class="page-actions"><a class="btn btn-primary" href="#/pedidos/nuevo">' + icon('plus') + 'Nuevo pedido</a></div></div>'
      + '<section class="tiles tiles-compact">' + tile('En camino', String(enCamino.length), enCamino.length ? C.fmtUSD(usdCamino) + ' en mercadería' : 'nada viajando')
      + tile('Pedidos sin enviar', String(enCurso.length - enCamino.length), 'esperando que el proveedor despache')
      + tile('Llegaron este mes', String(llegaron.filter((p) => (p.fecha || '').slice(0, 7) === mes).length), 'ya cargados al stock') + '</section>'
      + '<section class="card card-flush"><div class="card-head pad"><h2>En curso</h2></div>' + (enCurso.length ? '<ul class="list list-plain">' + enCurso.map(tarjetaPedido).join('') + '</ul>' : '<p class="empty">No hay pedidos en curso.</p>') + '</section>'
      + '<section class="card card-flush"><div class="card-head pad"><h2>Llegaron</h2></div>' + (llegaron.length ? '<ul class="list list-plain">' + llegaron.map(tarjetaPedido).join('') + '</ul>' : '<p class="empty">Todavía no llegó ninguno.</p>') + '</section>'
      + (cancelados.length ? '<details class="table-toggle"><summary>Cancelados (' + cancelados.length + ')</summary><ul class="list list-top">' + cancelados.map(tarjetaPedido).join('') + '</ul></details>' : '')
      + '</div>';
    return { html: html };
  };

  BG.enCaminoUI = async (p) => {
    const st = { courier: p.courier || 'Courier Miami–Asunción', guia: p.guia || '', llegaEstimada: p.llegaEstimada || BG.sumarDias(BG.hoy(), 7) };
    const r = await BG.modal({
      titulo: 'El pedido está en camino',
      cuerpo: '<div class="fields"><div class="field span-2"><label for="ec-courier">Courier</label><input id="ec-courier" class="input" autocomplete="off" value="' + esc(st.courier) + '"></div>'
        + '<div class="field"><label for="ec-guia">Número de guía</label><input id="ec-guia" class="input" autocomplete="off" value="' + esc(st.guia) + '" placeholder="Ej.: MIA-778120"></div>'
        + '<div class="field"><label for="ec-llega">Llegada estimada</label><input id="ec-llega" class="input input-date" type="date" value="' + st.llegaEstimada + '"></div></div>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => { st.courier = $('#ec-courier', dlg).value; st.guia = $('#ec-guia', dlg).value; st.llegaEstimada = $('#ec-llega', dlg).value; return true; },
      onMount: (dlg) => $('#ec-guia', dlg).focus(),
    });
    if (r !== 'ok') return false;
    BG.cambiarEstadoPedido(p.id, 'en_camino', st);
    BG.toast('Pedido en camino' + (st.llegaEstimada ? ': llega el ' + BG.fmtFecha(st.llegaEstimada) : '') + '.');
    return true;
  };

  BG.vistas.pedidoDetalle = (args) => {
    const p = BG.db.pedidos.find((x) => x.id === args[0]);
    if (!p) return { html: '<div class="page"><p class="empty">No encontramos ese pedido. <a href="#/pedidos">Ver pedidos</a></p></div>' };
    const est = BG.estadoPedido(p);
    const hist = p.historial || [];
    const cuando = (e) => { const h = hist.filter((x) => x.estado === e).slice(-1)[0]; return h ? BG.fmtFecha(h.ts.slice(0, 10)) : ''; };
    const orden = ['pedido', 'en_camino', 'recibido'];
    const idx = orden.indexOf(est);
    const paso = (e, nombre, detalle) => { const i = orden.indexOf(e); const cls = est === 'cancelado' ? '' : i < idx || (i === idx && e === 'recibido') ? ' is-done' : i === idx ? ' is-now' : '';
      return '<div class="track' + cls + '"><span class="track-dot"></span><span class="track-name">' + nombre + '</span><span class="track-when">' + (detalle || '—') + '</span></div>'; };
    const productos = (p.productos || []).map((id) => BG.producto(id)).filter(Boolean);
    const usd = p.items ? BG.totalUSDPedido(p.items) : null;
    const html = '<div class="page">'
      + '<a class="back-link" href="#/pedidos">' + icon('left', 'i-sm') + 'Pedidos</a>'
      + '<div class="page-head"><div><h1 class="page-title">Pedido a ' + esc(p.proveedor) + '</h1><p class="page-sub">' + BG.pillPedido(p) + (usd ? ' · ' + C.fmtUSD(usd) + ' en mercadería' : '') + '</p></div>'
      + '<div class="page-actions">'
      + (est === 'pedido' ? '<button type="button" class="btn btn-primary" data-accion="camino">' + icon('truck') + 'Marcar en camino</button><a class="btn" href="#/pedidos/' + p.id + '/editar">' + icon('edit') + 'Editar</a>' : '')
      + (est === 'en_camino' ? '<a class="btn btn-primary" href="#/productos/pedido?desde=' + p.id + '">' + icon('check') + 'Llegó: cargar al stock</a><button type="button" class="btn" data-accion="camino">' + icon('edit') + 'Datos del envío</button>' : '')
      + (est === 'pedido' || est === 'en_camino' ? '<button type="button" class="btn btn-danger" data-accion="cancelar">' + icon('ban') + 'Cancelar pedido</button>' : '')
      + '</div></div>'
      + '<div class="steps-track steps-3">' + paso('pedido', 'Pedido', cuando('pedido') || BG.fmtFecha(p.fechaPedido))
      + paso('en_camino', 'En camino', est === 'en_camino' || est === 'recibido' ? [cuando('en_camino'), p.guia ? 'guía ' + esc(p.guia) : '', est === 'en_camino' && p.llegaEstimada ? 'llega el ' + BG.fmtFecha(p.llegaEstimada) : ''].filter(Boolean).join(' · ') : '')
      + paso('recibido', 'Llegó', est === 'recibido' ? BG.fmtFecha(p.fecha) : '') + '</div>'
      + (est === 'cancelado' ? '<div class="callout callout-bad">' + icon('ban') + '<div><strong>Pedido cancelado.</strong> ' + esc((hist.slice(-1)[0] || {}).nota || '') + '</div></div>' : '')
      + (p.nota ? '<div class="callout">' + icon('info') + '<div>' + esc(p.nota) + '</div></div>' : '')
      + (p.items ? '<section class="card"><div class="card-head"><h2>Artículos pedidos</h2><span class="small muted">costo del proveedor, sin courier</span></div>'
        + '<div class="table-wrap table-bare"><table class="table table-compact table-venta"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">US$ c/u</th><th class="num col-sm-hide">Peso</th><th class="num">Total</th></tr></thead><tbody>'
        + p.items.map((it) => { const q = C.parseNum(it.costo, 'decimal'); const n = C.parseEntero(it.cant) || 0;
          return '<tr><td><div class="t-title">' + esc(it.desc) + '</div><div class="t-sub">' + esc(it.cat) + (it.nota ? ' · ' + esc(it.nota) : '') + '</div></td><td class="num">' + n + '</td><td class="num">' + (q ? C.fmtUSD(q) : '—') + '</td>'
            + '<td class="num col-sm-hide">' + (it.peso ? esc(it.peso) + ' kg' : '—') + '</td><td class="num">' + (q ? C.fmtUSD(C.mul(q, C.Q(BigInt(n)))) : '—') + '</td></tr>'; }).join('')
        + '</tbody><tfoot><tr><td colspan="3">Total en mercadería</td><td class="col-sm-hide"></td><td class="num">' + C.fmtUSD(usd) + '</td></tr></tfoot></table></div></section>' : '')
      + (productos.length ? '<section class="card card-flush"><div class="card-head pad"><h2>Cargado al stock</h2><span class="small muted">' + productos.length + ' productos</span></div><ul class="list list-plain">'
        + productos.map((x) => '<li><a class="list-row" href="#/productos?ver=' + x.id + '"><span class="avatar">' + icon('tag', 'i-sm') + '</span><span class="row-main"><span class="row-title">' + esc(x.descripcion) + '</span>'
          + '<span class="row-sub">' + esc(x.codigo) + ' · ' + x.cantidad + ' u · quedan ' + BG.disponibles(x) + '</span></span><span class="row-end"><span class="amount">' + (x.precioVenta ? gs(x.precioVenta) : 'Sin precio') + '</span></span></a></li>').join('')
        + '</ul></section>' : '')
      + (hist.length ? '<section class="card stack"><div class="card-head"><h2>Historial</h2></div><ul class="lines">' + hist.slice().reverse().map((h) => '<li class="line"><div class="row-title">' + BG.ESTADOS_PEDIDO[h.estado] + '</div>'
        + '<div class="row-sub">' + BG.fmtFecha(h.ts.slice(0, 10)) + ' ' + BG.fmtHora(h.ts) + ' · ' + esc(h.usuario) + (h.nota ? ' · ' + esc(h.nota) : '') + '</div></li>').join('') + '</ul></section>' : '')
      + '</div>';
    return {
      html: html,
      mount: (root) => {
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          try {
            if (b.dataset.accion === 'camino' && (await BG.enCaminoUI(p))) BG.render();
            if (b.dataset.accion === 'cancelar') {
              const motivo = await pedirTexto('Cancelar el pedido', '<p>El pedido no se borra: queda como cancelado, con el motivo.</p>', 'Motivo', 'Cancelar pedido', true);
              if (motivo) { BG.cambiarEstadoPedido(p.id, 'cancelado', { nota: motivo }); BG.toast('Pedido cancelado.'); BG.render(); }
            }
          } catch (err) { BG.toast(err.message, 'error'); }
        });
      },
    };
  };

  BG.vistas.pedidoForm = (args) => {
    const p = args[0] ? BG.db.pedidos.find((x) => x.id === args[0]) : null;
    const s = p ? { proveedor: p.proveedor, fechaPedido: p.fechaPedido, nota: p.nota || '', items: p.items.map((x) => Object.assign({}, x)) }
      : { proveedor: '', fechaPedido: BG.hoy(), nota: '', items: [{ desc: '', cat: 'Prenda', cant: '1', costo: '', peso: '', nota: '' }] };
    const proveedores = Array.from(new Set(BG.db.pedidos.map((x) => x.proveedor).concat(BG.db.productos.map((x) => x.proveedor)).filter(Boolean)));
    const html = '<div class="page">'
      + '<a class="back-link" href="' + (p ? '#/pedidos/' + p.id : '#/pedidos') + '">' + icon('left', 'i-sm') + (p ? 'Pedido' : 'Pedidos') + '</a>'
      + '<div class="page-head"><div><h1 class="page-title">' + (p ? 'Editar pedido' : 'Nuevo pedido al proveedor') + '</h1><p class="page-sub">Lo que le encargaste al proveedor. Los pesos pueden ser aproximados: al llegar se corrigen antes de cargar al stock.</p></div></div>'
      + '<section class="card stack"><div class="fields">'
      + '<div class="field"><label for="pf-prov">Proveedor</label><input id="pf-prov" class="input" list="pf-provs" autocomplete="off" value="' + esc(s.proveedor) + '" placeholder="Ej.: Outlet Miami, EE. UU."><datalist id="pf-provs">' + proveedores.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></div>'
      + '<div class="field"><label for="pf-fecha">Fecha del pedido</label><input id="pf-fecha" class="input input-date" type="date" value="' + s.fechaPedido + '" max="' + BG.hoy() + '"></div></div>'
      + '<div class="table-wrap"><table class="table table-compact table-edit table-tarjetas"><thead><tr><th>Artículo</th><th>Categoría</th><th class="num">Cant.</th><th class="num">Costo US$</th><th class="num">Peso kg</th><th>Nota</th><th><span class="sr-only">Quitar</span></th></tr></thead><tbody id="pf-filas"></tbody></table></div>'
      + '<button type="button" class="btn-link" data-accion="agregar">' + icon('plus', 'i-sm') + 'Agregar artículo</button>'
      + '<div class="field"><label for="pf-nota">Nota</label><input id="pf-nota" class="input" maxlength="120" autocomplete="off" value="' + esc(s.nota) + '" placeholder="Ej.: llegan juntos en una caja"></div>'
      + '<p class="summary-line" id="pf-total"></p><p class="error-text" id="pf-err" role="alert" hidden></p>'
      + '<div class="form-actions"><a class="btn btn-quiet" href="' + (p ? '#/pedidos/' + p.id : '#/pedidos') + '">Cancelar</a><button type="button" class="btn btn-primary" data-accion="guardar">' + icon('check') + (p ? 'Guardar cambios' : 'Guardar pedido') + '</button></div></section></div>';
    let root = null;
    const fila = (it, i) => '<tr data-i="' + i + '"><td class="te-desc"><input class="input" data-k="desc" value="' + esc(it.desc) + '" autocomplete="off" aria-label="Artículo, fila ' + (i + 1) + '" placeholder="Descripción"></td>'
      + '<td data-label="Categoría"><select class="select" data-k="cat" aria-label="Categoría, fila ' + (i + 1) + '">' + ['Prenda', 'Accesorio'].map((c) => '<option' + (it.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></td>'
      + '<td data-label="Cantidad"><input class="input num-input w-xs" data-k="cant" inputmode="numeric" value="' + esc(it.cant) + '" aria-label="Cantidad, fila ' + (i + 1) + '"></td>'
      + '<td data-label="Costo US$"><input class="input num-input w-sm" data-k="costo" inputmode="decimal" data-dec="2" value="' + esc(it.costo) + '" aria-label="Costo en US$, fila ' + (i + 1) + '"></td>'
      + '<td data-label="Peso kg"><input class="input num-input w-sm" data-k="peso" inputmode="decimal" data-dec="3" value="' + esc(it.peso) + '" aria-label="Peso en kg, fila ' + (i + 1) + '"></td>'
      + '<td data-label="Nota" class="te-nota"><input class="input" data-k="nota" value="' + esc(it.nota || '') + '" autocomplete="off" aria-label="Nota, fila ' + (i + 1) + '" placeholder="Opcional"></td>'
      + '<td class="te-quitar"><button type="button" class="btn-icon" data-accion="quitar" data-i="' + i + '" aria-label="Quitar fila ' + (i + 1) + '">' + icon('x') + '</button></td></tr>';
    const pintarFilas = () => { $('#pf-filas', root).innerHTML = s.items.map(fila).join(''); BG.enlazarCampos($('#pf-filas', root)); };
    const pintarTotal = () => { const n = s.items.filter((x) => x.desc.trim()).length; $('#pf-total', root).textContent = n + (n === 1 ? ' artículo' : ' artículos') + ' · ' + C.fmtUSD(BG.totalUSDPedido(s.items)) + ' en mercadería'; };
    return {
      html: html,
      mount: (r) => {
        root = r;
        pintarFilas();
        pintarTotal();
        root.addEventListener('input', (ev) => { const t = ev.target; if (t.dataset.k) { s.items[Number(t.closest('tr').dataset.i)][t.dataset.k] = t.value; pintarTotal(); } });
        root.addEventListener('change', (ev) => { const t = ev.target; if (t.dataset.k) { s.items[Number(t.closest('tr').dataset.i)][t.dataset.k] = t.value; pintarTotal(); } });
        root.addEventListener('focusout', (ev) => { const t = ev.target; if (t.dataset && t.dataset.dec && t.closest('tr')) { s.items[Number(t.closest('tr').dataset.i)][t.dataset.k] = t.value; pintarTotal(); } });
        root.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          if (b.dataset.accion === 'agregar') { s.items.push({ desc: '', cat: 'Accesorio', cant: '1', costo: '', peso: '', nota: '' }); pintarFilas(); const inps = $$('#pf-filas tr:last-child input', root); if (inps[0]) inps[0].focus(); }
          else if (b.dataset.accion === 'quitar') { s.items.splice(Number(b.dataset.i), 1); if (!s.items.length) s.items.push({ desc: '', cat: 'Prenda', cant: '1', costo: '', peso: '', nota: '' }); pintarFilas(); pintarTotal(); }
          else if (b.dataset.accion === 'guardar') {
            const err = $('#pf-err', root);
            try {
              const guardado = BG.guardarPedidoProveedor({ proveedor: $('#pf-prov', root).value, fechaPedido: $('#pf-fecha', root).value || BG.hoy(), nota: $('#pf-nota', root).value, items: s.items }, p ? p.id : null);
              BG.toast(p ? 'Pedido actualizado.' : 'Pedido guardado. Cuando el proveedor lo despache, marcalo «En camino».');
              BG.ir('#/pedidos/' + guardado.id);
            } catch (er) { err.textContent = er.message; err.hidden = false; }
          }
        });
      },
    };
  };
})();

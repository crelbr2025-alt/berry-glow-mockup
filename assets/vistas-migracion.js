/*!
 * berry.Glow_py — «Traer mis datos del Excel» (solo el dueño).
 * El archivo se lee en este navegador: no se sube a ningún lado. Primero se muestra lo que se encontró y lo que el
 * sistema corrige; recién al confirmar se arma una base aparte, se controla con los dos cuadres y se guarda.
 * Los datos de ejemplo no se tocan: la franja de arriba siempre dice cuáles se están viendo.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const { $, esc, gs, sum, icon } = BG;
  // Lo leído del archivo queda en memoria mientras se revisa; no se guarda nada hasta confirmar.
  let estado = null;

  const tile = (label, valor, sub) => '<div class="tile"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const lista = (arr, f, max) => arr.slice(0, max || 6).map(f).join(', ') + (arr.length > (max || 6) ? ' y ' + (arr.length - (max || 6)) + ' más' : '');

  /** Arma la base con las decisiones de ahora para mostrar números exactos. No guarda nada. */
  function vistaPrevia() {
    return window.BGMigracion.construir(estado.plan, estado.dec, { base: window.BGSeed.crear(BG.hoy()), ahora: BG.ahora(), archivo: estado.archivo });
  }

  function htmlProblemas(plan) {
    const p = plan.problemas;
    const li = (tipo, html) => '<li class="mx-item mx-' + tipo + '">' + icon(tipo === 'info' ? 'info' : 'alert') + '<span>' + html + '</span></li>';
    const out = [];
    if (p.totalesMal.length) {
      const deMas = sum(p.totalesMal, (x) => x.excel - x.real);
      out.push(li('bad', '<strong>En ' + plural(p.totalesMal.length, 'hoja', 'hojas') + ', el total de «Saldo» no resta lo que ya te pagaron</strong> ('
        + lista(p.totalesMal, (x) => '«' + esc(x.hoja.trim()) + '»', 8) + '). Sumadas, dicen que te deben ' + gs(deMas) + ' de más. El sistema calcula el saldo con los pagos de cada fila.'));
    }
    const notas = p.notas.filter((n) => /\d/.test(n.texto));
    out.push(li('warn', '<strong>Los costos no incluyen el envío:</strong> la columna del peso está vacía, así que el costo es solo el precio de SHEIN y la ganancia real es menor que la del Excel.'
      + (notas.length ? ' Tus notas de costos (' + lista(notas, (n) => '«' + esc(n.texto) + '»') + ') quedan escritas en su pedido.' : '')));
    out.push(li('warn', '«Ganancia USD» está calculada solo en las primeras filas de cada hoja: el sistema calcula la ganancia de todas las prendas.'));
    if (p.pagadoNoCoincide) out.push(li('warn', 'La casilla «Pagado» no coincide con el saldo en ' + plural(p.pagadoNoCoincide, 'fila', 'filas') + '. El sistema no la usa: sabe quién debe por lo que pagó.'));
    if (p.pagoDeMas.length) out.push(li('info', plural(p.pagoDeMas.length, 'fila tiene', 'filas tienen') + ' saldo negativo (pagaron de más): queda como <strong>saldo a favor</strong> de la clienta.'));
    if (p.sinNombre.length) out.push(li('info', plural(p.sinNombre.length, 'venta no tiene', 'ventas no tienen') + ' el nombre de la clienta (' + lista(p.sinNombre, (it) => esc(it.producto)) + '): quedan a nombre de «' + esc(window.BGMigracion.SIN_NOMBRE) + '».'));
    if (p.sinPrecio.length) out.push(li('warn', plural(p.sinPrecio.length, 'fila tiene', 'filas tienen') + ' nombre pero no precio vendido (' + lista(p.sinPrecio, (it) => esc(it.producto) + ', ' + esc(it.cliente)) + '): la prenda queda en stock para que la vendas desde el sistema.'));
    if (p.compartidas.length) out.push(li('info', 'Compras compartidas (' + lista(p.compartidas, (it) => '«' + esc(it.cliente) + '»') + '): quedan a nombre de la primera.'));
    if (p.bajoCosto.length) out.push(li('info', plural(p.bajoCosto.length, 'prenda se vendió', 'prendas se vendieron') + ' por debajo del costo (' + lista(p.bajoCosto, (it) => esc(it.producto)) + '). Se traen igual.'));
    if (p.sinCostoShein.length) out.push(li('info', plural(p.sinCostoShein.length, 'prenda no tiene', 'prendas no tienen') + ' precio de SHEIN (' + lista(p.sinCostoShein, (it) => esc(it.producto)) + '): queda sin costo.'));
    out.push(li('info', 'El Excel no tiene la fecha de cada venta ni de cada pago: se usa la fecha de la hoja (la podés corregir abajo). Tampoco tiene teléfonos ni CI: completalos después en cada clienta.'));
    if (p.ocultas.length) out.push(li('info', 'La hoja oculta ' + lista(p.ocultas, (n) => '«' + esc(n.trim()) + '»') + ' no se trae.'));
    return '<ul class="mx-lista">' + out.join('') + '</ul>';
  }

  function htmlHojas(plan, dec) {
    return '<ul class="list mx-hojas">' + plan.hojas.map((h) => {
      if (!h.reconocida) return '<li class="list-row"><span class="row-main"><span class="row-title">' + esc(h.nombre.trim()) + '</span><span class="row-sub">No tiene las columnas del plan de ventas: no se trae.</span></span></li>';
      const d = dec.hojas[h.indice];
      return '<li class="list-row mx-hoja' + (d.usar ? '' : ' is-off') + '">'
        + '<input type="checkbox" class="mx-check" data-mx-hoja="' + h.indice + '" aria-label="Traer la hoja ' + esc(h.nombre.trim()) + '"' + (d.usar ? ' checked' : '') + '>'
        + '<span class="row-main"><span class="row-title">' + esc(h.nombre.trim()) + (h.oculta ? ' <span class="pill pill-muted">oculta</span>' : '') + '</span>'
        + '<span class="row-sub">' + plural(h.resumen.articulos, 'prenda', 'prendas') + ' · ' + h.resumen.vendidos + ' vendidas · por cobrar ' + gs(h.resumen.saldo) + '</span>'
        + (h.totalMal ? '<span class="row-sub"><span class="pill pill-bad">' + icon('alert') + 'el Excel dice ' + gs(h.totalesExcel.saldo) + '</span></span>' : '') + '</span>'
        + '<span class="mx-fecha"><input type="date" class="input" data-mx-fecha="' + h.indice + '" value="' + esc(d.fecha) + '" max="' + BG.hoy() + '" aria-label="Fecha de la hoja ' + esc(h.nombre.trim()) + '"' + (d.usar ? '' : ' disabled') + '>'
        + (h.fechaTipo !== 'exacta' ? '<span class="tile-sub">' + (h.fechaTipo === 'mes' ? 'solo dice el mes' : 'estimada') + '</span>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }

  function htmlGrupos(plan, dec) {
    if (!plan.clientas.grupos.length) return '<p class="small muted">No hay nombres parecidos para revisar.</p>';
    const porK = new Map(plan.clientas.entidades.map((e) => [e.clave, e]));
    return plan.clientas.grupos.map((g) => {
      const d = dec.grupos[g.id];
      return '<div class="mx-grupo"><div class="field"><label for="mx-n-' + g.id + '">Nombre que queda</label><input class="input" id="mx-n-' + g.id + '" data-mx-nombre="' + g.id + '" value="' + esc(d.nombre) + '" autocomplete="off"></div>'
        + '<ul class="mx-variantes">' + g.claves.map((k) => {
          const e = porK.get(k);
          return '<li><label><input type="checkbox" data-mx-grupo="' + g.id + '" data-mx-clave="' + esc(k) + '"' + (d.claves[k] ? ' checked' : '') + '><span>'
            + e.formas.map(([t, n]) => '«' + esc(t) + '»' + (n > 1 ? ' ×' + n : '')).join(', ') + ' <span class="muted small">· ' + gs(e.vendido) + '</span></span></label></li>';
        }).join('') + '</ul></div>';
    }).join('');
  }

  function htmlRevision() {
    if (!estado) return '';
    const plan = estado.plan;
    let prev;
    try {
      prev = vistaPrevia();
    } catch (err) {
      return '<p class="callout callout-bad">' + icon('alert') + '<span>' + esc(err.message) + '</span></p>' + htmlHojasCard(plan);
    }
    const r = prev.resumen;
    const deben = prev.db.clientes.map((c) => {
      const vs = prev.db.ventas.filter((v) => v.clienteId === c.id);
      const pagado = sum(prev.db.pagos.filter((p) => p.clienteId === c.id), (p) => p.total);
      return { c: c, compras: vs.length, debe: sum(vs, (v) => v.total) - pagado };
    }).sort((a, b) => b.debe - a.debe || a.c.nombre.localeCompare(b.c.nombre, 'es'));
    return '<section class="card stack"><div class="card-head"><h2>Lo que hay en tu Excel</h2><span class="small muted mx-archivo">' + esc(estado.archivo) + '</span></div>'
      + '<div class="tiles">'
      + tile('Clientas', String(r.clientas), plural(r.ventas, 'compra', 'compras'))
      + tile('Vendido', gs(r.vendido), plural(r.hojas, 'hoja', 'hojas') + ' del Excel')
      + tile('Cobrado', gs(r.cobrado), plural(r.pagos, 'entrega', 'entregas'))
      + tile('Te deben', gs(r.porCobrar), r.aFavor ? gs(r.aFavor) + ' a favor de clientas' : 'según las filas')
      + tile('En stock', String(r.enStock), 'de ' + r.productos + ' prendas')
      + '</div>'
      + '<p class="callout callout-good">' + icon('check') + '<span>Control: lo que te deben menos lo que quedó a favor da ' + gs(r.porCobrar - r.aFavor) + ', igual que la suma de las filas del Excel (vendido − entregas).</span></p></section>'
      + '<section class="card stack"><div class="card-head"><h2>Lo que tu Excel tiene mal (y el sistema corrige)</h2></div>' + htmlProblemas(plan) + '</section>'
      + htmlHojasCard(plan)
      + '<section class="card stack"><div class="card-head"><h2>¿Son la misma persona?</h2></div>'
      + '<p class="hint">Son nombres escritos de distintas formas. Si alguno es de otra persona, destildalo y queda como clienta aparte. Podés corregir el nombre que queda.</p>'
      + htmlGrupos(plan, estado.dec) + '</section>'
      + '<section class="card stack"><details class="table-toggle"><summary>Ver las ' + r.clientas + ' clientas como van a quedar</summary>'
      + '<div class="table-wrap"><table class="table table-compact table-venta"><thead><tr><th>Clienta</th><th class="num">Compras</th><th class="num">Debe</th></tr></thead><tbody>'
      + deben.map((x) => '<tr><td>' + esc(x.c.nombre) + '</td><td class="num">' + x.compras + '</td><td class="num">' + (x.debe > 0 ? gs(x.debe) : x.debe < 0 ? gs(-x.debe) + ' a favor' : '—') + '</td></tr>').join('')
      + '</tbody></table></div></details></section>'
      + '<div class="form-actions mx-acciones"><button type="button" class="btn btn-primary" data-mx="importar">' + icon('upload') + 'Traer a mis datos</button>'
      + '<button type="button" class="btn btn-quiet" data-mx="cancelar">Cancelar</button></div>';
  }
  function htmlHojasCard(plan) {
    return '<section class="card stack"><div class="card-head"><h2>Hojas del Excel</h2><span class="small muted">cada hoja es un pedido de SHEIN</span></div>'
      + '<p class="hint">Destildá las que no quieras traer. La fecha es la de las ventas y pagos de esa hoja.</p>' + htmlHojas(plan, estado.dec) + '</section>';
  }

  BG.vistas.migracion = () => {
    const info = BG.infoMisDatos();
    const mios = BG.modoDatos === 'mios';
    const cuando = info && info.importado ? BG.fmtFecha(info.importado.slice(0, 10)) + ' a las ' + BG.fmtHora(info.importado) : '';
    const html = '<div class="page"><a class="back-link" href="#/ajustes">' + icon('left', 'i-sm') + 'Ajustes</a>'
      + '<div class="page-head"><div><h1 class="page-title">Traer mis datos del Excel</h1>'
      + '<p class="page-sub">Tus clientas, lo que compraron, lo que pagaron y lo que queda en stock, dentro del sistema.</p></div></div>'
      + '<section class="card stack">'
      + '<p class="callout">' + icon('lock') + '<span>El archivo se lee acá, en este navegador: <strong>no se sube a ningún lado</strong>. Tus datos quedan guardados aparte de los de ejemplo, y la franja de arriba siempre dice cuáles estás viendo.</span></p>'
      + (info ? '<p class="callout callout-warn">' + icon('alert') + '<span>Ya trajiste tus datos' + (info.archivo ? ' de «<span class="mx-archivo">' + esc(info.archivo) + '</span>»' : '') + (cuando ? ' el ' + cuando : '') + '. Si traés el Excel de nuevo, esos datos se reemplazan'
        + (mios ? ' (también lo que hayas cargado después en el sistema)' : '') + '.</span></p>' : '')
      + '<div class="field"><label for="mx-archivo">Elegí el Excel (.xlsx)</label><input id="mx-archivo" class="input" type="file" accept=".xlsx"></div>'
      + '<p class="error-text" id="mx-error" hidden></p>'
      + (estado ? '' : '<p class="hint">Es el que usabas para anotar los pedidos de SHEIN: una fila por prenda con el precio, a quién se la vendiste y las entregas.</p>')
      + '</section>'
      + '<div id="mx-revision" class="stack">' + htmlRevision() + '</div></div>';
    return {
      html: html,
      mount: (root) => {
        const pintar = () => {
          const host = $('#mx-revision', root);
          host.innerHTML = htmlRevision();
          BG.enlazarCampos(host);
        };
        const error = (msg) => { const e = $('#mx-error', root); e.textContent = msg || ''; e.hidden = !msg; };
        root.addEventListener('change', async (ev) => {
          const t = ev.target;
          if (t.id === 'mx-archivo') {
            const file = t.files && t.files[0];
            error('');
            if (!file) return;
            if (!/\.xlsx$/i.test(file.name)) { error('Elegí un archivo .xlsx (Excel).'); return; }
            try {
              const hojas = await window.BGImport.leerLibro(await file.arrayBuffer());
              const plan = window.BGMigracion.analizar(hojas, { hoy: BG.hoy() });
              if (!plan.hojas.some((h) => h.reconocida && h.items.length)) throw new Error('No encontré hojas con las columnas del plan de ventas (Producto, Precio SHEIN, precio vendido, Nombre, Entregas).');
              estado = { archivo: file.name, plan: plan, dec: window.BGMigracion.decisionesPorDefecto(plan) };
            } catch (err) {
              estado = null;
              error(err.message || 'No se pudo leer el Excel.');
            }
            pintar();
            return;
          }
          if (!estado) return;
          if (t.dataset.mxHoja != null) { estado.dec.hojas[t.dataset.mxHoja].usar = t.checked; pintar(); }
          else if (t.dataset.mxFecha != null) { if (t.value) estado.dec.hojas[t.dataset.mxFecha].fecha = t.value; pintar(); }
          else if (t.dataset.mxGrupo) { estado.dec.grupos[t.dataset.mxGrupo].claves[t.dataset.mxClave] = t.checked; pintar(); }
          else if (t.dataset.mxNombre) { estado.dec.grupos[t.dataset.mxNombre].nombre = t.value.trim() || estado.plan.clientas.grupos.find((g) => g.id === t.dataset.mxNombre).nombre; pintar(); }
        });
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-mx]');
          if (!b || !estado) return;
          if (b.dataset.mx === 'cancelar') { estado = null; BG.ir('#/ajustes'); return; }
          if (b.dataset.mx !== 'importar') return;
          let r;
          try { r = vistaPrevia(); } catch (err) { BG.toast(err.message, 'error'); return; }
          const res = r.resumen;
          const info = BG.infoMisDatos();
          const ok = await BG.modal({
            titulo: 'Traer tus datos del Excel',
            cuerpo: '<p>Se arma una base aparte con <strong>' + plural(res.clientas, 'clienta', 'clientas') + '</strong>, ' + plural(res.ventas, 'compra', 'compras') + ' y ' + plural(res.productos, 'prenda', 'prendas')
              + ' (' + res.enStock + ' en stock). Te deben <strong>' + gs(res.porCobrar) + '</strong>.</p>'
              + '<p>Los datos de ejemplo no se tocan: volvés a ellos desde la franja de arriba.</p>'
              + (info ? '<p class="callout callout-warn">' + icon('alert') + '<span>Reemplaza los datos del Excel que ya habías traído.</span></p>' : ''),
            acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Traer mis datos', valor: 'ok', clase: 'btn-primary' }],
          });
          if (ok !== 'ok') return;
          // Control antes de guardar: los dos cuadres del sistema, el stock y que el saldo coincida con las filas del Excel.
          const antes = BG.db;
          let problema = null;
          try {
            BG.db = r.db;
            if (!BG.cuadre().ok) problema = 'las cuentas por cobrar no cuadran';
            else if (!BG.cuadreFavor().ok) problema = 'los saldos a favor no cuadran';
            else if (BG.db.productos.some((p) => BG.disponibles(p) < 0)) problema = 'quedaría stock negativo';
            else if (res.porCobrar - res.aFavor !== res.saldoFilasExcel) problema = 'el saldo no coincide con las filas del Excel';
          } finally {
            BG.db = antes;
          }
          if (problema) { BG.toast('No se trajo nada: ' + problema + '.', 'error'); return; }
          try {
            BG.usarMisDatos(r.db, { importado: BG.ahora(), archivo: estado.archivo, clientas: res.clientas, ventas: res.ventas, porCobrar: res.porCobrar });
          } catch (err) { BG.toast(err.message, 'error'); return; }
          estado = null;
          BG.renderChrome();
          BG.toast('Listo: ' + plural(res.clientas, 'clienta', 'clientas') + ' y ' + plural(res.ventas, 'compra', 'compras') + '. Te deben ' + gs(res.porCobrar) + '.');
          BG.ir('#/inicio');
        });
      },
    };
  };
})();

/*!
 * berry.Glow_py — Módulo 2: cargar un pedido entero (opción A por kilo u opción B envío total
 * repartido por peso) e importar productos desde Excel o CSV.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  /** Calcula un lote de filas { cant, costo, peso } con el modo de envío elegido. */
  function calcularLote(validas, modo, envioTotalTexto, margen) {
    const cfg = BG.db.config;
    let reparto = null;
    let error = null;
    let envioTotal = null;
    const lineas = validas.map((x) => ({ pesoKg: x.peso, cantidad: x.cant }));
    const pesoTotal = lineas.length ? C.pesoTotal(lineas) : C.Q(0n);
    if (modo === 'total') {
      envioTotal = C.parseNum(envioTotalTexto, 'decimal');
      if (!envioTotal || C.isZero(envioTotal)) error = 'Escribí el monto total que cobró el courier por el pedido.';
      else if (lineas.length) {
        try { reparto = C.prorratearEnvio(lineas, envioTotal); } catch (e) { error = e.message; }
      }
    } else {
      envioTotal = C.mul(pesoTotal, C.asQ(cfg.tarifa.valor));
    }
    validas.forEach((x, k) => {
      x.envioUnit = modo === 'total' ? (reparto ? reparto[k].envioUnit : null) : C.mul(x.peso, C.asQ(cfg.tarifa.valor));
      x.r = null;
      if (x.envioUnit == null) return;
      x.r = C.calcularProducto({ costoUSD: x.costo, envioUnitUSD: x.envioUnit, cotizacion: cfg.cotizacion.valor, redondeo: cfg.redondeo });
      x.precio = Number(x.r.precios.find((p) => p.margen === margen).redondeado);
    });
    const listos = validas.filter((x) => x.r);
    return {
      error: error, pesoTotal: pesoTotal, envioTotal: envioTotal,
      costo: sum(listos, (x) => Number(x.r.costoTotalGs) * x.cant), venta: sum(listos, (x) => x.precio * x.cant),
    };
  }

  function htmlResumenLote(t, n, total, modo, margen) {
    return '<dl class="summary">'
      + '<dt>Artículos listos</dt><dd>' + n + ' de ' + total + '</dd>'
      + '<dt>Peso total</dt><dd>' + C.fmtKg(t.pesoTotal) + '</dd>'
      + '<dt>Envío total</dt><dd>' + (t.envioTotal ? C.fmtUSD(t.envioTotal) : '—') + '</dd>'
      + (modo === 'total' && t.envioTotal && !C.isZero(t.pesoTotal) ? '<dt>El kilo salió a</dt><dd>' + C.fmtUSD(C.div(t.envioTotal, t.pesoTotal)) + '/kg</dd>' : '')
      + '<div class="sep"></div>'
      + '<dt>Costo total en ₲</dt><dd>' + gs(t.costo) + '</dd>'
      + '<dt>Venta estimada (' + margen + ' %)</dt><dd>' + gs(t.venta) + '</dd>'
      + '<dt><strong>Ganancia estimada</strong></dt><dd class="big">' + gs(t.venta - t.costo) + '</dd></dl>';
  }

  function htmlControlesEnvio(modo, envioTotal, margen, prefijo) {
    const cfg = BG.db.config;
    return '<div class="stack">'
      + '<div class="field"><span class="field-label" id="' + prefijo + '-modo-l">¿Cómo cobró el courier?</span><div class="seg" role="radiogroup" aria-labelledby="' + prefijo + '-modo-l">'
      + '<label><input type="radio" name="' + prefijo + '-modo" value="kg"' + (modo === 'kg' ? ' checked' : '') + '>Por kilo (' + C.fmtUSD(cfg.tarifa.valor) + '/kg)</label>'
      + '<label><input type="radio" name="' + prefijo + '-modo" value="total"' + (modo === 'total' ? ' checked' : '') + '>Monto total del pedido</label></div></div>'
      + (modo === 'total' ? '<div class="field"><label for="' + prefijo + '-total">Total del envío (US$)</label><div class="money"><span class="money-sym" aria-hidden="true">US$</span>'
        + '<input id="' + prefijo + '-total" class="input input-usd" inputmode="decimal" data-dec="2" autocomplete="off" value="' + esc(envioTotal) + '" placeholder="53,00"></div>'
        + '<span class="hint">Se reparte entre los artículos según su peso: el que pesa el doble carga el doble de envío.</span></div>' : '')
      + '<div class="field"><span class="field-label" id="' + prefijo + '-m-l">Precio de venta para todo el lote</span><div class="seg" role="radiogroup" aria-labelledby="' + prefijo + '-m-l">'
      + C.MARGENES.map((m) => '<label><input type="radio" name="' + prefijo + '-margen" value="' + m + '"' + (m === margen ? ' checked' : '') + '>' + m + ' %</label>').join('')
      + '</div><span class="hint">Después se puede cambiar el precio de cada producto.</span></div></div>';
  }

  function registrarLote(listas, s, origen, proveedorPorDefecto) {
    const cfg = BG.db.config;
    const t = calcularLote(listas, s.modo, s.envioTotal, s.margen);
    const ped = {
      id: BG.uid('pd'), fecha: BG.hoy(), ts: BG.ahora(), proveedor: proveedorPorDefecto, cotizacion: cfg.cotizacion.valor,
      envio: s.modo === 'total' ? { modo: 'total', totalUSD: C.qToString(t.envioTotal), pesoKg: C.qToString(t.pesoTotal) } : { modo: 'kg', tarifa: cfg.tarifa.valor },
      productos: [],
    };
    BG.db.pedidos.push(ped);
    const creados = BG.guardarProductos(listas.map((x) => ({
      descripcion: x.desc, categoria: x.cat, proveedor: x.prov || proveedorPorDefecto, cantidad: x.cant, costoUSD: x.costo, pesoKg: x.peso,
      envioModo: s.modo, envioUnitUSD: x.envioUnit, tarifa: s.modo === 'kg' ? cfg.tarifa.valor : null, cotizacion: cfg.cotizacion.valor,
      margen: s.margen, pedidoId: ped.id,
    })), origen);
    ped.productos = creados.map((p) => p.id);
    BG.guardar();
    return creados;
  }

  /* ── Cargar un pedido entero ─────────────────────────────────────────── */

  BG.vistas.pedido = () => {
    const s = {
      proveedor: 'Tienda X, EE. UU.', modo: 'total', envioTotal: '53,00', margen: BG.db.config.margenDefecto, ejemplo: true,
      filas: [
        { desc: 'Remera oversize negra', cat: 'Prenda', cant: '3', costo: '12,00', peso: '0,300' },
        { desc: 'Jean wide leg azul', cat: 'Prenda', cant: '2', costo: '26,50', peso: '0,650' },
        { desc: 'Aros argolla dorados', cat: 'Accesorio', cant: '10', costo: '3,50', peso: '0,020' },
      ],
    };
    const html = '<div class="page">'
      + '<a class="back-link" href="#/productos">' + icon('left', 'i-sm') + 'Productos</a>'
      + '<div class="page-head"><div><h1 class="page-title">Cargar un pedido</h1><p class="page-sub">Varios artículos que llegaron juntos por courier. Sirve para las dos formas de cobro del envío.</p></div></div>'
      + '<div id="pd-params"></div>'
      + '<div class="callout callout-warn" id="pd-ejemplo">' + icon('info') + '<div><strong>Estas tres filas son un ejemplo</strong> (envío total de US$ 53,00 repartido por peso). Cambialas o vacialas para cargar tu pedido. '
      + '<button type="button" class="linkish" data-accion="vaciar">Vaciar la tabla</button></div></div>'
      + '<div class="grid-form grid-form-wide"><section class="card stack" aria-labelledby="pd-t">'
      + '<div class="card-head"><h2 id="pd-t">Artículos del pedido</h2><div class="field field-inline"><label for="pd-prov">Proveedor / origen</label><input id="pd-prov" class="input" value="' + esc(s.proveedor) + '" autocomplete="off"></div></div>'
      + '<div class="table-wrap"><table class="table table-compact table-edit"><thead><tr><th>Descripción</th><th>Categoría</th><th class="num">Cant.</th><th class="num">Costo US$</th><th class="num">Peso kg</th>'
      + '<th class="num">Envío c/u</th><th class="num">Costo ₲ c/u</th><th class="num">Precio</th><th><span class="sr-only">Quitar</span></th></tr></thead><tbody id="pd-filas"></tbody></table></div>'
      + '<button type="button" class="btn-link" data-accion="agregar-fila">' + icon('plus', 'i-sm') + 'Agregar artículo</button></section>'
      + '<section class="card stack sticky-col" aria-labelledby="pd-r"><h2 class="card-title" id="pd-r">Envío y precios</h2><div id="pd-controles"></div><div id="pd-resumen"></div>'
      + '<p class="error-text" id="pd-err" role="alert" hidden></p>'
      + '<button type="button" class="btn btn-primary btn-lg btn-block" data-accion="guardar">' + icon('check') + '<span id="pd-btn">Guardar productos</span></button></section>'
      + '</div></div>';
    let root = null;
    const filas = () => s.filas.map((f, i) => ({ i: i, desc: f.desc.trim(), cat: f.cat, cant: C.parseEntero(f.cant), costo: C.parseNum(f.costo, 'decimal'), peso: C.parseNum(f.peso, 'decimal') }));
    const esValida = (x) => x.desc && x.cant >= 1 && x.costo && !C.isZero(x.costo) && x.peso != null;
    const htmlFila = (f, i) => '<tr data-i="' + i + '">'
      + '<td><input class="input" data-k="desc" value="' + esc(f.desc) + '" autocomplete="off" aria-label="Descripción, fila ' + (i + 1) + '" placeholder="Descripción"></td>'
      + '<td><select class="select" data-k="cat" aria-label="Categoría, fila ' + (i + 1) + '">' + ['Prenda', 'Accesorio'].map((c) => '<option' + (f.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></td>'
      + '<td><input class="input num-input w-xs" data-k="cant" inputmode="numeric" value="' + esc(f.cant) + '" aria-label="Cantidad, fila ' + (i + 1) + '"></td>'
      + '<td><input class="input num-input w-sm" data-k="costo" inputmode="decimal" data-dec="2" value="' + esc(f.costo) + '" aria-label="Costo en US$, fila ' + (i + 1) + '"></td>'
      + '<td><input class="input num-input w-sm" data-k="peso" inputmode="decimal" data-dec="3" value="' + esc(f.peso) + '" aria-label="Peso en kg, fila ' + (i + 1) + '"></td>'
      + '<td class="num" id="pd-e-' + i + '"></td><td class="num" id="pd-c-' + i + '"></td><td class="num" id="pd-p-' + i + '"></td>'
      + '<td><button type="button" class="btn-icon" data-accion="quitar-fila" data-i="' + i + '" aria-label="Quitar fila ' + (i + 1) + '">' + icon('x') + '</button></td></tr>';
    const pintarFilas = () => { $('#pd-filas', root).innerHTML = s.filas.map(htmlFila).join(''); BG.enlazarCampos($('#pd-filas', root)); };
    const pintarControles = () => { $('#pd-controles', root).innerHTML = htmlControlesEnvio(s.modo, s.envioTotal, s.margen, 'pd'); BG.enlazarCampos($('#pd-controles', root)); };
    const pintarCalculos = () => {
      const todas = filas();
      const validas = todas.filter(esValida);
      const t = calcularLote(validas, s.modo, s.envioTotal, s.margen);
      todas.forEach((x) => {
        const v = validas.find((y) => y.i === x.i);
        $('#pd-e-' + x.i, root).textContent = v && v.r ? C.fmtUSD(v.envioUnit) : '—';
        $('#pd-c-' + x.i, root).textContent = v && v.r ? gs(v.r.costoTotalGs) : '—';
        $('#pd-p-' + x.i, root).innerHTML = v && v.r ? '<strong>' + gs(v.precio) + '</strong>' : '—';
      });
      $('#pd-resumen', root).innerHTML = htmlResumenLote(t, validas.filter((x) => x.r).length, todas.length, s.modo, s.margen)
        + (t.error ? '<p class="error-text">' + esc(t.error) + '</p>' : '');
      $('#pd-btn', root).textContent = 'Guardar ' + validas.length + (validas.length === 1 ? ' producto' : ' productos');
    };
    const guardar = () => {
      const err = $('#pd-err', root);
      const todas = filas().filter((x) => x.desc || s.filas[x.i].costo || s.filas[x.i].peso);
      const malas = todas.filter((x) => !esValida(x));
      const fallar = (m) => { err.textContent = m; err.hidden = false; BG.toast(m, 'error'); };
      err.hidden = true;
      if (!todas.length) return fallar('Agregá al menos un artículo.');
      if (malas.length) return fallar('Revisá la fila ' + (malas[0].i + 1) + ': necesita descripción, cantidad, costo en US$ y peso en kg.');
      const t = calcularLote(todas, s.modo, s.envioTotal, s.margen);
      if (t.error) return fallar(t.error);
      const creados = registrarLote(todas.map((x) => Object.assign(x, { prov: '' })), s, 'pedido', $('#pd-prov', root).value.trim());
      BG.toast(creados.length + ' productos cargados y calculados.');
      BG.ir('#/productos');
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        const pintarParams = () => { $('#pd-params', root).innerHTML = BG.htmlParametros(); };
        pintarParams();
        BG.enlazarParametros(root, () => { pintarParams(); pintarControles(); pintarCalculos(); });
        pintarFilas();
        pintarControles();
        pintarCalculos();
        root.addEventListener('input', (e) => {
          const t = e.target;
          if (t.dataset.k) { s.filas[Number(t.closest('tr').dataset.i)][t.dataset.k] = t.value; pintarCalculos(); }
          if (t.id === 'pd-total') { s.envioTotal = t.value; pintarCalculos(); }
        });
        root.addEventListener('change', (e) => {
          const t = e.target;
          if (t.dataset.k === 'cat') { s.filas[Number(t.closest('tr').dataset.i)].cat = t.value; }
          if (t.name === 'pd-modo') { s.modo = t.value; pintarControles(); pintarCalculos(); }
          if (t.name === 'pd-margen') { s.margen = Number(t.value); pintarCalculos(); }
        });
        root.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.dec) { const tr = e.target.closest('tr'); if (tr) s.filas[Number(tr.dataset.i)][e.target.dataset.k] = e.target.value; } });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          const a = b.dataset.accion;
          if (a === 'agregar-fila') {
            s.filas.push({ desc: '', cat: 'Accesorio', cant: '1', costo: '', peso: '' });
            pintarFilas();
            pintarCalculos();
            const inps = $$('#pd-filas tr:last-child input', root);
            if (inps[0]) inps[0].focus();
          } else if (a === 'quitar-fila') {
            s.filas.splice(Number(b.dataset.i), 1);
            if (!s.filas.length) s.filas.push({ desc: '', cat: 'Prenda', cant: '1', costo: '', peso: '' });
            pintarFilas();
            pintarCalculos();
          } else if (a === 'vaciar') {
            s.filas = [{ desc: '', cat: 'Prenda', cant: '1', costo: '', peso: '' }];
            s.envioTotal = '';
            $('#pd-ejemplo', root).hidden = true;
            pintarFilas();
            pintarControles();
            pintarCalculos();
          } else if (a === 'guardar') guardar();
        });
      },
    };
  };

  /* ── Importar Excel / CSV ────────────────────────────────────────────── */

  BG.vistas.importar = () => {
    const s = { nombre: null, filas: [], faltan: [], error: null, modo: 'kg', envioTotal: '', margen: BG.db.config.margenDefecto, creados: null };
    const html = '<div class="page">'
      + '<a class="back-link" href="#/productos">' + icon('left', 'i-sm') + 'Productos</a>'
      + '<div class="page-head"><div><h1 class="page-title">Importar productos desde Excel</h1><p class="page-sub">Para cuando llegan muchos artículos juntos: se cargan todos de una vez y el sistema calcula cada precio.</p></div></div>'
      + '<div id="im-params"></div>'
      + '<div class="steps">'
      + '<section class="step"><span class="step-n" aria-hidden="true"></span><h2>Descargá la plantilla</h2><p class="small">Columnas: Descripción, Categoría, Proveedor / origen, Cantidad, Costo unitario (US$) y Peso unitario (kg).</p>'
      + (BG.publicado
        ? '<p class="note-mock">' + icon('info') + '<span>En esta versión por link no se pueden descargar archivos: la plantilla viene con el mockup de la computadora (carpeta <strong>plantillas</strong>). Acá podés probar con el ejemplo o subir tu propio Excel.</span></p>'
        : '<div class="row"><a class="btn btn-sm" href="plantillas/plantilla_productos.xlsx" download>' + icon('download', 'i-sm') + 'Plantilla Excel</a>'
          + '<a class="btn btn-sm btn-quiet" href="plantillas/plantilla_productos.csv" download>CSV</a></div>'
          + '<a class="small" href="plantillas/ejemplo_20_productos.xlsx" download>Descargar un ejemplo completo (20 productos)</a>')
      + '</section>'
      + '<section class="step"><span class="step-n" aria-hidden="true"></span><h2>Subí la planilla completa</h2>'
      + '<label class="dropzone" id="im-drop" for="im-file">' + icon('upload', 'i-lg') + '<span><strong>Elegí el archivo</strong> o arrastralo acá</span><span class="small muted">.xlsx o .csv</span>'
      + '<input id="im-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>'
      + '<button type="button" class="btn btn-sm" data-accion="ejemplo">Probar con el ejemplo de 20 productos</button></section>'
      + '<section class="step"><span class="step-n" aria-hidden="true"></span><h2>Revisá y confirmá</h2><p class="small" id="im-paso3">Antes de guardar vas a ver cada fila calculada, con los errores marcados. Las filas con error no se importan.</p></section>'
      + '</div><section id="im-revision" class="stack" aria-live="polite"></section></div>';
    let root = null;
    const aplicar = (matriz) => {
      const r = window.BGImport.validar(matriz);
      s.filas = r.filas;
      s.faltan = r.faltan;
      s.error = !r.filas.length && !r.faltan.length ? 'La planilla no tiene productos debajo de los títulos.' : null;
    };
    const procesar = async (file) => {
      s.nombre = file.name;
      s.creados = null;
      s.error = null;
      try { aplicar(await window.BGImport.leerArchivo(file)); } catch (e) { s.error = e.message; s.filas = []; s.faltan = []; }
      pintar();
    };
    const pintar = () => {
      const host = $('#im-revision', root);
      if (s.creados) {
        host.innerHTML = '<div class="success"><h2>' + icon('check') + s.creados.length + ' productos importados y calculados</h2>'
          + '<p>Quedaron con el dólar ' + C.fmtCot(BG.db.config.cotizacion.valor) + ' congelado y el precio al ' + s.margen + ' %.</p>'
          + '<div class="row"><a class="btn btn-primary" href="#/productos">Ver productos</a><button type="button" class="btn" data-accion="otra">Importar otra planilla</button></div></div>';
        return;
      }
      if (!s.nombre) { host.innerHTML = ''; return; }
      if (s.error || s.faltan.length) {
        host.innerHTML = '<div class="callout callout-bad">' + icon('alert') + '<div><strong>No se pudo leer «' + esc(s.nombre) + '».</strong> '
          + esc(s.error || ('Faltan columnas: ' + s.faltan.join(', ') + '. Usá la plantilla para que los títulos coincidan.')) + '</div></div>';
        return;
      }
      const validas = s.filas.filter((f) => !f.errores.length).map((f) => ({ f: f, desc: f.descripcion, cat: f.categoria, prov: f.proveedor, cant: f.cantidad, costo: f.costo, peso: f.peso }));
      const t = calcularLote(validas, s.modo, s.envioTotal, s.margen);
      const conError = s.filas.filter((f) => f.errores.length).length;
      const conAviso = s.filas.filter((f) => !f.errores.length && f.avisos.length).length;
      const listos = validas.filter((x) => x.r);
      host.innerHTML = '<div class="grid-form grid-form-wide"><section class="card stack"><div class="card-head"><h2>' + esc(s.nombre) + '</h2>'
        + '<span>' + (conError ? '<span class="pill pill-bad">' + icon('x') + conError + ' con error</span> ' : '') + (conAviso ? '<span class="pill pill-warn">' + icon('alert') + conAviso + ' con aviso</span> ' : '')
        + '<span class="pill pill-good">' + icon('check') + validas.length + ' listas</span></span></div>'
        + '<div class="table-wrap"><table class="table table-compact"><thead><tr><th class="num">Fila</th><th>Descripción</th><th>Categoría</th><th class="num">Cant.</th><th class="num">Costo US$</th><th class="num">Peso</th>'
        + '<th class="num">Envío c/u</th><th class="num">Costo ₲ c/u</th><th class="num">Precio</th><th>Estado</th></tr></thead><tbody>'
        + s.filas.map((f) => {
          const x = validas.find((y) => y.f === f);
          const estado = f.errores.length ? '<span class="pill pill-bad">' + esc(f.errores.join(' · ')) + '</span>'
            : f.avisos.length ? '<span class="pill pill-warn">' + esc(f.avisos.join(' · ')) + '</span>' : '<span class="pill pill-good">' + icon('check') + 'Lista</span>';
          return '<tr class="' + (f.errores.length ? 'row-error' : f.avisos.length ? 'row-warn' : '') + '"><td class="num">' + f.fila + '</td><td>' + (esc(f.descripcion) || '<span class="muted">(vacía)</span>') + '<div class="t-sub">' + esc(f.proveedor) + '</div></td>'
            + '<td>' + esc(f.categoria) + '</td><td class="num">' + (f.cantidad == null ? '—' : f.cantidad) + '</td><td class="num">' + (f.costo ? C.fmtUSD(f.costo) : '—') + '</td><td class="num">' + (f.peso ? C.fmtKg(f.peso) : '—') + '</td>'
            + '<td class="num">' + (x && x.r ? C.fmtUSD(x.envioUnit) : '—') + '</td><td class="num">' + (x && x.r ? gs(x.r.costoTotalGs) : '—') + '</td><td class="num"><strong>' + (x && x.r ? gs(x.precio) : '—') + '</strong></td><td>' + estado + '</td></tr>';
        }).join('') + '</tbody></table></div></section>'
        + '<section class="card stack sticky-col"><h2 class="card-title">Envío y precios</h2>' + htmlControlesEnvio(s.modo, s.envioTotal, s.margen, 'im')
        + htmlResumenLote(t, listos.length, s.filas.length, s.modo, s.margen) + (t.error ? '<p class="error-text">' + esc(t.error) + '</p>' : '')
        + '<button type="button" class="btn btn-primary btn-lg btn-block" data-accion="importar"' + (listos.length && !t.error ? '' : ' disabled') + '>' + icon('check') + 'Importar ' + listos.length + ' productos</button>'
        + (conError ? '<p class="hint">Las ' + conError + ' filas con error no se importan: corregilas en el Excel y volvé a subirlo.</p>' : '') + '</section></div>';
      BG.enlazarCampos(host);
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        const pintarParams = () => { $('#im-params', root).innerHTML = BG.htmlParametros(); };
        pintarParams();
        BG.enlazarParametros(root, () => { pintarParams(); pintar(); });
        const drop = $('#im-drop', root);
        $('#im-file', root).addEventListener('change', (e) => { if (e.target.files[0]) procesar(e.target.files[0]); e.target.value = ''; });
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer.files[0]; if (f) procesar(f); });
        root.addEventListener('change', (e) => {
          const t = e.target;
          if (t.name === 'im-modo') { s.modo = t.value; pintar(); }
          if (t.name === 'im-margen') { s.margen = Number(t.value); pintar(); }
        });
        root.addEventListener('input', (e) => {
          if (e.target.id !== 'im-total') return;
          s.envioTotal = e.target.value;
          pintar();
          const f = $('#im-total', root);
          f.focus();
          f.setSelectionRange(f.value.length, f.value.length);
        });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          const a = b.dataset.accion;
          if (a === 'ejemplo') { s.nombre = 'ejemplo_20_productos.xlsx (incluido en el mockup)'; s.creados = null; aplicar(window.BGEjemploImportacion); pintar(); }
          else if (a === 'otra') { s.nombre = null; s.creados = null; s.filas = []; pintar(); }
          else if (a === 'importar') {
            const validas = s.filas.filter((f) => !f.errores.length).map((f) => ({ desc: f.descripcion, cat: f.categoria, prov: f.proveedor, cant: f.cantidad, costo: f.costo, peso: f.peso }));
            s.creados = registrarLote(validas, s, 'excel', 'Importación ' + BG.fmtFecha(BG.hoy()));
            BG.toast(s.creados.length + ' productos importados.');
            pintar();
          }
        });
      },
    };
  };
})();

/*!
 * berry.Glow_py — Recibo / estado de cuenta para la clienta y guía de prueba del mockup.
 *
 * Regla estricta del brief: el recibo NUNCA muestra costos, dólares, cotización, envío,
 * margen, ganancia ni proveedor. Por eso se arma solo desde datosRecibo(), que copia
 * únicamente lo público; y un control revisa el texto final antes de imprimir.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;
  const KEY_FORMATO = 'berryglow.mockup.formato';
  const KEY_GUIA = 'berryglow.mockup.guia';

  /* ── Datos públicos del recibo ───────────────────────────────────────── */

  function datosRecibo(tipo, id, pagosIds) {
    const destacados = pagosIds.map((pid) => BG.db.pagos.find((p) => p.id === pid)).filter(Boolean);
    let cli;
    let ventas;
    if (tipo === 'v') {
      const v = BG.venta(id);
      if (!v) return null;
      cli = BG.cliente(v.clienteId);
      ventas = [v];
    } else {
      cli = BG.cliente(id);
      if (!cli) return null;
      const ids = new Set(destacados.map((p) => p.ventaId).filter(Boolean));
      ventas = BG.ventasDeCliente(cli.id).filter((v) => ids.has(v.id) || BG.saldoVenta(v) > 0).sort((a, b) => a.ts.localeCompare(b.ts));
    }
    const numero = destacados.length ? destacados[0].recibo : tipo === 'v' ? ventas[0].recibo : null;
    const t = BG.db.config.tienda;
    return {
      tienda: { nombre: t.nombre, whatsapp: t.whatsapp, instagram: t.instagram, direccion: t.direccion, mensaje: t.mensaje },
      titulo: destacados.length ? 'Recibo de pago' : tipo === 'v' ? 'Recibo' : 'Estado de cuenta',
      numero: numero,
      emision: BG.hoy(),
      cliente: { nombre: cli.nombre, documento: cli.ci ? (cli.ci.includes('-') ? 'RUC ' : 'CI ') + cli.ci : 'Sin CI/RUC' },
      compras: ventas.map((v) => ({
        numero: v.recibo, fecha: v.fecha, anulada: !!v.anulada,
        items: v.items.map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad, precio: it.precio })),
        subtotal: v.subtotal, descuento: v.descuento.monto, total: v.total,
        pagos: BG.pagosDeVenta(v.id).sort((a, b) => a.ts.localeCompare(b.ts)).map((p) => ({
          fecha: p.fecha, monto: p.total, nuevo: pagosIds.indexOf(p.id) >= 0,
          formas: p.partes.map((x) => ({ forma: BG.FORMAS[x.forma], monto: x.monto })),
          aFavor: p.excedente,
        })),
        pagado: BG.pagadoVenta(v), saldo: BG.saldoVenta(v),
      })),
      saldoCuenta: BG.saldoCliente(cli.id),
      aFavor: BG.creditoCliente(cli.id),
      clienteRef: cli,
    };
  }

  function htmlRecibo(d, formato) {
    const m = BG.db.config.marca;
    const t = d.tienda;
    const unaCompra = d.compras.length === 1;
    const deUnaCompra = unaCompra && d.titulo !== 'Estado de cuenta';
    const saldoPrincipal = deUnaCompra ? d.compras[0].saldo : d.saldoCuenta;
    // En el recibo de una compra el recuadro habla de esa compra; "cuenta al día" solo si no debe nada en ninguna.
    const etiquetaSaldo = saldoPrincipal > 0 ? (deUnaCompra ? 'Saldo pendiente de esta compra' : 'Saldo pendiente')
      : (deUnaCompra ? 'Compra saldada' : 'Cuenta al día');
    const compra = (c) => '<section class="r-section">'
      + '<h2>Detalle de la compra<span>' + BG.fmtFecha(c.fecha) + ' · ' + BG.fmtRecibo(c.numero) + '</span></h2>'
      + '<table class="r-table"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>'
      + c.items.map((it) => '<tr><td>' + esc(it.descripcion) + '</td><td class="num">' + it.cantidad + '</td><td class="num">' + gs(it.precio) + '</td><td class="num">' + gs(it.precio * it.cantidad) + '</td></tr>').join('')
      + '</tbody><tfoot>'
      + (c.descuento ? '<tr><td colspan="3">Subtotal</td><td class="num">' + gs(c.subtotal) + '</td></tr><tr><td colspan="3">Descuento</td><td class="num">−' + gs(c.descuento) + '</td></tr>' : '')
      + '<tr><td colspan="3">Total de la compra</td><td class="num">' + gs(c.total) + '</td></tr></tfoot></table>'
      + '<h2 class="r-sub">Pagos realizados</h2>'
      + (c.pagos.length ? '<table class="r-table"><tbody>' + c.pagos.map((p) => '<tr' + (p.nuevo ? ' class="is-new"' : '') + '><td>' + BG.fmtFecha(p.fecha) + (p.nuevo ? ' <strong>· pago de hoy</strong>' : '')
        + '<div class="r-forms">' + p.formas.map((x) => x.forma + ' ' + gs(x.monto)).join(' + ') + (p.aFavor ? ' · ' + gs(p.aFavor) + ' quedó a tu favor' : '') + '</div></td>'
        + '<td class="num">' + gs(p.monto) + '</td></tr>').join('') + '</tbody><tfoot><tr><td>Total pagado</td><td class="num">' + gs(c.pagado) + '</td></tr></tfoot></table>'
        : '<p class="r-forms">Todavía sin pagos.</p>')
      + (unaCompra ? '' : '<p class="r-account"><span>Saldo de esta compra</span><strong>' + gs(c.saldo) + '</strong></p>')
      + '</section>';
    return '<article class="receipt' + (formato === 'ticket' ? ' is-ticket' : '') + '" id="recibo" style="--r-brand:' + esc(m.principal) + ';--r-accent:' + esc(m.acento) + ';--mark-berry:' + esc(m.principal) + ';--mark-glow:' + esc(m.acento) + '">'
      + '<header class="r-head"><div class="r-logo">' + BG.logo(true) + '</div>'
      + '<div class="r-doc"><h1>' + esc(d.titulo) + '</h1>' + (d.numero ? '<p class="r-num">' + BG.fmtRecibo(d.numero) + '</p>' : '') + '<p>Emitido el ' + BG.fmtFecha(d.emision) + '</p></div></header>'
      + '<p class="r-contact">' + [t.whatsapp && 'WhatsApp ' + esc(t.whatsapp), t.instagram && 'Instagram ' + esc(t.instagram), t.direccion && esc(t.direccion)].filter(Boolean).map((x) => '<span>' + x + '</span>').join('') + '</p>'
      + '<div class="r-client"><div><span>Cliente</span><strong>' + esc(d.cliente.nombre) + '</strong></div><div><span>Documento</span><strong>' + esc(d.cliente.documento) + '</strong></div></div>'
      + (d.compras.length ? d.compras.map(compra).join('') : '<p class="r-section">No hay compras con saldo pendiente.</p>')
      + '<div class="r-saldo' + (saldoPrincipal > 0 ? '' : ' is-paid') + '"><span>' + etiquetaSaldo + '</span><strong>' + gs(saldoPrincipal) + '</strong></div>'
      + (deUnaCompra && d.saldoCuenta !== saldoPrincipal ? '<p class="r-account"><span>Saldo total de tu cuenta (todas las compras)</span><strong>' + gs(d.saldoCuenta) + '</strong></p>' : '')
      + (d.aFavor > 0 ? '<p class="r-account"><span>Saldo a tu favor para la próxima compra</span><strong>' + gs(d.aFavor) + '</strong></p>' : '')
      + '<footer class="r-foot"><p class="r-thanks">' + esc(t.mensaje || '¡Gracias por tu compra!') + '</p><p class="r-legal">' + esc(t.nombre) + ' · Comprobante interno de pago, no válido como factura.</p></footer>'
      + '</article>';
  }

  /** Busca en el texto del recibo cualquier dato interno. Devuelve la lista de lo que encontró. */
  BG.revisarPrivacidad = (el, compras) => {
    const texto = BG.norm(el.innerText);
    const hallazgos = [];
    const prohibido = [['us$', 'montos en dólares'], ['usd', 'montos en dólares'], ['dolar', 'dólar'], ['cotiz', 'cotización'], ['courier', 'courier'],
      ['envio', 'envío'], ['costo', 'costos'], ['margen', 'margen'], ['ganancia', 'ganancia'], ['proveedor', 'proveedor'], ['origen', 'origen']];
    for (const [p, nombre] of prohibido) if (texto.includes(p) && hallazgos.indexOf(nombre) < 0) hallazgos.push(nombre);
    const proveedores = new Set();
    for (const v of compras) for (const it of v.items) { const p = BG.producto(it.productoId); if (p && p.proveedor) proveedores.add(BG.norm(p.proveedor)); }
    proveedores.forEach((pv) => { if (texto.includes(pv)) hallazgos.push('proveedor «' + pv + '»'); });
    const cot = C.fmtNum(BG.db.config.cotizacion.valor, 0, 2);
    if (new RegExp('(^|[^0-9.])' + cot.replace(/\./g, '\\.') + '([^0-9]|$)').test(texto)) hallazgos.push('la cotización (' + cot + ')');
    return hallazgos;
  };

  BG.vistas.recibo = (args, params) => {
    const tipo = args[0];
    const pagosIds = (params.get('pagos') || '').split(',').filter(Boolean);
    const d = datosRecibo(tipo, args[1], pagosIds);
    if (!d) return { html: '<div class="page"><p class="empty">No encontramos ese recibo.</p></div>' };
    let formato = 'a4';
    try { formato = localStorage.getItem(KEY_FORMATO) || 'a4'; } catch (e) { /* sin almacenamiento */ }
    const cli = d.clienteRef;
    const ventasOrig = tipo === 'v' ? [BG.venta(args[1])] : BG.ventasDeCliente(cli.id);
    const textoWa = 'Hola ' + cli.nombre.split(' ')[0] + ', te paso el resumen de tu cuenta en ' + d.tienda.nombre + ': '
      + (d.compras.length === 1 ? 'compra ' + BG.fmtRecibo(d.compras[0].numero) + ' por ' + gs(d.compras[0].total) + ', pagado ' + gs(d.compras[0].pagado) + '. ' : '')
      + (d.saldoCuenta > 0 ? 'Saldo pendiente: ' + gs(d.saldoCuenta) + '.' : '¡Tu cuenta está al día!') + ' ¡Gracias!';
    const volver = tipo === 'v' ? '#/ventas/' + args[1] : '#/clientes/' + cli.id;
    const html = '<div class="page">'
      + '<div class="receipt-toolbar no-print"><a class="back-link" href="' + volver + '">' + icon('left', 'i-sm') + 'Volver</a>'
      + '<div class="row"><div class="seg" role="radiogroup" aria-label="Formato de impresión">'
      + '<label><input type="radio" name="formato" value="a4"' + (formato === 'a4' ? ' checked' : '') + '>Hoja A4</label>'
      + '<label><input type="radio" name="formato" value="ticket"' + (formato === 'ticket' ? ' checked' : '') + '>Ticket 80 mm</label></div>'
      + '<button type="button" class="btn" data-accion="imprimir">' + icon('print') + 'Imprimir</button>'
      + '<button type="button" class="btn" data-accion="pdf">' + icon('download') + 'Guardar PDF</button>'
      + '<a class="btn btn-primary" href="' + BG.waLink(cli, textoWa) + '" target="_blank" rel="noopener">' + icon('chat') + 'WhatsApp</a></div></div>'
      + '<div class="no-print" id="privacidad"></div>'
      + '<div class="receipt-stage">' + htmlRecibo(d, formato) + '</div>'
      + '<p class="hint no-print">El PDF se genera con «Imprimir → Guardar como PDF». En el sistema final el PDF se crea directo y se adjunta en WhatsApp.</p>'
      + '</div>';
    const aplicarFormato = (f) => {
      let st = document.getElementById('estilo-pagina');
      if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
      st.textContent = f === 'ticket' ? '@page { size: 80mm auto; margin: 4mm; }' : '@page { size: A4; margin: 14mm; }';
    };
    return {
      html: html,
      mount: (root) => {
        aplicarFormato(formato);
        const revisar = () => {
          const h = BG.revisarPrivacidad($('#recibo', root), ventasOrig);
          $('#privacidad', root).innerHTML = h.length
            ? '<p class="privacy privacy-bad">' + icon('alert') + 'Atención: el recibo muestra ' + esc(h.join(', ')) + '.</p>'
            : '<p class="privacy privacy-ok">' + icon('shield') + 'Control automático: el recibo no muestra costos, dólares, cotización, envío, margen, ganancia ni proveedor.</p>';
        };
        revisar();
        root.addEventListener('change', (e) => {
          if (e.target.name !== 'formato') return;
          formato = e.target.value;
          try { localStorage.setItem(KEY_FORMATO, formato); } catch (err) { /* sin almacenamiento */ }
          $('#recibo', root).classList.toggle('is-ticket', formato === 'ticket');
          aplicarFormato(formato);
        });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          if (b.dataset.accion === 'pdf') BG.toast('En la ventana que se abre, elegí «Guardar como PDF» como impresora.');
          if (b.dataset.accion === 'imprimir' || b.dataset.accion === 'pdf') {
            setTimeout(() => { try { window.print(); } catch (err) { /* el visor puede bloquearlo */ } }, b.dataset.accion === 'pdf' ? 600 : 0);
            if (BG.publicado) setTimeout(() => BG.toast('Si no se abrió la impresión, es porque esta versión por link no lo permite: probalo en el mockup de la computadora.'), 1500);
          }
        });
      },
    };
  };

  /* ── Guía de prueba ──────────────────────────────────────────────────── */

  const CRITERIOS = [
    { id: 'c1', titulo: 'Cargo un producto con costo y peso y me da los cuatro precios', como: 'Cargar producto → «Usar el ejemplo del brief». Tienen que salir ₲ 211.000, 253.000, 281.000 y 309.000.', ir: '#/productos/nuevo' },
    { id: 'c2', titulo: 'Cambio la cotización del dólar y los precios se recalculan', como: 'En Cargar producto tocá «cambiar» junto al dólar y poné 7.600: la calculadora se rehace (100 % → ₲ 285.000). Los productos ya cargados conservan su costo; al cambiarla podés actualizar sus precios de venta.', ir: '#/productos/nuevo' },
    { id: 'c3', titulo: 'Registro una venta con dos artículos y un pago mixto', como: 'Nueva venta → elegí un cliente y dos productos → «Paga todo» → «Dividir en otra forma de pago» y repartí el monto. El saldo queda en la ficha del cliente.', ir: '#/ventas/nueva' },
    { id: 'c4', titulo: 'Busco un cliente escribiendo tres letras', como: 'En el buscador de arriba probá «lor», «gim», una CI («4567») o un error de tipeo como «lroena».', ir: 'buscar' },
    { id: 'c5', titulo: 'Imprimo un recibo sin costos, conversiones ni ganancias', como: 'Abrí un recibo: arriba aparece el control automático. Probá «Imprimir» en A4 o ticket.', ir: 'recibo' },
    { id: 'c6', titulo: 'Consulto el saldo de un cliente desde el celular', como: 'Abrilo en el celular (o achicá la ventana): aparece la barra de abajo. Clientes → «Con saldo» → tocá una clienta.', ir: '#/clientes?filtro=deben' },
    { id: 'c7', titulo: 'Importo 20 productos por Excel y quedan calculados', como: 'Importar Excel → «Probar con el ejemplo de 20 productos» (o subí plantillas/ejemplo_20_productos.xlsx).', ir: '#/productos/importar' },
  ];
  const leerHechos = () => { try { return JSON.parse(localStorage.getItem(KEY_GUIA) || '[]'); } catch (e) { return []; } };
  const guardarHechos = (h) => { try { localStorage.setItem(KEY_GUIA, JSON.stringify(h)); } catch (e) { /* sin almacenamiento */ } };

  function htmlGuia() {
    const hechos = leerHechos();
    const n = CRITERIOS.filter((c) => hechos.indexOf(c.id) >= 0).length;
    return '<div class="guide-head"><div><p class="eyebrow">Mockup para aprobar</p><h2>Guía de prueba</h2></div>'
      + '<button type="button" class="btn-icon" data-guia="cerrar" aria-label="Cerrar la guía">' + icon('x') + '</button></div>'
      + '<p class="small">Recorré los criterios de aceptación del brief. Tildá cada uno cuando lo verifiques (queda guardado en este navegador): <strong>' + n + ' de ' + CRITERIOS.length + '</strong>.</p>'
      + '<h3>Criterios de aceptación</h3><div class="checks">'
      + CRITERIOS.map((c) => '<div class="check' + (hechos.indexOf(c.id) >= 0 ? ' is-done' : '') + '"><input type="checkbox" id="g-' + c.id + '" data-check="' + c.id + '"' + (hechos.indexOf(c.id) >= 0 ? ' checked' : '') + '>'
        + '<label class="check-title" for="g-' + c.id + '">' + esc(c.titulo) + '</label><p class="check-how">' + esc(c.como) + '</p>'
        + '<button type="button" class="btn btn-sm check-go" data-ir="' + c.ir + '">Probarlo</button></div>').join('') + '</div>'
      + '<h3>Otras reglas para probar</h3><ul class="bullets">'
      + '<li><strong>Vista vendedor/a:</strong> «Ver como: Vendedor/a» oculta costos, dólar y márgenes.</li>'
      + '<li><strong>Anular en vez de borrar:</strong> en una venta, «Anular venta» pide motivo y queda en la auditoría. Si el día tiene la caja cerrada pide el PIN (1234).</li>'
      + '<li><strong>Saldo a favor:</strong> Leticia Ferreira tiene ₲ 50.000 a favor por una venta anulada; se ofrece al venderle.</li>'
      + '<li><strong>Cobro de más:</strong> si pagan más que la deuda, el sistema pregunta si es vuelto o saldo a favor.</li>'
      + '<li><strong>Vender sin precio:</strong> el «Pañuelo de seda» no tiene costo cargado y el sistema no deja venderlo.</li>'
      + '<li><strong>Envío por monto total (opción B):</strong> Productos → «Cargar pedido».</li>'
      + '<li><strong>Cierre de caja:</strong> Caja del día → contar el efectivo → cerrar.</li></ul>'
      + '<h3>Qué es simulado</h3><ul class="bullets">'
      + '<li>El ingreso no pide contraseña y los datos se guardan solo en este navegador.</li>'
      + '<li>Los respaldos automáticos y el PDF directo son del sistema final (acá el PDF sale con «Imprimir → Guardar como PDF»).</li>'
      + '<li>WhatsApp abre el chat con el texto; los clientes de ejemplo no tienen número real, así que se abre sin destinatario.</li>'
      + '<li>El logo es provisorio: en Ajustes se puede subir el real y elegir los colores de la marca.</li>'
      + (BG.publicado ? '<li><strong>Versión por link:</strong> cada persona que la abre tiene su propia copia de los datos de ejemplo (lo que cargás no lo ve nadie más). No permite descargar archivos y puede no dejar imprimir.</li>' : '')
      + '</ul>'
      + '<h3>Para decidir juntos</h3><ul class="bullets">'
      + '<li><strong>Redondeo:</strong> el brief dice "al millar" pero su ejemplo ₲ 87.300 → ₲ 90.000 es redondear a 10.000. Está ajustable.</li>'
      + '<li><strong>Cotización:</strong> "cambio el dólar y todo se recalcula" choca con "congelar la cotización". Propuesta: el costo queda congelado y el precio de venta del stock se actualiza solo si lo confirmás.</li>'
      + '<li><strong>Stock:</strong> el mockup no deja vender más unidades de las cargadas. ¿Se queda así o pasa a la fase 2?</li>'
      + '<li><strong>Recibo:</strong> ¿hoja A4 o ticket de 80 mm? ¿Se agrega el teléfono de la clienta?</li></ul>'
      + '<div class="card-foot"><span class="small muted">¿Querés empezar de cero?</span><button type="button" class="btn btn-sm btn-danger" data-guia="reiniciar">' + icon('refresh', 'i-sm') + 'Reiniciar datos</button></div>';
  }

  BG.refrescarGuia = () => { const g = $('#guide'); if (g && !g.hidden) g.innerHTML = htmlGuia(); };
  BG.abrirGuia = () => {
    const g = $('#guide');
    if (!g) return;
    if (!g.hidden) { g.hidden = true; return; }
    g.innerHTML = htmlGuia();
    g.hidden = false;
    const b = $('[data-guia="cerrar"]', g);
    if (b) b.focus();
    if (!g.dataset.enlazada) {
      g.dataset.enlazada = '1';
      g.addEventListener('change', (e) => {
        const c = e.target.dataset.check;
        if (!c) return;
        const h = leerHechos().filter((x) => x !== c);
        if (e.target.checked) h.push(c);
        guardarHechos(h);
        BG.refrescarGuia();
      });
      g.addEventListener('click', async (e) => {
        const cerrar = e.target.closest('[data-guia="cerrar"]');
        if (cerrar) { g.hidden = true; return; }
        if (e.target.closest('[data-guia="reiniciar"]')) {
          const ok = await BG.modal({ titulo: 'Reiniciar datos de ejemplo', cuerpo: '<p>Se descarta todo lo que cargaste mientras probabas y vuelven los datos de ejemplo del día de hoy.</p>', acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Reiniciar', valor: 'ok', clase: 'btn-danger-solid' }] });
          if (ok !== 'ok') return;
          BG.reiniciarDatos();
          BG.renderChrome();
          BG.toast('Datos de ejemplo reiniciados.');
          BG.ir('#/inicio');
          return;
        }
        const ir = e.target.closest('[data-ir]');
        if (!ir) return;
        const destino = ir.dataset.ir;
        if (window.matchMedia('(max-width: 899px)').matches) g.hidden = true;
        if (destino === 'buscar') { const q = $('#q-global'); if (q) { q.value = 'lor'; q.focus(); q.dispatchEvent(new Event('input')); } }
        else if (destino === 'recibo') BG.ir('#/recibo/v/' + BG.ultimaVentaId());
        else BG.ir(destino);
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !g.hidden && !document.querySelector('dialog[open]')) g.hidden = true; });
    }
  };
})();

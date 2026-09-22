/*!
 * berry.Glow_py — Pantallas: ingreso, inicio, clientes (lista, ficha y alta/edición).
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  /* ── Ingreso ─────────────────────────────────────────────────────────── */

  BG.vistas.login = () => {
    document.title = 'Gestión berry.Glow';
    $('#root').innerHTML = '<div class="login"><div class="login-card">'
      + '<div class="login-brand">' + BG.logo() + '</div>'
      + '<h1>Sistema de gestión · ingreso</h1>'
      + '<form id="login-form" class="stack" novalidate>'
      + '<div class="field"><label for="usuario">Usuario</label><input id="usuario" class="input" autocomplete="off" autocapitalize="none" spellcheck="false"></div>'
      + '<div class="field"><label for="clave">Contraseña</label><input id="clave" class="input" type="password" autocomplete="off"></div>'
      + '<p class="error-text" id="login-error" hidden></p>'
      + '<button class="btn btn-primary btn-lg btn-block" type="submit">Entrar</button></form>'
      + '<div class="demo-hint"><span><strong>Mockup:</strong> el ingreso es de mentira y no pide contraseña. Elegí con qué vista entrar:</span>'
      + '<div class="row"><button type="button" class="btn btn-sm" data-demo="ariel">Entrar como Ariel (dueño)</button>'
      + '<button type="button" class="btn btn-sm" data-demo="jazmin">Entrar como Jazmín (vendedora)</button></div>'
      + '<span class="small">Jazmín vende, cobra, acuerda cuotas, hace devoluciones y cambios, emite recibos, prepara envíos y puede poner precios especiales (ve la ganancia de ese precio); no ve costos ni dólar y no puede anular. Ariel ve todo y el registro de lo que hace cada una.</span></div>'
      + '<div class="login-tema"><span class="small muted">Tema de la pantalla</span>' + BG.selectorTema() + '</div>'
      + '</div></div>';
    const entrar = (usuario) => {
      const u = BG.db.usuarios.find((x) => x.usuario === String(usuario || '').trim().toLowerCase());
      if (!u) {
        const er = $('#login-error');
        er.textContent = 'Ese usuario no existe. En el mockup hay dos: «ariel» y «jazmin».';
        er.hidden = false;
        return;
      }
      BG.sesion = { usuarioId: u.id, rol: u.rol };
      BG.guardarSesion();
      if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
      BG.render();
    };
    $('#login-form').addEventListener('submit', (e) => { e.preventDefault(); entrar($('#usuario').value); });
    $$('[data-demo]').forEach((b) => b.addEventListener('click', () => entrar(b.dataset.demo)));
  };

  BG.vistas.sinPermiso = () => ({
    html: '<div class="page"><div class="callout callout-warn">' + icon('lock') + '<div><strong>Tu usuario no tiene permiso para esta pantalla.</strong> '
      + 'Puede tener costos, dólar o márgenes, o ' + esc(BG.nombreDuena()) + ' todavía no te habilitó esta tarea (Ajustes → Usuarios y permisos). '
      + '<button type="button" class="linkish" data-action="rol" data-rol="admin">Ver como ' + esc(BG.nombreDuena()) + '</button></div></div></div>',
  });

  /* ── Inicio ──────────────────────────────────────────────────────────── */

  function filaMovimiento(m) {
    return '<li><a class="list-row" href="' + m.href + '"><span class="avatar">' + icon(m.icono, 'i-sm') + '</span>'
      + '<span class="row-main"><span class="row-title' + (m.anulado ? ' strike' : '') + '">' + m.titulo + '</span><span class="row-sub">' + m.sub + '</span></span>'
      + '<span class="row-end"><span class="amount' + (m.anulado ? ' strike' : '') + '">' + gs(m.monto) + '</span>' + (m.extra || '') + '</span></a></li>';
  }

  BG.movimientosDelDia = (fecha) => {
    const movs = [];
    for (const v of BG.db.ventas) {
      for (const d of (v.devoluciones || []).filter((x) => x.fecha === fecha)) {
        movs.push({
          ts: d.ts, href: '#/ventas/' + v.id, icono: 'undo', monto: d.totalDespues - d.totalAntes,
          titulo: (d.tipo === 'devolucion' ? 'Devolución · ' : 'Cambio · ') + esc(BG.cliente(v.clienteId).nombre),
          sub: BG.fmtHora(d.ts) + ' · ' + d.cantidad + ' × ' + esc(d.descripcion) + (d.productoNuevo ? ' por ' + esc(d.productoNuevo) : d.talle ? ' (' + esc(d.talle) + ')' : '') + ' · ' + BG.fmtRecibo(v.recibo),
          extra: d.aFavor ? (d.reintegro ? '<span class="pill pill-muted">Se devolvió la plata</span>' : BG.pillFavor(d.aFavor)) : '',
        });
      }
    }
    for (const e of (BG.db.egresos || []).filter((x) => x.fecha === fecha)) {
      movs.push({
        ts: e.ts, href: '#/clientes/' + e.clienteId, icono: 'undo', monto: -e.monto,
        titulo: 'Plata devuelta · ' + esc(BG.cliente(e.clienteId).nombre), sub: BG.fmtHora(e.ts) + ' · ' + BG.FORMAS[e.forma] + ' · ' + esc(e.concepto),
        extra: '<span class="pill pill-warn">Salió de la caja</span>',
      });
    }
    for (const v of BG.db.ventas.filter((x) => x.fecha === fecha)) {
      const cli = BG.cliente(v.clienteId);
      const n = sum(v.items, BG.cantidadViva);
      movs.push({
        ts: v.ts, href: '#/ventas/' + v.id, icono: 'bag', anulado: !!v.anulada, monto: v.total,
        titulo: 'Venta · ' + esc(cli.nombre), sub: BG.fmtHora(v.ts) + ' · ' + n + (n === 1 ? ' artículo' : ' artículos') + ' · ' + BG.fmtRecibo(v.recibo),
        extra: BG.estadoVenta(v),
      });
    }
    for (const p of BG.db.pagos.filter((x) => x.fecha === fecha && !x.inicial)) {
      const cli = BG.cliente(p.clienteId);
      movs.push({
        ts: p.ts, href: p.ventaId ? '#/ventas/' + p.ventaId : '#/clientes/' + p.clienteId, icono: 'cash', anulado: !!p.anulado,
        monto: p.total + p.excedente, titulo: (p.ventaId ? 'Cobro · ' : 'Seña · ') + esc(cli.nombre),
        sub: BG.fmtHora(p.ts) + ' · ' + p.partes.map((x) => BG.FORMAS[x.forma]).join(' + ') + ' · ' + BG.fmtRecibo(p.recibo),
        extra: p.anulado ? '<span class="pill pill-muted">Anulado</span>' : p.excedente ? BG.pillFavor(p.excedente) : '',
      });
    }
    return movs.sort((a, b) => b.ts.localeCompare(a.ts));
  };

  /** Tarjeta «Tu mes» (vendedora) o resumen de la meta (dueño): avance de cobranza y comisión estimada. */
  BG.htmlMeta = (u, com, titulo) => {
    const pct = com.meta > 0 ? Math.min(100, Math.floor((com.cobrado * 100) / com.meta)) : 0;
    const falta = Math.max(0, com.meta - com.cobrado);
    return '<div class="meta-box"><div class="meta-top"><span class="meta-ic">' + icon('target') + '</span><div class="grow"><strong>' + titulo + '</strong>'
      + '<span class="small muted">Cobrado de ' + (BG.esDuena() ? 'sus' : 'tus') + ' ventas: ' + gs(com.cobrado) + (com.meta ? ' de ' + gs(com.meta) : '') + '</span></div>'
      + (com.meta ? '<span class="meta-pct">' + pct + ' %</span>' : '') + '</div>'
      + (com.meta ? '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Avance de la meta"><span style="width:' + pct + '%"></span></div>'
        + '<p class="small">' + (falta ? 'Faltan <strong>' + gs(falta) + '</strong> para la meta del mes.' : '<strong>¡Meta cumplida!</strong>') + '</p>' : '')
      + '<dl class="meta-nums"><div><dt>Comisión estimada</dt><dd>' + gs(com.comision) + '</dd></div>'
      + '<div><dt>Ventas del mes</dt><dd>' + com.ventas + '<span class="small muted"> · ' + gs(com.vendido) + '</span></dd></div></dl>'
      + '<p class="hint">' + (com.base === 'cobrado' ? com.porcentaje + ' % de lo que se cobra de ' + (BG.esDuena() ? 'sus' : 'tus') + ' ventas.'
        : com.porcentaje + ' % de la ganancia de lo que se cobra: los descuentos y precios especiales grandes bajan la comisión; vender cerca del precio de lista la sube.') + '</p></div>';
  };

  /** Lista corta de cuotas atrasadas y de esta semana (Inicio). */
  function cardCuotas() {
    const todas = BG.cuotasPendientes();
    const urgentes = todas.filter((x) => x.cuota.estado === 'vencida' || x.cuota.estado === 'hoy' || x.cuota.estado === 'semana');
    const atrasado = sum(todas.filter((x) => x.cuota.estado === 'vencida'), (x) => x.cuota.falta);
    const semana = sum(todas.filter((x) => x.cuota.estado === 'hoy' || x.cuota.estado === 'semana'), (x) => x.cuota.falta);
    return '<section class="card card-flush" aria-labelledby="t-cuotas"><div class="card-head pad"><h2 id="t-cuotas">Cuotas: atrasadas y de esta semana</h2><a class="small" href="#/cuotas">Ver todas</a></div>'
      + '<p class="pad-top small">' + (atrasado ? '<span class="pill pill-bad">' + icon('alert') + 'Atrasado ' + gs(atrasado) + '</span> ' : '') + (semana ? '<span class="pill pill-warn">' + icon('clock') + 'Vence esta semana ' + gs(semana) + '</span>' : '')
      + (!atrasado && !semana ? '<span class="muted">No hay cuotas atrasadas ni que venzan esta semana.</span>' : '') + '</p>'
      + (urgentes.length ? '<ul class="list list-plain">' + urgentes.slice(0, 6).map((x) => '<li><a class="list-row" href="#/ventas/' + x.venta.id + '"><span class="avatar">' + esc(BG.iniciales(x.cliente.nombre)) + '</span>'
        + '<span class="row-main"><span class="row-title">' + esc(x.cliente.nombre) + '</span><span class="row-sub">Cuota ' + x.cuota.n + ' de ' + x.cuota.de + ' · vence el ' + BG.fmtFechaCorta(x.cuota.vence) + '</span></span>'
        + '<span class="row-end"><span class="amount">' + gs(x.cuota.falta) + '</span>' + BG.pillCuota(x.cuota) + '</span></a></li>').join('') + '</ul>' : '')
      + '</section>';
  }

  /** Clientes con saldo a favor: la tienda les debe y hay que acordarse de usarlo. */
  function cardFavor() {
    const lista = BG.listaAFavor();
    const total = sum(lista, (x) => x.favor);
    const conDeuda = lista.filter((x) => x.debe > 0);
    return '<section class="card card-flush card-favor" aria-labelledby="t-favor"><div class="card-head pad"><h2 id="t-favor">' + icon('wallet') + 'Saldo a favor de clientes</h2><a class="small" href="#/clientes?filtro=favor">Ver los ' + lista.length + '</a></div>'
      + '<p class="pad-top favor-total"><strong>' + gs(total) + '</strong> <span class="small muted">en ' + lista.length + (lista.length === 1 ? ' cliente' : ' clientes') + ' · se descuenta solo en su próxima compra o al cobrarles</span></p>'
      + (conDeuda.length ? '<p class="pad-x-card callout callout-warn small">' + icon('info') + '<span>' + conDeuda.map((x) => esc(x.c.nombre.split(' ')[0])).join(', ') + (conDeuda.length === 1 ? ' tiene' : ' tienen')
        + ' saldo a favor y también debe: al cobrar, marcá «Usarlo para pagar».</span></p>' : '')
      + (lista.length ? '<ul class="list list-plain">' + lista.slice(0, 5).map((x) => '<li><a class="list-row" href="#/clientes/' + x.c.id + '">' + BG.filaCliente(x.c) + '</a></li>').join('') + '</ul>'
        : '<p class="empty">Nadie tiene saldo a favor.</p>')
      + '</section>';
  }

  BG.vistas.inicio = () => {
    const h = BG.hoy();
    const duena = BG.esDuena();
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    const ventasHoy = BG.db.ventas.filter((v) => v.fecha === h && !v.anulada);
    const f = BG.totalesPorForma(BG.db.pagos.filter((p) => p.fecha === h && !p.anulado));
    const cobrado = f.efectivo + f.transferencia + f.qr + f.tarjeta;
    const devueltoHoy = sum((BG.db.egresos || []).filter((e) => e.fecha === h), (e) => e.monto);
    const desglose = ['efectivo', 'transferencia', 'qr', 'tarjeta'].filter((k) => f[k] > 0).map((k) => BG.FORMAS_CORTAS[k] + ' ' + gs(f[k])).join(' · ') || 'Todavía sin cobros';
    const deudores = BG.listaDeudores();
    const aFavor = BG.listaAFavor();
    const cu = BG.cuadre();
    const cf = BG.cuadreFavor();
    const mes = h.slice(0, 7);
    const ventasMes = BG.db.ventas.filter((v) => v.fecha.slice(0, 7) === mes && !v.anulada);
    const movs = BG.movimientosDelDia(h);
    const cerrada = BG.cajaCerrada(h);
    const cfg = BG.db.config;
    const conCambiosMes = ventasMes.filter((v) => BG.cambiosDePrecio(v).length);
    const nCambiosMes = sum(conCambiosMes, (v) => BG.cambiosDePrecio(v).length);
    const u = BG.usuario();
    const [mDesde, mHasta] = BG.mesActual();
    const meta = !duena && u.comision && u.comision.activa && u.comision.ve ? BG.htmlMeta(u, BG.comisionDe(u, mDesde, mHasta), 'Tu mes: meta y comisión') : '';
    const quietos = duena ? BG.db.productos.filter((p) => BG.disponibles(p) > 0 && BG.diasSinVender(p) >= BG.DIAS_QUIETO) : [];
    const resMes = duena ? BG.resultado(mDesde, mHasta) : null;
    const cumples = duena ? BG.db.clientes.map((c) => ({ c: c, k: BG.cumpleDe(c) })).filter((x) => x.k && x.k.enSemana && x.k.dias >= -1).sort((a, b) => a.k.dias - b.k.dias) : [];
    const pedidosCamino = duena ? BG.db.pedidos.filter((p) => BG.estadoPedido(p) === 'en_camino') : [];
    const ultimoConteo = (BG.db.conteos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const conteoViejo = !duena ? '' : !ultimoConteo ? 'todavía no se hizo ninguno; conviene contar una vez por mes.'
      : BG.diasEntre(ultimoConteo.fecha, BG.hoy()) > 30 ? 'el último fue hace ' + BG.diasEntre(ultimoConteo.fecha, BG.hoy()) + ' días; conviene contar de nuevo.' : '';

    const qb = (href, ic, t, sub, main) => '<a class="quick-btn' + (main ? ' is-main' : '') + '" href="' + href + '"><span class="qi">' + icon(ic) + '</span><span>' + t + '<small>' + sub + '</small></span></a>';
    const rapidas = [
      BG.puede('registrarVentas') && qb('#/ventas/nueva', 'bag', 'Nueva venta', 'Uno o varios artículos', true),
      BG.puede('registrarCobros') && qb('#/cobros/nuevo', 'cash', 'Registrar cobro', 'También pagos mixtos'),
      duena && qb('#/productos/nuevo', 'tag', 'Cargar producto', 'Calcula el precio de venta'),
      BG.puede('prepararEnvios') && qb('#/envios/nuevo', 'truck', 'Preparar envío', 'Etiqueta lista para pegar'),
      BG.puede('editarClientes') && qb('#/clientes/nuevo', 'user', 'Nuevo cliente', 'Avisa si ya existe'),
      !duena && BG.puede('verPrecios') && qb('#/productos', 'tag', 'Lista de precios', 'Precios y stock'),
    ].filter(Boolean).slice(0, 4);
    const pendientes = BG.db.envios.filter((x) => x.estado === 'preparando' || x.estado === 'listo').sort((a, b) => a.creado.localeCompare(b.creado));
    const cardEnvios = BG.puede('prepararEnvios') ? '<section class="card card-flush" aria-labelledby="t-env"><div class="card-head pad"><h2 id="t-env">Envíos para despachar</h2><a class="small" href="#/envios">Ver envíos</a></div>'
      + (pendientes.length ? '<ul class="list list-plain">' + pendientes.slice(0, 5).map((x) => '<li><a class="list-row" href="#/envios/' + x.id + '"><span class="avatar">' + icon('truck', 'i-sm') + '</span>'
        + '<span class="row-main"><span class="row-title">' + esc(x.destinatario.nombre) + ' → ' + esc(x.destinatario.ciudad) + '</span><span class="row-sub">' + esc(x.numero) + ' · ' + esc(x.empresa) + '</span></span>'
        + '<span class="row-end">' + BG.pillEnvio(x) + '</span></a></li>').join('') + '</ul>' : '<p class="empty">No hay envíos pendientes.</p>') + '</section>' : '';
    const tileLink = (href, label, valor, sub, cls) => '<a class="tile tile-link' + (cls ? ' ' + cls : '') + '" href="' + href + '"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span><span class="tile-sub">' + sub + '</span></a>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><p class="eyebrow">' + BG.fmtFechaLarga(h) + '</p><h1 class="page-title">' + saludo + ', ' + esc(u.nombre) + '</h1></div></div>'
      + (rapidas.length ? '<section class="quick" aria-label="Acciones rápidas">' + rapidas.join('') + '</section>' : '')
      + (meta ? '<section class="card" aria-label="Tu meta del mes">' + meta + '</section>' : '')
      + '<section class="tiles tiles-5 tiles-compact" aria-label="Resumen">'
      + '<div class="tile"><span class="tile-label">Vendido hoy</span><span class="tile-value">' + gs(sum(ventasHoy, (v) => v.total)) + '</span><span class="tile-sub">' + ventasHoy.length + (ventasHoy.length === 1 ? ' venta' : ' ventas') + '</span></div>'
      + '<div class="tile"><span class="tile-label">Cobrado hoy</span><span class="tile-value">' + gs(cobrado) + '</span><span class="tile-sub">' + desglose + (devueltoHoy ? ' · devuelto ' + gs(devueltoHoy) : '') + '</span></div>'
      + tileLink('#/clientes?filtro=deben', 'Por cobrar', gs(sum(deudores, (d) => d.saldo)), deudores.length + ' clientes con saldo')
      + tileLink('#/clientes?filtro=favor', icon('wallet', 'i-sm') + 'Saldo a favor', gs(sum(aFavor, (x) => x.favor)), aFavor.length + (aFavor.length === 1 ? ' cliente: la tienda le debe' : ' clientes: la tienda les debe'), 'tile-favor')
      + (duena ? tileLink('#/gastos', 'Ganancia neta de ' + BG.MESES[Number(mes.slice(5, 7)) - 1], gs(resMes.neta), 'bruta ' + gs(resMes.bruta) + ' − gastos ' + gs(resMes.totalGastos), resMes.neta < 0 ? 'tile-bad' : '') : '')
      + '</section>'
      + '<div class="grid-2">' + cardCuotas() + cardFavor() + '</div>'
      + '<div class="grid-2">'
      + '<section class="card card-flush" aria-labelledby="t-deben"><div class="card-head pad"><h2 id="t-deben">Clientes que deben</h2><a class="small" href="#/clientes?filtro=deben">Ver los ' + deudores.length + '</a></div>'
      + (deudores.length ? '<ul class="list list-plain">' + deudores.slice(0, 6).map((d) => '<li><a class="list-row" href="#/clientes/' + d.c.id + '">' + BG.filaCliente(d.c) + '</a></li>').join('') + '</ul>'
        : '<p class="empty">Nadie debe nada.</p>')
      + '</section>'
      + '<section class="card card-flush" aria-labelledby="t-hoy"><div class="card-head pad"><h2 id="t-hoy">Movimientos de hoy</h2>'
      + (BG.puede('verCaja') ? '<a class="small" href="#/caja">Caja del día</a>' : '<a class="small" href="#/ventas?periodo=hoy">Ventas de hoy</a>') + '</div>'
      + (movs.length ? '<ul class="list list-plain">' + movs.slice(0, 7).map(filaMovimiento).join('') + '</ul>' : '<p class="empty">Todavía no hay ventas ni cobros hoy.</p>')
      + '</section></div>'
      + '<div class="grid-2">' + cardEnvios
      + '<div class="stack">'
      // Los controles contables son del dueño: a la vendedora no le suman nada para vender.
      + (duena ? '<div class="callout ' + (cu.ok ? 'callout-good' : 'callout-bad') + '">' + icon(cu.ok ? 'shield' : 'alert') + '<div><strong>'
        + (cu.ok ? 'Las cuentas por cobrar cuadran.' : 'Hay un descuadre en las cuentas por cobrar.') + '</strong> La suma de saldos cliente por cliente (' + gs(cu.porClientes) + ') '
        + (cu.ok ? 'coincide con' : 'no coincide con') + ' el total por cobrar del sistema (' + gs(cu.libro) + '). Se controla solo, cada vez que se abre esta pantalla.</div></div>'
        + '<div class="callout ' + (cf.ok ? 'callout-good' : 'callout-bad') + '">' + icon(cf.ok ? 'shield' : 'alert') + '<div><strong>'
        + (cf.ok ? 'Los saldos a favor cuadran.' : 'Hay un descuadre en los saldos a favor.') + '</strong> Registrado: ' + gs(cf.registro) + ' · reconstruido desde pagos de más, señas, devoluciones, canjes, anulaciones y plata devuelta: ' + gs(cf.reconstruido)
        + (cf.negativos.length ? ' · <strong>' + cf.negativos.length + ' en negativo</strong>' : ' · ninguno en negativo') + '.</div></div>' : '')
      + (BG.puede('verCaja') ? '<div class="callout">' + icon(cerrada ? 'lock' : 'register') + '<div><strong>Caja de hoy: ' + (cerrada ? 'cerrada' : 'abierta') + '.</strong> '
        + (cerrada ? 'Los movimientos de hoy ya no se pueden anular sin autorización.' : 'Al terminar el día hacé el arqueo: el sistema compara el efectivo contado con lo cobrado (menos la plata devuelta).')
        + ' <a href="#/caja">Ir a la caja</a>'
        + (duena ? '<br><span class="small">Dólar ' + C.fmtCot(cfg.cotizacion.valor) + ' desde el ' + BG.fmtFecha(cfg.cotizacion.fecha) + ' · Courier ' + C.fmtUSD(cfg.tarifa.valor) + '/kg · <a href="#/ajustes">cambiar</a></span>' : '')
        + '</div></div>' : '')
      + (duena && nCambiosMes ? '<a class="callout callout-link" href="#/resumen">' + icon('tag') + '<div><strong>Precios especiales este mes: ' + nCambiosMes + '</strong> '
        + gs(sum(conCambiosMes, BG.rebajaVenta)) + ' menos que el precio de lista. Mirá quién los puso, el motivo y cómo quedó la ganancia.</div></a>' : '')
      + (quietos.length ? '<a class="callout callout-link" href="#/reportes?tab=stock">' + icon('pause') + '<div><strong>Stock sin movimiento: ' + quietos.length + (quietos.length === 1 ? ' producto' : ' productos') + '</strong> '
        + 'con ' + BG.DIAS_QUIETO + ' días o más sin venderse (' + gs(sum(quietos, (p) => BG.disponibles(p) * (p.costoTotalGs || 0))) + ' parados al costo). Candidatos a liquidación.</div></a>' : '')
      + (cumples.length ? '<a class="callout callout-link" href="#/reportes?tab=clientas">' + icon('gift') + '<div><strong>Cumpleaños de esta semana: ' + cumples.map((x) => esc(x.c.nombre.split(' ')[0]) + ' (' + BG.textoCumple(x.k) + ')').join(', ') + '.</strong> '
        + 'Mandales un saludo; si compran esta semana tienen su regalo del ' + BG.configFidelidad().cumple.porcentaje + ' %.</div></a>' : '')
      + pedidosCamino.map((p) => { const dias = p.llegaEstimada ? BG.diasEntre(BG.hoy(), p.llegaEstimada) : null;
        return '<a class="callout callout-link" href="#/pedidos/' + p.id + '">' + icon('box2') + '<div><strong>Pedido en camino: ' + esc(p.proveedor) + '</strong> '
          + (dias == null ? '' : dias > 0 ? 'llega en ' + dias + (dias === 1 ? ' día' : ' días') + ' (' + BG.fmtFecha(p.llegaEstimada) + ')' : dias === 0 ? 'llega hoy' : 'tendría que haber llegado el ' + BG.fmtFecha(p.llegaEstimada))
          + '. Cuando llegue, «Llegó: cargar al stock».</div></a>'; }).join('')
      + (conteoViejo ? '<a class="callout callout-link" href="#/productos/conteo">' + icon('count') + '<div><strong>Conteo de inventario:</strong> ' + conteoViejo + '</div></a>' : '')
      + (duena ? '<a class="callout callout-link" href="#/resumen">' + icon('pie') + '<div><strong>Resumen gráfico</strong> Ventas y cobros por semana, meta y comisión de ' + esc((BG.db.usuarios.find((x) => x.rol === 'vendedor') || { nombre: 'la vendedora' }).nombre) + ', precios especiales, devoluciones, deudas por antigüedad y lo que hizo cada usuario.</div></a>' : '')
      + '</div></div>'
      + '</div>';
    return { html: html };
  };

  /* ── Clientes: lista ─────────────────────────────────────────────────── */

  BG.vistas.clientes = (args, params) => {
    const e = { filtro: params.get('filtro') || 'todos', q: params.get('q') || '' };
    e.orden = e.filtro === 'deben' ? 'saldo' : e.filtro === 'favor' ? 'favor' : 'nombre';
    const todos = BG.db.clientes;
    const nDeben = todos.filter((c) => BG.saldoCliente(c.id) > 0).length;
    const nFavor = todos.filter((c) => BG.creditoCliente(c.id) > 0).length;
    const totalFavor = sum(todos, (c) => Math.max(0, BG.creditoCliente(c.id)));
    const chip = (f, t, n) => '<button type="button" class="chip" data-filtro="' + f + '" aria-pressed="' + (e.filtro === f) + '">' + t + ' <span class="count">' + n + '</span></button>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Clientes</h1><p class="page-sub">' + todos.length + ' clientes · ' + gs(sum(BG.listaDeudores(), (d) => d.saldo)) + ' por cobrar'
      + (totalFavor ? ' · <span class="t-favor">' + gs(totalFavor) + ' de saldo a favor</span>' : '') + '</p></div>'
      + (BG.puede('editarClientes') ? '<div class="page-actions"><a class="btn btn-primary" href="#/clientes/nuevo">' + icon('plus') + 'Nuevo cliente</a></div>' : '') + '</div>'
      + '<div class="toolbar">'
      + '<div class="search-box grow"><label class="sr-only" for="q-clientes">Buscar cliente</label>' + icon('search')
      + '<input id="q-clientes" class="search-input" type="search" autocomplete="off" placeholder="Nombre, CI/RUC o teléfono (tolera errores de tipeo)" value="' + esc(e.q) + '"></div>'
      + '<div class="chips" role="group" aria-label="Filtrar">' + chip('todos', 'Todos', todos.length) + chip('deben', 'Con saldo', nDeben) + chip('aldia', 'Al día', todos.length - nDeben)
      + chip('favor', 'A favor', nFavor) + '</div>'
      + '<label class="sr-only" for="orden">Ordenar</label><select id="orden" class="select select-auto">'
      + '<option value="nombre">Por nombre</option><option value="saldo">Mayor saldo primero</option><option value="antiguedad">Deuda más antigua primero</option><option value="favor">Mayor saldo a favor primero</option></select>'
      + '</div>'
      + '<ul class="list" id="lista-clientes"></ul>'
      + '</div>';
    const pintar = (root) => {
      const q = e.q.trim();
      let lista = q ? BG.buscarClientes(q, 200) : todos.slice();
      const saldos = new Map(lista.map((c) => [c.id, BG.saldoCliente(c.id)]));
      if (e.filtro === 'deben') lista = lista.filter((c) => saldos.get(c.id) > 0);
      if (e.filtro === 'aldia') lista = lista.filter((c) => saldos.get(c.id) <= 0);
      if (e.filtro === 'favor') lista = lista.filter((c) => BG.creditoCliente(c.id) > 0);
      if (!q) {
        if (e.orden === 'saldo') lista.sort((a, b) => saldos.get(b.id) - saldos.get(a.id));
        else if (e.orden === 'favor') lista.sort((a, b) => BG.creditoCliente(b.id) - BG.creditoCliente(a.id) || a.nombre.localeCompare(b.nombre, 'es'));
        else if (e.orden === 'antiguedad') lista.sort((a, b) => (BG.deudaMasAntigua(a.id) || '9999').localeCompare(BG.deudaMasAntigua(b.id) || '9999'));
        else lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      }
      $('#lista-clientes', root).innerHTML = lista.length
        ? lista.map((c) => '<li><a class="list-row" href="#/clientes/' + c.id + '">' + BG.filaCliente(c, q) + '</a></li>').join('')
        : '<li class="empty">Ningún cliente coincide. <a href="#/clientes/nuevo?nombre=' + encodeURIComponent(q) + '">Crear «' + esc(q) + '»</a></li>';
    };
    return {
      html: html,
      mount: (root) => {
        $('#orden', root).value = e.orden;
        pintar(root);
        const q = $('#q-clientes', root);
        q.addEventListener('input', () => { e.q = q.value; pintar(root); });
        $('#orden', root).addEventListener('change', (ev) => { e.orden = ev.target.value; pintar(root); });
        $$('[data-filtro]', root).forEach((b) => b.addEventListener('click', () => {
          e.filtro = b.dataset.filtro;
          $$('[data-filtro]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
        if (!('ontouchstart' in window)) q.focus();
      },
    };
  };

  /* ── Clientes: ficha ─────────────────────────────────────────────────── */

  function filaVenta(v) {
    const n = sum(v.items, BG.cantidadViva);
    const vivos = v.items.filter((it) => BG.cantidadViva(it) > 0);
    const nombres = (vivos.length ? vivos : v.items).map((it) => it.descripcion).join(', ');
    const ep = BG.estadoPlan(v);
    const devs = v.devoluciones || [];
    return '<li><a class="sale-row" href="#/ventas/' + v.id + '">'
      + '<span class="sale-date">' + BG.fmtFecha(v.fecha) + '<small>' + BG.fmtRecibo(v.recibo) + '</small></span>'
      + '<span class="sale-desc"><span class="row-title' + (v.anulada ? ' strike' : '') + '">' + esc(nombres) + '</span>'
      + '<span class="row-sub">' + n + (n === 1 ? ' artículo' : ' artículos') + ' · total ' + gs(v.total) + (v.anulada ? '' : ' · pagado ' + gs(BG.pagadoVenta(v))) + '</span></span>'
      + '<span class="sale-end">' + BG.estadoVenta(v) + (!v.anulada && BG.saldoVenta(v) > 0 ? (ep && ep.proxima ? BG.pillCuota(ep.proxima) : BG.edad(v.fecha)) : '')
      + (devs.length ? '<span class="pill pill-muted">' + icon('undo') + (devs.some((d) => d.tipo !== 'devolucion') ? 'Con cambio' : 'Con devolución') + '</span>' : '') + '</span></a></li>';
  }
  BG.filaVenta = filaVenta;

  /**
   * Estado de cuenta exacto: la compra con su total original, después cada ajuste de precio, devolución o cambio en su fecha,
   * los pagos, y lo que una devolución pasó a saldo a favor (sale de esta cuenta y entra en la de saldo a favor).
   * La última línea siempre da el saldo actual.
   */
  function libroCliente(cid) {
    const mov = [];
    for (const v of BG.ventasDeCliente(cid)) {
      const num = BG.fmtRecibo(v.recibo);
      const cambios = (v.ajustes || []).map((a) => ({ ts: a.ts, fecha: a.fecha, delta: a.totalDespues - a.totalAntes, concepto: 'Precio ajustado en la compra ' + num + ' · ' + a.descripcion }))
        .concat((v.devoluciones || []).filter((d) => d.totalDespues !== d.totalAntes).map((d) => ({
          ts: d.ts, fecha: d.fecha, delta: d.totalDespues - d.totalAntes,
          concepto: (d.tipo === 'cambio' ? 'Cambio' : 'Devolución') + ' en la compra ' + num + ' · ' + d.cantidad + ' × ' + d.descripcion + (d.productoNuevo ? ' por ' + d.productoNuevo : ''),
        })));
      const totalOriginal = v.total - sum(cambios, (x) => x.delta);
      mov.push({ ts: v.ts, fecha: v.fecha, concepto: 'Compra ' + num + ' · ' + v.items.filter((it) => !it.cambioDe).map((it) => it.descripcion).join(', '), cargo: v.anulada ? 0 : totalOriginal, anulado: v.anulada ? 'Anulada: ' + v.anulada.motivo : '' });
      if (v.anulada) continue;
      cambios.forEach((x) => mov.push({ ts: x.ts, fecha: x.fecha, concepto: x.concepto, cargo: x.delta > 0 ? x.delta : 0, abono: x.delta < 0 ? -x.delta : 0 }));
      (v.devoluciones || []).filter((d) => d.aFavor).forEach((d) => mov.push({ ts: d.ts + ':01', fecha: d.fecha, concepto: 'Lo pagado de más pasó a saldo a favor' + (d.reintegro ? ' (se le devolvió en ' + BG.FORMAS[d.forma].toLowerCase() + ')' : ''), cargo: d.aFavor }));
    }
    for (const p of BG.db.pagos.filter((x) => x.clienteId === cid && x.ventaId)) {
      const v = BG.venta(p.ventaId);
      mov.push({ ts: p.ts, fecha: p.fecha, concepto: 'Pago ' + BG.fmtRecibo(p.recibo) + ' · ' + p.partes.map((x) => BG.FORMAS[x.forma]).join(' + '), abono: p.anulado || v.anulada ? 0 : p.total, anulado: p.anulado ? 'Anulado: ' + p.anulado.motivo : (v.anulada ? 'Pasó a saldo a favor' : '') });
      if (p.anulado && p.anulado.aFavorRevertido && !v.anulada) mov.push({ ts: p.anulado.ts + ':01', fecha: p.anulado.fecha, concepto: 'Sin ese pago, la devolución ya no deja saldo a favor', abono: p.anulado.aFavorRevertido });
    }
    mov.sort((a, b) => a.ts.localeCompare(b.ts));
    let saldo = 0;
    return mov.map((m) => { saldo += (m.cargo || 0) - (m.abono || 0); return Object.assign(m, { saldo: saldo }); });
  }

  /** Devolver en plata todo o parte del saldo a favor (sale de la caja; la vendedora necesita el PIN del dueño). */
  BG.devolverFavorUI = async (c) => {
    const disponible = BG.creditoCliente(c.id);
    const st = { monto: disponible, forma: 'efectivo', nota: '' };
    const r = await BG.modal({
      titulo: 'Devolver saldo a favor en plata',
      cuerpo: '<p><strong>' + esc(c.nombre) + '</strong> tiene <strong>' + gs(disponible) + '</strong> a favor. Lo que se devuelve sale de la caja de hoy y baja su saldo a favor; queda en la auditoría.</p>'
        + '<div class="field"><label for="dv-monto">Monto a devolver</label>' + BG.campoGs('dv-monto', disponible, '') + '</div>'
        + '<div class="field"><span class="field-label" id="dv-forma-l">Cómo se devuelve</span><div class="seg" role="radiogroup" aria-labelledby="dv-forma-l">'
        + '<label><input type="radio" name="dv-forma" value="efectivo" checked>Efectivo</label><label><input type="radio" name="dv-forma" value="transferencia">Transferencia</label></div></div>'
        + '<div class="field"><label for="dv-nota">Detalle</label><input id="dv-nota" class="input" maxlength="120" autocomplete="off" placeholder="Ej.: prefirió la plata"></div>'
        + (BG.esDuena() ? '' : '<p class="hint">Como sale plata de la caja, se pide el PIN de ' + esc(BG.nombreDuena()) + '.</p>')
        + '<p class="error-text" id="dv-error" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Devolver', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        const er = $('#dv-error', dlg);
        st.monto = BG.leerGs($('#dv-monto', dlg));
        st.forma = $('input[name="dv-forma"]:checked', dlg).value;
        st.nota = $('#dv-nota', dlg).value;
        const falla = (m) => { er.textContent = m; er.hidden = false; return false; };
        if (!(st.monto > 0)) return falla('Escribí cuánto se le devuelve.');
        if (st.monto > disponible) return falla('Tiene ' + gs(disponible) + ' a favor: no se puede devolver más.');
        return true;
      },
      onMount: (dlg) => { const f = $('#dv-monto', dlg); f.focus(); f.select(); },
    });
    if (r !== 'ok') return false;
    let autorizadoPor = null;
    const cerrada = BG.cajaCerrada(BG.hoy());
    if (!BG.esDuena() || cerrada) {
      if (!(await BG.pedirPin((cerrada ? 'La caja de hoy ya está cerrada. ' : '') + 'Devolver ' + gs(st.monto) + ' en ' + BG.FORMAS[st.forma].toLowerCase() + ' a ' + c.nombre + '.'))) return false;
      autorizadoPor = BG.nombreDuena();
    }
    BG.devolverSaldoAFavor({ clienteId: c.id, monto: st.monto, forma: st.forma, nota: st.nota, autorizadoPor: autorizadoPor });
    BG.toast('Devueltos ' + gs(st.monto) + ' a ' + c.nombre.split(' ')[0] + '. Le quedan ' + gs(BG.creditoCliente(c.id)) + ' a favor.');
    return true;
  };

  /** Solo para el dueño: límite de crédito, puntos, cumpleaños y compras recientes de la clienta. */
  function cardCreditoBeneficios(c) {
    const cfg = BG.configCredito();
    const limite = BG.limiteDe(c);
    const debe = BG.saldoCliente(c.id);
    const ec = BG.estadoCredito(c.id, 1);
    const pts = BG.puntosDe(c.id);
    const k = BG.cumpleDe(c);
    const recientes = BG.comprasRecientes(c.id, 90);
    const pct = limite > 0 ? Math.min(100, Math.floor((debe * 100) / limite)) : 0;
    return '<section class="card stack" aria-labelledby="t-cb"><div class="card-head"><h2 id="t-cb">Crédito y beneficios</h2><a class="small" href="#/clientes/' + c.id + '/editar">Cambiar</a></div>'
      + '<div class="grid-2 grid-mini">'
      + '<div class="stack-sm"><span class="field-label">Crédito</span>'
      + (!cfg.activo ? '<p class="small">Sin límite de crédito (se activa en Ajustes).</p>'
        : limite === 0 ? '<p><span class="pill pill-warn">' + icon('lock') + 'Solo al contado</span></p>'
          : '<p class="small">Debe <strong>' + gs(debe) + '</strong> de <strong>' + gs(limite) + '</strong> ' + (c.limite != null ? '(límite propio)' : '(límite general)') + '</p>'
            + '<div class="progress' + (pct >= 100 ? ' progress-bad' : pct >= 80 ? ' progress-warn' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Crédito usado"><span style="width:' + pct + '%"></span></div>')
      + (ec.motivos.indexOf('atraso') >= 0 ? '<p class="small t-devuelto">No puede llevar a cuenta: cuota atrasada hace ' + ec.atraso + ' días.</p>' : '') + '</div>'
      + '<div class="stack-sm"><span class="field-label">Clienta frecuente</span>'
      + '<p class="small">' + recientes.length + (recientes.length === 1 ? ' compra' : ' compras') + ' en 90 días por ' + gs(sum(recientes, (v) => v.total)) + (BG.esFrecuente(c.id) ? ' <span class="pill pill-berry">' + icon('star') + 'Frecuente</span>' : '') + '</p>'
      + (pts ? '<p class="small">' + icon('star', 'i-sm') + ' <strong>' + pts.puntos + ' puntos</strong> = ' + gs(pts.valor) + (pts.canjeable ? ' · se pueden canjear al venderle' : ' · canjea desde ' + BG.configFidelidad().minimo) + '</p>' : '')
      + '<p class="small">' + icon('gift', 'i-sm') + ' ' + (k ? 'Cumple el ' + BG.fmtFechaCorta(k.fecha) + (k.enSemana ? ' (' + BG.textoCumple(k) + ')' + (BG.regaloCumple(c.id) ? ' · regalo disponible' : BG.regaloCumpleUsado(c.id) ? ' · ya usó el regalo' : '') : '') : 'Sin fecha de cumpleaños: agregala en «Cambiar».') + '</p></div>'
      + '</div></section>';
  }

  BG.vistas.cliente = (args) => {
    const c = BG.cliente(args[0]);
    if (!c) return { html: '<div class="page"><p class="empty">No encontramos ese cliente. <a href="#/clientes">Volver a clientes</a></p></div>' };
    const saldo = BG.saldoCliente(c.id);
    const aFavor = BG.creditoCliente(c.id);
    const pend = BG.pendientesDe(c.id);
    const ventas = BG.ventasDeCliente(c.id).slice().sort((a, b) => b.ts.localeCompare(a.ts));
    const libro = libroCliente(c.id);
    const creditos = BG.db.creditos.filter((x) => x.clienteId === c.id).sort((a, b) => a.ts.localeCompare(b.ts));
    const envios = BG.db.envios.filter((x) => x.clienteId === c.id).sort((a, b) => b.creado.localeCompare(a.creado));
    const primerNombre = c.nombre.split(' ')[0];
    const cuotas = BG.cuotasPendientes().filter((x) => x.cliente.id === c.id);
    const puedeDevolver = BG.esDuena() || BG.puede('devoluciones');
    const textoWa = saldo > 0
      ? 'Hola ' + primerNombre + ', te escribimos de ' + BG.db.config.tienda.nombre + '. Tu saldo pendiente es de ' + gs(saldo) + '.' + (aFavor > 0 ? ' Además tenés ' + gs(aFavor) + ' a favor.' : '') + ' ¡Gracias!'
      : aFavor > 0 ? 'Hola ' + primerNombre + ', te escribimos de ' + BG.db.config.tienda.nombre + '. Tenés ' + gs(aFavor) + ' a favor para tu próxima compra. ¡Te esperamos!'
        : 'Hola ' + primerNombre + ', te escribimos de ' + BG.db.config.tienda.nombre + '.';
    const html = '<div class="page">'
      + '<a class="back-link" href="#/clientes">' + icon('left', 'i-sm') + 'Clientes</a>'
      + '<div class="profile-head"><span class="avatar avatar-lg">' + esc(BG.iniciales(c.nombre)) + '</span>'
      + '<div class="grow"><h1 class="page-title">' + esc(c.nombre) + '</h1><p class="meta">'
      + (c.ci ? '<span>' + (c.ci.includes('-') ? 'RUC ' : 'CI ') + esc(c.ci) + '</span>' : '<span class="muted">Sin CI/RUC</span>')
      + '<span>' + icon('phone', 'i-sm') + esc(c.telefono) + '</span>'
      + (c.direccion ? '<span>' + esc(c.direccion) + '</span>' : '') + (c.email ? '<span>' + esc(c.email) + '</span>' : '')
      + '<span class="muted">Cliente desde el ' + BG.fmtFecha(c.alta) + '</span></p></div>'
      + (BG.puede('editarClientes') ? '<div class="page-actions"><a class="btn btn-quiet" href="#/clientes/' + c.id + '/editar">' + icon('edit') + 'Editar</a></div>' : '') + '</div>'
      + (aFavor > 0 ? '<section class="favor-banner" aria-label="Saldo a favor"><span class="favor-ic">' + icon('wallet') + '</span>'
        + '<div class="grow"><p class="favor-label">Saldo a favor</p><p class="favor-monto">' + gs(aFavor) + '</p>'
        + '<p class="small">La tienda le debe este monto. Se descuenta solo en su próxima compra' + (saldo > 0 ? ' o al cobrarle lo que debe' : '') + '; el detalle está en la pestaña «Saldo a favor».</p></div>'
        + '<div class="favor-actions">'
        + (saldo > 0 && BG.puede('registrarCobros') ? '<a class="btn btn-primary" href="#/cobros/nuevo?cliente=' + c.id + '&usar=1">' + icon('cash') + 'Usarlo para pagar lo que debe</a>' : '')
        + (BG.puede('registrarVentas') ? '<a class="btn" href="#/ventas/nueva?cliente=' + c.id + '">' + icon('bag') + 'Usarlo en una venta</a>' : '')
        + (puedeDevolver ? '<button type="button" class="btn" data-accion="devolver-favor">' + icon('undo') + 'Devolver en plata</button>' : '')
        + '</div></section>' : '')
      + '<section class="balance' + (saldo > 0 ? '' : ' is-clear') + '" aria-label="Saldo">'
      + '<div><p class="balance-label">' + (saldo > 0 ? 'Saldo pendiente' : 'Cuenta al día') + '</p><p class="hero-figure">' + gs(saldo) + '</p>'
      + '<p class="balance-sub">' + (pend.length ? 'En ' + pend.length + (pend.length === 1 ? ' compra' : ' compras') + ' · la más antigua ' + BG.haceDias(pend[0].fecha) : 'No debe nada.') + '</p></div>'
      + '<div class="balance-actions">'
      + (saldo > 0 && BG.puede('registrarCobros') ? '<a class="btn btn-primary" href="#/cobros/nuevo?cliente=' + c.id + '">' + icon('cash') + 'Registrar cobro</a>' : '')
      + (BG.puede('registrarVentas') ? '<a class="btn' + (saldo > 0 ? '' : ' btn-primary') + '" href="#/ventas/nueva?cliente=' + c.id + '">' + icon('bag') + 'Nueva venta</a>' : '')
      + (BG.puede('emitirRecibos') ? '<a class="btn" href="#/recibo/c/' + c.id + '">' + icon('receipt') + 'Estado de cuenta</a>' : '')
      + (BG.puede('prepararEnvios') ? '<a class="btn" href="#/envios/nuevo?cliente=' + c.id + '">' + icon('truck') + 'Preparar envío</a>' : '')
      + '<a class="btn" href="' + BG.waLink(c, textoWa) + '" target="_blank" rel="noopener">' + icon('chat') + 'WhatsApp</a>'
      + '</div></section>'
      + (c.notas ? '<div class="callout">' + icon('info') + '<div>' + esc(c.notas) + '</div></div>' : '')
      + (BG.esDuena() ? cardCreditoBeneficios(c) : '')
      + (cuotas.length ? '<section class="card card-flush" aria-labelledby="t-cc"><div class="card-head pad"><h2 id="t-cc">Cuotas acordadas</h2><a class="small" href="#/cuotas">Todas las cuotas</a></div>'
        + '<ul class="list list-plain">' + cuotas.map((x) => '<li class="list-row"><span class="avatar">' + icon('calendar', 'i-sm') + '</span>'
          + '<span class="row-main"><a class="row-title" href="#/ventas/' + x.venta.id + '">Cuota ' + x.cuota.n + ' de ' + x.cuota.de + ' · ' + BG.fmtRecibo(x.venta.recibo) + '</a>'
          + '<span class="row-sub">Vence el ' + BG.fmtFecha(x.cuota.vence) + (x.cuota.pagado ? ' · ya pagó ' + gs(x.cuota.pagado) + ' de ' + gs(x.cuota.monto) : '') + '</span></span>'
          + '<span class="row-end"><span class="amount">' + gs(x.cuota.falta) + '</span>' + BG.pillCuota(x.cuota)
          + (x.cuota.estado !== 'futura' ? '<a class="btn btn-sm" href="' + BG.waLink(c, BG.textoRecordatorio(c, x.venta, x.cuota)) + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Recordar</a>' : '') + '</span></li>').join('')
        + '</ul></section>' : '')
      + '<div><div class="tabs" role="tablist">'
      + '<button type="button" class="tab-btn" role="tab" aria-selected="true" data-tab="compras">Compras (' + ventas.length + ')</button>'
      + '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="movs">Movimientos</button>'
      + (envios.length ? '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="envios">Envíos (' + envios.length + ')</button>' : '')
      + (creditos.length ? '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="favor">Saldo a favor' + (aFavor > 0 ? ' · ' + gs(aFavor) : '') + '</button>' : '')
      + '</div>'
      + (envios.length ? '<div data-panel="envios" hidden><ul class="list list-top">' + envios.map((x) => '<li><a class="list-row" href="' + (BG.puede('prepararEnvios') ? '#/envios/' + x.id : '#/clientes/' + c.id) + '">'
        + '<span class="avatar">' + icon('truck', 'i-sm') + '</span><span class="row-main"><span class="row-title">' + esc(x.numero) + ' → ' + esc(x.destinatario.ciudad) + '</span>'
        + '<span class="row-sub">' + esc(x.empresa) + (x.guia ? ' · guía ' + esc(x.guia) : '') + ' · ' + BG.fmtFecha(x.creado.slice(0, 10)) + '</span></span>'
        + '<span class="row-end">' + BG.pillEnvio(x) + '</span></a></li>').join('') + '</ul></div>' : '')
      + '<div data-panel="compras">' + (ventas.length ? '<ul class="list list-top">' + ventas.map(filaVenta).join('') + '</ul>' : '<p class="empty">Todavía no compró nada.</p>') + '</div>'
      + '<div data-panel="movs" hidden><div class="table-wrap list-top"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Compra</th><th class="num">Pago</th><th class="num">Saldo</th></tr></thead><tbody>'
      + libro.map((m) => '<tr><td class="nowrap">' + BG.fmtFecha(m.fecha) + '</td><td><span class="' + (m.anulado ? 'strike' : '') + '">' + esc(m.concepto) + '</span>'
        + (m.anulado ? '<div class="t-sub">' + esc(m.anulado) + '</div>' : '') + '</td><td class="num">' + (m.cargo ? gs(m.cargo) : '') + '</td><td class="num">' + (m.abono ? gs(m.abono) : '') + '</td><td class="num"><strong>' + gs(m.saldo) + '</strong></td></tr>').join('')
      + '</tbody></table></div>' + (BG.esDuena() ? '<p class="hint list-top">En «Pago» también van las devoluciones y rebajas; lo que pasó a saldo a favor figura como cargo porque sale de esta cuenta y queda en la de saldo a favor.</p>' : '') + '</div>'
      + (creditos.length ? '<div data-panel="favor" hidden><div class="table-wrap list-top"><table class="table"><thead><tr><th>Fecha</th><th>Motivo</th><th class="num">Monto</th></tr></thead><tbody>'
        + creditos.map((x) => '<tr><td class="nowrap">' + BG.fmtFecha(x.fecha) + '</td><td>' + esc(x.motivo) + '</td><td class="num ' + (x.monto > 0 ? 't-favor' : '') + '">' + (x.monto > 0 ? '+' : '') + gs(x.monto) + '</td></tr>').join('')
        + '</tbody><tfoot><tr><td colspan="2">Disponible</td><td class="num">' + gs(aFavor) + '</td></tr></tfoot></table></div>'
        + '<p class="hint list-top">Nace de pagos de más, señas, devoluciones o ventas anuladas. Se aplica en la próxima compra o al cobrar, y también se puede devolver en plata.</p></div>' : '')
      + '</div></div>';
    return {
      html: html,
      mount: (root) => {
        $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => {
          $$('[data-tab]', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
          $$('[data-panel]', root).forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        }));
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion="devolver-favor"]');
          if (!b) return;
          try { if (await BG.devolverFavorUI(c)) BG.render(); } catch (err) { BG.toast(err.message, 'error'); }
        });
      },
    };
  };

  /* ── Clientes: alta y edición ────────────────────────────────────────── */

  BG.vistas.clienteForm = (args, params) => {
    const id = args[0];
    const c = id ? BG.cliente(id) : null;
    const v = c || { nombre: params.get('nombre') || '', ci: '', telefono: '', direccion: '', email: '', notas: '', cumple: '' };
    const volver = params.get('volver');
    const cumpleM = v.cumple ? v.cumple.slice(0, 2) : '';
    const cumpleD = v.cumple ? v.cumple.slice(3, 5) : '';
    const limiteSel = v.limite == null ? 'general' : v.limite === 0 ? 'contado' : 'propio';
    const campo = (k, label, req, extra) => '<div class="field' + (extra && extra.span ? ' span-2' : '') + '"><label for="f-' + k + '">' + label + (req ? ' <span class="req">*</span>' : '') + '</label>'
      + (k === 'notas' ? '<textarea id="f-' + k + '" class="textarea" rows="3">' + esc(v[k]) + '</textarea>'
        : '<input id="f-' + k + '" class="input" value="' + esc(v[k]) + '" ' + ((extra && extra.attrs) || '') + '>')
      + ((extra && extra.hint) ? '<span class="hint">' + extra.hint + '</span>' : '') + '<span class="error-text" id="e-' + k + '" hidden></span></div>';
    const html = '<div class="page">'
      + '<a class="back-link" href="' + (c ? '#/clientes/' + c.id : '#/clientes') + '">' + icon('left', 'i-sm') + (c ? esc(c.nombre) : 'Clientes') + '</a>'
      + '<div class="page-head"><div><h1 class="page-title">' + (c ? 'Editar cliente' : 'Nuevo cliente') + '</h1>'
      + '<p class="page-sub">Mientras escribís, el sistema busca si ya existe para no crearlo repetido.</p></div></div>'
      + '<div class="grid-form"><form id="form-cliente" class="card stack" novalidate>'
      + '<div class="fields">'
      + campo('nombre', 'Nombre y apellido', true, { span: true, attrs: 'autocomplete="off"' })
      + campo('ci', 'CI o RUC', false, { attrs: 'inputmode="numeric" autocomplete="off"', hint: 'Sirve para buscar y sale en el recibo.' })
      + campo('telefono', 'Teléfono / WhatsApp', true, { attrs: 'type="tel" inputmode="tel" autocomplete="off"', hint: 'Ej.: 0981 123 456' })
      + campo('direccion', 'Dirección', false, { span: true })
      + campo('email', 'Correo electrónico', false, { span: true, attrs: 'type="email" autocomplete="off"' })
      + '<div class="field span-2"><span class="field-label" id="f-cumple-l">Cumpleaños <span class="small muted">(opcional: para el saludo y su regalo)</span></span><div class="row row-nowrap" role="group" aria-labelledby="f-cumple-l">'
      + '<select id="f-cumple-d" class="select select-auto" aria-label="Día"><option value="">Día</option>' + Array.from({ length: 31 }, (x, i) => i + 1).map((d) => '<option value="' + BG.pad(d) + '"' + (cumpleD === BG.pad(d) ? ' selected' : '') + '>' + d + '</option>').join('') + '</select>'
      + '<select id="f-cumple-m" class="select select-auto" aria-label="Mes"><option value="">Mes</option>' + BG.MESES.map((m, i) => '<option value="' + BG.pad(i + 1) + '"' + (cumpleM === BG.pad(i + 1) ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div></div>'
      + (BG.esDuena() ? '<div class="field span-2"><span class="field-label" id="f-lim-l">Límite de crédito <span class="small muted">(solo lo ves vos)</span></span>'
        + '<div class="seg" role="radiogroup" aria-labelledby="f-lim-l">'
        + '<label><input type="radio" name="f-lim" value="general"' + (limiteSel === 'general' ? ' checked' : '') + '>General (' + gs(BG.configCredito().limite) + ')</label>'
        + '<label><input type="radio" name="f-lim" value="propio"' + (limiteSel === 'propio' ? ' checked' : '') + '>Otro monto</label>'
        + '<label><input type="radio" name="f-lim" value="contado"' + (limiteSel === 'contado' ? ' checked' : '') + '>Solo al contado</label></div>'
        + '<div id="f-lim-monto"' + (limiteSel === 'propio' ? '' : ' hidden') + '>' + BG.campoGs('f-limite', v.limite > 0 ? v.limite : '', 'aria-label="Límite de crédito propio" placeholder="0"') + '</div>'
        + '<span class="hint">Si una venta a cuenta pasa el límite, o tiene cuotas atrasadas, Jazmín ve el aviso y necesita tu PIN.</span></div>' : '')
      + campo('notas', 'Notas', false, { span: true })
      + '</div>'
      + '<p class="hint">' + (c ? 'Cliente desde el ' + BG.fmtFecha(c.alta) + '.' : 'La fecha de alta la pone el sistema: ' + BG.fmtFecha(BG.hoy()) + '.') + '</p>'
      + '<div class="form-actions"><a class="btn btn-quiet" href="' + (c ? '#/clientes/' + c.id : '#/clientes') + '">Cancelar</a>'
      + '<button class="btn btn-primary" type="submit">' + icon('check') + (c ? 'Guardar cambios' : 'Crear cliente') + '</button></div>'
      + '</form>'
      + '<aside class="stack" aria-live="polite"><div id="duplicados"></div>'
      + '<div class="note-mock">' + icon('info') + '<span>La búsqueda compara la CI/RUC, el teléfono (con o sin 0 o 595) y el nombre aunque tenga errores de tipeo.</span></div></aside>'
      + '</div></div>';

    const leer = (root) => {
      const d = $('#f-cumple-d', root).value;
      const m = $('#f-cumple-m', root).value;
      const datos = {
        nombre: $('#f-nombre', root).value, ci: $('#f-ci', root).value, telefono: $('#f-telefono', root).value,
        direccion: $('#f-direccion', root).value, email: $('#f-email', root).value, notas: $('#f-notas', root).value,
        cumple: d && m ? m + '-' + d : '',
      };
      const lim = $('input[name="f-lim"]:checked', root);
      if (lim) datos.limite = lim.value === 'general' ? null : lim.value === 'contado' ? 0 : BG.leerGs($('#f-limite', root)) || null;
      return datos;
    };
    const pintarDuplicados = (root) => {
      const dup = BG.posiblesDuplicados(leer(root), id);
      $('#duplicados', root).innerHTML = dup.length
        ? '<div class="card"><div class="card-head"><h2>¿Ya existe?</h2><span class="pill pill-warn">' + icon('alert') + dup.length + ' parecido' + (dup.length > 1 ? 's' : '') + '</span></div>'
          + '<ul class="list list-plain">' + dup.map((d) => '<li><a class="list-row" href="#/clientes/' + d.c.id + '">' + BG.filaCliente(d.c) + '</a><p class="hint pad-x">Coincide: ' + d.motivo + '</p></li>').join('') + '</ul></div>'
        : '';
      return dup;
    };
    return {
      html: html,
      mount: (root) => {
        pintarDuplicados(root);
        ['nombre', 'ci', 'telefono'].forEach((k) => $('#f-' + k, root).addEventListener('input', () => pintarDuplicados(root)));
        root.addEventListener('change', (ev) => {
          if (ev.target.name !== 'f-lim') return;
          $('#f-lim-monto', root).hidden = ev.target.value !== 'propio';
          if (ev.target.value === 'propio') $('#f-limite', root).focus();
        });
        $('#f-nombre', root).focus();
        $('#form-cliente', root).addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const d = leer(root);
          const errores = {};
          if (d.nombre.trim().length < 3) errores.nombre = 'Escribí nombre y apellido.';
          if (BG.soloDigitos(d.telefono).length < 6) errores.telefono = 'Falta el teléfono (al menos 6 cifras).';
          if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errores.email = 'El correo no parece válido.';
          ['nombre', 'telefono', 'email'].forEach((k) => {
            const er = $('#e-' + k, root);
            er.textContent = errores[k] || '';
            er.hidden = !errores[k];
            $('#f-' + k, root).setAttribute('aria-invalid', errores[k] ? 'true' : 'false');
          });
          if (Object.keys(errores).length) { $('#f-' + Object.keys(errores)[0], root).focus(); return; }
          const fuertes = pintarDuplicados(root).filter((x) => x.motivo !== 'nombre parecido');
          if (fuertes.length) {
            const ok = await BG.modal({
              titulo: 'Puede ser un cliente repetido',
              cuerpo: '<p>Ya existe <strong>' + esc(fuertes[0].c.nombre) + '</strong> con ' + fuertes[0].motivo + '.</p><p>¿Querés ' + (c ? 'guardar' : 'crear') + ' igual?</p>',
              acciones: [{ texto: 'Ver el existente', valor: 'ver', clase: 'btn-quiet' }, { texto: c ? 'Guardar igual' : 'Crear igual', valor: 'crear', clase: 'btn-primary' }],
            });
            if (ok === 'ver') { BG.ir('#/clientes/' + fuertes[0].c.id); return; }
            if (ok !== 'crear') return;
          }
          const guardado = BG.guardarCliente(d, id);
          BG.toast(c ? 'Cambios guardados.' : 'Cliente creado: ' + guardado.nombre);
          if (volver === 'venta') BG.ir('#/ventas/nueva?cliente=' + guardado.id);
          else if (volver === 'cobro') BG.ir('#/cobros/nuevo?cliente=' + guardado.id);
          else BG.ir('#/clientes/' + guardado.id);
        });
      },
    };
  };
})();

/*!
 * berry.Glow_py — Pantallas: ingreso, inicio, clientes (lista, ficha y alta/edición).
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  BG.gananciaVenta = (v) => v.total - sum(v.items, (it) => (it.costoUnitGs || 0) * it.cantidad);

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
      + '<div class="row"><button type="button" class="btn btn-sm" data-demo="duena">Entrar como Dueña</button>'
      + '<button type="button" class="btn btn-sm" data-demo="caja">Entrar como Caja (vendedor/a)</button></div>'
      + '<span class="small">La vista de caja no muestra costos, cotización ni márgenes.</span></div>'
      + '</div></div>';
    const entrar = (usuario) => {
      const u = BG.db.usuarios.find((x) => x.usuario === String(usuario || '').trim().toLowerCase());
      if (!u) {
        const er = $('#login-error');
        er.textContent = 'Ese usuario no existe. En el mockup hay dos: «duena» y «caja».';
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
    html: '<div class="page"><div class="callout callout-warn">' + icon('lock') + '<div><strong>Esta pantalla es solo para la dueña.</strong> '
      + 'Tiene costos, cotización o márgenes. <button type="button" class="linkish" data-action="rol" data-rol="admin">Volver a la vista de la dueña</button></div></div></div>',
  });

  /* ── Inicio ──────────────────────────────────────────────────────────── */

  function filaMovimiento(m) {
    return '<li><a class="list-row" href="' + m.href + '"><span class="avatar">' + icon(m.icono, 'i-sm') + '</span>'
      + '<span class="row-main"><span class="row-title' + (m.anulado ? ' strike' : '') + '">' + m.titulo + '</span><span class="row-sub">' + m.sub + '</span></span>'
      + '<span class="row-end"><span class="amount' + (m.anulado ? ' strike' : '') + '">' + gs(m.monto) + '</span>' + (m.extra || '') + '</span></a></li>';
  }

  BG.movimientosDelDia = (fecha) => {
    const movs = [];
    for (const v of BG.db.ventas.filter((x) => x.fecha === fecha)) {
      const cli = BG.cliente(v.clienteId);
      const n = sum(v.items, (it) => it.cantidad);
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
        extra: p.anulado ? '<span class="pill pill-muted">Anulado</span>' : '',
      });
    }
    return movs.sort((a, b) => b.ts.localeCompare(a.ts));
  };

  BG.vistas.inicio = () => {
    const h = BG.hoy();
    const duena = BG.esDuena();
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    const ventasHoy = BG.db.ventas.filter((v) => v.fecha === h && !v.anulada);
    const f = BG.totalesPorForma(BG.db.pagos.filter((p) => p.fecha === h && !p.anulado));
    const cobrado = f.efectivo + f.transferencia + f.qr + f.tarjeta;
    const desglose = ['efectivo', 'transferencia', 'qr', 'tarjeta'].filter((k) => f[k] > 0).map((k) => BG.FORMAS_CORTAS[k] + ' ' + gs(f[k])).join(' · ') || 'Todavía sin cobros';
    const deudores = BG.listaDeudores();
    const cu = BG.cuadre();
    const mes = h.slice(0, 7);
    const ventasMes = BG.db.ventas.filter((v) => v.fecha.slice(0, 7) === mes && !v.anulada);
    const movs = BG.movimientosDelDia(h);
    const cerrada = BG.cajaCerrada(h);
    const cfg = BG.db.config;

    const html = '<div class="page">'
      + '<div class="page-head"><div><p class="eyebrow">' + BG.fmtFechaLarga(h) + '</p><h1 class="page-title">' + saludo + ', ' + esc(BG.usuario().nombre) + '</h1></div></div>'
      + '<section class="quick" aria-label="Acciones rápidas">'
      + '<a class="quick-btn is-main" href="#/ventas/nueva"><span class="qi">' + icon('bag') + '</span><span>Nueva venta<small>Uno o varios artículos</small></span></a>'
      + '<a class="quick-btn" href="#/cobros/nuevo"><span class="qi">' + icon('cash') + '</span><span>Registrar cobro<small>También pagos mixtos</small></span></a>'
      + (duena ? '<a class="quick-btn" href="#/productos/nuevo"><span class="qi">' + icon('tag') + '</span><span>Cargar producto<small>Calcula el precio de venta</small></span></a>'
        : '<a class="quick-btn" href="#/productos"><span class="qi">' + icon('tag') + '</span><span>Lista de precios<small>Precios y stock</small></span></a>')
      + '<a class="quick-btn" href="#/clientes/nuevo"><span class="qi">' + icon('user') + '</span><span>Nuevo cliente<small>Avisa si ya existe</small></span></a>'
      + '</section>'
      + '<section class="tiles" aria-label="Resumen">'
      + '<div class="tile"><span class="tile-label">Vendido hoy</span><span class="tile-value">' + gs(sum(ventasHoy, (v) => v.total)) + '</span><span class="tile-sub">' + ventasHoy.length + (ventasHoy.length === 1 ? ' venta' : ' ventas') + '</span></div>'
      + '<div class="tile"><span class="tile-label">Cobrado hoy</span><span class="tile-value">' + gs(cobrado) + '</span><span class="tile-sub">' + desglose + '</span></div>'
      + '<div class="tile"><span class="tile-label">Por cobrar</span><span class="tile-value">' + gs(sum(deudores, (d) => d.saldo)) + '</span><span class="tile-sub">' + deudores.length + ' clientes con saldo</span></div>'
      + (duena ? '<div class="tile"><span class="tile-label">Ganancia de ' + BG.MESES[Number(mes.slice(5, 7)) - 1] + '</span><span class="tile-value">' + gs(sum(ventasMes, BG.gananciaVenta)) + '</span>'
        + '<span class="tile-sub">Precio de venta − costo congelado · solo la dueña la ve</span></div>' : '')
      + '</section>'
      + '<div class="grid-2">'
      + '<section class="card card-flush" aria-labelledby="t-deben"><div class="card-head pad"><h2 id="t-deben">Clientes que deben</h2><a class="small" href="#/clientes?filtro=deben">Ver los ' + deudores.length + '</a></div>'
      + (deudores.length ? '<ul class="list list-plain">' + deudores.slice(0, 6).map((d) => '<li><a class="list-row" href="#/clientes/' + d.c.id + '">' + BG.filaCliente(d.c) + '</a></li>').join('') + '</ul>'
        : '<p class="empty">Nadie debe nada.</p>')
      + '</section>'
      + '<section class="card card-flush" aria-labelledby="t-hoy"><div class="card-head pad"><h2 id="t-hoy">Movimientos de hoy</h2><a class="small" href="#/caja">Caja del día</a></div>'
      + (movs.length ? '<ul class="list list-plain">' + movs.slice(0, 7).map(filaMovimiento).join('') + '</ul>' : '<p class="empty">Todavía no hay ventas ni cobros hoy.</p>')
      + '</section></div>'
      + '<div class="grid-2">'
      + '<div class="callout ' + (cu.ok ? 'callout-good' : 'callout-bad') + '">' + icon(cu.ok ? 'shield' : 'alert') + '<div><strong>'
      + (cu.ok ? 'Las cuentas por cobrar cuadran.' : 'Hay un descuadre en las cuentas por cobrar.') + '</strong> La suma de saldos cliente por cliente (' + gs(cu.porClientes) + ') '
      + (cu.ok ? 'coincide con' : 'no coincide con') + ' el total por cobrar del sistema (' + gs(cu.libro) + '). Se controla solo, cada vez que se abre esta pantalla.</div></div>'
      + '<div class="callout">' + icon(cerrada ? 'lock' : 'register') + '<div><strong>Caja de hoy: ' + (cerrada ? 'cerrada' : 'abierta') + '.</strong> '
      + (cerrada ? 'Los movimientos de hoy ya no se pueden anular sin autorización.' : 'Al terminar el día hacé el arqueo: el sistema compara el efectivo contado con lo cobrado.')
      + ' <a href="#/caja">Ir a la caja</a>'
      + (duena ? '<br><span class="small">Dólar ' + C.fmtCot(cfg.cotizacion.valor) + ' desde el ' + BG.fmtFecha(cfg.cotizacion.fecha) + ' · Courier ' + C.fmtUSD(cfg.tarifa.valor) + '/kg · <a href="#/ajustes">cambiar</a></span>' : '')
      + '</div></div></div>'
      + '</div>';
    return { html: html };
  };

  /* ── Clientes: lista ─────────────────────────────────────────────────── */

  BG.vistas.clientes = (args, params) => {
    const e = { filtro: params.get('filtro') || 'todos', q: params.get('q') || '' };
    e.orden = e.filtro === 'deben' ? 'saldo' : 'nombre';
    const todos = BG.db.clientes;
    const nDeben = todos.filter((c) => BG.saldoCliente(c.id) > 0).length;
    const chip = (f, t, n) => '<button type="button" class="chip" data-filtro="' + f + '" aria-pressed="' + (e.filtro === f) + '">' + t + ' <span class="count">' + n + '</span></button>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Clientes</h1><p class="page-sub">' + todos.length + ' clientes · ' + gs(sum(BG.listaDeudores(), (d) => d.saldo)) + ' por cobrar</p></div>'
      + '<div class="page-actions"><a class="btn btn-primary" href="#/clientes/nuevo">' + icon('plus') + 'Nuevo cliente</a></div></div>'
      + '<div class="toolbar">'
      + '<div class="search-box grow"><label class="sr-only" for="q-clientes">Buscar cliente</label>' + icon('search')
      + '<input id="q-clientes" class="search-input" type="search" autocomplete="off" placeholder="Nombre, CI/RUC o teléfono (tolera errores de tipeo)" value="' + esc(e.q) + '"></div>'
      + '<div class="chips" role="group" aria-label="Filtrar">' + chip('todos', 'Todos', todos.length) + chip('deben', 'Con saldo', nDeben) + chip('aldia', 'Al día', todos.length - nDeben) + '</div>'
      + '<label class="sr-only" for="orden">Ordenar</label><select id="orden" class="select select-auto">'
      + '<option value="nombre">Por nombre</option><option value="saldo">Mayor saldo primero</option><option value="antiguedad">Deuda más antigua primero</option></select>'
      + '</div>'
      + '<ul class="list" id="lista-clientes"></ul>'
      + '</div>';
    const pintar = (root) => {
      const q = e.q.trim();
      let lista = q ? BG.buscarClientes(q, 200) : todos.slice();
      const saldos = new Map(lista.map((c) => [c.id, BG.saldoCliente(c.id)]));
      if (e.filtro === 'deben') lista = lista.filter((c) => saldos.get(c.id) > 0);
      if (e.filtro === 'aldia') lista = lista.filter((c) => saldos.get(c.id) <= 0);
      if (!q) {
        if (e.orden === 'saldo') lista.sort((a, b) => saldos.get(b.id) - saldos.get(a.id));
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
    const n = sum(v.items, (it) => it.cantidad);
    const nombres = v.items.map((it) => it.descripcion).join(', ');
    return '<li><a class="sale-row" href="#/ventas/' + v.id + '">'
      + '<span class="sale-date">' + BG.fmtFecha(v.fecha) + '<small>' + BG.fmtRecibo(v.recibo) + '</small></span>'
      + '<span class="sale-desc"><span class="row-title' + (v.anulada ? ' strike' : '') + '">' + esc(nombres) + '</span>'
      + '<span class="row-sub">' + n + (n === 1 ? ' artículo' : ' artículos') + ' · total ' + gs(v.total) + (v.anulada ? '' : ' · pagado ' + gs(BG.pagadoVenta(v))) + '</span></span>'
      + '<span class="sale-end">' + BG.estadoVenta(v) + (!v.anulada && BG.saldoVenta(v) > 0 ? BG.edad(v.fecha) : '') + '</span></a></li>';
  }
  BG.filaVenta = filaVenta;

  function libroCliente(cid) {
    const mov = [];
    for (const v of BG.ventasDeCliente(cid)) {
      mov.push({ ts: v.ts, fecha: v.fecha, concepto: 'Compra ' + BG.fmtRecibo(v.recibo) + ' · ' + v.items.map((it) => it.descripcion).join(', '), cargo: v.anulada ? 0 : v.total, anulado: v.anulada ? 'Anulada: ' + v.anulada.motivo : '' });
    }
    for (const p of BG.db.pagos.filter((x) => x.clienteId === cid && x.ventaId)) {
      mov.push({ ts: p.ts, fecha: p.fecha, concepto: 'Pago ' + BG.fmtRecibo(p.recibo) + ' · ' + p.partes.map((x) => BG.FORMAS[x.forma]).join(' + '), abono: p.anulado || BG.venta(p.ventaId).anulada ? 0 : p.total, anulado: p.anulado ? 'Anulado: ' + p.anulado.motivo : (BG.venta(p.ventaId).anulada ? 'Pasó a saldo a favor' : '') });
    }
    mov.sort((a, b) => a.ts.localeCompare(b.ts));
    let saldo = 0;
    return mov.map((m) => { saldo += (m.cargo || 0) - (m.abono || 0); return Object.assign(m, { saldo: saldo }); });
  }

  BG.vistas.cliente = (args) => {
    const c = BG.cliente(args[0]);
    if (!c) return { html: '<div class="page"><p class="empty">No encontramos ese cliente. <a href="#/clientes">Volver a clientes</a></p></div>' };
    const saldo = BG.saldoCliente(c.id);
    const aFavor = BG.creditoCliente(c.id);
    const pend = BG.pendientesDe(c.id);
    const ventas = BG.ventasDeCliente(c.id).slice().sort((a, b) => b.ts.localeCompare(a.ts));
    const libro = libroCliente(c.id);
    const creditos = BG.db.creditos.filter((x) => x.clienteId === c.id);
    const primerNombre = c.nombre.split(' ')[0];
    const textoWa = saldo > 0
      ? 'Hola ' + primerNombre + ', te escribimos de ' + BG.db.config.tienda.nombre + '. Tu saldo pendiente es de ' + gs(saldo) + '. ¡Gracias!'
      : 'Hola ' + primerNombre + ', te escribimos de ' + BG.db.config.tienda.nombre + '.';
    const html = '<div class="page">'
      + '<a class="back-link" href="#/clientes">' + icon('left', 'i-sm') + 'Clientes</a>'
      + '<div class="profile-head"><span class="avatar avatar-lg">' + esc(BG.iniciales(c.nombre)) + '</span>'
      + '<div class="grow"><h1 class="page-title">' + esc(c.nombre) + '</h1><p class="meta">'
      + (c.ci ? '<span>' + (c.ci.includes('-') ? 'RUC ' : 'CI ') + esc(c.ci) + '</span>' : '<span class="muted">Sin CI/RUC</span>')
      + '<span>' + icon('phone', 'i-sm') + esc(c.telefono) + '</span>'
      + (c.direccion ? '<span>' + esc(c.direccion) + '</span>' : '') + (c.email ? '<span>' + esc(c.email) + '</span>' : '')
      + '<span class="muted">Cliente desde el ' + BG.fmtFecha(c.alta) + '</span></p></div>'
      + '<div class="page-actions"><a class="btn btn-quiet" href="#/clientes/' + c.id + '/editar">' + icon('edit') + 'Editar</a></div></div>'
      + '<section class="balance' + (saldo > 0 ? '' : ' is-clear') + '" aria-label="Saldo">'
      + '<div><p class="balance-label">' + (saldo > 0 ? 'Saldo pendiente' : 'Cuenta al día') + '</p><p class="hero-figure">' + gs(saldo) + '</p>'
      + '<p class="balance-sub">' + (pend.length ? 'En ' + pend.length + (pend.length === 1 ? ' compra' : ' compras') + ' · la más antigua ' + BG.haceDias(pend[0].fecha) : 'No debe nada.')
      + (aFavor > 0 ? ' · <strong class="pill pill-good">' + icon('check') + 'Saldo a favor ' + gs(aFavor) + '</strong>' : '') + '</p></div>'
      + '<div class="balance-actions">'
      + (saldo > 0 ? '<a class="btn btn-primary" href="#/cobros/nuevo?cliente=' + c.id + '">' + icon('cash') + 'Registrar cobro</a>' : '')
      + '<a class="btn' + (saldo > 0 ? '' : ' btn-primary') + '" href="#/ventas/nueva?cliente=' + c.id + '">' + icon('bag') + 'Nueva venta</a>'
      + '<a class="btn" href="#/recibo/c/' + c.id + '">' + icon('receipt') + 'Estado de cuenta</a>'
      + '<a class="btn" href="' + BG.waLink(c, textoWa) + '" target="_blank" rel="noopener">' + icon('chat') + 'WhatsApp</a>'
      + '</div></section>'
      + (c.notas ? '<div class="callout">' + icon('info') + '<div>' + esc(c.notas) + '</div></div>' : '')
      + '<div><div class="tabs" role="tablist">'
      + '<button type="button" class="tab-btn" role="tab" aria-selected="true" data-tab="compras">Compras (' + ventas.length + ')</button>'
      + '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="movs">Movimientos</button>'
      + (creditos.length ? '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="favor">Saldo a favor</button>' : '')
      + '</div>'
      + '<div data-panel="compras">' + (ventas.length ? '<ul class="list list-top">' + ventas.map(filaVenta).join('') + '</ul>' : '<p class="empty">Todavía no compró nada.</p>') + '</div>'
      + '<div data-panel="movs" hidden><div class="table-wrap list-top"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Compra</th><th class="num">Pago</th><th class="num">Saldo</th></tr></thead><tbody>'
      + libro.map((m) => '<tr><td class="nowrap">' + BG.fmtFecha(m.fecha) + '</td><td><span class="' + (m.anulado ? 'strike' : '') + '">' + esc(m.concepto) + '</span>'
        + (m.anulado ? '<div class="t-sub">' + esc(m.anulado) + '</div>' : '') + '</td><td class="num">' + (m.cargo ? gs(m.cargo) : '') + '</td><td class="num">' + (m.abono ? gs(m.abono) : '') + '</td><td class="num"><strong>' + gs(m.saldo) + '</strong></td></tr>').join('')
      + '</tbody></table></div></div>'
      + (creditos.length ? '<div data-panel="favor" hidden><div class="table-wrap list-top"><table class="table"><thead><tr><th>Fecha</th><th>Motivo</th><th class="num">Monto</th></tr></thead><tbody>'
        + creditos.map((x) => '<tr><td class="nowrap">' + BG.fmtFecha(x.fecha) + '</td><td>' + esc(x.motivo) + '</td><td class="num">' + (x.monto > 0 ? '+' : '') + gs(x.monto) + '</td></tr>').join('')
        + '</tbody><tfoot><tr><td colspan="2">Disponible</td><td class="num">' + gs(aFavor) + '</td></tr></tfoot></table></div>'
        + '<p class="hint list-top">Se aplica en la próxima compra (el sistema lo ofrece al vender).</p></div>' : '')
      + '</div></div>';
    return {
      html: html,
      mount: (root) => {
        $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => {
          $$('[data-tab]', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
          $$('[data-panel]', root).forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        }));
      },
    };
  };

  /* ── Clientes: alta y edición ────────────────────────────────────────── */

  BG.vistas.clienteForm = (args, params) => {
    const id = args[0];
    const c = id ? BG.cliente(id) : null;
    const v = c || { nombre: params.get('nombre') || '', ci: '', telefono: '', direccion: '', email: '', notas: '' };
    const volver = params.get('volver');
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
      + campo('notas', 'Notas', false, { span: true })
      + '</div>'
      + '<p class="hint">' + (c ? 'Cliente desde el ' + BG.fmtFecha(c.alta) + '.' : 'La fecha de alta la pone el sistema: ' + BG.fmtFecha(BG.hoy()) + '.') + '</p>'
      + '<div class="form-actions"><a class="btn btn-quiet" href="' + (c ? '#/clientes/' + c.id : '#/clientes') + '">Cancelar</a>'
      + '<button class="btn btn-primary" type="submit">' + icon('check') + (c ? 'Guardar cambios' : 'Crear cliente') + '</button></div>'
      + '</form>'
      + '<aside class="stack" aria-live="polite"><div id="duplicados"></div>'
      + '<div class="note-mock">' + icon('info') + '<span>La búsqueda compara la CI/RUC, el teléfono (con o sin 0 o 595) y el nombre aunque tenga errores de tipeo.</span></div></aside>'
      + '</div></div>';

    const leer = (root) => ({
      nombre: $('#f-nombre', root).value, ci: $('#f-ci', root).value, telefono: $('#f-telefono', root).value,
      direccion: $('#f-direccion', root).value, email: $('#f-email', root).value, notas: $('#f-notas', root).value,
    });
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

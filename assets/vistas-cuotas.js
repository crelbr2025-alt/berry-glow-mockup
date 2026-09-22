/*!
 * berry.Glow_py — Cuotas con fecha: lo atrasado, lo que vence esta semana y lo que viene, con recordatorio por WhatsApp.
 * Todo se calcula desde el saldo real de cada venta (BG.estadoPlan), así la lista nunca contradice a las cuentas.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const { $, $$, esc, gs, sum, icon } = BG;

  const tile = (label, valor, sub, cls) => '<div class="tile' + (cls ? ' ' + cls : '') + '"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';

  BG.vistas.cuotas = (args, params) => {
    const e = { filtro: params.get('filtro') || 'urgentes', q: '' };
    const todas = BG.cuotasPendientes();
    const de = (f) => todas.filter(f);
    const vencidas = de((x) => x.cuota.estado === 'vencida');
    const semana = de((x) => x.cuota.estado === 'hoy' || x.cuota.estado === 'semana');
    const proximas = de((x) => x.cuota.estado === 'futura' && x.cuota.dias <= 30);
    const clientesAtrasados = new Set(vencidas.map((x) => x.cliente.id));
    const sinPlan = BG.db.ventas.filter((v) => !v.anulada && !v.plan && BG.saldoVenta(v) > 0).sort((a, b) => a.ts.localeCompare(b.ts));
    const puedeCobrar = BG.puede('registrarCobros');
    const chip = (k, t, n) => '<button type="button" class="chip" data-filtro="' + k + '" aria-pressed="' + (e.filtro === k) + '">' + t + ' <span class="count">' + n + '</span></button>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Cuotas</h1><p class="page-sub">Fechas de pago acordadas al vender a crédito. Cada pago va cubriendo las cuotas en orden, de la primera a la última.</p></div>'
      + (puedeCobrar ? '<div class="page-actions"><a class="btn btn-primary" href="#/cobros/nuevo">' + icon('cash') + 'Registrar cobro</a></div>' : '') + '</div>'
      + '<section class="tiles tiles-compact" aria-label="Resumen de cuotas">'
      + tile('Atrasado', gs(sum(vencidas, (x) => x.cuota.falta)), vencidas.length + (vencidas.length === 1 ? ' cuota' : ' cuotas') + ' · ' + clientesAtrasados.size + (clientesAtrasados.size === 1 ? ' cliente' : ' clientes'), vencidas.length ? 'tile-bad' : '')
      + tile('Vence esta semana', gs(sum(semana, (x) => x.cuota.falta)), semana.length + (semana.length === 1 ? ' cuota' : ' cuotas') + ' en los próximos 7 días')
      + tile('Próximos 30 días', gs(sum(proximas, (x) => x.cuota.falta)), proximas.length + (proximas.length === 1 ? ' cuota' : ' cuotas'))
      + tile('A cuenta sin fechas', gs(sum(sinPlan, BG.saldoVenta)), sinPlan.length + (sinPlan.length === 1 ? ' venta sin cuotas acordadas' : ' ventas sin cuotas acordadas'))
      + '</section>'
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-cuotas">Buscar cliente</label>' + icon('search')
      + '<input id="q-cuotas" class="search-input" type="search" autocomplete="off" placeholder="Buscar cliente"></div>'
      + '<div class="chips" role="group" aria-label="Filtrar cuotas">' + chip('urgentes', 'Atrasadas y esta semana', vencidas.length + semana.length) + chip('vencidas', 'Atrasadas', vencidas.length)
      + chip('todas', 'Todas', todas.length) + chip('sinplan', 'A cuenta sin fechas', sinPlan.length) + '</div></div>'
      + '<div id="cuotas-lista"></div></div>';

    const fila = (x) => {
      const c = x.cuota;
      return '<li class="list-row cuota-fila"><span class="avatar">' + esc(BG.iniciales(x.cliente.nombre)) + '</span>'
        + '<span class="row-main"><a class="row-title" href="#/clientes/' + x.cliente.id + '">' + esc(x.cliente.nombre) + '</a>'
        + '<span class="row-sub">Cuota ' + c.n + ' de ' + c.de + ' · vence el ' + BG.fmtFecha(c.vence) + ' · <a href="#/ventas/' + x.venta.id + '">compra ' + BG.fmtRecibo(x.venta.recibo) + '</a>'
        + (c.pagado ? ' · ya pagó ' + gs(c.pagado) + ' de ' + gs(c.monto) : '') + '</span></span>'
        + '<span class="row-end"><span class="amount">' + gs(c.falta) + '</span>' + BG.pillCuota(c)
        + '<span class="row-actions">' + (c.estado !== 'futura' ? '<a class="btn btn-sm" href="' + BG.waLink(x.cliente, BG.textoRecordatorio(x.cliente, x.venta, c)) + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Recordar</a>' : '')
        + (puedeCobrar ? '<a class="btn btn-sm btn-primary" href="#/cobros/nuevo?cliente=' + x.cliente.id + '&venta=' + x.venta.id + '">' + icon('cash', 'i-sm') + 'Cobrar</a>' : '') + '</span></span></li>';
    };
    const filaSinPlan = (v) => {
      const cli = BG.cliente(v.clienteId);
      return '<li class="list-row cuota-fila"><span class="avatar">' + esc(BG.iniciales(cli.nombre)) + '</span>'
        + '<span class="row-main"><a class="row-title" href="#/clientes/' + cli.id + '">' + esc(cli.nombre) + '</a>'
        + '<span class="row-sub"><a href="#/ventas/' + v.id + '">Compra ' + BG.fmtRecibo(v.recibo) + '</a> del ' + BG.fmtFecha(v.fecha) + ' · ' + esc(v.items.filter((it) => BG.cantidadViva(it) > 0).map((it) => it.descripcion).join(', ')) + '</span></span>'
        + '<span class="row-end"><span class="amount">' + gs(BG.saldoVenta(v)) + '</span>' + BG.edad(v.fecha)
        + '<span class="row-actions"><a class="btn btn-sm" href="#/ventas/' + v.id + '">' + icon('calendar', 'i-sm') + 'Acordar cuotas</a></span></span></li>';
    };
    const pintar = (root) => {
      const q = e.q.trim();
      const ids = q ? new Set(BG.buscarClientes(q, 200).map((c) => c.id)) : null;
      const host = $('#cuotas-lista', root);
      if (e.filtro === 'sinplan') {
        const lista = sinPlan.filter((v) => !ids || ids.has(v.clienteId));
        host.innerHTML = lista.length ? '<ul class="list">' + lista.map(filaSinPlan).join('') + '</ul><p class="hint list-top">Son ventas a cuenta sin fechas: acordá cuotas desde la venta para saber qué vence y qué está atrasado.</p>'
          : '<p class="empty">No hay ventas a cuenta sin cuotas.</p>';
        return;
      }
      const base = e.filtro === 'vencidas' ? vencidas : e.filtro === 'todas' ? todas : vencidas.concat(semana);
      const lista = base.filter((x) => !ids || ids.has(x.cliente.id));
      host.innerHTML = lista.length ? '<ul class="list">' + lista.map(fila).join('') + '</ul>'
        : '<p class="empty">' + (e.filtro === 'todas' ? 'No hay cuotas pendientes.' : 'Nada atrasado ni por vencer esta semana.') + '</p>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-cuotas', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        $$('[data-filtro]', root).forEach((b) => b.addEventListener('click', () => {
          e.filtro = b.dataset.filtro;
          $$('[data-filtro]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
      },
    };
  };
})();

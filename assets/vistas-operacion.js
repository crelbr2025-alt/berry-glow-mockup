/*!
 * berry.Glow_py — Pantallas de todos los días: cobranza (recordarle a cada clienta lo que debe), apartados con seña y
 * fecha límite, y lo que las clientas pidieron y no había. Más las tarjetas de Inicio con el resumen del día.
 * Todo sale de BG.cobranza, BG.reservasActivas, BG.deseosPendientes y BG.resumenDelDia (app-core.js): estas pantallas
 * solo muestran y llaman a las acciones de app-acciones.js.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const { $, $$, esc, gs, sum, icon } = BG;

  const tile = (label, valor, sub, cls) => '<div class="tile' + (cls ? ' ' + cls : '') + '"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const itemsTexto = (items) => items.map((x) => (x.cantidad > 1 ? x.cantidad + ' × ' : '') + x.descripcion).join(', ');
  const hace = (dias) => (dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace ' + dias + ' días');

  /** Buscador de clienta dentro de un diálogo: elegida, muestra su nombre y «Cambiar»; si no, la busca por nombre, CI o teléfono. */
  function selectorClienta(host, st, alCambiar, conOtra, excepto) {
    const pintar = () => {
      if (st.clienteId) {
        const c = BG.cliente(st.clienteId);
        host.innerHTML = '<div class="picked"><span class="avatar">' + esc(BG.iniciales(c.nombre)) + '</span><div class="grow"><div class="row-title">' + esc(c.nombre) + '</div>'
          + '<div class="row-sub">' + esc(c.telefono || 'Sin teléfono') + '</div></div><button type="button" class="btn btn-sm btn-quiet" data-sel="cambiar">Cambiar</button></div>';
        return;
      }
      host.innerHTML = '<div class="search"><label class="sr-only" for="sel-q">Buscar clienta</label><div class="search-box">' + icon('search')
        + '<input id="sel-q" class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar clienta por nombre, CI o teléfono" role="combobox" aria-expanded="false" aria-controls="sel-q-lista" aria-autocomplete="list"></div>'
        + '<ul class="cb-list" id="sel-q-lista" role="listbox" hidden></ul></div>'
        + (conOtra ? '<div class="field"><label for="sel-otra">O escribí el nombre de quien pidió <span class="small muted">(si no es clienta todavía)</span></label><input id="sel-otra" class="input" maxlength="60" autocomplete="off" value="' + esc(st.nombre || '') + '"></div>' : '');
      BG.combobox($('#sel-q', host), $('#sel-q-lista', host), {
        mostrarVacio: true,
        buscar: (q) => (q.trim() ? BG.buscarClientes(q, 9) : BG.db.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 9)).filter((c) => c.id !== excepto).slice(0, 8).map((c) => ({ c: c })),
        pintar: (it, q) => BG.filaCliente(it.c, q),
        elegir: (it) => { st.clienteId = it.c.id; st.nombre = ''; pintar(); if (alCambiar) alCambiar(); },
        vacio: (q) => 'No existe «' + esc(q) + '»: ' + (conOtra ? 'escribí abajo el nombre.' : 'creala desde Clientes.'),
      });
    };
    host.addEventListener('click', (e) => { if (e.target.closest('[data-sel="cambiar"]')) { st.clienteId = null; pintar(); if (alCambiar) alCambiar(); const q = $('#sel-q', host); if (q) q.focus(); } });
    host.addEventListener('input', (e) => { if (e.target.id === 'sel-otra') st.nombre = e.target.value; });
    pintar();
  }

  BG.selectorClienta = selectorClienta;

  /* ── Cobranza ────────────────────────────────────────────────────────── */

  BG.vistas.cobranza = (args, params) => {
    const e = { filtro: params.get('filtro') || 'todas', q: '' };
    const lista = BG.cobranza();
    const atrasadas = lista.filter((x) => x.cuotasAtrasadas > 0);
    const viejas = lista.filter((x) => x.dias >= 30);
    const sinAvisar = lista.filter((x) => x.diasDesdeAviso === null || x.diasDesdeAviso > 6);
    const avisadasHoy = lista.filter((x) => x.diasDesdeAviso === 0);
    const puedeCobrar = BG.puede('registrarCobros');
    const chip = (k, t, n) => '<button type="button" class="chip" data-filtro="' + k + '" aria-pressed="' + (e.filtro === k) + '">' + t + ' <span class="count">' + n + '</span></button>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Cobranza</h1><p class="page-sub">Quién te debe, lo más urgente primero. Con un toque se abre WhatsApp con el mensaje ya armado y queda anotado que se le avisó.</p></div></div>'
      + '<section class="tiles tiles-compact" aria-label="Resumen de cobranza">'
      + tile('Por cobrar', gs(sum(lista, (x) => x.saldo)), plural(lista.length, 'clienta', 'clientas'))
      + tile('Con cuota atrasada', gs(sum(atrasadas, (x) => x.atrasado)), plural(atrasadas.length, 'clienta', 'clientas'), atrasadas.length ? 'tile-bad' : '')
      + tile('Debe hace 30 días o más', gs(sum(viejas, (x) => x.saldo)), plural(viejas.length, 'clienta', 'clientas'))
      + tile('Avisadas hoy', String(avisadasHoy.length), 'de ' + lista.length)
      + '</section>'
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-cobranza">Buscar clienta</label>' + icon('search')
      + '<input id="q-cobranza" class="search-input" type="search" autocomplete="off" placeholder="Buscar clienta"></div>'
      + '<div class="chips" role="group" aria-label="Filtrar">' + chip('todas', 'Todas', lista.length) + chip('atrasadas', 'Cuota atrasada', atrasadas.length)
      + chip('viejas', '30 días o más', viejas.length) + chip('sinavisar', 'Sin avisar esta semana', sinAvisar.length) + '</div></div>'
      + '<div id="cobranza-lista"></div></div>';

    const fila = (x) => {
      const c = x.c;
      const aviso = x.diasDesdeAviso === null ? '<span class="pill pill-muted">Sin avisar</span>'
        : x.diasDesdeAviso === 0 ? '<span class="pill pill-good">' + icon('check') + 'Avisada hoy</span>' : '<span class="pill pill-muted">Avisada ' + hace(x.diasDesdeAviso) + '</span>';
      const urgencia = x.cuotasAtrasadas ? '<span class="pill pill-bad">' + icon('alert') + (x.cuotasAtrasadas === 1 ? 'Cuota atrasada ' : x.cuotasAtrasadas + ' cuotas atrasadas ') + gs(x.atrasado) + '</span>' : '';
      return '<li class="list-row cuota-fila" data-cid="' + esc(c.id) + '"><span class="avatar">' + esc(BG.iniciales(c.nombre)) + '</span>'
        + '<span class="row-main"><a class="row-title" href="#/clientes/' + c.id + '">' + esc(c.nombre) + '</a>'
        + '<span class="row-sub">Debe desde ' + hace(x.dias) + ' · ' + plural(x.compras, 'compra', 'compras') + (x.proxima && !x.cuotasAtrasadas ? ' · próxima cuota ' + BG.fmtFechaCorta(x.proxima.vence) : '') + '</span></span>'
        + '<span class="row-end"><span class="amount">' + gs(x.saldo) + '</span>' + urgencia + aviso
        + '<span class="row-actions">'
        + (x.telefono
          ? '<a class="btn btn-sm btn-primary" href="' + BG.waLink(c, BG.textosWa.cobranza(c, x)) + '" target="_blank" rel="noopener" data-recordar="' + esc(c.id) + '">' + icon('chat', 'i-sm') + 'Recordarle</a>'
          : '<a class="btn btn-sm" href="#/clientes/' + c.id + '/editar">' + icon('phone', 'i-sm') + 'Falta el teléfono</a>')
        + (puedeCobrar ? '<a class="btn btn-sm" href="#/cobros/nuevo?cliente=' + c.id + '">' + icon('cash', 'i-sm') + 'Cobrar</a>' : '') + '</span></span></li>';
    };
    const pintar = (root) => {
      const q = e.q.trim();
      const ids = q ? new Set(BG.buscarClientes(q, 200).map((c) => c.id)) : null;
      const base = e.filtro === 'atrasadas' ? atrasadas : e.filtro === 'viejas' ? viejas : e.filtro === 'sinavisar' ? sinAvisar : lista;
      const mostrar = base.filter((x) => !ids || ids.has(x.c.id));
      $('#cobranza-lista', root).innerHTML = mostrar.length ? '<ul class="list">' + mostrar.map(fila).join('') + '</ul>'
        + '<p class="hint list-top">«Recordarle» abre WhatsApp en otra pestaña con el mensaje listo; solo falta tocar enviar. Lo que ya se le avisó queda anotado en la auditoría.</p>'
        : '<p class="empty">' + (lista.length ? 'Nadie con ese filtro.' : 'Nadie debe nada. ¡Todas al día!') + '</p>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-cobranza', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        $$('[data-filtro]', root).forEach((b) => b.addEventListener('click', () => {
          e.filtro = b.dataset.filtro;
          $$('[data-filtro]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
        // El enlace de WhatsApp se abre solo; acá se anota el aviso y se repinta la fila (sin pisar el clic).
        root.addEventListener('click', (ev) => {
          const a = ev.target.closest('[data-recordar]');
          if (!a) return;
          const cid = a.dataset.recordar;
          setTimeout(() => {
            try {
              BG.registrarRecordatorio(cid);
              const x = BG.cobranza().find((y) => y.c.id === cid);
              const fila0 = lista.findIndex((y) => y.c.id === cid);
              if (x && fila0 >= 0) lista[fila0] = x;
              avisadasHoy.length = 0; lista.filter((y) => y.diasDesdeAviso === 0).forEach((y) => avisadasHoy.push(y));
              pintar(root);
              BG.toast('Anotado: le recordaste a ' + BG.cliente(cid).nombre.split(' ')[0] + ' lo que debe.');
            } catch (er) { BG.toast(er.message, 'error'); }
          }, 0);
        });
      },
    };
  };

  /* ── Apartados ───────────────────────────────────────────────────────── */

  const pillApartado = (r) => {
    const e = BG.estadoReserva(r);
    if (e === 'retirada') return '<span class="pill pill-good">' + icon('check') + 'Retirado</span>';
    if (e === 'liberada') return '<span class="pill pill-muted">Liberado</span>';
    const d = BG.diasEntre(BG.hoy(), r.vence);
    if (e === 'vencida') return '<span class="pill pill-bad">' + icon('alert') + 'Venció ' + hace(-d) + '</span>';
    return d === 0 ? '<span class="pill pill-warn">' + icon('clock') + 'Vence hoy</span>' : d === 1 ? '<span class="pill pill-warn">' + icon('clock') + 'Vence mañana</span>'
      : d <= 3 ? '<span class="pill pill-warn">' + icon('clock') + 'Vence en ' + d + ' días</span>' : '<span class="pill pill-muted">' + icon('calendar') + 'Hasta el ' + BG.fmtFechaCorta(r.vence) + '</span>';
  };
  const textoSena = (r) => {
    if (!r.sena) return 'sin seña';
    const pg = BG.db.pagos.find((p) => p.id === r.sena.pagoId);
    return 'seña ' + gs(r.sena.monto) + (pg && pg.anulado ? ' (anulada)' : '');
  };

  /** Dialog para apartar. Devuelve el apartado creado (o null). `pre` = { clienteId }. */
  BG.apartarUI = async (pre) => {
    const st = { clienteId: (pre && pre.clienteId) || null, items: [], vence: BG.sumarDias(BG.hoy(), 7), forma: 'efectivo', monto: '', nota: '' };
    const puedeSena = BG.puede('registrarCobros');
    let creado = null;
    const quedan = (p) => BG.vendibles(p) - sum(st.items.filter((x) => x.productoId === p.id), (x) => x.cantidad);
    const total = () => sum(st.items, (x) => BG.producto(x.productoId).precioVenta * x.cantidad);
    const pintarItems = (form) => {
      $('#ap-lista', form).innerHTML = st.items.length ? st.items.map((x, i) => {
        const p = BG.producto(x.productoId);
        return '<div class="picked"><span class="avatar">' + icon('tag', 'i-sm') + '</span><div class="grow"><div class="row-title">' + esc(p.descripcion) + '</div>'
          + '<div class="row-sub">' + gs(p.precioVenta) + ' c/u · se pueden apartar ' + (quedan(p) + x.cantidad) + '</div></div>'
          + '<div class="qty" role="group" aria-label="Cantidad de ' + esc(p.descripcion) + '"><button type="button" class="btn-icon" data-ap="menos" data-i="' + i + '" aria-label="Uno menos">−</button>'
          + '<span class="qty-n">' + x.cantidad + '</span><button type="button" class="btn-icon" data-ap="mas" data-i="' + i + '" aria-label="Uno más"' + (quedan(p) > 0 ? '' : ' disabled') + '>+</button></div>'
          + '<button type="button" class="btn-icon" data-ap="quitar" data-i="' + i + '" aria-label="Quitar ' + esc(p.descripcion) + '">' + icon('x') + '</button></div>';
      }).join('') : '<p class="small muted">Buscá arriba lo que se guarda.</p>';
      const t = total();
      const sena = BG.leerGs ? Number(String(st.monto || '').replace(/\D/g, '')) || 0 : 0;
      $('#ap-info', form).innerHTML = st.items.length ? '<dl class="summary"><dt>Valor de lo apartado</dt><dd>' + gs(t) + '</dd>'
        + (puedeSena ? '<dt>Seña</dt><dd>' + gs(sena) + '</dd><div class="sep"></div><dt><strong>Falta pagar</strong></dt><dd class="big">' + gs(Math.max(0, t - sena)) + '</dd>' : '') + '</dl>' : '';
    };
    const r = await BG.modal({
      titulo: 'Apartar un artículo',
      ancho: 'wide',
      cuerpo: '<p class="small">Se le guarda a la clienta hasta la fecha que elijas: <strong>no se le puede vender a otra</strong>. La seña queda como saldo a favor suyo y se usa sola cuando se lo lleva.</p>'
        + '<div class="field"><span class="field-label">Clienta</span><div id="ap-cli" class="stack"></div></div>'
        + '<div class="field"><span class="field-label" id="ap-art-l">Qué se guarda</span><div class="search"><label class="sr-only" for="ap-q">Buscar el artículo</label><div class="search-box">' + icon('search')
        + '<input id="ap-q" class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar el artículo" role="combobox" aria-expanded="false" aria-controls="ap-q-lista" aria-autocomplete="list"></div>'
        + '<ul class="cb-list" id="ap-q-lista" role="listbox" hidden></ul></div></div>'
        + '<div id="ap-lista" class="stack-sm"></div>'
        + '<div class="field"><label for="ap-vence">Se lo guardamos hasta</label><div class="row"><input id="ap-vence" class="input input-date" type="date" value="' + st.vence + '" min="' + BG.hoy() + '" max="' + BG.sumarDias(BG.hoy(), 120) + '">'
        + [[3, '3 días'], [7, '1 semana'], [15, '15 días'], [30, '30 días']].map((x) => '<button type="button" class="chip" data-ap="dias" data-dias="' + x[0] + '">' + x[1] + '</button>').join('') + '</div></div>'
        + (puedeSena ? '<div class="field"><span class="field-label" id="ap-sena-l">Seña <span class="small muted">(opcional)</span></span><div class="row"><div class="seg" role="radiogroup" aria-labelledby="ap-sena-l">'
          + Object.keys(BG.FORMAS_CORTAS).map((k) => '<label><input type="radio" name="ap-forma" value="' + k + '"' + (k === 'efectivo' ? ' checked' : '') + '>' + BG.FORMAS_CORTAS[k] + '</label>').join('') + '</div>'
          + BG.campoGs('ap-monto', '', 'aria-label="Monto de la seña" placeholder="0"') + '</div></div>' : '<p class="hint">Para dejar una seña hace falta el permiso de cobrar: anotá el apartado y que la cobre quien pueda.</p>')
        + '<div id="ap-info"></div>'
        + '<div class="field"><label for="ap-nota">Nota <span class="small muted">(opcional)</span></label><input id="ap-nota" class="input" maxlength="120" autocomplete="off" placeholder="Ej.: lo retira el sábado"></div>'
        + '<p class="error-text" id="ap-error" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Apartar', valor: 'ok', clase: 'btn-primary', submit: true }],
      onMount: (dlg) => {
        const form = $('form', dlg);
        selectorClienta($('#ap-cli', form), st, () => pintarItems(form));
        pintarItems(form);
        BG.combobox($('#ap-q', form), $('#ap-q-lista', form), {
          mostrarVacio: true,
          buscar: (q) => (q.trim() ? BG.buscarProductos(q, 10, (p) => p.precioVenta > 0 && quedan(p) > 0) : BG.productosVivos().filter((p) => p.precioVenta > 0 && quedan(p) > 0).slice(-10).reverse()).map((p) => ({ p: p })),
          pintar: (x, q) => '<span class="avatar">' + icon('tag', 'i-sm') + '</span><span class="row-main"><span class="row-title">' + BG.resaltar(x.p.descripcion, q) + '</span>'
            + '<span class="row-sub">' + esc(x.p.categoria) + ' · se pueden apartar ' + quedan(x.p) + '</span></span><span class="row-end"><span class="amount">' + gs(x.p.precioVenta) + '</span></span>',
          vacio: (q) => (q.trim() ? 'No hay nada con stock que se llame «' + esc(q) + '»' : 'No hay artículos con stock para apartar.'),
          elegir: (x) => {
            const ya = st.items.find((y) => y.productoId === x.p.id);
            if (ya) ya.cantidad++; else st.items.push({ productoId: x.p.id, cantidad: 1 });
            $('#ap-q', form).value = '';
            pintarItems(form);
          },
        });
        form.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ap]');
          if (!b) return;
          const i = Number(b.dataset.i);
          if (b.dataset.ap === 'dias') { st.vence = BG.sumarDias(BG.hoy(), Number(b.dataset.dias)); $('#ap-vence', form).value = st.vence; return; }
          const x = st.items[i];
          if (b.dataset.ap === 'mas' && quedan(BG.producto(x.productoId)) > 0) x.cantidad++;
          else if (b.dataset.ap === 'menos') { x.cantidad--; if (x.cantidad < 1) st.items.splice(i, 1); }
          else if (b.dataset.ap === 'quitar') st.items.splice(i, 1);
          pintarItems(form);
        });
        form.addEventListener('input', (e) => {
          if (e.target.id === 'ap-vence') st.vence = e.target.value;
          if (e.target.id === 'ap-monto') { st.monto = e.target.value; pintarItems(form); }
          if (e.target.id === 'ap-nota') st.nota = e.target.value;
        });
        form.addEventListener('change', (e) => { if (e.target.name === 'ap-forma') st.forma = e.target.value; if (e.target.id === 'ap-vence') st.vence = e.target.value; });
      },
      // Se anota acá adentro para que, si algo no se puede (no alcanza el stock, falta la fecha), el error salga en el mismo diálogo.
      validar: (val, dlg) => {
        const er = $('#ap-error', dlg);
        const monto = Number(String(st.monto || '').replace(/\D/g, '')) || 0;
        try {
          if (!st.clienteId) throw new Error('Elegí la clienta.');
          creado = BG.apartar({ clienteId: st.clienteId, items: st.items, vence: st.vence, sena: monto > 0 ? { forma: st.forma, monto: monto } : null, nota: st.nota });
          return true;
        } catch (e) {
          er.textContent = e.message;
          er.hidden = false;
          return false;
        }
      },
    });
    if (r !== 'ok' || !creado) return null;
    BG.toast('Apartado para ' + BG.cliente(creado.clienteId).nombre.split(' ')[0] + ': ' + itemsTexto(creado.items) + ' hasta el ' + BG.fmtFecha(creado.vence)
      + (creado.sena ? ' · seña ' + gs(creado.sena.monto) + ' (recibo ' + BG.fmtRecibo(creado.sena.recibo) + ')' : '') + '.');
    return creado;
  };

  async function cambiarFechaApartadoUI(r) {
    let fecha = r.vence;
    const ok = await BG.modal({
      titulo: 'Cambiar la fecha límite',
      cuerpo: '<p class="small">' + esc(BG.cliente(r.clienteId).nombre) + ' · ' + esc(itemsTexto(r.items)) + '. Hoy vence el ' + BG.fmtFecha(r.vence) + '.</p>'
        + '<div class="field"><label for="ap-f">Nueva fecha límite</label><input id="ap-f" class="input input-date" type="date" value="' + (r.vence < BG.hoy() ? BG.sumarDias(BG.hoy(), 7) : r.vence) + '" min="' + BG.hoy() + '" max="' + BG.sumarDias(BG.hoy(), 120) + '"></div>'
        + '<p class="error-text" id="ap-f-e" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Guardar fecha', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        fecha = $('#ap-f', dlg).value;
        try { BG.cambiarVenceApartado(r.id, fecha); return true; } catch (e) { const er = $('#ap-f-e', dlg); er.textContent = e.message; er.hidden = false; return false; }
      },
    });
    if (ok !== 'ok') return false;
    BG.toast('Listo: se lo guardamos hasta el ' + BG.fmtFecha(fecha) + '.');
    return true;
  }

  async function liberarApartadoUI(r) {
    const cli = BG.cliente(r.clienteId);
    const efecto = () => '<div class="callout callout-warn efecto">' + icon('info') + '<div><strong>Al liberarlo:</strong><ul class="efecto-lista">'
      + '<li>Vuelve a poder venderse: <strong>' + esc(itemsTexto(r.items)) + '</strong>.</li>'
      + (r.sena ? '<li>La seña de <strong>' + gs(r.sena.monto) + '</strong> sigue siendo saldo a favor de ' + esc(cli.nombre.split(' ')[0]) + ' (si se la devolvés en plata, se hace desde su ficha).</li>' : '<li>No había seña: no se mueve plata.</li>')
      + '<li>Queda en el historial con fecha, motivo y usuario.</li></ul></div></div>';
    const m = await BG.pedirMotivoAnulacion('apartado', 'Liberar lo apartado para ' + cli.nombre, '<p>¿Por qué se libera?</p>', 'Liberar', efecto);
    if (!m) return false;
    BG.liberarApartado(r.id, m.texto);
    BG.toast('Liberado: ' + itemsTexto(r.items) + ' vuelve a estar a la venta.' + (r.sena ? ' La seña de ' + gs(r.sena.monto) + ' sigue a favor de ' + cli.nombre.split(' ')[0] + '.' : ''));
    return true;
  }

  BG.vistas.apartados = (args, params) => {
    const e = { filtro: params.get('filtro') || 'activos', q: '' };
    const todos = (BG.db.reservas || []).slice();
    const activos = todos.filter((r) => r.estado === 'activa').sort((a, b) => a.vence.localeCompare(b.vence));
    const vencidos = activos.filter((r) => BG.estadoReserva(r) === 'vencida');
    const cerrados = todos.filter((r) => r.estado !== 'activa').sort((a, b) => (b.cerrada ? b.cerrada.ts : b.ts).localeCompare(a.cerrada ? a.cerrada.ts : a.ts));
    const chip = (k, t, n) => '<button type="button" class="chip" data-filtro="' + k + '" aria-pressed="' + (e.filtro === k) + '">' + t + ' <span class="count">' + n + '</span></button>';
    const conSena = activos.filter((r) => r.sena);
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Apartados</h1><p class="page-sub">Lo que se le guardó a cada clienta, con seña y fecha límite. Mientras está apartado, no se le puede vender a otra.</p></div>'
      + '<div class="page-actions"><button type="button" class="btn btn-primary" data-accion="nuevo">' + icon('plus') + 'Apartar un artículo</button></div></div>'
      + '<section class="tiles tiles-compact" aria-label="Resumen de apartados">'
      + tile('Apartados', String(activos.length), plural(sum(activos, (r) => sum(r.items, (x) => x.cantidad)), 'unidad guardada', 'unidades guardadas'))
      + tile('Vencidos', String(vencidos.length), vencidos.length ? 'hay que decidir: vender, dar más tiempo o liberar' : 'ninguno', vencidos.length ? 'tile-bad' : '')
      + tile('Señas', gs(sum(conSena, (r) => r.sena.monto)), plural(conSena.length, 'apartado con seña', 'apartados con seña'))
      + '</section>'
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-apartados">Buscar</label>' + icon('search')
      + '<input id="q-apartados" class="search-input" type="search" autocomplete="off" placeholder="Buscar clienta o artículo"></div>'
      + '<div class="chips" role="group" aria-label="Filtrar">' + chip('activos', 'Activos', activos.length) + chip('vencidos', 'Vencidos', vencidos.length) + chip('cerrados', 'Retirados y liberados', cerrados.length) + '</div></div>'
      + '<div id="apartados-lista"></div></div>';
    const fila = (r) => {
      const c = BG.cliente(r.clienteId);
      const cerrada = r.estado !== 'activa';
      return '<li class="list-row cuota-fila"><span class="avatar">' + esc(BG.iniciales(c.nombre)) + '</span>'
        + '<span class="row-main"><a class="row-title" href="#/clientes/' + c.id + '">' + esc(c.nombre) + '</a>'
        + '<span class="row-sub">' + esc(itemsTexto(r.items)) + ' · ' + textoSena(r) + (r.nota ? ' · ' + esc(r.nota) : '') + ' · apartado el ' + BG.fmtFechaCorta(r.fecha) + ' por ' + esc(r.usuario) + '</span>'
        + (cerrada ? '<span class="row-sub">' + (r.estado === 'retirada' ? 'Se lo llevó el ' + BG.fmtFecha(r.cerrada.fecha) + ' · <a href="#/ventas/' + r.cerrada.ventaId + '">ver la venta</a>'
          : 'Liberado el ' + BG.fmtFecha(r.cerrada.fecha) + ': ' + esc(r.cerrada.motivo)) + '</span>' : '') + '</span>'
        + '<span class="row-end">' + pillApartado(r)
        + (cerrada ? '' : '<span class="row-actions"><a class="btn btn-sm btn-primary" href="#/ventas/nueva?cliente=' + c.id + '&reserva=' + r.id + '">' + icon('bag', 'i-sm') + 'Vender</a>'
          + '<button type="button" class="btn btn-sm" data-accion="fecha" data-id="' + r.id + '">' + icon('calendar', 'i-sm') + 'Fecha</button>'
          + '<a class="btn btn-sm" href="' + BG.waLink(c, BG.textosWa.apartado(c, r)) + '" target="_blank" rel="noopener">' + icon('chat', 'i-sm') + 'Avisarle</a>'
          + '<button type="button" class="btn btn-sm btn-quiet" data-accion="liberar" data-id="' + r.id + '">Liberar</button></span>') + '</span></li>';
    };
    const pintar = (root) => {
      const q = BG.norm ? BG.norm(e.q) : e.q.toLowerCase();
      const base = e.filtro === 'cerrados' ? cerrados : e.filtro === 'vencidos' ? vencidos : activos;
      const mostrar = base.filter((r) => !q || (BG.norm(BG.cliente(r.clienteId).nombre + ' ' + itemsTexto(r.items)).indexOf(q) >= 0));
      $('#apartados-lista', root).innerHTML = mostrar.length ? '<ul class="list">' + mostrar.map(fila).join('') + '</ul>'
        : '<p class="empty">' + (e.filtro === 'activos' && !activos.length ? 'No hay nada apartado. Cuando una clienta deje una seña por algo, apartalo acá.' : 'Nada con ese filtro.') + '</p>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-apartados', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        $$('[data-filtro]', root).forEach((b) => b.addEventListener('click', () => {
          e.filtro = b.dataset.filtro;
          $$('[data-filtro]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          try {
            if (b.dataset.accion === 'nuevo' && (await BG.apartarUI())) BG.render();
            else if (b.dataset.accion === 'fecha' && (await cambiarFechaApartadoUI(BG.reserva(b.dataset.id)))) BG.render();
            else if (b.dataset.accion === 'liberar' && (await liberarApartadoUI(BG.reserva(b.dataset.id)))) BG.render();
          } catch (er) { BG.toast(er.message, 'error'); }
        });
      },
    };
  };

  /* ── Lo que piden ────────────────────────────────────────────────────── */

  /** Dialog para anotar lo que pidió una clienta. `pre` = { clienteId }. Devuelve el pedido anotado (o null). */
  BG.deseoUI = async (pre) => {
    const st = { clienteId: (pre && pre.clienteId) || null, nombre: '', texto: '', detalle: '' };
    let creado = null;
    const r = await BG.modal({
      titulo: 'Anotar lo que pidió',
      cuerpo: '<p class="small">Para acordarte cuando llegue: la clienta pidió algo que no había (un talle, un color, una prenda).</p>'
        + '<div class="field"><span class="field-label">Quién lo pidió</span><div id="ds-cli" class="stack"></div></div>'
        + '<div class="field"><label for="ds-texto">¿Qué buscaba? <span class="req">*</span></label><input id="ds-texto" class="input" maxlength="80" autocomplete="off" placeholder="Ej.: botas negras"></div>'
        + '<div class="field"><label for="ds-detalle">Talle, color u otro detalle <span class="small muted">(opcional)</span></label><input id="ds-detalle" class="input" maxlength="80" autocomplete="off" placeholder="Ej.: talle 38"></div>'
        + '<p class="error-text" id="ds-error" role="alert" hidden></p>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Anotar', valor: 'ok', clase: 'btn-primary', submit: true }],
      onMount: (dlg) => {
        const form = $('form', dlg);
        selectorClienta($('#ds-cli', form), st, null, true);
        form.addEventListener('input', (e) => {
          if (e.target.id === 'ds-texto') st.texto = e.target.value;
          if (e.target.id === 'ds-detalle') st.detalle = e.target.value;
        });
      },
      validar: (val, dlg) => {
        try { creado = BG.anotarDeseo({ clienteId: st.clienteId, nombre: st.nombre, texto: st.texto, detalle: st.detalle }); return true; } catch (e) {
          const er = $('#ds-error', dlg); er.textContent = e.message; er.hidden = false; return false;
        }
      },
    });
    if (r !== 'ok' || !creado) return null;
    BG.toast('Anotado: ' + creado.nombre.split(' ')[0] + ' busca ' + creado.texto + (creado.detalle ? ' (' + creado.detalle + ')' : '') + '. Te aviso en «Lo que piden» cuando haya algo parecido.');
    return creado;
  };

  BG.vistas.deseos = (args, params) => {
    const e = { filtro: params.get('filtro') || 'pendientes' };
    const pendientes = BG.deseosPendientes().slice().sort((a, b) => b.ts.localeCompare(a.ts));
    const conStock = pendientes.filter((d) => BG.coincidenciasDeseo(d).length);
    const cerrados = (BG.db.deseos || []).filter((d) => d.estado === 'resuelta' || d.estado === 'descartada').sort((a, b) => b.cerrada.ts.localeCompare(a.cerrada.ts));
    const mas = BG.masPedido().filter((x) => x.n > 1).slice(0, 5);
    const puedeAnotar = BG.puede('registrarVentas') || BG.puede('editarClientes');
    const chip = (k, t, n) => '<button type="button" class="chip" data-filtro="' + k + '" aria-pressed="' + (e.filtro === k) + '">' + t + ' <span class="count">' + n + '</span></button>';
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Lo que piden</h1><p class="page-sub">Lo que las clientas buscaron y no había. Cuando llega algo parecido, te lo marca para avisarles.</p></div>'
      + (puedeAnotar ? '<div class="page-actions"><button type="button" class="btn btn-primary" data-accion="nuevo">' + icon('plus') + 'Anotar un pedido</button></div>' : '') + '</div>'
      + '<section class="tiles tiles-compact" aria-label="Resumen de pedidos">'
      + tile('Esperando', String(pendientes.length), plural(pendientes.length, 'pedido', 'pedidos'))
      + tile('Ya hay algo parecido', String(conStock.length), conStock.length ? 'avisales que llegó' : 'nada todavía', conStock.length ? 'tile-favor' : '')
      + '</section>'
      + (mas.length ? '<p class="small"><strong>Lo más pedido:</strong> ' + mas.map((x) => esc(x.texto) + ' <span class="muted">(' + x.n + ')</span>').join(' · ') + '. Pensalo para el próximo pedido al proveedor.</p>' : '')
      + '<div class="chips" role="group" aria-label="Filtrar">' + chip('pendientes', 'Esperando', pendientes.length) + chip('hay', 'Ya hay algo', conStock.length) + chip('cerrados', 'Cerrados', cerrados.length) + '</div>'
      + '<div id="deseos-lista"></div></div>';
    const fila = (d) => {
      const cli = d.clienteId ? BG.cliente(d.clienteId) : null;
      const coinciden = d.estado === 'resuelta' || d.estado === 'descartada' ? [] : BG.coincidenciasDeseo(d);
      const cerrado = d.estado === 'resuelta' || d.estado === 'descartada';
      const dias = BG.diasEntre(d.fecha, BG.hoy());
      return '<li class="list-row cuota-fila"><span class="avatar">' + esc(BG.iniciales(d.nombre)) + '</span>'
        + '<span class="row-main"><span class="row-title">' + esc(d.texto) + (d.detalle ? ' <span class="muted">· ' + esc(d.detalle) + '</span>' : '') + '</span>'
        + '<span class="row-sub">' + (cli ? '<a href="#/clientes/' + cli.id + '">' + esc(d.nombre) + '</a>' : esc(d.nombre)) + ' · lo pidió ' + hace(dias) + ' · anotó ' + esc(d.usuario) + '</span>'
        + (coinciden.length ? '<span class="row-sub t-favor">' + icon('check', 'i-sm') + 'Ya hay: ' + coinciden.map((p) => '<a href="#/productos">' + esc(p.descripcion) + '</a> (' + BG.vendibles(p) + ') ' + gs(p.precioVenta)).join(' · ') + '</span>' : '')
        + (cerrado ? '<span class="row-sub">' + (d.estado === 'resuelta' ? 'Resuelto' : 'Descartado') + ' el ' + BG.fmtFecha(d.cerrada.fecha) + (d.cerrada.nota ? ': ' + esc(d.cerrada.nota) : '') + '</span>' : '') + '</span>'
        + '<span class="row-end">' + (d.estado === 'avisada' ? '<span class="pill pill-good">' + icon('check') + 'Avisada ' + hace(BG.diasEntre(d.avisada.fecha, BG.hoy())) + '</span>' : cerrado ? '' : '<span class="pill pill-muted">Esperando</span>')
        + (cerrado ? '' : '<span class="row-actions">'
          + (cli && cli.telefono ? '<a class="btn btn-sm' + (coinciden.length ? ' btn-primary' : '') + '" href="' + BG.waLink(cli, BG.textosWa.deseo(cli, d, coinciden[0] || null)) + '" target="_blank" rel="noopener" data-avisar="' + d.id + '">' + icon('chat', 'i-sm') + 'Avisarle</a>' : '')
          + '<button type="button" class="btn btn-sm" data-accion="resuelto" data-id="' + d.id + '">Resuelto</button>'
          + '<button type="button" class="btn btn-sm btn-quiet" data-accion="descartar" data-id="' + d.id + '">Ya no lo quiere</button></span>') + '</span></li>';
    };
    const pintar = (root) => {
      const base = e.filtro === 'cerrados' ? cerrados : e.filtro === 'hay' ? conStock : pendientes;
      $('#deseos-lista', root).innerHTML = base.length ? '<ul class="list">' + base.map(fila).join('') + '</ul>'
        : '<p class="empty">' + (e.filtro === 'cerrados' ? 'Todavía no cerraste ninguno.' : e.filtro === 'hay' ? 'Todavía no llegó nada parecido a lo que piden.' : 'Nadie está esperando nada. Cuando una clienta pida algo que no hay, anotalo acá.') + '</p>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $$('[data-filtro]', root).forEach((b) => b.addEventListener('click', () => {
          e.filtro = b.dataset.filtro;
          $$('[data-filtro]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
        const cerrar = async (id, resultado) => {
          const d = BG.db.deseos.find((x) => x.id === id);
          let nota = '';
          const ok = await BG.modal({
            titulo: resultado === 'resuelta' ? 'Pedido resuelto' : 'Ya no lo quiere',
            cuerpo: '<p class="small">' + esc(d.nombre) + ' · ' + esc(d.texto) + (d.detalle ? ' (' + esc(d.detalle) + ')' : '') + '. Queda en el historial; no se borra.</p>'
              + '<div class="field"><label for="ds-nota">Nota <span class="small muted">(opcional)</span></label><input id="ds-nota" class="input" maxlength="100" autocomplete="off" placeholder="' + (resultado === 'resuelta' ? 'Ej.: se las llevó el sábado' : 'Ej.: encontró en otro lado') + '"></div>',
            acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: resultado === 'resuelta' ? 'Marcar resuelto' : 'Descartar', valor: 'ok', clase: 'btn-primary', submit: true }],
            validar: (v, dlg) => { nota = $('#ds-nota', dlg).value; return true; },
          });
          if (ok !== 'ok') return;
          BG.cerrarDeseo(id, resultado, nota);
          BG.toast(resultado === 'resuelta' ? 'Listo: pedido resuelto.' : 'Listo: pedido descartado.');
          BG.render();
        };
        root.addEventListener('click', async (ev) => {
          const av = ev.target.closest('[data-avisar]');
          if (av) {
            const id = av.dataset.avisar;
            setTimeout(() => { try { BG.avisarDeseo(id); BG.toast('Anotado: se le avisó.'); BG.render(); } catch (er) { BG.toast(er.message, 'error'); } }, 0);
            return;
          }
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          try {
            if (b.dataset.accion === 'nuevo' && (await BG.deseoUI({ clienteId: params.get('cliente') }))) BG.render();
            else if (b.dataset.accion === 'resuelto') await cerrar(b.dataset.id, 'resuelta');
            else if (b.dataset.accion === 'descartar') await cerrar(b.dataset.id, 'descartada');
          } catch (er) { BG.toast(er.message, 'error'); }
        });
        // «Anotar un pedido» desde la ficha de una clienta: abre el diálogo con ella ya elegida.
        if (params.get('nuevo') === '1' && puedeAnotar) {
          history.replaceState(null, '', '#/lo-que-piden' + (params.get('cliente') ? '?cliente=' + params.get('cliente') : ''));
          BG.deseoUI({ clienteId: params.get('cliente') }).then((x) => { if (x) BG.render(); });
        }
      },
    };
  };

  /* ── Inicio: resumen del día y avisos ────────────────────────────────── */

  /** Tarjeta del resumen del día para el dueño (con el botón de WhatsApp) y el stock bajo. */
  BG.htmlResumenInicio = () => {
    if (!BG.esDuena()) return '';
    const r = BG.resumenDelDia(BG.hoy());
    const st = r.stock;
    const nombres = (l) => l.slice(0, 4).map((x) => esc(x.p.descripcion) + (x.q > 0 ? ' (' + x.q + ')' : '')).join(', ') + (l.length > 4 ? ' y ' + (l.length - 4) + ' más' : '');
    const tel = BG.telefonoResumen();
    return '<section class="card stack" aria-labelledby="t-resumen-dia"><div class="card-head"><h2 id="t-resumen-dia">' + icon('chat') + 'Resumen del día</h2><a class="small" href="#/ajustes">' + (tel ? 'Se manda a ' + esc(tel) : 'Elegir el número') + '</a></div>'
      + '<ul class="bullets">'
      + '<li>Vendiste <strong>' + gs(r.vendido) + '</strong> (' + plural(r.ventas, 'venta', 'ventas') + ') y cobraste <strong>' + gs(r.cobrado) + '</strong>.</li>'
      + '<li>' + (r.aCuenta.length ? 'De lo de hoy quedó a deber <strong>' + gs(r.aCuentaTotal) + '</strong> (' + plural(r.aCuenta.length, 'clienta', 'clientas') + ').' : r.ventas ? 'Todo lo de hoy quedó pagado.' : 'Todavía no hay ventas hoy.') + ' En total te deben <strong>' + gs(r.deben.total) + '</strong>.</li>'
      + (st.agotados.length ? '<li>Se agotó: ' + nombres(st.agotados) + '.</li>' : '') + (st.bajos.length ? '<li>Quedan pocas: ' + nombres(st.bajos) + '.</li>' : '')
      + (!st.agotados.length && !st.bajos.length ? '<li>Nada se está acabando.</li>' : '') + '</ul>'
      + '<div class="row"><a class="btn btn-primary" href="' + BG.waLinkTel(tel, BG.textosInternos.resumenDia(r)) + '" target="_blank" rel="noopener" data-resumen="1">' + icon('chat', 'i-sm') + 'Resumen por WhatsApp</a>'
      + '<a class="btn btn-quiet" href="#/caja">Caja del día</a></div></section>';
  };
  /** Avisos de Inicio (los ven los dos): apartados y lo que piden. */
  BG.htmlAvisosOperacion = () => {
    const act = BG.reservasActivas();
    const venc = act.filter((r) => BG.estadoReserva(r) === 'vencida');
    const hoyVence = act.filter((r) => r.vence === BG.hoy());
    const pen = BG.deseosPendientes();
    const hay = pen.filter((d) => BG.coincidenciasDeseo(d).length);
    return (BG.puede('registrarVentas') && act.length
      ? '<a class="callout callout-link' + (venc.length ? ' callout-warn' : '') + '" href="#/apartados">' + icon('pause') + '<div><strong>Apartados: ' + act.length + '</strong> '
        + (venc.length ? plural(venc.length, 'venció', 'vencieron') + ': decidí si se vende, se da más tiempo o se libera.' : hoyVence.length ? plural(hoyVence.length, 'vence', 'vencen') + ' hoy.' : 'Ninguno vence todavía.') + '</div></a>' : '')
      + (pen.length ? '<a class="callout callout-link' + (hay.length ? ' callout-good' : '') + '" href="#/lo-que-piden">' + icon('star') + '<div><strong>Lo que piden: ' + pen.length + ' esperando</strong> '
        + (hay.length ? plural(hay.length, 'ya tiene algo parecido en stock', 'ya tienen algo parecido en stock') + ': avisales.' : 'Cuando llegue algo parecido te lo marco.') + '</div></a>' : '');
  };
  /** Tarjeta del perfil de una clienta: lo que tiene apartado y lo que pidió, con los botones para anotar. */
  BG.htmlOperacionCliente = (c) => {
    const ap = BG.reservasActivas().filter((r) => r.clienteId === c.id);
    const ds = BG.deseosPendientes().filter((d) => d.clienteId === c.id);
    const puedeApartar = BG.puede('registrarVentas');
    const puedeAnotar = puedeApartar || BG.puede('editarClientes');
    if (!ap.length && !ds.length && !puedeApartar) return '';
    return '<section class="card stack" aria-labelledby="t-op-cli"><div class="card-head"><h2 id="t-op-cli">' + icon('pause') + 'Apartados y pedidos</h2>'
      + '<div class="row">' + (puedeApartar ? '<button type="button" class="btn btn-sm" data-accion="apartar">' + icon('plus', 'i-sm') + 'Apartar un artículo</button>' : '')
      + (puedeAnotar ? '<button type="button" class="btn btn-sm btn-quiet" data-accion="anotar-deseo">Anotar un pedido</button>' : '') + '</div></div>'
      + (ap.length ? '<ul class="lines">' + ap.map((r) => '<li class="line"><div class="line-top"><div class="grow"><div class="row-title">' + esc(itemsTexto(r.items)) + '</div><div class="row-sub">' + textoSena(r) + '</div></div>' + pillApartado(r)
        + (puedeApartar ? '<a class="btn btn-sm btn-primary" href="#/ventas/nueva?cliente=' + c.id + '&reserva=' + r.id + '">Vender</a>' : '') + '</div></li>').join('') + '</ul>' : '<p class="small muted">No tiene nada apartado.</p>')
      + (ds.length ? '<p class="small"><strong>Pidió:</strong> ' + ds.map((d) => esc(d.texto) + (d.detalle ? ' (' + esc(d.detalle) + ')' : '')).join(' · ') + ' · <a href="#/lo-que-piden">ver pedidos</a></p>' : '')
      + '</section>';
  };
})();

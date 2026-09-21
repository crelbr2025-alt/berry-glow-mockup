/*!
 * berry.Glow_py — Resumen gráfico para el dueño: ventas y cobros por semana, formas de pago,
 * deudas por antigüedad, envíos por ciudad, productos más vendidos y actividad de cada usuario.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  function rango(p) {
    const h = BG.hoy();
    if (p === '30') return [BG.sumarDias(h, -29), h];
    if (p === 'anterior') { const fin = BG.sumarDias(h.slice(0, 8) + '01', -1); return [fin.slice(0, 8) + '01', fin]; }
    return [h.slice(0, 8) + '01', h];
  }
  const aFecha = (iso) => { const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };

  /** Semanas (lunes a domingo) que tocan el período, recortadas a sus bordes. */
  function semanas(desde, hasta) {
    const out = [];
    let ini = desde;
    while (ini <= hasta) {
      const dow = (aFecha(ini).getDay() + 6) % 7; // 0 = lunes
      let fin = BG.sumarDias(ini, 6 - dow);
      if (fin > hasta) fin = hasta;
      out.push({ desde: ini, hasta: fin, etiqueta: aFecha(ini).getDate() + (ini === fin ? '' : '–' + aFecha(fin).getDate()) + ' ' + BG.MESES[aFecha(fin).getMonth()].slice(0, 3) });
      ini = BG.sumarDias(fin, 1);
    }
    return out;
  }

  function pasoLindo(x) {
    if (x <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(x)));
    const n = x / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function compacto(v) {
    if (v >= 1e6) return C.fmtNum(C.div(C.Q(BigInt(Math.round(v))), C.Q(1000000n)), 0, 1) + ' M';
    if (v >= 1e3) return Math.round(v / 1e3) + ' mil';
    return String(v);
  }

  /** Barras horizontales con el valor al final (lista legible también sin color). */
  function barrasH(items, vacio) {
    if (!items.length) return '<p class="empty">' + (vacio || 'Sin datos en el período.') + '</p>';
    const max = Math.max(1, ...items.map((x) => x.valor));
    return '<ul class="hbars">' + items.map((x) => '<li class="hbar"><span class="hbar-label">' + esc(x.etiqueta) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span>'
      + '<span class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:' + Math.max(1.5, (x.valor / max) * 100).toFixed(1) + '%"></span></span>'
      + '<span class="hbar-value">' + x.texto + '</span></li>').join('') + '</ul>';
  }

  /** Columnas agrupadas (dos series) con eje, leyenda, globito al pasar y tabla. */
  function columnas(id, grupos, series) {
    const W = 640;
    const H = 250;
    const ml = 56;
    const mr = 8;
    const mt = 12;
    const mb = 28;
    const pw = W - ml - mr;
    const ph = H - mt - mb;
    const maxV = Math.max(1, ...grupos.map((g) => Math.max(...g.valores)));
    const paso = pasoLindo(maxV / 4);
    const tope = Math.max(paso, Math.ceil(maxV / paso) * paso);
    const y = (v) => mt + ph - (v / tope) * ph;
    const banda = pw / grupos.length;
    const bw = Math.min(24, (banda * 0.7 - 2) / 2);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="' + id + '-t"><title id="' + id + '-t">' + esc(series.map((x) => x.nombre).join(' y ')) + ' por semana</title>';
    for (let t = 0; t <= tope + 0.001; t += paso) {
      s += '<line class="grid-line" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/>'
        + '<text class="tick" x="' + (ml - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + compacto(t) + '</text>';
    }
    grupos.forEach((g, i) => {
      const x0 = ml + i * banda + (banda - (bw * 2 + 2)) / 2;
      s += '<rect class="hit" x="' + (ml + i * banda).toFixed(1) + '" y="' + mt + '" width="' + banda.toFixed(1) + '" height="' + ph + '" tabindex="0" data-i="' + i + '" aria-label="' + esc(g.etiqueta + ': ' + series.map((x, k) => x.nombre + ' ' + gs(g.valores[k])).join(', ')) + '"/>';
      g.valores.forEach((v, k) => {
        if (v <= 0) return;
        const x = x0 + k * (bw + 2);
        const top = y(v);
        const base = mt + ph;
        const r = Math.min(4, base - top, bw / 2);
        s += '<path class="bar ' + series[k].clase + '" d="M' + x.toFixed(1) + ',' + base + 'V' + (top + r).toFixed(1) + 'Q' + x.toFixed(1) + ',' + top.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + top.toFixed(1)
          + 'H' + (x + bw - r).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ',' + top.toFixed(1) + ' ' + (x + bw).toFixed(1) + ',' + (top + r).toFixed(1) + 'V' + base + 'Z"/>';
      });
      s += '<text class="tick" x="' + (ml + i * banda + banda / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(g.etiqueta) + '</text>';
    });
    s += '<line class="axis-line" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (mt + ph) + '" y2="' + (mt + ph) + '"/></svg>';
    return '<div class="legend">' + series.map((x) => '<span class="legend-item"><span class="legend-swatch ' + x.clase + '"></span>' + esc(x.nombre) + '</span>').join('') + '</div>'
      + '<div class="chart" id="' + id + '">' + s + '<div class="chart-tip" hidden></div></div>'
      + '<details class="table-toggle"><summary>Ver los datos como tabla</summary><div class="table-wrap"><table class="table table-compact"><thead><tr><th>Semana</th>'
      + series.map((x) => '<th class="num">' + esc(x.nombre) + '</th>').join('') + '</tr></thead><tbody>'
      + grupos.map((g) => '<tr><td>' + esc(g.etiqueta) + '</td>' + g.valores.map((v) => '<td class="num">' + gs(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>';
  }
  function enlazarColumnas(root, id, grupos, series) {
    const cont = $('#' + id, root);
    if (!cont) return;
    const tip = $('.chart-tip', cont);
    const svg = $('svg', cont);
    const mostrar = (i) => {
      const hit = $('.hit[data-i="' + i + '"]', cont);
      const vb = svg.viewBox.baseVal;
      const pct = ((Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2) / vb.width) * 100;
      tip.innerHTML = '';
      const t = document.createElement('span');
      t.className = 'tip-title';
      t.textContent = grupos[i].etiqueta;
      tip.appendChild(t);
      series.forEach((x, k) => {
        const fila = document.createElement('span');
        fila.className = 'tip-row';
        fila.innerHTML = '<span class="tip-key ' + x.clase + '"></span>';
        const valor = document.createElement('strong');
        valor.textContent = gs(grupos[i].valores[k]);
        const nombre = document.createElement('span');
        nombre.textContent = ' ' + x.nombre;
        fila.appendChild(valor);
        fila.appendChild(nombre);
        tip.appendChild(fila);
      });
      tip.style.left = pct + '%';
      tip.style.top = '14%';
      tip.style.transform = pct > 78 ? 'translate(calc(-100% + 14px), -100%)' : pct < 22 ? 'translate(-14px, -100%)' : 'translate(-50%, -100%)';
      tip.hidden = false;
    };
    cont.addEventListener('pointerover', (e) => { const h = e.target.closest('.hit'); if (h) mostrar(Number(h.dataset.i)); });
    cont.addEventListener('pointerleave', () => { tip.hidden = true; });
    cont.addEventListener('focusin', (e) => { const h = e.target.closest('.hit'); if (h) mostrar(Number(h.dataset.i)); });
    cont.addEventListener('focusout', () => { tip.hidden = true; });
  }

  const tile = (label, valor, sub) => '<div class="tile"><span class="tile-label">' + label + '</span><span class="tile-value">' + valor + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';

  BG.vistas.resumen = (args, params) => {
    const e = { periodo: params.get('periodo') || 'mes' };
    const html = '<div class="page"><div class="page-head"><div><h1 class="page-title">Resumen</h1><p class="page-sub">Vista gráfica solo para ' + esc(BG.nombreDuena()) + ': cómo va el negocio y quién hizo qué.</p></div>'
      + '<div class="page-actions"><a class="btn btn-quiet" href="#/reportes">' + icon('chart') + 'Reportes detallados</a><a class="btn btn-quiet" href="#/auditoria">' + icon('audit') + 'Auditoría</a></div></div>'
      + '<div class="chips" role="group" aria-label="Período">' + [['mes', 'Este mes'], ['30', 'Últimos 30 días'], ['anterior', 'Mes anterior']]
        .map(([k, t]) => '<button type="button" class="chip" data-periodo="' + k + '" aria-pressed="' + (e.periodo === k) + '">' + t + '</button>').join('') + '</div>'
      + '<div id="rs-cuerpo" class="stack"></div></div>';
    let root = null;
    const pintar = () => {
      const [desde, hasta] = rango(e.periodo);
      const enR = (f) => f >= desde && f <= hasta;
      const ventas = BG.db.ventas.filter((v) => !v.anulada && enR(v.fecha));
      const pagos = BG.db.pagos.filter((p) => !p.anulado && enR(p.fecha));
      const dinero = (p) => sum(p.partes.filter((x) => x.forma !== 'saldo'), (x) => x.monto);
      const f = BG.totalesPorForma(pagos);
      const vendido = sum(ventas, (v) => v.total);
      const cobrado = sum(pagos, dinero);
      const ganancia = sum(ventas, BG.gananciaVenta);
      const deudores = BG.listaDeudores();
      const envios = BG.db.envios.filter((x) => enR(x.creado.slice(0, 10)));
      const fleteTienda = sum(envios.filter((x) => x.flete.paga === 'tienda' && x.estado !== 'cancelado'), (x) => x.flete.monto);

      const sem = semanas(desde, hasta).map((w) => ({
        etiqueta: w.etiqueta,
        valores: [sum(ventas.filter((v) => v.fecha >= w.desde && v.fecha <= w.hasta), (v) => v.total), sum(pagos.filter((p) => p.fecha >= w.desde && p.fecha <= w.hasta), dinero)],
      }));
      const series = [{ nombre: 'Vendido', clase: 's1' }, { nombre: 'Cobrado', clase: 's2' }];

      const formas = ['efectivo', 'transferencia', 'qr', 'tarjeta'].map((k) => ({ etiqueta: BG.FORMAS[k], valor: f[k], texto: gs(f[k]) }))
        .filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);

      const tramo = (a, b) => deudores.filter((d) => { const n = BG.diasEntre(d.desde, BG.hoy()); return n >= a && n <= b; });
      const tramos = [['Hasta 15 días', tramo(0, 14)], ['De 15 a 30 días', tramo(15, 30)], ['Más de 30 días', tramo(31, 99999)]]
        .map(([t, ds]) => ({ etiqueta: t, sub: ds.length + (ds.length === 1 ? ' cliente' : ' clientes'), valor: sum(ds, (d) => d.saldo), texto: gs(sum(ds, (d) => d.saldo)) }));

      const porCiudad = {};
      envios.filter((x) => x.estado !== 'cancelado').forEach((x) => { porCiudad[x.destinatario.ciudad] = (porCiudad[x.destinatario.ciudad] || 0) + 1; });
      const ciudades = Object.keys(porCiudad).map((k) => ({ etiqueta: k, valor: porCiudad[k], texto: porCiudad[k] + (porCiudad[k] === 1 ? ' envío' : ' envíos') }))
        .sort((a, b) => b.valor - a.valor).slice(0, 8);
      const estados = ['preparando', 'listo', 'despachado', 'entregado'].map((k) => '<span class="pill ' + ({ preparando: 'pill-muted', listo: 'pill-berry', despachado: 'pill-warn', entregado: 'pill-good' })[k] + '">'
        + BG.ESTADOS_ENVIO[k] + ' · ' + BG.db.envios.filter((x) => x.estado === k).length + '</span>').join(' ');

      const unidades = {};
      ventas.forEach((v) => v.items.forEach((it) => {
        const u = unidades[it.productoId] || (unidades[it.productoId] = { etiqueta: it.descripcion, valor: 0, monto: 0 });
        u.valor += it.cantidad;
        u.monto += it.precio * it.cantidad;
      }));
      const top = Object.values(unidades).sort((a, b) => b.valor - a.valor || b.monto - a.monto).slice(0, 6)
        .map((x) => ({ etiqueta: x.etiqueta, sub: gs(x.monto), valor: x.valor, texto: x.valor + (x.valor === 1 ? ' u' : ' u') }));

      const actividad = BG.db.usuarios.map((u) => {
        const vs = ventas.filter((v) => v.usuario === u.nombre);
        const ps = pagos.filter((p) => p.usuario === u.nombre);
        const em = BG.db.emisiones.filter((x) => x.usuario === u.nombre && enR(x.ts.slice(0, 10)));
        const en = BG.db.envios.filter((x) => x.usuario === u.nombre && enR(x.creado.slice(0, 10)));
        const ultimo = BG.db.auditoria.find((a) => a.usuario === u.nombre);
        return { u: u, ventas: vs.length, vendido: sum(vs, (v) => v.total), cobros: ps.length, cobrado: sum(ps, dinero), recibos: em.length, envios: en.length, ultimo: ultimo };
      });

      $('#rs-cuerpo', root).innerHTML = '<p class="small muted">Del ' + BG.fmtFecha(desde) + ' al ' + BG.fmtFecha(hasta) + '</p>'
        + '<div class="tiles tiles-5 tiles-compact">' + tile('Vendido', gs(vendido), ventas.length + (ventas.length === 1 ? ' venta' : ' ventas'))
        + tile('Cobrado', gs(cobrado), 'plata que entró en el período') + tile('Ganancia real', gs(ganancia), 'precio de venta − costo congelado')
        + tile('Por cobrar hoy', gs(sum(deudores, (d) => d.saldo)), deudores.length + ' clientes') + tile('Envíos', String(envios.length), fleteTienda ? 'fletes pagados por la tienda: ' + gs(fleteTienda) : 'en el período') + '</div>'
        + '<div class="grid-2 grid-charts">'
        + '<section class="card stack"><div class="card-head"><h2>Ventas y cobros por semana</h2><a class="small" href="#/reportes">Detalle</a></div>' + columnas('rs-semanas', sem, series) + '</section>'
        + '<section class="card stack"><div class="card-head"><h2>Cobrado por forma de pago</h2><span class="small muted">' + gs(cobrado) + '</span></div>' + barrasH(formas, 'Sin cobros en el período.')
        + (f.saldo ? '<p class="hint">Además se usaron ' + gs(f.saldo) + ' de saldo a favor (no es plata nueva).</p>' : '') + '</section>'
        + '<section class="card stack"><div class="card-head"><h2>Deuda por antigüedad</h2><a class="small" href="#/reportes?tab=deudores">Ver deudores</a></div>' + barrasH(tramos)
        + '<p class="hint">Lo de más de 30 días es lo primero a reclamar.</p></section>'
        + '<section class="card stack"><div class="card-head"><h2>Envíos por ciudad de destino</h2><a class="small" href="#/envios">Ver envíos</a></div>' + barrasH(ciudades, 'Sin envíos en el período.')
        + '<p class="row">' + estados + '</p></section>'
        + '<section class="card stack"><div class="card-head"><h2>Productos más vendidos</h2><span class="small muted">unidades</span></div>' + barrasH(top, 'Sin ventas en el período.') + '</section>'
        + '<section class="card stack"><div class="card-head"><h2>Actividad por usuario</h2><a class="small" href="#/auditoria">Auditoría</a></div>'
        + '<ul class="actividad">'
        + actividad.map((a) => '<li><div class="act-quien"><strong>' + esc(a.u.nombre) + '</strong><span class="small muted">' + (a.u.rol === 'admin' ? 'Dueño' : 'Vendedora')
          + (a.ultimo ? ' · último movimiento ' + BG.fmtFecha(a.ultimo.ts.slice(0, 10)) + ' ' + BG.fmtHora(a.ultimo.ts) : '') + '</span></div>'
          + '<dl class="act-nums">'
          + '<div><dt>Ventas</dt><dd>' + a.ventas + '<span class="act-monto">' + gs(a.vendido) + '</span></dd></div>'
          + '<div><dt>Cobros</dt><dd>' + a.cobros + '<span class="act-monto">' + gs(a.cobrado) + '</span></dd></div>'
          + '<div><dt>Recibos</dt><dd>' + a.recibos + '<span class="act-monto">emitidos</span></dd></div>'
          + '<div><dt>Envíos</dt><dd>' + a.envios + '<span class="act-monto">preparados</span></dd></div></dl></li>').join('')
        + '</ul><p class="hint">Todo lo que hace cada usuario queda en la auditoría, con fecha y hora.</p></section>'
        + '</div>';
      enlazarColumnas(root, 'rs-semanas', sem, series);
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        pintar();
        root.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-periodo]');
          if (!b) return;
          e.periodo = b.dataset.periodo;
          $$('[data-periodo]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar();
        });
      },
    };
  };
})();

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
  /** Tamaño elegido en este aparato para cada formato (porcentaje); y la forma vieja (normal / chica / muy chica), que se sigue leyendo. */
  const KEY_TAMANO = 'berryglow.mockup.tamano.';
  const KEY_LETRA = 'berryglow.mockup.letra';
  const KEY_MARGEN = 'berryglow.mockup.margen';
  const LETRA_VIEJA = { normal: 100, chica: 90, mini: 78 };
  const KEY_DETALLE = 'berryglow.mockup.historial.detalle';
  const KEY_GUIA = 'berryglow.mockup.guia';
  /** Márgenes de la hoja al imprimir (mm): angostos = entra más. */
  const MARGENES = { a4: { normal: 14, angosto: 7 }, ticket: { normal: 4, angosto: 2 } };

  /* ── Datos públicos del recibo ───────────────────────────────────────── */

  /** Cómo se pagó, en palabras para la clienta: lo pagado con puntos dice «con tus puntos» y no «saldo a favor». */
  const formasPublicas = (p) => {
    if (p.anterior) return [{ forma: 'Pagado antes', monto: p.total }];
    const out = [];
    for (const x of p.partes) {
      const puntos = x.forma === 'saldo' ? Math.min(x.deCanje || 0, x.monto) : 0;
      if (puntos) out.push({ forma: 'Con tus puntos', monto: puntos, puntos: true });
      if (x.monto - puntos > 0) out.push({ forma: BG.FORMAS[x.forma], monto: x.monto - puntos });
    }
    return out;
  };
  /**
   * Los canjes de puntos de la clienta y en qué compras se usaron (BG.usoDePuntos). Si se pasa `ventaId`, solo
   * lo que se usó en esa compra. Es lo que pidió la tienda: que el recibo diga cuándo usó sus puntos y para qué.
   */
  const usosDePuntos = (cid, ventaIds) => BG.usoDePuntos(cid)
    .map((k) => ({ fecha: k.fecha, puntos: k.puntos, monto: k.monto, sinUsar: k.sinUsar,
      usos: k.usos.filter((u) => !ventaIds || ventaIds.has(u.ventaId)) }))
    .filter((k) => !ventaIds || k.usos.length);

  /** Los términos y condiciones que la tienda escribió y que salen en este tipo de comprobante (solo lo público: título y texto). */
  const terminosPropios = (grupo) => BG.terminosDeRecibo(grupo).map((t) => ({ id: t.id, titulo: t.titulo, texto: t.texto }));

  function datosRecibo(tipo, id, pagosIds, ver) {
    const destacados = pagosIds.map((pid) => BG.db.pagos.find((p) => p.id === pid)).filter(Boolean);
    let cli;
    let ventas;
    if (tipo === 'v') {
      const v = BG.venta(id);
      if (!v) return null;
      cli = BG.cliente(v.clienteId);
      ventas = [v];
    } else if (tipo === 'p') {
      // Comprobante de puntos: no lleva compras ni saldos, solo los puntos y las condiciones.
      cli = BG.cliente(id);
      const p = cli ? BG.resumenPuntos(cli.id) : null;
      if (!cli || !p) return null;
      const t0 = BG.db.config.tienda;
      return {
        tienda: { nombre: t0.nombre, whatsapp: t0.whatsapp, instagram: t0.instagram, direccion: t0.direccion, mensaje: t0.mensaje },
        titulo: 'Comprobante de puntos', numero: null, emision: BG.hoy(), soloPuntos: true,
        cliente: { nombre: cli.nombre, documento: cli.ci ? (cli.ci.includes('-') ? 'RUC ' : 'CI ') + cli.ci : 'Sin CI/RUC' },
        compras: [], saldoCuenta: BG.saldoCliente(cli.id), aFavor: BG.creditoCliente(cli.id),
        puntos: p, puntosAlPagar: 0, puntosGanados: 0, terminosPuntos: p.terminos,
        detallePuntos: p, clienteRef: cli, terminos: terminosPropios('cuenta'),
      };
    } else {
      cli = BG.cliente(id);
      if (!cli) return null;
      const ids = new Set(destacados.map((p) => p.ventaId).filter(Boolean));
      const porFecha = (a, b) => a.ts.localeCompare(b.ts);
      if (tipo === 'a') ventas = BG.ventasDeCliente(cli.id).filter((v) => !v.anulada && BG.esAnterior(v)).sort(porFecha);
      // Estado de cuenta: todo el historial (lo pagado también; así nada «desaparece» al terminar de pagar),
      // o solo lo que debe. El recibo de un pago muestra las compras que tocó ese pago y las que deben.
      else if (!destacados.length && ver !== 'debe') ventas = BG.ventasDeCliente(cli.id).filter((v) => !v.anulada).sort(porFecha);
      else ventas = BG.ventasDeCliente(cli.id).filter((v) => ids.has(v.id) || BG.saldoVenta(v) > 0).sort(porFecha);
    }
    const historial = tipo === 'a' || (tipo === 'c' && !destacados.length && ver !== 'debe');
    const numero = destacados.length ? destacados[0].recibo : tipo === 'v' ? ventas[0].recibo : null;
    const t = BG.db.config.tienda;
    return {
      tienda: { nombre: t.nombre, whatsapp: t.whatsapp, instagram: t.instagram, direccion: t.direccion, mensaje: t.mensaje },
      titulo: destacados.length ? 'Recibo de pago' : tipo === 'v' ? (BG.esAnterior(ventas[0]) ? 'Compra anterior' : 'Recibo') : tipo === 'a' ? 'Compras anteriores' : 'Estado de cuenta',
      subtitulo: tipo === 'a' ? 'Lo que llevaste antes del sistema' : historial ? 'Todas tus compras y pagos' : tipo === 'c' && !destacados.length ? 'Lo que tenés pendiente' : '',
      historial: historial, anteriores: tipo === 'a',
      numero: numero,
      emision: BG.hoy(),
      cliente: { nombre: cli.nombre, documento: cli.ci ? (cli.ci.includes('-') ? 'RUC ' : 'CI ') + cli.ci : 'Sin CI/RUC' },
      compras: ventas.map((v) => {
        const ep = BG.estadoPlan(v);
        return {
          numero: v.recibo, fecha: v.fecha, anulada: !!v.anulada, anterior: BG.esAnterior(v),
          // Si se corrigió: cuándo y cuánto era el total antes (lo único público de la corrección: nada de costos ni motivos internos).
          corregida: (v.correcciones || []).length || (v.traslados || []).length ? {
            fecha: (v.correcciones || []).concat(v.traslados || []).map((x) => x.fecha).sort().pop(),
            totalAntes: (v.correcciones || []).length ? v.correcciones[0].totalAntes : v.total,
          } : null,
          // Solo lo que la clienta se quedó; lo devuelto va en «Cambios y devoluciones».
          items: v.items.filter((it) => BG.cantidadViva(it) > 0).map((it) => ({ descripcion: it.descripcion, cantidad: BG.cantidadViva(it), precio: it.precio, agregado: !!it.agregado })),
          agregados: (v.agregados || []).map((a) => ({ fecha: a.fecha, texto: a.items.map((i) => v.items[i].cantidad + ' × ' + v.items[i].descripcion).join(', ') })),
          subtotal: v.subtotal, descuento: v.descuento.monto, total: v.total,
          pagos: BG.pagosDeVenta(v.id).sort((a, b) => a.ts.localeCompare(b.ts)).map((p) => ({
            fecha: p.fecha, monto: p.total, nuevo: pagosIds.indexOf(p.id) >= 0, recibo: p.recibo, anterior: !!p.anterior,
            formas: formasPublicas(p),
            aFavor: p.excedente, puntos: p.puntos || 0,
          })),
          // Público: qué devolvió o cambió y qué pasó con la plata (sin motivos internos).
          devoluciones: (v.devoluciones || []).map((d) => ({
            fecha: d.fecha,
            texto: d.tipo === 'talle' ? 'Cambio de talle: ' + d.cantidad + ' × ' + d.descripcion + (d.talle ? ' (' + d.talle + ')' : '')
              : d.tipo === 'cambio' ? 'Cambio: ' + d.cantidad + ' × ' + d.descripcion + ' por ' + d.cantidad + ' × ' + d.productoNuevo
                : 'Devolución: ' + d.cantidad + ' × ' + d.descripcion,
            aFavor: d.aFavor, reintegro: d.reintegro, forma: d.forma ? BG.FORMAS[d.forma].toLowerCase() : '',
          })),
          aFavorMovido: v.aFavor || 0,
          cuotas: ep ? ep.cuotas.filter((c) => c.falta > 0).map((c) => ({ n: c.n, de: c.de, vence: c.vence, falta: c.falta, vencida: c.estado === 'vencida' })) : [],
          pagado: BG.pagadoVenta(v), saldo: BG.saldoVenta(v),
        };
      }),
      saldoCuenta: BG.saldoCliente(cli.id),
      // Lo que debe de las compras de este comprobante (en el de compras anteriores es lo único que cuenta).
      saldoDocumento: ventas.reduce((a, v) => a + BG.saldoVenta(v), 0),
      saldoAnterior: BG.saldoAnterior(cli.id),
      aFavor: BG.creditoCliente(cli.id),
      puntos: BG.puntosDe(cli.id),
      // Cuándo usó sus puntos y en qué compra: en el recibo de una compra, lo de esa compra; en el estado de
      // cuenta con todo el historial, todos los canjes.
      usosPuntos: !BG.configFidelidad().activo || tipo === 'a' ? []
        : usosDePuntos(cli.id, historial ? null : new Set(ventas.map((v) => v.id))),
      // En el recibo de una compra que todavía debe: cuántos puntos le faltan por sumar y va a sumar cuando la termine de pagar.
      puntosAlPagar: tipo === 'v' && BG.configFidelidad().activo && BG.saldoVenta(ventas[0]) > 0 ? BG.puntosDeVenta(ventas[0]) - BG.puntosGanadosDeVenta(ventas[0]) : 0,
      // Compras de este recibo que YA quedaron pagadas: los puntos que sumaron (es lo que la clienta quiere ver).
      puntosGanados: BG.configFidelidad().activo
        ? ventas.filter((v) => !v.anulada && BG.saldoVenta(v) <= 0).reduce((a, v) => a + BG.puntosGanadosDeVenta(v), 0) : 0,
      // Compras que todavía debe pero que ya sumaron algo con sus pagos, y lo que sumaron los pagos de ESTE recibo.
      puntosPorPagos: BG.configFidelidad().activo
        ? ventas.filter((v) => !v.anulada && BG.saldoVenta(v) > 0).reduce((a, v) => a + BG.puntosGanadosDeVenta(v), 0) : 0,
      puntosDeEstePago: BG.configFidelidad().activo
        ? destacados.filter((p) => !p.anulado && p.ventaId && BG.saldoVenta(BG.venta(p.ventaId)) > 0).reduce((a, p) => a + (p.puntos || 0), 0) : 0,
      // Lo que el dueño eligió al cobrar sobre mostrar los puntos en el recibo de ese pago (null = lo que dice Ajustes).
      verPuntosPago: destacados.some((p) => p.puntosEnRecibo === false) ? false : destacados.some((p) => p.puntosEnRecibo === true) ? true : null,
      terminosPuntos: BG.configFidelidad().activo ? BG.configFidelidad().terminos : '',
      clienteRef: cli,
      terminos: terminosPropios(tipo === 'v' || destacados.length ? 'compra' : 'cuenta'),
    };
  }

  /**
   * Bloque de puntos del recibo. Sale solo si el dueño lo dejó activado (Ajustes → Clientas frecuentes) y si
   * en esta emisión no lo apagó con el interruptor de arriba. Cuando la compra todavía no está pagada, la
   * letra chica dice que por eso todavía no suma.
   */
  function bloquePuntos(d) {
    const usos = d.usosPuntos || [];
    const tieneAlgo = d.puntosGanados || d.puntosAlPagar || d.puntosPorPagos || d.puntosDeEstePago || (d.puntos && d.puntos.puntos > 0) || usos.length;
    if (!tieneAlgo) return '';
    // Puntos usados: cada canje con su fecha y en qué compra se usó (o lo que todavía le queda de ese canje).
    const lineaUso = (k) => '<tr><td>' + BG.fmtFecha(k.fecha) + ' · usaste ' + k.puntos + (k.puntos === 1 ? ' punto' : ' puntos')
      + '<div class="r-forms">' + (k.usos.length ? k.usos.map((u) => gs(u.monto) + ' en la compra ' + BG.fmtRecibo(u.recibo) + ' del ' + BG.fmtFecha(u.fecha)).join(' · ') : 'Todavía no lo usaste en una compra')
      + (d.historial && k.sinUsar > 0 && k.usos.length ? ' · te quedan ' + gs(k.sinUsar) + ' para la próxima' : '') + '</div></td>'
      + '<td class="num">' + gs(d.historial ? k.monto : k.usos.reduce((a, u) => a + u.monto, 0)) + '</td></tr>';
    return (usos.length ? '<h2 class="r-sub r-sub-puntos">' + (d.historial ? 'Tus puntos usados' : 'Puntos que usaste en esta compra') + '</h2><table class="r-table"><tbody>' + usos.map(lineaUso).join('') + '</tbody></table>' : '')
      + (d.puntosGanados ? '<p class="r-account r-puntos"><span>' + (d.compras.length === 1 ? 'Esta compra te sumó' : 'Estas compras te sumaron') + '</span><strong>' + d.puntosGanados + (d.puntosGanados === 1 ? ' punto' : ' puntos') + '</strong></p>' : '')
      + (d.puntosDeEstePago ? '<p class="r-account r-puntos"><span>Con este pago sumaste</span><strong>' + d.puntosDeEstePago + (d.puntosDeEstePago === 1 ? ' punto' : ' puntos') + '</strong></p>'
        : d.puntosPorPagos ? '<p class="r-account"><span>Con tus pagos ya sumaste</span><strong>' + d.puntosPorPagos + (d.puntosPorPagos === 1 ? ' punto' : ' puntos') + '</strong></p>' : '')
      + (d.puntos && d.puntos.puntos > 0 ? '<p class="r-account"><span>Tus puntos acumulados: ' + d.puntos.puntos + (d.puntos.canjeable ? ' · ya los podés usar' : '') + '</span><strong>' + gs(d.puntos.valor) + '</strong></p>' : '')
      + (d.puntosAlPagar ? '<p class="r-account"><span>Al terminar de pagar esta compra sumás' + (d.puntosPorPagos ? ' otros' : '') + '</span><strong>' + d.puntosAlPagar + (d.puntosAlPagar === 1 ? ' punto' : ' puntos') + '</strong></p>'
        + '<p class="r-chica">' + (d.puntosPorPagos ? 'Parte de los puntos ya se acreditó con tus pagos; el resto se acredita cuando quede pagada del todo.' : 'Esta compra todavía no suma puntos: se acreditan cuando quede pagada del todo.') + '</p>' : '')
      + (d.terminosPuntos ? '<p class="r-terminos"><strong>Programa de clientas frecuentes:</strong> ' + esc(d.terminosPuntos) + '</p>' : '');
  }

  /** Comprobante de puntos: cuántos tiene, de dónde salieron, qué canjeó y las condiciones. */
  function htmlSoloPuntos(d) {
    const p = d.detallePuntos;
    return '<section class="r-section"><h2>Tus puntos<span>al ' + BG.fmtFecha(d.emision) + '</span></h2>'
      + '<p class="r-puntos-gran">' + p.puntos + '<small>' + (p.puntos === 1 ? ' punto' : ' puntos') + '</small></p>'
      + '<p class="r-account"><span>Equivalen a un descuento de</span><strong>' + gs(p.valor) + '</strong></p>'
      + '<p class="r-account"><span>' + (p.canjeable ? 'Ya los podés usar como descuento en tu próxima compra'
        : 'Te faltan ' + p.falta + (p.falta === 1 ? ' punto para poder usarlos' : ' puntos para poder usarlos')) + '</span><strong>se usan desde ' + p.minimo + '</strong></p>'
      + (p.pendientes ? '<p class="r-account"><span>Vas a sumar, al terminar de pagar tus compras en cuotas</span><strong>' + p.pendientes + ' puntos</strong></p>' : '')
      + '</section>'
      + (p.ganadas.length ? '<section class="r-section"><h2 class="r-sub">De dónde salieron</h2><table class="r-table"><thead><tr><th>Compra</th><th class="num">Importe</th><th class="num">Puntos</th></tr></thead><tbody>'
        + p.ganadas.map((x) => '<tr><td>' + BG.fmtFecha(x.fecha) + ' · ' + BG.fmtRecibo(x.recibo) + (x.parcial ? '<div class="r-forms">Con lo que ya pagaste de esta compra</div>' : '') + '</td><td class="num">' + gs(x.total) + '</td><td class="num">' + x.puntos + '</td></tr>').join('')
        + '</tbody><tfoot><tr><td colspan="2">Puntos ganados</td><td class="num">' + p.ganados + '</td></tr></tfoot></table></section>' : '')
      + (p.canjes.length ? '<section class="r-section"><h2 class="r-sub">Puntos que ya usaste</h2><table class="r-table"><tbody>'
        + p.canjes.map((k) => '<tr><td>' + BG.fmtFecha(k.fecha) + ' · canje de ' + k.puntos + (k.puntos === 1 ? ' punto' : ' puntos') + '</td><td class="num">' + gs(k.monto) + '</td></tr>').join('')
        + '</tbody><tfoot><tr><td>Total usado</td><td class="num">' + p.canjeados + (p.canjeados === 1 ? ' punto' : ' puntos') + '</td></tr></tfoot></table></section>' : '')
      + '<div class="r-saldo' + (p.canjeable ? ' is-paid' : '') + '"><span>Tu descuento disponible</span><strong>' + gs(p.valor) + '</strong></div>'
      + (d.aFavor > 0 ? '<p class="r-account"><span>Además tenés a favor para tu próxima compra</span><strong>' + gs(d.aFavor) + '</strong></p>' : '')
      + '<p class="r-terminos"><strong>Condiciones del programa:</strong> ' + esc(p.terminos) + '</p>'
      + '<p class="r-chica">1 punto cada ' + gs(p.cadaGs) + ' de compra pagada · cada punto vale ' + gs(p.valorPunto) + ' de descuento. '
      + 'Este comprobante vale por los puntos que tenías al ' + BG.fmtFecha(d.emision) + '.</p>';
  }

  /** Una línea de la compra para el historial: «2 × Remera · 1 × Jean» (lo que se quedó). */
  const detalleCorto = (c) => c.items.map((it) => (it.cantidad > 1 ? it.cantidad + ' × ' : '') + esc(it.descripcion)).join(' · ');

  /**
   * Estado de cuenta compacto: una fila por compra (con lo que llevó, el total, lo pagado y el saldo), la lista
   * de pagos y las cuotas que faltan. Pensado para que entre lo máximo posible en una sola hoja o un solo ticket.
   * Las compras de antes del sistema van aparte, con su propio subtotal.
   */
  function htmlHistorial(d, verPuntos) {
    const tabla = (compras, titulo) => {
      const tot = compras.reduce((a, c) => ({ total: a.total + c.total, pagado: a.pagado + c.pagado, saldo: a.saldo + c.saldo }), { total: 0, pagado: 0, saldo: 0 });
      return '<section class="r-section"><h2>' + titulo + '<span>' + compras.length + (compras.length === 1 ? ' compra' : ' compras') + '</span></h2>'
        + '<table class="r-table r-hist"><thead><tr><th>Compra</th><th class="num">Total</th><th class="num col-pagado">Pagado</th><th class="num">Saldo</th></tr></thead><tbody>'
        // Fecha y número por separado: en el ticket (angosto) van en renglones distintos y no empujan los montos afuera.
        + compras.map((c) => '<tr><td><span class="r-fecha">' + BG.fmtFecha(c.fecha) + '</span> <span class="r-fecha r-nro">' + BG.fmtRecibo(c.numero) + '</span> ' + detalleCorto(c)
          + (c.agregados.length ? '<div class="r-forms">' + c.agregados.map((a) => 'el ' + BG.fmtFechaCorta(a.fecha) + ' se sumó: ' + esc(a.texto)).join(' · ') + '</div>' : '')
          + (c.devoluciones.length ? '<div class="r-forms">' + c.devoluciones.map((x) => BG.fmtFechaCorta(x.fecha) + ' · ' + esc(x.texto)).join(' · ') + '</div>' : '')
          + (c.descuento ? '<div class="r-forms">Descuento ' + gs(c.descuento) + '</div>' : '')
          + (c.corregida ? '<div class="r-forms">Corregida el ' + BG.fmtFechaCorta(c.corregida.fecha) + '</div>' : '') + '</td>'
          + '<td class="num">' + gs(c.total) + '</td><td class="num col-pagado">' + gs(c.pagado) + '</td><td class="num"><strong>' + (c.saldo > 0 ? gs(c.saldo) : '—') + '</strong></td></tr>').join('')
        + '</tbody><tfoot><tr><td>Total</td><td class="num">' + gs(tot.total) + '</td><td class="num col-pagado">' + gs(tot.pagado) + '</td><td class="num">' + gs(tot.saldo) + '</td></tr></tfoot></table></section>';
    };
    const actuales = d.compras.filter((c) => !c.anterior);
    const anteriores = d.compras.filter((c) => c.anterior);
    const pagos = [];
    d.compras.forEach((c) => c.pagos.forEach((p) => pagos.push(Object.assign({ compra: c.numero }, p))));
    pagos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.recibo || 0) - (b.recibo || 0));
    const cuotas = [];
    d.compras.forEach((c) => c.cuotas.forEach((q) => cuotas.push(Object.assign({ compra: c.numero }, q))));
    cuotas.sort((a, b) => a.vence.localeCompare(b.vence));
    const devuelto = d.compras.reduce((a, c) => a + c.aFavorMovido, 0);
    return (actuales.length ? tabla(actuales, d.anteriores ? 'Lo que llevaste' : 'Tus compras') : '')
      + (anteriores.length ? tabla(anteriores, d.anteriores ? 'Lo que llevaste antes del sistema' : 'Compras de antes del sistema') : '')
      + (!d.compras.length ? '<p class="r-section">Todavía no hay compras.</p>' : '')
      // Un renglón por pago: fecha y recibo, cómo pagó y a qué compra fue. En hoja A4 van en dos columnas.
      + (pagos.length ? '<section class="r-section"><h2>' + (d.anteriores ? 'Lo que pagaste' : 'Tus pagos') + '<span>' + pagos.length + (pagos.length === 1 ? ' pago' : ' pagos') + '</span></h2><ul class="r-pagos">'
        + pagos.map((p) => '<li><span class="grow"><span class="r-fecha">' + (p.anterior ? 'Antes del sistema' : BG.fmtFecha(p.fecha) + ' · ' + BG.fmtRecibo(p.recibo)) + '</span> '
          + '<span class="r-forms">' + p.formas.map((x) => x.forma + (p.formas.length > 1 ? ' ' + gs(x.monto) : '')).join(' + ') + ' · compra ' + BG.fmtRecibo(p.compra) + (p.aFavor ? ' · ' + gs(p.aFavor) + ' quedó a tu favor' : '')
          + (verPuntos && p.puntos ? ' · sumó ' + p.puntos + (p.puntos === 1 ? ' punto' : ' puntos') : '') + '</span></span>'
          + '<span class="num">' + gs(p.monto) + '</span></li>').join('')
        + '</ul><table class="r-table"><tfoot>'
        + (devuelto ? '<tr><td>Por devoluciones, pasó a tu saldo a favor</td><td class="num">−' + gs(devuelto) + '</td></tr>' : '')
        + '<tr><td>Total pagado</td><td class="num">' + gs(pagos.reduce((a, p) => a + p.monto, 0) - devuelto) + '</td></tr></tfoot></table></section>' : '')
      + (cuotas.length ? '<section class="r-section"><h2>Tus próximas cuotas</h2><table class="r-table"><tbody>' + cuotas.map((q) => '<tr' + (q.vencida ? ' class="is-late"' : '') + '><td>Cuota ' + q.n + ' de ' + q.de
        + ' · compra ' + BG.fmtRecibo(q.compra) + ' · ' + (q.vencida ? 'venció el ' : 'vence el ') + BG.fmtFecha(q.vence) + '</td><td class="num">' + gs(q.falta) + '</td></tr>').join('') + '</tbody></table></section>' : '');
  }

  function htmlRecibo(d, formato, verPuntos, escala, conDetalle, terminosOff) {
    const m = BG.configMarca();
    const t = d.tienda;
    const unaCompra = d.compras.length === 1;
    const deUnaCompra = unaCompra && d.titulo !== 'Estado de cuenta' && !d.anteriores;
    const saldoPrincipal = deUnaCompra ? d.compras[0].saldo : d.anteriores ? d.saldoDocumento : d.saldoCuenta;
    // En el recibo de una compra el recuadro habla de esa compra; "cuenta al día" solo si no debe nada en ninguna.
    const etiquetaSaldo = saldoPrincipal > 0 ? (deUnaCompra ? 'Saldo pendiente de esta compra' : d.anteriores ? 'Debés de lo de antes' : 'Saldo pendiente')
      : (deUnaCompra ? 'Compra saldada' : d.anteriores ? 'Lo de antes está saldado' : 'Cuenta al día');
    const compra = (c) => '<section class="r-section">'
      + '<h2>' + (c.anterior ? 'Compra de antes del sistema' : 'Detalle de la compra') + '<span>' + BG.fmtFecha(c.fecha) + ' · ' + BG.fmtRecibo(c.numero) + '</span></h2>'
      + (c.corregida ? '<p class="r-forms r-corregida">Comprobante corregido el ' + BG.fmtFecha(c.corregida.fecha) + (c.corregida.totalAntes !== c.total ? ' (el total era ' + gs(c.corregida.totalAntes) + ')' : '') + ': reemplaza al anterior.</p>' : '')
      + '<table class="r-table"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>'
      + c.items.map((it) => '<tr><td>' + esc(it.descripcion) + '</td><td class="num">' + it.cantidad + '</td><td class="num">' + gs(it.precio) + '</td><td class="num">' + gs(it.precio * it.cantidad) + '</td></tr>').join('')
      + (c.agregados.length ? '<tr><td colspan="4" class="r-forms">' + c.agregados.map((a) => 'El ' + BG.fmtFecha(a.fecha) + ' se sumó a esta compra: ' + esc(a.texto)).join('<br>') + '</td></tr>' : '')
      + '</tbody><tfoot>'
      + (c.descuento ? '<tr><td colspan="3">Subtotal</td><td class="num">' + gs(c.subtotal) + '</td></tr><tr><td colspan="3">Descuento</td><td class="num">−' + gs(c.descuento) + '</td></tr>' : '')
      + '<tr><td colspan="3">Total de la compra</td><td class="num">' + gs(c.total) + '</td></tr></tfoot></table>'
      + (c.devoluciones.length ? '<h2 class="r-sub">Cambios y devoluciones</h2><table class="r-table"><tbody>' + c.devoluciones.map((d) => '<tr><td>' + BG.fmtFecha(d.fecha) + ' · ' + esc(d.texto)
        + (d.aFavor ? '<div class="r-forms">' + (d.reintegro ? 'Se te devolvieron ' + gs(d.reintegro) + ' en ' + esc(d.forma)
          // Lo que se había pagado con puntos no vuelve en plata: queda a favor para otra compra.
          + (d.reintegro < d.aFavor ? '; los ' + gs(d.aFavor - d.reintegro) + ' que pagaste con puntos quedaron a tu favor' : '')
          : gs(d.aFavor) + ' quedaron a tu favor') + '</div>' : '') + '</td></tr>').join('') + '</tbody></table>' : '')
      + '<h2 class="r-sub">Pagos realizados</h2>'
      + (c.pagos.length ? '<table class="r-table"><tbody>' + c.pagos.map((p) => '<tr' + (p.nuevo ? ' class="is-new"' : '') + '><td>' + (p.anterior ? 'Antes del sistema' : BG.fmtFecha(p.fecha)) + (p.nuevo ? ' <strong>· pago de hoy</strong>' : '')
        + '<div class="r-forms">' + p.formas.map((x) => x.forma + ' ' + gs(x.monto)).join(' + ') + (p.aFavor ? ' · ' + gs(p.aFavor) + ' quedó a tu favor' : '')
        + (verPuntos && p.puntos ? ' · sumó ' + p.puntos + (p.puntos === 1 ? ' punto' : ' puntos') : '') + '</div></td>'
        + '<td class="num">' + gs(p.monto) + '</td></tr>').join('')
        + (c.aFavorMovido ? '<tr><td>Por la devolución, pasó a tu saldo a favor</td><td class="num">−' + gs(c.aFavorMovido) + '</td></tr>' : '')
        + '</tbody><tfoot><tr><td>Total pagado</td><td class="num">' + gs(c.pagado) + '</td></tr></tfoot></table>'
        : '<p class="r-forms">Todavía sin pagos.</p>')
      + (c.cuotas.length ? '<h2 class="r-sub">Tus próximas cuotas</h2><table class="r-table"><tbody>' + c.cuotas.map((q) => '<tr' + (q.vencida ? ' class="is-late"' : '') + '><td>Cuota ' + q.n + ' de ' + q.de + ' · '
        + (q.vencida ? 'venció el ' : 'vence el ') + BG.fmtFecha(q.vence) + '</td><td class="num">' + gs(q.falta) + '</td></tr>').join('') + '</tbody></table>' : '')
      + (unaCompra ? '' : '<p class="r-account"><span>Saldo de esta compra</span><strong>' + gs(c.saldo) + '</strong></p>')
      + '</section>';
    const legales = (d.terminos || []).filter((t) => !(terminosOff && terminosOff.has(t.id)));
    const filas = d.compras.reduce((a, c) => a + c.items.length + c.pagos.length + c.cuotas.length + c.devoluciones.length + 3, 0)
      + (d.soloPuntos ? d.detallePuntos.ganadas.length + d.detallePuntos.canjes.length + 4 : 0);
    const largo = filas > 16;
    const compacto = d.historial && !conDetalle;
    return '<article class="receipt' + (formato === 'ticket' ? ' is-ticket' : '') + (largo ? ' is-largo' : '')
      + (m.fondoCabecera === false ? '' : ' cab-color') + '" id="recibo"'
      + ' style="--r-zoom:' + (escala / 100) + ';--r-brand:' + esc(m.principal) + ';--r-accent:' + esc(m.acento) + ';--mark-berry:' + esc(m.principal) + ';--mark-glow:' + esc(m.acento) + ';--logo-escala:' + BG.escalaLogo() + '">'
      + '<header class="r-head"><div class="r-logo">' + BG.logo(true) + '</div>'
      + '<div class="r-doc"><h1>' + esc(d.titulo) + '</h1>' + (d.numero ? '<p class="r-num">' + BG.fmtRecibo(d.numero) + '</p>' : '')
      + (d.subtitulo ? '<p class="r-subt">' + esc(d.subtitulo) + '</p>' : '') + '<p>Emitido el ' + BG.fmtFecha(d.emision) + '</p></div></header>'
      + '<p class="r-contact">' + [t.whatsapp && 'WhatsApp ' + esc(t.whatsapp), t.instagram && 'Instagram ' + esc(t.instagram), t.direccion && esc(t.direccion)].filter(Boolean).map((x) => '<span>' + x + '</span>').join('') + '</p>'
      + '<div class="r-client"><div><span>Cliente</span><strong>' + esc(d.cliente.nombre) + '</strong></div><div><span>Documento</span><strong>' + esc(d.cliente.documento) + '</strong></div></div>'
      + (d.soloPuntos ? htmlSoloPuntos(d)
        : (compacto ? htmlHistorial(d, verPuntos)
          : d.compras.length ? d.compras.map(compra).join('') : '<p class="r-section">' + (d.historial ? 'Todavía no hay compras.' : 'No hay compras con saldo pendiente.') + '</p>')
          + '<div class="r-saldo' + (saldoPrincipal > 0 ? '' : ' is-paid') + '"><span>' + etiquetaSaldo + '</span><strong>' + gs(saldoPrincipal) + '</strong></div>'
          + (deUnaCompra && d.saldoCuenta !== saldoPrincipal ? '<p class="r-account"><span>Saldo total de tu cuenta (todas las compras)</span><strong>' + gs(d.saldoCuenta) + '</strong></p>' : '')
          // En la cuenta entera, lo de antes del sistema se dice aparte (está sumado en el saldo, pero se ve de dónde viene).
          + (!d.anteriores && !deUnaCompra && d.saldoAnterior > 0 && saldoPrincipal > d.saldoAnterior
            ? '<p class="r-account"><span>De eso, de compras de antes del sistema</span><strong>' + gs(d.saldoAnterior) + '</strong></p>' : '')
          + (d.anteriores && d.saldoCuenta !== saldoPrincipal ? '<p class="r-account"><span>Saldo total de tu cuenta (con lo de ahora)</span><strong>' + gs(d.saldoCuenta) + '</strong></p>' : '')
          + (d.aFavor > 0 ? '<div class="r-favor"><span>Saldo a tu favor para la próxima compra</span><strong>' + gs(d.aFavor) + '</strong></div>' : '')
          + (verPuntos ? bloquePuntos(d) : ''))
      + (legales.length ? '<section class="r-legales" data-propio="1"><h2 class="r-sub">Términos y condiciones</h2>'
        + legales.map((t) => '<p class="r-terminos"><strong>' + esc(t.titulo) + ':</strong> ' + esc(t.texto) + '</p>').join('') + '</section>' : '')
      + '<footer class="r-foot"><p class="r-thanks">' + esc(t.mensaje || '¡Gracias por tu compra!') + '</p><p class="r-legal">' + esc(t.nombre) + ' · ' + (d.soloPuntos ? 'Comprobante informativo de puntos' : 'Comprobante interno de pago') + ', no válido como factura.</p></footer>'
      + '</article>';
  }

  /** Busca en el texto del recibo cualquier dato interno. Devuelve la lista de lo que encontró. */
  BG.revisarPrivacidad = (el, compras) => {
    // Los términos y condiciones los escribe el dueño a propósito (puede decir «envíos» o «costo del flete»): no se revisan.
    const propios = Array.from(el.querySelectorAll('[data-propio]'));
    const estilos = propios.map((n) => n.style.display);
    propios.forEach((n) => { n.style.display = 'none'; });
    const texto = BG.norm(el.innerText);
    propios.forEach((n, i) => { n.style.display = estilos[i]; });
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
    const ver = params.get('ver') === 'debe' ? 'debe' : 'todo';
    const d = datosRecibo(tipo, args[1], pagosIds, ver);
    if (!d) return { html: '<div class="page"><p class="empty">No encontramos ese recibo.</p></div>' };
    const leerPref = (k, def, valido) => { try { const x = localStorage.getItem(k); return valido(x) ? x : def; } catch (e) { return def; } };
    const guardarPref = (k, x) => { try { localStorage.setItem(k, x); } catch (e) { /* sin almacenamiento */ } };
    let formato = leerPref(KEY_FORMATO, 'a4', (x) => x === 'a4' || x === 'ticket');
    // Tamaño de cada formato: el que se eligió en este aparato, si no el de antes (letra normal/chica/muy chica) y si no el que dejó el dueño.
    const escalaDe = (f) => {
      const propio = Number(leerPref(KEY_TAMANO + f, '', (x) => /^\d{2,3}$/.test(x || '')));
      if (propio >= BG.TAMANO_MIN && propio <= BG.TAMANO_MAX) return propio;
      const vieja = LETRA_VIEJA[leerPref(KEY_LETRA, '', (x) => !!LETRA_VIEJA[x])];
      return vieja || BG.tamanoRecibo(f);
    };
    let escala = escalaDe(formato);
    let margen = leerPref(KEY_MARGEN, 'normal', (x) => x === 'normal' || x === 'angosto');
    let conDetalle = leerPref(KEY_DETALLE, '0', (x) => x === '0' || x === '1') === '1';
    const cli = d.clienteRef;
    const ventasOrig = tipo === 'v' ? [BG.venta(args[1])] : BG.ventasDeCliente(cli.id);
    const prox = d.compras.length === 1 && d.compras[0].cuotas.length ? d.compras[0].cuotas[0] : null;
    const textoWa = d.soloPuntos ? BG.textosWa.puntos(cli, d.detallePuntos) : BG.textosWa.recibo(cli, d, prox);
    // Los puntos en el recibo: viene lo que eligió el dueño en Ajustes, y acá se puede cambiar solo para esta emisión.
    let verPuntos = BG.configFidelidad().activo && (d.verPuntosPago != null ? d.verPuntosPago : BG.configFidelidad().enRecibo);
    const volver = tipo === 'v' ? '#/ventas/' + args[1] : '#/clientes/' + cli.id;
    const tipoEmision = d.soloPuntos ? 'puntos' : d.anteriores ? 'anteriores' : null;
    const esCuenta = tipo === 'c' && !pagosIds.length;
    // Los términos que salen vienen de Ajustes; en cada comprobante se puede sacar alguno solo para esa vez.
    const terminosOff = new Set();
    const pintar = () => htmlRecibo(d, formato, verPuntos, escala, conDetalle, terminosOff);
    const html = '<div class="page">'
      + '<div class="receipt-toolbar no-print"><a class="back-link" href="' + volver + '">' + icon('left', 'i-sm') + 'Volver</a>'
      + '<div class="row"><div class="seg" role="radiogroup" aria-label="Formato de impresión">'
      + '<label><input type="radio" name="formato" value="a4"' + (formato === 'a4' ? ' checked' : '') + '>Hoja A4</label>'
      + '<label><input type="radio" name="formato" value="ticket"' + (formato === 'ticket' ? ' checked' : '') + '>Ticket 80 mm</label></div>'
      + '<button type="button" class="btn" data-accion="imprimir">' + icon('print') + 'Imprimir</button>'
      + '<button type="button" class="btn" data-accion="pdf">' + icon('download') + 'Guardar PDF</button>'
      + '<a class="btn btn-primary" data-accion="whatsapp" href="' + BG.waLink(cli, textoWa) + '" target="_blank" rel="noopener">' + icon('chat') + 'WhatsApp</a></div></div>'
      + '<div class="receipt-opciones no-print">'
      + (esCuenta ? '<div class="seg" role="radiogroup" aria-label="Qué muestra el estado de cuenta">'
        + '<label><input type="radio" name="r-ver" value="todo"' + (ver === 'todo' ? ' checked' : '') + '>Todo el historial</label>'
        + '<label><input type="radio" name="r-ver" value="debe"' + (ver === 'debe' ? ' checked' : '') + '>Solo lo que debe</label></div>' : '')
      + '<div class="r-tamano"><div class="seg" role="radiogroup" aria-label="Tamaño del comprobante"><span class="seg-label">Tamaño</span>'
      + BG.TAMANOS_RECIBO.map((x) => '<label><input type="radio" name="r-tam" value="' + x[0] + '"' + (escala === x[0] ? ' checked' : '') + '>' + x[1] + '</label>').join('') + '</div>'
      + '<input type="range" id="r-escala" min="' + BG.TAMANO_MIN + '" max="' + BG.TAMANO_MAX + '" step="1" value="' + escala + '" aria-label="Tamaño del comprobante, en porcentaje">'
      + '<output id="r-escala-n" for="r-escala">' + escala + ' %</output>'
      + (BG.esDuena() ? '<button type="button" class="btn btn-sm btn-quiet" data-accion="tamano-todos" title="Deja este tamaño como el de la tienda para este formato">Dejarlo para todos</button>' : '') + '</div>'
      + '<div class="seg" role="radiogroup" aria-label="Márgenes de la hoja"><span class="seg-label">Márgenes</span>'
      + '<label><input type="radio" name="r-margen" value="normal"' + (margen === 'normal' ? ' checked' : '') + '>Normales</label>'
      + '<label><input type="radio" name="r-margen" value="angosto"' + (margen === 'angosto' ? ' checked' : '') + '>Angostos</label></div>'
      + (d.historial ? '<label class="check-inline"><input type="checkbox" id="r-detalle"' + (conDetalle ? ' checked' : '') + '> Con el detalle de cada compra</label>' : '')
      + '</div>'
      + (BG.configFidelidad().activo && !d.soloPuntos
        ? '<label class="check-inline no-print"><input type="checkbox" id="r-puntos-ver"' + (verPuntos ? ' checked' : '') + '> Mostrar los puntos en este comprobante'
          + '<span class="hint"> · lo que viene marcado ' + (d.verPuntosPago != null ? 'lo elegiste al cobrar este pago' : 'se elige en <a href="#/ajustes">Ajustes → Clientas frecuentes</a>') + '</span></label>' : '')
      + (d.terminos.length ? '<div class="receipt-opciones no-print"><span class="seg-label">Términos y condiciones</span>'
        + d.terminos.map((t) => '<label class="check-inline"><input type="checkbox" data-termino="' + esc(t.id) + '" checked> ' + esc(t.titulo) + '</label>').join('')
        + (BG.esDuena() ? '<a class="small" href="#/ajustes">Editarlos</a>' : '') + '</div>' : '')
      + '<div class="no-print row" id="privacidad"></div>'
      + '<div class="receipt-stage">' + pintar() + '</div>'
      + '<p class="hint no-print">El PDF se genera con «Imprimir → Guardar como PDF». En el sistema final el PDF se crea directo y se adjunta en WhatsApp.</p>'
      + '</div>';
    let root = null;
    const aplicarFormato = (f) => {
      let st = document.getElementById('estilo-pagina');
      if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
      const mm = MARGENES[f][margen];
      st.textContent = f === 'ticket' ? '@page { size: 80mm auto; margin: ' + mm + 'mm; }' : '@page { size: A4; margin: ' + mm + 'mm; }';
    };
    /** Pone el tamaño en el comprobante y en los controles, sin volver a armarlo (así el deslizador no pierde el foco). */
    const aplicarEscala = (x) => {
      escala = Math.min(BG.TAMANO_MAX, Math.max(BG.TAMANO_MIN, Math.round(x)));
      const art = $('#recibo', root);
      if (art) art.style.setProperty('--r-zoom', String(escala / 100));
      const rango = $('#r-escala', root);
      if (rango && Number(rango.value) !== escala) rango.value = String(escala);
      const num = $('#r-escala-n', root);
      if (num) num.textContent = escala + ' %';
      $$('input[name="r-tam"]', root).forEach((r) => { r.checked = Number(r.value) === escala; });
    };
    return {
      html: html,
      mount: (r) => {
        root = r;
        aplicarFormato(formato);
        const revisar = () => {
          const h = BG.revisarPrivacidad($('#recibo', root), ventasOrig);
          const em = BG.emisionesDe(d.numero, cli.id, tipoEmision);
          const ult = em[em.length - 1];
          $('#privacidad', root).innerHTML = (h.length
            ? '<p class="privacy privacy-bad">' + icon('alert') + 'Atención: el recibo muestra ' + esc(h.join(', ')) + '.</p>'
            : '<p class="privacy privacy-ok">' + icon('shield') + 'Control automático: el recibo no muestra costos, dólares, cotización, envío, margen, ganancia ni proveedor.</p>')
            + '<p class="small muted">' + (em.length ? 'Emitido ' + em.length + (em.length === 1 ? ' vez' : ' veces') + ' · la última por ' + esc(ult.usuario) + ' el ' + BG.fmtFecha(ult.ts.slice(0, 10)) + ' a las ' + BG.fmtHora(ult.ts) + ' (' + esc(ult.medio) + ')'
              : 'Todavía no se emitió: al imprimir o mandar por WhatsApp queda registrado quién lo hizo.') + '</p>';
        };
        revisar();
        const emitir = (medio) => { BG.registrarEmision({ recibo: d.numero, ventaId: tipo === 'v' ? args[1] : null, clienteId: cli.id, medio: medio, tipo: tipoEmision }); revisar(); };
        const repintar = () => { $('.receipt-stage', root).innerHTML = pintar(); revisar(); };
        root.addEventListener('change', (e) => {
          const t = e.target;
          if (t.id === 'r-puntos-ver') { verPuntos = t.checked; repintar(); return; }
          if (t.dataset && t.dataset.termino) { if (t.checked) terminosOff.delete(t.dataset.termino); else terminosOff.add(t.dataset.termino); repintar(); return; }
          if (t.id === 'r-detalle') { conDetalle = t.checked; guardarPref(KEY_DETALLE, conDetalle ? '1' : '0'); repintar(); return; }
          if (t.name === 'r-tam' || t.id === 'r-escala') {
            aplicarEscala(Number(t.value));
            guardarPref(KEY_TAMANO + formato, String(escala));
            if (t.name === 'r-tam') BG.toast('Tamaño ' + escala + ' %: queda así para los próximos ' + (formato === 'ticket' ? 'tickets' : 'comprobantes en hoja') + ' de este aparato.');
            return;
          }
          if (t.name === 'r-margen') { margen = t.value; guardarPref(KEY_MARGEN, margen); aplicarFormato(formato); BG.toast('Márgenes ' + (margen === 'angosto' ? 'angostos' : 'normales') + ' al imprimir.'); return; }
          if (t.name === 'r-ver') { BG.ir('#/recibo/c/' + cli.id + (t.value === 'debe' ? '?ver=debe' : '')); return; }
          if (t.name !== 'formato') return;
          formato = t.value;
          guardarPref(KEY_FORMATO, formato);
          $('#recibo', root).classList.toggle('is-ticket', formato === 'ticket');
          aplicarFormato(formato);
          aplicarEscala(escalaDe(formato));   // cada formato con su tamaño
        });
        root.addEventListener('input', (e) => { if (e.target.id === 'r-escala') aplicarEscala(Number(e.target.value)); });
        root.addEventListener('click', (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          if (b.dataset.accion === 'tamano-todos') {
            try { const n = BG.guardarTamanoRecibo(formato, escala); BG.toast('Listo: el ' + (formato === 'ticket' ? 'ticket' : 'comprobante en hoja') + ' sale al ' + n + ' % para todos (cada aparato puede elegir otro).'); } catch (err) { BG.toast(err.message, 'error'); }
            return;
          }
          if (b.dataset.accion === 'whatsapp') { emitir('WhatsApp'); return; }
          if (b.dataset.accion === 'pdf') BG.toast('En la ventana que se abre, elegí «Guardar como PDF» como impresora.');
          if (b.dataset.accion === 'imprimir' || b.dataset.accion === 'pdf') {
            emitir(b.dataset.accion === 'pdf' ? 'PDF' : 'impresión');
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
      + '<h3>Lo último</h3><ul class="bullets">'
      + '<li><strong>Estado de cuenta con todo el historial:</strong> en la ficha de una clienta, «Estado de cuenta» muestra todas sus compras y pagos (también los ya pagados), con una opción «Solo lo que debe». El tamaño se elige arriba (de «Normal» a «Mínima», o con el deslizador), cada formato con el suyo, y los márgenes de la hoja también, para que entre más en una sola hoja o ticket.</li>'
      + '<li><strong>Puntos en cada pago:</strong> en Ajustes → Clientas frecuentes elegís si los puntos se suman al terminar de pagar o con cada pago; al cobrar, Ariel puede tildar «Sumar los puntos de este pago» y si salen en el recibo de ese pago.</li>'
      + '<li><strong>Términos y condiciones:</strong> en Ajustes, otros textos fijos (cambios y devoluciones, envíos…) que salen al pie de los comprobantes; en cada recibo se puede sacar alguno solo esa vez.</li>'
      + '<li><strong>Lo que llevó antes del sistema:</strong> como Ariel, en la ficha, «Lo que llevó antes»: fecha, artículos y cuánto ya pagó. Queda aparte, con su propio comprobante, sin tocar el stock ni la caja.</li>'
      + '<li><strong>Agregar artículos a una compra:</strong> en una venta, «Agregar artículos»: mismo recibo, el total sube; se puede pagar en el momento o dejar a cuenta.</li>'
      + '<li><strong>Puntos de compras viejas:</strong> si una compra es de antes del programa, la ficha lo dice y Ariel puede sumar esos puntos. El recibo dice cuándo usó sus puntos y en qué compra.</li>'
      + '<li><strong>Cuenta de ahorro:</strong> menú «Cuenta de ahorro»: lo que hay, depósitos, retiros y el pago de cada pedido al proveedor (desde el pedido, «Pagar desde la cuenta de ahorro»).</li></ul>'
      + '<h3>Lo nuevo: perfil de Ariel</h3><ul class="bullets">'
      + '<li><strong>Gastos y ganancia neta:</strong> menú «Gastos». Cargá alquiler, bolsas, servicios, publicidad…; el sistema suma solo los fletes de Envíos, la comisión de Jazmín y los puntos canjeados, y muestra cuánto queda de verdad. Lo pagado con la caja baja el efectivo del arqueo.</li>'
      + '<li><strong>Límite de crédito:</strong> en Ajustes (general) y en la ficha de cada clienta (otro monto o solo al contado). Probá vender a cuenta a Lorena Giménez (tiene una cuota atrasada) o a Mirian Báez (solo contado): Jazmín ve el aviso y necesita el PIN ' + esc(BG.pin()) + '.</li>'
      + '<li><strong>Conteo de inventario:</strong> Productos → «Conteo de inventario». Escribí lo que contaste; las diferencias corrigen el stock con su motivo. Hay un conteo de ejemplo con dos faltantes.</li>'
      + '<li><strong>Pedidos al proveedor:</strong> menú «Pedidos»: pedido → en camino → llegó. En el que está en camino, «Llegó: cargar al stock» abre la carga con los artículos del pedido.</li>'
      + '<li><strong>Clientas frecuentes:</strong> Reportes → «Clientas»: cumpleaños (con saludo por WhatsApp), frecuentes, puntos y las que hace mucho no compran. Los puntos se suman cuando la compra queda pagada del todo (en cuotas, al pagar la última); lo pagado con puntos no suma y no se devuelve en plata. Camila Acosta cumple hoy: al venderle aparece el regalo del 10 %; María José Benítez tiene puntos para canjear y Tamara Cáceres los va a sumar cuando termine sus cuotas.</li>'
      + '<li><strong>Jazmín, más simple:</strong> no ve nada de esto; solo los avisos al vender (solo contado, regalo de cumpleaños, puntos para canjear) y ya no ve los controles contables internos.</li></ul>'
      + '<h3>Versión anterior</h3><ul class="bullets">'
      + '<li><strong>Tema claro u oscuro:</strong> el botón del sol/luna de arriba cambia entre automático, claro y oscuro (en el celular también está en «Más»).</li>'
      + '<li><strong>Saldo a favor bien a la vista:</strong> pastilla dorada en la lista de clientes, recuadro en la ficha, en Inicio y al vender o cobrar (viene marcado para usarlo). Tamara tiene una seña de ₲ 100.000 y además debe: probá «Registrar cobro» con «Usarlo para pagar». Desde su ficha se puede devolver en plata (sale de la caja).</li>'
      + '<li><strong>Control del saldo a favor:</strong> en Inicio y en Reportes → Deudores el sistema reconstruye cada saldo a favor desde los pagos de más, señas, devoluciones, anulaciones y la plata devuelta, y avisa si algo no cuadra o queda negativo.</li>'
      + '<li><strong>Cuotas con fecha:</strong> al vender a cuenta, «Acordar cuotas con fecha». En «Cuotas» (menú) se ve lo atrasado y lo que vence esta semana, con «Recordar» por WhatsApp. Desde una venta: «Acordar cuotas» o «Cambiar cuotas».</li>'
      + '<li><strong>Devoluciones y cambios:</strong> en una venta, «Devolución o cambio»: devolver un artículo, cambiarlo por otro producto o por otro talle. Lo que sobra queda a favor o se devuelve en plata (Jazmín necesita el PIN ' + esc(BG.pin()) + ').</li>'
      + '<li><strong>Stock sin movimiento y próximo pedido:</strong> como Ariel, Reportes → «Stock y rotación»: lo que no se vende hace 30 días o más (con «Liquidar»), lo más vendido y cuánto pedir.</li>'
      + '<li><strong>Meta y comisión de Jazmín:</strong> ella ve «Tu mes» en Inicio (avance y comisión); Ariel la ve en Resumen y la cambia en Ajustes. Se calcula sobre la ganancia de lo cobrado: un descuento grande le baja la comisión.</li></ul>'
      + '<h3>Perfiles, precios especiales, envíos y resumen</h3><ul class="bullets">'
      + '<li><strong>Perfiles:</strong> arriba, «Ver como» cambia entre Ariel (dueño: ve y cambia todo) y Jazmín (vendedora: vende, cobra, emite recibos y prepara envíos, sin costos ni dólar, y sin anular).</li>'
      + '<li><strong>Permisos:</strong> como Ariel, en Ajustes → Usuarios y permisos, quitale a Jazmín por ejemplo «Registrar cobros» y fijate cómo desaparece esa opción en su vista.</li>'
      + '<li><strong>Envíos:</strong> desde una venta, «Preparar envío» → completá la lista de control → «Imprimir etiqueta» → «Registrar despacho» con el número de guía → «Marcar entregado».</li>'
      + '<li><strong>Resumen gráfico:</strong> como Ariel, en el menú «Resumen»: ventas y cobros por semana, deudas por antigüedad, envíos por ciudad y la actividad de cada usuario.</li>'
      + '<li><strong>Registro de todo:</strong> en Auditoría se puede filtrar por usuario; también quedan los recibos emitidos y cada paso de los envíos.</li>'
      + '<li><strong>Precio especial:</strong> como Jazmín, en «Nueva venta» → «Poner precio especial», elegí el motivo y mirá cómo calcula solo la ganancia. Si baja del margen mínimo (30 %), pide el PIN de Ariel (' + esc(BG.pin()) + '). Después de vender, «Ajustar precio» en la venta. Ariel lo ve en la venta, en el Resumen y en la Auditoría.</li></ul>'
      + '<h3>Otras reglas para probar</h3><ul class="bullets">'
      + '<li><strong>Anular en vez de borrar:</strong> solo Ariel puede anular; pide motivo y queda en la auditoría. Si el día tiene la caja cerrada pide el PIN (' + esc(BG.pin()) + ').</li>'
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
      + '<li><strong>Recibo:</strong> ¿hoja A4 o ticket de 80 mm? ¿Se agrega el teléfono de la clienta?</li>'
      + '<li><strong>Envíos:</strong> las empresas de la lista son ejemplos: ¿con cuáles mandan desde Coronel Oviedo? ¿Imprimen en etiquetas de 10 × 15 cm o en hoja A4?</li>'
      + '<li><strong>Talles y colores:</strong> ¿se cargan como variantes de cada prenda? Así el cambio de talle mueve el stock del talle correcto y el próximo pedido sugiere qué talle pedir.</li>'
      + '<li><strong>Comisión:</strong> ¿10 % de la ganancia de lo cobrado está bien, o prefieren un % de todo lo cobrado? ¿Cuál es la meta del mes?</li></ul>'
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

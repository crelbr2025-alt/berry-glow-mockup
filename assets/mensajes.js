/*!
 * berry.Glow_py — Los mensajes que se le mandan a la clienta por WhatsApp.
 *
 * Están todos acá para que suenen a la misma tienda: saludo, lo concreto (qué compró, qué pagó, qué falta,
 * cuándo vence) y un cierre amable. Nada de datos internos: ni costos, ni dólar, ni márgenes, ni motivos de
 * precio. Lo que se manda es lo mismo que la clienta ve en su recibo.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const gs = BG.gs;

  const nombreCorto = (cli) => String((cli && cli.nombre) || '').trim().split(' ')[0] || 'Hola';
  const tienda = () => BG.db.config.tienda.nombre;
  const saludo = () => { const h = new Date().getHours(); return h < 12 ? '¡Buen día' : h < 19 ? '¡Buenas tardes' : '¡Buenas noches'; };
  const unir = (lineas) => lineas.filter(Boolean).join('\n');

  /** Puntos que le quedan a la clienta, para cerrar el mensaje con algo lindo (si el programa está activo). */
  function lineaPuntos(clienteId) {
    const f = BG.configFidelidad();
    if (!f.activo) return '';
    const p = BG.puntosDe(clienteId);
    if (!p || !p.puntos) return '';
    return p.canjeable
      ? '🌟 Tenés ' + p.puntos + ' puntos (' + gs(p.valor) + ') para usar en tu próxima compra.'
      : '🌟 Ya llevás ' + p.puntos + ' puntos: desde ' + f.minimo + ' los podés usar como descuento.';
  }

  const lineaFavor = (aFavor) => (aFavor > 0 ? '💗 Además tenés ' + gs(aFavor) + ' a favor para tu próxima compra.' : '');

  BG.textosWa = {
    /** Después de registrar una venta: agradecer y dejar clarito qué pagó y qué queda. */
    compra: (cli, v) => {
      const pagado = BG.pagadoVenta(v);
      const saldo = BG.saldoVenta(v);
      const ep = BG.estadoPlan(v);
      const prox = ep && ep.cuotas.filter((c) => c.falta > 0)[0];
      const items = v.items.filter((it) => BG.cantidadViva(it) > 0)
        .map((it) => '• ' + it.descripcion + (BG.cantidadViva(it) > 1 ? ' x' + BG.cantidadViva(it) : ''));
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! 💗 Gracias por tu compra en ' + tienda() + '.',
        '',
        'Te paso el detalle:',
        items.join('\n'),
        'Total: ' + gs(v.total),
        pagado > 0 ? 'Pagaste: ' + gs(pagado) : null,
        saldo > 0 ? 'Te queda un saldo de ' + gs(saldo) + '.' : '✔️ Tu compra quedó saldada, ¡gracias!',
        prox ? 'Tu próxima cuota es de ' + gs(prox.falta) + ' y vence el ' + BG.fmtFecha(prox.vence) + '.' : null,
        'Comprobante ' + BG.fmtRecibo(v.recibo) + '.',
        lineaPuntos(v.clienteId),
        '',
        '¡Que lo disfrutes! Cualquier cosa escribinos por acá. ✨',
      ]);
    },

    /** Recordatorio de una cuota: firme en el dato, amable en el tono. */
    cuota: (cli, v, c) => unir([
      saludo() + ', ' + nombreCorto(cli) + '! ¿Cómo estás? Te escribimos de ' + tienda() + ' 💗',
      '',
      c.estado === 'vencida'
        ? 'Te recordamos que tu cuota ' + c.n + ' de ' + c.de + ', de ' + gs(c.falta) + ', venció el ' + BG.fmtFecha(c.vence) + '.'
        : c.estado === 'hoy'
          ? 'Hoy vence tu cuota ' + c.n + ' de ' + c.de + ', de ' + gs(c.falta) + '.'
          : 'Te recordamos que tu cuota ' + c.n + ' de ' + c.de + ', de ' + gs(c.falta) + ', vence el ' + BG.fmtFecha(c.vence) + '.',
      'Es de tu compra ' + BG.fmtRecibo(v.recibo) + '.',
      '',
      'Si ya la pagaste, avisanos y la marcamos al toque. Si necesitás acomodar la fecha, contanos y vemos juntas. 💗',
    ]),

    /** Estado de cuenta: sirve para cobrar y para avisar que está todo al día. */
    cuenta: (cli, opciones) => {
      const o = opciones || {};
      const saldo = o.saldo != null ? o.saldo : BG.saldoCliente(cli.id);
      const aFavor = o.aFavor != null ? o.aFavor : BG.creditoCliente(cli.id);
      const prox = o.proxima || null;
      if (saldo > 0) {
        return unir([
          saludo() + ', ' + nombreCorto(cli) + '! ¿Cómo estás? Te escribimos de ' + tienda() + ' 💗',
          '',
          'Te pasamos el estado de tu cuenta: tenés un saldo de ' + gs(saldo) + '.',
          prox ? 'Tu próxima cuota es de ' + gs(prox.falta) + ' y vence el ' + BG.fmtFecha(prox.vence) + '.' : null,
          lineaFavor(aFavor),
          '',
          'Si ya lo pagaste, avisanos y lo registramos. ¡Gracias por tu confianza! ✨',
        ]);
      }
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
        '',
        '✔️ Tu cuenta está al día, ¡gracias por tu confianza!',
        lineaFavor(aFavor),
        lineaPuntos(cli.id),
        '',
        'Cuando quieras ver lo que llegó, escribinos por acá. ¡Te esperamos! ✨',
      ]);
    },

    /** Recibo o estado de cuenta que se manda desde la pantalla del comprobante. */
    recibo: (cli, d, prox) => {
      const unaCompra = d.compras.length === 1 && d.titulo !== 'Estado de cuenta' && !d.anteriores;
      const c = unaCompra ? d.compras[0] : null;
      const total = d.compras.reduce((a, x) => a + x.total, 0);
      const pagado = d.compras.reduce((a, x) => a + x.pagado, 0);
      const saldo = d.anteriores ? d.saldoDocumento : d.saldoCuenta;
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
        '',
        c ? 'Te paso el comprobante de tu compra ' + BG.fmtRecibo(c.numero) + ':'
          : d.anteriores ? 'Te paso el detalle de lo que llevaste antes de que tuviéramos el sistema:'
            : d.historial ? 'Te paso el estado de tu cuenta, con todas tus compras y pagos:' : 'Te paso el resumen de tu cuenta:',
        c ? 'Total: ' + gs(c.total) + (c.pagado > 0 ? ' · Pagaste: ' + gs(c.pagado) : '')
          : d.historial && d.compras.length ? 'Compras: ' + gs(total) + ' · Pagaste: ' + gs(pagado) : null,
        saldo > 0 ? (d.anteriores ? 'Te queda de eso: ' : 'Saldo pendiente: ') + gs(saldo) + '.' : d.anteriores ? '✔️ Eso ya está pagado.' : '✔️ ¡Tu cuenta está al día!',
        prox ? 'Próxima cuota: ' + gs(prox.falta) + ' el ' + BG.fmtFecha(prox.vence) + '.' : null,
        lineaFavor(d.aFavor),
        lineaPuntos(cli.id),
        '',
        '¡Gracias por elegirnos! Cualquier consulta, escribinos por acá. ✨',
      ]);
    },

    /**
     * Respuesta a «¿cuántos puntos tengo?»: lo que tiene, cuánto vale, qué le falta y las condiciones.
     * Es el mismo número que sale en el comprobante de puntos (BG.resumenPuntos).
     */
    puntos: (cli, resumen, opciones) => {
      const p = resumen || BG.resumenPuntos(cli.id);
      if (!p) return '';
      // `condiciones: false`: el dueño destildó las condiciones del programa en el comprobante, y entonces tampoco van en el mensaje.
      const conCondiciones = !(opciones && opciones.condiciones === false);
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
        '',
        'Estos son tus puntos al ' + BG.fmtFecha(BG.hoy()) + ':',
        '🌟 Tenés ' + p.puntos + (p.puntos === 1 ? ' punto' : ' puntos') + ' = ' + gs(p.valor) + ' para usar como descuento.',
        p.canjeable ? '✔️ Ya los podés usar en tu próxima compra: avisanos y te los descontamos.'
          : 'Te faltan ' + p.falta + (p.falta === 1 ? ' punto' : ' puntos') + ' para poder usarlos (se usan desde ' + p.minimo + ').',
        p.pendientes ? '⏳ Vas a sumar ' + p.pendientes + (p.pendientes === 1 ? ' punto más' : ' puntos más') + ' cuando termines de pagar lo que tenés en cuotas.' : null,
        p.deLaTienda ? '🎁 Incluye ' + p.deLaTienda + (p.deLaTienda === 1 ? ' punto' : ' puntos') + ' que te dio la tienda.' : null,
        p.canjeados ? 'Ya usaste ' + p.canjeados + (p.canjeados === 1 ? ' punto' : ' puntos') + ' en compras anteriores.' : null,
        conCondiciones ? '' : null,
        conCondiciones ? 'Cómo funciona: ' + p.terminos : null,
        '',
        'Si querés, te pasamos el comprobante con el detalle. ¡Gracias por elegirnos! ✨',
      ]);
    },

    /**
     * Recordatorio de lo que debe, uno por clienta (lista de Cobranza): el saldo, de qué compra viene y, si tiene, la cuota
     * atrasada o la próxima. `x` es una fila de BG.cobranza().
     */
    cobranza: (cli, x) => {
      const pend = BG.pendientesDe(cli.id);
      const de = pend.length === 1 ? 'de tu compra ' + BG.fmtRecibo(pend[0].recibo) + ' del ' + BG.fmtFecha(pend[0].fecha)
        : 'de tus compras (la más antigua es del ' + BG.fmtFecha(x.desde) + ')';
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! ¿Cómo estás? Te escribimos de ' + tienda() + ' 💗',
        '',
        'Te recordamos que tenés un saldo pendiente de ' + gs(x.saldo) + ' ' + de + '.',
        x.cuotasAtrasadas
          ? (x.cuotasAtrasadas === 1 ? 'Tenés una cuota atrasada, de ' + gs(x.atrasado) : 'Tenés ' + x.cuotasAtrasadas + ' cuotas atrasadas, por ' + gs(x.atrasado)) + '.'
          : x.proxima ? 'Tu próxima cuota es de ' + gs(x.proxima.falta) + ' y vence el ' + BG.fmtFecha(x.proxima.vence) + '.' : null,
        '',
        'Si ya lo pagaste, avisanos y lo registramos. Si necesitás acomodar la fecha, contanos y vemos juntas. 💗',
      ]);
    },

    /** Aviso a la clienta de que llegó lo que había pedido (`p`: el producto que parece ser, si lo hay). */
    deseo: (cli, d, p) => unir([
      saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
      '',
      'Te cuento que llegó lo que nos habías pedido: ' + d.texto + (d.detalle ? ' (' + d.detalle + ')' : '') + '.',
      p ? 'Tenemos «' + p.descripcion + '» a ' + gs(p.precioVenta) + '.' : null,
      '¿Querés que te lo apartemos? Escribinos por acá y te lo guardamos. ✨',
    ]),

    /** Aviso de que se le guardó lo que apartó (con seña y hasta cuándo). */
    apartado: (cli, r) => unir([
      saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
      '',
      'Te guardamos lo que apartaste:',
      r.items.map((x) => '• ' + x.descripcion + (x.cantidad > 1 ? ' x' + x.cantidad : '')).join('\n'),
      r.sena ? 'Dejaste una seña de ' + gs(r.sena.monto) + ' (comprobante ' + BG.fmtRecibo(r.sena.recibo) + ').' : null,
      'Te lo guardamos hasta el ' + BG.fmtFecha(r.vence) + '. ¡Te esperamos! ✨',
    ]),

    /** Saludo de cumpleaños (con el regalo si el programa lo tiene activo). */
    cumple: (cli) => {
      const f = BG.configFidelidad();
      const regalo = f.activo && f.cumple.activo ? f.cumple.porcentaje : 0;
      return unir([
        '¡Feliz cumple, ' + nombreCorto(cli) + '! 🎂💗',
        '',
        'Te deseamos un día hermoso de parte de todo ' + tienda() + '.',
        regalo ? 'Como regalito, esta semana tenés ' + regalo + ' % de descuento en tu compra. 🎁' : null,
        '',
        '¡Te esperamos! ✨',
      ]);
    },
  };

  /**
   * Textos para el dueño (no para las clientas): el resumen del día. Llevan números de la tienda (lo que se debe, el stock)
   * y por eso no están en BG.textosWa, que es lo único que se le manda a una clienta.
   */
  BG.textosInternos = {
    resumenDia: (r) => {
      const f = BG.FORMAS_CORTAS;
      const formas = ['efectivo', 'transferencia', 'qr', 'tarjeta'].filter((k) => r.porForma[k] > 0).map((k) => f[k] + ' ' + gs(r.porForma[k])).join(' · ');
      const primeros = (lista, n) => lista.slice(0, n).map((x) => x.p.descripcion + (x.q > 0 ? ' (' + x.q + ')' : '')).join(', ') + (lista.length > n ? ' y ' + (lista.length - n) + ' más' : '');
      return unir([
        '📋 Resumen de ' + tienda() + ' · ' + BG.fmtFechaLarga(r.fecha),
        '',
        '🛍️ Vendiste ' + gs(r.vendido) + ' (' + r.ventas + (r.ventas === 1 ? ' venta' : ' ventas') + ')',
        '💵 Cobraste ' + gs(r.cobrado) + (formas ? ' · ' + formas : ''),
        r.devuelto ? '↩️ Devolviste ' + gs(r.devuelto) : null,
        r.gastos ? '🧾 Gastos del día: ' + gs(r.gastos) : null,
        r.aCuenta.length
          ? '⏳ De lo de hoy quedó a deber ' + gs(r.aCuentaTotal) + ':\n' + r.aCuenta.slice(0, 6).map((x) => '   • ' + x.c.nombre.split(' ')[0] + ' ' + gs(x.saldo)).join('\n') + (r.aCuenta.length > 6 ? '\n   y ' + (r.aCuenta.length - 6) + ' más' : '')
          : (r.ventas ? '✔️ Todo lo de hoy quedó pagado' : null),
        '💰 Por cobrar en total: ' + gs(r.deben.total) + ' (' + r.deben.n + (r.deben.n === 1 ? ' clienta' : ' clientas') + ')',
        r.atrasadas.cuotas ? '⚠️ Cuotas atrasadas: ' + gs(r.atrasadas.monto) + ' (' + r.atrasadas.clientas + (r.atrasadas.clientas === 1 ? ' clienta' : ' clientas') + ')' : null,
        r.stock.agotados.length ? '📦 Se agotó: ' + primeros(r.stock.agotados, 6) : null,
        r.stock.bajos.length ? '📦 Quedan pocas: ' + primeros(r.stock.bajos, 6) : null,
        r.apartadosPorVencer ? '🔖 Apartados por vencer: ' + r.apartadosPorVencer : null,
        r.deseos ? '💬 Clientas esperando algo: ' + r.deseos : null,
      ]);
    },
  };
})();

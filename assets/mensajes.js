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
      const unaCompra = d.compras.length === 1 && d.titulo !== 'Estado de cuenta';
      const c = unaCompra ? d.compras[0] : null;
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
        '',
        c ? 'Te paso el comprobante de tu compra ' + BG.fmtRecibo(c.numero) + ':' : 'Te paso el resumen de tu cuenta:',
        c ? 'Total: ' + gs(c.total) + (c.pagado > 0 ? ' · Pagaste: ' + gs(c.pagado) : '') : null,
        d.saldoCuenta > 0 ? 'Saldo pendiente: ' + gs(d.saldoCuenta) + '.' : '✔️ ¡Tu cuenta está al día!',
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
    puntos: (cli, resumen) => {
      const p = resumen || BG.resumenPuntos(cli.id);
      if (!p) return '';
      return unir([
        saludo() + ', ' + nombreCorto(cli) + '! Te escribimos de ' + tienda() + ' 💗',
        '',
        'Estos son tus puntos al ' + BG.fmtFecha(BG.hoy()) + ':',
        '🌟 Tenés ' + p.puntos + (p.puntos === 1 ? ' punto' : ' puntos') + ' = ' + gs(p.valor) + ' para usar como descuento.',
        p.canjeable ? '✔️ Ya los podés usar en tu próxima compra: avisanos y te los descontamos.'
          : 'Te faltan ' + p.falta + (p.falta === 1 ? ' punto' : ' puntos') + ' para poder usarlos (se usan desde ' + p.minimo + ').',
        p.pendientes ? '⏳ Vas a sumar ' + p.pendientes + (p.pendientes === 1 ? ' punto más' : ' puntos más') + ' cuando termines de pagar lo que tenés en cuotas.' : null,
        p.canjeados ? 'Ya usaste ' + p.canjeados + (p.canjeados === 1 ? ' punto' : ' puntos') + ' en compras anteriores.' : null,
        '',
        'Cómo funciona: ' + p.terminos,
        '',
        'Si querés, te pasamos el comprobante con el detalle. ¡Gracias por elegirnos! ✨',
      ]);
    },

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
})();

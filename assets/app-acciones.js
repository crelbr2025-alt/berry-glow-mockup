/*!
 * berry.Glow_py — Acciones que modifican los datos. Cada una deja su rastro en la auditoría.
 * Reglas del brief: la venta congela precio y costo; ventas y pagos no se borran, se anulan;
 * nada se cobra por encima del saldo sin decidir qué pasa con el excedente.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const gs = BG.gs;
  const sum = BG.sum;

  /* ── Clientes ────────────────────────────────────────────────────────── */

  const limpiar = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');

  BG.guardarCliente = (datos, id) => {
    const campos = {
      nombre: limpiar(datos.nombre), ci: limpiar(datos.ci), telefono: limpiar(datos.telefono),
      direccion: limpiar(datos.direccion), email: limpiar(datos.email), notas: String(datos.notas || '').trim(),
      cumple: /^\d{2}-\d{2}$/.test(datos.cumple || '') ? datos.cumple : '',
    };
    // El límite de crédito lo pone solo el dueño: null = el general, 0 = solo contado, otro monto = el de esta clienta.
    if (BG.esDuena() && datos.limite !== undefined) campos.limite = datos.limite;
    let c;
    if (id) {
      c = BG.cliente(id);
      Object.assign(c, campos);
      BG.auditar('clientes', 'Cliente editado', c.nombre);
    } else {
      c = Object.assign({ id: BG.uid('c'), alta: BG.hoy(), demo: false }, campos);
      BG.db.clientes.push(c);
      BG.auditar('clientes', 'Alta de cliente', c.nombre);
    }
    BG.guardar();
    return c;
  };

  /** Clientes que podrían ser la misma persona (misma CI, mismo teléfono o nombre muy parecido). */
  BG.posiblesDuplicados = (datos, excluirId) => {
    const ci = BG.soloDigitos(datos.ci);
    const tel = BG.soloDigitos(datos.telefono);
    const porNombre = datos.nombre && datos.nombre.trim().length >= 3 ? BG.buscarClientes(datos.nombre, 5) : [];
    const res = [];
    for (const c of BG.db.clientes) {
      if (c.id === excluirId) continue;
      let motivo = null;
      if (ci.length >= 5 && BG.soloDigitos(c.ci) === ci) motivo = 'misma CI/RUC';
      else if (tel.length >= 6 && BG.soloDigitos(c.telefono).endsWith(tel.replace(/^0/, ''))) motivo = 'mismo teléfono';
      else if (porNombre.indexOf(c) >= 0 && porNombre.indexOf(c) < 3) motivo = 'nombre parecido';
      if (motivo) res.push({ c: c, motivo: motivo });
    }
    return res.slice(0, 4);
  };

  /* ── Pagos ───────────────────────────────────────────────────────────── */

  /** Junta los montos de la misma forma de pago (dos líneas de efectivo son un solo efectivo). */
  function unirPartes(partes) {
    const out = [];
    for (const x of partes) {
      const ya = out.find((y) => y.forma === x.forma);
      if (ya) ya.monto += x.monto; else out.push({ forma: x.forma, monto: x.monto });
    }
    return out.filter((x) => x.monto > 0);
  }

  function nuevoPago(o) {
    const pg = {
      id: BG.uid('pg'), ventaId: o.ventaId || null, clienteId: o.clienteId, fecha: o.fecha, ts: BG.ahora(),
      partes: unirPartes(o.partes), total: o.total, excedente: o.excedente || 0, recibo: o.recibo,
      inicial: !!o.inicial, grupo: o.grupo || null, anulado: null, usuario: BG.usuario().nombre,
    };
    BG.db.pagos.push(pg);
    return pg;
  }
  function credito(clienteId, monto, motivo, extra) {
    BG.db.creditos.push(Object.assign({ id: BG.uid('cr'), clienteId: clienteId, fecha: BG.hoy(), ts: BG.ahora(), monto: monto, motivo: motivo }, extra || {}));
  }
  const textoPartes = (partes) => partes.map((x) => BG.FORMAS[x.forma] + ' ' + gs(x.monto)).join(' + ');

  /* ── Plan de cuotas ──────────────────────────────────────────────────── */

  /** Arma las cuotas sobre el saldo actual de la venta. d = { frecuencia, n, primera, nota } */
  function armarPlan(v, d) {
    const saldo = BG.saldoVenta(v);
    const n = Math.max(1, Math.min(12, Math.round(Number(d.n) || 1)));
    if (!(saldo > 0)) throw new Error('La venta no tiene saldo: no hace falta un plan de cuotas.');
    if (!BG.FRECUENCIAS[d.frecuencia]) throw new Error('Elegí cada cuánto se paga.');
    if (!d.primera || d.primera < v.fecha) throw new Error('La primera cuota no puede vencer antes de la venta.');
    const fechas = BG.fechasCuotas(d.primera, n, d.frecuencia);
    const montos = BG.repartirCuotas(saldo, n);
    return {
      id: BG.uid('pl'), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, frecuencia: d.frecuencia, nota: limpiar(d.nota),
      saldoInicial: saldo, totalInicial: v.total, cuotas: fechas.map((f, i) => ({ vence: f, monto: montos[i] })),
    };
  }
  const textoPlan = (pl) => pl.cuotas.length + (pl.cuotas.length === 1 ? ' cuota' : ' cuotas') + ' (' + BG.FRECUENCIAS[pl.frecuencia].toLowerCase() + ') de ' + gs(pl.cuotas[0].monto)
    + (pl.cuotas.length > 1 && pl.cuotas[pl.cuotas.length - 1].monto !== pl.cuotas[0].monto ? ' (la última ' + gs(pl.cuotas[pl.cuotas.length - 1].monto) + ')' : '')
    + ' · la primera vence el ' + BG.fmtFecha(pl.cuotas[0].vence);

  BG.guardarPlan = (d) => {
    if (!BG.puede('registrarCobros') && !BG.puede('registrarVentas')) throw new Error('Tu usuario no puede acordar cuotas.');
    const v = BG.venta(d.ventaId);
    if (!v || v.anulada) throw new Error('Esa venta está anulada.');
    const habia = !!v.plan;
    v.plan = armarPlan(v, d);
    BG.auditar('cuotas', habia ? 'Plan de cuotas cambiado' : 'Plan de cuotas', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + BG.cliente(v.clienteId).nombre + ' · ' + gs(v.plan.saldoInicial) + ' en ' + textoPlan(v.plan));
    BG.guardar();
    return v.plan;
  };
  BG.quitarPlan = (ventaId) => {
    const v = BG.venta(ventaId);
    if (!v || !v.plan) return;
    v.plan = null;
    BG.auditar('cuotas', 'Plan de cuotas quitado', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + BG.cliente(v.clienteId).nombre);
    BG.guardar();
  };

  /* ── Devolver plata (sale de la caja y baja el saldo a favor) ────────── */

  function reintegrar(clienteId, monto, forma, concepto, extra) {
    const cli = BG.cliente(clienteId);
    const eg = Object.assign({ id: BG.uid('eg'), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, clienteId: clienteId, forma: forma, monto: monto, concepto: concepto }, extra || {});
    (BG.db.egresos || (BG.db.egresos = [])).push(eg);
    credito(clienteId, -monto, 'Devuelto en ' + BG.FORMAS[forma].toLowerCase() + ' · ' + concepto, { egresoId: eg.id });
    BG.auditar('devoluciones', 'Plata devuelta', cli.nombre + ' · ' + gs(monto) + ' en ' + BG.FORMAS[forma].toLowerCase() + ' · ' + concepto + (eg.autorizadoPor ? ' · autorizó ' + eg.autorizadoPor : ''));
    return eg;
  }
  /** Devuelve en plata (efectivo o transferencia) todo o parte del saldo a favor. d = { clienteId, monto, forma, nota, autorizadoPor } */
  BG.devolverSaldoAFavor = (d) => {
    if (!BG.esDuena() && !d.autorizadoPor) throw new Error('Devolver plata necesita la autorización de ' + BG.nombreDuena() + '.');
    const disponible = BG.creditoCliente(d.clienteId);
    const monto = Math.round(Number(d.monto));
    if (!(monto > 0)) throw new Error('Escribí cuánto se le devuelve.');
    if (monto > disponible) throw new Error('Tiene ' + gs(disponible) + ' a favor: no se le puede devolver más que eso.');
    if (d.forma !== 'efectivo' && d.forma !== 'transferencia') throw new Error('Elegí cómo se le devuelve.');
    const eg = reintegrar(d.clienteId, monto, d.forma, limpiar(d.nota) || 'Saldo a favor', { autorizadoPor: d.autorizadoPor || null });
    BG.guardar();
    return eg;
  };

  /** Texto de un cambio de precio para la auditoría (solo la ve el dueño, así que lleva el margen). */
  const textoMargen = (precio, costo) => { const ev = BG.evaluarPrecio(precio, costo); return ev ? ' · margen ' + BG.fmtMargen(ev.margen) : ''; };
  const textoMotivo = (motivo, nota) => (motivo ? ' · ' + motivo : '') + (nota ? ' (' + nota + ')' : '');

  /**
   * Registra una venta con su pago inicial (puede ser cero, parcial, total o mixto).
   * d = { clienteId, fecha, items: [{ productoId, cantidad, precio, margen, motivo, nota }], descuento: { tipo, valor, motivo, nota },
   *       partes: [{ forma, monto }] (lo que se queda la tienda), usarCredito, excedenteACredito, autorizadoPor }
   * Un precio distinto del de lista queda como «precio especial», con el precio de lista, el motivo y quién lo puso.
   */
  BG.registrarVenta = (d) => {
    const cli = BG.cliente(d.clienteId);
    const quien = BG.usuario().nombre;
    const items = d.items.map((it) => {
      const p = BG.producto(it.productoId);
      const especial = it.precio !== p.precioVenta ? { motivo: it.motivo || null, nota: limpiar(it.nota), usuario: quien } : null;
      return {
        productoId: p.id, descripcion: p.descripcion, cantidad: it.cantidad, precio: it.precio, costoUnitGs: p.costoTotalGs,
        margen: it.margen == null ? null : it.margen, precioLista: p.precioVenta, especial: especial,
      };
    });
    const conDescuento = !!(d.descuento && d.descuento.valor);
    // El regalo de cumpleaños es un beneficio del programa: se puede aplicar aunque no tenga precios especiales habilitados.
    const regalo = BG.regaloCumple(d.clienteId);
    const esRegalo = conDescuento && d.descuento.motivo === 'Cumpleaños';
    if (esRegalo && !(regalo && d.descuento.tipo === 'porcentaje' && Number(d.descuento.valor) === Number(regalo.porcentaje))) {
      throw new Error('El regalo de cumpleaños no corresponde para esta clienta ahora.');
    }
    if (!BG.puede('preciosEspeciales') && ((conDescuento && !esRegalo) || items.some((it) => it.especial))) {
      throw new Error('Tu usuario vende con el precio de lista: ' + BG.nombreDuena() + ' no te habilitó los precios especiales.');
    }
    // El plan de cuotas se valida antes de guardar nada, así un dato mal puesto no deja la venta a medias.
    if (d.plan && (!BG.FRECUENCIAS[d.plan.frecuencia] || !d.plan.primera || d.plan.primera < d.fecha)) {
      throw new Error('Revisá el plan de cuotas: la primera cuota no puede vencer antes de la venta.');
    }
    const t = C.totalesVenta(items, d.descuento);
    // Límite de crédito: lo que queda debiendo no puede pasar el límite ni venderse a cuenta con cuotas muy atrasadas,
    // salvo que el dueño lo autorice (él mismo, o con su PIN en el mostrador).
    const recibidoAhora = sum((d.partes || []).filter((x) => x.monto > 0), (x) => x.monto) + (d.usarCredito || 0) - (d.excedenteACredito || 0);
    const quedaDebiendo = Math.max(0, t.total - recibidoAhora);
    const credito0 = BG.estadoCredito(d.clienteId, quedaDebiendo);
    if (!credito0.ok && !BG.esDuena() && !d.creditoAutorizadoPor) {
      throw new Error('No puede llevar a cuenta: ' + BG.textoCredito(credito0) + '. Que pague todo, o pedí la autorización de ' + BG.nombreDuena() + '.');
    }
    const recibo = BG.nuevoRecibo();
    const v = {
      id: BG.uid('v'), recibo: recibo, clienteId: d.clienteId, fecha: d.fecha, ts: BG.ahora(), items: items,
      descuento: {
        tipo: d.descuento ? d.descuento.tipo : 'monto', valor: d.descuento ? d.descuento.valor : 0, monto: t.descuento,
        motivo: conDescuento ? d.descuento.motivo || null : null, nota: conDescuento ? limpiar(d.descuento.nota) : '',
      },
      subtotal: t.subtotal, total: t.total, anulada: null, usuario: quien, autorizadoPor: d.autorizadoPor || null, ajustes: [],
      devoluciones: [], aFavor: 0, plan: null,
      creditoAutorizado: !credito0.ok ? { por: d.creditoAutorizadoPor || quien, motivo: BG.textoCredito(credito0) } : null,
    };
    BG.db.ventas.push(v);
    BG.auditar('ventas', 'Venta registrada', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + items.length + ' artículo(s) · ' + gs(v.total));
    if (v.creditoAutorizado) BG.auditar('seguridad', 'Venta a cuenta fuera del límite', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + v.creditoAutorizado.motivo + ' · autorizó ' + v.creditoAutorizado.por);
    items.filter((it) => it.especial).forEach((it) => BG.auditar('precios', 'Precio especial', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + it.descripcion + ': lista ' + gs(it.precioLista) + ' → ' + gs(it.precio)
      + textoMotivo(it.especial.motivo, it.especial.nota) + textoMargen(it.precio, it.costoUnitGs) + (v.autorizadoPor ? ' · autorizó ' + v.autorizadoPor : '')));
    if (t.descuento) {
      const costo = sum(items, (it) => (it.costoUnitGs || 0) * it.cantidad);
      BG.auditar('precios', 'Descuento', 'Recibo ' + BG.fmtRecibo(recibo) + ' · −' + gs(t.descuento) + (v.descuento.tipo === 'porcentaje' ? ' (' + C.fmtNum(v.descuento.valor, 0, 2) + ' %)' : '')
        + textoMotivo(v.descuento.motivo, v.descuento.nota) + textoMargen(t.total, costo) + ' en la venta' + (v.autorizadoPor ? ' · autorizó ' + v.autorizadoPor : ''));
    }

    const partes = (d.partes || []).filter((x) => x.monto > 0).map((x) => ({ forma: x.forma, monto: x.monto }));
    if (d.usarCredito > 0) {
      partes.push({ forma: 'saldo', monto: d.usarCredito });
      credito(d.clienteId, -d.usarCredito, 'Aplicado a la venta ' + BG.fmtRecibo(recibo), { ventaId: v.id });
    }
    const entregado = sum(partes, (x) => x.monto);
    let pago = null;
    if (entregado > 0) {
      const excedente = d.excedenteACredito || 0;
      pago = nuevoPago({ ventaId: v.id, clienteId: d.clienteId, fecha: d.fecha, partes: partes, total: entregado - excedente, excedente: excedente, recibo: recibo, inicial: true });
      BG.auditar('cobros', 'Pago inicial', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + textoPartes(partes));
      if (excedente > 0) {
        credito(d.clienteId, excedente, 'Excedente del recibo ' + BG.fmtRecibo(recibo), { pagoId: pago.id });
        BG.auditar('cobros', 'Saldo a favor', cli.nombre + ' · ' + gs(excedente) + ' de excedente');
      }
    }
    // Cuotas acordadas al vender: se reparte lo que quedó debiendo.
    if (d.plan && BG.saldoVenta(v) > 0) {
      v.plan = armarPlan(v, d.plan);
      BG.auditar('cuotas', 'Plan de cuotas', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + gs(v.plan.saldoInicial) + ' en ' + textoPlan(v.plan));
    }
    BG.guardar();
    return { venta: v, pago: pago };
  };

  /**
   * Registra un cobro. destino: id de venta, 'todas' (de la más antigua a la más nueva) o 'sena'
   * (anticipo que queda como saldo a favor). Las formas de pago se reparten en orden entre las ventas.
   */
  BG.registrarCobro = (d) => {
    const cli = BG.cliente(d.clienteId);
    const cola = (d.partes || []).filter((x) => x.monto > 0).map((x) => ({ forma: x.forma, monto: x.monto }));
    // Saldo a favor usado para pagar la deuda: va primero y nunca más de lo que tiene ni de lo que debe.
    const usar = d.destino === 'sena' ? 0 : Math.min(Math.round(Number(d.usarCredito) || 0), BG.creditoCliente(d.clienteId),
      d.destino === 'todas' ? BG.saldoCliente(d.clienteId) : BG.saldoVenta(BG.venta(d.destino)));
    if (usar > 0) cola.unshift({ forma: 'saldo', monto: usar });
    const entregado = sum(cola, (x) => x.monto);
    if (!(entregado > 0)) throw new Error('Escribí cuánto paga.');
    const recibo = BG.nuevoRecibo();
    const grupo = BG.uid('g');
    if (usar > 0) credito(d.clienteId, -usar, 'Aplicado al recibo ' + BG.fmtRecibo(recibo), { ventaId: d.destino === 'todas' ? null : d.destino });
    const pagos = [];
    if (d.destino === 'sena') {
      pagos.push(nuevoPago({ clienteId: d.clienteId, fecha: d.fecha, partes: cola, total: 0, excedente: entregado, recibo: recibo, grupo: grupo }));
      credito(d.clienteId, entregado, 'Seña / anticipo, recibo ' + BG.fmtRecibo(recibo), { pagoId: pagos[0].id });
      BG.auditar('cobros', 'Seña registrada', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + textoPartes(cola));
      BG.guardar();
      return { pagos: pagos, recibo: recibo };
    }
    const ventas = d.destino === 'todas' ? BG.pendientesDe(d.clienteId) : [BG.venta(d.destino)];
    let restante = entregado - (d.excedenteACredito || 0);
    ventas.forEach((v, i) => {
      const aplicar = Math.min(restante, BG.saldoVenta(v));
      if (aplicar <= 0) return;
      const partes = [];
      let falta = aplicar;
      while (falta > 0 && cola.length) {
        const x = cola[0];
        const toma = Math.min(falta, x.monto);
        partes.push({ forma: x.forma, monto: toma });
        x.monto -= toma;
        falta -= toma;
        if (!x.monto) cola.shift();
      }
      restante -= aplicar;
      const ultima = i === ventas.length - 1 || restante <= 0;
      let excedente = 0;
      if (ultima && cola.length) {
        excedente = sum(cola, (x) => x.monto);
        cola.forEach((x) => partes.push({ forma: x.forma, monto: x.monto }));
        cola.length = 0;
      }
      pagos.push(nuevoPago({ ventaId: v.id, clienteId: d.clienteId, fecha: d.fecha, partes: partes, total: aplicar, excedente: excedente, recibo: recibo, grupo: grupo }));
    });
    const totalPartes = sum(pagos, (p) => sum(p.partes, (x) => x.monto));
    BG.auditar('cobros', 'Cobro registrado', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + gs(totalPartes) + ' en ' + pagos.length + ' venta(s)'
      + (usar > 0 ? ' · ' + gs(usar) + ' con su saldo a favor' : ''));
    const exc = sum(pagos, (p) => p.excedente);
    if (exc > 0) {
      credito(d.clienteId, exc, 'Excedente del recibo ' + BG.fmtRecibo(recibo), { pagoId: pagos[pagos.length - 1].id });
      BG.auditar('cobros', 'Saldo a favor', cli.nombre + ' · ' + gs(exc) + ' de excedente');
    }
    BG.guardar();
    return { pagos: pagos, recibo: recibo };
  };

  /* ── Ajuste de precio después de vender ──────────────────────────────── */

  /**
   * Cambia el precio de un artículo de una venta ya registrada: el total y el saldo se recalculan y el cambio
   * queda en la venta con el antes, el después, el motivo y quién lo hizo. No toca pagos ni la caja:
   * si el cliente ya pagó más que el total nuevo, hay que devolver plata, y eso lo decide el dueño anulando el pago.
   * d = { ventaId, item, precio, motivo, nota, autorizadoPor }
   */
  BG.ajustarPrecio = (d) => {
    if (!BG.puede('preciosEspeciales')) throw new Error(BG.nombreDuena() + ' no te habilitó los precios especiales.');
    const v = BG.venta(d.ventaId);
    if (!v || v.anulada) throw new Error('Esa venta está anulada: no se le puede cambiar el precio.');
    const it = v.items[d.item];
    const precio = Math.round(Number(d.precio));
    if (!it || !(precio > 0)) throw new Error('Escribí el precio nuevo.');
    if (precio === it.precio) throw new Error('Es el mismo precio que ya tiene.');
    if (!BG.cantidadViva(it)) throw new Error('Ese artículo ya se devolvió entero.');
    if (!d.motivo) throw new Error('Elegí el motivo del cambio.');
    const nuevos = v.items.map((x, i) => (i === d.item ? Object.assign({}, x, { precio: precio }) : x));
    const t = BG.totalesDe(v, nuevos);
    const pagado = BG.pagadoVenta(v);
    if (t.total <= 0) throw new Error('Con ese precio el total de la venta quedaría en ' + gs(0) + '.');
    if (t.total < pagado) {
      throw new Error('Con ese precio la venta quedaría en ' + gs(t.total) + ', menos de lo que ya pagó (' + gs(pagado) + '). Para devolver plata, ' + BG.nombreDuena() + ' tiene que anular el pago.');
    }
    const cli = BG.cliente(v.clienteId);
    const ajuste = {
      id: BG.uid('aj'), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, item: d.item, descripcion: it.descripcion, cantidad: it.cantidad,
      antes: it.precio, despues: precio, totalAntes: v.total, totalDespues: t.total, motivo: d.motivo, nota: limpiar(d.nota), autorizadoPor: d.autorizadoPor || null,
    };
    if (it.precioLista == null) it.precioLista = it.precio;
    it.precio = precio;
    it.margen = null;
    v.subtotal = t.subtotal;
    v.descuento.monto = t.descuento;
    v.total = t.total;
    (v.ajustes || (v.ajustes = [])).push(ajuste);
    BG.auditar('precios', 'Precio ajustado', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · ' + it.descripcion + ': ' + gs(ajuste.antes) + ' → ' + gs(precio)
      + textoMotivo(ajuste.motivo, ajuste.nota) + textoMargen(precio, it.costoUnitGs) + ' · total de la venta ' + gs(ajuste.totalAntes) + ' → ' + gs(t.total)
      + (ajuste.autorizadoPor ? ' · autorizó ' + ajuste.autorizadoPor : ''));
    BG.guardar();
    return ajuste;
  };

  /* ── Devoluciones y cambios de un artículo ───────────────────────────── */

  BG.MOTIVOS_DEVOLUCION = ['No le quedó el talle', 'Falla o detalle', 'No le gustó', 'Otro'];
  BG.TIPOS_DEVOLUCION = { devolucion: 'Devolución', cambio: 'Cambio por otro producto', talle: 'Cambio de talle' };

  /**
   * Devuelve o cambia unidades de un artículo sin anular la venta.
   *  · devolucion: las unidades vuelven al stock y el total baja.
   *  · cambio: vuelven al stock y se agrega a la venta el producto que se lleva (a su precio de lista); el total se recalcula.
   *  · talle: el mismo producto en otro talle; se registra (el stock por talle es para el sistema final) y no cambia la plata.
   * Si el total nuevo queda debajo de lo que ya pagó, la diferencia pasa a saldo a favor (v.aFavor), o se devuelve en plata.
   * d = { ventaId, item, cantidad, tipo, productoId, talle, motivo, nota, destino: 'favor'|'efectivo'|'transferencia', autorizadoPor }
   */
  BG.registrarDevolucion = (d) => {
    if (!BG.puede('devoluciones')) throw new Error(BG.nombreDuena() + ' no te habilitó las devoluciones y cambios.');
    const v = BG.venta(d.ventaId);
    if (!v || v.anulada) throw new Error('Esa venta está anulada.');
    const it = v.items[d.item];
    const quedan = it ? BG.cantidadViva(it) : 0;
    const n = Math.round(Number(d.cantidad));
    if (!it || !(n >= 1) || n > quedan) throw new Error('Elegí cuántas unidades vuelven (tiene ' + quedan + ').');
    if (!BG.TIPOS_DEVOLUCION[d.tipo]) throw new Error('Elegí si es devolución o cambio.');
    if (!d.motivo) throw new Error('Elegí el motivo.');
    if (d.motivo === 'Otro' && !limpiar(d.nota)) throw new Error('Contá el motivo en «Detalle».');
    let nuevo = null;
    if (d.tipo === 'cambio') {
      nuevo = BG.producto(d.productoId);
      if (!nuevo) throw new Error('Elegí el producto que se lleva.');
      if (nuevo.id === it.productoId) throw new Error('Es el mismo producto: usá «Cambio de talle».');
      if (!nuevo.precioVenta) throw new Error('«' + nuevo.descripcion + '» no tiene precio de venta.');
      if (BG.disponibles(nuevo) < n) throw new Error('Solo quedan ' + BG.disponibles(nuevo) + ' de «' + nuevo.descripcion + '».');
    }
    if (d.tipo === 'talle' && !limpiar(d.talle)) throw new Error('Escribí qué talle devuelve y cuál se lleva.');
    const enPlata = d.destino === 'efectivo' || d.destino === 'transferencia';
    if (enPlata && !BG.esDuena() && !d.autorizadoPor) throw new Error('Devolver plata necesita la autorización de ' + BG.nombreDuena() + '.');
    const cli = BG.cliente(v.clienteId);
    const pagado = BG.pagadoVenta(v);
    const reg = {
      id: BG.uid('dv'), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, tipo: d.tipo, item: d.item, descripcion: it.descripcion,
      cantidad: n, precio: it.precio, talle: limpiar(d.talle), nuevoItem: null, productoNuevo: null, precioNuevo: null,
      totalAntes: v.total, totalDespues: v.total, aFavor: 0, reintegro: 0, forma: null, motivo: d.motivo, nota: limpiar(d.nota), autorizadoPor: d.autorizadoPor || null,
    };
    if (d.tipo !== 'talle') {
      it.devueltas = (it.devueltas || 0) + n;
      if (nuevo) {
        v.items.push({
          productoId: nuevo.id, descripcion: nuevo.descripcion, cantidad: n, precio: nuevo.precioVenta, costoUnitGs: nuevo.costoTotalGs,
          margen: nuevo.margen, precioLista: nuevo.precioVenta, especial: null, cambioDe: { item: d.item, devolucion: reg.id },
        });
        Object.assign(reg, { nuevoItem: v.items.length - 1, productoNuevo: nuevo.descripcion, precioNuevo: nuevo.precioVenta });
      }
      const t = BG.totalesDe(v);
      v.subtotal = t.subtotal;
      v.descuento.monto = t.descuento;
      v.total = t.total;
      reg.totalDespues = t.total;
      const sobra = pagado - t.total;
      if (sobra > 0) {
        v.aFavor = (v.aFavor || 0) + sobra;
        reg.aFavor = sobra;
        credito(v.clienteId, sobra, (d.tipo === 'cambio' ? 'Cambio' : 'Devolución') + ' en la compra ' + BG.fmtRecibo(v.recibo), { ventaId: v.id, devolucionId: reg.id });
      }
    }
    (v.devoluciones || (v.devoluciones = [])).push(reg);
    const que = d.tipo === 'talle' ? 'Cambio de talle: ' + n + ' × ' + it.descripcion + ' (' + reg.talle + ')'
      : d.tipo === 'cambio' ? 'Cambio: ' + n + ' × ' + it.descripcion + ' por ' + n + ' × ' + nuevo.descripcion
        : 'Devolución: ' + n + ' × ' + it.descripcion;
    BG.auditar('devoluciones', BG.TIPOS_DEVOLUCION[d.tipo], 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · ' + que + textoMotivo(reg.motivo, reg.nota)
      + (reg.totalAntes !== reg.totalDespues ? ' · total ' + gs(reg.totalAntes) + ' → ' + gs(reg.totalDespues) : '') + (reg.aFavor ? ' · ' + gs(reg.aFavor) + ' a saldo a favor' : ''));
    if (reg.aFavor && enPlata) {
      reintegrar(v.clienteId, reg.aFavor, d.destino, 'Devolución de la compra ' + BG.fmtRecibo(v.recibo), { devolucionId: reg.id, autorizadoPor: d.autorizadoPor || null });
      reg.reintegro = reg.aFavor;
      reg.forma = d.destino;
    }
    BG.guardar();
    return reg;
  };

  /* ── Meta y comisión ─────────────────────────────────────────────────── */

  BG.guardarComision = (usuarioId, datos) => {
    soloDuenio('cambiar la meta y la comisión');
    const u = BG.db.usuarios.find((x) => x.id === usuarioId);
    const antes = Object.assign({ activa: false, base: 'ganancia', porcentaje: 10, meta: 0, ve: true }, u.comision);
    u.comision = Object.assign(antes, datos);
    const c = u.comision;
    BG.auditar('parametros', 'Meta y comisión de ' + u.nombre, c.activa ? c.porcentaje + ' % ' + (c.base === 'cobrado' ? 'de lo cobrado' : 'de la ganancia cobrada') + ' · meta ' + gs(c.meta) + ' por mes'
      + (c.ve ? '' : ' · ella no lo ve') : 'Sin comisión');
    BG.guardar();
  };

  /* ── Clientas frecuentes: canje de puntos y configuración ────────────── */

  /** Canjea todos los puntos disponibles: se acreditan como saldo a favor (y cuentan como gasto de beneficios en la ganancia neta). */
  BG.canjearPuntos = (clienteId) => {
    const f = BG.configFidelidad();
    const pts = BG.puntosDe(clienteId);
    if (!pts || !pts.canjeable) throw new Error('Todavía no tiene los ' + f.minimo + ' puntos para canjear.');
    const cli = BG.cliente(clienteId);
    const k = { id: BG.uid('cj'), clienteId: clienteId, fecha: BG.hoy(), ts: BG.ahora(), puntos: pts.puntos, monto: pts.valor, usuario: BG.usuario().nombre };
    (BG.db.canjes || (BG.db.canjes = [])).push(k);
    credito(clienteId, k.monto, 'Canje de ' + k.puntos + ' puntos', { canjeId: k.id });
    BG.auditar('fidelidad', 'Canje de puntos', cli.nombre + ' · ' + k.puntos + ' puntos = ' + gs(k.monto) + ' de saldo a favor');
    BG.guardar();
    return k;
  };
  BG.guardarFidelidad = (datos) => {
    soloDuenio('cambiar el programa de clientas frecuentes');
    const f = Object.assign(BG.configFidelidad(), datos);
    if (datos.cumple) f.cumple = Object.assign({}, BG.configFidelidad().cumple, datos.cumple);
    BG.db.config.fidelidad = f;
    BG.auditar('fidelidad', 'Programa de clientas frecuentes', f.activo ? '1 punto cada ' + gs(f.cadaGs) + ' · cada punto ' + gs(f.valorPunto) + ' · canje desde ' + f.minimo + ' puntos'
      + (f.cumple.activo ? ' · cumpleaños ' + f.cumple.porcentaje + ' %' : ' · sin regalo de cumpleaños') : 'Desactivado');
    BG.guardar();
  };
  BG.guardarCredito = (datos) => {
    soloDuenio('cambiar el límite de crédito');
    const c = Object.assign(BG.configCredito(), datos);
    BG.db.config.credito = c;
    BG.auditar('parametros', 'Límite de crédito', c.activo ? 'General ' + gs(c.limite) + ' por clienta · cuotas atrasadas hasta ' + c.diasAtraso + ' días' : 'Sin límite de crédito');
    BG.guardar();
  };

  /* ── Gastos del local ────────────────────────────────────────────────── */

  /** d = { fecha, categoria, concepto, monto, forma } — forma 'caja' = se pagó con el efectivo de la caja de ese día. */
  BG.guardarGasto = (d) => {
    soloDuenio('cargar gastos');
    const monto = Math.round(Number(d.monto));
    if (!(monto > 0)) throw new Error('Escribí el monto del gasto.');
    if (BG.CATEGORIAS_GASTO.indexOf(d.categoria) < 0) throw new Error('Elegí la categoría.');
    if (!BG.FORMAS_GASTO[d.forma]) throw new Error('Elegí cómo se pagó.');
    if (!d.fecha || d.fecha > BG.hoy()) throw new Error('La fecha no puede ser futura.');
    const g = { id: BG.uid('gt'), fecha: d.fecha, ts: BG.ahora(), categoria: d.categoria, concepto: limpiar(d.concepto) || d.categoria, monto: monto, forma: d.forma, usuario: BG.usuario().nombre, anulado: null };
    (BG.db.gastos || (BG.db.gastos = [])).push(g);
    BG.auditar('gastos', 'Gasto cargado', BG.fmtFecha(g.fecha) + ' · ' + g.categoria + ' · ' + g.concepto + ' · ' + gs(g.monto) + ' · ' + BG.FORMAS_GASTO[g.forma]);
    BG.guardar();
    return g;
  };
  BG.anularGasto = (id, motivo) => {
    soloDuenio('anular gastos');
    const g = (BG.db.gastos || []).find((x) => x.id === id);
    if (!g || g.anulado) return;
    g.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: limpiar(motivo), usuario: BG.usuario().nombre };
    BG.auditar('gastos', 'Gasto anulado', BG.fmtFecha(g.fecha) + ' · ' + g.concepto + ' · ' + gs(g.monto) + ' · motivo: ' + g.anulado.motivo);
    BG.guardar();
  };

  /* ── Conteo de inventario ────────────────────────────────────────────── */

  BG.MOTIVOS_CONTEO = ['No se encontró', 'Dañado: no se puede vender', 'Error de carga', 'Apareció de más'];
  /**
   * Guarda un conteo: por cada producto contado, lo que decía el sistema, lo que se contó y la diferencia.
   * Las diferencias corrigen el stock (quedan como ajustes con su motivo; nunca se tocan las ventas).
   * d = { items: [{ productoId, contado, motivo }], nota }
   */
  BG.registrarConteo = (d) => {
    soloDuenio('hacer el conteo de inventario');
    const filas = (d.items || []).filter((x) => x.contado != null && x.contado !== '' && Number(x.contado) >= 0);
    if (!filas.length) throw new Error('Contá al menos un producto.');
    const conteo = { id: BG.uid('ct'), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, nota: limpiar(d.nota), contados: filas.length, diferencias: 0, faltanteGs: 0, sobranteGs: 0 };
    const ajustes = [];
    for (const x of filas) {
      const p = BG.producto(x.productoId);
      const sistema = BG.disponibles(p);
      const contado = Math.round(Number(x.contado));
      const diferencia = contado - sistema;
      if (!diferencia) continue;
      if (!x.motivo) throw new Error('Elegí el motivo de la diferencia de «' + p.descripcion + '».');
      ajustes.push({ id: BG.uid('as'), conteoId: conteo.id, productoId: p.id, descripcion: p.descripcion, fecha: conteo.fecha, sistema: sistema, contado: contado, diferencia: diferencia, motivo: x.motivo, costoUnitGs: p.costoTotalGs || 0 });
    }
    conteo.diferencias = ajustes.length;
    conteo.faltanteGs = sum(ajustes.filter((a) => a.diferencia < 0), (a) => -a.diferencia * a.costoUnitGs);
    conteo.sobranteGs = sum(ajustes.filter((a) => a.diferencia > 0), (a) => a.diferencia * a.costoUnitGs);
    (BG.db.conteos || (BG.db.conteos = [])).push(conteo);
    (BG.db.ajustesStock || (BG.db.ajustesStock = [])).push(...ajustes);
    BG.auditar('productos', 'Conteo de inventario', conteo.contados + ' productos contados · ' + (ajustes.length ? ajustes.length + ' con diferencia' + (conteo.faltanteGs ? ' · faltante ' + gs(conteo.faltanteGs) + ' al costo' : '') : 'sin diferencias'));
    ajustes.forEach((a) => BG.auditar('productos', 'Ajuste de stock', a.descripcion + ': sistema ' + a.sistema + ', contado ' + a.contado + ' (' + (a.diferencia > 0 ? '+' : '') + a.diferencia + ') · ' + a.motivo));
    BG.guardar();
    return conteo;
  };

  /* ── Pedidos al proveedor (seguimiento hasta que llegan) ─────────────── */

  const textoPedido = (p) => p.proveedor + ' · ' + (p.items || []).length + ' artículo(s) · ' + C.fmtUSD(BG.totalUSDPedido(p.items));
  /** d = { proveedor, fechaPedido, items: [{ desc, cat, cant, costo, peso, nota }], nota } */
  BG.guardarPedidoProveedor = (d, id) => {
    soloDuenio('cargar pedidos al proveedor');
    const items = (d.items || []).filter((x) => limpiar(x.desc));
    if (!limpiar(d.proveedor)) throw new Error('Escribí el proveedor.');
    if (!items.length) throw new Error('Agregá al menos un artículo.');
    for (const x of items) if (!(C.parseEntero(x.cant) >= 1)) throw new Error('Revisá la cantidad de «' + x.desc + '».');
    let p;
    if (id) {
      p = BG.db.pedidos.find((x) => x.id === id);
      Object.assign(p, { proveedor: limpiar(d.proveedor), fechaPedido: d.fechaPedido, items: items, nota: limpiar(d.nota) });
      BG.auditar('productos', 'Pedido al proveedor editado', textoPedido(p));
    } else {
      p = {
        id: BG.uid('pd'), estado: 'pedido', proveedor: limpiar(d.proveedor), fechaPedido: d.fechaPedido || BG.hoy(), items: items, nota: limpiar(d.nota),
        courier: '', guia: '', llegaEstimada: '', historial: [{ estado: 'pedido', ts: BG.ahora(), usuario: BG.usuario().nombre, nota: '' }], productos: [],
      };
      BG.db.pedidos.push(p);
      BG.auditar('productos', 'Pedido al proveedor', textoPedido(p));
    }
    BG.guardar();
    return p;
  };
  /** Pasa a «en camino» (con courier, guía y llegada estimada) o a «cancelado». La llegada se registra al cargar el stock. */
  BG.cambiarEstadoPedido = (id, estado, extra) => {
    soloDuenio('actualizar pedidos al proveedor');
    const p = BG.db.pedidos.find((x) => x.id === id);
    const ex = extra || {};
    if (estado === 'en_camino') {
      p.courier = limpiar(ex.courier);
      p.guia = limpiar(ex.guia);
      p.llegaEstimada = ex.llegaEstimada || '';
    }
    p.estado = estado;
    const nota = estado === 'en_camino' ? [p.courier, p.guia ? 'guía ' + p.guia : '', p.llegaEstimada ? 'llega el ' + BG.fmtFecha(p.llegaEstimada) : ''].filter(Boolean).join(' · ') : limpiar(ex.nota);
    (p.historial || (p.historial = [])).push({ estado: estado, ts: BG.ahora(), usuario: BG.usuario().nombre, nota: nota });
    BG.auditar('productos', estado === 'en_camino' ? 'Pedido en camino' : 'Pedido cancelado', textoPedido(p) + (nota ? ' · ' + nota : ''));
    BG.guardar();
    return p;
  };

  /* ── Anulaciones (nunca se borra nada) ───────────────────────────────── */

  const soloDuenio = (que) => { if (!BG.esDuena()) throw new Error('Solo ' + BG.nombreDuena() + ' (dueño) puede ' + que + '.'); };

  BG.cambiarMargenMinimo = (m) => {
    soloDuenio('cambiar el margen mínimo');
    BG.db.config.precios = Object.assign({}, BG.db.config.precios, { margenMinimo: m });
    BG.auditar('parametros', 'Margen mínimo sin autorización', m + ' % sobre el costo');
    BG.guardar();
  };

  BG.anularVenta = (id, motivo) => {
    soloDuenio('anular ventas');
    const v = BG.venta(id);
    const cli = BG.cliente(v.clienteId);
    const pagado = BG.pagadoVenta(v);
    v.anulada = { fecha: BG.hoy(), ts: BG.ahora(), motivo: motivo, usuario: BG.usuario().nombre };
    BG.auditar('anulaciones', 'Venta anulada', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · motivo: ' + motivo);
    if (pagado > 0) {
      credito(v.clienteId, pagado, 'Pagos de la venta anulada ' + BG.fmtRecibo(v.recibo), { ventaId: v.id });
      BG.auditar('anulaciones', 'Saldo a favor', cli.nombre + ' · ' + gs(pagado) + ' de la venta anulada');
    }
    BG.guardar();
    return pagado;
  };

  /**
   * Cuánto saldo a favor hay que sacarle al cliente si se anula este pago: el excedente que generó, más la parte de una
   * devolución que había pasado a favor y que, sin este pago, ya no tiene respaldo en lo pagado.
   */
  function favorARevertir(pg) {
    const v = pg.ventaId ? BG.venta(pg.ventaId) : null;
    let deDevolucion = 0;
    if (v && v.aFavor) {
      const quedan = sum(BG.pagosDeVenta(v.id).filter((p) => p.id !== pg.id), (p) => p.total);
      deDevolucion = Math.max(0, v.aFavor - quedan);
    }
    return { excedente: pg.excedente || 0, deDevolucion: deDevolucion };
  }

  /** Devuelve un texto de error si el pago no se puede anular, o null si se puede. */
  BG.motivoNoAnulable = (pg) => {
    if (pg.anulado) return 'Este pago ya está anulado.';
    const v = pg.ventaId ? BG.venta(pg.ventaId) : null;
    if (v && v.anulada) return 'La venta está anulada: este pago ya pasó a saldo a favor.';
    const r = favorARevertir(pg);
    const vuelve = sum(pg.partes.filter((x) => x.forma === 'saldo'), (x) => x.monto);
    if (r.excedente + r.deDevolucion > 0 && BG.creditoCliente(pg.clienteId) + vuelve < r.excedente + r.deDevolucion) {
      return 'El saldo a favor que generó este pago ya se usó en otra compra (o se devolvió): anularlo dejaría el saldo a favor en negativo.';
    }
    return null;
  };

  BG.anularPago = (id, motivo) => {
    soloDuenio('anular pagos');
    const pg = BG.db.pagos.find((p) => p.id === id);
    const problema = BG.motivoNoAnulable(pg);
    if (problema) throw new Error(problema);
    const cli = BG.cliente(pg.clienteId);
    const r = favorARevertir(pg);
    pg.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: motivo, usuario: BG.usuario().nombre };
    const deSaldo = sum(pg.partes.filter((x) => x.forma === 'saldo'), (x) => x.monto);
    if (deSaldo > 0) credito(pg.clienteId, deSaldo, 'Devuelto al anular el recibo ' + BG.fmtRecibo(pg.recibo), { pagoId: pg.id });
    if (pg.excedente > 0) credito(pg.clienteId, -pg.excedente, 'Anulación del recibo ' + BG.fmtRecibo(pg.recibo), { pagoId: pg.id });
    if (r.deDevolucion > 0) {
      const v = BG.venta(pg.ventaId);
      v.aFavor -= r.deDevolucion;
      pg.anulado.aFavorRevertido = r.deDevolucion;
      credito(pg.clienteId, -r.deDevolucion, 'Anulación del recibo ' + BG.fmtRecibo(pg.recibo) + ' (la devolución ya no tiene pago que la respalde)', { pagoId: pg.id, ventaId: v.id });
    }
    BG.auditar('anulaciones', 'Pago anulado', 'Recibo ' + BG.fmtRecibo(pg.recibo) + ' · ' + cli.nombre + ' · ' + gs(pg.total + pg.excedente) + ' · motivo: ' + motivo
      + (r.deDevolucion ? ' · se quitaron ' + gs(r.deDevolucion) + ' de saldo a favor' : ''));
    BG.guardar();
  };

  /* ── Productos ───────────────────────────────────────────────────────── */

  function siguienteCodigo() {
    const max = BG.db.productos.reduce((m, p) => Math.max(m, parseInt(String(p.codigo).replace(/\D/g, ''), 10) || 0), 0);
    return 'P' + String(max + 1).padStart(2, '0');
  }

  /**
   * Arma un producto con el cálculo congelado.
   * d = { descripcion, categoria, proveedor, cantidad, costoUSD (fracción), pesoKg (fracción),
   *       envioModo 'kg'|'total', envioUnitUSD (fracción), tarifa, cotizacion, margen, precioManual, pedidoId }
   */
  function armarProducto(d, fecha, ts) {
    const cfg = BG.db.config;
    const r = C.calcularProducto({ costoUSD: d.costoUSD, envioUnitUSD: d.envioUnitUSD, cotizacion: d.cotizacion, redondeo: cfg.redondeo });
    const margen = d.precioManual ? null : (d.margen || cfg.margenDefecto);
    const codigo = siguienteCodigo();
    return {
      id: codigo, codigo: codigo, descripcion: d.descripcion, categoria: d.categoria, proveedor: d.proveedor || '',
      cantidad: d.cantidad, costoUSD: C.qToString(d.costoUSD), pesoKg: C.qToString(d.pesoKg),
      envioModo: d.envioModo, tarifa: d.tarifa || null, envioUnitUSD: C.qToString(C.asQ(d.envioUnitUSD)),
      cotizacion: C.qToString(C.asQ(d.cotizacion)), pedidoId: d.pedidoId || null, fechaCarga: fecha, ts: ts, nota: '',
      costoTotalGs: Number(r.costoTotalGs), envioGs: Number(r.envioGs), productoGs: Number(r.productoGs),
      margen: margen, precioVenta: d.precioManual ? d.precioManual : Number(r.precios.find((x) => x.margen === margen).redondeado),
    };
  }

  BG.guardarProductos = (lista, origen) => {
    const fecha = BG.hoy();
    const ts = BG.ahora();
    const creados = [];
    for (const d of lista) {
      const p = armarProducto(d, fecha, ts);
      BG.db.productos.push(p);
      creados.push(p);
    }
    const cot = C.fmtCot(lista[0].cotizacion);
    if (creados.length === 1 && origen === 'uno') {
      BG.auditar('productos', 'Carga de producto', creados[0].codigo + ' · ' + creados[0].descripcion + ' · ' + creados[0].cantidad + ' u · dólar ' + cot);
    } else {
      BG.auditar('productos', origen === 'excel' ? 'Importación desde Excel' : 'Carga de pedido', creados.length + ' productos · dólar ' + cot);
    }
    BG.guardar();
    return creados;
  };

  BG.actualizarPrecio = (pid, margen, precio, nota) => {
    const p = BG.producto(pid);
    const antes = p.precioVenta;
    p.margen = margen;
    p.precioVenta = precio;
    BG.auditar('productos', nota && /^liquidaci/i.test(nota) ? 'Precio de liquidación' : 'Precio de venta', p.codigo + ' · ' + p.descripcion + ' · ' + (antes ? gs(antes) : 'sin precio') + ' → ' + gs(precio)
      + (margen ? ' (' + margen + ' %)' : ' (manual)') + (nota ? ' · ' + nota : ''));
    BG.guardar();
  };

  /** Precio que tendría el producto si se recalcula con otra cotización (el costo congelado no cambia). */
  BG.precioConCotizacion = (p, cotizacion) => {
    if (p.costoUSD == null) return null;
    const r = C.calcularProducto({ costoUSD: p.costoUSD, envioUnitUSD: p.envioUnitUSD, cotizacion: cotizacion, redondeo: BG.db.config.redondeo });
    const m = p.margen || BG.db.config.margenDefecto;
    return Number(r.precios.find((x) => x.margen === m).redondeado);
  };

  /* ── Parámetros ──────────────────────────────────────────────────────── */

  BG.cambiarCotizacion = (valor, repreciar) => {
    const cfg = BG.db.config;
    const antes = cfg.cotizacion.valor;
    const reg = { valor: C.qToString(C.asQ(valor)), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre };
    cfg.cotizacion = reg;
    cfg.historialCotizacion.push(reg);
    BG.auditar('parametros', 'Cotización del dólar', C.fmtCot(antes) + ' → ' + C.fmtCot(reg.valor) + ' por US$ 1');
    let n = 0;
    for (const id of repreciar || []) {
      const p = BG.producto(id);
      const nuevo = BG.precioConCotizacion(p, reg.valor);
      if (nuevo && nuevo !== p.precioVenta) {
        p.precioVenta = nuevo;
        p.repreciado = { cotizacion: reg.valor, fecha: reg.fecha };
        n++;
      }
    }
    if (n) BG.auditar('productos', 'Precios actualizados', n + ' productos con stock, al dólar ' + C.fmtCot(reg.valor) + ' (el costo congelado no cambia)');
    BG.guardar();
    return n;
  };

  BG.cambiarTarifa = (valor) => {
    const cfg = BG.db.config;
    const antes = cfg.tarifa.valor;
    const reg = { valor: C.qToString(C.asQ(valor)), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre };
    cfg.tarifa = reg;
    cfg.historialTarifa.push(reg);
    BG.auditar('parametros', 'Tarifa del courier', C.fmtUSD(antes) + ' → ' + C.fmtUSD(reg.valor) + ' por kg');
    BG.guardar();
  };

  const MODOS = { cercano: 'al más cercano', arriba: 'siempre hacia arriba', abajo: 'siempre hacia abajo' };
  BG.MODOS_REDONDEO = MODOS;
  BG.textoRedondeo = (r) => (r.paso <= 1 ? 'sin redondeo' : 'a ' + C.groupThousands(r.paso) + ' ' + MODOS[r.modo]);
  BG.cambiarRedondeo = (paso, modo) => {
    BG.db.config.redondeo = { paso: paso, modo: modo };
    BG.auditar('parametros', 'Criterio de redondeo', BG.textoRedondeo(BG.db.config.redondeo));
    BG.guardar();
  };
  BG.cambiarMargenDefecto = (m) => {
    BG.db.config.margenDefecto = m;
    BG.auditar('parametros', 'Margen preseleccionado', m + ' %');
    BG.guardar();
  };
  BG.guardarTienda = (datos) => {
    Object.assign(BG.db.config.tienda, datos);
    BG.auditar('parametros', 'Datos de la tienda', 'Nombre, contacto y mensaje del recibo');
    BG.guardar();
  };
  BG.guardarMarca = (datos) => {
    Object.assign(BG.db.config.marca, datos);
    BG.auditar('parametros', 'Identidad visual', 'Logo y colores del recibo');
    return BG.guardar();
  };

  /* ── Caja ────────────────────────────────────────────────────────────── */

  BG.cerrarCaja = (fecha, esperado, contado, nota) => {
    BG.db.cierres = BG.db.cierres.filter((c) => c.fecha !== fecha);
    BG.db.cierres.push({ fecha: fecha, ts: BG.ahora(), usuario: BG.usuario().nombre, efectivoEsperado: esperado, efectivoContado: contado, nota: nota || '' });
    const cfg = BG.db.config;
    if (!cfg.cajaCerradaHasta || fecha > cfg.cajaCerradaHasta) cfg.cajaCerradaHasta = fecha;
    const dif = contado - esperado;
    BG.auditar('caja', 'Cierre de caja', BG.fmtFecha(fecha) + ' · efectivo contado ' + gs(contado) + (dif ? ' (diferencia ' + gs(dif) + ')' : ' · sin diferencias'));
    BG.guardar();
  };

  BG.reabrirCaja = (fecha) => {
    soloDuenio('reabrir la caja');
    BG.db.config.cajaCerradaHasta = BG.sumarDias(fecha, -1);
    BG.auditar('caja', 'Caja reabierta', BG.fmtFecha(fecha) + ' y días siguientes');
    BG.guardar();
  };

  /* ── Recibos emitidos ────────────────────────────────────────────────── */

  /** Cada vez que alguien imprime, guarda en PDF o manda por WhatsApp un recibo queda registrado. */
  BG.registrarEmision = (d) => {
    const cli = BG.cliente(d.clienteId);
    BG.db.emisiones.push({ id: BG.uid('em'), ts: BG.ahora(), usuario: BG.usuario().nombre, recibo: d.recibo, ventaId: d.ventaId || null, clienteId: d.clienteId, medio: d.medio });
    BG.auditar('recibos', 'Recibo emitido', (d.recibo ? 'Recibo ' + BG.fmtRecibo(d.recibo) : 'Estado de cuenta') + ' · ' + (cli ? cli.nombre : '') + ' · por ' + d.medio);
    BG.guardar();
  };
  BG.emisionesDe = (recibo, clienteId) => BG.db.emisiones.filter((e) => (recibo ? e.recibo === recibo : !e.recibo && e.clienteId === clienteId));

  /* ── Usuarios y permisos ─────────────────────────────────────────────── */

  BG.actualizarPermiso = (usuarioId, permiso, valor) => {
    soloDuenio('cambiar permisos');
    const u = BG.db.usuarios.find((x) => x.id === usuarioId);
    u.permisos = Object.assign({}, u.permisos, { [permiso]: !!valor });
    const etiqueta = (BG.PERMISOS.find((p) => p[0] === permiso) || [permiso, permiso])[1];
    BG.auditar('seguridad', 'Permisos de ' + u.nombre, (valor ? 'Habilitado: ' : 'Quitado: ') + etiqueta);
    BG.guardar();
  };

  /* ── Envíos por encomienda o courier ─────────────────────────────────── */

  BG.ESTADOS_ENVIO = { preparando: 'Preparando', listo: 'Listo para despachar', despachado: 'Despachado', entregado: 'Entregado', cancelado: 'Cancelado' };
  BG.CHECKLIST_ENVIO = [
    ['datos', 'Datos del destinatario confirmados por WhatsApp (nombre, CI, teléfono y ciudad)'],
    ['embalaje', 'Paquete bien cerrado con cinta, en bolsa o caja resistente'],
    ['etiqueta', 'Etiqueta impresa y pegada en la cara más grande, una por bulto'],
    ['prohibidos', 'Sin productos que la empresa no acepta (perfumes y aerosoles: consultar antes)'],
    ['cobro', 'Pago confirmado, o cobro contra entrega acordado con la empresa'],
    ['comprobante', 'Comprobante de la empresa guardado y número de guía cargado'],
  ];
  const ETIQUETA_AUDIT = { preparando: 'Envío preparado', listo: 'Listo para despachar', despachado: 'Envío despachado', entregado: 'Envío entregado', cancelado: 'Envío cancelado' };
  const resumenEnvio = (e) => e.numero + ' · ' + e.destinatario.nombre + ' → ' + e.destinatario.ciudad + ' (' + e.empresa + ')';

  /** Qué le falta a un envío para pasar a un estado. Devuelve una lista de textos (vacía = puede pasar). */
  BG.faltantesEnvio = (e, estado) => {
    const f = [];
    const d = e.destinatario;
    if (estado === 'listo' || estado === 'despachado') {
      if (!d.nombre) f.push('nombre del destinatario');
      if (BG.soloDigitos(d.ci).length < 5) f.push('CI del destinatario (la empresa la pide para retirar)');
      if (BG.soloDigitos(d.telefono).length < 6) f.push('teléfono del destinatario');
      if (!d.ciudad) f.push('ciudad de destino');
      if (!d.departamento) f.push('departamento');
      if (d.modalidad === 'domicilio' && !d.direccion) f.push('dirección de entrega');
      if (!e.empresa) f.push('empresa de transporte');
      if (!(e.bultos >= 1)) f.push('cantidad de bultos');
      BG.CHECKLIST_ENVIO.filter(([k]) => k !== 'comprobante').forEach(([k, t]) => { if (!e.checklist[k]) f.push('control: ' + t.split(' (')[0].toLowerCase()); });
    }
    if (estado === 'despachado' && !String(e.guia || '').trim()) f.push('número de guía o comprobante de la empresa');
    return f;
  };

  BG.guardarEnvio = (datos, id) => {
    let e;
    if (id) {
      e = BG.db.envios.find((x) => x.id === id);
      Object.assign(e, datos);
      BG.auditar('envios', 'Envío editado', resumenEnvio(e));
    } else {
      const cfg = BG.db.config.envios;
      e = Object.assign({
        id: BG.uid('en'), numero: 'E-' + String(cfg.proximo++).padStart(4, '0'), creado: BG.ahora(), usuario: BG.usuario().nombre,
        estado: 'preparando', historial: [{ estado: 'preparando', ts: BG.ahora(), usuario: BG.usuario().nombre, nota: '' }],
      }, datos);
      BG.db.envios.push(e);
      BG.auditar('envios', ETIQUETA_AUDIT.preparando, resumenEnvio(e));
    }
    BG.guardar();
    return e;
  };

  BG.cambiarEstadoEnvio = (id, estado, extra) => {
    const e = BG.db.envios.find((x) => x.id === id);
    if (estado === 'cancelado') soloDuenio('cancelar envíos');
    if (extra && extra.guia != null) e.guia = String(extra.guia).trim();
    if (estado === 'despachado') e.checklist.comprobante = true;
    const falta = BG.faltantesEnvio(e, estado);
    if (falta.length) throw new Error('Falta: ' + falta.join(', ') + '.');
    const nota = estado === 'despachado' ? 'Guía ' + e.guia : (extra && extra.nota) || '';
    e.estado = estado;
    e.historial.push({ estado: estado, ts: BG.ahora(), usuario: BG.usuario().nombre, nota: nota });
    BG.auditar('envios', ETIQUETA_AUDIT[estado], resumenEnvio(e) + (nota ? ' · ' + nota : ''));
    BG.guardar();
    return e;
  };

  BG.registrarEtiquetaImpresa = (e) => {
    BG.auditar('envios', 'Etiqueta impresa', resumenEnvio(e) + ' · ' + e.bultos + (e.bultos === 1 ? ' bulto' : ' bultos'));
    BG.guardar();
  };

  BG.guardarEmpresasEnvio = (lista) => {
    soloDuenio('cambiar las empresas de envío');
    BG.db.config.envios.empresas = lista;
    BG.auditar('parametros', 'Empresas de envío', lista.map((x) => x.nombre).join(', '));
    BG.guardar();
  };
})();

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
    if (!BG.puede('editarClientes')) throw new Error(BG.nombreDuena() + ' no te habilitó crear ni editar clientes.');
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

  /** Todo lo que cuelga de una clienta. Sirve para mostrarle a la persona qué se va a borrar antes de borrarlo. */
  BG.loDeCliente = (id) => {
    const ventas = BG.db.ventas.filter((v) => v.clienteId === id);
    const pagos = BG.db.pagos.filter((p) => p.clienteId === id);
    const egresos = (BG.db.egresos || []).filter((e) => e.clienteId === id);
    const vivas = ventas.filter((v) => !v.anulada);
    const pagosVivos = pagos.filter((p) => !p.anulado);
    return {
      ventas: ventas, pagos: pagos, egresos: egresos,
      creditos: BG.db.creditos.filter((x) => x.clienteId === id),
      canjes: (BG.db.canjes || []).filter((k) => k.clienteId === id),
      envios: BG.db.envios.filter((e) => e.clienteId === id),
      emisiones: BG.db.emisiones.filter((e) => e.clienteId === id),
      apartados: (BG.db.reservas || []).filter((r) => r.clienteId === id),
      puntosManuales: (BG.db.puntosManuales || []).filter((x) => x.clienteId === id),
      pedidos: (BG.db.deseos || []).filter((x) => x.clienteId === id),
      vendido: sum(vivas, (v) => v.total),
      cobrado: sum(pagosVivos, (p) => p.total + (p.excedente || 0)),
      devuelto: sum(egresos, (e) => e.monto),
      saldo: BG.saldoCliente(id),
      aFavor: BG.creditoCliente(id),
      /** Días con caja cerrada donde tiene movimientos: borrarlos cambia el arqueo de esos días. */
      diasCerrados: Array.from(new Set(vivas.map((v) => v.fecha).concat(pagosVivos.map((p) => p.fecha)).concat(egresos.map((e) => e.fecha))))
        .filter((f) => BG.cajaCerrada(f)).sort(),
      /** ¿Movió plata alguna vez? Si no, borrarla no cambia ningún número. */
      conMovimientos: ventas.length > 0 || pagos.length > 0 || egresos.length > 0
        || BG.db.creditos.some((x) => x.clienteId === id) || BG.db.envios.some((e) => e.clienteId === id),
    };
  };

  /**
   * ¿Se puede borrar esta clienta? Solo el dueño, y si la borra con movimientos se van con ella sus ventas,
   * cobros y devoluciones: eso cambia la caja y los reportes de esos días (por eso la pantalla pide el PIN).
   */
  BG.puedeBorrarCliente = (c) => {
    if (!c) return { ok: false, razon: 'No encontramos esa clienta.' };
    if (!BG.esDuena()) return { ok: false, razon: 'Borrar clientas lo hace ' + BG.nombreDuena() + '.' };
    return { ok: true, razon: '', lo: BG.loDeCliente(c.id) };
  };

  /**
   * Borra una clienta y todo lo suyo (ventas, cobros, saldo a favor, canjes, envíos y recibos emitidos).
   * Es para limpiar pruebas o una clienta cargada por error, no para esconder una venta: queda escrito en la
   * auditoría con los totales que se van. Si después del borrado los dos cuadres no cierran, no se guarda nada.
   */
  BG.borrarCliente = (id, motivo) => {
    soloDuenio('borrar clientas');
    const c = BG.cliente(id);
    if (!c) throw new Error('No encontramos esa clienta.');
    const lo = BG.loDeCliente(id);
    const respaldo = JSON.parse(JSON.stringify(BG.db));
    const ids = new Set(lo.ventas.map((v) => v.id));
    BG.db.clientes = BG.db.clientes.filter((x) => x.id !== id);
    BG.db.ventas = BG.db.ventas.filter((v) => v.clienteId !== id);
    BG.db.pagos = BG.db.pagos.filter((p) => p.clienteId !== id && !(p.ventaId && ids.has(p.ventaId)));
    BG.db.creditos = BG.db.creditos.filter((x) => x.clienteId !== id);
    if (BG.db.canjes) BG.db.canjes = BG.db.canjes.filter((k) => k.clienteId !== id);
    if (BG.db.egresos) BG.db.egresos = BG.db.egresos.filter((e) => e.clienteId !== id);
    BG.db.envios = BG.db.envios.filter((e) => e.clienteId !== id);
    BG.db.emisiones = BG.db.emisiones.filter((e) => e.clienteId !== id);
    // Lo que no es plata pero cuelga de ella: sus apartados (liberan el stock), lo que pidió y los avisos de cobranza.
    if (BG.db.reservas) BG.db.reservas = BG.db.reservas.filter((r) => r.clienteId !== id);
    if (BG.db.deseos) BG.db.deseos = BG.db.deseos.filter((x) => x.clienteId !== id);
    if (BG.db.recordatorios) BG.db.recordatorios = BG.db.recordatorios.filter((x) => x.clienteId !== id);
    if (BG.db.puntosManuales) BG.db.puntosManuales = BG.db.puntosManuales.filter((x) => x.clienteId !== id);
    const cu = BG.cuadre();
    const cf = BG.cuadreFavor();
    if (!cu.ok || !cf.ok) {
      BG.db = respaldo;   // si no cierran las cuentas, no se borra nada
      throw new Error('No se borró nada: después de sacarla, las cuentas no cerraban. Contale esto a quien hizo el sistema.');
    }
    BG.auditar('clientes', 'Cliente borrado', c.nombre + (c.ci ? ' · CI ' + c.ci : '') + ' · se borraron '
      + lo.ventas.length + (lo.ventas.length === 1 ? ' venta' : ' ventas') + ' por ' + gs(lo.vendido) + ', '
      + lo.pagos.length + (lo.pagos.length === 1 ? ' cobro' : ' cobros') + ' por ' + gs(lo.cobrado)
      + (lo.devuelto ? ', ' + gs(lo.devuelto) + ' devueltos en plata' : '')
      + (lo.envios.length ? ', ' + lo.envios.length + (lo.envios.length === 1 ? ' envío' : ' envíos') : '')
      + (lo.apartados.length ? ', ' + lo.apartados.length + (lo.apartados.length === 1 ? ' apartado' : ' apartados') : '')
      + (limpiar(motivo) ? ' · motivo: ' + limpiar(motivo) : ''));
    BG.guardar();
    return lo;
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
      // deCanje: cuánto de un pago con saldo a favor vino de puntos canjeados (esa parte no suma puntos ni se devuelve en plata).
      if (ya) { ya.monto += x.monto; if (x.deCanje) ya.deCanje = (ya.deCanje || 0) + x.deCanje; }
      else out.push(Object.assign({ forma: x.forma, monto: x.monto }, x.deCanje ? { deCanje: x.deCanje } : {}));
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
  /**
   * ¿Este pago suma sus puntos en el momento, sin esperar a que la compra termine de pagarse? Lo dice Ajustes
   * (`fidelidad.porPago`) y el dueño lo puede elegir pago por pago (`d.sumarPuntos`); la vendedora usa lo de Ajustes.
   */
  function quiereSumarPuntos(d) {
    if (!BG.configFidelidad().activo) return false;
    return BG.esDuena() && typeof d.sumarPuntos === 'boolean' ? d.sumarPuntos : !!BG.configFidelidad().porPago;
  }
  /** Anota en el pago los puntos que suma al cobrarse y si salen en su recibo (`d.puntosEnRecibo`, solo el dueño lo elige). */
  function puntosAlCobrar(v, pg, d) {
    if (BG.esDuena() && typeof d.puntosEnRecibo === 'boolean') pg.puntosEnRecibo = d.puntosEnRecibo;
    if (!quiereSumarPuntos(d)) return 0;
    pg.puntos = BG.puntosDePago(v, pg);
    return pg.puntos;
  }
  const textoPuntosPago = (n) => (n ? ' · suma ' + n + (n === 1 ? ' punto' : ' puntos') : '');
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
    if (!BG.puede('registrarCobros') && !BG.puede('registrarVentas')) throw new Error('Tu usuario no puede acordar cuotas.');
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
    // Lo que viene de puntos canjeados se usa en compras, pero no se devuelve en plata.
    const deCanje = BG.canjeDisponible(d.clienteId);
    const disponible = BG.creditoCliente(d.clienteId) - deCanje;
    const monto = Math.round(Number(d.monto));
    if (!(monto > 0)) throw new Error('Escribí cuánto se le devuelve.');
    if (monto > disponible) throw new Error('Se le pueden devolver en plata hasta ' + gs(disponible) + (deCanje ? ' (' + gs(deCanje) + ' de su saldo a favor son puntos canjeados: se usan en compras, no se devuelven en plata)' : '') + '.');
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
  /**
   * Arma los artículos de una venta con el precio y el costo de hoy congelados. Un precio distinto del de lista
   * queda como «precio especial», con el precio de lista, el motivo y quién lo puso. Lo usan la venta nueva y
   * «Agregar artículos» a una compra que ya existe: una sola forma de armar un artículo vendido.
   */
  function armarItems(lista, quien) {
    return lista.map((it) => {
      const p = BG.producto(it.productoId);
      if (!p) throw new Error('No encontramos uno de los artículos: volvé a elegirlo.');
      const especial = it.precio !== p.precioVenta ? { motivo: it.motivo || null, nota: limpiar(it.nota), usuario: quien } : null;
      return {
        productoId: p.id, descripcion: p.descripcion, cantidad: it.cantidad, precio: it.precio, costoUnitGs: p.costoTotalGs,
        margen: it.margen == null ? null : it.margen, precioLista: p.precioVenta, especial: especial,
      };
    });
  }
  /**
   * Reglas de precio de quien vende, iguales al vender y al agregar artículos: sin el permiso de precios
   * especiales se vende a precio de lista; la vendedora nunca cobra menos que la lista ni hace descuentos.
   * `descuentoPropio`: hay un descuento sobre el total que no es el regalo de cumpleaños.
   */
  function controlarPrecios(items, descuentoPropio) {
    if (!BG.puede('preciosEspeciales') && (descuentoPropio || items.some((it) => it.especial))) {
      throw new Error('Tu usuario vende con el precio de lista: ' + BG.nombreDuena() + ' no te habilitó los precios especiales.');
    }
    if (!BG.esDuena()) {
      const bajo = items.find((it) => it.precio < it.precioLista);
      if (bajo) throw new Error('«' + bajo.descripcion + '» no puede ir a menos del precio de lista (' + gs(bajo.precioLista) + '): cobrar menos lo decide ' + BG.nombreDuena() + '.');
      if (descuentoPropio) throw new Error('El descuento de la venta lo hace ' + BG.nombreDuena() + '.');
    }
  }

  const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') && !isNaN(new Date(f + 'T00:00:00').getTime());
  /**
   * Revisa los artículos de una venta (nueva o agregados a una compra): cantidad entera, precio, que no estén archivados y
   * que el stock alcance sumando si el mismo artículo viene dos veces (lo apartado para otras clientas no cuenta).
   * La pantalla ya lo mira, pero el motor no puede confiar en eso: dos aparatos, un doble toque o una pantalla vieja
   * llegan acá con datos que ya no valen.
   */
  function controlarArticulos(items, clienteId) {
    for (const it of items) {
      if (!Number.isInteger(it.cantidad) || it.cantidad < 1) throw new Error('Revisá la cantidad de «' + it.descripcion + '».');
      if (!Number.isInteger(it.precio) || !(it.precio > 0)) throw new Error('«' + it.descripcion + '» no tiene precio de venta.');
      if (BG.producto(it.productoId).archivado) throw new Error('«' + it.descripcion + '» está archivado: no se puede vender.');
    }
    const pedidas = new Map();
    items.forEach((it) => pedidas.set(it.productoId, (pedidas.get(it.productoId) || 0) + it.cantidad));
    pedidas.forEach((n, pid) => {
      const p = BG.producto(pid);
      const quedan = BG.vendibles(p, clienteId);
      if (quedan < n) throw new Error('De «' + p.descripcion + '» ' + (quedan === 1 ? 'queda 1' : 'quedan ' + Math.max(0, quedan)) + (BG.reservadas(p.id, clienteId) ? ' (el resto está apartado)' : '') + ': no alcanza para ' + n + '.');
    });
  }
  /** Las formas de pago que entran a la caja: forma conocida y monto entero. Devuelve las que tienen monto. */
  function controlarPartes(partes) {
    const lista = (partes || []).filter((x) => x && x.monto != null && x.monto !== '' && !Number.isNaN(x.monto) && Number(x.monto) !== 0);
    for (const x of lista) {
      if (!BG.FORMAS_CORTAS[x.forma]) throw new Error('Elegí cómo paga.');
      if (!Number.isInteger(x.monto) || x.monto < 0) throw new Error('Revisá el monto de ' + BG.FORMAS[x.forma].toLowerCase() + ': tiene que ser un monto entero en guaraníes.');
    }
    return lista.filter((x) => x.monto > 0);
  }
  const enteroNoNeg = (n) => n == null || n === '' || n === 0 || (Number.isInteger(n) && n >= 0);

  BG.registrarVenta = (d) => {
    if (!BG.puede('registrarVentas')) throw new Error('Tu usuario no puede registrar ventas.');
    const cli = BG.cliente(d.clienteId);
    if (!cli) throw new Error('Elegí la clienta de la venta.');
    if (!fechaValida(d.fecha)) throw new Error('La fecha de la venta no es válida.');
    if (d.fecha > BG.hoy()) throw new Error('La fecha de la venta no puede ser futura.');
    if (!Array.isArray(d.items) || !d.items.length) throw new Error('Agregá al menos un artículo.');
    const quien = BG.usuario().nombre;
    const items = armarItems(d.items, quien);
    controlarArticulos(items, d.clienteId);
    const fid = BG.configFidelidad();
    const conDescuento = !!(d.descuento && d.descuento.valor);
    // El regalo de cumpleaños es un beneficio del programa: se puede aplicar aunque no tenga precios especiales habilitados.
    const regalo = BG.regaloCumple(d.clienteId);
    const esRegalo = conDescuento && d.descuento.motivo === 'Cumpleaños';
    if (esRegalo && !(regalo && d.descuento.tipo === 'porcentaje' && Number(d.descuento.valor) === Number(regalo.porcentaje))) {
      throw new Error('El regalo de cumpleaños no corresponde para esta clienta ahora.');
    }
    controlarPrecios(items, conDescuento && !esRegalo);
    // El plan de cuotas se valida antes de guardar nada, así un dato mal puesto no deja la venta a medias.
    if (d.plan && (!BG.FRECUENCIAS[d.plan.frecuencia] || !d.plan.primera || d.plan.primera < d.fecha)) {
      throw new Error('Revisá el plan de cuotas: la primera cuota no puede vencer antes de la venta.');
    }
    const t = C.totalesVenta(items, d.descuento);
    if (conDescuento) {
      const dv = Number(d.descuento.valor);
      if (!isFinite(dv) || !(dv > 0) || (d.descuento.tipo === 'porcentaje' ? dv > 100 : Math.round(dv) > t.subtotal)) throw new Error('Revisá el descuento: no puede ser negativo ni pasar del total de la venta.');
    }
    if (!(t.total > 0)) throw new Error('El total de la venta no puede quedar en ' + gs(0) + '.');
    // Lo que entrega ahora: formas conocidas, montos enteros, saldo a favor que existe y nada de más sin decidir qué pasa con lo que sobra.
    const partesOk = controlarPartes(d.partes);
    if (!enteroNoNeg(d.usarCredito) || !enteroNoNeg(d.excedenteACredito)) throw new Error('Revisá lo que usa de su saldo a favor y lo que deja a su favor: tienen que ser montos enteros.');
    if ((d.usarCredito || 0) > BG.creditoCliente(d.clienteId)) throw new Error('Quiere usar ' + gs(d.usarCredito) + ' de su saldo a favor y tiene ' + gs(BG.creditoCliente(d.clienteId)) + '.');
    const enPlata = sum(partesOk, (x) => x.monto);
    if ((d.excedenteACredito || 0) > enPlata) throw new Error('No se puede dejar a su favor más de lo que pagó en plata.');
    const pagaAhora = enPlata + (d.usarCredito || 0) - (d.excedenteACredito || 0);
    if (pagaAhora > t.total) throw new Error('Paga ' + gs(pagaAhora) + ' y la venta es de ' + gs(t.total) + ': decidí qué pasa con lo que sobra (vuelto o saldo a favor).');
    // Límite de crédito: lo que queda debiendo no puede pasar el límite ni venderse a cuenta con cuotas muy atrasadas,
    // salvo que el dueño lo autorice (él mismo, o con su PIN en el mostrador).
    const recibidoAhora = sum((d.partes || []).filter((x) => x.monto > 0), (x) => x.monto) + (d.usarCredito || 0) - (d.excedenteACredito || 0);
    const quedaDebiendo = Math.max(0, t.total - recibidoAhora);
    const credito0 = BG.estadoCredito(d.clienteId, quedaDebiendo);
    if (!credito0.ok && !BG.esDuena() && !d.creditoAutorizadoPor) {
      throw new Error('No puede llevar a cuenta: ' + BG.textoCredito(credito0) + '. Que pague todo, o pedí la autorización de ' + BG.nombreDuena() + '.');
    }
    // Vender lo apartado: el apartado tiene que seguir vivo y ser de la misma clienta.
    const apartado = d.reservaId ? BG.reserva(d.reservaId) : null;
    if (d.reservaId && (!apartado || apartado.estado !== 'activa' || apartado.clienteId !== d.clienteId)) throw new Error('Ese apartado ya no está activo o es de otra clienta.');
    const recibo = BG.nuevoRecibo();
    const v = {
      id: BG.uid('v'), recibo: recibo, clienteId: d.clienteId, fecha: d.fecha, ts: BG.ahora(), items: items,
      descuento: {
        tipo: d.descuento ? d.descuento.tipo : 'monto', valor: d.descuento ? d.descuento.valor : 0, monto: t.descuento,
        motivo: conDescuento ? d.descuento.motivo || null : null, nota: conDescuento ? limpiar(d.descuento.nota) : '',
      },
      subtotal: t.subtotal, total: t.total, anulada: null, usuario: quien, autorizadoPor: d.autorizadoPor || null, ajustes: [],
      devoluciones: [], aFavor: 0, plan: null,
      // Regla de puntos vigente el día de la venta: si mañana cambia el programa, esta compra sigue valiendo lo mismo.
      fidelidad: fid.activo && d.fecha >= fid.desde ? { cadaGs: fid.cadaGs, valorPunto: fid.valorPunto } : null,
      creditoAutorizado: !credito0.ok ? { por: d.creditoAutorizadoPor || quien, motivo: BG.textoCredito(credito0) } : null,
    };
    BG.db.ventas.push(v);
    BG.auditar('ventas', 'Venta registrada', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + items.length + ' artículo(s) · ' + gs(v.total));
    if (apartado) {
      apartado.estado = 'retirada';
      apartado.cerrada = { fecha: BG.hoy(), ts: BG.ahora(), usuario: quien, ventaId: v.id };
      BG.auditar('apartados', 'Apartado retirado', cli.nombre + ' · se vendió en el recibo ' + BG.fmtRecibo(recibo));
    }
    if (v.creditoAutorizado) BG.auditar('seguridad', 'Venta a cuenta fuera del límite', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + v.creditoAutorizado.motivo + ' · autorizó ' + v.creditoAutorizado.por);
    items.filter((it) => it.especial).forEach((it) => BG.auditar('precios', 'Precio especial', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + it.descripcion + ': lista ' + gs(it.precioLista) + ' → ' + gs(it.precio)
      + textoMotivo(it.especial.motivo, it.especial.nota) + textoMargen(it.precio, it.costoUnitGs) + (v.autorizadoPor ? ' · autorizó ' + v.autorizadoPor : '')));
    if (t.descuento) {
      const costo = sum(items, (it) => (it.costoUnitGs || 0) * it.cantidad);
      BG.auditar('precios', 'Descuento', 'Recibo ' + BG.fmtRecibo(recibo) + ' · −' + gs(t.descuento) + (v.descuento.tipo === 'porcentaje' ? ' (' + C.fmtNum(v.descuento.valor, 0, 2) + ' %)' : '')
        + textoMotivo(v.descuento.motivo, v.descuento.nota) + textoMargen(t.total, costo) + ' en la venta' + (v.autorizadoPor ? ' · autorizó ' + v.autorizadoPor : ''));
    }

    const partes = partesOk.map((x) => ({ forma: x.forma, monto: x.monto }));
    if (d.usarCredito > 0) {
      // Primero se usa lo que viene de puntos canjeados (se anota, porque esa parte no vuelve a sumar puntos).
      const deCanje = Math.min(d.usarCredito, BG.canjeDisponible(d.clienteId));
      partes.push(Object.assign({ forma: 'saldo', monto: d.usarCredito }, deCanje ? { deCanje: deCanje } : {}));
      credito(d.clienteId, -d.usarCredito, 'Aplicado a la venta ' + BG.fmtRecibo(recibo), { ventaId: v.id });
    }
    const entregado = sum(partes, (x) => x.monto);
    let pago = null;
    if (entregado > 0) {
      const excedente = d.excedenteACredito || 0;
      pago = nuevoPago({ ventaId: v.id, clienteId: d.clienteId, fecha: d.fecha, partes: partes, total: entregado - excedente, excedente: excedente, recibo: recibo, inicial: true });
      const ptsPago = puntosAlCobrar(v, pago, d);
      BG.auditar('cobros', 'Pago inicial', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + textoPartes(partes) + textoPuntosPago(ptsPago));
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
    if (!BG.puede('registrarCobros')) throw new Error('Tu usuario no puede registrar cobros.');
    const cli = BG.cliente(d.clienteId);
    if (!cli) throw new Error('Elegí la clienta.');
    if (!fechaValida(d.fecha)) throw new Error('La fecha del cobro no es válida.');
    if (d.fecha > BG.hoy()) throw new Error('La fecha del cobro no puede ser futura.');
    if (d.destino !== 'todas' && d.destino !== 'sena') {
      const destino = BG.venta(d.destino);
      if (!destino || destino.anulada) throw new Error('Esa compra no existe o está anulada.');
      if (destino.clienteId !== d.clienteId) throw new Error('Esa compra es de otra clienta.');
    }
    if (!enteroNoNeg(d.usarCredito) || !enteroNoNeg(d.excedenteACredito)) throw new Error('Revisá el saldo a favor: tiene que ser un monto entero.');
    const cola = controlarPartes(d.partes).map((x) => ({ forma: x.forma, monto: x.monto }));
    // Un cobro que no tiene a qué aplicarse no se pierde ni se anota a medias: se frena y se dice por qué (otro aparato ya lo cobró, doble toque...).
    if (d.destino !== 'sena') {
      const deuda = d.destino === 'todas' ? BG.saldoCliente(d.clienteId) : BG.saldoVenta(BG.venta(d.destino));
      if (!(deuda > 0)) throw new Error(d.destino === 'todas' ? cli.nombre.split(' ')[0] + ' no debe nada: si es un adelanto, registralo como seña.' : 'Esa compra ya no debe nada (puede que otro aparato ya la haya cobrado). Si es un adelanto, registralo como seña.');
    }
    if ((d.excedenteACredito || 0) > sum(cola, (x) => x.monto)) throw new Error('No se puede dejar a su favor más de lo que pagó en plata.');
    // Saldo a favor usado para pagar la deuda: va primero y nunca más de lo que tiene ni de lo que debe.
    const usar = d.destino === 'sena' ? 0 : Math.min(Math.round(Number(d.usarCredito) || 0), BG.creditoCliente(d.clienteId),
      d.destino === 'todas' ? BG.saldoCliente(d.clienteId) : BG.saldoVenta(BG.venta(d.destino)));
    if (usar > 0) {
      const deCanje = Math.min(usar, BG.canjeDisponible(d.clienteId));
      cola.unshift(Object.assign({ forma: 'saldo', monto: usar }, deCanje ? { deCanje: deCanje } : {}));
    }
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
        const dc = x.deCanje ? Math.min(toma, x.deCanje) : 0;
        partes.push(Object.assign({ forma: x.forma, monto: toma }, dc ? { deCanje: dc } : {}));
        if (dc) x.deCanje -= dc;
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
      const pg = nuevoPago({ ventaId: v.id, clienteId: d.clienteId, fecha: d.fecha, partes: partes, total: aplicar, excedente: excedente, recibo: recibo, grupo: grupo });
      puntosAlCobrar(v, pg, d);
      pagos.push(pg);
    });
    const totalPartes = sum(pagos, (p) => sum(p.partes, (x) => x.monto));
    BG.auditar('cobros', 'Cobro registrado', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + gs(totalPartes) + ' en ' + pagos.length + ' venta(s)'
      + (usar > 0 ? ' · ' + gs(usar) + ' con su saldo a favor' : '') + textoPuntosPago(sum(pagos, (p) => p.puntos || 0)));
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
    if (!BG.esDuena() && precio < (it.precioLista || 0)) {
      throw new Error('No podés dejarlo por debajo del precio de lista (' + gs(it.precioLista) + '): eso lo decide ' + BG.nombreDuena() + '.');
    }
    if (!d.motivo && BG.esDuena()) throw new Error('Elegí el motivo del cambio.');
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

  /* ── Agregar artículos a una compra que ya existe ────────────────────── */

  /**
   * Suma artículos a una compra hecha: la compra sigue siendo una sola (mismo recibo) y el total sube.
   * Mismas reglas que al vender (precio de lista o especial con permiso, la vendedora nunca debajo de la
   * lista), el stock tiene que alcanzar y, si lo agregado queda debiendo, vale el límite de crédito.
   * Puede pagarse en el momento (`partes`), sin pasar el saldo: el vuelto o el saldo a favor se manejan desde
   * «Registrar cobro». Lo agregado cuenta en la fecha de la compra (como un ajuste de precio o una devolución:
   * la compra es una sola) y queda anotado con su propia fecha, hora y quién lo agregó.
   * d = { ventaId, items: [{ productoId, cantidad, precio, motivo, nota }], partes, autorizadoPor, creditoAutorizadoPor }
   */
  BG.agregarArticulos = (d) => {
    if (!BG.puede('registrarVentas')) throw new Error('Tu usuario no puede registrar ventas.');
    const v = BG.venta(d.ventaId);
    if (!v || v.anulada) throw new Error('Esa compra está anulada: no se le pueden agregar artículos.');
    if (v.anterior) throw new Error('Es una compra de antes del sistema: lo que llevó antes se anota como otra compra anterior.');
    const lista = (d.items || []).filter((x) => x && x.productoId);
    if (!lista.length) throw new Error('Elegí al menos un artículo para agregar.');
    const quien = BG.usuario().nombre;
    const items = armarItems(lista, quien);
    controlarArticulos(items, v.clienteId);   // cantidades, precios y stock: los mismos controles que al vender
    controlarPrecios(items, false);
    const t = BG.totalesDe(v, v.items.concat(items));
    const sube = t.total - v.total;
    const partes = controlarPartes(d.partes).map((x) => ({ forma: x.forma, monto: x.monto }));
    const recibido = sum(partes, (x) => x.monto);
    const saldoNuevo = t.total - BG.pagadoVenta(v);
    if (recibido > saldoNuevo) throw new Error('Paga ' + gs(recibido) + ' y la compra quedaría debiendo ' + gs(saldoNuevo) + ': cobrá lo justo, o usá «Registrar cobro» para darle vuelto o dejarlo a su favor.');
    const credito0 = BG.estadoCredito(v.clienteId, Math.max(0, sube - recibido));
    if (!credito0.ok && !BG.esDuena() && !d.creditoAutorizadoPor) {
      throw new Error('No puede llevar a cuenta: ' + BG.textoCredito(credito0) + '. Que pague lo que se agrega, o pedí la autorización de ' + BG.nombreDuena() + '.');
    }
    const cli = BG.cliente(v.clienteId);
    const ag = {
      id: BG.uid('ag'), fecha: BG.hoy(), ts: BG.ahora(), usuario: quien, items: [], totalAntes: v.total, totalDespues: t.total,
      autorizadoPor: d.autorizadoPor || null,
      creditoAutorizado: !credito0.ok ? { por: d.creditoAutorizadoPor || quien, motivo: BG.textoCredito(credito0) } : null,
    };
    items.forEach((it) => { it.agregado = ag.id; v.items.push(it); ag.items.push(v.items.length - 1); });
    v.subtotal = t.subtotal;
    v.descuento.monto = t.descuento;
    v.total = t.total;
    (v.agregados || (v.agregados = [])).push(ag);
    const que = items.map((it) => it.cantidad + ' × ' + it.descripcion).join(', ');
    BG.auditar('ventas', 'Artículos agregados', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · ' + que + ' · total ' + gs(ag.totalAntes) + ' → ' + gs(ag.totalDespues));
    if (ag.creditoAutorizado) BG.auditar('seguridad', 'Venta a cuenta fuera del límite', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · ' + ag.creditoAutorizado.motivo + ' · autorizó ' + ag.creditoAutorizado.por);
    items.filter((it) => it.especial).forEach((it) => BG.auditar('precios', 'Precio especial', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + it.descripcion + ': lista ' + gs(it.precioLista) + ' → ' + gs(it.precio)
      + textoMotivo(it.especial.motivo, it.especial.nota) + textoMargen(it.precio, it.costoUnitGs) + (ag.autorizadoPor ? ' · autorizó ' + ag.autorizadoPor : '')));
    let pago = null;
    if (recibido > 0) {
      const recibo = BG.nuevoRecibo();
      pago = nuevoPago({ ventaId: v.id, clienteId: v.clienteId, fecha: BG.hoy(), partes: partes, total: recibido, excedente: 0, recibo: recibo });
      BG.auditar('cobros', 'Cobro registrado', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + textoPartes(partes) + ' por lo agregado a la compra ' + BG.fmtRecibo(v.recibo));
    }
    BG.guardar();
    return { agregado: ag, pago: pago };
  };

  /* ── Corregir una compra ya hecha (solo el dueño) ──────────────────────── */

  /**
   * Cambia lo que está mal de una compra: nombre, cantidad, precio y costo de cada artículo, el descuento y la fecha.
   * No se pisa nada: el ticket anterior queda guardado dentro de la compra (`v.correcciones`, con quién, cuándo y por
   * qué) y el recibo que se emita después sale con lo corregido y dice «corregido». Es la misma compra (mismo número) y
   * la plata y el stock se acomodan con las reglas de siempre:
   *  · lo que ya pagó de más pasa a saldo a favor (igual que en una devolución); lo que falte sigue como deuda;
   *  · las unidades que sobran vuelven al stock y las que faltan salen (tiene que haber);
   *  · los puntos, la ganancia, la comisión y las cuotas salen de lo nuevo.
   * Solo se guarda si todo cierra: los dos cuadres, el stock, los puntos que ya canjeó y las cuotas. `revisarCorreccion`
   * hace todo en una COPIA y no guarda nada: sirve para mostrar qué pasaría antes de confirmar (y es lo mismo que corre
   * `corregirVenta`, así lo que se ve es lo que pasa).
   * d = { ventaId, items: [{ descripcion, cantidad, precio, costoUnitGs }] (uno por artículo, en el mismo orden),
   *       descuento: { tipo, valor } | null (null lo saca; sin la clave no se toca), fecha, motivo, nota }
   */
  const textoMotivoCorreccion = (motivo, nota) => (motivo === 'Otro' ? nota : motivo + (nota ? ' · ' + nota : ''));

  /** Lee y valida lo que mandó la pantalla (sin tocar nada). Devuelve { error } o los datos ya limpios. */
  function leerCorreccion(v, d) {
    const entero = (x) => (x === '' || x == null || !isFinite(Number(x)) ? NaN : Math.round(Number(x)));
    if (!Array.isArray(d.items) || d.items.length !== v.items.length) return { error: 'La lista de artículos no coincide con la de la compra: volvé a abrir la corrección.' };
    const items = [];
    for (let i = 0; i < v.items.length; i++) {
      const it = v.items[i];
      const n = d.items[i];
      const descripcion = limpiar(n.descripcion);
      const cantidad = entero(n.cantidad);
      const precio = entero(n.precio);
      const costo = v.anterior || n.costoUnitGs == null || n.costoUnitGs === '' ? null : entero(n.costoUnitGs);
      if (!descripcion) return { error: 'Falta el nombre del artículo ' + (i + 1) + '.' };
      if (!(cantidad >= 0) || cantidad < (it.devueltas || 0)) {
        return { error: it.devueltas ? 'De «' + it.descripcion + '» ya devolvió ' + it.devueltas + ': la cantidad no puede ser menos.' : 'Escribí la cantidad de «' + it.descripcion + '».' };
      }
      const vivo = cantidad - (it.devueltas || 0) > 0;
      if (!(precio >= 0) || (vivo && !(precio > 0))) return { error: 'Escribí el precio de «' + it.descripcion + '».' };
      if (costo != null && !(costo >= 0)) return { error: 'El costo de «' + it.descripcion + '» tiene que ser un monto (o dejalo como estaba).' };
      // Cambiar el artículo de la línea por otro del stock (se cargó «el rojo» y era «el azul»): mueve el stock de uno al otro.
      let productoId = null;
      if (n.productoId && n.productoId !== it.productoId) {
        const np = BG.producto(n.productoId);
        if (v.anterior || !it.productoId) return { error: 'Una compra de antes del sistema no tiene artículos del stock: no se puede cambiar el artículo.' };
        if (it.devueltas || it.cambioDe || (v.devoluciones || []).some((x) => x.item === i || x.nuevoItem === i)) {
          return { error: '«' + it.descripcion + '» ya tuvo una devolución o un cambio: para cambiarlo por otro usá «Devolución o cambio».' };
        }
        if (!np || np.archivado) return { error: 'Elegí un artículo del stock para cambiarlo.' };
        productoId = np.id;
      }
      items.push({ descripcion: descripcion, cantidad: cantidad, precio: precio, costo: costo, productoId: productoId });
    }
    let descuento;   // undefined = no se toca
    if (d.descuento !== undefined) {
      if (d.descuento === null || !(Number(d.descuento.valor) > 0)) descuento = null;
      else {
        const tipo = d.descuento.tipo === 'porcentaje' ? 'porcentaje' : 'monto';
        const valor = Number(d.descuento.valor);
        if (tipo === 'porcentaje' && valor > 100) return { error: 'El descuento no puede pasar del 100 %.' };
        descuento = { tipo: tipo, valor: tipo === 'monto' ? Math.round(valor) : valor };
      }
    }
    const fecha = d.fecha || v.fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(fecha + 'T00:00:00').getTime())) return { error: 'La fecha de la compra no es válida.' };
    if (fecha > BG.hoy()) return { error: 'La fecha de la compra no puede ser futura.' };
    if (!BG.MOTIVOS_CORRECCION.includes(d.motivo)) return { error: 'Elegí el motivo de la corrección.' };
    const nota = limpiar(d.nota);
    if (d.motivo === 'Otro' && nota.length < 5) return { error: 'Contá qué se corrige en «Detalle» (queda en el historial).' };
    return { items: items, descuento: descuento, fecha: fecha, motivo: d.motivo, nota: nota };
  }

  const fotoDeCompra = (v) => ({ total: v.total, costo: BG.costoVenta(v), ganancia: BG.gananciaVenta(v), pagado: BG.pagadoVenta(v), saldo: BG.saldoVenta(v) });
  /** Unidades que la clienta se queda de cada producto de la compra (para mover el stock y avisar). */
  const unidadesPorProducto = (v) => {
    const m = new Map();
    v.items.forEach((it) => { if (it.productoId) m.set(it.productoId, (m.get(it.productoId) || 0) + BG.cantidadViva(it)); });
    return m;
  };

  /** Hace la corrección sobre la compra `v` de BG.db (la real, o la copia de una revisión). Devuelve el registro que queda en la compra. */
  function aplicarCorreccion(v, l) {
    const quien = BG.usuario().nombre;
    const antes = { items: JSON.parse(JSON.stringify(v.items)), descuento: Object.assign({}, v.descuento), subtotal: v.subtotal, total: v.total, fecha: v.fecha };
    const costoAntes = BG.costoVenta(v);
    const pagado = BG.pagadoVenta(v);
    const cambios = [];
    v.items.forEach((it, i) => {
      const n = l.items[i];
      if (n.productoId) {
        const np = BG.producto(n.productoId);
        cambios.push('Artículo «' + it.descripcion + '» → «' + np.descripcion + '» (otro artículo del stock)');
        // Lo de este artículo es del producto nuevo: nombre, precio de lista y costo de hoy (el costo se puede cambiar abajo).
        Object.assign(it, { productoId: np.id, descripcion: np.descripcion, precioLista: np.precioVenta, costoUnitGs: np.costoTotalGs, margen: null, especial: null });
      }
      const nombre = '«' + it.descripcion + '»';
      if (it.descripcion !== n.descripcion) { cambios.push('Artículo ' + nombre + ' → «' + n.descripcion + '»'); it.descripcion = n.descripcion; }
      if (it.cantidad !== n.cantidad) { cambios.push(nombre + ': cantidad ' + it.cantidad + ' → ' + n.cantidad); it.cantidad = n.cantidad; }
      if (it.precio !== n.precio) {
        cambios.push(nombre + ': precio ' + gs(it.precio) + ' → ' + gs(n.precio));
        if (it.precioLista == null) it.precioLista = it.precio;
        it.precio = n.precio;
        it.margen = null;
      }
      // Un precio distinto del de lista queda como especial (así se ve en los reportes); si volvió a la lista, ya no lo es.
      if (it.precioLista != null && it.precio === it.precioLista) it.especial = null;
      else if (it.precioLista != null && !it.especial) it.especial = { motivo: 'Corrección', nota: l.motivo, usuario: quien };
      if (n.costo != null && it.costoUnitGs !== n.costo) { cambios.push(nombre + ': costo ' + gs(it.costoUnitGs || 0) + ' → ' + gs(n.costo) + ' c/u'); it.costoUnitGs = n.costo; }
    });
    if (l.descuento !== undefined) {
      const era = v.descuento && v.descuento.valor ? v.descuento : null;
      const igual = l.descuento ? era && era.tipo === l.descuento.tipo && Number(era.valor) === l.descuento.valor : !era;
      if (!igual) {
        cambios.push('Descuento: ' + (era ? (era.tipo === 'porcentaje' ? C.fmtNum(era.valor, 0, 2) + ' %' : gs(era.valor)) : 'ninguno') + ' → '
          + (l.descuento ? (l.descuento.tipo === 'porcentaje' ? C.fmtNum(l.descuento.valor, 0, 2) + ' %' : gs(l.descuento.valor)) : 'ninguno'));
        v.descuento = l.descuento ? Object.assign({}, v.descuento, { tipo: l.descuento.tipo, valor: l.descuento.valor })
          : { tipo: 'monto', valor: 0, monto: 0, motivo: null, nota: '' };
      }
    }
    if (l.fecha !== v.fecha) { cambios.push('Fecha ' + BG.fmtFecha(v.fecha) + ' → ' + BG.fmtFecha(l.fecha)); v.fecha = l.fecha; }
    const t = BG.totalesDe(v);
    v.subtotal = t.subtotal;
    v.descuento.monto = t.descuento;
    v.total = t.total;
    const reg = {
      id: BG.uid('co'), fecha: BG.hoy(), ts: BG.ahora(), usuario: quien, motivo: textoMotivoCorreccion(l.motivo, l.nota), nota: l.nota, cambios: cambios, antes: antes,
      totalAntes: antes.total, totalDespues: t.total, costoAntes: costoAntes, costoDespues: BG.costoVenta(v), aFavor: 0,
    };
    // Si ya había pagado más que el total nuevo, lo que sobra pasa a su favor (igual que en una devolución).
    const sobra = pagado - t.total;
    if (sobra > 0) {
      v.aFavor = (v.aFavor || 0) + sobra;
      reg.aFavor = sobra;
      credito(v.clienteId, sobra, 'Corrección de la compra ' + BG.fmtRecibo(v.recibo), { ventaId: v.id, correccionId: reg.id });
    }
    (v.correcciones || (v.correcciones = [])).push(reg);
    return reg;
  }

  /**
   * Qué pasaría con esta corrección, sin guardar nada: { ok, errores, efectos, antes, despues, aFavor, cambios }.
   * Todo se prueba en una copia de los datos; si algo no cierra, `ok` es false y `errores` dice por qué.
   */
  BG.revisarCorreccion = (d) => {
    const r = { ok: false, errores: [], efectos: [], cambios: [] };
    const v = BG.venta(d.ventaId);
    if (!v) { r.errores.push('No encontramos esa compra.'); return r; }
    if (!BG.esDuena()) { r.errores.push('Corregir una compra lo hace ' + BG.nombreDuena() + '.'); return r; }
    if (v.anulada) { r.errores.push('La compra está anulada: no se corrige.'); return r; }
    const l = leerCorreccion(v, d);
    if (l.error) { r.errores.push(l.error); return r; }
    const antes = fotoDeCompra(v);
    const ptsAntes = BG.puntosDe(v.clienteId);
    const uniAntes = unidadesPorProducto(v);
    const falla = (m) => r.errores.push(m);
    const real = BG.db;
    BG.db = JSON.parse(JSON.stringify(real));
    try {
      const vc = BG.venta(v.id);
      const reg = aplicarCorreccion(vc, l);
      const despues = fotoDeCompra(vc);
      r.antes = antes;
      r.despues = despues;
      r.aFavor = reg.aFavor;
      r.cambios = reg.cambios;
      if (!reg.cambios.length) falla('No cambiaste nada.');
      if (!vc.items.some((it) => BG.cantidadViva(it) > 0) || !(vc.total > 0)) falla('La compra no puede quedar en ' + gs(0) + ' ni sin artículos: si no se llevó nada, anulala.');
      if (vc.anterior && vc.total < antes.pagado) falla('Es una compra de antes del sistema: no puede quedar por debajo de lo que ya figura pagado (' + gs(antes.pagado) + ').');
      if (l.fecha !== v.fecha && (BG.cajaCerrada(v.fecha) || BG.cajaCerrada(l.fecha))) falla('La fecha vieja o la nueva está en un día con la caja cerrada: reabrí la caja antes de cambiarla.');
      if (vc.plan && l.fecha !== v.fecha && vc.plan.cuotas.length && vc.plan.cuotas[0].vence < vc.fecha) falla('La primera cuota vence antes de la nueva fecha de la compra: cambiá las cuotas primero.');
      // Stock: lo que sobra vuelve y lo que falta tiene que haber (se mira en los datos de verdad, no en la copia).
      const uniDesp = unidadesPorProducto(vc);
      // Los productos de antes y de después: si se cambió el artículo de una línea, el viejo vuelve al stock y el nuevo sale.
      for (const pid of new Set(Array.from(uniAntes.keys()).concat(Array.from(uniDesp.keys())))) {
        const dif = (uniDesp.get(pid) || 0) - (uniAntes.get(pid) || 0);
        const p = real.productos.find((x) => x.id === pid);
        if (!dif || !p) continue;
        // BG.vendibles lee BG.db (la copia, que ya tiene lo nuevo): si quedó negativo, no alcanzaba (lo apartado para otras no se toca).
        const sobraStock = BG.vendibles(BG.producto(pid), vc.clienteId);
        if (dif > 0 && sobraStock < 0) falla('No alcanza el stock de «' + p.descripcion + '»: hacen falta ' + dif + ' más y solo hay ' + (sobraStock + dif) + '.');
        r.efectos.push(dif > 0 ? 'Salen del stock ' + dif + ' × ' + p.descripcion + '.' : 'Vuelven al stock ' + (-dif) + ' × ' + p.descripcion + '.');
      }
      // Puntos: no pueden quedar menos de los que ya canjeó.
      const ptsDesp = BG.puntosDe(vc.clienteId);
      if (ptsAntes && ptsDesp) {
        if (ptsDesp.ganados < ptsDesp.canjeados && ptsDesp.ganados < ptsAntes.ganados) {
          falla('Con ese cambio ' + BG.cliente(vc.clienteId).nombre.split(' ')[0] + ' quedaría con ' + ptsDesp.ganados + ' puntos ganados y ya canjeó ' + ptsDesp.canjeados + ': no se puede.');
        }
        const dg = ptsDesp.ganados - ptsAntes.ganados;
        const dp = ptsDesp.pendientes - ptsAntes.pendientes;
        if (dg) r.efectos.push(dg > 0 ? 'Suma ' + dg + (dg === 1 ? ' punto' : ' puntos') + ' a la clienta.' : 'La clienta pierde ' + (-dg) + (dg === -1 ? ' punto' : ' puntos') + '.');
        if (dp) r.efectos.push(dp > 0 ? 'Quedan ' + dp + ' puntos más para cuando termine de pagar.' : 'Quedan ' + (-dp) + ' puntos menos para cuando termine de pagar.');
      }
      // Las dos cuentas tienen que cerrar.
      const cu = BG.cuadre();
      const cf = BG.cuadreFavor();
      if (!cu.ok || !cf.ok) falla('Con esos cambios las cuentas no cierran: no se guarda nada.');
      if (despues.total !== antes.total) r.efectos.push('El total de la compra pasa de ' + gs(antes.total) + ' a ' + gs(despues.total) + '.');
      if (reg.aFavor) r.efectos.push('Lo que ya pagó de más (' + gs(reg.aFavor) + ') pasa a saldo a favor de la clienta.');
      else if (despues.saldo !== antes.saldo) r.efectos.push(despues.saldo > 0 ? 'Debe ' + gs(despues.saldo) + ' de esta compra.' : 'La compra queda saldada.');
      if (despues.costo !== antes.costo || despues.total !== antes.total) r.efectos.push('La ganancia de esta compra pasa de ' + gs(antes.ganancia) + ' a ' + gs(despues.ganancia) + '.');
    } catch (e) {
      falla(e.message);
    } finally {
      BG.db = real;
    }
    r.ok = !r.errores.length;
    return r;
  };

  BG.corregirVenta = (d) => {
    soloDuenio('corregir compras ya hechas');
    const r = BG.revisarCorreccion(d);
    if (!r.ok) throw new Error(r.errores[0]);
    const v = BG.venta(d.ventaId);
    const l = leerCorreccion(v, d);
    const respaldo = JSON.parse(JSON.stringify(BG.db));
    const reg = aplicarCorreccion(v, l);
    // Segunda barrera: la revisión ya lo probó en una copia, pero si por algo las cuentas no cierran no se guarda nada.
    if (!BG.cuadre().ok || !BG.cuadreFavor().ok) {
      BG.db = respaldo;
      throw new Error('No se guardó nada: después del cambio las cuentas no cerraban. Contale esto a quien hizo el sistema.');
    }
    BG.auditar('ventas', 'Compra corregida', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + BG.cliente(v.clienteId).nombre + ' · ' + reg.motivo + ' · ' + reg.cambios.join('; ')
      + ' · total ' + gs(reg.totalAntes) + ' → ' + gs(reg.totalDespues) + ' · costo ' + gs(reg.costoAntes) + ' → ' + gs(reg.costoDespues)
      + (reg.aFavor ? ' · ' + gs(reg.aFavor) + ' pasan a saldo a favor' : ''));
    BG.guardar();
    return reg;
  };

  /* ── Pasar una compra a otra clienta (solo el dueño) ───────────────────── */

  /**
   * Una compra cargada a la clienta equivocada pasa a la correcta, con sus pagos y su fecha: queda anotado en la compra
   * (`v.traslados`: de quién a quién, cuándo, por qué y quién) y en la cuenta de las dos. La deuda y los puntos se mudan
   * con ella (son derivados). Solo se pasa lo «limpio»: si la compra tiene pagos hechos con saldo a favor o con puntos, un
   * saldo a favor que generó o un envío preparado, esas cosas son de la clienta de antes y no se mudan solas. Igual que
   * corregir: `revisarTraspaso` ensaya todo en una copia y `pasarCompraDeClienta` solo guarda si los dos cuadres cierran.
   * d = { ventaId, clienteId (la nueva), motivo (BG.MOTIVOS_TRASPASO), nota }
   */
  BG.MOTIVOS_TRASPASO = ['Se cargó a la clienta equivocada', 'Otro'];

  function leerTraspaso(v, d) {
    const nueva = BG.cliente(d.clienteId);
    if (!nueva) return { error: 'Elegí a qué clienta se pasa la compra.' };
    if (nueva.id === v.clienteId) return { error: 'Esa compra ya es de ' + nueva.nombre + '.' };
    if (!BG.MOTIVOS_TRASPASO.includes(d.motivo)) return { error: 'Elegí el motivo.' };
    const nota = limpiar(d.nota);
    if (d.motivo === 'Otro' && nota.length < 5) return { error: 'Contá qué pasó en «Detalle» (queda en el historial).' };
    return { hasta: nueva.id, motivo: d.motivo, nota: nota };
  }

  /** Hace el traspaso de `v` en BG.db (la real o la copia de una revisión): la compra y todos sus pagos pasan a la otra clienta. */
  function aplicarTraspaso(v, l) {
    const de = BG.cliente(v.clienteId);
    const a = BG.cliente(l.hasta);
    const reg = {
      id: BG.uid('tr'), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, de: de.id, a: a.id, deNombre: de.nombre, aNombre: a.nombre,
      motivo: textoMotivoCorreccion(l.motivo, l.nota), nota: l.nota,
    };
    v.clienteId = a.id;
    BG.db.pagos.filter((p) => p.ventaId === v.id).forEach((p) => { p.clienteId = a.id; });
    (v.traslados || (v.traslados = [])).push(reg);
    return reg;
  }

  /** Qué pasaría con este traspaso, sin guardar nada: { ok, errores, efectos }. */
  BG.revisarTraspaso = (d) => {
    const r = { ok: false, errores: [], efectos: [] };
    const v = BG.venta(d.ventaId);
    if (!v) { r.errores.push('No encontramos esa compra.'); return r; }
    if (!BG.esDuena()) { r.errores.push('Pasar una compra a otra clienta lo hace ' + BG.nombreDuena() + '.'); return r; }
    if (v.anulada) { r.errores.push('La compra está anulada: no se pasa.'); return r; }
    const l = leerTraspaso(v, d);
    if (l.error) { r.errores.push(l.error); return r; }
    const de = BG.cliente(v.clienteId);
    const a = BG.cliente(l.hasta);
    const falla = (m) => r.errores.push(m);
    // Lo que es de la clienta de ahora y no se muda solo.
    const vivos = BG.db.pagos.filter((p) => p.ventaId === v.id && !p.anulado);
    if (vivos.some((p) => p.partes.some((x) => x.forma === 'saldo'))) falla('Parte de esta compra se pagó con saldo a favor (o con puntos) de ' + de.nombre + ': ese saldo es suyo y no se pasa solo.');
    if (vivos.some((p) => p.excedente > 0)) falla('Un pago de esta compra dejó saldo a favor de ' + de.nombre + ': ese saldo es suyo y no se pasa solo.');
    if ((v.aFavor || 0) > 0 || BG.db.creditos.some((c) => c.ventaId === v.id)) falla('Esta compra tuvo una devolución o un ajuste que movió saldo a favor de ' + de.nombre + ': eso es suyo y no se pasa solo.');
    const envio = BG.envioDeVenta(v.id);
    if (envio) falla('Tiene un envío preparado (' + envio.numero + ') con el nombre de ' + de.nombre + ': cancelalo primero.');
    const antes = { de: BG.saldoCliente(de.id), a: BG.saldoCliente(a.id), pDe: BG.puntosDe(de.id), pA: BG.puntosDe(a.id) };
    const real = BG.db;
    BG.db = JSON.parse(JSON.stringify(real));
    try {
      const vc = BG.venta(v.id);
      aplicarTraspaso(vc, l);
      if (!BG.cuadre().ok || !BG.cuadreFavor().ok) falla('Con ese cambio las cuentas no cierran: no se guarda nada.');
      const pDe = BG.puntosDe(de.id);
      const pA = BG.puntosDe(a.id);
      if (antes.pDe && pDe && pDe.ganados < pDe.canjeados && pDe.ganados < antes.pDe.ganados) {
        falla(de.nombre.split(' ')[0] + ' quedaría con ' + pDe.ganados + ' puntos ganados y ya canjeó ' + pDe.canjeados + ': no se puede.');
      }
      const nDe = BG.saldoCliente(de.id);
      const nA = BG.saldoCliente(a.id);
      if (nDe !== antes.de) r.efectos.push(de.nombre + ' pasa de deber ' + gs(antes.de) + ' a ' + gs(nDe) + '.');
      if (nA !== antes.a) r.efectos.push(a.nombre + ' pasa de deber ' + gs(antes.a) + ' a ' + gs(nA) + '.');
      if (antes.pDe && pDe && pDe.ganados !== antes.pDe.ganados) r.efectos.push(de.nombre.split(' ')[0] + ' pierde ' + (antes.pDe.ganados - pDe.ganados) + ' puntos.');
      if (antes.pA && pA && pA.ganados !== antes.pA.ganados) r.efectos.push(a.nombre.split(' ')[0] + ' suma ' + (pA.ganados - antes.pA.ganados) + ' puntos.');
      if (antes.pA && pA && pA.pendientes !== antes.pA.pendientes) r.efectos.push(a.nombre.split(' ')[0] + ' suma ' + (pA.pendientes - antes.pA.pendientes) + ' puntos para cuando termine de pagar.');
      const ec = BG.estadoCredito(a.id, 0);
      if (!ec.ok) r.efectos.push('Ojo: con esta compra ' + a.nombre.split(' ')[0] + ' queda fuera de su límite de crédito (' + BG.textoCredito(ec) + '). Podés pasarla igual.');
    } catch (e) {
      falla(e.message);
    } finally {
      BG.db = real;
    }
    r.ok = !r.errores.length;
    return r;
  };

  BG.pasarCompraDeClienta = (d) => {
    soloDuenio('pasar una compra a otra clienta');
    const r = BG.revisarTraspaso(d);
    if (!r.ok) throw new Error(r.errores[0]);
    const v = BG.venta(d.ventaId);
    const l = leerTraspaso(v, d);
    const respaldo = JSON.parse(JSON.stringify(BG.db));
    const reg = aplicarTraspaso(v, l);
    if (!BG.cuadre().ok || !BG.cuadreFavor().ok) {
      BG.db = respaldo;
      throw new Error('No se guardó nada: después del cambio las cuentas no cerraban. Contale esto a quien hizo el sistema.');
    }
    BG.auditar('ventas', 'Compra pasada a otra clienta', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · de ' + reg.deNombre + ' a ' + reg.aNombre + ' · ' + reg.motivo + ' · total ' + gs(v.total)
      + ' · debe ' + gs(BG.saldoVenta(v)));
    BG.guardar();
    return reg;
  };

  /* ── Cobranza: avisar lo que debe ──────────────────────────────────────── */

  /** Anota que se le mandó un recordatorio de cobro por WhatsApp (quién, cuándo y cuánto debía). No mueve plata. */
  BG.registrarRecordatorio = (clienteId) => {
    if (!BG.puede('registrarCobros')) throw new Error('Tu usuario no puede registrar cobros.');
    const c = BG.cliente(clienteId);
    if (!c) throw new Error('No encontramos a esa clienta.');
    const saldo = BG.saldoCliente(clienteId);
    if (!(saldo > 0)) throw new Error(c.nombre.split(' ')[0] + ' no debe nada: no hace falta recordarle.');
    const r = { id: BG.uid('rc'), clienteId: clienteId, fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, monto: saldo, medio: 'WhatsApp' };
    (BG.db.recordatorios || (BG.db.recordatorios = [])).push(r);
    BG.auditar('cobranza', 'Recordatorio de cobro', c.nombre + ' · debía ' + gs(saldo) + ' · por WhatsApp');
    BG.guardar();
    return r;
  };

  /* ── Apartados: guardarle un artículo a una clienta con seña y fecha límite ── */

  const MAX_DIAS_APARTADO = 120;
  /**
   * Aparta artículos para una clienta. No mueve plata por sí solo: la seña (si hay) es una seña común, que queda como saldo a
   * favor de la clienta y se usa sola cuando se le vende lo apartado. Lo apartado no se le puede vender a otra (BG.vendibles).
   * d = { clienteId, items: [{ productoId, cantidad }], vence (fecha límite), sena: { forma, monto } | null, nota }
   */
  BG.apartar = (d) => {
    if (!BG.puede('registrarVentas')) throw new Error('Tu usuario no puede apartar artículos.');
    const cli = BG.cliente(d.clienteId);
    if (!cli) throw new Error('Elegí la clienta.');
    const lista = (d.items || []).filter((x) => x && x.productoId);
    if (!lista.length) throw new Error('Elegí al menos un artículo para apartar.');
    const pedidas = new Map();
    const items = lista.map((x) => {
      const p = BG.producto(x.productoId);
      const n = Math.round(Number(x.cantidad));
      if (!p || p.archivado) throw new Error('No encontramos uno de los artículos: volvé a elegirlo.');
      if (!(n >= 1)) throw new Error('Revisá la cantidad de «' + p.descripcion + '».');
      pedidas.set(p.id, (pedidas.get(p.id) || 0) + n);
      return { productoId: p.id, descripcion: p.descripcion, cantidad: n };
    });
    pedidas.forEach((n, pid) => {
      const p = BG.producto(pid);
      const q = BG.vendibles(p);
      if (q < n) throw new Error('De «' + p.descripcion + '» ' + (q <= 0 ? 'no queda nada para apartar' : q === 1 ? 'queda 1' : 'quedan ' + q) + (BG.reservadas(pid) ? ' (' + BG.reservadas(pid) + ' ya están apartadas)' : '') + ': no alcanza para ' + n + '.');
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vence || '')) throw new Error('Elegí hasta cuándo se lo guardás.');
    if (d.vence < BG.hoy()) throw new Error('La fecha límite no puede ser anterior a hoy.');
    if (d.vence > BG.sumarDias(BG.hoy(), MAX_DIAS_APARTADO)) throw new Error('Un apartado no puede durar más de ' + MAX_DIAS_APARTADO + ' días: si hace falta más, se renueva.');
    const monto = d.sena ? Math.round(Number(d.sena.monto)) : 0;
    if (d.sena && d.sena.monto !== '' && d.sena.monto != null && !(monto >= 0)) throw new Error('Revisá el monto de la seña.');
    if (monto > 0) {
      if (!BG.puede('registrarCobros')) throw new Error('Tu usuario no puede cobrar: anotá el apartado sin seña y que la cobre quien pueda.');
      if (!BG.FORMAS[d.sena.forma] || d.sena.forma === 'saldo') throw new Error('Elegí cómo pagó la seña.');
    }
    const r = { id: BG.uid('rs'), clienteId: cli.id, fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, vence: d.vence, items: items, sena: null, nota: limpiar(d.nota), estado: 'activa', cerrada: null };
    (BG.db.reservas || (BG.db.reservas = [])).push(r);
    if (monto > 0) {
      try {
        const cobro = BG.registrarCobro({ clienteId: cli.id, destino: 'sena', fecha: BG.hoy(), partes: [{ forma: d.sena.forma, monto: monto }] });
        r.sena = { pagoId: cobro.pagos[0].id, monto: monto, recibo: cobro.recibo };
      } catch (e) {
        BG.db.reservas.pop();   // si la seña no se pudo cobrar, no queda un apartado a medias
        throw e;
      }
    }
    BG.auditar('apartados', 'Artículo apartado', cli.nombre + ' · ' + items.map((x) => x.cantidad + ' × ' + x.descripcion).join(', ') + ' · hasta el ' + BG.fmtFecha(r.vence)
      + (r.sena ? ' · seña ' + gs(r.sena.monto) : ' · sin seña'));
    BG.guardar();
    return r;
  };
  /** Da más tiempo (o menos) a un apartado vivo. */
  BG.cambiarVenceApartado = (id, vence) => {
    if (!BG.puede('registrarVentas')) throw new Error('Tu usuario no puede registrar ventas.');
    const r = BG.reserva(id);
    if (!r || r.estado !== 'activa') throw new Error('Ese apartado ya no está activo.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence || '') || vence < BG.hoy()) throw new Error('La fecha límite no puede ser anterior a hoy.');
    if (vence > BG.sumarDias(BG.hoy(), MAX_DIAS_APARTADO)) throw new Error('Un apartado no puede durar más de ' + MAX_DIAS_APARTADO + ' días desde hoy.');
    const antes = r.vence;
    r.vence = vence;
    BG.auditar('apartados', 'Apartado: nueva fecha límite', BG.cliente(r.clienteId).nombre + ' · ' + BG.fmtFecha(antes) + ' → ' + BG.fmtFecha(vence));
    BG.guardar();
    return r;
  };
  /** Libera lo apartado (vuelve a poder venderse). La seña, si hubo, sigue siendo saldo a favor de la clienta. */
  BG.liberarApartado = (id, motivo) => {
    if (!BG.puede('registrarVentas')) throw new Error('Tu usuario no puede registrar ventas.');
    const r = BG.reserva(id);
    if (!r || r.estado !== 'activa') throw new Error('Ese apartado ya no está activo.');
    const texto = limpiar(motivo);
    if (texto.length < 3) throw new Error('Contá por qué se libera (queda en el historial).');
    r.estado = 'liberada';
    r.cerrada = { fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, motivo: texto };
    BG.auditar('apartados', 'Apartado liberado', BG.cliente(r.clienteId).nombre + ' · ' + r.items.map((x) => x.cantidad + ' × ' + x.descripcion).join(', ') + ' · ' + texto
      + (r.sena ? ' · la seña de ' + gs(r.sena.monto) + ' queda a favor de la clienta' : ''));
    BG.guardar();
    return r;
  };

  /* ── Lo que las clientas pidieron y no había ─────────────────────────────── */

  /** Anota un pedido: «busca botas negras, talle 38». Con una clienta de la lista o solo con un nombre. */
  BG.anotarDeseo = (d) => {
    if (!BG.puede('registrarVentas') && !BG.puede('editarClientes')) throw new Error('Tu usuario no puede anotar pedidos.');
    const cli = d.clienteId ? BG.cliente(d.clienteId) : null;
    if (d.clienteId && !cli) throw new Error('No encontramos a esa clienta.');
    const nombre = cli ? cli.nombre : limpiar(d.nombre);
    if (!cli && nombre.length < 2) throw new Error('Escribí el nombre de quien lo pidió (o elegí una clienta).');
    const texto = limpiar(d.texto);
    if (texto.length < 3) throw new Error('Escribí qué buscaba (por ejemplo «botas negras»).');
    const x = { id: BG.uid('ds'), clienteId: cli ? cli.id : null, nombre: nombre, texto: texto, detalle: limpiar(d.detalle), fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, estado: 'pendiente', avisada: null, cerrada: null };
    (BG.db.deseos || (BG.db.deseos = [])).push(x);
    BG.auditar('deseos', 'Pedido anotado', nombre + ' · ' + texto + (x.detalle ? ' (' + x.detalle + ')' : ''));
    BG.guardar();
    return x;
  };
  /** Marca que ya se le avisó que llegó (queda cuándo y quién). Sigue pendiente hasta cerrarlo. */
  BG.avisarDeseo = (id) => {
    if (!BG.puede('registrarVentas') && !BG.puede('editarClientes')) throw new Error('Tu usuario no puede anotar pedidos.');
    const x = (BG.db.deseos || []).find((y) => y.id === id);
    if (!x || (x.estado !== 'pendiente' && x.estado !== 'avisada')) throw new Error('Ese pedido ya está cerrado.');
    x.estado = 'avisada';
    x.avisada = { fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre };
    BG.auditar('deseos', 'Pedido: se le avisó', x.nombre + ' · ' + x.texto);
    BG.guardar();
    return x;
  };
  /** Cierra un pedido: 'resuelta' (lo compró o lo consiguió) o 'descartada' (ya no lo quiere). Nada se borra. */
  BG.cerrarDeseo = (id, resultado, nota) => {
    if (!BG.puede('registrarVentas') && !BG.puede('editarClientes')) throw new Error('Tu usuario no puede anotar pedidos.');
    const x = (BG.db.deseos || []).find((y) => y.id === id);
    if (!x || (x.estado !== 'pendiente' && x.estado !== 'avisada')) throw new Error('Ese pedido ya está cerrado.');
    if (resultado !== 'resuelta' && resultado !== 'descartada') throw new Error('Elegí cómo se cierra.');
    x.estado = resultado;
    x.cerrada = { fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, nota: limpiar(nota) };
    BG.auditar('deseos', resultado === 'resuelta' ? 'Pedido resuelto' : 'Pedido descartado', x.nombre + ' · ' + x.texto + (x.cerrada.nota ? ' · ' + x.cerrada.nota : ''));
    BG.guardar();
    return x;
  };

  /* ── Resumen del día: a qué WhatsApp le llega al dueño ─────────────────── */

  BG.guardarResumenConfig = (d) => {
    soloDuenio('elegir el WhatsApp del resumen del día');
    const tel = limpiar(d.telefono);
    if (tel && BG.soloDigitos(tel).length < 6) throw new Error('Escribí el número completo, por ejemplo 0981 123 456.');
    BG.db.config.resumen = Object.assign({}, BG.db.config.resumen, { telefono: tel });
    BG.auditar('parametros', 'WhatsApp del resumen del día', tel ? 'Se manda a ' + tel : 'Sin número: se elige el chat al mandar');
    BG.guardar();
    return tel;
  };

  /* ── Compras de antes del sistema (la libreta de lo que llevó antes) ─── */

  /**
   * Anota en la cuenta de una clienta lo que llevó antes de que existiera el sistema: con su fecha, lo que
   * llevó y lo que ya pagó. Es una compra más para la plata (si quedó debiendo, lo debe), pero no mueve el
   * stock (no son artículos del stock), no tiene costo cargado y no entra en la caja, los reportes ni la
   * ganancia de ningún período. Tampoco suma puntos sola: si el dueño quiere, los suma aparte.
   * Se puede anotar con el detalle (`items`) o, si no se sabe qué llevó pero sí cuánto, solo con el monto (`monto`): queda un solo
   * renglón «Compra de antes del sistema» (`anterior.sinDetalle`) y lo que se le manda a la clienta no dice qué era.
   * d = { clienteId, fecha, items: [{ descripcion, cantidad, precio }] | monto, pagado, nota }
   */
  BG.registrarCompraAnterior = (d) => {
    soloDuenio('cargar compras de antes del sistema');
    const cli = BG.cliente(d.clienteId);
    if (!cli) throw new Error('Elegí la clienta.');
    if (!d.fecha || d.fecha > BG.hoy()) throw new Error('La fecha no puede ser futura.');
    let items = (d.items || []).map((x) => ({ descripcion: limpiar(x.descripcion), cantidad: Math.round(Number(x.cantidad)), precio: Math.round(Number(x.precio)) }))
      .filter((x) => x.descripcion || x.precio > 0);
    let sinDetalle = false;
    if (!items.length) {
      const monto = Math.round(Number(d.monto));
      if (!(monto > 0)) throw new Error('Anotá cuánto llevó (el monto total) o, si lo tenés, qué llevó con su precio.');
      items = [{ descripcion: 'Compra de antes del sistema', cantidad: 1, precio: monto }];
      sinDetalle = true;
    }
    for (const x of sinDetalle ? [] : items) {
      if (!x.descripcion) throw new Error('A un artículo le falta qué era (por ejemplo «Vestido floreado»).');
      if (!(x.cantidad >= 1)) throw new Error('Revisá la cantidad de «' + x.descripcion + '».');
      if (!(x.precio > 0)) throw new Error('Falta el precio de «' + x.descripcion + '».');
    }
    const t = C.totalesVenta(items, null);
    const pagado = Math.round(Number(d.pagado) || 0);
    if (pagado < 0) throw new Error('Lo que pagó no puede ser negativo.');
    if (pagado > t.total) throw new Error('Anotaste que pagó ' + gs(pagado) + ' y lo que llevó suma ' + gs(t.total) + '. Si le quedó plata a favor, cargá esto con lo justo y la seña aparte con «Registrar cobro».');
    const quien = BG.usuario().nombre;
    const recibo = BG.nuevoRecibo();
    // Se ordena en su fecha (no en la de hoy): en la cuenta aparece antes que lo que compró con el sistema.
    const ts = d.fecha + 'T00:00';
    const v = {
      id: BG.uid('v'), recibo: recibo, clienteId: cli.id, fecha: d.fecha, ts: ts,
      items: items.map((x) => ({ productoId: null, descripcion: x.descripcion, cantidad: x.cantidad, precio: x.precio, costoUnitGs: null, margen: null, precioLista: null, especial: null })),
      descuento: { tipo: 'monto', valor: 0, monto: 0, motivo: null, nota: '' }, subtotal: t.subtotal, total: t.total,
      anulada: null, usuario: quien, autorizadoPor: null, ajustes: [], devoluciones: [], aFavor: 0, plan: null, fidelidad: null, creditoAutorizado: null,
      anterior: Object.assign({ ts: BG.ahora(), usuario: quien, nota: limpiar(d.nota) }, sinDetalle ? { sinDetalle: true } : {}),
    };
    BG.db.ventas.push(v);
    let pago = null;
    if (pagado > 0) {
      pago = nuevoPago({ ventaId: v.id, clienteId: cli.id, fecha: d.fecha, partes: [{ forma: 'efectivo', monto: pagado }], total: pagado, excedente: 0, recibo: recibo, inicial: true });
      pago.ts = d.fecha + 'T00:01';
      pago.anterior = true;   // ya estaba pagado antes del sistema: no entra en la caja de ningún día
    }
    BG.auditar('ventas', 'Compra anterior al sistema', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · del ' + BG.fmtFecha(d.fecha) + ' · '
      + (sinDetalle ? 'solo el monto (sin detalle de lo que llevó)' : items.map((x) => x.cantidad + ' × ' + x.descripcion).join(', ')) + ' · total ' + gs(t.total) + ' · ya pagado ' + gs(pagado)
      + (t.total > pagado ? ' · debe ' + gs(t.total - pagado) : ' · saldada') + (v.anterior.nota ? ' · ' + v.anterior.nota : ''));
    BG.guardar();
    return { venta: v, pago: pago };
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
    if (v.anterior) throw new Error('Es una compra de antes del sistema: no tiene artículos del stock para devolver. Si hay que cambiarla, corregí la compra.');
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
      if (BG.vendibles(nuevo, v.clienteId) < n) throw new Error('Solo quedan ' + BG.vendibles(nuevo, v.clienteId) + ' de «' + nuevo.descripcion + '» para vender.');
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
        // De lo que vuelve a favor, primero es lo que se había pagado con puntos (eso no se devuelve en plata).
        const canjeAntes = BG.canjeAplicado(v);
        v.aFavor = (v.aFavor || 0) + sobra;
        reg.aFavor = sobra;
        reg.deCanje = canjeAntes - BG.canjeAplicado(v);
        credito(v.clienteId, sobra, (d.tipo === 'cambio' ? 'Cambio' : 'Devolución') + ' en la compra ' + BG.fmtRecibo(v.recibo), { ventaId: v.id, devolucionId: reg.id });
      }
    }
    (v.devoluciones || (v.devoluciones = [])).push(reg);
    const que = d.tipo === 'talle' ? 'Cambio de talle: ' + n + ' × ' + it.descripcion + ' (' + reg.talle + ')'
      : d.tipo === 'cambio' ? 'Cambio: ' + n + ' × ' + it.descripcion + ' por ' + n + ' × ' + nuevo.descripcion
        : 'Devolución: ' + n + ' × ' + it.descripcion;
    BG.auditar('devoluciones', BG.TIPOS_DEVOLUCION[d.tipo], 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · ' + que + textoMotivo(reg.motivo, reg.nota)
      + (reg.totalAntes !== reg.totalDespues ? ' · total ' + gs(reg.totalAntes) + ' → ' + gs(reg.totalDespues) : '') + (reg.aFavor ? ' · ' + gs(reg.aFavor) + ' a saldo a favor' : ''));
    const enPlataMonto = reg.aFavor - (reg.deCanje || 0);
    if (enPlataMonto > 0 && enPlata) {
      reintegrar(v.clienteId, enPlataMonto, d.destino, 'Devolución de la compra ' + BG.fmtRecibo(v.recibo), { devolucionId: reg.id, autorizadoPor: d.autorizadoPor || null });
      reg.reintegro = enPlataMonto;
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

  /**
   * Cuántos puntos hacen falta para cubrir `monto` (redondeando para arriba, sin pasar de los que tiene y
   * nunca por debajo del mínimo de canje). Sirve para canjear solo lo que cubre una compra.
   */
  BG.puntosParaMonto = (clienteId, monto) => {
    const f = BG.configFidelidad();
    const pts = BG.puntosDe(clienteId);
    if (!pts || !pts.canjeable || !(f.valorPunto > 0)) return 0;
    const justos = Math.ceil(Math.max(0, Math.round(monto)) / f.valorPunto);
    return Math.min(pts.puntos, Math.max(f.minimo, justos));
  };
  /**
   * Canjea puntos: se acreditan como saldo a favor (y cuentan como gasto de beneficios en la ganancia neta).
   * Sin `puntos` canjea todos los disponibles; con `puntos` canjea esa cantidad (nunca menos que el mínimo del
   * programa ni más de los que tiene). El valor sale de `valorPunto`: 1 punto = valorPunto guaraníes, exacto.
   */
  BG.canjearPuntos = (clienteId, puntos) => {
    const f = BG.configFidelidad();
    const pts = BG.puntosDe(clienteId);
    if (!pts || !pts.canjeable) throw new Error('Todavía no tiene los ' + f.minimo + ' puntos para canjear.');
    const n = puntos == null ? pts.puntos : Math.round(Number(puntos));
    if (!(n > 0)) throw new Error('Escribí cuántos puntos canjea.');
    if (n < f.minimo) throw new Error('El canje más chico es de ' + f.minimo + ' puntos (' + gs(f.minimo * f.valorPunto) + ').');
    if (n > pts.puntos) throw new Error('Tiene ' + pts.puntos + (pts.puntos === 1 ? ' punto' : ' puntos') + ': no se pueden canjear ' + n + '.');
    const cli = BG.cliente(clienteId);
    const k = { id: BG.uid('cj'), clienteId: clienteId, fecha: BG.hoy(), ts: BG.ahora(), puntos: n, monto: n * f.valorPunto, valorPunto: f.valorPunto, usuario: BG.usuario().nombre };
    (BG.db.canjes || (BG.db.canjes = [])).push(k);
    credito(clienteId, k.monto, 'Canje de ' + k.puntos + ' puntos', { canjeId: k.id });
    BG.auditar('fidelidad', 'Canje de puntos', cli.nombre + ' · ' + k.puntos + ' puntos = ' + gs(k.monto) + ' de saldo a favor'
      + (n < pts.puntos ? ' · le quedan ' + (pts.puntos - n) + (pts.puntos - n === 1 ? ' punto' : ' puntos') : ''));
    BG.guardar();
    return k;
  };
  /**
   * Suma los puntos de compras que no sumaban solas (de antes de que empezara el programa, o anteriores al
   * sistema): el dueño elige cuáles, de una clienta. Cada compra queda marcada (`puntosAparte`, con quién y
   * cuándo) y con la regla de puntos de hoy congelada. Los puntos se calculan con la fórmula de siempre: si la
   * compra ya está pagada se pueden usar enseguida; si debe, se suman al terminar de pagar.
   */
  BG.sumarPuntosAparte = (ventaIds, motivo) => {
    soloDuenio('sumar puntos de compras anteriores');
    const f = BG.configFidelidad();
    if (!f.activo) throw new Error('El programa de puntos está apagado: se prende en Ajustes → Clientas frecuentes.');
    const ventas = (ventaIds || []).map((id) => BG.venta(id)).filter(Boolean);
    if (!ventas.length) throw new Error('Elegí al menos una compra.');
    const cid = ventas[0].clienteId;
    for (const v of ventas) {
      if (v.clienteId !== cid) throw new Error('Las compras tienen que ser de la misma clienta.');
      if (v.anulada) throw new Error('La compra ' + BG.fmtRecibo(v.recibo) + ' está anulada: no suma puntos.');
      if (BG.ventaSumaPuntos(v)) throw new Error('La compra ' + BG.fmtRecibo(v.recibo) + ' ya suma puntos.');
    }
    const quien = BG.usuario().nombre;
    let ganados = 0;
    let pendientes = 0;
    const detalle = [];
    for (const v of ventas) {
      v.puntosAparte = { fecha: BG.hoy(), ts: BG.ahora(), usuario: quien, motivo: limpiar(motivo) };
      if (!v.fidelidad) v.fidelidad = { cadaGs: f.cadaGs, valorPunto: f.valorPunto };
      const n = BG.puntosDeVenta(v);
      if (BG.saldoVenta(v) <= 0) ganados += n; else pendientes += n;
      detalle.push(BG.fmtRecibo(v.recibo) + ' del ' + BG.fmtFecha(v.fecha) + ' (' + n + ')');
    }
    BG.auditar('fidelidad', 'Puntos de compras anteriores', BG.cliente(cid).nombre + ' · ' + detalle.join(', ') + ' · ' + ganados + ' puntos ya disponibles'
      + (pendientes ? ' y ' + pendientes + ' al terminar de pagar' : '') + (limpiar(motivo) ? ' · ' + limpiar(motivo) : ''));
    BG.guardar();
    return { ganados: ganados, pendientes: pendientes, compras: ventas.length };
  };
  /** Deshace lo de arriba para una compra, salvo que esos puntos ya se hayan canjeado. */
  BG.quitarPuntosAparte = (ventaId) => {
    soloDuenio('quitar puntos de compras anteriores');
    const v = BG.venta(ventaId);
    if (!v || !v.puntosAparte) throw new Error('Esa compra no tiene puntos sumados a mano.');
    const n = BG.puntosGanadosDeVenta(v);
    const p = BG.puntosDe(v.clienteId);
    if (n > 0 && p && p.ganados - n < p.canjeados) {
      throw new Error('No se puede: ' + (p.puntos === 0 ? 'ya usó todos sus puntos' : 'le quedan ' + p.puntos + ' y esta compra dio ' + n) + ' (los canjeó). Lo canjeado no se deshace.');
    }
    v.puntosAparte = null;
    BG.auditar('fidelidad', 'Puntos de compras anteriores quitados', BG.cliente(v.clienteId).nombre + ' · compra ' + BG.fmtRecibo(v.recibo) + ' del ' + BG.fmtFecha(v.fecha) + ' · ' + n + ' puntos menos');
    BG.guardar();
    return n;
  };
  /**
   * El dueño le da puntos a una clienta sin que haya comprado nada (de 10 en 10). Es una acción delicada: los puntos valen plata
   * cuando se canjean. Solo el dueño, con el programa prendido, con un motivo de la lista (`BG.MOTIVOS_PUNTOS`; «Otro» pide
   * contar qué pasó) y queda con su nombre, la fecha y el motivo, en la ficha, en el comprobante de puntos y en la auditoría.
   * d = { clienteId, puntos, motivo, nota }
   */
  BG.darPuntos = (d) => {
    soloDuenio('darle puntos a una clienta sin una compra');
    const f = BG.configFidelidad();
    if (!f.activo) throw new Error('El programa de puntos está apagado: se prende en Ajustes → Clientas frecuentes.');
    const cli = BG.cliente(d.clienteId);
    if (!cli) throw new Error('Elegí la clienta.');
    const n = d.puntos;
    if (!Number.isInteger(n) || n < BG.PUNTOS_PASO || n % BG.PUNTOS_PASO !== 0) throw new Error('Los puntos se dan de ' + BG.PUNTOS_PASO + ' en ' + BG.PUNTOS_PASO + ' (' + BG.PUNTOS_PASO + ', ' + (2 * BG.PUNTOS_PASO) + ', ' + (3 * BG.PUNTOS_PASO) + '…).');
    if (n > BG.PUNTOS_MANUAL_MAX) throw new Error('De una vez se pueden dar hasta ' + BG.PUNTOS_MANUAL_MAX + ' puntos (' + gs(BG.PUNTOS_MANUAL_MAX * f.valorPunto) + '). Para más, hacelo en dos veces.');
    if (BG.MOTIVOS_PUNTOS.indexOf(d.motivo) < 0) throw new Error('Elegí por qué se le dan los puntos.');
    const nota = limpiar(d.nota);
    if (d.motivo === 'Otro' && nota.length < 5) throw new Error('Contá por qué se le dan en «Detalle» (queda en el historial).');
    const x = { id: BG.uid('pm'), clienteId: cli.id, puntos: n, fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, motivo: d.motivo, nota: nota, anulado: null };
    (BG.db.puntosManuales || (BG.db.puntosManuales = [])).push(x);
    BG.auditar('fidelidad', 'Puntos dados a mano', cli.nombre + ' · ' + n + ' puntos (valen ' + gs(n * f.valorPunto) + ') sin una compra · ' + d.motivo + (nota ? ' · ' + nota : ''));
    BG.guardar();
    return x;
  };
  /** Anula puntos dados a mano (nada se borra). No se puede si la clienta ya canjeó puntos que quedarían sin respaldo. */
  BG.quitarPuntosManuales = (id, motivo) => {
    soloDuenio('quitar puntos dados a mano');
    const x = (BG.db.puntosManuales || []).find((y) => y.id === id);
    if (!x || x.anulado) throw new Error('Esos puntos ya no están.');
    const texto = limpiar(motivo);
    if (texto.length < 3) throw new Error('Contá por qué se quitan (queda en el historial).');
    const p = BG.puntosDe(x.clienteId);
    if (p && p.ganados - x.puntos < p.canjeados) {
      throw new Error('No se puede: ' + (p.puntos === 0 ? 'ya usó todos sus puntos' : 'le quedan ' + p.puntos + ' y estos son ' + x.puntos) + ' (los canjeó). Lo canjeado no se deshace.');
    }
    x.anulado = { fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, motivo: texto };
    BG.auditar('fidelidad', 'Puntos dados a mano quitados', BG.cliente(x.clienteId).nombre + ' · ' + x.puntos + ' puntos del ' + BG.fmtFecha(x.fecha) + ' · ' + texto);
    BG.guardar();
    return x;
  };
  BG.guardarFidelidad = (datos) => {
    soloDuenio('cambiar el programa de clientas frecuentes');
    const antes = BG.configFidelidad();
    // Antes de cambiar la regla, se le deja escrita a cada venta la que tenía: lo que una clienta ya ganó
    // no puede moverse porque hoy se cambie el programa (vale también para las ventas viejas o importadas).
    if (antes.activo && (('cadaGs' in datos && datos.cadaGs !== antes.cadaGs) || ('valorPunto' in datos && datos.valorPunto !== antes.valorPunto))) {
      BG.db.ventas.forEach((v) => {
        if (!v.fidelidad && !v.anulada && v.fecha >= antes.desde) v.fidelidad = { cadaGs: antes.cadaGs, valorPunto: antes.valorPunto };
      });
    }
    // Si las condiciones siguen siendo el texto sugerido del modo anterior, pasan al del modo nuevo (las que escribió él no se tocan).
    if ('porPago' in datos && !!datos.porPago !== !!antes.porPago && !('terminos' in datos) && (antes.terminos === BG.terminosPuntosSugeridos(antes.porPago) || BG.TERMINOS_PUNTOS_VIEJOS.indexOf(antes.terminos) >= 0)) {
      datos = Object.assign({}, datos, { terminos: BG.terminosPuntosSugeridos(!!datos.porPago) });
    }
    const f = Object.assign(BG.configFidelidad(), datos);
    if (datos.cumple) f.cumple = Object.assign({}, BG.configFidelidad().cumple, datos.cumple);
    BG.db.config.fidelidad = f;
    BG.auditar('fidelidad', 'Programa de clientas frecuentes', f.activo ? '1 punto cada ' + gs(f.cadaGs) + ' · cada punto ' + gs(f.valorPunto) + ' · canje desde ' + f.minimo + ' puntos'
      + (f.cumple.activo ? ' · cumpleaños ' + f.cumple.porcentaje + ' %' : ' · sin regalo de cumpleaños')
      + (f.porPago ? ' · los puntos se suman con cada pago' : ' · los puntos se suman al terminar de pagar la compra')
      + (f.enRecibo ? ' · los puntos se imprimen en el recibo' : ' · los puntos NO se imprimen en el recibo') : 'Desactivado');
    BG.guardar();
  };
  /* ── Términos y condiciones de los comprobantes (los edita el dueño) ── */

  const MAX_TERMINO = 1200;
  /** Agrega o cambia un término. d = { id?, titulo, texto, activo, donde }. Queda en la auditoría con el texto. */
  BG.guardarTermino = (d) => {
    soloDuenio('editar los términos y condiciones');
    const titulo = limpiar(d.titulo);
    const texto = String(d.texto == null ? '' : d.texto).trim().replace(/[ \t]+/g, ' ');
    if (titulo.length < 3) throw new Error('Escribí el título (por ejemplo «Cambios y devoluciones»).');
    if (titulo.length > 60) throw new Error('El título es muy largo: hasta 60 letras.');
    if (texto.length < 10) throw new Error('Escribí el texto: es lo que va a leer la clienta en el comprobante.');
    if (texto.length > MAX_TERMINO) throw new Error('El texto es muy largo (' + texto.length + ' letras): hasta ' + MAX_TERMINO + ' para que el comprobante no se haga enorme.');
    if (!BG.DONDE_TERMINOS[d.donde]) throw new Error('Elegí en qué comprobantes sale.');
    const lista = (BG.db.config.terminos || (BG.db.config.terminos = []));
    let t = d.id ? lista.find((x) => x.id === d.id) : null;
    if (d.id && !t) throw new Error('No encontramos ese texto: puede que ya lo hayas quitado.');
    if (!t) { t = { id: BG.uid('tc') }; lista.push(t); }
    const era = t.titulo ? Object.assign({}, t) : null;
    Object.assign(t, { titulo: titulo, texto: texto, donde: d.donde, activo: !!d.activo });
    BG.auditar('parametros', era ? 'Términos y condiciones cambiados' : 'Términos y condiciones agregados', '«' + titulo + '» · ' + (t.activo ? 'sale' : 'no sale') + ' · ' + BG.DONDE_TERMINOS[t.donde].toLowerCase()
      + ' · ' + texto + (era && era.texto !== texto ? ' (antes: ' + era.texto + ')' : ''));
    BG.guardar();
    return t;
  };
  BG.quitarTermino = (id) => {
    soloDuenio('quitar términos y condiciones');
    const lista = BG.db.config.terminos || [];
    const i = lista.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Ese texto ya no está.');
    const [t] = lista.splice(i, 1);
    BG.auditar('parametros', 'Términos y condiciones quitados', '«' + t.titulo + '» · ' + t.texto);
    BG.guardar();
    return t;
  };
  /** Sube (−1) o baja (+1) un término en el orden en que salen. */
  BG.moverTermino = (id, delta) => {
    soloDuenio('ordenar los términos y condiciones');
    const lista = BG.db.config.terminos || [];
    const i = lista.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return false;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    BG.guardar();
    return true;
  };
  /** El tamaño estándar de los comprobantes de un formato ('a4' o 'ticket'), en porcentaje. Solo el dueño. */
  BG.guardarTamanoRecibo = (formato, porcentaje) => {
    soloDuenio('dejar el tamaño estándar de los comprobantes');
    if (formato !== 'a4' && formato !== 'ticket') throw new Error('Elegí si es para la hoja A4 o para el ticket.');
    const n = Math.round(Number(porcentaje));
    if (!(n >= BG.TAMANO_MIN && n <= BG.TAMANO_MAX)) throw new Error('El tamaño tiene que estar entre ' + BG.TAMANO_MIN + ' y ' + BG.TAMANO_MAX + ' %.');
    const antes = BG.tamanoRecibo(formato);
    BG.db.config.recibo = Object.assign({}, BG.db.config.recibo, { tamano: Object.assign({}, (BG.db.config.recibo || {}).tamano, { [formato]: n }) });
    BG.auditar('parametros', 'Tamaño de los comprobantes', (formato === 'ticket' ? 'Ticket 80 mm' : 'Hoja A4') + ': ' + antes + ' % → ' + n + ' %');
    BG.guardar();
    return n;
  };
  /** Mostrar u ocultar de las listas lo anulado y lo cancelado (nada se borra: sigue en el historial y en la auditoría). */
  BG.cambiarVerAnulados = (si) => {
    soloDuenio('cambiar lo que se ve en las listas');
    BG.db.config.vista = Object.assign({}, BG.db.config.vista, { verAnulados: !!si });
    BG.auditar('parametros', 'Listas', si ? 'Se muestran las ventas, pagos, gastos y envíos anulados' : 'Se ocultan de las listas las ventas, pagos, gastos y envíos anulados (siguen en el historial)');
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
  BG.anularGasto = (id, motivo, tipo) => {
    soloDuenio('anular gastos');
    const g = (BG.db.gastos || []).find((x) => x.id === id);
    if (!g || g.anulado) return;
    g.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: limpiar(motivo), tipo: tipo || null, usuario: BG.usuario().nombre };
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

  /* ── Cuenta de ahorro para las compras ───────────────────────────────── */

  const montoEntero = (x) => Math.round(Number(x));
  /**
   * Lo que había al empezar, un depósito o un retiro. d = { tipo: 'inicial'|'deposito'|'retiro', monto, fecha, concepto }
   * La cuenta nunca queda en negativo: si no alcanza, falta cargar un depósito.
   */
  BG.guardarMovimientoAhorro = (d) => {
    soloDuenio('cargar movimientos de la cuenta de ahorro');
    if (['inicial', 'deposito', 'retiro'].indexOf(d.tipo) < 0) throw new Error('Elegí si es un depósito o un retiro.');
    const monto = montoEntero(d.monto);
    if (!(monto > 0)) throw new Error('Escribí el monto.');
    if (!d.fecha || d.fecha > BG.hoy()) throw new Error('La fecha no puede ser futura.');
    const lista = BG.db.ahorro || (BG.db.ahorro = []);
    const inicial = lista.find((m) => m.tipo === 'inicial' && !m.anulado);
    if (d.tipo === 'inicial' && inicial) throw new Error('Lo que había al empezar ya está cargado (' + gs(inicial.monto) + '). Si cambió, cargá un depósito o un retiro.');
    const saldo = BG.saldoAhorro();
    if (d.tipo === 'retiro' && monto > saldo) throw new Error('En la cuenta hay ' + gs(saldo) + ': no alcanza para sacar ' + gs(monto) + '. Si falta anotar un depósito, anotalo primero.');
    const m = {
      id: BG.uid('ah'), fecha: d.fecha, ts: BG.ahora(), usuario: BG.usuario().nombre, tipo: d.tipo, monto: d.tipo === 'retiro' ? -monto : monto,
      concepto: limpiar(d.concepto) || BG.TIPOS_AHORRO[d.tipo], pedidoId: null, anulado: null,
    };
    lista.push(m);
    BG.auditar('ahorro', BG.TIPOS_AHORRO[d.tipo], BG.fmtFecha(m.fecha) + ' · ' + gs(monto) + ' · ' + m.concepto + ' · queda ' + gs(BG.saldoAhorro()));
    BG.guardar();
    return m;
  };
  /** Paga un pedido al proveedor con la cuenta de ahorro (sale de la cuenta). d = { pedidoId, monto, fecha, nota } */
  BG.pagarPedido = (d) => {
    soloDuenio('pagar pedidos desde la cuenta de ahorro');
    const p = (BG.db.pedidos || []).find((x) => x.id === d.pedidoId);
    if (!p) throw new Error('No encontramos ese pedido.');
    if (BG.estadoPedido(p) === 'cancelado') throw new Error('Ese pedido está cancelado.');
    const monto = montoEntero(d.monto);
    if (!(monto > 0)) throw new Error('Escribí cuánto salió de la cuenta.');
    if (!d.fecha || d.fecha > BG.hoy()) throw new Error('La fecha no puede ser futura.');
    const saldo = BG.saldoAhorro();
    if (monto > saldo) throw new Error('En la cuenta de ahorro hay ' + gs(saldo) + ': no alcanza para ' + gs(monto) + '. Si una parte la pagaste con otra plata, anotá solo lo que salió de la cuenta.');
    const m = {
      id: BG.uid('ah'), fecha: d.fecha, ts: BG.ahora(), usuario: BG.usuario().nombre, tipo: 'pedido', monto: -monto,
      concepto: 'Pedido a ' + p.proveedor + (limpiar(d.nota) ? ' · ' + limpiar(d.nota) : ''), pedidoId: p.id, anulado: null,
    };
    (BG.db.ahorro || (BG.db.ahorro = [])).push(m);
    BG.auditar('ahorro', 'Pago de un pedido', textoPedido(p) + ' · ' + gs(monto) + ' de la cuenta de ahorro · queda ' + gs(BG.saldoAhorro()));
    BG.guardar();
    return m;
  };
  /** Nada se borra: un movimiento mal cargado se anula con motivo. Un depósito que ya se usó no se puede anular. */
  BG.anularMovimientoAhorro = (id, motivo, tipo) => {
    soloDuenio('anular movimientos de la cuenta de ahorro');
    const m = (BG.db.ahorro || []).find((x) => x.id === id);
    if (!m) throw new Error('No encontramos ese movimiento.');
    if (m.anulado) throw new Error('Ese movimiento ya está anulado.');
    const queda = BG.saldoAhorro() - m.monto;
    if (queda < 0) throw new Error('No se puede anular: esa plata ya salió de la cuenta (quedaría en −' + gs(-queda) + '). Anulá primero el retiro o el pago que la usó.');
    m.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: limpiar(motivo), tipo: tipo || null, usuario: BG.usuario().nombre };
    BG.auditar('ahorro', 'Movimiento anulado', BG.fmtFecha(m.fecha) + ' · ' + m.concepto + ' · ' + gs(Math.abs(m.monto)) + ' · motivo: ' + m.anulado.motivo + ' · queda ' + gs(BG.saldoAhorro()));
    BG.guardar();
  };

  /* ── Anulaciones (nunca se borra nada) ───────────────────────────────── */

  const soloDuenio = (que) => { if (!BG.esDuena()) throw new Error('Solo ' + BG.nombreDuena() + ' (dueño) puede ' + que + '.'); };

  BG.cambiarMargenMinimo = (m) => {
    soloDuenio('cambiar el margen mínimo');
    BG.db.config.precios = Object.assign({}, BG.db.config.precios, { margenMinimo: m });
    BG.auditar('parametros', 'Margen mínimo sin autorización', m + ' % sobre el costo');
    BG.guardar();
  };

  /**
   * Anula una venta. `tipo` es el motivo tipificado (ver BG.MOTIVOS_ANULACION.venta) y `motivo` el texto que
   * queda en el historial. Lo que pasa siempre, sea cual sea el motivo: las unidades vuelven al stock
   * (BG.vendidas no cuenta las ventas anuladas), la venta deja de sumar puntos (BG.puntosDeVenta da 0) y lo
   * que la clienta había pagado queda como saldo a favor.
   */
  BG.anularVenta = (id, motivo, tipo) => {
    soloDuenio('anular ventas');
    const v = BG.venta(id);
    const cli = BG.cliente(v.clienteId);
    const puntos = BG.puntosGanadosDeVenta(v);
    // Una compra anterior al sistema anotada por error: lo que figuraba «pagado antes del sistema» es parte de
    // esa misma anotación, no plata que entró. Se anula con ella (si no, aparecería como saldo a favor).
    if (v.anterior) {
      BG.pagosDeVenta(v.id).filter((p) => p.anterior).forEach((p) => {
        p.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: 'Se anuló la compra anterior ' + BG.fmtRecibo(v.recibo), tipo: tipo || null, usuario: BG.usuario().nombre };
      });
    }
    const pagado = BG.pagadoVenta(v);
    v.anulada = { fecha: BG.hoy(), ts: BG.ahora(), motivo: motivo, tipo: tipo || null, usuario: BG.usuario().nombre, puntosPerdidos: puntos };
    const unidades = sum(v.items, (it) => BG.cantidadViva(it));
    BG.auditar('anulaciones', 'Venta anulada', 'Recibo ' + BG.fmtRecibo(v.recibo) + ' · ' + cli.nombre + ' · motivo: ' + motivo
      + (unidades ? ' · vuelven al stock ' + unidades + (unidades === 1 ? ' unidad' : ' unidades') : '')
      + (puntos ? ' · pierde ' + puntos + (puntos === 1 ? ' punto' : ' puntos') : ''));
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
    // Un pago que sumó sus puntos en el momento: si la clienta ya los canjeó, anularlo dejaría puntos usados sin respaldo.
    if (pg.puntos > 0 && v && BG.configFidelidad().activo) {
      const p = BG.puntosDe(pg.clienteId);
      const pierde = BG.puntosGanadosDeVenta(v) - BG.puntosGanadosSinPago(pg);
      if (p && pierde > 0 && p.ganados - pierde < p.canjeados) {
        return 'Con este pago sumó ' + pg.puntos + (pg.puntos === 1 ? ' punto' : ' puntos') + ' y ya los canjeó: anularlo dejaría puntos usados sin respaldo.';
      }
    }
    return null;
  };

  BG.anularPago = (id, motivo, tipo) => {
    soloDuenio('anular pagos');
    const pg = BG.db.pagos.find((p) => p.id === id);
    const problema = BG.motivoNoAnulable(pg);
    if (problema) throw new Error(problema);
    const cli = BG.cliente(pg.clienteId);
    const r = favorARevertir(pg);
    pg.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: motivo, tipo: tipo || null, usuario: BG.usuario().nombre };
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
      usuario: BG.usuario().nombre,
      costoTotalGs: Number(r.costoTotalGs), envioGs: Number(r.envioGs), productoGs: Number(r.productoGs),
      margen: margen, precioVenta: d.precioManual ? d.precioManual : Number(r.precios.find((x) => x.margen === margen).redondeado),
    };
  }

  BG.guardarProductos = (lista, origen) => {
    if (!BG.esDuena() && !BG.puede('cargarProductos')) throw new Error(BG.nombreDuena() + ' no te habilitó cargar productos.');
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

  /**
   * Borra un artículo que se cargó por error. Solo se puede si nunca se movió (BG.puedeBorrarProducto):
   * sin ventas, sin devoluciones y sin conteos, así ningún número del pasado cambia. Lo que se borró queda
   * escrito en la auditoría con todos sus datos, y si venía de un pedido se lo saca de ese pedido.
   */
  BG.borrarProducto = (id, motivo) => {
    const p = BG.producto(id);
    const puede = BG.puedeBorrarProducto(p);
    if (!puede.ok) throw new Error(puede.razon);
    BG.db.productos = BG.db.productos.filter((x) => x.id !== id);
    for (const ped of BG.db.pedidos || []) {
      if (Array.isArray(ped.productos) && ped.productos.indexOf(id) >= 0) ped.productos = ped.productos.filter((x) => x !== id);
    }
    BG.auditar('productos', 'Artículo borrado', p.codigo + ' · ' + p.descripcion + ' · ' + p.categoria + ' · ' + p.cantidad + (p.cantidad === 1 ? ' unidad' : ' unidades')
      + (p.precioVenta ? ' · precio ' + gs(p.precioVenta) : ' · sin precio') + ' · cargado el ' + BG.fmtFecha(p.fechaCarga) + (p.usuario ? ' por ' + p.usuario : '')
      + (limpiar(motivo) ? ' · motivo: ' + limpiar(motivo) : ''));
    BG.guardar();
    return p;
  };

  /**
   * Archiva (o desarchiva) un artículo: sale de la lista de precios y de las pantallas de venta, pero no se
   * borra nada. Las ventas, los recibos y los reportes viejos quedan exactamente igual.
   */
  BG.archivarProducto = (id, si, motivo) => {
    const p = BG.producto(id);
    const puede = BG.puedeArchivarProducto(p);
    if (si && !puede.ok) throw new Error(puede.razon);
    if (!BG.esDuena()) throw new Error('Archivar artículos lo hace ' + BG.nombreDuena() + '.');
    p.archivado = si ? { fecha: BG.hoy(), ts: BG.ahora(), usuario: BG.usuario().nombre, motivo: limpiar(motivo) } : null;
    BG.auditar('productos', si ? 'Artículo archivado' : 'Artículo desarchivado', p.codigo + ' · ' + p.descripcion
      + (si ? ' · sale de la lista de precios (el historial no se toca)' + (limpiar(motivo) ? ' · ' + limpiar(motivo) : '') : ' · vuelve a la lista de precios'));
    BG.guardar();
    return p;
  };

  BG.actualizarPrecio = (pid, margen, precio, nota) => {
    soloDuenio('cambiar precios');
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
    soloDuenio('cambiar el dólar');
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
    soloDuenio('cambiar la tarifa del courier');
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
    soloDuenio('cambiar el redondeo de los precios');
    BG.db.config.redondeo = { paso: paso, modo: modo };
    BG.auditar('parametros', 'Criterio de redondeo', BG.textoRedondeo(BG.db.config.redondeo));
    BG.guardar();
  };
  BG.cambiarMargenDefecto = (m) => {
    soloDuenio('cambiar el margen preseleccionado');
    BG.db.config.margenDefecto = m;
    BG.auditar('parametros', 'Margen preseleccionado', m + ' %');
    BG.guardar();
  };
  BG.guardarTienda = (datos) => {
    soloDuenio('cambiar los datos de la tienda');
    Object.assign(BG.db.config.tienda, datos);
    BG.auditar('parametros', 'Datos de la tienda', 'Nombre, contacto y mensaje del recibo');
    BG.guardar();
  };
  BG.guardarMarca = (datos) => {
    soloDuenio('cambiar la identidad visual');
    Object.assign(BG.db.config.marca, datos);
    const que = [];
    if ('logo' in datos) que.push(datos.logo ? 'logo nuevo' : 'logo provisorio');
    if ('principal' in datos || 'acento' in datos) que.push('colores');
    if ('logoEscala' in datos) que.push('tamaño del logo ×' + datos.logoEscala);
    if ('fondoCabecera' in datos) que.push(datos.fondoCabecera ? 'encabezado con color' : 'encabezado en blanco');
    BG.auditar('parametros', 'Identidad visual', que.join(' · ') || 'Logo y colores del recibo');
    return BG.guardar();
  };

  /* ── Caja ────────────────────────────────────────────────────────────── */

  BG.cerrarCaja = (fecha, esperado, contado, nota) => {
    if (!BG.puede('verCaja')) throw new Error('Tu usuario no puede cerrar la caja.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || isNaN(new Date(fecha + 'T00:00:00').getTime()) || fecha > BG.hoy()) throw new Error('La fecha del cierre no es válida: no se puede cerrar un día que todavía no pasó.');
    if (!Number.isInteger(esperado) || !Number.isInteger(contado) || contado < 0) throw new Error('El efectivo contado tiene que ser un monto entero en guaraníes.');
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
    BG.db.emisiones.push({ id: BG.uid('em'), ts: BG.ahora(), usuario: BG.usuario().nombre, recibo: d.recibo, ventaId: d.ventaId || null, clienteId: d.clienteId, medio: d.medio, tipo: d.tipo || null });
    const que = d.recibo ? 'Recibo ' + BG.fmtRecibo(d.recibo) : d.tipo === 'puntos' ? 'Comprobante de puntos' : d.tipo === 'anteriores' ? 'Compras de antes del sistema' : 'Estado de cuenta';
    BG.auditar('recibos', d.tipo === 'puntos' ? 'Comprobante de puntos emitido' : 'Recibo emitido', que + ' · ' + (cli ? cli.nombre : '') + ' · por ' + d.medio);
    BG.guardar();
  };
  /** Emisiones de un comprobante: por número de recibo, o —si no tiene— las del cliente de ese mismo tipo. */
  BG.emisionesDe = (recibo, clienteId, tipo) => BG.db.emisiones.filter((e) => (recibo
    ? e.recibo === recibo
    : !e.recibo && e.clienteId === clienteId && (e.tipo || null) === (tipo || null)));

  /* ── Usuarios y permisos ─────────────────────────────────────────────── */

  BG.actualizarPermiso = (usuarioId, permiso, valor) => {
    soloDuenio('cambiar permisos');
    const u = BG.db.usuarios.find((x) => x.id === usuarioId);
    u.permisos = Object.assign({}, u.permisos, { [permiso]: !!valor });
    const etiqueta = (BG.PERMISOS.find((p) => p[0] === permiso) || [permiso, permiso])[1];
    BG.auditar('seguridad', 'Permisos de ' + u.nombre, (valor ? 'Habilitado: ' : 'Quitado: ') + etiqueta);
    BG.guardar();
  };

  /** PIN con el que el dueño autoriza en el mostrador. Nunca se escribe el PIN en la auditoría. */
  BG.cambiarPin = (nuevo) => {
    soloDuenio('cambiar el PIN de autorización');
    const pin = String(nuevo == null ? '' : nuevo).trim();
    if (!/^[0-9]{4,6}$/.test(pin)) throw new Error('El PIN tiene que ser de 4 a 6 números.');
    BG.db.config.pin = pin;
    BG.auditar('seguridad', 'PIN de autorización', 'Cambiado por ' + BG.usuario().nombre + ' (el número no queda registrado)');
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
    if (!BG.puede('prepararEnvios')) throw new Error('Tu usuario no puede preparar envíos.');
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

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
    };
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

  /**
   * Registra una venta con su pago inicial (puede ser cero, parcial, total o mixto).
   * d = { clienteId, fecha, items: [{ productoId, cantidad, precio, margen }], descuento: { tipo, valor },
   *       partes: [{ forma, monto }] (lo que se queda la tienda), usarCredito, excedenteACredito }
   */
  BG.registrarVenta = (d) => {
    const cli = BG.cliente(d.clienteId);
    const items = d.items.map((it) => {
      const p = BG.producto(it.productoId);
      return { productoId: p.id, descripcion: p.descripcion, cantidad: it.cantidad, precio: it.precio, costoUnitGs: p.costoTotalGs, margen: it.margen == null ? null : it.margen };
    });
    const t = C.totalesVenta(items, d.descuento);
    const recibo = BG.nuevoRecibo();
    const v = {
      id: BG.uid('v'), recibo: recibo, clienteId: d.clienteId, fecha: d.fecha, ts: BG.ahora(), items: items,
      descuento: { tipo: d.descuento ? d.descuento.tipo : 'monto', valor: d.descuento ? d.descuento.valor : 0, monto: t.descuento },
      subtotal: t.subtotal, total: t.total, anulada: null, usuario: BG.usuario().nombre,
    };
    BG.db.ventas.push(v);
    BG.auditar('ventas', 'Venta registrada', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + items.length + ' artículo(s) · ' + gs(v.total));

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
    BG.guardar();
    return { venta: v, pago: pago };
  };

  /**
   * Registra un cobro. destino: id de venta, 'todas' (de la más antigua a la más nueva) o 'sena'
   * (anticipo que queda como saldo a favor). Las formas de pago se reparten en orden entre las ventas.
   */
  BG.registrarCobro = (d) => {
    const cli = BG.cliente(d.clienteId);
    const recibo = BG.nuevoRecibo();
    const grupo = BG.uid('g');
    const cola = (d.partes || []).filter((x) => x.monto > 0).map((x) => ({ forma: x.forma, monto: x.monto }));
    const entregado = sum(cola, (x) => x.monto);
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
    BG.auditar('cobros', 'Cobro registrado', 'Recibo ' + BG.fmtRecibo(recibo) + ' · ' + cli.nombre + ' · ' + gs(totalPartes) + ' en ' + pagos.length + ' venta(s)');
    const exc = sum(pagos, (p) => p.excedente);
    if (exc > 0) {
      credito(d.clienteId, exc, 'Excedente del recibo ' + BG.fmtRecibo(recibo), { pagoId: pagos[pagos.length - 1].id });
      BG.auditar('cobros', 'Saldo a favor', cli.nombre + ' · ' + gs(exc) + ' de excedente');
    }
    BG.guardar();
    return { pagos: pagos, recibo: recibo };
  };

  /* ── Anulaciones (nunca se borra nada) ───────────────────────────────── */

  const soloDuenio = (que) => { if (!BG.esDuena()) throw new Error('Solo ' + BG.nombreDuena() + ' (dueño) puede ' + que + '.'); };

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

  /** Devuelve un texto de error si el pago no se puede anular, o null si se puede. */
  BG.motivoNoAnulable = (pg) => {
    if (pg.anulado) return 'Este pago ya está anulado.';
    if (pg.excedente > 0 && BG.creditoCliente(pg.clienteId) < pg.excedente) {
      return 'El saldo a favor que generó este pago ya se usó en otra compra.';
    }
    return null;
  };

  BG.anularPago = (id, motivo) => {
    soloDuenio('anular pagos');
    const pg = BG.db.pagos.find((p) => p.id === id);
    const cli = BG.cliente(pg.clienteId);
    pg.anulado = { fecha: BG.hoy(), ts: BG.ahora(), motivo: motivo, usuario: BG.usuario().nombre };
    const deSaldo = sum(pg.partes.filter((x) => x.forma === 'saldo'), (x) => x.monto);
    if (deSaldo > 0) credito(pg.clienteId, deSaldo, 'Devuelto al anular el recibo ' + BG.fmtRecibo(pg.recibo), { pagoId: pg.id });
    if (pg.excedente > 0) credito(pg.clienteId, -pg.excedente, 'Anulación del recibo ' + BG.fmtRecibo(pg.recibo), { pagoId: pg.id });
    BG.auditar('anulaciones', 'Pago anulado', 'Recibo ' + BG.fmtRecibo(pg.recibo) + ' · ' + cli.nombre + ' · ' + gs(pg.total + pg.excedente) + ' · motivo: ' + motivo);
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

  BG.actualizarPrecio = (pid, margen, precio) => {
    const p = BG.producto(pid);
    const antes = p.precioVenta;
    p.margen = margen;
    p.precioVenta = precio;
    BG.auditar('productos', 'Precio de venta', p.codigo + ' · ' + p.descripcion + ' · ' + (antes ? gs(antes) : 'sin precio') + ' → ' + gs(precio) + (margen ? ' (' + margen + ' %)' : ' (manual)'));
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

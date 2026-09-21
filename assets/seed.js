/*!
 * berry.Glow_py — Datos de ejemplo del mockup: clientes, productos, ventas y pagos ficticios.
 * Las fechas se generan relativas al día en que se abre el mockup, así la antigüedad de
 * las deudas y los movimientos "de hoy" siempre tienen sentido.
 */
(function (root) {
  'use strict';
  const C = root.BGCalc;

  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function sumarDias(iso, n) {
    const p = iso.split('-').map(Number);
    return isoLocal(new Date(p[0], p[1] - 1, p[2] + n));
  }

  // [id, nombre, CI/RUC, teléfono, dirección, correo, notas, alta (días atrás)]
  const CLIENTES = [
    ['c01', 'María José Benítez', '4.567.890', '0981 234 567', 'Lambaré', '', 'Talle M. Prefiere retirar los sábados.', 120],
    ['c02', 'Lorena Giménez', '3.912.004', '0971 556 120', 'Asunción, Villa Morra', 'lorena.gimenez@example.com', '', 95],
    ['c03', 'Fátima Ortiz', '5.201.337', '0982 440 918', 'San Lorenzo', '', '', 90],
    ['c04', 'Rocío Villalba', '4.880.126', '0994 310 245', 'Fernando de la Mora', '', 'Paga siempre por transferencia.', 88],
    ['c05', 'Natalia Duarte', '3.645.772', '0985 772 031', 'Luque', '', '', 80],
    ['c06', 'Camila Acosta', '6.012.448', '0976 118 509', 'Asunción, Recoleta', 'cami.acosta@example.com', '', 75],
    ['c07', 'Andrea Fernández', '4102938-5', '0981 905 377', 'Asunción, Centro', '', 'Compra para revender. Tiene RUC.', 70],
    ['c08', 'Sofía Martínez', '5.574.210', '0972 663 804', 'Mariano Roque Alonso', '', '', 66],
    ['c09', 'Paola Ramírez', '4.339.061', '0983 207 655', 'Capiatá', '', '', 60],
    ['c10', 'Liz Cabrera', '3.788.915', '0991 448 270', 'Lambaré', '', '', 58],
    ['c11', 'Gabriela Rojas', '5.920.384', '0984 516 902', 'Asunción, Sajonia', '', '', 50],
    ['c12', 'Diana Aquino', '4.105.629', '0975 902 117', 'Villa Elisa', '', '', 45],
    ['c13', 'Mirian Báez', '2.987.340', '0961 337 480', 'Ñemby', '', '', 44],
    ['c14', 'Tamara Cáceres', '6.230.518', '0986 120 663', 'San Lorenzo', '', 'Avisarle cuando lleguen blazers.', 40],
    ['c15', 'Belén Núñez', '5.412.776', '0973 845 210', 'Luque', '', '', 36],
    ['c16', 'Jazmín Ayala', '6.498.002', '0981 660 394', 'Limpio', '', '', 30],
    ['c17', 'Karen Espínola', '4.721.853', '0992 574 118', 'Asunción, Carmelitas', '', '', 28],
    ['c18', 'Leticia Ferreira', '3.366.490', '0982 931 506', 'Fernando de la Mora', '', '', 25],
    ['c19', 'Mónica Galeano', '2.845.117', '0971 208 743', 'Lambaré', '', '', 22],
    ['c20', 'Silvia Insfrán', '3.098.664', '0985 419 820', 'Asunción, Mburucuyá', '', '', 18],
    ['c21', 'Noelia Zárate', '5.763.201', '0976 334 095', 'Capiatá', '', '', 15],
    ['c22', 'Romina Vera', '4.953.380', '0983 780 612', 'Itauguá', '', '', 12],
    ['c23', 'Carolina Sanabria', '5.117.925', '0994 602 381', 'San Antonio', '', '', 8],
    ['c24', 'Luis Ortiz', '4.402.716', '0981 477 209', 'San Lorenzo', '', 'Compra regalos: pedir envoltorio.', 5],
    ['c25', 'Mariela Benítez', '5.330.842', '0972 118 455', 'Lambaré', '', '', 2],
  ];

  // Pedidos al courier. modo 'kg' = tarifa por kilo (opción A); 'total' = monto único repartido por peso (opción B).
  // Artículos: [código, descripción, categoría, cantidad, costo US$, peso kg, opciones]
  const PEDIDOS = [
    {
      id: 'pd1', dias: 42, cot: '7420', modo: 'kg', tarifa: '22.5', proveedor: 'Outlet Miami, EE. UU.',
      items: [
        ['P01', 'Jean mom fit celeste', 'Prenda', 4, '24.90', '0.650'],
        ['P02', 'Buzo con capucha gris', 'Prenda', 3, '19.50', '0.700'],
        ['P03', 'Vestido midi floreado', 'Prenda', 3, '22.00', '0.400'],
        ['P04', 'Calza deportiva negra', 'Prenda', 5, '14.50', '0.250'],
        ['P05', 'Campera de jean clásica', 'Prenda', 2, '32.00', '0.900'],
        ['P06', 'Cartera tote símil cuero', 'Accesorio', 3, '21.00', '0.600'],
        ['P07', 'Aros argolla dorados', 'Accesorio', 10, '3.50', '0.020', { precio: 45000 }],
        ['P08', 'Lentes de sol cat eye', 'Accesorio', 6, '7.50', '0.080'],
        ['P09', 'Riñonera deportiva', 'Accesorio', 4, '11.00', '0.250'],
        ['P10', 'Collar de perlas', 'Accesorio', 6, '5.99', '0.050', { margen: 120 }],
      ],
    },
    {
      id: 'pd2', dias: 19, cot: '7450', modo: 'total', envioTotal: '198', proveedor: 'Tienda online, EE. UU.',
      items: [
        ['P11', 'Top deportivo lila', 'Prenda', 5, '9.90', '0.150'],
        ['P12', 'Camisa de lino blanca', 'Prenda', 3, '18.00', '0.300'],
        ['P13', 'Short de jean tiro alto', 'Prenda', 4, '13.99', '0.300'],
        ['P14', 'Pijama satinado rosa', 'Prenda', 3, '16.50', '0.350'],
        ['P15', 'Blazer beige', 'Prenda', 2, '29.90', '0.700'],
        ['P16', 'Pollera plisada negra', 'Prenda', 3, '15.00', '0.300'],
        ['P17', 'Gorra bordada', 'Accesorio', 5, '9.00', '0.150'],
        ['P18', 'Billetera con cierre', 'Accesorio', 4, '10.50', '0.150'],
        ['P19', 'Pulsera de acero', 'Accesorio', 8, '4.50', '0.030', { margen: 80 }],
        ['P20', 'Set de scrunchies x3', 'Accesorio', 10, '4.00', '0.040'],
        ['P21', 'Bolso cruzado mini', 'Accesorio', 3, '17.50', '0.350'],
      ],
    },
    {
      id: 'pd3', dias: 1, cot: '7500', modo: 'kg', tarifa: '22.5', proveedor: 'Tienda X, EE. UU.',
      items: [
        ['P22', 'Remera oversize negra', 'Prenda', 3, '12.00', '0.300'],
        ['P23', 'Remera básica blanca', 'Prenda', 6, '8.50', '0.200'],
        ['P24', 'Vestido lencero champagne', 'Prenda', 2, '26.00', '0.300'],
        ['P25', 'Conjunto deportivo gris', 'Prenda', 3, '27.50', '0.800'],
        ['P26', 'Cárdigan tejido crema', 'Prenda', 2, '21.90', '0.500'],
        ['P27', 'Body manga larga negro', 'Prenda', 4, '11.50', '0.200'],
        ['P28', 'Aros de perla chicos', 'Accesorio', 8, '2.99', '0.010'],
        ['P29', 'Cinturón de cuero', 'Accesorio', 3, '12.00', '0.250'],
        ['P30', 'Pañuelo de seda estampado', 'Accesorio', 4, null, '0.050', { nota: 'Costo pendiente: falta la factura del proveedor.' }],
        ['P31', 'Body mist vainilla', 'Accesorio', 6, '8.99', '0.300'],
        ['P32', 'Reloj dorado malla tejida', 'Accesorio', 2, '24.00', '0.150'],
      ],
    },
  ];

  // Ventas: cliente, días atrás, hora, artículos [código, cantidad], descuento opcional,
  // pagos [días atrás, hora, partes [forma, monto]]. Monto: 'total' | 'resto' | fracción del total | ₲ fijos.
  const VENTAS = [
    { c: 'c01', d: 40, h: '10:20', it: [['P01', 1], ['P07', 1]], pagos: [[40, '10:22', [['efectivo', 0.5]]], [25, '16:05', [['transferencia', 'resto']]]] },
    { c: 'c02', d: 38, h: '11:05', it: [['P03', 1]], pagos: [[38, '11:06', [['efectivo', 100000]]], [0, '09:40', [['transferencia', 50000]]]] },
    { c: 'c03', d: 36, h: '15:30', it: [['P06', 1], ['P08', 1]], pagos: [[36, '15:31', [['efectivo', 'total']]]] },
    { c: 'c04', d: 35, h: '17:45', it: [['P02', 1]], pagos: [[35, '17:46', [['transferencia', 0.3]]], [20, '10:10', [['qr', 0.3]]]] },
    { c: 'c05', d: 33, h: '12:15', it: [['P04', 2]], pagos: [[33, '12:16', [['tarjeta', 'total']]]] },
    { c: 'c06', d: 30, h: '16:40', it: [['P05', 1]], pagos: [[30, '16:41', [['efectivo', 150000]]]] },
    { c: 'c07', d: 29, h: '10:00', it: [['P07', 3], ['P10', 2]], desc: { tipo: 'porcentaje', valor: '10' }, pagos: [[29, '10:02', [['transferencia', 0.5]]], [15, '18:20', [['transferencia', 'resto']]]] },
    { c: 'c08', d: 27, h: '14:50', it: [['P09', 1]], pagos: [[27, '14:51', [['efectivo', 'total']]]] },
    { c: 'c09', d: 25, h: '11:30', it: [['P01', 1]], pagos: [[25, '11:31', [['qr', 200000]]], [0, '10:15', [['efectivo', 100000]]]] },
    { c: 'c10', d: 22, h: '17:10', it: [['P06', 1]], pagos: [[22, '17:12', [['efectivo', 100000], ['transferencia', 50000]]]] },
    { c: 'c11', d: 18, h: '09:50', it: [['P11', 1], ['P13', 1]], pagos: [[18, '09:51', [['tarjeta', 'total']]]] },
    { c: 'c12', d: 17, h: '15:05', it: [['P12', 1]], pagos: [[17, '15:06', [['efectivo', 0.5]]]] },
    { c: 'c13', d: 16, h: '16:30', it: [['P14', 1], ['P20', 1]], pagos: [[16, '16:31', [['efectivo', 'total']]]] },
    { c: 'c14', d: 15, h: '18:00', it: [['P15', 1]], pagos: [[10, '11:20', [['transferencia', 100000]]]] },
    { c: 'c02', d: 14, h: '10:45', it: [['P19', 2]], pagos: [[14, '10:46', [['efectivo', 'total']]]] },
    { c: 'c15', d: 12, h: '12:40', it: [['P16', 1], ['P17', 1]], pagos: [[12, '12:41', [['qr', 0.4]]]] },
    { c: 'c16', d: 11, h: '17:25', it: [['P18', 1]], pagos: [[11, '17:26', [['efectivo', 'total']]]] },
    { c: 'c17', d: 10, h: '11:15', it: [['P21', 1]], pagos: [[10, '11:16', [['transferencia', 0.5]]], [3, '17:40', [['efectivo', 50000]]]] },
    {
      c: 'c18', d: 9, h: '16:10', it: [['P11', 1]], pagos: [[9, '16:11', [['efectivo', 50000]]]],
      anulada: { d: 8, h: '10:30', motivo: 'La clienta devolvió el top: no le quedó el talle.' },
    },
    { c: 'c19', d: 8, h: '13:20', it: [['P13', 1], ['P19', 1]], pagos: [[8, '13:21', [['tarjeta', 'total']]]] },
    { c: 'c20', d: 6, h: '10:35', it: [['P12', 1]], pagos: [[6, '10:36', [['efectivo', 0.3]]]] },
    { c: 'c21', d: 5, h: '15:45', it: [['P20', 2], ['P17', 1]], pagos: [[5, '15:46', [['efectivo', 30000], ['qr', 'resto']]]] },
    { c: 'c22', d: 4, h: '17:55', it: [['P14', 1]], pagos: [] },
    { c: 'c01', d: 3, h: '11:10', it: [['P16', 1]], pagos: [[3, '11:11', [['transferencia', 0.5]]]] },
    { c: 'c23', d: 2, h: '16:20', it: [['P15', 1]], pagos: [[2, '16:21', [['tarjeta', 'total']]]] },
    { c: 'c24', d: 1, h: '18:30', it: [['P08', 1], ['P10', 1]], pagos: [[1, '18:31', [['efectivo', 'total']]]] },
    { c: 'c05', d: 1, h: '12:05', it: [['P21', 1]], pagos: [[1, '12:06', [['qr', 0.5]]]] },
    { c: 'c09', d: 0, h: '09:25', it: [['P22', 1], ['P28', 1]], pagos: [[0, '09:26', [['efectivo', 100000], ['transferencia', 'resto']]]] },
    { c: 'c25', d: 0, h: '10:50', it: [['P24', 1]], pagos: [[0, '10:51', [['qr', 150000]]]] },
    { c: 'c03', d: 0, h: '11:35', it: [['P23', 2]], pagos: [[0, '11:36', [['efectivo', 'total']]]] },
  ];

  const REDONDEO = { paso: 1000, modo: 'cercano' };
  const USUARIO = 'Dueña';

  function crear(hoy) {
    const F = (dias) => sumarDias(hoy, -dias);
    const T = (dias, hora) => F(dias) + 'T' + hora;
    const auditoria = [];
    const log = (ts, tipo, accion, detalle) => auditoria.push({ id: 'a' + (auditoria.length + 1), ts: ts, usuario: USUARIO, tipo: tipo, accion: accion, detalle: detalle });
    const gs = (n) => C.fmtGs(n);

    const db = {
      version: 1,
      creado: hoy,
      config: {
        tienda: {
          nombre: 'berry.Glow_py',
          whatsapp: '0981 000 000',
          instagram: '@berry.glow_py',
          direccion: 'Asunción, Paraguay',
          mensaje: '¡Gracias por elegirnos! Cualquier consulta, escribinos por WhatsApp.',
        },
        marca: { principal: '#A3195B', acento: '#E2A94F', logo: null },
        cotizacion: { valor: '7500', fecha: F(1), ts: T(1, '08:45'), usuario: USUARIO },
        tarifa: { valor: '22.5', fecha: F(60), ts: T(60, '09:00'), usuario: USUARIO },
        historialCotizacion: [
          { valor: '7420', fecha: F(45), ts: T(45, '08:50'), usuario: USUARIO },
          { valor: '7450', fecha: F(20), ts: T(20, '08:40'), usuario: USUARIO },
          { valor: '7500', fecha: F(1), ts: T(1, '08:45'), usuario: USUARIO },
        ],
        historialTarifa: [{ valor: '22.5', fecha: F(60), ts: T(60, '09:00'), usuario: USUARIO }],
        redondeo: { paso: REDONDEO.paso, modo: REDONDEO.modo },
        margenDefecto: 100,
        proximoRecibo: 101,
        cajaCerradaHasta: F(1),
      },
      usuarios: [
        { id: 'u1', nombre: 'Dueña', usuario: 'duena', rol: 'admin' },
        { id: 'u2', nombre: 'Caja', usuario: 'caja', rol: 'vendedor' },
      ],
      clientes: [], productos: [], pedidos: [], ventas: [], pagos: [], creditos: [], cierres: [], auditoria: [],
    };

    db.config.historialTarifa.forEach((h) => log(h.ts, 'parametros', 'Tarifa del courier', C.fmtUSD(h.valor) + ' por kg'));
    db.config.historialCotizacion.forEach((h) => log(h.ts, 'parametros', 'Cotización del dólar', C.fmtCot(h.valor) + ' por US$ 1'));

    for (const [id, nombre, ci, telefono, direccion, email, notas, alta] of CLIENTES) {
      db.clientes.push({ id: id, nombre: nombre, ci: ci, telefono: telefono, direccion: direccion, email: email, notas: notas, alta: F(alta), demo: true });
      log(T(alta, '09:05'), 'clientes', 'Alta de cliente', nombre);
    }

    for (const ped of PEDIDOS) {
      const fecha = F(ped.dias);
      const ts = T(ped.dias, '09:30');
      const lineas = ped.items.map((it) => ({ pesoKg: it[5], cantidad: it[3] }));
      const reparto = ped.modo === 'total' ? C.prorratearEnvio(lineas, ped.envioTotal) : null;
      db.pedidos.push({
        id: ped.id, fecha: fecha, ts: ts, proveedor: ped.proveedor, cotizacion: ped.cot,
        envio: ped.modo === 'total'
          ? { modo: 'total', totalUSD: ped.envioTotal, pesoKg: C.qToString(C.pesoTotal(lineas)) }
          : { modo: 'kg', tarifa: ped.tarifa },
        productos: ped.items.map((it) => it[0]),
      });
      ped.items.forEach((it, i) => {
        const [codigo, descripcion, categoria, cantidad, costo, peso, op] = it;
        const opciones = op || {};
        const envioUnit = reparto ? reparto[i].envioUnit : C.mul(C.asQ(peso), C.asQ(ped.tarifa));
        const p = {
          id: codigo, codigo: codigo, descripcion: descripcion, categoria: categoria, proveedor: ped.proveedor,
          cantidad: cantidad, costoUSD: costo, pesoKg: peso,
          envioModo: ped.modo, tarifa: ped.modo === 'kg' ? ped.tarifa : null, envioUnitUSD: C.qToString(envioUnit),
          cotizacion: ped.cot, pedidoId: ped.id, fechaCarga: fecha, ts: ts, nota: opciones.nota || '',
          costoTotalGs: null, envioGs: null, productoGs: null, margen: null, precioVenta: null,
        };
        if (costo) {
          const r = C.calcularProducto({ costoUSD: costo, envioUnitUSD: envioUnit, cotizacion: ped.cot, redondeo: REDONDEO });
          p.costoTotalGs = Number(r.costoTotalGs);
          p.envioGs = Number(r.envioGs);
          p.productoGs = Number(r.productoGs);
          if (opciones.precio) p.precioVenta = opciones.precio;
          else {
            p.margen = opciones.margen || 100;
            p.precioVenta = Number(r.precios.find((x) => x.margen === p.margen).redondeado);
          }
        }
        db.productos.push(p);
      });
      const envioTxt = ped.modo === 'total'
        ? 'envío total ' + C.fmtUSD(ped.envioTotal) + ' repartido por peso'
        : 'courier ' + C.fmtUSD(ped.tarifa) + '/kg';
      log(ts, 'productos', 'Carga de pedido', ped.items.length + ' productos · ' + ped.proveedor + ' · dólar ' + C.fmtCot(ped.cot) + ' · ' + envioTxt);
    }

    const eventos = [];
    VENTAS.forEach((s, n) => {
      const id = 'v' + String(n + 1).padStart(3, '0');
      const items = s.it.map(([codigo, cantidad]) => {
        const p = db.productos.find((x) => x.id === codigo);
        return { productoId: p.id, descripcion: p.descripcion, cantidad: cantidad, precio: p.precioVenta, costoUnitGs: p.costoTotalGs, margen: p.margen };
      });
      const t = C.totalesVenta(items, s.desc);
      const v = {
        id: id, recibo: null, clienteId: s.c, fecha: F(s.d), ts: T(s.d, s.h), items: items,
        descuento: { tipo: s.desc ? s.desc.tipo : 'monto', valor: s.desc ? s.desc.valor : 0, monto: t.descuento },
        subtotal: t.subtotal, total: t.total, anulada: null, usuario: USUARIO,
      };
      db.ventas.push(v);
      eventos.push({ tipo: 'venta', ts: v.ts, obj: v });

      let pagado = 0;
      s.pagos.forEach(([dias, hora, partesSpec], idx) => {
        const partes = [];
        for (const [forma, spec] of partesSpec) {
          const resto = v.total - pagado - partes.reduce((a, x) => a + x.monto, 0);
          let monto;
          if (spec === 'total' || spec === 'resto') monto = resto;
          else if (spec < 1) monto = Math.max(1000, Math.round((v.total * spec) / 1000) * 1000);
          else monto = spec;
          monto = Math.min(monto, resto);
          if (monto > 0) partes.push({ forma: forma, monto: monto });
        }
        const total = partes.reduce((a, x) => a + x.monto, 0);
        if (!total) return;
        const pg = {
          id: 'pg' + String(db.pagos.length + 1).padStart(3, '0'), ventaId: id, clienteId: s.c,
          fecha: F(dias), ts: T(dias, hora), partes: partes, total: total, excedente: 0,
          recibo: null, inicial: idx === 0 && dias === s.d, grupo: null, anulado: null, usuario: USUARIO,
        };
        pagado += total;
        db.pagos.push(pg);
        eventos.push({ tipo: 'pago', ts: pg.ts, obj: pg });
      });

      if (s.anulada) {
        v.anulada = { fecha: F(s.anulada.d), ts: T(s.anulada.d, s.anulada.h), motivo: s.anulada.motivo, usuario: USUARIO };
        eventos.push({ tipo: 'anulacion', ts: v.anulada.ts, obj: v, pagado: pagado });
      }
    });

    eventos.sort((a, b) => a.ts.localeCompare(b.ts));
    let recibo = 101;
    for (const e of eventos) {
      if (e.tipo === 'venta') e.obj.recibo = recibo++;
      else if (e.tipo === 'pago' && !e.obj.inicial) e.obj.recibo = recibo++;
    }
    for (const pg of db.pagos) if (pg.inicial) pg.recibo = db.ventas.find((v) => v.id === pg.ventaId).recibo;
    db.config.proximoRecibo = recibo;

    const nombre = (cid) => db.clientes.find((c) => c.id === cid).nombre;
    const numero = (n) => 'N° ' + String(n).padStart(6, '0');
    const FORMAS = { efectivo: 'Efectivo', transferencia: 'Transferencia', qr: 'QR', tarjeta: 'Tarjeta' };
    for (const e of eventos) {
      if (e.tipo === 'venta') {
        const v = e.obj;
        log(v.ts, 'ventas', 'Venta registrada', 'Recibo ' + numero(v.recibo) + ' · ' + nombre(v.clienteId) + ' · ' + gs(v.total));
      } else if (e.tipo === 'pago') {
        const pg = e.obj;
        const formas = pg.partes.map((x) => FORMAS[x.forma] + ' ' + gs(x.monto)).join(' + ');
        log(pg.ts, 'cobros', pg.inicial ? 'Pago inicial' : 'Cobro registrado', 'Recibo ' + numero(pg.recibo) + ' · ' + nombre(pg.clienteId) + ' · ' + formas);
      } else if (e.tipo === 'anulacion') {
        const v = e.obj;
        log(v.anulada.ts, 'anulaciones', 'Venta anulada', 'Recibo ' + numero(v.recibo) + ' · ' + nombre(v.clienteId) + ' · motivo: ' + v.anulada.motivo);
        if (e.pagado > 0) {
          db.creditos.push({
            id: 'cr' + (db.creditos.length + 1), clienteId: v.clienteId, fecha: v.anulada.fecha, ts: v.anulada.ts,
            monto: e.pagado, motivo: 'Pagos de la venta anulada ' + numero(v.recibo), ventaId: v.id,
          });
          log(v.anulada.ts, 'anulaciones', 'Saldo a favor', nombre(v.clienteId) + ' · ' + gs(e.pagado) + ' de la venta anulada');
        }
      }
    }

    // Cierres de caja de los últimos días (el sistema bloquea esos movimientos).
    [3, 2, 1].forEach((dias) => {
      const fecha = F(dias);
      const efectivo = db.pagos
        .filter((pg) => pg.fecha === fecha && !pg.anulado)
        .reduce((s, pg) => s + pg.partes.filter((x) => x.forma === 'efectivo').reduce((a, x) => a + x.monto, 0), 0);
      const falta = dias === 3 ? 5000 : 0;
      db.cierres.push({
        fecha: fecha, ts: T(dias, '20:15'), usuario: USUARIO, efectivoEsperado: efectivo, efectivoContado: efectivo - falta,
        nota: falta ? 'Faltaron ' + gs(falta) + ': se dio mal un vuelto.' : '',
      });
      log(T(dias, '20:15'), 'caja', 'Cierre de caja', fmtFecha(fecha) + ' · efectivo contado ' + gs(efectivo - falta) + (falta ? ' (faltaron ' + gs(falta) + ')' : ' · sin diferencias'));
    });

    auditoria.sort((a, b) => b.ts.localeCompare(a.ts));
    db.auditoria = auditoria;
    return db;
  }

  function fmtFecha(iso) {
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

  root.BGSeed = { crear: crear };
})(typeof globalThis !== 'undefined' ? globalThis : this);

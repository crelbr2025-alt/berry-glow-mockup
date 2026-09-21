/*!
 * berry.Glow_py — Calculadora de precios y reglas de dinero (Módulo 2).
 *
 * Todo el cálculo usa fracciones exactas (BigInt): ningún precio depende de
 * errores de coma flotante. Fórmulas del brief, tal cual:
 *
 *   Costo total (USD) = Costo del producto + (Peso × Tarifa del courier)
 *   Costo total (Gs)  = Costo total (USD) × Cotización del dólar
 *   Precio sugerido   = Costo total (Gs) × (1 + margen)
 *
 * Criterio de redondeo (para que las sumas cierren sin diferencias de ₲ 1):
 *   1. Los montos en dólares nunca se redondean.
 *   2. El costo total se redondea UNA sola vez a guaraní entero (mitad hacia
 *      arriba) y ese entero queda congelado en el producto.
 *   3. El envío en ₲ se redondea igual y el costo del producto en ₲ es la
 *      resta, así las dos partes suman siempre exactamente el total.
 *   4. El precio sugerido se calcula sobre ese costo entero y el redondeo
 *      "lindo" se aplica al valor exacto: nunca se redondea dos veces.
 *
 * Funciona en el navegador (window.BGCalc) y en Node (require) para las pruebas.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BGCalc = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── Fracciones exactas ─────────────────────────────────────────────── */

  function gcd(a, b) {
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  function Q(n, d) {
    n = BigInt(n);
    d = d === undefined ? 1n : BigInt(d);
    if (d === 0n) throw new RangeError('División por cero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d);
    return g > 1n ? { n: n / g, d: d / g } : { n: n, d: d };
  }

  const isQ = (x) => x !== null && typeof x === 'object' && typeof x.n === 'bigint' && typeof x.d === 'bigint';
  const add = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
  const div = (a, b) => Q(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
  const isZero = (a) => a.n === 0n;

  function floorDiv(n, d) {
    const t = n / d;
    return (n % d !== 0n && (n < 0n) !== (d < 0n)) ? t - 1n : t;
  }
  const floorQ = (a) => floorDiv(a.n, a.d);
  const ceilQ = (a) => -floorDiv(-a.n, a.d);
  /** Redondeo a entero, mitad hacia arriba (210.937,5 → 210.938). */
  const roundQ = (a) => floorDiv(2n * a.n + a.d, 2n * a.d);
  const toNumber = (a) => Number(a.n) / Number(a.d);

  /** Texto canónico para guardar: "22.5", "7500" o "53/11" si no es decimal finito. */
  function qToString(a) {
    let t = a.d;
    while (t % 2n === 0n) t /= 2n;
    while (t % 5n === 0n) t /= 5n;
    if (t !== 1n) return a.n + '/' + a.d;
    let scale = 1n;
    let digits = 0;
    while (scale % a.d !== 0n) { scale *= 10n; digits++; }
    const v = a.n * (scale / a.d);
    const neg = v < 0n;
    const s = (neg ? -v : v).toString().padStart(digits + 1, '0');
    const out = digits ? s.slice(0, s.length - digits) + '.' + s.slice(s.length - digits) : s;
    return (neg ? '-' : '') + out;
  }

  /** Lee el texto canónico ("22.5", "-3", "53/11"). No es para lo que tipea la persona. */
  function fromCanonical(s) {
    s = String(s).trim();
    let m = /^(-?\d+)\/(\d+)$/.exec(s);
    if (m) return Q(BigInt(m[1]), BigInt(m[2]));
    m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) return null;
    const frac = m[3] || '';
    const n = BigInt(m[2] + frac);
    return Q(m[1] ? -n : n, 10n ** BigInt(frac.length));
  }

  function asQ(x) {
    if (isQ(x)) return x;
    if (typeof x === 'bigint') return Q(x);
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw new TypeError('Número inválido: ' + x);
      if (Number.isInteger(x)) return Q(BigInt(x));
      return fromCanonical(x.toFixed(6));
    }
    if (typeof x === 'string') {
      const r = fromCanonical(x);
      if (r) return r;
    }
    throw new TypeError('Número inválido: ' + x);
  }

  /* ── Lectura de números escritos a la paraguaya ─────────────────────── */

  function validThousands(s, sep) {
    const parts = s.split(sep);
    if (parts.length === 1) return true;
    if (!/^\d{1,3}$/.test(parts[0])) return false;
    return parts.slice(1).every((p) => /^\d{3}$/.test(p));
  }

  /**
   * Interpreta lo que tipea la persona: "12,00", "0,300", "1.234,56", "8,2192"
   * y también "12.50" o "0.3" (teclado en inglés).
   *   kind 'decimal' (dólares, kilos): un único punto es coma decimal ("12.50" → 12,5).
   *   kind 'miles'   (cotización):     un único punto seguido de 3 cifras es de miles ("7.500" → 7500).
   * Devuelve una fracción exacta o null si el texto no es un número válido (o es negativo).
   */
  function parseNum(input, kind) {
    kind = kind || 'decimal';
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') {
      if (!Number.isFinite(input) || input < 0) return null;
      return asQ(input);
    }
    let s = String(input).trim()
      .replace(/^(US\$|U\$S|USD|Gs\.?|₲|\$)\s*/i, '')
      .replace(/\s*(kg|USD|US\$|Gs\.?|₲)$/i, '')
      .replace(/\s+/g, '');
    if (!s || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let ip;
    let fp = '';
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? '.' : ',';
      const thou = dec === '.' ? ',' : '.';
      const idx = s.lastIndexOf(dec);
      ip = s.slice(0, idx);
      fp = s.slice(idx + 1);
      if (ip.indexOf(dec) >= 0 || !validThousands(ip, thou)) return null;
      ip = ip.split(thou).join('');
    } else if (lastComma >= 0) {
      const parts = s.split(',');
      if (parts.length === 2) { ip = parts[0]; fp = parts[1]; }
      else if (validThousands(s, ',')) ip = parts.join('');
      else return null;
    } else if (lastDot >= 0) {
      const parts = s.split('.');
      if (parts.length > 2) {
        if (!validThousands(s, '.')) return null;
        ip = parts.join('');
      } else if (kind === 'miles' && parts[1].length === 3 && parts[0] !== '' && parts[0] !== '0') {
        ip = parts.join('');
      } else {
        ip = parts[0];
        fp = parts[1];
      }
    } else {
      ip = s;
    }
    if (ip === '') ip = '0';
    if (!/^\d+$/.test(ip) || !/^\d*$/.test(fp)) return null;
    return Q(BigInt(ip + fp), 10n ** BigInt(fp.length));
  }

  /** Entero positivo para cantidades: "3", 3 → 3; "2,5", "", "-1" → null. */
  function parseEntero(input) {
    if (typeof input === 'number') return Number.isInteger(input) && input >= 0 ? input : null;
    const s = String(input == null ? '' : input).trim();
    return /^\d+$/.test(s) ? parseInt(s, 10) : null;
  }

  /** Guaraníes: solo cuentan las cifras ("₲ 150.000" → 150000). Lo que va tras una coma se descarta. */
  function parseGs(input) {
    if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;
    const s = String(input == null ? '' : input).split(',')[0].replace(/\D/g, '');
    return s ? parseInt(s, 10) : null;
  }

  /* ── Formato ─────────────────────────────────────────────────────────── */

  function groupThousands(digits) {
    return String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /**
   * Número con punto de miles y coma decimal.
   * min = decimales mínimos; max (opcional) = máximos, redondeando lo que sobra.
   */
  function fmtNum(x, min, max) {
    const a = asQ(x);
    min = min || 0;
    max = max == null ? min : Math.max(min, max);
    let r = roundQ(mul(a, Q(10n ** BigInt(max))));
    const neg = r < 0n;
    if (neg) r = -r;
    const s = r.toString().padStart(max + 1, '0');
    const ip = max ? s.slice(0, s.length - max) : s;
    let fp = max ? s.slice(s.length - max) : '';
    while (fp.length > min && fp.endsWith('0')) fp = fp.slice(0, -1);
    return (neg ? '−' : '') + groupThousands(ip) + (fp ? ',' + fp : '');
  }

  // Espacio que no corta renglón: el símbolo nunca queda separado de su número.
  const NBSP = String.fromCharCode(160);

  function fmtGs(x) {
    const a = typeof x === 'number' ? Q(BigInt(Math.round(x))) : asQ(x);
    const neg = a.n < 0n;
    return (neg ? '−₲' : '₲') + NBSP + fmtNum(neg ? Q(-a.n, a.d) : a, 0);
  }
  const fmtUSD = (x) => 'US$' + NBSP + fmtNum(x, 2, 4);
  const fmtKg = (x) => fmtNum(x, 3, 4) + NBSP + 'kg';
  function fmtCot(x) {
    const a = asQ(x);
    return '₲' + NBSP + (a.d === 1n ? fmtNum(a, 0) : fmtNum(a, 2, 2));
  }

  /* ── Precios ─────────────────────────────────────────────────────────── */

  const MARGENES = [50, 80, 100, 120];
  const REDONDEO_DEFECTO = { paso: 1000, modo: 'cercano' };

  /** Redondea un precio (exacto) al paso elegido: más cercano, siempre hacia arriba o hacia abajo. */
  function redondear(precio, redondeo) {
    const r = redondeo || REDONDEO_DEFECTO;
    const a = asQ(precio);
    const paso = BigInt(r.paso || 1);
    const f = r.modo === 'arriba' ? ceilQ : r.modo === 'abajo' ? floorQ : roundQ;
    return paso <= 1n ? f(a) : f(div(a, Q(paso))) * paso;
  }

  /** Precio exacto (sin redondear) de un costo entero en ₲ con un margen en %. */
  function precioExacto(costoTotalGs, margen) {
    return mul(Q(BigInt(costoTotalGs)), add(Q(1n), div(asQ(margen), Q(100n))));
  }

  /**
   * Calcula todo lo de un artículo.
   * o = { costoUSD, pesoKg, tarifaUSDkg, cotizacion, envioUnitUSD?, margenes?, redondeo? }
   * envioUnitUSD reemplaza a peso × tarifa cuando el envío viene prorrateado (opción B).
   */
  function calcularProducto(o) {
    const costoUSD = asQ(o.costoUSD);
    const cot = asQ(o.cotizacion);
    const envioUSD = o.envioUnitUSD != null ? asQ(o.envioUnitUSD) : mul(asQ(o.pesoKg), asQ(o.tarifaUSDkg));
    const costoTotalUSD = add(costoUSD, envioUSD);
    const costoTotalGs = roundQ(mul(costoTotalUSD, cot));
    const envioGs = roundQ(mul(envioUSD, cot));
    const productoGs = costoTotalGs - envioGs;
    const precios = (o.margenes || MARGENES).map((m) => {
      const exacto = precioExacto(costoTotalGs, m);
      const redondeado = redondear(exacto, o.redondeo);
      return { margen: m, exacto: exacto, exactoGs: roundQ(exacto), redondeado: redondeado, ganancia: redondeado - costoTotalGs };
    });
    return {
      costoUSD: costoUSD, envioUSD: envioUSD, costoTotalUSD: costoTotalUSD, cotizacion: cot,
      costoTotalGs: costoTotalGs, envioGs: envioGs, productoGs: productoGs, precios: precios,
    };
  }

  /* ── Opción B: envío total del pedido repartido por peso ────────────── */

  function pesoTotal(items) {
    return items.reduce((s, it) => add(s, mul(asQ(it.pesoKg), Q(BigInt(it.cantidad)))), Q(0n));
  }

  /**
   * Reparte el envío del pedido en proporción al peso de cada línea (peso × cantidad).
   * Las partes son exactas: Σ envioUnit × cantidad = total, sin centavos perdidos.
   */
  function prorratearEnvio(items, totalUSD) {
    const total = asQ(totalUSD);
    const lineas = items.map((it) => {
      const c = BigInt(it.cantidad);
      if (c <= 0n) throw new RangeError('Cada línea necesita una cantidad de 1 o más.');
      return { c: c, peso: mul(asQ(it.pesoKg), Q(c)) };
    });
    const W = lineas.reduce((s, l) => add(s, l.peso), Q(0n));
    if (isZero(W)) throw new RangeError('El peso total del pedido es 0 kg: no hay cómo repartir el envío.');
    return lineas.map((l) => {
      const envioLinea = div(mul(total, l.peso), W);
      return { pesoLinea: l.peso, envioLinea: envioLinea, envioUnit: div(envioLinea, Q(l.c)) };
    });
  }

  /** Lo que salió el kilo en un pedido cobrado por monto total. */
  function tarifaEfectiva(items, totalUSD) {
    const W = pesoTotal(items);
    return isZero(W) ? null : div(asQ(totalUSD), W);
  }

  /* ── Ventas ──────────────────────────────────────────────────────────── */

  /**
   * items = [{ precio (₲ entero), cantidad }]; descuento = { tipo: 'monto'|'porcentaje', valor }.
   * Todo en guaraníes enteros; el descuento en % se redondea una vez.
   */
  function totalesVenta(items, descuento) {
    let subtotal = 0;
    for (const it of items) subtotal += Math.round(it.precio) * Math.round(it.cantidad);
    let desc = 0;
    if (descuento && descuento.valor) {
      if (descuento.tipo === 'porcentaje') desc = Number(roundQ(mul(Q(BigInt(subtotal)), div(asQ(descuento.valor), Q(100n)))));
      else desc = Math.round(Number(descuento.valor));
    }
    if (!(desc > 0)) desc = 0;
    if (desc > subtotal) desc = subtotal;
    return { subtotal: subtotal, descuento: desc, total: subtotal - desc };
  }

  return {
    Q: Q, isQ: isQ, add: add, sub: sub, mul: mul, div: div, cmp: cmp, isZero: isZero,
    roundQ: roundQ, floorQ: floorQ, ceilQ: ceilQ, toNumber: toNumber,
    asQ: asQ, qToString: qToString, fromCanonical: fromCanonical,
    parseNum: parseNum, parseEntero: parseEntero, parseGs: parseGs,
    groupThousands: groupThousands, fmtNum: fmtNum, fmtGs: fmtGs, fmtUSD: fmtUSD, fmtKg: fmtKg, fmtCot: fmtCot,
    MARGENES: MARGENES, REDONDEO_DEFECTO: REDONDEO_DEFECTO,
    redondear: redondear, precioExacto: precioExacto, calcularProducto: calcularProducto,
    pesoTotal: pesoTotal, prorratearEnvio: prorratearEnvio, tarifaEfectiva: tarifaEfectiva,
    totalesVenta: totalesVenta,
  };
});

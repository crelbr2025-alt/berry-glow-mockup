/*!
 * berry.Glow_py — Importación masiva de productos desde Excel (.xlsx) o CSV.
 *
 * El .xlsx se lee directo en el navegador, sin librerías: es un ZIP con XML adentro.
 * Se usa la primera hoja del libro; los encabezados se reconocen por su nombre
 * (Descripción, Categoría, Proveedor / origen, Cantidad, Costo unitario (US$), Peso unitario (kg)).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root.BGCalc || require('./calc.js'));
  else root.BGImport = factory(root.BGCalc);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  const TAB = String.fromCharCode(9);

  /* ── CSV ─────────────────────────────────────────────────────────────── */

  function detectarSeparador(linea) {
    let mejor = ';';
    let max = -1;
    for (const sep of [';', ',', TAB]) {
      const n = linea.split(sep).length - 1;
      if (n > max) { mejor = sep; max = n; }
    }
    return mejor;
  }

  /** CSV con comillas, separador ; , o tabulación (Excel en español guarda con ;). */
  function parseCSV(texto) {
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
    const sep = detectarSeparador(texto.split(LF, 1)[0] || '');
    const filas = [];
    let fila = [];
    let campo = '';
    let comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
        } else campo += ch;
      } else if (ch === '"') {
        comillas = true;
      } else if (ch === sep) {
        fila.push(campo); campo = '';
      } else if (ch === LF || ch === CR) {
        if (ch === CR && texto[i + 1] === LF) i++;
        fila.push(campo); filas.push(fila); fila = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  /* ── XLSX (ZIP + XML) ────────────────────────────────────────────────── */

  const FIRMA_FIN = 0x06054b50;
  const FIRMA_CENTRAL = 0x02014b50;
  const FIRMA_LOCAL = 0x04034b50;

  async function inflar(datos) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no puede abrir archivos .xlsx. Guardá la planilla como CSV y probá de nuevo.');
    }
    const stream = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function abrirZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let fin = -1;
    for (let i = bytes.length - 22, tope = Math.max(0, bytes.length - 22 - 65535); i >= tope; i--) {
      if (dv.getUint32(i, true) === FIRMA_FIN) { fin = i; break; }
    }
    if (fin < 0) throw new Error('El archivo no es un Excel .xlsx válido.');
    const total = dv.getUint16(fin + 10, true);
    let p = dv.getUint32(fin + 16, true);
    const td = new TextDecoder('utf-8');
    const entradas = new Map();
    for (let k = 0; k < total; k++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== FIRMA_CENTRAL) throw new Error('El Excel parece dañado.');
      const metodo = dv.getUint16(p + 10, true);
      const tam = dv.getUint32(p + 20, true);
      const largoNombre = dv.getUint16(p + 28, true);
      const largoExtra = dv.getUint16(p + 30, true);
      const largoComent = dv.getUint16(p + 32, true);
      const inicio = dv.getUint32(p + 42, true);
      entradas.set(td.decode(bytes.subarray(p + 46, p + 46 + largoNombre)), { metodo: metodo, tam: tam, inicio: inicio });
      p += 46 + largoNombre + largoExtra + largoComent;
    }
    return {
      nombres: () => Array.from(entradas.keys()),
      texto: async function (nombre) {
        const e = entradas.get(nombre);
        if (!e) return null;
        if (dv.getUint32(e.inicio, true) !== FIRMA_LOCAL) throw new Error('El Excel parece dañado.');
        const desde = e.inicio + 30 + dv.getUint16(e.inicio + 26, true) + dv.getUint16(e.inicio + 28, true);
        const datos = bytes.subarray(desde, desde + e.tam);
        let crudo;
        if (e.metodo === 0) crudo = datos;
        else if (e.metodo === 8) crudo = await inflar(datos);
        else throw new Error('El Excel usa una compresión que no se puede leer en el navegador.');
        return td.decode(crudo);
      },
    };
  }

  function xml(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('No se pudo leer el contenido del Excel.');
    return doc;
  }
  const porTag = (el, nombre) => Array.from(el.getElementsByTagNameNS('*', nombre));
  const hijos = (el, nombre) => Array.from(el.children).filter((h) => h.localName === nombre);

  function indiceColumna(ref) {
    let n = 0;
    for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  /** Devuelve las filas de la primera hoja como matriz de celdas (texto, número, booleano o null). */
  async function leerXLSX(buffer) {
    const zip = abrirZip(buffer);
    let hoja = null;
    const libro = await zip.texto('xl/workbook.xml');
    const rels = await zip.texto('xl/_rels/workbook.xml.rels');
    if (libro && rels) {
      const primera = porTag(xml(libro), 'sheet')[0];
      if (primera) {
        const rid = primera.getAttribute('r:id') ||
          primera.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        const rel = porTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
        if (rel) {
          const destino = rel.getAttribute('Target') || '';
          hoja = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino.replace(/^\.\//, '');
        }
      }
    }
    if (!hoja || zip.nombres().indexOf(hoja) < 0) {
      hoja = zip.nombres().filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n)).sort()[0];
    }
    if (!hoja) throw new Error('El Excel no tiene hojas con datos.');

    const compartidos = [];
    const ss = await zip.texto('xl/sharedStrings.xml');
    if (ss) {
      for (const si of porTag(xml(ss), 'si')) {
        compartidos.push(porTag(si, 't').filter((t) => !t.parentNode || t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));
      }
    }

    const filas = [];
    let siguiente = 0;
    for (const row of porTag(xml(await zip.texto(hoja)), 'row')) {
      const r = row.getAttribute('r');
      const idx = r ? parseInt(r, 10) - 1 : siguiente;
      siguiente = idx + 1;
      const fila = [];
      for (const c of hijos(row, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? indiceColumna(ref) : fila.length;
        const tipo = c.getAttribute('t');
        const vEl = hijos(c, 'v')[0];
        const v = vEl ? vEl.textContent : null;
        let valor = null;
        if (tipo === 's') valor = v == null ? '' : (compartidos[parseInt(v, 10)] || '');
        else if (tipo === 'inlineStr') valor = porTag(c, 't').map((t) => t.textContent).join('');
        else if (tipo === 'str') valor = v == null ? '' : v;
        else if (tipo === 'b') valor = v === '1';
        else if (tipo === 'e') valor = null;
        else if (v != null && v !== '') { const n = Number(v); valor = Number.isFinite(n) ? n : v; }
        fila[col] = valor;
      }
      filas[idx] = fila;
    }
    const salida = [];
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i] || [];
      const limpia = [];
      for (let j = 0; j < f.length; j++) limpia.push(f[j] === undefined ? null : f[j]);
      salida.push(limpia);
    }
    return salida;
  }

  async function textoDeArchivo(file) {
    const buf = await file.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(buf); // CSV guardado por Excel en Windows
    }
  }

  async function leerArchivo(file) {
    const nombre = (file.name || '').toLowerCase();
    if (nombre.endsWith('.xlsx')) return leerXLSX(await file.arrayBuffer());
    if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return parseCSV(await textoDeArchivo(file));
    if (nombre.endsWith('.xls')) throw new Error('Los archivos .xls (Excel 97-2003) no se pueden leer: abrilo en Excel y guardalo como .xlsx.');
    throw new Error('Formato no reconocido: subí un archivo .xlsx o .csv.');
  }

  /* ── Encabezados y validación ────────────────────────────────────────── */

  const CAMPOS = [
    { key: 'descripcion', etiqueta: 'Descripción', requerido: true, ejemplo: 'Remera oversize negra' },
    { key: 'categoria', etiqueta: 'Categoría', requerido: false, ejemplo: 'Prenda' },
    { key: 'proveedor', etiqueta: 'Proveedor / origen', requerido: false, ejemplo: 'Tienda X, EE. UU.' },
    { key: 'cantidad', etiqueta: 'Cantidad', requerido: true, ejemplo: '3' },
    { key: 'costo', etiqueta: 'Costo unitario (US$)', requerido: true, ejemplo: '12,00' },
    { key: 'peso', etiqueta: 'Peso unitario (kg)', requerido: true, ejemplo: '0,300' },
  ];
  // Orden de reconocimiento: de lo más específico a lo más genérico ("Nombre del proveedor" es proveedor).
  const RECONOCER = [
    ['proveedor', /provee|origen|donde|tienda/],
    ['categoria', /categ|tipo/],
    ['cantidad', /cant|unidades|qty/],
    ['peso', /peso|kg|kilo/],
    ['costo', /costo|usd|us\$|dolar/],
    ['descripcion', /descrip|producto|articulo|nombre|detalle/],
  ];

  function normalizarEncabezado(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/[^a-z0-9$]+/g, ' ').trim();
  }

  function mapearEncabezados(fila) {
    const mapa = {};
    (fila || []).forEach((celda, i) => {
      const h = normalizarEncabezado(celda);
      if (!h) return;
      for (const [key, re] of RECONOCER) {
        if (mapa[key] == null && re.test(h)) { mapa[key] = i; break; }
      }
    });
    return mapa;
  }

  function normalizarCategoria(texto, avisos) {
    const t = texto.trim();
    if (!t) { avisos.push('Sin categoría'); return 'Sin categoría'; }
    const n = normalizarEncabezado(t);
    if (/^prend/.test(n)) return 'Prenda';
    if (/^acces/.test(n)) return 'Accesorio';
    avisos.push('Categoría nueva: "' + t + '"');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  const texto = (x) => (x == null ? '' : String(x).trim());

  /**
   * Convierte la matriz leída en productos validados.
   * Devuelve { filas: [...], faltan: [etiquetas], filaEncabezado } — cada fila trae errores y avisos.
   */
  function validar(matriz) {
    let filaEnc = -1;
    let mapa = {};
    for (let i = 0; i < Math.min(matriz.length, 15); i++) {
      const m = mapearEncabezados(matriz[i]);
      if (Object.keys(m).length >= 3) { filaEnc = i; mapa = m; break; }
    }
    if (filaEnc < 0) {
      return { filas: [], filaEncabezado: -1, faltan: CAMPOS.filter((c) => c.requerido).map((c) => c.etiqueta) };
    }
    const faltan = CAMPOS.filter((c) => c.requerido && mapa[c.key] == null).map((c) => c.etiqueta);
    const filas = [];
    for (let i = filaEnc + 1; i < matriz.length; i++) {
      const celdas = matriz[i] || [];
      const get = (k) => (mapa[k] == null ? null : celdas[mapa[k]]);
      const f = {
        fila: i + 1,
        descripcion: texto(get('descripcion')),
        categoria: '',
        proveedor: texto(get('proveedor')),
        cantidad: null, costo: null, peso: null,
        errores: [], avisos: [],
      };
      if (!f.descripcion && ['cantidad', 'costo', 'peso', 'categoria', 'proveedor'].every((k) => texto(get(k)) === '')) continue;
      if (!f.descripcion) f.errores.push('Falta la descripción');
      f.categoria = normalizarCategoria(texto(get('categoria')), f.avisos);

      const cant = C.parseEntero(typeof get('cantidad') === 'number' ? get('cantidad') : texto(get('cantidad')));
      if (cant == null || cant < 1) f.errores.push('Cantidad inválida: tiene que ser un número entero de 1 o más');
      else f.cantidad = cant;

      const costo = C.parseNum(get('costo'), 'decimal');
      if (!costo || C.isZero(costo)) f.errores.push('Costo en US$ inválido');
      else f.costo = costo;

      const peso = C.parseNum(get('peso'), 'decimal');
      if (peso == null) f.errores.push('Peso en kg inválido');
      else {
        f.peso = peso;
        if (C.isZero(peso)) f.avisos.push('Peso 0 kg: no suma costo de envío');
        else if (C.cmp(peso, C.Q(20n)) > 0) f.errores.push('¿Peso en gramos? ' + C.fmtKg(peso) + ' no puede ser: va en kilos (300 gramos = 0,300)');
      }
      filas.push(f);
    }
    return { filas: filas, filaEncabezado: filaEnc + 1, faltan: faltan };
  }

  return { CAMPOS: CAMPOS, parseCSV: parseCSV, leerXLSX: leerXLSX, leerArchivo: leerArchivo, validar: validar, mapearEncabezados: mapearEncabezados };
});

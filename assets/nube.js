/*!
 * berry.Glow_py — La nube: los mismos datos en todos los aparatos.
 *
 * Cómo funciona (etapa 1, ver docs/HANDOFF.md §18):
 *  · Cada persona entra con su cuenta. Lo que ve y puede hacer sale del rol que tiene esa cuenta en la base,
 *    no de un botón de la pantalla.
 *  · Los datos son el mismo documento que usa el sistema (BG.db), guardado en una sola fila de Supabase con
 *    un número de versión. Al guardar se manda «yo tenía la versión N»: si otro aparato guardó primero, el
 *    servidor no pisa nada y acá se vuelve a leer y se avisa.
 *  · Un aviso en vivo (tabla liviana) hace que el otro aparato se entere al toque y vuelva a leer.
 *  · Si no hay internet, el sistema sigue andando con la copia de este aparato y reintenta guardar solo.
 *
 * Si la biblioteca de Supabase no se puede cargar (sin internet, o abriendo el archivo con doble clic),
 * todo esto queda apagado y el sistema funciona como antes, guardando en este aparato.
 */
(function () {
  'use strict';
  const BG = window.BG;

  const CFG = {
    url: 'https://eurqbdatmsrqaogpiyqv.supabase.co',
    // Clave pública: está pensada para ir en la página. Lo que protege los datos son las reglas de la base
    // (sin cuenta no se ve nada) y no el secreto de esta clave.
    clave: 'sb_publishable_ZldDmTzmPla-hro_UBvXGw_EyixUHHv',
    // La biblioteca viaja con el sistema (assets/supabase.js), así ningún bloqueador de navegador la corta.
    // Si por algo no estuviera, se intenta traerla de internet como respaldo.
    biblioteca: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  };
  const KEY_ENTRADO = 'berryglow.nube.entrado';   // pista rápida para no mostrar la pantalla equivocada al abrir
  const KEY_CACHE = 'berryglow.nube.cache';       // copia local de lo que hay en la nube (para abrir rápido y sin internet)
  const KEY_DESCARTADO = 'berryglow.nube.descartado'; // último cambio que no se pudo guardar (ver «conflicto»)
  const KEY_SOLO_ACA = 'berryglow.nube.soloaca';      // esta persona eligió trabajar sin cuenta en este aparato

  const N = {
    configurada: !!(CFG.url && CFG.clave),
    disponible: false,   // la biblioteca cargó
    activa: false,       // hay sesión y estamos trabajando con los datos de la nube
    estado: 'apagada',   // apagada | conectando | sin-cuenta | al-dia | guardando | sin-conexion | conflicto | version-nueva
    version: 0,
    actualizado: '',
    por: '',
    perfil: null,        // { id, nombre, rol, permisos, comision } del servidor
    correo: '',
  };
  BG.nube = N;
  BG.entradoAntes = () => { try { return localStorage.getItem(KEY_ENTRADO) === '1'; } catch (e) { return false; } };
  /** «Entrar solo en este aparato»: se recuerda, así no se le vuelve a pedir la cuenta en cada apertura. */
  BG.soloAca = (valor) => {
    try {
      if (valor === undefined) return localStorage.getItem(KEY_SOLO_ACA) === '1';
      if (valor) localStorage.setItem(KEY_SOLO_ACA, '1'); else localStorage.removeItem(KEY_SOLO_ACA);
    } catch (e) { /* sin almacenamiento */ }
    return !!valor;
  };

  let sb = null;
  let canal = null;
  let pendiente = false;
  let empujando = false;

  const marcarEntrado = (si) => { try { si ? localStorage.setItem(KEY_ENTRADO, '1') : localStorage.removeItem(KEY_ENTRADO); } catch (e) { /* sin almacenamiento */ } };

  /** Texto corto para la franja de arriba: la persona tiene que saber siempre si lo suyo está guardado. */
  N.texto = () => ({
    conectando: 'Conectando…',
    'al-dia': 'Guardado en la nube',
    guardando: 'Guardando…',
    'sin-conexion': 'Sin internet: se guarda en este aparato y se sube solo',
    conflicto: 'Hubo un cambio desde otro aparato',
    'version-nueva': 'Hay una versión nueva: recargá la página para seguir guardando',
  })[N.estado] || '';

  /**
   * El documento de la nube lo guardó un aparato con una versión más nueva del sistema y este no lo sabe leer.
   * Se frena todo ANTES de tocar el número de versión: así este aparato no puede subir encima sus datos viejos
   * (pasaba: se anotaba la versión nueva, fallaba la lectura y el próximo guardado pisaba lo del otro aparato).
   */
  function frenarPorVersion() {
    N.bloqueada = true;
    pendiente = false;
    estado('version-nueva');
    BG.toast('Desde otro aparato se guardó con una versión más nueva del sistema. Recargá la página antes de seguir: así no se pisa nada.', 'error');
    if (BG.controlarVersion) BG.controlarVersion();
    BG.render();   // muestra el aviso con «Recargar» en lugar de la pantalla en la que estaba
  }

  const OPCIONES = { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } };
  async function cliente() {
    if (sb) return sb;
    let crear = window.supabase && window.supabase.createClient;   // la que viene con el sistema
    if (!crear) {
      const m = await import(/* webpackIgnore: true */ CFG.biblioteca);   // respaldo por internet
      crear = m.createClient;
    }
    sb = crear(CFG.url, CFG.clave, OPCIONES);
    N.disponible = true;
    return sb;
  }

  const refrescar = () => {
    if (!document.querySelector('.app')) { if (!BG.sesion) BG.render(); return; }   // seguimos en la pantalla de ingreso
    if (BG.pintarNube) BG.pintarNube();
  };
  const estado = (e) => { N.estado = e; refrescar(); };

  /* ── Entrar y salir ──────────────────────────────────────────────────── */

  /** Arranca al abrir la página: si este aparato ya tiene sesión, trae los datos. */
  N.arrancar = async () => {
    if (!N.configurada) return;
    estado('conectando');
    let c;
    try {
      c = await cliente();
    } catch (e) {
      N.falla = 'No se pudo cargar la conexión con la nube. Puede ser el bloqueador del navegador (en Brave, el escudo) o que no haya internet.';
      N.estado = 'apagada';
      refrescar();
      return;
    }
    let ses = null;
    try { ses = (await c.auth.getSession()).data.session; } catch (e) { ses = null; }
    if (!ses) {
      marcarEntrado(false);
      // Aparato que ya venía con una sesión elegida a mano (de antes de las cuentas): que vea la pantalla de
      // cuentas al menos una vez. Lo suyo no se toca: sigue guardado en este aparato.
      if (BG.sesion && !BG.soloAca()) { BG.sesion = null; BG.guardarSesion(); }
      estado('sin-cuenta');
      BG.render();
      return;
    }
    await usarSesion(ses);
  };

  N.entrar = async (correo, clave) => {
    const c = await cliente();
    const { data, error } = await c.auth.signInWithPassword({ email: String(correo || '').trim(), password: String(clave || '') });
    if (error) throw new Error(traducir(error.message));
    await usarSesion(data.session);
    return N.perfil;
  };

  N.salir = async () => {
    try { if (canal && sb) { await sb.removeChannel(canal); canal = null; } } catch (e) { /* ya estaba cortado */ }
    try { if (sb) await sb.auth.signOut(); } catch (e) { /* igual salimos */ }
    marcarEntrado(false);
    N.activa = false;
    N.perfil = null;
    N.correo = '';
    N.version = 0;
    estado('sin-cuenta');
    BG.sesion = null;
    BG.guardarSesion();
    BG.volverALocal();
  };

  const traducir = (m) => {
    const t = String(m || '');
    if (/Invalid login credentials/i.test(t)) return 'El correo o la contraseña no son correctos.';
    if (/Email not confirmed/i.test(t)) return 'Esa cuenta todavía no está confirmada.';
    if (/rate limit|too many/i.test(t)) return 'Demasiados intentos seguidos: esperá un minuto y probá de nuevo.';
    if (/Failed to fetch|NetworkError/i.test(t)) return 'No hay internet o no se llega al servidor.';
    return t;
  };

  async function usarSesion(ses) {
    const c = await cliente();
    N.correo = (ses.user && ses.user.email) || '';
    estado('conectando');
    let perfil;
    try {
      const { data, error } = await c.rpc('mi_perfil');
      if (error) throw new Error(traducir(error.message));
      perfil = data;
    } catch (e) {
      marcarEntrado(false);
      N.activa = false;
      estado('sin-cuenta');
      BG.toast(e.message || 'Esa cuenta todavía no está habilitada.', 'error');
      try { await c.auth.signOut(); } catch (x) { /* nada */ }
      BG.render();
      return;
    }
    N.perfil = perfil;
    marcarEntrado(true);
    await traerDocumento(true);
    escuchar();
  }

  /* ── Traer y guardar el documento ────────────────────────────────────── */

  async function leerFila() {
    const c = await cliente();
    const { data, error } = await c.from('tienda').select('version, datos, actualizado, por').eq('id', 1).single();
    if (error) throw new Error(traducir(error.message));
    return data;
  }

  /** Primera carga: si la nube está vacía, sube lo que corresponda; si no, usa lo que hay. */
  async function traerDocumento(primera) {
    let fila;
    try {
      fila = await leerFila();
    } catch (e) {
      // Sin internet: se trabaja con la última copia de este aparato y se reintenta al guardar.
      const cache = BG.leer(KEY_CACHE);
      if (cache && cache.datos && !BG.datosSirven(cache.datos)) { N.activa = true; frenarPorVersion(); BG.render(); return; }
      if (cache && cache.datos) { N.version = cache.version || 0; BG.usarDatosDeLaNube(cache.datos); }
      N.activa = true;
      estado('sin-conexion');
      if (cache && cache.sinSubir) { pendiente = true; setTimeout(() => { empujar(); }, 6000); }   // lo que quedó sin subir se reintenta solo
      BG.render();
      return;
    }
    const vacia = !fila.datos || !Array.isArray(fila.datos.clientes);
    if (vacia) {
      // La nube está vacía: si el dueño ya tenía cargado algo en este aparato, eso es lo que sube.
      const mios = BG.datosDeEsteAparato();
      const subeLoDeAca = !!(mios && (mios.clientes.length || mios.productos.length || mios.ventas.length) && BG.esDuenaPerfil(N.perfil));
      N.version = fila.version || 0;
      N.activa = true;
      BG.usarDatosDeLaNube(subeLoDeAca ? mios : window.BGSeed.vacio(BG.hoy()));
      await empujarAhora(true);
      if (subeLoDeAca) BG.toast('Subimos a la nube lo que tenías cargado en este aparato: ' + mios.clientes.length + ' clientas y ' + mios.ventas.length + ' ventas.');
    } else {
      if (!BG.datosSirven(fila.datos)) { N.activa = true; frenarPorVersion(); BG.render(); return; }
      N.version = fila.version;
      N.actualizado = fila.actualizado;
      N.por = fila.por;
      N.activa = true;
      // Trabajo de este aparato que quedó sin subir (sin internet, o se cerró antes de que subiera): nunca se pisa en silencio.
      //  · Si nadie más guardó mientras tanto (misma versión), se sigue con lo de este aparato y se sube.
      //  · Si otro aparato guardó, no se puede mezclar solo: lo de acá se guarda aparte, se muestra qué hay que repetir y se usa lo de la nube.
      const cache = BG.leer(KEY_CACHE);
      const sinSubir = !!(cache && cache.sinSubir && cache.datos && BG.datosSirven(cache.datos));
      if (sinSubir && cache.version === fila.version) {
        BG.usarDatosDeLaNube(cache.datos);
        pendiente = true;
        estado('guardando');
        setTimeout(() => { empujar(); }, 120);
        BG.toast('Había cambios de este aparato sin subir: se están subiendo ahora.');
      } else {
        if (sinSubir) BG.escribir(KEY_DESCARTADO, { ts: BG.ahora(), datos: cache.datos, version: cache.version });
        BG.usarDatosDeLaNube(fila.datos);
        BG.escribir(KEY_CACHE, { version: fila.version, datos: fila.datos, sinSubir: false });
        estado(sinSubir ? 'conflicto' : 'al-dia');
        if (sinSubir) setTimeout(avisarDescartado, 300);
      }
    }
    ajustarSesion();
    if (primera && (!location.hash || location.hash === '#/')) location.hash = '#/inicio';
    BG.renderChrome();
    BG.render();
  }

  /** El usuario del documento que corresponde a la cuenta con la que se entró. Nunca al revés. */
  function ajustarSesion() {
    if (!N.perfil || !BG.db) return;
    const u = BG.db.usuarios.find((x) => x.rol === N.perfil.rol) || BG.db.usuarios[0];
    if (!BG.sesion || BG.sesion.usuarioId !== u.id || BG.sesion.rol !== u.rol) {
      BG.sesion = { usuarioId: u.id, rol: u.rol };
      BG.guardarSesion();
    }
  }

  /** Se llama en cada BG.guardar(): junta los cambios de la ráfaga y los sube una sola vez. */
  N.cambio = () => {
    if (!N.activa) return true;
    // Con la nube frenada por versión no se sube nada: lo hecho queda en este aparato hasta recargar.
    if (N.bloqueada) { BG.escribir(KEY_DESCARTADO, { ts: BG.ahora(), datos: BG.db }); estado('version-nueva'); return false; }
    pendiente = true;
    const ok = BG.escribir(KEY_CACHE, { version: N.version, datos: BG.db, sinSubir: true });
    if (!ok) BG.toast('No hay lugar en este navegador para la copia de seguridad local. Lo que cargues se sube a la nube igual, pero liberá espacio en el navegador.', 'error');
    if (!empujando) setTimeout(() => { empujar(); }, 120);
    return ok;
  };

  async function empujar() { if (!empujando && pendiente) await empujarAhora(false); }

  async function empujarAhora(forzar) {
    if (empujando || !N.activa || N.bloqueada) return;
    if (!pendiente && !forzar) return;
    empujando = true;
    pendiente = false;
    estado('guardando');
    const enviado = BG.db;
    try {
      const c = await cliente();
      const { data, error } = await c.rpc('guardar_tienda', { p_version: N.version, p_datos: enviado });
      if (error) throw error;
      N.version = data.version;
      N.actualizado = data.actualizado;
      N.por = data.por;
      BG.escribir(KEY_CACHE, { version: N.version, datos: enviado, sinSubir: pendiente });   // si se cambió algo mientras subía, sigue sin subir
      estado('al-dia');
    } catch (e) {
      const msg = (e && (e.message || e.details)) || '';
      if (/VERSION_VIEJA/.test(msg)) {
        // Otro aparato guardó primero. Lo último de acá no se sube: se guarda aparte y se avisa.
        BG.escribir(KEY_DESCARTADO, { ts: BG.ahora(), datos: enviado });
        empujando = false;
        await traerDeNuevo('conflicto');
        return;
      }
      pendiente = true;
      estado('sin-conexion');
      setTimeout(() => { empujando = false; empujar(); }, 6000);
      return;
    }
    empujando = false;
    if (pendiente) setTimeout(empujar, 120);
  }

  /** Vuelve a leer la nube y reemplaza lo que hay en pantalla. */
  async function traerDeNuevo(motivo, quien) {
    let fila;
    try { fila = await leerFila(); } catch (e) { estado('sin-conexion'); return; }
    if (!fila.datos || !Array.isArray(fila.datos.clientes)) return;
    // Primero se mira si este sistema sabe leerlo; recién después se anota la versión (ver frenarPorVersion).
    if (!BG.datosSirven(fila.datos)) { frenarPorVersion(); return; }
    N.version = fila.version;
    N.actualizado = fila.actualizado;
    N.por = fila.por;
    BG.usarDatosDeLaNube(fila.datos);
    BG.escribir(KEY_CACHE, { version: fila.version, datos: fila.datos, sinSubir: false });
    ajustarSesion();
    estado(motivo === 'conflicto' ? 'conflicto' : 'al-dia');
    BG.renderChrome();
    BG.render();
    if (motivo === 'conflicto') {
      BG.toast('Lo último no se guardó: ' + esc(fila.por) + ' guardó al mismo tiempo desde otro aparato. Mirá cómo quedó y repetí esa operación.', 'error');
      avisarDescartado();
    } else if (quien && quien !== (N.perfil && N.perfil.nombre)) {
      BG.toast('Se actualizó con lo que cargó ' + esc(quien) + '.');
    }
  }
  const esc = (s) => String(s == null ? '' : s);

  /* ── Aviso en vivo ───────────────────────────────────────────────────── */

  function escuchar() {
    if (!sb || canal) return;
    canal = sb.channel('aviso-tienda')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tienda_aviso' }, (p) => {
        const v = p.new && p.new.version;
        if (!v || v <= N.version || empujando) return;
        if (pendiente) { setTimeout(() => { empujar(); }, 120); return; }   // hay cambios de acá sin subir: se suben primero (el servidor frena si chocan)
        traerDeNuevo('remoto', p.new.por);
      })
      .subscribe();
  }

  /* ── Lo que no se pudo guardar ───────────────────────────────────────── */

  /**
   * Qué tenía el documento que no se pudo subir y no está en el que quedó (registros nuevos de este aparato), para que la
   * persona sepa qué repetir. No mezcla nada: solo lista. Lo que se cambió de algo que ya existía (una anulación, una
   * devolución) no se puede distinguir de lo que cambió el otro aparato; por eso el aviso lo dice aparte.
   */
  N.queSePierde = (descartado, actual) => {
    const D = descartado || {};
    const Ac = actual || {};
    const ids = (l) => new Set((l || []).map((x) => x.id));
    const nombre = (id) => { const c = (D.clientes || []).find((x) => x.id === id) || (Ac.clientes || []).find((x) => x.id === id); return c ? c.nombre : 'una clienta'; };
    const nuevos = (k) => { const a = ids(Ac[k]); return (D[k] || []).filter((x) => !a.has(x.id)); };
    const recibo = (n) => 'N° ' + String(n || 0).padStart(6, '0');
    const filas = [];
    nuevos('clientes').forEach((x) => filas.push('Clienta nueva: ' + x.nombre));
    nuevos('productos').forEach((x) => filas.push('Producto cargado: ' + x.descripcion));
    nuevos('ventas').forEach((v) => filas.push('Venta ' + recibo(v.recibo) + ' · ' + nombre(v.clienteId) + ' · ' + BG.gs(v.total)));
    nuevos('pagos').forEach((p) => filas.push((p.ventaId ? 'Cobro ' : 'Seña ') + recibo(p.recibo) + ' · ' + nombre(p.clienteId) + ' · ' + BG.gs((p.total || 0) + (p.excedente || 0))));
    nuevos('egresos').forEach((x) => filas.push('Plata devuelta a ' + nombre(x.clienteId) + ' · ' + BG.gs(x.monto)));
    nuevos('canjes').forEach((x) => filas.push('Canje de puntos de ' + nombre(x.clienteId)));
    nuevos('gastos').forEach((x) => filas.push('Gasto: ' + x.concepto + ' · ' + BG.gs(x.monto)));
    nuevos('reservas').forEach((x) => filas.push('Apartado de ' + nombre(x.clienteId)));
    nuevos('deseos').forEach((x) => filas.push('Pedido anotado: ' + x.texto));
    nuevos('conteos').forEach(() => filas.push('Conteo de inventario'));
    nuevos('ahorro').forEach((x) => filas.push('Movimiento de la cuenta de ahorro · ' + BG.gs(x.monto)));
    nuevos('envios').forEach((x) => filas.push('Envío ' + x.numero));
    return filas;
  };
  const htmlPerdido = (filas) => '<p>Otro aparato guardó al mismo tiempo y esto, que se había cargado en <strong>este</strong> aparato, no quedó guardado. '
    + 'Hay que <strong>cargarlo de nuevo</strong>:</p><ul class="efecto-lista">' + filas.map((f) => '<li>' + BG.esc(f) + '</li>').join('') + '</ul>'
    + '<p class="hint">Si además anulaste o cambiaste algo que ya existía desde este aparato, revisalo: puede que también haya que repetirlo.</p>';
  /** Muestra qué no se guardó (si hay algo) con un botón para dejarlo anotado como hecho. */
  function avisarDescartado() {
    const d = BG.leer(KEY_DESCARTADO);
    if (!d || !d.datos || !BG.db || !BG.modal) return;
    const filas = N.queSePierde(d.datos, BG.db);
    if (!filas.length) return;
    BG.modal({ titulo: 'Esto no se guardó: cargalo de nuevo', cuerpo: htmlPerdido(filas), acciones: [{ texto: 'Ya lo repito', valor: 'ok', clase: 'btn-primary' }] });
  }
  N.avisarDescartado = avisarDescartado;
  /** Aviso fijo en Inicio mientras haya algo sin repetir. */
  BG.htmlAvisoDescartado = () => {
    const d = BG.leer(KEY_DESCARTADO);
    if (!d || !d.datos || !BG.db) return '';
    const filas = N.queSePierde(d.datos, BG.db);
    if (!filas.length) return '';
    return '<div class="callout callout-warn">' + BG.icon('alert') + '<div><strong>Hay ' + filas.length + (filas.length === 1 ? ' cosa' : ' cosas') + ' de este aparato que no se guardaron.</strong> '
      + '<button type="button" class="linkish" data-nube="ver">Ver cuáles</button> · <button type="button" class="linkish" data-nube="listo">Ya las repetí</button></div></div>';
  };
  N.limpiarDescartado = () => { try { localStorage.removeItem(KEY_DESCARTADO); } catch (e) { /* sin almacenamiento */ } };
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-nube]') : null;
      if (!b) return;
      if (b.dataset.nube === 'ver') avisarDescartado();
      else if (b.dataset.nube === 'listo') { N.limpiarDescartado(); BG.toast('Listo: el aviso se sacó.'); BG.render(); }
    });
  }

  /** Para el recorrido de pruebas y para reintentar a mano. */
  N.sincronizar = async () => { if (N.activa) await traerDeNuevo('manual'); };
  N.descartado = () => BG.leer(KEY_DESCARTADO);
  N.KEY_CACHE = KEY_CACHE;
})();

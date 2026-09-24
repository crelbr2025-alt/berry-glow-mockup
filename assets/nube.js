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
    biblioteca: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  };
  const KEY_ENTRADO = 'berryglow.nube.entrado';   // pista rápida para no mostrar la pantalla equivocada al abrir
  const KEY_CACHE = 'berryglow.nube.cache';       // copia local de lo que hay en la nube (para abrir rápido y sin internet)
  const KEY_DESCARTADO = 'berryglow.nube.descartado'; // último cambio que no se pudo guardar (ver «conflicto»)

  const N = {
    configurada: !!(CFG.url && CFG.clave),
    disponible: false,   // la biblioteca cargó
    activa: false,       // hay sesión y estamos trabajando con los datos de la nube
    estado: 'apagada',   // apagada | conectando | sin-cuenta | al-dia | guardando | sin-conexion | conflicto
    version: 0,
    actualizado: '',
    por: '',
    perfil: null,        // { id, nombre, rol, permisos, comision } del servidor
    correo: '',
  };
  BG.nube = N;
  BG.entradoAntes = () => { try { return localStorage.getItem(KEY_ENTRADO) === '1'; } catch (e) { return false; } };

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
  })[N.estado] || '';

  async function cliente() {
    if (sb) return sb;
    const m = await import(/* webpackIgnore: true */ CFG.biblioteca);
    sb = m.createClient(CFG.url, CFG.clave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
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
    try { c = await cliente(); } catch (e) { N.estado = 'apagada'; refrescar(); return; }
    let ses = null;
    try { ses = (await c.auth.getSession()).data.session; } catch (e) { ses = null; }
    if (!ses) { marcarEntrado(false); estado('sin-cuenta'); BG.render(); return; }
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
      if (cache && cache.datos) { N.version = cache.version || 0; BG.usarDatosDeLaNube(cache.datos); }
      N.activa = true;
      estado('sin-conexion');
      BG.render();
      return;
    }
    const vacia = !fila.datos || !Array.isArray(fila.datos.clientes);
    if (vacia) {
      const mios = BG.datosDeEsteAparato();
      const conCosas = mios && (mios.clientes.length || mios.productos.length || mios.ventas.length);
      let db = mios && conCosas && BG.esDuenaPerfil(N.perfil) ? mios : window.BGSeed.vacio(BG.hoy());
      if (mios && conCosas && BG.esDuenaPerfil(N.perfil)) BG.avisoSubida = { clientes: mios.clientes.length, ventas: mios.ventas.length };
      N.version = fila.version || 0;
      N.activa = true;
      BG.usarDatosDeLaNube(db);
      await empujarAhora(true);
    } else {
      N.version = fila.version;
      N.actualizado = fila.actualizado;
      N.por = fila.por;
      N.activa = true;
      BG.usarDatosDeLaNube(fila.datos);
      BG.escribir(KEY_CACHE, { version: fila.version, datos: fila.datos });
      estado('al-dia');
    }
    if (primera) {
      const u = BG.db.usuarios.find((x) => x.rol === N.perfil.rol) || BG.db.usuarios[0];
      BG.sesion = { usuarioId: u.id, rol: u.rol };
      BG.guardarSesion();
      if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
    }
    BG.renderChrome();
    BG.render();
  }

  /** Se llama en cada BG.guardar(): junta los cambios de la ráfaga y los sube una sola vez. */
  N.cambio = () => {
    if (!N.activa) return true;
    pendiente = true;
    const ok = BG.escribir(KEY_CACHE, { version: N.version, datos: BG.db });
    if (!empujando) setTimeout(() => { empujar(); }, 120);
    return ok;
  };

  async function empujar() { if (!empujando && pendiente) await empujarAhora(false); }

  async function empujarAhora(forzar) {
    if (empujando || !N.activa) return;
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
      BG.escribir(KEY_CACHE, { version: N.version, datos: enviado });
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
    N.version = fila.version;
    N.actualizado = fila.actualizado;
    N.por = fila.por;
    BG.usarDatosDeLaNube(fila.datos);
    BG.escribir(KEY_CACHE, { version: fila.version, datos: fila.datos });
    estado(motivo === 'conflicto' ? 'conflicto' : 'al-dia');
    BG.renderChrome();
    BG.render();
    if (motivo === 'conflicto') {
      BG.toast('Lo último no se guardó: ' + esc(fila.por) + ' guardó al mismo tiempo desde otro aparato. Mirá cómo quedó y repetí esa operación.', 'error');
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
        traerDeNuevo('remoto', p.new.por);
      })
      .subscribe();
  }

  /** Para el recorrido de pruebas y para reintentar a mano. */
  N.sincronizar = async () => { if (N.activa) await traerDeNuevo('manual'); };
  N.descartado = () => BG.leer(KEY_DESCARTADO);
  N.KEY_CACHE = KEY_CACHE;
})();

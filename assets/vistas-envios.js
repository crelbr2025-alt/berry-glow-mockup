/*!
 * berry.Glow_py — Envíos por encomienda o transportadora desde Coronel Oviedo:
 * listado, preparación con requisitos, seguimiento (guía y estados) y etiqueta lista para pegar.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const C = BG.C;
  const { $, $$, esc, gs, sum, icon } = BG;

  /** Ciudades frecuentes de Paraguay con su departamento (se puede escribir otra). */
  BG.CIUDADES_PY = [
    ['Asunción', 'Capital'], ['San Lorenzo', 'Central'], ['Luque', 'Central'], ['Capiatá', 'Central'], ['Lambaré', 'Central'],
    ['Fernando de la Mora', 'Central'], ['Limpio', 'Central'], ['Ñemby', 'Central'], ['Mariano Roque Alonso', 'Central'],
    ['Villa Elisa', 'Central'], ['San Antonio', 'Central'], ['Itauguá', 'Central'], ['Areguá', 'Central'],
    ['Ciudad del Este', 'Alto Paraná'], ['Hernandarias', 'Alto Paraná'], ['Presidente Franco', 'Alto Paraná'], ['Minga Guazú', 'Alto Paraná'], ['Santa Rita', 'Alto Paraná'],
    ['Encarnación', 'Itapúa'], ['Hohenau', 'Itapúa'], ['Villarrica', 'Guairá'],
    ['Caaguazú', 'Caaguazú'], ['Coronel Oviedo', 'Caaguazú'], ['Dr. J. Eulogio Estigarribia', 'Caaguazú'], ['Repatriación', 'Caaguazú'], ['Carayaó', 'Caaguazú'],
    ['Pedro Juan Caballero', 'Amambay'], ['Concepción', 'Concepción'], ['Salto del Guairá', 'Canindeyú'], ['Curuguaty', 'Canindeyú'],
    ['San Pedro del Ycuamandiyú', 'San Pedro'], ['Santa Rosa del Aguaray', 'San Pedro'], ['San Estanislao', 'San Pedro'],
    ['Caacupé', 'Cordillera'], ['Paraguarí', 'Paraguarí'], ['Pilar', 'Ñeembucú'], ['San Juan Bautista', 'Misiones'],
    ['Caazapá', 'Caazapá'], ['Villa Hayes', 'Presidente Hayes'], ['Filadelfia', 'Boquerón'],
  ];
  const deptoDe = (ciudad) => { const x = BG.CIUDADES_PY.find((c) => BG.norm(c[0]) === BG.norm(ciudad)); return x ? x[1] : ''; };

  const PILL = { preparando: 'pill-muted', listo: 'pill-berry', despachado: 'pill-warn', entregado: 'pill-good', cancelado: 'pill-bad' };
  const ICONO = { preparando: 'box2', listo: 'tag', despachado: 'truck', entregado: 'check', cancelado: 'ban' };
  BG.pillEnvio = (e) => '<span class="pill ' + PILL[e.estado] + '">' + icon(ICONO[e.estado]) + BG.ESTADOS_ENVIO[e.estado] + '</span>';
  const envio = (id) => BG.db.envios.find((x) => x.id === id);
  BG.envioDeVenta = (vid) => BG.db.envios.find((x) => x.ventaId === vid && x.estado !== 'cancelado');
  const PAGA = { destinatario: 'Paga el destinatario al retirar', tienda: 'Lo paga la tienda' };

  /* ── Listado ─────────────────────────────────────────────────────────── */

  BG.vistas.envios = (args, params) => {
    const e = { estado: params.get('estado') || 'activos', q: '' };
    const n = (est) => BG.db.envios.filter((x) => x.estado === est).length;
    const activos = n('preparando') + n('listo') + n('despachado');
    const chip = (k, t, c) => '<button type="button" class="chip" data-estado="' + k + '" aria-pressed="' + (e.estado === k) + '">' + t + ' <span class="count">' + c + '</span></button>';
    const origen = BG.db.config.envios.origen;
    const html = '<div class="page">'
      + '<div class="page-head"><div><h1 class="page-title">Envíos</h1><p class="page-sub">Encomiendas y courier desde ' + esc(origen.ciudad) + ' (' + esc(origen.departamento) + '), con etiqueta lista para pegar.</p></div>'
      + '<div class="page-actions"><a class="btn btn-primary" href="#/envios/nuevo">' + icon('plus') + 'Nuevo envío</a></div></div>'
      + '<div class="tiles tiles-4">'
      + '<a class="tile tile-link" href="#/envios?estado=preparando"><span class="tile-label">Preparando</span><span class="tile-value">' + n('preparando') + '</span><span class="tile-sub">falta completar o empaquetar</span></a>'
      + '<a class="tile tile-link" href="#/envios?estado=listo"><span class="tile-label">Listos para despachar</span><span class="tile-value">' + n('listo') + '</span><span class="tile-sub">etiqueta pegada, falta llevar</span></a>'
      + '<a class="tile tile-link" href="#/envios?estado=despachado"><span class="tile-label">En camino</span><span class="tile-value">' + n('despachado') + '</span><span class="tile-sub">con número de guía</span></a>'
      + '<a class="tile tile-link" href="#/envios?estado=entregado"><span class="tile-label">Entregados</span><span class="tile-value">' + n('entregado') + '</span><span class="tile-sub">confirmados</span></a></div>'
      + '<div class="toolbar"><div class="search-box grow"><label class="sr-only" for="q-envios">Buscar envío</label>' + icon('search')
      + '<input id="q-envios" class="search-input" type="search" autocomplete="off" placeholder="Cliente, ciudad, empresa o número de guía"></div>'
      + '<div class="chips" role="group" aria-label="Estado">' + chip('activos', 'En curso', activos) + chip('preparando', 'Preparando', n('preparando'))
      + chip('listo', 'Listos', n('listo')) + chip('despachado', 'En camino', n('despachado')) + chip('entregado', 'Entregados', n('entregado')) + chip('todos', 'Todos', BG.db.envios.length) + '</div></div>'
      + '<ul class="list" id="lista-envios"></ul></div>';
    const pintar = (root) => {
      const q = BG.norm(e.q.trim());
      let lista = BG.db.envios.slice().sort((a, b) => b.creado.localeCompare(a.creado));
      if (e.estado === 'activos') lista = lista.filter((x) => ['preparando', 'listo', 'despachado'].indexOf(x.estado) >= 0);
      else if (e.estado !== 'todos') lista = lista.filter((x) => x.estado === e.estado);
      if (q) lista = lista.filter((x) => BG.norm([x.numero, x.destinatario.nombre, x.destinatario.ciudad, x.empresa, x.guia].join(' ')).includes(q));
      $('#lista-envios', root).innerHTML = lista.length ? lista.map((x) => '<li><a class="list-row" href="#/envios/' + x.id + '">'
        + '<span class="avatar">' + icon(ICONO[x.estado], 'i-sm') + '</span>'
        + '<span class="row-main"><span class="row-title">' + esc(x.destinatario.nombre) + ' → ' + esc(x.destinatario.ciudad) + '</span>'
        + '<span class="row-sub">' + esc(x.numero) + ' · ' + esc(x.empresa) + ' · ' + x.bultos + (x.bultos === 1 ? ' bulto' : ' bultos') + (x.guia ? ' · guía ' + esc(x.guia) : '') + ' · ' + BG.fmtFecha(x.creado.slice(0, 10)) + '</span></span>'
        + '<span class="row-end">' + BG.pillEnvio(x) + (x.cobro ? '<span class="small">cobrar ' + gs(x.cobro) + '</span>' : '') + '</span></a></li>').join('')
        : '<li class="empty">No hay envíos con ese filtro. <a href="#/envios/nuevo">Preparar uno nuevo</a></li>';
    };
    return {
      html: html,
      mount: (root) => {
        pintar(root);
        $('#q-envios', root).addEventListener('input', (ev) => { e.q = ev.target.value; pintar(root); });
        $$('[data-estado]', root).forEach((b) => b.addEventListener('click', () => {
          e.estado = b.dataset.estado;
          $$('[data-estado]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          pintar(root);
        }));
      },
    };
  };

  /* ── Preparar o editar un envío ──────────────────────────────────────── */

  function nuevoEnvio(params) {
    const v = params.get('venta') ? BG.venta(params.get('venta')) : null;
    const c = BG.cliente((v && v.clienteId) || params.get('cliente'));
    const empresas = BG.db.config.envios.empresas;
    const ciudad = c && deptoDe(c.direccion) ? BG.CIUDADES_PY.find((x) => BG.norm(x[0]) === BG.norm(c.direccion))[0] : '';
    return {
      ventaId: v ? v.id : null, clienteId: c ? c.id : null,
      destinatario: {
        nombre: c ? c.nombre : '', ci: c ? c.ci : '', telefono: c ? c.telefono : '',
        ciudad: ciudad, departamento: deptoDe(ciudad), modalidad: 'agencia', agencia: 'Terminal de ómnibus', direccion: '', referencia: '',
      },
      empresa: empresas.length ? empresas[0].nombre : '', bultos: 1, pesoKg: '', contenido: 'Ropa y accesorios',
      detalle: v ? v.items.map((it) => it.cantidad + ' × ' + it.descripcion).join(', ') : '',
      valorDeclarado: v ? v.total : 0, fragil: false, seco: true,
      flete: { monto: 0, paga: 'destinatario' }, cobro: 0, cobroActivo: false, guia: '', notas: '',
      checklist: { datos: false, embalaje: false, etiqueta: false, prohibidos: false, cobro: false, comprobante: false },
    };
  }

  BG.vistas.envioForm = (args, params) => {
    const existente = args[0] ? envio(args[0]) : null;
    if (args[0] && !existente) return { html: '<div class="page"><p class="empty">No encontramos ese envío. <a href="#/envios">Ver envíos</a></p></div>' };
    const s = existente ? JSON.parse(JSON.stringify(existente)) : nuevoEnvio(params);
    if (s.cobroActivo == null) s.cobroActivo = s.cobro > 0;
    const v = s.ventaId ? BG.venta(s.ventaId) : null;
    const saldoVenta = v ? BG.saldoVenta(v) : 0;
    const empresas = BG.db.config.envios.empresas;
    const origen = BG.db.config.envios.origen;
    const d = s.destinatario;
    const campo = (id, label, valor, extra) => '<div class="field' + ((extra && extra.span) ? ' span-2' : '') + '"><label for="' + id + '">' + label + ((extra && extra.req) ? ' <span class="req">*</span>' : '') + '</label>'
      + '<input id="' + id + '" class="input" value="' + esc(valor) + '" autocomplete="off" ' + ((extra && extra.attrs) || '') + '>' + ((extra && extra.hint) ? '<span class="hint">' + extra.hint + '</span>' : '') + '</div>';
    const html = '<div class="page">'
      + '<a class="back-link" href="' + (existente ? '#/envios/' + existente.id : '#/envios') + '">' + icon('left', 'i-sm') + (existente ? 'Envío ' + esc(existente.numero) : 'Envíos') + '</a>'
      + '<div class="page-head"><div><h1 class="page-title">' + (existente ? 'Editar envío ' + esc(existente.numero) : 'Preparar envío') + '</h1>'
      + '<p class="page-sub">Sale de ' + esc(origen.ciudad) + ' (' + esc(origen.departamento) + ')' + (v ? ' · venta ' + BG.fmtRecibo(v.recibo) : '') + '. Con esto se imprime la etiqueta para pegar en el paquete.</p></div></div>'
      + (!existente && v && BG.envioDeVenta(v.id) ? '<div class="callout callout-warn">' + icon('alert') + '<div><strong>Esta venta ya tiene el envío ' + esc(BG.envioDeVenta(v.id).numero) + '.</strong> '
        + '<a href="#/envios/' + BG.envioDeVenta(v.id).id + '">Ver ese envío</a>. Si mandás otro paquete aparte, podés seguir.</div></div>' : '')
      + '<div class="grid-form"><div class="stack">'
      + '<section class="card stack" aria-labelledby="t-dest"><h2 class="card-title" id="t-dest">Destinatario</h2><div class="fields">'
      + campo('d-nombre', 'Nombre y apellido', d.nombre, { req: true, span: true })
      + campo('d-ci', 'CI', d.ci, { req: true, attrs: 'inputmode="numeric"', hint: 'La piden para retirar en la agencia.' })
      + campo('d-tel', 'Teléfono', d.telefono, { req: true, attrs: 'type="tel" inputmode="tel"', hint: 'La empresa llama o avisa cuando llega.' })
      + '<div class="field"><label for="d-ciudad">Ciudad de destino <span class="req">*</span></label><input id="d-ciudad" class="input" list="d-ciudades" value="' + esc(d.ciudad) + '" autocomplete="off">'
      + '<datalist id="d-ciudades">' + BG.CIUDADES_PY.filter((c) => c[0] !== origen.ciudad).map((c) => '<option value="' + esc(c[0]) + '">' + esc(c[1]) + '</option>').join('') + '</datalist></div>'
      + campo('d-depto', 'Departamento', d.departamento, { req: true, hint: 'Se completa solo con las ciudades de la lista.' })
      + '<div class="field span-2"><span class="field-label" id="d-mod-l">¿Cómo lo recibe?</span><div class="seg" role="radiogroup" aria-labelledby="d-mod-l">'
      + '<label><input type="radio" name="d-mod" value="agencia"' + (d.modalidad === 'agencia' ? ' checked' : '') + '>Retira en agencia o terminal</label>'
      + '<label><input type="radio" name="d-mod" value="domicilio"' + (d.modalidad === 'domicilio' ? ' checked' : '') + '>Entrega a domicilio</label></div></div>'
      + '<div class="field span-2" id="f-agencia"' + (d.modalidad === 'agencia' ? '' : ' hidden') + '><label for="d-agencia">Agencia o terminal donde retira</label><input id="d-agencia" class="input" value="' + esc(d.agencia) + '" autocomplete="off"></div>'
      + '<div class="field span-2" id="f-dir"' + (d.modalidad === 'domicilio' ? '' : ' hidden') + '><label for="d-dir">Dirección <span class="req">*</span></label><input id="d-dir" class="input" value="' + esc(d.direccion) + '" autocomplete="off"></div>'
      + '<div class="field span-2" id="f-ref"' + (d.modalidad === 'domicilio' ? '' : ' hidden') + '><label for="d-ref">Referencia</label><input id="d-ref" class="input" value="' + esc(d.referencia) + '" autocomplete="off" placeholder="Ej.: frente a la despensa, portón blanco"></div>'
      + '</div></section>'
      + '<section class="card stack" aria-labelledby="t-paq"><h2 class="card-title" id="t-paq">Paquete y transporte</h2><div class="fields">'
      + '<div class="field"><label for="p-empresa">Empresa <span class="req">*</span></label><select id="p-empresa" class="select">'
      + empresas.map((x) => '<option value="' + esc(x.nombre) + '"' + (s.empresa === x.nombre ? ' selected' : '') + '>' + esc(x.nombre) + ' · ' + esc(x.servicio) + '</option>').join('')
      + (s.empresa && !empresas.some((x) => x.nombre === s.empresa) ? '<option selected value="' + esc(s.empresa) + '">' + esc(s.empresa) + '</option>' : '')
      + '<option value="__otra">Otra…</option></select><span class="hint">La lista se edita en Ajustes.</span></div>'
      + '<div class="field" id="f-otra" hidden><label for="p-otra">Nombre de la empresa</label><input id="p-otra" class="input" autocomplete="off"></div>'
      + '<div class="field"><label for="p-bultos">Cantidad de bultos <span class="req">*</span></label><input id="p-bultos" class="input num-input" inputmode="numeric" value="' + s.bultos + '"><span class="hint">Se imprime una etiqueta por bulto.</span></div>'
      + '<div class="field"><label for="p-peso">Peso aproximado</label><div class="suffix-wrap"><input id="p-peso" class="input" inputmode="decimal" data-dec="1" value="' + esc(s.pesoKg ? C.fmtNum(s.pesoKg, 1, 3) : '') + '" placeholder="0,5"><span class="suffix">kg</span></div></div>'
      + campo('p-contenido', 'Contenido declarado', s.contenido, { span: true, hint: 'Genérico: "Ropa y accesorios". Así figura en la etiqueta.' })
      + '<div class="field span-2"><label for="p-detalle">Detalle (interno, no va en la etiqueta)</label><textarea id="p-detalle" class="textarea" rows="2">' + esc(s.detalle) + '</textarea></div>'
      + '<div class="field"><label for="p-valor">Valor declarado</label>' + BG.campoGs('p-valor', s.valorDeclarado) + '<span class="hint">Se declara en el mostrador de la empresa; no se escribe en el paquete.</span></div>'
      + '<div class="field"><span class="field-label">Cuidados</span><label class="check-inline"><input type="checkbox" id="p-fragil"' + (s.fragil ? ' checked' : '') + '> Frágil</label>'
      + '<label class="check-inline"><input type="checkbox" id="p-seco"' + (s.seco ? ' checked' : '') + '> Mantener seco</label></div>'
      + '</div></section>'
      + '<section class="card stack" aria-labelledby="t-flete"><h2 class="card-title" id="t-flete">Flete y cobro</h2><div class="fields">'
      + '<div class="field"><label for="f-monto">Costo del flete</label>' + BG.campoGs('f-monto', s.flete.monto) + '</div>'
      + '<div class="field"><span class="field-label" id="f-paga-l">¿Quién paga el flete?</span><div class="seg" role="radiogroup" aria-labelledby="f-paga-l">'
      + '<label><input type="radio" name="f-paga" value="destinatario"' + (s.flete.paga === 'destinatario' ? ' checked' : '') + '>El destinatario</label>'
      + '<label><input type="radio" name="f-paga" value="tienda"' + (s.flete.paga === 'tienda' ? ' checked' : '') + '>La tienda</label></div></div>'
      + '<div class="field span-2"><label class="check-inline"><input type="checkbox" id="c-activo"' + (s.cobroActivo ? ' checked' : '') + '> Cobro contra entrega (la empresa cobra al entregar)</label>'
      + '<div id="f-cobro"' + (s.cobroActivo ? '' : ' hidden') + '>' + BG.campoGs('c-monto', s.cobro || saldoVenta) + (v ? '<span class="hint">Saldo de esta venta: ' + gs(saldoVenta) + '. Solo si la empresa ofrece el servicio.</span>' : '') + '</div></div>'
      + '<div class="field span-2"><label for="n-notas">Notas</label><input id="n-notas" class="input" value="' + esc(s.notas) + '" autocomplete="off"></div>'
      + '</div></section></div>'
      + '<div class="stack sticky-col"><section class="card stack" aria-labelledby="t-req"><div class="card-head"><h2 id="t-req">Antes de despachar</h2><span class="small muted" id="req-n"></span></div>'
      + '<ul class="checks-list">' + BG.CHECKLIST_ENVIO.map(([k, t]) => '<li><label class="check-inline check-block"><input type="checkbox" data-check="' + k + '"' + (s.checklist[k] ? ' checked' : '') + '> ' + esc(t) + '</label></li>').join('') + '</ul>'
      + '<div class="note-mock">' + icon('info') + '<span>Para pasar a <strong>Listo para despachar</strong> tienen que estar los datos del destinatario y estos controles (menos el comprobante, que se carga al despachar).</span></div>'
      + '<p class="error-text" id="env-err" role="alert" hidden></p>'
      + '<button type="button" class="btn btn-primary btn-lg btn-block" data-accion="guardar">' + icon('check') + (existente ? 'Guardar cambios' : 'Guardar envío') + '</button>'
      + '</section></div></div></div>';

    const leer = (root) => {
      const val = (id) => $('#' + id, root).value.trim();
      const empresa = val('p-empresa') === '__otra' ? val('p-otra') : val('p-empresa');
      const peso = C.parseNum(val('p-peso'), 'decimal');
      return {
        ventaId: s.ventaId, clienteId: s.clienteId,
        destinatario: {
          nombre: val('d-nombre'), ci: val('d-ci'), telefono: val('d-tel'), ciudad: val('d-ciudad'), departamento: val('d-depto'),
          modalidad: $('input[name="d-mod"]:checked', root).value, agencia: val('d-agencia'), direccion: val('d-dir'), referencia: val('d-ref'),
        },
        empresa: empresa, bultos: Math.max(1, C.parseEntero(val('p-bultos')) || 1), pesoKg: peso ? C.qToString(peso) : '',
        contenido: val('p-contenido') || 'Ropa y accesorios', detalle: $('#p-detalle', root).value.trim(), valorDeclarado: BG.leerGs($('#p-valor', root)),
        fragil: $('#p-fragil', root).checked, seco: $('#p-seco', root).checked,
        flete: { monto: BG.leerGs($('#f-monto', root)), paga: $('input[name="f-paga"]:checked', root).value },
        cobroActivo: $('#c-activo', root).checked, cobro: $('#c-activo', root).checked ? BG.leerGs($('#c-monto', root)) : 0,
        notas: val('n-notas'), guia: s.guia,
        checklist: Object.assign({}, s.checklist, $$('[data-check]', root).reduce((o, x) => { o[x.dataset.check] = x.checked; return o; }, {})),
      };
    };
    const contarReq = (root) => { const c = $$('[data-check]', root); $('#req-n', root).textContent = c.filter((x) => x.checked).length + ' de ' + c.length; };
    return {
      html: html,
      mount: (root) => {
        contarReq(root);
        root.addEventListener('change', (ev) => {
          const t = ev.target;
          if (t.name === 'd-mod') { $('#f-agencia', root).hidden = t.value !== 'agencia'; $('#f-dir', root).hidden = t.value !== 'domicilio'; $('#f-ref', root).hidden = t.value !== 'domicilio'; }
          if (t.id === 'p-empresa') { $('#f-otra', root).hidden = t.value !== '__otra'; if (t.value === '__otra') $('#p-otra', root).focus(); }
          if (t.id === 'c-activo') $('#f-cobro', root).hidden = !t.checked;
          if (t.dataset && t.dataset.check) contarReq(root);
        });
        $('#d-ciudad', root).addEventListener('input', (ev) => { const dep = deptoDe(ev.target.value); if (dep) $('#d-depto', root).value = dep; });
        root.addEventListener('click', (ev) => {
          if (!ev.target.closest('[data-accion="guardar"]')) return;
          const datos = leer(root);
          const err = $('#env-err', root);
          const falta = [];
          if (!datos.destinatario.nombre) falta.push('el nombre del destinatario');
          if (!datos.destinatario.ciudad) falta.push('la ciudad de destino');
          if (!datos.empresa) falta.push('la empresa');
          if (BG.norm(datos.destinatario.ciudad) === BG.norm(origen.ciudad)) falta.push('una ciudad distinta de ' + origen.ciudad + ' (es la de origen)');
          if (falta.length) { err.textContent = 'Falta ' + falta.join(', ') + '.'; err.hidden = false; BG.toast(err.textContent, 'error'); return; }
          const guardado = BG.guardarEnvio(datos, existente ? existente.id : null);
          BG.toast((existente ? 'Cambios guardados en ' : 'Envío ') + guardado.numero + (existente ? '.' : ' creado. Ya podés imprimir la etiqueta.'));
          BG.ir('#/envios/' + guardado.id);
        });
        $('#d-nombre', root).focus();
      },
    };
  };

  /* ── Detalle y seguimiento ───────────────────────────────────────────── */

  async function pedirGuia(e) {
    let guia = '';
    const r = await BG.modal({
      titulo: 'Registrar despacho de ' + e.numero,
      cuerpo: '<p>Cargá el número de guía o de comprobante que te dio <strong>' + esc(e.empresa) + '</strong>. Sirve para reclamar y para avisarle al cliente.</p>'
        + '<div class="field"><label for="g-num">Número de guía <span class="req">*</span></label><input id="g-num" class="input" autocomplete="off" value="' + esc(e.guia) + '"><span class="error-text" id="g-err" hidden></span></div>',
      acciones: [{ texto: 'Cancelar', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Registrar despacho', valor: 'ok', clase: 'btn-primary', submit: true }],
      validar: (v, dlg) => {
        guia = $('#g-num', dlg).value.trim();
        if (guia.length >= 3) return true;
        const er = $('#g-err', dlg); er.textContent = 'Escribí el número de guía (lo trae el comprobante de la empresa).'; er.hidden = false;
        return false;
      },
      onMount: (dlg) => $('#g-num', dlg).focus(),
    });
    return r === 'ok' ? guia : null;
  }

  function mensajeCliente(e) {
    const d = e.destinatario;
    return 'Hola ' + d.nombre.split(' ')[0] + ', tu pedido de ' + BG.db.config.tienda.nombre + ' ya salió de ' + BG.db.config.envios.origen.ciudad + ' por ' + e.empresa
      + '. Guía N° ' + e.guia + '. ' + (d.modalidad === 'agencia' ? 'Lo retirás en ' + (d.agencia || 'la agencia') + ' de ' + d.ciudad + ' con tu CI.' : 'Te lo entregan en ' + d.direccion + ', ' + d.ciudad + '.')
      + (e.cobro ? ' Al recibirlo se abona ' + gs(e.cobro) + '.' : '') + ' ¡Gracias!';
  }

  BG.vistas.envio = (args) => {
    const e = envio(args[0]);
    if (!e) return { html: '<div class="page"><p class="empty">No encontramos ese envío. <a href="#/envios">Ver envíos</a></p></div>' };
    const d = e.destinatario;
    const v = e.ventaId ? BG.venta(e.ventaId) : null;
    const c = e.clienteId ? BG.cliente(e.clienteId) : null;
    const hechos = BG.CHECKLIST_ENVIO.filter(([k]) => e.checklist[k]).length;
    const acciones = [];
    if (e.estado !== 'cancelado') acciones.push('<a class="btn" href="#/envios/' + e.id + '/etiqueta">' + icon('print') + 'Imprimir etiqueta</a>');
    if (e.estado === 'preparando') acciones.push('<button type="button" class="btn btn-primary" data-accion="listo">' + icon('tag') + 'Marcar listo para despachar</button>');
    if (e.estado === 'listo') acciones.push('<button type="button" class="btn btn-primary" data-accion="despachar">' + icon('truck') + 'Registrar despacho</button>');
    if (e.estado === 'despachado') {
      acciones.push('<a class="btn" data-accion="avisar" href="' + BG.waLink(c, mensajeCliente(e)) + '" target="_blank" rel="noopener">' + icon('chat') + 'Avisar al cliente</a>');
      acciones.push('<button type="button" class="btn btn-primary" data-accion="entregado">' + icon('check') + 'Marcar entregado</button>');
    }
    if (e.estado === 'preparando' || e.estado === 'listo') acciones.push('<a class="btn btn-quiet" href="#/envios/' + e.id + '/editar">' + icon('edit') + 'Editar</a>');
    if (BG.esDuena() && ['preparando', 'listo', 'despachado'].indexOf(e.estado) >= 0) acciones.push('<button type="button" class="btn btn-danger" data-accion="cancelar">' + icon('ban') + 'Cancelar envío</button>');
    const orden = ['preparando', 'listo', 'despachado', 'entregado'];
    const html = '<div class="page">'
      + '<a class="back-link" href="#/envios">' + icon('left', 'i-sm') + 'Envíos</a>'
      + '<div class="page-head"><div><p class="eyebrow">Creado el ' + BG.fmtFecha(e.creado.slice(0, 10)) + ' por ' + esc(e.usuario) + '</p>'
      + '<h1 class="page-title">Envío ' + esc(e.numero) + '</h1><p class="page-sub">' + BG.pillEnvio(e) + ' a <strong>' + esc(d.ciudad) + '</strong> (' + esc(d.departamento) + ') por ' + esc(e.empresa) + '</p></div>'
      + '<div class="page-actions">' + acciones.join('') + '</div></div>'
      + '<ol class="steps-track" aria-label="Seguimiento">' + orden.map((st) => {
        const h = e.historial.filter((x) => x.estado === st).pop();
        const idx = orden.indexOf(e.estado);
        const cls = e.estado === 'cancelado' ? '' : orden.indexOf(st) < idx ? ' is-done' : st === e.estado ? ' is-now' : '';
        return '<li class="track' + cls + '"><span class="track-dot"></span><span class="track-name">' + BG.ESTADOS_ENVIO[st] + '</span>'
          + '<span class="track-when">' + (h ? BG.fmtFecha(h.ts.slice(0, 10)) + ' ' + BG.fmtHora(h.ts) + ' · ' + esc(h.usuario) + (h.nota ? '<br>' + esc(h.nota) : '') : '—') + '</span></li>';
      }).join('') + '</ol>'
      + (e.estado === 'cancelado' ? '<div class="callout callout-bad">' + icon('ban') + '<div><strong>Envío cancelado.</strong> ' + esc((e.historial[e.historial.length - 1] || {}).nota || '') + '</div></div>' : '')
      + '<div class="grid-2">'
      + '<section class="card"><div class="card-head"><h2>Destinatario</h2>' + (c ? '<a class="small" href="#/clientes/' + c.id + '">Ver cliente</a>' : '') + '</div><dl class="kv kv-left">'
      + '<dt>Nombre</dt><dd>' + esc(d.nombre) + '</dd><dt>CI</dt><dd>' + esc(d.ci || '—') + '</dd><dt>Teléfono</dt><dd>' + esc(d.telefono || '—') + '</dd>'
      + '<dt>Destino</dt><dd>' + esc(d.ciudad) + ' · ' + esc(d.departamento) + '</dd>'
      + '<dt>Recibe</dt><dd>' + (d.modalidad === 'agencia' ? 'Retira en ' + esc(d.agencia || 'agencia') : 'A domicilio: ' + esc(d.direccion) + (d.referencia ? ' (' + esc(d.referencia) + ')' : '')) + '</dd></dl></section>'
      + '<section class="card"><div class="card-head"><h2>Paquete, flete y cobro</h2>' + (v ? '<a class="small" href="#/ventas/' + v.id + '">Venta ' + BG.fmtRecibo(v.recibo) + '</a>' : '') + '</div><dl class="kv kv-left">'
      + '<dt>Empresa</dt><dd>' + esc(e.empresa) + '</dd><dt>Guía</dt><dd>' + (e.guia ? esc(e.guia) : '<span class="muted">se carga al despachar</span>') + '</dd>'
      + '<dt>Bultos</dt><dd>' + e.bultos + (e.pesoKg ? ' · ' + C.fmtKg(e.pesoKg) + ' aprox.' : '') + '</dd><dt>Contenido</dt><dd>' + esc(e.contenido) + (e.detalle ? '<div class="t-sub">' + esc(e.detalle) + '</div>' : '') + '</dd>'
      + '<dt>Valor declarado</dt><dd>' + gs(e.valorDeclarado) + '</dd>'
      + '<dt>Flete</dt><dd>' + (e.flete.monto ? gs(e.flete.monto) + ' · ' : '') + PAGA[e.flete.paga] + '</dd>'
      + '<dt>Cobro al entregar</dt><dd>' + (e.cobro ? '<strong>' + gs(e.cobro) + '</strong>' : 'No') + '</dd>'
      + (e.notas ? '<dt>Notas</dt><dd>' + esc(e.notas) + '</dd>' : '') + '</dl></section></div>'
      + '<section class="card stack"><div class="card-head"><h2>Antes de despachar</h2><span class="small muted" id="req-hechos">' + hechos + ' de ' + BG.CHECKLIST_ENVIO.length + '</span></div>'
      + '<ul class="checks-list">' + BG.CHECKLIST_ENVIO.map(([k, t]) => '<li><label class="check-inline check-block"><input type="checkbox" data-check="' + k + '"' + (e.checklist[k] ? ' checked' : '')
        + (['entregado', 'cancelado'].indexOf(e.estado) >= 0 ? ' disabled' : '') + '> ' + esc(t) + '</label></li>').join('') + '</ul></section>'
      + '</div>';
    return {
      html: html,
      mount: (root) => {
        root.addEventListener('change', (ev) => {
          const k = ev.target.dataset && ev.target.dataset.check;
          if (!k) return;
          e.checklist[k] = ev.target.checked;
          BG.guardar();
          $('#req-hechos', root).textContent = BG.CHECKLIST_ENVIO.filter(([x]) => e.checklist[x]).length + ' de ' + BG.CHECKLIST_ENVIO.length;
        });
        root.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          const a = b.dataset.accion;
          try {
            if (a === 'listo') { BG.cambiarEstadoEnvio(e.id, 'listo'); BG.toast(e.numero + ' listo para despachar.'); BG.render(); }
            else if (a === 'despachar') {
              const guia = await pedirGuia(e);
              if (!guia) return;
              BG.cambiarEstadoEnvio(e.id, 'despachado', { guia: guia });
              BG.toast(e.numero + ' despachado. Avisale al cliente con el número de guía.');
              BG.render();
            } else if (a === 'entregado') { BG.cambiarEstadoEnvio(e.id, 'entregado'); BG.toast(e.numero + ' entregado.'); BG.render(); }
            else if (a === 'avisar') { BG.auditar('envios', 'Aviso al cliente', e.numero + ' · ' + d.nombre + ' · guía ' + e.guia); BG.guardar(); }
            else if (a === 'cancelar') {
              let motivo = '';
              const r = await BG.modal({
                titulo: 'Cancelar el envío ' + e.numero,
                cuerpo: '<p>El envío no se borra: queda cancelado en el historial con el motivo.</p><div class="field"><label for="m-cancel">Motivo <span class="req">*</span></label><input id="m-cancel" class="input" autocomplete="off"><span class="error-text" id="m-err" hidden></span></div>',
                acciones: [{ texto: 'Volver', valor: 'cancelar', clase: 'btn-quiet' }, { texto: 'Cancelar envío', valor: 'ok', clase: 'btn-danger-solid', submit: true }],
                validar: (x, dlg) => { motivo = $('#m-cancel', dlg).value.trim(); if (motivo.length >= 4) return true; const er = $('#m-err', dlg); er.textContent = 'Escribí el motivo.'; er.hidden = false; return false; },
                onMount: (dlg) => $('#m-cancel', dlg).focus(),
              });
              if (r !== 'ok') return;
              BG.cambiarEstadoEnvio(e.id, 'cancelado', { nota: 'Motivo: ' + motivo });
              BG.toast(e.numero + ' cancelado.');
              BG.render();
            }
          } catch (err) {
            BG.toast(err.message, 'error');
          }
        });
      },
    };
  };

  /* ── Etiqueta para pegar ─────────────────────────────────────────────── */

  const KEY_FORMATO = 'berryglow.mockup.formatoEtiqueta';
  function htmlEtiqueta(e, n, total) {
    const d = e.destinatario;
    const t = BG.db.config.tienda;
    const o = BG.db.config.envios.origen;
    return '<article class="label">'
      + '<header class="lb-head"><div class="lb-brand">' + BG.logo(true) + '</div><div class="lb-num"><strong>' + esc(e.numero) + '</strong><span>Bulto ' + n + ' de ' + total + '</span></div></header>'
      + '<section class="lb-block"><p class="lb-k">Destinatario</p><p class="lb-name">' + esc(d.nombre) + '</p>'
      + '<p class="lb-line">CI ' + esc(d.ci || '—') + ' · Tel. ' + esc(d.telefono || '—') + '</p></section>'
      + '<section class="lb-block lb-dest"><p class="lb-k">Ciudad de destino</p><p class="lb-city">' + esc(d.ciudad) + '</p><p class="lb-line">Departamento ' + esc(d.departamento) + '</p>'
      + '<p class="lb-mode">' + (d.modalidad === 'agencia' ? '<strong>Retira en ' + esc(d.agencia || 'agencia') + '</strong> · presentar CI'
        : '<strong>Entrega a domicilio:</strong> ' + esc(d.direccion) + (d.referencia ? ' · Ref.: ' + esc(d.referencia) : '')) + '</p></section>'
      + '<section class="lb-grid"><div><p class="lb-k">Empresa</p><p>' + esc(e.empresa) + '</p></div><div><p class="lb-k">Guía N°</p><p class="lb-guia">' + (e.guia ? esc(e.guia) : '&nbsp;') + '</p></div>'
      + '<div><p class="lb-k">Contenido</p><p>' + esc(e.contenido) + '</p></div><div><p class="lb-k">Peso aprox.</p><p>' + (e.pesoKg ? C.fmtKg(e.pesoKg) : '—') + '</p></div></section>'
      + '<p class="lb-pay">' + (e.flete.paga === 'tienda' ? 'Flete pagado por el remitente' : 'Flete a cobrar al destinatario') + '</p>'
      + (e.cobro ? '<p class="lb-cod">Cobrar al entregar: ' + gs(e.cobro) + '</p>' : '')
      + ((e.fragil || e.seco) ? '<p class="lb-flags">' + (e.fragil ? '<span>Frágil</span>' : '') + (e.seco ? '<span>No mojar</span>' : '') + '</p>' : '')
      + '<footer class="lb-from"><p class="lb-k">Remitente</p><p><strong>' + esc(t.nombre) + '</strong> · Tel. ' + esc(t.whatsapp) + '</p><p>' + esc(o.ciudad) + ', ' + esc(o.departamento) + ' · ' + BG.fmtFecha(BG.hoy()) + '</p></footer>'
      + '</article>';
  }

  BG.vistas.etiqueta = (args) => {
    const e = envio(args[0]);
    if (!e) return { html: '<div class="page"><p class="empty">No encontramos ese envío.</p></div>' };
    let formato = 'etiqueta';
    try { formato = localStorage.getItem(KEY_FORMATO) || 'etiqueta'; } catch (err) { /* sin almacenamiento */ }
    const etiquetas = [];
    for (let i = 1; i <= e.bultos; i++) etiquetas.push(htmlEtiqueta(e, i, e.bultos));
    const html = '<div class="page">'
      + '<div class="receipt-toolbar no-print"><a class="back-link" href="#/envios/' + e.id + '">' + icon('left', 'i-sm') + 'Envío ' + esc(e.numero) + '</a>'
      + '<div class="row"><div class="seg" role="radiogroup" aria-label="Tamaño de impresión">'
      + '<label><input type="radio" name="formato" value="etiqueta"' + (formato === 'etiqueta' ? ' checked' : '') + '>Etiqueta 10 × 15 cm</label>'
      + '<label><input type="radio" name="formato" value="a4"' + (formato === 'a4' ? ' checked' : '') + '>Hoja A4 para recortar</label></div>'
      + '<button type="button" class="btn btn-primary" data-accion="imprimir">' + icon('print') + 'Imprimir ' + (e.bultos === 1 ? 'etiqueta' : e.bultos + ' etiquetas') + '</button></div></div>'
      + '<p class="hint no-print">Una etiqueta por bulto. Pegala en la cara más grande del paquete, sin tapar las uniones con cinta. El valor declarado no va en la etiqueta.</p>'
      + '<div class="labels-stage' + (formato === 'a4' ? ' is-a4' : '') + '">' + etiquetas.join('') + '</div></div>';
    const aplicar = (f) => {
      let st = document.getElementById('estilo-pagina');
      if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
      st.textContent = f === 'a4' ? '@page { size: A4; margin: 12mm; }' : '@page { size: 100mm 150mm; margin: 0; }';
    };
    return {
      html: html,
      mount: (root) => {
        aplicar(formato);
        root.addEventListener('change', (ev) => {
          if (ev.target.name !== 'formato') return;
          formato = ev.target.value;
          try { localStorage.setItem(KEY_FORMATO, formato); } catch (err) { /* sin almacenamiento */ }
          $('.labels-stage', root).classList.toggle('is-a4', formato === 'a4');
          aplicar(formato);
        });
        root.addEventListener('click', (ev) => {
          if (!ev.target.closest('[data-accion="imprimir"]')) return;
          BG.registrarEtiquetaImpresa(e);
          setTimeout(() => { try { window.print(); } catch (err) { /* el visor puede bloquearlo */ } }, 50);
        });
      },
    };
  };
})();

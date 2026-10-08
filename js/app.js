/* =========================================================
   app.js - Lógica principal de la PWA
   Vistas: dashboard, clientes, escanear, cobros, ajustes
   ========================================================= */

const App = {
  filtroEstado: 'todos',
  busqueda: '',
  clienteEditId: null,
  fotoTemp: null,
  clienteQRId: null
};

/* =========================================================
   NAVEGACIÓN (Bottom Tab Bar)
   ========================================================= */
const VIEWS = ['dashboard', 'clientes', 'escanear', 'cobros', 'ajustes'];

function irA(vista) {
  VIEWS.forEach((v) => {
    document.getElementById('page-' + v)?.classList.toggle('active', v === vista);
    document.getElementById('tab-' + v)?.classList.toggle('active', v === vista);
  });
  document.getElementById('fab')?.classList.toggle('show', vista === 'clientes');

  if (vista !== 'escanear') Scanner.stop();

  switch (vista) {
    case 'dashboard': renderDashboard(); break;
    case 'clientes':  renderClientes(); break;
    case 'escanear':  renderEscanear(); break;
    case 'cobros':    renderCobros(); break;
    case 'ajustes':   renderAjustes(); break;
  }
  window.scrollTo({ top: 0 });
}

/* =========================================================
   DASHBOARD
   ========================================================= */
async function renderDashboard() {
  const [clientes, pagos, hoyRegs] = await Promise.all([
    ClientesDAO.all(), PagosDAO.all(), AsistenciasDAO.hoy()
  ]);

  const mes = Fecha.mesActual();
  const ingresosMes = pagos
    .filter((p) => String(p.fecha).slice(0, 7) === mes)
    .reduce((s, p) => s + Number(p.monto || 0), 0);

  const activos = clientes.filter((c) => estadoCliente(c) === 'activo');
  const porVencer = clientes.filter((c) => estadoCliente(c) === 'porvencer');
  const vencidos = clientes.filter((c) => estadoCliente(c) === 'vencido');
  const venceHoy = clientes.filter((c) => c.vence && Fecha.diffDays(c.vence) === 0);
  const totalSocios = clientes.length;

  const ultimosPagos = pagos.slice(0, 5);

  // Últimos ingresos
  const ultimosIngresos = (await AsistenciasDAO.all()).slice(0, 6);
  const mapaCli = new Map(clientes.map((c) => [c.id, c]));

  document.getElementById('page-dashboard').innerHTML = `
    <div class="topbar">
      <div>
        <div class="tiny muted">${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>Inicio</h1>
      </div>
      <button class="btn icon" onclick="irA('ajustes')" title="Ajustes">⚙︎</button>
    </div>

    <div class="grid2">
      <div class="stat green">
        <div class="val mono">${fmtMoney(ingresosMes)}</div>
        <div class="lbl">Ingresos del mes</div>
      </div>
      <div class="stat tint">
        <div class="val mono">${activos.length}</div>
        <div class="lbl">Socios activos</div>
      </div>
      <div class="stat orange">
        <div class="val mono">${porVencer.length}</div>
        <div class="lbl">Por vencer (7 días)</div>
      </div>
      <div class="stat red">
        <div class="val mono">${vencidos.length}</div>
        <div class="lbl">Vencidos</div>
      </div>
    </div>

    <div class="sec-title">Alertas de hoy</div>
    <div class="card">
      <div class="row">
        <div class="avatar" style="background:rgba(255,69,58,.18);color:var(--red)">!</div>
        <div class="grow">
          <div class="title">${venceHoy.length} ${venceHoy.length === 1 ? 'membresía vence' : 'membresías vencen'} hoy</div>
          <div class="sub">${porVencer.length} por vencer en los próximos 7 días</div>
        </div>
        <span class="chip ${venceHoy.length ? 'red' : 'gray'}">${venceHoy.length}</span>
      </div>
      <div class="row" onclick="irA('escanear')" style="cursor:pointer">
        <div class="avatar" style="background:rgba(48,209,88,.18);color:var(--green)">↓</div>
        <div class="grow">
          <div class="title">${hoyRegs.length} ingresos registrados hoy</div>
          <div class="sub">Tocá para escanear un QR</div>
        </div>
        <span class="chip green">${hoyRegs.length}</span>
      </div>
      ${venceHoy.length ? `
      <div class="row" style="flex-direction:column;align-items:stretch;gap:6px">
        <div class="tiny muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.5px">Vencen hoy</div>
        ${venceHoy.slice(0, 5).map((c) => `
          <div class="flex items-center gap8" style="padding:4px 0">
            <div class="avatar" style="width:30px;height:30px;font-size:12px">${esc(iniciales(c.nombre))}</div>
            <div class="grow" style="font-size:15px">${esc(c.nombre)}</div>
            <button class="btn sm success" onclick="cobrarRapido(${c.id})">Cobrar</button>
          </div>`).join('')}
      </div>` : ''}
    </div>

    <div class="sec-title">Últimos cobros</div>
    <div class="card">
      ${ultimosPagos.length ? ultimosPagos.map((p) => `
        <div class="row">
          <div class="avatar" style="background:rgba(10,132,255,.18);color:var(--tint)">$</div>
          <div class="grow">
            <div class="title">${esc(mapaCli.get(p.clienteId)?.nombre || 'Cliente eliminado')}</div>
            <div class="sub">${esc(p.planNombre || 'Plan')} · ${Fecha.fmt(p.fecha)}</div>
          </div>
          <div class="mono" style="font-weight:700;color:var(--green)">${fmtMoney(p.monto)}</div>
        </div>`).join('') : `
        <div class="empty"><div class="icon">🧾</div><p>Todavía no hay cobros registrados.</p></div>`}
    </div>

    <div class="sec-title">Últimos ingresos</div>
    <div class="card">
      ${ultimosIngresos.length ? ultimosIngresos.map((a) => `
        <div class="row">
          <div class="avatar" style="background:rgba(48,209,88,.18);color:var(--green)">✓</div>
          <div class="grow">
            <div class="title">${esc(mapaCli.get(a.clienteId)?.nombre || 'Cliente eliminado')}</div>
            <div class="sub">${Fecha.fmtHora(a.timestamp)}</div>
          </div>
          <span class="chip ${a.motivo === 'QR' ? 'blue' : 'gray'}">${esc(a.motivo)}</span>
        </div>`).join('') : `
        <div class="empty"><div class="icon">🚪</div><p>Sin ingresos todavía.</p></div>`}
    </div>

    <div class="sec-title">Resumen</div>
    <div class="card">
      <div class="row"><div class="grow title">Total de socios</div><div class="mono">${totalSocios}</div></div>
      <div class="row"><div class="grow title">Activos</div><div class="mono" style="color:var(--green)">${activos.length}</div></div>
      <div class="row"><div class="grow title">Por vencer</div><div class="mono" style="color:var(--orange)">${porVencer.length}</div></div>
      <div class="row"><div class="grow title">Vencidos</div><div class="mono" style="color:var(--red)">${vencidos.length}</div></div>
      <div class="row"><div class="grow title">Registros de asistencia</div><div class="mono">${(await db.asistencias.count())}</div></div>
    </div>
  `;
}

/* =========================================================
   CLIENTES
   ========================================================= */
async function renderClientes() {
  const lista = await ClientesDAO.porEstado(App.filtroEstado, App.busqueda);

  const counts = {
    todos: (await ClientesDAO.all()).length
  };
  const todas = await ClientesDAO.all();
  counts.activo = todas.filter((c) => estadoCliente(c) === 'activo').length;
  counts.porvencer = todas.filter((c) => estadoCliente(c) === 'porvencer').length;
  counts.vencido = todas.filter((c) => estadoCliente(c) === 'vencido').length;

  const seg = [
    ['todos', 'Todos'],
    ['activo', 'Activo'],
    ['porvencer', 'Por vencer'],
    ['vencido', 'Vencido']
  ].map(([k, l]) => `
    <button class="${App.filtroEstado === k ? 'active' : ''}" onclick="setFiltro('${k}')">
      ${l} (${counts[k] ?? 0})
    </button>`).join('');

  document.getElementById('page-clientes').innerHTML = `
    <div class="topbar">
      <h1>Clientes</h1>
      <button class="btn sm" onclick="abrirFormCliente()" style="width:auto">+ Nuevo</button>
    </div>

    <div class="search">
      <input id="search-input" type="search" placeholder="Buscar por nombre o teléfono"
             value="${esc(App.busqueda)}" oninput="onSearch(this.value)" />
    </div>

    <div class="segmented">${seg}</div>

    <div class="card">
      ${lista.length ? lista.map(filaCliente).join('') : `
        <div class="empty">
          <div class="icon">👥</div>
          <p>${App.busqueda || App.filtroEstado !== 'todos'
              ? 'Ningún cliente coincide con el filtro.'
              : 'Tocá “+ Nuevo” para cargar el primer socio.'}</p>
        </div>`}
    </div>
  `;
}

function filaCliente(c) {
  const est = ESTADO_LABEL[estadoCliente(c)];
  const dias = Fecha.diffDays(c.vence);
  const sub = c.vence
    ? `Vence: ${Fecha.fmt(c.vence)}${dias !== null ? (dias < 0 ? ` (hace ${Math.abs(dias)}d)` : dias === 0 ? ' (hoy)' : ` (en ${dias}d)`) : ''}`
    : 'Sin membresía activa';

  return `
    <div class="row" onclick="abrirCliente(${c.id})" style="cursor:pointer">
      ${c.foto
        ? `<img class="avatar" src="${c.foto}" alt="" />`
        : `<div class="avatar">${esc(iniciales(c.nombre))}</div>`}
      <div class="grow">
        <div class="title">${esc(c.nombre)}</div>
        <div class="sub">${esc(sub)}</div>
      </div>
      <span class="chip ${est.cls}">${est.txt}</span>
    </div>`;
}

function setFiltro(f) { App.filtroEstado = f; renderClientes(); }
let searchTimer = null;
function onSearch(v) {
  App.busqueda = v;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderClientes, 220);
}

/* ---------- Detalle de cliente ---------- */
async function abrirCliente(id) {
  const c = await ClientesDAO.get(id);
  if (!c) return;
  const est = ESTADO_LABEL[estadoCliente(c)];
  const pagos = (await PagosDAO.all()).filter((p) => p.clienteId === id);
  const ingresos = (await db.asistencias.where('clienteId').equals(id).reverse().sortBy('timestamp')).slice(0, 8);
  const plan = c.planId ? await PlanesDAO.get(c.planId) : null;

  Sheet.open(c.nombre, `
    <div class="center mb16">
      ${c.foto
        ? `<img src="${c.foto}" style="width:96px;height:96px;border-radius:50%;object-fit:cover" alt=""/>`
        : `<div class="avatar" style="width:96px;height:96px;font-size:34px;margin:0 auto">${esc(iniciales(c.nombre))}</div>`}
      <div class="mt8"><span class="chip ${est.cls}">${est.txt}</span></div>
      <div class="tiny muted mt8">
        ${c.vence ? `Vence ${Fecha.fmt(c.vence)}` : 'Sin fecha de vencimiento'}
        ${plan ? ` · ${esc(plan.nombre)}` : ''}
      </div>
    </div>

    <div class="card mb16">
      <div class="row"><div class="grow sub">Teléfono</div><div>${esc(c.telefono || '—')}</div></div>
      <div class="row"><div class="grow sub">Ingreso</div><div>${Fecha.fmt(c.fechaIngreso)}</div></div>
      <div class="row"><div class="grow sub">Apto físico</div><div>${c.aptoFisico ? '✅ Vigente' : '❌ Pendiente'}</div></div>
      <div class="row"><div class="grow sub">Plan actual</div><div>${esc(c.plan || '—')}</div></div>
      <div class="row"><div class="grow sub">ID QR</div><div class="mono tiny">${esc((c.qrToken || '').slice(0, 12))}…</div></div>
      ${c.notas ? `<div class="row" style="flex-direction:column;align-items:stretch"><div class="grow sub">Notas</div><div style="font-size:15px">${esc(c.notas)}</div></div>` : ''}
    </div>

    <div class="grid2 mb16">
      <button class="btn" onclick="Sheet.close();setTimeout(()=>abrirFormCliente(${c.id}),260)">Editar</button>
      <button class="btn secondary" onclick="Sheet.close();setTimeout(()=>abrirQR(${c.id}),260)">Ver QR</button>
    </div>
    <div class="grid2 mb16">
      <button class="btn success" onclick="Sheet.close();setTimeout(()=>abrirCobro(${c.id}),260)">Registrar cobro</button>
      <button class="btn warn" onclick="Sheet.close();setTimeout(()=>abrirFormCliente(${c.id}),260)">Renovar</button>
    </div>

    <div class="sec-title">Historial de cobros</div>
    <div class="card mb16">
      ${pagos.length ? pagos.map((p) => `
        <div class="row">
          <div class="grow">
            <div class="title">${esc(p.planNombre || 'Plan')}</div>
            <div class="sub">${Fecha.fmt(p.fecha)} → vence ${Fecha.fmt(p.venceGenerado)}</div>
          </div>
          <div class="mono" style="color:var(--green);font-weight:700">${fmtMoney(p.monto)}</div>
        </div>`).join('') : `<div class="empty"><p>Sin cobros.</p></div>`}
    </div>

    <div class="sec-title">Ingresos</div>
    <div class="card mb16">
      ${ingresos.length ? ingresos.map((a) => `
        <div class="row">
          <div class="grow title">${Fecha.fmtHora(a.timestamp)}</div>
          <span class="chip ${a.motivo === 'QR' ? 'blue' : 'gray'}">${esc(a.motivo)}</span>
        </div>`).join('') : `<div class="empty"><p>Sin ingresos.</p></div>`}
    </div>

    <div class="btn-row">
      <button class="btn danger" onclick="eliminarCliente(${c.id})">Eliminar cliente</button>
    </div>
  `, { onOpen: () => {} });
}

async function eliminarCliente(id) {
  Sheet.close();
  if (!(await confirmar('¿Eliminar este cliente y todo su historial?'))) return;
  await db.pagos.where('clienteId').equals(id).delete();
  await db.asistencias.where('clienteId').equals(id).delete();
  await ClientesDAO.del(id);
  toast('Cliente eliminado', 'ok');
  renderClientes();
}

/* ---------- Formulario cliente (alta / edición) ---------- */
async function abrirFormCliente(id = null) {
  App.clienteEditId = id;
  App.fotoTemp = null;

  const c = id ? await ClientesDAO.get(id) : null;
  const planes = await PlanesDAO.all();
  if (c) App.fotoTemp = c.foto || null;

  Sheet.open(id ? 'Editar cliente' : 'Nuevo cliente', `
    <div class="center mb16">
      <label for="foto-input" style="display:inline-block;cursor:pointer">
        <div id="foto-preview" class="avatar" style="width:92px;height:92px;font-size:30px;margin:0 auto">
          ${c?.foto ? `<img src="${c.foto}" style="width:92px;height:92px;border-radius:50%;object-fit:cover"/>` : '📷'}
        </div>
        <div class="tiny muted mt8">Tocá para ${c?.foto ? 'cambiar' : 'agregar'} foto</div>
      </label>
      <input id="foto-input" type="file" accept="image/*" class="hidden" onchange="onFotoChange(this)" />
    </div>

    <div class="field">
      <label>Nombre y apellido *</label>
      <input id="f-nombre" class="input" placeholder="Ej: Rodri García" value="${esc(c?.nombre || '')}" />
    </div>

    <div class="field">
      <label>Teléfono</label>
      <input id="f-telefono" class="input" type="tel" inputmode="tel" placeholder="11 5555 5555" value="${esc(c?.telefono || '')}" />
    </div>

    <div class="field-row">
      <div class="field">
        <label>Fecha de ingreso</label>
        <input id="f-ingreso" class="input" type="date" value="${esc(c?.fechaIngreso || Fecha.hoy())}" />
      </div>
      <div class="field">
        <label>Vencimiento</label>
        <input id="f-vence" class="input" type="date" value="${esc(c?.vence || '')}" />
      </div>
    </div>

    <div class="field">
      <label>Apto físico</label>
      <select id="f-apto" class="input">
        <option value="1" ${c?.aptoFisico ? 'selected' : ''}>Vigente</option>
        <option value="0" ${c && !c.aptoFisico ? 'selected' : ''}>Pendiente</option>
      </select>
    </div>

    <div class="field">
      <label>Plan (opcional)</label>
      <select id="f-plan" class="input">
        <option value="">— Sin plan —</option>
        ${planes.map((p) => `<option value="${p.id}" ${c?.planId === p.id ? 'selected' : ''}>${esc(p.nombre)} · ${fmtMoney(p.precio)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>Notas</label>
      <textarea id="f-notas" class="input" placeholder="Lesiones, objetivos, observaciones...">${esc(c?.notas || '')}</textarea>
    </div>

    <button class="btn" onclick="guardarCliente()">${id ? 'Guardar cambios' : 'Registrar cliente'}</button>
  `);
}

async function onFotoChange(input) {
  try {
    const url = await fotoADataUrl(input.files[0]);
    App.fotoTemp = url;
    const pv = document.getElementById('foto-preview');
    if (pv) pv.innerHTML = `<img src="${url}" style="width:92px;height:92px;border-radius:50%;object-fit:cover"/>`;
  } catch (e) {
    toast('No se pudo cargar la foto', 'err');
  }
}

async function guardarCliente() {
  const nombre = val('f-nombre');
  if (!nombre) { toast('Ingresá el nombre', 'err'); return; }

  const payload = {
    nombre,
    telefono: val('f-telefono'),
    fechaIngreso: val('f-ingreso') || Fecha.hoy(),
    vence: val('f-vence') || null,
    aptoFisico: val('f-apto') === '1',
    planId: val('f-plan') ? Number(val('f-plan')) : null,
    plan: '',
    notas: val('f-notas'),
    foto: App.fotoTemp
  };
  if (payload.planId) {
    const p = await PlanesDAO.get(payload.planId);
    payload.plan = p?.nombre || '';
  }

  if (App.clienteEditId) {
    const old = await ClientesDAO.get(App.clienteEditId);
    await ClientesDAO.put({ ...old, ...payload, id: App.clienteEditId });
    toast('Cliente actualizado', 'ok');
  } else {
    payload.qrToken = nuevoToken();
    payload.creado = Date.now();
    await ClientesDAO.add(payload);
    toast('Cliente registrado', 'ok');
  }

  Sheet.close();
  if (document.getElementById('page-clientes').classList.contains('active')) renderClientes();
  else renderDashboard();
}

/* =========================================================
   QR DEL CLIENTE
   ========================================================= */
async function abrirQR(id) {
  const c = await ClientesDAO.get(id);
  if (!c) return;
  if (!c.qrToken) {
    c.qrToken = nuevoToken();
    await ClientesDAO.put(c);
  }
  const payload = payloadDeCliente(c);
  const url = generarQRDataURL(payload, 300);

  Sheet.open('Pase QR · ' + c.nombre, `
    <div class="center">
      <div class="qr-box"><img src="${url}" width="260" height="260" alt="QR"/></div>
      <div class="mt12" style="font-weight:700;font-size:18px">${esc(c.nombre)}</div>
      <div class="tiny muted mono">${esc(c.qrToken)}</div>
      <div class="mt8"><span class="chip ${ESTADO_LABEL[estadoCliente(c)].cls}">${ESTADO_LABEL[estadoCliente(c)].txt}</span>
        ${c.vence ? `<span class="chip gray">Vence ${Fecha.fmt(c.vence)}</span>` : ''}</div>
      <div class="mt16 tiny muted">Guardá esta imagen o mostrala en recepción para validar el ingreso.</div>
      <div class="btn-row mt16">
        <button class="btn secondary" onclick="descargarQR(${c.id})">Descargar</button>
        <button class="btn" onclick="Sheet.close()">Listo</button>
      </div>
    </div>
  `);
}

async function descargarQR(id) {
  const c = await ClientesDAO.get(id);
  const url = generarQRDataURL(payloadDeCliente(c), 512);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qr-${(c.nombre || 'cliente').replace(/\s+/g, '-').toLowerCase()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('QR descargado', 'ok');
}

/* =========================================================
   ESCANEAR / CONTROL DE ACCESO
   ========================================================= */
function renderEscanear() {
  document.getElementById('page-escanear').innerHTML = `
    <div class="topbar">
      <h1>Escanear</h1>
      <button class="btn sm secondary" id="btn-toggle-scan" onclick="toggleScan()" style="width:auto">Iniciar cámara</button>
    </div>

    <div class="card" style="padding:16px">
      <div class="scan-frame" id="scan-frame" style="display:none"><i></i><div class="laser"></div></div>
      <div id="scan-region"></div>

      <div id="scan-idle" class="center" style="padding:26px 10px">
        <div style="font-size:52px">📷</div>
        <p class="muted" style="font-size:15px;margin-top:8px">
          Tocá “Iniciar cámara” y acercá el QR del socio.<br>
          Se valida 100% local, sin internet.
        </p>
      </div>

      <div id="scan-result" class="hidden"></div>
    </div>

    <div class="btn-row mt16">
      <button class="btn secondary" onclick="ingresoManual()">Ingreso manual</button>
      <button class="btn secondary" onclick="irA('clientes')">Buscar socio</button>
    </div>

    <div class="sec-title">Ingresos de hoy</div>
    <div id="hoy-list" class="card"><div class="empty"><p>Cargando…</p></div></div>
  `;
  renderHoy();
  if (Scanner.running) { /* ya corriendo */ }
}

async function renderHoy() {
  const regs = await AsistenciasDAO.hoy();
  const clientes = await ClientesDAO.all();
  const mapa = new Map(clientes.map((c) => [c.id, c]));
  const el = document.getElementById('hoy-list');
  if (!el) return;
  el.innerHTML = regs.length
    ? regs.map((a) => {
        const c = mapa.get(a.clienteId);
        const est = c ? ESTADO_LABEL[estadoCliente(c)] : { txt: '—', cls: 'gray' };
        return `
        <div class="row">
          <div class="avatar" style="background:rgba(48,209,88,.18);color:var(--green)">✓</div>
          <div class="grow">
            <div class="title">${esc(c?.nombre || 'Cliente eliminado')}</div>
            <div class="sub">${Fecha.fmtHora(a.timestamp)} · ${esc(a.motivo)}</div>
          </div>
          <span class="chip ${est.cls}">${est.txt}</span>
        </div>`;
      }).join('')
    : `<div class="empty"><div class="icon">🚪</div><p>Nadie ingresó hoy todavía.</p></div>`;
}

async function toggleScan() {
  const btn = document.getElementById('btn-toggle-scan');
  const frame = document.getElementById('scan-frame');
  const idle = document.getElementById('scan-idle');
  const result = document.getElementById('scan-result');
  const region = document.getElementById('scan-region');

  if (Scanner.running) {
    await Scanner.stop();
    btn.textContent = 'Iniciar cámara';
    frame.style.display = 'none';
    idle.classList.remove('hidden');
    region.innerHTML = '';
    return;
  }

  idle.classList.add('hidden');
  result.classList.add('hidden');
  frame.style.display = 'block';
  btn.textContent = 'Detener';

  try {
    await Scanner.start(region, onScanResult);
  } catch (e) {
    console.error(e);
    frame.style.display = 'none';
    idle.classList.remove('hidden');
    btn.textContent = 'Iniciar cámara';
    toast('No se pudo acceder a la cámara. Verificá los permisos.', 'err');
  }
}

async function onScanResult(raw) {
  // Vibración háptica (iPhone soporta vibrate en Safari 16.4+)
  if (navigator.vibrate) navigator.vibrate(30);

  const frame = document.getElementById('scan-frame');
  const result = document.getElementById('scan-result');
  if (frame) frame.style.display = 'none';

  let cliente = null;
  let valido = false;
  let motivo = '';

  if (esPayloadNuestro(raw)) {
    cliente = await ClientesDAO.buscarPorToken(tokenDePayload(raw));
    if (cliente) {
      valido = true;
      motivo = 'QR';
    } else {
      motivo = 'QR desconocido';
    }
  } else if (/^\d+$/.test(raw)) {
    cliente = await ClientesDAO.get(Number(raw));
    if (cliente) { valido = true; motivo = 'ID'; }
  }

  let html = '';
  if (!cliente) {
    html = `
      <div class="result fail">
        <div class="big">✕</div>
        <div class="name">QR no válido</div>
        <div class="meta">Este código no pertenece a ningún socio registrado.</div>
        <div class="meta mono tiny" style="margin-top:8px;word-break:break-all">${esc(String(raw).slice(0, 60))}</div>
        <button class="btn mt16" onclick="reanudarScan()">Escanear de nuevo</button>
      </div>`;
  } else {
    const est = estadoCliente(cliente);
    if (est === 'vencido') {
      html = `
        <div class="result fail">
          <div class="big">⛔</div>
          <div class="name">${esc(cliente.nombre)}</div>
          <div class="meta">Membresía <b>vencida</b> el ${Fecha.fmt(cliente.vence)}</div>
          <div class="btn-row mt16">
            <button class="btn secondary" onclick="reanudarScan()">Rechazar</button>
            <button class="btn success" onclick="Sheet.close();abrirCobro(${cliente.id})">Cobrar ahora</button>
          </div>
        </div>`;
    } else if (!cliente.aptoFisico) {
      html = `
        <div class="result warn">
          <div class="big">⚠︎</div>
          <div class="name">${esc(cliente.nombre)}</div>
          <div class="meta">Apto físico pendiente — ingreso registrado igualmente</div>
          <button class="btn mt16" onclick="reanudarScan()">Continuar</button>
        </div>`;
      registrarIngreso(cliente.id, motivo);
    } else {
      const res = await AsistenciasDAO.registrar(cliente.id, motivo);
      if (res.duplicado) {
        html = `
          <div class="result warn">
            <div class="big">ℹ︎</div>
            <div class="name">${esc(cliente.nombre)}</div>
            <div class="meta">Ya ingresó hoy a las ${new Date(res.registro.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
            <button class="btn mt16" onclick="reanudarScan()">Escanear de nuevo</button>
          </div>`;
      } else {
        html = `
          <div class="result ok">
            <div class="big">✓</div>
            <div class="name">${esc(cliente.nombre)}</div>
            <div class="meta">Acceso permitido · ${est === 'porvencer' ? 'Por vencer' : 'Activo'}</div>
            <div class="meta">Vence ${Fecha.fmt(cliente.vence)}</div>
            <div class="meta mono tiny" style="margin-top:6px">${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            <button class="btn mt16" onclick="reanudarScan()">Escanear siguiente</button>
          </div>`;
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      }
    }
  }

  result.innerHTML = html;
  result.classList.remove('hidden');
  document.getElementById('btn-toggle-scan').textContent = 'Detener';
  renderHoy();
}

function registrarIngreso(clienteId, motivo) {
  AsistenciasDAO.registrar(clienteId, motivo || 'Manual').then(renderHoy);
}

async function reanudarScan() {
  const result = document.getElementById('scan-result');
  const frame = document.getElementById('scan-frame');
  const region = document.getElementById('scan-region');
  result.classList.add('hidden');
  result.innerHTML = '';
  if (Scanner.running) {
    frame.style.display = 'block';
  } else {
    await Scanner.start(region, onScanResult).catch(() => {});
    if (Scanner.running) frame.style.display = 'block';
  }
}

/* ---------- Ingreso manual ---------- */
async function ingresoManual() {
  const clientes = await ClientesDAO.all();
  if (!clientes.length) { toast('No hay clientes cargados', 'err'); return; }

  Sheet.open('Ingreso manual', `
    <div class="field">
      <label>Socio</label>
      <select id="im-cliente" class="input">
        ${clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)} — ${ESTADO_LABEL[estadoCliente(c)].txt}</option>`).join('')}
      </select>
    </div>
    <button class="btn success" onclick="registrarManual()">Registrar ingreso</button>
  `);
}

async function registrarManual() {
  const id = Number(val('im-cliente'));
  if (!id) return;
  const res = await AsistenciasDAO.registrar(id, 'Manual');
  Sheet.close();
  toast(res.duplicado ? 'Ya registró ingreso hoy' : 'Ingreso registrado', res.duplicado ? '' : 'ok');
  renderHoy();
}

/* =========================================================
   COBROS / MEMBRESÍAS
   ========================================================= */
async function renderCobros() {
  const [clientes, planes, pagos] = await Promise.all([
    ClientesDAO.all(), PlanesDAO.all(), PagosDAO.all()
  ]);
  const mapa = new Map(clientes.map((c) => [c.id, c]));
  const mes = Fecha.mesActual();
  const mesPagos = pagos.filter((p) => String(p.fecha).slice(0, 7) === mes);
  const totalMes = mesPagos.reduce((s, p) => s + Number(p.monto || 0), 0);

  document.getElementById('page-cobros').innerHTML = `
    <div class="topbar">
      <h1>Cobros</h1>
      <button class="btn sm" onclick="abrirCobro()" style="width:auto">+ Cobrar</button>
    </div>

    <div class="grid2">
      <div class="stat green"><div class="val mono">${fmtMoney(totalMes)}</div><div class="lbl">Recaudado en ${mes.slice(5)}/${mes.slice(2,4)}</div></div>
      <div class="stat tint"><div class="val mono">${mesPagos.length}</div><div class="lbl">Cobros del mes</div></div>
    </div>

    <div class="sec-title">Historial de cobros</div>
    <div class="card">
      ${pagos.length ? pagos.map((p) => `
        <div class="row">
          <div class="avatar" style="background:rgba(10,132,255,.18);color:var(--tint)">$</div>
          <div class="grow">
            <div class="title">${esc(mapa.get(p.clienteId)?.nombre || 'Cliente eliminado')}</div>
            <div class="sub">${esc(p.planNombre || 'Plan')} · ${Fecha.fmt(p.fecha)} · ${esc(p.medio || 'efectivo')}</div>
            <div class="sub" style="color:var(--green)">Vence → ${Fecha.fmt(p.venceGenerado)}</div>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-weight:800;color:var(--green)">${fmtMoney(p.monto)}</div>
            <button class="tiny" style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px" onclick="borrarPago(${p.id})">borrar</button>
          </div>
        </div>`).join('') : `<div class="empty"><div class="icon">🧾</div><p>Sin cobros registrados.</p></div>`}
    </div>
  `;
}

async function borrarPago(id) {
  if (!(await confirmar('¿Eliminar este cobro? (No modifica el vencimiento ya aplicado)'))) return;
  await PagosDAO.del(id);
  toast('Cobro eliminado', 'ok');
  renderCobros();
}

async function cobrarRapido(clienteId) {
  Sheet.close();
  setTimeout(() => abrirCobro(clienteId), 260);
}

async function abrirCobro(clienteId = null) {
  const [clientes, planes] = await Promise.all([ClientesDAO.all(), PlanesDAO.all()]);
  if (!clientes.length) { toast('Primero cargá un cliente', 'err'); return; }

  const sel = clienteId || clientes.find((c) => estadoCliente(c) !== 'activo')?.id || clientes[0].id;

  Sheet.open('Registrar cobro', `
    <div class="field">
      <label>Socio</label>
      <select id="cb-cliente" class="input" onchange="actualizarPreviewCobro()">
        ${clientes.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)} — ${ESTADO_LABEL[estadoCliente(c)].txt}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>Plan / Membresía</label>
      <select id="cb-plan" class="input" onchange="actualizarPreviewCobro()">
        ${planes.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${fmtMoney(p.precio)} · ${p.dias} días</option>`).join('')}
      </select>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Monto cobrado</label>
        <input id="cb-monto" class="input mono" type="number" inputmode="decimal" value="${planes[0]?.precio ?? ''}" />
      </div>
      <div class="field">
        <label>Fecha</label>
        <input id="cb-fecha" class="input" type="date" value="${Fecha.hoy()}" />
      </div>
    </div>

    <div class="field">
      <label>Medio de pago</label>
      <select id="cb-medio" class="input">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
        <option value="otro">Otro</option>
      </select>
    </div>

    <div class="card mb16" id="cb-preview"></div>

    <button class="btn success" onclick="guardarCobro()">Confirmar cobro y extender vencimiento</button>
  `, { onOpen: actualizarPreviewCobro });
}

async function actualizarPreviewCobro() {
  const el = document.getElementById('cb-preview');
  if (!el) return;
  const cli = await ClientesDAO.get(Number(val('cb-cliente')));
  const plan = await PlanesDAO.get(Number(val('cb-plan')));
  if (!cli || !plan) { el.innerHTML = ''; return; }

  const fecha = val('cb-fecha') || Fecha.hoy();
  const base = (cli.vence && !Fecha.esVencido(cli.vence)) ? cli.vence : fecha;
  const nuevo = Fecha.addDays(base, plan.dias || 30);

  el.innerHTML = `
    <div class="row">
      <div class="grow sub">Vencimiento actual</div>
      <div class="${cli.vence && Fecha.esVencido(cli.vence) ? '' : ''}" style="color:${cli.vence && Fecha.esVencido(cli.vence) ? 'var(--red)' : 'var(--label)'}">${Fecha.fmt(cli.vence) || '—'}</div>
    </div>
    <div class="row">
      <div class="grow sub">Nuevo vencimiento</div>
      <div style="color:var(--green);font-weight:700">${Fecha.fmt(nuevo)}</div>
    </div>
    <div class="row">
      <div class="grow sub">Extendido</div>
      <div>${plan.dias} días ${cli.vence && !Fecha.esVencido(cli.vence) ? '(sobre fecha vigente)' : '(desde hoy)'}</div>
    </div>`;
}

async function guardarCobro() {
  const clienteId = Number(val('cb-cliente'));
  const planId = Number(val('cb-plan'));
  if (!clienteId || !planId) { toast('Completá socio y plan', 'err'); return; }

  try {
    const { nuevoVence } = await PagosDAO.registrar({
      clienteId, planId,
      monto: val('cb-monto'),
      fecha: val('cb-fecha') || Fecha.hoy(),
      medio: val('cb-medio')
    });
    Sheet.close();
    toast(`Cobro OK · Vence ${Fecha.fmt(nuevoVence)}`, 'ok');
    const activa = document.querySelector('.page.active')?.id;
    if (activa === 'page-cobros') renderCobros();
    else if (activa === 'page-clientes') renderClientes();
    else renderDashboard();
  } catch (e) {
    toast(e.message || 'Error al registrar', 'err');
  }
}

/* =========================================================
   AJUSTES / PLANES / BACKUP
   ========================================================= */
async function renderAjustes() {
  const planes = await PlanesDAO.all();
  const info = await infoBackup();
  const swReady = !!navigator.serviceWorker?.controller;

  document.getElementById('page-ajustes').innerHTML = `
    <div class="topbar"><h1>Ajustes</h1></div>

    <div class="sec-title">Copia de seguridad</div>
    <div class="card" style="padding:16px">
      <p class="tiny muted mb12">
        Toda la información vive <b>solo en este iPhone</b> (IndexedDB).
        Exportá un archivo .json para guardarlo en Archivos o iCloud y poder restaurarlo cuando quieras.
      </p>
      <div class="grid2 mb12">
        <div class="stat tint"><div class="val mono">${info.clientes}</div><div class="lbl">Clientes</div></div>
        <div class="stat green"><div class="val mono">${info.pagos}</div><div class="lbl">Cobros</div></div>
        <div class="stat purple"><div class="val mono">${info.planes}</div><div class="lbl">Planes</div></div>
        <div class="stat orange"><div class="val mono">${info.asistencias}</div><div class="lbl">Asistencias</div></div>
      </div>
      <button class="btn mb12" onclick="exportarBackup().then(n=>toast('Exportado: '+n,'ok')).catch(()=>toast('Error al exportar','err'))">
        ⬇︎ Exportar copia de seguridad
      </button>
      <button class="btn warn mb12" onclick="document.getElementById('import-input').click()">
        ⬆︎ Restaurar / importar copia
      </button>
      <input id="import-input" type="file" accept=".json,application/json" class="hidden"
             onchange="importarDesdeArchivo(this.files[0]); this.value='';" />
      <p class="tiny muted center">La importación <b>reemplaza</b> todos los datos actuales.</p>
    </div>

    <div class="sec-title">Planes de membresía</div>
    <div class="card">
      ${planes.map((p) => `
        <div class="row">
          <div class="grow">
            <div class="title">${esc(p.nombre)}</div>
            <div class="sub">${p.dias} días · ${fmtMoney(p.precio)}</div>
          </div>
          <button class="btn sm secondary" onclick='editarPlan(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Editar</button>
          <button class="btn sm danger" onclick="borrarPlan(${p.id})">✕</button>
        </div>`).join('') || `<div class="empty"><p>Sin planes.</p></div>`}
      <div class="row" onclick="editarPlan()" style="cursor:pointer">
        <div class="grow title" style="color:var(--tint)">+ Agregar plan</div>
      </div>
    </div>

    <div class="sec-title">Datos de la app</div>
    <div class="card">
      <div class="row"><div class="grow title">Almacenamiento</div><div class="chip blue">IndexedDB local</div></div>
      <div class="row"><div class="grow title">Servidor / API</div><div class="chip gray">Ninguno (100% cliente)</div></div>
      <div class="row"><div class="grow title">Service Worker</div><div class="chip ${swReady ? 'green' : 'orange'}">${swReady ? 'Activo' : 'Instalado'}</div></div>
      <div class="row"><div class="grow title">Conexión</div><div class="chip ${navigator.onLine ? 'green' : 'orange'}">${navigator.onLine ? 'Online' : 'Offline'}</div></div>
      <div class="row"><div class="grow title">Versión</div><div class="mono tiny">1.0.0</div></div>
    </div>

    <div class="sec-title">Zona de peligro</div>
    <div class="card" style="padding:16px">
      <button class="btn danger mb12" onclick="borrarTodo()">Borrar TODOS los datos</button>
      <button class="btn secondary" onclick="cargarEjemplo()">Cargar datos de ejemplo</button>
    </div>

    <div class="center mt24 tiny muted" style="padding-bottom:20px">
      Gimnasio Local PWA · funciona sin internet<br/>
      <span class="mono">Datos guardados solo en este dispositivo</span>
    </div>
  `;
}

async function editarPlan(p) {
  const plan = p || null;
  Sheet.open(plan ? 'Editar plan' : 'Nuevo plan', `
    <div class="field"><label>Nombre</label>
      <input id="p-nombre" class="input" placeholder="Ej: Pase Libre" value="${esc(plan?.nombre || '')}"/></div>
    <div class="field-row">
      <div class="field"><label>Precio</label>
        <input id="p-precio" class="input mono" type="number" inputmode="decimal" value="${plan?.precio ?? ''}"/></div>
      <div class="field"><label>Duración (días)</label>
        <input id="p-dias" class="input mono" type="number" inputmode="numeric" value="${plan?.dias ?? 30}"/></div>
    </div>
    <button class="btn" onclick="guardarPlan(${plan?.id ?? 'null'})">Guardar plan</button>
  `);
}

async function guardarPlan(id) {
  const nombre = val('p-nombre');
  if (!nombre) { toast('Ingresá el nombre', 'err'); return; }
  const data = {
    nombre,
    precio: Number(val('p-precio') || 0),
    dias: Number(val('p-dias') || 30)
  };
  if (id) await PlanesDAO.put({ ...data, id });
  else await PlanesDAO.add(data);
  Sheet.close();
  toast('Plan guardado', 'ok');
  renderAjustes();
}

async function borrarPlan(id) {
  if (!(await confirmar('¿Eliminar este plan?'))) return;
  await PlanesDAO.del(id);
  toast('Plan eliminado', 'ok');
  renderAjustes();
}

async function importarDesdeArchivo(file) {
  if (!file) return;
  if (!(await confirmar('Esto REEMPLAZA todos los datos actuales. ¿Continuar?', 'Importar'))) return;
  try {
    const r = await importarBackup(file);
    toast(`Restaurado · ${r.total} registros`, 'ok');
    renderAjustes();
  } catch (e) {
    toast(e.message || 'Archivo inválido', 'err');
  }
}

async function borrarTodo() {
  if (!(await confirmar('Se eliminarán TODOS los clientes, cobros y asistencias de este dispositivo. ¿Seguro?'))) return;
  if (!(await confirmar('Esta acción no se puede deshacer si no tenés un backup. ¿Borrar?'))) return;
  await db.transaction('rw', db.clientes, db.planes, db.pagos, db.asistencias, async () => {
    await db.clientes.clear();
    await db.planes.clear();
    await db.pagos.clear();
    await db.asistencias.clear();
  });
  await seedIfEmpty();
  toast('Datos borrados', 'ok');
  renderAjustes();
}

async function cargarEjemplo() {
  if (!(await confirmar('Cargar clientes de ejemplo (se suman a los actuales).'))) return;
  const base = Fecha.hoy();
  const ejemplos = [
    { nombre: 'Rodrigo Fernández', telefono: '11 4444 1111', dias: 45, apto: true },
    { nombre: 'María López',       telefono: '11 5555 2222', dias: 5,  apto: true },
    { nombre: 'Carlos Pérez',      telefono: '11 6666 3333', dias: -3, apto: true },
    { nombre: 'Lucía Gómez',       telefono: '11 7777 4444', dias: 20, apto: false }
  ];
  for (const e of ejemplos) {
    await ClientesDAO.add({
      nombre: e.nombre,
      telefono: e.telefono,
      fechaIngreso: Fecha.addDays(base, -30),
      vence: Fecha.addDays(base, e.dias),
      aptoFisico: e.apto,
      plan: 'Pase Libre',
      notas: '',
      foto: null,
      qrToken: nuevoToken(),
      creado: Date.now()
    });
  }
  toast('Datos de ejemplo cargados', 'ok');
  renderAjustes();
}

/* =========================================================
   INIT
   ========================================================= */
async function init() {
  await seedIfEmpty();

  // Navegación
  document.querySelectorAll('.bottom-nav button[data-tab]').forEach((b) => {
    b.addEventListener('click', () => irA(b.dataset.tab));
  });

  // Cerrar sheets/modals
  document.getElementById('sheet-backdrop').addEventListener('click', Sheet.close);
  document.getElementById('modal-backdrop').addEventListener('click', Modal.close);
  document.getElementById('sheet-close').addEventListener('click', Sheet.close);
  document.getElementById('modal-close').addEventListener('click', Modal.close);
  document.getElementById('fab').addEventListener('click', () => abrirFormCliente());

  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }

  // Conectividad
  window.addEventListener('online',  () => toast('Conectado', 'ok'));
  window.addEventListener('offline', () => toast('Sin conexión · la app sigue funcionando'));

  irA('dashboard');
}

document.addEventListener('DOMContentLoaded', init);

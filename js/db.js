/* =========================================================
   db.js - Capa de datos 100% local (IndexedDB vía Dexie.js)
   Colecciones: clientes, planes, pagos, asistencias, meta
   ========================================================= */

const db = new Dexie('GimnasioLocalDB');

db.version(1).stores({
  clientes:  '++id, nombre, telefono, estado, fechaIngreso, qrToken',
  planes:    '++id, nombre, precio',
  pagos:     '++id, clienteId, fecha, planId',
  asistencias:'++id, clienteId, fecha, timestamp',
  meta:      'key'
});

/* ---------- Utilidades de fecha ---------- */
const Fecha = {
  hoy() {
    const d = new Date();
    return this.toISO(d);
  },
  toISO(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  parse(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  },
  addDays(iso, days) {
    const d = this.parse(iso) || new Date();
    d.setDate(d.getDate() + Number(days || 0));
    return this.toISO(d);
  },
  diffDays(iso) {
    const d = this.parse(iso);
    if (!d) return null;
    const hoy = this.parse(this.hoy());
    return Math.round((d - hoy) / 86400000);
  },
  esVencido(iso) { const n = this.diffDays(iso); return n !== null && n < 0; },
  porVencer(iso, margen = 7) { const n = this.diffDays(iso); return n !== null && n >= 0 && n <= margen; },
  fmt(iso) {
    const d = this.parse(iso);
    if (!d) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
  fmtHora(ts) {
    const d = new Date(ts);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  mesActual() { return this.hoy().slice(0, 7); }
};

/* ---------- Estado de un cliente ---------- */
function estadoCliente(c) {
  if (!c || !c.vence) return 'vencido';
  const n = Fecha.diffDays(c.vence);
  if (n < 0) return 'vencido';
  if (n <= 7) return 'porvencer';
  return 'activo';
}

const ESTADO_LABEL = {
  activo:    { txt: 'Activo',     cls: 'green' },
  porvencer: { txt: 'Por vencer', cls: 'orange' },
  vencido:   { txt: 'Vencido',    cls: 'red' }
};

/* ---------- QR token único ---------- */
function nuevoToken() {
  const arr = new Uint8Array(16);
  const c = (typeof crypto !== 'undefined' && crypto) || (typeof msCrypto !== 'undefined' && msCrypto);
  if (c && c.getRandomValues) c.getRandomValues(arr);
  else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Clientes ---------- */
const ClientesDAO = {
  all: () => db.clientes.orderBy('nombre').toArray(),
  get: (id) => db.clientes.get(id),
  add: (c) => db.clientes.add(c),
  put: (c) => db.clientes.put(c),
  del: (id) => db.clientes.delete(id),
  porEstado(filtro, q = '') {
    return this.all().then((lista) => {
      let out = lista;
      if (filtro && filtro !== 'todos') out = out.filter((c) => estadoCliente(c) === filtro);
      if (q) {
        const t = q.trim().toLowerCase();
        out = out.filter((c) =>
          (c.nombre || '').toLowerCase().includes(t) ||
          String(c.telefono || '').includes(t)
        );
      }
      return out;
    });
  },
  buscarPorToken(token) {
    return db.clientes.where('qrToken').equals(token).first();
  }
};

/* ---------- Planes ---------- */
const PlanesDAO = {
  all: () => db.planes.orderBy('nombre').toArray(),
  get: (id) => db.planes.get(id),
  add: (p) => db.planes.add(p),
  put: (p) => db.planes.put(p),
  del: (id) => db.planes.delete(id)
};

/* ---------- Pagos ---------- */
const PagosDAO = {
  all: () => db.pagos.orderBy('fecha').reverse().toArray(),
  add: (p) => db.pagos.add(p),
  del: (id) => db.pagos.delete(id),
  async registrar({ clienteId, planId, monto, fecha, medio = 'efectivo', notas = '' }) {
    const plan = await PlanesDAO.get(planId);
    const cli  = await ClientesDAO.get(clienteId);
    if (!plan) throw new Error('Plan inexistente');

    // Calcular nueva fecha de vencimiento
    const base = (cli.vence && !Fecha.esVencido(cli.vence)) ? cli.vence : (fecha || Fecha.hoy());
    const nuevoVence = Fecha.addDays(base, plan.dias || 30);

    const pago = {
      clienteId, planId,
      planNombre: plan.nombre,
      monto: Number(monto ?? plan.precio),
      fecha: fecha || Fecha.hoy(),
      medio, notas,
      venceGenerado: nuevoVence,
      creado: Date.now()
    };

    const id = await db.pagos.add(pago);

    await db.clientes.update(clienteId, {
      vence: nuevoVence,
      plan: plan.nombre,
      planId: plan.id
    });

    return { pago, id, nuevoVence };
  }
};

/* ---------- Asistencias ---------- */
const AsistenciasDAO = {
  all: () => db.asistencias.orderBy('timestamp').reverse().toArray(),
  del: (id) => db.asistencias.delete(id),
  async registrar(clienteId, motivo = 'QR') {
    const hoy = Fecha.hoy();
    // evitar doble ingreso el mismo día
    const dup = await db.asistencias
      .where('clienteId').equals(clienteId)
      .and((a) => a.fecha === hoy);
    if (dup.length) return { duplicado: true, registro: dup[0] };

    const reg = {
      clienteId,
      fecha: hoy,
      timestamp: Date.now(),
      motivo
    };
    reg.id = await db.asistencias.add(reg);
    return { duplicado: false, registro: reg };
  },
  hoy: () => db.asistencias.where('fecha').equals(Fecha.hoy()).toArray()
};

/* ---------- Seed inicial ---------- */
async function seedIfEmpty() {
  const n = await db.planes.count();
  if (n === 0) {
    await db.planes.bulkAdd([
      { nombre: 'Pase Libre',        precio: 25000, dias: 30 },
      { nombre: '2 días por semana', precio: 18000, dias: 30 },
      { nombre: 'Mensual',           precio: 20000, dias: 30 },
      { nombre: 'Trimestral',        precio: 54000, dias: 90 },
      { nombre: 'Anual',             precio: 190000, dias: 365 }
    ]);
  }
}

/* ---------- Backup / Restore ---------- */
const BACKUP_VERSION = 1;

async function exportarBackup() {
  const data = {
    app: 'GimnasioLocalPWA',
    version: BACKUP_VERSION,
    exportado: new Date().toISOString(),
    datos: {
      clientes:   await db.clientes.toArray(),
      planes:     await db.planes.toArray(),
      pagos:      await db.pagos.toArray(),
      asistencias: await db.asistencias.toArray(),
      meta:       await db.meta.toArray()
    }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const nombre = `gimnasio-backup-${Fecha.hoy()}.json`;

  // iOS Safari: fallback a link de descuida si no hay showSaveFilePicker
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return nombre;
}

async function importarBackup(file) {
  const texto = await file.text();
  let data;
  try {
    data = JSON.parse(texto);
  } catch (e) {
    throw new Error('El archivo no es un JSON válido.');
  }

  // Acepta tanto el formato propio como un volcado plano
  const src = data && data.datos ? data.datos : data;
  if (!src || typeof src !== 'object') throw new Error('Formato de backup no reconocido.');

  const cols = ['clientes', 'planes', 'pagos', 'asistencias', 'meta'];
  let total = 0;
  const counts = {};

  await db.transaction('rw', db.clientes, db.planes, db.pagos, db.asistencias, db.meta, async () => {
    // Reescribir completo
    await db.clientes.clear();
    await db.planes.clear();
    await db.pagos.clear();
    await db.asistencias.clear();
    await db.meta.clear();

    for (const c of cols) {
      const arr = Array.isArray(src[c]) ? src[c] : [];
      counts[c] = arr.length;
      total += arr.length;
      if (arr.length) await db[c].bulkAdd(arr);
    }
  });

  return { total, counts };
}

async function infoBackup() {
  return {
    clientes: await db.clientes.count(),
    planes: await db.planes.count(),
    pagos: await db.pagos.count(),
    asistencias: await db.asistencias.count()
  };
}

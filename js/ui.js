/* =========================================================
   ui.js - Utilidades de interfaz (toast, sheet, modal, form)
   ========================================================= */

/* ---------- Escape HTML ---------- */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Sheet (bottom sheet) ---------- */
const Sheet = {
  open(title, bodyHTML, opts = {}) {
    const bd = document.getElementById('sheet-backdrop');
    const sh = document.getElementById('sheet');
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').innerHTML = bodyHTML;
    bd.classList.add('open');
    requestAnimationFrame(() => sh.classList.add('open'));
    if (opts.onOpen) setTimeout(opts.onOpen, 320);
  },
  close() {
    document.getElementById('sheet-backdrop').classList.remove('open');
    document.getElementById('sheet').classList.remove('open');
  }
};

/* ---------- Modal (diálogo centrado) ---------- */
const Modal = {
  open(bodyHTML, opts = {}) {
    const bd = document.getElementById('modal-backdrop');
    const m = document.getElementById('modal');
    document.getElementById('modal-body').innerHTML = bodyHTML;
    bd.classList.add('open');
    requestAnimationFrame(() => m.classList.add('open'));
    if (opts.onOpen) setTimeout(opts.onOpen, 100);
  },
  close() {
    document.getElementById('modal-backdrop').classList.remove('open');
    document.getElementById('modal').classList.remove('open');
  }
};

/* ---------- Confirm nativo ---------- */
function confirmar(mensaje, okLabel = 'Aceptar') {
  return new Promise((resolve) => {
    Modal.open(`
      <div class="center">
        <p style="font-size:17px;margin:6px 0 20px;">${esc(mensaje)}</p>
        <div class="btn-row">
          <button class="btn secondary" id="cf-no">Cancelar</button>
          <button class="btn" id="cf-yes">${esc(okLabel)}</button>
        </div>
      </div>`);
    document.getElementById('cf-no').onclick = () => { Modal.close(); resolve(false); };
    document.getElementById('cf-yes').onclick = () => { Modal.close(); resolve(true); };
  });
}

/* ---------- Form helpers ---------- */
function val(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v ?? '';
}
function fotoADataUrl(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      const scale = Math.min(1, maxSize / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const out = c.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
function iniciales(nombre) {
  return String(nombre || '?').trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join('');
}
function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}

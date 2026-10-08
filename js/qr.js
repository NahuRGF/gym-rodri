/* =========================================================
   qr.js - Generación de QR único por cliente
   Payload: GYM::<qrToken>  (token aleatorio de 128 bits)
   ========================================================= */

function generarQRDataURL(texto, size = 260) {
  if (typeof qrcode !== 'function') throw new Error('Librería QR no cargada');
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();

  const modules = qr.getModuleCount();
  const cell = Math.floor(size / modules);
  const px = cell * modules;
  const quiet = 2;
  const total = px + quiet * cell * 2;

  const canvas = document.createElement('canvas');
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, total, total);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
  }
  return canvas.toDataURL('image/png');
}

function payloadDeCliente(c) {
  return `GYM::${c.qrToken}`;
}

function esPayloadNuestro(txt) {
  return typeof txt === 'string' && txt.startsWith('GYM::') && txt.length > 6;
}

function tokenDePayload(txt) {
  return txt.slice(5);
}

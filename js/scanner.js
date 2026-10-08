/* =========================================================
   scanner.js - Escáner de QR con cámara (iPhone)
   Estrategia: BarcodeDetector (nativo iOS 17+/Chrome) 
               -> fallback html5-qrcode
   ========================================================= */

const Scanner = (() => {
  let mode = null;          // 'native' | 'html5'
  let html5 = null;
  let nativeStream = null;
  let nativeRaf = null;
  let running = false;
  let lastValue = null;
  let lastTime = 0;
  let onResult = null;
  let detector = null;

  const VIDEO_ID = 'scan-video';

  function soportaNativo() {
    return 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
  }

  async function start(container, callback) {
    stop();
    running = true;
    onResult = callback;
    lastValue = null;

    if (soportaNativo()) {
      mode = 'native';
      try {
        await startNative(container);
        return;
      } catch (e) {
        console.warn('BarcodeDetector falló, usando html5-qrcode', e);
        cleanupNative();
        mode = 'html5';
      }
    } else {
      mode = 'html5';
    }
    await startHtml5(container);
  }

  /* ---------- Nativo: BarcodeDetector + getUserMedia ---------- */
  async function startNative(container) {
    nativeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    const video = document.createElement('video');
    video.id = VIDEO_ID;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
    video.style.width = '100%';
    video.style.borderRadius = '16px';
    video.style.display = 'block';
    video.srcObject = nativeStream;
    container.innerHTML = '';
    container.appendChild(video);
    await video.play();

    detector = new BarcodeDetector({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'pdf417']
    });

    const tick = async () => {
      if (!running || mode !== 'native') return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes && codes.length) handleRaw(codes[0].rawValue);
        }
      } catch (e) { /* ignorar frame con error */ }
      nativeRaf = requestAnimationFrame(() => setTimeout(tick, 90));
    };
    tick();
  }

  function cleanupNative() {
    if (nativeRaf) cancelAnimationFrame(nativeRaf);
    nativeRaf = null;
    if (nativeStream) nativeStream.getTracks().forEach((t) => t.stop());
    nativeStream = null;
    const v = document.getElementById(VIDEO_ID);
    if (v) v.remove();
  }

  /* ---------- Fallback: html5-qrcode ---------- */
  async function startHtml5(container) {
    container.innerHTML = '<div id="reader"></div>';
    html5 = new Html5Qrcode('reader');
    const config = {
      fps: 10,
      qrbox: { width: 230, height: 230 },
      aspectRatio: 1.0,
      disableFlip: false,
      videoStabilizationMode: 'auto'
    };
    await html5.start(
      { facingMode: 'environment' },
      config,
      (decoded) => handleRaw(decoded),
      () => {}
    );
  }

  function handleRaw(raw) {
    if (!running || !onResult) return;
    const now = Date.now();
    if (raw === lastValue && now - lastTime < 2500) return;
    lastValue = raw;
    lastTime = now;
    onResult(raw);
  }

  async function stop() {
    running = false;
    if (mode === 'native') cleanupNative();
    if (html5) {
      try {
        if (html5.isScanning) await html5.stop();
      } catch (e) { /* noop */ }
      try { html5.clear(); } catch (e) { /* noop */ }
      html5 = null;
    }
    mode = null;
    onResult = null;
    const c = document.getElementById('scan-region');
    if (c) c.innerHTML = '';
  }

  return { start, stop, get running() { return running; }, get mode() { return mode; } };
})();

// Reads a QR code from the camera: the browser's BarcodeDetector where it reads QR codes, otherwise
// jsQR on video frames, with qr-code.js's gap closing for Ratspeak's rounded modules.
import { decodeRoundedQr } from './qr-code.js';

const JSQR_SRC = '/assets/vendor/jsqr/jsQR.js';
const FRAME_MS = 90;
const FRAME_MAX = 720;
// Gap closing costs far more than a plain read; try it on every third frame.
const ROUNDED_EVERY = 3;
let jsQrLoading = null;

function loadJsQr() {
  if (typeof window.jsQR === 'function') return Promise.resolve(window.jsQR);
  jsQrLoading = jsQrLoading || new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: JSQR_SRC, async: true });
    script.onload = () => typeof window.jsQR === 'function' ? resolve(window.jsQR) : reject(new Error('QR reader did not load.'));
    script.onerror = () => { jsQrLoading = null; reject(new Error('QR reader did not load.')); };
    document.head.append(script);
  });
  return jsQrLoading;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    if (typeof BarcodeDetector.getSupportedFormats === 'function' && !(await BarcodeDetector.getSupportedFormats()).includes('qr_code')) return null;
    return new BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/** Whether this browser can open a camera at all. */
export const cameraAvailable = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/**
 * Shows the camera in video and reads QR codes until onCode(text) returns true or stop() is
 * called. Rejects when the camera cannot open; the error's name is getUserMedia's.
 */
export async function startQrScan(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  let stopped = false, timer = null, frames = 0;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  };
  try {
    video.srcObject = stream;
    await video.play();
    const detector = await nativeDetector();
    const jsQR = detector ? null : await loadJsQr();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const read = async () => {
      if (detector) {
        const codes = await detector.detect(video);
        return codes.length ? codes[0].rawValue : null;
      }
      // A centred square, scaled down: the card fills the middle of the frame.
      const side = Math.min(video.videoWidth, video.videoHeight);
      const size = Math.min(FRAME_MAX, side);
      canvas.width = canvas.height = size;
      context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
      const { data } = context.getImageData(0, 0, size, size);
      const code = jsQR(data, size, size, { inversionAttempts: 'dontInvert' }) ||
        (++frames % ROUNDED_EVERY === 0 ? decodeRoundedQr(jsQR, data, size, size) : null);
      return code ? code.data : null;
    };
    const tick = async () => {
      if (stopped) return;
      let text = null;
      try {
        if (video.readyState >= 2 && video.videoWidth) text = await read();
      } catch { /* a frame that cannot be read is skipped */ }
      if (stopped) return;
      if (text && await onCode(text)) stop();
      else timer = setTimeout(() => requestAnimationFrame(tick), FRAME_MS);
    };
    tick();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

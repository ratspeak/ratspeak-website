import { md5Bytes } from './md5.js';

export async function serialTimeout(promise, timeout = 10000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Device inspection timed out. Reconnect USB and try again.')), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

const closed = new WeakSet();
export async function closeFlashTransport(transport) {
  if (closed.has(transport)) return;
  // esptool-js 0.5.7 cancels its reader but does not release its stream lock.
  // Release it before disconnect(), which otherwise waits indefinitely.
  const reader = transport.reader;
  if (reader) {
    try { await serialTimeout(reader.cancel(), 2000); }
    finally { reader.releaseLock(); transport.reader = undefined; }
  }
  await serialTimeout(transport.disconnect(), 3000);
  closed.add(transport);
}

export async function readFlashMetadata(loader, address, size) {
  const bytes = await serialTimeout(loader.readFlash(address, size));
  if (!(bytes instanceof Uint8Array) || bytes.length !== size) throw new Error('Incomplete device read');
  // The stub ends each read with a separate MD5 frame. Consume and verify it;
  // flushInput() in the pinned library waits for reader.closed and never returns
  // while the serial connection is open.
  const { value: digest } = await serialTimeout(loader.transport.read(3000).next(), 4000);
  const expected = md5Bytes(bytes);
  if (!(digest instanceof Uint8Array) || digest.length !== 16 ||
      !digest.every((byte, index) => byte === expected[index])) throw new Error('Device read checksum mismatch');
  return bytes;
}

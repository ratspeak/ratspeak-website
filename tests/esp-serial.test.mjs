import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { readFlashMetadata, closeFlashTransport, serialTimeout } from '../assets/js/esp-serial.js';
import { md5Bytes } from '../assets/js/md5.js';

// Import the exact browser bundle as ESM; 0.5.7's package lacks type:module.
const require = createRequire(import.meta.url);
const bundle = readFileSync(require.resolve('esptool-js/bundle.js'));
const { ESPLoader, Transport } = await import(`data:text/javascript;base64,${Buffer.concat([bundle,
  Buffer.from('\n//# sourceURL=esptool-js-0.5.7-bundle.js\n')]).toString('base64')}`);
const md5 = bytes => new Uint8Array(createHash('md5').update(bytes).digest());

function serialFixture({ corruptDigest = false, missingDigest = false, fragmented = false } = {}) {
  const memory = Uint8Array.from({ length: 0x10000 }, (_, i) => i % 256);
  let controller, transfer, received = 0, pending = 0, closes = 0;
  const commands = [];
  const port = {
    getInfo: () => ({}), open: async () => {},
    readable: new ReadableStream({ start(value) { controller = value; } }),
    async close() {
      assert.equal(this.readable.locked, false);
      assert.equal(this.writable.locked, false);
      closes++; this.readable = null; this.writable = null;
    },
    writable: new WritableStream({ write(wire) {
      const payload = [];
      for (let i = 1; i < wire.length - 1; i++) {
        let byte = wire[i];
        if (byte === 0xdb) byte = wire[++i] === 0xdc ? 0xc0 : 0xdb;
        payload.push(byte);
      }
      const packet = Uint8Array.from(payload);
      const view = new DataView(packet.buffer);
      if (packet.length === 4) {
        received = view.getUint32(0, true);
        assert.equal(received, pending, 'host acknowledges the bytes actually received');
        if (received === transfer.length) {
          if (!missingDigest) { const digest = md5(transfer); if (corruptDigest) digest[0] ^= 1; send(digest); }
        } else nextBlock();
      } else {
        assert.equal(packet[1], loader.ESP_READ_FLASH, 'fixture permits read commands only');
        commands.push(packet[1]);
        const address = view.getUint32(8, true), size = view.getUint32(12, true);
        transfer = memory.slice(address, address + size); received = 0;
        send(Uint8Array.of(1, packet[1], 2, 0, 0, 0, 0, 0, 0, 0));
        nextBlock();
      }
    } })
  };
  const transport = new Transport(port);
  function send(frame) {
    const wire = transport.slipWriter(frame);
    if (fragmented) {
      for (let i = 0; i < wire.length; i += 31) controller.enqueue(wire.slice(i, i + 31));
    } else controller.enqueue(wire);
  }
  function nextBlock() {
    const block = transfer.slice(received, received + 4096);
    pending = received + block.length; send(block);
  }
  const loader = new ESPLoader({ transport, baudrate: 115200, terminal: { clean() {}, write() {}, writeLine() {} } });
  loader.DEFAULT_TIMEOUT = 50; loader.FLASH_READ_TIMEOUT = 50;
  return { loader, port, memory, commands, get closes() { return closes; } };
}

test('existing MD5 implementation matches native hashes for metadata and application-sized inputs', () => {
  for (const size of [0, 1, 55, 56, 64, 288, 3072, 8192, 3 * 1024 * 1024]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251);
    assert.deepEqual(md5Bytes(bytes), md5(bytes));
  }
});

for (const fragmented of [false, true]) test(`real esptool reads consecutive metadata transfers and drains each digest; fragmented=${fragmented}`, async () => {
  const f = serialFixture({ fragmented });
  await f.loader.transport.connect();
  try {
    for (const size of [3072, 288, 8192]) {
      assert.deepEqual(await readFlashMetadata(f.loader, 0x8000, size), f.memory.slice(0x8000, 0x8000 + size));
      assert.equal(f.loader.transport.buffer.length, 0);
    }
    assert.equal(f.commands.length, 3);
  } finally { await closeFlashTransport(f.loader.transport); }
  assert.equal(f.closes, 1);
  await closeFlashTransport(f.loader.transport);
  assert.equal(f.closes, 1, 'recovery cleanup is idempotent');
});

test('bad read digest fails verification and the real transport can close', async () => {
  const f = serialFixture({ corruptDigest: true });
  await f.loader.transport.connect();
  await assert.rejects(readFlashMetadata(f.loader, 0x8000, 288), /checksum mismatch/);
  await serialTimeout(closeFlashTransport(f.loader.transport), 200);
});

test('missing digest fails within the serial read deadline and releases the port', async t => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const f = serialFixture({ missingDigest: true });
  await f.loader.transport.connect();
  const read = f.loader.transport.read.bind(f.loader.transport);
  f.loader.transport.read = timeout => read(Math.min(timeout, 30));
  await assert.rejects(readFlashMetadata(f.loader, 0x8000, 288), /No serial data received/);
  await serialTimeout(closeFlashTransport(f.loader.transport), 200);
  assert.equal(f.closes, 1);
  assert.equal(errors.length, 1);
});

test('inspection deadlines reject an operation that never settles', async () => {
  await assert.rejects(serialTimeout(new Promise(() => {}), 20), /inspection timed out/);
});

test('pinned flush waits for stream closure; metadata reads must not use it', async () => {
  const f = serialFixture();
  await f.loader.transport.connect();
  const flush = f.loader.transport.flushInput();
  await assert.rejects(serialTimeout(flush, 20), /inspection timed out/);
  // Settle the original broken flush without leaving an open stream.
  const reader = f.loader.transport.reader;
  reader.releaseLock();
  await assert.rejects(flush);
  f.loader.transport.reader = undefined;
  await closeFlashTransport(f.loader.transport);
});

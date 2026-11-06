import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { DEVICE_CAPS, base64url, buildContactCard, cardName, destinationHash, identityHash, nodeContactCard,
  parseContactCard } from '../assets/js/rsnode-card.js';
import { QR_QUIET_MODULES, QrContactCard, decodeRoundedQr } from '../assets/js/qr-code.js';

// Generated with rsReticulum's rns-identity by scripts/rsnode-card-vectors.py; RSCP1 as Ratspeak's contact_card.rs writes it.
const vectors = JSON.parse(readFileSync(new URL('./fixtures/rsnode-card-vectors.json', import.meta.url), 'utf8'));
const bytes = value => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = value => Buffer.from(value).toString('hex');
const [alice, node, zoe] = vectors.identities;

// The vendored jsQR, as the page loads it: a script that sets self.jsQR.
const jsQrContext = {};
jsQrContext.self = jsQrContext;
vm.runInNewContext(readFileSync(new URL('../assets/vendor/jsqr/jsQR.js', import.meta.url), 'utf8'), jsQrContext);
const { jsQR } = jsQrContext;

test('hashes are rns-identity\'s: identity, LXMF address, and management destination', async () => {
  for (const entry of vectors.identities) {
    const identity = await identityHash(bytes(entry.publicKey));
    assert.equal(hex(identity), entry.identity, entry.name);
    assert.equal(hex(await destinationHash('lxmf.delivery', identity)), entry.lxmf, entry.name);
    assert.equal(hex(await destinationHash('rsnode.manage', identity)), entry.manage, entry.name);
  }
});

test('an RSCP1 card from Ratspeak reads as a person, with its key', async () => {
  for (const entry of vectors.identities) {
    const card = await parseContactCard(`  ${entry.rscp1}\n`);
    assert.deepEqual({ ...card, publicKey: hex(card.publicKey) }, { version: 1, kind: 'person', rawKind: 'person', name: entry.name,
      lxmf: entry.lxmf, identity: entry.identity, publicKey: entry.publicKey, caps: [] });
  }
});

test('RSCP2 round-trips, and the node\'s card is a device with the rsNode capabilities', async () => {
  const person = buildContactCard({ name: alice.name, lxmf: alice.lxmf, identity: alice.identity, publicKey: bytes(alice.publicKey) });
  assert.equal(person, alice.rscp1.replace('RSCP1:', 'RSCP2:person:') + ':');
  const identity = { name: node.name, lxmf: node.lxmf, identity: node.identity, publicKey: bytes(node.publicKey) };
  const text = nodeContactCard(identity);
  assert.equal(text, `RSCP2:device:${base64url(Buffer.from(node.name))}:${node.lxmf}:${node.identity}:${node.rscp1.split(':')[4]}:rsnode,rsnode.update`);
  const card = await parseContactCard(text);
  assert.deepEqual([card.version, card.kind, card.name, card.lxmf, card.identity, hex(card.publicKey), card.caps],
    [2, 'device', node.name, node.lxmf, node.identity, node.publicKey, [...DEVICE_CAPS]]);
  // Unknown kinds read as a person and keep their raw value; unknown capabilities are kept.
  const robot = await parseContactCard(text.replace(':device:', ':robot:').replace(/rsnode\.update$/, 'rsnode.update,future'));
  assert.deepEqual([robot.kind, robot.rawKind, robot.caps], ['person', 'robot', ['rsnode', 'rsnode.update', 'future']]);
  // Hashes are emitted lower case and read in either case.
  assert.equal((await parseContactCard(text.replace(node.lxmf, node.lxmf.toUpperCase()))).lxmf, node.lxmf);
});

test('names are trimmed to 40 UTF-8 bytes on whole characters, as contact_card.rs trims them', () => {
  assert.equal(cardName('  rsNode 887A  '), 'rsNode 887A');
  assert.equal(cardName('x'.repeat(39) + 'é'), 'x'.repeat(39));
  assert.equal(Buffer.byteLength(cardName('🐀'.repeat(11))), 40);
  assert.equal(cardName('a'.repeat(39) + ' 🐀'), 'a'.repeat(39));
  assert.equal(cardName(zoe.name), zoe.name);
});

test('a card whose hashes do not match its key, or that is cut or padded, is refused', async () => {
  const [prefix, name, lxmf, identity, key] = alice.rscp1.split(':');
  const card = parts => parts.join(':');
  await assert.rejects(parseContactCard(card([prefix, name, node.lxmf, identity, key])), /address does not match/);
  await assert.rejects(parseContactCard(card([prefix, name, lxmf, node.identity, key])), /identity hash does not match/);
  await assert.rejects(parseContactCard(card([prefix, name, lxmf, identity, key.slice(0, -2)])), /64 bytes/);
  await assert.rejects(parseContactCard(card([prefix, name + '=', lxmf, identity, key])), /name is not readable/);
  await assert.rejects(parseContactCard(card([prefix, name, lxmf.slice(1), identity, key])), /32 hexadecimal/);
  await assert.rejects(parseContactCard(card([prefix, name, lxmf, identity])), /incomplete/);
  await assert.rejects(parseContactCard(card(['RSCP2', 'device', name, lxmf, identity, key])), /incomplete/);
  await assert.rejects(parseContactCard(lxmf), /not a Ratspeak contact card/);
  await assert.rejects(parseContactCard(card([prefix, base64url([0xff]), lxmf, identity, key])), /name is not readable/);
});

// The symbol as one byte per pixel; rounded modules are inset squares with cut corners, and the centre is cleared for the mark.
function raster(qr, cell, rounded) {
  const size = (qr.size + QR_QUIET_MODULES * 2) * cell;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  const clear = size * 0.155 * 1.18, low = (size - clear) / 2, high = (size + clear) / 2;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      const px = (x + QR_QUIET_MODULES) * cell, py = (y + QR_QUIET_MODULES) * cell;
      if (rounded && px + cell / 2 >= low && px + cell / 2 <= high && py + cell / 2 >= low && py + cell / 2 <= high) continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          if (rounded) {
            const inset = cell * 0.08, edge = cell - inset, corner = cell * 0.24;
            if (dx < inset || dy < inset || dx >= edge || dy >= edge) continue;
            const cx = Math.min(Math.max(dx, inset + corner), edge - corner), cy = Math.min(Math.max(dy, inset + corner), edge - corner);
            if ((dx - cx) ** 2 + (dy - cy) ** 2 > corner ** 2) continue;
          }
          rgba.fill(17, ((py + dy) * size + px + dx) * 4, ((py + dy) * size + px + dx) * 4 + 3);
        }
      }
    }
  }
  return { rgba, size };
}

test('the contact-card symbol is v13-Q, reads back exactly, and its rounded look reads with the gap closing', () => {
  const text = nodeContactCard({ name: node.name, lxmf: node.lxmf, identity: node.identity, publicKey: bytes(node.publicKey) });
  const qr = QrContactCard(text);
  assert.deepEqual([qr.version, qr.ecc, qr.mask, qr.size], [13, 'Q', 0, 69]);
  const square = raster(qr, 6, false);
  assert.equal(jsQR(square.rgba, square.size, square.size).data, text);
  const rounded = raster(qr, 12, true);
  assert.equal(decodeRoundedQr(jsQR, rounded.rgba, rounded.size, rounded.size).data, text);
  // A 40-byte name is the longest a device card holds.
  const long = nodeContactCard({ name: '🐀'.repeat(10), lxmf: node.lxmf, identity: node.identity, publicKey: bytes(node.publicKey) });
  assert.equal(Buffer.byteLength(long), 241);
  assert.equal(QrContactCard(long).version, 13);
  assert.throws(() => QrContactCard(long + 'x'), /too large/);
});

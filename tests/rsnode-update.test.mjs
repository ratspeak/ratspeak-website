import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';
import vm from 'node:vm';
import { chooseRsnodeInstall, parseRsnodeBundle, rsnodeOtaTarget, streamRsnodeUpdate, verifyRsnodeBundle } from '../assets/js/rsnode-update.js';
import { parseRsnodeStatus } from '../assets/js/rsnode-device.js';
import { flasherPage } from './flasher-page.mjs';

const html = flasherPage('flash.html');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(|var ${name} = (?!\\{)[^;]*;|var ${name} = `).exec(html);
  assert.ok(match, `missing ${name}`);
  if (match[0].endsWith(';')) return match[0];
  const open = html.indexOf('{', match.index);
  let depth = 0, quote = null, escaped = false, comment = null;
  for (let i = open; i < html.length; i++) {
    const c = html[i], next = html[i + 1];
    if (comment) {
      if (comment === '//' ? c === '\n' : c === '*' && next === '/') { if (comment === '/*') i++; comment = null; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && (next === '/' || next === '*')) { comment = c + next; i++; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(match.index, i + 1) + (html[i + 1] === ';' ? ';' : '');
  }
  throw new Error('Unterminated ' + name);
}

// The page's own KISS session code.
const names = ['KISS', 'RNODE_READ_TIMEOUT_MS', 'kissEscape', 'kissFrame', 'decodeKissPayload', 'createKissReadPump',
  'createRnodeSession', 'closeRnodeSession'];
const { createRnodeSession, closeRnodeSession } = vm.runInNewContext(names.map(extract).join('\n') +
  '\n({ createRnodeSession, closeRnodeSession })', { Uint8Array, setTimeout, clearTimeout, console });

const be32 = value => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const u32 = (bytes, offset = 0) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
const tlv = (tag, value) => [tag, value.length, ...value];

// An .rsota as rsNode's package_ota.py lays it out; the signature is opaque to the flasher.
function bundleFor({ target = [0x80, 0x81, 0x3f], sequence = 2026110201, size = 2000 } = {}) {
  const image = Uint8Array.from({ length: size }, (_, index) => (index * 7 + 0xe9) & 0xff);
  image[0] = 0xe9;
  const manifest = new Uint8Array(128);
  manifest.set([0x52, 0x53, 0x4f, 0x54, 1, ...target]);
  manifest.set([...be32(sequence), ...be32(size), 0, 1, 0, 0, 0, 0], 8);
  manifest.set(Buffer.from(sha(image), 'hex'), 24);
  manifest.fill(0x5a, 64);
  const bytes = new Uint8Array(128 + size);
  bytes.set(manifest);
  bytes.set(image, 128);
  return {
    bytes, image,
    meta: { fileName: 'rsnode-heltec-v4.rsota', size: bytes.length, sha256: sha(bytes), sequence,
      otaTarget: target.map(byte => byte.toString(16).padStart(2, '0')).join(':'), releaseKeyId: '0011223344556677',
      version: '1.0.0-beta.20261102.1' }
  };
}

function statusBody({ board = 0x3f, release = '1.0.0-beta.20261030.2', keyId = '0011223344556677', sequence = 2026103002,
  trial = false, pending = null } = {}) {
  return [
    ...tlv(0x01, [0x80, 0x81, board]),
    ...tlv(0x02, [0, 1, 0, 0, 0, 0]),
    ...(keyId ? tlv(0x03, Array.from(Buffer.from(keyId, 'hex'))) : []),
    ...tlv(0x04, [...be32(sequence), ...be32(0x7e0000), trial ? 0x04 : 0]),
    ...(pending === null ? [] : tlv(0x05, be32(pending))),
    ...(release ? tlv(0x0f, Array.from(Buffer.from(release))) : []),
    ...tlv(0x10, [0, 1, 1, 1])
  ];
}

const BUNDLE = bundleFor();
const BOARD = { id: 'heltec-v4', label: 'Heltec V4 · R2' };
const status = options => parseRsnodeStatus(statusBody(options));

test('the decision table: unreported USB update support, other board, other key, trial, up to date, update', () => {
  const meta = BUNDLE.meta;
  const unreported = chooseRsnodeInstall(null, BOARD, meta);
  assert.equal(unreported.kind, 'install');
  assert.equal(unreported.update, false);
  assert.match(unreported.message, /This node did not report support for USB updates\./);
  assert.match(unreported.message, /The Install action erases the node\./);
  assert.equal(chooseRsnodeInstall(status({ board: 0xbf }), BOARD, meta).message, 'This node is a different board or variant.');
  assert.equal(chooseRsnodeInstall(status({ keyId: 'ffeeddccbbaa9988' }), BOARD, meta).message, 'This node trusts a different update key.');
  assert.equal(chooseRsnodeInstall(status({ keyId: null }), BOARD, meta).kind, 'install');
  for (const options of [{ trial: true }, { pending: meta.sequence }]) {
    assert.deepEqual(chooseRsnodeInstall(status(options), BOARD, meta), { kind: 'wait', update: false,
      message: 'Finishing its last update; try again in a minute.' });
  }
  for (const sequence of [meta.sequence, meta.sequence + 1]) {
    const choice = chooseRsnodeInstall(status({ sequence, release: meta.version }), BOARD, meta);
    assert.equal(choice.kind, 'current');
    assert.equal(choice.update, false);
    assert.equal(choice.message, 'Up to date with 1.0.0-beta.20261102.1.');
  }
  const update = chooseRsnodeInstall(status(), BOARD, meta);
  assert.equal(update.kind, 'update');
  assert.equal(update.update, true);
  assert.match(update.message, /^Update from 1\.0\.0-beta\.20261030\.2 to 1\.0\.0-beta\.20261102\.1\. Identity, managers and settings stay\.$/);
  assert.equal(chooseRsnodeInstall(status(), BOARD, undefined).kind, 'install');
  assert.equal(rsnodeOtaTarget(status()), '80:81:3f');
  assert.equal(rsnodeOtaTarget(null), null);
});

test('bundle verification checks size, SHA-256, magic, target, sequence and the image digest', async () => {
  const { bytes, meta } = BUNDLE;
  assert.deepEqual(await verifyRsnodeBundle(bytes.buffer.slice(0), meta), parseRsnodeBundle(bytes));
  assert.deepEqual(parseRsnodeBundle(bytes), { target: '80:81:3f', sequence: meta.sequence, imageLength: 2000,
    version: [1, 0, 0], imageSha256: sha(BUNDLE.image) });
  const failure = /failed verification/;
  await assert.rejects(verifyRsnodeBundle(bytes.slice(1), meta), failure);
  await assert.rejects(verifyRsnodeBundle(bytes, { ...meta, sha256: 'a'.repeat(64) }), failure);
  await assert.rejects(verifyRsnodeBundle(bytes, { ...meta, otaTarget: '80:81:bf' }), failure);
  await assert.rejects(verifyRsnodeBundle(bytes, { ...meta, sequence: meta.sequence + 1 }), failure);
  await assert.rejects(verifyRsnodeBundle(bytes, undefined), failure);
  const edit = (offset, value) => {
    const copy = bytes.slice();
    copy[offset] = value;
    return verifyRsnodeBundle(copy, { ...meta, sha256: sha(copy) });
  };
  await assert.rejects(edit(0, 0x51), failure);
  await assert.rejects(edit(4, 2), failure);
  await assert.rejects(edit(15, 1), failure);
  await assert.rejects(edit(200, bytes[200] ^ 1), failure);
  assert.throws(() => parseRsnodeBundle(new Uint8Array(128)), /not an rsNode update package/);
});

// A node that answers STATUS, DETECT and the update commands as firmware/common/src/usb_board.rs does.
// Hooks bend one answer each; FINISH restarts it, quiet for restartMs, into a trial, then confirms or rolls back.
function updateNode({ before = {}, begin = 0, onChunk = () => {}, finish = 0, rollback = false, restartMs = 300, trialPolls = 1 } = {}) {
  let controller, received = 0, total = 0, session = false, quietUntil = 0, trialLeft = trialPolls, current = { ...before };
  const node = { frames: [], chunks: 0, aborted: false };
  const reply = (command, payload) => controller.enqueue(Uint8Array.from([0xc0,
    ...[command, ...payload].flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]), 0xc0]));
  const answer = (sub, result, body = []) => reply(0x7a, [sub, result, ...body]);
  function decode(chunk) {
    const out = [];
    for (let i = 1; i < chunk.length - 1; i++) out.push(chunk[i] === 0xdb ? (chunk[++i] === 0xdc ? 0xc0 : 0xdb) : chunk[i]);
    return out;
  }
  function statusNow() {
    if (current.trial && --trialLeft < 0) {
      current = rollback ? { ...before } : { ...current, trial: false, sequence: BUNDLE.meta.sequence };
    }
    return statusBody(current);
  }
  node.port = {
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(chunk) {
      const [command, ...payload] = decode(chunk);
      node.frames.push([command, payload[0]]);
      if (Date.now() < quietUntil) return;
      if (command === 0x08) return reply(0x08, [0x46]);
      assert.equal(command, 0x7a, `unexpected command ${command}`);
      const [sub, ...body] = payload;
      if (sub === 0x01) return answer(0x01, 0, statusNow());
      if (sub === 0x10) {
        assert.equal(body.length, 128);
        if (begin) return answer(0x10, begin);
        session = true; received = 0; total = u32(body, 12);
        return answer(0x10, 0, [...be32(0), 0x01, 0xe0]);
      }
      if (sub === 0x11) {
        node.chunks++;
        const offset = u32(body), data = body.slice(4);
        assert.ok(session && data.length >= 1 && data.length <= 480);
        const hook = onChunk({ offset, length: data.length, received, count: node.chunks });
        if (hook === 'drop') return;
        if (hook && hook.result !== undefined) return answer(0x11, hook.result);
        if (hook && hook.rewind) received -= hook.rewind;
        if (offset + data.length <= received) return answer(0x11, 0, be32(received));
        if (offset !== received) return answer(0x11, 11, be32(received));
        received += data.length;
        return answer(0x11, 0, be32(received));
      }
      if (sub === 0x12) {
        if (finish) return answer(0x12, finish);
        assert.equal(received, total);
        answer(0x12, 0);
        quietUntil = Date.now() + restartMs;
        current = { ...before, release: BUNDLE.meta.version, trial: true };
        return;
      }
      if (sub === 0x13) { node.aborted = true; session = false; return answer(0x13, 0); }
    } }),
    async close() {}
  };
  return node;
}

async function run(node, bundle = BUNDLE) {
  const session = createRnodeSession(node.port);
  const progress = [];
  try {
    return { result: await streamRsnodeUpdate(session, bundle.bytes, event => progress.push(event), bundle.meta), progress };
  } finally {
    await closeRnodeSession(session);
  }
}

// The node's restart and timeouts take seconds of real time; these run side by side.
describe('the USB update', { concurrency: true }, () => {
  test('an update streams every byte in order, follows the restart and reports the confirmed release', async () => {
    const offsets = [];
    const node = updateNode({ onChunk: ({ offset }) => { offsets.push(offset); } });
    const { result, progress } = await run(node);
    assert.deepEqual(result, { kind: 'updated', release: BUNDLE.meta.version,
      message: 'Updated to 1.0.0-beta.20261102.1. Identity, managers and settings kept.' });
    assert.deepEqual(offsets, [0, 480, 960, 1440, 1920]);
    assert.deepEqual(progress.filter(event => event.stage === 'writing').map(event => event.sent), [0, 480, 960, 1440, 1920, 2000]);
    assert.ok(progress.some(event => event.stage === 'restarting'));
    assert.ok(progress.some(event => event.stage === 'trial'));
    assert.equal(node.aborted, false);
  });

  test('a Gap resumes from the offset the node names, and a lost answer is retried once', async () => {
    const offsets = [];
    const node = updateNode({ onChunk: ({ offset, count }) => {
      offsets.push(offset);
      if (count === 3) return { rewind: 480 };
      if (count === 5) return 'drop';
    } });
    const { result } = await run(node);
    assert.equal(result.kind, 'updated');
    // Third chunk (960) meets a node at 480: Gap, resend 480, then 960; the dropped chunk goes again.
    assert.deepEqual(offsets, [0, 480, 960, 480, 960, 960, 1440, 1920]);
  });

  test('a rollback after the trial says which release the node went back to', async () => {
    const { result } = await run(updateNode({ rollback: true, trialPolls: 2 }));
    assert.deepEqual(result, { kind: 'rolled-back', release: '1.0.0-beta.20261030.2',
      message: 'The update did not start correctly; the node went back to 1.0.0-beta.20261030.2.' });
  });

  test('refusals at BEGIN, during the transfer and at FINISH name their cause', async () => {
    const begins = {
      9: /Another app is using the node over Bluetooth or Wi-Fi/, 8: /rejected the update\. Check the package signature, board and sequence/,
      10: /finishing its last update/, 5: /taking another update/, 2: /did not accept the update request/
    };
    for (const [code, message] of Object.entries(begins)) {
      const node = updateNode({ begin: Number(code) });
      await assert.rejects(run(node), error => message.test(error.message) && error.result === Number(code));
      assert.equal(node.chunks, 0);
    }
    const storage = updateNode({ onChunk: ({ count }) => count === 2 ? { result: 7 } : undefined });
    await assert.rejects(run(storage), /could not write the update to its flash.*\(at byte 480\)/);
    assert.equal(storage.aborted, true);
    await assert.rejects(run(updateNode({ finish: 8 })), /rejected the update.*\(finishing\)/);
  });

  test('a node that is not ready to update is never sent a manifest', async () => {
    for (const before of [{ trial: true }, { sequence: BUNDLE.meta.sequence }, { board: 0xc0 }]) {
      const node = updateNode({ before });
      await assert.rejects(run(node), error => !!error.choice);
      assert.equal(node.frames.some(([command, sub]) => command === 0x7a && sub === 0x10), false);
    }
  });

  test('a chunk unanswered twice aborts the transfer', { timeout: 20000 }, async () => {
    const node = updateNode({ onChunk: ({ offset }) => offset === 480 ? 'drop' : undefined });
    await assert.rejects(run(node), /stopped answering at byte 480/);
    assert.equal(node.aborted, true);
  });
});

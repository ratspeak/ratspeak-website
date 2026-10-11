import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { handheldImages } from '../assets/js/handheld-images.js';
import { HANDHELD_RELEASE_TAG } from '../assets/js/handheld-release.js';
import { bootSlot, HandheldMismatch, inspectHandheld, handheldUpdatePlan, handheldConfirmation } from '../assets/js/handheld-update.js';

globalThis.crypto ||= webcrypto;
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const bytes = (length, value) => new Uint8Array(length).fill(value);
const clone = value => structuredClone(value);

function ota(sequence = 1) {
  const result = bytes(0x2000, 255), view = new DataView(result.buffer);
  view.setUint32(0, sequence, true);
  // Values independently produced by Python zlib.crc32(seq_le, 0xffffffff).
  view.setUint32(28, [0, 0x4743989a, 0x55f63774, 0xed4a5011][sequence], true);
  return result;
}

function fixture(layoutId = 'tdeck/full') {
  const layout = clone(handheldImages.layouts[layoutId]);
  const capacity = layout.board === 'cardputer' ? 8 * 1024 * 1024 : 16 * 1024 * 1024;
  const memory = bytes(capacity, 0xa5);
  memory.set(bytes(0x8000, 0x42));
  const table = bytes(0xc00, 0x37);
  memory.set(table, 0x8000);
  memory.set(ota(), 0xe000);
  layout.tableSha256 = hash(table); layout.bootMd5 = hash(memory.subarray(0, 0x8000), 'md5');
  const index = { version: '2.3.0', layouts: { [layoutId]: layout }, components: {}, packages: {} };
  const target = bytes(Math.max(...layout.slots.map(slot => slot.offset + 4096)), 255);
  const parts = [], images = [];
  const record = (app, role, version) => {
    const component = hash(app.subarray(0, 288));
    index.components[component] = { board: layout.board, role, version, size: app.length, md5: hash(app, 'md5'), sha256: hash(app) };
    return component;
  };
  for (const [i, slot] of layout.slots.entries()) {
    memory.fill(255, slot.offset, slot.offset + slot.capacity);
    if (layout.package !== 'full' && i > 0) continue;
    const app = bytes(512, 11 + i); memory.set(app, slot.offset);
    record(app, slot.role, '2.2.4'); images.push(app);
    const next = bytes(512, 21 + i); target.set(next, slot.offset);
    parts.push({ offset: slot.offset, component: record(next, slot.role, '2.3.0') });
  }
  index.packages[hash(target)] = { layout: layoutId, parts };
  const calls = [];
  const digests = [];
  const loader = {
    getFlashSize: async () => capacity / 1024,
    readFlash: async (address, size) => {
      calls.push([address, size]);
      const result = memory.slice(address, address + size);
      digests.push(new Uint8Array(createHash('md5').update(result).digest()));
      return result;
    },
    transport: {
      async *read() { assert.equal(digests.length, 1); yield digests.shift(); },
      async disconnect() {}
    },
    flashMd5sum: async (address, size) => hash(memory.subarray(address, address + size), 'md5')
  };
  const prepared = { board: layout.board, package: layout.package, version: index.version, bytes: target };
  return { memory, index, layout, images, loader, prepared, calls };
}

for (const name of Object.keys(handheldImages.layouts)) test(`${name}: update touches only application sectors`, async () => {
  const f = fixture(name), before = f.memory.slice();
  const installed = await inspectHandheld(f.loader, f.layout.board, f.index);
  assert.equal(installed.status, 'recognized'); assert.equal(installed.version, '2.2.4');
  const plan = await handheldUpdatePlan(f.prepared, installed, f.index);
  assert.equal(plan.installMode, 'update'); assert.equal(plan.upToDate, false);
  const allowed = new Set();
  for (const part of plan.parts) {
    assert.notEqual(part.address, 0);
    const end = part.address + Math.ceil(part.bytes.length / 4096) * 4096;
    f.memory.fill(255, part.address, end); f.memory.set(part.bytes, part.address);
    for (let offset = part.address; offset < end; offset += 4096) allowed.add(offset);
  }
  for (let offset = 0; offset < f.memory.length; offset += 4096) {
    if (!allowed.has(offset)) assert.deepEqual(f.memory.subarray(offset, offset + 4096), before.subarray(offset, offset + 4096));
  }
  // Detection reads metadata/application descriptors, never identity/messages.
  assert.ok(f.calls.every(([address]) => address === 0x8000 || address === 0xe000 || f.layout.slots.some(slot => slot.offset === address)));
  const updated = await inspectHandheld(f.loader, f.layout.board, f.index);
  assert.equal(updated.version, '2.3.0');
  assert.equal((await handheldUpdatePlan(f.prepared, updated, f.index)).upToDate, true);
});

test('both Standalone slots are updated with the selected boot slot last', async () => {
  const f = fixture('cardputer/standalone');
  f.memory.set(f.images[0], f.layout.slots[1].offset); f.memory.set(ota(2), 0xe000);
  const installed = await inspectHandheld(f.loader, f.layout.board, f.index);
  assert.equal(installed.active, 1);
  const plan = await handheldUpdatePlan(f.prepared, installed, f.index);
  assert.deepEqual(plan.parts.map(part => part.address), f.layout.slots.map(slot => slot.offset));
  f.memory.set(ota(), 0xe000);
  const firstActive = await inspectHandheld(f.loader, f.layout.board, f.index);
  assert.deepEqual((await handheldUpdatePlan(f.prepared, firstActive, f.index)).parts.map(part => part.address),
    f.layout.slots.map(slot => slot.offset).reverse());
});

test('boot selection rejects corrupt and unusable records', () => {
  assert.equal(bootSlot(ota(1), 3), 0); assert.equal(bootSlot(ota(2), 3), 1); assert.equal(bootSlot(ota(3), 3), 2);
  assert.equal(bootSlot(bytes(0x2000, 255), 3), 0);
  const corrupt = ota(); corrupt[28] ^= 1; assert.throws(() => bootSlot(corrupt, 3));
  for (const state of [3, 4]) {
    const bad = ota(); new DataView(bad.buffer).setUint32(24, state, true);
    assert.throws(() => bootSlot(bad, 3));
  }
  const redundant = ota(1); redundant.set(ota(3).subarray(0, 32), 0x1000);
  assert.equal(bootSlot(redundant, 3), 2);
});

for (const kind of ['layout', 'bootloader', 'application', 'descriptor', 'empty-active-slot', 'boot-selection']) {
  test(`${kind} mismatch cannot authorize a preserving update`, async () => {
    const f = fixture();
    if (kind === 'layout') f.memory[0x8000] ^= 1;
    if (kind === 'bootloader') f.memory[0] ^= 1;
    if (kind === 'application') f.memory[f.layout.slots[0].offset + 300] ^= 1;
    if (kind === 'descriptor') f.memory[f.layout.slots[0].offset] ^= 1;
    if (kind === 'empty-active-slot') f.memory.fill(255, f.layout.slots[0].offset, f.layout.slots[0].offset + 288);
    if (kind === 'boot-selection') f.memory[0xe000 + 28] ^= 1;
    const installed = await inspectHandheld(f.loader, f.layout.board, f.index);
    assert.equal(installed.status, 'unknown');
    assert.equal((await handheldUpdatePlan(f.prepared, installed, f.index)).installMode, undefined);
  });
}

test('wrong hardware is blocked even for a fresh install', async () => {
  const f = fixture();
  f.loader.getFlashSize = async () => 8192;
  await assert.rejects(inspectHandheld(f.loader, 'tdeck', f.index), HandheldMismatch);
  f.loader.getFlashSize = async () => 16384;
  for (const image of Object.values(f.index.components)) image.board = 'tpager';
  await assert.rejects(inspectHandheld(f.loader, 'tdeck', f.index), HandheldMismatch);
});

test('read failures offer erase consent with a required reconnect', async () => {
  const f = fixture(); f.loader.readFlash = async () => { throw new Error('timeout'); };
  const installed = await inspectHandheld(f.loader, 'tdeck', f.index);
  assert.equal(installed.status, 'unknown'); assert.equal(installed.reconnect, true);
  const plan = await handheldUpdatePlan(f.prepared, installed, f.index);
  const dialog = handheldConfirmation(plan);
  assert.equal(dialog.action, 'Erase and install'); assert.match(dialog.intro, /could not be read/);
  assert.match(dialog.detail, /All data.*will be lost/);
});

test('unknown target, package switches and changed boot layouts cannot become updates', async () => {
  const f = fixture(); const installed = await inspectHandheld(f.loader, 'tdeck', f.index);
  for (const change of [{ package: 'standalone' }, { version: '2.4.0' }, { bytes: bytes(100, 0) }]) {
    assert.equal((await handheldUpdatePlan({ ...f.prepared, ...change }, installed, f.index)).installMode, undefined);
  }
  installed.layout = { ...installed.layout, bootMd5: 'changed' };
  assert.equal((await handheldUpdatePlan(f.prepared, installed, f.index)).installMode, undefined);
});

test('sector rounding and downloaded component digests are checked before writes', async () => {
  const f = fixture(); const installed = await inspectHandheld(f.loader, 'tdeck', f.index);
  installed.slots[0].capacity = 513;
  await assert.rejects(handheldUpdatePlan(f.prepared, installed, f.index), /Unsafe/);
  installed.slots[0].capacity = f.layout.slots[0].capacity;
  const target = Object.values(f.index.packages)[0]; f.index.components[target.parts[0].component].sha256 = 'invalid';
  await assert.rejects(handheldUpdatePlan(f.prepared, installed, f.index), /verification/);
});

test('reviewed image index stays aligned with the download pin and covers all supported packages', () => {
  assert.equal(`v${handheldImages.version}`, HANDHELD_RELEASE_TAG);
  assert.equal(Object.keys(handheldImages.layouts).length, 10);
  assert.equal(Object.keys(handheldImages.packages).length, 10);
  assert.deepEqual([...new Set(Object.values(handheldImages.components).map(image => image.version))].sort(),
    ['2.2.0', '2.2.1', '2.2.2', '2.2.3', '2.2.4', '2.3.0']);
  for (const target of Object.values(handheldImages.packages)) {
    const layout = handheldImages.layouts[target.layout];
    assert.ok(layout);
    for (const part of target.parts) {
      const image = handheldImages.components[part.component];
      assert.equal(image.version, handheldImages.version); assert.equal(image.board, layout.board);
      const slot = layout.slots.find(slot => slot.offset === part.offset);
      assert.equal(slot.role, image.role); assert.ok(Math.ceil(image.size / 4096) * 4096 <= slot.capacity);
    }
  }
});

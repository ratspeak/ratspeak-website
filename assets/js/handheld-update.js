import { handheldImages } from './handheld-images.js';
import { sha256Hex } from './handheld-release.js';

const UNKNOWN = 'The installed firmware could not be identified.';
const u32 = (bytes, offset) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
const erased = bytes => bytes.every(value => value === 255);

export class HandheldMismatch extends Error {}

// IDF 4.4 OTA selection: CRC32-LE seeded with UINT32_MAX, highest valid sequence.
export function bootSlot(ota, count) {
  if (ota.length !== 0x2000) throw new Error('Incomplete boot metadata');
  const sequences = [0, 0x1000].flatMap(offset => {
    const sequence = u32(ota, offset), state = u32(ota, offset + 24);
    let crc = 0;
    for (const byte of ota.subarray(offset, offset + 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return sequence > 0 && sequence !== 0xffffffff && ![3, 4].includes(state) &&
      (~crc >>> 0) === u32(ota, offset + 28) ? [sequence] : [];
  });
  if (sequences.length) return (Math.max(...sequences) - 1) % count;
  if (erased(ota)) return 0;
  throw new Error('Boot selection could not be verified');
}

async function read(loader, address, size) {
  const bytes = await loader.readFlash(address, size);
  // readFlash in esptool-js 0.5.7 leaves the stub's final digest on the wire.
  await loader.flushInput();
  if (!(bytes instanceof Uint8Array) || bytes.length !== size) throw new Error('Incomplete device read');
  return bytes;
}

export async function inspectHandheld(loader, board, index = handheldImages) {
  const capacity = board === 'cardputer' ? 8192 : 16384;
  if (await loader.getFlashSize() !== capacity) {
    throw new HandheldMismatch('Flash capacity does not match the selected handheld. Check your device selection.');
  }
  try {
    const table = await read(loader, 0x8000, 0xc00);
    const hash = await sha256Hex(table);
    const layout = Object.values(index.layouts).find(item => item.board === board && item.tableSha256 === hash);
    if (!layout) return { status: 'unknown', reason: 'The installed firmware or storage layout could not be identified.' };
    if (await loader.flashMd5sum(0, 0x8000) !== layout.bootMd5) {
      return { status: 'unknown', reason: 'The installed bootloader is not supported for updates.' };
    }
    const slots = [];
    for (const slot of layout.slots) {
      const probe = await read(loader, slot.offset, 288);
      if (erased(probe)) { slots.push({ ...slot, image: null }); continue; }
      const image = index.components[await sha256Hex(probe)];
      if (!image || image.size > slot.capacity || await loader.flashMd5sum(slot.offset, image.size) !== image.md5) {
        return { status: 'unknown', reason: UNKNOWN };
      }
      if (image.board !== board) throw new HandheldMismatch('Installed firmware belongs to a different handheld. Check your device selection.');
      if (image.role !== slot.role) return { status: 'unknown', reason: UNKNOWN };
      slots.push({ ...slot, image });
    }
    const active = bootSlot(await read(loader, 0xe000, 0x2000), slots.length);
    if (!slots[active].image || (layout.package === 'full' && slots.some(slot => !slot.image))) {
      return { status: 'unknown', reason: 'The installed firmware is incomplete.' };
    }
    const version = (slots.find(slot => slot.role === 'standalone' && slot.image) || slots[active]).image.version;
    return { status: 'recognized', board, package: layout.package, layout, slots, active, version };
  } catch (error) {
    if (error instanceof HandheldMismatch) throw error;
    return { status: 'unknown', reason: 'The installed firmware could not be read.', reconnect: true };
  }
}

export async function handheldUpdatePlan(prepared, installed, index = handheldImages) {
  if (installed.status !== 'recognized') return { reason: installed.reason };
  if (installed.package !== prepared.package) return { reason: 'Changing the firmware package requires a fresh installation.' };
  const target = index.packages[await sha256Hex(prepared.bytes)];
  if (!target || target.layout !== `${prepared.board}/${prepared.package}` || prepared.version !== index.version) {
    return { reason: 'This firmware package has not been verified for preserving updates.' };
  }
  const layout = index.layouts[target.layout];
  if (layout.tableSha256 !== installed.layout.tableSha256 || layout.bootMd5 !== installed.layout.bootMd5) {
    return { reason: 'This update requires a different storage layout or bootloader.' };
  }
  const parts = [];
  // Keep OTA metadata untouched. Update every occupied slot, active slot last.
  const order = installed.slots.map((slot, i) => ({ ...slot, active: i === installed.active }))
    .filter(slot => slot.image).sort((a, b) => Number(a.active) - Number(b.active));
  for (const slot of order) {
    const source = target.parts.find(part => index.components[part.component].role === slot.role);
    const image = source && index.components[source.component];
    if (!image || image.board !== prepared.board || slot.offset % 4096 ||
        Math.ceil(image.size / 4096) * 4096 > slot.capacity) throw new Error('Unsafe application update range');
    const bytes = prepared.bytes.slice(source.offset, source.offset + image.size);
    if (bytes.length !== image.size || await sha256Hex(bytes) !== image.sha256) throw new Error('Application update failed verification');
    parts.push({ address: slot.offset, bytes, md5: image.md5, unchanged: image.md5 === slot.image.md5 });
  }
  if (!parts.length) throw new Error('No applications to update');
  return { installMode: 'update', parts, upToDate: parts.every(part => part.unchanged) };
}

export function handheldConfirmation(plan, erase = false) {
  return {
    title: 'Erase and install',
    intro: erase ? 'You chose a fresh installation.' : plan.reason || UNKNOWN,
    detail: 'All data in internal storage will be lost, including your identity, settings and messages.',
    action: 'Erase and install'
  };
}

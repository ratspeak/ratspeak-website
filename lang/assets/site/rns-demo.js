// Reticulum identity + LXMF opportunistic packet, built with WebCrypto.
// Layouts follow RNS 1.5.5 / LXMF 1.2.0: identity hash, lxmf.delivery address,
// ECIES token (X25519 → HKDF-SHA256 → AES-256-CBC + HMAC-SHA256), Ed25519 signature.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
export const MTU = 500;
export const MAX_CONTENT = 287;
const HEADER = 19;

const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
const sha256 = async data => new Uint8Array(await subtle.digest('SHA-256', data));
const truncated = async data => (await sha256(data)).slice(0, 16);
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

export async function supported() {
  try {
    await subtle.generateKey({name: 'X25519'}, false, ['deriveBits']);
    await subtle.generateKey({name: 'Ed25519'}, false, ['sign']);
    return true;
  } catch { return false; }
}

export async function createIdentity() {
  const x = await subtle.generateKey({name: 'X25519'}, true, ['deriveBits']);
  const ed = await subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
  const xPub = new Uint8Array(await subtle.exportKey('raw', x.publicKey));
  const edPub = new Uint8Array(await subtle.exportKey('raw', ed.publicKey));
  const hash = await truncated(cat(xPub, edPub));
  const nameHash = (await sha256(enc.encode('lxmf.delivery'))).slice(0, 10);
  const address = await truncated(cat(nameHash, hash));
  return {x, ed, xPub, edPub, hash, address};
}

async function tokenKeys(shared, salt) {
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const okm = new Uint8Array(await subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array()}, ikm, 512));
  return {
    mac: await subtle.importKey('raw', okm.slice(0, 32), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']),
    aes: await subtle.importKey('raw', okm.slice(32), 'AES-CBC', false, ['encrypt', 'decrypt']),
  };
}

async function encryptFor(identity, plaintext) {
  const eph = await subtle.generateKey({name: 'X25519'}, true, ['deriveBits']);
  const ephPub = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
  const target = await subtle.importKey('raw', identity.xPub, {name: 'X25519'}, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({name: 'X25519', public: target}, eph.privateKey, 256));
  const keys = await tokenKeys(shared, identity.hash);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = new Uint8Array(await subtle.encrypt({name: 'AES-CBC', iv}, keys.aes, plaintext));
  const mac = new Uint8Array(await subtle.sign('HMAC', keys.mac, cat(iv, ct)));
  return cat(ephPub, iv, ct, mac);
}

export async function decryptWith(identity, token) {
  const peer = await subtle.importKey('raw', token.slice(0, 32), {name: 'X25519'}, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({name: 'X25519', public: peer}, identity.x.privateKey, 256));
  const keys = await tokenKeys(shared, identity.hash);
  const signed = token.slice(32, -32);
  if (!await subtle.verify('HMAC', keys.mac, token.slice(-32), signed)) return null;
  return new Uint8Array(await subtle.decrypt({name: 'AES-CBC', iv: signed.slice(0, 16)}, keys.aes, signed.slice(16)));
}

// msgpack [timestamp, title, content, fields] exactly as Python msgpack.packb emits it
function bin(bytes) {
  const head = bytes.length < 256 ? [0xc4, bytes.length] : [0xc5, bytes.length >> 8, bytes.length & 255];
  return cat(Uint8Array.from(head), bytes);
}
function packPayload(timestamp, content) {
  const ts = new Uint8Array(9);
  ts[0] = 0xcb;
  new DataView(ts.buffer).setFloat64(1, timestamp);
  return cat(Uint8Array.of(0x94), ts, bin(new Uint8Array()), bin(content), Uint8Array.of(0x80));
}
function readBin(buf, i) {
  if (buf[i] === 0xc4) return [buf.slice(i + 2, i + 2 + buf[i + 1]), i + 2 + buf[i + 1]];
  const n = (buf[i + 1] << 8) | buf[i + 2];
  return [buf.slice(i + 3, i + 3 + n), i + 3 + n];
}

export const contentSize = text => packPayload(0, enc.encode(text)).length - 16;

export async function sealMessage(from, to, text) {
  const payload = packPayload(Date.now() / 1000, enc.encode(text));
  const hashed = cat(to.address, from.address, payload);
  const id = await sha256(hashed);
  const signature = new Uint8Array(await subtle.sign('Ed25519', from.ed.privateKey, cat(hashed, id)));
  const token = await encryptFor(to, cat(from.address, signature, payload));
  // HEADER_1 flags, hops, destination hash, context NONE
  return cat(Uint8Array.of(0x00, 0x00), to.address, Uint8Array.of(0x00), token);
}

export async function openMessage(to, from, packet) {
  const plain = await decryptWith(to, packet.slice(HEADER));
  if (!plain) return null;
  const source = plain.slice(0, 16), signature = plain.slice(16, 80), payload = plain.slice(80);
  const hashed = cat(packet.slice(2, 18), source, payload);
  const signedOk = hex(source) === hex(from.address) &&
    await subtle.verify('Ed25519', from.ed.publicKey, signature, cat(hashed, await sha256(hashed)));
  const [, afterTitle] = readBin(payload, 10);
  const [content] = readBin(payload, afterTitle);
  return {text: new TextDecoder().decode(content), signedOk};
}

// Byte ranges for labelling the packet: header+destination, ephemeral key, ciphertext, HMAC
export const segments = packet => [
  ['address', 0, HEADER],
  ['key', HEADER, HEADER + 32],
  ['cipher', HEADER + 32, packet.length - 32],
  ['mac', packet.length - 32, packet.length],
];

// HEADER_1 carries the destination in the clear; everything else is inside the token
export const destination = packet => packet.slice(2, HEADER - 1);

export function includesBytes(haystack, needle) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

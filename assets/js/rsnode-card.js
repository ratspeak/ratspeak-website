// Ratspeak contact cards, as rsNode's messaging-management interfaces §2 define them. RSCP1 is
// Ratspeak's contact_card.rs card; RSCP2 adds a kind and capabilities. Both carry the 64-byte
// Reticulum public key, and both hashes are checked against it as rns-identity derives them.
const NAME_BYTES = 40;
const KEY_BYTES = 64;
const KINDS = ['person', 'device'];
/** The capabilities the web flasher gives an rsNode's card. */
export const DEVICE_CAPS = Object.freeze(['rsnode', 'rsnode.update']);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = text => Uint8Array.from(text.match(/../g), pair => parseInt(pair, 16));

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** rns-identity's identity hash: SHA-256 of the public key, truncated to 16 bytes. */
export async function identityHash(publicKey) {
  return (await sha256(Uint8Array.from(publicKey))).slice(0, 16);
}

/** rns-identity's Destination::hash_from_name_and_identity, e.g. for "lxmf.delivery". */
export async function destinationHash(name, identity) {
  const nameHash = (await sha256(encoder.encode(name))).slice(0, 10);
  return (await sha256(Uint8Array.from([...nameHash, ...identity]))).slice(0, 16);
}

export function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Unpadded and canonical, as Ratspeak's URL_SAFE_NO_PAD decoder accepts it.
function fromBase64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return base64url(bytes) === text ? bytes : null;
}

/** contact_card.rs trim_utf8_bytes: trimmed, then cut to whole characters within 40 bytes. */
export function cardName(name) {
  const trimmed = String(name).trim();
  let out = '';
  for (const character of trimmed) {
    if (encoder.encode(out + character).length > NAME_BYTES) break;
    out += character;
  }
  return out.trim();
}

function hash16(text, what) {
  if (!/^[0-9a-fA-F]{32}$/.test(text)) throw new Error(`The card's ${what} is not 32 hexadecimal characters.`);
  return text.toLowerCase();
}

/**
 * An RSCP1 or RSCP2 card as { version, kind, rawKind, name, lxmf, identity, publicKey, caps }.
 * An RSCP1 card is a person; an unknown RSCP2 kind reads as a person and keeps its raw value.
 */
export async function parseContactCard(text) {
  const trimmed = String(text).trim();
  const version = trimmed.startsWith('RSCP2:') ? 2 : trimmed.startsWith('RSCP1:') ? 1 : 0;
  if (!version) throw new Error('This is not a Ratspeak contact card.');
  const parts = trimmed.slice(6).split(':');
  if (parts.length !== (version === 2 ? 6 : 4)) throw new Error('This contact card is incomplete.');
  const rawKind = version === 2 ? parts.shift() : 'person';
  const [nameText, lxmfText, identityText, keyText] = parts;
  const nameBytes = fromBase64url(nameText);
  let name;
  try { name = nameBytes && decoder.decode(nameBytes); } catch { name = null; }
  if (typeof name !== 'string') throw new Error('The card\'s name is not readable.');
  const lxmf = hash16(lxmfText, 'address');
  const identity = hash16(identityText, 'identity hash');
  const publicKey = fromBase64url(keyText);
  if (!publicKey || publicKey.length !== KEY_BYTES) throw new Error('The card\'s public key is not 64 bytes.');
  if (hex(await identityHash(publicKey)) !== identity) throw new Error('The card\'s identity hash does not match its public key.');
  if (hex(await destinationHash('lxmf.delivery', fromHex(identity))) !== lxmf) {
    throw new Error('The card\'s address does not match its public key.');
  }
  return { version, kind: KINDS.includes(rawKind) ? rawKind : 'person', rawKind, name, lxmf, identity, publicKey,
    caps: version === 2 ? parts[4].split(',').filter(Boolean) : [] };
}

/** An RSCP2 card; lxmf and identity are hex, publicKey 64 bytes. */
export function buildContactCard({ kind = 'person', name = '', lxmf, identity, publicKey, caps = [] }) {
  return ['RSCP2', kind, base64url(encoder.encode(cardName(name))), lxmf.toLowerCase(), identity.toLowerCase(),
    base64url(publicKey), caps.join(',')].join(':');
}

/** The node's own card, from its IDENTITY reply. */
export function nodeContactCard(identity) {
  return buildContactCard({ kind: 'device', name: identity.name, lxmf: identity.lxmf, identity: identity.identity,
    publicKey: identity.publicKey, caps: DEVICE_CAPS });
}

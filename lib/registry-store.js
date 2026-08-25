// Shared storage layer for the holder registry (api/identity.js and
// api/perks.js). Two load-bearing properties:
//   1. Sealed at rest: records are AES-256-GCM ciphertext keyed by
//      HKDF(IDENTITY_CODE_SECRET); a leaked blob URL yields ciphertext only.
//   2. Append-only for anything that transitions state: Blob overwrites are
//      not read-your-write, so writes create a NEW immutable version file
//      under the record's prefix and reads take the newest.

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
export const ROOT = 'holder-registry';

// ------------------------------------------------------------- paths --------
export function registrationPath(wallet) {
  return `${ROOT}/registrations/${String(wallet).toLowerCase()}.json`;
}

export function badgePath(wallet) {
  return `${ROOT}/badges/${String(wallet).toLowerCase()}.json`;
}

export function badgePrefix(wallet) {
  return `${ROOT}/badges/${String(wallet).toLowerCase()}/`;
}

export const readBadge = (t, s, wallet) => readVersioned(t, s, badgePrefix(wallet), badgePath(wallet));
export const writeBadge = (t, s, wallet, value) => writeVersioned(t, s, badgePrefix(wallet), value);

// -------------------------------------------------------- sealed store ------
let storeKeyPromise = null;
function storeKey(secret) {
  if (!storeKeyPromise) {
    storeKeyPromise = (async () => {
      const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: new TextEncoder().encode('holder-registry-store-v1') },
        raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    })();
  }
  return storeKeyPromise;
}

function b64(bytes) {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out);
}

function ub64(text) {
  return Uint8Array.from(atob(String(text || '')), ch => ch.charCodeAt(0));
}

export async function putSealed(blobToken, secret, pathname, value) {
  const key = await storeKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  await putJson(blobToken, pathname, { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ciphertext)) });
}

export async function readSealed(blobToken, secret, pathname) {
  return openSealedValue(secret, await readBlobJson(blobToken, pathname));
}

export async function openSealedValue(secret, wrapped) {
  if (!wrapped) return null;
  if (!wrapped.ct) return wrapped; // pre-encryption record
  try {
    const key = await storeKey(secret);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(wrapped.iv) }, key, ub64(wrapped.ct));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

// ------------------------------------------------------- blob transport -----
async function putJson(blobToken, pathname, value) {
  const resp = await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION,
      'x-vercel-blob-access': 'public',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1'
    },
    body: JSON.stringify(value)
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('Registry Blob PUT failed', resp.status, detail.slice(0, 500));
    throw new Error('Registry storage write failed');
  }
}

async function readBlobJson(blobToken, pathname) {
  const blob = (await listBlobs(blobToken, pathname, 10)).find(item => item.pathname === pathname);
  if (!blob) return null;
  return fetchJson(blob.url);
}

export async function fetchJson(url) {
  // Unique query bypasses the Blob CDN cache: overwritten records must read
  // back fresh (a stale read must never contradict an action just taken).
  const fresh = `${url}${url.includes('?') ? '&' : '?'}nocache=${crypto.randomUUID()}`;
  const resp = await fetch(fresh, { cache: 'no-store' });
  if (!resp.ok) return null;
  return resp.json().catch(() => null);
}

export async function listBlobs(blobToken, prefix, limit = 1000) {
  const blobs = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ prefix, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const resp = await fetch(`${BLOB_API}?${params.toString()}`, {
      headers: {
        authorization: `Bearer ${blobToken}`,
        'x-api-version': API_VERSION
      }
    });
    if (!resp.ok) throw new Error(`Blob list failed: ${resp.status}`);
    const listing = await resp.json();
    blobs.push(...(listing.blobs || []));
    cursor = listing.cursor || listing.nextCursor || '';
  } while (cursor);
  return blobs;
}

async function deleteBlobs(blobToken, urls) {
  await fetch(`${BLOB_API}/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ urls })
  });
}

// ---------------------------------------------------- versioned records -----
function versionKey() {
  return `${String(Date.now()).padStart(14, '0')}-${randomHex(4)}`;
}

function sortedVersions(blobs, prefix) {
  return blobs.filter(b => b.pathname.startsWith(prefix)).sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
}

export async function readVersioned(blobToken, secret, prefix, legacyPath) {
  const versions = sortedVersions(await listBlobs(blobToken, prefix, 1000), prefix);
  const newest = versions[versions.length - 1];
  if (newest) return openSealedValue(secret, await fetchJson(newest.url));
  return legacyPath ? readSealed(blobToken, secret, legacyPath) : null;
}

export async function writeVersioned(blobToken, secret, prefix, value) {
  await putSealed(blobToken, secret, `${prefix}${versionKey()}.json`, value);
  try {
    const versions = sortedVersions(await listBlobs(blobToken, prefix, 1000), prefix);
    const stale = versions.slice(0, -8);
    if (stale.length) await deleteBlobs(blobToken, stale.map(b => b.url));
  } catch (e) {}
}

// ------------------------------------------------------------- misc ---------
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

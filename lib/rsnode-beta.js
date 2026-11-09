// Private beta assets must never pass through the public firmware endpoint.
// All configuration belongs in server-side Vercel environment variables.
export const TERMS_VERSION = '2026-09-28';
export const SESSION_SECONDS = 8 * 60 * 60;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const COOKIE_NAME = '__Host-rsnode_beta';

const MAX_BODY_BYTES = 4096;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
// The board byte of each image's signed update target (rsNode's OTA board ids).
const OTA_BOARDS = { 'heltec-v3': '3a', 'heltec-v4': '3f', 'heltec-v4-r8': 'bf', 'heltec-v4-r8-tft': 'c0' };
// The same labels as assets/js/rsnode-beta.js and rsNode's package-web-flasher.py.
const ESP = { installMode: 'factory', chipFamily: 'ESP32-S3', platform: 'esp32', flashStrategy: 'esp32-esptool' };
const UF2 = { installMode: 'uf2', chipFamily: 'nRF52840', platform: 'nrf52', flashStrategy: 'uf2-drive' };
const BOARD_DEFINITIONS = {
  'heltec-v3': { label: 'Heltec V3', flashSize: '8MB', ...ESP },
  'heltec-v4': { label: 'Heltec V4 · R2', flashSize: '16MB', ...ESP },
  'heltec-v4-r8': { label: 'Heltec V4 · R8', flashSize: '16MB', ...ESP },
  'heltec-v4-r8-tft': { label: 'Heltec V4 · R8 TFT', flashSize: '16MB', ...ESP },
  'heltec-t114': { label: 'Heltec T114', ...UF2 }
};
const CONFIRMATIONS = ['france', 'sanctions', 'export', 'privateBeta'];
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Vary': 'Cookie, Origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
};

// Instance-local defense in depth. The production login endpoint also needs a
// Vercel WAF rate-limit rule: serverless instances do not share this map.
const loginAttempts = new Map();
function checkLoginRate(req, now) {
  const key = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown')
    .split(',')[0].trim().slice(0, 96);
  let entry = loginAttempts.get(key);
  if (!entry || entry.until <= now) entry = { count: 0, until: now + 15 * 60_000 };
  entry.count += 1;
  loginAttempts.delete(key);
  loginAttempts.set(key, entry);
  if (loginAttempts.size > 2048) loginAttempts.delete(loginAttempts.keys().next().value);
  return { allowed: entry.count <= 10, retryAfter: Math.max(1, Math.ceil((entry.until - now) / 1000)) };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}

function invitationPasswords(env) {
  if (env.RSNODE_BETA_PASSWORDS === undefined) {
    if (!boundedString(env.RSNODE_BETA_PASSWORD, 24, 256)) throw new Error('Password');
    return [env.RSNODE_BETA_PASSWORD];
  }
  const value = env.RSNODE_BETA_PASSWORDS;
  if (typeof value !== 'string' || value.length > 16_384) throw new Error('Passwords');
  const passwords = JSON.parse(value);
  if (!Array.isArray(passwords) || passwords.length < 1 || passwords.length > 5 ||
      !passwords.every(password => boundedString(password, 16, 256) && !/\p{Cc}/u.test(password)) ||
      new Set(passwords).size !== passwords.length) throw new Error('Passwords');
  return passwords.sort();
}

function loadConfig(env) {
  const passwords = invitationPasswords(env);
  const secret = env.RSNODE_BETA_SESSION_SECRET;
  const blobToken = env.RSNODE_BETA_BLOB_TOKEN;
  const blobStoreId = env.RSNODE_BETA_BLOB_STORE_ID;
  const useOidc = blobStoreId !== undefined;
  if (!boundedString(secret, 32, 512) || passwords.includes(secret) ||
      (useOidc ? typeof blobStoreId !== 'string' || !/^(?:store_)?[a-zA-Z0-9]{1,64}$/.test(blobStoreId)
        : !boundedString(blobToken, 16, 2048)) ||
      typeof env.RSNODE_BETA_CATALOG !== 'string' || env.RSNODE_BETA_CATALOG.length < 2 ||
      env.RSNODE_BETA_CATALOG.length > 16_384) throw new Error('Configuration');
  const blobHostname = useOidc
    ? `${blobStoreId.replace(/^store_/, '').toLowerCase()}.private.blob.vercel-storage.com`
    : null;
  const privateUrl = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) ||
        url.username || url.password || url.port || url.search || url.hash || url.pathname === '/') throw new Error('Private URL');
    if (blobHostname && url.hostname !== blobHostname) throw new Error('Private store');
    return url.href;
  };
  // A signed .rsota for Update, which keeps the node's settings; optional per board.
  const updateAsset = (update, id) => {
    if (!object(update) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}\.rsota$/.test(update.fileName || '') ||
        !Number.isSafeInteger(update.size) || update.size <= 128 || update.size > MAX_ASSET_BYTES ||
        !/^[a-f0-9]{64}$/.test(update.sha256 || '') ||
        !Number.isSafeInteger(update.sequence) || update.sequence < 1 || update.sequence > 0xffffffff ||
        !/^80:81:[a-f0-9]{2}$/.test(update.otaTarget || '') || update.otaTarget.slice(6) !== OTA_BOARDS[id] ||
        !/^[a-f0-9]{16}$/.test(update.releaseKeyId || '') || !boundedString(update.version, 1, 24) ||
        !/^[\x21-\x7e]+$/.test(update.version) || !boundedString(update.url, 1, 2048)) throw new Error('Update');
    return {
      url: privateUrl(update.url),
      public: { fileName: update.fileName, size: update.size, sha256: update.sha256, sequence: update.sequence,
        otaTarget: update.otaTarget, releaseKeyId: update.releaseKeyId, version: update.version }
    };
  };
  // The rsNode guide ships with the catalog; any signed-in tester may read it.
  const guideAsset = guide => {
    if (!object(guide) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}\.html$/.test(guide.fileName || '') ||
        !Number.isSafeInteger(guide.size) || guide.size <= 0 || guide.size > MAX_ASSET_BYTES ||
        !/^[a-f0-9]{64}$/.test(guide.sha256 || '') || !boundedString(guide.version, 1, 64) ||
        !boundedString(guide.url, 1, 2048)) throw new Error('Guide');
    return { url: privateUrl(guide.url),
      public: { fileName: guide.fileName, size: guide.size, sha256: guide.sha256, version: guide.version } };
  };
  const raw = JSON.parse(env.RSNODE_BETA_CATALOG);
  if (!object(raw) || !Array.isArray(raw.boards) || !raw.boards.length || raw.boards.length > Object.keys(BOARD_DEFINITIONS).length) throw new Error('Catalog');
  const ids = new Set();
  const boards = raw.boards.map(entry => {
    if (!object(entry) || !Object.hasOwn(BOARD_DEFINITIONS, entry.id) || ids.has(entry.id) ||
        !boundedString(entry.version, 1, 64) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}\.zip$/.test(entry.fileName || '') ||
        !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > MAX_ASSET_BYTES ||
        !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !boundedString(entry.url, 1, 2048) ||
        (entry.description !== undefined && !boundedString(entry.description, 0, 240))) throw new Error('Board');
    const url = privateUrl(entry.url);
    const definition = BOARD_DEFINITIONS[entry.id];
    // Only factory boards take signed updates; UF2 boards reinstall through their bootloader.
    if (entry.update !== undefined && !Object.hasOwn(OTA_BOARDS, entry.id)) throw new Error('Update');
    const update = entry.update === undefined ? null : updateAsset(entry.update, entry.id);
    if ((entry.flashSize !== undefined && entry.flashSize !== definition.flashSize) ||
        (entry.chipFamily !== undefined && entry.chipFamily !== definition.chipFamily) ||
        (entry.installMode !== undefined && entry.installMode !== definition.installMode) ||
        (entry.board !== undefined && entry.board !== entry.id)) throw new Error('Board metadata');
    ids.add(entry.id);
    return {
      url,
      update,
      public: {
        id: entry.id, board: entry.id, ...definition,
        ...(entry.description ? { description: entry.description } : {}),
        version: entry.version, fileName: entry.fileName, size: entry.size, sha256: entry.sha256,
        product: 'rsnode',
        ...(update ? { update: update.public } : {})
      }
    };
  });
  const guide = raw.guide === undefined ? null : guideAsset(raw.guide);
  return { passwords, secret, blobToken, useOidc, boards, guide };
}

async function hmacKey(cryptoApi, bytes) {
  return cryptoApi.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sessionKey(cryptoApi, cfg) {
  const master = await hmacKey(cryptoApi, encoder.encode(cfg.secret));
  // Canonical JSON preserves boundaries between invitations. List changes
  // revoke all sessions; reordering the same invitations does not.
  const derived = await cryptoApi.subtle.sign('HMAC', master, encoder.encode('rsnode-beta/session/v2\0' + JSON.stringify(cfg.passwords)));
  return hmacKey(cryptoApi, derived);
}

async function passwordMatches(cryptoApi, cfg, candidate) {
  const key = await hmacKey(cryptoApi, encoder.encode(cfg.secret));
  const candidateBytes = encoder.encode('rsnode-beta/password/v1\0' + candidate);
  let matches = 0;
  // Check every configured invitation, regardless of which one matches.
  for (const password of cfg.passwords) {
    const signature = await cryptoApi.subtle.sign('HMAC', key, encoder.encode('rsnode-beta/password/v1\0' + password));
    matches |= Number(await cryptoApi.subtle.verify('HMAC', key, signature, candidateBytes));
  }
  return matches !== 0;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode64(value) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Token');
  const decoded = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (base64url(decoded) !== value) throw new Error('Token');
  return decoded;
}

async function readSession(req, key, cryptoApi, now, origin) {
  try {
    const cookies = (req.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE_NAME + '='));
    if (cookies.length !== 1) return null;
    const token = cookies[0].slice(COOKIE_NAME.length + 1);
    if (token.length > 2048) return null;
    const pieces = token.split('.');
    if (pieces.length !== 2 || decode64(pieces[1]).length !== 32 ||
        !await cryptoApi.subtle.verify('HMAC', key, decode64(pieces[1]), encoder.encode(pieces[0]))) return null;
    const data = JSON.parse(decoder.decode(decode64(pieces[0])));
    if (!object(data) || data.v !== 1 || data.origin !== origin ||
        !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) ||
        data.iat > now || data.exp <= now || data.exp - data.iat !== SESSION_SECONDS ||
        !/^[a-f0-9]{32}$/.test(data.nonce || '') ||
        !['terms', 'ready'].includes(data.stage) ||
        (data.stage === 'ready' && data.termsVersion !== TERMS_VERSION)) return null;
    return data;
  } catch {
    return null;
  }
}

async function sessionCookie(data, key, cryptoApi, now) {
  const payload = base64url(encoder.encode(JSON.stringify(data)));
  const signature = base64url(await cryptoApi.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; Max-Age=${Math.max(0, data.exp - now)}; HttpOnly; Secure; SameSite=Strict`;
}

function state(session) {
  return { stage: session?.stage || 'locked', termsVersion: TERMS_VERSION };
}

// Read the stream with a hard cap; Content-Length alone does not bound a body.
async function readBounded(body, maxBytes) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Size');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) return { status: 415 };
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return { status: 413 };
  try {
    const value = JSON.parse(decoder.decode(await readBounded(req.body, MAX_BODY_BYTES)));
    return object(value) ? { value } : { status: 400 };
  } catch {
    return { status: 400 };
  }
}

async function download(asset, contentType, cfg, req, fetchAsset, cryptoApi, getOidcToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let phase = 'identity';
  let upstreamStatus = null;
  try {
    // The production adapter obtains Vercel's current request-context token.
    // Resolve it only after authorization, and never cache it between requests.
    // https://vercel.com/docs/oidc#in-vercel-functions
    const token = cfg.useOidc ? await getOidcToken(req) : cfg.blobToken;
    if (cfg.useOidc && (!boundedString(token, 16, 8192) ||
        !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(token))) throw new Error('OIDC');
    phase = 'storage';
    const response = await fetchAsset(asset.url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error', cache: 'no-store', signal: controller.signal
    });
    upstreamStatus = response.status;
    if (response.status !== 200 || response.redirected ||
        (response.url && response.url !== asset.url) || response.headers.has('content-range')) throw new Error('Asset');
    phase = 'size';
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== asset.public.size)) throw new Error('Length');
    const bytes = await readBounded(response.body, asset.public.size);
    if (bytes.length !== asset.public.size) throw new Error('Length');
    phase = 'integrity';
    const hash = Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
    if (hash !== asset.public.sha256) throw new Error('Digest');
    return new Response(bytes, { headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asset.public.fileName}"`,
      'Content-Length': String(bytes.length)
    } });
  } catch {
    // Fixed categories only: upstream error text can contain private URLs or
    // credentials. Keep useful operational diagnostics without disclosing them.
    console.warn('rsnode-beta download failed', { phase, upstreamStatus });
    return json({ error: 'Firmware could not be verified. Please try again later.' }, 502);
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

export function createRsnodeBetaHandler({
  env = () => process.env,
  fetchAsset = (...args) => fetch(...args),
  getOidcToken = req => req.headers.get('x-vercel-oidc-token'),
  cryptoApi = globalThis.crypto,
  now = () => Date.now(),
  loginRate = checkLoginRate
} = {}) {
  return async function handleRsnodeBeta(req) {
    try {
      if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
      const url = new URL(req.url);
      const action = url.searchParams.get('action') || 'session';
      const allowedQuery = action === 'download' ? ['action', 'board', 'kind'] : ['action'];
      if ([...url.searchParams.keys()].some(key => !allowedQuery.includes(key) || url.searchParams.getAll(key).length !== 1)) {
        return json({ error: 'Invalid request.' }, 400);
      }
      const mutations = ['login', 'accept', 'logout'];
      if (!['session', 'catalog', 'download', 'guide', ...mutations].includes(action)) return json({ error: 'Unknown action.' }, 400);
      if ((req.method === 'POST') !== mutations.includes(action)) return json({ error: 'Method not allowed.' }, 405, { Allow: mutations.includes(action) ? 'POST' : 'GET' });
      const origin = req.headers.get('origin');
      const fetchSite = req.headers.get('sec-fetch-site');
      if ((req.method === 'POST' && origin !== url.origin) ||
          (origin && origin !== url.origin) || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
        return json({ error: 'Open the flasher on this site to continue.' }, 403);
      }
      // Logout remains possible while deployments/configuration are changing.
      if (action === 'logout') return json(state(null), 200, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
      let cfg;
      try { cfg = loadConfig(env()); } catch { return json({ error: 'The private beta is offline right now. Try again later.' }, 503); }
      const key = await sessionKey(cryptoApi, cfg);
      const currentMs = now();
      const current = Math.floor(currentMs / 1000);
      const session = await readSession(req, key, cryptoApi, current, url.origin);
      if (action === 'session') return json(state(session));
      if (action === 'login') {
        const rate = loginRate(req, currentMs);
        if (!rate.allowed) return json({ error: 'Too many attempts. Please try again later.' }, 429, { 'Retry-After': String(rate.retryAfter) });
        const body = await readJson(req);
        if (body.status) return json({ error: 'Invalid request.' }, body.status);
        if (!boundedString(body.value.password, 1, 256) || !await passwordMatches(cryptoApi, cfg, body.value.password)) {
          return json({ error: 'That beta password was not accepted.' }, 401);
        }
        const nonce = Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('');
        const next = { v: 1, origin: url.origin, iat: current, exp: current + SESSION_SECONDS, nonce, stage: 'terms' };
        return json(state(next), 200, { 'Set-Cookie': await sessionCookie(next, key, cryptoApi, current) });
      }
      if (!session) return json({ error: 'Enter the beta password to continue.', ...state(null) }, 401);
      if (action === 'guide') {
        if (!cfg.guide) return json({ error: 'The rsNode guide is not available yet.' }, 404);
        return await download(cfg.guide, 'text/html; charset=utf-8', cfg, req, fetchAsset, cryptoApi, getOidcToken);
      }
      if (action === 'accept') {
        const body = await readJson(req);
        if (body.status) return json({ error: 'Invalid request.' }, body.status);
        if (body.value.termsVersion !== TERMS_VERSION || !object(body.value.confirmations) ||
            !CONFIRMATIONS.every(name => body.value.confirmations[name] === true)) {
          return json({ error: 'Confirm each beta condition to continue.' }, 400);
        }
        const next = { ...session, stage: 'ready', termsVersion: TERMS_VERSION };
        return json(state(next), 200, { 'Set-Cookie': await sessionCookie(next, key, cryptoApi, current) });
      }
      if (session.stage !== 'ready') return json({ error: 'Confirm the beta conditions first.', ...state(session) }, 403);
      if (action === 'catalog') return json({ boards: cfg.boards.map(board => board.public) });
      const kind = url.searchParams.get('kind');
      if (kind !== null && kind !== 'update') return json({ error: 'Invalid request.' }, 400);
      const board = cfg.boards.find(entry => entry.public.id === url.searchParams.get('board'));
      if (!board) return json({ error: 'That beta board is not available.' }, 404);
      if (kind === 'update') {
        if (!board.update) return json({ error: 'That beta board has no update package.' }, 404);
        return await download(board.update, 'application/octet-stream', cfg, req, fetchAsset, cryptoApi, getOidcToken);
      }
      return await download(board, 'application/zip', cfg, req, fetchAsset, cryptoApi, getOidcToken);
    } catch {
      // Never return upstream URLs, request bodies, secrets, or exception text.
      return json({ error: 'Private beta is temporarily unavailable. Please try again.' }, 503);
    }
  };
}

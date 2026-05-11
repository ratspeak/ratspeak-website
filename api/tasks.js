export const config = { runtime: 'edge' };

// Single-document task board persisted to Vercel Blob as `tasks.json`.
// Reads are public. Writes require a bearer token that matches TASKS_ADMIN_TOKEN.
//
// Required env vars (both must be set or writes are refused):
//   BLOB_READ_WRITE_TOKEN  – auto-injected when the Blob store is connected.
//   TASKS_ADMIN_TOKEN      – shared admin secret. Generate with:
//                              node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
//                            Set in Vercel → Project → Settings → Environment Variables.
//                            Rotate by changing this value (no code change needed).

const BLOB_API     = 'https://vercel.com/api/blob';
const PATHNAME     = 'tasks.json';
const API_VERSION  = '12';
const MAX_BODY     = 1024 * 1024;

const EMPTY_STATE = { version: 2, projects: {} };

const NO_STORE = { 'Cache-Control': 'no-store' };

export default async function handler(req) {
  const blobToken  = process.env.BLOB_READ_WRITE_TOKEN;
  const adminToken = process.env.TASKS_ADMIN_TOKEN;

  if (!blobToken) {
    return jsonResponse({ error: 'Storage not configured' }, 503);
  }

  const method = req.method;

  if (method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('auth') === 'check') {
      if (!adminToken) return jsonResponse({ error: 'Auth not configured' }, 503);
      return verifyAdmin(req, adminToken)
        ? jsonResponse({ ok: true }, 200, NO_STORE)
        : jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
    }
    return getState(blobToken);
  }

  if (method === 'POST' || method === 'PUT') {
    if (!adminToken) {
      // Fail-closed: never accept writes when the admin token isn't configured.
      return jsonResponse({ error: 'Auth not configured' }, 503);
    }
    if (!verifyAdmin(req, adminToken)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
    }
    return putState(req, blobToken);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function verifyAdmin(req, expected) {
  const header = req.headers.get('authorization') || '';
  const match  = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return timingSafeEqual(match[1], expected);
}

// Constant-time string comparison. Length leakage is irrelevant for fixed-size
// admin tokens, and `crypto.subtle.timingSafeEqual` is not available in Edge.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function getState(blobToken) {
  const listResp = await fetch(
    `${BLOB_API}?prefix=${encodeURIComponent(PATHNAME)}&limit=10`,
    {
      headers: {
        'authorization': `Bearer ${blobToken}`,
        'x-api-version': API_VERSION
      }
    }
  );
  if (!listResp.ok) {
    return jsonResponse({ error: 'Storage list failed', status: listResp.status }, 502);
  }
  const listing = await listResp.json();
  const blob = (listing.blobs || []).find(b => b.pathname === PATHNAME);
  if (!blob) {
    return jsonResponse(EMPTY_STATE, 200, NO_STORE);
  }
  const blobResp = await fetch(blob.url, { cache: 'no-store' });
  if (!blobResp.ok) {
    return jsonResponse({ error: 'Storage fetch failed', status: blobResp.status }, 502);
  }
  const body = await blobResp.text();
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...NO_STORE }
  });
}

async function putState(req, blobToken) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return jsonResponse({ error: 'Payload too large' }, 413);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  if (!payload || typeof payload !== 'object' || typeof payload.projects !== 'object') {
    return jsonResponse({ error: 'Invalid shape: expected { projects: {...} }' }, 400);
  }

  const putResp = await fetch(
    `${BLOB_API}/?pathname=${encodeURIComponent(PATHNAME)}`,
    {
      method: 'PUT',
      headers: {
        'authorization': `Bearer ${blobToken}`,
        'x-api-version': API_VERSION,
        'x-vercel-blob-access': 'public',
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
        'x-allow-overwrite': '1'
      },
      body: raw
    }
  );
  if (!putResp.ok) {
    return jsonResponse({ error: 'Storage write failed', status: putResp.status }, 502);
  }
  return jsonResponse({ ok: true });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

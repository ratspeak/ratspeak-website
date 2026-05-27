import { normalizePollState } from '../lib/vote-core.js';

export const config = { runtime: 'edge' };

// Proposal source of truth for poll.html.
//
// Reads are public. Writes require TASKS_ADMIN_TOKEN and are intended to
// be used from the ?admin UI.
//
// Required env vars:
//   BLOB_READ_WRITE_TOKEN      Vercel Blob read/write token.
//   TASKS_ADMIN_TOKEN          Shared admin secret used by tasks.html.

const BLOB_API = 'https://vercel.com/api/blob';
const PATHNAME = 'community-poll-proposals.json';
const API_VERSION = '12';
const MAX_BODY = 256 * 1024;
const EMPTY_STATE = normalizePollState(null);
const NO_STORE = { 'Cache-Control': 'no-store' };

export default async function handler(req) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const adminToken = process.env.TASKS_ADMIN_TOKEN;

  if (!blobToken) {
    return jsonResponse({ error: 'Storage not configured' }, 503);
  }

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('auth') === 'check') {
      if (!adminToken) return jsonResponse({ error: 'Auth not configured' }, 503, NO_STORE);
      return verifyAdmin(req, adminToken)
        ? jsonResponse({ ok: true }, 200, NO_STORE)
        : jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
    }
    return getState(blobToken);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!adminToken) {
      return jsonResponse({ error: 'Auth not configured' }, 503, NO_STORE);
    }
    if (!verifyAdmin(req, adminToken)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
    }
    return putState(req, blobToken);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, PUT' });
}

function verifyAdmin(req, expected) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return timingSafeEqual(match[1], expected);
}

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
        authorization: `Bearer ${blobToken}`,
        'x-api-version': API_VERSION
      }
    }
  );
  if (!listResp.ok) {
    return jsonResponse({ error: 'Storage list failed', status: listResp.status }, 502);
  }

  const listing = await listResp.json();
  const blob = (listing.blobs || []).find(item => item.pathname === PATHNAME);
  if (!blob) {
    return jsonResponse(EMPTY_STATE, 200, NO_STORE);
  }

  const blobResp = await fetch(blob.url, { cache: 'no-store' });
  if (!blobResp.ok) {
    return jsonResponse({ error: 'Storage fetch failed', status: blobResp.status }, 502);
  }

  const body = await blobResp.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return jsonResponse({ error: 'Stored proposal JSON is invalid' }, 502);
  }

  const validation = validateState(parsed);
  if (!validation.ok) {
    return jsonResponse({ error: 'Stored proposal state is invalid', detail: validation.error }, 502);
  }

  return jsonResponse(parsed, 200, NO_STORE);
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

  const validation = validateState(payload);
  if (!validation.ok) {
    return jsonResponse({ error: 'Invalid proposal state', detail: validation.error }, 400);
  }

  const putResp = await fetch(
    `${BLOB_API}/?pathname=${encodeURIComponent(PATHNAME)}`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${blobToken}`,
        'x-api-version': API_VERSION,
        'x-vercel-blob-access': 'public',
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
        'x-allow-overwrite': '1'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!putResp.ok) {
    const detail = await putResp.text().catch(() => '');
    console.error('Blob PUT failed', putResp.status, detail.slice(0, 500));
    return jsonResponse({
      error: 'Storage write failed',
      status: putResp.status,
      detail: detail.slice(0, 500)
    }, 502);
  }

  return jsonResponse({ ok: true }, 200, NO_STORE);
}

function validateState(payload) {
  if (!payload || typeof payload !== 'object') {
    return fail('expected object');
  }
  if (!Array.isArray(payload.polls)) {
    return fail('expected polls array');
  }
  if (payload.polls.length > 50) {
    return fail('too many proposals');
  }

  const pollIds = new Set();
  for (const poll of payload.polls) {
    const result = validatePoll(poll, pollIds);
    if (!result.ok) return result;
  }
  return { ok: true };
}

function validatePoll(poll, pollIds) {
  if (!poll || typeof poll !== 'object') return fail('poll must be an object');
  if (!isSlug(poll.id)) return fail('poll id must be a slug');
  if (pollIds.has(poll.id)) return fail(`duplicate poll id: ${poll.id}`);
  pollIds.add(poll.id);

  if (!isText(poll.title, 1, 220)) return fail(`invalid title for ${poll.id}`);
  if (!isText(poll.deckTitle, 1, 80)) return fail(`invalid short title for ${poll.id}`);
  if (!isText(poll.type, 1, 48)) return fail(`invalid type for ${poll.id}`);
  if (!isText(poll.description, 1, 280)) return fail(`invalid description for ${poll.id}`);
  if (!isCloseTime(poll.closes)) return fail(`invalid close time for ${poll.id}`);
  if (!Number.isSafeInteger(Number(poll.snapshotBlock)) || Number(poll.snapshotBlock) <= 0) {
    return fail(`invalid snapshot block for ${poll.id}`);
  }
  if (!Array.isArray(poll.choices) || poll.choices.length < 2 || poll.choices.length > 20) {
    return fail(`invalid choices for ${poll.id}`);
  }

  const choiceIds = new Set();
  for (const choice of poll.choices) {
    if (!choice || typeof choice !== 'object') return fail(`choice must be an object for ${poll.id}`);
    if (!isSlug(choice.id)) return fail(`invalid choice id for ${poll.id}`);
    if (choiceIds.has(choice.id)) return fail(`duplicate choice id for ${poll.id}: ${choice.id}`);
    choiceIds.add(choice.id);
    if (!isText(choice.name, 1, 120)) return fail(`invalid choice label for ${poll.id}`);
    if (choice.detail != null && !isText(choice.detail, 0, 220)) return fail(`invalid choice detail for ${poll.id}`);
  }

  return { ok: true };
}

function isSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
}

function isText(value, min, max) {
  if (typeof value !== 'string') return false;
  const length = value.trim().length;
  return length >= min && length <= max;
}

function isCloseTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(value || ''));
}

function fail(error) {
  return { ok: false, error };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

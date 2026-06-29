export const config = { runtime: 'edge' };

// Authenticated map snapshot ingest for the dedicated RNS discovery host.
//
// Required env vars:
//   BLOB_READ_WRITE_TOKEN  Vercel Blob read/write token.
//   MAP_INGEST_TOKEN       Shared bearer token for the server-side publisher.
//
// Optional env vars:
//   MAP_BLOB_PATH          Blob pathname for the public snapshot. Defaults to map/live.json.

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
const DEFAULT_PATHNAME = 'map/live.json';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_NODES = 10_000;
const MAX_SOURCES = 20;
const MAX_SERVICES = 20;
const WEB_MERCATOR_LAT_LIMIT = 85.05112878;
const NO_STORE = { 'Cache-Control': 'no-store' };

const ALLOWED_KINDS = new Set(['server', 'client-auto', 'client-manual', 'i2p', 'yggdrasil']);
const ALLOWED_STATUS = new Set(['available', 'seen', 'recent', 'stale', 'unknown']);

export default async function handler(req) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST, PUT', ...NO_STORE });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const ingestToken = process.env.MAP_INGEST_TOKEN;
  if (!blobToken) return jsonResponse({ error: 'Storage not configured' }, 503, NO_STORE);
  if (!ingestToken) return jsonResponse({ error: 'Ingest auth not configured' }, 503, NO_STORE);
  if (!verifyBearer(req, ingestToken)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return jsonResponse({ error: 'Payload too large' }, 413, NO_STORE);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_error) {
    return jsonResponse({ error: 'Invalid JSON' }, 400, NO_STORE);
  }

  let snapshot;
  try {
    snapshot = sanitizeSnapshot(payload);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400, NO_STORE);
  }

  const pathname = process.env.MAP_BLOB_PATH || DEFAULT_PATHNAME;
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  const putResp = await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION,
      'x-vercel-blob-access': 'public',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1'
    },
    body
  });

  if (!putResp.ok) {
    const detail = await putResp.text().catch(() => '');
    console.error('Map snapshot Blob PUT failed', putResp.status, detail.slice(0, 500));
    return jsonResponse({ error: 'Storage write failed', status: putResp.status }, 502, NO_STORE);
  }

  return jsonResponse({
    ok: true,
    pathname,
    generatedAt: snapshot.generatedAt,
    publishedAt: snapshot.publishedAt,
    nodes: snapshot.nodes.length
  }, 200, NO_STORE);
}

function sanitizeSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid shape: expected snapshot object');
  }
  if (payload.schemaVersion !== 1) {
    throw new Error('Invalid schemaVersion: expected 1');
  }
  if (!Array.isArray(payload.nodes)) {
    throw new Error('Invalid shape: expected nodes array');
  }
  if (payload.nodes.length > MAX_NODES) {
    throw new Error(`Too many nodes: max ${MAX_NODES}`);
  }

  const nodes = payload.nodes.map((node, index) => sanitizeNode(node, index));
  const snapshot = {
    schemaVersion: 1,
    sourceMode: boundedString(payload.sourceMode, 64) || 'live-discovery',
    generatedAt: isoTimestamp(payload.generatedAt) || new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    ttlSeconds: boundedInteger(payload.ttlSeconds, 60, 24 * 60 * 60) || 15 * 60,
    sources: sanitizeSources(payload.sources),
    stats: sanitizeStats(payload.stats),
    nodes
  };

  const disclaimer = boundedString(payload.disclaimer, 500);
  if (disclaimer) snapshot.disclaimer = disclaimer;
  return snapshot;
}

function sanitizeNode(node, index) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error(`Invalid node at index ${index}`);
  }
  const id = boundedString(node.id, 200);
  if (!id) throw new Error(`Invalid node id at index ${index}`);

  const location = sanitizeLocation(node.location, index);
  const reticulum = sanitizeReticulum(node.reticulum);
  const kind = normalizeKind(node.kind, reticulum);
  const status = boundedString(node.status, 24);
  const sanitized = {
    id,
    label: boundedString(node.label, 160) || id,
    kind,
    status: ALLOWED_STATUS.has(status) ? status : 'seen',
    location,
    services: sanitizeStringArray(node.services, MAX_SERVICES, 64)
  };

  const sourceId = boundedString(node.sourceId, 100);
  const sourceMode = boundedString(node.sourceMode, 64);
  const lastSeen = isoTimestamp(node.lastSeen);
  const firstSeen = isoTimestamp(node.firstSeen);
  const endpoint = sanitizeEndpoint(node.endpoint);
  if (sourceId) sanitized.sourceId = sourceId;
  if (sourceMode) sanitized.sourceMode = sourceMode;
  if (lastSeen) sanitized.lastSeen = lastSeen;
  if (firstSeen) sanitized.firstSeen = firstSeen;
  if (Object.keys(endpoint).length) sanitized.endpoint = endpoint;
  if (Object.keys(reticulum).length) sanitized.reticulum = reticulum;

  return sanitized;
}

function sanitizeLocation(location, index) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new Error(`Missing location for node at index ${index}`);
  }
  const lat = finiteNumber(location.lat);
  const lon = finiteNumber(location.lon);
  if (lat == null || lon == null || Math.abs(lat) > WEB_MERCATOR_LAT_LIMIT || Math.abs(lon) > 180) {
    throw new Error(`Invalid location for node at index ${index}`);
  }

  const result = { lat, lon };
  const city = boundedString(location.city, 100);
  const country = boundedString(location.country, 100);
  const heightMeters = finiteNumber(location.heightMeters);
  if (city) result.city = city;
  if (country) result.country = country;
  if (heightMeters != null) result.heightMeters = heightMeters;
  return result;
}

function sanitizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) return {};
  const result = {};
  for (const key of ['ip', 'host', 'address']) {
    const value = boundedString(endpoint[key], 512);
    if (value) result[key] = value;
  }
  const port = integerValue(endpoint.port);
  if (port != null && port >= 0 && port <= 65535) result.port = port;
  return result;
}

function sanitizeReticulum(reticulum) {
  if (!reticulum || typeof reticulum !== 'object' || Array.isArray(reticulum)) return {};
  const result = {};

  for (const key of ['interfaceType', 'transportId', 'networkId', 'reachableOn']) {
    const value = boundedString(reticulum[key], key === 'reachableOn' ? 512 : 160);
    if (value) result[key] = value;
  }

  for (const key of ['hops', 'stampValue', 'heardCount', 'port']) {
    const value = integerValue(reticulum[key]);
    if (value != null) result[key] = value;
  }

  const heightMeters = finiteNumber(reticulum.heightMeters);
  if (heightMeters != null) result.heightMeters = heightMeters;

  const radio = sanitizeRadio(reticulum.radio);
  if (radio) result.radio = radio;
  return result;
}

function sanitizeRadio(radio) {
  if (!radio || typeof radio !== 'object' || Array.isArray(radio)) return null;
  const result = {};
  for (const key of ['frequency', 'bandwidth']) {
    const value = finiteNumber(radio[key]);
    if (value != null) result[key] = value;
  }
  for (const key of ['spreadingFactor', 'codingRate', 'txPowerDbm', 'channel']) {
    const value = integerValue(radio[key]);
    if (value != null) result[key] = value;
  }
  const modulation = boundedString(radio.modulation, 40);
  if (modulation) result.modulation = modulation;
  return Object.keys(result).length ? result : null;
}

function normalizeKind(kind, reticulum) {
  const value = boundedString(kind, 40);
  if (ALLOWED_KINDS.has(value)) return value;

  const interfaceType = String(reticulum.interfaceType || '').toLowerCase();
  if (interfaceType.includes('i2p')) return 'i2p';
  if (interfaceType.includes('yggdrasil')) return 'yggdrasil';
  if (interfaceType === 'backboneinterface' || interfaceType === 'tcpserverinterface') return 'server';
  return 'client-auto';
}

function sanitizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.slice(0, MAX_SOURCES).map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const result = {};
    for (const key of ['id', 'label', 'kind', 'trust']) {
      const value = boundedString(source[key], 120);
      if (value) result[key] = value;
    }
    return Object.keys(result).length ? result : null;
  }).filter(Boolean);
}

function sanitizeStats(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return {};
  const result = {};
  for (const [key, value] of Object.entries(stats)) {
    const safeKey = /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(key) ? key : null;
    if (!safeKey) continue;
    if (typeof value === 'number' && Number.isFinite(value)) result[safeKey] = value;
    else if (typeof value === 'string') result[safeKey] = boundedString(value, 120);
  }
  return result;
}

function sanitizeStringArray(values, maxItems, maxLength) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const item = boundedString(value, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function verifyBearer(req, expected) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && timingSafeEqual(match[1], expected));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function boundedString(value, maxLength) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLength);
}

function isoTimestamp(value) {
  const text = boundedString(value, 60);
  if (!text) return '';
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function boundedInteger(value, min, max) {
  const parsed = integerValue(value);
  if (parsed == null || parsed < min || parsed > max) return null;
  return parsed;
}

function integerValue(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

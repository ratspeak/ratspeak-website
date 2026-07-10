import { buildMapSnapshot } from '../assets/map-data.js';
import { loadPublishedSnapshot, mapPathname, pruneExpiredNodes } from '../lib/map-live-snapshot.js';

export const config = { runtime: 'edge' };

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405, {
      Allow: 'GET, HEAD'
    });
  }

  let snapshot;
  try {
    snapshot = await loadPublishedSnapshot(process.env.BLOB_READ_WRITE_TOKEN, mapPathname()) ||
      buildMapSnapshot(new Date());
  } catch (error) {
    console.error('Map snapshot read failed', error);
    return jsonResponse({ error: 'Map snapshot read failed' }, 502);
  }

  snapshot = pruneExpiredNodes(snapshot);

  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: JSON_HEADERS
    });
  }

  return jsonResponse(snapshot);
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

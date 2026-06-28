import { buildMapSnapshot } from '../assets/map-data.js';

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

  const snapshot = buildMapSnapshot(new Date());
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

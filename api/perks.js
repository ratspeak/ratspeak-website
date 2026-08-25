// Holder perks bridge: the infra fleet syncs the PERKS-ENROLLED badge list
// and reports mailbox facts for those addresses.
//
//   GET  /api/perks?sync=badges     infra polls (~2 min)
//     -> { version, updated_at, badges: { "<lxmf 32hex>": { tier } } }
//        ONLY holders who signed a perks enrollment appear — the registry is
//        private; nothing leaves it without the owner's signature. Wallets
//        never cross this boundary in either direction.
//   POST /api/perks {action:"mailbox_report", generated_at, badges:{...}}
//     infra pushes full snapshots on change (~1/min); each POST replaces the
//     previous snapshot wholesale.
//
// Auth: Authorization: Bearer <BADGE_SYNC_TOKEN> (distinct from the identity
// bridge token). Fails closed while unconfigured.
//
// STUB: serves one hardcoded test badge and accepts-but-discards mailbox
// reports so infra can build against the live contract. The real
// implementation lands with the perks tab + signed enrollment.

export const config = { runtime: 'edge' };

const NO_STORE = { 'Cache-Control': 'no-store' };
const STUB_BADGES = {
  '0123456789abcdef0123456789abcdef': { tier: 'gold' }
};

export default async function handler(req) {
  const token = process.env.BADGE_SYNC_TOKEN;
  if (!token) return json({ error: 'Perks sync not configured' }, 503);
  if (!verifySync(req, token)) return json({ error: 'Unauthorized' }, 401);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('sync') !== 'badges') return json({ error: 'Unknown sync' }, 400);
    return json({
      version: 1,
      stub: true,
      updated_at: new Date().toISOString(),
      badges: STUB_BADGES
    });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    if (body?.action !== 'mailbox_report') return json({ error: 'Unknown action' }, 400);
    if (typeof body.badges !== 'object' || body.badges === null) {
      return json({ error: 'badges must be an object' }, 400);
    }
    for (const [address, entry] of Object.entries(body.badges)) {
      if (!/^[0-9a-f]{32}$/.test(address)) return json({ error: `bad address key: ${address}` }, 400);
      if (!Number.isInteger(entry?.waiting) || entry.waiting < 0) {
        return json({ error: `bad waiting count for ${address}` }, 400);
      }
    }
    return json({ ok: true, stub: true, stored: false });
  }

  return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
}

function verifySync(req, expected) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && timingSafeEqual(match[1], expected));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...NO_STORE, ...extraHeaders }
  });
}

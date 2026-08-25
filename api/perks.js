// Holder perks: signed enrollment (the consent gate), the infra sync feed,
// mailbox snapshots, and the alert decision engine.
//
// User actions (POST {action,...}, rate limited):
//   enroll      {message, signature}  perks.v1 EIP-712; enrolled:true needs an
//               active registration for that address + a badge. Returns the
//               perksKey that authenticates later reads/prefs for this wallet.
//   set_alerts  {wallet, perksKey, enabled, thresholdMin}
// User read: GET ?wallet=&key=  -> full perks state; without a valid key it
//   always answers {enrolled:false} — enrollment status leaks nothing.
//
// Infra (Authorization: Bearer <BADGE_SYNC_TOKEN>; fails closed if unset):
//   GET  ?sync=badges   enrolled-only { "<lxmf 32hex>": { tier } } — the only
//        place registry data leaves, and only with the holder's signature.
//        Wallets never cross this boundary.
//   POST {action:"mailbox_report", generated_at, badges:{...}}  full snapshot
//        (absent address = zero waiting), on change + every ~60s while
//        anything waits. Response carries ready-to-send mesh alerts
//        [{address, body}] — prefs/thresholds/dedupe all live here.
//
// Storage (sealed + versioned via lib/registry-store):
//   holder-registry/perks/<wallet>/<version>.json   enrollment + prefs + key
//   holder-registry/perks-mailbox/<version>.json    latest infra snapshot
//   holder-registry/perks-alerts/<version>.json     per-address alert episodes

import {
  ALERT_THRESHOLD_DEFAULT_MIN,
  PERKS_TYPES,
  REGISTRY_DOMAIN,
  canonicalPerksMessage,
  isActiveRegistration,
  normalizeAlertThreshold,
  normalizeBadge,
  normalizeRegistration,
  serializableMessage,
  shortLxmfAddress,
  validatePerksInput
} from '../lib/identity-core.js';
import {
  checkRateLimit,
  clientKeyFromHeaders,
  rateLimitFromEnv,
  rateLimitHeaders
} from '../lib/rate-limit.js';
import { getAddress, isAddress, verifyTypedData } from 'viem';
import {
  ROOT,
  listBlobs,
  fetchJson,
  openSealedValue,
  randomHex,
  readBadge,
  readSealed,
  readVersioned,
  registrationPath,
  timingSafeEqual,
  writeVersioned
} from '../lib/registry-store.js';

export const config = { runtime: 'edge' };

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_BODY = 256 * 1024;
const RATE_LIMIT_WINDOW_MS = rateLimitFromEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const PERKS_READ_RATE_LIMIT = rateLimitFromEnv('PERKS_READ_RATE_LIMIT', 120);
const PERKS_WRITE_RATE_LIMIT = rateLimitFromEnv('PERKS_WRITE_RATE_LIMIT', 12);

const ENROLL_PREFIX = `${ROOT}/perks/`;
const MAILBOX_PREFIX = `${ROOT}/perks-mailbox/`;
const ALERT_STATE_PREFIX = `${ROOT}/perks-alerts/`;

export default async function handler(req) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const secret = process.env.IDENTITY_CODE_SECRET;
  if (!blobToken || !secret) return json({ error: 'Perks not configured' }, 503);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('sync') === 'badges') {
      if (!verifySync(req)) return json({ error: 'Unauthorized' }, 401);
      return syncBadges(blobToken, secret);
    }
    const limit = rate(req, 'perks:get', PERKS_READ_RATE_LIMIT);
    if (!limit.allowed) return tooMany(limit);
    return getPerksStatus(url, blobToken, secret);
  }

  if (req.method === 'POST') {
    let body;
    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: 'Payload too large' }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const action = String(body?.action || '');

    if (action === 'mailbox_report') {
      if (!verifySync(req)) return json({ error: 'Unauthorized' }, 401);
      return mailboxReport(body, blobToken, secret);
    }

    const limit = rate(req, 'perks:post', PERKS_WRITE_RATE_LIMIT);
    if (!limit.allowed) return tooMany(limit);
    if (action === 'enroll') return enroll(body, blobToken, secret);
    if (action === 'set_alerts') return setAlerts(body, blobToken, secret);
    return json({ error: 'Unknown action' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
}

// ------------------------------------------------------------ user side -----
async function enroll(body, blobToken, secret) {
  const { message, signature } = body;
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) return json({ error: 'Invalid signature' }, 400);
  const input = validatePerksInput(message);
  if (!input.ok) return json({ error: input.error }, 400);
  if (!isAddress(String(message.wallet || ''))) return json({ error: 'Invalid wallet address' }, 400);
  const wallet = getAddress(message.wallet);

  const canonical = canonicalPerksMessage({
    wallet,
    lxmfAddress: message.lxmfAddress,
    enrolled: message.enrolled,
    nonce: message.nonce,
    issuedAt: input.issuedAt
  });
  const verified = await verifyTypedData({
    address: wallet,
    domain: REGISTRY_DOMAIN,
    types: PERKS_TYPES,
    primaryType: 'Perks',
    message: canonical,
    signature
  });
  if (!verified) return json({ error: 'Signature verification failed' }, 401);

  if (canonical.enrolled) {
    const registration = normalizeRegistration(await readSealed(blobToken, secret, registrationPath(wallet)));
    if (!isActiveRegistration(registration) || registration.lxmfAddress !== canonical.lxmfAddress) {
      return json({ error: 'Pair this wallet with that Ratspeak address first' }, 409);
    }
    const badge = normalizeBadge((await readBadge(blobToken, secret, wallet))?.badge);
    if (badge === 'none') return json({ error: 'Claim a badge first — perks are for badge holders' }, 403);
  }

  const existing = await readEnrollment(blobToken, secret, wallet);
  const now = new Date().toISOString();
  const record = {
    version: 1,
    wallet,
    lxmfAddress: canonical.lxmfAddress,
    enrolled: canonical.enrolled,
    perksKey: existing?.perksKey || randomHex(16),
    alerts: existing?.alerts || { enabled: true, thresholdMin: ALERT_THRESHOLD_DEFAULT_MIN },
    message: serializableMessage(canonical),
    signature,
    enrolledAt: canonical.enrolled ? (existing?.enrolledAt && existing?.enrolled ? existing.enrolledAt : now) : existing?.enrolledAt || '',
    updatedAt: now
  };
  await writeEnrollment(blobToken, secret, wallet, record);
  return json({ ok: true, perksKey: record.perksKey, perks: await publicPerks(record, blobToken, secret) });
}

async function setAlerts(body, blobToken, secret) {
  const auth = await authedEnrollment(body, blobToken, secret);
  if (auth.error) return auth.error;
  const record = auth.record;
  const next = {
    ...record,
    alerts: {
      enabled: Boolean(body.enabled),
      thresholdMin: normalizeAlertThreshold(body.thresholdMin)
    },
    updatedAt: new Date().toISOString()
  };
  await writeEnrollment(blobToken, secret, record.wallet, next);
  return json({ ok: true, perks: await publicPerks(next, blobToken, secret) });
}

async function getPerksStatus(url, blobToken, secret) {
  const walletParam = url.searchParams.get('wallet') || '';
  if (!isAddress(walletParam)) return json({ error: 'Invalid wallet address' }, 400);
  const wallet = getAddress(walletParam);
  const record = await readEnrollment(blobToken, secret, wallet);
  const key = String(url.searchParams.get('key') || '');
  // Without the key issued at enrollment, this endpoint reveals nothing —
  // not even whether the wallet is enrolled.
  if (!record || !key || !timingSafeEqual(key, String(record.perksKey || ''))) {
    return json({ ok: true, enrolled: false });
  }
  return json({ ok: true, ...(await publicPerks(record, blobToken, secret)) });
}

async function publicPerks(record, blobToken, secret) {
  const badge = normalizeBadge((await readBadge(blobToken, secret, record.wallet))?.badge);
  const snapshot = record.enrolled ? await readVersioned(blobToken, secret, MAILBOX_PREFIX, null) : null;
  const entry = snapshot?.badges?.[record.lxmfAddress] || null;
  return {
    enrolled: Boolean(record.enrolled),
    lxmfAddress: shortLxmfAddress(record.lxmfAddress),
    tier: badge,
    alerts: {
      enabled: Boolean(record.alerts?.enabled),
      thresholdMin: normalizeAlertThreshold(record.alerts?.thresholdMin)
    },
    mailbox: entry && Number(entry.waiting) > 0
      ? {
          waiting: Number(entry.waiting),
          oldestTs: Number(entry.oldest_ts) || null,
          lastSyncedTs: Number(entry.last_synced_ts) || null,
          reportedAt: snapshot.receivedAt || ''
        }
      : { waiting: 0, reportedAt: snapshot?.receivedAt || '' },
    goldRelay: process.env.PERKS_GOLD_RELAY || null
  };
}

async function authedEnrollment(body, blobToken, secret) {
  if (!isAddress(String(body.wallet || ''))) return { error: json({ error: 'Invalid wallet address' }, 400) };
  const wallet = getAddress(body.wallet);
  const record = await readEnrollment(blobToken, secret, wallet);
  if (!record || !timingSafeEqual(String(body.perksKey || ''), String(record.perksKey || ''))) {
    return { error: json({ error: 'Unknown wallet or key — re-enroll to recover access' }, 401) };
  }
  return { record };
}

// ----------------------------------------------------------- infra side -----
async function syncBadges(blobToken, secret) {
  const enrollments = await allEnrollments(blobToken, secret);
  const badges = {};
  for (const record of enrollments) {
    if (!record.enrolled) continue;
    const registration = normalizeRegistration(await readSealed(blobToken, secret, registrationPath(record.wallet)));
    if (!isActiveRegistration(registration) || registration.lxmfAddress !== record.lxmfAddress) continue;
    const tier = normalizeBadge((await readBadge(blobToken, secret, record.wallet))?.badge);
    if (tier === 'none') continue;
    badges[record.lxmfAddress] = { tier };
  }
  return json({ version: 1, updated_at: new Date().toISOString(), badges });
}

async function mailboxReport(body, blobToken, secret) {
  if (typeof body.badges !== 'object' || body.badges === null) {
    return json({ error: 'badges must be an object' }, 400);
  }
  for (const [address, entry] of Object.entries(body.badges)) {
    if (!/^[0-9a-f]{32}$/.test(address)) return json({ error: `bad address key: ${address}` }, 400);
    if (!Number.isInteger(entry?.waiting) || entry.waiting < 0) {
      return json({ error: `bad waiting count for ${address}` }, 400);
    }
  }

  const receivedAt = new Date().toISOString();
  await writeVersioned(blobToken, secret, MAILBOX_PREFIX, {
    version: 1,
    generatedAt: String(body.generated_at || ''),
    receivedAt,
    badges: body.badges
  });

  // Alert decisions: threshold from the holder's prefs, one alert per mail
  // episode (keyed by oldest_ts), episode resets when the box drains.
  const enrollments = await allEnrollments(blobToken, secret);
  const byAddress = new Map();
  for (const record of enrollments) {
    if (record.enrolled && record.alerts?.enabled) byAddress.set(record.lxmfAddress, record);
  }
  const state = (await readVersioned(blobToken, secret, ALERT_STATE_PREFIX, null))?.episodes || {};
  const nowSec = Date.now() / 1000;
  const alerts = [];
  const nextState = {};

  for (const [address, entry] of Object.entries(body.badges)) {
    if (!Number(entry.waiting)) continue;
    const record = byAddress.get(address);
    if (!record) continue;
    const oldest = Number(entry.oldest_ts) || 0;
    if (!oldest) continue;
    if (state[address]?.alertedOldestTs === oldest) {
      nextState[address] = state[address];
      continue;
    }
    const ageMin = (nowSec - oldest) / 60;
    if (ageMin < normalizeAlertThreshold(record.alerts.thresholdMin)) continue;
    const waiting = Number(entry.waiting);
    const since = new Date(oldest * 1000).toISOString().slice(11, 16);
    alerts.push({
      address,
      body: `You have ${waiting} message${waiting === 1 ? '' : 's'} waiting on your Ratspeak relay (oldest since ${since} UTC). Open Ratspeak and sync to receive ${waiting === 1 ? 'it' : 'them'}. — ratspeak.org portal`
    });
    nextState[address] = { alertedOldestTs: oldest, alertedAt: receivedAt };
  }

  if (JSON.stringify(nextState) !== JSON.stringify(state)) {
    await writeVersioned(blobToken, secret, ALERT_STATE_PREFIX, { version: 1, episodes: nextState });
  }
  return json({ ok: true, alerts });
}

// ------------------------------------------------------------- storage ------
function enrollPrefix(wallet) {
  return `${ENROLL_PREFIX}${String(wallet).toLowerCase()}/`;
}

const readEnrollment = (t, s, wallet) => readVersioned(t, s, enrollPrefix(wallet), null);
const writeEnrollment = (t, s, wallet, value) => writeVersioned(t, s, enrollPrefix(wallet), value);

async function allEnrollments(blobToken, secret) {
  const blobs = await listBlobs(blobToken, ENROLL_PREFIX, 1000);
  const newestPerWallet = new Map();
  for (const blob of blobs) {
    const rel = blob.pathname.slice(ENROLL_PREFIX.length);
    const wallet = rel.split('/')[0];
    if (!wallet || !rel.includes('/')) continue;
    const current = newestPerWallet.get(wallet);
    if (!current || blob.pathname > current.pathname) newestPerWallet.set(wallet, blob);
  }
  const records = [];
  for (const blob of newestPerWallet.values()) {
    const record = await openSealedValue(secret, await fetchJson(blob.url));
    if (record && record.wallet) records.push(record);
  }
  return records;
}

// ------------------------------------------------------------- helpers ------
function verifySync(req) {
  const expected = process.env.BADGE_SYNC_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && timingSafeEqual(match[1], expected));
}

function rate(req, bucket, limit) {
  return checkRateLimit(bucket, clientKeyFromHeaders(req.headers), { limit, windowMs: RATE_LIMIT_WINDOW_MS });
}

function tooMany(limit) {
  return json({ error: 'Too many requests. Try again shortly.' }, 429, rateLimitHeaders(limit));
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...NO_STORE, ...extraHeaders }
  });
}

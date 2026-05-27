const DEFAULT_WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

const stores = globalThis.__ratspeakTokenVoteRateLimits || new Map();
globalThis.__ratspeakTokenVoteRateLimits = stores;

export function clientKeyFromHeaders(headers) {
  const forwarded = readHeader(headers, 'x-forwarded-for');
  const realIp = readHeader(headers, 'x-real-ip');
  const connectingIp = readHeader(headers, 'cf-connecting-ip');
  const ip = String(forwarded || realIp || connectingIp || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 96);
  return ip || 'unknown';
}

export function checkRateLimit(bucket, key, options = {}) {
  const limit = positiveInteger(options.limit, 60);
  const windowMs = positiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const now = Date.now();
  const store = storeFor(bucket);
  const id = String(key || 'unknown');
  let entry = store.get(id);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
  }

  entry.count += 1;
  store.set(id, entry);
  pruneStore(store, now);

  const remaining = Math.max(0, limit - entry.count);
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    allowed: entry.count <= limit,
    limit,
    remaining,
    retryAfter,
    resetAt: entry.resetAt
  };
}

export function rateLimitHeaders(result) {
  return {
    'Retry-After': String(result.retryAfter),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000))
  };
}

export function rateLimitFromEnv(name, fallback) {
  return positiveInteger(process.env[name], fallback);
}

function storeFor(bucket) {
  const key = String(bucket || 'default');
  if (!stores.has(key)) stores.set(key, new Map());
  return stores.get(key);
}

function readHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  return Array.isArray(direct) ? direct[0] : direct || '';
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function pruneStore(store, now) {
  if (store.size <= MAX_BUCKETS) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
    if (store.size <= MAX_BUCKETS) return;
  }
}

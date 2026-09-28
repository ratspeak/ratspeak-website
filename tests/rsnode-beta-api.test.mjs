import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import {
  COOKIE_NAME, MAX_ASSET_BYTES, SESSION_SECONDS, TERMS_VERSION, createRsnodeBetaHandler
} from '../lib/rsnode-beta.js';

const ORIGIN = 'https://ratspeak.org';
const PAYLOAD = new TextEncoder().encode('private firmware test fixture');
const HASH = createHash('sha256').update(PAYLOAD).digest('hex');
const BOARD = {
  id: 'heltec-v4', version: '0.1.0-beta.1', fileName: 'rsnode-heltec-v4.zip',
  size: PAYLOAD.length, sha256: HASH,
  url: 'https://test-store.private.blob.vercel-storage.com/candidates/rsnode-heltec-v4.zip'
};
const CONFIRMATIONS = { france: true, sanctions: true, export: true, privateBeta: true };
const OIDC_STORE_ID = 'store_BetaStore123';
const OIDC_BOARD = { ...BOARD, url: 'https://betastore123.private.blob.vercel-storage.com/candidates/rsnode-heltec-v4.zip' };
const OIDC_TOKEN = 'testHeader.testClaims.testSignature';
const INVITATIONS = ['beta-invite-0001', 'beta-invite-0002', 'beta-invite-0003', 'beta-invite-0004', 'beta-invite-0005'];

function fixture(overrides = {}, dependencies = {}) {
  const env = {
    RSNODE_BETA_PASSWORD: 'test-only-invite-password-very-long',
    RSNODE_BETA_SESSION_SECRET: 'test-only-independent-cookie-secret-at-least-32',
    RSNODE_BETA_BLOB_TOKEN: 'test-only-private-blob-token',
    RSNODE_BETA_CATALOG: JSON.stringify({ boards: [BOARD] }),
    ...overrides
  };
  const runtime = { now: 1_800_000_000_000, fetches: [], fetchResponse: () => new Response(PAYLOAD), rate: { allowed: true } };
  const handler = createRsnodeBetaHandler({
    env: () => env, cryptoApi: webcrypto, now: () => runtime.now,
    loginRate: () => runtime.rate,
    fetchAsset: async (...args) => { runtime.fetches.push(args); return runtime.fetchResponse(...args); },
    ...dependencies
  });
  async function request(action = 'session', options = {}) {
    const mutation = ['login', 'accept', 'logout'].includes(action);
    const method = options.method || (mutation ? 'POST' : 'GET');
    const headers = new Headers(options.headers);
    if (mutation && !headers.has('origin') && !options.omitOrigin) headers.set('origin', options.origin || ORIGIN);
    if (options.cookie) headers.set('cookie', options.cookie);
    let body;
    if ('body' in options) {
      body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    return handler(new Request((options.origin || ORIGIN) + '/api/rsnode-beta?action=' + action + (options.query || ''), { method, headers, body }));
  }
  async function login(password = env.RSNODE_BETA_PASSWORDS === undefined ? env.RSNODE_BETA_PASSWORD : JSON.parse(env.RSNODE_BETA_PASSWORDS)[0]) {
    const response = await request('login', { body: { password } });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  async function ready(password) {
    const response = await request('accept', {
      cookie: await login(password), body: { termsVersion: TERMS_VERSION, confirmations: CONFIRMATIONS }
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  return { env, runtime, request, login, ready, handler };
}

function privateResponse(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('location'), null);
}

function oidcFixture(overrides = {}, dependencies = {}) {
  return fixture({
    RSNODE_BETA_BLOB_TOKEN: undefined,
    RSNODE_BETA_BLOB_STORE_ID: OIDC_STORE_ID,
    RSNODE_BETA_CATALOG: JSON.stringify({ boards: [OIDC_BOARD] }),
    ...overrides
  }, dependencies);
}

test('production Node adapter exposes a Web Standard fetch handler and fails closed without configuration', async () => {
  const { default: api } = await import('../api/rsnode-beta.js');
  assert.equal(typeof api.fetch, 'function');
  const saved = process.env.RSNODE_BETA_CATALOG;
  delete process.env.RSNODE_BETA_CATALOG;
  try {
    const response = await api.fetch(new Request(ORIGIN + '/api/rsnode-beta?action=session'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Private beta is not available yet.' });
    privateResponse(response);
  } finally {
    if (saved === undefined) delete process.env.RSNODE_BETA_CATALOG;
    else process.env.RSNODE_BETA_CATALOG = saved;
  }
});

test('locked -> terms -> ready protects both catalog and exact firmware bytes', async () => {
  const f = fixture();
  const initial = await f.request();
  assert.deepEqual(await initial.json(), { stage: 'locked', termsVersion: TERMS_VERSION });
  privateResponse(initial);
  assert.equal((await f.request('catalog')).status, 401);
  assert.equal((await f.request('download', { query: '&board=heltec-v4' })).status, 401);
  assert.equal(f.runtime.fetches.length, 0);
  const termsCookie = await f.login();
  assert.deepEqual(await (await f.request('session', { cookie: termsCookie })).json(), { stage: 'terms', termsVersion: TERMS_VERSION });
  for (const action of ['catalog', 'download']) {
    const response = await f.request(action, { cookie: termsCookie, query: action === 'download' ? '&board=heltec-v4' : '' });
    assert.equal(response.status, 403);
    privateResponse(response);
  }
  const cookie = await f.ready();
  assert.equal((await (await f.request('session', { cookie })).json()).stage, 'ready');
  const response = await f.request('catalog', { cookie });
  privateResponse(response);
  const catalog = await response.json();
  assert.equal(catalog.boards.length, 1);
  assert.deepEqual(catalog.boards[0], {
    id: 'heltec-v4', board: 'heltec-v4', label: 'Heltec LoRa 32 V4 · R2', flashSize: '16MB',
    version: BOARD.version, fileName: BOARD.fileName, size: BOARD.size, sha256: HASH,
    product: 'rsnode', installMode: 'factory', chipFamily: 'ESP32-S3', platform: 'esp32', flashStrategy: 'esp32-esptool'
  });
  const firmware = await f.request('download', { cookie, query: '&board=heltec-v4' });
  assert.equal(firmware.status, 200);
  privateResponse(firmware);
  assert.equal(firmware.headers.get('content-type'), 'application/zip');
  assert.equal(firmware.headers.get('content-disposition'), 'attachment; filename="rsnode-heltec-v4.zip"');
  assert.deepEqual(new Uint8Array(await firmware.arrayBuffer()), PAYLOAD);
  assert.equal(f.runtime.fetches.length, 1);
  const [url, options] = f.runtime.fetches[0];
  assert.equal(url, BOARD.url);
  assert.equal(options.headers.Authorization, 'Bearer ' + f.env.RSNODE_BETA_BLOB_TOKEN);
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
});

test('session cookies are host-only, secure, HttpOnly, Strict, and eight hours long', async () => {
  const f = fixture();
  const response = await f.request('login', { body: { password: f.env.RSNODE_BETA_PASSWORD } });
  const header = response.headers.get('set-cookie');
  assert.ok(header.startsWith(COOKIE_NAME + '='));
  assert.match(header, /; Path=\/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict$/);
  assert.doesNotMatch(header, /Domain=/i);
  assert.equal(header.includes(f.env.RSNODE_BETA_PASSWORD), false);
  assert.equal(header.includes(f.env.RSNODE_BETA_SESSION_SECRET), false);
  privateResponse(response);
});

test('all five sixteen-character invitations reach terms and require acceptance before firmware access', async () => {
  const f = fixture({ RSNODE_BETA_PASSWORDS: JSON.stringify(INVITATIONS) });
  for (const password of INVITATIONS) {
    assert.equal(password.length, 16);
    const cookie = await f.login(password);
    assert.equal((await (await f.request('session', { cookie })).json()).stage, 'terms');
    assert.equal((await f.request('catalog', { cookie })).status, 403);
    assert.equal((await f.request('download', { cookie, query: '&board=heltec-v4' })).status, 403);
    const accepted = await f.request('accept', { cookie, body: { termsVersion: TERMS_VERSION, confirmations: CONFIRMATIONS } });
    assert.equal(accepted.status, 200);
    const readyCookie = accepted.headers.get('set-cookie').split(';')[0];
    assert.equal((await f.request('catalog', { cookie: readyCookie })).status, 200);
    const download = await f.request('download', { cookie: readyCookie, query: '&board=heltec-v4' });
    assert.equal(download.status, 200);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), PAYLOAD);
  }
});

test('a configured invitation list takes precedence over the legacy password, including when invalid', async () => {
  const f = fixture({ RSNODE_BETA_PASSWORDS: JSON.stringify(INVITATIONS) });
  assert.equal((await f.request('login', { body: { password: f.env.RSNODE_BETA_PASSWORD } })).status, 401);
  assert.equal((await f.request('login', { body: { password: INVITATIONS[0] } })).status, 200);
  f.env.RSNODE_BETA_PASSWORDS = '[]';
  assert.equal((await f.request('login', { body: { password: f.env.RSNODE_BETA_PASSWORD } })).status, 503);
  delete f.env.RSNODE_BETA_PASSWORDS;
  assert.equal((await f.request('login', { body: { password: f.env.RSNODE_BETA_PASSWORD } })).status, 200);
});

test('invitation lists reject malformed JSON, wrong types, controls, duplicates, invalid lengths, and shared session secrets', async () => {
  const secret = fixture().env.RSNODE_BETA_SESSION_SECRET;
  const invalid = [
    '', '{', null, 1, INVITATIONS, 'null', 'true', '42', '{}', JSON.stringify(INVITATIONS[0]),
    JSON.stringify([]), JSON.stringify([...INVITATIONS, 'beta-invite-0006']),
    JSON.stringify([INVITATIONS[0], INVITATIONS[0]]),
    ...[null, true, 123, {}, [], 'a'.repeat(15), 'a'.repeat(257), 'a'.repeat(16) + '\n',
      'a'.repeat(16) + '\u007f', 'a'.repeat(16) + '\u0085', secret].map(value => JSON.stringify([INVITATIONS[0], value]))
  ];
  for (const value of invalid) {
    const f = fixture({ RSNODE_BETA_PASSWORDS: value });
    const response = await f.request('session');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Private beta is not available yet.' });
    privateResponse(response);
    assert.equal(f.runtime.fetches.length, 0);
  }
  for (const password of [INVITATIONS[0], 'a'.repeat(256)]) {
    const f = fixture({ RSNODE_BETA_PASSWORDS: JSON.stringify([password]), RSNODE_BETA_PASSWORD: undefined });
    assert.equal((await f.request('login', { body: { password } })).status, 200);
  }
});

test('removing any invitation revokes all existing sessions while reordering preserves them', async () => {
  const f = fixture({ RSNODE_BETA_PASSWORDS: JSON.stringify(INVITATIONS) });
  const cookies = await Promise.all(INVITATIONS.map(password => f.ready(password)));
  f.env.RSNODE_BETA_PASSWORDS = JSON.stringify([...INVITATIONS].reverse(), null, 2);
  for (const cookie of cookies) assert.equal((await f.request('catalog', { cookie })).status, 200);
  f.env.RSNODE_BETA_PASSWORDS = JSON.stringify(INVITATIONS.slice(1));
  for (const cookie of cookies) assert.equal((await f.request('catalog', { cookie })).status, 401);
  assert.equal((await f.request('login', { body: { password: INVITATIONS[0] } })).status, 401);
  assert.equal((await f.request('catalog', { cookie: await f.ready(INVITATIONS[1]) })).status, 200);
});

test('invitation checks perform a cryptographic comparison for every configured password, without an early match exit', async () => {
  let comparisons = 0;
  const cryptoApi = {
    getRandomValues: values => webcrypto.getRandomValues(values),
    subtle: {
      importKey: (...args) => webcrypto.subtle.importKey(...args),
      sign: (...args) => webcrypto.subtle.sign(...args),
      verify: (...args) => { comparisons += 1; return webcrypto.subtle.verify(...args); }
    }
  };
  const f = fixture({ RSNODE_BETA_PASSWORDS: JSON.stringify(INVITATIONS) }, { cryptoApi });
  for (const password of [...INVITATIONS, 'not-an-invitation']) {
    comparisons = 0;
    const response = await f.request('login', { body: { password } });
    assert.equal(response.status, INVITATIONS.includes(password) ? 200 : 401);
    assert.equal(comparisons, INVITATIONS.length);
  }
});

test('OIDC downloads use the current request token only after password and terms acceptance', async () => {
  const f = oidcFixture();
  const headers = { 'x-vercel-oidc-token': OIDC_TOKEN };
  assert.equal((await f.request('download', { headers, query: '&board=heltec-v4' })).status, 401);
  assert.equal((await f.request('catalog', { headers })).status, 401);
  assert.equal((await f.request('download', { cookie: await f.login(), headers, query: '&board=heltec-v4' })).status, 403);
  assert.equal(f.runtime.fetches.length, 0);
  const cookie = await f.ready();
  for (const token of [OIDC_TOKEN, 'updatedHeader.updatedClaims.updatedSignature']) {
    const response = await f.request('download', { cookie, query: '&board=heltec-v4', headers: { 'x-vercel-oidc-token': token } });
    assert.equal(response.status, 200);
    privateResponse(response);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PAYLOAD);
    const [url, options] = f.runtime.fetches.at(-1);
    assert.equal(url, OIDC_BOARD.url);
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal.aborted, true, 'download cleanup aborts and clears its timeout');
  }
  assert.equal(f.runtime.fetches.length, 2);
});

test('OIDC mode fails closed without a valid current request token and never falls back to environment credentials', async () => {
  const f = oidcFixture({
    RSNODE_BETA_BLOB_TOKEN: 'dedicated-static-token-not-for-oidc-mode',
    BLOB_READ_WRITE_TOKEN: 'unrelated-project-store-token',
    VERCEL_OIDC_TOKEN: 'expiredBuildHeader.expiredBuildClaims.expiredBuildSignature'
  });
  const cookie = await f.ready();
  assert.equal((await f.request('catalog', { cookie })).status, 200);
  for (const token of [undefined, '', 'not-a-jwt', OIDC_TOKEN + ', ' + OIDC_TOKEN, 'a'.repeat(8193) + '.b.c']) {
    const headers = token === undefined ? {} : { 'x-vercel-oidc-token': token };
    const response = await f.request('download', { cookie, query: '&board=heltec-v4', headers });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Firmware could not be verified. Please try again later.' });
    privateResponse(response);
  }
  assert.equal(f.runtime.fetches.length, 0);
  const missingDedicatedAuth = fixture({ RSNODE_BETA_BLOB_TOKEN: undefined, BLOB_READ_WRITE_TOKEN: 'unrelated-project-store-token' });
  assert.equal((await missingDedicatedAuth.request()).status, 503);
});

test('the OIDC provider is awaited freshly for each authorized download, never for gate requests', async () => {
  let calls = 0;
  const tokens = [OIDC_TOKEN, 'nextHeader.nextClaims.nextSignature'];
  const f = oidcFixture({}, { getOidcToken: async () => {
    await Promise.resolve();
    return tokens[calls++];
  } });
  assert.equal((await f.request()).status, 200);
  assert.equal((await f.request('download', { query: '&board=heltec-v4' })).status, 401);
  const termsCookie = await f.login();
  assert.equal((await f.request('download', { cookie: termsCookie, query: '&board=heltec-v4' })).status, 403);
  const cookie = await f.ready();
  assert.equal((await f.request('catalog', { cookie })).status, 200);
  assert.equal((await f.request('download', { cookie, query: '&board=unknown' })).status, 404);
  assert.equal(calls, 0);
  for (const token of tokens) {
    const response = await f.request('download', {
      cookie, query: '&board=heltec-v4', headers: { 'x-vercel-oidc-token': 'untrustedHeader.untrustedClaims.untrustedSignature' }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PAYLOAD);
    assert.equal(f.runtime.fetches.at(-1)[1].headers.Authorization, 'Bearer ' + token);
  }
  assert.equal(calls, 2);
});

test('OIDC provider failure releases no firmware or provider diagnostics and makes no storage request', async () => {
  const detail = 'provider error containing credentials that must stay private';
  const f = oidcFixture({}, { getOidcToken: async () => { throw new Error(detail); } });
  const response = await f.request('download', { cookie: await f.ready(), query: '&board=heltec-v4' });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Firmware could not be verified. Please try again later.' });
  privateResponse(response);
  assert.equal(f.runtime.fetches.length, 0);
});

test('OIDC configuration binds every catalog asset to the exact dedicated private store', async () => {
  for (const storeId of [OIDC_STORE_ID, 'BetaStore123']) {
    assert.equal((await oidcFixture({ RSNODE_BETA_BLOB_STORE_ID: storeId }).request()).status, 200);
  }
  for (const storeId of ['', null, 123, 'store_', 'store_bad store', 'store_a/secret', 'store_' + 'a'.repeat(65)]) {
    const f = oidcFixture({ RSNODE_BETA_BLOB_STORE_ID: storeId });
    assert.equal((await f.request()).status, 503);
    assert.equal(f.runtime.fetches.length, 0);
  }
  for (const url of [BOARD.url, OIDC_BOARD.url.replace('betastore123.', 'otherstore.'), OIDC_BOARD.url.replace('.private.', '.public.')]) {
    const f = oidcFixture({ RSNODE_BETA_CATALOG: JSON.stringify({ boards: [{ ...OIDC_BOARD, url }] }) });
    assert.equal((await f.request()).status, 503);
    assert.equal(f.runtime.fetches.length, 0);
  }
});

test('OIDC retains bounded downloads, digest verification, and rejection of upstream authorization failures or redirects', async () => {
  const responses = [
    () => new Response('denied token details', { status: 403 }),
    () => new Response(PAYLOAD, { status: 302, headers: { location: 'https://otherstore.private.blob.vercel-storage.com/file.zip' } }),
    () => new Response(new Uint8Array(PAYLOAD.length)),
    () => new Response(new Uint8Array(PAYLOAD.length + 1))
  ];
  for (const fetchResponse of responses) {
    const f = oidcFixture();
    f.runtime.fetchResponse = fetchResponse;
    const response = await f.request('download', {
      cookie: await f.ready(), query: '&board=heltec-v4', headers: { 'x-vercel-oidc-token': OIDC_TOKEN }
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Firmware could not be verified. Please try again later.' });
    privateResponse(response);
    assert.equal(f.runtime.fetches.length, 1);
    assert.equal(f.runtime.fetches[0][1].redirect, 'error');
  }
});

test('dedicated static-token mode ignores incoming OIDC headers', async () => {
  const f = fixture();
  const response = await f.request('download', {
    cookie: await f.ready(), query: '&board=heltec-v4', headers: { 'x-vercel-oidc-token': OIDC_TOKEN }
  });
  assert.equal(response.status, 200);
  assert.equal(f.runtime.fetches[0][1].headers.Authorization, 'Bearer ' + f.env.RSNODE_BETA_BLOB_TOKEN);
});

test('wrong passwords and malformed bodies never issue a cookie', async () => {
  const f = fixture();
  for (const body of [{ password: 'wrong' }, { password: null }, { password: 42 }, { password: ['wrong'] }, {}, { password: 'x'.repeat(257) }, { password: f.env.RSNODE_BETA_PASSWORD + '\n' }]) {
    const response = await f.request('login', { body });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
    privateResponse(response);
  }
  for (const body of ['{', 'null', '[]', '"password"', ' ', '{"password":"' + 'x'.repeat(5000) + '"}']) {
    const response = await f.request('login', { body });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await f.request('login', { body: {}, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('login', { body: {}, headers: { 'content-length': '4097' } })).status, 413);
  assert.equal((await f.request('login', { body: {}, headers: { 'content-length': 'bad' } })).status, 413);
});

test('all four exact booleans and the current terms version are required', async () => {
  const f = fixture();
  const cookie = await f.login();
  assert.equal((await f.request('accept', { body: { termsVersion: TERMS_VERSION, confirmations: CONFIRMATIONS } })).status, 401);
  for (const field of Object.keys(CONFIRMATIONS)) {
    for (const value of [false, undefined, 'true', 1, null]) {
      const response = await f.request('accept', { cookie, body: { termsVersion: TERMS_VERSION, confirmations: { ...CONFIRMATIONS, [field]: value } } });
      assert.equal(response.status, 400, `${field}=${value}`);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  }
  for (const body of [{}, { termsVersion: 'old', confirmations: CONFIRMATIONS }, { termsVersion: TERMS_VERSION, confirmations: null }]) {
    assert.equal((await f.request('accept', { cookie, body })).status, 400);
  }
  assert.equal((await f.request('catalog', { cookie })).status, 403);
});

test('acceptance keeps original expiry; expired sessions return 401 during download', async () => {
  const f = fixture();
  const cookie = await f.login();
  f.runtime.now += 3600_000;
  const response = await f.request('accept', { cookie, body: { termsVersion: TERMS_VERSION, confirmations: CONFIRMATIONS } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=25200/);
  const ready = response.headers.get('set-cookie').split(';')[0];
  f.runtime.now += (SESSION_SECONDS - 3600) * 1000;
  const expired = await f.request('download', { cookie: ready, query: '&board=heltec-v4' });
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).stage, 'locked');
  assert.equal((await (await f.request('session', { cookie: ready })).json()).stage, 'locked');
  assert.equal(f.runtime.fetches.length, 0);
});

test('altered, malformed, and ambiguous cookies cannot bypass access checks', async () => {
  const f = fixture();
  const cookie = await f.login();
  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...decoded, stage: 'ready', termsVersion: TERMS_VERSION })).toString('base64url');
  const badCookies = [
    `${COOKIE_NAME}=${forged}.${signature}`,
    `${COOKIE_NAME}=${payload}.${signature.slice(0, -1)}X`,
    `${COOKIE_NAME}=${payload}.AA`, `${COOKIE_NAME}=bad`, `${COOKIE_NAME}=...`,
    `${COOKIE_NAME}=${'a'.repeat(3000)}`, `${COOKIE_NAME}=%%%.${signature}`,
    `${cookie}; ${cookie}`, `rsnode_beta=${token}`, `${COOKIE_NAME}=${payload}.${signature}=`
  ];
  for (const bad of badCookies) {
    assert.equal((await f.request('catalog', { cookie: bad })).status, 401);
    assert.equal((await (await f.request('session', { cookie: bad })).json()).stage, 'locked');
  }
  assert.equal(f.runtime.fetches.length, 0);
});

test('rotating the invite password or session secret invalidates existing sessions', async () => {
  for (const field of ['RSNODE_BETA_PASSWORD', 'RSNODE_BETA_SESSION_SECRET']) {
    const f = fixture();
    const cookie = await f.ready();
    f.env[field] += '-rotated';
    assert.equal((await f.request('catalog', { cookie })).status, 401);
    assert.equal((await f.request('catalog', { cookie: await f.ready() })).status, 200);
  }
});

test('sessions cannot be replayed on another preview or production origin', async () => {
  const f = fixture();
  const cookie = await f.ready();
  assert.equal((await f.request('catalog', { cookie, origin: 'https://preview.vercel.app' })).status, 401);
  f.runtime.now -= 1000;
  assert.equal((await f.request('catalog', { cookie })).status, 401, 'future-issued token');
});

test('logout clears cookie even when deployment configuration is absent', async () => {
  const f = fixture({ RSNODE_BETA_PASSWORD: undefined });
  const response = await f.request('logout');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stage, 'locked');
  assert.match(response.headers.get('set-cookie'), /Max-Age=0; HttpOnly; Secure; SameSite=Strict/);
  privateResponse(response);
});

test('mutations require exact same Origin; cross-site and same-site sibling requests are denied', async () => {
  const f = fixture();
  const cookie = await f.ready();
  for (const action of ['login', 'accept', 'logout']) {
    for (const origin of ['https://evil.example', 'https://sub.ratspeak.org', 'null', 'http://ratspeak.org']) {
      const response = await f.request(action, { cookie, headers: { origin }, body: { password: f.env.RSNODE_BETA_PASSWORD } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('set-cookie'), null);
      privateResponse(response);
    }
    assert.equal((await f.request(action, { omitOrigin: true, body: {} })).status, 403);
  }
  for (const site of ['cross-site', 'same-site']) {
    assert.equal((await f.request('catalog', { cookie, headers: { 'sec-fetch-site': site } })).status, 403);
  }
  assert.equal((await f.request('catalog', { cookie, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('catalog', { cookie, headers: { 'sec-fetch-site': 'same-origin' } })).status, 200);
});

test('actions enforce method, recognized query keys, and one value per key', async () => {
  const f = fixture();
  for (const action of ['login', 'accept', 'logout']) assert.equal((await f.request(action, { method: 'GET' })).status, 405);
  for (const action of ['session', 'catalog', 'download']) assert.equal((await f.request(action, { method: 'POST' })).status, 405);
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) assert.equal((await f.request('session', { method })).status, 405);
  assert.equal((await f.request('unknown')).status, 400);
  assert.equal((await f.request('session', { query: '&action=catalog' })).status, 400);
  assert.equal((await f.request('download', { query: '&board=heltec-v4&board=heltec-v3' })).status, 400);
  assert.equal((await f.request('download', { query: '&url=https://evil.example/file' })).status, 400);
});

test('missing, weak, or incomplete configuration fails closed and hides configuration details', async () => {
  const cases = [
    ...['RSNODE_BETA_PASSWORD', 'RSNODE_BETA_SESSION_SECRET', 'RSNODE_BETA_BLOB_TOKEN', 'RSNODE_BETA_CATALOG'].map(key => ({ [key]: undefined })),
    { RSNODE_BETA_PASSWORD: 'short' }, { RSNODE_BETA_SESSION_SECRET: 'short' },
    { RSNODE_BETA_PASSWORD: 'x'.repeat(257) }, { RSNODE_BETA_SESSION_SECRET: 'x'.repeat(513) },
    { RSNODE_BETA_PASSWORD: 'same-value-used-for-both-secrets-123', RSNODE_BETA_SESSION_SECRET: 'same-value-used-for-both-secrets-123' },
    { RSNODE_BETA_BLOB_TOKEN: 'unsafe\r\nvalue' }, { RSNODE_BETA_CATALOG: '{' },
    { RSNODE_BETA_CATALOG: JSON.stringify({ boards: [] }) }, { RSNODE_BETA_CATALOG: '[]' }
  ];
  for (const config of cases) {
    const f = fixture(config);
    const response = await f.request('session');
    assert.equal(response.status, 503, Object.keys(config).join(','));
    assert.deepEqual(await response.json(), { error: 'Private beta is not available yet.' });
    privateResponse(response);
    assert.equal(f.runtime.fetches.length, 0);
  }
});

test('catalog accepts all three beta boards and formatted JSON without leaking Blob URLs', async () => {
  const boards = ['heltec-v3', 'heltec-v4', 'heltec-v4-r8'].map(id => ({ ...BOARD, id }));
  const f = fixture({ RSNODE_BETA_CATALOG: JSON.stringify({ boards }, null, 2) });
  const response = await f.request('catalog', { cookie: await f.ready() });
  assert.equal(response.status, 200);
  const serialized = await response.text();
  assert.equal(serialized.includes('blob.vercel-storage.com'), false);
  assert.equal(serialized.includes('url'), false);
  const catalog = JSON.parse(serialized);
  assert.deepEqual(catalog.boards.map(b => b.flashSize), ['8MB', '16MB', '16MB']);
});

test('invalid assets, unknown boards, duplicate targets, and unsafe metadata disable the catalog', async () => {
  const badEntries = [
    { id: 'heltec-t114' }, { id: '__proto__' }, { id: 'constructor' }, { version: '' },
    { fileName: '../secret.zip' }, { fileName: 'bad\r\nheader.zip' }, { fileName: 'script.html' }, { fileName: 'firmware.bin' },
    { sha256: '' }, { sha256: 'a'.repeat(63) }, { sha256: 'A'.repeat(64) },
    { size: 0 }, { size: -1 }, { size: 1.5 }, { size: MAX_ASSET_BYTES + 1 },
    { flashSize: '8MB' }, { chipFamily: 'ESP32' }, { board: 'heltec-v3' }, { description: 'x'.repeat(241) }
  ];
  for (const bad of badEntries) {
    const f = fixture({ RSNODE_BETA_CATALOG: JSON.stringify({ boards: [{ ...BOARD, ...bad }] }) });
    assert.equal((await f.request()).status, 503, JSON.stringify(bad));
  }
  for (const boards of [[BOARD, BOARD], [BOARD, BOARD, BOARD, BOARD], [null]]) {
    assert.equal((await fixture({ RSNODE_BETA_CATALOG: JSON.stringify({ boards }) }).request()).status, 503);
  }
});

test('only a private HTTPS Blob host and immutable path can receive the server token', async () => {
  const urls = [
    'https://example.com/file.zip', 'https://a.public.blob.vercel-storage.com/file.zip',
    'http://a.private.blob.vercel-storage.com/file.zip',
    'https://a.private.blob.vercel-storage.com.evil.example/file.zip',
    'https://a.private.blob.vercel-storage.com@evil.example/file.zip',
    'https://user:pass@a.private.blob.vercel-storage.com/file.zip',
    'https://a.private.blob.vercel-storage.com:444/file.zip',
    'https://a.private.blob.vercel-storage.com/file.zip?download=1',
    'https://a.private.blob.vercel-storage.com/file.zip#fragment',
    'https://a.private.blob.vercel-storage.com/', 'file:///etc/passwd', 'http://127.0.0.1/file.zip'
  ];
  for (const url of urls) {
    const f = fixture({ RSNODE_BETA_CATALOG: JSON.stringify({ boards: [{ ...BOARD, url }] }) });
    assert.equal((await f.request()).status, 503, url);
    assert.equal(f.runtime.fetches.length, 0);
  }
});

test('download rejects unknown targets and ignores no user-supplied source URL', async () => {
  const f = fixture();
  const cookie = await f.ready();
  for (const board of ['', 'heltec-v3', '../../secret', 'constructor', BOARD.url]) {
    assert.equal((await f.request('download', { cookie, query: '&board=' + encodeURIComponent(board) })).status, 404);
  }
  assert.equal((await f.request('download', { cookie, query: '&board=heltec-v4&url=https://evil.example' })).status, 400);
  assert.equal(f.runtime.fetches.length, 0);
});

test('upstream failures, redirects, partial responses, wrong sizes, and hashes release no firmware', async () => {
  const factories = [
    () => new Response(PAYLOAD, { status: 302, headers: { location: 'https://evil.example' } }),
    () => new Response(PAYLOAD, { status: 206 }), () => new Response('secret upstream error', { status: 403 }),
    () => new Response(PAYLOAD, { headers: { 'content-range': 'bytes 0-10/100' } }),
    () => new Response(PAYLOAD, { headers: { 'content-length': '1' } }),
    () => new Response(PAYLOAD, { headers: { 'content-length': 'not a number' } }),
    () => new Response(PAYLOAD.slice(1)), () => new Response(new Uint8Array(PAYLOAD.length + 1)),
    () => new Response(new Uint8Array(PAYLOAD.length)),
    () => { throw new Error('private token or URL must not be reflected'); },
    () => { const r = new Response(PAYLOAD); Object.defineProperty(r, 'redirected', { value: true }); return r; },
    () => { const r = new Response(PAYLOAD); Object.defineProperty(r, 'url', { value: 'https://evil.example/file' }); return r; }
  ];
  for (const factory of factories) {
    const f = fixture();
    const cookie = await f.ready();
    f.runtime.fetchResponse = factory;
    const response = await f.request('download', { cookie, query: '&board=heltec-v4' });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Firmware could not be verified. Please try again later.' });
    privateResponse(response);
  }
});

test('streamed assets are bounded even without Content-Length, and cancelled on excess', async () => {
  const f = fixture();
  let cancelled = false;
  f.runtime.fetchResponse = () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(PAYLOAD.length + 1)); },
    cancel() { cancelled = true; }
  }));
  assert.equal((await f.request('download', { cookie: await f.ready(), query: '&board=heltec-v4' })).status, 502);
  assert.equal(cancelled, true);
});

test('login rate limiting blocks even correct passwords with a private retry response', async () => {
  const f = fixture();
  f.runtime.rate = { allowed: false, retryAfter: 900 };
  const response = await f.request('login', { body: { password: f.env.RSNODE_BETA_PASSWORD } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '900');
  assert.equal(response.headers.get('set-cookie'), null);
  privateResponse(response);
});

test('neither successful nor failed JSON responses reflect passwords, secrets, tokens, or Blob URLs', async () => {
  const f = fixture();
  const cookie = await f.ready();
  for (const action of ['session', 'catalog', 'unknown']) {
    const response = await f.request(action, { cookie });
    const text = await response.text();
    for (const secret of [f.env.RSNODE_BETA_PASSWORD, f.env.RSNODE_BETA_SESSION_SECRET, f.env.RSNODE_BETA_BLOB_TOKEN, BOARD.url]) {
      assert.equal(text.includes(secret), false);
    }
  }
});

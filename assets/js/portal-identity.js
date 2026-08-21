// Identity tab controller: register a wallet against an LXMF address via the
// mesh verification flow (design: the "Ratspeak holder portal" canvas).
// Talks to /api/identity; wallet state comes from portal-wallet.js.
import {
  CODE_LENGTH,
  CODE_TTL_MS,
  DELIVERY_STATUSES,
  REGISTRY_DOMAIN,
  REGISTRATION_TYPES,
  UNLINK_TYPES,
  canEnterCode,
  canResend,
  canonicalRegistrationMessage,
  canonicalUnlinkMessage,
  isCodeExpired,
  isCodeShaped,
  isDeliveryComplete,
  normalizeCode,
  normalizeLxmfAddress,
  serializableMessage
} from '../../lib/identity-core.js?v=portal-1';
import { connectWallet, currentAccount, onAccountChange, signTypedData } from './portal-wallet.js?v=portal-1';
import { badgeName, badgeTile } from './portal-badge.js?v=portal-1';

const API_URL = '/api/identity';
// The deployed bridge's lxmf.delivery destination — the only sender codes come from.
const PORTAL_SENDER_HASH = 'e2c06d8e7aab1cab71a43ab844717681';
const VID_STORE_KEY = 'ratspeak-portal-verification';
const REG_STORE_KEY = 'ratspeak-portal-registered';
const POLL_MS = 2500;

let els = null;
let toast = message => console.log(message);
let onChipChange = () => {};
let status = { registration: null, pending: null, badge: 'none' };
let verificationId = '';
let verifyProof = null;
let knownAddress = '';
let busy = false;
let errorNote = '';
let pollTimer = null;
let countdownTimer = null;
let lastAddressInput = '';
let codeInput = '';

export function initIdentityTab(options) {
  els = options.els;
  toast = options.toast || toast;
  onChipChange = options.onChipChange || onChipChange;

  onAccountChange(account => {
    errorNote = '';
    if (!account) {
      status = { registration: null, pending: null, badge: 'none' };
      verificationId = '';
      verifyProof = null;
      render();
      return;
    }
    verificationId = restoreVerificationId(account);
    refreshStatus({ force: true }).catch(reportError);
  });

  els.main.addEventListener('click', onClick);
  els.main.addEventListener('submit', event => event.preventDefault());
  els.main.addEventListener('input', onInput);
  els.main.addEventListener('keydown', onCodeKeydown);
  els.main.addEventListener('paste', onCodePaste);
  render();
}

// ------------------------------------------------------------- data ---------
async function api(body) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

async function refreshStatus(options = {}) {
  const account = currentAccount();
  if (!account) return;
  const resp = await fetch(`${API_URL}?wallet=${encodeURIComponent(account)}`, { cache: 'no-store' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Registry unavailable');
  if (currentAccount() !== account) return;
  const next = { registration: data.registration || null, pending: data.pending || null, badge: data.badge || 'none' };
  if (next.pending?.status === 'registered') next.pending = null;
  // A verified code is known locally from the verify response; never let a
  // stale-cached poll regress it to an earlier delivery status.
  if (status.pending?.status === 'code_verified' && next.pending && DELIVERY_STATUSES.includes(next.pending.status)) {
    next.pending = { ...next.pending, status: 'code_verified' };
  }
  const changed = JSON.stringify(next) !== JSON.stringify(status);
  status = next;
  // Re-render only on real change (or when forced) — a blind re-render every
  // poll wipes in-progress typing in the code boxes.
  if (changed || options.force) render();
  schedulePolling();
}

function schedulePolling() {
  const active = status.pending && !['registered'].includes(status.pending.status);
  if (active && !pollTimer) {
    pollTimer = window.setInterval(() => refreshStatus().catch(() => {}), POLL_MS);
  } else if (!active && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function storeVerificationId(account, vid, lxmfAddress) {
  try {
    localStorage.setItem(VID_STORE_KEY, JSON.stringify({ wallet: account, verificationId: vid, lxmfAddress, proof: verifyProof }));
  } catch (e) {}
}

function restoreVerificationId(account) {
  try {
    const parsed = JSON.parse(localStorage.getItem(VID_STORE_KEY));
    if (!parsed || parsed.wallet !== account) return '';
    knownAddress = String(parsed.lxmfAddress || '');
    verifyProof = parsed.proof || null;
    return String(parsed.verificationId || '');
  } catch (e) {
    return '';
  }
}

// The server masks addresses in every response; the full value only exists
// where the user typed it. Persist it per wallet so displays/copy survive
// reloads without the server ever revealing it.
function storeRegisteredAddress(account, lxmfAddress) {
  try {
    localStorage.setItem(REG_STORE_KEY, JSON.stringify({ wallet: account, lxmfAddress }));
  } catch (e) {}
}

function registeredAddressFor(account) {
  try {
    const parsed = JSON.parse(localStorage.getItem(REG_STORE_KEY));
    return parsed && parsed.wallet === account ? String(parsed.lxmfAddress || '') : '';
  } catch (e) {
    return '';
  }
}

// ------------------------------------------------------------- actions ------
async function startVerification() {
  const account = currentAccount();
  const lxmfAddress = normalizeLxmfAddress(els.main.querySelector('#idAddressInput')?.value);
  if (!lxmfAddress) {
    errorNote = 'That doesn’t look like an LXMF address — expected 32 hex characters.';
    return render();
  }
  await withBusy(async () => {
    const data = await api({ action: 'start', wallet: account, lxmfAddress });
    // Idempotent starts return the live pending without re-revealing its id;
    // fall back to the stored one so a restarted flow keeps its credentials.
    verificationId = data.verificationId || verificationId || restoreVerificationId(account);
    knownAddress = lxmfAddress;
    if (data.verificationId) verifyProof = null;
    if (verificationId) storeVerificationId(account, verificationId, lxmfAddress);
    status.pending = data.pending;
    toast(data.verificationId
      ? 'Verification code queued for the mesh.'
      : 'You already have an active code — enter it below, or resend.');
  });
}

async function verifyCode() {
  const account = currentAccount();
  const code = normalizeCode(readCodeBoxes());
  if (!isCodeShaped(code)) {
    errorNote = `Codes are ${CODE_LENGTH} letters and numbers.`;
    return render();
  }
  await withBusy(async () => {
    const data = await api({ action: 'verify', wallet: account, verificationId, code });
    status.pending = data.pending;
    verifyProof = data.proof || null;
    storeVerificationId(account, verificationId, knownAddress);
    codeInput = '';
    toast('Code verified — one signature to go.');
  });
}

async function signAndRegister() {
  const account = currentAccount();
  await withBusy(async () => {
    const fullAddress = knownAddress;
    if (!fullAddress) throw new Error('This browser no longer has the address on file — start over.');
    const message = canonicalRegistrationMessage({
      wallet: account,
      lxmfAddress: fullAddress,
      verificationId,
      issuedAt: Date.now()
    });
    const signature = await signTypedData({
      domain: REGISTRY_DOMAIN,
      types: REGISTRATION_TYPES,
      primaryType: 'Registration',
      message
    });
    const data = await api({ action: 'register', message: serializableMessage(message), signature, proof: verifyProof });
    status.registration = data.registration;
    status.pending = null;
    verificationId = '';
    verifyProof = null;
    storeRegisteredAddress(account, fullAddress);
    toast('Registered!');
  });
}

async function resend() {
  const account = currentAccount();
  await withBusy(async () => {
    const data = await api({ action: 'resend', wallet: account, verificationId });
    status.pending = data.pending;
    codeInput = '';
    toast('New code queued.');
  });
}

async function cancel() {
  const account = currentAccount();
  await withBusy(async () => {
    await api({ action: 'cancel', wallet: account });
    status.pending = null;
    verificationId = '';
    verifyProof = null;
    try { localStorage.removeItem(VID_STORE_KEY); } catch (e) {}
    toast('Verification cancelled.');
  });
}

async function unlink() {
  const account = currentAccount();
  if (!window.confirm('Unlink this identity? Holder messages stop; you can register again any time.')) return;
  await withBusy(async () => {
    const message = canonicalUnlinkMessage({
      wallet: account,
      nonce: randomHex(16),
      issuedAt: Date.now()
    });
    const signature = await signTypedData({
      domain: REGISTRY_DOMAIN,
      types: UNLINK_TYPES,
      primaryType: 'Unlink',
      message
    });
    await api({ action: 'unlink', message: serializableMessage(message), signature });
    status.registration = null;
    toast('Identity unlinked.');
  });
}

async function withBusy(work) {
  if (busy) return;
  busy = true;
  errorNote = '';
  render();
  try {
    await work();
  } catch (err) {
    console.warn(err);
    errorNote = err && err.message ? err.message : 'Something went wrong.';
  } finally {
    busy = false;
    render();
    refreshStatus().catch(() => {});
  }
}

function reportError(err) {
  console.warn(err);
  errorNote = err && err.message ? err.message : 'Registry unavailable.';
  render();
}

// ------------------------------------------------------------- events -------
function onClick(event) {
  const action = event.target.closest('[data-id-action]')?.dataset.idAction;
  if (!action || busy) return;
  if (action === 'connect') connectWallet().catch(err => { console.warn(err); toast('Wallet connection failed.'); });
  if (action === 'start') startVerification();
  if (action === 'verify') verifyCode();
  if (action === 'sign') signAndRegister();
  if (action === 'resend') resend();
  if (action === 'cancel') cancel();
  if (action === 'restart') { status.pending = null; verificationId = ''; errorNote = ''; render(); }
  if (action === 'unlink') unlink();
  if (action === 'copy-address' && status.registration) {
    navigator.clipboard?.writeText(registeredAddressFor(currentAccount()) || status.registration.lxmfAddress)
      .then(() => toast('LXMF address copied.'))
      .catch(() => toast('Copy failed.'));
  }
}

function onInput(event) {
  if (!event.target.matches('[data-code-box]')) return;
  const boxes = [...els.main.querySelectorAll('[data-code-box]')];
  const box = event.target;
  box.value = normalizeCode(box.value).slice(-1);
  codeInput = readCodeBoxes();
  if (box.value) boxes[boxes.indexOf(box) + 1]?.focus();
}

function onCodeKeydown(event) {
  if (!event.target.matches('[data-code-box]')) return;
  if (event.key !== 'Backspace' || event.target.value) return;
  const boxes = [...els.main.querySelectorAll('[data-code-box]')];
  const prev = boxes[boxes.indexOf(event.target) - 1];
  if (prev) {
    event.preventDefault();
    prev.value = '';
    prev.focus();
    codeInput = readCodeBoxes();
  }
}

function onCodePaste(event) {
  if (!event.target.matches('[data-code-box]')) return;
  event.preventDefault();
  const pasted = normalizeCode(event.clipboardData?.getData('text')).slice(0, CODE_LENGTH);
  if (!pasted) return;
  const boxes = [...els.main.querySelectorAll('[data-code-box]')];
  boxes.forEach((box, index) => { box.value = pasted[index] || ''; });
  codeInput = pasted;
  boxes[Math.min(pasted.length, boxes.length - 1)]?.focus();
}

function readCodeBoxes() {
  return [...els.main.querySelectorAll('[data-code-box]')].map(box => box.value || '').join('');
}

// ------------------------------------------------------------- render -------
function render() {
  const account = currentAccount();
  const view = currentView(account);
  els.main.innerHTML = VIEWS[view](account);
  renderStepper(view);
  renderWalletPanel(account);
  onChipChange(chipFor(view));
  if (view === 'code' && isDeliveryComplete(status.pending?.status)) startCountdown();
  else stopCountdown();
}

function stopCountdown() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function startCountdown() {
  stopCountdown();
  const tick = () => {
    const span = els.main.querySelector('#idCodeCountdown');
    if (!span || !status.pending) return stopCountdown();
    const left = Date.parse(String(status.pending.codeIssuedAt || '')) + CODE_TTL_MS - Date.now();
    if (!Number.isFinite(left) || left <= 0) {
      stopCountdown();
      render();
      return;
    }
    const minutes = Math.floor(left / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    span.textContent = `Code expires in ${minutes}:${String(seconds).padStart(2, '0')}.`;
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

function currentView(account) {
  if (!account) return 'welcome';
  if (status.registration) return 'done';
  const pending = status.pending;
  if (!pending) return 'enter';
  if (isCodeExpired(pending)) return 'expired';
  if (pending.status === 'code_verified') return 'sign';
  if (pending.status === 'unreachable') return 'unreachable';
  return 'code';
}

function chipFor(view) {
  if (view === 'done') return { text: 'Verified', tone: 'good' };
  if (view === 'welcome' || view === 'enter') return { text: 'Not registered', tone: '' };
  return { text: 'In progress', tone: 'warn' };
}

const STEP_STATES = {
  welcome: ['active', 'todo', 'todo', 'todo'],
  enter: ['done', 'active', 'todo', 'todo'],
  code: ['done', 'done', 'active', 'todo'],
  unreachable: ['done', 'done', 'active', 'todo'],
  expired: ['done', 'done', 'active', 'todo'],
  sign: ['done', 'done', 'done', 'active'],
  done: ['done', 'done', 'done', 'done']
};

function renderStepper(view) {
  const states = STEP_STATES[view] || STEP_STATES.welcome;
  els.steps.forEach((step, index) => {
    const state = states[index];
    step.row.classList.toggle('todo', state === 'todo');
    step.dot.classList.toggle('active', state === 'active');
    step.dot.classList.toggle('done', state === 'done');
    step.dot.innerHTML = state === 'done' ? icon('check', 13) : String(index + 1);
  });
}

function renderWalletPanel(account) {
  if (!els.walletPanel) return;
  els.walletPanel.hidden = !account;
  if (account && els.walletAddress) {
    els.walletAddress.textContent = account;
  }
  if (els.walletBadge) {
    els.walletBadge.textContent = status.badge === 'none' ? 'No badge' : `${badgeName(status.badge)} Tier`;
  }
}

const VIEWS = {
  welcome: () => flowCard({
    tags: [tag('Step 1 of 4', 'accent')],
    title: 'Pair your wallet',
    desc: 'Pair your wallet to a Ratspeak identity for future perks or services. See our docs for more information and best privacy practices.',
    body: `
      <div class="id-steps-preview">
        ${previewStep(2, 'Your address', 'Paste the LXMF address from the Ratspeak app.')}
        ${previewStep(3, 'Verify code', 'Receive a one-time code over Ratspeak')}
        ${previewStep(4, 'Sign onchain', 'Sign the pairing onchain, gas-free.')}
      </div>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-id-action="connect">${icon('wallet')}Connect wallet</button>
      </div>
      ${errorBanner()}`
  }),

  enter: () => flowCard({
    tags: [tag('Step 2 of 4', 'accent')],
    title: 'Pair wallet to Ratspeak',
    desc: 'Enter the Ratspeak address you want associated with your Base wallet. <strong style="color: var(--text-primary); font-weight: 600">You must be able to reach our verification node, which can be done by connecting to an official TCP server in the Ratspeak app.</strong>',
    body: `
      <label class="id-field-label" for="idAddressInput">Your LXMF address</label>
      <div class="id-hash-input">
        ${icon('hash')}
        <input id="idAddressInput" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="64" placeholder="32 hex characters" value="${escapeHtml(lastAddressInput)}">
      </div>
      <p class="id-field-help">In the app: <strong>Ratspeak &rarr; Identity &rarr; Copy LXMF address</strong>.</p>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-id-action="start" ${busyAttr()}>${icon('send')}Send code</button>
      </div>
      <div class="id-banner">${icon('shield')}<div>Only trust a code received from <span class="id-mono">${escapeHtml(PORTAL_SENDER_HASH)}</span>.</div></div>
      ${errorBanner()}`
  }),

  code: () => {
    const pending = status.pending;
    const deliveredish = pending.status === 'delivered' || pending.status === 'propagated';
    return flowCard({
      tags: [tag('Step 3 of 4', 'accent')],
      title: 'Check your Ratspeak inbox',
      desc: `We’re sending a one-time code to <span class="id-mono">${escapeHtml(pending.lxmfAddress)}</span>. Mesh delivery can take a moment.`,
      body: `
        <label class="id-field-label">Delivery</label>
        ${deliveryTimeline(pending)}
        <div class="id-divider"></div>
        <label class="id-field-label">Verification code</label>
        <div class="id-code-boxes">${codeBoxes()}</div>
        <div class="id-btn-row">
          <button class="primary-btn" type="button" data-id-action="verify" ${canEnterCode(pending.status) && !busy ? '' : 'disabled'}>${icon('check')}Verify code</button>
          <button class="secondary-btn" type="button" data-id-action="resend" ${canResend(pending) && !busy ? '' : 'disabled'}>${icon('refresh')}Resend</button>
          <button class="secondary-btn" type="button" data-id-action="cancel" ${busyAttr()}>Cancel</button>
        </div>
        <p class="id-btn-note"><span id="idCodeCountdown"></span>${pending.status === 'propagated' ? ' Your device looked offline — open Ratspeak and sync your Offline Inbox.' : ''}</p>
        ${errorBanner()}`
    });
  },

  unreachable: () => flowCard({
    tags: [tag('Step 3 of 4', 'accent')],
    title: 'We couldn’t reach your identity',
    desc: `${escapeHtml(status.pending.lxmfAddress)} didn’t answer on the mesh.`,
    body: `
      <div class="id-banner warn">${icon('alert')}<div><strong>Still unreachable.</strong> Open Ratspeak, make sure you’re connected (the Ratspeak server interface works well for this), tap Announce, then resend the code.</div></div>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-id-action="resend" ${canResend(status.pending) && !busy ? '' : 'disabled'}>${icon('refresh')}Resend code</button>
        <button class="secondary-btn" type="button" data-id-action="cancel" ${busyAttr()}>Start over</button>
      </div>
      ${errorBanner()}`
  }),

  expired: () => flowCard({
    tags: [tag('Step 3 of 4', 'accent')],
    title: 'That code has expired',
    desc: 'Codes are valid for 15 minutes.',
    body: `
      <div class="id-banner error">${icon('x')}<div><strong>Expired.</strong> Start over to get a fresh one &mdash; the address stays filled in.</div></div>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-id-action="restart" ${busyAttr()}>${icon('refresh')}Start over</button>
      </div>
      ${errorBanner()}`
  }),

  sign: () => flowCard({
    tags: [tag('Step 4 of 4', 'accent')],
    title: 'Confirm with your wallet',
    desc: 'Bind your wallet to Ratspeak. This can be changed or removed any time, and is stored by the portal privately.',
    body: `
      <label class="id-field-label">You are signing</label>
      <div class="id-kv-card">
        <div class="id-kv-row"><span class="id-kv-key">Wallet</span><span class="id-kv-val">${escapeHtml(currentAccount() || '')}</span></div>
        <div class="id-kv-row"><span class="id-kv-key">LXMF address</span><span class="id-kv-val">${escapeHtml(knownAddress || status.pending.lxmfAddress)}</span></div>
        <div class="id-kv-row"><span class="id-kv-key">Code</span><span class="id-kv-val good">${icon('check', 14)}Verified</span></div>
      </div>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-id-action="sign" ${busyAttr()}>${icon('pen')}${busy ? 'Waiting for signature…' : 'Sign &amp; register'}</button>
        <button class="secondary-btn" type="button" data-id-action="cancel" ${busyAttr()}>Cancel</button>
      </div>
      ${errorBanner()}`
  }),

  done: () => {
    const reg = status.registration;
    const fullAddress = registeredAddressFor(currentAccount());
    return flowCard({
      headClass: 'id-flow-head-good',
      tags: [tag('Registered', 'live')],
      title: 'Registered!',
      desc: 'Your wallet address is now paired with your Ratspeak identity.',
      body: `
        <div class="id-reg-card">
          ${status.badge !== 'none' ? badgeTile(status.badge) : ''}
          <div class="id-reg-main">
            <div class="id-mono id-reg-address">${escapeHtml(fullAddress || reg.lxmfAddress)}</div>
            <div class="id-reg-sub">${status.badge !== 'none' ? `${badgeName(status.badge)} holder &middot; ` : ''}Paired with ${escapeHtml(shortWallet(reg.wallet))} &middot; verified ${escapeHtml(formatDate(reg.registeredAt))}</div>
          </div>
          <span class="tag tag-live">Verified</span>
        </div>
        <div class="id-btn-row">
          ${fullAddress ? `<button class="secondary-btn" type="button" data-id-action="copy-address">${icon('copy')}Copy address</button>` : ''}
          <button class="danger-btn" type="button" data-id-action="unlink" ${busyAttr()}>${icon('unlink')}Unlink identity</button>
        </div>
        <p class="id-field-help">This registry is private and not published, however, you should never use a wallet and identity you wouldn&rsquo;t want to be publicly associated.</p>
        ${errorBanner()}`
    });
  }
};

function deliveryTimeline(pending) {
  const stages = [
    { key: 'queued', label: 'Queued' },
    { key: 'resolving', label: 'Finding your device' },
    { key: 'sending', label: 'Sending over the mesh' },
    {
      key: 'arrived',
      label: pending.status === 'propagated' ? 'In your Offline Inbox' : 'Delivered',
      sub: pending.status === 'propagated' ? 'Open Ratspeak and sync to receive it.' : ''
    }
  ];
  const order = ['queued', 'resolving', 'sending', 'delivered', 'propagated'];
  const position = Math.max(0, order.indexOf(pending.status));
  const arrivedIndex = 3;
  const currentIndex = pending.status === 'delivered' || pending.status === 'propagated' ? arrivedIndex : Math.min(position, 2);
  return `<div class="id-timeline">${stages.map((stage, index) => {
    const done = index < currentIndex || (index === arrivedIndex && currentIndex === arrivedIndex);
    const wait = index === currentIndex && currentIndex < arrivedIndex;
    const dot = done ? `<span class="id-tl-dot done">${icon('check', 12)}</span>`
      : wait ? `<span class="id-tl-dot wait">${icon('clock', 12)}</span>`
      : '<span class="id-tl-dot"></span>';
    const line = index < stages.length - 1 ? `<span class="id-tl-line${done ? ' done' : ''}"></span>` : '';
    return `<div class="id-tl-row" style="--tl-i:${index}"><div class="id-tl-rail">${dot}${line}</div><div><div class="id-tl-label">${stage.label}</div>${stage.sub ? `<div class="id-tl-sub">${stage.sub}</div>` : ''}</div></div>`;
  }).join('')}</div>`;
}

function flowCard({ tags, title, desc, body, headClass = '' }) {
  return `
    <section class="ballot id-flow">
      <div class="ballot-head ${headClass}">
        <div class="poll-tags">${tags.join('')}</div>
        <h2 class="ballot-title id-flow-title">${title}</h2>
        <p class="ballot-desc">${desc}</p>
      </div>
      <div class="id-flow-body">${body}</div>
    </section>`;
}

function previewStep(n, name, sub) {
  return `<div class="id-preview-step"><span class="id-step-dot">${n}</span><div class="id-step-name">${name}</div><div class="id-step-sub">${sub}</div></div>`;
}

function codeBoxes() {
  let boxes = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    boxes += `<input data-code-box class="id-code-box${i === 3 ? ' gap' : ''}" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="1" value="${escapeHtml(codeInput[i] || '')}" aria-label="Code character ${i + 1}">`;
  }
  return boxes;
}

function tag(text, tone = '') {
  const cls = tone === 'accent' ? ' tag-closed' : tone === 'live' ? ' tag-live' : '';
  return `<span class="tag${cls}">${text}</span>`;
}

function errorBanner() {
  if (!errorNote) return '';
  return `<div class="id-banner error">${icon('x')}<div>${escapeHtml(errorNote)}</div></div>`;
}

function busyAttr() {
  return busy ? 'disabled' : '';
}

function shortWallet(value) {
  const raw = String(value || '');
  return raw ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : '';
}

function formatDate(value) {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function icon(name, size = 16) {
  const paths = {
    wallet: '<rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M16 14h.01"></path><path d="M2 10h20"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path>',
    hash: '<line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>',
    pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
    clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path><path d="M21 3v5h-5"></path>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><path d="M12 17h.01"></path>',
    unlink: '<path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="m5.17 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"></path><line x1="8" y1="2" x2="8" y2="5"></line><line x1="2" y1="8" x2="5" y2="8"></line><line x1="16" y1="19" x2="16" y2="22"></line><line x1="19" y1="16" x2="22" y2="16"></line>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:${size}px;height:${size}px">${paths[name]}</svg>`;
}

// Remember typed address across renders.
document.addEventListener('input', event => {
  if (event.target && event.target.id === 'idAddressInput') lastAddressInput = event.target.value;
});

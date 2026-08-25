// Perks tab: relay privileges for badge holders. Enrollment is a signed
// consent (perks.v1) — the only act that lets an address + tier leave the
// private registry for the relay fleet. Prefs and the mailbox indicator are
// keyed by the perksKey issued at enrollment; without it the API reveals
// nothing, so all state here rides localStorage like the identity tab.
import {
  PERKS_TYPES,
  REGISTRY_DOMAIN,
  canonicalPerksMessage,
  normalizeLxmfAddress,
  serializableMessage,
  shortLxmfAddress
} from '../../lib/identity-core.js?v=portal-1';
import { connectWallet, currentAccount, onAccountChange, signTypedData } from './portal-wallet.js?v=portal-1';
import { badgeName, badgeTile } from './portal-badge.js?v=portal-1';

const API_URL = '/api/perks';
const IDENTITY_URL = '/api/identity';
const REG_STORE_KEY = 'ratspeak-portal-registered';
const PERKS_STORE_KEY = 'ratspeak-portal-perks';
const POLL_MS = 30000;
const THRESHOLDS = [
  { min: 15, label: '15m' },
  { min: 30, label: '30m' },
  { min: 60, label: '1h' },
  { min: 180, label: '3h' }
];

let els = null;
let toast = message => console.log(message);
let onChipChange = () => {};
let identity = { registered: false, badge: 'none' };
let perks = null;
let busy = false;
let errorNote = '';
let modalOpen = false;
let pollTimer = null;

export function initPerksTab(options) {
  els = options.els;
  toast = options.toast || toast;
  onChipChange = options.onChipChange || onChipChange;

  onAccountChange(account => {
    errorNote = '';
    modalOpen = false;
    identity = { registered: false, badge: 'none' };
    perks = null;
    render();
    if (account) refresh({ force: true }).catch(reportError);
  });

  els.main.addEventListener('click', onClick);
  render();
}

// ------------------------------------------------------------- data ---------
async function refresh(options = {}) {
  const account = currentAccount();
  if (!account) return;
  const idResp = await fetch(`${IDENTITY_URL}?wallet=${encodeURIComponent(account)}`, { cache: 'no-store' });
  const idData = await idResp.json().catch(() => ({}));
  if (currentAccount() !== account) return;
  const nextIdentity = { registered: Boolean(idData.registration), badge: idData.badge || 'none' };

  let nextPerks = null;
  const key = storedKey(account);
  if (key) {
    const resp = await fetch(`${API_URL}?wallet=${encodeURIComponent(account)}&key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    const data = await resp.json().catch(() => ({}));
    if (currentAccount() !== account) return;
    nextPerks = data.ok ? data : null;
    if (nextPerks && nextPerks.enrolled === false && !nextPerks.tier) nextPerks = null; // key rejected
  }

  const changed = JSON.stringify([nextIdentity, nextPerks]) !== JSON.stringify([identity, perks]);
  identity = nextIdentity;
  perks = nextPerks;
  if (changed || options.force) render();
  schedulePolling();
}

function schedulePolling() {
  const active = Boolean(currentAccount() && perks?.enrolled);
  if (active && !pollTimer) {
    pollTimer = window.setInterval(() => refresh().catch(() => {}), POLL_MS);
  } else if (!active && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function storedKey(account) {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERKS_STORE_KEY));
    return parsed && parsed.wallet === account ? String(parsed.key || '') : '';
  } catch (e) {
    return '';
  }
}

function storeKey(account, key) {
  try {
    localStorage.setItem(PERKS_STORE_KEY, JSON.stringify({ wallet: account, key }));
  } catch (e) {}
}

function registeredAddress(account) {
  try {
    const parsed = JSON.parse(localStorage.getItem(REG_STORE_KEY));
    return parsed && parsed.wallet === account ? String(parsed.lxmfAddress || '') : '';
  } catch (e) {
    return '';
  }
}

function randomNonce() {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

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

// ------------------------------------------------------------- actions ------
async function signEnrollment(enrolled, lxmfAddress) {
  const account = currentAccount();
  const message = canonicalPerksMessage({
    wallet: account,
    lxmfAddress,
    enrolled,
    nonce: randomNonce(),
    issuedAt: Date.now()
  });
  const signature = await signTypedData({
    domain: REGISTRY_DOMAIN,
    types: PERKS_TYPES,
    primaryType: 'Perks',
    message
  });
  const data = await api({ action: 'enroll', message: serializableMessage(message), signature });
  storeKey(account, data.perksKey);
  perks = { ok: true, ...data.perks };
}

async function enroll() {
  const address = registeredAddress(currentAccount()) || normalizeLxmfAddress(els.main.querySelector('#pkAddressInput')?.value);
  if (!address) {
    errorNote = 'Paste the LXMF address you paired — this browser doesn’t have it on file.';
    modalOpen = true;
    return render();
  }
  await withBusy(async () => {
    await signEnrollment(true, address);
    modalOpen = false;
    toast('Enrolled — your network perks are live.');
  });
}

async function unenroll() {
  const address = perks ? registeredAddress(currentAccount()) : '';
  if (!window.confirm('Unenroll from network perks? Your address leaves the perk systems and alerts stop.')) return;
  if (!address) {
    errorNote = 'This browser doesn’t have your address on file — re-pair on the Wallet tab first.';
    return render();
  }
  await withBusy(async () => {
    await signEnrollment(false, address);
    toast('Unenrolled from network perks.');
  });
}

async function setAlerts(enabled, thresholdMin) {
  const account = currentAccount();
  await withBusy(async () => {
    const data = await api({ action: 'set_alerts', wallet: account, perksKey: storedKey(account), enabled, thresholdMin });
    perks = { ok: true, ...data.perks };
  });
}

async function withBusy(fn) {
  if (busy) return;
  busy = true;
  errorNote = '';
  render();
  try {
    await fn();
  } catch (err) {
    errorNote = err && err.message ? err.message : 'Something went wrong.';
  }
  busy = false;
  render();
  schedulePolling();
}

function onClick(event) {
  const target = event.target.closest('[data-pk-action]');
  if (!target) return;
  const action = target.dataset.pkAction;
  if (action === 'connect') connectWallet().catch(reportError);
  if (action === 'go-identity') document.getElementById('tabIdentityBtn')?.click();
  if (action === 'go-badge') document.getElementById('tabBadgeBtn')?.click();
  if (action === 'open-modal') { errorNote = ''; modalOpen = true; render(); }
  if (action === 'close-modal') {
    // The scrim closes only when clicked directly — clicks inside the dialog
    // bubble through it and must not dismiss.
    if (target.classList.contains('pk-scrim') && event.target !== target) return;
    modalOpen = false; errorNote = ''; render();
  }
  if (action === 'enroll') enroll();
  if (action === 'unenroll') unenroll();
  if (action === 'alerts-on') setAlerts(true, perks?.alerts?.thresholdMin ?? 15);
  if (action === 'alerts-off') setAlerts(false, perks?.alerts?.thresholdMin ?? 15);
  if (action === 'threshold') setAlerts(true, Number(target.dataset.min));
  if (action === 'copy-relay' && perks?.goldRelay) {
    navigator.clipboard?.writeText(perks.goldRelay).then(() => toast('Relay address copied.')).catch(() => {});
  }
}

function reportError(err) {
  errorNote = err && err.message ? err.message : 'Something went wrong.';
  render();
}

// ------------------------------------------------------------- views --------
const PERK_ICONS = {
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14a9 3 0 0 0 18 0V5"></path><path d="M3 12a9 3 0 0 0 18 0"></path>',
  mail: '<rect x="2" y="5" width="20" height="15" rx="2"></rect><path d="m2 8.5 8.91 5.02a2 2 0 0 0 2.18 0L22 8.5"></path>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>'
};

function perkCard(icon, name, sub) {
  return `<div class="pk-card">
    <span class="pk-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PERK_ICONS[icon]}</svg></span>
    <div class="pk-name">${name}</div>
    <div class="pk-sub">${sub}</div>
  </div>`;
}

function perkGrid() {
  return `<div class="pk-grid">
    ${perkCard('database', 'Priority Storage', 'Your messages survive 10× longer in every Ratspeak inbox.')}
    ${perkCard('mail', 'Mailbox Status', 'See how much mail is waiting for you, right here in the portal.')}
    ${perkCard('inbox', 'Gold Inbox', 'A private offline-inbox for holders only — 10 MB messages, 5× the public limit.')}
    ${perkCard('bell', 'Arrival Alerts', 'A message over the mesh nudges you when mail waits too long.')}
  </div>`;
}

function card(title, desc, body, headClass = '') {
  return `<section class="ballot id-flow">
    <div class="ballot-head ${headClass}">
      <h2 class="ballot-title id-flow-title">${title}</h2>
      ${desc ? `<p class="ballot-desc">${desc}</p>` : ''}
    </div>
    <div class="id-flow-body">${body}</div>
  </section>`;
}

function errorBanner() {
  return errorNote ? `<div class="id-banner error"><div><strong>${escapeHtml(errorNote)}</strong></div></div>` : '';
}

function consentModal() {
  if (!modalOpen) return '';
  const account = currentAccount();
  const address = registeredAddress(account);
  const addressBlock = address
    ? `<div class="pk-hash" style="margin: 4px 0 12px">${escapeHtml(address)}</div>`
    : `<div class="id-hash-input" style="margin: 4px 0 12px"><input id="pkAddressInput" type="text" autocomplete="off" spellcheck="false" maxlength="64" placeholder="Your paired LXMF address (32 hex)"></div>`;
  return `<div class="pk-scrim" data-pk-action="close-modal">
    <div class="pk-modal">
      <h3>Enable network perks</h3>
      <p>You’ll sign a gas-free enrollment for:</p>
      ${addressBlock}
      <p><strong style="color: var(--text-primary)">What this shares:</strong> your address and badge tier go to our relay
      infrastructure so it can prioritize, store, and watch mail for you. Your wallet pairing is
      never published — but relay behavior could let an observer infer this address belongs
      to a badge holder.</p>
      <p>Unenroll any time to remove the address from the perk systems.</p>
      <div class="id-btn-row" style="margin-top: 14px">
        <button class="primary-btn" type="button" data-pk-action="enroll" ${busy ? 'disabled' : ''}>${busy ? 'Waiting for signature…' : 'Sign &amp; enroll'}</button>
        <button class="secondary-btn" type="button" data-pk-action="close-modal">Cancel</button>
      </div>
      ${errorBanner()}
    </div>
  </div>`;
}

function mailboxCard() {
  const box = perks.mailbox || { waiting: 0 };
  const reported = box.reportedAt ? new Date(box.reportedAt) : null;
  const asOf = reported ? `as of ${reported.toISOString().slice(11, 16)} UTC` : 'no relay report yet';
  if (!box.waiting) {
    return `<div class="pk-mail"><span class="pk-quiet-dot"></span><span class="pk-mail-count">0</span>
      <span class="pk-mail-sub">messages waiting — all clear, ${asOf}.</span></div>`;
  }
  const since = box.oldestTs ? new Date(box.oldestTs * 1000).toISOString().slice(11, 16) + ' UTC' : '';
  return `<div class="pk-mail"><span class="pk-live-dot"></span><span class="pk-mail-count">${box.waiting}</span>
    <span class="pk-mail-sub">message${box.waiting === 1 ? '' : 's'} waiting on your relay${since ? ` since ${since}` : ''} — open Ratspeak and sync.</span></div>`;
}

function alertsRows() {
  const on = Boolean(perks.alerts?.enabled);
  const threshold = perks.alerts?.thresholdMin ?? 15;
  return `
    <div class="pk-row">
      <div><div class="pk-row-label">Arrival alerts</div>
      <div class="pk-row-sub">A mesh message from the portal when mail waits longer than your threshold.</div></div>
      <div class="pk-seg">
        <button type="button" class="${on ? 'on' : ''}" data-pk-action="alerts-on" ${busy ? 'disabled' : ''}>On</button>
        <button type="button" class="${on ? '' : 'on'}" data-pk-action="alerts-off" ${busy ? 'disabled' : ''}>Off</button>
      </div>
    </div>
    <div class="pk-row">
      <div><div class="pk-row-label">Alert after</div>
      <div class="pk-row-sub">How long mail can wait before the nudge.</div></div>
      <div class="pk-seg">${THRESHOLDS.map(t =>
        `<button type="button" class="${on && threshold === t.min ? 'on' : ''}" data-pk-action="threshold" data-min="${t.min}" ${busy || !on ? 'disabled' : ''}>${t.label}</button>`
      ).join('')}</div>
    </div>`;
}

function goldRelayRow() {
  if (perks.goldRelay) {
    return `<div class="pk-row" style="display: block">
      <div class="pk-row-label">Gold Inbox</div>
      <div class="pk-row-sub" style="margin-bottom: 8px">Your private offline-inbox. In Ratspeak: Settings &rarr; Propagation node &rarr; paste, then Announce once and Sync.</div>
      <div class="pk-hash">${escapeHtml(perks.goldRelay)}</div>
      <div class="id-btn-row" style="margin-top: 10px">
        <button class="secondary-btn" type="button" data-pk-action="copy-relay">Copy relay address</button>
      </div>
    </div>`;
  }
  return `<div class="pk-row">
    <div><div class="pk-row-label">Gold Inbox</div>
    <div class="pk-row-sub">Your private inbox is coming online — the address will appear here.</div></div>
  </div>`;
}

function render() {
  if (!els) return;
  const account = currentAccount();

  let view;
  let chip = { text: 'New', tone: 'accent' };

  if (!account) {
    view = card('Badge perks', 'Use your badge status to claim your network perks and enjoy the upgrades!', `
      ${perkGrid()}
      <div class="id-btn-row" style="margin-top: 14px">
        <button class="primary-btn" type="button" data-pk-action="connect"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M16 14h.01"></path><path d="M2 10h20"></path></svg>Connect wallet</button>
      </div>
      ${errorBanner()}`);
  } else if (!identity.registered) {
    view = card('Badge perks', 'Use your badge status to claim your network perks and enjoy the upgrades!', `
      ${perkGrid()}
      <div class="id-banner" style="margin-top: 14px"><div>Pair your wallet with your Ratspeak identity, then come back here.</div></div>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-pk-action="go-identity">Pair your wallet</button>
      </div>
      ${errorBanner()}`);
  } else if (identity.badge === 'none') {
    view = card('Badge perks', 'Use your badge status to claim your network perks and enjoy the upgrades!', `
      ${perkGrid()}
      <div class="id-banner" style="margin-top: 14px"><div>Claim your holder badge, then enroll for perks.</div></div>
      <div class="id-btn-row">
        <button class="primary-btn" type="button" data-pk-action="go-badge">Claim your badge</button>
      </div>
      ${errorBanner()}`);
  } else if (!perks?.enrolled) {
    view = `<div class="pk-halo">${card(`Welcome, ${badgeName(identity.badge)} Rat.`,
      'Click enable perks below to get things started.', `
      ${perkGrid()}
      <div class="id-btn-row" style="margin-top: 14px">
        <button class="primary-btn" type="button" data-pk-action="open-modal" ${busy ? 'disabled' : ''}>Enable network perks</button>
      </div>
      ${modalOpen ? '' : errorBanner()}`)}</div>`;
  } else {
    chip = { text: 'Enrolled', tone: 'good' };
    view = card(`Welcome, ${badgeName(perks.tier)} Rat.`, 'Enjoy the latest perks and upgrades.', `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px">
        ${badgeTile(perks.tier)}
        <div><div class="pk-row-label">${badgeName(perks.tier)} holder &middot; ${escapeHtml(perks.lxmfAddress || '')}</div>
        <div class="pk-row-sub">Priority storage is on. Your messages ride first-class.</div></div>
      </div>
      ${mailboxCard()}
      <div style="margin-top: 18px">${alertsRows()}${goldRelayRow()}</div>
      <div class="id-btn-row" style="margin-top: 16px">
        <button class="danger-btn" type="button" data-pk-action="unenroll" ${busy ? 'disabled' : ''}>Unenroll</button>
      </div>
      ${errorBanner()}`, 'id-flow-head-good');
  }

  els.main.innerHTML = view + consentModal();
  onChipChange(chip);
  syncStepper(account);
}

function syncStepper(account) {
  if (!els.steps?.length) return;
  const stage = !account ? 0
    : !identity.registered ? 1
    : identity.badge === 'none' ? 2
    : !perks?.enrolled ? 3
    : 4;
  els.steps.forEach((step, index) => {
    const state = perks?.enrolled ? 'done' : index < stage ? 'done' : index === stage ? 'active' : 'todo';
    step.row.classList.toggle('todo', state === 'todo');
    step.dot.classList.toggle('active', state === 'active');
    step.dot.classList.toggle('done', state === 'done');
    step.dot.innerHTML = state === 'done'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:13px;height:13px"><path d="M20 6 9 17l-5-5"></path></svg>'
      : String(index + 1);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

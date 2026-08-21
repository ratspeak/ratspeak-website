// Badge tab: standalone holder badge claimed with its own wallet signature.
// Tiles are CSS-built from the canonical brand glyph; tiers live in
// identity-core BADGE_TIERS. Claims are upgrade-only server-side.
import {
  BADGE_CLAIM_TYPES,
  BADGE_TIERS,
  REGISTRY_DOMAIN,
  canonicalBadgeClaimMessage,
  normalizeBadge,
  serializableMessage
} from '../../lib/identity-core.js?v=portal-1';
import { connectWallet, currentAccount, onAccountChange, signTypedData } from './portal-wallet.js?v=portal-1';

const API_URL = '/api/identity';

// The complete brand mark (all five paths — bubble, ear, eye, whiskers).
const RAT_GLYPH = '<svg viewBox="243 243 282 282" fill="currentColor" aria-hidden="true"><path d="M327.97,501.16C314.61,508.03 301.57,514.72 288.56,521.48C283.91,523.91 279.2,524.61 275.05,520.98C271.05,517.49 271.26,512.87 272.63,508.05C275.23,498.93 277.46,489.7 280.08,480.58C281.03,477.27 280.4,475.51 277.14,473.92C255.84,463.53 245.61,446.29 245.66,422.66C245.75,381.16 245.55,339.66 245.75,298.16C245.86,275.62 256.63,259.57 276.93,249.98C283.68,246.79 291.07,246.01 298.4,246C355.74,245.88 413.07,245.83 470.4,245.95C495.22,246.01 516.64,265.69 519.52,290.03C520.6,299.2 520.12,308.32 520.21,317.46C520.37,333.46 520.29,349.46 520.2,365.46C520.17,371.38 518.89,372.03 513.77,369.13C498.9,360.71 498.91,360.71 498.9,343.65C498.88,328.81 498.92,313.98 498.81,299.15C498.66,279.74 486.18,267.28 466.77,267.26C410.94,267.23 355.11,267.23 299.27,267.32C279.54,267.35 267.32,279.36 267.23,299.05C267.05,340.71 267.04,382.38 267.09,424.04C267.11,441.62 277.67,453.85 295.43,456.58C310.83,458.95 307.84,458.98 304.51,471.32C303.3,475.82 302.05,480.31 300.83,484.81C300.35,486.56 299.66,488.32 300.92,490.33C304.48,490.2 307.24,487.87 310.31,486.46C314.99,484.3 319.61,481.95 324.04,479.31C328.78,476.49 333.17,476.59 338.23,478.73C355.38,485.99 373.44,488.84 391.95,487.72C430.98,485.37 461.99,468.13 484.6,436.22C489.79,428.9 493.71,420.74 496.43,412.08C497.17,409.7 496.94,408 494.74,406.52C489.6,403.07 487.33,398.05 487.7,391.96C487.91,388.37 486.58,386.13 483.49,384.24C461.58,370.79 438.6,360.13 412.77,356.87C403.65,355.71 394.49,355.67 385.35,356.73C376.09,357.8 372.64,358.02 369.74,347.74C368.12,341.98 365.71,336.47 362.24,331.47C356.28,322.9 346.68,319.02 337.45,321.63C328.92,324.05 321.83,333.47 321.32,343.14C320.63,356 327.03,371.92 346.66,374.88C350.07,375.39 352.59,376.98 353.16,380.74C353.7,384.21 352.02,386.53 349.33,388.25C347.4,389.48 345.13,389.39 343,389.01C325.7,385.88 313.84,376.01 308.73,359.24C303.68,342.67 306.62,327.49 319.94,315.42C336.41,300.5 361.24,303.86 373.4,322.51C376.14,326.7 378.7,331.06 380.19,335.83C381.41,339.73 383.56,341.03 387.54,340.77C406.5,339.53 425.15,341.26 443.29,347.18C469.21,355.64 492.63,368.82 514.47,384.97C521.5,390.18 521.02,397.62 519.75,405.01C515.1,432.25 501.28,454.4 481.02,472.62C460.48,491.09 436.54,502.92 409.2,507.52C385.77,511.46 362.77,509.7 340.18,502.3C336.39,501.06 332.58,498.31 327.97,501.16z"/> <path d="M414.19,335.38C405.75,335.93 397.65,334.86 389.54,335.84C387,336.15 385.78,334.06 384.8,332.07C380.73,323.83 376.21,315.95 368.77,310.17C366.48,308.38 367.23,307 369.43,305.62C379.53,299.3 389.62,299.22 399.19,306.49C408.52,313.58 414.08,323.09 414.19,335.38z"/> <path d="M417.09,390.21C410.66,388.78 407.34,384.6 408.1,379.44C408.81,374.6 413.31,370.91 418.31,371.05C423.12,371.19 426.94,375.02 427.27,380C427.63,385.61 424.18,389.22 417.09,390.21z"/> <path d="M430.83,418.71C429.47,419.23 428.59,420.25 427.03,419.59C426.81,417.6 428.52,416.83 429.77,416.07C441.62,408.88 453.85,402.56 467.79,400.42C469.45,400.16 471.08,399.82 472.69,400.53C474.42,401.28 475.23,402.66 475.09,404.49C474.92,406.75 473.27,407.6 471.34,407.79C465.71,408.35 460.12,409.05 454.59,410.3C446.44,412.13 438.57,414.68 430.83,418.71z"/> <path d="M448.63,432.62C455.17,424.82 461.54,417.3 470.21,412.35C473.17,410.66 477.33,407.48 479.7,412.18C482.09,416.9 476.91,417.67 473.97,418.99C464.9,423.07 457.39,429.35 449.85,435.63C448.67,436.61 447.95,438.42 445.79,438.04C445.62,435.72 447.39,434.49 448.63,432.62z"/></svg>';

let els = null;
let toast = message => console.log(message);
let onChipChange = () => {};
let badge = 'none';
let busy = false;
let errorNote = '';

export function badgeTile(tier) {
  return `<span class="id-badge-tile ${tier}">${RAT_GLYPH}</span>`;
}

export function badgeName(tier) {
  return BADGE_TIERS.find(t => t.id === tier)?.name || '';
}

function formatTokens(minTokens) {
  return new Intl.NumberFormat('en-US').format(Number(minTokens));
}

function ladder(earned) {
  return `<div class="id-badges">${BADGE_TIERS.map(t => `
    <div class="id-badge${t.id === earned ? ' earned' : ''}">
      ${badgeTile(t.id)}
      <span class="id-badge-name">${t.name}</span>
      <span class="id-badge-min">${formatTokens(t.minTokens)}+</span>
    </div>`).join('')}</div>`;
}

export function initBadgeTab(options) {
  els = options.els;
  toast = options.toast || toast;
  onChipChange = options.onChipChange || onChipChange;

  onAccountChange(account => {
    errorNote = '';
    if (!account) {
      badge = 'none';
      render();
      return;
    }
    // The view depends on the account, not just the badge value.
    render();
    refreshBadge().catch(err => console.warn(err));
  });

  els.main.addEventListener('click', onClick);
  render();
}

async function refreshBadge() {
  const account = currentAccount();
  if (!account) return;
  const resp = await fetch(`${API_URL}?wallet=${encodeURIComponent(account)}`, { cache: 'no-store' });
  const data = await resp.json().catch(() => ({}));
  if (currentAccount() !== account) return;
  const next = normalizeBadge(data.badge);
  if (next !== badge) {
    badge = next;
    render();
  } else {
    onChipChange(chip());
  }
}

function chip() {
  if (badge === 'none') return { text: 'Unclaimed', tone: '' };
  return { text: badgeName(badge), tone: 'good' };
}

async function claim() {
  const account = currentAccount();
  if (busy || !account) return;
  busy = true;
  errorNote = '';
  render();
  try {
    const message = canonicalBadgeClaimMessage({
      wallet: account,
      nonce: randomHex(16),
      issuedAt: Date.now()
    });
    const signature = await signTypedData({
      domain: REGISTRY_DOMAIN,
      types: BADGE_CLAIM_TYPES,
      primaryType: 'BadgeClaim',
      message
    });
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim_badge', message: serializableMessage(message), signature })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Claim failed (${resp.status})`);
    badge = normalizeBadge(data.badge);
    toast(`${badgeName(badge)} badge claimed.`);
  } catch (err) {
    console.warn(err);
    errorNote = err && err.message ? err.message : 'Claim failed.';
  } finally {
    busy = false;
    render();
  }
}

function onClick(event) {
  const action = event.target.closest('[data-badge-action]')?.dataset.badgeAction;
  if (!action) return;
  if (action === 'connect') connectWallet().catch(err => { console.warn(err); toast('Wallet connection failed.'); });
  if (action === 'claim') claim();
}

function renderStepper(account, earned) {
  if (!els.steps) return;
  const states = !account
    ? ['active', 'todo', 'todo']
    : earned
      ? ['done', 'done', 'done']
      : ['done', 'active', 'todo'];
  els.steps.forEach((step, index) => {
    const state = states[index];
    step.row.classList.toggle('todo', state === 'todo');
    step.dot.classList.toggle('active', state === 'active');
    step.dot.classList.toggle('done', state === 'done');
    step.dot.innerHTML = state === 'done'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:13px;height:13px"><path d="M20 6 9 17l-5-5"></path></svg>'
      : String(index + 1);
  });
}

function render() {
  const account = currentAccount();
  const earned = badge !== 'none';
  renderStepper(account, earned);
  els.main.innerHTML = `
    <section class="ballot id-flow">
      <div class="ballot-head${earned ? ' id-flow-head-good' : ''}">
        <div class="poll-tags">${earned ? '<span class="tag tag-live">Claimed</span>' : '<span class="tag tag-closed">Badge</span>'}</div>
        <h2 class="ballot-title id-flow-title">${earned ? `${badgeName(badge)} holder` : 'Claim your badge'}</h2>
        <p class="ballot-desc">Sign a message with your wallet and your badge is issued from your live RATSPEAK holdings.</p>
      </div>
      <div class="id-flow-body">
        ${ladder(badge)}
        ${account ? `
          <div class="id-btn-row">
            <button class="primary-btn" type="button" data-badge-action="claim" ${busy ? 'disabled' : ''}>${penIcon()}${busy ? 'Waiting for signature…' : earned ? 'Re-check holdings' : 'Claim badge'}</button>
          </div>
          ${earned ? '<p class="id-field-help">Claims only ever upgrade — selling later never takes a badge away.</p>' : ''}
        ` : `
          <div class="id-btn-row">
            <button class="primary-btn" type="button" data-badge-action="connect">${walletIcon()}Connect wallet</button>
          </div>
        `}
        ${errorNote ? `<div class="id-banner error">${xIcon()}<div>${escapeHtml(errorNote)}</div></div>` : ''}
      </div>
    </section>`;
  onChipChange(chip());
}

function penIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
}

function walletIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M16 14h.01"></path><path d="M2 10h20"></path></svg>';
}

function xIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
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

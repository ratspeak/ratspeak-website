import * as rns from './rns-demo.js';

const $ = id => document.getElementById(id);
const quick = matchMedia('(prefers-reduced-motion: reduce)');
const people = {};
let queue = Promise.resolve();
let yours = 0;
let epoch = 0;

const ICON = {
  clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><polyline points="8 4 8 8 11 10"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><polyline points="3 8 7 12 13 4"/></svg>',
};
const shortAddr = bytes => { const h = rns.hex(bytes); return `${h.slice(0, 8)}…${h.slice(-4)}`; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const announce = text => { $('demo-status').textContent = text; };
// Tasks queued before your address changed are dropped; a running one stops touching the page.
const enqueue = task => { const e = epoch; return (queue = queue.then(() => e === epoch && task(e)).catch(err => console.error(err))); };

/* Hero download: the visitor's platform first, a direct release file when GitHub answers. */
const RELEASE_API = 'https://api.github.com/repos/ratspeak/Ratspeak/releases/latest';
const RELEASE_ASSET_SUFFIX = {
  'macos-arm64': '-macos-arm64.dmg', 'macos-x64': '-macos-x64.dmg',
  'windows-msi': '-windows-x64.msi', 'linux-appimage': '-linux-x86_64.appimage',
  'android-arm64': '-android-arm64.apk',
};
const TESTFLIGHT = 'https://testflight.apple.com/join/AzzW4Jg6';
const ALSO = {
  macIntel: ['macOS (Intel)', '/download.html#desktop'], macSilicon: ['macOS (Silicon)', '/download.html#desktop'],
  mac: ['macOS', '/download.html#desktop'], windows: ['Windows', '/download.html#desktop'],
  desktop: ['desktop', '/download.html#desktop'],
  android: ['Android', '/download.html#mobile'], iphone: ['iPhone', '/download.html#mobile'],
  handhelds: ['handhelds', '#devices'], more: ['more', '/download.html'],
};
const HERO = {
  macos: {label: 'Download for macOS', asset: 'macos-arm64', page: '/download.html#desktop', also: ['macIntel', 'windows', 'iphone', 'android', 'more']},
  intelMac: {label: 'Download for macOS', asset: 'macos-x64', page: '/download.html#desktop', also: ['macSilicon', 'windows', 'iphone', 'android', 'more']},
  windows: {label: 'Download for Windows', asset: 'windows-msi', page: '/download.html#desktop', also: ['android', 'iphone', 'more']},
  linux: {label: 'Download for Linux', asset: 'linux-appimage', page: '/download.html#desktop', also: ['mac', 'windows', 'android', 'iphone', 'more']},
  android: {label: 'Get the Android app', asset: 'android-arm64', page: '/download.html#mobile', also: ['iphone', 'desktop', 'handhelds']},
  ios: {label: 'Join the iPhone beta', href: TESTFLIGHT, external: true, also: ['android', 'desktop', 'handhelds']},
};

function detectDevice() {
  const ua = (navigator.userAgent || '').toLowerCase();
  // iPadOS Safari reports a Mac user agent; touch support gives it away.
  if (/iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/windows/.test(ua)) return 'windows';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/linux|cros|x11/.test(ua)) return 'linux';
  return null;
}

function renderHero(kind) {
  const plan = HERO[kind];
  const link = $('hero-get');
  const also = $('hero-also');
  if (!plan || !link || !also) return;
  link.querySelector('.hero-get-label').textContent = plan.label;
  link.querySelector('.hero-get-arrow').textContent = plan.external ? '↗' : '→';
  link.href = plan.href || plan.page;
  if (plan.external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  const parts = ['Also on: '];
  plan.also.forEach((key, i) => {
    const [text, href] = ALSO[key];
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (i) parts.push(i === plan.also.length - 1 ? (plan.also.length > 2 ? ', and ' : ' and ') : ', ');
    parts.push(a);
  });
  parts.push('.');
  also.replaceChildren(...parts);
  if (!plan.asset || typeof fetch !== 'function') return;
  fetch(RELEASE_API, {headers: {Accept: 'application/vnd.github+json'}})
    .then(r => { if (!r.ok) throw new Error('release lookup'); return r.json(); })
    .then(release => {
      const suffix = RELEASE_ASSET_SUFFIX[plan.asset];
      const asset = (release.assets || []).find(a => {
        const name = String(a.name || '').toLowerCase();
        return name.startsWith('ratspeak-') && name.endsWith(suffix) && a.browser_download_url;
      });
      // Without a file the button keeps pointing at the matching download panel.
      if (asset && HERO[kind] === plan) link.href = asset.browser_download_url;
    })
    .catch(() => {});
}

const device = detectDevice();
renderHero(device);
// The demo's closing chip opens the download page for this device, never a file.
const downloadPage = HERO[device]?.page || (device === 'ios' ? '/download.html#mobile' : '/download.html');
if (device === 'macos' && navigator.userAgentData?.getHighEntropyValues) {
  navigator.userAgentData.getHighEntropyValues(['architecture'])
    .then(v => { if (v.architecture === 'x86') renderHero('intelMac'); })
    .catch(() => {});
}

// The address tag settles into place once, when it scrolls into view.
const tagWrap = document.querySelector('.tag-wrap');
if (tagWrap && !quick.matches && 'IntersectionObserver' in window) {
  tagWrap.classList.add('will-settle');
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    tagWrap.classList.replace('will-settle', 'is-in');
  }, {threshold: .35});
  io.observe(tagWrap);
}

// Mesh band: each strike draws as its row scrolls in. Only rows still below the fold are reset, so nothing on screen waits on the observer.
const meshRows = [...document.querySelectorAll('.mesh-row')];
if (meshRows.length && !quick.matches && 'IntersectionObserver' in window) {
  let next = 0;
  const strike = row => {
    const at = Math.max(performance.now() + 250, next);
    next = at + 450;
    setTimeout(() => row.classList.remove('is-armed'), at - performance.now());
  };
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); strike(e.target); }
  }, {rootMargin: '0px 0px -25% 0px'});
  for (const row of meshRows) {
    if (row.getBoundingClientRect().top < innerHeight) continue;
    row.classList.add('is-armed');
    io.observe(row);
  }
}

function setState(row, state) {
  const el = row.querySelector('.bubble-state');
  el.className = `bubble-state${state === 'Delivered' ? ' is-delivered' : state === 'Not verified' ? ' is-warning' : ''}`;
  el.innerHTML = state === 'Sending' ? ICON.clock : state === 'Not verified' ? '' : ICON.check;
  el.append(state);
}

function scrollEnd(log) {
  log.scrollTo({top: log.scrollHeight, behavior: quick.matches ? 'auto' : 'smooth'});
}

function add(person, kind, text) {
  const row = document.createElement('div');
  row.className = `bubble-row ${kind}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  row.append(bubble);
  if (kind === 'out') {
    // Only the latest outgoing message carries a delivery state, as in the app.
    for (const old of person.log.querySelectorAll('.bubble-state')) old.remove();
    const state = document.createElement('span');
    state.className = 'bubble-state';
    row.append(state);
  }
  person.log.append(row);
  scrollEnd(person.log);
  return row;
}

// The relay's log: one row per message, both ways, read from the packet that was just sealed.
let carried = 0;
function logPacket(packet) {
  const to = rns.hex(rns.destination(packet));
  const whose = to === rns.hex(people.alice.id.address) ? 'Alice’s address' : to === rns.hex(people.you.id.address) ? 'Your address' : 'Not yours or Alice’s';
  const [, from, end] = rns.segments(packet)[2];
  const row = document.createElement('li');
  row.className = 'log-row';
  const cipher = rns.hex(packet.slice(from, end));
  row.innerHTML = '<span class="log-to" tabindex="0" data-key="To"><b aria-hidden="true"></b><span class="sr-only"></span><small></small></span><span class="log-from"><b aria-hidden="true">Hidden</b><span class="sr-only">From: hidden.</span></span><span class="log-in" tabindex="0" data-key="Inside" data-note="Encrypted"><span class="sr-only">Inside: </span><span aria-hidden="true"></span><small></small></span>';
  const [cellTo, cellIn] = row.querySelectorAll('[tabindex]');
  Object.assign(cellTo.dataset, {full: to, note: whose});
  cellTo.querySelector('b').textContent = shortAddr(rns.destination(packet));
  cellTo.querySelector('.sr-only').textContent = `To: ${to},`;
  cellTo.querySelector('small').textContent = whose;
  cellIn.dataset.full = cipher.match(/.{1,8}/g).join(' ');
  cellIn.querySelector('[aria-hidden]').textContent = cipher.match(/../g).join(' ');
  cellIn.querySelector('small').innerHTML = `${packet.length} bytes<span class="log-enc">, encrypted</span>`;
  if (!quick.matches) row.classList.add('is-new');
  const log = $('env-log');
  log.querySelector('.log-wait')?.remove();
  log.prepend(row);
  while (log.children.length > 6) log.lastChild.remove();
  // rows pushed past the card's window leave the tab order, so focus never scrolls the clipped log;
  // focus on the row that slides out stays put on the row that takes its place
  const shown = +getComputedStyle($('env')).getPropertyValue('--rows');
  const held = document.activeElement?.closest('.log-row') === log.children[shown] && document.activeElement;
  for (const [i, r] of [...log.children].entries()) r.inert = i >= shown;
  if (held) log.children[shown - 1].querySelector(held.matches('.log-to') ? '.log-to' : '.log-in').focus({preventScroll: true});
  peek.moved();
  carried++;
  $('env-count').textContent = `${carried} ${carried === 1 ? 'message' : 'messages'}`;
  const said = whose === 'Your address' ? 'your address' : whose === 'Alice’s address' ? whose : 'an address that isn’t yours or Alice’s';
  return `A relay saw ${said} on a ${packet.length}-byte packet.`;
}

// A To or Inside cell in full, on hover, keyboard focus or tap: an ink slip laid on the card beside the cell.
// The row already holds the full value for screen readers, so the slip is hidden from them.
const peek = (() => {
  const env = $('env'), log = $('env-log');
  const slip = document.createElement('div');
  slip.className = 'peek';
  slip.setAttribute('aria-hidden', 'true');
  slip.innerHTML = '<p class="peek-head"><span></span><span></span></p><p class="peek-val"></p>';
  env.append(slip);
  const EDGE = 4;
  let cell = null, via = '', shut = 0, follow = 0, muted = null, pointer = '';

  // The full bytes set as 4-byte words, as many to a line as the card holds (up to 6), so the block stays square.
  function fit() {
    const val = slip.lastChild;
    val.style.width = '';
    if (!cell.classList.contains('log-in')) return;
    val.style.width = '10ch';
    const ch = val.offsetWidth / 10, {paddingLeft, paddingRight} = getComputedStyle(slip);
    const room = env.clientWidth - 2 * EDGE - parseFloat(paddingLeft) - parseFloat(paddingRight);
    val.style.width = `${Math.max(2, Math.min(6, Math.floor((room / ch + 1) / 9))) * 9 - 1}ch`;
  }
  // Layout offsets inside the card, so the slip shares its tilt; it opens below unless the viewport is short there.
  function place() {
    let x = 0, y = 0;
    for (let el = cell; el && el !== env; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; }
    const w = slip.offsetWidth, h = slip.offsetHeight, gap = 9;
    const {top, bottom} = cell.getBoundingClientRect();
    const up = innerHeight - bottom < h + gap + 8 && top > innerHeight - bottom;
    const left = Math.max(EDGE, Math.min(x - parseFloat(getComputedStyle(slip).paddingLeft), env.clientWidth - EDGE - w));
    slip.classList.toggle('is-up', up);
    slip.style.left = `${left}px`;
    slip.style.top = `${up ? y - h - gap : y + cell.offsetHeight + gap}px`;
    slip.style.setProperty('--caret', `${Math.max(12, Math.min(x + 14 - left, w - 12))}px`);
  }
  function show(c, how) {
    clearTimeout(shut);
    via = how;
    if (c === cell) return;
    cell?.classList.remove('is-peeked');
    cell = c;
    c.classList.add('is-peeked');
    slip.className = `peek ${c.classList.contains('log-to') ? 'peek-to' : 'peek-in'}`;
    const [key, note] = slip.firstChild.children;
    key.textContent = c.dataset.key;
    note.textContent = c.dataset.note;
    slip.lastChild.textContent = c.dataset.full;
    fit();
    place();
    slip.getBoundingClientRect();
    slip.classList.add('is-open');
  }
  function hide() {
    clearTimeout(shut);
    cancelAnimationFrame(follow);
    if (!cell) return;
    cell.classList.remove('is-peeked');
    cell = null;
    via = '';
    slip.classList.remove('is-open');
  }
  const cellOf = e => e.target.closest?.('[data-full]');
  // The slip itself is hoverable, so the pointer can cross onto it (and select the value) without losing it.
  function leave(e) {
    if (e.pointerType !== 'mouse' || cell?.contains(e.relatedTarget) || slip.contains(e.relatedTarget)) return;
    muted = null;
    if (via === 'hover') shut = setTimeout(hide, 120);
  }
  log.addEventListener('pointerover', e => {
    const c = cellOf(e);
    if (e.pointerType !== 'mouse' || !c || c === muted) return;
    show(c, c === cell ? via : 'hover');
  });
  log.addEventListener('pointerout', leave);
  slip.addEventListener('pointerover', () => clearTimeout(shut));
  slip.addEventListener('pointerout', leave);
  log.addEventListener('focusin', e => { const c = cellOf(e); if (c?.matches(':focus-visible')) show(c, 'focus'); });
  log.addEventListener('focusout', e => { if (e.target === cell && via !== 'hover') hide(); });
  log.addEventListener('pointerdown', e => { pointer = e.pointerType; });
  log.addEventListener('click', e => {
    const c = cellOf(e);
    if (!c || pointer === 'mouse') return;
    if (c === cell && via === 'tap') hide(); else show(c, 'tap');
  });
  // A tap anywhere else, the slip included, puts it away; a mouse may rest on the slip.
  document.addEventListener('pointerdown', e => {
    if (cell && !cell.contains(e.target) && (e.pointerType !== 'mouse' || !slip.contains(e.target))) hide();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !cell) return;
    muted = via === 'hover' ? cell : null;
    hide();
  });
  addEventListener('resize', () => { if (cell) { fit(); place(); } });

  return {
    hide,
    // a new row pushes the others down: ride along with the row-insert animation, or let go once the row is out of view
    moved() {
      if (!cell) return;
      if (!cell.isConnected || cell.closest('[inert]')) return hide();
      cancelAnimationFrame(follow);
      const until = performance.now() + 500;
      const step = () => { place(); if (performance.now() < until) follow = requestAnimationFrame(step); };
      step();
    },
  };
})();

// The packet rides its direction's lane out of the sender's phone, under the card, into the other phone;
// returns when it reaches the relay. Reduced motion: the lane only lights up.
function carry(outward, hop) {
  const line = document.querySelector('.relay-line');
  const lane = line.querySelector(outward ? '.lane-out' : '.lane-in');
  lane.classList.add('is-live');
  clearTimeout(lane.dim);
  lane.dim = setTimeout(() => lane.classList.remove('is-live'), hop + 400);
  if (quick.matches || !line.getClientRects().length) return 0;
  const box = line.getBoundingClientRect(), card = $('env').getBoundingClientRect();
  const [a, b] = [...document.querySelectorAll('#demo .handset')].map(h => h.getBoundingClientRect());
  const xs = [a.right - 14, card.left + 16, card.right - 16, b.left + 14].map(x => `translateX(${x - box.left}px)`);
  if (!outward) xs.reverse();
  const at = .36;
  const packet = document.createElement('span');
  packet.className = 'packet';
  lane.append(packet);
  packet.animate([
    {transform: xs[0], easing: 'cubic-bezier(.45,0,.9,.6)'},
    {transform: xs[1], offset: at},
    {transform: xs[2], offset: .62, easing: 'cubic-bezier(.1,.4,.55,1)'},
    {transform: xs[3]},
  ], {duration: hop, fill: 'forwards'}).finished.finally(() => packet.remove()).catch(() => {});
  return hop * at;
}

async function send(from, to, text, e) {
  const [sender, recipient] = [from.id, to.id];
  const row = add(from, 'out', text);
  setState(row, 'Sending');
  const packet = await rns.sealMessage(sender, recipient, text);
  if (e !== epoch) return;
  setState(row, 'Sent');
  // Both directions cross the relay, so both land in its log as the packet passes through.
  const hop = quick.matches ? 300 : 800;
  const reach = carry(from === people.you, hop);
  await wait(reach);
  if (e !== epoch) return;
  const seen = logPacket(packet);
  await wait(hop - reach);
  const opened = await rns.openMessage(recipient, sender, packet);
  if (!opened || e !== epoch) return;
  add(to, 'in', opened.text);
  setState(row, opened.signedOk ? 'Delivered' : 'Not verified');
  announce(`${to === people.you ? 'You' : to.name} received: ${opened.text} ${seen}`);
  if (from === people.you) react();
}

// Alice answers your messages with the next thing to try; the visitor only plays themselves.
function aliceSays(line) {
  enqueue(async e => { await wait(quick.matches ? 150 : 700); if (e === epoch) await send(people.alice, people.you, line, e); });
}

function react() {
  yours++;
  if (yours === 1) {
    aliceSays('Nice. What’s the door code for tonight?');
    enqueue(async () => offer(replyChip('It’s 4417. See you at 7.')));
  } else if (yours === 2) {
    aliceSays('Got it. The relay couldn’t read a word of that.');
    enqueue(async () => {
      const get = document.createElement('a');
      get.className = 'reply-chip is-get';
      get.href = downloadPage;
      get.innerHTML = 'Get Ratspeak <span aria-hidden="true">→</span>';
      offer(get);
    });
  }
}

// A margin note points at the opener's chip until the visitor first acts, then never returns.
let hinted = false;
const narrow = matchMedia('(max-width: 900px)');
const hint = document.createElement('p');
hint.className = 'reply-hint';
hint.setAttribute('aria-hidden', 'true');
hint.innerHTML = '<svg viewBox="0 0 72 52"><path d="M70 9C46 2 22 14 5 46"/><path d="M3 34l2 12 11-4"/></svg><span><b><span class="live-dot"></span>Live demo</b>Reply to Alice</span>';
function placeHint() {
  const chip = document.querySelector('#chat-you .reply-chip');
  if (!chip) return hint.remove();
  if (narrow.matches) chip.before(hint);
  else document.querySelector('.phone-you .handset').append(hint);
}
narrow.addEventListener('change', () => { if (hint.isConnected) placeHint(); });
function dismissHint() {
  hinted = true;
  hint.remove();
}

function offer(node, pointAt = false) {
  const row = document.querySelector('#chat-you .reply-row');
  row.replaceChildren(node);
  row.hidden = false;
  if (pointAt && !hinted) placeHint();
  scrollEnd(people.you.log);
}
function dropOffer() {
  const row = document.querySelector('#chat-you .reply-row');
  row.replaceChildren();
  row.hidden = true;
  hint.remove();
}
function replyChip(text) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'reply-chip';
  chip.textContent = text;
  chip.setAttribute('aria-label', `Send: ${text}`);
  chip.addEventListener('click', () => {
    const kb = chip.matches(':focus-visible');
    dismissHint();
    dropOffer();
    if (kb) people.you.input.focus();
    talk(people.you, people.alice, text);
  });
  return chip;
}
const talk = (from, to, text) => enqueue(e => send(from, to, text, e));

function paint(key) {
  const {address} = people[key].id;
  for (const el of document.querySelectorAll(`[data-avatar="${key}"]`)) el.innerHTML = globalThis.lxmface(rns.hex(address), 40);
  for (const el of document.querySelectorAll(`[data-addr="${key}"]`)) {
    el.textContent = shortAddr(address);
    el.title = rns.hex(address);
  }
}
async function setup(key, name) {
  const chat = $(`chat-${key}`);
  people[key] = {id: await rns.createIdentity(), name, log: chat.querySelector('.chat-log'), input: chat.querySelector('input'), note: chat.querySelector('.composer-note')};
  paint(key);
}

// The handsets' status bars show this browser's clock.
const clocks = document.querySelectorAll('.status-time');
const tick = () => {
  const now = new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}).replace(/\s?[ap]\.?m\.?$/i, '');
  for (const el of clocks) el.textContent = now;
};
tick();
setInterval(tick, 15000);

if (await rns.supported()) {
  await setup('you', 'You');
  await setup('alice', 'Alice');
  const {you, alice} = people;

  const tag = document.querySelector('.key-tag');
  if (tag) {
    const paintTag = () => {
      tag.querySelector('.tag-face').innerHTML = globalThis.lxmface(rns.hex(you.id.address), 56);
      tag.querySelector('.tag-addr').textContent = rns.hex(you.id.address);
    };
    paintTag();
    const tryIt = document.createElement('a');
    tryIt.href = '#play';
    tryIt.innerHTML = 'Try it<span aria-hidden="true">&nbsp;↓</span>';
    tag.querySelector('.tag-foot').replaceChildren('Made in this browser. ', tryIt);
    tag.classList.add('is-live');

    // A new address is someone Alice hasn't met: the chats and the relay log start over, and her opener
    // plays to the new address when the demo is next on screen.
    const renew = tag.querySelector('.tag-new'), status = document.querySelector('.tag-status');
    let busy = false;
    renew.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      if (!quick.matches) renew.querySelector('svg').animate([{transform: 'rotate(0)'}, {transform: 'rotate(1turn)'}], {duration: 500, easing: 'cubic-bezier(.3,0,.2,1)'});
      status.textContent = '';
      dismissHint();
      try {
        const id = await rns.createIdentity();
        const talked = you.log.childElementCount + alice.log.childElementCount > 0;
        restart();
        you.id = id;
        paint('you');
        paintTag();
        greet();
        status.textContent = talked ? 'New address made. Your chat with Alice starts over.' : 'New address made.';
      } finally {
        busy = false;
      }
    });
  }

  for (const [me, them] of [[you, alice], [alice, you]]) {
    const button = me.input.form.querySelector('button');
    const sync = () => button.setAttribute('aria-disabled', String(!me.input.value.trim()));
    button.disabled = false;
    sync();
    me.input.addEventListener('input', () => {
      sync();
      me.note.hidden = true;
      if (me === you && me.input.value && document.querySelector('#chat-you .reply-chip:not(.is-get)')) dropOffer();
    });
    me.input.form.addEventListener('submit', event => {
      event.preventDefault();
      const text = me.input.value.trim();
      if (!text) return;
      dismissHint();
      if (rns.contentSize(text) > rns.MAX_CONTENT) {
        me.note.textContent = 'Too long for this demo. The app sends longer messages over an encrypted link.';
        me.note.hidden = false;
        return;
      }
      me.input.value = '';
      sync();
      if (me === you && !document.querySelector('#chat-you .is-get')) dropOffer();
      talk(me, them, text);
    });
  }

  // Alice's opening message plays when the demo is on screen, not while the visitor is still at the top.
  const opener = () => {
    talk(alice, you, 'Hey! Are you on Ratspeak now?');
    enqueue(async () => { if (!yours) offer(replyChip('Yep, just installed it.'), true); });
  };
  let watch;
  function greet() {
    watch?.disconnect();
    if (!('IntersectionObserver' in window)) return opener();
    watch = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      watch.disconnect();
      opener();
    }, {threshold: .4});
    watch.observe($('demo'));
  }
  greet();

  const waiting = $('env-log').firstElementChild.cloneNode(true);
  function restart() {
    epoch++;
    yours = carried = 0;
    for (const p of [you, alice]) { p.log.replaceChildren(); p.note.hidden = true; }
    dropOffer();
    peek.hide();
    $('env-log').replaceChildren(waiting.cloneNode(true));
    $('env-count').textContent = '';
    for (const p of document.querySelectorAll('.relay-line .packet')) p.remove();
    announce('');
  }
} else {
  $('demo').hidden = true;
  $('demo-unsupported').hidden = false;
}

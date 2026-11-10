import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { HOST_OWNERS, SCREEN_HEIGHT, SCREEN_WIDTH, leaveRsnode, parseRsnodeStatus, parseTransportStatus, readRsnodeFacts,
  readRsnodePairingCode, readRsnodeRadio, readRsnodeScreen, readRsnodeStatus, renderTransport, restartRsnode, rsnodeBluetoothOff,
  rsnodeDetails, rsnodeLights, rsnodeScreenless, rsnodeStatusCheck, rsnodeSummary, screenPixels, screenSupported, startRsnodePairing,
  waitForRsnode } from '../assets/js/rsnode-device.js';
import { rsnodeBoard, rsnodeBoardForTarget } from '../assets/js/rsnode-beta.js';
import { renderNode } from '../assets/js/rsnode-provision.js';
import { flasherPage } from './flasher-page.mjs';

// rsNode's own answers, recorded from its code by scripts/rsnode-device-vectors.py.
const vectors = JSON.parse(readFileSync(new URL('./fixtures/rsnode-device-vectors.json', import.meta.url), 'utf8'));
const html = flasherPage('flash.html');
const bytes = value => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = value => Buffer.from(value).toString('hex');
const scenario = name => vectors.scenarios.find(entry => entry.name.startsWith(name));
const [v4, v3, echo, repeater] = ['Heltec V4 on', 'Heltec V3', 'T-Echo', 'Heltec V4 running as a Repeater'].map(scenario);
const PRESET_BOARDS = { 'heltec-v3': 'Heltec V3', 'heltec-v4': 'Heltec V4', 't-echo': 'T-Echo' };

function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(|var ${name} = (?!\\{)[^;]*;|var ${name} = `).exec(html);
  assert.ok(match, `missing ${name}`);
  if (match[0].endsWith(';')) return match[0];
  const open = html.indexOf('{', match.index);
  let depth = 0, quote = null, escaped = false, comment = null;
  for (let i = open; i < html.length; i++) {
    const c = html[i], next = html[i + 1];
    if (comment) {
      if (comment === '//' ? c === '\n' : c === '*' && next === '/') { if (comment === '/*') i++; comment = null; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && (next === '/' || next === '*')) { comment = c + next; i++; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(match.index, i + 1) + (html[i + 1] === ';' ? ';' : '');
  }
  throw new Error('Unterminated ' + name);
}

function pageFunctions(names, context = {}) {
  const source = names.map(extract).join('\n') + `\n({ ${names.filter(name => !/^[A-Z_]+$/.test(name)).join(', ')} })`;
  return vm.runInNewContext(source, Object.assign(context, { Uint8Array, setTimeout, clearTimeout, console }));
}

// The page's own KISS session code.
const { createRnodeSession, closeRnodeSession } = pageFunctions(['KISS', 'RNODE_READ_TIMEOUT_MS', 'kissEscape',
  'kissFrame', 'decodeKissPayload', 'createKissReadPump', 'createRnodeSession', 'closeRnodeSession']);

// An all-dark screen, as rsNode mirrors a sleeping panel.
const DARK_SCREEN = 'c066' + '00'.repeat(1024) + 'c0';

// rsNode's STATUS (CMD_RSNODE 0x7A, sub 0x01), written by hand from link_commands.rs ManageStatus::encode and
// firmware/common/src/usb_board.rs: tag len value entries, then tag 0x10 node facts.
const STATUS_REQUEST = 'c07a01c0';
const tlv = (tag, value) => [tag, value.length, ...value];
const be32 = value => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
function statusBody({ board = 0x3f, platform = [0x80, 0x81], release = '1.0.0-beta.20261101.1', keyId = '0011223344556677',
  sequence = 2026110101, flags = 0, wifi = null, node = [0, 1, 1, 1], uptime = 42, extra = [] } = {}) {
  return [
    ...tlv(0x01, [...platform, board]),
    ...tlv(0x02, [0, 1, 0, 0, 0, 0]),
    ...tlv(0x03, Array.from(Buffer.from(keyId, 'hex'))),
    ...tlv(0x04, [...be32(sequence), ...be32(0x1e0000), flags]),
    ...tlv(0x06, [0, 0]),
    ...tlv(0x08, [1]),
    ...tlv(0x09, be32(uptime)),
    ...(wifi ? tlv(0x0c, wifi) : []),
    ...tlv(0x0e, [...be32(0x180000), ...Array(32).fill(0xab)]),
    ...extra,
    ...(release ? tlv(0x0f, Array.from(Buffer.from(release))) : []),
    ...tlv(0x10, node)
  ];
}
function kissHex(command, payload) {
  const escaped = [command, ...payload].flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]);
  return hex([0xc0, ...escaped, 0xc0]);
}
const statusReply = options => kissHex(0x7a, [0x01, 0x00, ...statusBody(options)]);
// What a beta before STATUS answers as a Repeater; as an RNode it says nothing.
const OLDER_BETA = 'c09007c0';

// A port that answers as the recorded node. Every frame the page writes must be one of the frames
// rsNode's scripts write; the screen steps through the node's recorded screens. port.restart(entry)
// reboots it into entry: quiet for restartMs, then answering as entry, with USB never dropped.
function nodePort(entry, { silent = false, early = [], unanswered = [], dark = false, restartMs = 1500, status = OLDER_BETA } = {}) {
  const names = new Map(Object.entries(entry.requests).map(([name, request]) => [request.host, name]));
  names.set(STATUS_REQUEST, 'status');
  let controller, screen = 0, quietUntil = 0;
  const port = {
    written: [],
    closed: false,
    restart(next) { quietUntil = Date.now() + restartMs; entry = next; screen = 0; },
    // What the node sends unasked while the page is connected.
    push(frame) { controller.enqueue(bytes(frame)); },
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(chunk) {
      const name = names.get(hex(chunk));
      assert.ok(name, `the page wrote a frame rsNode's scripts never send: ${hex(chunk)}`);
      port.written.push(name);
      if (silent || unanswered.includes(name) || Date.now() < quietUntil) return;
      if (dark && name === 'disp_read') return controller.enqueue(bytes(DARK_SCREEN));
      if (name === 'status') {
        const answer = typeof status === 'function' ? status(entry) : status;
        return answer ? controller.enqueue(bytes(answer)) : undefined;
      }
      // What the node sent unasked arrives ahead of the first answer.
      for (const frame of early.splice(0)) controller.enqueue(bytes(frame));
      const answer = name === 'disp_read' ? entry.screens[screen++ % entry.screens.length]?.device : entry.requests[name].device;
      if (answer) controller.enqueue(bytes(answer));
    } }),
    async close() { port.closed = true; }
  };
  return port;
}

// Pixels packed as the fixture stores probe-heltec-v4.py's PNG rows: MSB first, one hex row per line.
function packed(pixels) {
  return Array.from({ length: SCREEN_HEIGHT }, (_, y) => hex(Array.from({ length: SCREEN_WIDTH / 8 }, (_, column) => {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) value |= (pixels[y * SCREEN_WIDTH + column * 8 + bit] ? 1 : 0) << (7 - bit);
    return value;
  })));
}

async function readNode(entry, options) {
  const port = nodePort(entry, options);
  const session = createRnodeSession(port);
  try {
    assert.equal(await waitForRsnode(session), true);
    return { port, facts: await readRsnodeFacts(session), radio: await readRsnodeRadio(session) };
  } finally {
    await closeRnodeSession(session);
  }
}

async function until(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the panel');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

for (const entry of vectors.scenarios) {
  test(`reads what rsNode reports: ${entry.name}`, async () => {
    // Telemetry and packets queued before connecting must not pass for answers.
    const { port, facts, radio } = await readNode(entry, { early: entry.unsolicited.slice() });
    const state = entry.device;
    assert.equal(port.written[0], 'detect');
    assert.equal(`RNode ${facts.status.nodeId}`, state.deviceName);
    assert.deepEqual(facts.status, { nodeId: entry.management.nodeId });
    // These recordings predate STATUS.
    assert.equal(facts.rsnode, null);
    assert.deepEqual(facts.node, entry.node);
    assert.equal(renderTransport(facts.transport), entry.transport);
    assert.deepEqual([facts.board, facts.platform, facts.mcu, facts.firmware, facts.firmwareHash],
      [state.board, state.platform, state.mcu, { major: state.firmwareMajor, minor: state.firmwareMinor }, state.firmwareHash]);
    assert.deepEqual(
      [radio.online, radio.frequency, radio.bandwidth, radio.spreadingFactor, radio.codingRate, radio.txPower, radio.rx, radio.tx],
      [state.online, state.frequency, state.bandwidth, state.spreadingFactor, state.codingRate, state.txPower, state.rx, state.tx]);
    // rsNode sets a packet's RSSI and SNR together; its 0x80 SNR means none has arrived.
    assert.deepEqual([radio.rssi, radio.snr],
      state.lastSnrRaw === 0x80 ? [null, null] : [state.lastRssi, ((state.lastSnrRaw << 24) >> 24) / 4]);
    // validate-rf-link.py's reading, without smoke-rsnode-usb.py's "no reading" sentinel pair.
    const reading = entry.channel;
    const sentinel = reading.current_rssi_wire === 0x79 && reading.noise_floor_wire === 0x79;
    assert.deepEqual(radio.channel, {
      airtimeShort: reading.short_airtime_bps, airtimeLong: reading.long_airtime_bps,
      loadShort: reading.short_channel_load_bps, loadLong: reading.long_channel_load_bps,
      currentRssi: sentinel ? null : reading.current_rssi_dbm_candidate,
      noiseFloor: sentinel ? null : reading.noise_floor_dbm_candidate,
      interference: reading.interference_dbm_candidate
    });
    assert.deepEqual([radio.channel.currentRssi, radio.channel.noiseFloor],
      [state.currentRssi, state.noiseFloor].map(dbm => dbm === -292 ? null : dbm));
    assert.deepEqual(radio.battery, { state: state.batteryState, percent: state.batteryPercent });
  });
}

test('shows every screen rsNode draws exactly as probe-heltec-v4.py exports it', async () => {
  for (const entry of vectors.scenarios.filter(entry => entry.screens.length)) {
    const session = createRnodeSession(nodePort(entry));
    try {
      for (const screen of entry.screens) assert.deepEqual(packed(await readRsnodeScreen(session)), screen.rows, screen.name);
    } finally {
      await closeRnodeSession(session);
    }
  }
});

test('mirrors the screen only on boards that send their whole 128x64 UI', () => {
  for (const entry of vectors.scenarios) assert.equal(screenSupported(entry.device.board), entry.screens.length > 0, entry.name);
  assert.match(echo.screenUnsupported, /partial 200x200 e-ink readback/);
  assert.throws(() => screenPixels(new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT / 8 - 1)), { message: 'unexpected screen size 1023' });
});

test('reads the Repeater record status as configure-transport-ifac.py does', () => {
  for (const vector of vectors.transportReplies) {
    const payload = Array.from(bytes(vector.payload));
    if (vector.error) assert.throws(() => parseTransportStatus(payload), { message: vector.error }, vector.payload);
    else assert.equal(renderTransport(parseTransportStatus(payload)), vector.line, vector.payload);
  }
});

test('names boards as smoke-rsnode-usb.py presets them', async () => {
  for (const entry of vectors.scenarios) {
    assert.equal(vectors.presets[entry.preset].board, entry.device.board.toString(16));
    const { facts, radio } = await readNode(entry);
    assert.ok(rsnodeSummary(facts, radio).board.startsWith(PRESET_BOARDS[entry.preset] + ' · '), entry.name);
  }
});

test('summarizes the node for the panel and for a bug report', async () => {
  const lines = {};
  for (const entry of [v4, v3, echo]) {
    const { facts, radio } = await readNode(entry);
    lines[entry.preset] = rsnodeSummary(facts, radio);
    const details = rsnodeDetails(facts, radio).trimEnd().split('\n');
    assert.equal(details[0], entry.device.deviceName);
    // No retired key lines; absent STATUS cannot establish a firmware version or age.
    assert.ok(!details.some(line => /ap_psk|management_key/.test(line)));
    assert.ok(details.includes('version: not reported by this firmware'));
    for (const line of renderNode(entry.node)) assert.ok(details.includes(line), line);
    assert.ok(details.includes(`transport: ${entry.transport}`));
    assert.ok(details.some(line => line.endsWith(`image ${entry.device.firmwareHash}`)));
  }
  assert.deepEqual(lines['heltec-v4'], {
    node: 'RNode 887A', board: 'Heltec V4 · ESP32', firmware: `RNode 1.86 · image ${v4.device.firmwareHash.slice(0, 8)}`,
    owners: 'Owner and 1 admin', repeater: 'Not set up', forwarding: null, wifi: null,
    radio: 'Off · not configured', packets: 'RX 0 · TX 0', channel: null, battery: '84% · discharging'
  });
  assert.deepEqual(lines['heltec-v3'], {
    node: 'RNode 0F3C', board: 'Heltec V3 · ESP32', firmware: `RNode 1.86 · image ${v3.device.firmwareHash.slice(0, 8)}`,
    owners: 'None yet', repeater: 'Not set up · IFAC on (8)', forwarding: null, wifi: null,
    radio: 'On · 915.000 MHz · 250 kHz · SF9 · CR 4/5 · 14 dBm', packets: 'RX 2 · TX 3 · last -117 dBm, -4.5 dB',
    channel: 'Airtime 1.2% · load 2.3% · noise -121 dBm', battery: '76% · charging'
  });
  assert.equal(lines['t-echo'].owners, 'Not supported by this firmware');
  assert.equal(lines['t-echo'].battery, null);
  // Every line has its row on the page, and every row a line.
  const panel = /id="rsnodeDevice"[\s\S]*?id="rsnodeOwner"/.exec(html)[0];
  assert.deepEqual([...panel.matchAll(/data-fact="(\w+)"/g)].map(match => match[1]), Object.keys(lines['heltec-v4']));
});

test('ends a session with LEAVE, and a restart with LEAVE then the reset configure-saved-radio.py sends', async () => {
  const port = nodePort(v4);
  const session = createRnodeSession(port);
  await leaveRsnode(session);
  assert.equal(await restartRsnode(session), true);
  await closeRnodeSession(session);
  assert.deepEqual(port.written, ['leave', 'leave', 'reset']);
});

test('starts pairing with the frame probe-heltec-v4.py --bt-pair sends, which rsNode answers with nothing', async () => {
  for (const entry of vectors.scenarios.filter(entry => entry !== repeater)) {
    assert.equal(entry.requests.bt_pair.device, '', entry.name);
    // Bluetooth on and kept on, with the pairing window open.
    assert.deepEqual([entry.device.bluetoothPairing, entry.requests.bt_pair.bluetooth], [false, { enabled: true, pairing: true }], entry.name);
  }
  const port = nodePort(v4);
  const session = createRnodeSession(port);
  assert.equal(await startRsnodePairing(session), true);
  await closeRnodeSession(session);
  assert.deepEqual(port.written, ['bt_pair']);
});

test('a Repeater answers only reads: pairing and a reset are refused and change nothing', async () => {
  for (const request of ['bt_pair', 'reset']) assert.equal(repeater.requests[request].device, 'c09007c0', request);
  assert.deepEqual(repeater.requests.bt_pair.bluetooth,
    { enabled: repeater.device.bluetoothEnabled, pairing: repeater.device.bluetoothPairing });
  const port = nodePort(repeater);
  const session = createRnodeSession(port);
  assert.equal(await startRsnodePairing(session), false);
  assert.equal(await restartRsnode(session), false);
  await closeRnodeSession(session);
  assert.deepEqual(port.written, ['bt_pair', 'leave', 'reset']);
});

test('a silent node, such as a running Repeater, is given up on after the wait with one hint', async () => {
  const port = nodePort(v4, { silent: true });
  const session = createRnodeSession(port);
  let hints = 0;
  assert.equal(await waitForRsnode(session, { timeoutMs: 1200, waiting: () => hints++ }), false);
  await closeRnodeSession(session);
  assert.equal(hints, 1);
  assert.ok(port.written.length >= 2 && port.written.every(name => name === 'detect'));
});

// The panel's DOM: just what its functions touch.
function panelDocument() {
  const classList = () => ({ names: new Set(), toggle(name, on) { if (on) this.names.add(name); else this.names.delete(name); },
    contains(name) { return this.names.has(name); } });
  const element = (extra = {}) => ({ textContent: '', hidden: false, disabled: false, title: '', classList: classList(), children: [],
    replaceChildren(...nodes) { this.children = nodes; }, append(...nodes) { this.children.push(...nodes); }, ...extra });
  const painted = [];
  const context = {
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => painted.push(Uint8ClampedArray.from(image.data)),
    clearRect: () => {}
  };
  const facts = [...html.matchAll(/data-fact="(\w+)"/g)].map(match => match[1]);
  const rows = facts.map(fact => ({ dataset: { fact }, hidden: false, dd: element(), querySelector() { return this.dd; } }));
  const elements = Object.fromEntries(['rsnodeConnect', 'rsnodeScreenshot', 'rsnodeCopyDetails', 'rsnodePair', 'rsnodePairNote', 'rsnodeRestart',
    'rsnodeScreenState', 'rsnodeLiveDot', 'rsnodeScreenBezel', 'rsnodeScreenEmpty', 'rsnodeFactsEmpty', 'rsnodeFacts',
    'rsnodeDeviceStatus', 'rsnodeDetailsText', 'rsnodeDeviceMeta', 'rsnodeDeviceLede', 'rsnodeCheckList', 'rsnodeLightsList',
    'rsnodeRecheck', 'rsnodeRepeaterMeta', 'rsnodeSettings'].map(id => [id, element()]));
  // As the page ships them: hidden until a board with no screen needs them.
  for (const id of ['rsnodeCheck', 'rsnodeLights', 'rsnodePairCode', 'rsnodeDeviceNotice']) elements[id] = element({ hidden: true });
  elements.rsnodeDevice = element({ open: true, scrollIntoView() { this.scrolled = true; } });
  elements.rsnodeScreen = element({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, getContext: () => context });
  // The tools' parts that only fit a board with its own button and menus, or one with Wi-Fi.
  const screenOnly = [...html.matchAll(/ data-screen-only>/g)].map(() => element());
  const wifiOnly = [...html.matchAll(/ data-wifi-only>/g)].map(() => element());
  return {
    hidden: false, elements, painted, screenOnly, wifiOnly,
    fact: name => rows.find(row => row.dataset.fact === name),
    // The status check as its lines, each marked when it is in order; the lights legend as [light, meaning].
    check: () => elements.rsnodeCheckList.children.map(item => [item.className === 'is-ok', item.textContent]),
    lights: () => elements.rsnodeLightsList.children.map(row => row.children.map(cell => cell.textContent)),
    createElement: () => element(),
    getElementById: id => elements[id],
    querySelectorAll: selector => selector === '#rsnodeFacts [data-fact]' ? rows : selector === '[data-screen-only]' ? screenOnly
      : selector === '[data-wifi-only]' ? wifiOnly : [],
    querySelector: selector => selector === '#rsnodeFacts [data-fact="firmware"] dd' ? rows.find(row => row.dataset.fact === 'firmware').dd : null
  };
}

const PANEL = ['rsnodeHeardBoard', 'rsnodeDevice', 'rsnodeDeviceFacts', 'rsnodeDeviceRadio', 'rsnodeScreenPixels', 'rsnodeScreenImage', 'rsnodeCheckShown',
  'RSNODE_SCREEN_INTERVAL_MS', 'RSNODE_RADIO_INTERVAL_MS', 'RSNODE_RESUME_MS', 'RSNODE_PAIRING_MS', 'RSNODE_PIXEL_ON', 'RSNODE_PIXEL_OFF',
  'RSNODE_TAKEOVER', 'RSNODE_DEVICE_COPY', 'rsnodeToolsUnlocked', 'updateRsnodeDeviceVisibility', 'rsnodeIsRepeater', 'rsnodeDeviceMessage',
  'rsnodeBoardScreenless', 'rsnodeBoardHasWifi', 'updateRsnodeSettingsVisibility', 'hearRsnodeBoard', 'rsnodeFactsBoard', 'rsnodeDeviceBoard',
  'showRsnodeDeviceCheck', 'renderRsnodeCheck', 'syncRsnodeDevice',
  'setRsnodeScreenState', 'clearRsnodeScreen', 'paintRsnodeScreen', 'showRsnodeDeviceFacts', 'rsnodeDeviceError',
  'rsnodePortError', 'rsnodeDeviceWatched', 'rsnodeCheckedAt', 'recheckRsnodeDevice', 'showRsnodePairing', 'followRsnodePairing',
  'streamRsnodeDevice', 'resumeRsnodeDevice', 'runRsnodeDevice', 'stopRsnodeDevice', 'releaseRsnodeDevice',
  'pairRsnodeDevice', 'syncRsnodePort'];

function devicePage(port, overrides = {}) {
  const document = panelDocument();
  const calls = [];
  const context = {
    document, betaStage: 'ready', rsnodeOwnerBusy: false, rsnodeSettingsBusy: false, rsnodeRepeaterBusy: false, rsnodeChecking: false, navigator: { serial: {} },
    state: { flashing: false, device: 'custom', rsnodeInstalled: false }, isRsnodeSelected: () => true,
    rsnodeBoardForTarget, rsnodeRepeaterResult: null,
    showSerialWarning: () => calls.push('serial warning'), syncRsnodeRepeaterForm: () => {},
    rsnodeToolPortFromUser: async () => calls.push('port'),
    rsnodeOtherPorts: async () => [],
    openRnodeSerialPort: async (log, settleMs) => { calls.push(['open', settleMs]); return port; },
    createRnodeSession, closeRnodeSession,
    sleepMs: () => new Promise(resolve => setTimeout(resolve, 0)),
    SCREEN_WIDTH, SCREEN_HEIGHT, leaveRsnode, readRsnodeFacts, readRsnodePairingCode, readRsnodeRadio, readRsnodeScreen, restartRsnode,
    rsnodeSummary, rsnodeBluetoothOff, rsnodeLights, rsnodeScreenless, rsnodeStatusCheck, screenSupported, startRsnodePairing,
    waitForRsnode, ...overrides
  };
  return { ...pageFunctions(PANEL, context), context, document, calls };
}

const screenOf = image => packed(Array.from({ length: SCREEN_WIDTH * SCREEN_HEIGHT }, (_, i) => image[i * 4] === 226));

// Runs the panel against port; live() sees it connected, and it is always disconnected afterwards.
async function withPanel(port, live, overrides) {
  const page = devicePage(port, overrides);
  const run = page.runRsnodeDevice();
  try {
    await live(page);
  } finally {
    await page.stopRsnodeDevice('');
    await run;
  }
  return page;
}

test('the panel streams the screen and status, then leaves the node when disconnected', async () => {
  const port = nodePort(v4, { early: v4.unsolicited.slice() });
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => page.document.painted.length >= v4.screens.length);
    assert.deepEqual(page.calls, ['port', ['open', 0]]);
    assert.deepEqual(page.document.painted.slice(0, v4.screens.length).map(screenOf), v4.screens.map(screen => screen.rows));
    assert.equal(page.document.fact('node').dd.textContent, 'RNode 887A');
    assert.equal(page.document.fact('owners').dd.textContent, 'Owner and 1 admin');
    assert.equal(page.document.fact('channel').hidden, true);
    assert.equal(page.document.fact('firmware').dd.title, v4.device.firmwareHash);
    assert.deepEqual([elements.rsnodeFacts.hidden, elements.rsnodeFactsEmpty.hidden, elements.rsnodeScreenEmpty.hidden], [false, true, true]);
    assert.match(elements.rsnodeScreenState.textContent, /^Live/);
    assert.ok(elements.rsnodeLiveDot.classList.contains('is-live'));
    assert.deepEqual([elements.rsnodeConnect.textContent, elements.rsnodeRestart.disabled, elements.rsnodeCopyDetails.disabled,
      elements.rsnodeScreenshot.disabled], ['Disconnect', false, false, false]);
  });
  const { elements } = page.document;
  assert.deepEqual(port.written.slice(0, 3), ['detect', 'read_mgmt', 'read_node']);
  assert.equal(port.written.at(-1), 'leave');
  assert.equal(port.written.filter(name => name === 'leave').length, 1);
  assert.ok(port.closed);
  assert.equal(page.context.rsnodeDevice, null);
  assert.deepEqual([elements.rsnodeConnect.textContent, elements.rsnodeRestart.disabled, elements.rsnodeScreenState.textContent],
    ['Connect', true, 'Not connected']);
  // The last frame stays, dimmed, for a screenshot.
  assert.ok(elements.rsnodeScreenBezel.classList.contains('is-stale'));
  assert.equal(elements.rsnodeScreenshot.disabled, false);
  assert.equal(elements.rsnodeDeviceStatus.textContent, '');
});

test('a restart leaves the node, then resets it', async () => {
  const port = nodePort(v3);
  const page = await withPanel(port, async page => {
    await until(() => page.document.painted.length >= 1);
    await page.stopRsnodeDevice('Restarting RNode 0F3C. Connect again in a few seconds.', true);
  });
  assert.deepEqual(port.written.slice(-2), ['leave', 'reset']);
  assert.equal(page.document.elements.rsnodeDeviceStatus.textContent, 'Restarting RNode 0F3C. Connect again in a few seconds.');
});

test('pairing starts in one frame, says which node to choose, and the screen keeps streaming its code', async () => {
  const port = nodePort(v4);
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => page.document.painted.length >= 1);
    assert.deepEqual([elements.rsnodePair.hidden, elements.rsnodePair.disabled], [false, false]);
    await page.pairRsnodeDevice();
    assert.equal(elements.rsnodeDeviceStatus.textContent, 'Pairing started. Within 2 minutes, choose RNode 887A in ' +
      "your app's Bluetooth list and enter the code shown on its screen. Bluetooth stays on.");
    const painted = page.document.painted.length;
    await until(() => page.document.painted.length > painted);
  });
  assert.equal(port.written.filter(name => name === 'bt_pair').length, 1);
  assert.ok(port.written.indexOf('disp_read', port.written.indexOf('bt_pair')) > 0);
  assert.deepEqual([page.document.elements.rsnodePair.hidden, page.document.elements.rsnodePair.disabled], [true, true]);
});

test('a Repeater streams its own screen and radio, and offers neither Pair nor Restart', async () => {
  const port = nodePort(repeater);
  await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => page.document.painted.length >= 1);
    assert.deepEqual(screenOf(page.document.painted[0]), repeater.screens[0].rows);
    assert.match(page.document.fact('radio').dd.textContent, /^On · 869\.525 MHz · 125 kHz · SF9 · CR 4\/6 · 14 dBm$/);
    assert.equal(page.document.fact('packets').dd.textContent, 'RX 1234 · TX 56');
    assert.match(page.document.fact('repeater').dd.textContent, /starts as Repeater$/);
    assert.match(elements.rsnodeScreenState.textContent, /^Live/);
    assert.deepEqual([elements.rsnodePair.hidden, elements.rsnodeRestart.hidden, elements.rsnodeCopyDetails.hidden],
      [true, true, false]);
  });
  assert.ok(!port.written.includes('bt_pair') && !port.written.includes('reset'));
  assert.equal(port.written.at(-1), 'leave');
});

test('the panel follows a node through its restart into a Repeater, without disconnecting', async () => {
  const port = nodePort(v4);
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => page.document.painted.length >= 1);
    assert.equal(elements.rsnodePair.hidden, false);
    // Every state the caption shows, however briefly.
    const states = [];
    let caption = elements.rsnodeScreenState.textContent;
    Object.defineProperty(elements.rsnodeScreenState, 'textContent', {
      get: () => caption, set: value => { caption = value; states.push(value); } });
    port.restart(repeater);
    await until(() => /starts as Repeater$/.test(page.document.fact('repeater').dd.textContent), 10000);
    await until(() => page.document.painted.some(image => screenOf(image).join() === repeater.screens[0].rows.join()), 4000);
    assert.ok(states.includes('Restarting…'));
    assert.match(elements.rsnodeScreenState.textContent, /^Live/);
    assert.equal(page.document.fact('node').dd.textContent, 'RNode B44E');
    assert.deepEqual([elements.rsnodePair.hidden, elements.rsnodeRestart.hidden], [true, true]);
    assert.equal(elements.rsnodeDeviceStatus.textContent, '');
  });
  assert.ok(port.written.lastIndexOf('detect') > port.written.indexOf('disp_read'));
  assert.equal(port.written.at(-1), 'leave');
  assert.equal(page.document.elements.rsnodeLiveDot.classList.contains('is-error'), false);
});

test('a node that never answers after going quiet is given up on with the reset hint', async () => {
  const port = nodePort(v4, { restartMs: 60000 });
  const page = devicePage(port, {
    waitForRsnode: (session, options) => waitForRsnode(session, { ...options, timeoutMs: Math.min(options.timeoutMs ?? 300, 300) })
  });
  const run = page.runRsnodeDevice();
  await until(() => page.document.painted.length >= 1);
  port.restart(v4);
  await run;
  assert.equal(page.document.elements.rsnodeDeviceStatus.textContent,
    'The node stopped answering over USB. Check the cable, or press RESET on the board, then connect again.');
});

test('pairing and a restart that another app refuses say so instead of claiming success', async () => {
  const port = nodePort(repeater);
  const page = await withPanel(port, async page => {
    await until(() => page.document.painted.length >= 1);
    await page.pairRsnodeDevice();
    assert.equal(page.document.elements.rsnodeDeviceStatus.textContent,
      'RNode B44E did not start pairing: another app is using it. Disconnect that app, or pair from the device.');
    await page.stopRsnodeDevice('Restarting RNode B44E. Connect again in a few seconds.', true);
  });
  assert.deepEqual(port.written.slice(-2), ['leave', 'reset']);
  assert.equal(page.document.elements.rsnodeDeviceStatus.textContent,
    'RNode B44E did not restart: another app is using it. Restart it from the device.');
});

test('a sleeping screen reads as screen off, not as a frozen frame', async () => {
  await withPanel(nodePort(v4, { dark: true }), async page => {
    await until(() => page.document.elements.rsnodeScreenState.textContent === 'Live · screen off');
    assert.ok(screenOf(page.document.painted.at(-1)).every(row => /^0+$/.test(row)));
  });
});

test('a board without a whole-screen mirror gets its status only', async () => {
  const port = nodePort(echo);
  await withPanel(port, async page => {
    await until(() => page.document.elements.rsnodeScreenState.textContent === 'Status only');
    assert.equal(page.document.elements.rsnodeScreenEmpty.textContent, 'No screen view for this board');
    assert.equal(page.document.fact('owners').dd.textContent, 'Not supported by this firmware');
    // No mirror to read a pairing code from.
    assert.equal(page.document.elements.rsnodePair.hidden, true);
  });
  assert.ok(!port.written.includes('disp_read'));
  assert.ok(!port.written.includes('bt_pair'));
  assert.equal(port.written.at(-1), 'leave');
});

test('a silent node keeps the panel waiting with the reset hint, and Disconnect still leaves it', async () => {
  const port = nodePort(v4, { silent: true });
  const page = await withPanel(port, async page => {
    const status = page.document.elements.rsnodeDeviceStatus;
    await until(() => status.textContent.startsWith('Waiting for rsNode.'));
    assert.equal(status.textContent, 'Waiting for rsNode. If you just installed, press RESET on the board first.');
  });
  assert.ok(port.written.slice(0, -1).every(name => name === 'detect'));
  assert.equal(port.written.at(-1), 'leave');
  assert.equal(page.document.elements.rsnodeDeviceStatus.textContent, '');
});

test('the panel says why it stopped: no answer, or not rsNode', async () => {
  const silent = devicePage(nodePort(v4, { silent: true }), {
    waitForRsnode: (session, options) => waitForRsnode(session, { ...options, timeoutMs: 300 })
  });
  await silent.runRsnodeDevice();
  const status = silent.document.elements.rsnodeDeviceStatus;
  assert.equal(status.textContent, 'No answer over USB. If you just installed, press RESET on the board first, then connect again.');
  assert.ok(status.classList.contains('is-error'));

  const stock = nodePort(v4, { unanswered: ['read_mgmt'] });
  const page = devicePage(stock);
  await page.runRsnodeDevice();
  assert.equal(page.document.elements.rsnodeDeviceStatus.textContent,
    'This node answers as an RNode but not as rsNode. The live view needs rsNode firmware.');
  assert.deepEqual(stock.written, ['detect', 'read_mgmt', 'leave']);

  const opened = devicePage(null, { openRnodeSerialPort: async () => { throw new Error('Failed to open serial port.'); } });
  await opened.runRsnodeDevice();
  assert.match(opened.document.elements.rsnodeDeviceStatus.textContent, /^Could not open the serial port\./);
});

test('the device panel appears only with beta access, like the owner panel, and hiding it disconnects', async () => {
  const page = devicePage(nodePort(v4));
  const panel = page.document.elements.rsnodeDevice;
  page.context.betaStage = 'locked';
  page.updateRsnodeDeviceVisibility();
  assert.equal(panel.hidden, true);
  page.context.betaStage = 'ready';
  page.updateRsnodeDeviceVisibility();
  assert.equal(panel.hidden, false);
  Object.assign(page.context, { isRsnodeSelected: () => false });
  page.updateRsnodeDeviceVisibility();
  assert.equal(panel.hidden, true);
  page.context.state.rsnodeInstalled = true;
  page.updateRsnodeDeviceVisibility();
  assert.equal(panel.hidden, false);

  const run = page.runRsnodeDevice();
  try {
    await until(() => page.document.painted.length >= 1);
    page.context.betaStage = 'locked';
    page.updateRsnodeDeviceVisibility();
    assert.equal(page.context.rsnodeDevice.stopping, true);
  } finally {
    await page.stopRsnodeDevice('');
    await run;
  }
  assert.equal(page.context.rsnodeDevice, null);
  assert.equal(page.document.elements.rsnodeDevice.hidden, true);
  assert.match(html, /<details class="flash-cta__repair rsnode-device" id="rsnodeDevice" name="rsnode-tools" hidden>/);
});

test('every other USB task takes the port only after the live view has left the node', () => {
  assert.match(extract('requestFreshRnodePortFromUser'), /^async function requestFreshRnodePortFromUser\(\) \{\s+await releaseRsnodeDevice\(\);/);
  // The rsNode tools reuse the selected port, and ask for one only when there is none.
  assert.match(extract('rsnodeToolPortFromUser'), /if \(!state\.port\) return requestFreshRnodePortFromUser\(\);\s+await releaseRsnodeDevice\(\);/);
  const connect = html.slice(html.indexOf('window.connectDevice = async function()'), html.indexOf('function applySelectedSerialPort'));
  assert.ok(connect.indexOf('await releaseRsnodeDevice();') > 0 && connect.indexOf('await releaseRsnodeDevice();') < connect.indexOf('requestPort('));
  const flash = html.slice(html.indexOf('window.startFlash = async function()'), html.indexOf('function isRnodeReconnectSetupIssue'));
  assert.ok(flash.indexOf('await releaseRsnodeDevice();') > 0 && flash.indexOf('await releaseRsnodeDevice();') < flash.indexOf('await loadEsptool()'));
});

test('STATUS reads as ManageStatus decodes it: unknown tags skipped, a known tag of another length refused', () => {
  const body = statusBody({ board: 0xc0, flags: 0x04 | 0x02, wifi: [1, 0x01, 192, 168, 1, 23], node: [0, 0, 0, 3],
    extra: [0x11, 3, 9, 9, 9, ...tlv(0x05, be32(2026110102))] });
  const status = parseRsnodeStatus(body);
  assert.deepEqual(status.board, { platform: 0x80, mcu: 0x81, board: 0xc0 });
  assert.deepEqual(status.firmware, { major: 1, minor: 0, patch: 0 });
  assert.equal(status.releaseKeyId, '0011223344556677');
  assert.deepEqual(status.ota, { acceptedSequence: 2026110101, slotLen: 0x1e0000, nearbyOnly: true, trialPending: true });
  assert.equal(status.pendingSequence, 2026110102);
  assert.equal(status.uptimeS, 42);
  assert.deepEqual(parseRsnodeStatus(tlv(0x0a, [...be32(123), 1, 0, ...Array(16).fill(0)])).lastUpdate,
    { sequence: 123, source: 1, running: false });
  assert.throws(() => parseRsnodeStatus([...body, ...tlv(0x09, be32(1))]), /duplicate tag/);
  assert.throws(() => parseRsnodeStatus(tlv(0x0a, [...be32(123), 1, 2, ...Array(16).fill(0)])), /update result/);
  assert.deepEqual(status.wifi, { mode: 1, ready: true, ip: '192.168.1.23' });
  assert.deepEqual(status.image, { len: 0x180000, sha256: 'ab'.repeat(32) });
  assert.equal(status.release, '1.0.0-beta.20261101.1');
  assert.deepEqual(status.node, { repeater: false, bluetoothAvailable: false, bluetoothEnabled: false, hostOwner: 3, forwarding: null });
  // After 1.0.0 the node facts carry a fifth byte: forwarding, or paused.
  assert.equal(parseRsnodeStatus(tlv(0x10, [1, 1, 1, 0, 1])).node.forwarding, true);
  assert.equal(parseRsnodeStatus(tlv(0x10, [1, 1, 1, 0, 0])).node.forwarding, false);
  assert.throws(() => parseRsnodeStatus(tlv(0x10, [1, 1, 1, 0, 2])), /forwarding/);
  assert.throws(() => parseRsnodeStatus(tlv(0x10, [1, 1, 1])), /tag 0x10 length 3/);
  assert.throws(() => parseRsnodeStatus(tlv(0x10, [1, 1, 1, 0, 1, 0])), /tag 0x10 length 6/);
  assert.equal(HOST_OWNERS[status.node.hostOwner], 'Wi-Fi');
  assert.deepEqual(parseRsnodeStatus(tlv(0x0c, [2, 0, 0, 0, 0, 0])).wifi, { mode: 2, ready: false, ip: null });
  assert.throws(() => parseRsnodeStatus(tlv(0x0c, [1, 1, 10, 0, 0])), /tag 0x0c length 5/);
  assert.throws(() => parseRsnodeStatus([0x10, 4, 0, 1]), /truncated/);
  assert.throws(() => parseRsnodeStatus(tlv(0x0f, Array.from(Buffer.from('1 0')))), /release/);
});

test('STATUS is null on a beta that predates it, whether it refuses or says nothing', async () => {
  for (const [status, expected] of [[OLDER_BETA, null], [null, null], [statusReply({ release: '1.0.1' }), '1.0.1']]) {
    const port = nodePort(v4, { status });
    const session = createRnodeSession(port);
    try {
      const reply = await readRsnodeStatus(session);
      assert.equal(reply && reply.release, expected);
    } finally {
      await closeRnodeSession(session);
    }
    assert.deepEqual(port.written, ['status']);
  }
});

test('a node with STATUS shows its release, variant and Wi-Fi, and Copy details carries the build', async () => {
  const { facts, radio } = await readNode(v4, { status: statusReply({ board: 0xbf, wifi: [1, 1, 192, 168, 1, 23] }) });
  const summary = rsnodeSummary(facts, radio);
  assert.equal(summary.firmware, `1.0.0-beta.20261101.1 · image ${v4.device.firmwareHash.slice(0, 8)}`);
  assert.equal(summary.board, 'Heltec V4 · R8 · ESP32');
  assert.equal(summary.wifi, 'Joined a network · 192.168.1.23');
  const details = rsnodeDetails(facts, radio).trimEnd().split('\n');
  for (const line of ['version: 1.0.0-beta.20261101.1', 'variant: Heltec V4 · R8 (target 0x80:0x81:0xbf)',
    'update key: 0011223344556677', 'ota sequence: 2026110101', 'mode: RNode, held over USB, Bluetooth on',
    'wi-fi: Joined a network · 192.168.1.23']) assert.ok(details.includes(line), line);
  assert.ok(!details.some(line => /ap_psk|management_key/.test(line)));
  // Wi-Fi off, starting, and the node's own network.
  const wifi = async value => rsnodeSummary((await readNode(v4, { status: statusReply({ wifi: value }) })).facts, radio).wifi;
  assert.equal(await wifi(null), 'Off');
  assert.equal(await wifi([1, 0, 0, 0, 0, 0]), 'Joining a network…');
  assert.equal(await wifi([2, 1, 10, 0, 0, 1]), 'Own network · 10.0.0.1');
});

test('a Repeater that reports forwarding shows Repeating or Paused; 1.0.0 and an RNode show neither', async () => {
  const forwarding = async node => {
    const { facts, radio } = await readNode(v4, { status: statusReply({ node }) });
    return { line: rsnodeSummary(facts, radio).forwarding, mode: rsnodeDetails(facts, radio).split('\n').find(line => line.startsWith('mode: ')) };
  };
  assert.deepEqual(await forwarding([1, 1, 1, 0, 1]), { line: 'Repeating', mode: 'mode: Repeater, repeating, Bluetooth on' });
  assert.deepEqual(await forwarding([1, 1, 1, 0, 0]), { line: 'Paused', mode: 'mode: Repeater, paused, Bluetooth on' });
  assert.deepEqual(await forwarding([1, 1, 1, 0]), { line: null, mode: 'mode: Repeater, Bluetooth on' });
  assert.equal((await forwarding([0, 1, 1, 1, 0])).line, null);
  assert.match(html, /<div data-fact="forwarding"><dt>Forwarding<\/dt><dd><\/dd><\/div>/);
});

test('with Wi-Fi on, pairing is offered disabled with the reason instead of failing quietly', async () => {
  const port = nodePort(v4, { status: statusReply({ wifi: [1, 1, 192, 168, 1, 23], node: [0, 0, 0, 1] }) });
  await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => page.document.painted.length >= 1);
    assert.deepEqual([elements.rsnodePair.hidden, elements.rsnodePair.disabled, elements.rsnodePairNote.hidden], [false, true, false]);
    assert.ok(rsnodeBluetoothOff(page.context.rsnodeDeviceFacts));
    assert.equal(page.document.fact('wifi').dd.textContent, 'Joined a network · 192.168.1.23');
  });
  assert.ok(!port.written.includes('bt_pair'));
  assert.match(html, /id="rsnodePairNote"[^>]*>Bluetooth is off while Wi-Fi is on\. Turn Wi-Fi off in Settings to pair\.</);
});

test('STATUS decides Repeater: a running Repeater offers neither Pair nor Restart even before its record says so', async () => {
  const port = nodePort(v4, { status: statusReply({ node: [1, 1, 1, 0] }) });
  await withPanel(port, async page => {
    await until(() => page.document.painted.length >= 1);
    assert.deepEqual([page.document.elements.rsnodePair.hidden, page.document.elements.rsnodeRestart.hidden], [true, true]);
  });
});

// The new boards' STATUS: the RNode board byte is a sibling's, the update target is their own.
const NRF = [0x70, 0x71];
const liteStatus = options => statusReply({ board: 0xba, release: '1.2.0-test', ...options });
const rakStatus = options => statusReply({ board: 0x51, platform: NRF, release: '1.2.0-test', ...options });
// CMD_BT_PIN as rsNode's encode_bluetooth_pin writes it: the code as a big-endian u32, KISS-escaped.
const pinFrame = code => kissHex(0x62, be32(code));
const RAK_LIGHTS = [
  ['Green light', 'One short flash every 5 seconds means it is running as an RNode. Two short flashes every 5 seconds mean the Repeater is forwarding.'],
  ['Blue light', 'One flash for each packet received or sent. Steady blinking while a pairing window is open, or while a manager asked it to blink.']
];
const LITE_LIGHTS = [['White light', 'One short flash every 5 seconds means it is running as an RNode. Two short flashes every 5 seconds mean ' +
  'the Repeater is forwarding. An extra flash means packets were received or sent in the last second. Steady blinking means a pairing window is open, ' +
  'or a manager asked it to blink.']];

test('STATUS names the ThinkNode M1, the RAK4631, and the Stick Lite V3 where the RNode board byte cannot', async () => {
  const named = async (entry, status) => {
    const { facts, radio } = await readNode(entry, { status });
    return [rsnodeSummary(facts, radio).board, rsnodeDetails(facts, radio).split('\n').find(line => line.startsWith('variant: ')),
      rsnodeScreenless(facts.rsnode), facts.board];
  };
  assert.deepEqual(await named(echo, statusReply({ board: 0xc4, platform: NRF })),
    ['Elecrow ThinkNode M1 · nRF52', 'variant: Elecrow ThinkNode M1 (target 0x70:0x71:0xc4)', false, 0x44]);
  assert.deepEqual(await named(echo, rakStatus()), ['RAK4631 · nRF52', 'variant: RAK4631 (target 0x70:0x71:0x51)', true, 0x44]);
  assert.deepEqual(await named(v3, liteStatus()),
    ['Heltec Wireless Stick Lite V3 · ESP32', 'variant: Heltec Wireless Stick Lite V3 (target 0x80:0x81:0xba)', true, 0x3a]);
  // The boards whose identity they borrow keep their own names and screens.
  assert.deepEqual((await named(echo, statusReply({ board: 0x44, platform: NRF }))).slice(0, 3),
    ['LilyGO T-Echo · nRF52', 'variant: LilyGO T-Echo (target 0x70:0x71:0x44)', false]);
  assert.deepEqual((await named(v3, statusReply({ board: 0x3a }))).slice(0, 3), ['Heltec V3 · ESP32', 'variant: Heltec V3 (target 0x80:0x81:0x3a)', false]);
  // Without STATUS only the RNode board byte is left, and the RAK4631 has its own.
  const { facts, radio } = await readNode(echo);
  assert.equal(rsnodeSummary({ ...facts, board: 0x51 }, radio).board, 'RAK4631 · nRF52');
  for (const rsnode of [null, { board: null }, { board: { board: 0x99 } }]) assert.equal(rsnodeScreenless(rsnode), false);
  // A Stick Lite V3 answers as a V3, whose screen the page mirrors: only STATUS says there is none.
  assert.equal(screenSupported(0x3a), true);
});

test('the pairing code is the six digits of the frame the node sends unasked, and the radio reads around it keep it', async () => {
  assert.equal(pinFrame(123456), 'c0620001e240c0');
  // 49209 and 56065 carry a FEND and a FESC byte.
  assert.deepEqual([pinFrame(49209), pinFrame(56065)], ['c0620000dbdc39c0', 'c0620000dbdd01c0']);
  const port = nodePort(v4);
  const session = createRnodeSession(port);
  const arrive = async frames => { port.push(frames); await new Promise(resolve => setTimeout(resolve, 5)); };
  try {
    assert.equal(await readRsnodePairingCode(session), null);
    for (const [code, text] of [[123456, '123456'], [7, '000007'], [0, '000000'], [999999, '999999'], [49209, '049209'], [56065, '056065']]) {
      await arrive(pinFrame(code));
      assert.equal(await readRsnodePairingCode(session), text);
      assert.equal(await readRsnodePairingCode(session), null, 'a code is read once');
    }
    // The newest code wins; a frame that is not a six-digit code is none.
    await arrive(pinFrame(111111) + pinFrame(222222));
    assert.equal(await readRsnodePairingCode(session), '222222');
    await arrive(kissHex(0x62, [0x01, 0xe2, 0x40]) + pinFrame(1000000) + kissHex(0x62, [0, 0, 1, 0xe2, 0x40]));
    assert.equal(await readRsnodePairingCode(session), null);
    // The radio read drops the telemetry queued beside a code, and leaves the code for the panel.
    assert.ok(v4.unsolicited.length > 0);
    await arrive(v4.unsolicited[0] + pinFrame(424242) + v4.unsolicited[0]);
    await readRsnodeRadio(session);
    assert.equal(await session.readFrame(frame => frame.command !== 0x62, 0), null);
    assert.equal(await readRsnodePairingCode(session), '424242');
  } finally {
    await closeRnodeSession(session);
  }
  assert.ok(!port.written.includes('bt_pair'));
});

test('the status check reads as a short checklist of what a node with no screen is doing', async () => {
  const check = async (entry, status) => {
    const { facts, radio } = await readNode(entry, { status });
    return rsnodeStatusCheck(facts, radio).map(item => [item.ok, item.text]);
  };
  // A Stick Lite V3 fresh from an install: an RNode with its radio up, Bluetooth on, and nobody enrolled.
  assert.deepEqual(await check(v3, liteStatus({ node: [0, 1, 1, 1, 0], uptime: 200 })), [
    [true, 'RNode 0F3C answered over USB.'],
    [true, 'It runs rsNode 1.2.0-test and has been up for 3 minutes.'],
    [true, 'It is running as an RNode.'],
    [true, 'Its radio is on at 915.000 MHz.'],
    [true, 'Bluetooth is on.'],
    [false, 'It has no managers yet.']
  ]);
  // A RAK4631 forwarding as a Repeater for three days.
  assert.deepEqual(await check(repeater, rakStatus({ node: [1, 1, 0, 0, 1], uptime: 3 * 86400 + 5 })), [
    [true, 'RNode B44E answered over USB.'],
    [true, 'It runs rsNode 1.2.0-test and has been up for 3 days.'],
    [true, 'It is running as a Repeater and forwarding.'],
    [true, 'Its radio is on at 869.525 MHz.'],
    [false, 'Bluetooth is off.'],
    [true, 'It has an Owner.']
  ]);
  // Paused, with Wi-Fi still joining and an update settling: each says so, and what to do.
  assert.deepEqual((await check(repeater, liteStatus({ node: [1, 0, 0, 0, 0], uptime: 59, flags: 0x04, wifi: [1, 0, 0, 0, 0, 0] }))).slice(1), [
    [true, 'It runs rsNode 1.2.0-test and has been up for less than a minute.'],
    [false, 'It is finishing an update.'],
    [false, 'It is a Repeater, paused. Start repeating in Set up as a Repeater.'],
    [true, 'Its radio is on at 869.525 MHz.'],
    [false, 'Bluetooth is off while Wi-Fi is on.'],
    [false, 'Wi-Fi is joining a network.'],
    [true, 'It has an Owner.']
  ]);
  // An RNode an app holds over Bluetooth, idle radio, Bluetooth off, and its Wi-Fi states.
  const lines = async (entry, status) => (await check(entry, status)).map(([, text]) => text);
  assert.deepEqual((await lines(v4, liteStatus({ node: [0, 1, 0, 2, 0], uptime: 3600 }))).slice(1), [
    'It runs rsNode 1.2.0-test and has been up for 1 hour.',
    'It is running as an RNode, and an app is using it over Bluetooth.',
    'Its radio is off until an app turns it on.',
    'Bluetooth is off. Start Bluetooth pairing to turn it on.',
    'It has an Owner and 1 admin.'
  ]);
  assert.ok((await lines(v4, liteStatus({ node: [0, 0, 0, 3, 0], wifi: [1, 1, 192, 168, 1, 23] })))
    .includes('Wi-Fi joined a network at 192.168.1.23.'));
  assert.ok((await lines(v4, liteStatus({ node: [0, 0, 0, 1, 0], wifi: [2, 1, 10, 0, 0, 1] }))).includes('Wi-Fi runs its own network at 10.0.0.1.'));
  assert.ok((await lines(v4, liteStatus({ node: [0, 0, 0, 1, 0], wifi: [2, 0, 0, 0, 0, 0] }))).includes('Wi-Fi is starting its own network.'));
  // A RAK4631 has no Wi-Fi to report, and firmware without managers says nothing about them.
  assert.deepEqual(await lines(echo, rakStatus({ node: [0, 1, 1, 1, 0], uptime: 7200 })), [
    'RNode 5D21 answered over USB.', 'It runs rsNode 1.2.0-test and has been up for 2 hours.', 'It is running as an RNode.',
    'Its radio is off until an app turns it on.', 'Bluetooth is on.'
  ]);
  // No signal-strength bars, no raw fields: every line is a sentence.
  for (const item of await check(repeater, rakStatus({ node: [1, 1, 1, 0, 1] }))) assert.match(item[1], /^[A-Z][^=:]*\.$/, item[1]);
});

test('each board with no screen has a legend for its lights, and no other board does', () => {
  assert.deepEqual(rsnodeLights(rsnodeBoard('rak4631')), { heartbeat: 'green light', legend: RAK_LIGHTS });
  assert.deepEqual(rsnodeLights(rsnodeBoard('heltec-wsl-v3')), { heartbeat: 'white light', legend: LITE_LIGHTS });
  const ids = ['heltec-v3', 'heltec-v4', 'heltec-v4-r8', 'heltec-v4-r8-tft', 'heltec-t114', 't-echo', 'thinknode-m1', 'rak4631', 'heltec-wsl-v3'];
  for (const id of ids) assert.equal(rsnodeLights(rsnodeBoard(id)) !== null, rsnodeBoard(id).screen === false, id);
  assert.equal(rsnodeLights(null), null);
  assert.equal(rsnodeLights({ id: 'constructor' }), null);
});

test('a board with no screen gets a status check, its lights, and Check again, and is never asked for a screen', async () => {
  // A Stick Lite V3 answers the RNode board byte of a V3.
  let forwarding = 0, repeaterMode = 0;
  const port = nodePort(v3, { status: () => liteStatus({ node: [repeaterMode, 1, 1, 1, forwarding] }) });
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.deepEqual([elements.rsnodeScreenBezel.hidden, elements.rsnodeCheck.hidden, elements.rsnodeLights.hidden], [true, false, false]);
    assert.deepEqual(page.document.check(), [
      [true, 'RNode 0F3C answered over USB.'],
      [true, 'It runs rsNode 1.2.0-test and has been up for less than a minute.'],
      [true, 'It is running as an RNode.'],
      [true, 'Its radio is on at 915.000 MHz.'],
      [true, 'Bluetooth is on.'],
      [false, 'It has no managers yet.']
    ]);
    assert.deepEqual(page.document.lights(), LITE_LIGHTS);
    assert.equal(page.document.fact('board').dd.textContent, 'Heltec Wireless Stick Lite V3 · ESP32');
    assert.equal(elements.rsnodeDeviceLede.textContent, 'Check that the node is running, and read its status over USB.');
    assert.equal(elements.rsnodeDeviceMeta.textContent, 'Check the node and see its status over USB');
    assert.ok(elements.rsnodeLiveDot.classList.contains('is-live'));
    // Pairing and Check again are offered; there is no screen to save.
    assert.deepEqual([elements.rsnodeRecheck.hidden, elements.rsnodeRecheck.disabled, elements.rsnodePair.hidden, elements.rsnodePair.disabled,
      elements.rsnodeScreenshot.hidden, elements.rsnodeRestart.hidden, elements.rsnodeCopyDetails.hidden], [false, false, false, false, true, false, false]);
    assert.equal(page.document.painted.length, 0);
    // The node became a forwarding Repeater meanwhile: Check again reads it afresh.
    repeaterMode = 1;
    forwarding = 1;
    page.recheckRsnodeDevice();
    assert.equal(elements.rsnodeScreenState.textContent, 'Checking…');
    await until(() => page.document.check().some(([, text]) => text === 'It is running as a Repeater and forwarding.'));
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.equal(page.document.fact('forwarding').dd.textContent, 'Repeating');
    // A Repeater is not paired or restarted over USB.
    assert.deepEqual([elements.rsnodePair.hidden, elements.rsnodeRestart.hidden, elements.rsnodeRecheck.hidden], [true, true, false]);
  });
  const { elements } = page.document;
  assert.ok(!port.written.includes('disp_read'), 'a board with no screen is never asked for one');
  assert.ok(port.written.filter(name => name === 'read_mgmt').length >= 2, 'Check again read the node again');
  assert.equal(port.written.at(-1), 'leave');
  // The last check stays, dimmed, with the legend; Check again goes with the connection.
  assert.deepEqual([elements.rsnodeScreenState.textContent, elements.rsnodeCheck.hidden, elements.rsnodeLights.hidden, elements.rsnodeRecheck.hidden],
    ['Not connected', false, false, true]);
  assert.ok(elements.rsnodeCheck.classList.contains('is-stale'));
  assert.equal(page.document.check().length, 6);
});

test('a board with no screen has its pairing code shown here, zero-padded, until the window closes', async () => {
  const port = nodePort(v3, { status: liteStatus({ node: [0, 1, 0, 1, 0] }) });
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.ok(page.document.check().some(([ok, text]) => !ok && text === 'Bluetooth is off. Start Bluetooth pairing to turn it on.'));
    // A code that arrives with no window open here still belongs to this board: it has nowhere else to show it.
    port.push(pinFrame(654321));
    await until(() => !elements.rsnodePairCode.hidden);
    assert.equal(elements.rsnodePairCode.textContent, 'Pairing code: 654321. Enter it in your app within 2 minutes.');
    await page.pairRsnodeDevice();
    assert.equal(elements.rsnodeDeviceStatus.textContent, 'Pairing started. Within 2 minutes, choose RNode 0F3C in your app\'s Bluetooth list. ' +
      'Stay connected: the pairing code will appear here. Bluetooth stays on.');
    // A new window starts without the last window's code.
    assert.deepEqual([elements.rsnodePairCode.hidden, elements.rsnodePairCode.textContent], [true, '']);
    const window = page.context.rsnodeDevice.pairing;
    assert.ok(window.code === null && window.until > Date.now() + 110000 && window.until <= Date.now() + 120000);
    port.push(pinFrame(1234));
    await until(() => !elements.rsnodePairCode.hidden);
    assert.equal(elements.rsnodePairCode.textContent, 'Pairing code: 001234. Enter it in your app within 2 minutes.');
    assert.equal(elements.rsnodeDeviceStatus.textContent, '');
    // The node holds the window two more minutes from the code.
    assert.ok(page.context.rsnodeDevice.pairing.until > Date.now() + 110000);
    // A second attempt replaces the code.
    port.push(pinFrame(987654));
    await until(() => /987654/.test(elements.rsnodePairCode.textContent));
    // Once the window has closed the code is gone, and the panel says what to do.
    page.context.rsnodeDevice.pairing.until = Date.now() - 1;
    await until(() => elements.rsnodePairCode.hidden);
    assert.equal(elements.rsnodeDeviceStatus.textContent, 'The pairing window closed. If your app did not pair, start pairing again.');
    assert.equal(page.context.rsnodeDevice.pairing, null);
    // Disconnecting takes a code that is showing with it.
    port.push(pinFrame(5));
    await until(() => elements.rsnodePairCode.textContent === 'Pairing code: 000005. Enter it in your app within 2 minutes.');
  });
  assert.equal(port.written.filter(name => name === 'bt_pair').length, 1);
  assert.ok(!port.written.includes('disp_read'));
  assert.deepEqual([page.document.elements.rsnodePairCode.hidden, page.document.elements.rsnodePairCode.textContent], [true, '']);
  assert.match(html, /<p class="rsnode-tools__notice" id="rsnodePairCode" role="status" aria-live="polite" hidden><\/p>/);
});

test('a code that arrives while pairing starts is kept, not cleared by the start', async () => {
  const port = nodePort(v3, { status: liteStatus({ node: [0, 1, 1, 1, 0] }) });
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    await page.pairRsnodeDevice();
    assert.deepEqual([elements.rsnodePairCode.textContent, elements.rsnodeDeviceStatus.textContent],
      ['Pairing code: 777777. Enter it in your app within 2 minutes.', '']);
    assert.equal(page.context.rsnodeDevice.pairing.code, '777777');
  }, { startRsnodePairing: async session => {
    const started = await startRsnodePairing(session);
    port.push(pinFrame(777777));
    await new Promise(resolve => setTimeout(resolve, 60));
    return started;
  } });
  assert.equal(port.written.filter(name => name === 'bt_pair').length, 1);
});

test('a board with a screen keeps its code on its screen: a code frame changes nothing here', async () => {
  const port = nodePort(v4);
  await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => page.document.painted.length >= 1);
    await page.pairRsnodeDevice();
    port.push(pinFrame(123456));
    const painted = page.document.painted.length;
    await until(() => page.document.painted.length > painted + 2);
    assert.deepEqual([elements.rsnodePairCode.hidden, elements.rsnodePairCode.textContent, page.context.rsnodeDevice.pairing], [true, '', undefined]);
    assert.match(elements.rsnodeDeviceStatus.textContent, /enter the code shown on its screen\. Bluetooth stays on\.$/);
    assert.deepEqual([elements.rsnodeCheck.hidden, elements.rsnodeLights.hidden, elements.rsnodeRecheck.hidden, elements.rsnodeScreenBezel.hidden],
      [true, true, true, false]);
    assert.equal(elements.rsnodeDeviceLede.textContent, 'Watch the node\'s screen and read its status over USB.');
  });
});

test('a RAK4631 running as a Repeater shows forwarding in its check and both lights in its legend', async () => {
  const port = nodePort(repeater, { status: rakStatus({ node: [1, 1, 0, 0, 1], uptime: 90000 }) });
  await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.deepEqual(page.document.check().slice(1, 4), [
      [true, 'It runs rsNode 1.2.0-test and has been up for 1 day.'],
      [true, 'It is running as a Repeater and forwarding.'],
      [true, 'Its radio is on at 869.525 MHz.']
    ]);
    assert.deepEqual(page.document.lights(), RAK_LIGHTS);
    assert.match(page.document.fact('board').dd.textContent, /^RAK4631 · /);
    assert.deepEqual([elements.rsnodePair.hidden, elements.rsnodeRestart.hidden, elements.rsnodeRecheck.hidden], [true, true, false]);
  });
  assert.ok(!port.written.includes('disp_read') && !port.written.includes('bt_pair') && !port.written.includes('reset'));
});

test('a ThinkNode M1 has its own screen: like the T-Echo it gets its status only, and no code or check here', async () => {
  const port = nodePort(echo, { status: statusReply({ board: 0xc4, platform: NRF }) });
  await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => elements.rsnodeScreenState.textContent === 'Status only');
    assert.equal(page.document.fact('board').dd.textContent, 'Elecrow ThinkNode M1 · nRF52');
    assert.equal(elements.rsnodeScreenEmpty.textContent, 'No screen view for this board');
    assert.deepEqual([elements.rsnodeCheck.hidden, elements.rsnodeLights.hidden, elements.rsnodeRecheck.hidden, elements.rsnodePair.hidden,
      elements.rsnodeScreenBezel.hidden], [true, true, true, true, false]);
  });
  assert.ok(!port.written.includes('disp_read') && !port.written.includes('bt_pair'));
});

test('before connecting, the panel follows the board chosen or installed above; after, the node it read', async () => {
  const page = devicePage(nodePort(v4, { status: statusReply() }));
  const { elements } = page.document;
  const shown = () => [elements.rsnodeScreenBezel.hidden, elements.rsnodeCheck.hidden, elements.rsnodeLights.hidden];
  page.syncRsnodeDevice();
  assert.deepEqual(shown(), [false, true, true]);
  // A board with no screen chosen in the picker: no empty screen, its lights before anything is connected.
  page.hearRsnodeBoard(rsnodeBoard('rak4631'));
  page.syncRsnodeDevice();
  assert.deepEqual(shown(), [true, false, false]);
  assert.deepEqual(page.document.check(), [[false, 'Connect to check the node.']]);
  assert.deepEqual(page.document.lights(), RAK_LIGHTS);
  assert.equal(elements.rsnodeDeviceLede.textContent, 'Check that the node is running, and read its status over USB.');
  // The other tools' tips about holding USB and the Repeater's own menus go with the screen.
  assert.equal(page.document.screenOnly.length, 3);
  assert.ok(page.document.screenOnly.every(part => part.hidden));
  for (const id of ['heltec-v4', 'thinknode-m1', 't-echo', null]) {
    page.hearRsnodeBoard(id && rsnodeBoard(id));
    page.syncRsnodeDevice();
    assert.deepEqual(shown(), [false, true, true], String(id));
    assert.ok(page.document.screenOnly.every(part => !part.hidden), String(id));
  }
  assert.equal(elements.rsnodeDeviceLede.textContent, 'Watch the node\'s screen and read its status over USB.');
  // The board just installed is heard the same way, and stands in until a node is read.
  page.hearRsnodeBoard(rsnodeBoard('heltec-wsl-v3'));
  page.syncRsnodeDevice();
  assert.deepEqual([shown(), page.document.lights()], [[true, false, false], LITE_LIGHTS]);
  // The node that answers decides: a V4 on the port brings its screen back, and the tools hear of it.
  const run = page.runRsnodeDevice();
  try {
    await until(() => page.document.painted.length >= 1);
    assert.deepEqual(shown(), [false, true, true]);
    assert.equal(page.context.rsnodeHeardBoard.id, 'heltec-v4');
  } finally {
    await page.stopRsnodeDevice('');
    await run;
  }
  assert.deepEqual(shown(), [false, true, true]);
  // A board chosen afterwards is what the tools go by; the panel keeps matching the node it still shows.
  page.hearRsnodeBoard(rsnodeBoard('rak4631'));
  page.syncRsnodeDevice();
  assert.deepEqual([shown(), page.document.screenOnly.every(part => part.hidden)], [[false, true, true], true]);
  // The picker and an install both report the board, and locking forgets it.
  assert.match(html, /var metadata = betaBoards\.find\(function\(board\) \{ return board\.id === rsnodeBoardSelect\.value; \}\);\s+hearRsnodeBoard\(rsnodeBoard\(rsnodeBoardSelect\.value\)\);/);
  assert.match(extract('showRsnodeRepeaterStep'), /if \(rsnodeBoard\(board\)\) hearRsnodeBoard\(rsnodeBoard\(board\)\);/);
  assert.match(extract('applyBetaSession'), /rsnodeBoardSelect\.replaceChildren\(new Option\('Choose your board', ''\)\);\s+hearRsnodeBoard\(null\);/);
});

test('after an install, the first check of a board with no screen confirms it and says what comes next', async () => {
  const port = nodePort(v3, { status: liteStatus({ node: [0, 1, 1, 1, 0] }) });
  const page = devicePage(port);
  const { elements } = page.document;
  page.hearRsnodeBoard(rsnodeBoard('heltec-wsl-v3'));
  elements.rsnodeDeviceNotice.hidden = false;
  const run = page.runRsnodeDevice();
  try {
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.equal(elements.rsnodeDeviceNotice.hidden, true);
    assert.equal(elements.rsnodeDeviceStatus.textContent, 'RNode 0F3C is running rsNode. Set it up as a Repeater, or keep it as an RNode for one app.');
    assert.equal(page.document.check()[0][1], 'RNode 0F3C answered over USB.');
  } finally {
    await page.stopRsnodeDevice('');
    await run;
  }
  // A board with a screen on the port leaves that next step where it is.
  const other = devicePage(nodePort(v4));
  other.document.elements.rsnodeDeviceNotice.hidden = false;
  const second = other.runRsnodeDevice();
  try {
    await until(() => other.document.painted.length >= 1);
    assert.deepEqual([other.document.elements.rsnodeDeviceNotice.hidden, other.document.elements.rsnodeDeviceStatus.textContent], [false, '']);
  } finally {
    await other.stopRsnodeDevice('');
    await second;
  }
});

test('a board with no screen that another app holds is not sent to a menu it does not have', async () => {
  // The recorded Repeater refuses pairing and a reset as a held RNode does; STATUS says it is a Stick Lite V3 in RNode.
  const port = nodePort(repeater, { status: liteStatus({ node: [0, 1, 1, 2, 0] }) });
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.ok(page.document.check().some(([, text]) => text === 'It is running as an RNode, and an app is using it over Bluetooth.'));
    assert.equal(elements.rsnodePair.hidden, false);
    await page.pairRsnodeDevice();
    assert.equal(elements.rsnodeDeviceStatus.textContent,
      'RNode B44E did not start pairing: another app is using it. Disconnect that app, then start pairing again.');
    assert.deepEqual([elements.rsnodePairCode.hidden, page.context.rsnodeDevice.pairing], [true, undefined]);
    await page.stopRsnodeDevice('Restarting RNode B44E. Connect again in a few seconds.', true);
  });
  assert.deepEqual(port.written.slice(-2), ['leave', 'reset']);
  assert.equal(page.document.elements.rsnodeDeviceStatus.textContent,
    'RNode B44E did not restart: another app is using it. Disconnect that app, or press RESET on the board.');
});

test('the panel carries the status check, the lights legend, and the code line, with no board named in the page itself', () => {
  const panel = /id="rsnodeDevice"[\s\S]*?id="rsnodeSettings"/.exec(html)[0];
  assert.match(panel, /<div class="flash-connect-tips rsnode-device__check" id="rsnodeCheck" hidden>[\s\S]*?Status check<\/div>\s*<ul id="rsnodeCheckList"><\/ul>/);
  assert.match(panel, /<div class="rsnode-device__lights" id="rsnodeLights" hidden>\s*<span class="rnode-source__label">Lights on the board<\/span>\s*<dl class="rsnode-tools__facts" id="rsnodeLightsList"><\/dl>/);
  assert.match(panel, /<button class="rsnode-beta__button" id="rsnodeRecheck" type="button" disabled hidden>Check again<\/button>/);
  // The check sits where the screen would, inside the same figure, above its caption.
  assert.ok(panel.indexOf('id="rsnodeScreenBezel"') < panel.indexOf('id="rsnodeCheck"') && panel.indexOf('id="rsnodeCheck"') < panel.indexOf('id="rsnodeScreenState"'));
  assert.doesNotMatch(panel.replace(/<[^>]+>/g, ' '), /RAK|Stick Lite|ThinkNode|green light|white light|signal/i);
  // The three tips that need a board's own button or menus are marked, so a board without them is not sent there.
  assert.match(html, /disconnect that app<span data-screen-only>, or hold USB on the node<\/span>\.<\/li>/);
  assert.match(html, /in Set up as a Repeater<span data-screen-only>, or on the Repeater's own menus<\/span>\.<\/p>/);
  assert.match(html, /<li data-screen-only>Some betas require RNode mode for manager changes: [^<]*hold USB on the home menu to take over from another app\.<\/li>/);
  assert.match(extract('hearRsnodeBoard'), /querySelectorAll\('\[data-screen-only\]'\)\.forEach\(function\(part\) \{ part\.hidden = screenless; \}\);/);
  const css = readFileSync(new URL('../assets/site/download.css', import.meta.url), 'utf8');
  for (const rule of ['.rsnode-device__check li.is-ok::before', '.rsnode-device__check.is-stale', '.rsnode-device__lights']) assert.ok(css.includes(rule), rule);
});

test('a board with no Wi-Fi shows no Wi-Fi line, and the tools hear of it from the node the live view reads', async () => {
  const wifi = async (entry, status) => {
    const { facts, radio } = await readNode(entry, { status });
    return [rsnodeSummary(facts, radio).wifi, rsnodeDetails(facts, radio).split('\n').some(line => line.startsWith('wi-fi: '))];
  };
  for (const board of [0x51, 0x44, 0x3c, 0xc4]) {
    assert.deepEqual(await wifi(echo, statusReply({ board, platform: NRF })), [null, false], board.toString(16));
  }
  for (const board of [0x3a, 0x3f, 0xbf, 0xc0, 0xba]) assert.deepEqual(await wifi(v3, statusReply({ board })), ['Off', true], board.toString(16));
  assert.deepEqual(await wifi(v3, liteStatus({ wifi: [1, 1, 192, 168, 1, 23] })), ['Joined a network · 192.168.1.23', true]);

  // A RAK4631 on the port: the Wi-Fi row goes, and so do the other tools' Wi-Fi parts and the settings panel.
  const port = nodePort(echo, { status: rakStatus({ node: [0, 1, 1, 1, 0] }) });
  const page = await withPanel(port, async page => {
    const { elements } = page.document;
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.equal(page.document.fact('wifi').hidden, true);
    assert.equal(page.context.rsnodeHeardBoard.id, 'rak4631');
    assert.equal(page.document.wifiOnly.length, 2);
    assert.ok(page.document.wifiOnly.every(part => part.hidden) && page.document.screenOnly.every(part => part.hidden));
    assert.deepEqual([elements.rsnodeRepeaterMeta.textContent, elements.rsnodeSettings.hidden], ['Region and Owner over USB', true]);
  });
  // What the tools heard outlives the connection, until a board with Wi-Fi is chosen or read.
  assert.equal(page.context.rsnodeHeardBoard.id, 'rak4631');
  page.hearRsnodeBoard(rsnodeBoard('heltec-wsl-v3'));
  assert.ok(page.document.wifiOnly.every(part => !part.hidden) && page.document.screenOnly.every(part => part.hidden));
  assert.deepEqual([page.document.elements.rsnodeRepeaterMeta.textContent, page.document.elements.rsnodeSettings.hidden],
    ['Region, Owner, and Wi-Fi over USB', false]);
});

test('after a return to RNode mode the live view opens, connects, and its check says the node runs as an RNode', async () => {
  const port = nodePort(v3, { status: liteStatus({ node: [0, 1, 1, 1, 0] }) });
  const page = devicePage(port);
  const { elements } = page.document;
  elements.rsnodeDevice.open = false;
  const run = page.showRsnodeDeviceCheck();
  try {
    await until(() => /^Checked at /.test(elements.rsnodeScreenState.textContent));
    assert.deepEqual([elements.rsnodeDevice.open, elements.rsnodeDevice.scrolled], [true, true]);
    assert.deepEqual(page.document.check()[2], [true, 'It is running as an RNode.']);
    assert.deepEqual(page.calls, ['port', ['open', 0]]);
  } finally {
    await page.stopRsnodeDevice('');
    await run;
  }
  // The Repeater control hands over only once it has left the node and released the port.
  const control = extract('runRsnodeRepeaterControl');
  assert.ok(control.indexOf('await closeRnodeSession(session);') < control.indexOf('if (exited) showRsnodeDeviceCheck();'));
  assert.ok(control.indexOf('setRsnodeRepeaterBusy(false);') < control.indexOf('if (exited) showRsnodeDeviceCheck();'));
});

test('a node set up here is as the live view next reads it: started, stopped, or back in RNode mode since', async () => {
  const read = async node => {
    const result = { nodeId: '0F3C', repeating: true, repeater: true, board: rsnodeBoard('heltec-wsl-v3') };
    const page = devicePage(nodePort(v3, { status: liteStatus({ node }) }), { rsnodeRepeaterResult: result });
    const run = page.runRsnodeDevice();
    try {
      await until(() => /^Checked at /.test(page.document.elements.rsnodeScreenState.textContent));
    } finally {
      await page.stopRsnodeDevice('');
      await run;
    }
    return [result.repeater, result.repeating];
  };
  assert.deepEqual(await read([1, 1, 1, 0, 1]), [true, true]);
  // A manager sent /stop since.
  assert.deepEqual(await read([1, 1, 1, 0, 0]), [true, false]);
  // It was returned to RNode mode.
  assert.deepEqual(await read([0, 1, 1, 1, 0]), [false, false]);
  // Another node on the port says nothing about the one set up here.
  const other = { nodeId: 'FFFF', repeating: true, repeater: true };
  const page = devicePage(nodePort(v3, { status: liteStatus({ node: [0, 1, 1, 1, 0] }) }), { rsnodeRepeaterResult: other });
  const run = page.runRsnodeDevice();
  try {
    await until(() => /^Checked at /.test(page.document.elements.rsnodeScreenState.textContent));
  } finally {
    await page.stopRsnodeDevice('');
    await run;
  }
  assert.deepEqual([other.repeater, other.repeating], [true, true]);
});

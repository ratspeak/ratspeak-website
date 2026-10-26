import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { SCREEN_HEIGHT, SCREEN_WIDTH, leaveRsnode, parseTransportStatus, readRsnodeFacts, readRsnodeRadio,
  readRsnodeScreen, renderTransport, restartRsnode, rsnodeDetails, rsnodeSummary, screenPixels, screenSupported,
  startRsnodePairing, waitForRsnode } from '../assets/js/rsnode-device.js';
import { renderNode, renderStatus } from '../assets/js/rsnode-provision.js';

// rsNode's own answers, recorded from its code by scripts/rsnode-device-vectors.py.
const vectors = JSON.parse(readFileSync(new URL('./fixtures/rsnode-device-vectors.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../download.html', import.meta.url), 'utf8');
const bytes = value => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = value => Buffer.from(value).toString('hex');
const scenario = name => vectors.scenarios.find(entry => entry.name.startsWith(name));
const [v4, v3, echo] = ['Heltec V4', 'Heltec V3', 'T-Echo'].map(scenario);
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

// A port that answers as the recorded node. Every frame the page writes must be one of the frames
// rsNode's scripts write; the screen steps through the node's recorded screens.
function nodePort(entry, { silent = false, early = [], unanswered = [] } = {}) {
  const names = new Map(Object.entries(entry.requests).map(([name, request]) => [request.host, name]));
  let controller, screen = 0;
  const port = {
    written: [],
    closed: false,
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(chunk) {
      const name = names.get(hex(chunk));
      assert.ok(name, `the page wrote a frame rsNode's scripts never send: ${hex(chunk)}`);
      port.written.push(name);
      if (silent || unanswered.includes(name)) return;
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
    assert.deepEqual(facts.status, entry.management);
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
    // provision-rsnode.py's status and owner lines, configure-transport-ifac.py's status.
    assert.ok(details.includes(renderStatus(entry.management)));
    for (const line of renderNode(entry.node)) assert.ok(details.includes(line), line);
    assert.ok(details.includes(`transport: ${entry.transport}`));
    assert.ok(details.some(line => line.endsWith(`image ${entry.device.firmwareHash}`)));
  }
  assert.deepEqual(lines['heltec-v4'], {
    node: 'RNode 887A', board: 'Heltec V4 · ESP32', firmware: `RNode 1.86 · image ${v4.device.firmwareHash.slice(0, 8)}`,
    owners: 'Owner and 1 admin', repeater: 'Not set up',
    radio: 'Off · not configured', packets: 'RX 0 · TX 0', channel: null, battery: '84% · discharging'
  });
  assert.deepEqual(lines['heltec-v3'], {
    node: 'RNode 0F3C', board: 'Heltec V3 · ESP32', firmware: `RNode 1.86 · image ${v3.device.firmwareHash.slice(0, 8)}`,
    owners: 'None yet', repeater: 'Not set up · IFAC on (8)',
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
  await restartRsnode(session);
  await closeRnodeSession(session);
  assert.deepEqual(port.written, ['leave', 'leave', 'reset']);
});

test('starts pairing with the frame probe-heltec-v4.py --bt-pair sends, which rsNode answers with nothing', async () => {
  for (const entry of vectors.scenarios) {
    assert.equal(entry.requests.bt_pair.device, '', entry.name);
    // Bluetooth on and kept on, with the pairing window open.
    assert.deepEqual([entry.device.bluetoothPairing, entry.requests.bt_pair.bluetooth], [false, { enabled: true, pairing: true }], entry.name);
  }
  const port = nodePort(v4);
  const session = createRnodeSession(port);
  await startRsnodePairing(session);
  await closeRnodeSession(session);
  assert.deepEqual(port.written, ['bt_pair']);
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
  const element = (extra = {}) => ({ textContent: '', hidden: false, disabled: false, title: '', classList: classList(), ...extra });
  const painted = [];
  const context = {
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => painted.push(Uint8ClampedArray.from(image.data)),
    clearRect: () => {}
  };
  const facts = [...html.matchAll(/data-fact="(\w+)"/g)].map(match => match[1]);
  const rows = facts.map(fact => ({ dataset: { fact }, hidden: false, dd: element(), querySelector() { return this.dd; } }));
  const elements = Object.fromEntries(['rsnodeConnect', 'rsnodeScreenshot', 'rsnodeCopyDetails', 'rsnodePair', 'rsnodeRestart',
    'rsnodeScreenState', 'rsnodeLiveDot', 'rsnodeScreenBezel', 'rsnodeScreenEmpty', 'rsnodeFactsEmpty', 'rsnodeFacts',
    'rsnodeDeviceStatus', 'rsnodeDetailsText'].map(id => [id, element()]));
  elements.rsnodeDevice = element({ open: true });
  elements.rsnodeScreen = element({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, getContext: () => context });
  return {
    hidden: false, elements, painted,
    fact: name => rows.find(row => row.dataset.fact === name),
    getElementById: id => elements[id],
    querySelectorAll: selector => selector === '#rsnodeFacts [data-fact]' ? rows : [],
    querySelector: selector => selector === '#rsnodeFacts [data-fact="firmware"] dd' ? rows.find(row => row.dataset.fact === 'firmware').dd : null
  };
}

const PANEL = ['rsnodeDevice', 'rsnodeDeviceFacts', 'rsnodeDeviceRadio', 'rsnodeScreenPixels', 'rsnodeScreenImage',
  'RSNODE_SCREEN_INTERVAL_MS', 'RSNODE_RADIO_INTERVAL_MS', 'RSNODE_SCREEN_MISSES', 'RSNODE_PIXEL_ON', 'RSNODE_PIXEL_OFF',
  'RSNODE_TAKEOVER', 'rsnodeToolsUnlocked', 'updateRsnodeDeviceVisibility', 'rsnodeDeviceMessage', 'syncRsnodeDevice',
  'setRsnodeScreenState', 'clearRsnodeScreen', 'paintRsnodeScreen', 'showRsnodeDeviceFacts', 'rsnodeDeviceError',
  'rsnodePortError', 'rsnodeDeviceWatched', 'streamRsnodeDevice', 'runRsnodeDevice', 'stopRsnodeDevice', 'releaseRsnodeDevice',
  'pairRsnodeDevice', 'syncRsnodePort'];

function devicePage(port, overrides = {}) {
  const document = panelDocument();
  const calls = [];
  const context = {
    document, betaStage: 'ready', rsnodeOwnerBusy: false, navigator: { serial: {} },
    state: { flashing: false, device: 'custom', rsnodeInstalled: false }, isRsnodeSelected: () => true,
    showSerialWarning: () => calls.push('serial warning'),
    rsnodeToolPortFromUser: async () => calls.push('port'),
    rsnodeOtherPorts: async () => [],
    openRnodeSerialPort: async (log, settleMs) => { calls.push(['open', settleMs]); return port; },
    createRnodeSession, closeRnodeSession,
    sleepMs: () => new Promise(resolve => setTimeout(resolve, 0)),
    SCREEN_WIDTH, SCREEN_HEIGHT, leaveRsnode, readRsnodeFacts, readRsnodeRadio, readRsnodeScreen, restartRsnode,
    rsnodeSummary, screenSupported, startRsnodePairing, waitForRsnode, ...overrides
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

test('a silent node keeps the panel waiting with the takeover hint, and Disconnect still leaves it', async () => {
  const port = nodePort(v4, { silent: true });
  const page = await withPanel(port, async page => {
    const status = page.document.elements.rsnodeDeviceStatus;
    await until(() => status.textContent.startsWith('Waiting for rsNode.'));
    assert.equal(status.textContent, 'Waiting for rsNode. EXIT a running Repeater first. In RNode, hold USB on the home menu to take over from another host.');
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
  assert.equal(status.textContent, 'No answer over USB. EXIT a running Repeater first. In RNode, hold USB on the home menu to take over from another host. Then connect again.');
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

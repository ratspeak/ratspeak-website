// rsNode settings over USB (rsNode ADR 0015): CMD_RSNODE SETTINGS_GET and SETTINGS_SET carry
// `id len value` entries, the ids of rsNode's crates/rsnode-management/src/settings.rs. A get
// reduces passwords and IFAC keys to one byte, set (1) or not (0); a set applies every entry at
// once or none. The page's form is read and checked here; download.html only moves it to the DOM.
import { RSNODE_RESULT, rsnodeCommand, rsnodeScreenless } from './rsnode-device.js';

const SUB_SETTINGS_GET = 0x02;
const SUB_SETTINGS_SET = 0x03;

export const SETTING = Object.freeze({
  wifiMode: 0x01, wifiChannel: 0x02, wifiName: 0x03, wifiPassword: 0x04, wifiAddress: 0x05, wifiGateway: 0x06,
  wifiDns: 0x07, region: 0x10, frequency: 0x13, bandwidth: 0x14, spreadingFactor: 0x15, codingRate: 0x16,
  txPower: 0x17, preamble: 0x18, syncWord: 0x19, crc: 0x1a, explicitHeader: 0x1b, loraIfacEnabled: 0x1c,
  loraIfacSize: 0x1d, loraIfacKey: 0x1e, peersEnabled: 0x20, peersPort: 0x21, peersMax: 0x22,
  peersIfacEnabled: 0x23, peersIfacSize: 0x24, peersIfacKey: 0x25, uplinkEnabled: 0x28, uplinkHost: 0x29,
  uplinkPort: 0x2a, uplinkIfacEnabled: 0x2b, uplinkIfacSize: 0x2c, uplinkIfacKey: 0x2d
});
/** WIFI_MODE wire values. */
export const WIFI_MODES = Object.freeze({ off: 0, join: 1, own: 2 });
const MODE_NAMES = ['off', 'join', 'own'];
/** rsNode's repeater_catalog REGIONS, by persistence id; 0xFF is none. */
export const REGIONS = Object.freeze({ 1: 'Americas 915', 2: 'Europe 868', 3: '433 UHF', 4: 'Australia 915', 5: 'Asia 923' });
/** settings.rs SettingsReason. */
export const SETTINGS_REASONS = Object.freeze({ 1: 'malformed', 2: 'unknownId', 3: 'duplicate', 4: 'value', 5: 'wifi',
  6: 'radio', 7: 'confirmOnDevice', 8: 'transport', 9: 'network' });
export const APP_PORT = 7633;
export const PEERS_PORT_DEFAULT = 4242;
const STRING_MAX = 32;
const HOST_MAX = 64;
const PASSWORD_MIN = 8;
const HTTP_PORT = 80;
// The form field an entry's id names.
const FIELDS = { 0x01: 'wifiMode', 0x02: 'channel', 0x03: 'name', 0x04: 'password', 0x05: 'address', 0x06: 'gateway',
  0x07: 'dns', 0x20: 'peersEnabled', 0x21: 'peersPort', 0x22: 'peersEnabled', 0x28: 'uplinkEnabled', 0x29: 'uplinkHost',
  0x2a: 'uplinkPort' };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const u16 = (bytes, offset = 0) => (bytes[offset] << 8) | bytes[offset + 1];
const u32 = (bytes, offset = 0) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
const be16 = value => [value >> 8, value & 0xff];
const utf8 = text => Array.from(encoder.encode(text));
const sameBytes = (a, b) => a.length === b.length && a.every((byte, index) => byte === b[index]);

/** A settings body as entries [id, value]; truncation is malformed. */
export function decodeEntries(body) {
  const entries = [];
  for (let offset = 0; offset < body.length;) {
    const id = body[offset], len = body[offset + 1];
    const value = Array.from(body.slice(offset + 2, offset + 2 + len));
    if (len === undefined || value.length !== len) throw new Error('malformed rsNode settings: truncated entry');
    entries.push([id, value]);
    offset += 2 + len;
  }
  return entries;
}

export function encodeEntries(entries) {
  return entries.flatMap(([id, value]) => {
    if (value.length > 255) throw new Error(`setting 0x${id.toString(16)} is too long`);
    return [id, value.length, ...value];
  });
}

const ipText = bytes => Array.from(bytes).join('.');

function ifac(map, enabled) {
  return { enabled: map.get(enabled)?.[0] === 1, size: map.has(enabled + 1) ? map.get(enabled + 1)[0] : null,
    keySet: map.get(enabled + 2)?.[0] === 1 };
}

/** A SETTINGS_GET body as the panel shows it. Unknown ids are skipped. */
export function decodeSettings(body) {
  const map = new Map(decodeEntries(body));
  const get = id => map.get(id) || [];
  const address = get(SETTING.wifiAddress);
  const radio = map.has(SETTING.frequency) ? {
    frequency: u32(get(SETTING.frequency)), bandwidth: u32(get(SETTING.bandwidth)),
    spreadingFactor: get(SETTING.spreadingFactor)[0], codingRate: get(SETTING.codingRate)[0],
    txPower: (get(SETTING.txPower)[0] << 24) >> 24
  } : null;
  const region = get(SETTING.region)[0];
  let name;
  try { name = decoder.decode(Uint8Array.from(get(SETTING.wifiName))); } catch { throw new Error('malformed rsNode settings: network name'); }
  return {
    wifi: {
      mode: get(SETTING.wifiMode)[0] ?? 0,
      channel: get(SETTING.wifiChannel)[0] ?? 1,
      name,
      passwordSet: get(SETTING.wifiPassword)[0] === 1,
      address: address.length === 8 ? { address: ipText(address.slice(0, 4)), netmask: ipText(address.slice(4)) } : null,
      gateway: get(SETTING.wifiGateway).length === 4 ? ipText(get(SETTING.wifiGateway)) : null,
      dns: get(SETTING.wifiDns).length === 4 ? ipText(get(SETTING.wifiDns)) : null
    },
    region: region === undefined || region === 0xff ? null : region,
    radio,
    loraIfac: ifac(map, SETTING.loraIfacEnabled),
    peers: { enabled: get(SETTING.peersEnabled)[0] === 1,
      port: map.has(SETTING.peersPort) ? u16(get(SETTING.peersPort)) : PEERS_PORT_DEFAULT,
      max: get(SETTING.peersMax)[0] ?? 2, ifac: ifac(map, SETTING.peersIfacEnabled) },
    uplink: { enabled: get(SETTING.uplinkEnabled)[0] === 1, host: String.fromCharCode(...get(SETTING.uplinkHost)),
      port: map.has(SETTING.uplinkPort) ? u16(get(SETTING.uplinkPort)) : 0, ifac: ifac(map, SETTING.uplinkIfacEnabled) }
  };
}

/** The panel's form as it first shows a node's settings: no password typed. */
export function settingsForm(settings) {
  const wifi = settings.wifi;
  return {
    wifiMode: MODE_NAMES[wifi.mode] || 'off', name: wifi.name, password: null, channel: wifi.channel,
    fixed: !!wifi.address, address: wifi.address ? wifi.address.address : '', netmask: wifi.address ? wifi.address.netmask : '255.255.255.0',
    gateway: wifi.gateway || '', dns: wifi.dns || '',
    peersEnabled: settings.peers.enabled, peersPort: String(settings.peers.port || PEERS_PORT_DEFAULT),
    uplinkEnabled: settings.uplink.enabled, uplinkHost: settings.uplink.host, uplinkPort: settings.uplink.port ? String(settings.uplink.port) : ''
  };
}

export function parseIpv4(text) {
  const match = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(text || '');
  const bytes = match && match.slice(1).map(Number);
  return bytes && bytes.every(byte => byte <= 255) ? bytes : null;
}

const value32 = bytes => u32(bytes);
// rsnode-core wifi::valid_unicast_ipv4.
const unicast = bytes => !bytes.every(byte => byte === 0) && !bytes.every(byte => byte === 255) && bytes[0] !== 0 &&
  bytes[0] !== 127 && bytes[0] < 224;

function parsePort(text) {
  const port = /^\s*\d{1,5}\s*$/.test(text || '') ? Number(text) : NaN;
  return port >= 1 && port <= 65535 ? port : null;
}

const switchesNetwork = (from, to) => from !== to && from !== 'off' && to !== 'off';
const validWifiText = text => !text.includes('\0') && decoder.decode(encoder.encode(text)) === text;

/**
 * The first thing the device would refuse, as { field, message }, or null. The rules are rsNode's:
 * joining a network needs its name and an empty or 8–32 byte UTF-8 password; the node's own network
 * needs an 8–32 byte password; a fixed address needs a usable host, mask and on-link gateway.
 */
export function checkSettingsForm(form, settings, repeater) {
  const mode = form.wifiMode, current = MODE_NAMES[settings.wifi.mode] || 'off';
  const problem = (field, message) => ({ field, message });
  if (!Object.hasOwn(WIFI_MODES, mode)) return problem('wifiMode', 'Choose a Wi-Fi mode.');
  if (mode !== 'off') {
    if (!validWifiText(form.name)) return problem('name', 'The network name contains an unsupported character.');
    const name = utf8(form.name);
    if (mode === 'join' && !name.length) return problem('name', 'Enter the name of the network to join.');
    if (name.length > STRING_MAX) return problem('name', 'A network name is at most 32 bytes.');
    if (form.password === null) {
      if (switchesNetwork(current, mode)) {
        return problem('password', mode === 'own' ? 'Enter a password for the node\'s network.'
          : 'Enter the network\'s password, or leave it empty for an open network.');
      }
      if (mode === 'own' && !settings.wifi.passwordSet) return problem('password', 'The node\'s own network needs a password of 8 to 32 bytes.');
    } else {
      const password = form.password;
      if (!(mode === 'join' && password === '')) {
        if (!validWifiText(password)) return problem('password', 'The password contains an unsupported character.');
        const length = utf8(password).length;
        if (length < PASSWORD_MIN || length > STRING_MAX) {
          return problem('password', mode === 'own' ? 'The node\'s own network needs a password of 8 to 32 bytes.'
            : 'A Wi-Fi password is 8 to 32 bytes, or empty for an open network.');
        }
      }
    }
    if (mode === 'own' && !(Number.isInteger(Number(form.channel)) && form.channel >= 1 && form.channel <= 13)) {
      return problem('channel', 'Choose a channel from 1 to 13.');
    }
    if (mode === 'join' && form.fixed) {
      const address = parseIpv4(form.address), netmask = parseIpv4(form.netmask);
      if (!address || !unicast(address)) return problem('address', 'Enter a fixed address such as 192.168.1.50.');
      const mask = netmask && value32(netmask);
      if (!netmask || mask === 0 || mask === 0xffffffff || ((~mask >>> 0) + 1 & (~mask >>> 0)) !== 0) {
        return problem('netmask', 'Enter a subnet mask such as 255.255.255.0.');
      }
      const subnet = (value32(address) & mask) >>> 0, broadcast = (subnet | ~mask) >>> 0;
      if (value32(address) === subnet || value32(address) === broadcast) return problem('address', 'This address is the subnet\'s own network or broadcast address.');
      if (form.gateway.trim()) {
        const gateway = parseIpv4(form.gateway);
        const value = gateway && value32(gateway);
        if (!gateway || !unicast(gateway) || ((value & mask) >>> 0) !== subnet || value === subnet || value === broadcast) {
          return problem('gateway', 'The gateway must be an address on the same subnet, or empty.');
        }
      }
      if (form.dns.trim()) {
        const dns = parseIpv4(form.dns);
        if (!dns || !unicast(dns)) return problem('dns', 'Enter a DNS server address, or leave it empty.');
      }
    }
  }
  if (repeater) {
    if (form.peersEnabled) {
      const port = parsePort(form.peersPort);
      if (!port || port === HTTP_PORT) return problem('peersPort', 'Choose a peer port from 1 to 65535, other than 80.');
    }
    if (form.uplinkEnabled) {
      const host = form.uplinkHost.trim();
      if (!host || host.length > HOST_MAX || !/^[A-Za-z0-9._-]+$/.test(host)) {
        return problem('uplinkHost', 'Enter the uplink\'s host name or address, up to 64 letters, digits, dots, dashes, and underscores.');
      }
      if (!parsePort(form.uplinkPort)) return problem('uplinkPort', 'Choose an uplink port from 1 to 65535.');
    }
  }
  return null;
}

/** The entries a save sends: only what differs from the node's settings, secrets only when typed. */
export function settingsChanges(form, settings, repeater) {
  const entries = [];
  const wifi = settings.wifi;
  const put = (id, value) => entries.push([id, value]);
  const mode = WIFI_MODES[form.wifiMode];
  if (mode !== wifi.mode) put(SETTING.wifiMode, [mode]);
  if (mode !== WIFI_MODES.off) {
    const name = utf8(form.name);
    if (!sameBytes(name, utf8(wifi.name))) put(SETTING.wifiName, name);
    if (form.password !== null) put(SETTING.wifiPassword, utf8(form.password));
    if (mode === WIFI_MODES.own && Number(form.channel) !== wifi.channel) put(SETTING.wifiChannel, [Number(form.channel)]);
    if (mode === WIFI_MODES.join) {
      const fixed = form.fixed;
      const address = fixed ? [...parseIpv4(form.address), ...parseIpv4(form.netmask)] : [];
      const currentAddress = wifi.address ? [...parseIpv4(wifi.address.address), ...parseIpv4(wifi.address.netmask)] : [];
      if (!sameBytes(address, currentAddress)) put(SETTING.wifiAddress, address);
      const optional = text => fixed && text.trim() ? parseIpv4(text) : [];
      if (!sameBytes(optional(form.gateway), wifi.gateway ? parseIpv4(wifi.gateway) : [])) put(SETTING.wifiGateway, optional(form.gateway));
      if (!sameBytes(optional(form.dns), wifi.dns ? parseIpv4(wifi.dns) : [])) put(SETTING.wifiDns, optional(form.dns));
    }
  }
  if (repeater) {
    const peers = settings.peers, uplink = settings.uplink;
    if (form.peersEnabled !== peers.enabled) put(SETTING.peersEnabled, [form.peersEnabled ? 1 : 0]);
    if (form.peersEnabled && parsePort(form.peersPort) !== peers.port) put(SETTING.peersPort, be16(parsePort(form.peersPort)));
    if (form.uplinkEnabled !== uplink.enabled) put(SETTING.uplinkEnabled, [form.uplinkEnabled ? 1 : 0]);
    if (form.uplinkEnabled) {
      const host = form.uplinkHost.trim();
      if (host !== uplink.host) put(SETTING.uplinkHost, Array.from(host, character => character.charCodeAt(0)));
      if (parsePort(form.uplinkPort) !== uplink.port) put(SETTING.uplinkPort, be16(parsePort(form.uplinkPort)));
    }
  }
  return entries;
}

const REASON_TEXT = {
  malformed: 'The node could not read the request. Nothing changed.',
  duplicate: 'The node could not read the request. Nothing changed.',
  unknownId: 'This firmware does not have that setting.',
  wifi: 'The node refused these Wi-Fi settings. Joining a network needs its name and a password of 8 to 32 bytes, ' +
    'or none for an open network; the node\'s own network needs a password of 8 to 32 bytes.',
  radio: 'The node refused the radio settings.',
  confirmOnDevice: 'Confirm this change on the device.',
  transport: 'The node refused the Repeater settings.',
  network: 'The node refused the peer or uplink settings. Check the ports and the uplink host.'
};
const VALUE_TEXT = {
  wifiMode: 'The node refused this Wi-Fi mode.', channel: 'The node refused this channel.',
  name: 'The node refused this network name.', password: 'The node refused this password.',
  address: 'The node refused this fixed address.', gateway: 'The node refused this gateway.', dns: 'The node refused this DNS server.',
  peersEnabled: 'The node refused the peer settings.', peersPort: 'The node refused this peer port.',
  uplinkEnabled: 'The node refused the uplink settings.', uplinkHost: 'The node refused this uplink host.',
  uplinkPort: 'The node refused this uplink port.'
};

/** An Invalid reply's [id, reason] as { field, message }; id 0 is the request as a whole. */
export function settingsRefusal(body, mode = 'join') {
  if (body.length !== 2) return { field: null, message: REASON_TEXT.malformed };
  const [id, code] = body;
  const reason = SETTINGS_REASONS[code] || 'value';
  if (reason === 'value') return { field: FIELDS[id] || null, message: VALUE_TEXT[FIELDS[id]] || 'The node refused one of the values.' };
  if (reason === 'wifi') return { field: mode === 'own' ? 'password' : 'name', message: REASON_TEXT.wifi };
  return { field: id ? FIELDS[id] || null : null, message: REASON_TEXT[reason] };
}

/** A SETTINGS_SET reply: restart (with its delay), unchanged, or why it was refused. */
export function settingsOutcome(reply, mode) {
  if (!reply) return { kind: 'unsupported' };
  const { result, body } = reply;
  if (result === RSNODE_RESULT.ok) {
    if (body.length === 2) return { kind: 'restart', restartMs: u16(body) };
    if (body.length === 0) return { kind: 'unchanged' };
    return { kind: 'uncertain', message: 'The settings reply was incomplete. Read the node\'s settings before retrying.' };
  }
  if (result === RSNODE_RESULT.invalid) return { kind: 'invalid', ...settingsRefusal(body, mode) };
  if (result === RSNODE_RESULT.refused) return { kind: 'refused' };
  if (result === RSNODE_RESULT.busy) return { kind: 'busy' };
  if (result === RSNODE_RESULT.storage) return { kind: 'storage' };
  if (result === RSNODE_RESULT.unsupported || result === RSNODE_RESULT.unavailable) return { kind: 'unsupported' };
  return { kind: 'failed', result };
}

/** SETTINGS_GET; null on a beta without USB settings. */
export async function readRsnodeSettings(session) {
  const reply = await rsnodeCommand(session, SUB_SETTINGS_GET);
  if (!reply || reply.result !== RSNODE_RESULT.ok) return null;
  return decodeSettings(reply.body);
}

/** SETTINGS_SET with the entries settingsChanges chose. */
export async function writeRsnodeSettings(session, entries, mode) {
  return settingsOutcome(await rsnodeCommand(session, SUB_SETTINGS_SET, encodeEntries(entries)), mode);
}

/** What a saved change did, once the node is back and its STATUS says where Wi-Fi stands. */
export function settingsSavedMessage(nodeId, settings, status, repeater) {
  const name = `RNode ${nodeId}`;
  const mode = settings.wifi.mode;
  const wifi = status && status.wifi;
  if (mode === WIFI_MODES.off) return `Saved. ${name} restarted with Wi-Fi off.` + (repeater ? '' : ' Bluetooth is available again.');
  const network = mode === WIFI_MODES.join ? `“${settings.wifi.name}”` : `“${settings.wifi.name || name}”`;
  if (!wifi || wifi.mode !== mode || !wifi.ready || !wifi.ip) {
    // A board with no screen shows its Wi-Fi state in the live view's status check.
    const shows = rsnodeScreenless(status) ? 'status check in rsNode live view shows its Wi-Fi state.' : 'node\'s screen shows its Wi-Fi state.';
    return mode === WIFI_MODES.join
      ? `Saved. ${name} restarted but has not joined ${network} yet. Check the network name and password; the ${shows}`
      : `Saved. ${name} restarted but its own network is not up yet. The ${shows}`;
  }
  const where = mode === WIFI_MODES.join ? `joined ${network} at ${wifi.ip}.` : `runs its own network ${network} at ${wifi.ip}.`;
  const connect = repeater
    ? (settings.peers.enabled ? ` Peers connect to ${wifi.ip}, port ${settings.peers.port}.` : '')
    : ` Apps connect to ${wifi.ip}, port ${APP_PORT}.`;
  return `Saved. ${name} ${where}${connect}`;
}

/** The read-only radio lines: set on the device, shown here. */
export function settingsRadioLines(settings) {
  const radio = settings.radio;
  return {
    region: settings.region === null ? 'Not chosen' : REGIONS[settings.region] || `Region ${settings.region}`,
    radio: radio ? `${(radio.frequency / 1e6).toFixed(3)} MHz · ${+(radio.bandwidth / 1000).toFixed(2)} kHz · SF${radio.spreadingFactor} · ` +
      `CR 4/${radio.codingRate} · ${radio.txPower} dBm` : 'Not set up',
    ifac: settings.loraIfac.keySet ? (settings.loraIfac.enabled ? `On (${settings.loraIfac.size})` : 'Off') : 'Not set'
  };
}

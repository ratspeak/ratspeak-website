#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_STORE_DIR = path.join(repoRoot, '.tmp', 'maps-soak', 'rsreticulum', 'storage', 'discovery', 'interfaces');
const DEFAULT_OUT = path.join(repoRoot, '.tmp', 'map-live.json');
const THRESHOLD_UNKNOWN_SECS = 24 * 60 * 60;
const THRESHOLD_STALE_SECS = 3 * 24 * 60 * 60;
const THRESHOLD_REMOVE_SECS = 7 * 24 * 60 * 60;
const SERVER_TYPES = new Set(['BackboneInterface', 'TCPServerInterface', 'I2PInterface']);
const RNS_SOURCE_ID = 'ratspeak-discovery-store';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.once) {
  await writeSnapshot();
} else {
  await writeSnapshot();
  setInterval(() => {
    writeSnapshot().catch((error) => {
      console.error(`[maps-bridge] ${new Date().toISOString()} ${error.stack || error.message}`);
    });
  }, args.interval);
}

async function writeSnapshot() {
  const generatedAt = new Date();
  const { records, skipped, errors } = await readDiscoveryRecords(args.storeDir);
  const nodes = records
    .map((record) => recordToNode(record, generatedAt))
    .filter(Boolean);

  const snapshot = {
    schemaVersion: 1,
    sourceMode: 'live-discovery',
    generatedAt: generatedAt.toISOString(),
    ttlSeconds: 15 * 60,
    disclaimer: 'Live local discovery snapshot from rsReticulum discovery records.',
    sources: [
      {
        id: RNS_SOURCE_ID,
        label: 'Ratspeak discovery ingest',
        kind: 'server-observed',
        trust: 'operator'
      }
    ],
    stats: {
      recordsRead: records.length,
      nodesPlotted: nodes.length,
      skippedMissingLocation: skipped.missingLocation,
      skippedExpired: skipped.expired,
      decodeErrors: errors.length
    },
    nodes
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const errorSuffix = errors.length ? `, ${errors.length} decode errors` : '';
  console.log(
    `[maps-bridge] ${snapshot.generatedAt} wrote ${nodes.length} node(s) from ${records.length} record(s)` +
    ` (${skipped.missingLocation} missing location, ${skipped.expired} expired${errorSuffix})`
  );
}

async function readDiscoveryRecords(storeDir) {
  const skipped = { missingLocation: 0, expired: 0 };
  const errors = [];
  const records = [];
  let entries = [];

  try {
    entries = await readdir(storeDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { records, skipped, errors };
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.includes('.')) continue;
    const filePath = path.join(storeDir, entry.name);
    try {
      const record = decodeDiscoveryRecord(await readFile(filePath));
      const ageSeconds = secondsSince(record.last_heard);
      if (ageSeconds > THRESHOLD_REMOVE_SECS) {
        skipped.expired += 1;
        continue;
      }
      if (!args.includeZero && !hasUsableLocation(record)) {
        skipped.missingLocation += 1;
        continue;
      }
      records.push({ ...record, fileStem: entry.name });
    } catch (error) {
      errors.push({ file: entry.name, message: error.message });
    }
  }

  records.sort((a, b) => Number(b.last_heard || 0) - Number(a.last_heard || 0));
  return { records, skipped, errors };
}

function recordToNode(record, now) {
  const kind = kindForInterface(record.type);
  const services = servicesFor(record.type, kind);
  const transportId = stringOrNull(record.transport_id);
  const fileStem = stringOrNull(record.fileStem);
  const id = `disc:${fileStem || transportId || hashFallback(record)}`;
  const height = finiteNumber(record.height);
  const lat = finiteNumber(record.latitude);
  const lon = finiteNumber(record.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 85.05112878 || Math.abs(lon) > 180) {
    return null;
  }

  return {
    id,
    label: stringOrNull(record.name) || 'Unnamed node',
    kind,
    status: statusFor(record, now),
    sourceId: RNS_SOURCE_ID,
    sourceMode: 'live-discovery',
    lastSeen: isoFromUnix(record.last_heard),
    firstSeen: isoFromUnix(record.discovered),
    location: {
      lat,
      lon,
      ...(height == null ? {} : { heightMeters: height })
    },
    services,
    reticulum: {
      interfaceType: stringOrNull(record.type),
      transportId,
      networkId: stringOrNull(record.network_id),
      hops: finiteInteger(record.hops),
      stampValue: finiteInteger(record.value),
      heardCount: finiteInteger(record.heard_count),
      reachableOn: stringOrNull(record.reachable_on),
      port: finiteInteger(record.port),
      heightMeters: height,
      radio: radioFor(record)
    }
  };
}

function kindForInterface(type) {
  return SERVER_TYPES.has(type) ? 'server' : 'client-auto';
}

function servicesFor(type, kind) {
  const services = ['rns.transport'];
  if (type === 'TCPServerInterface') services.push('tcp.server');
  else if (type === 'I2PInterface') services.push('i2p.server');
  else if (type === 'RNodeInterface' || type === 'KISSInterface') services.push('lora.mesh');
  else if (kind === 'client-auto') services.push('discoverable');
  return services;
}

function statusFor(record, now) {
  const ageSeconds = Math.max(0, Math.floor(now.getTime() / 1000) - Number(record.last_heard || 0));
  if (ageSeconds > THRESHOLD_STALE_SECS) return 'stale';
  if (ageSeconds > THRESHOLD_UNKNOWN_SECS) return 'unknown';
  return 'available';
}

function hasUsableLocation(record) {
  const lat = finiteNumber(record.latitude);
  const lon = finiteNumber(record.longitude);
  if (lat == null || lon == null) return false;
  if (Math.abs(lat) > 85.05112878 || Math.abs(lon) > 180) return false;
  return Math.abs(lat) > 0.000001 || Math.abs(lon) > 0.000001;
}

function radioFor(record) {
  const radio = {};
  for (const [from, to] of [
    ['frequency', 'frequency'],
    ['bandwidth', 'bandwidth'],
    ['sf', 'spreadingFactor'],
    ['cr', 'codingRate'],
    ['modulation', 'modulation'],
    ['channel', 'channel']
  ]) {
    const value = from === 'modulation' ? stringOrNull(record[from]) : finiteInteger(record[from]);
    if (value != null) radio[to] = value;
  }
  return Object.keys(radio).length ? radio : null;
}

function decodeDiscoveryRecord(bytes) {
  const decoder = new MsgpackDecoder(bytes);
  const value = decoder.read();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('top-level value is not a map');
  }
  return value;
}

class MsgpackDecoder {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  read() {
    const marker = this.u8();

    if (marker <= 0x7f) return marker;
    if (marker >= 0xe0) return marker - 0x100;
    if ((marker & 0xe0) === 0xa0) return this.str(marker & 0x1f);
    if ((marker & 0xf0) === 0x80) return this.map(marker & 0x0f);
    if ((marker & 0xf0) === 0x90) return this.array(marker & 0x0f);

    switch (marker) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return this.bin(this.u8());
      case 0xc5: return this.bin(this.u16());
      case 0xc6: return this.bin(this.u32());
      case 0xca: return this.float32();
      case 0xcb: return this.float64();
      case 0xcc: return this.u8();
      case 0xcd: return this.u16();
      case 0xce: return this.u32();
      case 0xcf: return Number(this.u64());
      case 0xd0: return this.i8();
      case 0xd1: return this.i16();
      case 0xd2: return this.i32();
      case 0xd3: return Number(this.i64());
      case 0xd9: return this.str(this.u8());
      case 0xda: return this.str(this.u16());
      case 0xdb: return this.str(this.u32());
      case 0xdc: return this.array(this.u16());
      case 0xdd: return this.array(this.u32());
      case 0xde: return this.map(this.u16());
      case 0xdf: return this.map(this.u32());
      default: throw new Error(`unsupported msgpack marker 0x${marker.toString(16)}`);
    }
  }

  map(length) {
    const out = {};
    for (let i = 0; i < length; i += 1) {
      const key = this.read();
      out[String(key)] = this.read();
    }
    return out;
  }

  array(length) {
    const out = [];
    for (let i = 0; i < length; i += 1) out.push(this.read());
    return out;
  }

  str(length) {
    return new TextDecoder().decode(this.take(length));
  }

  bin(length) {
    return Buffer.from(this.take(length)).toString('hex');
  }

  take(length) {
    if (this.offset + length > this.bytes.length) throw new Error('truncated msgpack data');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  u8() {
    if (this.offset >= this.bytes.length) throw new Error('truncated msgpack data');
    return this.bytes[this.offset++];
  }

  i8() {
    const value = this.u8();
    return value > 0x7f ? value - 0x100 : value;
  }

  u16() {
    const value = this.bytes.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  i16() {
    const value = this.bytes.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    const value = this.bytes.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  i32() {
    const value = this.bytes.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  u64() {
    const value = this.bytes.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  i64() {
    const value = this.bytes.readBigInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  float32() {
    const value = this.bytes.readFloatBE(this.offset);
    this.offset += 4;
    return value;
  }

  float64() {
    const value = this.bytes.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    storeDir: DEFAULT_STORE_DIR,
    out: DEFAULT_OUT,
    interval: 5000,
    once: false,
    includeZero: false,
    help: false
  };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === '--store-dir') parsed.storeDir = path.resolve(rawArgs[++i]);
    else if (arg === '--out') parsed.out = path.resolve(rawArgs[++i]);
    else if (arg === '--interval') parsed.interval = Number(rawArgs[++i]);
    else if (arg === '--once') parsed.once = true;
    else if (arg === '--include-zero') parsed.includeZero = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.interval) || parsed.interval < 1000) {
    throw new Error('--interval must be at least 1000 milliseconds');
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/maps-discovery-bridge.mjs [options]

Options:
  --store-dir <dir>   rsReticulum discovery interface store
  --out <file>        output snapshot JSON
  --interval <ms>     polling interval for continuous mode
  --once              write one snapshot and exit
  --include-zero      plot records at 0,0 if present
  -h, --help          show this help
`);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function secondsSince(unixSeconds) {
  return Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSeconds || 0));
}

function isoFromUnix(unixSeconds) {
  const seconds = Number(unixSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function hashFallback(record) {
  return Buffer.from(`${record.type || ''}:${record.name || ''}:${record.latitude || ''}:${record.longitude || ''}`)
    .toString('base64url')
    .slice(0, 24);
}

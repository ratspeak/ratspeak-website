#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_SNAPSHOT = path.join(repoRoot, '.tmp', 'map-live.json');
const DEFAULT_TOKEN_ENV = 'MAP_INGEST_TOKEN';

const args = parseArgs(process.argv.slice(2));

async function main() {
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.url) {
    throw new Error('Missing ingest URL. Pass --url or set MAP_INGEST_URL.');
  }
  if (!args.token) {
    throw new Error(`Missing ingest token. Pass --token-env or set ${args.tokenEnv}.`);
  }

  if (args.intervalMs) {
    await publishOnce();
    setInterval(() => {
      publishOnce().catch((error) => {
        console.error(`[map-publish] ${new Date().toISOString()} ${error.stack || error.message}`);
      });
    }, args.intervalMs);
  } else {
    await publishOnce();
  }
}

async function publishOnce() {
  const raw = await readFile(args.snapshot, 'utf8');
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || payload.schemaVersion !== 1 || !Array.isArray(payload.nodes)) {
    throw new Error('Snapshot must be schemaVersion 1 with a nodes array');
  }

  const response = await fetch(args.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let detail;
  try {
    detail = JSON.parse(text);
  } catch (_error) {
    detail = text;
  }

  if (!response.ok) {
    throw new Error(`Ingest failed with ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }

  const published = typeof detail === 'object' && detail
    ? `${detail.nodes ?? payload.nodes.length} node(s), generated ${detail.generatedAt || payload.generatedAt || 'unknown'}`
    : `${payload.nodes.length} node(s)`;
  console.log(`[map-publish] ${new Date().toISOString()} published ${published}`);
}

function parseArgs(argv) {
  const parsed = {
    snapshot: DEFAULT_SNAPSHOT,
    url: process.env.MAP_INGEST_URL || '',
    tokenEnv: DEFAULT_TOKEN_ENV,
    token: process.env[DEFAULT_TOKEN_ENV] || '',
    intervalMs: 0,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };

    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--snapshot') parsed.snapshot = path.resolve(next());
    else if (arg === '--url') parsed.url = next();
    else if (arg === '--token-env') {
      parsed.tokenEnv = next();
      parsed.token = process.env[parsed.tokenEnv] || '';
    } else if (arg === '--interval') {
      const seconds = Number(next());
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--interval must be a positive number of seconds');
      parsed.intervalMs = Math.round(seconds * 1000);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/map-publish-snapshot.mjs [options]

Publishes a prepared map snapshot JSON file to the authenticated Vercel ingest endpoint.

Options:
  --snapshot <path>    Snapshot JSON file. Defaults to .tmp/map-live.json
  --url <url>          Ingest URL. Defaults to MAP_INGEST_URL
  --token-env <name>   Environment variable containing the bearer token. Defaults to MAP_INGEST_TOKEN
  --interval <secs>    Keep publishing at this interval instead of exiting after one publish
  --help              Show this help

Example:
  MAP_INGEST_TOKEN=... MAP_INGEST_URL=https://ratspeak.org/api/map-ingest \\
    node scripts/map-publish-snapshot.mjs --snapshot /var/lib/ratspeak-map/map-live.json
`);
}

main().catch((error) => {
  console.error(`[map-publish] ${error.stack || error.message}`);
  process.exitCode = 1;
});

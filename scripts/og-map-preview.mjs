// Render the og:image banner locally from a live or file snapshot.
// Usage: node scripts/og-map-preview.mjs [snapshot.json|url] [out.png]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildMapSvg } from '../lib/og-map-render.js';

const source = process.argv[2] || 'https://ratspeak.org/api/map-nodes';
const outPath = process.argv[3] || '.tmp/og-map-preview.png';

const snapshot = source.startsWith('http')
  ? await (await fetch(source)).json()
  : JSON.parse(readFileSync(source, 'utf8'));

const svg = buildMapSvg(snapshot, {
  land: JSON.parse(readFileSync(new URL('./data/ne_110m_land.geojson', import.meta.url), 'utf8')),
  countries: JSON.parse(readFileSync(new URL('./data/ne_110m_admin_0_countries.geojson', import.meta.url), 'utf8'))
});

const png = new Resvg(svg, {
  font: {
    fontFiles: [fileURLToPath(new URL('../lib/fonts/JetBrainsMono-Medium.ttf', import.meta.url))],
    defaultFontFamily: 'JetBrains Mono',
    loadSystemFonts: false
  }
}).render().asPng();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`${outPath} (${(png.length / 1024).toFixed(0)} KiB, ${(snapshot.nodes || []).length} nodes)`);

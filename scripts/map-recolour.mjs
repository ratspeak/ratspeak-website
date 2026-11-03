// Derives the served basemaps from the base styles in scripts/map-styles: every paint colour is
// re-toned by lightness onto the cobalt/paper (light) or navy (dark) ramp, then a few
// surfaces are pinned so land, water and labels sit on the site's own tokens.
// Run from the website root after map-world-view.mjs: node scripts/map-recolour.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'scripts/map-styles';
const TARGET = 'assets/map-styles';

const RAMPS = {
  light: [[0, '#15204a'], [0.45, '#3d4a8a'], [0.7, '#8e9ad0'], [0.85, '#c3cdf2'], [0.93, '#e3e9fc'], [1, '#ffffff']],
  dark: [[0, '#050a24'], [0.04, '#0a0f2e'], [0.1, '#131b48'], [0.14, '#1b2459'], [0.25, '#2a3570'], [0.42, '#6a76ad'], [0.6, '#a9b5e8'], [1, '#eef2ff']]
};

// layer id -> paint property -> colour
const PINS = {
  light: {
    background: { 'background-color': '#f7f9ff' },
    water: { 'fill-color': '#cbd6fa' },
    waterway: { 'line-color': '#b9c6f5' },
    park: { 'fill-color': '#ecf1fd' },
    landcover_wood: { 'fill-color': '#e8eefc' },
    landcover_ice_shelf: { 'fill-color': '#fbfcff' },
    landcover_glacier: { 'fill-color': '#fbfcff' },
    road_area_pier: { 'fill-color': '#f7f9ff' },
    road_pier: { 'line-color': '#f7f9ff' },
    'highway-name-path': { 'text-halo-color': '#f7f9ff' },
    water_name_point_label: { 'text-color': '#3a52c4' },
    water_name_line_label: { 'text-color': '#3a52c4' }
  },
  dark: {
    background: { 'background-color': '#131b48' },
    water: { 'fill-color': '#0a0f2e' },
    waterway: { 'line-color': '#0a0f2e' },
    landcover_ice_shelf: { 'fill-color': '#151e4c' },
    landcover_glacier: { 'fill-color': '#151e4c' },
    landuse_residential: { 'fill-color': '#17214f' },
    landcover_wood: { 'fill-color': '#172150' },
    landuse_park: { 'fill-color': '#172150' },
    building: { 'fill-color': '#1a2456', 'fill-outline-color': '#222c60' },
    'aeroway-area': { 'fill-color': '#0e1640' },
    'aeroway-runway': { 'line-color': '#0e1640' },
    road_area_pier: { 'fill-color': '#131b48' },
    road_pier: { 'line-color': '#131b48' },
    railway_transit_dashline: { 'line-color': '#131b48' },
    railway_minor_dashline: { 'line-color': '#131b48' },
    railway_dashline: { 'line-color': '#131b48' },
    water_name: { 'text-color': '#6a78b8', 'text-halo-color': 'rgba(10,15,46,0.8)' }
  }
};

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));

function parse(value) {
  let m = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
    return { rgb: hex('#' + h), a: 1 };
  }
  m = value.match(/^rgba?\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  m = value.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    const [h, s, l] = [+m[1] / 360, +m[2] / 100, +m[3] / 100];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
    return { rgb: [f(h + 1 / 3), f(h), f(h - 1 / 3)], a: m[4] === undefined ? 1 : +m[4] };
  }
  return null;
}

function lightness([r, g, b]) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : y * 24389 / 27) / 100;
}

function retone(value, ramp) {
  const color = parse(value);
  if (!color) return value;
  const l = lightness(color.rgb);
  let i = 1;
  while (i < ramp.length - 1 && ramp[i][0] < l) i++;
  const [l0, c0] = ramp[i - 1], [l1, c1] = ramp[i];
  const t = Math.min(1, Math.max(0, (l - l0) / (l1 - l0)));
  const [a, b] = [hex(c0), hex(c1)];
  const rgb = a.map((v, k) => Math.round(v + (b[k] - v) * t));
  return color.a === 1 ? '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('') : `rgba(${rgb.join(',')},${color.a})`;
}

const walk = (node, ramp) =>
  typeof node === 'string' ? retone(node, ramp)
    : Array.isArray(node) ? node.map(n => walk(n, ramp))
    : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, ramp)]))
    : node;

// The live styles draw the world view from Natural Earth below this zoom
// (scripts/map-world-view.mjs); this script only re-colours that layer pair.
const DETAIL_ZOOM = 3;
const WORLD = {
  light: { ocean: '#cbd6fa', land: '#f7f9ff', border: '#a9b4e0' },
  dark: { ocean: '#0a0f2e', land: '#131b48', border: '#2a3570' }
};

for (const theme of ['light', 'dark']) {
  const style = JSON.parse(readFileSync(`${SOURCE}/ratspeak-${theme}.json`, 'utf8'));
  style.name = `Ratspeak ${theme === 'light' ? 'Paper' : 'Navy'}`;
  const w = WORLD[theme];
  const pins = { ...PINS[theme], 'world-land': { 'fill-color': w.land }, 'world-borders': { 'line-color': w.border } };
  for (const layer of style.layers) {
    if (layer.paint) layer.paint = walk(layer.paint, RAMPS[theme]);
    Object.assign(layer.paint ??= {}, pins[layer.id]);
  }
  const unused = Object.keys(pins).filter(id => !style.layers.some(l => l.id === id));
  if (unused.length) throw new Error(`${theme}: no layer ${unused.join(', ')}`);
  style.layers.find(l => l.id === 'background').paint['background-color'] = ['step', ['zoom'], w.ocean, DETAIL_ZOOM, w.land];
  writeFileSync(`${TARGET}/ratspeak-${theme}.json`, JSON.stringify(style) + '\n');
}

// Makes the map's world view cheap. Below DETAIL_ZOOM both styles draw land and
// borders from a small self-hosted Natural Earth file instead of the provider's
// low-zoom vector tiles (~6 MB for the opening view), and labels use Latin script
// only (native-script names pulled ~770 KB of extra glyph ranges). Idempotent.
// Run from the website root: node scripts/map-world-view.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'assets/map-styles';
const DETAIL_ZOOM = 3;
const WORLD_URL = `${DIR}/world-110m.geojson`;
const COLORS = {
  dark: { ocean: 'rgb(27,27,29)', land: 'rgb(12,12,12)', border: 'hsl(0,0%,23%)' },
  light: { ocean: 'rgb(194,200,202)', land: 'rgb(242,243,240)', border: 'hsl(0,0%,70%)' }
};
const LATIN_LABEL = ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];

const round = coords => typeof coords[0] === 'number' ? coords.map(v => Math.round(v * 100) / 100) : coords.map(round);
const countries = JSON.parse(readFileSync('scripts/data/ne_110m_admin_0_countries.geojson', 'utf8'));
writeFileSync(WORLD_URL, JSON.stringify({
  type: 'FeatureCollection',
  features: countries.features.map(f => ({ type: 'Feature', properties: {}, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } }))
}) + '\n');

for (const theme of ['dark', 'light']) {
  const path = `${DIR}/ratspeak-${theme}.json`;
  const style = JSON.parse(readFileSync(path, 'utf8'));
  const c = COLORS[theme];
  style.layers = style.layers.filter(l => l.source !== 'world');
  for (const layer of style.layers) {
    if (layer.source === 'openmaptiles') layer.minzoom = Math.max(layer.minzoom ?? 0, DETAIL_ZOOM);
    if (JSON.stringify(layer.layout?.['text-field'] ?? '').includes('name:nonlatin')) layer.layout['text-field'] = LATIN_LABEL;
  }
  const background = style.layers.find(l => l.id === 'background');
  background.paint['background-color'] = ['step', ['zoom'], c.ocean, DETAIL_ZOOM, c.land];
  style.sources.world = { type: 'geojson', data: WORLD_URL, attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>' };
  style.layers.splice(style.layers.indexOf(background) + 1, 0,
    { id: 'world-land', type: 'fill', source: 'world', maxzoom: DETAIL_ZOOM, paint: { 'fill-color': c.land } },
    { id: 'world-borders', type: 'line', source: 'world', maxzoom: DETAIL_ZOOM, paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 3, 0.9] } });
  writeFileSync(path, JSON.stringify(style, null, 2) + '\n');
}

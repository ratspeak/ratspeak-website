import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  basemapStyleUrl,
  createFallbackStyle,
  isProviderResourceError
} from '../assets/map-basemap.js';

const stylePaths = {
  dark: new URL('../assets/map-styles/ratspeak-dark.json', import.meta.url),
  light: new URL('../assets/map-styles/ratspeak-light.json', import.meta.url)
};

const placeLayerIds = {
  dark: {
    local: ['place_other', 'place_suburb'],
    village: 'place_village',
    town: 'place_town',
    cityLocal: 'place_city',
    cityMajor: 'place_city_large',
    state: 'place_state',
    stateUs: 'place_state_us',
    stateBoundary: 'boundary_state'
  },
  light: {
    local: ['label_other'],
    village: 'label_village',
    town: 'label_town',
    cityLocal: 'label_city_local',
    cityMajor: 'label_city',
    state: 'label_state',
    stateUs: 'label_state_us',
    stateBoundary: 'boundary_state'
  }
};

async function readStyle(theme) {
  return JSON.parse(await readFile(stylePaths[theme], 'utf8'));
}

test('theme styles are local versioned assets', () => {
  assert.match(basemapStyleUrl('dark'), /^assets\/map-styles\/ratspeak-dark\.json\?v=/);
  assert.match(basemapStyleUrl('light'), /^assets\/map-styles\/ratspeak-light\.json\?v=/);
  assert.equal(basemapStyleUrl('unknown'), basemapStyleUrl('dark'));
});

for (const [theme, path] of Object.entries(stylePaths)) {
  test(`${theme} style uses OpenFreeMap without legacy CARTO requests`, async () => {
    const style = JSON.parse(await readFile(path, 'utf8'));
    const serialized = JSON.stringify(style);
    const symbolLayers = style.layers.filter((layer) => layer.type === 'symbol');

    assert.equal(style.version, 8);
    assert.equal(style.sources.openmaptiles.type, 'vector');
    assert.match(style.sources.openmaptiles.url, /^https:\/\/tiles\.openfreemap\.org\//);
    assert.match(style.sources.openmaptiles.attribution, /OpenFreeMap/);
    assert.doesNotMatch(serialized, /cartocdn|CARTO|api[_ -]?key/i);
    assert.ok(symbolLayers.length > 0);
    assert.ok(symbolLayers.every((layer) => layer.minzoom >= 2.35));
  });

  test(`${theme} style progressively discloses place labels`, async () => {
    const style = await readStyle(theme);
    const layers = new Map(style.layers.map((layer) => [layer.id, layer]));
    const ids = placeLayerIds[theme];
    const getLayer = (id) => {
      const layer = layers.get(id);
      assert.ok(layer, `missing ${id}`);
      return layer;
    };

    for (const id of ids.local) {
      const layer = getLayer(id);
      assert.ok(layer.minzoom >= 13, `${id} must stay hidden until close-range zoom`);
      assert.doesNotMatch(JSON.stringify(layer.filter), /isolated_dwelling/);
      assert.ok(layer.layout['text-padding'] >= 12);
    }

    assert.ok(getLayer(ids.village).minzoom >= 12);
    assert.ok(getLayer(ids.town).minzoom >= 7);
    assert.ok(getLayer(ids.cityLocal).minzoom >= 5.5);
    const cityMajorLayer = getLayer(ids.cityMajor);
    assert.ok(cityMajorLayer.minzoom <= 3);
    assert.ok(cityMajorLayer.maxzoom == null || cityMajorLayer.maxzoom >= 8);
    assert.ok(getLayer(ids.cityLocal).layout['text-padding'] >= 20);
    assert.ok(cityMajorLayer.layout['text-padding'] >= 24);

    const stateLayer = getLayer(ids.state);
    assert.ok(stateLayer.minzoom >= 5.5);
    assert.ok(stateLayer.maxzoom <= 8);
    assert.ok(stateLayer.paint['text-opacity'] <= 0.55);
    assert.equal(stateLayer.layout['text-ignore-placement'], true);

    const usStateLayer = getLayer(ids.stateUs);
    const usStateFilter = JSON.stringify(usStateLayer.filter);
    assert.ok(usStateLayer.minzoom <= 4);
    assert.ok(usStateLayer.maxzoom <= 5.5);
    assert.ok(usStateLayer.layout['text-padding'] >= 26);
    assert.equal(usStateLayer.layout['text-ignore-placement'], true);
    assert.match(usStateFilter, /California/);
    assert.match(usStateFilter, /Colorado/);
    assert.match(usStateFilter, /Texas/);
    assert.match(usStateFilter, /New York/);
    assert.doesNotMatch(usStateFilter, /Bavaria|Voivodeship|Oblast/);

    const stateBoundaryLayer = getLayer(ids.stateBoundary);
    assert.equal(stateBoundaryLayer['source-layer'], 'boundary');
    assert.equal(stateBoundaryLayer.minzoom, cityMajorLayer.minzoom);
    assert.match(JSON.stringify(stateBoundaryLayer.filter), /admin_level/);
  });
}

test('fallback style is provider-independent and preserves geographic context', () => {
  const style = createFallbackStyle('dark', 'scripts/data/countries.geojson');

  assert.equal(style.version, 8);
  assert.equal(style.sources.countries.data, 'scripts/data/countries.geojson');
  assert.deepEqual(
    style.layers.map((layer) => layer.id),
    ['fallback-ocean', 'fallback-land', 'fallback-borders']
  );
  assert.doesNotMatch(JSON.stringify(style), /openfreemap|carto/i);
});

test('provider resource errors are detected without treating local failures as provider outages', () => {
  assert.equal(isProviderResourceError({ sourceId: 'openmaptiles' }), true);
  assert.equal(isProviderResourceError({ error: { message: 'Failed https://tiles.openfreemap.org/planet' } }), true);
  assert.equal(isProviderResourceError({ sourceId: 'ratspeak-nodes' }), false);
  assert.equal(isProviderResourceError({ error: { message: 'Local GeoJSON failed' } }), false);
});

const STYLE_URLS = Object.freeze({
  dark: 'assets/map-styles/ratspeak-dark.json?v=maplibre-7',
  light: 'assets/map-styles/ratspeak-light.json?v=maplibre-7'
});

const PROVIDER_SOURCE_IDS = new Set(['openmaptiles', 'ne2_shaded']);
const PROVIDER_HOST = 'tiles.openfreemap.org';

export function basemapStyleUrl(theme) {
  return STYLE_URLS[theme] || STYLE_URLS.dark;
}

export function createFallbackStyle(theme, countriesUrl) {
  const light = theme === 'light';
  return {
    version: 8,
    name: `Ratspeak ${light ? 'Light' : 'Dark'} fallback`,
    sources: {
      countries: {
        type: 'geojson',
        data: countriesUrl,
        attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>'
      }
    },
    layers: [
      {
        id: 'fallback-ocean',
        type: 'background',
        paint: {
          'background-color': light ? '#CBD6FA' : '#0A0F2E'
        }
      },
      {
        id: 'fallback-land',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': light ? '#F7F9FF' : '#131B48',
          'fill-opacity': 1
        }
      },
      {
        id: 'fallback-borders',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': light ? '#A9B4E0' : '#2A3570',
          'line-opacity': light ? 0.72 : 0.8,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            2, 0.55,
            7, 1.15
          ]
        }
      }
    ]
  };
}

export function isProviderResourceError(event) {
  const sourceId = event?.sourceId || event?.source?.id || '';
  if (PROVIDER_SOURCE_IDS.has(sourceId)) return true;

  const message = String(event?.error?.message || event?.message || '');
  return message.includes(PROVIDER_HOST);
}

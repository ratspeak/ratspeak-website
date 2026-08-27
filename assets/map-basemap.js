const STYLE_URLS = Object.freeze({
  dark: 'assets/map-styles/ratspeak-dark.json?v=maplibre-5',
  light: 'assets/map-styles/ratspeak-light.json?v=maplibre-5'
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
          'background-color': light ? '#E7E0D7' : '#071014'
        }
      },
      {
        id: 'fallback-land',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': light ? '#F4EFE9' : '#171A1C',
          'fill-opacity': 1
        }
      },
      {
        id: 'fallback-borders',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': light ? '#C7BBB0' : '#30373A',
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

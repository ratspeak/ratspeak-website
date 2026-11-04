# MapLibre GL JS

This directory vendors the browser distribution from `maplibre-gl@6.3.0`.
Keeping the runtime on `ratspeak.org` removes a third-party CDN dependency from
the map boot path. The upstream license is preserved in `LICENSE.txt`.

When updating MapLibre, copy these production files from the package's `dist/`
directory and update the version query in `map.html`:

- `maplibre-gl.css`
- `maplibre-gl.mjs`
- `maplibre-gl-shared.mjs`
- `maplibre-gl-worker.mjs`

Run `npm run check:map` and exercise both `map.html` and
`map.html?basemap=fallback` before deployment.

# Ratspeak map styles

`ratspeak-dark.json` and `ratspeak-light.json` are locally owned MapLibre styles
based on OpenFreeMap's Dark and Positron styles. They use OpenFreeMap's public
vector tiles, sprites, glyphs, and Natural Earth raster source while keeping
style changes under this repository's control.

The styles intentionally simplify the world view: most labels appear after the
initial zoom, detail increases as you zoom in, and attribution remains enabled.
If the provider resources fail repeatedly, `assets/map.js` replaces the
style with a provider-independent Natural Earth country outline instead of
losing the map or its node layer.

Both themes follow the same place-label hierarchy. Countries and major cities
provide the wide-area reference; ordinary cities begin at zoom 5.5, towns at 7,
villages at 12, and suburbs, neighbourhoods, and hamlets at 13 or later.
Isolated dwellings stay hidden. City layers use rank-based placement and more
collision padding so nearby local labels cannot crowd out the useful anchor.
U.S. state names are the wide-area exception: they appear from zoom 4 through
5.5, after which the normal state layer takes over. Subnational borders begin at
zoom 3 alongside major cities in both themes. State-name layers ignore placement,
so they cannot displace major-city labels as zoom detail changes.

Below zoom 3 the world view draws from `world-110m.geojson` (Natural Earth
countries) instead of the provider's low-zoom vector tiles. Name labels prefer
English, then Latin-script names, then the original name when those are missing.
This reduces glyph downloads but does not guarantee Latin-only text.

The served styles are generated. `scripts/map-styles/` holds the base styles in
the provider's colours; edit those, never the files here. From the repository
root, `npm run map:styles` runs `scripts/map-world-view.mjs` (regenerates
`world-110m.geojson` and the base styles' low-zoom layers and label rules), then
`scripts/map-recolour.mjs` (re-tones the base styles onto the site palette and
writes both files here). Review the resulting diff before keeping changes; the
world-view step replaces the generated world layers and may raise vector-layer
minimum zooms.

After changing either style, run `npm run check:map`. The fallback can be tested
deterministically with `map.html?basemap=fallback`.

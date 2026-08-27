# Ratspeak map styles

`ratspeak-dark.json` and `ratspeak-light.json` are locally owned MapLibre styles
based on OpenFreeMap's Dark and Positron styles. They use OpenFreeMap's public
vector tiles, sprites, glyphs, and Natural Earth raster source while keeping
style changes under this repository's control.

The styles intentionally simplify the world view: most labels appear after the
initial zoom, road detail begins at street-level zooms, and attribution remains
enabled. If the provider resources fail repeatedly, `assets/map.js` replaces the
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

After changing either style, run `npm run check:map`. The fallback can be tested
deterministically with `map.html?basemap=fallback`.

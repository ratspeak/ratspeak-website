## Map Bridge Data

`ne_110m_land.geojson` is the Natural Earth 1:110m land polygon dataset, used by
the local Ratspeak Map discovery bridge to suppress obviously open-water
coordinates before writing `.tmp/map-live.json`.

`ne_110m_populated_places_simple.geojson` is the Natural Earth 1:110m populated
places dataset, used to derive offline nearest-city labels for map node detail
panels.

`ne_110m_admin_0_countries.geojson` is the Natural Earth 1:110m country polygon
dataset, used to show country-only location labels when a node cannot be matched
to a nearby populated place.

Source: https://github.com/nvkelso/natural-earth-vector
License: public domain.

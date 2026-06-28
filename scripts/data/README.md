## Map Bridge Data

`ne_110m_land.geojson` is the Natural Earth 1:110m land polygon dataset, used by
the local Ratspeak Maps discovery bridge to suppress obviously open-water
coordinates before writing `.tmp/map-live.json`.

`ne_110m_populated_places_simple.geojson` is the Natural Earth 1:110m populated
places dataset, used to derive offline nearest-city labels for map node detail
panels.

Source: https://github.com/nvkelso/natural-earth-vector
License: public domain.

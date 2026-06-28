## Map Bridge Data

`ne_110m_land.geojson` is the Natural Earth 1:110m land polygon dataset, used by
the local Ratspeak Maps discovery bridge to suppress obviously open-water
coordinates before writing `.tmp/map-live.json`.

`ne_110m_admin_0_countries.geojson` is the Natural Earth 1:110m country polygon
dataset, used to show country-only location labels when a node does not provide
an explicit city.

Source: https://github.com/nvkelso/natural-earth-vector
License: public domain.

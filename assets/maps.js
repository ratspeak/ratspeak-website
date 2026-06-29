import { buildMapSnapshot } from './map-data.js';
import { isYggdrasilAddress, textMentionsYggdrasil } from './map-network.js';
import { buildCountryIndex, buildPlaceIndex, locationLabelForNode } from './map-places.js';

const API_URL = '/api/map-nodes';
const LIVE_SNAPSHOT_URL = '/.tmp/map-live.json';
const SNAPSHOT_URLS = [LIVE_SNAPSHOT_URL, API_URL];
const SNAPSHOT_REFRESH_MS = 15_000;
const LAND_MASK_URL = 'scripts/data/ne_110m_land.geojson';
const PLACE_GAZETTEER_URL = 'scripts/data/ne_110m_populated_places_simple.geojson';
const COUNTRY_GEOJSON_URL = 'scripts/data/ne_110m_admin_0_countries.geojson';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

const CARTO_TILE_BASE_URL = 'https://{s}.basemaps.cartocdn.com';
const TILE_LAYER_STYLES = {
  light: {
    labels: 'light_all',
    noLabels: 'light_nolabels'
  },
  dark: {
    labels: 'dark_all',
    noLabels: 'dark_nolabels'
  }
};

const KIND_META = {
  server: {
    label: 'Server',
    badgeLabel: 'Server',
    shortLabel: 'Server',
    color: '#1687B8'
  },
  'client-auto': {
    label: 'Client (Auto)',
    badgeLabel: 'Client',
    shortLabel: 'Auto',
    color: '#35B875'
  },
  'client-manual': {
    label: 'Client (Manual)',
    badgeLabel: 'Client',
    shortLabel: 'Manual',
    color: '#C79A2B'
  },
  i2p: {
    label: 'I2P',
    badgeLabel: 'I2P',
    shortLabel: 'I2P',
    color: '#D2693B'
  },
  yggdrasil: {
    label: 'Yggdrasil',
    badgeLabel: 'Yggdrasil',
    shortLabel: 'Ygg',
    color: '#E989B1'
  }
};

const MARKER_SCALE_BANDS = [
  { maxZoom: 2, size: 5.5, selectedCore: 7.5, selected: 17, ring: 1.75, ringAlpha: 16, selectedRing: 2.75, selectedHalo: 5.5 },
  { maxZoom: 3, size: 6.1, selectedCore: 8, selected: 18, ring: 1.85, ringAlpha: 17, selectedRing: 3, selectedHalo: 6 },
  { maxZoom: 4, size: 6.8, selectedCore: 8.7, selected: 19.5, ring: 2, ringAlpha: 18, selectedRing: 3, selectedHalo: 6 },
  { maxZoom: 5, size: 7.4, selectedCore: 9.3, selected: 21, ring: 2, ringAlpha: 17, selectedRing: 3, selectedHalo: 6.5 },
  { maxZoom: 8, size: 8, selectedCore: 10, selected: 22, ring: 2, ringAlpha: 16, selectedRing: 3, selectedHalo: 7 },
  { maxZoom: Infinity, size: 8.5, selectedCore: 10, selected: 22, ring: 2, ringAlpha: 14, selectedRing: 3, selectedHalo: 7 }
];

const MARKER_ICON_SIZE = 32;
const DENSE_MARKER_DISTANCE_PX = 18;
const MIN_MAP_ZOOM = 2;
const LOW_ZOOM_LABEL_CUTOFF = MIN_MAP_ZOOM;
const LOW_ZOOM_LABELS = [
  { label: 'North America', lat: 48, lon: -103 },
  { label: 'South America', lat: -18, lon: -60 },
  { label: 'Europe', lat: 52, lon: 17 },
  { label: 'Africa', lat: 6, lon: 21 },
  { label: 'Asia', lat: 47, lon: 86 },
  { label: 'Oceania', lat: -23, lon: 136 },
  { label: 'Antarctica', lat: -75, lon: 18 }
];
const DECLUTTER_ITERATIONS = 3;
const DECLUTTER_NEIGHBOR_DISTANCE_PX = 17;
const DECLUTTER_MIN_DISTANCE_PX = 10;
const DECLUTTER_MAX_OFFSET_PX = 8;
const DECLUTTER_MAX_STRENGTH = 0.7;
const DECLUTTER_LOCAL_COLLISION_DISTANCE_PX = 10;
const DECLUTTER_LOCAL_MAX_STRENGTH = 0.5;
const DECLUTTER_FULL_ZOOM = MIN_MAP_ZOOM;
const DECLUTTER_END_ZOOM = MIN_MAP_ZOOM + 2.6;
const WEB_MERCATOR_LAT_LIMIT = 85.05112878;
const WRAPPED_WORLD_BOUNDS = [
  [-WEB_MERCATOR_LAT_LIMIT, -540],
  [WEB_MERCATOR_LAT_LIMIT, 540]
];
const MARKER_WORLD_OFFSETS = [-360, 0, 360];

const state = {
  snapshot: null,
  filteredNodes: [],
  selectedId: null,
  kindFilter: 'all',
  statusFilter: 'all',
  query: '',
  map: null,
  tileLayer: null,
  tileLayerUrl: '',
  lowZoomLabelLayer: null,
  markerLayer: null,
  markers: new Map(),
  markerPlacements: new Map(),
  markerScale: MARKER_SCALE_BANDS[0],
  landMask: null,
  placeIndex: [],
  countryIndex: [],
  nodeCursorActive: false,
  refreshTimer: null,
  suppressMapClickUntil: 0
};

const els = {
  app: document.getElementById('mapsApp'),
  map: document.getElementById('map'),
  fallback: document.getElementById('mapFallback'),
  nodeDetail: document.getElementById('nodeDetail'),
  mapMenu: document.getElementById('mapMenu'),
  mapMenuToggle: document.getElementById('mapMenuToggle'),
  mapMenuBody: document.getElementById('mapMenuBody'),
  searchInput: document.getElementById('nodeSearch'),
  kindSelect: document.getElementById('kindFilter'),
  statusSelect: document.getElementById('statusFilter'),
  navbar: document.getElementById('navbar'),
  themeToggle: document.getElementById('themeToggle'),
  navHamburger: document.getElementById('navHamburger'),
  navMobileMenu: document.getElementById('navMobileMenu'),
  themeMeta: document.querySelector('meta[name="theme-color"]')
};

init();

async function init() {
  bindChrome();
  bindControls();
  const [snapshot, landMask, placeIndex, countryIndex] = await Promise.all([
    loadSnapshot(),
    loadLandMask(),
    loadPlaceIndex(),
    loadCountryIndex()
  ]);
  state.snapshot = snapshot;
  state.landMask = landMask;
  state.placeIndex = placeIndex;
  state.countryIndex = countryIndex;
  initMap();
  applyFilters();
  scheduleSnapshotRefresh();
}

function bindChrome() {
  const syncThemeColor = () => {
    if (!els.themeMeta) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
    if (bg) els.themeMeta.setAttribute('content', bg);
  };

  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const htmlEl = document.documentElement;
      const next = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      htmlEl.setAttribute('data-theme', next);
      localStorage.setItem('ratspeak-theme', next);
      syncThemeColor();
      syncMapTheme();
    });
  }
  syncThemeColor();

  if (els.navHamburger && els.navMobileMenu) {
    els.navHamburger.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = els.navMobileMenu.classList.toggle('open');
      els.navHamburger.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!els.navMobileMenu.contains(event.target) && !els.navHamburger.contains(event.target)) {
        els.navMobileMenu.classList.remove('open');
        els.navHamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (els.navbar) {
    const syncNavbar = () => {
      els.navbar.classList.toggle('scrolled', window.scrollY > 10);
    };
    syncNavbar();
    window.addEventListener('scroll', syncNavbar, { passive: true });
  }
}

function bindControls() {
  if (els.mapMenu && els.mapMenuToggle && els.mapMenuBody) {
    els.mapMenuToggle.addEventListener('click', () => {
      const expanded = els.mapMenuToggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      els.mapMenuToggle.setAttribute('aria-expanded', String(nextExpanded));
      els.mapMenuBody.hidden = !nextExpanded;
      els.mapMenu.classList.toggle('is-collapsed', !nextExpanded);
    });
  }

  if (els.kindSelect) {
    els.kindSelect.addEventListener('change', () => {
      state.kindFilter = els.kindSelect.value;
      applyFilters();
    });
  }

  if (els.statusSelect) {
    els.statusSelect.addEventListener('change', () => {
      state.statusFilter = els.statusSelect.value;
      applyFilters();
    });
  }

  if (els.searchInput) {
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value.trim().toLowerCase();
      applyFilters();
    });
  }

}

async function loadSnapshot() {
  for (const url of SNAPSHOT_URLS) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.nodes)) throw new Error(`${url} response missing nodes`);
      return payload;
    } catch (error) {
      console.info('Map snapshot source unavailable:', error.message);
    }
  }

  return buildMapSnapshot(new Date());
}

async function loadLandMask() {
  try {
    const response = await fetch(LAND_MASK_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${LAND_MASK_URL} returned ${response.status}`);
    const geojson = await response.json();
    const polygons = [];

    for (const feature of geojson.features || []) {
      const geometry = feature.geometry;
      if (!geometry) continue;

      const polygonGroups = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];

      for (const rings of polygonGroups) {
        if (!Array.isArray(rings) || !rings.length) continue;
        polygons.push({ rings, bbox: bboxForRing(rings[0]) });
      }
    }

    return polygons.length ? { polygons } : null;
  } catch (error) {
    console.info('Map land mask unavailable:', error.message);
    return null;
  }
}

async function loadCountryIndex() {
  try {
    const response = await fetch(COUNTRY_GEOJSON_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${COUNTRY_GEOJSON_URL} returned ${response.status}`);
    return buildCountryIndex(await response.json());
  } catch (error) {
    console.info('Map country index unavailable:', error.message);
    return [];
  }
}

async function loadPlaceIndex() {
  try {
    const response = await fetch(PLACE_GAZETTEER_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${PLACE_GAZETTEER_URL} returned ${response.status}`);
    return buildPlaceIndex(await response.json());
  } catch (error) {
    console.info('Map place gazetteer unavailable:', error.message);
    return [];
  }
}

function scheduleSnapshotRefresh() {
  if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(refreshSnapshot, SNAPSHOT_REFRESH_MS);
}

async function refreshSnapshot() {
  const previousSelectedId = state.selectedId;
  state.snapshot = await loadSnapshot();
  if (previousSelectedId && !(state.snapshot.nodes || []).some((node) => node.id === previousSelectedId)) {
    state.selectedId = null;
  }
  applyFilters();
  scheduleSnapshotRefresh();
}

function initMap() {
  if (!window.L) {
    els.app.classList.add('map-unavailable');
    els.fallback.hidden = false;
    return;
  }

  state.map = window.L.map(els.map, {
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: false,
    maxBoundsViscosity: 1
  });

  const minZoom = viewportMinZoom();
  state.map.setMinZoom(minZoom);
  state.map.setMaxBounds(WRAPPED_WORLD_BOUNDS);
  state.map.setView([29, -18], minZoom);

  window.L.control.zoom({ position: 'bottomleft' }).addTo(state.map);
  window.L.control.attribution({
    position: 'bottomright',
    prefix: false
  }).addTo(state.map);

  state.tileLayerUrl = tileLayerUrl();
  state.tileLayer = window.L.tileLayer(state.tileLayerUrl, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION
  }).addTo(state.map);

  initLowZoomLabels();
  state.markerLayer = window.L.layerGroup().addTo(state.map);
  updateMarkerScale();
  state.map.on('zoomend', () => {
    syncMapTheme();
    updateMarkerScale();
    renderMap();
  });
  state.map.on('dragstart', () => {
    suppressNextMapClick();
    clearNodeCursor();
  });
  state.map.on('dragend', suppressNextMapClick);
  state.map.on('mousemove', syncNodeCursor);
  state.map.on('mouseout', clearNodeCursor);
  state.map.on('click', handleMapClick);
  window.addEventListener('resize', syncMapViewport, { passive: true });
}

function syncMapTheme() {
  if (!state.tileLayer) return;
  const nextUrl = tileLayerUrl();
  if (state.tileLayerUrl !== nextUrl) {
    state.tileLayerUrl = nextUrl;
    state.tileLayer.setUrl(nextUrl);
  }
  syncLowZoomLabels();
}

function tileLayerUrl() {
  const theme = currentTheme();
  const styles = TILE_LAYER_STYLES[theme] || TILE_LAYER_STYLES.dark;
  const style = isLowZoomLabelMode() ? styles.noLabels : styles.labels;
  return `${CARTO_TILE_BASE_URL}/${style}/{z}/{x}/{y}{r}.png`;
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function isLowZoomLabelMode() {
  return state.map ? state.map.getZoom() <= LOW_ZOOM_LABEL_CUTOFF + 0.001 : true;
}

function initLowZoomLabels() {
  state.map.createPane('continentLabels');
  const pane = state.map.getPane('continentLabels');
  pane.classList.add('continent-label-pane');
  pane.style.zIndex = 360;
  pane.style.pointerEvents = 'none';
  state.lowZoomLabelLayer = window.L.layerGroup().addTo(state.map);
  syncLowZoomLabels();
}

function syncLowZoomLabels() {
  if (!state.lowZoomLabelLayer || !window.L) return;
  state.lowZoomLabelLayer.clearLayers();
  if (!isLowZoomLabelMode()) return;

  LOW_ZOOM_LABELS.forEach((label) => {
    MARKER_WORLD_OFFSETS.forEach((worldOffset) => {
      window.L.marker([label.lat, label.lon + worldOffset], {
        pane: 'continentLabels',
        interactive: false,
        keyboard: false,
        icon: window.L.divIcon({
          className: 'continent-label-icon',
          html: `<span class="continent-label">${escapeHtml(label.label)}</span>`,
          iconSize: [170, 24],
          iconAnchor: [85, 12]
        })
      }).addTo(state.lowZoomLabelLayer);
    });
  });
}

function syncMapViewport() {
  if (!state.map) return;
  state.map.invalidateSize();
  const minZoom = viewportMinZoom();
  state.map.setMinZoom(minZoom);
  if (state.map.getZoom() < minZoom) state.map.setZoom(minZoom);
  state.map.panInsideBounds(state.map.options.maxBounds, { animate: false });
  syncMapTheme();
}

function viewportMinZoom() {
  return MIN_MAP_ZOOM;
}

function applyFilters() {
  const nodes = state.snapshot.nodes || [];
  state.filteredNodes = nodes.filter((node) => {
    const kind = nodeKind(node);
    const matchesKind = state.kindFilter === 'all' || kind === state.kindFilter;
    const matchesStatus = state.statusFilter === 'all' || node.status === state.statusFilter;
    const queryBlob = [
      nodeDisplayName(node),
      kind,
      node.status,
      nodeLocationLabel(node),
      node.reticulum?.interfaceType,
      node.reticulum?.networkId,
      ...(node.services || [])
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !state.query || queryBlob.includes(state.query);
    return matchesKind && matchesStatus && matchesQuery;
  });

  if (state.selectedId && !state.filteredNodes.some((node) => node.id === state.selectedId)) {
    state.selectedId = null;
  }

  renderDetail();
  renderMap();
}

function renderDetail() {
  const node = selectedNode();
  if (!node) {
    els.nodeDetail.hidden = true;
    els.nodeDetail.innerHTML = '';
    return;
  }

  els.nodeDetail.hidden = false;
  const kindId = nodeKind(node);
  const kind = KIND_META[kindId] || KIND_META['client-manual'];
  const reticulum = node.reticulum || {};
  const endpoint = nodeEndpoint(node, reticulum);
  const radio = radioSummary(reticulum);
  const location = nodeLocationLabel(node);
  const coord = `${formatCoord(node.location?.lat, 'lat')}, ${formatCoord(node.location?.lon, 'lon')}`;
  const fields = [
    detailField('Last seen', lastSeenLabel(node)),
    location ? detailField('Location', location) : '',
    detailField('Coordinates', coord, true, true),
    reticulum.interfaceType ? detailField('Interface', reticulum.interfaceType) : '',
    reticulum.heardCount == null ? '' : detailField('Heard', `${reticulum.heardCount} times`),
    detailField('Services', serviceTags(node.services), true, false, true),
    radio ? detailField('Radio', radio, true, true) : '',
    endpoint.address ? detailField(endpoint.label, endpoint.address, true, true) : '',
    endpoint.port == null ? '' : detailField('Port', String(endpoint.port), false, true)
  ].filter(Boolean).join('');

  els.nodeDetail.innerHTML = `
    <div class="detail-head">
      <div class="detail-kicker">
        <span class="eyebrow">Selected node</span>
        <span class="detail-actions">
          <span class="tag tag--type" style="--type-color: ${kind.color}">${escapeHtml(kind.badgeLabel || kind.label)}</span>
          <button class="detail-close" type="button" aria-label="Close selected node details" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </span>
      </div>
      <h2 class="detail-title">${escapeHtml(nodeDisplayName(node))}</h2>
    </div>
    <dl class="detail-list">
      ${fields}
    </dl>
  `;

  els.nodeDetail.querySelector('.detail-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    clearSelectedNode();
  });
}

function renderMap() {
  if (!state.map) return;

  state.markerLayer.clearLayers();
  state.markers.clear();
  state.markerPlacements = getMarkerDisplayLayout(state.filteredNodes);
  const denseNodeIds = getDenseNodeIds(state.filteredNodes);

  state.filteredNodes.forEach((node) => {
    const statusClass = cssToken(node.status);
    const kindClass = cssToken(nodeKind(node));
    const isSelected = node.id === state.selectedId ? ' is-selected' : '';
    const isDense = denseNodeIds.has(node.id) ? ' is-dense' : '';
    MARKER_WORLD_OFFSETS.forEach((worldOffset) => {
      const key = markerKey(node, worldOffset);
      const placement = state.markerPlacements.get(key) || ZERO_PLACEMENT;
      const latLng = [node.location.lat, node.location.lon + worldOffset];
      const icon = window.L.divIcon({
        className: 'ratspeak-marker-icon',
        html: `<span class="map-pin map-pin--${kindClass} map-pin--${statusClass}${isSelected}${isDense}" style="${markerSpreadStyle(placement)}" aria-hidden="true"></span>`,
        iconSize: [MARKER_ICON_SIZE, MARKER_ICON_SIZE],
        iconAnchor: [MARKER_ICON_SIZE / 2, MARKER_ICON_SIZE / 2]
      });

      const marker = window.L.marker(latLng, {
        icon,
        title: nodeDisplayName(node),
        interactive: false,
        keyboard: false,
        zIndexOffset: node.id === state.selectedId ? 1000 : 0
      }).addTo(state.markerLayer);

      state.markers.set(`${node.id}:${worldOffset}`, marker);
    });
  });
}

const ZERO_PLACEMENT = Object.freeze({ dx: 0, dy: 0, isSpread: false });

function getMarkerDisplayLayout(nodes) {
  const placements = new Map();
  if (!state.map) return placements;

  const items = [];
  const sortedNodes = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  sortedNodes.forEach((node) => {
    MARKER_WORLD_OFFSETS.forEach((worldOffset) => {
      const key = markerKey(node, worldOffset);
      const point = state.map.latLngToContainerPoint([node.location.lat, node.location.lon + worldOffset]);
      items.push({
        key,
        node,
        x: point.x,
        y: point.y,
        dx: 0,
        dy: 0,
        nearestOriginalDistance: Infinity
      });
      placements.set(key, ZERO_PLACEMENT);
    });
  });

  const zoomStrength = declutterStrength();
  if (items.length < 2) return placements;

  const neighborDistanceSq = DECLUTTER_NEIGHBOR_DISTANCE_PX * DECLUTTER_NEIGHBOR_DISTANCE_PX;
  for (let iteration = 0; iteration < DECLUTTER_ITERATIONS; iteration++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const originalDx = a.x - b.x;
        const originalDy = a.y - b.y;
        const originalDistanceSq = (originalDx * originalDx) + (originalDy * originalDy);
        if (originalDistanceSq > neighborDistanceSq) continue;

        const originalDistance = Math.sqrt(originalDistanceSq);
        a.nearestOriginalDistance = Math.min(a.nearestOriginalDistance, originalDistance);
        b.nearestOriginalDistance = Math.min(b.nearestOriginalDistance, originalDistance);

        const displayDx = (a.x + a.dx) - (b.x + b.dx);
        const displayDy = (a.y + a.dy) - (b.y + b.dy);
        const distance = Math.hypot(displayDx, displayDy);
        if (distance >= DECLUTTER_MIN_DISTANCE_PX) continue;

        const { x: ux, y: uy } = spreadDirection(a, b, displayDx, displayDy, distance);
        const push = (DECLUTTER_MIN_DISTANCE_PX - distance) * 0.32;
        a.dx += ux * push;
        a.dy += uy * push;
        b.dx -= ux * push;
        b.dy -= uy * push;
        clampSpread(a);
        clampSpread(b);
      }
    }
  }

  items.forEach((item) => {
    const strength = Math.max(zoomStrength, localCollisionStrength(item));
    const { dx, dy } = guardSpreadOnLand(
      item,
      roundPixel(item.dx * strength),
      roundPixel(item.dy * strength)
    );
    placements.set(item.key, {
      dx,
      dy,
      isSpread: Math.hypot(dx, dy) >= 0.5
    });
  });

  return placements;
}

function localCollisionStrength(item) {
  if (!Number.isFinite(item.nearestOriginalDistance)) return 0;
  if (item.nearestOriginalDistance >= DECLUTTER_LOCAL_COLLISION_DISTANCE_PX) return 0;

  const severity = 1 - (item.nearestOriginalDistance / DECLUTTER_LOCAL_COLLISION_DISTANCE_PX);
  return DECLUTTER_LOCAL_MAX_STRENGTH * severity;
}

function guardSpreadOnLand(item, dx, dy) {
  if (!state.landMask || (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1)) return { dx, dy };

  const realLat = item.node.location?.lat;
  const realLon = normalizeLongitude(item.node.location?.lon);
  if (!pointIsOnLand(realLat, realLon)) return { dx, dy };
  if (spreadPointIsOnLand(item, dx, dy)) return { dx, dy };

  for (const scale of [0.7, 0.45, 0.25]) {
    const nextDx = roundPixel(dx * scale);
    const nextDy = roundPixel(dy * scale);
    if (spreadPointIsOnLand(item, nextDx, nextDy)) return { dx: nextDx, dy: nextDy };
  }

  return ZERO_PLACEMENT;
}

function spreadPointIsOnLand(item, dx, dy) {
  if (!state.map) return true;
  const point = window.L.point(item.x + dx, item.y + dy);
  const latLng = state.map.containerPointToLatLng(point);
  return pointIsOnLand(latLng.lat, normalizeLongitude(latLng.lng));
}

function declutterStrength() {
  if (!state.map) return 0;
  const zoom = state.map.getZoom();
  if (zoom <= DECLUTTER_FULL_ZOOM) return DECLUTTER_MAX_STRENGTH;
  if (zoom >= DECLUTTER_END_ZOOM) return 0;

  const progress = (zoom - DECLUTTER_FULL_ZOOM) / (DECLUTTER_END_ZOOM - DECLUTTER_FULL_ZOOM);
  return DECLUTTER_MAX_STRENGTH * Math.max(0, 1 - (progress * progress));
}

function spreadDirection(a, b, dx, dy, distance) {
  if (distance > 0.001) {
    return { x: dx / distance, y: dy / distance };
  }

  const angle = stableAngle(`${a.key}:${b.key}`);
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
}

function stableAngle(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function clampSpread(item) {
  const distance = Math.hypot(item.dx, item.dy);
  if (distance <= DECLUTTER_MAX_OFFSET_PX) return;

  const scale = DECLUTTER_MAX_OFFSET_PX / distance;
  item.dx *= scale;
  item.dy *= scale;
}

function markerKey(node, worldOffset) {
  return `${node.id}:${worldOffset}`;
}

function markerSpreadStyle(placement) {
  const dx = placement?.dx || 0;
  const dy = placement?.dy || 0;
  return `--spread-x: ${dx}px; --spread-y: ${dy}px;`;
}

function roundPixel(value) {
  return Math.round(value * 10) / 10;
}

function handleMapClick(event) {
  if (Date.now() < state.suppressMapClickUntil) return;

  const hit = pickNodeAt(event.containerPoint);
  if (hit) {
    selectNode(hit.node.id, { pan: false });
    return;
  }

  clearSelectedNode();
}

function syncNodeCursor(event) {
  const active = Boolean(pickNodeAt(event.containerPoint));
  if (active === state.nodeCursorActive) return;

  state.nodeCursorActive = active;
  els.map.classList.toggle('is-node-hit', active);
}

function clearNodeCursor() {
  if (!state.nodeCursorActive) return;

  state.nodeCursorActive = false;
  els.map.classList.remove('is-node-hit');
}

function pickNodeAt(containerPoint) {
  if (!state.map || !containerPoint) return null;

  let nearest = null;
  state.filteredNodes.forEach((node) => {
    const radius = markerPickRadius(node);
    const radiusSq = radius * radius;

    MARKER_WORLD_OFFSETS.forEach((worldOffset) => {
      const key = markerKey(node, worldOffset);
      const placement = state.markerPlacements.get(key) || ZERO_PLACEMENT;
      const center = state.map.latLngToContainerPoint([node.location.lat, node.location.lon + worldOffset]);
      const dx = containerPoint.x - (center.x + placement.dx);
      const dy = containerPoint.y - (center.y + placement.dy);
      const distanceSq = (dx * dx) + (dy * dy);
      if (distanceSq > radiusSq) return;
      const candidate = { node, key, distanceSq };
      if (isBetterPick(candidate, nearest)) {
        nearest = candidate;
      }
    });
  });

  return nearest;
}

function isBetterPick(candidate, current) {
  if (!current) return true;
  if (candidate.node.id === state.selectedId && current.node.id !== state.selectedId) return true;
  if (candidate.node.id !== state.selectedId && current.node.id === state.selectedId) return false;
  if (Math.abs(candidate.distanceSq - current.distanceSq) > 0.01) {
    return candidate.distanceSq < current.distanceSq;
  }
  return candidate.key < current.key;
}

function markerPickRadius(node) {
  const scale = state.markerScale || MARKER_SCALE_BANDS[0];
  if (node.id === state.selectedId) {
    return (scale.selectedCore / 2) + scale.selectedRing + 2;
  }

  return (scale.size / 2) + 3;
}

function selectNode(id, options = {}) {
  state.selectedId = id;
  renderDetail();
  renderMap();

  const node = selectedNode();
  if (node && state.map && options.pan !== false) {
    state.map.panTo([node.location.lat, node.location.lon], {
      animate: true,
      duration: 0.4
    });
  }
}

function clearSelectedNode() {
  if (!state.selectedId) return;
  state.selectedId = null;
  renderDetail();
  renderMap();
}

function suppressNextMapClick() {
  state.suppressMapClickUntil = Date.now() + 220;
}

function updateMarkerScale() {
  if (!state.map || !els.map) return;
  const zoom = state.map.getZoom();
  const scale = MARKER_SCALE_BANDS.find((band) => zoom <= band.maxZoom) || MARKER_SCALE_BANDS.at(-1);
  state.markerScale = scale;
  const style = els.map.style;
  style.setProperty('--pin-size', `${scale.size}px`);
  style.setProperty('--pin-selected-size', `${scale.selected}px`);
  style.setProperty('--pin-selected-core-size', `${scale.selectedCore}px`);
  style.setProperty('--pin-ring', `${scale.ring}px`);
  style.setProperty('--pin-ring-alpha', `${scale.ringAlpha}%`);
  style.setProperty('--pin-selected-ring', `${scale.selectedRing}px`);
  style.setProperty('--pin-selected-halo', `${scale.selectedHalo}px`);
}

function getDenseNodeIds(nodes) {
  if (!state.map || nodes.length < 2) return new Set();
  const dense = new Set();
  const points = nodes.map((node) => ({
    id: node.id,
    point: state.map.latLngToLayerPoint([node.location.lat, node.location.lon])
  }));
  const thresholdSq = DENSE_MARKER_DISTANCE_PX * DENSE_MARKER_DISTANCE_PX;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].point.x - points[j].point.x;
      const dy = points[i].point.y - points[j].point.y;
      if ((dx * dx + dy * dy) <= thresholdSq) {
        dense.add(points[i].id);
        dense.add(points[j].id);
      }
    }
  }
  return dense;
}

function selectedNode() {
  return (state.snapshot.nodes || []).find((node) => node.id === state.selectedId) || null;
}

function nodeDisplayName(node) {
  const label = typeof node.label === 'string' ? node.label.trim() : '';
  return label || 'Unnamed node';
}

function nodeLocationLabel(node) {
  return locationLabelForNode(node, state.placeIndex, state.countryIndex);
}

function nodeKind(node) {
  if (isI2PNode(node)) return 'i2p';
  if (isYggdrasilNode(node)) return 'yggdrasil';
  if (KIND_META[node.kind]) return node.kind;
  return 'client-manual';
}

function isI2PNode(node) {
  if (node.kind === 'i2p') return true;
  if (node.reticulum?.interfaceType === 'I2PInterface') return true;
  return (node.services || []).some((service) => String(service).toLowerCase().includes('i2p'));
}

function isYggdrasilNode(node) {
  if (node.kind === 'yggdrasil') return true;
  if (String(node.reticulum?.interfaceType || '').toLowerCase().includes('yggdrasil')) return true;

  const endpoint = node.endpoint || {};
  const address = stringValue(endpoint.ip) ||
    stringValue(endpoint.host) ||
    stringValue(endpoint.address) ||
    stringValue(node.reticulum?.reachableOn);
  if (isYggdrasilAddress(address)) return true;

  return textMentionsYggdrasil(
    node.label,
    node.reticulum?.interfaceType,
    address,
    ...(node.services || [])
  );
}

function pointIsOnLand(lat, lon) {
  if (!state.landMask || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  for (const polygon of state.landMask.polygons) {
    if (!bboxContains(polygon.bbox, lat, lon)) continue;
    if (pointInPolygon(lon, lat, polygon.rings)) return true;
  }
  return false;
}

function pointInPolygon(x, y, rings) {
  if (!pointInRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(x, y, rings[i])) return false;
  }
  return true;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function bboxForRing(ring) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const point of ring) {
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  return { minLat, maxLat, minLon, maxLon };
}

function bboxContains(bbox, lat, lon) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

function detailField(label, value, _wide = false, code = false, html = false) {
  const valueClass = code ? ' detail-value--code' : '';
  const content = html ? value : escapeHtml(value);
  return `
    <div class="detail-row">
      <dt class="detail-label">${escapeHtml(label)}</dt>
      <dd class="detail-value${valueClass}">${content}</dd>
    </div>
  `;
}

function serviceTags(services = []) {
  if (!services.length) return '<span>None listed</span>';
  return `<span class="service-list">${services.map((service) => `<span class="tag">${escapeHtml(service)}</span>`).join('')}</span>`;
}

function nodeEndpoint(node, reticulum) {
  const endpoint = node.endpoint || {};
  const address = stringValue(endpoint.ip) ||
    stringValue(endpoint.host) ||
    stringValue(endpoint.address) ||
    stringValue(reticulum.reachableOn);

  if (isI2PNode(node)) {
    const port = positiveIntegerValue(endpoint.port) ?? positiveIntegerValue(reticulum.port);
    return {
      label: 'I2P',
      address,
      port
    };
  }

  if (isYggdrasilNode(node)) {
    return {
      label: 'Yggdrasil',
      address,
      port: positiveIntegerValue(endpoint.port) ?? positiveIntegerValue(reticulum.port)
    };
  }

  if (nodeKind(node) !== 'server') return {};

  return {
    label: 'IP',
    address,
    port: integerValue(endpoint.port) ?? integerValue(reticulum.port)
  };
}

function radioSummary(reticulum) {
  if (reticulum.interfaceType !== 'RNodeInterface' || !reticulum.radio) return '';

  const radio = reticulum.radio;
  const parts = [];
  const frequency = numberValue(radio.frequency);
  const bandwidth = numberValue(radio.bandwidth);
  const spreadingFactor = integerValue(radio.spreadingFactor ?? radio.spreading_factor ?? radio.sf);
  const codingRate = integerValue(radio.codingRate ?? radio.coding_rate ?? radio.cr);
  const txPower = integerValue(radio.txPowerDbm ?? radio.txPower ?? radio.tx_power);
  const modulation = stringValue(radio.modulation);
  const channel = integerValue(radio.channel);

  if (frequency != null) parts.push(formatFrequency(frequency));
  if (bandwidth != null) parts.push(`BW ${formatFrequency(bandwidth)}`);
  if (spreadingFactor != null) parts.push(`SF${spreadingFactor}`);
  if (codingRate != null) parts.push(`CR ${formatCodingRate(codingRate)}`);
  if (txPower != null) parts.push(`TX ${txPower} dBm`);
  if (modulation) parts.push(modulation);
  if (channel != null) parts.push(`CH ${channel}`);

  return parts.join(', ');
}

function formatFrequency(hz) {
  if (hz >= 1_000_000_000) return `${trimNumber(hz / 1_000_000_000, 3)} GHz`;
  if (hz >= 1_000_000) return `${trimNumber(hz / 1_000_000, 3)} MHz`;
  if (hz >= 1_000) return `${trimNumber(hz / 1_000, 3)} kHz`;
  return `${trimNumber(hz, 0)} Hz`;
}

function formatCodingRate(value) {
  return value >= 5 && value <= 8 ? `4/${value}` : String(value);
}

function trimNumber(value, digits) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

function lastSeenLabel(node) {
  if (!node.lastSeen) return 'Manual';
  return relativeTime(node.lastSeen);
}

function formatCoord(value, axis) {
  if (typeof value !== 'number') return 'Unknown';
  const hemi = axis === 'lat'
    ? (value >= 0 ? 'N' : 'S')
    : (value >= 0 ? 'E' : 'W');
  return `${Math.abs(value).toFixed(3)} ${hemi}`;
}

function normalizeLongitude(value) {
  const lon = Number(value);
  if (!Number.isFinite(lon)) return null;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function relativeTime(value) {
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  if (!Number.isFinite(delta)) return 'Unknown';
  const absSeconds = Math.max(1, Math.round(Math.abs(delta) / 1000));
  const suffix = delta >= 0 ? 'ago' : 'from now';

  if (absSeconds < 60) return `${absSeconds}s ${suffix}`;
  const minutes = Math.round(absSeconds / 60);
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  return `${days}d ${suffix}`;
}

function cssToken(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerValue(value) {
  const number = numberValue(value);
  return number == null ? null : Math.trunc(number);
}

function positiveIntegerValue(value) {
  const number = integerValue(value);
  return number != null && number > 0 ? number : null;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

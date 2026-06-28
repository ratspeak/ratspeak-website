import { buildMapSnapshot } from './map-data.js';

const API_URL = '/api/map-nodes';

const KIND_META = {
  server: {
    label: 'Server',
    badgeLabel: 'Server',
    shortLabel: 'Server',
    color: '#12a8ff'
  },
  'client-auto': {
    label: 'Client (Auto)',
    badgeLabel: 'Client',
    shortLabel: 'Auto',
    color: '#37f987'
  },
  'client-manual': {
    label: 'Client (Manual)',
    badgeLabel: 'Client',
    shortLabel: 'Manual',
    color: '#ffd344'
  }
};

const MARKER_SCALE_BANDS = [
  { maxZoom: 3, size: 7, selectedCore: 9, selected: 18, ring: 3.5, ringAlpha: 16, glow: 5.5, haloAlpha: 20, selectedRing: 3, selectedHalo: 6 },
  { maxZoom: 5, size: 8, selectedCore: 9, selected: 20, ring: 4, ringAlpha: 16, glow: 6, haloAlpha: 18, selectedRing: 3, selectedHalo: 6 },
  { maxZoom: 8, size: 9, selectedCore: 10, selected: 22, ring: 4, ringAlpha: 16, glow: 6.5, haloAlpha: 16, selectedRing: 3, selectedHalo: 6 },
  { maxZoom: Infinity, size: 9, selectedCore: 10, selected: 22, ring: 4, ringAlpha: 16, glow: 6.5, haloAlpha: 14, selectedRing: 3, selectedHalo: 6 }
];

const MARKER_ICON_SIZE = 32;
const DENSE_MARKER_DISTANCE_PX = 18;
const WEB_MERCATOR_LAT_LIMIT = 85.05112878;
const TILE_WORLD_SIZE = 256;
const MIN_MAP_ZOOM = 2;

const state = {
  snapshot: null,
  filteredNodes: [],
  selectedId: null,
  kindFilter: 'all',
  statusFilter: 'all',
  query: '',
  map: null,
  markerLayer: null,
  markers: new Map()
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
  state.snapshot = await loadSnapshot();
  initMap();
  applyFilters();
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
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Map API returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.nodes)) throw new Error('Map API response missing nodes');
    return payload;
  } catch (error) {
    console.info('Using local Ratspeak Maps seed data:', error.message);
    return buildMapSnapshot(new Date());
  }
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
    worldCopyJump: true,
    maxBoundsViscosity: 1
  });

  const minZoom = viewportMinZoom();
  state.map.setMinZoom(minZoom);
  state.map.setMaxBounds([
    [-WEB_MERCATOR_LAT_LIMIT, -360],
    [WEB_MERCATOR_LAT_LIMIT, 360]
  ]);
  state.map.setView([29, -18], minZoom);

  window.L.control.zoom({ position: 'bottomleft' }).addTo(state.map);
  window.L.control.attribution({
    position: 'bottomright',
    prefix: false
  }).addTo(state.map);

  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(state.map);

  state.markerLayer = window.L.layerGroup().addTo(state.map);
  updateMarkerScale();
  state.map.on('zoomend', () => {
    updateMarkerScale();
    renderMap();
  });
  window.addEventListener('resize', syncMapViewport, { passive: true });
}

function syncMapViewport() {
  if (!state.map) return;
  state.map.invalidateSize();
  const minZoom = viewportMinZoom();
  state.map.setMinZoom(minZoom);
  if (state.map.getZoom() < minZoom) state.map.setZoom(minZoom);
  state.map.panInsideBounds(state.map.options.maxBounds, { animate: false });
}

function viewportMinZoom() {
  const mapHeight = Math.max(els.map?.clientHeight || 0, 1);
  const zoomForHeight = Math.ceil(Math.log2(mapHeight / TILE_WORLD_SIZE));
  return Math.max(MIN_MAP_ZOOM, zoomForHeight);
}

function applyFilters() {
  const nodes = state.snapshot.nodes || [];
  state.filteredNodes = nodes.filter((node) => {
    const matchesKind = state.kindFilter === 'all' || node.kind === state.kindFilter;
    const matchesStatus = state.statusFilter === 'all' || node.status === state.statusFilter;
    const queryBlob = [
      nodeDisplayName(node),
      node.kind,
      node.status,
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
  const kind = KIND_META[node.kind] || KIND_META['client-manual'];
  const reticulum = node.reticulum || {};
  const source = (state.snapshot.sources || []).find((item) => item.id === node.sourceId);
  const coord = `${formatCoord(node.location?.lat, 'lat')}, ${formatCoord(node.location?.lon, 'lon')}`;
  const fields = [
    detailField('Last seen', lastSeenLabel(node)),
    detailField('Source', source?.label || node.sourceId || 'Unknown', true),
    detailField('Coordinates', coord, true, true),
    reticulum.interfaceType ? detailField('Interface', reticulum.interfaceType) : '',
    reticulum.heardCount == null ? '' : detailField('Heard', `${reticulum.heardCount} times`),
    detailField('Services', serviceTags(node.services), true, false, true)
  ].filter(Boolean).join('');

  els.nodeDetail.innerHTML = `
    <div class="detail-head">
      <div class="detail-kicker">
        <span class="eyebrow">Selected node</span>
        <span class="tag tag--type" style="--type-color: ${kind.color}">${escapeHtml(kind.badgeLabel || kind.label)}</span>
      </div>
      <h2 class="detail-title">${escapeHtml(nodeDisplayName(node))}</h2>
    </div>
    <dl class="detail-list">
      ${fields}
    </dl>
  `;
}

function renderMap() {
  if (!state.map) return;

  state.markerLayer.clearLayers();
  state.markers.clear();
  const denseNodeIds = getDenseNodeIds(state.filteredNodes);

  state.filteredNodes.forEach((node) => {
    const kind = KIND_META[node.kind] || KIND_META['client-manual'];
    const statusClass = cssToken(node.status);
    const kindClass = cssToken(node.kind);
    const isSelected = node.id === state.selectedId ? ' is-selected' : '';
    const isDense = denseNodeIds.has(node.id) ? ' is-dense' : '';
    const latLng = [node.location.lat, node.location.lon];

    const icon = window.L.divIcon({
      className: 'ratspeak-marker-icon',
      html: `<span class="map-pin map-pin--${kindClass} map-pin--${statusClass}${isSelected}${isDense}" style="--pin-color: ${kind.color}" aria-hidden="true"></span>`,
      iconSize: [MARKER_ICON_SIZE, MARKER_ICON_SIZE],
      iconAnchor: [MARKER_ICON_SIZE / 2, MARKER_ICON_SIZE / 2]
    });

    const marker = window.L.marker(latLng, {
      icon,
      title: nodeDisplayName(node),
      keyboard: true,
      zIndexOffset: node.id === state.selectedId ? 1000 : 0
    }).addTo(state.markerLayer);

    marker.on('click', () => selectNode(node.id, { pan: false }));
    marker.on('keypress', (event) => {
      if (event.originalEvent.key === 'Enter') selectNode(node.id, { pan: false });
    });
    state.markers.set(node.id, marker);
  });
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

function updateMarkerScale() {
  if (!state.map || !els.map) return;
  const zoom = state.map.getZoom();
  const scale = MARKER_SCALE_BANDS.find((band) => zoom <= band.maxZoom) || MARKER_SCALE_BANDS.at(-1);
  const style = els.map.style;
  style.setProperty('--pin-size', `${scale.size}px`);
  style.setProperty('--pin-selected-size', `${scale.selected}px`);
  style.setProperty('--pin-selected-core-size', `${scale.selectedCore}px`);
  style.setProperty('--pin-ring', `${scale.ring}px`);
  style.setProperty('--pin-ring-alpha', `${scale.ringAlpha}%`);
  style.setProperty('--pin-glow', `${scale.glow}px`);
  style.setProperty('--pin-halo-alpha', `${scale.haloAlpha}%`);
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

import { buildMapSnapshot } from './map-data.js';

const API_URL = '/api/map-nodes';

const KIND_META = {
  'operator-relay': {
    label: 'Operator relay',
    shortLabel: 'Relay',
    color: '#58a6ff'
  },
  'discovered-interface': {
    label: 'Discovered interface',
    shortLabel: 'Observed',
    color: '#45d89c'
  },
  'manual-listing': {
    label: 'Manual listing',
    shortLabel: 'Manual',
    color: '#f2c94c'
  },
  identity: {
    label: 'Identity',
    shortLabel: 'Identity',
    color: '#b18cff'
  }
};

const STATUS_META = {
  available: {
    label: 'Available',
    color: '#45d89c'
  },
  recent: {
    label: 'Recent',
    color: '#58a6ff'
  },
  unknown: {
    label: 'Unknown',
    color: '#8fa4a8'
  },
  stale: {
    label: 'Stale',
    color: '#f2c94c'
  },
  unverified: {
    label: 'Unverified',
    color: '#f2c94c'
  }
};

const state = {
  snapshot: null,
  filteredNodes: [],
  selectedId: null,
  kindFilter: 'all',
  statusFilter: 'all',
  query: '',
  showPrecision: true,
  map: null,
  markerLayer: null,
  precisionLayer: null,
  markers: new Map()
};

const els = {
  app: document.getElementById('mapsApp'),
  map: document.getElementById('map'),
  fallback: document.getElementById('mapFallback'),
  modePill: document.getElementById('modePill'),
  generatedAt: document.getElementById('generatedAt'),
  totalCount: document.getElementById('totalCount'),
  observedCount: document.getElementById('observedCount'),
  manualCount: document.getElementById('manualCount'),
  staleCount: document.getElementById('staleCount'),
  visibleCount: document.getElementById('visibleCount'),
  nodeList: document.getElementById('nodeList'),
  nodeDetail: document.getElementById('nodeDetail'),
  searchInput: document.getElementById('nodeSearch'),
  precisionToggle: document.getElementById('precisionToggle'),
  fitBtn: document.getElementById('fitBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
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
  state.selectedId = state.snapshot.nodes[0]?.id || null;
  initMap();
  applyFilters();
}

function bindChrome() {
  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const htmlEl = document.documentElement;
      const next = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      htmlEl.setAttribute('data-theme', next);
      localStorage.setItem('ratspeak-theme', next);
      if (els.themeMeta) els.themeMeta.setAttribute('content', '#070b0d');
    });
  }

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
}

function bindControls() {
  document.querySelectorAll('[data-kind-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.kindFilter = button.dataset.kindFilter;
      setActive('[data-kind-filter]', button);
      applyFilters();
    });
  });

  document.querySelectorAll('[data-status-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.statusFilter = button.dataset.statusFilter;
      setActive('[data-status-filter]', button);
      applyFilters();
    });
  });

  if (els.searchInput) {
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value.trim().toLowerCase();
      applyFilters();
    });
  }

  if (els.precisionToggle) {
    els.precisionToggle.addEventListener('click', () => {
      state.showPrecision = !state.showPrecision;
      els.precisionToggle.setAttribute('aria-pressed', String(state.showPrecision));
      renderMap();
    });
  }

  if (els.fitBtn) {
    els.fitBtn.addEventListener('click', () => fitVisibleNodes());
  }

  if (els.refreshBtn) {
    els.refreshBtn.addEventListener('click', async () => {
      els.refreshBtn.disabled = true;
      try {
        state.snapshot = await loadSnapshot();
        if (!state.snapshot.nodes.some((node) => node.id === state.selectedId)) {
          state.selectedId = state.snapshot.nodes[0]?.id || null;
        }
        applyFilters();
      } finally {
        els.refreshBtn.disabled = false;
      }
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
    attributionControl: true,
    worldCopyJump: true
  }).setView([29, -18], 2);

  window.L.control.zoom({ position: 'bottomleft' }).addTo(state.map);

  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(state.map);

  state.precisionLayer = window.L.layerGroup().addTo(state.map);
  state.markerLayer = window.L.layerGroup().addTo(state.map);
}

function applyFilters() {
  const nodes = state.snapshot.nodes || [];
  state.filteredNodes = nodes.filter((node) => {
    const matchesKind = state.kindFilter === 'all' || node.kind === state.kindFilter;
    const matchesStatus = state.statusFilter === 'all' || node.status === state.statusFilter;
    const queryBlob = [
      node.label,
      node.kind,
      node.status,
      node.location?.label,
      node.reticulum?.interfaceType,
      node.reticulum?.networkId,
      ...(node.services || [])
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !state.query || queryBlob.includes(state.query);
    return matchesKind && matchesStatus && matchesQuery;
  });

  if (state.selectedId && !state.filteredNodes.some((node) => node.id === state.selectedId)) {
    state.selectedId = state.filteredNodes[0]?.id || null;
  }

  renderSummary();
  renderList();
  renderDetail();
  renderMap();
}

function renderSummary() {
  const nodes = state.snapshot.nodes || [];
  const observed = nodes.filter((node) => node.kind === 'discovered-interface').length;
  const manual = nodes.filter((node) => node.kind === 'manual-listing' || node.kind === 'identity').length;
  const stale = nodes.filter((node) => node.status === 'stale' || node.status === 'unknown').length;

  els.modePill.textContent = state.snapshot.sourceMode === 'exploratory-sample' ? 'Sample data' : 'Live preview';
  els.generatedAt.textContent = `Updated ${relativeTime(state.snapshot.generatedAt)}`;
  els.totalCount.textContent = String(nodes.length);
  els.observedCount.textContent = String(observed);
  els.manualCount.textContent = String(manual);
  els.staleCount.textContent = String(stale);
  els.visibleCount.textContent = `${state.filteredNodes.length} shown`;
}

function renderList() {
  if (!state.filteredNodes.length) {
    els.nodeList.innerHTML = '<div class="empty-list">No nodes match the current filters.</div>';
    return;
  }

  els.nodeList.innerHTML = state.filteredNodes.map((node) => {
    const kind = KIND_META[node.kind] || KIND_META.identity;
    const status = STATUS_META[node.status] || STATUS_META.unknown;
    const selected = node.id === state.selectedId ? ' is-selected' : '';
    return `
      <button class="node-row${selected}" type="button" data-node-id="${escapeHtml(node.id)}" style="--node-color: ${kind.color}; --status-color: ${status.color}">
        <span class="node-swatch" aria-hidden="true"></span>
        <span class="node-row-main">
          <span class="node-row-top">
            <span class="node-label">${escapeHtml(node.label)}</span>
            <span class="node-age">${escapeHtml(lastSeenLabel(node))}</span>
          </span>
          <span class="node-meta">
            <span class="tag">${escapeHtml(kind.shortLabel)}</span>
            <span class="tag tag--status">${escapeHtml(status.label)}</span>
          </span>
        </span>
      </button>
    `;
  }).join('');

  els.nodeList.querySelectorAll('[data-node-id]').forEach((button) => {
    button.addEventListener('click', () => selectNode(button.dataset.nodeId));
  });
}

function renderDetail() {
  const node = selectedNode();
  if (!node) {
    els.nodeDetail.innerHTML = `
      <div class="detail-head">
        <span class="eyebrow">Selection</span>
        <h2 class="detail-title">No node selected</h2>
      </div>
    `;
    return;
  }

  const kind = KIND_META[node.kind] || KIND_META.identity;
  const status = STATUS_META[node.status] || STATUS_META.unknown;
  const reticulum = node.reticulum || {};
  const source = (state.snapshot.sources || []).find((item) => item.id === node.sourceId);
  const coord = `${formatCoord(node.location?.lat, 'lat')}, ${formatCoord(node.location?.lon, 'lon')}`;

  els.nodeDetail.innerHTML = `
    <div class="detail-head">
      <div class="detail-kicker">
        <span class="eyebrow">${escapeHtml(kind.label)}</span>
        <span class="tag tag--status" style="--status-color: ${status.color}">${escapeHtml(status.label)}</span>
      </div>
      <h2 class="detail-title">${escapeHtml(node.label)}</h2>
      <p class="detail-location">${escapeHtml(node.location?.label || coord)}</p>
    </div>
    <div class="detail-grid">
      ${detailField('Last seen', lastSeenLabel(node))}
      ${detailField('Precision', precisionLabel(node))}
      ${detailField('Source', source?.label || node.sourceId || 'Unknown', true)}
      ${detailField('Verification', readableToken(node.verification))}
      ${detailField('Consent', readableToken(node.privacy?.consent))}
      ${detailField('Coordinates', coord, true, true)}
      ${detailField('Network ID', reticulum.networkId || 'Not attached', true, true)}
      ${detailField('Interface', reticulum.interfaceType || 'Not attached')}
      ${detailField('Hops', reticulum.hops == null ? 'Unknown' : String(reticulum.hops))}
      ${detailField('Heard', reticulum.heardCount == null ? 'Unknown' : `${reticulum.heardCount} times`)}
      ${detailField('Services', serviceTags(node.services), true, false, true)}
    </div>
  `;
}

function renderMap() {
  if (!state.map) return;

  state.markerLayer.clearLayers();
  state.precisionLayer.clearLayers();
  state.markers.clear();

  state.filteredNodes.forEach((node) => {
    const kind = KIND_META[node.kind] || KIND_META.identity;
    const statusClass = cssToken(node.status);
    const kindClass = cssToken(node.kind);
    const isSelected = node.id === state.selectedId ? ' is-selected' : '';
    const latLng = [node.location.lat, node.location.lon];

    if (state.showPrecision && node.location.precisionKm) {
      window.L.circle(latLng, {
        radius: node.location.precisionKm * 1000,
        interactive: false,
        stroke: true,
        color: kind.color,
        weight: 1,
        opacity: 0.22,
        fillColor: kind.color,
        fillOpacity: node.location.precisionKm > 500 ? 0.025 : 0.055
      }).addTo(state.precisionLayer);
    }

    const icon = window.L.divIcon({
      className: '',
      html: `<span class="map-pin map-pin--${kindClass} map-pin--${statusClass}${isSelected}" style="--pin-color: ${kind.color}" aria-hidden="true"></span>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    });

    const marker = window.L.marker(latLng, {
      icon,
      title: node.label,
      keyboard: true
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
  renderList();
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

function fitVisibleNodes() {
  if (!state.map || !state.filteredNodes.length) return;
  const bounds = window.L.latLngBounds(
    state.filteredNodes.map((node) => [node.location.lat, node.location.lon])
  );
  const wide = window.matchMedia('(min-width: 901px)').matches;
  state.map.fitBounds(bounds.pad(0.18), {
    animate: true,
    paddingTopLeft: wide ? [410, 50] : [36, 260],
    paddingBottomRight: wide ? [390, 120] : [36, 220]
  });
}

function selectedNode() {
  return (state.snapshot.nodes || []).find((node) => node.id === state.selectedId) || null;
}

function setActive(selector, activeButton) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle('is-active', button === activeButton);
  });
}

function detailField(label, value, wide = false, code = false, html = false) {
  const wideClass = wide ? ' detail-field--wide' : '';
  const valueClass = code ? ' detail-value--code' : '';
  const content = html ? value : escapeHtml(value);
  return `
    <div class="detail-field${wideClass}">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value${valueClass}">${content}</span>
    </div>
  `;
}

function serviceTags(services = []) {
  if (!services.length) return '<span class="detail-value">None listed</span>';
  return `<span class="service-list">${services.map((service) => `<span class="tag">${escapeHtml(service)}</span>`).join('')}</span>`;
}

function lastSeenLabel(node) {
  if (!node.lastSeen) return 'Manual';
  return relativeTime(node.lastSeen);
}

function precisionLabel(node) {
  const km = Number(node.location?.precisionKm || 0);
  if (!km) return 'Unknown';
  if (km >= 1000) return `${Math.round(km / 100) / 10}k km`;
  return `${Math.round(km)} km`;
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

function readableToken(value) {
  if (!value) return 'Unknown';
  return String(value)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

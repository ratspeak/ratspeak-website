// Pure SVG renderer for the daily map share banner (og:image).
// Web Mercator, world width = image width, frame clipped to inhabited latitudes.

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const LAT_TOP = 74;
// Clamp keeps polar vertices (Antarctica reaches -90) from producing infinite
// Mercator y, which would invalidate the whole SVG path.
const LAT_LIMIT = 85;
const RAD_PER_PX = (2 * Math.PI) / OG_WIDTH;
const Y_TOP = mercatorY(LAT_TOP);

// Mirrors KIND_META colors in assets/map.js -- keep in sync.
export const KIND_COLORS = {
  'server-ipv4': '#1687B8',
  'server-ipv6': '#1F4E95',
  'client-auto': '#35B875',
  'client-manual': '#C79A2B',
  i2p: '#D2693B',
  yggdrasil: '#E989B1'
};
const FALLBACK_COLOR = '#8B8794';

const THEME = {
  bg: '#131215',
  land: '#2A282F',
  coast: '#413E47',
  border: '#36333C',
  captionStrong: '#C9C5D0'
};

function mercatorY(latDeg) {
  const lat = Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, latDeg));
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

export function project(lat, lon) {
  return {
    x: ((lon + 180) / 360) * OG_WIDTH,
    y: (Y_TOP - mercatorY(lat)) / RAD_PER_PX
  };
}

function inFrame(x, y, margin = 0) {
  return x >= -margin && x <= OG_WIDTH + margin && y >= -margin && y <= OG_HEIGHT + margin;
}

function ringToPath(ring) {
  let d = '';
  for (let i = 0; i < ring.length; i += 1) {
    const { x, y } = project(ring[i][1], ring[i][0]);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

export function geojsonToPath(geojson) {
  let d = '';
  for (const feature of geojson?.features || []) {
    for (const ring of geometryRings(feature.geometry)) {
      d += ringToPath(ring);
    }
  }
  return d;
}

export function plottableNodes(snapshot) {
  const nodes = [];
  for (const node of snapshot?.nodes || []) {
    const lat = node?.location?.lat;
    const lon = node?.location?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const { x, y } = project(lat, lon);
    if (!inFrame(x, y, 8)) continue;
    nodes.push({ x, y, color: KIND_COLORS[node.kind] || FALLBACK_COLOR });
  }
  return nodes;
}

function nodeDots(nodes) {
  let halos = '';
  let cores = '';
  for (const { x, y, color } of nodes) {
    const cx = x.toFixed(1);
    const cy = y.toFixed(1);
    halos += `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${color}" opacity="0.22"/>`;
    cores += `<circle cx="${cx}" cy="${cy}" r="4.4" fill="${color}" opacity="0.95"/>`;
  }
  return `<g>${halos}</g><g>${cores}</g>`;
}

// Rat logomark path from the site navbar, viewBox 243 243 282 282.
const LOGO_PATH = 'M327.97,501.16C314.61,508.03 301.57,514.72 288.56,521.48C283.91,523.91 279.2,524.61 275.05,520.98C271.05,517.49 271.26,512.87 272.63,508.05C275.23,498.93 277.46,489.7 280.08,480.58C281.03,477.27 280.4,475.51 277.14,473.92C255.84,463.53 245.61,446.29 245.66,422.66C245.75,381.16 245.55,339.66 245.75,298.16C245.86,275.62 256.63,259.57 276.93,249.98C283.68,246.79 291.07,246.01 298.4,246C355.74,245.88 413.07,245.83 470.4,245.95C495.22,246.01 516.64,265.69 519.52,290.03C520.6,299.2 520.12,308.32 520.21,317.46C520.37,333.46 520.29,349.46 520.2,365.46C520.17,371.38 518.89,372.03 513.77,369.13C498.9,360.71 498.91,360.71 498.9,343.65C498.88,328.81 498.92,313.98 498.81,299.15C498.66,279.74 486.18,267.28 466.77,267.26C410.94,267.23 355.11,267.23 299.27,267.32C279.54,267.35 267.32,279.36 267.23,299.05C267.05,340.71 267.04,382.38 267.09,424.04C267.11,441.62 277.67,453.85 295.43,456.58C310.83,458.95 307.84,458.98 304.51,471.32C303.3,475.82 302.05,480.31 300.83,484.81C300.35,486.56 299.66,488.32 300.92,490.33C304.48,490.2 307.24,487.87 310.31,486.46C314.99,484.3 319.61,481.95 324.04,479.31C328.78,476.49 333.17,476.59 338.23,478.73C355.38,485.99 373.44,488.84 391.95,487.72C430.98,485.37 461.99,468.13 484.6,436.22C489.79,428.9 493.71,420.74 496.43,412.08C497.17,409.7 496.94,408 494.74,406.52C489.6,403.07 487.33,398.05 487.7,391.96C487.91,388.37 486.58,386.13 483.49,384.24C461.58,370.79 438.6,360.13 412.77,356.87C403.65,355.71 394.49,355.67 385.35,356.73C376.09,357.8 372.64,358.02 369.74,347.74C368.12,341.98 365.71,336.47 362.24,331.47C356.28,322.9 346.68,319.02 337.45,321.63C328.92,324.05 321.83,333.47 321.32,343.14C320.63,356 327.03,371.92 346.66,374.88C350.07,375.39 352.59,376.98 353.16,380.74C353.7,384.21 352.02,386.53 349.33,388.25C347.4,389.48 345.13,389.39 343,389.01C325.7,385.88 313.84,376.01 308.73,359.24C303.68,342.67 306.62,327.49 319.94,315.42C336.41,300.5 361.24,303.86 373.4,322.51C376.14,326.7 378.7,331.06 380.19,335.83C381.41,339.73 383.56,341.03 387.54,340.77C406.5,339.53 425.15,341.26 443.29,347.18C469.21,355.64 492.63,368.82 514.47,384.97C521.5,390.18 521.02,397.62 519.75,405.01C515.1,432.25 501.28,454.4 481.02,472.62C460.48,491.09 436.54,502.92 409.2,507.52C385.77,511.46 362.77,509.7 340.18,502.3C336.39,501.06 332.58,498.31 327.97,501.16zM414.19,335.38C405.75,335.93 397.65,334.86 389.54,335.84C387,336.15 385.78,334.06 384.8,332.07C380.73,323.83 376.21,315.95 368.77,310.17C366.48,308.38 367.23,307 369.43,305.62C379.53,299.3 389.62,299.22 399.19,306.49C408.52,313.58 414.08,323.09 414.19,335.38zM417.09,390.21C410.66,388.78 407.34,384.6 408.1,379.44C408.81,374.6 413.31,370.91 418.31,371.05C423.12,371.19 426.94,375.02 427.27,380C427.63,385.61 424.18,389.22 417.09,390.21zM430.83,418.71C429.47,419.23 428.59,420.25 427.03,419.59C426.81,417.6 428.52,416.83 429.77,416.07C441.62,408.88 453.85,402.56 467.79,400.42C469.45,400.16 471.08,399.82 472.69,400.53C474.42,401.28 475.23,402.66 475.09,404.49C474.92,406.75 473.27,407.6 471.34,407.79C465.71,408.35 460.12,409.05 454.59,410.3C446.44,412.13 438.57,414.68 430.83,418.71zM448.63,432.62C455.17,424.82 461.54,417.3 470.21,412.35C473.17,410.66 477.33,407.48 479.7,412.18C482.09,416.9 476.91,417.67 473.97,418.99C464.9,423.07 457.39,429.35 449.85,435.63C448.67,436.61 447.95,438.42 445.79,438.04Z';

function caption() {
  const logoScale = 60 / 282;
  return `<g font-family="JetBrains Mono" font-size="17">` +
    `<g transform="translate(28 ${OG_HEIGHT - 88}) scale(${logoScale.toFixed(4)}) translate(-243 -243)">` +
    `<path d="${LOGO_PATH}" fill="${THEME.captionStrong}"/></g>` +
    `<text x="${OG_WIDTH - 28}" y="${OG_HEIGHT - 26}" text-anchor="end" fill="${THEME.captionStrong}">ratspeak.org</text>` +
    `</g>`;
}

export function buildMapSvg(snapshot, { land, countries } = {}) {
  const nodes = plottableNodes(snapshot);
  return `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${THEME.bg}"/>` +
    (land ? `<path d="${geojsonToPath(land)}" fill="${THEME.land}" stroke="${THEME.coast}" stroke-width="0.7" fill-rule="evenodd"/>` : '') +
    (countries ? `<path d="${geojsonToPath(countries)}" fill="none" stroke="${THEME.border}" stroke-width="0.6"/>` : '') +
    nodeDots(nodes) +
    caption() +
    `</svg>`;
}

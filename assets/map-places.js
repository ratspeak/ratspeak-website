const COUNTRY_LABELS = new Map([
  ['United States of America', 'United States']
]);

export function buildCountryIndex(geojson) {
  return (geojson?.features || [])
    .map(countryFromFeature)
    .filter(Boolean);
}

export function locationLabelForNode(node, countryIndex = []) {
  const explicit = explicitLocation(node?.location);
  if (explicit.city && explicit.country) return `${explicit.city}, ${explicit.country}`;
  if (explicit.country) return explicit.country;

  const location = locationForCoordinates(
    Number(node?.location?.lat),
    Number(node?.location?.lon),
    countryIndex
  );
  if (explicit.city && location?.country) return `${explicit.city}, ${location.country}`;
  if (explicit.city) return explicit.city;
  return locationLabel(location);
}

export function locationForCoordinates(lat, lon, countryIndex = []) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const country = countryForCoordinates(countryIndex, lat, lon);
  return country ? { country } : null;
}

export function countryForCoordinates(countryIndex, lat, lon) {
  if (!Array.isArray(countryIndex) || !Number.isFinite(lat) || !Number.isFinite(lon)) return '';

  for (const country of countryIndex) {
    for (const polygon of country.polygons) {
      if (!bboxContains(polygon.bbox, lat, lon)) continue;
      if (pointInPolygon(lon, lat, polygon.rings)) return country.name;
    }
  }
  return '';
}

function countryFromFeature(feature) {
  const properties = feature?.properties || {};
  const name = countryLabel(
    stringValue(properties.NAME_EN) ||
    stringValue(properties.ADMIN) ||
    stringValue(properties.NAME_LONG) ||
    stringValue(properties.NAME)
  );
  if (!name) return null;

  const polygons = geometryPolygons(feature.geometry);
  return polygons.length ? { name, polygons } : null;
}

function geometryPolygons(geometry) {
  const groups = geometry?.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  return groups
    .filter((rings) => Array.isArray(rings) && rings.length)
    .map((rings) => ({ rings, bbox: bboxForRing(rings[0]) }));
}

function explicitLocation(location) {
  const city = stringValue(location?.city) ||
    stringValue(location?.locality) ||
    stringValue(location?.place);
  const country = countryLabel(
    stringValue(location?.country) ||
    stringValue(location?.countryName) ||
    stringValue(location?.admin0)
  );

  return { city, country };
}

function locationLabel(location) {
  if (!location) return '';
  if (location.city && location.country) return `${location.city}, ${location.country}`;
  return location.country || '';
}

function countryLabel(value) {
  return COUNTRY_LABELS.get(value) || value;
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

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export const DEFAULT_MAX_PLACE_DISTANCE_KM = 300;

const EARTH_RADIUS_KM = 6371.0088;
const COUNTRY_LABELS = new Map([
  ['United States of America', 'United States']
]);

export function buildPlaceIndex(geojson) {
  return (geojson?.features || [])
    .map(placeFromFeature)
    .filter(Boolean);
}

export function buildCountryIndex(geojson) {
  return (geojson?.features || [])
    .map(countryFromFeature)
    .filter(Boolean);
}

export function locationLabelForNode(node, placeIndex = [], countryIndex = []) {
  const explicit = explicitLocation(node?.location);
  if (explicit.city && explicit.country) return `${explicit.city}, ${explicit.country}`;

  const location = locationForCoordinates(
    Number(node?.location?.lat),
    Number(node?.location?.lon),
    placeIndex,
    countryIndex
  );
  const city = explicit.city || location?.city || '';
  const country = explicit.country || location?.country || '';
  if (city && country) return `${city}, ${country}`;
  return city || country;
}

export function locationForCoordinates(lat, lon, placeIndex = [], countryIndex = []) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const place = nearestPlaceForCoordinates(placeIndex, lat, lon);
  if (place) {
    return {
      city: place.city,
      country: place.country,
      distanceKm: place.distanceKm
    };
  }

  const country = countryForCoordinates(countryIndex, lat, lon);
  return country ? { country } : null;
}

export function nearestPlaceForCoordinates(
  placeIndex,
  lat,
  lon,
  maxDistanceKm = DEFAULT_MAX_PLACE_DISTANCE_KM
) {
  if (!Array.isArray(placeIndex) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let nearest = null;
  for (const place of placeIndex) {
    const distanceKm = distanceBetweenKm(lat, lon, place.lat, place.lon);
    if (distanceKm > maxDistanceKm) continue;
    if (
      !nearest ||
      distanceKm < nearest.distanceKm - 1 ||
      (Math.abs(distanceKm - nearest.distanceKm) <= 1 && place.population > nearest.population)
    ) {
      nearest = { ...place, distanceKm };
    }
  }

  return nearest;
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

function placeFromFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const properties = feature.properties || {};
  const city = stringValue(properties.nameascii) || stringValue(properties.name);
  const country = countryLabel(stringValue(properties.adm0name) || stringValue(properties.sov0name));
  if (!city || !country) return null;

  return {
    city,
    country,
    lat,
    lon,
    population: integerValue(properties.pop_max) || integerValue(properties.pop_min) || 0
  };
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

function countryLabel(value) {
  return COUNTRY_LABELS.get(value) || value;
}

function distanceBetweenKm(latA, lonA, latB, lonB) {
  const phiA = toRadians(latA);
  const phiB = toRadians(latB);
  const deltaPhi = toRadians(latB - latA);
  const deltaLambda = toRadians(lonB - lonA);
  const sinPhi = Math.sin(deltaPhi / 2);
  const sinLambda = Math.sin(deltaLambda / 2);
  const haversine = (sinPhi * sinPhi) +
    (Math.cos(phiA) * Math.cos(phiB) * sinLambda * sinLambda);
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
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

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function integerValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

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

export function locationLabelForNode(node, placeIndex = []) {
  const explicit = explicitLocationLabel(node?.location);
  if (explicit) return explicit;

  const place = nearestPlaceForCoordinates(
    placeIndex,
    Number(node?.location?.lat),
    Number(node?.location?.lon)
  );
  return place ? placeLabel(place) : '';
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

function explicitLocationLabel(location) {
  const city = stringValue(location?.city) ||
    stringValue(location?.locality) ||
    stringValue(location?.place);
  const country = countryLabel(
    stringValue(location?.country) ||
    stringValue(location?.countryName) ||
    stringValue(location?.admin0)
  );

  if (city && country) return `${city}, ${country}`;
  return '';
}

function placeLabel(place) {
  return `${place.city}, ${place.country}`;
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

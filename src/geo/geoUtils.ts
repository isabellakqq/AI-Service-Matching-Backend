/**
 * MODULE 5 — Geo Matching Engine
 *
 * Provides geographic utilities for distance-based filtering and scoring.
 * Uses Haversine formula for accurate great-circle distance.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the great-circle distance between two points on Earth.
 * Uses the Haversine formula.
 * @returns distance in kilometres
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Normalise a distance to a 0–1 score.
 * Closer = higher score.
 * Score = 1.0  when distance = 0 km
 * Score = 0.0  when distance >= maxRadius km
 */
export function distanceScore(distanceKm: number, maxRadiusKm: number = 30): number {
  if (distanceKm <= 0) return 1.0;
  if (distanceKm >= maxRadiusKm) return 0.0;
  return 1.0 - distanceKm / maxRadiusKm;
}

/**
 * Check whether a point falls within a given radius of a centre point.
 */
export function isWithinRadius(
  centre: GeoPoint,
  point: GeoPoint,
  radiusKm: number
): boolean {
  return calculateDistance(centre.lat, centre.lng, point.lat, point.lng) <= radiusKm;
}

// ── City → approximate lat/lng lookup ──────────────────────────────────────
// (Simple in-memory lookup for common cities — extend or replace with geocoding API)

const CITY_COORDS: Record<string, GeoPoint> = {
  'san francisco':  { lat: 37.7749, lng: -122.4194 },
  'palo alto':      { lat: 37.4419, lng: -122.1430 },
  'oakland':        { lat: 37.8044, lng: -122.2712 },
  'san jose':       { lat: 37.3382, lng: -121.8863 },
  'berkeley':       { lat: 37.8716, lng: -122.2727 },
  'los angeles':    { lat: 34.0522, lng: -118.2437 },
  'new york':       { lat: 40.7128, lng: -74.0060 },
  'seattle':        { lat: 47.6062, lng: -122.3321 },
  'austin':         { lat: 30.2672, lng: -97.7431 },
  'chicago':        { lat: 41.8781, lng: -87.6298 },
};

/**
 * Resolve a city name to approximate coordinates.
 * Returns null if not found.
 */
export function cityToCoords(cityName: string): GeoPoint | null {
  const key = cityName.toLowerCase().trim();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (key.includes(name) || name.includes(key)) {
      return coords;
    }
  }
  return null;
}

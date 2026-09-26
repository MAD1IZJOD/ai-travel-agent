const EARTH_RADIUS_KM = 6_371;

export interface Point {
  lat: number;
  lng: number;
}

/** Great-circle distance in km. */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export type Point = { name: string; lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function routeLength(route: Point[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distanceKm(route[i - 1], route[i]);
  return total;
}

/**
 * Orders stops to keep total travel short: nearest-neighbour from the start,
 * then 2-opt to remove crossings. Exact enough for under ~10 stops.
 */
export function orderRoute(points: Point[], startName?: string): { route: Point[]; totalKm: number; legsKm: number[] } {
  if (points.length <= 2) {
    return { route: points, totalKm: routeLength(points), legsKm: legs(points) };
  }

  const remaining = [...points];
  const startIndex = Math.max(0, startName ? remaining.findIndex((p) => p.name === startName) : 0);
  const route = remaining.splice(startIndex, 1);
  while (remaining.length) {
    const last = route[route.length - 1];
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distanceKm(last, remaining[i]) < distanceKm(last, remaining[best])) best = i;
    }
    route.push(remaining.splice(best, 1)[0]);
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (routeLength(candidate) + 1e-6 < routeLength(route)) {
          route.splice(0, route.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return { route, totalKm: Math.round(routeLength(route)), legsKm: legs(route) };
}

function legs(route: Point[]): number[] {
  return route.slice(1).map((p, i) => Math.round(distanceKm(route[i], p)));
}

/**
 * The small amount of geography this API does.
 *
 * Shops are the only thing with a position - listings borrow their seller's -
 * so everything here works on a plain latitude/longitude pair.
 */

/** A position on the map. */
export interface Point {
  latitude: number;
  longitude: number;
}

/**
 * A shop's coordinates as numbers, or null when it has none.
 *
 * `numeric` columns come back from pg as strings, so this is not just a cast:
 * without it, distance maths silently produces NaN.
 */
export function coordinates(seller: {
  latitude?: number | null;
  longitude?: number | null;
}): Point | null {
  const latitude = Number(seller.latitude);
  const longitude = Number(seller.longitude);

  if (
    seller.latitude == null ||
    seller.longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

/**
 * Great-circle distance in kilometres.
 *
 * The same haversine SellersService.findNearby computes in SQL, so a shop's
 * distance reads the same whichever endpoint returned it.
 */
export function distanceKm(from: Point, to: Point): number {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Kilometres, to one decimal place - the precision a person reads. */
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

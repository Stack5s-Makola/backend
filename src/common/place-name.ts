/**
 * Turning a shop's coordinates into somewhere a person recognises.
 *
 * Nothing on a screen wants `5.575, -0.2`. Every response that used to carry
 * a coordinate pair now carries the place name instead, resolved through
 * Mapbox from those same coordinates.
 *
 * Rows geocoded at sign-up already have a stored `locationName` and cost
 * nothing. Older rows are resolved on first read and the name is written
 * back, so a row is looked up once rather than on every request.
 *
 * Works on shops (`sellers`) and on buyers' accounts (`users`) alike - both
 * carry latitude, longitude and locationName.
 */

import { Logger } from '@nestjs/common';
import { coordinates } from './geo';
import type { MapService } from '../map/map.service';

const logger = new Logger('PlaceName');

/**
 * Anything that sits somewhere - a shop or a buyer's account.
 *
 * Only the parts this needs, so a partial select still fits.
 */
export interface Located {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
}

/**
 * The narrow slice of a repository this needs, rather than Repository<T>.
 *
 * Structural, so the `sellers` and `users` repositories both satisfy it
 * without this file having to know about either entity.
 */
interface CachesNames {
  update(ids: string[], fields: { locationName: string }): Promise<unknown>;
}

/**
 * One pair of coordinates as a place name, or null.
 *
 * Never throws. The name is for display, so Mapbox being down must not fail
 * the request that wanted it.
 */
export async function placeName(
  map: MapService,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    return await map.reverseGeocode(latitude, longitude);
  } catch (error) {
    logger.error(
      `Could not resolve ${latitude},${longitude} to a place name: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return null;
  }
}

/**
 * A place name for each of these rows, keyed by id.
 *
 * Every row gets an entry, so a caller reads `names.get(row.id) ?? null`. A
 * row with no coordinates and no stored name is null - there is nothing to
 * resolve, and the screen shows no place rather than a wrong one.
 *
 * Rows in the same spot share one lookup, so a page of twenty listings from
 * three shops costs three Mapbox calls, not twenty.
 */
export async function placeNames(
  map: MapService,
  repository: CachesNames,
  shops: Located[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();

  // Shops needing a lookup, grouped by where they are.
  const byPoint = new Map<string, { at: string; ids: string[] }>();

  for (const shop of shops) {
    if (names.has(shop.id)) {
      continue;
    }

    if (shop.locationName) {
      names.set(shop.id, shop.locationName);
      continue;
    }

    names.set(shop.id, null);

    const at = coordinates(shop);

    if (!at) {
      continue;
    }

    const key = `${at.latitude},${at.longitude}`;
    const group = byPoint.get(key);

    if (group) {
      group.ids.push(shop.id);
    } else {
      byPoint.set(key, { at: key, ids: [shop.id] });
    }
  }

  await Promise.all(
    [...byPoint.values()].map(async ({ at, ids }) => {
      const [latitude, longitude] = at.split(',').map(Number);
      const name = await placeName(map, latitude, longitude);

      if (!name) {
        return;
      }

      for (const id of ids) {
        names.set(id, name);
      }

      await remember(repository, ids, name);
    }),
  );

  return names;
}

/**
 * Stores a resolved name against the rows, so the next read is free.
 *
 * A failed write is logged and swallowed: the caller already has the name it
 * needs, and a read endpoint must not 500 because a cache write did not land.
 */
async function remember(
  repository: CachesNames,
  ids: string[],
  locationName: string,
): Promise<void> {
  try {
    await repository.update(ids, { locationName });
  } catch (error) {
    logger.warn(
      `Could not store the place name for ${ids.join(', ')}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

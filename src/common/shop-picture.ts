/**
 * Which picture stands for a shop.
 *
 * A shop's picture is its owner's profile picture. There is one person behind
 * each shop on Makola, they upload one photo at sign-up, and it should be the
 * face of the shop everywhere the app draws one - the home page, the product
 * page, saved shops, the nearby map, the seller's own profile, the admin
 * tables.
 *
 * `sellers.logoUrl` stays as a fallback, for shops that set a logo before
 * accounts had avatars. Nothing writes a logo without also writing the
 * avatar any more, so for new shops the fallback never fires.
 */

import { Repository } from 'typeorm';
import { shopOwners } from './shop-owner';
import type { ShopRef } from './shop-owner';
import type { User } from '../users/entities/user.entity';

/**
 * One shop's picture, when the owner has already been loaded.
 *
 * Pass the owner's avatar and this does no query - the caller that already
 * fetched the user for its name and email should use this rather than paying
 * for a second round trip.
 */
export function shopPicture(
  shop?: { logoUrl?: string | null } | null,
  ownerAvatar?: string | null,
): string | null {
  return ownerAvatar ?? shop?.logoUrl ?? null;
}

/**
 * The picture for each of these shops, keyed by shop id.
 *
 * Every shop gets an entry, already resolved through the fallback, so a
 * caller reads `pictures.get(shop.id) ?? null` and never repeats the rule.
 */
export async function shopPictures(
  users: Repository<User>,
  shops: ShopRef[],
): Promise<Map<string, string | null>> {
  const owners = await shopOwners(users, shops);

  return new Map(
    shops.map((shop) => [
      shop.id,
      shopPicture(shop, owners.get(shop.id)?.avatarUrl),
    ]),
  );
}

/**
 * The person behind a shop.
 *
 * `sellers.userId` is a `character varying` while `users.id` is a `uuid`, so
 * a SQL join needs a cast and one malformed row fails the whole query. Every
 * lookup here matches in memory instead, and skips anything that is not a
 * uuid - one bad row must never empty a whole result set.
 */

import { In, Repository } from 'typeorm';
import type { Seller } from '../sellers/entities/seller.entity';
import type { User } from '../users/entities/user.entity';

/** A uuid, for telling a real user reference from junk in a varchar column. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The parts of a shop this needs - so a partial select still type-checks. */
export type ShopRef = Pick<Seller, 'id' | 'userId'> & {
  logoUrl?: string | null;
};

/**
 * The account behind each of these shops, keyed by **shop** id.
 *
 * Keyed by shop rather than by user so a caller reads `owners.get(shop.id)`
 * without caring that the two ids differ. A shop whose owner is missing or
 * whose userId is junk simply has no entry.
 */
export async function shopOwners(
  users: Repository<User>,
  shops: ShopRef[],
): Promise<Map<string, User>> {
  const byUser = new Map<string, string[]>();

  for (const shop of shops) {
    if (shop.userId && UUID_PATTERN.test(shop.userId)) {
      byUser.set(shop.userId, [...(byUser.get(shop.userId) ?? []), shop.id]);
    }
  }

  const owners = new Map<string, User>();

  if (!byUser.size) {
    return owners;
  }

  const accounts = await users.find({ where: { id: In([...byUser.keys()]) } });

  for (const account of accounts) {
    for (const shopId of byUser.get(account.id) ?? []) {
      owners.set(shopId, account);
    }
  }

  return owners;
}

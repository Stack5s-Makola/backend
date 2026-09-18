/**
 * The platform's shared vocabulary, per the architecture document.
 *
 * Roles are uppercase (BUYER / SELLER / ADMIN), matching the JWT `role` claim
 * and `@Roles('ADMIN')`. Rows written before that was settled may hold
 * lowercase roles, so anything that filters by role should go through
 * `roleVariants()` rather than comparing against a single spelling.
 */
export type UserRole = 'BUYER' | 'SELLER' | 'ADMIN';
export const USER_ROLES: UserRole[] = ['BUYER', 'SELLER', 'ADMIN'];

/** Both spellings of a role that may exist in the database. */
export function roleVariants(role: UserRole): string[] {
  return [role, role.toLowerCase()];
}

/** Normalises a stored or claimed role to its canonical uppercase form. */
export function normaliseRole(role: string | undefined | null) {
  return role?.toUpperCase() as UserRole | undefined;
}

export type UserStatus = 'active' | 'suspended';
export const USER_STATUSES: UserStatus[] = ['active', 'suspended'];

export type SellerVerificationStatus = 'pending' | 'approved' | 'rejected';

export type ListingApprovalStatus =
  'pending' | 'approved' | 'rejected' | 'removed';

export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

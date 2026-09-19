/**
 * Small @Transform helpers shared by the request DTOs.
 *
 * Each one normalises a value only when it is a string and otherwise hands it
 * back untouched, so a client that sends the wrong type still gets the
 * validator's message rather than a crash inside the transform.
 */

/** Trims surrounding whitespace. */
export const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Trims and lower-cases: the canonical form every email is stored in. */
export const normalisedEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Strips the spaces, dashes and brackets people type into phone fields. */
export const normalisedPhone = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : value;

/** Upper-cases, so 'seller' and 'SELLER' both satisfy @IsIn. */
export const upperCased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toUpperCase() : value;

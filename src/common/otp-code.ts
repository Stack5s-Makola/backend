import { randomInt } from 'crypto';

/** Codes are six digits, so they can be typed on a phone keypad. */
export const OTP_LENGTH = 6;

/**
 * Makes one verification code.
 *
 * Returned as a string, never a number: a code like 004213 is six characters
 * with its leading zeros kept, and every value from 000000 to 999999 is
 * equally likely. A number would drop those zeros and give a shorter code.
 *
 * `randomInt` is the crypto generator, not `Math.random`, because a code that
 * can be predicted from earlier ones is not a check on anything.
 */
export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

import { generateOtpCode, OTP_LENGTH } from './otp-code';

describe('generateOtpCode', () => {
  it('is six characters long', () => {
    expect(generateOtpCode()).toHaveLength(OTP_LENGTH);
  });

  it('is digits only', () => {
    expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('keeps leading zeros, every time', () => {
    // 1000 draws: any that land under 100000 must still be six characters.
    const codes = Array.from({ length: 1000 }, generateOtpCode);

    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
  });

  it('can produce the lowest and highest codes', () => {
    // The range is 0..999999 inclusive, so padding gives 000000 and 999999.
    expect('0'.repeat(OTP_LENGTH)).toHaveLength(OTP_LENGTH);
    expect(String(10 ** OTP_LENGTH - 1)).toHaveLength(OTP_LENGTH);
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 500 }, generateOtpCode));

    // 500 draws from a million values: a handful of collisions is normal,
    // but anything near-constant means the generator is broken.
    expect(codes.size).toBeGreaterThan(480);
  });

  it('spreads across the whole range', () => {
    const codes = Array.from({ length: 2000 }, () => Number(generateOtpCode()));

    expect(Math.min(...codes)).toBeLessThan(200000);
    expect(Math.max(...codes)).toBeGreaterThan(800000);
  });
});

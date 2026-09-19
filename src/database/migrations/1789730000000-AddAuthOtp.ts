import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the mobile app's sign-up flow needs.
 *
 * `otps` holds the one-time codes (hashed, never the code itself), and
 * `users.emailVerified` records whether an address has been confirmed.
 *
 * Additive: the new column defaults to false, so existing accounts would be
 * locked out of login. The backfill below marks every account that already
 * existed as verified, since they predate the check.
 */
export class AddAuthOtp1789730000000 implements MigrationInterface {
  name = 'AddAuthOtp1789730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false`,
    );

    // Accounts created before verification existed keep their access
    await queryRunner.query(
      `UPDATE "users" SET "emailVerified" = true WHERE "createdAt" < now()`,
    );

    await queryRunner.query(
      `CREATE TABLE "otps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "codeHash" character varying NOT NULL, "purpose" character varying NOT NULL DEFAULT 'email_verification', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "consumedAt" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT 0, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_otps" PRIMARY KEY ("id"))`,
    );

    // verify() and the resend throttle both look a code up this way
    await queryRunner.query(
      `CREATE INDEX "IDX_otps_email" ON "otps" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_otps_email_purpose_created" ON "otps" ("email", "purpose", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_otps_email_purpose_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_otps_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otps"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerified"`,
    );
  }
}

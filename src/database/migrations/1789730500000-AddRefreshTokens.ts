import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Long-lived refresh tokens, so a 15 minute access token does not mean the
 * mobile app signs the user out every 15 minutes.
 *
 * Only the SHA-256 digest of a token is stored, and the unique index on it is
 * what the refresh lookup goes through.
 */
export class AddRefreshTokens1789730500000 implements MigrationInterface {
  name = 'AddRefreshTokens1789730500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "replacedBy" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`,
    );
    // Revoking every session an account holds walks this one
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_refresh_tokens_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_refresh_tokens_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_refresh_tokens_tokenHash"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}

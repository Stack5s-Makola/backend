import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records who last moderated a listing, when, and why.
 *
 * Three nullable columns on `product`; existing rows are unaffected.
 */
export class AddListingModeration1789727292685 implements MigrationInterface {
  name = 'AddListingModeration1789727292685';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" ADD "moderationNote" text`);
    await queryRunner.query(`ALTER TABLE "product" ADD "moderatedBy" uuid`);
    await queryRunner.query(
      `ALTER TABLE "product" ADD "moderatedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "moderatedAt"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "moderatedBy"`);
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "moderationNote"`,
    );
  }
}

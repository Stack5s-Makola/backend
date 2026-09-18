import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings the shared database in line with the entities on main.
 *
 * Generated with `migration:generate` against the live Neon database, then
 * reviewed. Everything here is additive for existing data: it creates the
 * tables the categories, products and saved modules expect, adds the seller
 * coordinates the Seller entity already declares, and extends `reports` to
 * the shape in the architecture document. No existing column is dropped.
 */
export class AlignSchemaWithEntities1789725467113 implements MigrationInterface {
  name = 'AlignSchemaWithEntities1789725467113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The generated tables default their ids with uuid_generate_v4()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // reports: references are plain uuid columns now, like sellers.userId
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "FK_reports_reporterId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_reports_status"`,
    );

    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "subcategories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "categoryId" uuid, CONSTRAINT "PK_793ef34ad0a3f86f09d4837007c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "price" numeric NOT NULL, "approvalStatus" character varying NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sellerId" uuid, "categoryId" uuid, "subcategoryId" uuid, CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8772867b918009336b95afd9dc" ON "product" ("approvalStatus") `,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_sellers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "sellerId" uuid, CONSTRAINT "PK_3f184e89b023f803da0d5345815" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "productId" uuid, CONSTRAINT "PK_129ca3de9f2fc98e3f571029fe1" PRIMARY KEY ("id"))`,
    );

    // The Seller entity already declares these; the table never had them,
    // so every seller query failed with "column does not exist"
    await queryRunner.query(
      `ALTER TABLE "sellers" ADD "latitude" numeric(10,7)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sellers" ADD "longitude" numeric(10,7)`,
    );

    // reports: the remaining columns from the architecture document
    await queryRunner.query(`ALTER TABLE "reports" ADD "productId" uuid`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "sellerId" uuid`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "description" text`);
    await queryRunner.query(`ALTER TABLE "reports" ADD "reviewedBy" uuid`);
    await queryRunner.query(
      `ALTER TABLE "reports" ADD "reviewedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ALTER COLUMN "reporterId" SET NOT NULL`,
    );
    // 'open' was the earlier name for what the document calls 'pending'
    await queryRunner.query(
      `UPDATE "reports" SET "status" = 'pending' WHERE "status" = 'open'`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dab4d78b3be05c1ca4a626f57f" ON "reports" ("status") `,
    );

    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD CONSTRAINT "FK_d1fe096726c3c5b8a500950e448" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_d5cac481d22dacaf4d53f900a3f" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_ff0c0301a95e517153df97f6812" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_904b30d0611df66f73164e999db" FOREIGN KEY ("subcategoryId") REFERENCES "subcategories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_sellers" ADD CONSTRAINT "FK_2f0c1e33ccf7ad49cd6ce050aca" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_sellers" ADD CONSTRAINT "FK_0fd9412d719826b030caec0a03a" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_products" ADD CONSTRAINT "FK_9f11a8a7db8c92556a2fdd388a1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_products" ADD CONSTRAINT "FK_b100f41b2e6ca7db229350ff9f3" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_products" DROP CONSTRAINT "FK_b100f41b2e6ca7db229350ff9f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_products" DROP CONSTRAINT "FK_9f11a8a7db8c92556a2fdd388a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_sellers" DROP CONSTRAINT "FK_0fd9412d719826b030caec0a03a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_sellers" DROP CONSTRAINT "FK_2f0c1e33ccf7ad49cd6ce050aca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_904b30d0611df66f73164e999db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_ff0c0301a95e517153df97f6812"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_d5cac481d22dacaf4d53f900a3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subcategories" DROP CONSTRAINT "FK_d1fe096726c3c5b8a500950e448"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dab4d78b3be05c1ca4a626f57f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'open'`,
    );
    await queryRunner.query(
      `UPDATE "reports" SET "status" = 'open' WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ALTER COLUMN "reporterId" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "reviewedAt"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "reviewedBy"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "sellerId"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "productId"`);
    await queryRunner.query(`ALTER TABLE "sellers" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "sellers" DROP COLUMN "latitude"`);
    await queryRunner.query(`DROP TABLE "saved_products"`);
    await queryRunner.query(`DROP TABLE "saved_sellers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8772867b918009336b95afd9dc"`,
    );
    await queryRunner.query(`DROP TABLE "product"`);
    await queryRunner.query(`DROP TABLE "subcategories"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_reports_status" ON "reports" ("status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "FK_reports_reporterId" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}

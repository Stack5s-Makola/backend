# Pending: the auth schema

The mobile sign-up flow (register / verify-otp / login / refresh / logout) is
written and unit tested, but it is **switched off** because it needs schema
this database does not have yet.

Nothing here has been applied. The migrations that carried it were removed on
request; this file keeps the SQL so it does not have to be written twice.

## What is switched off

- `AuthModule` and `OtpModule` are commented out of `src/app.module.ts`, so
  `/api/auth/*` and `/api/otp` return 404.
- `User.emailVerified` in `src/users/entities/user.entity.ts` is a plain class
  property with no `@Column`, so TypeORM never puts it in a query. This is what
  keeps `POST /api/users` and the admin user endpoints working.

## The SQL

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verification state. The backfill matters: without it every account that
-- already exists is treated as unverified and cannot sign in.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false;
UPDATE "users" SET "emailVerified" = true WHERE "createdAt" < now();

-- One-time codes. Only a bcrypt hash of the code is stored.
CREATE TABLE "otps" (
  "id"         uuid NOT NULL DEFAULT uuid_generate_v4(),
  "email"      character varying NOT NULL,
  "codeHash"   character varying NOT NULL,
  "purpose"    character varying NOT NULL DEFAULT 'email_verification',
  "expiresAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
  "consumedAt" TIMESTAMP WITH TIME ZONE,
  "attempts"   integer NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_otps" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_otps_email" ON "otps" ("email");
CREATE INDEX "IDX_otps_email_purpose_created" ON "otps" ("email", "purpose", "createdAt");

-- Refresh tokens. Only the SHA-256 digest is stored; the unique index on it
-- is what the refresh lookup goes through.
CREATE TABLE "refresh_tokens" (
  "id"         uuid NOT NULL DEFAULT uuid_generate_v4(),
  "userId"     uuid NOT NULL,
  "tokenHash"  character varying NOT NULL,
  "expiresAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
  "revokedAt"  TIMESTAMP WITH TIME ZONE,
  "replacedBy" uuid,
  "createdAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash");
CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId");
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "FK_refresh_tokens_userId"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
```

## Turning it back on

1. Put the SQL above into a migration under `src/database/migrations/` and run
   `npm run migration:run`.
2. Restore the `@Column({ default: false })` decorator on `User.emailVerified`.
3. Uncomment `AuthModule` and `OtpModule` in `src/app.module.ts`.
4. Set a verified Brevo sender in `MAIL_FROM`, or the codes will not arrive.

Until step 2 is done the auth service still compiles and its tests still pass,
but `emailVerified` is never persisted — so login would refuse every account.
Steps 1 to 3 go together.

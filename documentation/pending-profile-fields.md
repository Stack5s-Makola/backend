# Pending: name and profile picture

The admin sellers table asks for a name and a profile picture per seller. The
database has neither, so both come back `null` from `GET /api/admin/sellers`.

Nothing here has been applied. **No migration has been written or run** - this
file records what the columns need to be when that happens.

## What exists today

```
users:   id, email, passwordHash, role, createdAt, updatedAt, status, phone
sellers: id, shopName, description, createdAt, updatedAt, verificationStatus,
         userId, latitude, longitude
```

No column on either table holds a person's name or an image.

## What is declared but not persisted

Following the same pattern as `User.emailVerified`, these are plain class
properties with **no `@Column`**, so TypeORM never puts them in a query:

- `User.fullName` and `User.avatarUrl` in `src/users/entities/user.entity.ts`
- `Seller.logoUrl` in `src/sellers/entities/seller.entity.ts`

`src/admin/sellers.service.ts` already reads all three, so the values appear in
the API the moment the columns are real. Until then they are `undefined`, and
the service maps that to `null`.

Note `SellersService.ownersFor` loads the whole user row rather than using
`select`. Naming `fullName` or `avatarUrl` in a `select` would put them in the
SQL and fail the query, exactly as adding the decorator would.

## The SQL

```sql
-- The person's display name and avatar. Nullable: every existing row has
-- neither, and there is nothing to backfill them from.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fullName" character varying;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" character varying;

-- The shop's own logo, preferred over the owner's avatar in the admin table.
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "logoUrl" character varying;
```

## Turning it on

1. Put the SQL above into a migration under `src/database/migrations/` and run
   `npm run migration:run`.
2. Add `@Column({ nullable: true })` to the three properties listed above.
3. Nothing else changes: the admin sellers endpoint and its tests already
   handle both the present and the absent case.

Steps 1 and 2 go together. Step 2 without step 1 breaks every query against
`users` and `sellers`, which is the failure documented in
`documentation/pending-auth-schema.md`.

## Related

Seller identity is awkward for a second reason: `sellers.userId` is a
`character varying` while `users.id` is a `uuid`. `SellersService` matches them
in memory rather than joining, so one malformed value cannot empty the table.
Worth a migration of its own if the tables are ever joined in SQL.

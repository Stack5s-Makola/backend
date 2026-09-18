# Makola — Backend API

NestJS REST API for the Makola marketplace. PostgreSQL (Neon) is the source of
truth; the mobile app keeps a local SQLite cache, and the Admin Web app manages
the platform through the Admin API documented below.

## Stack

| Concern  | Choice                      |
| -------- | --------------------------- |
| Runtime  | NestJS 11 (Node 20+)        |
| Database | PostgreSQL on Neon (TypeORM)|
| Images   | Cloudinary                  |
| Email    | Brevo                       |
| Hosting  | Docker → Render             |

## Setup

```bash
npm install
cp .env.example .env    # then fill in the values
npm run migration:run   # create/patch the schema
npm run start:dev
```

The API listens on `PORT` (default 3000) and every route is under `/api`.

### Environment

| Variable                | Required | Notes                                                        |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | yes      | Neon connection string                                       |
| `JWT_SECRET`            | yes      | Shared by whatever issues tokens and the guards that verify  |
| `JWT_ACCESS_EXPIRES_IN` | no       | Defaults to `15m`                                            |
| `ALLOWED_ORIGINS`       | no       | Comma separated CORS allowlist; unset allows any origin      |
| `PORT`                  | no       | Defaults to 3000                                             |
| `CLOUDINARY_*`          | yes      | Image uploads                                                |
| `BREVO_API_KEY`         | yes      | OTP and transactional email                                  |

## Database migrations

`synchronize` is off — the schema only ever changes through a migration.

```bash
npm run migration:run       # apply pending migrations
npm run migration:show      # what is applied / pending
npm run migration:revert    # roll the last one back
npm run migration:generate  # diff entities against the database
```

## Response format

Every endpoint returns the same envelope, applied globally by
`ResponseInterceptor` and `HttpExceptionFilter`.

Success:

```json
{ "success": true, "message": "Users retrieved", "data": [] }
```

List endpoints add pagination meta:

```json
{ "success": true, "message": "Users retrieved", "data": [],
  "meta": { "total": 45, "page": 1, "limit": 20, "pages": 3 } }
```

Error:

```json
{ "success": false, "message": "User not found", "data": null }
```

Validation error:

```json
{ "success": false, "message": "Validation failed", "data": null,
  "errors": { "status": "status must be one of: active, suspended" } }
```

## Authentication for the Admin API

Every `/api/admin/*` route requires a Bearer access token whose `role` claim is
`ADMIN`:

```
Authorization: Bearer <access token>
```

The token is verified with `JWT_SECRET` and must carry at least:

```json
{ "sub": "<user uuid>", "role": "ADMIN" }
```

Responses: `401` when the token is missing, malformed or expired; `403` when it
is valid but the role is not `ADMIN`.

> The auth module issues these tokens (login/refresh). This API only verifies
> them, so the two sides only need to agree on `sub` and `role`.

## Admin API

The full Admin API reference for the Admin Web — every endpoint, its
parameters, response messages and status codes — is in
[documentation/adminAPI.md](documentation/adminAPI.md).

## Tests

```bash
npm test
npm run test:cov
```

## Known issue: Neon cold starts

Neon suspends an idle compute. The first request after a quiet spell can fail
with `ETIMEDOUT` while the database wakes, surfacing as a `500`; the retry
succeeds. `DatabaseModule` already widens the connect timeout and retries at
startup, but a pool connection acquired later cannot be retried the same way.
If this becomes disruptive for the Admin Web, the options are a keep-alive
ping or a Neon plan without suspend.

## Deployment

Docker image → Render. `DATABASE_URL`, `JWT_SECRET` and `ALLOWED_ORIGINS`
(the Admin Web origin) must be set in the Render environment, and
`npm run migration:run` applied against the deployment database.

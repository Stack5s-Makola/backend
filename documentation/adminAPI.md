# Admin API

Reference for the Admin Web frontend.

- **Base path:** `/api/admin`
- **Auth:** every route requires an ADMIN bearer token
- **All responses** use the standard envelope described below

---

## 1. Authentication

Send the access token on every request:

```
Authorization: Bearer <access token>
```

The token must be signed with the API's `JWT_SECRET` and carry a `role` claim
of `ADMIN` (`admin` in lowercase is also accepted):

```json
{ "sub": "<user uuid>", "role": "ADMIN" }
```

| Situation                                   | Status | `message`                                                |
| ------------------------------------------- | ------ | -------------------------------------------------------- |
| No `Authorization` header, or not `Bearer`  | `401`  | `Authentication token is missing`                        |
| Token malformed, tampered with, or expired  | `401`  | `Authentication token is invalid or expired`             |
| Valid token, but role is not ADMIN          | `403`  | `This action requires one of the following roles: ADMIN` |

> A `401` means "log in again". A `403` means the account is signed in but is
> not an admin, so don't retry and don't redirect to login.

---

## 2. Response envelope

Every endpoint returns the same shape, so one client-side handler covers all of them.

**Success**

```json
{ "success": true, "message": "User retrieved", "data": { } }
```

**List (adds `meta`)**

```json
{
  "success": true,
  "message": "Users retrieved",
  "data": [ ],
  "meta": { "total": 45, "page": 1, "limit": 20, "pages": 3 }
}
```

**Error**

```json
{ "success": false, "message": "User 9f3c… not found", "data": null }
```

**Validation error** adds `errors`, keyed by field name:

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": { "status": "status must be one of: active, suspended" }
}
```

`errors` is only present on validation failures. The strings are safe to show
next to the offending field.

---

## 3. Status codes

| Code  | When                                                                |
| ----- | ------------------------------------------------------------------- |
| `200` | Success, including every `PATCH`                                    |
| `400` | Validation failed, a path `:id` is not a UUID, or a rule was broken |
| `401` | Missing / invalid / expired token                                   |
| `403` | Authenticated, but not an ADMIN                                     |
| `404` | The requested record does not exist                                 |
| `500` | Unexpected server error (see "Cold starts" at the bottom)           |

There are no `201` responses. The Admin API only reads and updates.

A malformed UUID is rejected before the handler runs:

```
GET /api/admin/users/not-a-uuid   →  400
{ "success": false, "message": "Validation failed (uuid is expected)", "data": null }
```

---

## 4. Pagination

Every list endpoint accepts:

| Param   | Type | Default | Rules              |
| ------- | ---- | ------- | ------------------ |
| `page`  | int  | `1`     | `>= 1`             |
| `limit` | int  | `20`    | `>= 1`, max `100`  |

Results are always **newest first** (`createdAt` descending).
`meta.pages` is the total number of pages, so it can drive a pager directly.

| Input        | `errors` value                |
| ------------ | ----------------------------- |
| `?page=abc`  | `page must be 1 or greater`   |
| `?page=0`    | `page must be 1 or greater`   |
| `?limit=999` | `limit cannot exceed 100`     |
| `?limit=0`   | `limit must be 1 or greater`  |

---

## 5. Data shapes

These are exactly the fields returned. **Password hashes are never returned**
by any admin endpoint.

**User**

```json
{
  "id": "d153489c-2606-4d59-9245-6e38e417ede6",
  "email": "ama@example.com",
  "phone": "0240000000",
  "role": "buyer",
  "status": "active",
  "createdAt": "2026-09-11T10:35:51.219Z",
  "updatedAt": "2026-09-11T10:35:51.219Z"
}
```

`phone` may be `null`. There is no name field on users yet.

**Seller**: the owning account is attached as `user` (a User, as above, or
`null` if that account no longer exists)

```json
{
  "id": "b68d8b01-83e7-410b-a6e7-0ef7a8635010",
  "userId": "d153489c-2606-4d59-9245-6e38e417ede6",
  "shopName": "Kwame's Fabrics",
  "description": "Kente and fabrics from Bonwire",
  "verificationStatus": "pending",
  "latitude": "6.7009000",
  "longitude": "-1.4800000",
  "createdAt": "2026-09-11T15:48:02.117Z",
  "updatedAt": "2026-09-11T15:48:02.117Z",
  "user": { }
}
```

`latitude` / `longitude` come back as **strings** (Postgres decimals) and may
be `null`. Use `parseFloat` before putting them on a map.

**Listing**: `seller`, `category` and `subcategory` are included

```json
{
  "id": "07ee9c31-13ee-4994-9d99-356c72f80ca6",
  "name": "Kente Fabric",
  "price": "300",
  "approvalStatus": "pending",
  "createdAt": "2026-09-11T15:48:02.412Z",
  "updatedAt": "2026-09-11T15:48:02.412Z",
  "seller": { },
  "category": { "id": "…", "name": "Fashion & Fabrics", "description": null },
  "subcategory": { "id": "…", "name": "Kente", "description": null }
}
```

`price` is also a **string** decimal. `category` and `subcategory` may be
`null`. The embedded `seller` here does **not** carry its `user`.

**Report**: the reporting account is attached as `reporter` (a User, or `null`)

```json
{
  "id": "d5ab58c9-f951-43e0-a987-944134de089b",
  "reporterId": "d153489c-2606-4d59-9245-6e38e417ede6",
  "productId": "07ee9c31-13ee-4994-9d99-356c72f80ca6",
  "sellerId": null,
  "reason": "Counterfeit goods",
  "description": "The kente is printed, not woven.",
  "status": "pending",
  "reviewedBy": null,
  "reviewedAt": null,
  "createdAt": "2026-09-11T15:48:02.598Z",
  "reporter": { }
}
```

A report targets a listing (`productId`), a seller (`sellerId`), or both.
Once an admin acts on it, `reviewedBy` holds that admin's user id and
`reviewedAt` the time.

### Enum values

| Field                       | Values                                      |
| --------------------------- | ------------------------------------------- |
| `user.role`                 | `BUYER`, `SELLER`, `ADMIN`, see note below  |
| `user.status`               | `active`, `suspended`                       |
| `seller.verificationStatus` | `pending`, `approved`, `rejected`           |
| `listing.approvalStatus`    | `pending`, `approved`, `rejected`, `removed`|
| `report.status`             | `pending`, `reviewed`, `resolved`, `dismissed` |

> **Role casing.** The documented roles are uppercase, and that is what the
> `?role=` filter accepts. Accounts created so far store the role in
> lowercase (`"buyer"`), so a returned `role` may be either. Compare
> case-insensitively (`role.toUpperCase() === 'BUYER'`). The filters already
> match both spellings.

---

## 6. Endpoints

### 6.1 Dashboard

#### `GET /api/admin/dashboard`

Everything the dashboard landing page needs, in one call.

**200**: `"Dashboard retrieved"`

```json
{
  "success": true,
  "message": "Dashboard retrieved",
  "data": {
    "stats": {
      "users": 1200,
      "buyers": 900,
      "sellerAccounts": 300,
      "sellers": 280,
      "pendingSellers": 12,
      "listings": 865,
      "pendingListings": 25,
      "activeListings": 840,
      "reports": 4
    },
    "recent": {
      "listings": [],
      "sellers": []
    }
  }
}
```

| Stat              | Meaning                                              |
| ----------------- | ---------------------------------------------------- |
| `users`           | All user accounts                                    |
| `buyers`          | Users with the BUYER role                            |
| `sellerAccounts`  | Users with the SELLER role                           |
| `sellers`         | Seller **profiles** (a seller account may not have one yet) |
| `pendingSellers`  | Seller profiles awaiting verification                |
| `listings`        | All listings                                         |
| `pendingListings` | Listings awaiting approval                           |
| `activeListings`  | Listings with `approvalStatus: "approved"`           |
| `reports`         | **Pending** reports only                             |

`recent.listings` (Listing shape) and `recent.sellers` (Seller shape, with
`user`) each hold the 10 newest, newest first. There is no `meta` and no
time-series data on this endpoint.

---

### 6.2 Users

#### `GET /api/admin/users`

| Query   | Notes                                    |
| ------- | ---------------------------------------- |
| `page`  | see Pagination                           |
| `limit` | see Pagination                           |
| `role`  | optional: `BUYER`, `SELLER` or `ADMIN`   |

- **200**: `"Users retrieved"`, array of User, plus `meta`
- **400**: bad `page` / `limit`, or an unknown role:
  `{ "role": "role must be one of: BUYER, SELLER, ADMIN" }`

#### `GET /api/admin/users/search`

| Query   | Required | Notes                                             |
| ------- | -------- | ------------------------------------------------- |
| `q`     | **yes**  | Case-insensitive partial match on email or phone  |
| `role`  | no       | Narrows the search to one role                    |
| `page`  | no       |                                                   |
| `limit` | no       |                                                   |

- **200**: the message echoes the trimmed term: `Users matching "ama"`
- **400**: `q` missing or blank: `{ "q": "Search term \"q\" is required" }`

A search with no hits is still **200** with `data: []`, not a 404.

#### `GET /api/admin/users/:id`

- **200**: `"User retrieved"`, `data` is a User
- **400**: `:id` is not a UUID
- **404**: `"User <id> not found"`

#### `PATCH /api/admin/users/:id/status`

Suspend or reinstate any account: buyer, seller or admin. Suspending a
seller's account is how a seller is suspended.

Request:

```json
{ "status": "suspended" }
```

- **200**: `"User suspended"` / `"User active"`, `data` is the **updated** User
- **400**: missing or invalid status:
  `{ "status": "status must be one of: active, suspended" }`
- **400**: `"You cannot change your own status"`, when the id is the signed-in
  admin's own account
- **404**: `"User <id> not found"`

> The response contains the updated record, so update local state from it
> instead of refetching the list.

---

### 6.3 Buyers

The user reads, pre-filtered to the BUYER role, for the Users → Buyers page.

#### `GET /api/admin/buyers`

- **200**: `"Buyers retrieved"`, array of User, plus `meta`

Accepts `page` and `limit`. It does **not** accept `role`.

#### `GET /api/admin/buyers/:id`

- **200**: `"Buyer retrieved"`
- **400**: `:id` is not a UUID
- **404**: `"Buyer <id> not found"`. This is also returned when the id exists
  but belongs to a seller or admin.

To suspend a buyer use `PATCH /api/admin/users/:id/status`.

---

### 6.4 Sellers

#### `GET /api/admin/sellers`

- **200**: `"Sellers retrieved"`, array of Seller with `user`, plus `meta`

#### `GET /api/admin/sellers/pending`

The verification queue: sellers with `verificationStatus: "pending"`.

- **200**: `"Pending sellers retrieved"`, with `user`, plus `meta`

#### `GET /api/admin/sellers/:id`

- **200**: `"Seller retrieved"` (with `user`)
- **400** / **404**: the 404 message is `"Seller <id> not found"`

#### `PATCH /api/admin/sellers/:id/approve`

No request body.

- **200**: `"Seller approved"`, `data` is the updated Seller (with `user`)
- **404**: `"Seller <id> not found"`

#### `PATCH /api/admin/sellers/:id/reject`

No request body.

- **200**: `"Seller rejected"`, `data.verificationStatus` is `"rejected"`
- **404**: `"Seller <id> not found"`

> Approve and reject can be re-run: approving an already approved seller
> succeeds and returns the same record.

---

### 6.5 Listings

#### `GET /api/admin/listings`

- **200**: `"Listings retrieved"`, array of Listing, plus `meta`

#### `GET /api/admin/listings/pending`

The approval queue: listings with `approvalStatus: "pending"`.

- **200**: `"Pending listings retrieved"`, plus `meta`

#### `GET /api/admin/listings/:id`

- **200**: `"Listing retrieved"`
- **400** / **404**: the 404 message is `"Listing <id> not found"`

#### `PATCH /api/admin/listings/:id/approve`

No body. **200**: `"Listing approved"` · **404**: `"Listing <id> not found"`

#### `PATCH /api/admin/listings/:id/reject`

No body. **200**: `"Listing rejected"` · **404**: `"Listing <id> not found"`

#### `PATCH /api/admin/listings/:id/remove`

Takes a published listing down. No body.

**200**: `"Listing removed"` · **404**: `"Listing <id> not found"`

| Action  | Resulting `approvalStatus` | Use for                        |
| ------- | -------------------------- | ------------------------------ |
| approve | `approved`                 | Publish a pending listing      |
| reject  | `rejected`                 | Turn down a pending listing    |
| remove  | `removed`                  | Take down a published listing  |

---

### 6.6 Reports

#### `GET /api/admin/reports`

| Query    | Notes                                                        |
| -------- | ------------------------------------------------------------ |
| `status` | optional: `pending`, `reviewed`, `resolved` or `dismissed`   |
| `page`   |                                                              |
| `limit`  |                                                              |

- **200**: `"Reports retrieved"`, array of Report with `reporter`, plus `meta`
- **400**: unknown status:
  `{ "status": "status must be one of: pending, reviewed, resolved, dismissed" }`

Without `status`, every report is returned. Use `?status=pending` for the
open queue, which matches the dashboard's `reports` count.

#### `PATCH /api/admin/reports/:id/resolve`

No body. Records the acting admin in `reviewedBy` and the time in `reviewedAt`.

**200**: `"Report resolved"` · **404**: `"Report <id> not found"`

#### `PATCH /api/admin/reports/:id/dismiss`

No body. Records `reviewedBy` / `reviewedAt` the same way.

**200**: `"Report dismissed"` · **404**: `"Report <id> not found"`

---

## 7. Quick reference

| Method | Path                    | Success message              |
| ------ | ----------------------- | ---------------------------- |
| GET    | `/dashboard`            | Dashboard retrieved          |
| GET    | `/users`                | Users retrieved              |
| GET    | `/users/search`         | Users matching "…"           |
| GET    | `/users/:id`            | User retrieved               |
| PATCH  | `/users/:id/status`     | User suspended / User active |
| GET    | `/buyers`               | Buyers retrieved             |
| GET    | `/buyers/:id`           | Buyer retrieved              |
| GET    | `/sellers`              | Sellers retrieved            |
| GET    | `/sellers/pending`      | Pending sellers retrieved    |
| GET    | `/sellers/:id`          | Seller retrieved             |
| PATCH  | `/sellers/:id/approve`  | Seller approved              |
| PATCH  | `/sellers/:id/reject`   | Seller rejected              |
| GET    | `/listings`             | Listings retrieved           |
| GET    | `/listings/pending`     | Pending listings retrieved   |
| GET    | `/listings/:id`         | Listing retrieved            |
| PATCH  | `/listings/:id/approve` | Listing approved             |
| PATCH  | `/listings/:id/reject`  | Listing rejected             |
| PATCH  | `/listings/:id/remove`  | Listing removed              |
| GET    | `/reports`              | Reports retrieved            |
| PATCH  | `/reports/:id/resolve`  | Report resolved              |
| PATCH  | `/reports/:id/dismiss`  | Report dismissed             |

All paths are relative to `/api/admin`.

---

## 8. Notes for the frontend

**CORS.** The API allows the origins listed in its `ALLOWED_ORIGINS` env var.
If the browser blocks requests, the Admin Web origin needs adding there. That
is a backend config change, not a frontend one.

**Cold starts.** The database (Neon) suspends when idle, so the first request
after a quiet period can return a `500` while it wakes. A retry succeeds. Retry
once or twice on `500` for `GET`s, and show a plain error rather than crashing.

**Numbers as strings.** `price`, `latitude` and `longitude` are Postgres
decimals and arrive as strings. Parse them before doing arithmetic.

**Empty vs missing.** An empty list is `200` with `data: []`. A `404` only
ever means a specific record was not found.

**Reading errors.** `message` is safe to display. On `400`, prefer the
per-field strings in `errors` and fall back to `message`.

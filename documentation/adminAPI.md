# Admin API

Everything the four dashboard tabs need. Base path `/api/admin`.

> Replaces the earlier version of this file, which documented 25 endpoints
> from the admin module that was deleted and rebuilt. Only what is listed
> below exists.

Local: `http://localhost:3000` · Deployed: `https://makola-backend-r9wy.onrender.com`

---

## 1. Log in

```
POST /api/admin/login
Content-Type: application/json

{ "email": "superadmin@makola.com", "password": "..." }
```

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGci...",
    "expiresIn": "15m",
    "admin": { "email": "superadmin@makola.com", "role": "ADMIN" }
  }
}
```

There is **one** admin account, and its credentials live in the server's
environment. No refresh token: after 15 minutes the token is dead and the
admin logs in again.

| Situation | Status | `message` |
| --- | --- | --- |
| Correct credentials | `200` | `Login successful` |
| Email does not match | `401` | `No admin account found for that email` |
| Password does not match | `401` | `Incorrect password` |
| Email or password missing/malformed | `400` | `Validation failed` (+ `errors`) |

---

## 2. Every other request

Send the token:

```
Authorization: Bearer <accessToken>
```

| Situation | Status | `message` |
| --- | --- | --- |
| No header, or not `Bearer` | `401` | `Authentication token is missing` |
| Expired, forged or malformed | `401` | `Authentication token is invalid or expired` |
| Valid token, not an admin | `403` | `This action requires one of the following roles: ADMIN` |

`401` means log in again. `403` means signed in but not an admin - do not
retry, do not bounce to login.

---

## 3. Response envelope

Every endpoint, success or failure, returns the same three keys:

```json
{ "success": true,  "message": "...", "data": ... }
{ "success": false, "message": "...", "data": null }
```

A `400` adds a field map:

```json
{ "success": false, "message": "Validation failed", "data": null,
  "errors": { "email": "Please provide a valid email address" } }
```

So one client-side handler covers everything: check `success`, read `message`
for the toast, `data` for the payload.

---

## 4. Tab 1 - Dashboard

```
GET /api/admin/dashboard
```

```json
{
  "success": true,
  "message": "Dashboard totals retrieved",
  "data": {
    "totalUsers": 8,
    "totalSellers": 3,
    "totalBuyers": 5,
    "totalListings": 2,
    "recentActivities": [
      { "message": "buyer101@example.com joined as a buyer",
        "at": "2026-09-20T22:49:00.256Z" },
      { "message": "Test Product was listed by The Test Shop",
        "at": "2026-09-20T22:46:05.434Z" }
    ]
  }
}
```

- Counts come from user roles, so `totalBuyers + totalSellers + admins = totalUsers`.
- `totalListings` counts every listing, including pending and rejected ones.
- `recentActivities`: the 10 newest events, newest first. Render `message`
  as-is and format `at` however you like. It covers sign-ups, new shops, new
  listings and moderation decisions - **not** logins, edits or deletions,
  because nothing records those yet.

---

## 5. Tab 2 - Sellers

```
GET /api/admin/sellers
```

```json
{
  "success": true,
  "message": "Sellers retrieved",
  "data": [
    {
      "id": "d2fce83c-3688-4814-96b8-3ef3620b9c9c",
      "name": null,
      "email": "seller9@example.com",
      "profilePicture": null,
      "businessName": "The Test Shop",
      "isEmailVerified": false,
      "location": { "latitude": 5.55, "longitude": -0.2 },
      "status": "pending"
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | the seller, not the user |
| `name` | string \| null | **always null today** - see section 8 |
| `email` | string \| null | the owner's email; the only identifier available now |
| `profilePicture` | string \| null | **always null today** - see section 8 |
| `businessName` | string | the shop name |
| `location` | `{ latitude, longitude }` \| null | numbers, not strings; null when the shop has no coordinates |
| `status` | `"pending"` \| `"approved"` \| `"rejected"` | verification state |

Newest first.

---

## 6. Tab 3 - Buyers

```
GET /api/admin/buyers
```

```json
{
  "success": true,
  "message": "Buyers retrieved",
  "data": [
    {
      "id": "db512219-c4f9-451e-b6fe-6a2386e1408a",
      "name": null,
      "email": "testbuyer@example.com",
      "phone": null,
      "profilePicture": null,
      "joined": "2026-09-18T22:43:22.734Z",
      "status": "active"
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `name` | string \| null | **always null today** - see section 8 |
| `email` | string | always present |
| `phone` | string \| null | null when the account has none |
| `profilePicture` | string \| null | **always null today** - see section 8 |
| `joined` | ISO timestamp | when they signed up |
| `status` | `"active"` \| `"suspended"` \| `"deleted"` | `deleted` is a soft delete - the row is still returned |

Newest first.

---

## 7. Tab 4 - Listings

```
GET /api/admin/listings
```

```json
{
  "success": true,
  "message": "Listings retrieved",
  "data": [
    {
      "id": "7d6083f7-3a89-4ff2-b46a-f192798138da",
      "product": "Test Product",
      "seller": "The Test Shop",
      "location": null,
      "date": "2026-09-20T22:46:05.434Z",
      "status": "pending",
      "image": null
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `product` | string | the product's name |
| `seller` | string \| null | the shop's name; null if the listing points at no seller |
| `location` | `{ latitude, longitude }` \| null | the **seller's** coordinates - a listing has none of its own |
| `date` | ISO timestamp | when it was listed |
| `status` | `"pending"` \| `"approved"` \| `"rejected"` \| `"removed"` | note the fourth value |
| `image` | string \| null | **always null today** - see section 8 |

Newest first, every status included.

---

## 7a. One listing in full

```
GET /api/admin/listings/:id
```

Everything the listing page needs, including the shop and the person behind
it - so it needs no second call for the seller.

```json
{
  "success": true,
  "message": "Listing retrieved",
  "data": {
    "id": "9bff8538-…",
    "product": "Kente cloth",
    "seller": "Makola Fabrics",
    "price": 99.5,
    "quantity": 7,
    "category": "Fabrics",
    "subcategory": null,
    "tags": ["one", "two"],
    "image": "https://res.cloudinary.com/…/kente.jpg",
    "status": "pending",
    "moderationNote": null,
    "moderatedBy": null,
    "moderatedAt": null,
    "location": { "latitude": 5.575, "longitude": -0.2 },
    "date": "2026-09-25T01:37:33.577Z",
    "updatedAt": "2026-09-25T01:37:33.577Z",
    "shop": {
      "id": "56065822-…",
      "shopName": "Makola Fabrics",
      "logo": null,
      "location": { "latitude": 5.575, "longitude": -0.2 },
      "verificationStatus": "pending",
      "ownerName": "Ama Mensah",
      "ownerEmail": "ama@example.com",
      "ownerPhone": "0241234567",
      "isEmailVerified": false
    }
  }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Found | `200` | `Listing retrieved` |
| No listing with that id | `404` | `No listing found for that id` |
| `id` is not a uuid | `400` | `Validation failed (uuid is expected)` |
| Not an admin | `403` | `This action requires one of the following roles: ADMIN` |

`moderatedBy` is `null` for anything the super admin did - see 7b.

---

## 7b. Approve a listing

```
PATCH /api/admin/listings/:id/approve
```

No body. Until this runs, a seller's product exists but appears nowhere a
shopper looks.

```json
{
  "success": true,
  "message": "Listing approved",
  "data": { "id": "b1c4dd72-…", "status": "approved", "changed": true }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Approved | `200` | `Listing approved`, `changed: true` |
| Already approved | `200` | `That listing was already approved`, `changed: false` |
| No listing with that id | `404` | `No listing found for that id` |
| `id` is not a uuid | `400` | `Validation failed (uuid is expected)` |
| Not an admin | `403` | `This action requires one of the following roles: ADMIN` |

Approving a **rejected** or **removed** listing reinstates it, and clears the
`moderationNote` that explained why it was pulled.

Double-tapping is safe: the second call changes nothing and still returns
`200`, with `changed: false` to tell the two apart.

`moderatedAt` records when. `moderatedBy` records **null** for the super
admin - that column is a uuid, and the super admin's token carries the
sentinel id `super-admin`, which is not one.

There is no reject or remove endpoint yet.

---

## 8. Fields that are always null

`name`, `profilePicture` and `image` are in the contract but the database has
no columns behind them yet. They will be `null` on every row until a migration
adds them; the API will start returning real values with no shape change.

**Bind them now and design for the empty case** - initials instead of an
avatar, email instead of a name, a placeholder tile instead of a photo.
Nothing about the response will change when the data arrives.

`status` also has a fourth listing value, `removed`, that the designs may not
cover. Handle it or it will render blank.

---

## 9. Not built yet

- **No pagination.** Each list returns every row. Fine for now; it will need
  `page` / `limit` before the tables get long.
- **No filtering, search or sorting** server-side. Sort order is fixed to
  newest first.
- **No detail endpoints** (`/sellers/:id`) and **no actions** - approving a
  seller, rejecting a listing, suspending a buyer. These are read-only tables.

---

## 10. Try it

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@makola.com","password":"<password>"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")

curl -s http://localhost:3000/api/admin/dashboard -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/admin/sellers   -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/admin/buyers    -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/admin/listings  -H "Authorization: Bearer $TOKEN"
```

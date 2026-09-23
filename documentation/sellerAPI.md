# Seller API

Everything the seller side of the mobile app needs. Base path `/api`.

Local: `http://localhost:3000` · Deployed: `https://makola-backend-r9wy.onrender.com`

> Not yet deployed. These live on `feat/mobile`; the deployed build only has
> the admin endpoints so far.

---

## 1. Sign up

```
POST /api/register/set-seller-profile
```

Creates the account **and** the shop in one transaction, emails a
verification code, and signs you in.

Send it as JSON, or as `multipart/form-data` when there is a picture.

| Field | Required | Notes |
| --- | --- | --- |
| `email` | yes | must be unused |
| `phone` | yes | 9–15 digits, `+` allowed; must be unused |
| `password` | yes | at least 8 characters |
| `name` | yes | the person's name |
| `shopName` | yes | must be unused |
| `location` | yes* | `{ "latitude": 5.55, "longitude": -0.2 }` |
| `latitude` / `longitude` | yes* | flat alternative, for multipart |
| `role` | yes | `SELLER` or `BUYER`; `ADMIN` is rejected |
| `image` | no | a profile picture, under 5MB |

\* Send **either** the nested `location` object **or** flat `latitude` and
`longitude`. Multipart cannot nest, which is why both are accepted.

**JSON:**

```bash
curl -X POST .../api/register/set-seller-profile \
  -H 'Content-Type: application/json' \
  -d '{"email":"ama@example.com","phone":"0241234567",
       "password":"correct-horse","name":"Ama Mensah",
       "shopName":"Makola Fabrics",
       "location":{"latitude":5.575,"longitude":-0.2},"role":"SELLER"}'
```

**With a picture** — every field becomes its own `-F`:

```bash
curl -X POST .../api/register/set-seller-profile \
  -F "email=ama@example.com" -F "phone=0241234567" \
  -F "password=correct-horse" -F "name=Ama Mensah" \
  -F "shopName=Makola Fabrics" \
  -F "latitude=5.575" -F "longitude=-0.2" -F "role=SELLER" \
  -F "image=@photo.png;type=image/png"
```

```json
{
  "success": true,
  "message": "Seller profile created. Check your email for a verification code.",
  "data": {
    "saved": true,
    "accessToken": "eyJhbGci...",
    "user": { "id": "…", "email": "…", "role": "SELLER", "emailVerified": false }
  }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Created | `200` | as above |
| Email already registered | `409` | `An account with that email already exists` |
| Phone already registered | `409` | `An account with that phone number already exists` |
| Shop name taken | `409` | `That shop name is already taken` |
| No coordinates at all | `400` | `location is required: …` |
| File is not an image | `400` | `The profile picture must be an image` |
| Image over 5MB | `400` | `The profile picture must be under 5MB` |
| Cloudinary refused it | `400` | `The profile picture could not be uploaded` |
| Any bad field | `400` | `Validation failed` + `errors` map |

The picture uploads **before** the account is written, so a failed upload
never leaves a half-made account. A failed verification email does **not**
fail the request - the account exists, and the app asks again at
`POST /api/verify-otp/resend`.

---

## 2. Sign in

```
POST /api/login
{ "email": "ama@example.com", "password": "correct-horse" }
```

```json
{
  "success": true,
  "message": "Signed in. Check your email for a verification code.",
  "data": {
    "accessToken": "eyJhbGci...",
    "email": "ama@example.com",
    "role": "SELLER",
    "emailVerified": false
  }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Signed in | `200` | as above |
| Wrong password, or no such account | `401` | `Invalid email or password` |
| Suspended or deleted account | `403` | `This account is suspended. …` |

One message covers both a wrong password and an unknown email, on purpose:
saying which would let anyone check whether an address is registered.

**Tokens never expire.** There is no refresh endpoint and nothing to renew -
store the token and keep using it. It carries `sub` (the user id), `email`
and `role`.

---

## 3. Every seller route

```
Authorization: Bearer <accessToken>
```

Which shop a request acts on comes from the **token**, never a parameter, so
one seller can never read or change another's listings.

| Situation | Status | `message` |
| --- | --- | --- |
| No header, or not `Bearer` | `401` | `Authentication token is missing` |
| Expired, forged or malformed | `401` | `Authentication token is invalid or expired` |
| Signed in, but the account has no shop | `403` | `This account does not have a shop` |

That `403` is worth handling: a `BUYER` who has not registered a shop gets it
on every seller route.

---

## 4. Response envelope

Every endpoint, success or failure:

```json
{ "success": true,  "message": "...", "data": ... }
{ "success": false, "message": "...", "data": null }
```

A `400` adds a field map:

```json
{ "success": false, "message": "Validation failed", "data": null,
  "errors": { "price": "price must be greater than 0" } }
```

---

## 5. Dashboard

```
GET /api/seller/dashboard
```

```json
{
  "success": true,
  "message": "Dashboard retrieved",
  "data": {
    "name": "Ama Mensah",
    "avatar": "https://res.cloudinary.com/…/photo.png",
    "shopName": "Makola Fabrics",
    "totalListings": 10,
    "approved": 7,
    "pending": 2,
    "rejected": 1,
    "recentListings": [ /* up to 5 listing rows, newest first */ ]
  }
}
```

- `name` falls back to the shop name while `users.fullName` is unset - nothing
  writes that column yet, so expect the shop name in practice.
- `avatar` is the owner's picture, falling back to the shop logo, then `null`.
- The counts come from one grouped query, so they can never disagree.
  `totalListings` includes `removed` ones, which have no count of their own.

---

## 6. The seller's listings

```
GET /api/seller/shop
GET /api/seller/shop?status=pending
```

`status` is optional and accepts `pending`, `approved`, `rejected` or
`removed`, in any casing. Anything else is a `400` naming the valid values.

```json
{
  "success": true,
  "message": "Products retrieved",
  "data": [
    {
      "id": "a581ac16-…",
      "name": "Kente cloth",
      "price": 250.5,
      "quantity": 12,
      "image": "https://res.cloudinary.com/…/kente.png",
      "category": "Fabrics",
      "tags": ["kente", "handmade", "cloth"],
      "status": "pending",
      "moderationNote": null,
      "listedAt": "2026-09-23T00:35:42.121Z"
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `price` | number | a number, not the string pg returns |
| `quantity` | number | `0` means out of stock, not unlisted |
| `image` | string \| null | `null` when the seller listed without one |
| `category` | string \| null | |
| `tags` | string[] | always an array, `[]` when none |
| `status` | string | `pending` \| `approved` \| `rejected` \| `removed` |
| `moderationNote` | string \| null | why an admin rejected or removed it |
| `listedAt` | ISO timestamp | |

Newest first. No pagination yet.

---

## 7. The seller's own details

```
GET /api/seller/me
```

```json
{
  "success": true,
  "message": "Seller retrieved",
  "data": {
    "id": "bf5c7aa8-…",
    "userId": "fc1e59e1-…",
    "name": null,
    "avatar": "https://res.cloudinary.com/…/photo.png",
    "email": "ama@example.com",
    "phone": "0241234567",
    "shopName": "Makola Fabrics",
    "description": null,
    "logo": null,
    "location": { "latitude": 5.575, "longitude": -0.2 },
    "verificationStatus": "pending",
    "joined": "2026-09-23T00:35:42.121Z"
  }
}
```

`id` is the **shop**; `userId` is the account. `verificationStatus` is
`pending` until an admin approves the shop - it does not block anything today.
`name` and `logo` are `null` until something writes them; `description` has a
column but no endpoint sets it yet.

---

## 7b. Change the profile picture

```
POST /api/seller/me/update/profile-picture
```

`multipart/form-data` with an `image` field. Nothing else.

```bash
curl -X POST .../api/seller/me/update/profile-picture \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@photo.png;type=image/png"
```

```json
{
  "success": true,
  "message": "Profile picture updated",
  "data": {
    "avatar": "https://res.cloudinary.com/…/photo.png",
    "logo": "https://res.cloudinary.com/…/photo.png"
  }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Updated | `200` | `Profile picture updated` |
| No file in the request | `400` | `No picture was sent` |
| File is not an image | `400` | `The file must be an image` |
| Over 5MB | `400` | `The image must be under 5MB` |
| Cloudinary refused it | `400` | `The image could not be uploaded` |
| Account has no shop | `403` | `This account does not have a shop` |

It sets **both** `users.avatarUrl` and `sellers.logoUrl` to the same URL, so
the seller's own screens, the buyer screens and the admin sellers tab all pick
it up at once.

The upload happens before anything is written, so a failed upload leaves the
old picture in place rather than clearing it.

---

## 7c. Change the shop name, location or phone

Three small endpoints, one field each, all JSON.

```
POST /api/seller/me/update/shop-name   { "shopName": "Ama Fabrics" }
POST /api/seller/me/update/location    { "latitude": 5.575, "longitude": -0.2 }
POST /api/seller/me/update/phone       { "phone": "0241234567" }
```

```json
{ "success": true, "message": "Shop name updated",   "data": { "shopName": "Ama Fabrics" } }
{ "success": true, "message": "Location updated",    "data": { "location": { "latitude": 5.575, "longitude": -0.2 } } }
{ "success": true, "message": "Phone number updated","data": { "phone": "0241234567" } }
```

| Situation | Status | `message` |
| --- | --- | --- |
| Another shop has that name | `409` | `That shop name is already taken` |
| Another account has that number | `409` | `An account with that phone number already exists` |
| Blank shop name | `400` | `shopName is required` |
| Coordinates out of range | `400` | `latitude must be between -90 and 90` |
| Malformed phone | `400` | `Please provide a valid phone number` |
| Account has no shop | `403` | `This account does not have a shop` |

Re-saving your **own** name or number is fine, in any casing - the uniqueness
check skips the row it belongs to.

The phone number lives on the **account**, not the shop, so this changes the
number the seller signs up and is contacted with, not a separate shop line.
There is no column for one of those.

Moving the location moves the **whole shop**, so every listing shows in the
new place. There is no per-listing location.

---

## 8. Add a product

```
POST /api/seller/add
```

JSON, or `multipart/form-data` with an `image`.

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | up to 120 characters |
| `category` | yes | a name; created if it does not exist, matched any case |
| `price` | yes | greater than 0 |
| `quantity` | yes | whole number, 0 or more |
| `tags` | no | `["kente","cloth"]`, or `"kente,cloth"` for multipart; lower-cased, max 20 |
| `latitude` / `longitude` | no | **moves the shop** - see below |
| `image` | no | under 5MB |

```bash
curl -X POST .../api/seller/add \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=Kente cloth" -F "category=Fabrics" \
  -F "tags=kente,handmade,cloth" \
  -F "price=250.50" -F "quantity=12" \
  -F "image=@kente.png;type=image/png"
```

```json
{
  "success": true,
  "message": "Product added. It is pending review.",
  "data": { "saved": true, "id": "a581ac16-…", "status": "pending" }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Added | `200` | `Product added. It is pending review.` |
| Price 0 or negative | `400` | `price must be greater than 0` |
| Negative quantity | `400` | `quantity cannot be negative` |
| File is not an image | `400` | `The product image must be an image` |
| Image over 5MB | `400` | `The product image must be under 5MB` |
| Cloudinary refused it | `400` | `The product image could not be uploaded` |
| Account has no shop | `403` | `This account does not have a shop` |

**Every product starts as `pending`.** A seller cannot publish straight to
buyers; an admin approves it. Until then it does not appear anywhere shoppers
look.

**`latitude`/`longitude` move the whole shop.** A listing has no location
column of its own, so coordinates sent here overwrite the shop's, changing
where *every* listing appears. Leave them out unless the shop really moved.

The image uploads before the row is written, so a failed upload never leaves a
listing with a missing picture.

---

## 9. Verification

Registering and signing in both email a 6 digit code.

```
POST /api/verify-otp          { "email": "...", "code": "123456" }
POST /api/verify-otp/resend   { "email": "..." }
```

| Situation | Status | `message` |
| --- | --- | --- |
| Verified | `200` | `Email verified` |
| Wrong digits | `400` | `This verification code is incorrect` |
| Past 10 minutes | `400` | `This verification code has expired. …` |
| Already used, or none issued | `400` | `No verification code is pending …` |
| 5 wrong guesses | `400` | `Too many incorrect attempts. …` |
| Resent within 60s | `400` | `Please wait N seconds before requesting another code` |

Resending invalidates the previous code, so only the newest one works.

**`emailVerified` currently gates nothing.** An unverified seller can list
products and use every endpoint here.

---

## 10. Not built yet

- **No admin approval endpoint on this branch**, so nothing a seller adds will
  ever reach buyers yet. This is the biggest gap.
- **No edit or delete** for a listing, and no way to change stock after it is
  listed.
- **No way to update the shop's description, or the seller's own name or
  email.** Name, location, phone and picture are covered in 7b and 7c.
- **No pagination** on `/seller/shop`; it returns everything.
- **Nothing consumes the `login` code**, so the two-step sign in never
  completes. The token from `/api/login` is already valid on its own.

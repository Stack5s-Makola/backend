# Buyer API

Everything the buyer side of the mobile app needs. Base path `/api`.

Local: `http://localhost:3000` · Deployed: `https://makola-backend-r9wy.onrender.com`

---

## 1. Sign up

```
POST /api/register/buyer
```

Creates the account, emails a verification code, and signs you in.

JSON, or `multipart/form-data` when there is a picture.

| Field | Required | Notes |
| --- | --- | --- |
| `email` | yes | must be unused |
| `phone` | yes | 9–15 digits, `+` allowed; must be unused |
| `password` | yes | at least 8 characters |
| `role` | yes | `BUYER` or `SELLER`; `ADMIN` is rejected |
| `image` | no | a profile picture, under 5MB |

**JSON:**

```bash
curl -X POST .../api/register/buyer \
  -H 'Content-Type: application/json' \
  -d '{"email":"kofi@example.com","phone":"0241234567",
       "password":"12345678","role":"BUYER"}'
```

**With a picture** — every field becomes its own `-F`:

```bash
curl -X POST .../api/register/buyer \
  -F "email=kofi@example.com" -F "phone=0241234567" \
  -F "password=12345678" -F "role=BUYER" \
  -F "image=@photo.png;type=image/png"
```

```json
{
  "success": true,
  "message": "Account created. Check your email for a verification code.",
  "data": {
    "saved": true,
    "accessToken": "eyJhbGci...",
    "user": { "id": "…", "email": "…", "role": "BUYER", "emailVerified": false }
  }
}
```

| Situation | Status | `message` |
| --- | --- | --- |
| Created | `200` | as above |
| Email already registered | `409` | `An account with that email already exists` |
| Phone already registered | `409` | `An account with that phone number already exists` |
| File is not an image | `400` | `The profile picture must be an image` |
| Image over 5MB | `400` | `The profile picture must be under 5MB` |
| Any bad field | `400` | `Validation failed` + `errors` map |

The picture uploads **before** the account is written, so a failed upload
never leaves a half-made account. A failed verification email does **not**
fail the request.

---

## 2. Sign in

```
POST /api/login
{ "email": "kofi@example.com", "password": "12345678" }
```

```json
{
  "success": true,
  "message": "Signed in. Check your email for a verification code.",
  "data": {
    "accessToken": "eyJhbGci...",
    "email": "kofi@example.com",
    "role": "BUYER",
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

**Tokens never expire.** There is no refresh endpoint - store it and keep
using it.

---

## 3. Verification

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

**`emailVerified` gates nothing.** An unverified buyer can use every endpoint
below.

---

## 4. Reset a password

```
POST /api/reset-password
{ "userId": "…", "password": "a-new-password" }
```

| Situation | Status | `message` |
| --- | --- | --- |
| Changed | `200` | `Password changed` |
| No account with that id | `404` | `No account found for that id` |
| Under 8 characters | `400` | `Password must be at least 8 characters long` |

> ⚠️ This takes a user id and no proof of identity - no old password, no
> token, no code. Anyone holding an id can take that account over. Do not
> build a user-facing flow on it as it stands.

---

## 5. Every shopping route

```
Authorization: Bearer <accessToken>
```

| Situation | Status | `message` |
| --- | --- | --- |
| No header, or not `Bearer` | `401` | `Authentication token is missing` |
| Forged or malformed | `401` | `Authentication token is invalid or expired` |

A seller's token works on these too - browsing is not role restricted.

---

## 6. Response envelope

Every endpoint, success or failure:

```json
{ "success": true,  "message": "...", "data": ... }
{ "success": false, "message": "...", "data": null }
```

A `400` adds a field map:

```json
{ "success": false, "message": "Validation failed", "data": null,
  "errors": { "q": "q is required" } }
```

---

## 7. The home page

```
GET /api/buyer/products
GET /api/buyer/products?category=Fabrics
GET /api/buyer/products?latitude=5.55&longitude=-0.2&radiusKm=25
```

All query parameters optional, and they combine.

| Parameter | Notes |
| --- | --- |
| `category` | matched **whole**, any casing - a shopper taps it rather than typing |
| `latitude`, `longitude` | the device's position; both or neither |
| `radiusKm` | only used with coordinates; defaults to 25, max 500 |

```json
{
  "success": true,
  "message": "Products retrieved",
  "data": [
    {
      "id": "0011b6fb-…",
      "name": "Iphone 16 pro max",
      "price": 250.5,
      "image": "https://res.cloudinary.com/…/phone.jpg",
      "category": "Phones",
      "tags": ["apple", "phone"],
      "seller": { "id": "…", "shopName": "Zigi Phones" },
      "location": { "latitude": 5.6037, "longitude": -0.187 },
      "distanceKm": 2.8,
      "listedAt": "2026-09-23T15:40:02.622Z"
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `price` | number | a number, not the string pg returns |
| `image` | string \| null | `null` when the seller listed without one |
| `category` | string \| null | |
| `tags` | string[] | always an array |
| `seller` | object \| null | |
| `location` | object \| null | the **seller's** coordinates; a listing has none of its own |
| `distanceKm` | number | **only present** when you sent coordinates |
| `listedAt` | ISO timestamp | |

**Only approved listings appear here.** A seller's product is invisible until
an admin approves it.

Sorted newest first, or nearest first when coordinates are sent. A shop with
no coordinates drops out of a radius search, but still appears without one.
No pagination yet - it returns everything.

---

## 8. Search

```
GET /api/buyer/products/search?q=kente
```

`q` is required. Matches **anywhere** in the product name or the category
name, ignoring case - so `ken` finds `Kente cloth`.

It takes `category`, `latitude`, `longitude` and `radiusKm` too, so a search
can be narrowed the same way as the home page.

Same row shape as section 7.

| Situation | Status | `message` |
| --- | --- | --- |
| Missing or blank `q` | `400` | `q is required` |

**Tags are not searched yet**, even though every product carries them.

---

## 9. One product

```
GET /api/buyer/products/:id
```

```json
{
  "success": true,
  "message": "Product retrieved",
  "data": {
    "id": "0011b6fb-…",
    "name": "Iphone 16 pro max",
    "price": 250.5,
    "quantity": 12,
    "image": "https://res.cloudinary.com/…/phone.jpg",
    "category": "Phones",
    "subcategory": null,
    "tags": ["apple", "phone"],
    "status": "approved",
    "seller": { "id": "…", "shopName": "Zigi Phones" },
    "shop": {
      "id": "…",
      "shopName": "Zigi Phones",
      "logo": null,
      "location": { "latitude": 5.6037, "longitude": -0.187 },
      "verificationStatus": "pending"
    },
    "location": { "latitude": 5.6037, "longitude": -0.187 },
    "listedAt": "2026-09-23T15:40:02.622Z"
  }
}
```

Everything from a card, plus `subcategory`, `status` and the fuller `shop`
block - so the page needs no second call. `seller` and `shop` are the same
shop; `seller` is the short form the lists use.

| Situation | Status | `message` |
| --- | --- | --- |
| Found | `200` | `Product retrieved` |
| No product with that id | `404` | `No product found for that id` |
| `id` is not a uuid | `400` | `Validation failed (uuid is expected)` |

**Unlike the lists, this returns a product at any status.** A buyer can open
a saved item that has since been pulled, and `status` lets the app say "no
longer on sale" rather than showing a 404.

---

## 10. Saved items, for offline

```
GET /api/buyer/saved/products
GET /api/buyer/saved/shops
```

Whose saves comes from the **token** - a buyer can only ever read their own,
and a `?userId=` is ignored.

**Saved products** come back as full cards (section 7 shape), not just ids,
so the phone has everything it needs to work offline without another call per
item.

**Saved shops:**

```json
{
  "success": true,
  "message": "Saved shops retrieved",
  "data": [
    {
      "id": "…",
      "shopName": "Zigi Phones",
      "logo": null,
      "location": { "latitude": 5.6037, "longitude": -0.187 },
      "verificationStatus": "approved"
    }
  ]
}
```

Two things to expect. **Approval state is not filtered** - a listing the
buyer already saved keeps appearing even if it is pulled, rather than
vanishing mid-sync. And a save whose product or shop was deleted is skipped
rather than returning a row full of nulls.

**There is no way to save or unsave yet.** These read what is already in the
database; the write side does not exist on the buyer routes.

---

## 11. Profile

```
GET /api/buyer/my-profile
GET /api/buyer/my-profile/personal-details
```

Both read the account from the token.

```json
{ "name": null, "profilePicture": "https://…/photo.png", "email": "kofi@example.com" }
```

```json
{
  "id": "…",
  "name": null,
  "profilePicture": "https://…/photo.png",
  "email": "kofi@example.com",
  "phone": "0241234567",
  "role": "BUYER",
  "status": "active",
  "emailVerified": false,
  "joined": "2026-09-21T17:52:14.660Z"
}
```

`profilePicture` is set if they registered with an image, otherwise `null`.

**`name` is always `null`.** There is no name column on `users` - nothing
stores one, so the screen has the email and the picture to work with. Design
for that.

`status` is `active`, `suspended` or `deleted`; `deleted` is a soft delete.

---

## 12. Not built yet

- **No save or unsave.** Section 10 only reads.
- **No profile editing** - no way to change a buyer's picture, phone or
  password from a signed-in session. The seller side has these; the buyer
  side does not.
- **No orders, cart or checkout.** Nothing in the API buys anything.
- **No notifications** on the buyer side.
- **No pagination** anywhere - every list returns everything.
- **Nothing consumes the `login` code**, so the two-step sign in never
  completes. The token from `/api/login` is already valid on its own.

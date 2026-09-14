# Backend — accounts, sync, friends

Cloudflare Worker + D1 (SQLite at the edge). Free tier covers this comfortably:
100k requests/day and 5 GB of database.

The API imports `../../core/*.js`, so the server validates submitted sets with
the **same** progression math the app runs. One engine, three consumers.

## Setup

You need a free Cloudflare account. About five minutes.

### 1. Install and sign in

```bash
cd server
npm install
npx wrangler login        # opens a browser
```

### 2. Create the database

```bash
npm run db:create
```

It prints a `database_id`. Paste it into [wrangler.toml](wrangler.toml),
replacing `PLACEHOLDER_RUN_WRANGLER_D1_CREATE`.

### 3. Create the tables

```bash
npm run db:migrate
```

### 4. Deploy

```bash
npm run deploy
```

You get a URL like `https://progressive-overload-api.<you>.workers.dev`.
Put it in the app's `API_BASE` so the frontend knows where to talk.

### 5. Google Sign-In (optional)

Password sign-in works without this. To add Google:

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services
   → Credentials → **Create OAuth client ID** → Web application
2. Authorized JavaScript origins: `https://garvmandan.github.io`
3. Copy the Client ID into `GOOGLE_CLIENT_ID` in `wrangler.toml`, and into the
   frontend config
4. `npm run deploy`

## Local development

```bash
npm run db:migrate:local   # once
npm run dev                # http://localhost:8787
```

## API

All authenticated routes take `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | email + password + username → token |
| POST | `/auth/login` | email + password → token |
| POST | `/auth/google` | Google ID token → token |
| POST | `/auth/logout` | invalidate the session |
| GET | `/me` | current user |
| GET | `/state` | training state document + version |
| PUT | `/state` | replace state (optimistic concurrency via version) |
| POST | `/sessions` | upload completed workouts |
| GET | `/sessions` | list your workouts |
| GET | `/users/search?q=` | find people by username |
| GET | `/friends` | friends, incoming and outgoing requests |
| POST | `/friends` | send a request by username |
| POST | `/friends/:id/accept` | accept a request |
| DELETE | `/friends/:id` | unfriend |
| GET | `/feed` | your workouts + friends', newest first |
| POST | `/sessions/:id/kudos` | toggle kudos |
| POST | `/auth/verify` | confirm an email from a link token |
| POST | `/auth/resend-verification` | send a fresh verification email |
| POST | `/auth/forgot` | request a password reset link |
| POST | `/auth/reset` | set a new password from a link token |
| GET | `/invites/peek?code=` | who sent an invite (no auth needed) |
| POST | `/invites` | create an invite, optionally emailed |
| POST | `/invites/accept` | accept an invite and become friends |
| GET | `/invites` | invites you have sent |

Social routes (`/users/search`, `/friends`, kudos) and creating invites can
require a verified email, controlled by `REQUIRE_EMAIL_VERIFICATION`. It is
currently **off** — see [Email delivery](#email-delivery) for why. The feed is
never gated: an unverified user still sees their own workouts.

## Security decisions worth knowing

**Passwords** use PBKDF2-SHA256 at 100,000 iterations with a unique 16-byte salt
per user. Workers has no bcrypt or argon2 — only WebCrypto — and hard-caps
PBKDF2 at 100k, so this is the strongest the platform allows. The count is
stored per user, so it can be raised later without invalidating existing
passwords. Comparisons are constant-time.

**Session tokens** are 256 bits of CSPRNG randomness. Only their SHA-256 is
stored, so a database leak does not hand out live sessions.

**Sign-in failures** return the same message whether the email exists or the
password was wrong. Otherwise the endpoint becomes a way to enumerate who has an
account.

**Submitted workouts are recomputed, never trusted.** `summarizeSession` in
[src/index.js](src/index.js) recalculates volume, rep counts and estimated 1RM
from the individual sets, rejects unknown exercise ids, and bounds-checks every
weight and rep. A client claiming 999,999 lb of volume gets its real total
stored instead. This matters the moment rankings exist — see the tests in
[test/api.test.js](test/api.test.js).

**CORS** echoes the request origin only when it is on the `ALLOWED_ORIGINS`
allowlist. It never reflects an arbitrary origin.

## What is deliberately not here yet

- **Rate limiting.** Cloudflare's dashboard rules are the right tool; add one on
  `/auth/*` before this is public, or login is brute-forceable.
- **Leaderboards.** The `personal_records` table and its index exist and are
  populated; the endpoint does not. That was your "friends and feed first" call.

## Tests

```bash
npm test
```

Covers password hashing, token handling, input validation, and every anti-cheat
path in the session summarizer.

## Email delivery

`RESEND_API_KEY` is set as a Worker secret. Verified working — sends succeed.

**One limitation until a domain is verified:** Resend's test mode only delivers
to the account owner's address (`garvmandan@gmail.com`), exactly. Anything else,
including `+tag` variants of that same address, comes back:

```
403 validation_error — You can only send testing emails to your own email
address. To send emails to other recipients, please verify a domain.
```

Because of that, **email verification is currently switched off**:

```toml
# wrangler.toml
REQUIRE_EMAIL_VERIFICATION = "false"
```

Anyone can sign up and immediately use friends, invites and the feed without an
email ever being sent. Invite *links* work fine; only emailed invites are
affected by the restriction.

The machinery is still in place — verification links are issued, and clicking
one still marks an account verified. Set the flag to "true" after verifying a
domain and enforcement resumes with no code change.

### Lifting the restriction

You need a domain you control — a cheap `.com` is a few pounds a year.

1. [resend.com/domains](https://resend.com/domains) → **Add Domain**
2. Add the DNS records it gives you (SPF, DKIM) at your registrar
3. Wait for it to show **Verified**
4. Point the sender at it:
   ```bash
   # in wrangler.toml
   EMAIL_FROM = "Rep Public <hello@yourdomain.com>"
   ```
5. `npm run deploy`

After that, anyone can sign up and receive verification and invite emails.

### Rotating the key

If the key is ever exposed, revoke it at
[resend.com/api-keys](https://resend.com/api-keys), create a new one, then:

```bash
npx wrangler secret put RESEND_API_KEY
```

The prompt hides the value, so it never lands in a shell history or a log.

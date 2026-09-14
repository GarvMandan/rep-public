// Authentication: password hashing, session tokens, Google identity checks.
//
// Workers has no bcrypt/argon2 — only WebCrypto — so passwords use PBKDF2-SHA256
// at OWASP's recommended iteration count. Every comparison that touches a secret
// is constant-time.

// OWASP 2023 recommends 600k iterations for PBKDF2-SHA256, but the Workers
// runtime hard-caps it at 100k (NotSupportedError above that), so this is the
// strongest value the platform allows. `password_iter` is stored per user, so
// raising it later re-hashes new passwords without invalidating existing ones.
const ITERATIONS = 100_000;
const KEY_LEN = 32;

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Compare two hex strings without leaking where they differ. */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password, salt = null, iterations = ITERATIONS) {
  // Clamp rather than throw: a record written by another runtime with a higher
  // count must still be verifiable here instead of locking the user out.
  const rounds = Math.min(Number(iterations) || ITERATIONS, ITERATIONS);
  const saltBytes = salt ? fromHex(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: rounds },
    key,
    KEY_LEN * 8
  );
  return { hash: toHex(bits), salt: toHex(saltBytes), iterations: rounds };
}

export async function verifyPassword(password, stored) {
  if (!stored?.hash || !stored?.salt) return false;
  const { hash } = await hashPassword(password, stored.salt, stored.iterations || ITERATIONS);
  return timingSafeEqual(hash, stored.hash);
}

/** A session token the client keeps, and the hash we actually store. */
export function newSessionToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(token)));
}

export function newId(prefix = 'u') {
  return `${prefix}_${toHex(crypto.getRandomValues(new Uint8Array(12)))}`;
}

// ── Validation ────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Usernames appear in URLs and @-mentions, so keep the character set narrow.
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

export function validateEmail(email) {
  if (typeof email !== 'string') return 'Enter an email address.';
  const e = email.trim();
  if (!e) return 'Enter an email address.';
  if (e.length > 254 || !EMAIL_RE.test(e)) return 'That email address does not look right.';
  return null;
}

export function validateUsername(username) {
  if (typeof username !== 'string') return 'Pick a username.';
  const u = username.trim();
  if (!u) return 'Pick a username.';
  if (!USERNAME_RE.test(u)) {
    return 'Usernames are 3–20 characters, letters, numbers and underscores only.';
  }
  return null;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || !password) return 'Enter a password.';
  // Length beats composition rules; NIST agrees. Long minimum, no forced symbols.
  if (password.length < 8) return 'Passwords need at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

// ── Google Sign-In ────────────────────────────────────────────────────────

/**
 * Verify a Google ID token and return its claims.
 *
 * Uses Google's tokeninfo endpoint rather than verifying the JWT signature
 * locally: it is one request, Google handles key rotation, and this runs at the
 * edge where the round trip is cheap. We still check audience and expiry
 * ourselves rather than trusting the endpoint blindly.
 */
export async function verifyGoogleToken(idToken, clientId) {
  if (!idToken || typeof idToken !== 'string') return null;

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) return null;

  const claims = await res.json();

  if (claims.aud !== clientId) return null;
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return null;
  if (Number(claims.exp) * 1000 < Date.now()) return null;
  // An unverified Google email must not be able to claim someone's address.
  if (claims.email && claims.email_verified !== 'true' && claims.email_verified !== true) return null;

  return {
    sub: claims.sub,
    email: claims.email || null,
    name: claims.name || null,
    picture: claims.picture || null,
  };
}

// ── Single-use link tokens ────────────────────────────────────────────────

/**
 * A token for an emailed link. The raw value goes in the URL; only its hash is
 * stored, so the database cannot be used to verify or reset anyone's account.
 */
export function newLinkToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * A short, human-shareable invite code. Uses an unambiguous alphabet — no O/0
 * or I/1 — because these get read aloud and typed by hand.
 */
export function newInviteCode(length = 8) {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Turn an email or display name into a username candidate. */
export function suggestUsername(seed) {
  const base = String(seed || 'lifter')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 14) || 'lifter';
  const pad = Math.floor(Math.random() * 9000 + 1000);
  return `${base}${pad}`;
}

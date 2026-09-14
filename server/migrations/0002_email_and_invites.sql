-- Email verification, invites, and password reset.
--
-- All three are the same shape: a single-use token with an expiry. They are
-- separate tables rather than one polymorphic table so each can carry the
-- columns it actually needs, and so expiring one never touches another.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verified_at INTEGER;

-- Google accounts arrive pre-verified: Google already proved the address, and
-- we reject unverified Google emails at sign-in.
UPDATE users SET email_verified = 1, verified_at = created_at WHERE google_sub IS NOT NULL;

-- Only the SHA-256 of each token is stored, so a database leak cannot be used
-- to verify someone else's address or reset their password.
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,           -- 'verify' | 'reset'
  email      TEXT NOT NULL,           -- the address being proven, at issue time
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, purpose);
CREATE INDEX idx_email_tokens_expiry ON email_tokens(expires_at);

-- Friend invites. A single code can be sent by email or shared as a link, so
-- `email` is nullable: a link invite has no recipient until someone accepts.
CREATE TABLE invites (
  code        TEXT PRIMARY KEY,       -- short, shareable, not a secret hash
  inviter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,                   -- null for a shared link
  note        TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  accepted_at INTEGER
);

CREATE INDEX idx_invites_inviter ON invites(inviter_id, created_at DESC);
CREATE INDEX idx_invites_email ON invites(email);

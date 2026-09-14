-- Rep Public — schema v1
--
-- Design notes:
--  * Workout state (plan, exerciseState, bodyweight log) is stored as one JSON
--    blob per user. It is read and written whole, never queried by field, and
--    its shape is owned by core/store.js — so a document column is honest about
--    how it is actually used and lets the engine evolve without migrations.
--  * Sessions are relational. They ARE queried across users: feeds, PRs,
--    leaderboards. Those need indexes, not JSON scans.
--  * Every table a user can reach carries user_id and is filtered by it in the
--    query. There is no row-level security here; the API is the boundary.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,               -- null for Google-only accounts
  email_lower   TEXT UNIQUE,               -- lookup key; emails are case-insensitive
  username      TEXT NOT NULL UNIQUE,
  username_lower TEXT NOT NULL UNIQUE,     -- lookup + uniqueness without case games
  display_name  TEXT,
  avatar_url    TEXT,

  -- Password auth. Null when the account is Google-only.
  password_hash TEXT,
  password_salt TEXT,
  password_iter INTEGER,

  google_sub    TEXT UNIQUE,               -- Google's stable user id

  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_users_username_lower ON users(username_lower);

-- Opaque session tokens. We store only a SHA-256 of the token, so a database
-- leak does not hand out live sessions.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- The user's training state: profile, plan, exerciseState, inventory,
-- bodyweightLog. One row per user, replaced wholesale.
-- `version` powers last-write-wins conflict detection across devices.
CREATE TABLE user_state (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc         TEXT NOT NULL,               -- JSON
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL
);

-- Completed workouts. Relational because the feed and rankings query across users.
CREATE TABLE workout_sessions (
  id           TEXT PRIMARY KEY,           -- client-generated, stable across sync
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,              -- YYYY-MM-DD, the user's local day
  day          TEXT,                       -- Mon..Sun
  name         TEXT NOT NULL,
  doc          TEXT NOT NULL,              -- the full session JSON, exercises and sets

  -- Denormalized for feed and leaderboard queries, computed server-side from
  -- doc so they cannot be spoofed independently of the sets they summarize.
  total_volume REAL NOT NULL DEFAULT 0,
  total_sets   INTEGER NOT NULL DEFAULT 0,
  total_reps   INTEGER NOT NULL DEFAULT 0,

  finished_at  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_ws_user_date ON workout_sessions(user_id, finished_at DESC);
CREATE INDEX idx_ws_finished ON workout_sessions(finished_at DESC);

-- Per-lift bests, maintained server-side on session upload. Drives PR cards in
-- the feed and, later, rankings.
CREATE TABLE personal_records (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL,
  best_1rm     REAL NOT NULL,
  best_weight  REAL NOT NULL,
  best_reps    INTEGER NOT NULL,
  session_id   TEXT,
  achieved_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, exercise_id)
);

CREATE INDEX idx_pr_exercise ON personal_records(exercise_id, best_1rm DESC);

-- Friendships. One row per direction so a feed query is a simple join, and
-- "pending" lives on the row the recipient sees.
CREATE TABLE friendships (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,              -- 'pending' | 'accepted'
  -- Who sent the request. Both directions carry it, so either side can tell
  -- an incoming request from an outgoing one.
  requested_by TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX idx_friend_status ON friendships(user_id, status);

-- Kudos on a friend's workout. Minimal social signal; comments can come later.
CREATE TABLE kudos (
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_kudos_session ON kudos(session_id);

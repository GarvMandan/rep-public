// Progressive Overload API — Cloudflare Worker + D1.
//
// The client is the source of truth for *what you did*; the server is the source
// of truth for *what that means*. Volume, PRs and 1RM are recomputed here from
// the submitted sets using the same core/progression.js the app runs, so a
// tampered client cannot inflate a leaderboard by sending a bigger number.

import {
  hashPassword, verifyPassword, newSessionToken, hashToken, newId,
  validateEmail, validateUsername, validatePassword,
  verifyGoogleToken, suggestUsername,
} from './auth.js';
import { estimate1RM } from '../../core/progression.js';
import { getExercise } from '../../core/exercises.js';

const SESSION_DAYS = 90;
const MAX_BODY = 1_000_000; // 1 MB — a year of sessions is far smaller

// ── HTTP helpers ──────────────────────────────────────────────────────────

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Echo the origin only when it is on the allowlist; never reflect blindly.
  const allow = allowed.includes(origin) ? origin : allowed[0] || '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, { status = 200, origin = '', env = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin, env) },
  });
}

function fail(message, status = 400, ctx = {}) {
  return json({ error: message }, { ...ctx, status });
}

async function readBody(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new Error('Request body too large.');
  try {
    return await request.json();
  } catch {
    throw new Error('Expected a JSON body.');
  }
}

const now = () => Date.now();

// ── Session handling ──────────────────────────────────────────────────────

async function currentUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const th = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT u.*, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(th).first();

  if (!row) return null;
  if (row.expires_at < now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run();
    return null;
  }
  return row;
}

async function createSession(env, userId, userAgent) {
  const token = newSessionToken();
  const th = await hashToken(token);
  const t = now();
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(th, userId, t, t + SESSION_DAYS * 86400_000, (userAgent || '').slice(0, 200)).run();
  return token;
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatarUrl: u.avatar_url || null,
    email: u.email || null,
  };
}

// ── Server-side session validation ────────────────────────────────────────

/**
 * Recompute a submitted workout's totals from its sets, rejecting anything
 * physically implausible. This is the anti-cheat boundary: whatever the client
 * claims for volume or 1RM is discarded and recalculated here.
 */
function summarizeSession(doc) {
  if (!doc || !Array.isArray(doc.exercises)) {
    return { error: 'A session needs an exercises array.' };
  }
  if (doc.exercises.length > 40) return { error: 'Too many exercises in one session.' };

  let volume = 0, sets = 0, reps = 0;
  const prs = [];

  for (const ex of doc.exercises) {
    if (!ex || typeof ex.exerciseId !== 'string') return { error: 'An exercise is missing its id.' };
    // Unknown ids would poison rankings with lifts that do not exist.
    if (!getExercise(ex.exerciseId)) return { error: `Unknown exercise: ${ex.exerciseId}` };
    if (!Array.isArray(ex.sets) || ex.sets.length > 30) return { error: 'Too many sets on one exercise.' };

    let best = { e1: 0, weight: 0, reps: 0 };

    for (const s of ex.sets) {
      if (!s || s.actualReps == null) continue;

      const w = Number(s.actualWeight ?? s.weight ?? 0);
      const r = Number(s.actualReps);

      // Bounds are deliberately generous — they exist to reject nonsense
      // (and overflow attempts), not to police anyone's actual training.
      if (!Number.isFinite(w) || w < 0 || w > 2000) return { error: 'A set has an impossible weight.' };
      if (!Number.isInteger(r) || r < 0 || r > 500) return { error: 'A set has an impossible rep count.' };

      volume += w * r;
      reps += r;
      sets += 1;

      const e1 = estimate1RM(w, r);
      if (e1 > best.e1) best = { e1, weight: w, reps: r };
    }

    if (best.e1 > 0) prs.push({ exerciseId: ex.exerciseId, ...best });
  }

  if (sets === 0) return { error: 'That session has no logged sets.' };

  return { volume, sets, reps, prs };
}

// ── Routes ────────────────────────────────────────────────────────────────

async function handleRegister(request, env, ctx) {
  const body = await readBody(request);
  const { email, password, username } = body;

  const errors = [validateEmail(email), validatePassword(password), validateUsername(username)]
    .filter(Boolean);
  if (errors.length) return fail(errors[0], 400, ctx);

  const emailLower = email.trim().toLowerCase();
  const usernameLower = username.trim().toLowerCase();

  const clash = await env.DB.prepare(
    'SELECT email_lower, username_lower FROM users WHERE email_lower = ? OR username_lower = ?'
  ).bind(emailLower, usernameLower).first();

  if (clash) {
    return fail(
      clash.email_lower === emailLower
        ? 'An account already uses that email. Try signing in.'
        : 'That username is taken. Pick another.',
      409, ctx
    );
  }

  const { hash, salt, iterations } = await hashPassword(password);
  const id = newId('u');
  const t = now();

  await env.DB.prepare(
    `INSERT INTO users (id, email, email_lower, username, username_lower, display_name,
                        password_hash, password_salt, password_iter, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, email.trim(), emailLower, username.trim(), usernameLower, username.trim(),
         hash, salt, iterations, t, t).run();

  const token = await createSession(env, id, request.headers.get('user-agent'));
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ token, user: publicUser(user) }, ctx);
}

async function handleLogin(request, env, ctx) {
  const { email, password } = await readBody(request);
  if (!email || !password) return fail('Enter your email and password.', 400, ctx);

  const user = await env.DB.prepare('SELECT * FROM users WHERE email_lower = ?')
    .bind(String(email).trim().toLowerCase()).first();

  // Same message either way — it must not reveal which emails have accounts.
  const wrong = () => fail('That email and password do not match.', 401, ctx);

  if (!user || !user.password_hash) return wrong();

  const ok = await verifyPassword(password, {
    hash: user.password_hash, salt: user.password_salt, iterations: user.password_iter,
  });
  if (!ok) return wrong();

  const token = await createSession(env, user.id, request.headers.get('user-agent'));
  return json({ token, user: publicUser(user) }, ctx);
}

async function handleGoogle(request, env, ctx) {
  const { idToken } = await readBody(request);
  const claims = await verifyGoogleToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!claims) return fail('Google sign-in failed. Try again.', 401, ctx);

  // Existing Google account?
  let user = await env.DB.prepare('SELECT * FROM users WHERE google_sub = ?')
    .bind(claims.sub).first();

  // Otherwise link to an existing email account — Google verified the address,
  // so this is the same person, not an impersonator.
  if (!user && claims.email) {
    const byEmail = await env.DB.prepare('SELECT * FROM users WHERE email_lower = ?')
      .bind(claims.email.toLowerCase()).first();
    if (byEmail) {
      await env.DB.prepare('UPDATE users SET google_sub = ?, updated_at = ? WHERE id = ?')
        .bind(claims.sub, now(), byEmail.id).run();
      user = byEmail;
    }
  }

  if (!user) {
    // New account. Retry on username collision rather than failing the signup.
    const id = newId('u');
    const t = now();
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const candidate = suggestUsername(claims.email || claims.name);
      try {
        await env.DB.prepare(
          `INSERT INTO users (id, email, email_lower, username, username_lower, display_name,
                              avatar_url, google_sub, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id, claims.email, claims.email ? claims.email.toLowerCase() : null,
          candidate, candidate.toLowerCase(), claims.name || candidate,
          claims.picture, claims.sub, t, t
        ).run();
        created = true;
      } catch (e) {
        if (!String(e).includes('UNIQUE')) throw e;
      }
    }
    if (!created) return fail('Could not create an account. Try again.', 500, ctx);
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  }

  const token = await createSession(env, user.id, request.headers.get('user-agent'));
  return json({ token, user: publicUser(user) }, ctx);
}

async function handleLogout(request, env, ctx) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await hashToken(token)).run();
  }
  return json({ ok: true }, ctx);
}

// ── State sync ────────────────────────────────────────────────────────────

async function getState(user, env, ctx) {
  const row = await env.DB.prepare('SELECT doc, version, updated_at FROM user_state WHERE user_id = ?')
    .bind(user.id).first();
  if (!row) return json({ doc: null, version: 0 }, ctx);
  return json({ doc: JSON.parse(row.doc), version: row.version, updatedAt: row.updated_at }, ctx);
}

async function putState(request, user, env, ctx) {
  const { doc, version } = await readBody(request);
  if (!doc || typeof doc !== 'object') return fail('Expected a state document.', 400, ctx);

  const existing = await env.DB.prepare('SELECT version FROM user_state WHERE user_id = ?')
    .bind(user.id).first();
  const currentVersion = existing?.version || 0;

  // Optimistic concurrency: a stale writer is told to merge rather than
  // silently clobbering a session logged on another device.
  if (version != null && version !== currentVersion) {
    return json(
      { error: 'conflict', message: 'This was changed on another device.', version: currentVersion },
      { ...ctx, status: 409 }
    );
  }

  const next = currentVersion + 1;
  const t = now();
  await env.DB.prepare(
    `INSERT INTO user_state (user_id, doc, version, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, version = excluded.version,
                                        updated_at = excluded.updated_at`
  ).bind(user.id, JSON.stringify(doc), next, t).run();

  return json({ ok: true, version: next }, ctx);
}

// ── Workout sessions ──────────────────────────────────────────────────────

async function uploadSessions(request, user, env, ctx) {
  const { sessions } = await readBody(request);
  if (!Array.isArray(sessions)) return fail('Expected a sessions array.', 400, ctx);
  if (sessions.length > 200) return fail('Too many sessions in one upload.', 400, ctx);

  const statements = [];
  const prUpdates = new Map();
  let accepted = 0;

  for (const s of sessions) {
    if (!s || typeof s.id !== 'string') continue;

    const summary = summarizeSession(s);
    if (summary.error) return fail(summary.error, 400, ctx);

    const t = now();
    const finishedAt = Date.parse(s.finishedAt || '') || t;

    statements.push(
      env.DB.prepare(
        `INSERT INTO workout_sessions
           (id, user_id, date, day, name, doc, total_volume, total_sets, total_reps, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           doc = excluded.doc, total_volume = excluded.total_volume,
           total_sets = excluded.total_sets, total_reps = excluded.total_reps`
      ).bind(
        s.id, user.id, String(s.date || '').slice(0, 10), s.day || null,
        String(s.name || 'Workout').slice(0, 120), JSON.stringify(s),
        summary.volume, summary.sets, summary.reps, finishedAt, t
      )
    );

    // Keep only the best claim per exercise across the whole upload.
    for (const pr of summary.prs) {
      const cur = prUpdates.get(pr.exerciseId);
      if (!cur || pr.e1 > cur.e1) {
        prUpdates.set(pr.exerciseId, { ...pr, sessionId: s.id, achievedAt: finishedAt });
      }
    }
    accepted += 1;
  }

  for (const [exerciseId, pr] of prUpdates) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO personal_records
           (user_id, exercise_id, best_1rm, best_weight, best_reps, session_id, achieved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, exercise_id) DO UPDATE SET
           best_1rm    = MAX(personal_records.best_1rm, excluded.best_1rm),
           best_weight = CASE WHEN excluded.best_1rm > personal_records.best_1rm
                              THEN excluded.best_weight ELSE personal_records.best_weight END,
           best_reps   = CASE WHEN excluded.best_1rm > personal_records.best_1rm
                              THEN excluded.best_reps ELSE personal_records.best_reps END,
           session_id  = CASE WHEN excluded.best_1rm > personal_records.best_1rm
                              THEN excluded.session_id ELSE personal_records.session_id END,
           achieved_at = CASE WHEN excluded.best_1rm > personal_records.best_1rm
                              THEN excluded.achieved_at ELSE personal_records.achieved_at END`
      ).bind(user.id, exerciseId, pr.e1, pr.weight, pr.reps, pr.sessionId, pr.achievedAt)
    );
  }

  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true, accepted }, ctx);
}

async function listSessions(request, user, env, ctx) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const { results } = await env.DB.prepare(
    `SELECT id, date, day, name, total_volume, total_sets, total_reps, finished_at
       FROM workout_sessions WHERE user_id = ? ORDER BY finished_at DESC LIMIT ?`
  ).bind(user.id, limit).all();
  return json({ sessions: results }, ctx);
}

// ── Friends ───────────────────────────────────────────────────────────────

async function searchUsers(request, user, env, ctx) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return json({ users: [] }, ctx);

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url,
            f.status, f.requested_by
       FROM users u
       LEFT JOIN friendships f ON f.user_id = ? AND f.friend_id = u.id
      WHERE u.username_lower LIKE ? AND u.id != ?
      LIMIT 20`
  ).bind(user.id, `${q}%`, user.id).all();

  return json({
    users: results.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.username,
      avatarUrl: r.avatar_url,
      friendStatus: r.status || null,
      outgoing: r.requested_by === user.id,
    })),
  }, ctx);
}

async function listFriends(user, env, ctx) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, f.status, f.requested_by
       FROM friendships f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
      ORDER BY f.status, u.username`
  ).bind(user.id).all();

  const friends = [], incoming = [], outgoing = [];
  for (const r of results) {
    const entry = {
      id: r.id, username: r.username,
      displayName: r.display_name || r.username, avatarUrl: r.avatar_url,
    };
    if (r.status === 'accepted') friends.push(entry);
    else if (r.requested_by === user.id) outgoing.push(entry);
    else incoming.push(entry);
  }
  return json({ friends, incoming, outgoing }, ctx);
}

async function requestFriend(request, user, env, ctx) {
  const { username } = await readBody(request);
  if (!username) return fail('Who do you want to add?', 400, ctx);

  const target = await env.DB.prepare('SELECT id, username FROM users WHERE username_lower = ?')
    .bind(String(username).trim().toLowerCase()).first();
  if (!target) return fail('No one by that username.', 404, ctx);
  if (target.id === user.id) return fail('You cannot add yourself.', 400, ctx);

  const existing = await env.DB.prepare(
    'SELECT status, requested_by FROM friendships WHERE user_id = ? AND friend_id = ?'
  ).bind(user.id, target.id).first();

  if (existing?.status === 'accepted') return json({ ok: true, status: 'accepted' }, ctx);

  // They already asked you — treat this as accepting rather than a second request.
  if (existing?.status === 'pending' && existing.requested_by === target.id) {
    return acceptFriend(target.id, user, env, ctx);
  }
  if (existing?.status === 'pending') return json({ ok: true, status: 'pending' }, ctx);

  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO friendships (user_id, friend_id, status, requested_by, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    ).bind(user.id, target.id, user.id, t, t),
    env.DB.prepare(
      `INSERT INTO friendships (user_id, friend_id, status, requested_by, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    ).bind(target.id, user.id, user.id, t, t),
  ]);

  return json({ ok: true, status: 'pending' }, ctx);
}

async function acceptFriend(friendId, user, env, ctx) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE friendships SET status = 'accepted', updated_at = ?
        WHERE user_id = ? AND friend_id = ?`
    ).bind(t, user.id, friendId),
    env.DB.prepare(
      `UPDATE friendships SET status = 'accepted', updated_at = ?
        WHERE user_id = ? AND friend_id = ?`
    ).bind(t, friendId, user.id),
  ]);
  return json({ ok: true, status: 'accepted' }, ctx);
}

async function removeFriend(friendId, user, env, ctx) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').bind(user.id, friendId),
    env.DB.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').bind(friendId, user.id),
  ]);
  return json({ ok: true }, ctx);
}

// ── Feed ──────────────────────────────────────────────────────────────────

async function feed(request, user, env, ctx) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);
  const before = Number(url.searchParams.get('before')) || Date.now();

  // Your own workouts plus your accepted friends'.
  const { results } = await env.DB.prepare(
    `SELECT ws.id, ws.user_id, ws.date, ws.name, ws.total_volume, ws.total_sets,
            ws.total_reps, ws.finished_at, ws.doc,
            u.username, u.display_name, u.avatar_url,
            (SELECT COUNT(*) FROM kudos k WHERE k.session_id = ws.id) AS kudos_count,
            (SELECT COUNT(*) FROM kudos k WHERE k.session_id = ws.id AND k.user_id = ?) AS kudoed
       FROM workout_sessions ws
       JOIN users u ON u.id = ws.user_id
      WHERE ws.finished_at < ?
        AND (ws.user_id = ?
             OR ws.user_id IN (SELECT friend_id FROM friendships
                                WHERE user_id = ? AND status = 'accepted'))
      ORDER BY ws.finished_at DESC
      LIMIT ?`
  ).bind(user.id, before, user.id, user.id, limit).all();

  const items = results.map((r) => {
    let top = [];
    try {
      // Surface the heaviest set per exercise — the part worth looking at.
      const doc = JSON.parse(r.doc);
      top = (doc.exercises || []).slice(0, 4).map((ex) => {
        const best = (ex.sets || []).reduce(
          (b, s) => {
            const w = s.actualWeight ?? s.weight ?? 0;
            return w > b.weight ? { weight: w, reps: s.actualReps } : b;
          },
          { weight: 0, reps: 0 }
        );
        return { name: ex.name, weight: best.weight, reps: best.reps };
      });
    } catch { /* a malformed doc should not break the whole feed */ }

    return {
      id: r.id,
      user: {
        id: r.user_id, username: r.username,
        displayName: r.display_name || r.username, avatarUrl: r.avatar_url,
      },
      isMine: r.user_id === user.id,
      date: r.date,
      name: r.name,
      volume: r.total_volume,
      sets: r.total_sets,
      reps: r.total_reps,
      finishedAt: r.finished_at,
      topLifts: top,
      kudos: r.kudos_count,
      kudoed: r.kudoed > 0,
    };
  });

  return json({ items, nextBefore: items.length ? items[items.length - 1].finishedAt : null }, ctx);
}

async function toggleKudos(sessionId, user, env, ctx) {
  const existing = await env.DB.prepare(
    'SELECT 1 FROM kudos WHERE session_id = ? AND user_id = ?'
  ).bind(sessionId, user.id).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM kudos WHERE session_id = ? AND user_id = ?')
      .bind(sessionId, user.id).run();
    return json({ ok: true, kudoed: false }, ctx);
  }

  // Only on a workout you are allowed to see.
  const visible = await env.DB.prepare(
    `SELECT 1 FROM workout_sessions ws
      WHERE ws.id = ?
        AND (ws.user_id = ?
             OR ws.user_id IN (SELECT friend_id FROM friendships
                                WHERE user_id = ? AND status = 'accepted'))`
  ).bind(sessionId, user.id, user.id).first();
  if (!visible) return fail('That workout is not in your feed.', 404, ctx);

  await env.DB.prepare('INSERT INTO kudos (session_id, user_id, created_at) VALUES (?, ?, ?)')
    .bind(sessionId, user.id, now()).run();
  return json({ ok: true, kudoed: true }, ctx);
}

// ── Router ────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const ctx = { origin, env };
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    try {
      if (path === '/' || path === '/health') {
        return json({ ok: true, service: 'progressive-overload' }, ctx);
      }

      // Public routes
      if (path === '/auth/register' && request.method === 'POST') return handleRegister(request, env, ctx);
      if (path === '/auth/login' && request.method === 'POST') return handleLogin(request, env, ctx);
      if (path === '/auth/google' && request.method === 'POST') return handleGoogle(request, env, ctx);
      if (path === '/auth/logout' && request.method === 'POST') return handleLogout(request, env, ctx);

      // Everything below needs a valid session.
      const user = await currentUser(request, env);
      if (!user) return fail('Sign in to continue.', 401, ctx);

      if (path === '/me') return json({ user: publicUser(user) }, ctx);

      if (path === '/state' && request.method === 'GET') return getState(user, env, ctx);
      if (path === '/state' && request.method === 'PUT') return putState(request, user, env, ctx);

      if (path === '/sessions' && request.method === 'POST') return uploadSessions(request, user, env, ctx);
      if (path === '/sessions' && request.method === 'GET') return listSessions(request, user, env, ctx);

      if (path === '/users/search') return searchUsers(request, user, env, ctx);
      if (path === '/friends' && request.method === 'GET') return listFriends(user, env, ctx);
      if (path === '/friends' && request.method === 'POST') return requestFriend(request, user, env, ctx);

      const accept = path.match(/^\/friends\/([^/]+)\/accept$/);
      if (accept && request.method === 'POST') return acceptFriend(accept[1], user, env, ctx);

      const remove = path.match(/^\/friends\/([^/]+)$/);
      if (remove && request.method === 'DELETE') return removeFriend(remove[1], user, env, ctx);

      if (path === '/feed') return feed(request, user, env, ctx);

      const kudos = path.match(/^\/sessions\/([^/]+)\/kudos$/);
      if (kudos && request.method === 'POST') return toggleKudos(kudos[1], user, env, ctx);

      return fail('No such endpoint.', 404, ctx);
    } catch (err) {
      // Never leak internals to the client; the real error goes to the log.
      console.error('API error:', err?.stack || err);
      const msg = String(err?.message || '');
      if (msg.includes('too large') || msg.includes('JSON body')) return fail(msg, 400, ctx);
      return fail('Something went wrong. Try again.', 500, ctx);
    }
  },
};

// API client + sync.
//
// Offline-first by design: the app never waits on the network. Every action
// writes to local storage first and syncs opportunistically, so a workout
// logged in a basement gym with no signal is not lost and not delayed.
//
// Platform-free — no DOM, no localStorage calls. The token store is injected,
// so this works unchanged on web, React Native, or a test harness.

export function createApi({ baseUrl, tokenStore }) {
  let token = null;

  // Whether the server actually enforces email verification. It is off while
  // the email provider can only reach the account owner, so the app must not
  // nag about a rule nobody is enforcing. Assume off until the server says
  // otherwise — a spurious banner is worse than a missing one.
  let verificationRequired = false;

  /** Remember the flag whenever a response carries it. */
  function noteFlags(r) {
    if (r && typeof r.verificationRequired === 'boolean') {
      verificationRequired = r.verificationRequired;
    }
    return r;
  }

  async function loadToken() {
    if (token === null) token = (await tokenStore.get()) || '';
    return token;
  }

  async function setToken(next) {
    token = next || '';
    await tokenStore.set(token);
  }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = await loadToken();
      if (t) headers.Authorization = `Bearer ${t}`;
    }

    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Distinguish "no network" from "server said no" — callers treat them
      // differently, and an offline user should never see an error.
      const err = new Error('offline');
      err.offline = true;
      throw err;
    }

    let data = null;
    try { data = await res.json(); } catch { /* empty body is fine */ }

    if (!res.ok) {
      const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      if (res.status === 401) err.unauthorized = true;
      if (res.status === 409) err.conflict = true;
      throw err;
    }
    return data;
  }

  return {
    async isSignedIn() { return !!(await loadToken()); },
    getToken: loadToken,

    // ── Auth ──────────────────────────────────────────────────────────────
    async register({ email, password, username }) {
      const r = noteFlags(await request('/auth/register', {
        method: 'POST', auth: false, body: { email, password, username },
      }));
      await setToken(r.token);
      return r.user;
    },

    async login({ email, password }) {
      const r = noteFlags(await request('/auth/login', {
        method: 'POST', auth: false, body: { email, password },
      }));
      await setToken(r.token);
      return r.user;
    },

    async loginWithGoogle(idToken) {
      const r = noteFlags(await request('/auth/google', {
        method: 'POST', auth: false, body: { idToken },
      }));
      await setToken(r.token);
      return r.user;
    },

    async logout() {
      // Clear locally even if the server call fails — the user asked to sign out.
      try { await request('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      await setToken('');
    },

    async me() {
      const r = noteFlags(await request('/me'));
      return r.user;
    },

    /** Does the server require a verified email for social features? */
    verificationRequired: () => verificationRequired,

    // ── Email verification & password reset ───────────────────────────────
    verifyEmail: (token) => request('/auth/verify', { method: 'POST', auth: false, body: { token } }),
    resendVerification: () => request('/auth/resend-verification', { method: 'POST' }),
    forgotPassword: (email) => request('/auth/forgot', { method: 'POST', auth: false, body: { email } }),

    async resetPassword(token, password) {
      const r = await request('/auth/reset', { method: 'POST', auth: false, body: { token, password } });
      // A reset signs you straight in — the token it returns replaces any old one.
      if (r.token) await setToken(r.token);
      return r.user;
    },

    // ── Invites ───────────────────────────────────────────────────────────
    createInvite: (email, note) => request('/invites', { method: 'POST', body: { email, note } }),
    peekInvite: (code) => request(`/invites/peek?code=${encodeURIComponent(code)}`, { auth: false }),
    acceptInvite: (code) => request('/invites/accept', { method: 'POST', body: { code } }),
    listInvites: () => request('/invites'),

    // ── State ─────────────────────────────────────────────────────────────
    getState: () => request('/state'),
    putState: (doc, version) => request('/state', { method: 'PUT', body: { doc, version } }),

    // ── Sessions ──────────────────────────────────────────────────────────
    uploadSessions: (sessions) => request('/sessions', { method: 'POST', body: { sessions } }),
    listSessions: (limit = 50) => request(`/sessions?limit=${limit}`),

    // ── Social ────────────────────────────────────────────────────────────
    searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
    friends: () => request('/friends'),
    addFriend: (username) => request('/friends', { method: 'POST', body: { username } }),
    acceptFriend: (id) => request(`/friends/${id}/accept`, { method: 'POST' }),
    removeFriend: (id) => request(`/friends/${id}`, { method: 'DELETE' }),
    feed: (before) => request(`/feed${before ? `?before=${before}` : ''}`),
    toggleKudos: (sessionId) => request(`/sessions/${sessionId}/kudos`, { method: 'POST' }),
  };
}

/**
 * Sync engine. Pushes local state up and pulls remote state down.
 *
 * Conflict policy is deliberately simple and safe: **sessions are never lost.**
 * Completed workouts are append-only and merge by id from both sides. Only the
 * mutable state document (plan, current weights) uses last-write-wins, and a
 * version mismatch forces a merge rather than a silent overwrite.
 */
export function createSync({ api, store }) {
  let syncing = false;
  let lastError = null;
  const listeners = new Set();

  const notify = (status) => listeners.forEach((fn) => fn(status));

  function statusOf(extra = {}) {
    return { syncing, lastError, ...extra };
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    status: () => statusOf(),

    /**
     * Reconcile local and remote.
     * @param {object} [opts]
     * @param {boolean} [opts.preferLocal] on first sign-in from a device that
     *        already has data, keep what is on the device.
     */
    async run({ preferLocal = false } = {}) {
      // Claim the lock synchronously, before any await. Checking it after one
      // lets two concurrent callers both pass the guard and sync twice.
      if (syncing) return statusOf();
      syncing = true;
      lastError = null;

      if (!(await api.isSignedIn())) {
        syncing = false;
        return statusOf({ skipped: 'signed-out' });
      }

      notify(statusOf());

      try {
        const local = store.getState();
        const remote = await api.getState();

        // 1. Sessions merge by id — a workout logged on either device survives.
        const localSessions = local.sessions || [];
        if (localSessions.length) {
          await api.uploadSessions(localSessions);
        }

        // 2. State document.
        const remoteDoc = remote.doc;
        const haveLocal = !!local.profile;

        if (!remoteDoc && haveLocal) {
          // First device to sync wins the empty slot.
          await api.putState(stateDoc(local), remote.version);
        } else if (remoteDoc && !haveLocal) {
          // Fresh device: adopt what the account already knows.
          await store.replace({ ...remoteDoc, sessions: mergeSessions(remoteDoc.sessions, localSessions) });
        } else if (remoteDoc && haveLocal) {
          if (preferLocal) {
            await api.putState(stateDoc(local), remote.version);
          } else {
            // Remote is newer or equal: take its plan and progression, but keep
            // every session either side has.
            const merged = {
              ...remoteDoc,
              sessions: mergeSessions(remoteDoc.sessions, localSessions),
              activeSession: local.activeSession || remoteDoc.activeSession || null,
            };
            await store.replace(merged);
            // Push back the union so the server has the merged session list too.
            await api.putState(stateDoc(store.getState()), remote.version);
          }
        }

        syncing = false;
        notify(statusOf({ ok: true, at: Date.now() }));
        return statusOf({ ok: true });
      } catch (err) {
        syncing = false;
        // Being offline is normal, not a failure worth surfacing.
        lastError = err.offline ? null : err.message;
        notify(statusOf({ offline: !!err.offline }));
        return statusOf({ error: lastError, offline: !!err.offline });
      }
    },
  };
}

/** The parts of local state worth syncing. Transient UI state stays local. */
function stateDoc(state) {
  return {
    schemaVersion: state.schemaVersion,
    profile: state.profile,
    plan: state.plan,
    inventory: state.inventory,
    exerciseState: state.exerciseState,
    sessions: state.sessions,
    bodyweightLog: state.bodyweightLog,
  };
}

/** Union of two session lists, newest last, deduped by id. */
function mergeSessions(a = [], b = []) {
  const byId = new Map();
  for (const s of [...(a || []), ...(b || [])]) {
    if (!s || !s.id) continue;
    // On a duplicate id, keep whichever has more logged sets — that is the
    // version that finished, not one abandoned mid-workout.
    const existing = byId.get(s.id);
    if (!existing || countSets(s) > countSets(existing)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

function countSets(session) {
  return (session.exercises || []).reduce((a, e) => a + (e.sets || []).length, 0);
}

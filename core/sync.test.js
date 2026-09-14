// Sync tests. Run: node core/sync.test.js
//
// The thing that must never happen is losing a logged workout, so most of these
// are about merge behavior under conflict.

import assert from 'node:assert/strict';
import { createApi, createSync } from './api.js';
import { createStore, createMemoryAdapter } from './store.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function memoryTokenStore(initial = '') {
  let t = initial;
  return { async get() { return t; }, async set(v) { t = v; } };
}

/** A fake server: records calls, serves canned responses. */
function fakeServer({ state = null, version = 0 } = {}) {
  const calls = [];
  let stored = state;
  let ver = version;

  const handlers = {
    'GET /state': () => ({ doc: stored, version: ver }),
    'PUT /state': (body) => {
      if (body.version != null && body.version !== ver) {
        const e = new Error('conflict'); e.status = 409; e.conflict = true; throw e;
      }
      stored = body.doc; ver += 1;
      return { ok: true, version: ver };
    },
    'POST /sessions': (body) => ({ ok: true, accepted: body.sessions.length }),
  };

  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    const key = `${opts.method || 'GET'} ${path}`;
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ key, body });

    const h = handlers[key];
    if (!h) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    try {
      const data = h(body);
      return { ok: true, status: 200, json: async () => data };
    } catch (e) {
      return { ok: false, status: e.status || 500, json: async () => ({ error: e.message }) };
    }
  };

  return { calls, get stored() { return stored; }, get version() { return ver; } };
}

function offlineServer() {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
}

const PROFILE = {
  name: 'Test', heightIn: 70, bodyweight: 180, experience: 'intermediate',
  equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'],
  favorites: [], goal: 'muscle',
};

async function localStore({ withProfile = true } = {}) {
  const s = createStore(createMemoryAdapter());
  await s.load();
  if (withProfile) {
    await s.completeSetup(PROFILE, { presetId: 'ppl-arnold', trainingDays: ['Mon', 'Wed', 'Fri'] });
  }
  return s;
}

const session = (id, date, sets = 2) => ({
  id, date, day: 'Mon', name: 'Chest & Back',
  exercises: [{
    exerciseId: 'bb-bench', name: 'Barbell Bench Press',
    sets: Array.from({ length: sets }, () => ({ actualWeight: 185, actualReps: 8, done: true })),
  }],
});

// ═══ API client ═══════════════════════════════════════════════════════════
test('sends the bearer token once signed in', async () => {
  const srv = fakeServer();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('tok123') });
  await api.getState();
  // The fake records the call; assert the header separately.
  let seen = null;
  globalThis.fetch = async (url, opts) => {
    seen = opts.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({ doc: null, version: 0 }) };
  };
  await api.getState();
  assert.equal(seen, 'Bearer tok123');
});

test('reports offline distinctly from a server error', async () => {
  offlineServer();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await assert.rejects(() => api.getState(), (e) => e.offline === true);
});

test('surfaces the server message on failure', async () => {
  globalThis.fetch = async () => ({
    ok: false, status: 409, json: async () => ({ error: 'taken', message: 'That username is taken.' }),
  });
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore() });
  await assert.rejects(
    () => api.register({ email: 'a@b.co', password: 'password1', username: 'garv' }),
    (e) => e.message === 'That username is taken.' && e.conflict === true
  );
});

test('login stores the token so later calls are authenticated', async () => {
  const ts = memoryTokenStore();
  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => ({ token: 'newtok', user: { id: 'u1', username: 'garv' } }),
  });
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: ts });
  assert.equal(await api.isSignedIn(), false);
  const user = await api.login({ email: 'a@b.co', password: 'x' });
  assert.equal(user.username, 'garv');
  assert.equal(await ts.get(), 'newtok');
  assert.equal(await api.isSignedIn(), true);
});

test('logout clears the token even when the server call fails', async () => {
  const ts = memoryTokenStore('tok');
  offlineServer();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: ts });
  await api.logout();
  assert.equal(await ts.get(), '');
  assert.equal(await api.isSignedIn(), false);
});

// ═══ Sync ═════════════════════════════════════════════════════════════════
test('does nothing when signed out', async () => {
  const srv = fakeServer();
  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('') });
  const sync = createSync({ api, store });
  const r = await sync.run();
  assert.equal(r.skipped, 'signed-out');
  assert.equal(srv.calls.length, 0, 'no network calls at all');
});

test('first sync from a device with data pushes it up', async () => {
  const srv = fakeServer({ state: null, version: 0 });
  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store }).run();

  assert.ok(srv.stored, 'server received the state');
  assert.ok(srv.stored.profile, 'profile included');
  assert.ok(srv.stored.plan, 'plan included');
});

test('a fresh device adopts the account state', async () => {
  const seeded = await localStore();
  const remoteDoc = {
    schemaVersion: 2, profile: PROFILE,
    plan: seeded.getState().plan,
    inventory: seeded.getState().inventory,
    exerciseState: { 'bb-bench': { weight: 225, targetReps: 5, sets: 3, best1RM: 260 } },
    sessions: [session('s_remote', '2026-09-01')],
    bodyweightLog: [],
  };
  const srv = fakeServer({ state: remoteDoc, version: 3 });

  const fresh = await localStore({ withProfile: false });
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store: fresh }).run();

  const st = fresh.getState();
  assert.ok(st.profile, 'profile arrived');
  assert.equal(st.exerciseState['bb-bench'].weight, 225, 'progression arrived');
  assert.equal(st.sessions.length, 1, 'history arrived');
});

test('sessions from two devices both survive a merge', async () => {
  const seeded = await localStore();
  const remoteDoc = {
    schemaVersion: 2, profile: PROFILE,
    plan: seeded.getState().plan, inventory: seeded.getState().inventory,
    exerciseState: {},
    sessions: [session('s_phone', '2026-09-01'), session('s_shared', '2026-09-03')],
    bodyweightLog: [],
  };
  const srv = fakeServer({ state: remoteDoc, version: 2 });

  const store = await localStore();
  // This device logged one the server has not seen, plus one they share.
  await store.replace({
    ...store.getState(),
    sessions: [session('s_shared', '2026-09-03'), session('s_laptop', '2026-09-05')],
  });

  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store }).run();

  const ids = store.getState().sessions.map((s) => s.id).sort();
  assert.deepEqual(ids, ['s_laptop', 's_phone', 's_shared'], 'union, deduped');
});

test('a duplicate session id keeps the more complete copy', async () => {
  const seeded = await localStore();
  const remoteDoc = {
    schemaVersion: 2, profile: PROFILE,
    plan: seeded.getState().plan, inventory: seeded.getState().inventory,
    exerciseState: {},
    sessions: [session('s_1', '2026-09-01', 1)],  // server has a 1-set version
    bodyweightLog: [],
  };
  fakeServer({ state: remoteDoc, version: 1 });

  const store = await localStore();
  await store.replace({
    ...store.getState(),
    sessions: [session('s_1', '2026-09-01', 4)],   // device has the full 4-set version
  });

  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store }).run();

  const merged = store.getState().sessions.find((s) => s.id === 's_1');
  assert.equal(merged.exercises[0].sets.length, 4, 'the completed version wins');
});

test('local sessions are uploaded to the server', async () => {
  const srv = fakeServer({ state: null, version: 0 });
  const store = await localStore();
  await store.replace({ ...store.getState(), sessions: [session('s_a', '2026-09-01')] });

  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store }).run();

  const upload = srv.calls.find((c) => c.key === 'POST /sessions');
  assert.ok(upload, 'sessions were uploaded');
  assert.equal(upload.body.sessions.length, 1);
});

test('preferLocal overwrites the server instead of adopting remote', async () => {
  const seeded = await localStore();
  const remoteDoc = {
    schemaVersion: 2, profile: { ...PROFILE, bodyweight: 999 },
    plan: seeded.getState().plan, inventory: seeded.getState().inventory,
    exerciseState: {}, sessions: [], bodyweightLog: [],
  };
  const srv = fakeServer({ state: remoteDoc, version: 1 });

  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store }).run({ preferLocal: true });

  assert.equal(store.getState().profile.bodyweight, 180, 'local kept');
  assert.equal(srv.stored.profile.bodyweight, 180, 'and pushed up');
});

test('an in-progress workout is never clobbered by a sync', async () => {
  const seeded = await localStore();
  const remoteDoc = {
    schemaVersion: 2, profile: PROFILE,
    plan: seeded.getState().plan, inventory: seeded.getState().inventory,
    exerciseState: {}, sessions: [], bodyweightLog: [], activeSession: null,
  };
  fakeServer({ state: remoteDoc, version: 1 });

  const store = await localStore();
  await store.startSession('Mon');
  await store.logSet(0, 0, 8, 185);
  const before = store.getState().activeSession.id;

  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  await createSync({ api, store }).run();

  const after = store.getState().activeSession;
  assert.ok(after, 'still mid-workout');
  assert.equal(after.id, before);
  assert.equal(after.exercises[0].sets[0].actualReps, 8, 'the logged set survived');
});

test('going offline mid-sync is not reported as an error', async () => {
  offlineServer();
  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  const r = await createSync({ api, store }).run();

  assert.equal(r.offline, true);
  assert.equal(r.error, null, 'offline is normal, not a failure');
  assert.ok(store.getState().profile, 'local data untouched');
});

test('a server error surfaces without destroying local data', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  const r = await createSync({ api, store }).run();

  assert.ok(r.error, 'error reported');
  assert.ok(store.getState().profile, 'local data intact');
});

test('concurrent runs do not stack up', async () => {
  const srv = fakeServer({ state: null, version: 0 });
  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  const sync = createSync({ api, store });

  const [a, b] = await Promise.all([sync.run(), sync.run()]);
  const one = a.ok || b.ok;
  assert.ok(one, 'one of them ran');
  const gets = srv.calls.filter((c) => c.key === 'GET /state').length;
  assert.equal(gets, 1, 'the second call was dropped rather than duplicating work');
});

test('subscribers are told when sync starts and finishes', async () => {
  fakeServer({ state: null, version: 0 });
  const store = await localStore();
  const api = createApi({ baseUrl: 'https://api.test', tokenStore: memoryTokenStore('t') });
  const sync = createSync({ api, store });

  const seen = [];
  sync.subscribe((s) => seen.push(s.syncing));
  await sync.run();

  assert.ok(seen.includes(true), 'reported starting');
  assert.ok(seen.includes(false), 'reported finishing');
});

// ═══ runner ═══════════════════════════════════════════════════════════════
(async () => {
  const failures = [];
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; }
    catch (err) { failures.push([name, err]); }
  }
  console.log(`\n  ${passed}/${tests.length} passed`);
  if (failures.length) {
    console.log('\n  FAILURES:\n');
    for (const [name, err] of failures) console.log(`  ✗ ${name}\n    ${err.message}\n`);
    process.exit(1);
  }
  console.log('  All green.\n');
})();

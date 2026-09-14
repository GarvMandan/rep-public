// Server tests: password hashing, validation, and the anti-cheat summarizer.
// Run: node test/api.test.js
//
// These run in plain Node against the same WebCrypto the Worker uses, so no
// wrangler or D1 is needed to check the logic that matters most.

import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, newSessionToken, hashToken, newId,
  validateEmail, validateUsername, validatePassword, suggestUsername,
  newLinkToken, newInviteCode,
} from '../src/auth.js';
import { verificationEmail, inviteEmail, passwordResetEmail } from '../src/email.js';
import { estimate1RM } from '../../core/progression.js';
import { getExercise } from '../../core/exercises.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ═══ Password hashing ═════════════════════════════════════════════════════
test('hashes a password and verifies it', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.ok(stored.hash && stored.salt);
  assert.equal(stored.iterations, 100_000, 'the Workers runtime caps PBKDF2 at 100k');
  assert.ok(await verifyPassword('correct horse battery staple', stored));
});

test('rejects the wrong password', async () => {
  const stored = await hashPassword('hunter2hunter2');
  assert.equal(await verifyPassword('hunter2hunter3', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('the same password hashes differently for different users', async () => {
  const a = await hashPassword('samepassword');
  const b = await hashPassword('samepassword');
  assert.notEqual(a.salt, b.salt, 'salts must be unique');
  assert.notEqual(a.hash, b.hash, 'identical passwords must not share a hash');
});

test('verification is safe against malformed stored records', async () => {
  assert.equal(await verifyPassword('x', null), false);
  assert.equal(await verifyPassword('x', {}), false);
  assert.equal(await verifyPassword('x', { hash: 'abc' }), false);
});

test('iteration counts are clamped to what the runtime supports', async () => {
  // The Workers runtime throws NotSupportedError above 100k. A record written
  // elsewhere with a higher count must still verify rather than locking the
  // user out of their account.
  const stored = await hashPassword('somepassword', null, 500_000);
  assert.equal(stored.iterations, 100_000, 'clamped on write');
  assert.ok(await verifyPassword('somepassword', { ...stored, iterations: 500_000 }),
    'and clamped on read, so an over-spec record still verifies');
});

test('the raw password never appears in what is stored', async () => {
  const secret = 'MySuperSecretPassword123';
  const stored = await hashPassword(secret);
  assert.ok(!JSON.stringify(stored).includes(secret));
});

// ═══ Tokens ═══════════════════════════════════════════════════════════════
test('session tokens are long, random and hashed for storage', async () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.equal(a.length, 64, '256 bits of hex');
  assert.notEqual(a, b);

  const h = await hashToken(a);
  assert.equal(h.length, 64);
  assert.notEqual(h, a, 'the stored hash must not equal the token');
  assert.equal(h, await hashToken(a), 'hashing is deterministic');
});

test('ids are unique and prefixed', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId('u')));
  assert.equal(ids.size, 500);
  assert.ok([...ids][0].startsWith('u_'));
});

// ═══ Link tokens and invite codes ═════════════════════════════════════════
test('link tokens are unguessable and stored only as hashes', async () => {
  const a = newLinkToken();
  assert.equal(a.length, 64, '256 bits');
  assert.notEqual(a, newLinkToken());
  const h = await hashToken(a);
  assert.notEqual(h, a, 'the database never holds the raw link token');
});

test('invite codes avoid characters people misread', () => {
  const codes = Array.from({ length: 200 }, () => newInviteCode());
  for (const c of codes) {
    assert.equal(c.length, 8);
    assert.ok(/^[A-HJ-NP-Z2-9]+$/.test(c), `"${c}" contains an ambiguous character`);
    assert.ok(!/[O0I1L]/.test(c), `"${c}" could be misread`);
  }
  assert.ok(new Set(codes).size > 195, 'codes should not collide in practice');
});

// ═══ Email templates ══════════════════════════════════════════════════════
test('every email ships both html and plain text', () => {
  const msgs = [
    verificationEmail('https://x.test/verify.html?token=abc'),
    inviteEmail({ link: 'https://x.test/?invite=ABC', fromName: 'Garv', note: 'come lift' }),
    passwordResetEmail('https://x.test/reset.html?token=abc'),
  ];
  for (const m of msgs) {
    assert.ok(m.subject && m.html && m.text, 'missing a part');
    assert.ok(m.html.includes('<!doctype html>'), 'html should be a full document');
    assert.ok(!m.text.includes('<'), 'the text alternative should not contain markup');
  }
});

test('emails carry their link in both html and text', () => {
  const link = 'https://x.test/verify.html?token=tok123';
  const m = verificationEmail(link);
  assert.ok(m.html.includes(link), 'html has a clickable link');
  assert.ok(m.text.includes(link), 'text has a pasteable link');
});

test('an invite note cannot inject markup into the email', () => {
  const m = inviteEmail({
    link: 'https://x.test/?invite=ABC',
    fromName: '<script>alert(1)</script>',
    note: '<img src=x onerror=alert(1)>',
  });
  // Only the HTML part needs escaping — the text alternative is never parsed
  // as markup, so raw angle brackets there are inert.
  assert.ok(!m.html.includes('<script>'), 'the sender name is escaped in html');
  assert.ok(!m.html.includes('<img src=x'), 'the note is escaped in html');
  assert.ok(m.html.includes('&lt;script&gt;'), 'and rendered as visible text instead');
  assert.ok(m.html.includes('&lt;img'), 'the note too');
});

test('a display name cannot inject email headers', () => {
  // CRLF in a Subject line is header injection: a crafted name could append
  // `Bcc:` and turn invites into a spam relay.
  const m = inviteEmail({
    link: 'https://x.test/?invite=ABC',
    fromName: 'Attacker\r\nBcc: victim@example.com',
    note: null,
  });
  assert.ok(!/[\r\n]/.test(m.subject), 'the subject must be a single line');
  assert.ok(!m.subject.includes('Bcc:') || !/[\r\n]/.test(m.subject));
});

test('a missing display name still produces a sensible subject', () => {
  for (const name of [null, undefined, '', '   ']) {
    const m = inviteEmail({ link: 'https://x.test/?invite=A', fromName: name, note: null });
    assert.ok(m.subject.startsWith('Someone invited'), `got "${m.subject}"`);
  }
});

// ═══ Validation ═══════════════════════════════════════════════════════════
test('accepts real emails, rejects junk', () => {
  assert.equal(validateEmail('garv@example.com'), null);
  assert.ok(validateEmail('not-an-email'));
  assert.ok(validateEmail(''));
  assert.ok(validateEmail(null));
  assert.ok(validateEmail(`${'a'.repeat(250)}@x.com`), 'absurdly long is rejected');
});

test('usernames are constrained to url-safe characters', () => {
  assert.equal(validateUsername('garv_lifts'), null);
  assert.equal(validateUsername('Garv123'), null);
  assert.ok(validateUsername('ab'), 'too short');
  assert.ok(validateUsername('a'.repeat(21)), 'too long');
  assert.ok(validateUsername('garv lifts'), 'no spaces');
  assert.ok(validateUsername('garv@lifts'), 'no symbols');
  assert.ok(validateUsername('../../etc/passwd'), 'no path traversal');
});

test('passwords require length, not symbol soup', () => {
  assert.equal(validatePassword('abcdefgh'), null);
  assert.equal(validatePassword('a whole passphrase here'), null);
  assert.ok(validatePassword('short'));
  assert.ok(validatePassword(''));
  assert.ok(validatePassword('x'.repeat(201)), 'absurdly long is rejected');
});

test('suggested usernames are always valid', () => {
  for (const seed of ['garv@example.com', 'Garv Mandan', '!!!', '', null, 'a']) {
    const u = suggestUsername(seed);
    assert.equal(validateUsername(u), null, `"${seed}" produced invalid username "${u}"`);
  }
});

// ═══ Anti-cheat: session summarizer ═══════════════════════════════════════
// Mirrors summarizeSession in src/index.js. Kept in sync deliberately — this is
// the boundary that stops a tampered client inflating a leaderboard.

function summarizeSession(doc) {
  if (!doc || !Array.isArray(doc.exercises)) return { error: 'A session needs an exercises array.' };
  if (doc.exercises.length > 40) return { error: 'Too many exercises in one session.' };

  let volume = 0, sets = 0, reps = 0;
  const prs = [];

  for (const ex of doc.exercises) {
    if (!ex || typeof ex.exerciseId !== 'string') return { error: 'An exercise is missing its id.' };
    if (!getExercise(ex.exerciseId)) return { error: `Unknown exercise: ${ex.exerciseId}` };
    if (!Array.isArray(ex.sets) || ex.sets.length > 30) return { error: 'Too many sets on one exercise.' };

    let best = { e1: 0, weight: 0, reps: 0 };
    for (const s of ex.sets) {
      if (!s || s.actualReps == null) continue;
      const w = Number(s.actualWeight ?? s.weight ?? 0);
      const r = Number(s.actualReps);
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

const goodSession = () => ({
  id: 's_1',
  name: 'Chest & Back',
  exercises: [
    {
      exerciseId: 'bb-bench',
      name: 'Barbell Bench Press',
      sets: [
        { actualWeight: 185, actualReps: 8, done: true },
        { actualWeight: 185, actualReps: 7, done: true },
      ],
    },
  ],
});

test('summarizes a normal session correctly', () => {
  const r = summarizeSession(goodSession());
  assert.equal(r.error, undefined);
  assert.equal(r.volume, 185 * 8 + 185 * 7);
  assert.equal(r.sets, 2);
  assert.equal(r.reps, 15);
  assert.equal(r.prs[0].exerciseId, 'bb-bench');
  assert.equal(r.prs[0].e1, estimate1RM(185, 8));
});

test('server recomputes volume rather than trusting the client', () => {
  const s = goodSession();
  s.totalVolume = 999_999;          // a tampered client claims a huge number
  const r = summarizeSession(s);
  assert.equal(r.volume, 2775, 'the claimed total is ignored entirely');
});

test('rejects a fabricated exercise id', () => {
  const s = goodSession();
  s.exercises[0].exerciseId = 'super-mega-lift';
  assert.match(summarizeSession(s).error, /Unknown exercise/);
});

test('rejects impossible weights', () => {
  for (const w of [99999, -50, Infinity, NaN]) {
    const s = goodSession();
    s.exercises[0].sets[0].actualWeight = w;
    assert.ok(summarizeSession(s).error, `weight ${w} should be rejected`);
  }
});

test('rejects impossible rep counts', () => {
  for (const r of [10000, -5, 1.5, Infinity]) {
    const s = goodSession();
    s.exercises[0].sets[0].actualReps = r;
    assert.ok(summarizeSession(s).error, `reps ${r} should be rejected`);
  }
});

test('rejects absurd set and exercise counts', () => {
  const many = goodSession();
  many.exercises[0].sets = Array.from({ length: 31 }, () => ({ actualWeight: 100, actualReps: 5 }));
  assert.match(summarizeSession(many).error, /Too many sets/);

  const manyEx = { exercises: Array.from({ length: 41 }, () => ({ exerciseId: 'bb-bench', sets: [] })) };
  assert.match(summarizeSession(manyEx).error, /Too many exercises/);
});

test('rejects malformed payloads without throwing', () => {
  for (const bad of [null, {}, { exercises: 'nope' }, { exercises: [null] }, { exercises: [{}] }]) {
    const r = summarizeSession(bad);
    assert.ok(r.error, `${JSON.stringify(bad)} should produce an error, not a crash`);
  }
});

test('rejects a session with nothing actually logged', () => {
  const s = goodSession();
  s.exercises[0].sets = [{ actualReps: null }, { actualReps: null }];
  assert.match(summarizeSession(s).error, /no logged sets/);
});

test('unlogged sets are skipped, not counted as zeros', () => {
  const s = goodSession();
  s.exercises[0].sets.push({ actualWeight: 185, actualReps: null });
  const r = summarizeSession(s);
  assert.equal(r.sets, 2, 'the unlogged set is ignored');
});

test('a bodyweight set counts reps but adds no volume', () => {
  const s = {
    exercises: [{ exerciseId: 'pullup', sets: [{ actualWeight: 0, actualReps: 10 }] }],
  };
  const r = summarizeSession(s);
  assert.equal(r.volume, 0);
  assert.equal(r.reps, 10);
  assert.equal(r.sets, 1);
});

test('PRs take the best set, not the last', () => {
  const s = {
    exercises: [{
      exerciseId: 'squat',
      sets: [
        { actualWeight: 315, actualReps: 3 },
        { actualWeight: 225, actualReps: 5 },
      ],
    }],
  };
  const r = summarizeSession(s);
  assert.equal(r.prs[0].weight, 315, 'the heavy triple outranks the lighter set');
});

test('every exercise in the catalog passes validation', () => {
  const { EXERCISES } = exercisesModule;
  for (const e of EXERCISES.slice(0, 30)) {
    const r = summarizeSession({
      exercises: [{ exerciseId: e.id, sets: [{ actualWeight: 50, actualReps: 8 }] }],
    });
    assert.equal(r.error, undefined, `${e.id} was rejected`);
  }
});

let exercisesModule;

(async () => {
  exercisesModule = await import('../../core/exercises.js');
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

// Tests for the progression engine, plate math, catalog search and the store.
// Run: node core/progression.test.js
// No framework — plain assertions so this runs anywhere Node does.

import assert from 'node:assert/strict';
import {
  adjustNextSet, progressExercise, seedStartingWeight, roundToIncrement,
  estimate1RM, updateStrength, weightForReps,
} from './progression.js';
import {
  planFromPreset, blankPlan, newCustomDay, buildWorkout, schedule,
  occurrenceIndex, migratePlan, listPresets, getDay, DAYS,
} from './splits.js';
import { createStore, createMemoryAdapter, weekStart, prescribe, migrate } from './store.js';
import { getExercise, EXERCISES, searchExercises, groupByMuscle, exercisesFor } from './exercises.js';
import { platesFor, loadingHint, nearestLoadable, DEFAULT_INVENTORY, PRESET_INVENTORIES } from './plates.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ═══ roundToIncrement / estimate1RM ═══════════════════════════════════════
test('rounds to the nearest loadable increment', () => {
  assert.equal(roundToIncrement(137, 5), 135);
  assert.equal(roundToIncrement(138, 5), 140);
  assert.equal(roundToIncrement(21, 2.5), 20);
  assert.equal(roundToIncrement(-10, 5), 0, 'never goes negative');
  assert.equal(roundToIncrement(17.4, 0), 17, 'zero increment falls back to whole numbers');
});

test('estimates 1RM and caps the rep inflation', () => {
  assert.equal(estimate1RM(100, 1), 103);
  assert.equal(estimate1RM(200, 5), 233);
  assert.equal(estimate1RM(100, 0), 0);
  assert.equal(estimate1RM(0, 5), 0);
  assert.equal(estimate1RM(100, 30), estimate1RM(100, 12), 'reps cap at 12');
});

// ═══ adjustNextSet: within a workout ══════════════════════════════════════
test('holds weight when the set hits its target', () => {
  const a = adjustNextSet({ exerciseId: 'bb-bench', targetReps: 6, actualReps: 6, weight: 185, setsRemaining: 2 });
  assert.equal(a.weight, 185);
  assert.equal(a.targetReps, 6);
});

test('adds weight mid-workout when reps blow past the range', () => {
  const a = adjustNextSet({ exerciseId: 'bb-bench', targetReps: 6, actualReps: 10, weight: 185, setsRemaining: 2 });
  assert.equal(a.weight, 190);
});

test('cuts weight when a set falls well short of the range', () => {
  const a = adjustNextSet({ exerciseId: 'bb-bench', targetReps: 6, actualReps: 3, weight: 185, setsRemaining: 2 });
  assert.ok(a.weight < 185, 'weight should drop');
  assert.equal(a.weight % 5, 0, 'stays loadable');
});

test('a small miss holds weight and lowers the rep target', () => {
  const a = adjustNextSet({ exerciseId: 'db-bench', targetReps: 10, actualReps: 8, weight: 70, setsRemaining: 1 });
  assert.equal(a.weight, 70);
  assert.equal(a.targetReps, 8);
});

test('returns null when no sets remain', () => {
  assert.equal(adjustNextSet({ exerciseId: 'bb-bench', targetReps: 6, actualReps: 6, weight: 185, setsRemaining: 0 }), null);
});

test('never prescribes a weight below one increment after a cut', () => {
  const a = adjustNextSet({ exerciseId: 'lateral-raise', targetReps: 12, actualReps: 2, weight: 5, setsRemaining: 2 });
  assert.ok(a.weight >= 2.5, `expected >= 2.5, got ${a.weight}`);
});

// ═══ progressExercise: between workouts ═══════════════════════════════════
test('adds weight when every set hits the top of the range', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 185, targetReps: 8, actualReps: 9 },
    ],
  });
  assert.equal(r.verdict, 'increase');
  assert.equal(r.weight, 190);
  assert.equal(r.targetReps, 5, 'resets to the bottom of the range');
});

test('holds weight and chases one more rep when inside the range', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [
      { weight: 185, targetReps: 6, actualReps: 6 },
      { weight: 185, targetReps: 6, actualReps: 6 },
      { weight: 185, targetReps: 6, actualReps: 5 },
    ],
  });
  assert.equal(r.verdict, 'hold');
  assert.equal(r.targetReps, 7);
});

test('rep target never exceeds the top of the range', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 185, targetReps: 8, actualReps: 7 },
    ],
  });
  assert.ok(r.targetReps <= 8);
});

test('first miss retries the same weight rather than deloading', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [{ weight: 185, targetReps: 6, actualReps: 4 }, { weight: 185, targetReps: 6, actualReps: 3 }],
    stallCount: 0,
  });
  assert.equal(r.verdict, 'retry');
  assert.equal(r.stallCount, 1);
});

test('deloads 10% after the second consecutive miss', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [{ weight: 185, targetReps: 5, actualReps: 4 }, { weight: 185, targetReps: 5, actualReps: 3 }],
    stallCount: 1,
  });
  assert.equal(r.verdict, 'deload');
  assert.equal(r.weight, 165);
  assert.equal(r.stallCount, 0);
});

test('judges progression at the top weight, ignoring back-off sets', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 165, targetReps: 8, actualReps: 4 },
    ],
  });
  assert.equal(r.verdict, 'increase');
});

test('bodyweight moves with no increment progress by reps', () => {
  const r = progressExercise({
    exerciseId: 'pushup',
    sets: [{ weight: 0, targetReps: 25, actualReps: 25 }, { weight: 0, targetReps: 25, actualReps: 26 }],
  });
  assert.equal(r.verdict, 'increase');
  assert.equal(r.weight, 0);
  assert.equal(r.targetReps, 27);
});

test('ignores sets that were never logged', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 185, targetReps: 8, actualReps: 8 },
      { weight: 185, targetReps: 8, actualReps: null },
    ],
  });
  assert.equal(r.verdict, 'increase');
  assert.equal(r.sets, 2);
});

// ═══ Learning: the adaptive layer ═════════════════════════════════════════
test('the first session sets the baseline estimate outright', () => {
  const r = updateStrength({
    currentE1RM: 0,
    sets: [{ weight: 185, actualReps: 5 }],
  });
  assert.equal(r.e1rm, estimate1RM(185, 5), 'no history means the observation IS the estimate');
  assert.ok(r.confidence > 0);
});

test('a stronger performance raises the estimate', () => {
  const before = 200;
  const r = updateStrength({
    currentE1RM: before,
    sets: [{ weight: 225, actualReps: 5 }],   // implies ~262
    confidence: 0.5,
  });
  assert.ok(r.e1rm > before, 'estimate moved up');
  assert.ok(r.e1rm < 262, 'but not all the way in one session — one set is not proof');
});

test('a weaker performance lowers the estimate, more cautiously', () => {
  const up = updateStrength({ currentE1RM: 200, sets: [{ weight: 225, actualReps: 5 }], confidence: 0.5 });
  const down = updateStrength({ currentE1RM: 262, sets: [{ weight: 185, actualReps: 5 }], confidence: 0.5 });
  const upMove = Math.abs(up.e1rm - 200) / Math.abs(estimate1RM(225, 5) - 200);
  const downMove = Math.abs(down.e1rm - 262) / Math.abs(estimate1RM(185, 5) - 262);
  assert.ok(downMove < upMove, 'a bad day should move the estimate less than a good one');
});

test('heavy sets are stronger evidence than light ones', () => {
  const heavy = updateStrength({ currentE1RM: 200, sets: [{ weight: 240, actualReps: 3 }], confidence: 0.5 });
  const light = updateStrength({ currentE1RM: 200, sets: [{ weight: 120, actualReps: 20 }], confidence: 0.5 });
  const heavyClaim = estimate1RM(240, 3);
  const lightClaim = estimate1RM(120, 20);
  // Compare how far each moved toward its own claim.
  const heavyFrac = (heavy.e1rm - 200) / (heavyClaim - 200);
  const lightFrac = (light.e1rm - 200) / (lightClaim - 200);
  assert.ok(heavyFrac > lightFrac, 'a heavy triple should shift belief more than a light set of 20');
});

test('sets with no reps teach nothing', () => {
  const r = updateStrength({ currentE1RM: 200, sets: [{ weight: 225, actualReps: 0 }], confidence: 0.5 });
  assert.equal(r.e1rm, 200, 'a failed set leaves the estimate alone');
});

test('the estimate survives an empty session', () => {
  const r = updateStrength({ currentE1RM: 200, sets: [], confidence: 0.4 });
  assert.equal(r.e1rm, 200);
  assert.equal(r.confidence, 0.4);
});

test('a badly-too-light weight is corrected in one jump, not ten', () => {
  // Someone doing 15 reps at a weight prescribed for 5 is far under-loaded.
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [
      { weight: 95, targetReps: 5, actualReps: 15 },
      { weight: 95, targetReps: 5, actualReps: 14 },
    ],
    e1rm: 0, confidence: 0,
  });
  assert.equal(r.verdict, 'increase');
  // Targets the top of the 5-8 range, so roughly 105-115 — a real correction
  // rather than the single 5 lb increment plain double progression would give.
  assert.ok(r.weight >= 105, `expected a real jump, got ${r.weight} from 95`);
  assert.ok(r.weight && r.weight - 95 >= 10, 'jump should beat one increment');
});

test('a settled estimate is not moved by one wild session', () => {
  // Confidence high: the engine should be sceptical of a sudden huge claim.
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [{ weight: 185, targetReps: 8, actualReps: 20 }],
    e1rm: 240, confidence: 1,
  });
  assert.ok(r.weight <= 185 * 1.06, `jump of ${r.weight - 185} lb is too large for a settled lifter`);
});

test('progression carries the learned estimate forward', () => {
  const r = progressExercise({
    exerciseId: 'bb-bench',
    sets: [{ weight: 185, targetReps: 5, actualReps: 6 }],
    e1rm: 210, confidence: 0.6,
  });
  assert.ok(typeof r.e1rm === 'number' && r.e1rm > 0, 'e1rm is returned for the next session');
  assert.ok(r.confidence >= 0.6, 'confidence accumulates');
});

test('weightForReps and estimate1RM are consistent', () => {
  for (const reps of [1, 3, 5, 8, 10, 12]) {
    const w = weightForReps(300, reps);
    assert.ok(Math.abs(estimate1RM(Math.round(w), reps) - 300) <= 3,
      `round trip at ${reps} reps drifted too far`);
  }
});

test('detraining is detected and the weight comes down', () => {
  // Two sessions well short of the range.
  let state = { e1rm: 250, confidence: 1, stallCount: 0 };
  for (let i = 0; i < 2; i++) {
    const r = progressExercise({
      exerciseId: 'bb-bench',
      sets: [{ weight: 205, targetReps: 5, actualReps: 2 }],
      stallCount: state.stallCount, e1rm: state.e1rm, confidence: state.confidence,
    });
    state = { e1rm: r.e1rm, confidence: r.confidence, stallCount: r.stallCount, weight: r.weight, verdict: r.verdict };
  }
  assert.equal(state.verdict, 'deload');
  assert.ok(state.weight < 205, 'weight reduced');
  assert.ok(state.e1rm < 250, 'and the estimate came down too');
});

// ═══ seedStartingWeight ═══════════════════════════════════════════════════
test('seeds a loadable, non-negative starting weight', () => {
  const s = seedStartingWeight({ exerciseId: 'squat', bodyweight: 180, experience: 'beginner' });
  assert.ok(s.weight > 0);
  assert.equal(s.weight % 10, 0);
  assert.equal(s.targetReps, 5);
});

test('experience level scales the seed upward', () => {
  const b = seedStartingWeight({ exerciseId: 'bb-bench', bodyweight: 180, experience: 'beginner' });
  const a = seedStartingWeight({ exerciseId: 'bb-bench', bodyweight: 180, experience: 'advanced' });
  assert.ok(a.weight > b.weight);
});

test('bodyweight exercises seed at zero added load', () => {
  assert.equal(seedStartingWeight({ exerciseId: 'pullup', bodyweight: 180 }).weight, 0);
});

test('every exercise in the library seeds to a finite weight', () => {
  for (const e of EXERCISES) {
    const s = seedStartingWeight({ exerciseId: e.id, bodyweight: 180, experience: 'intermediate' });
    assert.ok(Number.isFinite(s.weight) && s.weight >= 0, `${e.id} seeded ${s.weight}`);
    assert.ok(s.sets >= 1, `${e.id} seeded ${s.sets} sets`);
  }
});

// ═══ Plate math ═══════════════════════════════════════════════════════════
test('breaks 225 into 45+45 per side on a 45 lb bar', () => {
  const r = platesFor(225);
  assert.deepEqual(r.perSide, [[45, 2]]);
  assert.equal(r.achieved, 225);
  assert.equal(r.short, 0);
});

test('breaks 135 into a single 45 per side', () => {
  assert.deepEqual(platesFor(135).perSide, [[45, 1]]);
});

test('an empty bar reports no plates', () => {
  const r = platesFor(45);
  assert.equal(r.barOnly, true);
  assert.deepEqual(r.perSide, []);
});

test('a target under the bar has no breakdown', () => {
  assert.equal(platesFor(30), null);
});

test('mixes plate sizes greedily', () => {
  // 185 = 45 bar + 70/side = 45 + 25
  assert.deepEqual(platesFor(185).perSide, [[45, 1], [25, 1]]);
});

test('handles the 2.5 lb odd jump without float drift', () => {
  const r = platesFor(140); // 47.5 per side = 45 + 2.5
  assert.deepEqual(r.perSide, [[45, 1], [2.5, 1]]);
  assert.equal(r.short, 0, 'floating point must not leave a phantom remainder');
});

test('reports what it is short when plates run out', () => {
  const tiny = { unit: 'lb', barWeight: 45, plates: [[45, 1]] };
  const r = platesFor(500, tiny);
  assert.ok(r.short > 0, 'should admit it cannot make the weight');
  assert.equal(r.achieved, 135, '45 bar + one 45 per side is all it can do');
});

test('respects how many pairs you actually own', () => {
  // Home set owns 2 pairs of 45s. 405 wants 4 per side, so it must cap at 2
  // and make up what it can from the smaller plates.
  const r = platesFor(405, PRESET_INVENTORIES.home);
  const fortyFives = r.perSide.find(([p]) => p === 45);
  assert.equal(fortyFives[1], 2, 'cannot use more 45s than it owns');
  assert.ok(r.short > 0, 'and should admit it came up short');
  assert.ok(r.achieved < 405);
});

test('plate-loaded machines have no bar weight', () => {
  const h = loadingHint(90, 'plate');
  assert.equal(h.kind, 'plates');
  assert.deepEqual(h.perSide, [[45, 1]], '90 on a leg press is one 45 per side');
});

test('dumbbell hints say per hand, not per side', () => {
  const h = loadingHint(70, 'pair');
  assert.equal(h.kind, 'pair');
  assert.match(h.text, /each hand/);
  assert.equal(h.perSide, null, 'no plate breakdown for dumbbells');
});

test('cable and machine stacks get a pin cue, not plates', () => {
  const h = loadingHint(120, 'stack');
  assert.equal(h.kind, 'stack');
  assert.match(h.text, /pin/);
  assert.equal(h.perSide, null);
});

test('bodyweight hints distinguish added load from plain bodyweight', () => {
  assert.match(loadingHint(0, 'body').text, /bodyweight/);
  assert.match(loadingHint(25, 'body').text, /\+25/);
});

test('a barbell target under the bar explains itself', () => {
  const h = loadingHint(30, 'barbell');
  assert.equal(h.kind, 'under-bar');
  assert.match(h.text, /bar/);
});

test('kg inventory reports kg', () => {
  const h = loadingHint(100, 'barbell', PRESET_INVENTORIES.kg);
  assert.equal(h.unit, 'kg');
  assert.deepEqual(h.perSide, [[25, 1], [15, 1]], '100 = 20 bar + 40/side');
});

test('nearestLoadable only adjusts plate-loaded lifts', () => {
  assert.equal(nearestLoadable(137, 'stack'), 137, 'a stack is whatever the pin says');
  assert.equal(nearestLoadable(225, 'barbell'), 225);
});

// ═══ Catalog + search ═════════════════════════════════════════════════════
test('the catalog is large and internally consistent', () => {
  assert.ok(EXERCISES.length >= 120, `expected a vast catalog, got ${EXERCISES.length}`);
  const ids = new Set();
  for (const e of EXERCISES) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.name && e.muscles.length > 0, `${e.id} incomplete`);
    assert.equal(getExercise(e.id).id, e.id);
    assert.ok(e.repRange[0] < e.repRange[1], `${e.id} rep range inverted`);
    assert.ok(e.increment >= 0, `${e.id} negative increment`);
    assert.ok(['primary', 'secondary', 'isolation'].includes(e.tier), `${e.id} bad tier`);
    assert.ok(['barbell', 'pair', 'single', 'stack', 'plate', 'body'].includes(e.loading), `${e.id} bad loading "${e.loading}"`);
  }
});

test('search finds an exercise by its exact name', () => {
  const r = searchExercises('Barbell Bench Press');
  assert.equal(r[0].id, 'bb-bench');
});

test('search finds lifts by gym slang', () => {
  assert.equal(searchExercises('rdl')[0].id, 'rdl');
  assert.equal(searchExercises('bss')[0].id, 'bulgarian-split');
  assert.ok(searchExercises('pushdown').some((e) => e.muscles.includes('triceps')));
});

test('multi-word search narrows rather than widens', () => {
  const r = searchExercises('incline dumbbell');
  assert.ok(r.length > 0);
  for (const e of r) {
    const hay = `${e.name} ${e.aliases.join(' ')}`.toLowerCase();
    assert.ok(hay.includes('incline') && (hay.includes('dumbbell') || hay.includes('db')), `${e.name} matched too loosely`);
  }
});

test('search ranks a name match above an incidental one', () => {
  const r = searchExercises('curl');
  assert.ok(r[0].name.toLowerCase().includes('curl'));
});

test('search respects the equipment filter', () => {
  const r = searchExercises('press', { equipment: ['dumbbell'] });
  assert.ok(r.length > 0);
  for (const e of r) assert.equal(e.equipment, 'dumbbell');
});

test('search respects the muscle filter', () => {
  const r = searchExercises('', { muscles: ['biceps'] });
  assert.ok(r.length >= 8, 'plenty of bicep options');
  for (const e of r) assert.ok(e.muscles.includes('biceps'));
});

test('an empty query browses the whole filtered pool', () => {
  assert.ok(searchExercises('', { limit: 500 }).length === EXERCISES.length);
});

test('a nonsense query returns nothing rather than everything', () => {
  assert.equal(searchExercises('zzzzqqq').length, 0);
});

test('groupByMuscle returns sections in display order, no empties', () => {
  const groups = groupByMuscle(EXERCISES);
  assert.ok(groups.length >= 10);
  for (const g of groups) assert.ok(g.exercises.length > 0, `${g.muscle} section is empty`);
  const chestIdx = groups.findIndex((g) => g.muscle === 'chest');
  const coreIdx = groups.findIndex((g) => g.muscle === 'core');
  assert.ok(chestIdx < coreIdx, 'chest should sort before core');
});

test('every muscle group has enough exercises to fill a session', () => {
  for (const m of ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']) {
    assert.ok(exercisesFor({ muscles: [m] }).length >= 4, `${m} is thin`);
  }
});

// ═══ Plans: presets, custom days, weekday assignment ══════════════════════
const ALL_EQUIP = ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight', 'band', 'kettlebell'];

test('a preset maps six days onto a three-day rotation, twice each', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun']);
  const sched = schedule(plan);
  assert.equal(sched.length, 6);
  assert.deepEqual(sched.map((s) => s.day), ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(sched.map((s) => s.name),
    ['Chest & Back', 'Shoulders & Arms', 'Legs', 'Chest & Back', 'Shoulders & Arms', 'Legs']);
});

test('rest days are simply unassigned weekdays', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon', 'Wed', 'Fri']);
  assert.equal(plan.week.Tue, null);
  assert.equal(schedule(plan).length, 3);
});

test('occurrenceIndex distinguishes the first and second pass of a workout', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun']);
  assert.equal(occurrenceIndex(plan, 'Mon'), 0);
  assert.equal(occurrenceIndex(plan, 'Fri'), 1);
});

test('any workout can be moved to any weekday', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon', 'Tue', 'Wed']);
  const legsId = plan.days.find((d) => d.name === 'Legs').id;
  plan.week.Sun = legsId;           // legs now runs Wed AND Sun
  const sched = schedule(plan);
  assert.equal(sched.length, 4);
  assert.equal(sched[sched.length - 1].name, 'Legs');
  assert.equal(occurrenceIndex(plan, 'Sun'), 1, 'second legs day of the week');
});

test('every preset builds a full session on each of its days', () => {
  for (const p of listPresets()) {
    const plan = planFromPreset(p.id, p.defaultDays);
    for (const day of plan.days) {
      const w = buildWorkout({ plan, dayId: day.id, equipment: ALL_EQUIP });
      assert.ok(w.exercises.length >= 4, `${p.id}/${day.name} built only ${w.exercises.length}`);
    }
  }
});

test('an auto-filled day picks no duplicates', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon']);
  const w = buildWorkout({ plan, dayId: plan.week.Mon, equipment: ALL_EQUIP });
  const ids = w.exercises.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('rotation varies accessories but keeps the primary compounds', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun']);
  const dayId = plan.week.Mon;
  const a = buildWorkout({ plan, dayId, equipment: ALL_EQUIP, rotation: 0 });
  const b = buildWorkout({ plan, dayId, equipment: ALL_EQUIP, rotation: 1 });
  assert.deepEqual(
    a.exercises.filter((e) => e.tier === 'primary').map((e) => e.id),
    b.exercises.filter((e) => e.tier === 'primary').map((e) => e.id),
    'primaries must stay fixed to progress on'
  );
  assert.notDeepEqual(a.exercises.map((e) => e.id), b.exercises.map((e) => e.id));
});

test('auto-fill respects the equipment you have', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon']);
  const w = buildWorkout({ plan, dayId: plan.week.Mon, equipment: ['dumbbell', 'bodyweight'] });
  assert.ok(w.exercises.length > 0);
  for (const e of w.exercises) assert.ok(['dumbbell', 'bodyweight'].includes(e.equipment));
});

test('favorites win their slot', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon']);
  const w = buildWorkout({ plan, dayId: plan.week.Mon, equipment: ALL_EQUIP, favorites: ['db-bench'] });
  const chestPrimary = w.exercises.find((e) => e.tier === 'primary' && e.muscles.includes('chest'));
  assert.equal(chestPrimary.id, 'db-bench');
});

test('a pinned day returns exactly the exercises you chose, in order', () => {
  const plan = blankPlan();
  const day = newCustomDay('My Day', ['chest']);
  day.exercises = [
    { exerciseId: 'bb-bench', sets: 5 },
    { exerciseId: 'cable-fly', sets: 3 },
    { exerciseId: 'pullup', sets: 4 },
  ];
  plan.days.push(day);
  plan.week.Mon = day.id;
  const w = buildWorkout({ plan, dayId: day.id, equipment: ALL_EQUIP });
  assert.deepEqual(w.exercises.map((e) => e.id), ['bb-bench', 'cable-fly', 'pullup']);
  assert.equal(w.exercises[0].sets, 5, 'per-exercise set counts survive');
});

test('a pinned day ignores rotation — it is exactly what you set', () => {
  const plan = blankPlan();
  const day = newCustomDay('Fixed', []);
  day.exercises = [{ exerciseId: 'squat', sets: 4 }];
  plan.days.push(day);
  plan.week.Mon = day.id;
  const a = buildWorkout({ plan, dayId: day.id, equipment: ALL_EQUIP, rotation: 0 });
  const b = buildWorkout({ plan, dayId: day.id, equipment: ALL_EQUIP, rotation: 1 });
  assert.deepEqual(a.exercises.map((e) => e.id), b.exercises.map((e) => e.id));
});

test('a pinned day drops exercises that no longer exist', () => {
  const plan = blankPlan();
  const day = newCustomDay('Stale', []);
  day.exercises = [{ exerciseId: 'bb-bench', sets: 3 }, { exerciseId: 'deleted-lift', sets: 3 }];
  plan.days.push(day);
  const w = buildWorkout({ plan, dayId: day.id, equipment: ALL_EQUIP });
  assert.deepEqual(w.exercises.map((e) => e.id), ['bb-bench']);
});

test('an empty custom day builds nothing rather than throwing', () => {
  const plan = blankPlan();
  const day = newCustomDay('Empty', []);
  plan.days.push(day);
  const w = buildWorkout({ plan, dayId: day.id, equipment: ALL_EQUIP });
  assert.deepEqual(w.exercises, []);
});

// ═══ Migration ════════════════════════════════════════════════════════════
test('a v1 plan migrates to the v2 shape and keeps its week', () => {
  const v1 = { splitId: 'ppl-arnold', trainingDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'], schedule: [] };
  const v2 = migratePlan(v1);
  assert.ok(v2.days && v2.week, 'has the new shape');
  assert.equal(schedule(v2).length, 6);
  assert.equal(v2.week.Thu, null, 'Thursday stays a rest day');
});

test('migrate upgrades a whole v1 state without losing history', () => {
  const v1 = {
    schemaVersion: 1,
    profile: { bodyweight: 180, experience: 'intermediate', equipment: ['barbell'], favorites: [] },
    plan: { splitId: 'upper-lower', trainingDays: ['Mon', 'Thu'] },
    exerciseState: { 'bb-bench': { weight: 185, targetReps: 5, sets: 3, best1RM: 215 } },
    sessions: [{ id: 's1', date: '2026-09-01', day: 'Mon', templateId: 'upper', name: 'Upper', exercises: [] }],
    bodyweightLog: [{ date: '2026-09-01', weight: 180 }],
  };
  const next = migrate(v1);
  assert.equal(next.schemaVersion, 2);
  assert.ok(next.plan.days && next.plan.week);
  assert.equal(next.exerciseState['bb-bench'].weight, 185, 'progress is preserved');
  assert.equal(next.sessions.length, 1);
  assert.equal(next.sessions[0].dayId, 'upper', 'old templateId becomes dayId');
  assert.ok(next.inventory, 'gains a default plate inventory');
});

test('migrate on empty input yields a clean state', () => {
  const s = migrate(null);
  assert.equal(s.profile, null);
  assert.equal(s.schemaVersion, 2);
});

test('a v2 plan passes through migration untouched', () => {
  const plan = planFromPreset('ppl-arnold', ['Mon']);
  assert.equal(migratePlan(plan), plan);
});

// ═══ Store: the full loop ═════════════════════════════════════════════════
const PROFILE = {
  name: 'Test', heightIn: 70, bodyweight: 180, experience: 'intermediate',
  equipment: ALL_EQUIP, favorites: [], goal: 'muscle',
};

async function freshStore() {
  const store = createStore(createMemoryAdapter());
  await store.load();
  await store.completeSetup(PROFILE, { presetId: 'ppl-arnold', trainingDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'] });
  return store;
}

test('setup produces a prescribable first session with loading hints', async () => {
  const store = await freshStore();
  const p = store.prescribeFor('Mon');
  assert.equal(p.name, 'Chest & Back');
  assert.ok(p.exercises.length >= 5);
  for (const e of p.exercises) {
    assert.ok(e.isNew);
    assert.ok(Number.isFinite(e.weight), `${e.name} non-numeric weight`);
    assert.ok(e.hint && e.hint.text, `${e.name} has no loading hint`);
  }
});

test('a barbell prescription carries a real plate breakdown', async () => {
  const store = await freshStore();
  const plan = store.getState().plan;
  const day = plan.days.find((d) => d.name === 'Chest & Back');
  await store.setDayExercises(day.id, [{ exerciseId: 'bb-bench', sets: 3 }]);
  const p = store.prescribeFor('Mon');
  const bench = p.exercises[0];
  assert.equal(bench.exerciseId, 'bb-bench');
  if (bench.weight > 45) {
    assert.equal(bench.hint.kind, 'plates');
    assert.ok(Array.isArray(bench.hint.perSide) && bench.hint.perSide.length > 0);
  }
});

test('logging a set adjusts the remaining sets in the same workout', async () => {
  const store = await freshStore();
  const session = await store.startSession('Mon');
  const ex = session.exercises[0];
  const w = ex.sets[0].weight;
  await store.logSet(0, 0, ex.repRange[1] + 3, w);
  const after = store.getState().activeSession.exercises[0];
  assert.ok(after.sets[1].weight > w);
});

test('a short set drops the weight for the remaining sets only', async () => {
  const store = await freshStore();
  const session = await store.startSession('Mon');
  const ex = session.exercises[0];
  const w = ex.sets[0].weight;
  await store.logSet(0, 0, Math.max(0, ex.repRange[0] - 3), w);
  const after = store.getState().activeSession.exercises[0];
  assert.equal(after.sets[0].actualWeight, w);
  assert.ok(after.sets[1].weight < w);
});

test('finishing a session rolls each exercise forward for next time', async () => {
  const store = await freshStore();
  const session = await store.startSession('Mon');
  const ex = session.exercises[0];
  const w = ex.sets[0].weight;
  for (let i = 0; i < ex.sets.length; i++) await store.logSet(0, i, ex.repRange[1], w);
  await store.finishSession();

  const next = store.getState().exerciseState[ex.exerciseId];
  assert.equal(next.verdict, 'increase');
  assert.ok(next.weight > w);
  const p = store.prescribeFor('Mon');
  assert.equal(p.exercises.find((e) => e.exerciseId === ex.exerciseId).weight, next.weight);
});

test('two consecutive bad sessions trigger a deload', async () => {
  const store = await freshStore();
  let seen = false;
  for (let round = 0; round < 2; round++) {
    const session = await store.startSession('Mon');
    const id = session.exercises[0].exerciseId;
    for (let i = 0; i < session.exercises[0].sets.length; i++) {
      await store.logSet(0, i, 1, store.getState().activeSession.exercises[0].sets[i].weight);
    }
    await store.finishSession();
    if (store.getState().exerciseState[id].verdict === 'deload') seen = true;
  }
  assert.ok(seen);
});

// ═══ Store: plan editing ══════════════════════════════════════════════════
test('a weekday can be reassigned to any workout', async () => {
  const store = await freshStore();
  const plan = store.getState().plan;
  const legs = plan.days.find((d) => d.name === 'Legs');
  await store.assignDay('Mon', legs.id);
  assert.equal(store.prescribeFor('Mon').name, 'Legs');
});

test('a weekday can be cleared to a rest day', async () => {
  const store = await freshStore();
  await store.assignDay('Mon', null);
  assert.equal(store.prescribeFor('Mon'), null);
});

test('adding a custom workout and scheduling it works end to end', async () => {
  const store = await freshStore();
  const day = await store.addDay('Grip & Core', ['core', 'forearms']);
  await store.addExerciseToDay(day.id, 'farmers-walk');
  await store.addExerciseToDay(day.id, 'hanging-leg-raise');
  await store.assignDay('Thu', day.id);

  const p = store.prescribeFor('Thu');
  assert.equal(p.name, 'Grip & Core');
  assert.deepEqual(p.exercises.map((e) => e.exerciseId), ['farmers-walk', 'hanging-leg-raise']);
});

test('editing an auto day pins its current picks instead of losing them', async () => {
  const store = await freshStore();
  const plan = store.getState().plan;
  const day = plan.days.find((d) => d.name === 'Legs');
  const before = store.prescribeFor('Wed').exercises.map((e) => e.exerciseId);

  await store.addExerciseToDay(day.id, 'hip-thrust');
  const after = store.prescribeFor('Wed').exercises.map((e) => e.exerciseId);

  assert.deepEqual(after.slice(0, before.length), before, 'the original picks survive');
  assert.ok(after.includes('hip-thrust'));
});

test('an exercise can be removed from a day', async () => {
  const store = await freshStore();
  const day = store.getState().plan.days.find((d) => d.name === 'Legs');
  await store.pinDay(day.id);
  const first = getDay(store.getState().plan, day.id).exercises[0].exerciseId;
  await store.removeExerciseFromDay(day.id, first);
  assert.ok(!store.prescribeFor('Wed').exercises.some((e) => e.exerciseId === first));
});

test('the same exercise cannot be added to a day twice', async () => {
  const store = await freshStore();
  const day = await store.addDay('Test', []);
  await store.addExerciseToDay(day.id, 'squat');
  await store.addExerciseToDay(day.id, 'squat');
  assert.equal(getDay(store.getState().plan, day.id).exercises.length, 1);
});

test('per-exercise set counts are editable and reach the session', async () => {
  const store = await freshStore();
  const day = await store.addDay('Test', []);
  await store.addExerciseToDay(day.id, 'squat', 3);
  await store.setExerciseSets(day.id, 'squat', 6);
  await store.assignDay('Thu', day.id);

  assert.equal(store.prescribeFor('Thu').exercises[0].sets, 6);
  const session = await store.startSession('Thu');
  assert.equal(session.exercises[0].sets.length, 6, 'the live session honors it');
});

test('exercises can be reordered within a day', async () => {
  const store = await freshStore();
  const day = await store.addDay('Test', []);
  await store.addExerciseToDay(day.id, 'squat');
  await store.addExerciseToDay(day.id, 'rdl');
  await store.moveExerciseInDay(day.id, 'rdl', -1);
  assert.deepEqual(getDay(store.getState().plan, day.id).exercises.map((x) => x.exerciseId), ['rdl', 'squat']);
});

test('reordering past either end is a no-op, not a crash', async () => {
  const store = await freshStore();
  const day = await store.addDay('Test', []);
  await store.addExerciseToDay(day.id, 'squat');
  await store.moveExerciseInDay(day.id, 'squat', -1);
  await store.moveExerciseInDay(day.id, 'squat', 1);
  assert.equal(getDay(store.getState().plan, day.id).exercises.length, 1);
});

test('unpinning hands a day back to the generator', async () => {
  const store = await freshStore();
  const day = store.getState().plan.days.find((d) => d.name === 'Legs');
  await store.pinDay(day.id);
  assert.ok(Array.isArray(getDay(store.getState().plan, day.id).exercises));
  await store.unpinDay(day.id);
  assert.equal(getDay(store.getState().plan, day.id).exercises, null);
  assert.ok(store.prescribeFor('Wed').exercises.length >= 4, 'auto-fill resumes');
});

test('renaming and duplicating a workout', async () => {
  const store = await freshStore();
  const day = store.getState().plan.days.find((d) => d.name === 'Legs');
  await store.renameDay(day.id, 'Quad Day');
  assert.equal(store.prescribeFor('Wed').name, 'Quad Day');

  const copy = await store.duplicateDay(day.id);
  assert.match(copy.name, /copy/);
  assert.notEqual(copy.id, day.id);
  assert.equal(store.getState().plan.days.length, 4);
});

test('deleting a workout also clears the weekdays it ran on', async () => {
  const store = await freshStore();
  const day = store.getState().plan.days.find((d) => d.name === 'Legs');
  await store.removeDay(day.id);
  assert.equal(store.prescribeFor('Wed'), null);
  assert.equal(store.prescribeFor('Sun'), null, 'both of its weekdays are freed');
  assert.ok(store.prescribeFor('Mon'), 'other days are untouched');
});

test('switching presets rebuilds the plan', async () => {
  const store = await freshStore();
  await store.applyPreset('upper-lower', ['Mon', 'Thu']);
  assert.equal(store.prescribeFor('Mon').name, 'Upper');
  assert.equal(store.prescribeFor('Thu').name, 'Lower');
  assert.equal(store.prescribeFor('Tue'), null);
});

test('a blank plan starts with no workouts and no scheduled days', async () => {
  const store = await freshStore();
  await store.startBlankPlan();
  assert.equal(store.getState().plan.days.length, 0);
  assert.equal(schedule(store.getState().plan).length, 0);
});

test('a scheduled but empty workout prescribes nothing without throwing', async () => {
  const store = await freshStore();
  const day = await store.addDay('Empty', []);
  await store.assignDay('Thu', day.id);
  const p = store.prescribeFor('Thu');
  assert.equal(p.empty, true);
  assert.deepEqual(p.exercises, []);
});

// ═══ Store: mid-session edits ═════════════════════════════════════════════
test('an exercise can be swapped mid-session, keeping logged work', async () => {
  const store = await freshStore();
  const session = await store.startSession('Mon');
  await store.logSet(0, 0, 8, 135);
  await store.swapExercise(0, 'db-bench');

  const ex = store.getState().activeSession.exercises[0];
  assert.equal(ex.exerciseId, 'db-bench');
  assert.equal(ex.sets[0].actualReps, 8, 'the set you already did is not erased');
  assert.ok(ex.sets.some((s) => !s.done), 'and there is still work left');
});

test('an exercise can be added to a session in progress', async () => {
  const store = await freshStore();
  const session = await store.startSession('Mon');
  const n = session.exercises.length;
  await store.addExerciseToSession('face-pull');
  const after = store.getState().activeSession.exercises;
  assert.equal(after.length, n + 1);
  assert.equal(after[n].exerciseId, 'face-pull');
  assert.ok(after[n].sets.length >= 1);
});

test('adding a duplicate exercise to a session is ignored', async () => {
  const store = await freshStore();
  const session = await store.startSession('Mon');
  const existing = session.exercises[0].exerciseId;
  await store.addExerciseToSession(existing);
  assert.equal(store.getState().activeSession.exercises.length, session.exercises.length);
});

// ═══ Store: inventory, stats, persistence ═════════════════════════════════
test('plate inventory is configurable and flows into hints', async () => {
  const store = await freshStore();
  await store.setInventory(PRESET_INVENTORIES.kg);
  const h = store.hintFor(100, 'barbell');
  assert.equal(h.unit, 'kg');
});

test('stats aggregate volume, sets and PRs', async () => {
  const store = await freshStore();
  await store.startSession('Mon');
  await store.logSet(0, 0, 10, 100);
  await store.logSet(0, 1, 10, 100);
  await store.finishSession();

  const stats = store.stats();
  assert.equal(stats.totalSessions, 1);
  assert.equal(stats.totalSets, 2);
  assert.equal(stats.totalVolume, 2000);
  assert.ok(stats.prs.length >= 1);
  assert.ok(stats.streak >= 1);
});

test('exercise history tracks estimated 1RM over sessions', async () => {
  const store = await freshStore();
  const first = await store.startSession('Mon');
  const id = first.exercises[0].exerciseId;
  await store.logSet(0, 0, 5, 200);
  await store.finishSession();
  const hist = store.exerciseHistory(id);
  assert.equal(hist[0].topWeight, 200);
  assert.equal(hist[0].est1RM, estimate1RM(200, 5));
});

test('state survives a reload through the adapter', async () => {
  const adapter = createMemoryAdapter();
  const a = createStore(adapter);
  await a.load();
  await a.completeSetup(PROFILE, { presetId: 'ppl-arnold', trainingDays: ['Mon'] });
  const day = await a.addDay('Custom', []);
  await a.addExerciseToDay(day.id, 'squat');
  await a.startSession('Mon');
  await a.logSet(0, 0, 8, 135);

  const b = createStore(adapter);
  const state = await b.load();
  assert.ok(state.profile);
  assert.ok(state.activeSession, 'in-progress session survives');
  assert.equal(state.activeSession.exercises[0].sets[0].actualReps, 8);
  assert.ok(state.plan.days.some((d) => d.name === 'Custom'), 'custom workouts persist');
});

test('bodyweight log keeps one entry per day', async () => {
  const store = await freshStore();
  await store.logBodyweight(182);
  await store.logBodyweight(181);
  const st = store.getState();
  assert.equal(st.bodyweightLog.length, 1);
  assert.equal(st.profile.bodyweight, 181);
});

test('nextTrainingDay finds the upcoming session', async () => {
  const store = await freshStore();
  const next = store.nextTrainingDay(new Date('2026-09-17T09:00:00')); // Thursday
  assert.equal(next.day, 'Fri');
  assert.equal(next.daysAway, 1);
});

test('weekStart snaps any date to its Monday', () => {
  assert.equal(weekStart('2026-09-13'), '2026-09-07');
  assert.equal(weekStart('2026-09-07'), '2026-09-07');
});

test('prescribe returns null before setup', () => {
  assert.equal(prescribe({ plan: null, profile: null, exerciseState: {} }, 'Mon'), null);
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
    for (const [name, err] of failures) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}\n`);
    }
    process.exit(1);
  }
  console.log('  All green.\n');
})();

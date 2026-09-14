// Adaptive progression engine.
//
// The model is one number per lift: an estimated 1RM ("e1RM") that the app
// keeps learning from every set you log. Prescriptions are derived from it —
// a working weight is a percentage of your estimated max, chosen for the rep
// range that lift is trained in.
//
// Why that rather than pure double progression: double progression only knows
// "hit the top, add weight". It cannot tell that you beat the target by four
// reps, so it creeps upward at a fixed rate no matter how strong you actually
// are. Tracking e1RM lets the app converge on your real strength in a session
// or two, then track it as it changes.
//
// Three layers:
//
//   1. LEARNING  (`updateStrength`)  — every logged set revises the e1RM. Hard
//      sets teach more than easy ones; a single fluke cannot swing it far.
//   2. BETWEEN   (`progressExercise`) — next session's weight and reps, derived
//      from the learned e1RM plus how the last session actually went.
//   3. WITHIN    (`adjustNextSet`)    — mid-workout correction for fatigue or a
//      load that turned out wrong.
//
// Everything here is a pure function of its inputs. No storage, no clock, no DOM.

import { getExercise } from './exercises.js';

// ── Tuning constants ──────────────────────────────────────────────────────

// How fast the e1RM estimate moves toward new evidence. Low enough that one
// bad night does not tank your programme; high enough to track real change.
const LEARN_RATE_UP = 0.35;    // beating expectations: believe it fairly fast
const LEARN_RATE_DOWN = 0.20;  // underperforming: slower, could be a bad day

// A set taken closer to failure is better evidence of true strength.
const MIN_EVIDENCE_REPS = 1;
const MAX_EVIDENCE_REPS = 12;  // Epley degrades past this

const MID_WORKOUT_CUT_THRESHOLD = 2;
const MID_WORKOUT_CUT_PCT = 0.1;
const DELOAD_PCT = 0.1;
const STALL_LIMIT = 2;

// Weekly progression ceiling, as a fraction of e1RM. Even a beginner cannot
// truly add 10% a week; a jump that large means the estimate was wrong, not
// that strength changed, so cap how far one session can move the prescription.
const MAX_WEEKLY_GAIN = 0.05;

/** Round a weight to something you can actually load. */
export function roundToIncrement(weight, increment) {
  if (!increment || increment <= 0) return Math.max(0, Math.round(weight));
  return Math.max(0, Math.round(weight / increment) * increment);
}

/** Epley 1RM estimate, capped — the formula gets silly past ~12 reps. */
export function estimate1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return 0;
  const r = Math.min(reps, MAX_EVIDENCE_REPS);
  return Math.round(weight * (1 + r / 30));
}

/** Inverse Epley: the weight you could lift for `reps` at a given 1RM. */
export function weightForReps(oneRM, reps) {
  if (!oneRM || reps < 1) return 0;
  const r = Math.min(reps, MAX_EVIDENCE_REPS);
  return oneRM / (1 + r / 30);
}

/**
 * How much to trust a set as evidence of true strength.
 *
 * A single heavy double says more than a set of 20 done well short of failure,
 * and a set of 0–1 reps says almost nothing at all.
 */
function evidenceWeight(reps) {
  if (reps < MIN_EVIDENCE_REPS) return 0;
  if (reps <= 6) return 1.0;    // heavy sets: the best signal
  if (reps <= 10) return 0.85;
  if (reps <= 15) return 0.6;
  return 0.35;                  // very high reps: conditioning more than strength
}

/**
 * Learn from a completed session: revise the estimated 1RM for one lift.
 *
 * @param {object} args
 * @param {number} [args.currentE1RM] what we believed before (0 = no history)
 * @param {Array<{weight:number, actualReps:number, targetReps:number}>} args.sets
 * @returns {{e1rm:number, confidence:number, observed:number}}
 *          `confidence` rises as more sessions agree, and damps early swings.
 */
export function updateStrength({ currentE1RM = 0, sets = [], confidence = 0 }) {
  const logged = sets.filter((s) => s && s.actualReps > 0 && (s.weight || 0) > 0);
  if (!logged.length) return { e1rm: currentE1RM, confidence, observed: 0 };

  // The best single set is the strongest claim this session supports.
  let observed = 0;
  let bestEvidence = 0;
  for (const s of logged) {
    const est = estimate1RM(s.weight, s.actualReps);
    const ev = evidenceWeight(s.actualReps);
    if (est * ev > observed * bestEvidence || observed === 0) {
      if (est > observed) { observed = est; bestEvidence = ev; }
    }
  }
  if (!observed) return { e1rm: currentE1RM, confidence, observed: 0 };

  // No history: take the observation directly. The first session IS the baseline.
  if (!currentE1RM) {
    return { e1rm: observed, confidence: bestEvidence, observed };
  }

  // Blend toward the observation. Rate depends on direction and evidence
  // quality, so a hard top set moves the estimate more than a light one.
  const rate = (observed > currentE1RM ? LEARN_RATE_UP : LEARN_RATE_DOWN) * bestEvidence;
  const e1rm = Math.round(currentE1RM + (observed - currentE1RM) * rate);

  return {
    e1rm,
    confidence: Math.min(1, confidence + 0.2),
    observed,
  };
}

/**
 * Pick the working weight for a target rep count, from the learned 1RM.
 *
 * Working sets are taken shy of failure so they can be repeated for volume.
 * The reserve shrinks as reps rise: a heavy triple leaves more in the tank
 * than a set of fifteen, which is close to failure by nature.
 */
function workingWeight(e1rm, reps, increment) {
  const raw = weightForReps(e1rm, reps);
  const reserve = reps <= 5 ? 0.94 : reps <= 8 ? 0.92 : reps <= 12 ? 0.90 : 0.88;
  return roundToIncrement(raw * reserve, increment);
}

/**
 * Decide the prescription for the NEXT session of this exercise.
 *
 * Reads as: learn what the last session proved, then prescribe from the
 * updated estimate — climbing reps inside the range, and adding weight when
 * the top of the range is reached.
 *
 * @param {object} args
 * @param {string} args.exerciseId
 * @param {Array<{weight:number, targetReps:number, actualReps:number}>} args.sets
 * @param {number} [args.stallCount]
 * @param {number} [args.e1rm]        the learned estimate before this session
 * @param {number} [args.confidence]
 * @returns {{weight, targetReps, sets, stallCount, e1rm, confidence, verdict, reason}}
 */
export function progressExercise({
  exerciseId, sets, stallCount = 0, e1rm = 0, confidence = 0,
}) {
  const ex = getExercise(exerciseId);
  const [minReps, maxReps] = ex ? ex.repRange : [8, 12];
  const increment = ex ? ex.increment : 5;

  const working = (sets || []).filter((s) => s && s.actualReps != null);
  if (!working.length) {
    return {
      weight: 0, targetReps: minReps, sets: 3, stallCount, e1rm, confidence,
      verdict: 'new', reason: 'No history yet — the first session sets the baseline.',
    };
  }

  // ── 1. Learn ────────────────────────────────────────────────────────────
  const learned = updateStrength({ currentE1RM: e1rm, sets: working, confidence });
  const newE1RM = learned.e1rm;

  // Judge performance at the session's top weight, so a mid-workout back-off
  // set neither blocks nor fakes a promotion.
  const topWeight = Math.max(...working.map((s) => s.weight || 0));
  const atTop = working.filter((s) => (s.weight || 0) >= topWeight);
  const setCount = working.length;
  const bestReps = Math.max(...atTop.map((s) => s.actualReps));
  const allHitMax = atTop.every((s) => s.actualReps >= maxReps);
  const allHitMin = atTop.every((s) => s.actualReps >= minReps);

  // Cap how far one session moves the prescription.
  //
  // Two regimes, because they are different situations. Once the estimate has
  // settled, a big jump would be a real (implausible) strength claim, so it is
  // held to MAX_WEEKLY_GAIN. But while the app is still calibrating — the first
  // few sessions, or after a long layoff — a big jump means the starting guess
  // was wrong, not that the lifter changed. Correcting that fast is the whole
  // point: a strong lifter should not spend two months climbing to their real
  // working weight from a conservative seed.
  const calibrating = confidence < 0.8;
  const maxGain = calibrating ? 0.25 : MAX_WEEKLY_GAIN;
  const cap = (w) => {
    const ceiling = topWeight > 0 ? topWeight * (1 + maxGain) : w;
    return roundToIncrement(Math.min(w, ceiling), increment);
  };

  // ── 2. Missed the range ─────────────────────────────────────────────────
  if (!allHitMin) {
    const nextStall = stallCount + 1;
    if (nextStall >= STALL_LIMIT && increment > 0) {
      const deloaded = roundToIncrement(topWeight * (1 - DELOAD_PCT), increment);
      return {
        weight: Math.max(increment, deloaded), targetReps: minReps, sets: setCount,
        stallCount: 0, e1rm: newE1RM, confidence: learned.confidence,
        verdict: 'deload',
        reason: `Stalled ${nextStall} sessions. Deloading 10% to ${Math.max(increment, deloaded)} lbs to rebuild.`,
      };
    }
    return {
      weight: topWeight, targetReps: minReps, sets: setCount,
      stallCount: nextStall, e1rm: newE1RM, confidence: learned.confidence,
      verdict: 'retry',
      reason: `Came up short of ${minReps}. Same weight again — one more honest attempt before deloading.`,
    };
  }

  // ── 3. Cleared the top of the range → add weight ────────────────────────
  if (allHitMax) {
    if (increment === 0) {
      // Bodyweight with no loading option: progress by reps instead.
      return {
        weight: topWeight, targetReps: maxReps + 2, sets: setCount, stallCount: 0,
        e1rm: newE1RM, confidence: learned.confidence, verdict: 'increase',
        reason: `Cleared ${maxReps}. Push for ${maxReps + 2} next time.`,
      };
    }

    // How far past the top did they go? Several reps over means the load was
    // far too light, and the jump should reflect that rather than crawling by
    // one increment a week.
    const overshoot = bestReps - maxReps;
    const conservative = roundToIncrement(topWeight + increment, increment);

    // Anchor a big correction on what they actually demonstrated, not on the
    // smoothed estimate — the smoothing exists to resist noise, but a set
    // taken far past the target is not noise, it is proof the load was wrong.
    //
    // Epley caps at 12 reps, so a 15-rep set is recorded as a 12-rep one and
    // understates the lifter. Credit the extra reps explicitly, otherwise a
    // wildly light load corrects far too slowly.
    const creditedReps = Math.min(bestReps, MAX_EVIDENCE_REPS);
    const extraReps = Math.max(0, bestReps - MAX_EVIDENCE_REPS);
    const demonstrated = estimate1RM(topWeight, creditedReps) * (1 + extraReps * 0.02);
    const anchor = overshoot >= 3 ? Math.max(newE1RM, demonstrated) : newE1RM;

    // Target the TOP of the rep range: the next session starts at the bottom
    // and climbs, so the weight must be one they can still finish at maxReps.
    //
    // After a large overshoot, skip the in-reserve discount. That margin keeps
    // a settled lifter from grinding, but here they just proved the load was
    // far too easy, and discounting would cancel most of the correction.
    const fromEstimate = overshoot >= 3
      ? roundToIncrement(weightForReps(anchor, maxReps), increment)
      : workingWeight(anchor, maxReps, increment);

    const target = cap(Math.max(conservative, overshoot >= 2 ? fromEstimate : conservative));
    const jump = target - topWeight;

    return {
      weight: Math.max(topWeight + increment, target),
      targetReps: minReps, sets: setCount, stallCount: 0,
      e1rm: newE1RM, confidence: learned.confidence, verdict: 'increase',
      reason: overshoot >= 2
        ? `${bestReps} reps at ${topWeight} was well inside your limit — jumping ${jump} lbs to ${target}.`
        : `All sets hit ${maxReps} reps. Up ${increment} lbs, back to ${minReps} reps.`,
    };
  }

  // ── 4. Inside the range → climb reps, or jump if the load is far too light ──
  const nextReps = Math.min(maxReps, bestReps + 1);
  const suggested = workingWeight(newE1RM, nextReps, increment);

  // If the learned estimate says this weight is far below where it should be,
  // correct now instead of spending weeks creeping up to it.
  if (suggested > topWeight + increment && increment > 0) {
    const target = cap(suggested);
    if (target > topWeight) {
      return {
        weight: target, targetReps: minReps, sets: setCount, stallCount: 0,
        e1rm: newE1RM, confidence: learned.confidence, verdict: 'increase',
        reason: `Your recent sets point to a working weight nearer ${target} lbs. Moving up.`,
      };
    }
  }

  return {
    weight: topWeight, targetReps: nextReps, sets: setCount, stallCount: 0,
    e1rm: newE1RM, confidence: learned.confidence, verdict: 'hold',
    reason: `Solid at ${topWeight} lbs. Same weight — chase ${nextReps} reps.`,
  };
}

/**
 * Given the set just completed, prescribe the next set in the SAME workout.
 *
 * @returns {{weight:number, targetReps:number, reason:string}|null} null when done
 */
export function adjustNextSet({ exerciseId, targetReps, actualReps, weight, setsRemaining }) {
  if (setsRemaining <= 0) return null;

  const ex = getExercise(exerciseId);
  const [minReps, maxReps] = ex ? ex.repRange : [8, 12];
  const increment = ex ? ex.increment : 5;

  // Blew past the top of the range — the load is too light to be useful.
  if (actualReps >= maxReps + 2 && increment > 0) {
    // Scale the bump to how far past they went, so a wildly light load is
    // corrected in one step rather than over several sets.
    const over = actualReps - maxReps;
    const steps = over >= 5 ? 3 : over >= 3 ? 2 : 1;
    const next = roundToIncrement(weight + increment * steps, increment);
    return {
      weight: next,
      targetReps,
      reason: `${actualReps} reps cleared the range — adding ${next - weight} lbs.`,
    };
  }

  // Fell well short. Cut the load so the remaining sets still land in range.
  if (actualReps <= minReps - MID_WORKOUT_CUT_THRESHOLD && increment > 0) {
    const cut = roundToIncrement(weight * (1 - MID_WORKOUT_CUT_PCT), increment);
    const next = Math.min(cut, roundToIncrement(weight - increment, increment));
    return {
      weight: Math.max(increment, next),
      targetReps,
      reason: `${actualReps} fell short of ${minReps} — dropping to ${Math.max(increment, next)} lbs to keep the remaining sets in range.`,
    };
  }

  // Slightly short: hold the weight, ask for one less rep. Normal fatigue.
  if (actualReps < targetReps) {
    return {
      weight,
      targetReps: Math.max(minReps, actualReps),
      reason: `Same weight — aim for ${Math.max(minReps, actualReps)} this set.`,
    };
  }

  return { weight, targetReps, reason: 'On target — same weight, same reps.' };
}

/**
 * Seed a starting weight for an exercise with no history.
 *
 * This is only ever a first guess: the first real session replaces it via
 * `updateStrength`. It errs slightly light because starting too heavy means a
 * failed set, while starting light costs one session.
 */
export function seedStartingWeight({ exerciseId, bodyweight = 170, experience = 'beginner' }) {
  const ex = getExercise(exerciseId);
  if (!ex) return { weight: 0, targetReps: 8, sets: 3, reason: 'Unknown exercise.' };

  const [minReps] = ex.repRange;

  // Deliberately conservative, especially for beginners. Starting 20 lb light
  // costs one session — the engine corrects it immediately from the first set.
  // Starting 20 lb heavy means a failed set, a deload, and three wasted weeks,
  // which is exactly what a new user should never meet on day one.
  const expFactor = { beginner: 0.6, intermediate: 0.9, advanced: 1.1 }[experience] ?? 0.6;

  // Working-weight ratios relative to bodyweight for an intermediate lifter.
  const RATIOS = {
    primary: { barbell: 0.6, dumbbell: 0.25, cable: 0.45, machine: 0.6, smith: 0.55, bodyweight: 0, kettlebell: 0.25, band: 0.2 },
    secondary: { barbell: 0.4, dumbbell: 0.2, cable: 0.35, machine: 0.45, smith: 0.4, bodyweight: 0, kettlebell: 0.2, band: 0.15 },
    isolation: { barbell: 0.2, dumbbell: 0.1, cable: 0.2, machine: 0.25, smith: 0.2, bodyweight: 0, kettlebell: 0.12, band: 0.1 },
  };

  // Lifts whose typical load differs enough from their tier default to name.
  const OVERRIDES = {
    squat: 0.9, 'front-squat': 0.7, 'high-bar-squat': 0.85, 'safety-bar-squat': 0.8,
    deadlift: 1.1, 'sumo-deadlift': 1.1, 'trap-bar-deadlift': 1.1, 'rack-pull': 1.2,
    'leg-press': 1.6, 'hack-squat': 1.0, 'bb-bench': 0.7, 'bb-incline': 0.6,
    ohp: 0.45, 'push-press': 0.55, 'bb-row': 0.6, rdl: 0.75, 'hip-thrust': 1.1,
  };

  const ratio = OVERRIDES[exerciseId] ?? RATIOS[ex.tier]?.[ex.equipment] ?? 0.3;
  const raw = bodyweight * ratio * expFactor;
  const weight = ex.equipment === 'bodyweight' ? 0 : roundToIncrement(raw, ex.increment);

  const sets = ex.tier === 'primary' ? 4 : 3;

  return {
    weight,
    targetReps: minReps,
    sets,
    reason: ex.equipment === 'bodyweight'
      ? 'Bodyweight to start — add load once you clear the rep range.'
      : `Starting estimate from ${bodyweight} lbs bodyweight. Adjust it if it feels wrong — the app learns your real strength from this session.`,
  };
}

export const PROGRESSION_CONSTANTS = {
  MID_WORKOUT_CUT_THRESHOLD, MID_WORKOUT_CUT_PCT, DELOAD_PCT, STALL_LIMIT,
  LEARN_RATE_UP, LEARN_RATE_DOWN, MAX_WEEKLY_GAIN,
};

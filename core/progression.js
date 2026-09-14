// Double-progression engine.
//
// Two independent layers:
//
//   1. WITHIN a workout (`adjustNextSet`) — you just logged a set. Fatigue is real,
//      so later sets don't get the same treatment as the first. We only cut weight
//      when a set falls clearly short, and only add mid-workout when you blow past
//      the top of the range.
//
//   2. BETWEEN workouts (`progressExercise`) — classic double progression. Hit the
//      top of the rep range on every set → add one increment, reset to the bottom
//      of the range. Fall below the bottom on repeated attempts → deload.
//
// Everything here is a pure function of its inputs. No storage, no clock, no DOM.

import { getExercise } from './exercises.js';

// A miss this deep mid-workout means the load is wrong, not that you're just tired.
const MID_WORKOUT_CUT_THRESHOLD = 2; // reps below range minimum
const MID_WORKOUT_CUT_PCT = 0.1;
const DELOAD_PCT = 0.1;
const STALL_LIMIT = 2; // consecutive failed sessions before deloading

/** Round a weight to something you can actually load on the bar. */
export function roundToIncrement(weight, increment) {
  if (!increment || increment <= 0) return Math.max(0, Math.round(weight));
  return Math.max(0, Math.round(weight / increment) * increment);
}

/** Epley 1RM estimate, capped — the formula gets silly past ~12 reps. */
export function estimate1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return 0;
  const r = Math.min(reps, 12);
  return Math.round(weight * (1 + r / 30));
}

/**
 * Given the set just completed, prescribe the next set in the SAME workout.
 *
 * @param {object} args
 * @param {string} args.exerciseId
 * @param {number} args.targetReps   what we asked for on the set just done
 * @param {number} args.actualReps   what you actually got
 * @param {number} args.weight       weight used on that set
 * @param {number} args.setsRemaining how many sets are left after this one
 * @returns {{weight:number, targetReps:number, reason:string}|null} null when done
 */
export function adjustNextSet({ exerciseId, targetReps, actualReps, weight, setsRemaining }) {
  if (setsRemaining <= 0) return null;

  const ex = getExercise(exerciseId);
  const [minReps, maxReps] = ex ? ex.repRange : [8, 12];
  const increment = ex ? ex.increment : 5;

  // Blew past the top of the range with room to spare — the load is too light.
  if (actualReps >= maxReps + 2 && increment > 0) {
    return {
      weight: roundToIncrement(weight + increment, increment),
      targetReps,
      reason: `${actualReps} reps cleared the range — adding ${increment} lbs.`,
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

  // Hit or beat the target. Hold and repeat.
  return { weight, targetReps, reason: 'On target — same weight, same reps.' };
}

/**
 * Decide the prescription for the NEXT session of this exercise, given how the
 * last one went.
 *
 * @param {object} args
 * @param {string} args.exerciseId
 * @param {Array<{weight:number, targetReps:number, actualReps:number}>} args.sets last session's logged sets
 * @param {number} [args.stallCount] consecutive prior sessions that failed to progress
 * @returns {{weight:number, targetReps:number, sets:number, stallCount:number, verdict:string, reason:string}}
 */
export function progressExercise({ exerciseId, sets, stallCount = 0 }) {
  const ex = getExercise(exerciseId);
  const [minReps, maxReps] = ex ? ex.repRange : [8, 12];
  const increment = ex ? ex.increment : 5;

  const working = (sets || []).filter((s) => s && s.actualReps != null);
  if (!working.length) {
    return {
      weight: 0, targetReps: minReps, sets: 3, stallCount,
      verdict: 'new', reason: 'No history yet — first session sets the baseline.',
    };
  }

  // Progression is judged at the session's top working weight. Sets done lighter
  // (after a mid-workout cut) shouldn't block or fake a promotion.
  const topWeight = Math.max(...working.map((s) => s.weight || 0));
  const atTop = working.filter((s) => (s.weight || 0) >= topWeight);
  const setCount = working.length;

  const allHitMax = atTop.every((s) => s.actualReps >= maxReps);
  const allHitMin = atTop.every((s) => s.actualReps >= minReps);

  // Every set at the top of the range → add weight, reset reps to the bottom.
  if (allHitMax && increment > 0) {
    return {
      weight: roundToIncrement(topWeight + increment, increment),
      targetReps: minReps,
      sets: setCount,
      stallCount: 0,
      verdict: 'increase',
      reason: `All sets hit ${maxReps} reps. Up ${increment} lbs, back to ${minReps} reps.`,
    };
  }

  // Bodyweight moves with no loading option progress by reps instead.
  if (allHitMax && increment === 0) {
    return {
      weight: topWeight,
      targetReps: maxReps + 2,
      sets: setCount,
      stallCount: 0,
      verdict: 'increase',
      reason: `Cleared ${maxReps}. Push for ${maxReps + 2} next time.`,
    };
  }

  // Held the bottom of the range → same weight, climb toward the top.
  if (allHitMin) {
    const best = Math.max(...atTop.map((s) => s.actualReps));
    const next = Math.min(maxReps, best + 1);
    return {
      weight: topWeight,
      targetReps: next,
      sets: setCount,
      stallCount: 0,
      verdict: 'hold',
      reason: `Solid at ${topWeight} lbs. Same weight — chase ${next} reps.`,
    };
  }

  // Missed the bottom of the range. One miss is a bad day; repeated misses is a stall.
  const nextStall = stallCount + 1;
  if (nextStall >= STALL_LIMIT && increment > 0) {
    const deloaded = roundToIncrement(topWeight * (1 - DELOAD_PCT), increment);
    return {
      weight: Math.max(increment, deloaded),
      targetReps: minReps,
      sets: setCount,
      stallCount: 0,
      verdict: 'deload',
      reason: `Stalled ${nextStall} sessions. Deloading 10% to ${Math.max(increment, deloaded)} lbs to rebuild.`,
    };
  }

  return {
    weight: topWeight,
    targetReps: minReps,
    sets: setCount,
    stallCount: nextStall,
    verdict: 'retry',
    reason: `Came up short of ${minReps}. Same weight again — one more honest attempt before deloading.`,
  };
}

/**
 * Seed a starting weight for an exercise the user has never logged.
 * Uses a related lift when one exists, otherwise a conservative bodyweight ratio.
 *
 * @param {object} args
 * @param {string} args.exerciseId
 * @param {number} args.bodyweight lbs
 * @param {string} args.experience 'beginner'|'intermediate'|'advanced'
 * @returns {{weight:number, targetReps:number, sets:number, reason:string}}
 */
export function seedStartingWeight({ exerciseId, bodyweight = 170, experience = 'beginner' }) {
  const ex = getExercise(exerciseId);
  if (!ex) return { weight: 0, targetReps: 8, sets: 3, reason: 'Unknown exercise.' };

  const [minReps] = ex.repRange;
  const expFactor = { beginner: 0.65, intermediate: 1.0, advanced: 1.25 }[experience] ?? 0.65;

  // Rough intermediate-level ratios of working weight to bodyweight.
  const RATIOS = {
    primary: { barbell: 0.6, dumbbell: 0.25, cable: 0.45, machine: 0.6, bodyweight: 0 },
    secondary: { barbell: 0.4, dumbbell: 0.2, cable: 0.35, machine: 0.45, bodyweight: 0 },
    isolation: { barbell: 0.2, dumbbell: 0.1, cable: 0.2, machine: 0.25, bodyweight: 0 },
  };

  // A few lifts deviate enough from their tier default to be worth naming.
  const OVERRIDES = { squat: 0.85, deadlift: 1.0, 'leg-press': 1.5, 'bb-bench': 0.65, ohp: 0.4, 'hip-thrust': 1.0 };

  const ratio = OVERRIDES[exerciseId] ?? RATIOS[ex.tier]?.[ex.equipment] ?? 0.3;
  const raw = bodyweight * ratio * expFactor;
  const weight = ex.equipment === 'bodyweight' ? 0 : roundToIncrement(raw, ex.increment);

  const sets = ex.tier === 'primary' ? 4 : ex.tier === 'secondary' ? 3 : 3;

  return {
    weight,
    targetReps: minReps,
    sets,
    reason: ex.equipment === 'bodyweight'
      ? 'Bodyweight to start — add load once you clear the rep range.'
      : `Estimated from ${bodyweight} lbs bodyweight at ${experience} level. Adjust if it feels off — the app learns from your first session.`,
  };
}

export const PROGRESSION_CONSTANTS = {
  MID_WORKOUT_CUT_THRESHOLD, MID_WORKOUT_CUT_PCT, DELOAD_PCT, STALL_LIMIT,
};

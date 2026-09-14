// Application state + persistence.
//
// Storage sits behind an adapter so the same store runs on localStorage today and
// on AsyncStorage (React Native) or an HTTP API later. Swap the adapter, keep
// everything else. The adapter only needs get(key) / set(key, value) / remove(key),
// each returning a promise.

import {
  schedule, buildWorkout, occurrenceIndex, planFromPreset, blankPlan,
  newCustomDay, getDay, migratePlan, DAYS,
} from './splits.js';
import { getExercise } from './exercises.js';
import { progressExercise, seedStartingWeight, adjustNextSet, estimate1RM } from './progression.js';
import { DEFAULT_INVENTORY, loadingHint } from './plates.js';

const STORAGE_KEY = 'liftlog.state.v1';
export const SCHEMA_VERSION = 2;

export function createLocalStorageAdapter(storage) {
  const backing = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  return {
    async get(key) {
      if (!backing) return null;
      const raw = backing.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    async set(key, value) {
      if (!backing) return;
      backing.setItem(key, JSON.stringify(value));
    },
    async remove(key) {
      if (!backing) return;
      backing.removeItem(key);
    },
  };
}

/** In-memory adapter — used by tests and as a fallback when storage is blocked. */
export function createMemoryAdapter() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async set(key, value) { map.set(key, JSON.stringify(value)); },
    async remove(key) { map.delete(key); },
  };
}

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: null,       // { name, heightIn, bodyweight, experience, equipment, favorites, goal }
    plan: null,          // { presetId, days: [...], week: {Mon: dayId, ...} }
    inventory: { ...DEFAULT_INVENTORY },
    // exerciseState[exerciseId] = { weight, targetReps, sets, stallCount, lastPerformed, best1RM }
    exerciseState: {},
    sessions: [],        // completed sessions, newest last
    activeSession: null, // in-progress session, survives a page reload
    bodyweightLog: [],   // [{ date, weight }]
  };
}

/** Bring a persisted blob up to the current schema without losing history. */
export function migrate(saved) {
  if (!saved) return emptyState();
  const base = emptyState();
  const next = { ...base, ...saved, schemaVersion: SCHEMA_VERSION };

  // v1 → v2: plan gained editable days and a weekday map.
  if (saved.plan && !saved.plan.days) next.plan = migratePlan(saved.plan);
  if (!next.inventory) next.inventory = { ...DEFAULT_INVENTORY };

  // v1 sessions keyed exercises by templateId; the field is now dayId. Old
  // sessions keep their own copy of the exercise list, so only the label matters.
  next.sessions = (saved.sessions || []).map((s) => ({
    ...s,
    dayId: s.dayId || s.templateId || null,
  }));

  return next;
}

export function createStore(adapter = createLocalStorageAdapter()) {
  let state = emptyState();
  const listeners = new Set();

  function notify() { listeners.forEach((fn) => fn(state)); }

  async function persist() {
    try { await adapter.set(STORAGE_KEY, state); } catch { /* storage unavailable; stay in memory */ }
  }

  async function commit(next) {
    state = next;
    notify();
    await persist();
  }

  const api = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getState() { return state; },

    async load() {
      let saved = null;
      try { saved = await adapter.get(STORAGE_KEY); } catch { saved = null; }
      state = migrate(saved);
      notify();
      return state;
    },

    async reset() { await commit(emptyState()); },

    async replace(next) {
      await commit(migrate(next));
    },

    // ── Onboarding ────────────────────────────────────────────────────────

    /**
     * @param {object} profile { name, heightIn, bodyweight, experience, equipment, favorites, goal }
     * @param {object} opts    { presetId, trainingDays } or { plan }
     */
    async completeSetup(profile, opts) {
      const plan = opts.plan || planFromPreset(opts.presetId, opts.trainingDays);
      await commit({
        ...state,
        profile: { ...profile, createdAt: new Date().toISOString() },
        plan,
        bodyweightLog: profile.bodyweight ? [{ date: todayISO(), weight: profile.bodyweight }] : [],
      });
      return state;
    },

    async updateProfile(patch) {
      await commit({ ...state, profile: { ...state.profile, ...patch } });
    },

    async setInventory(inventory) {
      await commit({ ...state, inventory: { ...state.inventory, ...inventory } });
    },

    async logBodyweight(weight, date = todayISO()) {
      const log = state.bodyweightLog.filter((e) => e.date !== date);
      log.push({ date, weight });
      log.sort((a, b) => a.date.localeCompare(b.date));
      await commit({ ...state, bodyweightLog: log, profile: { ...state.profile, bodyweight: weight } });
    },

    // ── Plan editing ──────────────────────────────────────────────────────

    /** Replace the whole plan — used when switching presets. */
    async setPlan(plan) {
      await commit({ ...state, plan });
    },

    async applyPreset(presetId, trainingDays) {
      const days = trainingDays || DAYS.filter((d) => state.plan?.week?.[d]);
      await commit({ ...state, plan: planFromPreset(presetId, days.length ? days : undefined) });
    },

    async startBlankPlan() {
      await commit({ ...state, plan: blankPlan() });
    },

    /** Assign a workout (or null for rest) to a weekday. */
    async assignDay(weekday, dayId) {
      const plan = { ...state.plan, week: { ...state.plan.week, [weekday]: dayId || null } };
      await commit({ ...state, plan });
    },

    async addDay(name, muscles) {
      const day = newCustomDay(name, muscles);
      const plan = { ...state.plan, days: [...state.plan.days, day] };
      await commit({ ...state, plan });
      return day;
    },

    /** Copy an existing workout, exercises and all. */
    async duplicateDay(dayId) {
      const src = getDay(state.plan, dayId);
      if (!src) return null;
      const copy = {
        ...structuredClone(src),
        id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        name: `${src.name} (copy)`,
      };
      await commit({ ...state, plan: { ...state.plan, days: [...state.plan.days, copy] } });
      return copy;
    },

    async renameDay(dayId, name) {
      const days = state.plan.days.map((d) => (d.id === dayId ? { ...d, name } : d));
      await commit({ ...state, plan: { ...state.plan, days } });
    },

    async removeDay(dayId) {
      const days = state.plan.days.filter((d) => d.id !== dayId);
      const week = { ...state.plan.week };
      for (const d of DAYS) if (week[d] === dayId) week[d] = null;
      await commit({ ...state, plan: { ...state.plan, days, week } });
    },

    /**
     * Pin a day's exercise list. Passing a list converts an auto day to a chosen
     * one; passing null hands it back to the generator.
     * @param {Array<{exerciseId:string, sets:number}>|null} exercises
     */
    async setDayExercises(dayId, exercises) {
      const days = state.plan.days.map((d) => (d.id === dayId ? { ...d, exercises } : d));
      await commit({ ...state, plan: { ...state.plan, days } });
    },

    /** Add one exercise to a day, pinning it if it was auto-filled. */
    async addExerciseToDay(dayId, exerciseId, sets) {
      const day = getDay(state.plan, dayId);
      if (!day) return;
      const meta = getExercise(exerciseId);
      if (!meta) return;

      // An auto day materializes its current picks first, so nothing is lost.
      const current = Array.isArray(day.exercises)
        ? day.exercises
        : buildWorkout({
            plan: state.plan, dayId,
            equipment: state.profile?.equipment || [],
            favorites: state.profile?.favorites || [],
          }).exercises.map((e) => ({ exerciseId: e.id, sets: defaultSets(e.tier) }));

      if (current.some((x) => x.exerciseId === exerciseId)) return;

      const next = [...current, { exerciseId, sets: sets ?? defaultSets(meta.tier) }];
      await api.setDayExercises(dayId, next);
    },

    async removeExerciseFromDay(dayId, exerciseId) {
      const day = getDay(state.plan, dayId);
      if (!day || !Array.isArray(day.exercises)) return;
      await api.setDayExercises(dayId, day.exercises.filter((x) => x.exerciseId !== exerciseId));
    },

    async setExerciseSets(dayId, exerciseId, sets) {
      const day = getDay(state.plan, dayId);
      if (!day || !Array.isArray(day.exercises)) return;
      await api.setDayExercises(
        dayId,
        day.exercises.map((x) => (x.exerciseId === exerciseId ? { ...x, sets: Math.max(1, sets) } : x))
      );
    },

    async moveExerciseInDay(dayId, exerciseId, delta) {
      const day = getDay(state.plan, dayId);
      if (!day || !Array.isArray(day.exercises)) return;
      const list = [...day.exercises];
      const i = list.findIndex((x) => x.exerciseId === exerciseId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await api.setDayExercises(dayId, list);
    },

    /** Materialize an auto day's current picks so they can be edited. */
    async pinDay(dayId) {
      const day = getDay(state.plan, dayId);
      if (!day || Array.isArray(day.exercises)) return;
      const built = buildWorkout({
        plan: state.plan, dayId,
        equipment: state.profile?.equipment || [],
        favorites: state.profile?.favorites || [],
      });
      await api.setDayExercises(dayId, built.exercises.map((e) => ({ exerciseId: e.id, sets: defaultSets(e.tier) })));
    },

    async unpinDay(dayId) {
      await api.setDayExercises(dayId, null);
    },

    // ── Prescription ──────────────────────────────────────────────────────

    prescribeFor(weekday) { return prescribe(state, weekday); },
    nextTrainingDay(from = new Date()) { return nextTrainingDay(state, from); },
    hintFor(weight, loading) { return loadingHint(weight, loading, state.inventory); },

    // ── Session flow ──────────────────────────────────────────────────────

    async startSession(weekday) {
      const p = prescribe(state, weekday);
      if (!p) return null;
      const session = {
        id: `s_${Date.now()}`,
        date: todayISO(),
        day: weekday,
        dayId: p.dayId,
        name: p.name,
        startedAt: new Date().toISOString(),
        exercises: p.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          name: e.name,
          plannedWeight: e.weight,
          plannedReps: e.targetReps,
          plannedSets: e.sets,
          repRange: e.repRange,
          increment: e.increment,
          loading: e.loading,
          bodyweightLoad: e.bodyweightLoad,
          unilateral: e.unilateral,
          notes: e.notes,
          sets: Array.from({ length: e.sets }, () => ({
            weight: e.weight, targetReps: e.targetReps,
            actualReps: null, actualWeight: null, done: false, note: '',
          })),
        })),
      };
      await commit({ ...state, activeSession: session });
      return session;
    },

    async logSet(exIdx, setIdx, actualReps, actualWeight) {
      const session = state.activeSession;
      if (!session) return null;

      const exercises = session.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) =>
            j === setIdx ? { ...s, actualReps, actualWeight: actualWeight ?? s.weight, done: true } : s
          ),
        };
      });

      const ex = exercises[exIdx];
      const logged = ex.sets[setIdx];
      const setsRemaining = ex.sets.length - setIdx - 1;

      const advice = adjustNextSet({
        exerciseId: ex.exerciseId,
        targetReps: logged.targetReps,
        actualReps,
        weight: logged.actualWeight,
        setsRemaining,
      });

      if (advice) {
        for (let j = setIdx + 1; j < ex.sets.length; j++) {
          if (ex.sets[j].done) continue;
          ex.sets[j] = { ...ex.sets[j], weight: advice.weight, targetReps: advice.targetReps };
        }
      }

      await commit({ ...state, activeSession: { ...session, exercises } });
      return advice;
    },

    async unlogSet(exIdx, setIdx) {
      const session = state.activeSession;
      if (!session) return;
      const exercises = session.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) =>
            j === setIdx ? { ...s, actualReps: null, actualWeight: null, done: false } : s
          ),
        };
      });
      await commit({ ...state, activeSession: { ...session, exercises } });
    },

    async addSet(exIdx) {
      const session = state.activeSession;
      if (!session) return;
      const exercises = session.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [...ex.sets, {
            weight: last?.actualWeight ?? last?.weight ?? ex.plannedWeight,
            targetReps: last?.targetReps ?? ex.plannedReps,
            actualReps: null, actualWeight: null, done: false, note: '',
          }],
        };
      });
      await commit({ ...state, activeSession: { ...session, exercises } });
    },

    async overrideWeight(exIdx, setIdx, weight) {
      const session = state.activeSession;
      if (!session) return;
      const exercises = session.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        return { ...ex, sets: ex.sets.map((s, j) => (j === setIdx && !s.done ? { ...s, weight } : s)) };
      });
      await commit({ ...state, activeSession: { ...session, exercises } });
    },

    /** Swap an exercise mid-session — the machine was taken. */
    async swapExercise(exIdx, exerciseId) {
      const session = state.activeSession;
      if (!session) return;
      const meta = getExercise(exerciseId);
      if (!meta) return;

      const old = session.exercises[exIdx];
      const saved = state.exerciseState[exerciseId];
      const seed = saved?.weight != null
        ? { weight: saved.weight, targetReps: saved.targetReps, sets: saved.sets || old.sets.length }
        : seedStartingWeight({
            exerciseId,
            bodyweight: state.profile?.bodyweight,
            experience: state.profile?.experience,
          });

      const exercises = session.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        const keep = ex.sets.filter((s) => s.done);   // logged work is never discarded
        const total = Math.max(seed.sets, keep.length + 1);
        return {
          exerciseId, name: meta.name,
          plannedWeight: seed.weight, plannedReps: seed.targetReps, plannedSets: total,
          repRange: meta.repRange, increment: meta.increment, loading: meta.loading,
          bodyweightLoad: meta.bodyweightLoad, unilateral: meta.unilateral, notes: meta.notes,
          sets: [
            ...keep,
            ...Array.from({ length: Math.max(0, total - keep.length) }, () => ({
              weight: seed.weight, targetReps: seed.targetReps,
              actualReps: null, actualWeight: null, done: false, note: '',
            })),
          ],
        };
      });
      await commit({ ...state, activeSession: { ...session, exercises } });
    },

    /** Add an exercise to the session in progress. */
    async addExerciseToSession(exerciseId) {
      const session = state.activeSession;
      if (!session) return;
      const meta = getExercise(exerciseId);
      if (!meta || session.exercises.some((e) => e.exerciseId === exerciseId)) return;

      const saved = state.exerciseState[exerciseId];
      const seed = saved?.weight != null
        ? { weight: saved.weight, targetReps: saved.targetReps, sets: saved.sets || 3 }
        : seedStartingWeight({
            exerciseId,
            bodyweight: state.profile?.bodyweight,
            experience: state.profile?.experience,
          });

      const exercises = [...session.exercises, {
        exerciseId, name: meta.name,
        plannedWeight: seed.weight, plannedReps: seed.targetReps, plannedSets: seed.sets,
        repRange: meta.repRange, increment: meta.increment, loading: meta.loading,
        bodyweightLoad: meta.bodyweightLoad, unilateral: meta.unilateral, notes: meta.notes,
        sets: Array.from({ length: seed.sets }, () => ({
          weight: seed.weight, targetReps: seed.targetReps,
          actualReps: null, actualWeight: null, done: false, note: '',
        })),
      }];
      await commit({ ...state, activeSession: { ...session, exercises } });
    },

    async finishSession() {
      const session = state.activeSession;
      if (!session) return null;

      const finished = {
        ...session,
        finishedAt: new Date().toISOString(),
        exercises: session.exercises
          .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done) }))
          .filter((ex) => ex.sets.length > 0),
      };

      const exerciseState = { ...state.exerciseState };

      for (const ex of finished.exercises) {
        const prior = exerciseState[ex.exerciseId] || {};
        const sets = ex.sets.map((s) => ({
          weight: s.actualWeight ?? s.weight,
          targetReps: s.targetReps,
          actualReps: s.actualReps,
        }));

        const next = progressExercise({
          exerciseId: ex.exerciseId, sets, stallCount: prior.stallCount || 0,
        });

        const best = Math.max(prior.best1RM || 0, ...sets.map((s) => estimate1RM(s.weight, s.actualReps)));

        exerciseState[ex.exerciseId] = {
          weight: next.weight, targetReps: next.targetReps, sets: next.sets,
          stallCount: next.stallCount, verdict: next.verdict, reason: next.reason,
          lastPerformed: finished.date, best1RM: best,
        };
      }

      await commit({
        ...state,
        activeSession: null,
        sessions: [...state.sessions, finished],
        exerciseState,
      });
      return finished;
    },

    async discardSession() { await commit({ ...state, activeSession: null }); },

    // ── Analytics ─────────────────────────────────────────────────────────
    stats() { return computeStats(state); },
    exerciseHistory(exerciseId) { return exerciseHistory(state, exerciseId); },
  };

  return api;
}

function defaultSets(tier) {
  return tier === 'primary' ? 4 : 3;
}

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for testing and reuse by a future server.
// ───────────────────────────────────────────────────────────────────────────

export function todayISO(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function dayName(d = new Date()) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

export function nextTrainingDay(state, from = new Date()) {
  const sched = schedule(state.plan);
  if (!sched.length) return null;
  for (let i = 0; i < 7; i++) {
    const probe = new Date(from.getTime() + i * 86400000);
    const name = dayName(probe);
    const slot = sched.find((s) => s.day === name);
    if (slot) return { ...slot, date: todayISO(probe), daysAway: i };
  }
  return null;
}

/** Turn the plan + history into a concrete prescription for one weekday. */
export function prescribe(state, weekday) {
  const { plan, profile, exerciseState, inventory } = state;
  if (!plan || !profile) return null;

  const dayId = plan.week?.[weekday];
  if (!dayId) return null;

  const rotation = occurrenceIndex(plan, weekday);
  const workout = buildWorkout({
    plan, dayId,
    equipment: profile.equipment,
    favorites: profile.favorites || [],
    rotation,
  });
  if (!workout.exercises.length) {
    return { day: weekday, dayId, name: workout.name, rotation, exercises: [], empty: true };
  }

  const exercises = workout.exercises.map((e) => {
    const saved = exerciseState[e.id];
    const base = {
      exerciseId: e.id, name: e.name, tier: e.tier, equipment: e.equipment,
      repRange: e.repRange, increment: e.increment, notes: e.notes,
      loading: e.loading, bodyweightLoad: e.bodyweightLoad, unilateral: e.unilateral,
    };

    const out = saved && saved.weight != null
      ? {
          ...base,
          weight: saved.weight, targetReps: saved.targetReps,
          sets: e.sets ?? saved.sets ?? 3,
          reason: saved.reason, verdict: saved.verdict,
          lastPerformed: saved.lastPerformed, best1RM: saved.best1RM || 0, isNew: false,
        }
      : (() => {
          const seed = seedStartingWeight({
            exerciseId: e.id, bodyweight: profile.bodyweight, experience: profile.experience,
          });
          return {
            ...base,
            weight: seed.weight, targetReps: seed.targetReps, sets: e.sets ?? seed.sets,
            reason: seed.reason, verdict: 'new', best1RM: 0, isNew: true,
          };
        })();

    out.hint = loadingHint(out.weight, e.loading, inventory);
    return out;
  });

  return { day: weekday, dayId, name: workout.name, rotation, exercises };
}

export function sessionVolume(session) {
  let volume = 0, sets = 0, reps = 0;
  for (const ex of session.exercises || []) {
    for (const s of ex.sets || []) {
      if (!s.done && s.actualReps == null) continue;
      const w = s.actualWeight ?? s.weight ?? 0;
      volume += w * (s.actualReps || 0);
      reps += s.actualReps || 0;
      sets += 1;
    }
  }
  return { volume, sets, reps };
}

export function exerciseHistory(state, exerciseId) {
  const points = [];
  for (const session of state.sessions) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex || !ex.sets.length) continue;
    const top = ex.sets.reduce((best, s) => {
      const e1 = estimate1RM(s.actualWeight ?? s.weight, s.actualReps);
      return e1 > best.e1 ? { e1, set: s } : best;
    }, { e1: 0, set: null });
    const { volume } = sessionVolume({ exercises: [ex] });
    points.push({
      date: session.date,
      topWeight: Math.max(...ex.sets.map((s) => s.actualWeight ?? s.weight ?? 0)),
      topReps: top.set?.actualReps ?? 0,
      est1RM: top.e1, volume, sets: ex.sets.length,
    });
  }
  return points;
}

export function computeStats(state) {
  const sessions = state.sessions || [];
  const totals = sessions.reduce(
    (acc, s) => {
      const { volume, sets, reps } = sessionVolume(s);
      acc.volume += volume; acc.sets += sets; acc.reps += reps;
      return acc;
    },
    { volume: 0, sets: 0, reps: 0 }
  );

  const byWeek = new Map();
  for (const s of sessions) {
    const key = weekStart(s.date);
    const { volume, sets } = sessionVolume(s);
    const cur = byWeek.get(key) || { week: key, volume: 0, sets: 0, sessions: 0 };
    cur.volume += volume; cur.sets += sets; cur.sessions += 1;
    byWeek.set(key, cur);
  }

  const byMuscle = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const meta = getExercise(ex.exerciseId);
      if (!meta) continue;
      const { volume } = sessionVolume({ exercises: [ex] });
      const share = volume / meta.muscles.length;
      for (const m of meta.muscles) byMuscle[m] = (byMuscle[m] || 0) + share;
    }
  }

  const prs = Object.entries(state.exerciseState)
    .filter(([, v]) => v.best1RM > 0)
    .map(([id, v]) => ({
      exerciseId: id, name: getExercise(id)?.name || id,
      best1RM: v.best1RM, weight: v.weight, lastPerformed: v.lastPerformed,
    }))
    .sort((a, b) => b.best1RM - a.best1RM);

  return {
    totalSessions: sessions.length,
    totalVolume: totals.volume,
    totalSets: totals.sets,
    totalReps: totals.reps,
    weeks: [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)),
    byMuscle, prs,
    streak: currentStreak(sessions),
    bodyweightLog: state.bodyweightLog || [],
  };
}

export function weekStart(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return todayISO(d);
}

export function currentStreak(sessions) {
  if (!sessions.length) return 0;
  const weeks = new Set(sessions.map((s) => weekStart(s.date)));
  let streak = 0;
  const cursor = new Date(`${weekStart(todayISO())}T00:00:00`);
  if (!weeks.has(todayISO(cursor))) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(todayISO(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

export { getExercise, schedule, getDay, DAYS };

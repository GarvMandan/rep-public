// Splits: built-in presets plus fully custom, user-defined routines.
//
// A PLAN is now the single source of truth for the week, shaped as:
//
//   {
//     days: [
//       { id, name, muscles, slots, exercises },   // a workout definition
//       ...
//     ],
//     week: { Mon: dayId|null, Tue: dayId|null, ... }   // what runs when
//   }
//
// `week` maps weekdays to day ids directly, so any workout can land on any day,
// repeat as often as you like, or not appear at all. A day can be:
//   - AUTO-FILLED (`slots` set, `exercises` null) — the generator picks exercises
//     from the library each time, honoring equipment and favorites.
//   - PINNED (`exercises` set) — you chose the exact lifts and set counts.
// Presets start auto-filled; the moment you edit a day's exercises it pins.

import { MUSCLES, exercisesFor, getExercise } from './exercises.js';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LABELS = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

// ── Built-in day templates ────────────────────────────────────────────────
// slots: { tier, muscles, count } — what shape of exercise fills each position.

const TEMPLATES = {
  'chest-back': {
    name: 'Chest & Back', muscles: [MUSCLES.CHEST, MUSCLES.BACK],
    slots: [
      { tier: 'primary', muscles: ['chest'], count: 1 },
      { tier: 'primary', muscles: ['back'], count: 1 },
      { tier: 'secondary', muscles: ['chest'], count: 1 },
      { tier: 'secondary', muscles: ['back'], count: 1 },
      { tier: 'isolation', muscles: ['chest'], count: 1 },
      { tier: 'isolation', muscles: ['back'], count: 1 },
    ],
  },
  'shoulders-arms': {
    name: 'Shoulders & Arms', muscles: [MUSCLES.SHOULDERS, MUSCLES.BICEPS, MUSCLES.TRICEPS],
    slots: [
      { tier: 'primary', muscles: ['shoulders'], count: 1 },
      { tier: 'isolation', muscles: ['shoulders'], count: 2 },
      { tier: 'secondary', muscles: ['biceps'], count: 1 },
      { tier: 'isolation', muscles: ['biceps'], count: 1 },
      { tier: 'secondary', muscles: ['triceps'], count: 1 },
      { tier: 'isolation', muscles: ['triceps'], count: 1 },
    ],
  },
  legs: {
    name: 'Legs', muscles: [MUSCLES.QUADS, MUSCLES.HAMSTRINGS, MUSCLES.GLUTES, MUSCLES.CALVES],
    slots: [
      { tier: 'primary', muscles: ['quads'], count: 1 },
      { tier: 'primary', muscles: ['hamstrings'], count: 1 },
      { tier: 'secondary', muscles: ['quads', 'glutes'], count: 1 },
      { tier: 'isolation', muscles: ['hamstrings'], count: 1 },
      { tier: 'isolation', muscles: ['quads'], count: 1 },
      { tier: 'isolation', muscles: ['calves'], count: 1 },
    ],
  },
  push: {
    name: 'Push', muscles: [MUSCLES.CHEST, MUSCLES.SHOULDERS, MUSCLES.TRICEPS],
    slots: [
      { tier: 'primary', muscles: ['chest'], count: 1 },
      { tier: 'primary', muscles: ['shoulders'], count: 1 },
      { tier: 'secondary', muscles: ['chest'], count: 1 },
      { tier: 'isolation', muscles: ['shoulders'], count: 1 },
      { tier: 'isolation', muscles: ['chest'], count: 1 },
      { tier: 'isolation', muscles: ['triceps'], count: 2 },
    ],
  },
  pull: {
    name: 'Pull', muscles: [MUSCLES.BACK, MUSCLES.BICEPS],
    slots: [
      { tier: 'primary', muscles: ['back'], count: 2 },
      { tier: 'secondary', muscles: ['back'], count: 1 },
      { tier: 'isolation', muscles: ['back'], count: 1 },
      { tier: 'secondary', muscles: ['biceps'], count: 1 },
      { tier: 'isolation', muscles: ['biceps'], count: 2 },
    ],
  },
  upper: {
    name: 'Upper', muscles: [MUSCLES.CHEST, MUSCLES.BACK, MUSCLES.SHOULDERS, MUSCLES.BICEPS, MUSCLES.TRICEPS],
    slots: [
      { tier: 'primary', muscles: ['chest'], count: 1 },
      { tier: 'primary', muscles: ['back'], count: 1 },
      { tier: 'secondary', muscles: ['shoulders'], count: 1 },
      { tier: 'secondary', muscles: ['back'], count: 1 },
      { tier: 'isolation', muscles: ['biceps'], count: 1 },
      { tier: 'isolation', muscles: ['triceps'], count: 1 },
      { tier: 'isolation', muscles: ['shoulders'], count: 1 },
    ],
  },
  lower: {
    name: 'Lower', muscles: [MUSCLES.QUADS, MUSCLES.HAMSTRINGS, MUSCLES.GLUTES, MUSCLES.CALVES, MUSCLES.CORE],
    slots: [
      { tier: 'primary', muscles: ['quads'], count: 1 },
      { tier: 'primary', muscles: ['hamstrings'], count: 1 },
      { tier: 'secondary', muscles: ['quads', 'glutes'], count: 1 },
      { tier: 'isolation', muscles: ['hamstrings'], count: 1 },
      { tier: 'isolation', muscles: ['calves'], count: 1 },
      { tier: 'isolation', muscles: ['core'], count: 1 },
    ],
  },
  'full-a': {
    name: 'Full Body A', muscles: [MUSCLES.QUADS, MUSCLES.CHEST, MUSCLES.BACK],
    slots: [
      { tier: 'primary', muscles: ['quads'], count: 1 },
      { tier: 'primary', muscles: ['chest'], count: 1 },
      { tier: 'primary', muscles: ['back'], count: 1 },
      { tier: 'isolation', muscles: ['shoulders'], count: 1 },
      { tier: 'isolation', muscles: ['biceps'], count: 1 },
      { tier: 'isolation', muscles: ['triceps'], count: 1 },
    ],
  },
  'full-b': {
    name: 'Full Body B', muscles: [MUSCLES.HAMSTRINGS, MUSCLES.SHOULDERS, MUSCLES.BACK],
    slots: [
      { tier: 'primary', muscles: ['hamstrings'], count: 1 },
      { tier: 'primary', muscles: ['shoulders'], count: 1 },
      { tier: 'secondary', muscles: ['back'], count: 1 },
      { tier: 'secondary', muscles: ['chest'], count: 1 },
      { tier: 'isolation', muscles: ['calves'], count: 1 },
      { tier: 'isolation', muscles: ['core'], count: 1 },
    ],
  },
  arms: {
    name: 'Arms', muscles: [MUSCLES.BICEPS, MUSCLES.TRICEPS],
    slots: [
      { tier: 'secondary', muscles: ['biceps'], count: 1 },
      { tier: 'secondary', muscles: ['triceps'], count: 1 },
      { tier: 'isolation', muscles: ['biceps'], count: 2 },
      { tier: 'isolation', muscles: ['triceps'], count: 2 },
      { tier: 'isolation', muscles: ['forearms'], count: 1 },
    ],
  },
  'chest-tris': {
    name: 'Chest & Triceps', muscles: [MUSCLES.CHEST, MUSCLES.TRICEPS],
    slots: [
      { tier: 'primary', muscles: ['chest'], count: 1 },
      { tier: 'secondary', muscles: ['chest'], count: 2 },
      { tier: 'isolation', muscles: ['chest'], count: 1 },
      { tier: 'secondary', muscles: ['triceps'], count: 1 },
      { tier: 'isolation', muscles: ['triceps'], count: 2 },
    ],
  },
  'back-bis': {
    name: 'Back & Biceps', muscles: [MUSCLES.BACK, MUSCLES.BICEPS],
    slots: [
      { tier: 'primary', muscles: ['back'], count: 2 },
      { tier: 'secondary', muscles: ['back'], count: 1 },
      { tier: 'isolation', muscles: ['back'], count: 1 },
      { tier: 'secondary', muscles: ['biceps'], count: 1 },
      { tier: 'isolation', muscles: ['biceps'], count: 2 },
    ],
  },
};

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, muscles: t.muscles }));
}

export function getTemplate(id) {
  return TEMPLATES[id] ? { id, ...TEMPLATES[id] } : null;
}

// ── Presets ───────────────────────────────────────────────────────────────
// A preset is a rotation plus a default weekday assignment.

export const PRESETS = {
  'ppl-arnold': {
    id: 'ppl-arnold',
    name: 'Chest & Back / Shoulders & Arms / Legs',
    description: 'Arnold split. Each muscle twice a week over six days.',
    rotation: ['chest-back', 'shoulders-arms', 'legs'],
    defaultDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'],
  },
  'push-pull-legs': {
    id: 'push-pull-legs',
    name: 'Push / Pull / Legs',
    description: 'The standard six-day rotation.',
    rotation: ['push', 'pull', 'legs'],
    defaultDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'],
  },
  'upper-lower': {
    id: 'upper-lower',
    name: 'Upper / Lower',
    description: 'Four days, alternating upper and lower.',
    rotation: ['upper', 'lower'],
    defaultDays: ['Mon', 'Tue', 'Thu', 'Fri'],
  },
  'bro-split': {
    id: 'bro-split',
    name: 'Chest & Tris / Back & Bis / Legs / Shoulders & Arms',
    description: 'Classic body-part split. High volume per muscle, once a week.',
    rotation: ['chest-tris', 'back-bis', 'legs', 'shoulders-arms'],
    defaultDays: ['Mon', 'Tue', 'Thu', 'Fri'],
  },
  'full-body': {
    id: 'full-body',
    name: 'Full Body',
    description: 'Everything every session. Best at three days a week.',
    rotation: ['full-a', 'full-b'],
    defaultDays: ['Mon', 'Wed', 'Fri'],
  },
  'ppl-arms': {
    id: 'ppl-arms',
    name: 'Push / Pull / Legs / Arms',
    description: 'PPL with a dedicated arm day.',
    rotation: ['push', 'pull', 'legs', 'arms'],
    defaultDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'],
  },
};

export function listPresets() {
  return Object.values(PRESETS).map((p) => ({
    id: p.id, name: p.name, description: p.description,
    dayNames: p.rotation.map((t) => TEMPLATES[t].name),
    defaultDays: p.defaultDays,
  }));
}

let uid = 0;
const newId = () => `d${Date.now().toString(36)}${(uid++).toString(36)}`;

/** Build a full editable plan from a preset and a set of training weekdays. */
export function planFromPreset(presetId, trainingDays) {
  const preset = PRESETS[presetId] || PRESETS['ppl-arnold'];
  const days = preset.rotation.map((templateId) => {
    const t = TEMPLATES[templateId];
    return {
      id: newId(),
      name: t.name,
      muscles: t.muscles,
      slots: t.slots,
      exercises: null,       // null = auto-filled from the library
      templateId,
    };
  });

  const ordered = DAYS.filter((d) => (trainingDays || preset.defaultDays).includes(d));
  const week = {};
  for (const d of DAYS) week[d] = null;
  ordered.forEach((d, i) => { week[d] = days[i % days.length].id; });

  return { presetId, days, week };
}

/** An empty plan, for someone building a routine from scratch. */
export function blankPlan() {
  const week = {};
  for (const d of DAYS) week[d] = null;
  return { presetId: null, days: [], week };
}

export function newCustomDay(name = 'New workout', muscles = []) {
  return {
    id: newId(),
    name,
    muscles,
    slots: [],
    exercises: [],   // custom days start pinned and empty — you pick the lifts
    templateId: null,
  };
}

export function getDay(plan, dayId) {
  return plan?.days.find((d) => d.id === dayId) || null;
}

/** Weekdays in week order that have a workout assigned, with their day object. */
export function schedule(plan) {
  if (!plan) return [];
  return DAYS
    .filter((d) => plan.week[d])
    .map((d) => {
      const day = getDay(plan, plan.week[d]);
      return day ? { day: d, dayId: day.id, name: day.name } : null;
    })
    .filter(Boolean);
}

/** How many earlier weekdays this week already run the same workout. */
export function occurrenceIndex(plan, weekday) {
  const dayId = plan?.week?.[weekday];
  if (!dayId) return 0;
  const idx = DAYS.indexOf(weekday);
  return DAYS.slice(0, idx).filter((d) => plan.week[d] === dayId).length;
}

/**
 * Resolve one workout day into a concrete exercise list.
 *
 * A PINNED day returns exactly what you chose. An AUTO day fills its slots from
 * the library, favorites first, rotating accessories on the week's second pass
 * while holding the primary compounds steady.
 *
 * @returns {{dayId, name, exercises: Array}}
 */
export function buildWorkout({ plan, dayId, equipment, favorites = [], rotation = 0 }) {
  const day = getDay(plan, dayId);
  if (!day) return { dayId, name: 'Unknown', exercises: [] };

  // Pinned: the user chose these.
  if (Array.isArray(day.exercises)) {
    const list = day.exercises
      .map((entry) => {
        const id = typeof entry === 'string' ? entry : entry.exerciseId;
        const meta = getExercise(id);
        if (!meta) return null;
        return { ...shape(meta), sets: typeof entry === 'object' ? entry.sets : undefined };
      })
      .filter(Boolean);
    return { dayId: day.id, name: day.name, exercises: list };
  }

  // Auto: fill the slots.
  const used = new Set();
  const picked = [];

  for (const slot of day.slots || []) {
    const candidates = exercisesFor({ muscles: slot.muscles, equipment, tier: slot.tier })
      .filter((e) => !used.has(e.id));

    const fav = candidates.filter((e) => favorites.includes(e.id));
    const rest = candidates.filter((e) => !favorites.includes(e.id));
    const pool = [...fav, ...rest];
    if (!pool.length) continue;

    // Only rotate accessories — primaries must stay fixed to progress on.
    const offset = slot.tier === 'primary' ? 0 : rotation;

    for (let i = 0; i < slot.count; i++) {
      const choice = pool[(offset + i) % pool.length];
      if (!choice || used.has(choice.id)) continue;
      used.add(choice.id);
      picked.push(choice);
    }
  }

  return { dayId: day.id, name: day.name, exercises: picked.map(shape) };
}

function shape(e) {
  return {
    id: e.id, name: e.name, tier: e.tier, equipment: e.equipment,
    repRange: e.repRange, increment: e.increment, muscles: e.muscles,
    unilateral: e.unilateral, bodyweightLoad: e.bodyweightLoad,
    loading: e.loading, notes: e.notes,
  };
}

/**
 * Migrate a v1 plan ({splitId, trainingDays, schedule}) to the v2 shape.
 * Keeps existing users' weeks intact across the upgrade.
 */
export function migratePlan(old) {
  if (!old) return null;
  if (old.days && old.week) return old; // already v2
  const LEGACY = {
    'ppl-arnold': 'ppl-arnold', 'push-pull-legs': 'push-pull-legs',
    'upper-lower': 'upper-lower', 'full-body': 'full-body',
  };
  return planFromPreset(LEGACY[old.splitId] || 'ppl-arnold', old.trainingDays);
}

export { getExercise };

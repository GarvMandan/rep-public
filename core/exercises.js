// Exercise library. Pure data — no DOM, no storage. Safe to import from RN or a server.
//
// equipment: barbell | dumbbell | cable | machine | smith | bodyweight | band | kettlebell
// muscles:   [primary, ...secondary] — index 0 drives which section it browses under
// tier:      "primary"   = heavy compound, low reps, drives the session
//            "secondary" = compound accessory, moderate reps
//            "isolation" = single joint, higher reps
// increment: smallest sensible weight jump (lbs) for this lift on a good day.
// loading:   how the weight is actually put on the lift. Drives plate math:
//            "barbell"  → bar + pairs of plates    (plate breakdown shown)
//            "pair"     → one dumbbell per hand    (weight is per hand)
//            "single"   → one implement, total     (kettlebell, one-arm DB row)
//            "stack"    → a pin-loaded weight stack (no plate math)
//            "plate"    → plate-loaded machine, no bar weight
//            "body"     → bodyweight; `weight` means added load
// aliases:   extra search terms. What people actually type, including gym slang.

export const MUSCLES = {
  CHEST: 'chest',
  BACK: 'back',
  SHOULDERS: 'shoulders',
  BICEPS: 'biceps',
  TRICEPS: 'triceps',
  FOREARMS: 'forearms',
  QUADS: 'quads',
  HAMSTRINGS: 'hamstrings',
  GLUTES: 'glutes',
  CALVES: 'calves',
  CORE: 'core',
  TRAPS: 'traps',
};

// Display order for browsing — push, pull, legs, then the small stuff.
export const MUSCLE_ORDER = [
  MUSCLES.CHEST, MUSCLES.BACK, MUSCLES.SHOULDERS, MUSCLES.TRAPS,
  MUSCLES.BICEPS, MUSCLES.TRICEPS, MUSCLES.FOREARMS,
  MUSCLES.QUADS, MUSCLES.HAMSTRINGS, MUSCLES.GLUTES, MUSCLES.CALVES,
  MUSCLES.CORE,
];

export const MUSCLE_LABELS = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', traps: 'Traps',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
  core: 'Core',
};

export const EQUIPMENT = [
  'barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight', 'band', 'kettlebell',
];

export const EQUIPMENT_LABELS = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine',
  smith: 'Smith machine', bodyweight: 'Bodyweight', band: 'Band', kettlebell: 'Kettlebell',
};

// Default loading style per equipment type, overridable per exercise.
const DEFAULT_LOADING = {
  barbell: 'barbell', dumbbell: 'pair', cable: 'stack', machine: 'stack',
  smith: 'barbell', bodyweight: 'body', band: 'stack', kettlebell: 'single',
};

const P = (id, name, muscles, equipment, tier, increment, repRange, opts = {}) => ({
  id, name, muscles, equipment, tier, increment, repRange,
  loading: opts.loading || DEFAULT_LOADING[equipment] || 'stack',
  unilateral: opts.unilateral || false,
  bodyweightLoad: equipment === 'bodyweight' || opts.bodyweightLoad || false,
  aliases: opts.aliases || [],
  notes: opts.notes || '',
});

export const EXERCISES = [
  // ─── Chest ──────────────────────────────────────────────────────────────
  P('bb-bench', 'Barbell Bench Press', ['chest', 'triceps', 'shoulders'], 'barbell', 'primary', 5, [5, 8], { aliases: ['flat bench', 'bench press', 'bp'] }),
  P('bb-incline', 'Incline Barbell Press', ['chest', 'shoulders'], 'barbell', 'primary', 5, [6, 10], { aliases: ['incline bench'] }),
  P('bb-decline', 'Decline Barbell Press', ['chest', 'triceps'], 'barbell', 'secondary', 5, [6, 10], { aliases: ['decline bench'] }),
  P('db-bench', 'Dumbbell Bench Press', ['chest', 'triceps'], 'dumbbell', 'primary', 5, [6, 10], { aliases: ['flat db press', 'db bench'] }),
  P('db-incline', 'Incline Dumbbell Press', ['chest', 'shoulders'], 'dumbbell', 'primary', 5, [8, 12], { aliases: ['incline db press'] }),
  P('db-decline', 'Decline Dumbbell Press', ['chest'], 'dumbbell', 'secondary', 5, [8, 12]),
  P('smith-bench', 'Smith Machine Bench Press', ['chest', 'triceps'], 'smith', 'secondary', 5, [8, 12]),
  P('smith-incline', 'Smith Machine Incline Press', ['chest', 'shoulders'], 'smith', 'secondary', 5, [8, 12]),
  P('machine-chest-press', 'Machine Chest Press', ['chest', 'triceps'], 'machine', 'secondary', 5, [8, 12], { aliases: ['seated chest press'] }),
  P('machine-incline-press', 'Machine Incline Press', ['chest', 'shoulders'], 'machine', 'secondary', 5, [8, 12]),
  P('hammer-press', 'Hammer Strength Chest Press', ['chest', 'triceps'], 'machine', 'secondary', 5, [8, 12], { loading: 'plate', aliases: ['plate loaded press'] }),
  P('pec-deck', 'Pec Deck', ['chest'], 'machine', 'isolation', 5, [10, 15], { aliases: ['machine fly', 'butterfly'] }),
  P('cable-fly', 'Cable Fly', ['chest'], 'cable', 'isolation', 5, [10, 15], { aliases: ['cable crossover', 'crossover'] }),
  P('low-cable-fly', 'Low-to-High Cable Fly', ['chest'], 'cable', 'isolation', 5, [12, 15], { aliases: ['incline cable fly'] }),
  P('high-cable-fly', 'High-to-Low Cable Fly', ['chest'], 'cable', 'isolation', 5, [12, 15], { aliases: ['decline cable fly'] }),
  P('db-fly', 'Dumbbell Fly', ['chest'], 'dumbbell', 'isolation', 5, [10, 15], { aliases: ['flat fly'] }),
  P('incline-db-fly', 'Incline Dumbbell Fly', ['chest'], 'dumbbell', 'isolation', 5, [10, 15]),
  P('db-pullover', 'Dumbbell Pullover', ['chest', 'back'], 'dumbbell', 'isolation', 5, [10, 15], { loading: 'single' }),
  P('dips', 'Chest Dip', ['chest', 'triceps'], 'bodyweight', 'secondary', 5, [6, 12], { aliases: ['weighted dip', 'dips'] }),
  P('pushup', 'Push-Up', ['chest', 'triceps'], 'bodyweight', 'isolation', 0, [10, 25], { aliases: ['press up'] }),
  P('deficit-pushup', 'Deficit Push-Up', ['chest', 'triceps'], 'bodyweight', 'isolation', 0, [8, 20], { aliases: ['ring pushup'] }),

  // ─── Back ───────────────────────────────────────────────────────────────
  P('deadlift', 'Conventional Deadlift', ['back', 'hamstrings', 'glutes'], 'barbell', 'primary', 10, [3, 6], { aliases: ['dl', 'conventional'] }),
  P('sumo-deadlift', 'Sumo Deadlift', ['back', 'glutes', 'quads'], 'barbell', 'primary', 10, [3, 6], { aliases: ['sumo'] }),
  P('trap-bar-deadlift', 'Trap Bar Deadlift', ['back', 'quads', 'glutes'], 'barbell', 'primary', 10, [5, 8], { aliases: ['hex bar'] }),
  P('rack-pull', 'Rack Pull', ['back', 'traps'], 'barbell', 'secondary', 10, [5, 8]),
  P('bb-row', 'Barbell Row', ['back', 'biceps'], 'barbell', 'primary', 5, [6, 10], { aliases: ['bent over row', 'pendlay'] }),
  P('pendlay-row', 'Pendlay Row', ['back'], 'barbell', 'primary', 5, [5, 8], { aliases: ['dead stop row'] }),
  P('tbar-row', 'T-Bar Row', ['back'], 'barbell', 'secondary', 5, [8, 12], { loading: 'plate' }),
  P('pullup', 'Pull-Up', ['back', 'biceps'], 'bodyweight', 'primary', 5, [5, 10], { aliases: ['weighted pullup', 'pull up'] }),
  P('chinup', 'Chin-Up', ['back', 'biceps'], 'bodyweight', 'primary', 5, [5, 10], { aliases: ['chin up', 'supinated pullup'] }),
  P('neutral-pullup', 'Neutral-Grip Pull-Up', ['back', 'biceps'], 'bodyweight', 'primary', 5, [5, 10], { aliases: ['hammer grip pullup'] }),
  P('lat-pulldown', 'Lat Pulldown', ['back', 'biceps'], 'cable', 'primary', 5, [8, 12], { aliases: ['pulldown', 'wide grip pulldown'] }),
  P('close-grip-pulldown', 'Close-Grip Pulldown', ['back', 'biceps'], 'cable', 'secondary', 5, [8, 12], { aliases: ['v bar pulldown'] }),
  P('neutral-pulldown', 'Neutral-Grip Pulldown', ['back', 'biceps'], 'cable', 'secondary', 5, [8, 12]),
  P('db-row', 'One-Arm Dumbbell Row', ['back'], 'dumbbell', 'secondary', 5, [8, 12], { unilateral: true, loading: 'single', aliases: ['single arm row', 'db row'] }),
  P('chest-supported-row', 'Chest-Supported Row', ['back'], 'machine', 'secondary', 5, [8, 12], { aliases: ['seal row', 'incline row'] }),
  P('seated-row', 'Seated Cable Row', ['back', 'biceps'], 'cable', 'secondary', 5, [8, 12], { aliases: ['cable row', 'low row'] }),
  P('machine-row', 'Machine Row', ['back'], 'machine', 'secondary', 5, [8, 12], { aliases: ['hammer row', 'iso row'] }),
  P('meadows-row', 'Meadows Row', ['back'], 'barbell', 'secondary', 5, [8, 12], { unilateral: true, loading: 'plate' }),
  P('inverted-row', 'Inverted Row', ['back', 'biceps'], 'bodyweight', 'secondary', 5, [8, 15], { aliases: ['body row', 'ring row'] }),
  P('straight-arm-pulldown', 'Straight-Arm Pulldown', ['back'], 'cable', 'isolation', 5, [10, 15], { aliases: ['lat pushdown'] }),
  P('face-pull', 'Face Pull', ['back', 'shoulders'], 'cable', 'isolation', 5, [12, 20], { aliases: ['rear delt cable'] }),
  P('cable-pullover', 'Cable Pullover', ['back'], 'cable', 'isolation', 5, [12, 15]),
  P('back-extension', 'Back Extension', ['back', 'hamstrings', 'glutes'], 'bodyweight', 'isolation', 5, [10, 20], { aliases: ['hyperextension', '45 degree'] }),
  P('good-morning', 'Good Morning', ['hamstrings', 'back'], 'barbell', 'secondary', 5, [8, 12]),

  // ─── Traps ──────────────────────────────────────────────────────────────
  P('bb-shrug', 'Barbell Shrug', ['traps'], 'barbell', 'isolation', 10, [10, 15], { aliases: ['shrugs'] }),
  P('db-shrug', 'Dumbbell Shrug', ['traps'], 'dumbbell', 'isolation', 5, [10, 15]),
  P('cable-shrug', 'Cable Shrug', ['traps'], 'cable', 'isolation', 5, [12, 20]),

  // ─── Shoulders ──────────────────────────────────────────────────────────
  P('ohp', 'Overhead Press', ['shoulders', 'triceps'], 'barbell', 'primary', 5, [5, 8], { aliases: ['military press', 'strict press', 'ohp', 'shoulder press'] }),
  P('push-press', 'Push Press', ['shoulders', 'triceps'], 'barbell', 'primary', 5, [3, 6]),
  P('db-ohp', 'Seated Dumbbell Press', ['shoulders', 'triceps'], 'dumbbell', 'primary', 5, [6, 10], { aliases: ['db shoulder press', 'seated press'] }),
  P('arnold-press', 'Arnold Press', ['shoulders'], 'dumbbell', 'secondary', 5, [8, 12]),
  P('smith-ohp', 'Smith Machine Shoulder Press', ['shoulders'], 'smith', 'secondary', 5, [8, 12]),
  P('machine-shoulder-press', 'Machine Shoulder Press', ['shoulders', 'triceps'], 'machine', 'secondary', 5, [8, 12]),
  P('lateral-raise', 'Dumbbell Lateral Raise', ['shoulders'], 'dumbbell', 'isolation', 2.5, [12, 20], { aliases: ['side raise', 'lat raise', 'side delt'] }),
  P('cable-lateral', 'Cable Lateral Raise', ['shoulders'], 'cable', 'isolation', 2.5, [12, 20], { unilateral: true, aliases: ['cable side raise'] }),
  P('machine-lateral', 'Machine Lateral Raise', ['shoulders'], 'machine', 'isolation', 5, [12, 20]),
  P('lean-away-lateral', 'Lean-Away Lateral Raise', ['shoulders'], 'dumbbell', 'isolation', 2.5, [12, 20], { unilateral: true }),
  P('rear-delt-fly', 'Rear Delt Fly', ['shoulders'], 'dumbbell', 'isolation', 2.5, [12, 20], { aliases: ['reverse fly', 'bent over fly'] }),
  P('reverse-pec-deck', 'Reverse Pec Deck', ['shoulders'], 'machine', 'isolation', 5, [12, 20], { aliases: ['rear delt machine'] }),
  P('cable-rear-delt', 'Cable Rear Delt Fly', ['shoulders'], 'cable', 'isolation', 2.5, [12, 20], { aliases: ['reverse cable fly'] }),
  P('front-raise', 'Front Raise', ['shoulders'], 'dumbbell', 'isolation', 2.5, [12, 15]),
  P('upright-row', 'Upright Row', ['shoulders', 'traps'], 'barbell', 'isolation', 5, [10, 15]),
  P('landmine-press', 'Landmine Press', ['shoulders', 'chest'], 'barbell', 'secondary', 5, [8, 12], { unilateral: true, loading: 'plate' }),
  P('pike-pushup', 'Pike Push-Up', ['shoulders', 'triceps'], 'bodyweight', 'secondary', 0, [8, 15]),

  // ─── Biceps ─────────────────────────────────────────────────────────────
  P('bb-curl', 'Barbell Curl', ['biceps'], 'barbell', 'secondary', 5, [8, 12], { aliases: ['straight bar curl'] }),
  P('ez-curl', 'EZ-Bar Curl', ['biceps'], 'barbell', 'secondary', 5, [8, 12], { aliases: ['ez bar'] }),
  P('db-curl', 'Dumbbell Curl', ['biceps'], 'dumbbell', 'isolation', 5, [8, 12], { aliases: ['bicep curl', 'alternating curl'] }),
  P('incline-db-curl', 'Incline Dumbbell Curl', ['biceps'], 'dumbbell', 'isolation', 5, [10, 15], { aliases: ['incline curl'] }),
  P('hammer-curl', 'Hammer Curl', ['biceps', 'forearms'], 'dumbbell', 'isolation', 5, [10, 15], { aliases: ['neutral curl'] }),
  P('preacher-curl', 'Preacher Curl', ['biceps'], 'machine', 'isolation', 5, [10, 15], { aliases: ['scott curl'] }),
  P('db-preacher', 'Dumbbell Preacher Curl', ['biceps'], 'dumbbell', 'isolation', 5, [10, 15], { unilateral: true }),
  P('cable-curl', 'Cable Curl', ['biceps'], 'cable', 'isolation', 5, [10, 15]),
  P('bayesian-curl', 'Bayesian Cable Curl', ['biceps'], 'cable', 'isolation', 2.5, [10, 15], { unilateral: true, aliases: ['behind body curl'] }),
  P('concentration-curl', 'Concentration Curl', ['biceps'], 'dumbbell', 'isolation', 5, [10, 15], { unilateral: true, loading: 'single' }),
  P('spider-curl', 'Spider Curl', ['biceps'], 'dumbbell', 'isolation', 5, [10, 15]),
  P('drag-curl', 'Drag Curl', ['biceps'], 'barbell', 'isolation', 5, [10, 15]),

  // ─── Triceps ────────────────────────────────────────────────────────────
  P('close-grip-bench', 'Close-Grip Bench Press', ['triceps', 'chest'], 'barbell', 'secondary', 5, [6, 10], { aliases: ['cgbp', 'close grip'] }),
  P('skullcrusher', 'Skullcrusher', ['triceps'], 'barbell', 'isolation', 5, [8, 12], { aliases: ['lying tricep extension', 'french press'] }),
  P('tricep-pushdown', 'Tricep Pushdown', ['triceps'], 'cable', 'isolation', 5, [10, 15], { aliases: ['pushdown', 'rope pushdown', 'cable pushdown'] }),
  P('rope-pushdown', 'Rope Pushdown', ['triceps'], 'cable', 'isolation', 5, [12, 15], { aliases: ['rope tricep'] }),
  P('overhead-ext', 'Overhead Tricep Extension', ['triceps'], 'cable', 'isolation', 5, [10, 15], { aliases: ['overhead cable', 'french press'] }),
  P('db-overhead-ext', 'Dumbbell Overhead Extension', ['triceps'], 'dumbbell', 'isolation', 5, [10, 15], { loading: 'single' }),
  P('tricep-dip', 'Tricep Dip', ['triceps'], 'bodyweight', 'secondary', 5, [8, 12], { aliases: ['bench dip', 'parallel dip'] }),
  P('db-kickback', 'Tricep Kickback', ['triceps'], 'dumbbell', 'isolation', 2.5, [12, 20], { unilateral: true }),
  P('jm-press', 'JM Press', ['triceps'], 'barbell', 'secondary', 5, [8, 12]),
  P('diamond-pushup', 'Diamond Push-Up', ['triceps', 'chest'], 'bodyweight', 'isolation', 0, [10, 20], { aliases: ['close grip pushup'] }),
  P('machine-dip', 'Machine Dip', ['triceps', 'chest'], 'machine', 'secondary', 5, [10, 15], { aliases: ['assisted dip'] }),

  // ─── Forearms ───────────────────────────────────────────────────────────
  P('wrist-curl', 'Wrist Curl', ['forearms'], 'barbell', 'isolation', 5, [15, 20]),
  P('reverse-curl', 'Reverse Curl', ['forearms', 'biceps'], 'barbell', 'isolation', 5, [12, 15], { aliases: ['pronated curl'] }),
  P('farmers-walk', "Farmer's Walk", ['forearms', 'traps', 'core'], 'dumbbell', 'secondary', 5, [30, 60], { notes: 'Reps = seconds carried.' }),

  // ─── Quads ──────────────────────────────────────────────────────────────
  P('squat', 'Barbell Back Squat', ['quads', 'glutes'], 'barbell', 'primary', 10, [5, 8], { aliases: ['squat', 'back squat'] }),
  P('front-squat', 'Front Squat', ['quads'], 'barbell', 'primary', 5, [5, 8]),
  P('high-bar-squat', 'High-Bar Squat', ['quads', 'glutes'], 'barbell', 'primary', 10, [5, 8]),
  P('safety-bar-squat', 'Safety Bar Squat', ['quads', 'glutes'], 'barbell', 'primary', 10, [5, 8], { aliases: ['ssb'] }),
  P('smith-squat', 'Smith Machine Squat', ['quads', 'glutes'], 'smith', 'secondary', 10, [8, 12]),
  P('leg-press', 'Leg Press', ['quads', 'glutes'], 'machine', 'primary', 10, [8, 12], { loading: 'plate', aliases: ['45 degree press'] }),
  P('hack-squat', 'Hack Squat', ['quads'], 'machine', 'primary', 10, [8, 12], { loading: 'plate' }),
  P('pendulum-squat', 'Pendulum Squat', ['quads', 'glutes'], 'machine', 'secondary', 10, [8, 12], { loading: 'plate' }),
  P('goblet-squat', 'Goblet Squat', ['quads', 'glutes'], 'dumbbell', 'secondary', 5, [10, 15], { loading: 'single' }),
  P('bulgarian-split', 'Bulgarian Split Squat', ['quads', 'glutes'], 'dumbbell', 'secondary', 5, [8, 12], { unilateral: true, aliases: ['bss', 'rear foot elevated', 'split squat'] }),
  P('walking-lunge', 'Walking Lunge', ['quads', 'glutes'], 'dumbbell', 'secondary', 5, [10, 15], { unilateral: true, aliases: ['lunges'] }),
  P('reverse-lunge', 'Reverse Lunge', ['quads', 'glutes'], 'dumbbell', 'secondary', 5, [10, 15], { unilateral: true }),
  P('step-up', 'Step-Up', ['quads', 'glutes'], 'dumbbell', 'secondary', 5, [10, 15], { unilateral: true }),
  P('leg-extension', 'Leg Extension', ['quads'], 'machine', 'isolation', 5, [10, 15], { aliases: ['quad extension'] }),
  P('sissy-squat', 'Sissy Squat', ['quads'], 'bodyweight', 'isolation', 5, [10, 15]),

  // ─── Hamstrings ─────────────────────────────────────────────────────────
  P('rdl', 'Romanian Deadlift', ['hamstrings', 'glutes'], 'barbell', 'primary', 5, [6, 10], { aliases: ['rdl', 'romanian'] }),
  P('stiff-leg-deadlift', 'Stiff-Leg Deadlift', ['hamstrings', 'back'], 'barbell', 'primary', 5, [6, 10], { aliases: ['sldl'] }),
  P('db-rdl', 'Dumbbell RDL', ['hamstrings', 'glutes'], 'dumbbell', 'secondary', 5, [8, 12]),
  P('single-leg-rdl', 'Single-Leg RDL', ['hamstrings', 'glutes'], 'dumbbell', 'secondary', 5, [8, 12], { unilateral: true, loading: 'single' }),
  P('leg-curl', 'Lying Leg Curl', ['hamstrings'], 'machine', 'isolation', 5, [10, 15], { aliases: ['hamstring curl', 'leg curl'] }),
  P('seated-leg-curl', 'Seated Leg Curl', ['hamstrings'], 'machine', 'isolation', 5, [10, 15]),
  P('nordic-curl', 'Nordic Hamstring Curl', ['hamstrings'], 'bodyweight', 'secondary', 5, [5, 10], { aliases: ['nordics'] }),
  P('glute-ham-raise', 'Glute-Ham Raise', ['hamstrings', 'glutes'], 'bodyweight', 'secondary', 5, [8, 12], { aliases: ['ghr'] }),

  // ─── Glutes ─────────────────────────────────────────────────────────────
  P('hip-thrust', 'Barbell Hip Thrust', ['glutes', 'hamstrings'], 'barbell', 'primary', 10, [8, 12], { aliases: ['thrust'] }),
  P('glute-bridge', 'Glute Bridge', ['glutes'], 'barbell', 'secondary', 10, [10, 15]),
  P('machine-hip-thrust', 'Machine Hip Thrust', ['glutes'], 'machine', 'secondary', 10, [10, 15]),
  P('cable-kickback', 'Cable Glute Kickback', ['glutes'], 'cable', 'isolation', 5, [12, 20], { unilateral: true }),
  P('hip-abduction', 'Hip Abduction', ['glutes'], 'machine', 'isolation', 5, [15, 20], { aliases: ['abductor machine'] }),

  // ─── Calves ─────────────────────────────────────────────────────────────
  P('calf-raise', 'Standing Calf Raise', ['calves'], 'machine', 'isolation', 5, [10, 20], { aliases: ['calf raise'] }),
  P('seated-calf', 'Seated Calf Raise', ['calves'], 'machine', 'isolation', 5, [12, 20]),
  P('leg-press-calf', 'Leg Press Calf Raise', ['calves'], 'machine', 'isolation', 10, [12, 20], { loading: 'plate' }),
  P('db-calf-raise', 'Dumbbell Calf Raise', ['calves'], 'dumbbell', 'isolation', 5, [15, 20]),

  // ─── Core ───────────────────────────────────────────────────────────────
  P('hanging-leg-raise', 'Hanging Leg Raise', ['core'], 'bodyweight', 'secondary', 5, [10, 20], { aliases: ['leg raise', 'knee raise'] }),
  P('cable-crunch', 'Cable Crunch', ['core'], 'cable', 'isolation', 5, [12, 20], { aliases: ['rope crunch', 'kneeling crunch'] }),
  P('ab-wheel', 'Ab Wheel Rollout', ['core'], 'bodyweight', 'secondary', 0, [8, 15], { aliases: ['rollout'] }),
  P('plank', 'Plank', ['core'], 'bodyweight', 'isolation', 0, [30, 90], { notes: 'Reps = seconds held.' }),
  P('hollow-hold', 'Hollow Body Hold', ['core'], 'bodyweight', 'isolation', 0, [20, 60], { notes: 'Reps = seconds held.' }),
  P('russian-twist', 'Russian Twist', ['core'], 'dumbbell', 'isolation', 5, [15, 25], { loading: 'single' }),
  P('pallof-press', 'Pallof Press', ['core'], 'cable', 'isolation', 5, [12, 15], { unilateral: true }),
  P('decline-situp', 'Decline Sit-Up', ['core'], 'bodyweight', 'isolation', 5, [12, 20]),
  P('machine-crunch', 'Machine Crunch', ['core'], 'machine', 'isolation', 5, [12, 20]),
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id) {
  return BY_ID.get(id) || null;
}

export function exercisesFor({ muscles = [], equipment = null, tier = null } = {}) {
  return EXERCISES.filter((e) => {
    if (muscles.length && !e.muscles.some((m) => muscles.includes(m))) return false;
    if (equipment && !equipment.includes(e.equipment)) return false;
    if (tier && e.tier !== tier) return false;
    return true;
  });
}

/**
 * Search the library by name, alias, muscle and equipment.
 *
 * Ranked so that what you typed first is what you meant: a name that starts with
 * the query beats one that merely contains it, which beats an alias hit.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {string[]} [opts.equipment] restrict to equipment the user has
 * @param {string[]} [opts.muscles]   restrict to these muscle groups
 * @param {number}   [opts.limit]
 */
export function searchExercises(query, { equipment = null, muscles = [], limit = 50 } = {}) {
  const pool = exercisesFor({ muscles, equipment });
  const q = String(query || '').trim().toLowerCase();
  if (!q) return pool.slice(0, limit);

  const terms = q.split(/\s+/).filter(Boolean);

  const scored = [];
  for (const e of pool) {
    const name = e.name.toLowerCase();
    const hay = [name, ...e.aliases.map((a) => a.toLowerCase()), e.equipment, ...e.muscles].join(' ');

    // Every term must appear somewhere, so "incline db" narrows instead of widening.
    if (!terms.every((t) => hay.includes(t))) continue;

    let score = 0;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 50;
    if (name.includes(q)) score += 25;
    if (e.aliases.some((a) => a.toLowerCase() === q)) score += 40;
    if (e.aliases.some((a) => a.toLowerCase().includes(q))) score += 15;
    // Word-boundary hits read as more relevant than mid-word coincidences.
    for (const t of terms) if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) score += 8;
    // Nudge compounds up: they're what people search for most.
    score += e.tier === 'primary' ? 3 : e.tier === 'secondary' ? 1 : 0;

    scored.push([score, e]);
  }

  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, limit).map(([, e]) => e);
}

/** Group a list of exercises by their primary muscle, in display order. */
export function groupByMuscle(list) {
  const groups = new Map();
  for (const e of list) {
    const m = e.muscles[0];
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(e);
  }
  return MUSCLE_ORDER.filter((m) => groups.has(m)).map((m) => ({
    muscle: m,
    label: MUSCLE_LABELS[m] || m,
    exercises: groups.get(m),
  }));
}

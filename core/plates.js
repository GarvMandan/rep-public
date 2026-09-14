// Plate math: turn a target weight into what you actually hang on the bar.
//
// Only meaningful for loads you build from plates. A pin-loaded stack or a
// dumbbell off the rack has nothing to compute, so those return null and the UI
// shows nothing rather than a misleading breakdown.

/** Standard commercial-gym setup: 45 lb Olympic bar, pairs of each plate. */
export const DEFAULT_INVENTORY = {
  unit: 'lb',
  barWeight: 45,
  // [plate weight, pairs available]. Pairs, because plates load symmetrically.
  plates: [
    [45, 8], [35, 2], [25, 4], [10, 4], [5, 4], [2.5, 2],
  ],
};

export const PRESET_INVENTORIES = {
  standard: { label: 'Standard (45 lb bar)', ...DEFAULT_INVENTORY },
  micro: {
    label: 'Standard + microplates',
    unit: 'lb', barWeight: 45,
    plates: [[45, 8], [35, 2], [25, 4], [10, 4], [5, 4], [2.5, 2], [1.25, 2]],
  },
  womens: {
    label: "Women's bar (35 lb)",
    unit: 'lb', barWeight: 35,
    plates: [[45, 6], [25, 4], [10, 4], [5, 4], [2.5, 2]],
  },
  kg: {
    label: 'Kilos (20 kg bar)',
    unit: 'kg', barWeight: 20,
    plates: [[25, 6], [20, 4], [15, 2], [10, 4], [5, 4], [2.5, 2], [1.25, 2]],
  },
  home: {
    label: 'Home gym (limited plates)',
    unit: 'lb', barWeight: 45,
    plates: [[45, 2], [25, 2], [10, 2], [5, 2], [2.5, 2]],
  },
};

/**
 * Which plates go on each side to reach `target`.
 *
 * Greedy from the heaviest plate down, limited by how many pairs you own —
 * which is exactly how you'd load it, and optimal for any real plate set.
 *
 * @param {number} target total weight including the bar
 * @param {object} [inventory]
 * @returns {{perSide:Array<[number,number]>, achieved:number, short:number, barOnly:boolean}|null}
 *          null when the target is under the bar. `short` is how much the
 *          available plates couldn't cover.
 */
export function platesFor(target, inventory = DEFAULT_INVENTORY) {
  const bar = inventory.barWeight ?? 45;
  if (!Number.isFinite(target) || target < bar) {
    return target === bar ? { perSide: [], achieved: bar, short: 0, barOnly: true } : null;
  }

  let perSideRemaining = (target - bar) / 2;
  const perSide = [];

  for (const [plate, pairs] of inventory.plates) {
    if (perSideRemaining < plate) continue;
    const count = Math.min(Math.floor(perSideRemaining / plate), pairs);
    if (count > 0) {
      perSide.push([plate, count]);
      perSideRemaining -= plate * count;
    }
  }

  // Floating point: 2.5 + 2.5 + ... drifts. Anything under a gram is zero.
  if (perSideRemaining < 0.01) perSideRemaining = 0;

  const achieved = bar + (target - bar - perSideRemaining * 2);
  return {
    perSide,
    achieved: Math.round(achieved * 100) / 100,
    short: Math.round(perSideRemaining * 2 * 100) / 100,
    barOnly: perSide.length === 0,
  };
}

/**
 * Human-readable loading cue: "45 + 25 per side" or "bar + 2×45, 10".
 * Returns null when plate math doesn't apply to this lift.
 *
 * @param {number} weight the prescribed weight
 * @param {string} loading the exercise's loading style
 * @param {object} [inventory]
 */
export function loadingHint(weight, loading, inventory = DEFAULT_INVENTORY) {
  const unit = inventory.unit || 'lb';

  if (loading === 'pair') {
    return { kind: 'pair', text: `${fmt(weight)} ${unit} in each hand`, perSide: null };
  }
  if (loading === 'single') {
    return { kind: 'single', text: `one ${fmt(weight)} ${unit} implement`, perSide: null };
  }
  if (loading === 'stack') {
    return { kind: 'stack', text: `pin at ${fmt(weight)} ${unit}`, perSide: null };
  }
  if (loading === 'body') {
    return weight > 0
      ? { kind: 'body', text: `+${fmt(weight)} ${unit} added`, perSide: null }
      : { kind: 'body', text: 'bodyweight', perSide: null };
  }

  // barbell and plate-loaded machines get a real breakdown.
  const bar = loading === 'plate' ? 0 : (inventory.barWeight ?? 45);
  const res = platesFor(weight, { ...inventory, barWeight: bar });
  if (!res) {
    return { kind: 'under-bar', text: `under the ${fmt(bar)} ${unit} bar — use dumbbells or a lighter bar`, perSide: null };
  }
  if (res.barOnly) {
    return { kind: 'bar', text: loading === 'plate' ? 'no plates' : 'empty bar', perSide: [] };
  }

  const text = res.perSide.map(([p, n]) => (n > 1 ? `${n}×${fmt(p)}` : fmt(p))).join(' + ');
  return {
    kind: 'plates',
    text: `${text} per side`,
    perSide: res.perSide,
    short: res.short,
    bar,
    unit,
  };
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * Nearest weight actually loadable with this inventory, at or below `target`.
 * Used to keep prescriptions honest when plates run out.
 */
export function nearestLoadable(target, loading, inventory = DEFAULT_INVENTORY) {
  if (loading !== 'barbell' && loading !== 'plate') return target;
  const bar = loading === 'plate' ? 0 : (inventory.barWeight ?? 45);
  const res = platesFor(target, { ...inventory, barWeight: bar });
  return res ? res.achieved : target;
}

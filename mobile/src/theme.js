// The same tokens the web app uses, as plain JS.
// This app commits to a single dark world on purpose: it's operated in a gym,
// often early, often dim.

export const C = {
  ground: '#12151A',
  surface: '#1A1F27',
  surface2: '#222834',
  surface3: '#2A3240',
  line: '#2C3441',
  ink: '#E8ECF2',
  muted: '#8C97A8',
  faint: '#5B6675',

  accent: '#E4FF3A',   // live action only: current set, primary CTA
  accentInk: '#0E1200',

  up: '#4ADE80',
  hold: '#F59E0B',
  down: '#EF4444',
  new: '#60A5FA',
};

// Barlow Condensed isn't available without a font download, and a silent
// fallback would be worse than choosing a real system face. iOS has a genuine
// condensed face; Android's sans is the closest available.
export const F = {
  display: { fontFamily: 'System', fontWeight: '700' },
  body: { fontFamily: 'System' },
  mono: { fontFamily: 'Menlo' },
};

export const S = { pad: 16, gap: 12, radius: 10 };

/** Verdict → [pill background, text color, label] */
export const VERDICT = {
  increase: ['rgba(74,222,128,.14)', C.up, 'Weight up'],
  hold: ['rgba(245,158,11,.14)', C.hold, 'Hold'],
  deload: ['rgba(239,68,68,.14)', C.down, 'Deload'],
  retry: ['rgba(245,158,11,.14)', C.hold, 'Retry'],
  new: ['rgba(96,165,250,.14)', C.new, 'New'],
};

export const fmtW = (n) => (Number.isInteger(n) ? String(n) : String(Number(Number(n).toFixed(2))));
export const fmtVol = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));

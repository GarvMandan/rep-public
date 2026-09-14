// Where the API lives.

export const API_BASE =
  // A test harness can point the app at a different backend without editing
  // this file; nothing else reads this global.
  (typeof window !== 'undefined' && window.__API_OVERRIDE) ||
  ((typeof location !== 'undefined' && location.hostname === 'localhost')
    ? 'http://localhost:8787'
    : 'https://progressive-overload-api.garvmandan.workers.dev');

// From the Google Cloud console. Empty disables the Google button; email and
// password sign-in still work. See server/README.md for the setup steps.
export const GOOGLE_CLIENT_ID = '';

/** Is a backend configured at all? */
export const CLOUD_ENABLED = !!API_BASE;

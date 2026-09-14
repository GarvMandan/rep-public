// Where the API lives.
//
// Set API_BASE to your deployed Worker URL to turn on accounts, sync and
// friends. Left empty the app runs exactly as before: fully local, no network,
// no sign-in prompts. Nothing else in the app needs to change either way.

export const API_BASE =
  // Local wrangler dev when developing on a laptop.
  (typeof location !== 'undefined' && location.hostname === 'localhost')
    ? 'http://localhost:8787'
    : 'https://progressive-overload-api.garvmandan.workers.dev';

// From the Google Cloud console. Empty disables the Google button; email and
// password sign-in still work.
export const GOOGLE_CLIENT_ID = '';

/** Is a backend configured at all? */
export const CLOUD_ENABLED = !!API_BASE;

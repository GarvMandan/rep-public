# Rep Public — iPhone app

The native app. Same engine as the web version: it imports `../core/*.js` directly rather
than copying it, so there is exactly one progression algorithm, one exercise catalog, and
one set of tests.

## Run it on your iPhone

**1. Install Expo Go** from the App Store (free).

**2. Start the dev server** — on your computer:

```bash
cd mobile
npm install      # first time only
npm start
```

**3. Scan the QR code** that appears in the terminal, using your iPhone's **Camera app**.
It opens in Expo Go.

Your phone and computer must be on the same Wi-Fi. If the QR code doesn't connect (common
on corporate or guest networks that isolate devices), use:

```bash
npm run tunnel
```

Slower, but it routes around the network instead of needing a direct connection.

## What to expect

- The screen **stays awake** during a workout, so it doesn't lock between sets.
- Logging a rep gives a **haptic tap** — you feel the set land without looking.
- Data is stored on the phone via AsyncStorage. It survives closing the app, but it is
  **separate from the web version's data** — they're different devices, and there's no
  account or sync yet.
- Closing the app mid-workout is safe. Reopen and the session is exactly where you left it.

## Known limits at this stage

- **This is a dev build, not an installed app.** It lives inside Expo Go and needs
  `npm start` running on your computer to launch. Putting a permanent icon on your home
  screen requires a real build — see below.
- No account, no sync, no backup. Erasing the app or Expo Go erases your history.
- Fonts use the iOS system face rather than the web version's Barlow Condensed. The
  numerals are slightly wider as a result.

## Making it a real installed app

When you want it standalone on your home screen without the dev server:

```bash
npm install -g eas-cli
eas login                       # free Expo account
eas build --profile preview --platform ios
```

For iOS this needs an **Apple Developer account ($99/year)** — Apple requires signing for
installing on a physical device. Without one, Expo Go is the way to run it, and it works
fine for real training; it just needs your computer awake.

## Project layout

```
mobile/
  App.js                 root: tabs, sheet routing
  metro.config.js        points Metro at the repo root so ../core resolves
  src/
    useStore.js          binds core/store.js to React
    storage.js           the AsyncStorage adapter — the entire platform port
    theme.js             design tokens
    components/
      ui.js              buttons, cards, the plate cue
      ExercisePicker.js  searchable catalog, reused by four screens
    screens/
      Setup.js           onboarding
      Today.js           today's prescription
      Session.js         the live workout
      Plan.js            week editor + settings
      Progress.js        stats and charts
      Sheets.js          modals: assign, edit day, swap, history
```

Nothing in `../core/` is mobile-aware. Swapping `storage.js` for an HTTP client is what
turns this into a networked app when accounts arrive.

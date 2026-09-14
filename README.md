# Rep Public

A workout tracker that prescribes your next set instead of just recording your last one.

Tell it your split and your days. It tells you the exercise, the weight, **which plates to put
on each side**, the sets and the reps. You tap the reps you actually hit — and it rewrites the
remaining sets immediately, then rolls the whole exercise forward for next week.

## Run it

```bash
npm start          # → http://localhost:5173
```

The console also prints a LAN address. Open that one on your phone (same wifi) and use it
at the gym — the UI is built for one-handed portrait use.

```bash
npm test           # 95 tests over the engine, plate math, catalog and plan builder
```

No dependencies. Node 20+ for `import.meta.dirname`.

## How the progression works

Double progression, applied at two levels.

**Between sessions** — every set at the top of the rep range → add one increment and reset
to the bottom of the range. Inside the range → same weight, chase one more rep. Below the
bottom → repeat the weight once; miss it twice and it deloads you 10%.

Progression is judged at the session's *top* working weight, so a set you dropped the
weight on mid-workout can't block a promotion you earned on the heavy sets.

**Within a session** — after each set:

| What you did | What the next set becomes |
|---|---|
| Cleared the range by 2+ reps | +1 increment |
| Hit the target | Unchanged |
| Missed by a little | Same weight, rep target lowered to what you got |
| Missed by 2+ below the range | ~10% lighter, so the rest of the sets still land in range |

Increments are per-exercise: 10 lb on a squat, 5 on a bench, 2.5 on a lateral raise.

## Plate math

Every barbell and plate-loaded weight shows what to actually load:

```
bar 45   45  25  10      per side
```

It knows the difference between loading styles, so the cue is never misleading — a barbell
gets a plate breakdown, a dumbbell says *"70 lb in each hand"*, a cable says *"pin at 120"*,
and a plate-loaded machine gets a breakdown with no bar weight. If your plates can't make
the number, it says how much it came up short.

Configure your bar and plates in **Plan → Bar & plates**: standard 45 lb, microplates, a
35 lb bar, kilos, or a limited home set. Plate counts are pairs, and the math respects how
many you actually own.

## Exercise catalog

~150 exercises with search that matches gym vernacular — type `rdl`, `bss`, `cgbp`,
`pushdown`, or `incline db` and you get what you meant. Multi-word queries narrow rather
than widen. Filter by muscle group, or restrict to only the equipment you own.

The picker appears everywhere it's useful: starring favorites during setup, building a
workout, swapping a lift mid-session when the machine is taken, or adding something extra
on the day.

## Building your week

The **Plan** tab is a direct editor for your week:

- **Any workout on any weekday.** Tap a day, pick what runs on it — or make it a rest day.
  The same workout can run as many times a week as you like.
- **Create your own workouts.** Name them, pick the exact exercises, set the set count per
  exercise, reorder them.
- **Auto or manual, per workout.** Preset days start auto-filled: the app picks exercises
  from your equipment and favorites, rotating accessories on the week's second pass while
  holding the primary compounds fixed. Tap *"Pick the exercises myself"* on any day to pin
  it — it materializes the current picks so nothing is lost, then you edit freely. Hand it
  back to the generator any time.
- **Presets as starting points.** Arnold, PPL, PPL+Arms, Upper/Lower, Bro split, Full Body.
  Loading one replaces your week but keeps all logged history and progress.

## Setup

Height, bodyweight and experience seed your starting weights from per-lift bodyweight
ratios — a rough guess that your first real session corrects. Expect the first session of
each lift to be off; adjust with the ± buttons and it learns from there.

## Project layout

```
core/              framework-free, no DOM, no storage calls
  exercises.js       ~150 lifts with tiers, increments, rep ranges, aliases, search
  progression.js     the progression math; every function pure
  plates.js          plate breakdown + loading cues per equipment type
  splits.js          day templates, presets, custom plans, workout generation
  store.js           state, persistence behind a swappable adapter, v1→v2 migration
  progression.test.js
app.html           the entire UI
serve.js           static server
```

`core/` is deliberately free of anything browser-specific. Storage sits behind a three-method
adapter (`get`/`set`/`remove`), so the React Native port swaps in AsyncStorage and the
server port swaps in a DB call — neither touches the engine or the tests.

## Data

Everything lives in this browser's localStorage. **Clearing site data erases your history** —
use Export in the Plan tab for a backup. Import takes that file back. Old saves are migrated
forward automatically, so upgrading never loses progress.

## Next

- React Native / Expo shell reusing `core/` verbatim
- A server + accounts so history syncs across devices
- Per-set RPE as an optional autoregulation input
- Warm-up set suggestions derived from the working weight

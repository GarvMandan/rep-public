# Deploying

The app is hosted on GitHub Pages at:

**https://garvmandan.github.io/rep-public/**

Repo: `GarvMandan/rep-public`. Nothing runs on your computer — GitHub serves it.

## Shipping a change

```bash
git add -A
git commit -m "what changed"
git push
```

Live in about a minute. Watch the **Actions** tab for the "pages build and
deployment" job if you want to see it land.

### One rule: bump the cache version

When you change anything in `core/` or `app.html`, also bump the cache name in
[sw.js](sw.js):

```js
const CACHE = 'overload-v2';   // was v1
```

Phones cache the whole app so it works offline. Without a new cache name they
keep serving the old copy and never see your change. This is the single most
common way to ship an update that appears to do nothing.

## Installing on iPhone

1. Open the URL in **Safari** — Chrome on iOS cannot install PWAs
2. Tap **Share** (square with an up arrow)
3. **Add to Home Screen** → **Add**

You get an icon that opens fullscreen with no browser bar, and works with no
signal.

## If the URL 404s

Check, in order:

1. **Is Pages enabled?** Settings → Pages → Source: *Deploy from a branch*,
   Branch: `main`, folder `/ (root)`, Save.
2. **Is the repo Public?** Pages requires a paid plan on private repos.
   Settings → General → bottom → Change visibility.
3. **Did the build finish?** The Actions tab shows a "pages build and
   deployment" run. The URL 404s until it is green.
4. `.nojekyll` must exist at the repo root — it stops GitHub from running
   Jekyll, which would ignore some files. It is committed already.

## If a change does not show up on your phone

The service worker is serving a cached copy.

1. Confirm you bumped `CACHE` in `sw.js` and pushed
2. On the phone, close the app fully (swipe it away) and reopen
3. Still stale: delete the home-screen icon and re-add it from Safari

## Native app

[mobile/](mobile/) holds a working Expo/React Native build sharing the same
`core/` engine. It needs an Apple Developer account ($99/yr) to install
permanently on an iPhone. See [mobile/README.md](mobile/README.md).

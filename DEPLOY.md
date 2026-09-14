# Deploy to GitHub Pages

One-time setup. After this, the app lives at a permanent HTTPS URL and needs
nothing running on your computer.

## 1. Create the repo

Go to **https://github.com/new**

- **Repository name:** `progressive-overload`
- **Public** (required — GitHub Pages is paid for private repos)
- Do **not** tick "Add a README" — the repo already has one

Click **Create repository**.

## 2. Push

Copy your GitHub username into the first line, then run all of this from the
project folder:

```bash
GH_USER=your-username-here

git remote add origin "https://github.com/$GH_USER/progressive-overload.git"
git push -u origin main
```

Git will ask you to sign in — a browser window opens, approve it there.

## 3. Turn on Pages

On the repo page: **Settings** → **Pages** (left sidebar)

- **Source:** Deploy from a branch
- **Branch:** `main`, folder `/ (root)`
- Click **Save**

Wait about a minute. Your URL:

```
https://<your-username>.github.io/progressive-overload/
```

## 4. Install it on your iPhone

1. Open that URL in **Safari** (must be Safari — Chrome on iOS cannot install PWAs)
2. Tap **Share** (the square with the up arrow)
3. Scroll down, tap **Add to Home Screen**
4. Tap **Add**

Done. It is now an icon on your home screen, opens fullscreen with no browser
bar, and works with no signal.

## Shipping changes later

```bash
git add -A
git commit -m "what changed"
git push
```

Live in about a minute.

**Important:** when you change any file in `core/` or `app.html`, also bump the
cache version in [sw.js](sw.js):

```js
const CACHE = 'overload-v2';   // was v1
```

Otherwise phones keep serving the old cached copy and never see your change.

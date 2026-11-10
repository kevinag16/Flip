# Flip

Count every urge you resist. No resets.

Flip v1 is a home screen web app: plain HTML, CSS and JavaScript, no build step.
Your counts are stored only on your phone, never in this repo.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The app's page |
| `styles.css` | How it looks (light and dark mode) |
| `app.js` | Everything Flip does |
| `captions.js` | Proof lines and Delay replies. Edit this to change the wording. |
| `manifest.webmanifest` | Name, icon and full-screen look on the Home Screen |
| `sw.js` | Saves the app on your phone so it works offline |
| `icons/` | App icons |

## Put it online (GitHub Pages, free)

1. Repo **Settings → General → Danger Zone → Change visibility → Public**. (Free Pages needs a public repo. No personal data is in these files.)
2. On the repo's main page: **Add file → Upload files**, drag in everything from the unzipped `flip` folder (including the `icons` folder), then **Commit changes**.
3. **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main** and folder **/ (root)**, then **Save**.
4. Wait a minute or two. Your app will be at `https://kevinag16.github.io/Flip/`.

## Install on iPhone

1. Open the link in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Always open Flip from the Home Screen icon. Safari and the Home Screen app keep separate counts.

## Back up your counts

Open Flip, tap **⋯ → Export backup**, and save the file to Files or iCloud Drive. Do this every week or two.

## Quick flip from Control Center or the lock screen (optional)

1. In Flip, open an era → **Quick flip link → Copy**.
2. In the **Shortcuts** app: **+ → Add Action → Open URLs**, paste the link, name it (for example "Flip smoking").
3. Add it to **Control Center** (swipe down → **+** → **Add a Control** → **Shortcut**) or the lock screen (press and hold the lock screen → **Customize** → tap a bottom button).
4. Test it: run the shortcut, then open Flip from your Home Screen and check the count went up. If it didn't, the shortcut opened Safari instead, which keeps separate counts. Tell Claude and we'll pick another approach.

## Updating

Replace the changed files on GitHub (Add file → Upload files). Then, in `sw.js`, change `VERSION` (for example `flip-1.0.1`) so phones pick up the new version. Close and reopen Flip on your phone to load it.

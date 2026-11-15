# Flip — project notes for Claude

Flip is a personal habit app: you tap **Flip it** every time you resist an urge.
The count only goes up. No resets, ever.

Full spec: https://claude.ai/artifact/TbgWjybdawuDPPeQm17NsT

## Stack (v1)

- Plain HTML, CSS, JavaScript. No framework, no build step, no npm.
- Hosted on GitHub Pages from `main` at https://kevinag16.github.io/Flip/
- Installed on iPhone from Safari (Add to Home Screen).
- Data lives only on the user's phone (IndexedDB, falls back to localStorage). No server, no accounts.

| File | Purpose |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | Design: concrete grey, dark split-flap board, signal yellow `#FFCC1A`; Barlow / Barlow Condensed; light + dark mode |
| `app.js` | All logic |
| `captions.js` | Proof lines, context lines, Delay replies |
| `sw.js` | Service worker (offline, network-first) |
| `manifest.webmanifest`, `icons/` | Home Screen install |

## Every change must

1. Bump `VERSION` in `sw.js` (e.g. `flip-1.0.3` → `flip-1.0.4`) so phones pick up the update.
2. Bump `APP_VERSION` in `app.js` to match (shown at the bottom of Settings).
3. Never change the saved data shape in a way that loses existing counts, events, delays or notes. Add fields; don't rename or remove them.
4. Keep it working offline and on iPhone Safari.
5. Test at a phone width (about 390px) in both light and dark mode.

## Naming

Flip (app) · Era (a habit being changed) · Flip it (button) · Flips (count) · Hype (instant animation) · Proof (identity captions) · Delay (a logged slip) · Your Five (max 5 active eras) · Level-ups (First flip 1, On a roll 10, Pattern breaker 50, Mythic 150) · Hall of Fame (graduated eras)

## Writing rules for Proof lines and Delay replies

- Short, ideally 8 words or fewer.
- "I don't", never "I can't" or "succumb".
- No shame words: addict, weak, failure, clean/dirty.
- Never claim more than the count supports; identity language grows with level-ups.
- A slip is information, not a verdict. Never imply slips are necessary.
- Delays never subtract from the count.
- Keep the SAMHSA helpline (1-800-662-4357) on Delay screens.
- Flip is a habit tool, not a treatment. Never claim it treats addiction.

## Data shape (localStorage key `flip-state` / IndexedDB `flip` → `kv` → `state`)

`{ version, eras: [{ id, name, becoming, color, count, createdAt, graduatedAt, events: [{ t, type: "flip"|"delay", trigger?, note?, before?, plan? }], used, customLines: [{ id, text, stage }], comebackPending, lastReply }], settings: { sound, lastExport } }`

Keys starting with `_` are runtime-only and are never saved.

## Planned for v2 (not now)

Native app (Expo / React Native), lock screen and Home Screen widgets, data-aware morning and night notifications, Urge mode with Live Activity, sign-in and sync (Supabase), Hype buddy, App Store and Play Store.

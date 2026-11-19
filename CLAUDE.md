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
| `captions.js` | Proof lines, context lines, Delay replies, Logbook lines and prompt paths |
| `sw.js` | Service worker (offline, network-first) |
| `manifest.webmanifest`, `icons/` | Home Screen install |

## Every change must

1. Bump `VERSION` in `sw.js` (e.g. `flip-1.0.3` → `flip-1.0.4`) so phones pick up the update.
2. Bump `APP_VERSION` in `app.js` to match (shown at the bottom of Settings).
3. Never change the saved data shape in a way that loses existing counts, events, delays or notes. Add fields; don't rename or remove them.
4. Keep it working offline and on iPhone Safari.
5. Test at a phone width (about 390px) in both light and dark mode.

## Naming

Flip (app) · Era (a habit being changed) · Flip it (button) · Flips (count) · Hype (instant animation) · Proof (identity captions) · Delay (a logged slip) · Your Five (max 5 active eras) · Level-ups (First flip 1, On a roll 10, Pattern breaker 50, Mythic 150) · Hall of Fame (graduated eras) · Pull (what triggered an urge; per-era list, starts as Bored, Stressed, Lonely, Tired, Late night, Social) · Logbook (private writing space; delays and entries from all eras)

## Writing rules for Proof lines and Delay replies

- Short, ideally 8 words or fewer.
- "I don't", never "I can't" or "succumb".
- No shame words: addict, weak, failure, clean/dirty.
- Never claim more than the count supports; identity language grows with level-ups.
- A slip is information, not a verdict. Never imply slips are necessary.
- Delays never subtract from the count.
- Keep the SAMHSA helpline (1-800-662-4357) on Delay screens and the Logbook (alongside 988).
- Logbook: every question is optional and skippable. No streaks, badges or completion tracking.
- Flip is a habit tool, not a treatment. Never claim it treats addiction.

## Data shape (localStorage key `flip-state` / IndexedDB `flip` → `kv` → `state`)

`{ version, eras: [{ id, name, becoming, color, count, createdAt, graduatedAt, events: [{ t, type: "flip"|"delay", trigger?, pull?, note?, before?, plan?, logbookId? }], used, customLines: [{ id, text, stage }], triggers: [string], comebackPending, lastReply }], logbook: [{ id, t, text, mood?, eraId?, delayRef?, path? }], settings: { sound, lastExport, showPreviews } }`

- Flip events keep their pull in `trigger`; delay events use `pull`. `note` and `before` are only on delays from before v1.1.0.
- A Logbook entry written with a delay has `eraId` + `delayRef` (the delay's `t`); the delay has `logbookId`.
- `version` 2 (v1.1.0) migration adds Lonely and Tired to each era's `triggers` once. Migrations live in `normalize()`.

Keys starting with `_` are runtime-only and are never saved.

## Planned for v2 (not now)

Native app (Expo / React Native), lock screen and Home Screen widgets, data-aware morning and night notifications, Urge mode with Live Activity, sign-in and sync (Supabase), Hype buddy, App Store and Play Store.

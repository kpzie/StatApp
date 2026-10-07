# StatLine — individual soccer & basketball stat tracker

Track one player's stats live during a game, keep a profile per player, and see
totals, averages and sport-specific advanced metrics. Works fully offline; data
stays on the device.

* **Soccer:** goals, assists, shots / on target, passes (completed vs attempted), key passes,
  dribbles, tackles won, interceptions, clearances, fouls committed/won, offsides, cards,
  and goalkeeper saves / goals conceded. Derived: shot accuracy, conversion, pass %, dribble %,
  save %, goals & G+A per 90.
* **Basketball:** 2PT / 3PT / FT makes and misses, offensive & defensive rebounds, assists,
  steals, blocks, turnovers, fouls. Derived: PTS, REB, FG% / 3P% / FT%, eFG%, TS%, AST/TO,
  Hollinger Game Score, points per 36, per-game averages.
* Player profiles (jersey #, position, team, foot/hand, height, notes), game log, last-5 filter,
  per-game trend chart, undo, game clock, editable totals, CSV export, JSON backup/restore.

## AI analysis (bring your own Anthropic API key)

Open **Data ▸ AI analysis**, paste an Anthropic API key (console.anthropic.com), pick a model, and save.
Then use **✨ AI analysis** on a player profile (overview, strengths & gaps, training plan, scouting report,
optional free-form question) or **✨ Analyze this game** on a finished game.

* The key is stored only in the device's local storage, is **not** part of backups or CSV exports, and is sent only to `api.anthropic.com`.
* Only finished games' numbers are sent. Player names are hidden by default (toggle in settings); notes are never sent.
* The latest analysis is saved with the player/game so it can be re-read offline. Each run uses a little of your API credit.
* Calls the Messages API directly from the app (`anthropic-dangerous-direct-browser-access`); on Android the Capacitor HTTP plugin is enabled so requests are not blocked by CORS. Anyone who can unlock the phone can read the stored key, so use a key with a spend limit.

## Get the APK (no Android Studio needed)

1. Create an empty GitHub repository and push this folder to it (`main` branch).
2. Open the repo → **Actions** → **Build Android APK**. It runs on every push; you can also press
   **Run workflow**. It takes roughly 5–10 minutes the first time.
3. Open the finished run → **Artifacts** → download **StatLine-debug-apk** → unzip → `app-debug.apk`.
4. Copy the APK to your phone and open it. Android will ask you to allow *Install unknown apps*
   for the app you opened it from (Files / Chrome). Requires Android 7.0 or newer.

The debug APK is signed with the standard Android debug key, which is fine for installing on your
own devices. It cannot be uploaded to Google Play; that needs a release build signed with your own key.

## Build the APK yourself (Android Studio)

```bash
npm install
npx cap sync android
npx cap open android      # then Build ▸ Build APK(s)
# or, with JDK 21 + Android SDK 36 installed:
cd android && ./gradlew assembleDebug
# result: android/app/build/outputs/apk/debug/app-debug.apk
```

## Try it in a browser / install as a PWA

```bash
npm run serve    # http://localhost:8080 — serve over HTTPS to "Add to Home screen" on a phone
```

### Deploy the web version to Vercel

```bash
cd www
npx vercel --prod        # log in when prompted; accept the defaults (no framework, no build step)
```

`www/vercel.json` already sets the right cache headers for the service worker. Open the resulting
https URL on your phone and use **Add to Home screen** to install it as an app.

## Tests

```bash
npm test         # unit tests for every stat formula
```

## Project layout

```
www/            the app (index.html, css/, js/stats.js = formulas, js/ai.js = AI analysis, js/app.js = UI, sw.js, manifest, vercel.json)
android/        Capacitor Android project (committed; web files are copied in by `cap sync`)
assets/         icon + splash sources (regenerate with `npm run assets`)
tests/          formula tests
.github/workflows/build-apk.yml
```

After changing anything in `www/`, run `npx cap sync android` before building.

## Data & backup

Everything is stored in the app's local storage. **Uninstalling the app or clearing its data erases it.**
Use **Data ▸ Backup (JSON)** regularly; it opens the Android share sheet so you can send the file to
Drive, email or another app. **Restore** re-imports it (replace or merge).

## Metric definitions

| Metric | Formula |
|---|---|
| PTS | 2×FGM + 3PM + FTM (FGM includes 3-pointers) |
| eFG% | (FGM + 0.5×3PM) ÷ FGA |
| TS% | PTS ÷ (2 × (FGA + 0.44×FTA)) |
| Game Score | PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA − FTM) + 0.7·OREB + 0.3·DREB + STL + 0.7·AST + 0.7·BLK − 0.4·PF − TOV |
| Per-36 / per-90 | stat × 36 (or 90) minutes ÷ minutes played |
| Shot accuracy | shots on target ÷ shots (goals count as shots on target) |
| Save % | saves ÷ (saves + goals conceded) |

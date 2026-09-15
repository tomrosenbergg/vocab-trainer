# Vocab

A minimal, browser-only SAT vocabulary trainer. Click a card to reveal its answer, then choose **Again**, **Hard**, **Good**, or **Easy**. There is no login, backend, analytics, or external font request.

## Run locally

Requires a recent Node.js release and npm (tested with Node 26).

```sh
npm ci
npm run dev
```

Use the URL printed by Vite. Keep the same browser and origin (including port) to retain access to your progress.

```sh
npm test
npm run build
npm run preview
```

## Deck

New words follow a deterministic shuffle based on a seed saved in the browser. Resetting history creates a new seed.


`cards.csv` is the source of truth: three columns, no header, word, definition, and example sentence, using standard CSV quoting. The supplied 991 rows produce 1,982 cards. Definitions and examples are imported as supplied; editorial accuracy and SAT relevance have not been independently reviewed.

Each word has a word → definition card and a definition → word card, with independent FSRS scheduling. The default allowance is **10 new cards per study day (4 a.m. to 4 a.m.)**, not five word pairs. Each first-reviewed direction uses one place, even if the other direction was introduced on an earlier day. Due reviews remain uncapped and take priority over new cards.

After reviewing a card, its sibling (the opposite direction of the same word) is buried until the next local 4 a.m.. This applies to new, learning, and due review siblings, survives reloads. The reviewed card can still repeat later today if FSRS schedules it. Burying is a queue filter based on the sibling’s last-review date: it never changes the buried card’s FSRS state or due date. When both directions are due, reviewing the first defers the other to another day.

All reviews scheduled before the next 4 a.m. are available in today's session. Already-due cards come first, followed by today's future review cards, new cards, and future learning repeats in due-time order. Short learning steps can therefore be completed without waiting for the clock. Again and Hard may require more repetitions before the session finishes. FSRS receives the actual review time and retains its own due dates.

Once today's work is complete, the app waits until 4 a.m. for the next allowance and reviews. The extra-card button has been removed; missed days do not accumulate allowance. The timezone comes from the device/browser, not IP geolocation. Calendar-based boundaries respect daylight saving time. An idle open tab refreshes within 15 seconds of rollover.

This is self-assessed recall; equivalent definitions or synonyms can count as correct.

To edit the deck, keep three columns with no header and quote any field containing commas or quotation marks:

```csv
mitigate,"to make less severe, serious, or painful",The barriers mitigate flood damage.
```

Definition edits retain scheduling history. New or renamed words get new card IDs; removing a word removes its cards from the queue but leaves its saved history unused. The development server picks up CSV edits; a production copy must be rebuilt. Example sentences appear beneath the answer only after reveal in both directions. Editing a sentence also preserves scheduling history. Audio, account sync, and tutor referrals are not implemented yet.

## Scheduling and storage

Uses `ts-fsrs` at 90% requested retention. Each button maps directly to its matching FSRS grade, in Anki order:

- **Again**: not recalled.
- **Hard**: recalled with difficulty.
- **Good**: recalled correctly.
- **Easy**: recalled effortlessly.

The buttons share the same styling and show their next review intervals. Existing schedules from the earlier two-button interface are preserved; only future answers use the four-grade mapping.

Card states, shuffle seed, daily new-card allowance, and today's review count are stored under `vocab.progress.v1` in localStorage. Dates are serialized and restored explicitly. Reloading preserves progress; clearing browser data removes it. Automatic device sync and offline page installation are outside this scaffold. An already loaded page requires no network to study, but reopening the app still requires the local server or a future static host.

Invalid saved data is left untouched and reported. Storage failures disable grading rather than pretending reviews have been saved. Tabs listen for storage changes and refresh their displayed card; saving also checks for a stale review. Simultaneous writes from different tabs are not transactional, so use one active study tab.

## Undo and backups

After grading, **Undo** in the header (or **Cmd/Ctrl+Z**) restores the previous card, schedule, daily allowance and sibling availability so you can correct the rating. It supports the most recent answer in this tab; reload, import or changes in another tab clear undo. A final saved-state check prevents undo from overwriting newer progress.

**Settings → Export progress** downloads a JSON backup containing all saved schedules, daily allowance and shuffle seed. **Import progress** validates a backup before asking to replace this browser's history. It does not merge histories. Invalid files leave existing progress untouched. Export first if you want to keep the current history. Backups contain progress, not the vocabulary CSV; they also work between localhost and the published site or another device running the same deck.

## Development reset

In the development server only, the footer includes **Reset history**. Confirming clears this app’s localStorage entry and reloads to a fresh session; cancelling preserves progress. This resets schedules, daily allowance, and sibling burying, but does not change the deck or other browser data. The button and handler are gated by `import.meta.env.DEV` and omitted from production builds.

## Keyboard

- **Space**: reveal answer
- **1**: Again
- **2**: Hard
- **3**: Good
- **4**: Easy
- **Tab / Enter**: native button navigation and activation

## Structure

- `src/main.ts`: study interface and browser persistence
- `src/study.ts`: CSV parsing, deck, validation, and scheduling
- `src/style.css`: responsive appearance
- `src/study.test.ts`: import, recall, persistence, and scheduling checks

The production build is static output in `dist/`.

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` runs tests, builds the site, and deploys pushes to `main`. You can also run **Deploy to GitHub Pages** manually from the repository’s Actions tab.

One-time setup: open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**. If the initial workflow ran before Pages was enabled, rerun it from Actions.

The site address is https://tomrosenbergg.github.io/vocab-trainer/.

`npm run build:pages` sets the asset and home-link base to `/vocab-trainer/`. Ordinary `npm run dev` and `npm run build` retain the root path for local development or other hosting. If the repository is renamed, update the Pages build path and site URL here.

The live site stores progress separately from localhost. The development reset button is excluded from the published build. No secrets or personal access tokens are needed in the workflow; deployment uses GitHub’s built-in token.

## Stored-data compatibility

Existing progress upgrades in place without modifying card schedules. The previous word-based extra allowance converts at two cards per word. For its current-day introductions, already reviewed directions belonging to those introduced words count toward the card allowance; a previously unseen reverse does not count until actually studied. The original unlimited version conservatively counts cards last reviewed today, since it did not record introduction dates. Sibling burying also applies immediately to cards reviewed before this update.

# Vocab

A minimal, browser-only SAT vocabulary trainer. Click a card to reveal its answer, then choose **Hard** or **Easy**. There is no login, backend, analytics, or external font request.

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


`words-definitions.csv` is the source of truth: two columns, no header, standard CSV quoting. The supplied 991 rows produce 1,982 cards. Definitions are imported as supplied; editorial accuracy and SAT relevance have not been independently reviewed.

Each word has a word → definition card and a definition → word card, with independent FSRS scheduling. The default allowance is **10 new cards per local calendar day**, not five word pairs. Each first-reviewed direction uses one place, even if the other direction was introduced on an earlier day. Due reviews remain uncapped and take priority over new cards.

After reviewing a card, its sibling (the opposite direction of the same word) is buried until the next local midnight. This applies to new, learning, and due review siblings, survives reloads, and also applies to extra batches. The reviewed card can still repeat later today if FSRS schedules it. Burying is a queue filter based on the sibling’s last-review date: it never changes the buried card’s FSRS state or due date. When both directions are due, reviewing the first defers the other to another day.

Once current work is complete, “Learn 5 more cards” unlocks another five places for that day, if eligible new cards remain. It never unburies siblings. Extra allowance expires at local midnight; missed days do not accumulate allowance. Learning reviews later today produce “All caught up for now” with the next eligible review time. Buried overdue reviews are shown as available no earlier than tomorrow.

This is self-assessed recall; equivalent definitions or synonyms can count as correct.

To edit the deck, keep two columns with no header and quote definitions containing commas:

```csv
mitigate,"to make less severe, serious, or painful"
```

Definition edits retain scheduling history. New or renamed words get new card IDs; removing a word removes its cards from the queue but leaves its saved history unused. The development server picks up CSV edits; a production copy must be rebuilt. Example sentences, audio, account sync, and tutor referrals are not implemented yet.

## Scheduling and storage

Uses `ts-fsrs` at 90% requested retention. The two UI choices are deliberately binary:

- **Hard** → FSRS **Again**: forgotten, uncertain, or needs more practice.
- **Easy** → FSRS **Good**: successfully recalled.

FSRS's actual Hard rating means successful but difficult recall, and Easy means exceptional ease. Mapping binary buttons directly to those grades would offer no failure rating. Button interval hints show the upcoming review delay. Early learning steps may schedule both choices within the same session; successful later reviews spread out over days.

Card states, shuffle seed, daily new-card allowance, and today's review count are stored under `vocab.progress.v1` in localStorage. Dates are serialized and restored explicitly. Reloading preserves progress; clearing browser data removes it. Device sync, backups, offline page installation, and history export are outside this scaffold. An already loaded page requires no network to study, but reopening the app still requires the local server or a future static host.

Invalid saved data is left untouched and reported. Storage failures disable grading rather than pretending reviews have been saved. Tabs listen for storage changes and refresh their displayed card; saving also checks for a stale review. Simultaneous writes from different tabs are not transactional, so use one active study tab.

## Development reset

In the development server only, the footer includes **Reset history**. Confirming clears this app’s localStorage entry and reloads to a fresh session; cancelling preserves progress. This resets schedules, daily allowance, and sibling burying, but does not change the deck or other browser data. The button and handler are gated by `import.meta.env.DEV` and omitted from production builds.

## Keyboard

- **Space**: reveal answer
- **1**: Hard
- **2**: Easy
- **Tab / Enter**: native button navigation and activation

## Structure

- `src/main.ts`: study interface and browser persistence
- `src/study.ts`: CSV parsing, deck, validation, and scheduling
- `src/style.css`: responsive appearance
- `src/study.test.ts`: import, recall, persistence, and scheduling checks

The production build is static output in `dist/`. No publishing has been configured.

## Stored-data compatibility

Existing progress upgrades in place without modifying card schedules. The previous word-based extra allowance converts at two cards per word. For its current-day introductions, already reviewed directions belonging to those introduced words count toward the card allowance; a previously unseen reverse does not count until actually studied. The original unlimited version conservatively counts cards last reviewed today, since it did not record introduction dates. Sibling burying also applies immediately to cards reviewed before this update.

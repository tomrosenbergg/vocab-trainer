# Bird Brain

A minimal, browser-only SAT vocabulary trainer. Click anywhere in the main study area to reveal the answer, then choose **Fail** or **Pass**. There is no login, backend, analytics, or external font request.

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

All reviews scheduled before the next 4 a.m. are available in today's session. Already-due cards come first, followed by today's future review cards, new cards, and future learning repeats in due-time order. Short learning steps can therefore be completed without waiting for the clock. Fail may require more repetitions before the session finishes. FSRS receives the actual review time and retains its own due dates.

Once today's work is complete, the app waits until 4 a.m. for the next allowance and reviews. Missed days do not accumulate allowance. The timezone comes from the device/browser, not IP geolocation. Calendar-based boundaries respect daylight saving time. An idle open tab refreshes within 15 seconds of rollover.

This is self-assessed recall; equivalent definitions or synonyms can count as correct.

To edit the deck, keep three columns with no header and quote any field containing commas or quotation marks:

```csv
mitigate,"to make less severe, serious, or painful",The barriers mitigate flood damage.
```

Definition edits retain scheduling history. New or renamed words get new card IDs; removing a word removes its cards from the queue but leaves its saved history unused. The development server picks up CSV edits; a production copy must be rebuilt. Example sentences appear beneath the answer only after reveal in both directions. Editing a sentence also preserves scheduling history. Audio, account sync, and tutor referrals are not implemented yet.


## Scheduling and storage

Uses `ts-fsrs` at 90% requested retention. The two choices map to FSRS grades:

- **Fail** → Again: could not recall the answer before revealing it.
- **Pass** → Good: recalled the answer before revealing it.

Both buttons share the same styling. Review intervals are hidden; FSRS schedules cards in the background. Existing schedules are preserved; future answers use this mapping.

Card states, review history, shuffle seed, daily new-card allowance, and today's review count are stored under `vocab.progress.v1` in localStorage. The old key is retained so existing Bird Brain users keep their progress. Each rating appends a review event containing the card ID, timestamp, study day, answer, state transition, and resulting due date while the latest card state remains available for fast scheduling. Progress saved before review history existed migrates with an empty event log; past ratings cannot be reconstructed. Dates are serialized and restored explicitly. Reloading preserves progress; clearing browser data removes it. Automatic device sync and offline page installation are outside this scaffold. An already loaded page requires no network to study, but reopening the app requires the deployed site or local server.

Invalid saved data is left untouched and reported. Storage failures disable grading rather than pretending reviews have been saved. Tabs listen for storage changes and refresh their displayed card; saving also checks for a stale review. Simultaneous writes from different tabs are not transactional, so use one active study tab.

## Undo and backups

After grading, **Cmd/Ctrl+Z** restores the previous card, schedule, daily allowance and sibling availability so you can correct the rating. You can undo repeatedly through this session’s answers. Reload, import or changes in another tab clear the undo stack. A final saved-state check prevents undo from overwriting newer progress.

**Settings (gear icon) → Export progress** downloads a JSON backup containing all saved schedules, daily allowance and shuffle seed. **Import progress** validates a backup before asking to replace this browser's history. It does not merge histories. Invalid files leave existing progress untouched. Export first if you want to keep the current history. Backups contain progress, not the vocabulary CSV; they also work between localhost and the published site or another device running the same deck.

## Reset progress

Settings includes **Reset progress** with a confirmation. It clears this browser's study history and schedules, resets the daily count and shuffle, and preserves the new-cards-per-day preference. Export a backup first if you may want to restore progress. Cancelling changes nothing. The old development-only footer control has been removed.

## Simulated history

Generate an importable backup for testing the app after days or months of use:

```sh
npm run simulate -- --profile consistent --days 90
```

The command uses the real deck, FSRS scheduler, 4 a.m. study days, sibling burying, and review-event format. It writes `simulated-progress.json` by default; import that file from **Settings → Import progress**. Import replaces browser progress, so export real progress first.

Profiles are `consistent`, `casual`, `struggling`, `advanced`, and `lapsed`. Options include `--new`, `--seed`, and `--output`; run `npm run simulate -- --help` for details. Generated backup files matching `simulated-progress*.json` are ignored by Git.

## Keyboard

- **Space**: reveal answer
- **1**: Fail
- **2**: Pass
- **Tab / Enter**: native button navigation and activation

## Structure

- `src/main.ts`: application state, browser persistence, and event handling
- `src/views/`: practice, stats, and settings interface modules
- `src/study.ts`: CSV parsing, deck, validation, and scheduling
- `src/stats.ts`: activity and word-level progress summaries
- `src/style.css`: responsive appearance
- `src/study.test.ts`: import, recall, persistence, and scheduling checks

The Settings view starts with a 12-week activity heat map, current streak, and review totals. The Cards view provides a scrollable word browser; select one or more rows to inspect a word and use the context menu to suspend or resume them. Activity begins when review-event recording was introduced; earlier card state is preserved but cannot be reconstructed into historical events.

The production build is static output in `dist/`.

## Deployment

Vercel builds the private GitHub repository with `npm run build` and serves `dist/`. Pushes to the connected production branch deploy automatically. Preview deployments are created for other pushed branches and pull requests. The live site stores progress separately from localhost because browser storage is scoped to each origin.

## Stored-data compatibility

Existing progress upgrades in place without modifying card schedules. The previous word-based extra allowance converts at two cards per word. For its current-day introductions, already reviewed directions belonging to those introduced words count toward the card allowance; a previously unseen reverse does not count until actually studied. The original unlimited version conservatively counts cards last reviewed today, since it did not record introduction dates. Sibling burying also applies immediately to cards reviewed before this update.

The footer shows “click anywhere to reveal” until three distinct cards have been studied. The cue is hidden after reveal and persists across reloads through existing progress. Header and footer controls keep their normal behavior; background clicks never grade or advance cards.

Settings includes **New cards per day**, defaulting to 10. Entering a higher limit makes additional cards available immediately; lowering it never removes completed study or due reviews. Valid whole numbers autosave as you type, with no Save button. The limit persists across days and backups. Zero pauses new cards. Changing this setting clears session undo so it cannot restore an old limit.

The footer separates today’s queue into **new**, **reviews**, and **learning** cards. Learning includes cards in FSRS learning or relearning steps, including cards recently marked Fail.

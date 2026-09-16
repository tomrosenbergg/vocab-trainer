# Bird Brain roadmap

Ideas to revisit after the core study loop has had more time in the wild. These are intentionally not part of the current product surface.

## Product

- Add a quiet indication that the current deck is the **1,000 SAT words** deck.
- Support multiple decks, with the ability to switch between topics.
- Add a review limit per day setting, separate from the new-card limit.
- Add a card-direction setting: word → definition, definition → word, or both.
- Refine the new Stats view as real review history accumulates.
- Add expandable direction-level and technical FSRS details to the searchable Words list if users need them.
- Add an optional “skip this word” action that suspends both directions and can be restored from Settings.
- Add pronunciation audio.
- Add a short first-session onboarding flow that explains reveal, rating, active recall, spaced repetition, and suspending cards, then fades away once the interaction is familiar.
- Show a tutor CTA after users complete several separate study days; keep a smaller version in Settings.

## Accounts and sync

- Add optional accounts for persistent progress across devices.
- Keep anonymous local study available; signing in should add sync rather than become a requirement.
- Move larger or event-based progress storage from localStorage to IndexedDB before building sync.
- Add a hosted database for accounts, card schedules, preferences, review history, and eventually deck subscriptions.

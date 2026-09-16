# Bird Brain roadmap

Ideas to revisit after the core study loop has had more time in the wild. These are intentionally not part of the current product surface.

## Product

- Add a quiet indication that the current deck is the **1,000 SAT words** deck.
- Support multiple decks, with the ability to switch between topics.
- Add a review limit per day setting, separate from the new-card limit.
- Refine activity and card statistics as real review history accumulates.
- Add expandable direction-level and technical FSRS details to the Cards browser if users need them.
- Implement issue reporting behind the practice screen’s Report placeholder.
- Add card management actions: reset a card’s scheduling state while preserving its review history, and promote a card to the front of the next available queue without changing its FSRS schedule.
- Add pronunciation audio.
- Add a short first-session onboarding flow that explains reveal, rating, active recall, spaced repetition, and suspending cards, then fades away once the interaction is familiar.
- Show a tutor CTA after users complete several separate study days; keep a smaller version in Settings.

## Accounts and sync

- Add optional accounts for persistent progress across devices.
- Keep anonymous local study available; signing in should add sync rather than become a requirement.
- Move larger or event-based progress storage from localStorage to IndexedDB before building sync.
- Add a hosted database for accounts, card schedules, preferences, review history, and eventually deck subscriptions.

## Implemented

- Word → definition by default, with an optional bidirectional setting.
- Suspend both directions from practice or the Cards browser; resume from the browser.
- Session undo for ratings and practice suspension, including after the last card.

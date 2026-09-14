import './style.css';
import csv from '../words-definitions.csv?raw';
import {
  addExtraCards, createDeck, dailyAllowance, isBuried, nextReviewAt,
  intervalLabel, localDay, nextCard, rateCard, readProgress,
  newCardsAvailableToday, EXTRA_NEW_CARDS, STORAGE_KEY,
  type Progress, type StudyCard,
} from './study.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="shell">
    <header><a class="brand" href="/" aria-label="Vocab home"><span class="brand-mark" aria-hidden="true">v.</span> vocab</a><span class="deck-label">SAT vocabulary <span class="separator">/</span> <span id="word-count"></span></span></header>
    <main>
      <section class="study" aria-label="Vocabulary practice">
        <p class="prompt" id="prompt">recall the meaning</p>
        <button class="card" id="card" type="button" aria-describedby="reveal-hint">
          <span class="front" id="front"></span>
          <span class="answer" id="answer" hidden><span class="answer-rule"></span><span id="back"></span></span>
        </button>
        <div class="controls">
          <p class="reveal-hint" id="reveal-hint">click to reveal <span class="keyboard-hint">or press <kbd>space</kbd></span></p>
          <div class="ratings" id="ratings" hidden>
            <button class="rating hard" id="hard" type="button" aria-label="Hard — I need more practice"><span><kbd>1</kbd> Hard</span><span class="interval" id="hard-interval"></span></button>
            <button class="rating easy" id="easy" type="button" aria-label="Easy — I recalled it"><span><kbd>2</kbd> Easy</span><span class="interval" id="easy-interval"></span></button>
          </div>
          <p class="rating-hint" id="rating-hint" hidden>Hard: more practice <span>·</span> Easy: recalled it</p>
        </div>
      </section>
      <section class="rest" id="rest" hidden><span class="rest-mark" aria-hidden="true">✓</span><h1 id="rest-title" tabindex="-1">You’re done for today.</h1><p id="daily-summary"></p><p id="next-review"></p><button class="more-cards" id="more-cards" type="button" hidden>Learn 5 more cards</button></section>
      <p class="error" id="error" role="alert" hidden></p>
      <span class="sr-only" id="announcement" role="status" aria-live="polite"></span>
    </main>
    <footer><span class="daily-counts"><span><span id="reviewed">0</span> reviewed today</span><span id="new-cards"></span>${import.meta.env.DEV ? '<button class="dev-reset" id="reset-history" type="button" title="Development only">Reset history <span>dev</span></button>' : ''}</span><span class="local-note"><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none"><rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor"/></svg> saved in this browser</span></footer>
  </div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let progress: Progress;
let deck: StudyCard[] = [];
let current: StudyCard | null = null;
let revealed = false;
let failed = false;

function fail(error: unknown) {
  failed = true;
  el('error').textContent = error instanceof Error ? error.message : 'Your browser could not save progress. Please enable browser storage and reload.';
  el('error').hidden = false;
  el<HTMLButtonElement>('card').disabled = true;
  el<HTMLButtonElement>('hard').disabled = true;
  el<HTMLButtonElement>('easy').disabled = true;
  el<HTMLButtonElement>('more-cards').disabled = true;
  document.querySelector('.local-note')!.textContent = 'progress not saved';
}

function render() {
  const now = new Date();
  revealed = false;
  el('ratings').hidden = true;
  el('rating-hint').hidden = true;
  el('answer').hidden = true;
  el('reveal-hint').hidden = false;
  el('reviewed').textContent = String(progress.day === localDay(now) ? progress.today : 0);
  const daily = dailyAllowance(progress, now);
  el('new-cards').textContent = daily.introduced.length > daily.limit
    ? `${daily.introduced.length} new cards today`
    : `${daily.introduced.length} / ${daily.limit} new cards`;
  el('word-count').textContent = `${deck.length / 2} words`;
  el('card').setAttribute('aria-disabled', 'false');
  current = nextCard(deck, progress, now);
  (document.querySelector('.study') as HTMLElement).hidden = !current;
  el('rest').hidden = Boolean(current);
  if (!current) {
    const due = nextReviewAt(deck, progress, now);
    const laterToday = due && localDay(due) === localDay(now);
    const title = laterToday ? 'All caught up for now.' : 'You’re done for today.';
    el('rest-title').textContent = title;
    el('daily-summary').textContent = `${daily.introduced.length} new ${daily.introduced.length === 1 ? 'card' : 'cards'} practised today. No reviews due right now.`;
    el('next-review').textContent = due ? `Next review: ${due.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : '';
    const remaining = newCardsAvailableToday(deck, progress, now);
    el('more-cards').hidden = remaining === 0;
    const batch = Math.min(EXTRA_NEW_CARDS, remaining);
    el('more-cards').textContent = `Learn ${batch} more ${batch === 1 ? 'card' : 'cards'}`;
    el('announcement').textContent = title;
    return;
  }
  el('prompt').textContent = current.direction === 'meaning' ? 'recall the meaning' : 'recall the word';
  el('front').textContent = current.front;
  el('front').classList.toggle('definition', current.direction === 'word');
  el('back').textContent = current.back;
  el('back').classList.toggle('word-answer', current.direction === 'word');
  el('card').setAttribute('aria-label', `${current.front}. Reveal answer`);
  el('announcement').textContent = `${current.direction === 'meaning' ? 'Recall the meaning' : 'Recall the word'}: ${current.front}`;
}

function reveal() {
  if (!current || revealed || failed) return;
  revealed = true;
  el('answer').hidden = false;
  el('reveal-hint').hidden = true;
  el('ratings').hidden = false;
  el('rating-hint').hidden = false;
  el('card').setAttribute('aria-disabled', 'true');
  el('card').setAttribute('aria-label', `${current.front}. ${current.back}`);
  const now = new Date();
  el('hard-interval').textContent = intervalLabel(progress, current, 'hard', now);
  el('easy-interval').textContent = intervalLabel(progress, current, 'easy', now);
  el('announcement').textContent = `${current.back}. Rate Hard with 1 or Easy with 2.`;
}

function rate(answer: 'hard' | 'easy') {
  if (!current || !revealed || failed) return;
  try {
    // Read again before writing so another tab's reviews aren't overwritten.
    const latest = readProgress(localStorage);
    if (isBuried(current, latest, new Date()) || latest.cards[current.id]?.last_review !== progress.cards[current.id]?.last_review ||
        JSON.stringify(latest.daily) !== JSON.stringify(progress.daily)) {
      progress = latest;
      render();
      return;
    }
    const updated = rateCard(latest, current, answer, new Date());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    progress = updated;
    render();
    el(current ? 'card' : 'rest-title').focus({ preventScroll: true });
  } catch (error) { fail(error); }
}

el('card').addEventListener('click', reveal);
el('hard').addEventListener('click', () => rate('hard'));
el('easy').addEventListener('click', () => rate('easy'));
el('more-cards').addEventListener('click', () => {
  if (failed) return;
  try {
    const latest = readProgress(localStorage);
    const updated = addExtraCards(deck, latest, new Date());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    progress = updated;
    render();
    el(current ? 'card' : 'rest-title').focus({ preventScroll: true });
  } catch (error) { fail(error); }
});
if (import.meta.env.DEV) {
  el('reset-history').addEventListener('click', () => {
    if (!window.confirm('Reset all study history in this browser?\n\nThis permanently clears your card schedules, daily allowance, and sibling burying. Your vocabulary deck stays intact. This cannot be undone.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    } catch (error) { fail(error); }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (import.meta.env.DEV && event.target instanceof HTMLElement && event.target.closest('#reset-history')) return;
  if (!current) return; // Keep native Space / Enter activation for the extra-batch button.
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) reveal(); }
  if (event.key === '1' || event.key === '2') { event.preventDefault(); if (!event.repeat) rate(event.key === '1' ? 'hard' : 'easy'); }
});
window.addEventListener('storage', (event) => {
  if (failed || (event.key !== STORAGE_KEY && event.key !== null)) return;
  try { progress = readProgress(localStorage); deck = createDeck(csv, progress.seed); render(); }
  catch (error) { fail(error); }
});
// Wake due reviews in a tab left open, without interrupting an active card.
setInterval(() => { if (!failed && !current) render(); }, 15000);

try {
  progress = readProgress(localStorage);
  deck = createDeck(csv, progress.seed);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  render();
} catch (error) { fail(error); }

import { el } from '../dom.ts';
import { activitySummary, wordSummaries, type WordSummary } from '../stats.ts';
import type { Progress, StudyCard } from '../study.ts';

export const activityMarkup = `
  <section id="activity" aria-labelledby="activity-title">
    <h1 id="activity-title">Activity</h1>
    <div class="activity-metrics">
      <div><strong id="reviews-today">0</strong><span>reviews today</span></div>
      <div><strong id="study-streak">0</strong><span>day streak</span></div>
      <div><strong id="study-days">0</strong><span>study days</span></div>
      <div><strong id="total-reviews">0</strong><span>total reviews</span></div>
    </div>
    <div class="heatmap-wrap"><div class="heatmap" id="heatmap" aria-label="Review activity over the last 12 weeks"></div><p>Last 12 weeks</p></div>
  </section>`;

export const cardsMarkup = `
  <section id="cards" class="app-view" aria-label="Card browser" hidden>
    <section class="words" aria-label="Card browser">
      <div class="word-browser">
        <div class="word-table" aria-label="Vocabulary">
          <div id="word-list" role="list"></div>
        </div>
        <aside class="word-detail" id="word-detail" aria-labelledby="word-detail-title">
          <h3 id="word-detail-title">Choose a word</h3>
          <p class="detail-meta" id="word-detail-meta"></p>
          <p class="detail-definition" id="word-detail-definition"></p>
          <p class="detail-example" id="word-detail-example"></p>
        </aside>
        <div id="card-context-menu" class="card-context-menu" role="menu" hidden><button id="suspend-selected" type="button" role="menuitem">Suspend selected</button></div>
    </section>
  </section>`;

let words: WordSummary[] = [];
let selectedWord: string | null = null;
let selectedWords = new Set<string>();
let currentDeck: StudyCard[] = [];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

function renderWordList(): void {
  const fragment = document.createDocumentFragment();
  for (const item of words) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'word-row';
    row.classList.toggle('selected', selectedWords.has(item.word));
    row.classList.toggle('suspended', item.suspended);
    row.dataset.word = item.word;
    row.textContent = item.word;
    row.setAttribute('aria-label', item.suspended ? `${item.word}, suspended` : item.word);
    fragment.append(row);
  }
  el('word-list').replaceChildren(fragment);
  renderWordDetail();
}

function renderWordDetail(): void {
  const item = words.find((word) => word.word === selectedWord) ?? words[0];
  const forward = currentDeck.find((card) => card.word === item?.word && card.direction === 'meaning');
  if (!item || !forward) {
    el('word-detail-title').textContent = 'Choose a word';
    return;
  }
  selectedWord = item.word;
  el('word-detail-title').textContent = item.word;
  el('word-detail-meta').textContent = `${item.reviews} ${item.reviews === 1 ? 'review' : 'reviews'} · next ${formatDate(item.nextReview)}`;
  el('word-detail-definition').textContent = item.definition;
  el('word-detail-example').textContent = `“${forward.example}”`;
}

export function setupWordBrowser(onSuspend: (words: string[], suspended: boolean) => void): void {
  el('word-list').addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.word-row[data-word]') : null;
    if (!row?.dataset.word) return;
    const index = words.findIndex((word) => word.word === row.dataset.word);
    if (event.shiftKey && selectedWord) {
      const anchor = words.findIndex((word) => word.word === selectedWord);
      if (anchor >= 0 && index >= 0) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        selectedWords = new Set(words.slice(from, to + 1).map((word) => word.word));
      }
    } else if (event.metaKey || event.ctrlKey) {
      if (selectedWords.has(row.dataset.word)) selectedWords.delete(row.dataset.word); else selectedWords.add(row.dataset.word);
    } else selectedWords = new Set([row.dataset.word]);
    selectedWord = row.dataset.word;
    renderWordList();
  });
  const menu = el<HTMLElement>('card-context-menu');
  el('word-list').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.word-row[data-word]') : null;
    if (!row?.dataset.word) return;
    if (!selectedWords.has(row.dataset.word)) { selectedWords = new Set([row.dataset.word]); selectedWord = row.dataset.word; renderWordList(); }
    const chosen = words.filter((word) => selectedWords.has(word.word));
    const allSuspended = chosen.length > 0 && chosen.every((word) => word.suspended);
    el<HTMLButtonElement>('suspend-selected').textContent = allSuspended ? 'Resume selected' : 'Suspend selected';
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 52)}px`;
    menu.hidden = false;
  });
  el('suspend-selected').addEventListener('click', () => {
    const chosen = words.filter((word) => selectedWords.has(word.word));
    const allSuspended = chosen.length > 0 && chosen.every((word) => word.suspended);
    onSuspend(chosen.map((word) => word.word), !allSuspended);
    menu.hidden = true;
  });
  document.addEventListener('click', (event) => { if (!(event.target instanceof Element && event.target.closest('#card-context-menu'))) menu.hidden = true; });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') menu.hidden = true; });
}

export function renderActivityView(progress: Progress, now = new Date()): void {
  const summary = activitySummary(progress, now);
  el('reviews-today').textContent = String(summary.reviewsToday);
  el('study-streak').textContent = String(summary.currentStreak);
  el('study-days').textContent = String(summary.studyDays);
  el('total-reviews').textContent = String(summary.totalReviews);
  const heatmap = document.createDocumentFragment();
  const max = Math.max(1, ...summary.days.map((day) => day.count));
  for (const day of summary.days) {
    const cell = document.createElement('span');
    cell.className = 'heatmap-day';
    cell.style.opacity = String(0.16 + (day.count / max) * 0.84);
    cell.title = `${day.day}: ${day.count} ${day.count === 1 ? 'review' : 'reviews'}`;
    cell.setAttribute('aria-label', cell.title);
    heatmap.append(cell);
  }
  el('heatmap').replaceChildren(heatmap);
}

export function renderCardsView(deck: StudyCard[], progress: Progress): void {
  currentDeck = deck;
  words = wordSummaries(deck, progress);
  if (!selectedWord || !words.some((word) => word.word === selectedWord)) selectedWord = words[0]?.word ?? null;
  selectedWords = new Set([...selectedWords].filter((word) => words.some((item) => item.word === word)));
  if (selectedWord && !selectedWords.size) selectedWords.add(selectedWord);
  renderWordList();
}

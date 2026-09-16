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
        <div class="word-table" role="table" aria-label="Vocabulary progress">
        <div class="word-row word-header" role="row"><span role="columnheader" aria-sort="ascending"><button class="sort-button" data-sort="word" type="button">Word</button></span><span role="columnheader" aria-sort="none"><button class="sort-button" data-sort="reviews" type="button">Reviews</button></span><span role="columnheader" aria-sort="none"><button class="sort-button" data-sort="next" type="button">Next</button></span></div>
          <div id="word-list" role="rowgroup"></div>
        </div>
        <aside class="word-detail" id="word-detail" aria-labelledby="word-detail-title">
          <h3 id="word-detail-title">Choose a word</h3>
          <p class="detail-definition" id="word-detail-definition"></p>
          <p class="detail-example" id="word-detail-example"></p>
        </aside>
    </section>
  </section>`;

let words: WordSummary[] = [];
let selectedWord: string | null = null;
let currentDeck: StudyCard[] = [];
type SortKey = 'word' | 'reviews' | 'next';
let sortKey: SortKey = 'word';
let sortAscending = true;

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

function sortedWords(): WordSummary[] {
  return [...words].sort((a, b) => {
    let comparison: number;
    if (sortKey === 'word') comparison = a.word.localeCompare(b.word);
    else if (sortKey === 'reviews') comparison = a.reviews - b.reviews;
    else if (sortKey === 'next') {
      // Unscheduled new cards stay at the end in either direction.
      if (!a.nextReview && b.nextReview) return 1;
      if (a.nextReview && !b.nextReview) return -1;
      comparison = (a.nextReview && b.nextReview) ? Date.parse(a.nextReview) - Date.parse(b.nextReview) : 0;
    } else comparison = 0;
    return sortAscending ? comparison : -comparison;
  });
}

function renderWordList(): void {
  const fragment = document.createDocumentFragment();
  for (const item of sortedWords()) {
    const row = document.createElement('div');
    row.className = 'word-row';
    row.classList.toggle('selected', item.word === selectedWord);
    row.dataset.word = item.word;
    row.setAttribute('role', 'row');
    const values = [item.word, String(item.reviews), formatDate(item.nextReview)];
    values.forEach((value, index) => {
      const cell = document.createElement('span');
      cell.setAttribute('role', 'cell');
      cell.textContent = value;
      row.append(cell);
    });
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
  el('word-detail-definition').textContent = item.definition;
  el('word-detail-example').textContent = `“${forward.example}”`;
}

export function setupStatsSorting(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.sort-button')) {
    button.addEventListener('click', () => {
      const nextKey = button.dataset.sort as SortKey;
      if (sortKey === nextKey) sortAscending = !sortAscending;
      else { sortKey = nextKey; sortAscending = true; }
      for (const header of document.querySelectorAll<HTMLElement>('[data-sort]')) {
        const column = header.closest('[role="columnheader"]');
        column?.setAttribute('aria-sort', header === button ? (sortAscending ? 'ascending' : 'descending') : 'none');
      }
      renderWordList();
    });
  }
}

export function setupWordBrowser(): void {
  el('word-list').addEventListener('click', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.word-row[data-word]') : null;
    if (!row?.dataset.word) return;
    selectedWord = row.dataset.word;
    renderWordList();
  });
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
  renderWordList();
}

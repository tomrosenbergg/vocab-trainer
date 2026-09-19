import { el } from '../dom.ts';
import { activitySummary, wordSummaries, type WordSummary } from '../stats.ts';
import type { Progress, StudyCard } from '../study.ts';

export const activityMarkup = `
  <section id="activity" aria-labelledby="activity-title">
    <h2 id="activity-title">Activity</h2>
    <div class="activity-metrics">
      <div><strong id="reviews-today">0</strong><span>reviews today</span></div>
      <div><strong id="study-streak">0</strong><span>day streak</span></div>
      <div><strong id="study-days">0</strong><span>study days</span></div>
      <div><strong id="total-reviews">0</strong><span>total reviews</span></div>
    </div>
    <div class="heatmap-wrap"><div class="heatmap" id="heatmap" aria-label="Review activity over the last year"></div><p>Last year</p></div>
  </section>`;

export const cardsMarkup = `
  <section id="cards" class="app-view" aria-label="Card browser" hidden>
    <section class="words" aria-label="Card browser">
      <div class="word-browser">
        <div class="word-list-panel">
          <div class="card-filters" role="group" aria-label="Filter cards">
            <button type="button" data-card-filter="all" aria-pressed="true">All</button>
            <button type="button" data-card-filter="active" aria-pressed="false">Active</button>
            <button type="button" data-card-filter="suspended" aria-pressed="false">Suspended</button>
          </div>
          <div class="word-table" aria-label="Vocabulary">
            <div id="word-list" role="group" aria-label="Words"></div>
          </div>
        </div>
        <aside class="word-detail" id="word-detail" aria-labelledby="word-detail-title">
          <button class="card-action detail-suspend" id="detail-suspend" type="button" aria-label="Suspend card" data-tooltip="Suspend">×</button>
          <h3 id="word-detail-title">Choose a word</h3>
          <p class="detail-definition" id="word-detail-definition"></p>
          <p class="detail-example" id="word-detail-example"></p>
          <p class="detail-meta" id="word-detail-meta"></p>
        </aside>
        <div id="card-context-menu" class="card-context-menu" role="menu" hidden><button id="suspend-selected" type="button" role="menuitem">Suspend selected</button></div>
      </div>
    </section>
  </section>`;

let words: WordSummary[] = [];
let selectedWord: string | null = null;
let selectionAnchor: string | null = null;
let selectedWords = new Set<string>();
let currentDeck: StudyCard[] = [];
type CardFilter = 'all' | 'active' | 'suspended';
let cardFilter: CardFilter = 'all';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

function filteredWords(): WordSummary[] {
  if (cardFilter === 'active') return words.filter((word) => !word.suspended);
  if (cardFilter === 'suspended') return words.filter((word) => word.suspended);
  return words;
}

function renderWordList(): void {
  const focusedWord = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.word : undefined;
  const fragment = document.createDocumentFragment();
  const visibleWords = filteredWords();
  for (const item of visibleWords) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'word-row';
    row.classList.toggle('selected', selectedWords.has(item.word));
    row.classList.toggle('suspended', item.suspended);
    row.dataset.word = item.word;
    row.textContent = item.word;
    row.setAttribute('aria-label', item.suspended ? `${item.word}, suspended` : item.word);
    row.setAttribute('aria-pressed', String(selectedWords.has(item.word)));
    fragment.append(row);
  }
  if (!visibleWords.length) {
    const empty = document.createElement('p');
    empty.className = 'word-list-empty';
    empty.textContent = cardFilter === 'suspended' ? 'No suspended cards.' : 'No active cards.';
    fragment.append(empty);
  }
  el('word-list').replaceChildren(fragment);
  if (focusedWord) {
    const row = Array.from(el('word-list').querySelectorAll<HTMLButtonElement>('button')).find((button) => button.dataset.word === focusedWord);
    row?.focus({ preventScroll: true });
  }
  renderWordDetail();
}

function renderWordDetail(): void {
  const item = words.find((word) => word.word === selectedWord);
  const forward = currentDeck.find((card) => card.word === item?.word && card.direction === 'meaning');
  const suspend = el<HTMLButtonElement>('detail-suspend');
  if (!item || !forward) {
    el('word-detail-title').textContent = 'Choose a word';
    el('word-detail-meta').textContent = '';
    el('word-detail-definition').textContent = '';
    el('word-detail-example').textContent = '';
    suspend.hidden = true;
    return;
  }
  selectedWord = item.word;
  suspend.hidden = false;
  suspend.textContent = item.suspended ? '↶' : '×';
  suspend.dataset.tooltip = item.suspended ? 'Resume' : 'Suspend';
  suspend.setAttribute('aria-label', item.suspended ? `Resume ${item.word}` : `Suspend ${item.word}`);
  el('word-detail-title').textContent = item.word;
  el('word-detail-meta').textContent = `${item.reviews} ${item.reviews === 1 ? 'review' : 'reviews'} · next ${formatDate(item.nextReview)}`;
  el('word-detail-definition').textContent = item.definition;
  el('word-detail-example').textContent = `“${forward.example}”`;
}

export function setupWordBrowser(onSuspend: (words: string[], suspended: boolean) => void): void {
  el('word-list').addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.word-row[data-word]') : null;
    if (!row?.dataset.word) return;
    const visibleWords = filteredWords();
    const index = visibleWords.findIndex((word) => word.word === row.dataset.word);
    if (event.shiftKey && selectionAnchor) {
      const anchor = visibleWords.findIndex((word) => word.word === selectionAnchor);
      if (anchor >= 0 && index >= 0) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        selectedWords = new Set(visibleWords.slice(from, to + 1).map((word) => word.word));
      }
    } else if (event.metaKey || event.ctrlKey) {
      if (selectedWords.has(row.dataset.word)) selectedWords.delete(row.dataset.word); else selectedWords.add(row.dataset.word);
    } else selectedWords = new Set([row.dataset.word]);
    if (!event.shiftKey) selectionAnchor = row.dataset.word;
    selectedWord = row.dataset.word;
    renderWordList();
  });
  const menu = el<HTMLElement>('card-context-menu');
  el('word-list').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.word-row[data-word]') : null;
    if (!row?.dataset.word) return;
    if (!selectedWords.has(row.dataset.word)) { selectedWords = new Set([row.dataset.word]); selectionAnchor = row.dataset.word; }
    selectedWord = row.dataset.word;
    renderWordList();
    const chosen = words.filter((word) => selectedWords.has(word.word));
    const allSuspended = chosen.length > 0 && chosen.every((word) => word.suspended);
    el<HTMLButtonElement>('suspend-selected').textContent = allSuspended ? 'Resume selected' : 'Suspend selected';
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 52)}px`;
    menu.hidden = false;
    el('suspend-selected').focus({ preventScroll: true });
  });
  el('suspend-selected').addEventListener('click', () => {
    const chosen = words.filter((word) => selectedWords.has(word.word));
    const allSuspended = chosen.length > 0 && chosen.every((word) => word.suspended);
    onSuspend(chosen.map((word) => word.word), !allSuspended);
    menu.hidden = true;
  });
  el('detail-suspend').addEventListener('click', () => {
    const item = words.find((word) => word.word === selectedWord);
    if (item) onSuspend([item.word], !item.suspended);
  });
  document.querySelector('.card-filters')!.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-card-filter]') : null;
    const filter = button?.dataset.cardFilter;
    if (filter !== 'all' && filter !== 'active' && filter !== 'suspended') return;
    cardFilter = filter;
    document.querySelectorAll<HTMLButtonElement>('[data-card-filter]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item.dataset.cardFilter === cardFilter));
    });
    const visible = filteredWords();
    if (!visible.some((word) => word.word === selectedWord)) {
      selectedWord = visible[0]?.word ?? null;
      selectedWords = selectedWord ? new Set([selectedWord]) : new Set();
      selectionAnchor = selectedWord;
    }
    renderWordList();
  });
  document.addEventListener('click', (event) => { if (!(event.target instanceof Element && event.target.closest('#card-context-menu'))) menu.hidden = true; });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') menu.hidden = true; });
  document.querySelector('.word-table')!.addEventListener('scroll', () => { menu.hidden = true; });
}

export function renderActivityView(progress: Progress, now = new Date()): void {
  const summary = activitySummary(progress, now, 364);
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
  const visible = filteredWords();
  if (!selectedWord || !visible.some((word) => word.word === selectedWord)) selectedWord = visible[0]?.word ?? null;
  if (!selectionAnchor || !visible.some((word) => word.word === selectionAnchor)) selectionAnchor = selectedWord;
  selectedWords = new Set([...selectedWords].filter((word) => visible.some((item) => item.word === word)));
  if (selectedWord && !selectedWords.size) selectedWords.add(selectedWord);
  renderWordList();
}

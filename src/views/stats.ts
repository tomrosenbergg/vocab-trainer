import { el } from '../dom.ts';
import { activitySummary, wordSummaries, type WordSummary } from '../stats.ts';
import type { Progress, StudyCard } from '../study.ts';

export const statsMarkup = `
  <section id="stats" class="app-view" aria-labelledby="stats-title" hidden>
    <h1 id="stats-title">Activity</h1>
    <div class="activity-metrics">
      <div><strong id="reviews-today">0</strong><span>reviews today</span></div>
      <div><strong id="study-streak">0</strong><span>day streak</span></div>
      <div><strong id="study-days">0</strong><span>study days</span></div>
      <div><strong id="total-reviews">0</strong><span>total reviews</span></div>
    </div>
    <div class="heatmap-wrap"><div class="heatmap" id="heatmap" aria-label="Review activity over the last 12 weeks"></div><p>Last 12 weeks</p></div>
    <section class="words" aria-labelledby="words-title">
      <div class="words-heading"><h2 id="words-title">Words</h2><label class="sr-only" for="word-search">Search words</label><input id="word-search" type="search" placeholder="Search words" autocomplete="off"></div>
      <div class="word-table" role="table" aria-label="Vocabulary progress">
        <div class="word-row word-header" role="row"><span role="columnheader">Word</span><span role="columnheader">Status</span><span role="columnheader">Reviews</span><span role="columnheader">Pass rate</span><span role="columnheader">Last</span><span role="columnheader">Next</span></div>
        <div id="word-list" role="rowgroup"></div>
      </div>
      <p class="word-empty" id="word-empty" hidden>No words match that search.</p>
    </section>
  </section>`;

let words: WordSummary[] = [];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

export function renderWordList(query = ''): void {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? words.filter((item) => item.word.toLowerCase().includes(normalized) || item.definition.toLowerCase().includes(normalized))
    : words;
  const fragment = document.createDocumentFragment();
  for (const item of filtered) {
    const row = document.createElement('div');
    row.className = 'word-row';
    row.setAttribute('role', 'row');
    const values = [item.word, item.state, String(item.reviews), item.passRate === null ? '—' : `${Math.round(item.passRate * 100)}%`, formatDate(item.lastReviewed), formatDate(item.nextReview)];
    values.forEach((value, index) => {
      const cell = document.createElement('span');
      cell.setAttribute('role', 'cell');
      cell.textContent = value;
      if (index === 0) {
        const definition = document.createElement('small');
        definition.textContent = item.definition;
        cell.append(definition);
      }
      row.append(cell);
    });
    fragment.append(row);
  }
  el('word-list').replaceChildren(fragment);
  el('word-empty').hidden = filtered.length > 0;
}

export function renderStatsView(deck: StudyCard[], progress: Progress, now = new Date()): void {
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
  words = wordSummaries(deck, progress);
  renderWordList(el<HTMLInputElement>('word-search').value);
}

import { exportBackup, importBackup, restoreAnswer, type Undo } from './backup.ts';
import './style.css';
import csv from '../cards.csv?raw';
import {
  createDeck, dailyAllowance, isBuried,
  intervalLabel, nextStudyDay, nextCard, rateCard, readProgress,
  STORAGE_KEY,
  ANSWERS, type Answer, type Progress, type StudyCard,
} from './study.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="shell">
    <header><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Vocab home"><span class="brand-mark" aria-hidden="true">v.</span> vocab</a><div class="utilities"><button class="quiet" id="undo" type="button" hidden aria-keyshortcuts="Control+z Meta+z">Undo</button><details id="settings"><summary>Settings</summary><div class="settings-panel"><button class="quiet" id="export" type="button">Export progress</button><button class="quiet" id="import" type="button">Import progress</button><input id="backup-file" type="file" accept=".json,application/json" hidden><p id="backup-status" role="status"></p></div></details></div></header>
    <main>
      <section class="study" aria-label="Vocabulary practice">
        <button class="card" id="card" type="button" aria-describedby="reveal-hint">
          <span class="front" id="front"></span>
          <span class="answer" id="answer" hidden><span class="answer-rule"></span><span id="back"></span><span class="example" id="example"></span></span>
        </button>
        <div class="controls">
          <p class="reveal-hint" id="reveal-hint">click to reveal</p>
          <div class="ratings" id="ratings" hidden>
            ${ANSWERS.map((answer, index) => `<button class="rating" id="${answer}" type="button" aria-keyshortcuts="${index + 1}"><span>${answer[0].toUpperCase() + answer.slice(1)}</span><span class="interval" id="${answer}-interval"></span></button>`).join('')}
          </div>
        </div>
      </section>
      <section class="rest" id="rest" hidden><span class="rest-mark" aria-hidden="true">✓</span><h1 id="rest-title" tabindex="-1">You’re done for today.</h1><p id="daily-summary"></p><p id="next-review"></p></section>
      <p class="error" id="error" role="alert" hidden></p>
      <span class="sr-only" id="announcement" role="status" aria-live="polite"></span>
    </main>
    <footer><span class="dev-tools">${import.meta.env.DEV ? '<button class="dev-reset" id="reset-history" type="button" title="Development only">Reset history <span>dev</span></button>' : ''}</span><span class="local-note"><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none"><rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor"/></svg> saved in this browser</span></footer>
  </div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let progress: Progress;
let deck: StudyCard[] = [];
let current: StudyCard | null = null;
let revealed = false;
let failed = false;
let undo: Undo | null = null;

function fail(error: unknown) {
  failed = true;
  el('error').textContent = error instanceof Error ? error.message : 'Your browser could not save progress. Please enable browser storage and reload.';
  el('error').hidden = false;
  el<HTMLButtonElement>('card').disabled = true;
  for (const answer of ANSWERS) el<HTMLButtonElement>(answer).disabled = true;
  document.querySelector('.local-note')!.textContent = 'progress not saved';
}

function render() {
  const now = new Date();
  el('undo').hidden = !undo;
  revealed = false;
  el('ratings').hidden = true;
  el('answer').hidden = true;
  el('reveal-hint').hidden = false;
  const daily = dailyAllowance(progress, now);
  el('card').setAttribute('aria-disabled', 'false');
  current = nextCard(deck, progress, now);
  (document.querySelector('.study') as HTMLElement).hidden = !current;
  el('rest').hidden = Boolean(current);
  if (!current) {
    const title = 'You’re done for today.';
    el('rest-title').textContent = title;
    el('daily-summary').textContent = `${daily.introduced.length} new ${daily.introduced.length === 1 ? 'card' : 'cards'} practised today. All today’s reviews complete.`;
    el('next-review').textContent = `New study day: ${nextStudyDay(now).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`;
    el('announcement').textContent = title;
    return;
  }
  showCurrentCard();
}

function showCurrentCard() {
  if (!current) return;
  (document.querySelector('.study') as HTMLElement).hidden = false;
  el('rest').hidden = true;
  el('front').textContent = current.front;
  el('front').classList.toggle('definition', current.direction === 'word');
  el('back').textContent = current.back;
  el('example').textContent = current.example;
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
  el('card').setAttribute('aria-disabled', 'true');
  el('card').setAttribute('aria-label', `${current.front}. ${current.back}. Example: ${current.example}`);
  const now = new Date();
  for (const answer of ANSWERS) el(`${answer}-interval`).textContent = intervalLabel(progress, current, answer, now);
  el('announcement').textContent = `${current.back}. Example: ${current.example} Rate Again with 1, Hard with 2, Good with 3, or Easy with 4.`;
}

function rate(answer: Answer) {
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
    undo = { before: latest, after: JSON.stringify(updated), cardId: current.id };
    progress = updated;
    render();
    el(current ? 'card' : 'rest-title').focus({ preventScroll: true });
  } catch (error) { fail(error); }
}

function undoAnswer() {
  if (!undo || failed) return;
  try {
    const restored = restoreAnswer(undo, readProgress(localStorage));
    const cardId = undo.cardId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    progress = restored;
    undo = null;
    render();
    // Return to the exact graded card, even when the queue's ordering has changed.
    const card = deck.find((item) => item.id === cardId);
    if (card && !isBuried(card, progress, new Date())) {
      current = card;
      showCurrentCard();
      reveal();
    }
    el(current ? 'card' : 'rest-title').focus({ preventScroll: true });
  } catch (error) {
    undo = null;
    el('undo').hidden = true;
    el('announcement').textContent = error instanceof Error ? error.message : 'Could not undo answer.';
  }
}

el('undo').addEventListener('click', undoAnswer);
el('export').addEventListener('click', () => {
  try {
    const contents = exportBackup(readProgress(localStorage));
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocab-progress-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el('backup-status').textContent = 'Backup downloaded. Keep it somewhere safe.';
  } catch (error) { backupError(error); }
});
el('import').addEventListener('click', () => el<HTMLInputElement>('backup-file').click());
function backupError(error: unknown) {
  el('backup-status').textContent = error instanceof Error ? error.message : 'Could not save progress. Your current progress was not replaced.';
}
el('backup-file').addEventListener('change', async () => {
  const input = el<HTMLInputElement>('backup-file');
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('This file is too large. Choose a Vocab progress backup under 10 MB.');
    const imported = importBackup(await file.text());
    const importedDeck = createDeck(csv, imported.seed);
    if (!window.confirm(`Replace progress in this browser with this backup?\n\nIt contains ${Object.keys(imported.cards).length} studied cards. Export your current progress first if you want to keep it. This replaces rather than merges your history.`)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    progress = imported;
    deck = importedDeck;
    undo = null;
    failed = false;
    el('error').hidden = true;
    el<HTMLButtonElement>('card').disabled = false;
    for (const answer of ANSWERS) el<HTMLButtonElement>(answer).disabled = false;
    document.querySelector('.local-note')!.textContent = 'saved in this browser';
    render();
    el('backup-status').textContent = 'Progress restored.';
  } catch (error) { backupError(error); }
});

el('card').addEventListener('click', reveal);
for (const answer of ANSWERS) el(answer).addEventListener('click', () => rate(answer));
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
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable=true], #settings')) return;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
    if (undo) { event.preventDefault(); if (!event.repeat) undoAnswer(); }
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('#undo')) return;
  if (import.meta.env.DEV && event.target instanceof HTMLElement && event.target.closest('#reset-history')) return;
  if (!current) return;
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) reveal(); }
  const answer = /^[1-4]$/.test(event.key) ? ANSWERS[Number(event.key) - 1] : undefined;
  if (answer) { event.preventDefault(); if (!event.repeat) rate(answer); }
});
window.addEventListener('storage', (event) => {
  if (failed || (event.key !== STORAGE_KEY && event.key !== null)) return;
  undo = null;
  el('undo').hidden = true;
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

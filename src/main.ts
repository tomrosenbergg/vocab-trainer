import { exportBackup, importBackup, restoreAnswer, type Undo } from './backup.ts';
import './style.css';
import csv from '../cards.csv?raw';
import {
  createDeck, dailyAllowance, isBuried, remainingCards,
  nextCard, rateCard, readProgress, newProgress,
  STORAGE_KEY, DAILY_NEW_CARDS, setNewCardsPerDay,
  type Answer, type Progress, type StudyCard,
} from './study.ts';

const ANSWERS = ['again', 'good'] as const satisfies readonly Answer[];
const answerLabels = { again: 'Forgot', good: 'Got it' };

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="shell">
    <header><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Bird brain home"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18.5c0-5.1 3.2-9.3 8-9.3 4.6 0 7.8 3.5 7.8 7.4 0 4.2-3.1 7-7.8 7H9.5c-2 0-3.5-1.8-3.5-5.1Z" fill="currentColor" stroke="none"/><path d="M20.5 12.5 25 14.7l-4.1 2.2" fill="currentColor" stroke="none"/><circle cx="17" cy="12.8" r="1.1" fill="#17191b" stroke="none"/><path d="M10.2 18c1.7-1.8 4-2.1 6-.8" stroke="#17191b" stroke-width="1.4"/><path d="M11.5 23.2v2M16.5 23.2v2" stroke="currentColor" stroke-width="1.4"/></svg></span> bird brain</a><nav class="view-nav" aria-label="App views"><button class="settings-toggle quiet" id="open-practice" type="button" aria-label="Practice" aria-pressed="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6" y="6" width="14" height="16" rx="2"/><path d="M16 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2"/></svg></button><button class="settings-toggle quiet" id="open-settings" type="button" aria-label="Settings" aria-pressed="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.5 2-2 1.2-2-.5-2 3.5 1.5 1.5v2.6L2.5 15l2 3.5 2-.5 2 1.2.5 2h4l.5-2 2-1.2 2 .5 2-3.5-1.5-1.7v-2.6L19.5 9l-2-3.5-2 .5-2-1.2-.5-2Z"/><circle cx="11" cy="12" r="3"/></svg></button></nav></header>
    <main>
      <div id="practice-view" class="app-view">
      <section class="study" aria-label="Vocabulary practice">
        <button class="card" id="card" type="button" >
          <span class="front" id="front"></span>
          <span class="answer" id="answer" hidden><span class="answer-rule"></span><span id="back"></span><span class="example" id="example"></span></span>
        </button>
        <div class="controls">
          <div class="ratings" id="ratings" hidden>
            ${ANSWERS.map((answer, index) => `<button class="rating" id="${answer}" type="button" aria-keyshortcuts="${index + 1}"><span>${answerLabels[answer]}</span></button>`).join('')}
          </div>
        </div>
      </section>
      <section class="rest" id="rest" hidden><span class="rest-mark" aria-hidden="true">✓</span><h1 id="rest-title" tabindex="-1">You’re done for today.</h1><p id="daily-summary"></p><p>Come back tomorrow.</p></section>
      </div>
      <section id="settings" class="app-view" aria-labelledby="settings-title" hidden><h1 id="settings-title">Settings</h1><div id="daily-settings" class="settings-panel"><div class="limit-controls"><label for="daily-limit">New cards per day:</label><input id="daily-limit" type="text" inputmode="numeric" pattern="[0-9]*" value="10" aria-describedby="limit-status" autocomplete="off"></div><p id="limit-status" role="status"></p></div><div class="settings-panel"><h2>Progress</h2><p>Save a backup or restore your study history.</p><button class="quiet" id="export" type="button">Export progress</button><button class="quiet" id="import" type="button">Import progress</button><button class="quiet reset-progress" id="reset-progress" type="button">Reset progress</button><input id="backup-file" type="file" accept=".json,application/json" hidden><p id="backup-status" role="status"></p></div><section class="settings-panel about" aria-labelledby="about-title"><h2 id="about-title">About</h2><p>A minimalist vocabulary trainer built around active recall and spaced repetition.</p><p>Try to remember the answer before revealing it. Retrieving a word from memory helps strengthen your recall. Then choose “Forgot” or “Got it” to tell the app how you did.</p><p>The algorithm uses your answers to schedule future practice, bringing back words you struggle with more often and spacing out those you know. You spend more time on what needs practice, and less on what already sticks.</p><p>Make it a small daily habit. Start with 10 new cards a day and review the ones that return. Short, regular sessions over weeks and months give spaced repetition time to work—there’s no need to learn everything at once.</p></section></section>
      <p class="error" id="error" role="alert" hidden></p>
      <span class="sr-only" id="announcement" role="status" aria-live="polite"></span>
    </main>
    <footer><span></span><div class="user-messages"><p class="reveal-cue" id="reveal-cue" hidden>click anywhere to reveal</p><p class="remaining" id="remaining" aria-live="polite" aria-atomic="true"></p><span class="local-note"><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none"><rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor"/></svg> saved in this browser</span></div></footer>
  </div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let progress: Progress;
let deck: StudyCard[] = [];
let current: StudyCard | null = null;
let revealed = false;
let failed = false;
let activeView: 'practice' | 'settings' = 'practice';
const undoStack: Undo[] = [];

function fail(error: unknown) {
  failed = true;
  el('reveal-cue').hidden = true;
  document.querySelector('main')!.classList.remove('can-reveal');
  el('error').textContent = error instanceof Error ? error.message : 'Your browser could not save progress. Please enable browser storage and reload.';
  el('error').hidden = false;
  el<HTMLButtonElement>('card').disabled = true;
  for (const answer of ANSWERS) el<HTMLButtonElement>(answer).disabled = true;
  document.querySelector('.local-note')!.textContent = 'progress not saved';
}

function render() {
  const now = new Date();
  revealed = false;
  el('ratings').hidden = true;
  el('answer').hidden = true;
  const daily = dailyAllowance(progress, now);
  const remaining = remainingCards(deck, progress, now);
  el('remaining').textContent = `${remaining} ${remaining === 1 ? 'card' : 'cards'} left today`;
  el('remaining').hidden = remaining === 0;
  el('remaining').setAttribute('aria-label', `${remaining} cards remaining today`);
  el('card').setAttribute('aria-disabled', 'false');
  current = nextCard(deck, progress, now);
  (document.querySelector('.study') as HTMLElement).hidden = !current;
  el('rest').hidden = Boolean(current);
  el('reveal-cue').hidden = !current || Object.keys(progress.cards).length >= 3;
  document.querySelector('main')!.classList.toggle('can-reveal', Boolean(current) && !failed);
  el<HTMLInputElement>('daily-limit').value = String(progress.newCardsPerDay ?? DAILY_NEW_CARDS);
  updateView();
  if (!current) {
    const title = 'You’re done for today.';
    el('rest-title').textContent = title;
    el('daily-summary').textContent = `${daily.introduced.length} new ${daily.introduced.length === 1 ? 'card' : 'cards'} practised today. All today’s reviews complete.`;
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
  if (activeView !== 'practice' || !current || revealed || failed) return;
  revealed = true;
  el('answer').hidden = false;
  el('reveal-cue').hidden = true;
  document.querySelector('main')!.classList.remove('can-reveal');
  el('ratings').hidden = false;
  el('card').setAttribute('aria-disabled', 'true');
  el('card').setAttribute('aria-label', `${current.front}. ${current.back}. Example: ${current.example}`);
  el('announcement').textContent = `${current.back}. Example: ${current.example} Choose Forgot with 1 or Got it with 2.`;
}

function rate(answer: Answer) {
  if (!current || !revealed || failed) return;
  try {
    // Read again before writing so another tab's reviews aren't overwritten.
    const latest = readProgress(localStorage);
    if (isBuried(current, latest, new Date()) || latest.cards[current.id]?.last_review !== progress.cards[current.id]?.last_review ||
        JSON.stringify(latest.daily) !== JSON.stringify(progress.daily)) {
      undoStack.length = 0;
      progress = latest;
      render();
      return;
    }
    const updated = rateCard(latest, current, answer, new Date());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    undoStack.push({ before: latest, after: JSON.stringify(updated), cardId: current.id });
    progress = updated;
    render();
    el(current ? 'card' : 'rest-title').focus({ preventScroll: true });
  } catch (error) { fail(error); }
}

function undoAnswer() {
  const undo = undoStack.at(-1);
  if (!undo || failed) return;
  try {
    const restored = restoreAnswer(undo, readProgress(localStorage));
    const cardId = undo.cardId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    progress = restored;
    undoStack.pop();
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
    undoStack.length = 0;
    el('announcement').textContent = error instanceof Error ? error.message : 'Could not undo answer.';
  }
}

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
    undoStack.length = 0;
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
document.querySelector('main')!.addEventListener('click', (event) => {
  // Rating clicks render the next card before bubbling: never reveal it too.
  if (event.target instanceof Element && event.target.closest('button, a, input, summary, select, textarea')) return;
  reveal();
});
for (const answer of ANSWERS) el(answer).addEventListener('click', () => rate(answer));
el('reset-progress').addEventListener('click', () => {
  if (!window.confirm('Reset all study progress in this browser?\n\nThis clears your card history and schedules. Your new-cards-per-day setting is kept. Export a backup first if you want to restore your progress later. This cannot be undone.')) return;
  try {
    const latest = readProgress(localStorage);
    const fresh = newProgress();
    fresh.newCardsPerDay = latest.newCardsPerDay ?? DAILY_NEW_CARDS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    window.location.reload();
  } catch (error) { backupError(error); }
});

function updateView() {
  const studying = activeView === 'practice';
  el('practice-view').hidden = !studying;
  el('settings').hidden = studying;
  el('open-practice').setAttribute('aria-pressed', String(studying));
  el('open-settings').setAttribute('aria-pressed', String(!studying));
  document.querySelector('main')!.classList.toggle('can-reveal', studying && Boolean(current) && !revealed && !failed);
  el('reveal-cue').hidden = !studying || !current || revealed || failed || Object.keys(progress.cards).length >= 3;
}
el('daily-limit').addEventListener('input', () => {
  if (failed) return;
  const input = el<HTMLInputElement>('daily-limit');
  const value = input.value;
  el('limit-status').textContent = '';
  if (value === '') return; // Allow clearing the field while replacing a number.
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    el('limit-status').textContent = 'Enter a whole number of 0 or more.';
    return;
  }
  const start = input.selectionStart;
  const end = input.selectionEnd;
  try {
    const latest = readProgress(localStorage);
    const updated = setNewCardsPerDay(latest, Number(value));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    progress = updated;
    undoStack.length = 0;
    render();
    input.value = value;
    input.setSelectionRange(start, end);
  } catch (error) {
    el('limit-status').textContent = error instanceof Error ? error.message : 'Could not save. Please try again.';
  }
});
el('daily-limit').addEventListener('blur', () => {
  el<HTMLInputElement>('daily-limit').value = String(progress.newCardsPerDay ?? DAILY_NEW_CARDS);
});
el('open-practice').addEventListener('click', () => { activeView = 'practice'; if (!current) render(); else updateView(); });
el('open-settings').addEventListener('click', () => { activeView = 'settings'; updateView(); });

document.addEventListener('keydown', (event) => {
  if (activeView !== 'practice') return;
  if (event.target instanceof HTMLElement && event.target.closest('.view-nav')) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable=true], #settings')) return;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
    if (undoStack.length) { event.preventDefault(); if (!event.repeat) undoAnswer(); }
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (!current) return;
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) reveal(); }
  const answer = /^[1-2]$/.test(event.key) ? ANSWERS[Number(event.key) - 1] : undefined;
  if (answer) { event.preventDefault(); if (!event.repeat) rate(answer); }
});
window.addEventListener('storage', (event) => {
  if (failed || (event.key !== STORAGE_KEY && event.key !== null)) return;
  undoStack.length = 0;
  try { progress = readProgress(localStorage); deck = createDeck(csv, progress.seed); render(); }
  catch (error) { fail(error); }
});
// Wake due reviews in a tab left open, without interrupting an active card.
setInterval(() => { if (!failed && !current && activeView === 'practice') render(); }, 15000);

try {
  progress = readProgress(localStorage);
  deck = createDeck(csv, progress.seed);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  render();
} catch (error) { fail(error); }

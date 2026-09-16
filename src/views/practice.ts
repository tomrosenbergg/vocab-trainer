import { el } from '../dom.ts';
import type { StudyCard } from '../study.ts';

export const practiceMarkup = `
  <div id="practice-view" class="app-view">
    <section class="study" aria-label="Vocabulary practice">
      <button class="card" id="card" type="button">
        <span class="front" id="front"></span>
        <span class="answer" id="answer" hidden><span class="answer-rule"></span><span id="back"></span><span class="example" id="example"></span></span>
      </button>
      <p class="reveal-cue" id="reveal-cue" hidden>click anywhere to reveal</p>
      <div class="controls">
        <div class="ratings" id="ratings" hidden>
          <button class="rating" id="again" type="button" aria-keyshortcuts="1"><span>Fail</span></button>
          <button class="rating" id="good" type="button" aria-keyshortcuts="2"><span>Pass</span></button>
        </div>
      </div>
    </section>
    <section class="rest" id="rest" hidden><span class="rest-mark" aria-hidden="true">✓</span><h1 id="rest-title" tabindex="-1">You’re done for today.</h1><p id="daily-summary"></p><p>Come back tomorrow.</p></section>
  </div>`;

export function renderPracticeCard(card: StudyCard): void {
  (document.querySelector('.study') as HTMLElement).hidden = false;
  el('rest').hidden = true;
  el('front').textContent = card.front;
  el('front').classList.toggle('definition', card.direction === 'word');
  el('back').textContent = card.back;
  el('example').textContent = card.example;
  el('back').classList.toggle('word-answer', card.direction === 'word');
  el('card').setAttribute('aria-label', `${card.front}. Reveal answer`);
  el('announcement').textContent = `${card.direction === 'meaning' ? 'Recall the meaning' : 'Recall the word'}: ${card.front}`;
}

export function revealPracticeCard(card: StudyCard): void {
  el('answer').hidden = false;
  el('reveal-cue').hidden = true;
  document.querySelector('main')!.classList.remove('can-reveal');
  el('ratings').hidden = false;
  el('card').setAttribute('aria-disabled', 'true');
  el('card').setAttribute('aria-label', `${card.front}. ${card.back}. Example: ${card.example}`);
  el('announcement').textContent = `${card.back}. Example: ${card.example} Choose Fail with 1 or Pass with 2.`;
}

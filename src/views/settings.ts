import { activityMarkup } from './stats.ts';

export const settingsMarkup = `
  <section id="settings" class="app-view" aria-labelledby="settings-title" hidden>
    <h1 id="settings-title">Settings</h1>
    ${activityMarkup}
    <section class="settings-panel" aria-labelledby="study-settings-title">
      <h2 id="study-settings-title">Study</h2>
      <div class="setting-row">
        <div><label for="daily-limit">New cards per day</label><p>How many unseen cards enter your queue each day.</p></div>
        <input id="daily-limit" type="text" inputmode="numeric" pattern="[0-9]*" value="10" aria-describedby="limit-status" autocomplete="off">
      </div>
      <p class="setting-status" id="limit-status" role="status"></p>
      <div class="setting-row">
        <div><label for="both-directions">Test both directions</label><p>Also test definition → word cards.</p></div>
        <input id="both-directions" type="checkbox" aria-describedby="direction-status">
      </div>
      <p class="setting-status" id="direction-status" role="status"></p>
    </section>
    <section class="settings-panel" aria-labelledby="progress-settings-title">
      <h2 id="progress-settings-title">Progress</h2>
      <p>Move your study history between browsers or keep a backup.</p>
      <div class="progress-actions">
        <button class="quiet" id="export" type="button">Export progress</button>
        <button class="quiet" id="import" type="button">Import progress</button>
      </div>
      <button class="quiet reset-progress" id="reset-progress" type="button">Reset progress</button>
      <input id="backup-file" type="file" accept=".json,application/json" hidden><p id="backup-status" role="status"></p>
    </section>
    <section class="settings-panel about" aria-labelledby="about-title">
      <h2 id="about-title">About</h2>
      <p>Bird Brain is a minimalist vocabulary trainer built around active recall and spaced repetition.</p>
      <p>Try to recall each meaning before revealing it, then choose “Again” or “Good.” Your answers determine when each card returns: difficult words come back sooner, while familiar ones are spaced further apart.</p>
      <p>Consistency matters more than long sessions. Learn a small number of new cards each day and complete the reviews that return. Over time, repeated retrieval makes the vocabulary easier to recall.</p>
      <p>Your study history stays in this browser. Bird Brain uses cookie-free, anonymous traffic analytics.</p>
      <p class="feedback">Questions or feedback? <a href="mailto:hello@bird-brain.xyz">hello@bird-brain.xyz</a></p>
    </section>
  </section>`;

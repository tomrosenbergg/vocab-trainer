export const settingsMarkup = `
  <section id="settings" class="app-view" aria-labelledby="settings-title" hidden>
    <h1 id="settings-title">Settings</h1>
    <div id="daily-settings" class="settings-panel">
      <div class="limit-controls"><label for="daily-limit">New cards per day:</label><input id="daily-limit" type="text" inputmode="numeric" pattern="[0-9]*" value="10" aria-describedby="limit-status" autocomplete="off"></div>
      <p id="limit-status" role="status"></p>
    </div>
    <div class="settings-panel">
      <h2>Progress</h2><p>Save a backup or restore your study history.</p>
      <button class="quiet" id="export" type="button">Export progress</button>
      <button class="quiet" id="import" type="button">Import progress</button>
      <button class="quiet reset-progress" id="reset-progress" type="button">Reset progress</button>
      <input id="backup-file" type="file" accept=".json,application/json" hidden><p id="backup-status" role="status"></p>
    </div>
    <section class="settings-panel about" aria-labelledby="about-title">
      <h2 id="about-title">About</h2>
      <p>A minimalist vocabulary trainer built around active recall and spaced repetition.</p>
      <p>Try to remember the answer before revealing it. Retrieving a word from memory helps strengthen your recall. Then choose “Fail” or “Pass” to tell the app how you did.</p>
      <p>The algorithm uses your answers to schedule future practice, bringing back words you struggle with more often and spacing out those you know. You spend more time on what needs practice, and less on what already sticks.</p>
      <p>Make it a small daily habit. Start with 10 new cards a day and review the ones that return. Short, regular sessions over weeks and months give spaced repetition time to work—there’s no need to learn everything at once.</p>
    </section>
  </section>`;

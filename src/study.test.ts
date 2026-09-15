import { exportBackup, importBackup, restoreAnswer } from './backup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setNewCardsPerDay, remainingCards, remainingCardCounts, addExtraCards, createDeck, dailyAllowance, isBuried, newCardsAvailableToday, newProgress, nextStudyDay, nextCard, nextReviewAt, parseProgress, rateCard, readProgress } from './study.ts';

const now = new Date(2026, 8, 14, 12);
const tomorrow = new Date(2026, 8, 15, 4, 0);
const csv = readFileSync(new URL('../cards.csv', import.meta.url), 'utf8');
const pair = createDeck('mitigate,make less severe,These measures mitigate the risk.', 1);
function finishAvailable(progress = newProgress(now), deck = createDeck(csv, progress.seed), time = now) {
  for (let i = 0; i < 200; i++) {
    const card = nextCard(deck, progress, time);
    if (!card) return progress;
    progress = rateCard(progress, card, 'easy', time);
  }
  throw new Error('Queue did not finish');
}

test('CSV creates stable independent directions, including quoted commas', () => {
  const deck = createDeck(csv, 42);
  assert.equal(deck.length, 1982);
  assert.equal(new Set(deck.map((card) => card.id)).size, 1982);
  const forward = deck.find((card) => card.word === 'abase' && card.direction === 'meaning')!;
  const reverse = deck.find((card) => card.word === 'abase' && card.direction === 'word')!;
  assert.equal(forward.back, 'to humiliate or degrade someone');
  assert.equal(forward.example, reverse.example);
  assert.ok(deck.every((card) => card.example.length > 0));
  assert.equal(reverse.front, forward.back);
  assert.equal(reverse.back, forward.front);
  assert.deepEqual(createDeck(csv, 42), deck);
});

test('ten new cards introduce ten different words, then stop; reload preserves the limit', () => {
  const progress = newProgress(now);
  const deck = createDeck(csv, progress.seed);
  const finished = finishAvailable(progress, deck);
  assert.equal(finished.today, 10);
  assert.equal(finished.daily.introduced.length, 10);
  assert.equal(Object.keys(finished.cards).length, 10);
  assert.equal(new Set(finished.daily.introduced.map((id) => id.split(':')[0])).size, 10);
  const loaded = readProgress({ getItem: () => JSON.stringify(finished) }, now);
  assert.deepEqual(loaded, finished);
  assert.equal(nextCard(deck, loaded, now), null);
});

test('reviewing either direction buries only its sibling until local 4am', () => {
  for (const index of [0, 1]) {
    const reviewed = pair[index];
    const sibling = pair[1 - index];
    const progress = rateCard(newProgress(now), reviewed, 'again', now);
    assert.equal(isBuried(sibling, progress, now), true);
    assert.equal(isBuried(reviewed, progress, now), false);
    assert.equal(nextCard(pair, progress, now)?.id, reviewed.id);
    assert.throws(() => rateCard(progress, sibling, 'good', now), /sibling/);
    const loaded = parseProgress(JSON.stringify(progress), now);
    assert.equal(isBuried(sibling, loaded, now), true);
    assert.equal(isBuried(sibling, loaded, tomorrow), false);
    assert.equal(progress.cards[sibling.id], undefined, 'burying must not create or schedule the reverse');
    const introducedReverse = rateCard(loaded, sibling, 'good', tomorrow);
    assert.deepEqual(introducedReverse.daily.introduced, [sibling.id]);
  }
});

test('same-card Again repeats stay available and do not spend a second new-card slot', () => {
  const hard = rateCard(newProgress(now), pair[0], 'again', now);
  const easy = rateCard(newProgress(now), pair[0], 'good', now);
  assert.ok(Date.parse(hard.cards[pair[0].id].due) < Date.parse(easy.cards[pair[0].id].due));
  const due = new Date(hard.cards[pair[0].id].due);
  assert.equal(nextCard(pair, hard, due)?.id, pair[0].id);
  const repeated = rateCard(hard, pair[0], 'good', due);
  assert.equal(repeated.daily.introduced.length, 1);
  assert.equal(repeated.cards[pair[0].id].reps, 2);
});

test('due siblings are buried without changing their FSRS state or due date', () => {
  const priorDay = new Date(2026, 8, 12, 12);
  const nextDay = new Date(2026, 8, 13, 12);
  let progress = rateCard(newProgress(priorDay), pair[0], 'good', priorDay);
  progress = rateCard(progress, pair[1], 'good', nextDay);
  const siblingBefore = { ...progress.cards[pair[1].id] };
  progress = rateCard(progress, pair[0], 'good', now);
  assert.equal(isBuried(pair[1], progress, now), true);
  assert.equal(nextCard(pair, progress, now), null);
  assert.deepEqual(progress.cards[pair[1].id], siblingBefore);
  assert.equal(isBuried(pair[1], progress, tomorrow), false);
  assert.ok(nextCard(pair, progress, tomorrow));
  assert.ok(nextReviewAt([pair[1]], progress, now)!.getTime() > now.getTime(), 'completion must not advertise a buried overdue card in the past');
});

test('extra five-card batch persists and cannot bypass burying or unfinished work', () => {
  const initial = newProgress(now);
  const deck = createDeck(csv, initial.seed);
  assert.equal(addExtraCards(deck, initial, now), initial);
  const finished = finishAvailable(initial, deck);
  const extended = parseProgress(JSON.stringify(addExtraCards(deck, finished, now)), now);
  assert.equal(dailyAllowance(extended, now).limit, 15);
  assert.equal(addExtraCards(deck, extended, now), extended);
  const finishedMore = finishAvailable(extended, deck);
  assert.equal(finishedMore.today, 15);
  assert.equal(new Set(finishedMore.daily.introduced.map((id) => id.split(':')[0])).size, 15);
  const tiny = finishAvailable(newProgress(now), pair);
  assert.equal(newCardsAvailableToday(pair, tiny, now), 0);
  assert.equal(addExtraCards(pair, tiny, now), tiny, 'no extra batch when only buried new cards remain');
  assert.equal(newCardsAvailableToday(pair, tiny, tomorrow), 1);
});

test('4am resets allowance and extra batches; missed days do not accumulate', () => {
  const before = new Date(2026, 8, 14, 23, 59);
  const deck = createDeck(csv, 2);
  const finished = finishAvailable(newProgress(before), deck, before);
  const extended = addExtraCards(deck, finished, before);
  assert.equal(dailyAllowance(extended, before).limit, 15);
  assert.equal(dailyAllowance(extended, tomorrow).limit, 10);
  assert.equal(dailyAllowance(extended, tomorrow).introduced.length, 0);
  const later = new Date(2026, 9, 20, 12);
  assert.equal(dailyAllowance(extended, later).limit, 10);
  const due = nextCard(deck, extended, later)!;
  assert.ok(extended.cards[due.id], 'overdue reviews still precede new cards');
});

test('card allowance includes a previously unseen reverse direction', () => {
  const initial = newProgress(now);
  const deck = createDeck(csv, initial.seed);
  const finished = finishAvailable(initial, deck);
  const reverse = deck.find((card) => card.id.split(':')[0] === finished.daily.introduced[0].split(':')[0] && !finished.cards[card.id])!;
  const nextDay = rateCard(finished, reverse, 'good', tomorrow);
  assert.equal(nextDay.daily.introduced.length, 1);
  assert.equal(nextDay.daily.introduced[0], reverse.id);
});

test('word-based and unlimited progress migrate without changing card schedules', () => {
  const first = rateCard(newProgress(now), pair[0], 'good', now);
  const legacy = { ...first, daily: { day: first.daily.day, introduced: ['mitigate'], extra: 5 } };
  const loaded = parseProgress(JSON.stringify(legacy), now);
  assert.equal(loaded.daily.unit, 'cards');
  assert.equal(dailyAllowance(loaded, now).limit, 20);
  assert.deepEqual(loaded.daily.introduced, [pair[0].id]);
  assert.deepEqual(loaded.cards, first.cards);
  assert.equal(isBuried(pair[1], loaded, now), true);
  const { daily: _daily, ...unlimited } = first;
  assert.deepEqual(parseProgress(JSON.stringify(unlimited), now).cards, first.cards);
});

test('malformed data is rejected instead of silently resetting progress', () => {
  assert.throws(() => createDeck('word,definition,Example.\nword,other,Another example.', 1), /Duplicate/);
  assert.throws(() => createDeck('word,,Example.', 1), /Incomplete/);
  assert.throws(() => parseProgress('{broken'));
  assert.throws(() => parseProgress('{"version":2}'));
  const progress = rateCard(newProgress(now), pair[0], 'good', now);
  assert.throws(() => parseProgress(JSON.stringify({ ...progress, daily: { ...progress.daily, extra: -1 } })));
  progress.cards[pair[0].id].due = 'bad date';
  assert.throws(() => parseProgress(JSON.stringify(progress)));
});


test('three-column CSV preserves quoted punctuation and example content in both directions', () => {
  const deck = createDeck('mitigate,"to reduce, lessen","The plan, described as ""practical,"" should mitigate the risk."', 1);
  assert.equal(deck[0].example, 'The plan, described as "practical," should mitigate the risk.');
  assert.equal(deck[0].example, deck[1].example);
  assert.equal(deck[0].back, deck[1].front);
  assert.throws(() => createDeck('word,definition', 1), /Incomplete/);
  assert.throws(() => createDeck('word,definition,', 1), /Incomplete/);
  assert.throws(() => createDeck('word,definition,Example.,extra', 1), /Incomplete/);
});

test('definition and sentence edits keep stable IDs and existing review history', () => {
  const original = createDeck('mitigate,make less severe,These measures mitigate the risk.', 1);
  const progress = rateCard(newProgress(now), original[0], 'good', now);
  const updated = createDeck('mitigate,reduce severity,The barriers mitigate flood damage.', 1);
  assert.deepEqual(updated.map((card) => card.id), original.map((card) => card.id));
  assert.equal(updated[0].back, 'reduce severity');
  assert.equal(updated[0].example, 'The barriers mitigate flood damage.');
  assert.equal(progress.cards[updated[0].id].reps, 1);
  assert.equal(isBuried(updated[1], progress, now), true);
  assert.equal(nextCard(updated, progress, now)?.id, original[0].id);
});


test('four answer choices use distinct FSRS grades and preserve saved progress', () => {
  const progress = newProgress(now);
  const results = ['again', 'hard', 'good', 'easy'].map((answer) =>
    rateCard(progress, pair[0], answer as import('./study.ts').Answer, now));
  const due = results.map((result) => Date.parse(result.cards[pair[0].id].due));
  assert.ok(due[0] < due[1] && due[1] < due[2] && due[2] < due[3]);
  assert.equal(results[3].cards[pair[0].id].state, 2, 'Easy graduates a new card to review');
  for (const result of results) assert.deepEqual(parseProgress(JSON.stringify(result)), result);
});


test('4am boundary controls allowance, sibling burying and future reviews', () => {
  const before = new Date(2026, 8, 15, 3, 59);
  const after = new Date(2026, 8, 15, 4);
  const progress = rateCard(newProgress(now), pair[0], 'easy', now);
  progress.cards[pair[0].id].due = new Date(2026, 8, 15, 15).toISOString();
  assert.equal(dailyAllowance(progress, before).introduced.length, 1);
  assert.equal(isBuried(pair[1], progress, before), true);
  assert.equal(nextCard(pair, progress, before), null);
  assert.equal(nextReviewAt(pair, progress, before)?.getTime(), after.getTime());
  assert.equal(dailyAllowance(progress, after).introduced.length, 0);
  assert.equal(isBuried(pair[1], progress, after), false);
  assert.equal(nextCard(pair, progress, after)?.id, pair[0].id);
});

test('learning repeats can finish immediately, then the queue stays complete until 4am', () => {
  let progress = rateCard(newProgress(now), pair[0], 'good', now);
  assert.ok(Date.parse(progress.cards[pair[0].id].due) > now.getTime());
  assert.equal(nextCard(pair, progress, now)?.id, pair[0].id);
  progress = rateCard(progress, pair[0], 'good', now);
  assert.equal(nextCard(pair, progress, now), null);
  assert.equal(nextCard(pair, parseProgress(JSON.stringify(progress)), new Date(2026, 8, 15, 3, 59)), null);
});


test('4am rollover follows local daylight saving rather than adding 24 hours', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const spring = new Date(2026, 2, 7, 4);
    const fall = new Date(2026, 9, 31, 4);
    assert.equal(nextStudyDay(spring).getHours(), 4);
    assert.equal((nextStudyDay(spring).getTime() - spring.getTime()) / 3600000, 23);
    assert.equal((nextStudyDay(fall).getTime() - fall.getTime()) / 3600000, 25);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('backup round trip preserves scheduling, shuffle and daily allowance', () => {
  const before = rateCard(newProgress(now), pair[0], 'hard', now);
  const restored = importBackup(exportBackup(before));
  assert.deepEqual(restored, before);
  assert.throws(() => importBackup('{}'), /backup/);
  assert.throws(() => importBackup('{invalid'));
  const broken = JSON.parse(exportBackup(before));
  broken.progress.cards[pair[0].id].due = 'invalid';
  assert.throws(() => importBackup(JSON.stringify(broken)), /Saved progress/);
  assert.deepEqual(importBackup(exportBackup(newProgress(now))).cards, {});
});

test('undo restores new-card allowance, sibling availability and FSRS state', () => {
  const before = newProgress(now);
  const after = rateCard(before, pair[0], 'again', now);
  const undo = { before, after: JSON.stringify(after), cardId: pair[0].id };
  const restored = restoreAnswer(undo, parseProgress(JSON.stringify(after)));
  assert.deepEqual(restored, before);
  assert.equal(dailyAllowance(restored, now).introduced.length, 0);
  assert.equal(isBuried(pair[1], restored, now), false);
  const repeated = rateCard(after, pair[0], 'good', now);
  assert.deepEqual(restoreAnswer({ before: after, after: JSON.stringify(repeated), cardId: pair[0].id }, repeated), after);
  assert.throws(() => restoreAnswer(undo, repeated), /another tab/);
  assert.throws(() => restoreAnswer(undo, newProgress(now)), /another tab/);
});


test('remaining count respects allowance, siblings, repeats and completion', () => {
  const initial = newProgress(now);
  const deck = createDeck(csv, initial.seed);
  assert.equal(remainingCards(deck, initial, now), 10);
  assert.equal(remainingCards(pair, initial, now), 1);
  const again = rateCard(initial, pair[0], 'again', now);
  const againCounts = remainingCardCounts(pair, again, now);
  assert.equal(remainingCards(pair, again, now), againCounts.newCards + againCounts.reviews + againCounts.learning);
  assert.ok(againCounts.learning >= 0);
  const easy = rateCard(initial, pair[0], 'easy', now);
  assert.equal(remainingCards(pair, easy, now), 0);
  assert.equal(remainingCards(deck, finishAvailable(initial, deck), now), 0);
  const bothDue = structuredClone(again);
  bothDue.cards[pair[0].id].last_review = new Date(2026, 8, 12, 12).toISOString();
  bothDue.cards[pair[1].id] = { ...bothDue.cards[pair[0].id] };
  assert.equal(remainingCards(pair, bothDue, now), 1, 'due siblings only count once');
  delete bothDue.cards[pair[1].id];
  assert.equal(remainingCards(pair, bothDue, now), 1, 'unseen sibling of a due card is not extra work');
});


test('successive undos restore the whole session and allow corrected answers', () => {
  const start = newProgress(now);
  const first = rateCard(start, pair[0], 'again', now);
  const second = rateCard(first, pair[0], 'hard', now);
  const third = rateCard(second, pair[0], 'good', now);
  const stack = [
    { before: start, after: JSON.stringify(first), cardId: pair[0].id },
    { before: first, after: JSON.stringify(second), cardId: pair[0].id },
    { before: second, after: JSON.stringify(third), cardId: pair[0].id },
  ];
  let restored = third;
  restored = restoreAnswer(stack.pop()!, restored);
  assert.deepEqual(restored, second);
  const corrected = rateCard(restored, pair[0], 'easy', now);
  stack.push({ before: restored, after: JSON.stringify(corrected), cardId: pair[0].id });
  restored = corrected;
  while (stack.length) restored = restoreAnswer(stack.pop()!, restored);
  assert.deepEqual(restored, start);
});


test('daily limit changes apply now and persist without removing reviews', () => {
  const initial = newProgress(now);
  const deck = createDeck(csv, initial.seed);
  const finished = finishAvailable(initial, deck);
  const increased = setNewCardsPerDay(finished, 12);
  assert.equal(remainingCards(deck, increased, now), 2);
  const loaded = parseProgress(JSON.stringify(increased));
  assert.equal(dailyAllowance(loaded, tomorrow).limit, 12);
  const lowered = setNewCardsPerDay(finished, 5);
  assert.equal(nextCard(deck, lowered, now), null);
  assert.equal(lowered.daily.introduced.length, 10);
  assert.equal(dailyAllowance(lowered, tomorrow).limit, 5);
  assert.deepEqual(lowered.cards, finished.cards);
  const review = rateCard(initial, pair[0], 'again', now);
  assert.equal(nextCard(pair, setNewCardsPerDay(review, 0), now)?.id, pair[0].id);
  assert.equal(dailyAllowance(parseProgress(JSON.stringify(initial)), now).limit, 10);
  for (const invalid of [-1, 1.5, NaN]) assert.throws(() => setNewCardsPerDay(initial, invalid));
  assert.throws(() => parseProgress(JSON.stringify({ ...initial, newCardsPerDay: -1 })));
});

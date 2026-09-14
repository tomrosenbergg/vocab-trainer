import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addExtraCards, createDeck, dailyAllowance, isBuried, newCardsAvailableToday, newProgress, nextCard, nextReviewAt, parseProgress, rateCard, readProgress } from './study.ts';

const now = new Date(2026, 8, 14, 12);
const tomorrow = new Date(2026, 8, 15, 0, 1);
const csv = readFileSync(new URL('../words-definitions.csv', import.meta.url), 'utf8');
const pair = createDeck('mitigate,make less severe', 1);
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
  assert.equal(forward.back, 'to humiliate, degrade');
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

test('reviewing either direction buries only its sibling until local midnight', () => {
  for (const index of [0, 1]) {
    const reviewed = pair[index];
    const sibling = pair[1 - index];
    const progress = rateCard(newProgress(now), reviewed, 'hard', now);
    assert.equal(isBuried(sibling, progress, now), true);
    assert.equal(isBuried(reviewed, progress, now), false);
    assert.equal(nextCard(pair, progress, now), null);
    assert.throws(() => rateCard(progress, sibling, 'easy', now), /sibling/);
    const loaded = parseProgress(JSON.stringify(progress), now);
    assert.equal(isBuried(sibling, loaded, now), true);
    assert.equal(isBuried(sibling, loaded, tomorrow), false);
    assert.equal(progress.cards[sibling.id], undefined, 'burying must not create or schedule the reverse');
    const introducedReverse = rateCard(loaded, sibling, 'easy', tomorrow);
    assert.deepEqual(introducedReverse.daily.introduced, [sibling.id]);
  }
});

test('same-card Hard repeats stay available and do not spend a second new-card slot', () => {
  const hard = rateCard(newProgress(now), pair[0], 'hard', now);
  const easy = rateCard(newProgress(now), pair[0], 'easy', now);
  assert.ok(Date.parse(hard.cards[pair[0].id].due) < Date.parse(easy.cards[pair[0].id].due));
  const due = new Date(hard.cards[pair[0].id].due);
  assert.equal(nextCard(pair, hard, due)?.id, pair[0].id);
  const repeated = rateCard(hard, pair[0], 'easy', due);
  assert.equal(repeated.daily.introduced.length, 1);
  assert.equal(repeated.cards[pair[0].id].reps, 2);
});

test('due siblings are buried without changing their FSRS state or due date', () => {
  const priorDay = new Date(2026, 8, 12, 12);
  const nextDay = new Date(2026, 8, 13, 12);
  let progress = rateCard(newProgress(priorDay), pair[0], 'easy', priorDay);
  progress = rateCard(progress, pair[1], 'easy', nextDay);
  const siblingBefore = { ...progress.cards[pair[1].id] };
  progress = rateCard(progress, pair[0], 'easy', now);
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

test('midnight resets allowance and extra batches; missed days do not accumulate', () => {
  const before = new Date(2026, 8, 14, 23, 59);
  const deck = createDeck(csv, 2);
  const finished = finishAvailable(newProgress(before), deck, before);
  const extended = addExtraCards(deck, finished, before);
  assert.equal(dailyAllowance(extended, before).limit, 15);
  assert.equal(dailyAllowance(extended, tomorrow).limit, 10);
  assert.equal(dailyAllowance(extended, tomorrow).introduced.length, 0);
  const later = new Date(2026, 8, 20, 12);
  assert.equal(dailyAllowance(extended, later).limit, 10);
  const due = nextCard(deck, extended, later)!;
  assert.ok(extended.cards[due.id], 'overdue reviews still precede new cards');
});

test('card allowance includes a previously unseen reverse direction', () => {
  const initial = newProgress(now);
  const deck = createDeck(csv, initial.seed);
  const finished = finishAvailable(initial, deck);
  const reverse = deck.find((card) => card.id.split(':')[0] === finished.daily.introduced[0].split(':')[0] && !finished.cards[card.id])!;
  const nextDay = rateCard(finished, reverse, 'easy', tomorrow);
  assert.equal(nextDay.daily.introduced.length, 1);
  assert.equal(nextDay.daily.introduced[0], reverse.id);
});

test('word-based and unlimited progress migrate without changing card schedules', () => {
  const first = rateCard(newProgress(now), pair[0], 'easy', now);
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
  assert.throws(() => createDeck('word,definition\nword,other', 1), /Duplicate/);
  assert.throws(() => createDeck('word,', 1), /Incomplete/);
  assert.throws(() => parseProgress('{broken'));
  assert.throws(() => parseProgress('{"version":2}'));
  const progress = rateCard(newProgress(now), pair[0], 'easy', now);
  assert.throws(() => parseProgress(JSON.stringify({ ...progress, daily: { ...progress.daily, extra: -1 } })));
  progress.cards[pair[0].id].due = 'bad date';
  assert.throws(() => parseProgress(JSON.stringify(progress)));
});

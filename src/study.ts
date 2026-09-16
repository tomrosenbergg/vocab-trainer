import Papa from 'papaparse';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';

export type StudyCard = {
  id: string;
  word: string;
  front: string;
  back: string;
  example: string;
  direction: 'meaning' | 'word';
};
type SavedCard = Omit<Card, 'due' | 'last_review'> & { due: string; last_review?: string };
export type ReviewEvent = {
  id: string;
  cardId: string;
  reviewedAt: string;
  studyDay: string;
  answer: Answer;
  stateBefore: number;
  stateAfter: number;
  due: string;
};
export type Progress = {
  version: 1;
  newCardsPerDay?: number;
  seed: number;
  cards: Record<string, SavedCard>;
  reviews: ReviewEvent[];
  day: string;
  today: number;
  lastWord: string | null;
  daily: { unit: 'cards'; day: string; introduced: string[]; extra: number };
};
export const STORAGE_KEY = 'vocab.progress.v1';
export const DAILY_NEW_CARDS = 10;
export const EXTRA_NEW_CARDS = 5;

export const ANSWERS = ['again', 'hard', 'good', 'easy'] as const;
export type Answer = typeof ANSWERS[number];
const grades = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
function studyDayStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(4, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return start;
}
export const localDay = (now: Date) => {
  const start = studyDayStart(now);
  return `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;
};
export function nextStudyDay(now: Date): Date {
  const next = studyDayStart(now);
  next.setDate(next.getDate() + 1);
  return next;
}

export function newProgress(now = new Date()): Progress {
  return { version: 1, seed: Math.floor(Math.random() * 0xffffffff), cards: {}, reviews: [], day: localDay(now), today: 0, lastWord: null,
    daily: { unit: 'cards', day: localDay(now), introduced: [], extra: 0 } };
}

const wordKey = (card: StudyCard) => encodeURIComponent(card.word.toLowerCase());
export function dailyAllowance(progress: Progress, now: Date) {
  const daily = progress.daily.day === localDay(now) ? progress.daily : { unit: 'cards' as const, day: localDay(now), introduced: [], extra: 0 };
  return { ...daily, limit: (progress.newCardsPerDay ?? DAILY_NEW_CARDS) + daily.extra };
}

export function setNewCardsPerDay(progress: Progress, limit: number): Progress {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Enter a whole number of 0 or more.');
  return { ...progress, newCardsPerDay: limit, daily: { ...progress.daily, extra: 0 } };
}

export function isBuried(card: StudyCard, progress: Progress, now: Date): boolean {
  const siblingId = `${wordKey(card)}:${card.direction === 'meaning' ? 'word' : 'meaning'}`;
  const review = progress.cards[siblingId]?.last_review;
  return Boolean(review && localDay(new Date(review)) === localDay(now));
}

// At most one new direction per word can be introduced today.
export function newCardsAvailableToday(deck: StudyCard[], progress: Progress, now: Date): number {
  return new Set(deck.filter((card) => !progress.cards[card.id] && !isBuried(card, progress, now)).map(wordKey)).size;
}

export function nextReviewAt(deck: StudyCard[], progress: Progress, now: Date): Date | null {
  const dates = deck.filter((card) => progress.cards[card.id]).map((card) => {
    const available = studyDayStart(new Date(progress.cards[card.id].due)).getTime();
    return Math.max(available, isBuried(card, progress, now) ? nextStudyDay(now).getTime() : now.getTime());
  });
  return dates.length ? new Date(Math.min(...dates)) : null;
}

export function addExtraCards(deck: StudyCard[], progress: Progress, now: Date): Progress {
  if (nextCard(deck, progress, now) || !newCardsAvailableToday(deck, progress, now)) return progress;
  const daily = dailyAllowance(progress, now);
  return { ...progress, daily: { unit: 'cards', day: daily.day, introduced: daily.introduced,
    extra: Math.max(daily.extra, daily.introduced.length - DAILY_NEW_CARDS) + EXTRA_NEW_CARDS } };
}

function shuffle<T>(values: T[], seed: number): T[] {
  const result = [...values];
  let value = seed;
  for (let i = result.length - 1; i > 0; i--) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createDeck(csv: string, seed: number): StudyCard[] {
  const result = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error('The vocabulary file could not be read.');
  const seen = new Set<string>();
  const words = result.data.map((row, index) => {
    if (row.length !== 3 || row.some((value) => !value.trim())) throw new Error(`Incomplete vocabulary on line ${index + 1}.`);
    const [word, definition, example] = row.map((value) => value.trim());
    if (seen.has(word.toLowerCase())) throw new Error(`Duplicate word: ${word}.`);
    seen.add(word.toLowerCase());
    return { word, definition, example };
  });
  if (!words.length) throw new Error('The vocabulary file is empty.');
  const ordered = shuffle(words, seed);
  const cards: StudyCard[] = [];
  // Stable ordering; daily sibling burying controls which direction is eligible.
  for (let start = 0; start < ordered.length; start += 5) {
    const group = ordered.slice(start, start + 5);
    for (const direction of ['meaning', 'word'] as const) {
      for (const { word, definition, example } of group) {
        cards.push({ id: `${encodeURIComponent(word.toLowerCase())}:${direction}`, word,
          front: direction === 'meaning' ? word : definition,
          back: direction === 'meaning' ? definition : word, example, direction });
      }
    }
  }
  return cards;
}

function hydrate(card: SavedCard): Card {
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined };
}

export function parseProgress(raw: string, now = new Date()): Progress {
  const data = JSON.parse(raw) as Progress;
  if (!data || data.version !== 1 || !Number.isInteger(data.seed) || data.seed < 0 || data.seed > 0xffffffff ||
      !Number.isInteger(data.today) || data.today < 0 || typeof data.day !== 'string' ||
      !(data.lastWord === null || typeof data.lastWord === 'string') || !data.cards ||
      typeof data.cards !== 'object' || Array.isArray(data.cards)) {
    throw new Error('Saved progress could not be read. It has been left untouched.');
  }
  if (data.newCardsPerDay !== undefined && (!Number.isSafeInteger(data.newCardsPerDay) || data.newCardsPerDay < 0)) {
    throw new Error('Saved new-card limit could not be read.');
  }
  // Progress saved before review history existed starts with an empty event log.
  data.reviews ??= [];
  if (!Array.isArray(data.reviews) || data.reviews.some((review) => !review ||
      typeof review.id !== 'string' || !review.id || typeof review.cardId !== 'string' || !review.cardId ||
      typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt)) ||
      typeof review.studyDay !== 'string' || !review.studyDay || !ANSWERS.includes(review.answer) ||
      ![0, 1, 2, 3].includes(review.stateBefore) || ![0, 1, 2, 3].includes(review.stateAfter) ||
      typeof review.due !== 'string' || !Number.isFinite(Date.parse(review.due))) ||
      new Set(data.reviews.map((review) => review.id)).size !== data.reviews.length) {
    throw new Error('Saved review history could not be read. It has been left untouched.');
  }
  for (const card of Object.values(data.cards)) {
    if (!card || typeof card.due !== 'string' || !Number.isFinite(Date.parse(card.due)) ||
        (card.last_review !== undefined && (typeof card.last_review !== 'string' || !Number.isFinite(Date.parse(card.last_review)))) ||
        ![0, 1, 2, 3].includes(card.state) ||
        !['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_steps']
          .every((key) => typeof card[key as keyof SavedCard] === 'number' && Number.isFinite(card[key as keyof SavedCard]) && Number(card[key as keyof SavedCard]) >= 0)) {
      throw new Error('Saved progress could not be read. It has been left untouched.');
    }
  }
  if (data.daily !== undefined && (!data.daily || typeof data.daily.day !== 'string' || !Number.isInteger(data.daily.extra) || data.daily.extra < 0 ||
      !Array.isArray(data.daily.introduced) || !data.daily.introduced.every((id) => typeof id === 'string') ||
      new Set(data.daily.introduced).size !== data.daily.introduced.length)) {
    throw new Error('Saved daily allowance could not be read. It has been left untouched.');
  }
  // Upgrade both earlier versions without modifying FSRS card states. The word-based
  // version had no per-card introduction dates: count matching reviewed cards conservatively.
  const unit = (data.daily as { unit?: string } | undefined)?.unit;
  if (unit !== undefined && unit !== 'cards') throw new Error('Unknown daily allowance format.');
  if (unit === undefined) {
    const legacy = data.daily;
    const day = legacy?.day ?? localDay(now);
    const introducedWords = legacy ? new Set(legacy.introduced) : null;
    data.daily = { unit: 'cards', day, extra: (legacy?.extra ?? 0) * 2,
      introduced: Object.entries(data.cards).filter(([id, card]) =>
        card.last_review && localDay(new Date(card.last_review)) === day &&
        (!introducedWords || introducedWords.has(id.split(':')[0]))).map(([id]) => id) };
  }
  return data;
}

export function readProgress(storage: Pick<Storage, 'getItem'>, now = new Date()): Progress {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? parseProgress(raw, now) : newProgress(now);
}

// Count cards that can actually be studied today: only one direction per word,
// and a due direction takes precedence over its unseen sibling.
export function remainingCards(deck: StudyCard[], progress: Progress, now: Date): number {
  const counts = remainingCardCounts(deck, progress, now);
  return counts.newCards + counts.reviews + counts.learning;
}

export function remainingCardCounts(deck: StudyCard[], progress: Progress, now: Date): { newCards: number; reviews: number; learning: number } {
  const eligible = deck.filter((card) => !isBuried(card, progress, now));
  const end = nextStudyDay(now).getTime();
  const reviews = new Set(eligible.filter((card) => progress.cards[card.id] && progress.cards[card.id].state === 2 &&
    Date.parse(progress.cards[card.id].due) < end).map(wordKey));
  const learning = new Set(eligible.filter((card) => progress.cards[card.id] && progress.cards[card.id].state !== 2 &&
    Date.parse(progress.cards[card.id].due) < end).map(wordKey));
  const scheduledWords = new Set([...reviews, ...learning]);
  const unseen = new Set(eligible.filter((card) => !progress.cards[card.id] &&
    !scheduledWords.has(wordKey(card))).map(wordKey));
  const daily = dailyAllowance(progress, now);
  return { newCards: Math.min(unseen.size, Math.max(0, daily.limit - daily.introduced.length)), reviews: reviews.size, learning: learning.size };
}

export function nextCard(deck: StudyCard[], progress: Progress, now: Date): StudyCard | null {
  const eligible = deck.filter((card) => !isBuried(card, progress, now));
  const due = eligible.filter((card) => progress.cards[card.id] && Date.parse(progress.cards[card.id].due) < nextStudyDay(now).getTime())
    .sort((a, b) => Date.parse(progress.cards[a.id].due) - Date.parse(progress.cards[b.id].due));
  const ready = due.filter((card) => Date.parse(progress.cards[card.id].due) <= now.getTime());
  if (ready.length) return ready[0];
  const review = due.find((card) => progress.cards[card.id].state === 2);
  if (review) return review;
  const daily = dailyAllowance(progress, now);
  const unseen = daily.introduced.length < daily.limit ? eligible.filter((card) => !progress.cards[card.id]) : [];
  return unseen.find((card) => card.word !== progress.lastWord) ?? unseen[0] ?? due[0] ?? null;
}

export function rateCard(progress: Progress, card: StudyCard, answer: Answer, now: Date): Progress {
  const daily = dailyAllowance(progress, now);
  const isNewCard = !progress.cards[card.id];
  if (isBuried(card, progress, now)) throw new Error('This card’s sibling has already been reviewed today.');
  if (isNewCard && daily.introduced.length >= daily.limit) throw new Error('Today’s new-card allowance is complete.');
  const previous = progress.cards[card.id];
  const startingCard = previous ? hydrate(previous) : createEmptyCard(now);
  const result = scheduler.next(startingCard, now,
    grades[answer]).card;
  const reviewedAt = now.toISOString();
  const review: ReviewEvent = {
    id: `${card.id}:${now.getTime()}:${result.reps}`,
    cardId: card.id,
    reviewedAt,
    studyDay: localDay(now),
    answer,
    stateBefore: startingCard.state,
    stateAfter: result.state,
    due: result.due.toISOString(),
  };
  return {
    ...progress, day: localDay(now), today: (progress.day === localDay(now) ? progress.today : 0) + 1,
    lastWord: card.word,
    daily: { unit: 'cards', day: daily.day, extra: daily.extra, introduced: isNewCard ? [...daily.introduced, card.id] : daily.introduced },
    cards: { ...progress.cards, [card.id]: { ...result, due: result.due.toISOString(), last_review: result.last_review?.toISOString() } },
    reviews: [...progress.reviews, review],
  };
}

export function intervalLabel(progress: Progress, card: StudyCard, answer: Answer, now: Date): string {
  const next = rateCard(progress, card, answer, now).cards[card.id];
  const minutes = Math.max(1, Math.round((Date.parse(next.due) - now.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

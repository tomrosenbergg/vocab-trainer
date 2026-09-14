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
export type Progress = {
  version: 1;
  seed: number;
  cards: Record<string, SavedCard>;
  day: string;
  today: number;
  lastWord: string | null;
  daily: { unit: 'cards'; day: string; introduced: string[]; extra: number };
};
export const STORAGE_KEY = 'vocab.progress.v1';
export const DAILY_NEW_CARDS = 10;
export const EXTRA_NEW_CARDS = 5;

// Two-button recall: Hard includes forgotten answers (Again); Easy means recalled (Good).
// Actual FSRS Hard assumes a correct answer, so using it for forgetting would over-schedule.
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
export const localDay = (now: Date) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

export function newProgress(now = new Date()): Progress {
  return { version: 1, seed: Math.floor(Math.random() * 0xffffffff), cards: {}, day: localDay(now), today: 0, lastWord: null,
    daily: { unit: 'cards', day: localDay(now), introduced: [], extra: 0 } };
}

const wordKey = (card: StudyCard) => encodeURIComponent(card.word.toLowerCase());
export function dailyAllowance(progress: Progress, now: Date) {
  const daily = progress.daily.day === localDay(now) ? progress.daily : { unit: 'cards' as const, day: localDay(now), introduced: [], extra: 0 };
  return { ...daily, limit: DAILY_NEW_CARDS + daily.extra };
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
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const dates = deck.filter((card) => progress.cards[card.id]).map((card) =>
    Math.max(Date.parse(progress.cards[card.id].due), isBuried(card, progress, now) ? tomorrow : 0));
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

export function nextCard(deck: StudyCard[], progress: Progress, now: Date): StudyCard | null {
  const eligible = deck.filter((card) => !isBuried(card, progress, now));
  const due = eligible.filter((card) => progress.cards[card.id] && Date.parse(progress.cards[card.id].due) <= now.getTime())
    .sort((a, b) => Date.parse(progress.cards[a.id].due) - Date.parse(progress.cards[b.id].due));
  if (due.length) return due.find((card) => card.word !== progress.lastWord) ?? due[0];
  const daily = dailyAllowance(progress, now);
  const unseen = daily.introduced.length < daily.limit ? eligible.filter((card) => !progress.cards[card.id]) : [];
  return unseen.find((card) => card.word !== progress.lastWord) ?? unseen[0] ?? null;
}

export function rateCard(progress: Progress, card: StudyCard, answer: 'hard' | 'easy', now: Date): Progress {
  const daily = dailyAllowance(progress, now);
  const isNewCard = !progress.cards[card.id];
  if (isBuried(card, progress, now)) throw new Error('This card’s sibling has already been reviewed today.');
  if (isNewCard && daily.introduced.length >= daily.limit) throw new Error('Today’s new-card allowance is complete.');
  const previous = progress.cards[card.id];
  const result = scheduler.next(previous ? hydrate(previous) : createEmptyCard(now), now,
    answer === 'hard' ? Rating.Again : Rating.Good).card;
  return {
    ...progress, day: localDay(now), today: (progress.day === localDay(now) ? progress.today : 0) + 1,
    lastWord: card.word,
    daily: { unit: 'cards', day: daily.day, extra: daily.extra, introduced: isNewCard ? [...daily.introduced, card.id] : daily.introduced },
    cards: { ...progress.cards, [card.id]: { ...result, due: result.due.toISOString(), last_review: result.last_review?.toISOString() } },
  };
}

export function intervalLabel(progress: Progress, card: StudyCard, answer: 'hard' | 'easy', now: Date): string {
  const next = rateCard(progress, card, answer, now).cards[card.id];
  const minutes = Math.max(1, Math.round((Date.parse(next.due) - now.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

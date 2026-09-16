import { localDay, type Progress, type StudyCard } from './study.ts';

export type ActivitySummary = {
  totalReviews: number;
  reviewsToday: number;
  studyDays: number;
  currentStreak: number;
  days: { day: string; count: number }[];
};

export type WordSummary = {
  word: string;
  definition: string;
  state: 'new' | 'learning' | 'review';
  reviews: number;
  passRate: number | null;
  lastReviewed: string | null;
  nextReview: string | null;
};

function shiftDay(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

export function activitySummary(progress: Progress, now: Date, historyDays = 84): ActivitySummary {
  const counts = new Map<string, number>();
  for (const review of progress.reviews) counts.set(review.studyDay, (counts.get(review.studyDay) ?? 0) + 1);

  const today = localDay(now);
  const days = Array.from({ length: historyDays }, (_, index) => {
    const day = localDay(shiftDay(now, index - historyDays + 1));
    return { day, count: counts.get(day) ?? 0 };
  });

  let cursor = new Date(now);
  if (!counts.has(today)) cursor = shiftDay(cursor, -1);
  let currentStreak = 0;
  while (counts.has(localDay(cursor))) {
    currentStreak++;
    cursor = shiftDay(cursor, -1);
  }

  return {
    totalReviews: progress.reviews.length,
    reviewsToday: counts.get(today) ?? 0,
    studyDays: counts.size,
    currentStreak,
    days,
  };
}

export function wordSummaries(deck: StudyCard[], progress: Progress): WordSummary[] {
  const words = new Map<string, { word: string; definition: string; cardIds: string[] }>();
  for (const card of deck) {
    const key = card.word.toLowerCase();
    const existing = words.get(key) ?? { word: card.word, definition: '', cardIds: [] };
    existing.cardIds.push(card.id);
    if (card.direction === 'meaning') existing.definition = card.back;
    words.set(key, existing);
  }

  const events = new Map<string, Progress['reviews']>();
  for (const review of progress.reviews) {
    const list = events.get(review.cardId) ?? [];
    list.push(review);
    events.set(review.cardId, list);
  }

  return [...words.values()].map<WordSummary>(({ word, definition, cardIds }) => {
    const cards = cardIds.map((id) => progress.cards[id]).filter(Boolean);
    const reviews = cardIds.flatMap((id) => events.get(id) ?? []);
    const passes = reviews.filter((review) => review.answer === 'good' || review.answer === 'easy').length;
    const reviewedAt = reviews.map((review) => review.reviewedAt).sort();
    const due = cards.map((card) => card.due).sort();
    return {
      word,
      definition,
      state: cards.some((card) => card.state === 1 || card.state === 3) ? 'learning' : cards.some((card) => card.state === 2) ? 'review' : 'new',
      reviews: reviews.length,
      passRate: reviews.length ? passes / reviews.length : null,
      lastReviewed: reviewedAt.at(-1) ?? null,
      nextReview: due[0] ?? null,
    };
  }).sort((a, b) => a.word.localeCompare(b.word));
}

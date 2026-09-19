import { createDeck, newProgress, nextCard, nextLearningCardAt, rateCard, type Progress, type StudyCard } from './study.ts';

export const SIMULATION_PROFILES = ['consistent', 'casual', 'struggling', 'advanced', 'lapsed'] as const;
export type SimulationProfile = typeof SIMULATION_PROFILES[number];

export type SimulationOptions = {
  profile: SimulationProfile;
  days: number;
  seed: number;
  newCardsPerDay: number;
  endDate: Date;
};

export type SimulationResult = {
  progress: Progress;
  studyDays: number;
  reviews: number;
  cardsStarted: number;
};

const profileSettings: Record<SimulationProfile, { passRate: number; studyChance: number }> = {
  consistent: { passRate: 0.86, studyChance: 1 },
  casual: { passRate: 0.82, studyChance: 0.55 },
  struggling: { passRate: 0.62, studyChance: 0.9 },
  advanced: { passRate: 0.96, studyChance: 1 },
  lapsed: { passRate: 0.84, studyChance: 1 },
};

function randomGenerator(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function atNoon(date: Date): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  return result;
}

function shiftDay(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function shouldStudy(profile: SimulationProfile, dayIndex: number, totalDays: number, random: () => number): boolean {
  if (profile === 'lapsed') {
    const lapseStart = Math.floor(totalDays * 0.55);
    const lapseLength = Math.min(14, Math.max(2, Math.floor(totalDays * 0.16)));
    const lapseEnd = Math.min(totalDays - 2, lapseStart + lapseLength - 1);
    if (dayIndex >= lapseStart && dayIndex <= lapseEnd) return false;
  }
  return random() <= profileSettings[profile].studyChance;
}

function wordAbility(deck: StudyCard[], random: () => number): Map<string, number> {
  const abilities = new Map<string, number>();
  for (const card of deck) if (!abilities.has(card.word)) abilities.set(card.word, random());
  return abilities;
}

export function simulateHistory(csv: string, options: SimulationOptions): SimulationResult {
  if (!SIMULATION_PROFILES.includes(options.profile)) throw new Error(`Unknown profile: ${options.profile}.`);
  if (!Number.isSafeInteger(options.days) || options.days < 1 || options.days > 3650) throw new Error('Days must be a whole number from 1 to 3650.');
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error('Seed must be a whole number from 0 to 4294967295.');
  if (!Number.isSafeInteger(options.newCardsPerDay) || options.newCardsPerDay < 0) throw new Error('New cards per day must be a whole number of 0 or more.');
  if (!Number.isFinite(options.endDate.getTime())) throw new Error('End date is invalid.');

  const random = randomGenerator(options.seed);
  const endDate = atNoon(options.endDate);
  const startDate = shiftDay(endDate, -(options.days - 1));
  let progress = newProgress(startDate);
  progress.seed = options.seed;
  progress.newCardsPerDay = options.newCardsPerDay;
  const deck = createDeck(csv, progress.seed);
  const abilities = wordAbility(deck, random);
  let studyDays = 0;

  for (let dayIndex = 0; dayIndex < options.days; dayIndex++) {
    const now = shiftDay(startDate, dayIndex);
    if (!shouldStudy(options.profile, dayIndex, options.days, random)) continue;
    studyDays++;
    let answersToday = 0;
    let sessionTime = now;
    while (answersToday < 3000) {
      const card = nextCard(deck, progress, sessionTime);
      if (!card) {
        const waitingUntil = nextLearningCardAt(deck, progress, sessionTime);
        if (!waitingUntil) break;
        sessionTime = waitingUntil;
        continue;
      }
      const ability = abilities.get(card.word) ?? 0.5;
      const baseRate = profileSettings[options.profile].passRate;
      const passRate = Math.min(0.995, Math.max(0.05, baseRate + (ability - 0.5) * 0.34));
      progress = rateCard(progress, card, random() <= passRate ? 'good' : 'again', sessionTime);
      answersToday++;
    }
    if (answersToday === 3000) throw new Error(`Simulation did not finish the queue on day ${dayIndex + 1}.`);
  }

  return { progress, studyDays, reviews: progress.reviews.length, cardsStarted: Object.keys(progress.cards).length };
}

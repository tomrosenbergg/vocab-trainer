import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportBackup } from '../src/backup.ts';
import { SIMULATION_PROFILES, simulateHistory, type SimulationProfile } from '../src/simulation.ts';

type Arguments = {
  profile: SimulationProfile;
  days: number;
  seed: number;
  newCardsPerDay: number;
  output: string;
};

function help(): never {
  console.log(`Generate importable Bird Brain study history.

Usage:
  npm run simulate -- [options]

Options:
  --profile <name>  consistent, casual, struggling, advanced, or lapsed
  --days <number>   Number of calendar days to simulate (default: 90)
  --new <number>    New cards per study day (default: 10)
  --seed <number>   Deterministic random seed (default: 42)
  --output <path>   Backup destination (default: simulated-progress.json)
  --help            Show this help
`);
  process.exit(0);
}

function numberArgument(name: string, value: string | undefined): number {
  if (value === undefined || value === '') throw new Error(`${name} needs a value.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a whole number.`);
  return parsed;
}

function parseArguments(values: string[]): Arguments {
  const result: Arguments = { profile: 'consistent', days: 90, seed: 42, newCardsPerDay: 10, output: 'simulated-progress.json' };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === '--help') help();
    if (value === '--profile') {
      const profile = values[++index] as SimulationProfile | undefined;
      if (!profile || !SIMULATION_PROFILES.includes(profile)) throw new Error(`Profile must be one of: ${SIMULATION_PROFILES.join(', ')}.`);
      result.profile = profile;
    } else if (value === '--days') result.days = numberArgument('--days', values[++index]);
    else if (value === '--new') result.newCardsPerDay = numberArgument('--new', values[++index]);
    else if (value === '--seed') result.seed = numberArgument('--seed', values[++index]);
    else if (value === '--output') {
      const output = values[++index];
      if (!output) throw new Error('--output needs a path.');
      result.output = output;
    } else if (value !== '--help') throw new Error(`Unknown option: ${value}. Use --help for usage.`);
  }
  return result;
}

try {
  const args = parseArguments(process.argv.slice(2));
  const csv = readFileSync(new URL('../cards.csv', import.meta.url), 'utf8');
  const result = simulateHistory(csv, { ...args, endDate: new Date() });
  const output = resolve(args.output);
  writeFileSync(output, exportBackup(result.progress), 'utf8');
  console.log(`Created ${output}`);
  console.log(`${args.profile}, ${args.days} days, ${result.studyDays} study days, ${result.cardsStarted} cards started, ${result.reviews} reviews`);
  console.log('Import this file from Settings → Import progress. Export your real progress first.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

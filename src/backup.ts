import { parseProgress, type Progress } from './study.ts';

export function exportBackup(progress: Progress): string {
  return JSON.stringify({ app: 'vocab-trainer', version: 1, exportedAt: new Date().toISOString(), progress }, null, 2);
}

export function importBackup(raw: string): Progress {
  const backup = JSON.parse(raw);
  if (!backup || backup.app !== 'vocab-trainer' || backup.version !== 1 || !backup.progress) {
    throw new Error('Choose a Vocab progress backup (.json).');
  }
  return parseProgress(JSON.stringify(backup.progress));
}

export type Undo = { before: Progress; after: string; cardId: string };
export function restoreAnswer(undo: Undo, latest: Progress): Progress {
  if (JSON.stringify(latest) !== undo.after) throw new Error('Progress changed in another tab. That answer can no longer be undone.');
  return undo.before;
}

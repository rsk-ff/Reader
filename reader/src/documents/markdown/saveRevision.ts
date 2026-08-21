/** A save may only clear dirty state when no edit happened after it started. */
export function saveCoversCurrentRevision(savedRevision: number, currentRevision: number): boolean {
  return savedRevision === currentRevision;
}

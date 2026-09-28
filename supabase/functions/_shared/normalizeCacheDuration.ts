/** Reject malformed or implausible song durations; use the same default for
 * streaming and batch cache writes. Long recordings up to six hours remain valid. */
export function normalizeCacheDuration(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 30 && value <= 21600 ? value : 240;
}

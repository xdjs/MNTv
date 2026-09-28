/** Preserve the selected recording's catalog metadata when returning via Prev. */
export function listenHistoryRoute(pathname: string, search: string, artwork?: string): string {
  const params = new URLSearchParams(search);
  if (artwork && !params.has("art")) params.set("art", artwork);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

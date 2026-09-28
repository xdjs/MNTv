type LinkClient = { from(table: 'companion_links'): {
  select(columns: string): { eq(column: string, value: string): { eq(column: string, value: string): {
    maybeSingle(): PromiseLike<{ data: { short_id: string } | null; error: unknown }>;
  } } };
  insert(row: { short_id: string; artist: string; title: string; album: string | null }): PromiseLike<{ error: unknown }>;
} };
/** Resolve a usable QR link, including another caller winning the insert race.
 * Errors propagate so a snapshot is never accepted without its entry point. */
export async function resolveCompanionShortId(client: LinkClient, artist: string, title: string, album?: string): Promise<string> {
  const lookup = () => client.from('companion_links').select('short_id').eq('artist', artist).eq('title', title).maybeSingle();
  const existing = await lookup();
  if (existing.error) throw existing.error;
  if (existing.data?.short_id) return existing.data.short_id;
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const id = Array.from(bytes, value => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[value % 62]).join('');
  const { error } = await client.from('companion_links').insert({ short_id: id, artist, title, album: album || null });
  if (!error) return id;
  const winner = await lookup();
  if (winner.error) throw winner.error;
  if (winner.data?.short_id) return winner.data.short_id;
  throw error;
}

import { expect, it, vi } from 'vitest';
import { resolveCompanionShortId } from '../lib/resolveCompanionShortId';
function client(reads: { data: { short_id: string } | null; error: unknown }[], insertError: unknown = null) {
  const read = vi.fn(); reads.forEach(value => read.mockResolvedValueOnce(value));
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  return { db: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: read }) }) }), insert }) }, insert };
}
it('reuses an existing short link', async () => {
  const { db, insert } = client([{ data: { short_id: 'existing' }, error: null }]);
  expect(await resolveCompanionShortId(db, 'Artist', 'Track')).toBe('existing'); expect(insert).not.toHaveBeenCalled();
});
it('propagates lookup failures without trying to insert', async () => {
  const { db, insert } = client([{ data: null, error: new Error('read failed') }]);
  await expect(resolveCompanionShortId(db, 'Artist', 'Track')).rejects.toThrow('read failed'); expect(insert).not.toHaveBeenCalled();
});
it('recovers the winning short link after a concurrent insert', async () => {
  const { db } = client([{ data: null, error: null }, { data: { short_id: 'winner' }, error: null }], new Error('duplicate'));
  expect(await resolveCompanionShortId(db, 'Artist', 'Track')).toBe('winner');
});
it('propagates an unrecovered insert failure for retry', async () => {
  const { db } = client([{ data: null, error: null }, { data: null, error: null }], new Error('insert failed'));
  await expect(resolveCompanionShortId(db, 'Artist', 'Track')).rejects.toThrow('insert failed');
});
it('returns a successfully created link', async () => {
  const { db, insert } = client([{ data: null, error: null }]);
  const id = await resolveCompanionShortId(db, 'Artist', 'Track');
  expect(id).toHaveLength(6); expect(insert).toHaveBeenCalledWith({ short_id: id, artist: 'Artist', title: 'Track', album: null });
});

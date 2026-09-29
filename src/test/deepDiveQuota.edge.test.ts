import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), rpc: vi.fn(), getUser: vi.fn(), generate: vi.fn() }));
vi.mock('https://deno.land/std@0.168.0/http/server.ts', () => ({ serve: (h: typeof mocks.handler) => { mocks.handler = h; } }));
vi.mock('https://esm.sh/@supabase/supabase-js@2.49.1', () => ({ createClient: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }) }));
vi.mock('../../supabase/functions/_shared/generateVerifiedDeepDive.ts', () => ({ generateVerifiedDeepDive: mocks.generate }));
beforeEach(async () => {
  vi.resetModules(); mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
  mocks.generate.mockReset().mockResolvedValue({ text: 'Verified expansion' });
  vi.stubGlobal('Deno', { env: { get: () => 'test' } });
  const handlerPath = '../../supabase/functions/generate-nuggets/index.ts';
  await import(handlerPath);
});
const request = (token?: string) => new Request('https://test', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ artist: 'Artist', title: 'Song', deepDive: true, sourceUrl: 'https://example.com/article' }) });
it('blocks unsigned requests before paid providers or quota consumption', async () => {
  expect((await mocks.handler!(request())).status).toBe(401);
  expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects public keys and invalid sessions before provider calls', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
  expect((await mocks.handler!(request('public-key'))).status).toBe(401);
  expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([{ data: false, error: null, status: 429 }, { data: null, error: new Error('database down'), status: 503 }])('fails closed on quota denial or database failure', async ({ data, error, status }) => {
  mocks.rpc.mockResolvedValue({ data, error });
  const response = await mocks.handler!(request('session'));
  expect(response.status).toBe(status); expect(response.headers.get('Retry-After')).toBe('60'); expect(mocks.generate).not.toHaveBeenCalled();
});
it('charges the durable shared budget for an authenticated anonymous or OAuth user before generation', async () => {
  expect((await mocks.handler!(request('session'))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('consume_companion_verification_quota', { caller_id: 'verified-user' });
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
});

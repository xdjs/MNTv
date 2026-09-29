type VerificationClient = {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: 'consume_companion_verification_quota', args: { caller_id: string }): PromiseLike<{ data: unknown; error: unknown }>;
};
/** Validate the caller and consume the shared durable user/project budget before
 * either companion verification or a deep dive can call paid providers. */
export async function authorizePaidVerification(req: Request, client: VerificationClient | null, cors: Record<string, string>): Promise<Response | null> {
  const deny = (status: number, error: string) => new Response(JSON.stringify({ error }), {
    status, headers: { ...cors, 'Content-Type': 'application/json', ...(status === 429 || status === 503 ? { 'Retry-After': '60' } : {}) },
  });
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return deny(401, 'A session is required for verification.');
  if (!client) return deny(503, 'Verification is temporarily unavailable.');
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return deny(401, 'Invalid session.');
    const quota = await client.rpc('consume_companion_verification_quota', { caller_id: data.user.id });
    if (quota.error) return deny(503, 'Verification is temporarily unavailable.');
    if (quota.data !== true) return deny(429, 'Verification limit reached. Try again later.');
    return null;
  } catch {
    return deny(503, 'Verification is temporarily unavailable.');
  }
}

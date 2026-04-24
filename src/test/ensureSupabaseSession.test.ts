import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, signInAnonMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  signInAnonMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      signInAnonymously: signInAnonMock,
    },
  },
}));

import { ensureSupabaseSession } from "@/lib/ensureSupabaseSession";

describe("ensureSupabaseSession", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    signInAnonMock.mockReset();
  });

  it("returns the existing session when one is already present (no signInAnonymously call)", async () => {
    const existing = { user: { id: "existing-user" } };
    getSessionMock.mockResolvedValue({ data: { session: existing }, error: null });

    const session = await ensureSupabaseSession();
    expect(session).toBe(existing);
    expect(signInAnonMock).not.toHaveBeenCalled();
  });

  it("signs in anonymously when no session exists, returns the new session", async () => {
    const created = { user: { id: "anon-user", is_anonymous: true } };
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonMock.mockResolvedValue({ data: { session: created, user: created.user }, error: null });

    const session = await ensureSupabaseSession();
    expect(session).toBe(created);
    expect(signInAnonMock).toHaveBeenCalledOnce();
  });

  it("throws when signInAnonymously returns an error (e.g. anon disabled in dashboard)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonMock.mockResolvedValue({
      data: { session: null },
      error: { message: "anon disabled" },
    });
    await expect(ensureSupabaseSession()).rejects.toMatchObject({ message: "anon disabled" });
  });

  it("throws when signInAnonymously resolves with no session (defensive)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonMock.mockResolvedValue({ data: { session: null, user: null }, error: null });
    await expect(ensureSupabaseSession()).rejects.toThrow(/no session/i);
  });

  it("propagates getSession errors", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: "network" },
    });
    await expect(ensureSupabaseSession()).rejects.toMatchObject({ message: "network" });
    expect(signInAnonMock).not.toHaveBeenCalled();
  });
});

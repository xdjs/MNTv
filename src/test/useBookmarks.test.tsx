import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ── Boundary mocks ────────────────────────────────────────────────────
// The hook talks to exactly three things: the Supabase edge function,
// the Spotify token hook, and the Apple token hook. Mock all three so
// the test exercises the hook's own logic (optimistic update, natural-key
// lookup, rollback) rather than the network.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

const getValidTokenMock = vi.fn(async () => "spotify-access-token");
let hasSpotifyToken = true;
vi.mock("@/hooks/useSpotifyToken", () => ({
  useSpotifyToken: () => ({
    hasSpotifyToken,
    getValidToken: getValidTokenMock,
  }),
}));

let hasAppleToken = false;
vi.mock("@/hooks/useAppleMusicToken", () => ({
  useAppleMusicToken: () => ({ hasMusicToken: hasAppleToken }),
}));

const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import { useBookmarks } from "@/hooks/useBookmarks";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const NUGGET = {
  trackId: "real::Cherele::KIKI",
  artist: "Cherele",
  title: "KIKI",
  kind: "artist",
  headline: "Cherele recorded KIKI in late 2024.",
  body: "Full body text.",
};

beforeEach(() => {
  invokeMock.mockReset();
  getValidTokenMock.mockClear();
  toastErrorMock.mockReset();
  hasSpotifyToken = true;
  hasAppleToken = false;
  // Default: empty bookmark list, successful add.
  invokeMock.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
    if (opts.body.action === "list") return { data: { bookmarks: [] }, error: null };
    return { data: { ok: true, bookmark: { id: "uuid-1" } }, error: null };
  });
});

describe("useBookmarks — save flow", () => {
  it("reports signedIn when a Spotify token is present", async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    expect(result.current.signedIn).toBe(true);
  });

  it("sends an add request when toggling an unsaved nugget", async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggle(NUGGET);
    });

    await waitFor(() => {
      const addCall = invokeMock.mock.calls.find(
        (c) => (c[1] as { body: { action: string } }).body.action === "add",
      );
      expect(addCall).toBeTruthy();
    });
  });

  // THE KEY ASSERTION for Pete's "tap does nothing visible" report.
  // onMutate must flip isBookmarked so the heart fills before the server
  // responds. The add is held open on a deferred promise — otherwise the
  // add+refetch cycle completes between waitFor polls and the optimistic
  // window is invisible to the assertion (a false failure, not a bug).
  it("optimistically marks the nugget as bookmarked on tap", async () => {
    let releaseAdd: (v: unknown) => void = () => {};
    const addGate = new Promise((res) => { releaseAdd = res; });
    invokeMock.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
      if (opts.body.action === "list") return { data: { bookmarks: [] }, error: null };
      await addGate;
      return { data: { ok: true, bookmark: { id: "uuid-1" } }, error: null };
    });

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isBookmarked(NUGGET.headline, NUGGET.trackId, NUGGET.kind)).toBe(false);

    act(() => {
      result.current.toggle(NUGGET);
    });

    // While the add is still in flight, the heart must already be filled.
    await waitFor(() => {
      expect(
        result.current.isBookmarked(NUGGET.headline, NUGGET.trackId, NUGGET.kind),
      ).toBe(true);
    });

    await act(async () => { releaseAdd(null); });
  });

  // After a successful add, the server refetch must return a row that the
  // natural-key lookup still matches. If the edge function normalizes any
  // of (headline, track_id, nugget_kind), the heart silently empties again.
  it("stays marked after the post-add refetch reconciles with the server", async () => {
    const serverRow = {
      id: "uuid-1",
      service: "spotify",
      track_id: NUGGET.trackId,
      artist: NUGGET.artist,
      title: NUGGET.title,
      album: null,
      nugget_kind: NUGGET.kind,
      headline: NUGGET.headline,
      body: NUGGET.body,
      source: null,
      image_url: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    let added = false;
    invokeMock.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
      if (opts.body.action === "list") {
        return { data: { bookmarks: added ? [serverRow] : [] }, error: null };
      }
      added = true;
      return { data: { ok: true, bookmark: { id: "uuid-1" } }, error: null };
    });

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggle(NUGGET);
    });

    await waitFor(() => expect(result.current.adding).toBe(false));
    await waitFor(() => {
      expect(
        result.current.isBookmarked(NUGGET.headline, NUGGET.trackId, NUGGET.kind),
      ).toBe(true);
    });
  });

  // Rollback has to be isolated from the post-settle refetch, or the test
  // passes on either mechanism. The first list call resolves normally;
  // the refetch triggered by onSettled is left permanently pending, so
  // the ONLY thing that can clear the optimistic row is onError's
  // rollback. Without it, isBookmarked stays true and this fails.
  it("rolls back the optimistic row when the edge function rejects", async () => {
    let listCalls = 0;
    let releaseAdd: (v: unknown) => void = () => {};
    const addGate = new Promise((res) => { releaseAdd = res; });
    invokeMock.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
      if (opts.body.action === "list") {
        listCalls += 1;
        if (listCalls === 1) return { data: { bookmarks: [] }, error: null };
        return new Promise(() => {}); // refetch never settles
      }
      await addGate;
      return { data: null, error: { message: "track_id, artist, title, headline required" } };
    });

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggle(NUGGET);
    });

    // Optimistic row is present while the add is in flight.
    await waitFor(() => {
      expect(result.current.isBookmarked(NUGGET.headline, NUGGET.trackId, NUGGET.kind)).toBe(true);
    });

    await act(async () => { releaseAdd(null); });

    await waitFor(() => {
      expect(result.current.isBookmarked(NUGGET.headline, NUGGET.trackId, NUGGET.kind)).toBe(false);
    });
  });

  it("surfaces a toast when the edge function rejects", async () => {
    invokeMock.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
      if (opts.body.action === "list") return { data: { bookmarks: [] }, error: null };
      return { data: null, error: { message: "track_id, artist, title, headline required" } };
    });

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggle(NUGGET);
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  // Regression guard for the documented double-tap race: the short-circuit
  // must not permanently wedge the button. After a mutation settles, a
  // subsequent tap has to work.
  it("accepts a second toggle after the first one settles", async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggle(NUGGET);
    });
    await waitFor(() => expect(result.current.adding).toBe(false));

    const callsAfterFirst = invokeMock.mock.calls.length;
    act(() => {
      result.current.toggle({ ...NUGGET, headline: "A different fact." });
    });

    await waitFor(() => {
      expect(invokeMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });
});

describe("useBookmarks — signed-out", () => {
  it("does not render as signed in when neither service has a token", () => {
    hasSpotifyToken = false;
    hasAppleToken = false;
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    expect(result.current.signedIn).toBe(false);
  });

  it("errors rather than silently no-oping when toggling while signed out", async () => {
    hasSpotifyToken = false;
    hasAppleToken = false;
    const { result } = renderHook(() => useBookmarks(), { wrapper });

    act(() => {
      result.current.toggle(NUGGET);
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });
});

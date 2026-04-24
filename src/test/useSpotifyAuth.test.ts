import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi
        .fn()
        .mockResolvedValue({
          data: { url: "https://accounts.spotify.com/authorize?..." },
          error: null,
        }),
    },
    functions: { invoke: vi.fn() },
  },
}));

import { signInWithSpotify } from "@/hooks/useSpotifyAuth";
import { supabase } from "@/integrations/supabase/client";

describe("signInWithSpotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom's default origin is about:blank — give it a real one so
    // `${window.location.origin}/connect` produces the expected URL.
    Object.defineProperty(window, "location", {
      value: { origin: "http://127.0.0.1:8080" },
      writable: true,
    });
  });

  it("calls supabase.auth.signInWithOAuth with Spotify + scopes + redirectTo + show_dialog", async () => {
    await signInWithSpotify();
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "spotify",
      options: {
        scopes:
          "user-top-read user-read-recently-played user-read-private streaming user-read-playback-state user-modify-playback-state",
        redirectTo: "http://127.0.0.1:8080/connect",
        // Regression guard: show_dialog must be forwarded so Spotify
        // re-prompts on every sign-in and scope upgrades take effect.
        // The original PR #75 migration dropped this and would have
        // stranded returning users on their pre-migration narrower
        // grant — Claude's review caught it.
        queryParams: { show_dialog: "true" },
      },
    });
  });

  it("throws when supabase.auth.signInWithOAuth returns an error", async () => {
    (supabase.auth.signInWithOAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: "provider unavailable" },
    });
    await expect(signInWithSpotify()).rejects.toMatchObject({ message: "provider unavailable" });
  });
});

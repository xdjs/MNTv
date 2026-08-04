import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
// Imported rather than hardcoded: a literal here would keep dispatching
// an event the banner no longer listens for if the name is ever renamed,
// and the test would pass against a component that never opens.
import { RECONNECT_REQUIRED_EVENT } from "@/lib/spotifyTokenStore";

vi.mock("@/hooks/useSpotifyAuth", () => ({
  signInWithSpotify: vi.fn().mockResolvedValue(undefined),
}));

import SpotifyReconnectBanner from "@/components/SpotifyReconnectBanner";
import { signInWithSpotify } from "@/hooks/useSpotifyAuth";

describe("SpotifyReconnectBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing by default", () => {
    render(<SpotifyReconnectBanner />);
    expect(screen.queryByText(/session expired/i)).toBeNull();
  });

  it("shows on the spotify-reconnect-required event", () => {
    render(<SpotifyReconnectBanner />);
    act(() => {
      window.dispatchEvent(new Event(RECONNECT_REQUIRED_EVENT));
    });
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("invokes signInWithSpotify when Reconnect is clicked", () => {
    render(<SpotifyReconnectBanner />);
    act(() => {
      window.dispatchEvent(new Event(RECONNECT_REQUIRED_EVENT));
    });
    fireEvent.click(screen.getByRole("button", { name: /reconnect/i }));
    expect(signInWithSpotify).toHaveBeenCalledOnce();
  });

  it("hides on Dismiss click", () => {
    render(<SpotifyReconnectBanner />);
    act(() => {
      window.dispatchEvent(new Event(RECONNECT_REQUIRED_EVENT));
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/session expired/i)).toBeNull();
  });
});

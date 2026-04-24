import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";

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
      window.dispatchEvent(new Event("spotify-reconnect-required"));
    });
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("invokes signInWithSpotify when Reconnect is clicked", () => {
    render(<SpotifyReconnectBanner />);
    act(() => {
      window.dispatchEvent(new Event("spotify-reconnect-required"));
    });
    fireEvent.click(screen.getByRole("button", { name: /reconnect/i }));
    expect(signInWithSpotify).toHaveBeenCalledOnce();
  });

  it("hides on Dismiss click", () => {
    render(<SpotifyReconnectBanner />);
    act(() => {
      window.dispatchEvent(new Event("spotify-reconnect-required"));
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/session expired/i)).toBeNull();
  });
});

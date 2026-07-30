import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import {
  RecommendedArtistButton,
  RecommendedTrackButton,
} from "@/components/immersive/RecommendedButtons";

beforeEach(() => {
  navigateMock.mockReset();
});

describe("RecommendedArtistButton", () => {
  it("renders the artist name and an Open label", () => {
    render(
      <MemoryRouter>
        <RecommendedArtistButton recommendedArtist={{ name: "Kari Faux" }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /open kari faux/i })).toBeTruthy();
  });

  it("navigates to the spotify-prefixed artist route when an ID is provided", () => {
    render(
      <MemoryRouter>
        <RecommendedArtistButton
          recommendedArtist={{ name: "Kari Faux", spotifyArtistId: "ABC123" }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open kari faux/i }));
    expect(navigateMock).toHaveBeenCalledWith("/artist/spotify::ABC123::Kari%20Faux");
  });

  it("falls back to the real:: name route when no Spotify ID is provided", () => {
    render(
      <MemoryRouter>
        <RecommendedArtistButton recommendedArtist={{ name: "Kari Faux" }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open kari faux/i }));
    expect(navigateMock).toHaveBeenCalledWith("/artist/real::Kari%20Faux");
  });

  it("URL-encodes special characters in the artist name", () => {
    render(
      <MemoryRouter>
        <RecommendedArtistButton recommendedArtist={{ name: "Tyler, the Creator" }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open tyler/i }));
    expect(navigateMock).toHaveBeenCalledWith("/artist/real::Tyler%2C%20the%20Creator");
  });

  it("stops propagation so a click on the button doesn't bubble to a parent handler", () => {
    const parentClick = vi.fn();
    render(
      <MemoryRouter>
        <div onClick={parentClick}>
          <RecommendedArtistButton recommendedArtist={{ name: "Kari Faux" }} />
        </div>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open kari faux/i }));
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe("RecommendedTrackButton", () => {
  it("renders the track title in the label", () => {
    render(
      <MemoryRouter>
        <RecommendedTrackButton
          recommendedTrack={{ artist: "Kari Faux", title: "Bobby" }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /listen to bobby by kari faux/i })).toBeTruthy();
  });

  it("navigates to /listen with the spotify URI in the route when present", () => {
    render(
      <MemoryRouter>
        <RecommendedTrackButton
          recommendedTrack={{
            artist: "Kari Faux",
            title: "Bobby",
            spotifyTrackUri: "spotify:track:ABC",
          }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /listen to bobby/i }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/listen/real::Kari%20Faux::Bobby::::spotify%3Atrack%3AABC",
    );
  });

  it("omits the URI segment when no spotifyTrackUri is provided", () => {
    render(
      <MemoryRouter>
        <RecommendedTrackButton
          recommendedTrack={{ artist: "Kari Faux", title: "Bobby" }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /listen to bobby/i }));
    expect(navigateMock).toHaveBeenCalledWith("/listen/real::Kari%20Faux::Bobby::::");
  });
});

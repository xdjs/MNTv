import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const { useAuthMock, useUserProfileMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useUserProfileMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>("@/contexts/AuthContext");
  return { ...actual, useAuth: () => useAuthMock() };
});
vi.mock("@/hooks/useMusicNerdState", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMusicNerdState")>("@/hooks/useMusicNerdState");
  return { ...actual, useUserProfile: () => useUserProfileMock() };
});
// Avoid pulling the full Onboarding tree (images, logo animations) into
// the test — stub it with a marker so assertions stay simple.
vi.mock("@/pages/Onboarding", () => ({
  default: () => <div data-testid="onboarding">Onboarding</div>,
}));

import { ProtectedRoute, RootRoute } from "@/routes";

function Browse() { return <div data-testid="browse">Browse</div>; }
function ConnectStub() { return <div data-testid="connect">Connect</div>; }

function RenderHarness({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/connect" element={<ConnectStub />} />
        <Route path="/browse" element={<ProtectedRoute><Browse /></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("route gates (src/routes.tsx)", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    useUserProfileMock.mockReset();
    useUserProfileMock.mockReturnValue({ profile: null });
  });

  it("renders a fallback while auth is hydrating", () => {
    useAuthMock.mockReturnValue({ session: null, loading: true });
    const { container } = render(<RenderHarness initialPath="/browse" />);
    // LazyFallback is a plain empty div — the key invariant is "no
    // Onboarding / Connect / Browse marker showed up."
    expect(container.querySelector('[data-testid]')).toBeNull();
  });

  it("RootRoute: signed-out user sees Onboarding", () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    render(<RenderHarness initialPath="/" />);
    expect(screen.getByTestId("onboarding")).toBeInTheDocument();
  });

  it("RootRoute: session + profile redirects to Browse", () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    useUserProfileMock.mockReturnValue({ profile: { streamingService: "Spotify", calculatedTier: "curious" } });
    render(<RenderHarness initialPath="/" />);
    expect(screen.getByTestId("browse")).toBeInTheDocument();
  });

  it("RootRoute: session without profile redirects to Connect (tier-less user)", () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    useUserProfileMock.mockReturnValue({ profile: null });
    render(<RenderHarness initialPath="/" />);
    expect(screen.getByTestId("connect")).toBeInTheDocument();
  });

  it("ProtectedRoute: no session bounces to Connect", () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    render(<RenderHarness initialPath="/browse" />);
    expect(screen.getByTestId("connect")).toBeInTheDocument();
  });

  it("ProtectedRoute: session without profile redirects to Connect (mid-onboarding)", () => {
    // Session alone isn't enough to pass: Browse and Listen dereference
    // profile fields (`calculatedTier`, taste data) and would crash on
    // a direct-navigation bookmark from a mid-onboarding user. The
    // gate now requires BOTH session and profile. RootRoute has the
    // same triage but only fires on `/`; this closes the deep-link gap.
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    useUserProfileMock.mockReturnValue({ profile: null });
    render(<RenderHarness initialPath="/browse" />);
    expect(screen.getByTestId("connect")).toBeInTheDocument();
  });

  it("ProtectedRoute: session + profile renders Browse", () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    useUserProfileMock.mockReturnValue({ profile: { streamingService: "Spotify", calculatedTier: "curious" } });
    render(<RenderHarness initialPath="/browse" />);
    expect(screen.getByTestId("browse")).toBeInTheDocument();
  });
});

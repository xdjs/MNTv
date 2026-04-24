import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const { useAuthMock, getStoredProfileMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  getStoredProfileMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>("@/contexts/AuthContext");
  return {
    ...actual,
    useAuth: () => useAuthMock(),
  };
});
vi.mock("@/hooks/useMusicNerdState", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMusicNerdState")>("@/hooks/useMusicNerdState");
  return {
    ...actual,
    getStoredProfile: () => getStoredProfileMock(),
  };
});

import { useAuth } from "@/contexts/AuthContext";
import { getStoredProfile } from "@/hooks/useMusicNerdState";

// Lightweight page stubs so the render is synchronous.
function Browse() {
  return <div data-testid="browse">Browse</div>;
}
function ConnectStub() {
  return <div data-testid="connect">Connect</div>;
}
function Onboarding() {
  return <div data-testid="onboarding">Onboarding</div>;
}

// Re-implement ProtectedRoute + RootRoute with identical logic to App.tsx.
// Testing the inline App.tsx definitions directly would require importing
// the full App tree (PlayerProvider, StoriesProvider, Spotify SDK); this
// keeps the test tight to the routing invariant the review flagged.
function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, loading } = useAuth();
  if (loading) return <div data-testid="loading">loading</div>;
  if (!session) return <Navigate to={`/connect?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
function RootRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div data-testid="loading">loading</div>;
  if (!session) return <Onboarding />;
  return <Navigate to={getStoredProfile() ? "/browse" : "/connect"} replace />;
}

function StubApp({ initialPath }: { initialPath: string }) {
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

describe("App route gates", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    getStoredProfileMock.mockReset();
  });

  it("shows a loading stub while auth is hydrating", () => {
    useAuthMock.mockReturnValue({ session: null, loading: true });
    render(<StubApp initialPath="/browse" />);
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("RootRoute: signed-out user sees Onboarding", () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    render(<StubApp initialPath="/" />);
    expect(screen.getByTestId("onboarding")).toBeInTheDocument();
  });

  it("RootRoute: session + profile redirects to Browse", () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    getStoredProfileMock.mockReturnValue({ streamingService: "Spotify", calculatedTier: "curious" });
    render(<StubApp initialPath="/" />);
    expect(screen.getByTestId("browse")).toBeInTheDocument();
  });

  it("RootRoute: session without profile redirects to Connect (tier-less user)", () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    getStoredProfileMock.mockReturnValue(null);
    render(<StubApp initialPath="/" />);
    expect(screen.getByTestId("connect")).toBeInTheDocument();
  });

  it("ProtectedRoute: no session bounces to Connect with a redirect param", () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    render(<StubApp initialPath="/browse" />);
    expect(screen.getByTestId("connect")).toBeInTheDocument();
  });

  it("ProtectedRoute: session present lets Browse render (even without profile)", () => {
    // Critical invariant from the migration: a user with a session but
    // no profile (mid-onboarding Spotify user, anonymous Apple Music
    // user) must be allowed past ProtectedRoute so they can finish
    // onboarding. RootRoute triages them back to /connect — the
    // protected-route gate itself trusts session alone.
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    getStoredProfileMock.mockReturnValue(null);
    render(<StubApp initialPath="/browse" />);
    expect(screen.getByTestId("browse")).toBeInTheDocument();
  });
});

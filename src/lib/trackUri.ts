// Utilities for working with service-prefixed track URIs.
// Spotify: "spotify:track:7KXjTSCq5nL1LoYtL7XAwS"
// Apple Music: "apple:song:1440833060"

import type { ServiceType } from "./engines/types";

/** Determine the streaming service from a track URI. */
export function getServiceFromUri(uri: string): ServiceType {
  if (uri.startsWith("spotify:")) return "spotify";
  if (uri.startsWith("apple:")) return "apple-music";
  return "none";
}

/** Extract the service-specific ID from a track URI. */
export function getIdFromUri(uri: string): string {
  // spotify:track:7KXjTSCq5nL1LoYtL7XAwS → 7KXjTSCq5nL1LoYtL7XAwS
  // apple:song:1440833060 → 1440833060
  const parts = uri.split(":");
  return parts[parts.length - 1] || "";
}

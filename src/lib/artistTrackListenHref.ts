/** Keep catalog identity and display credits separate in a listening route. */
export function artistTrackListenHref(track: {
  artist: string; title: string; album: string; uri: string; artistId?: string; collaborators?: string[];
}, profile: { id: string; name: string }): string {
  const params = new URLSearchParams();
  const id = track.artistId || (track.artist === profile.name ? profile.id : "");
  if (id) params.set("artistId", id);
  for (const collaborator of track.collaborators ?? []) params.append("collaborator", collaborator);
  const path = `/listen/real::${encodeURIComponent(track.artist)}::${encodeURIComponent(track.title)}::${encodeURIComponent(track.album)}::${encodeURIComponent(track.uri)}`;
  return params.toString() ? `${path}?${params}` : path;
}

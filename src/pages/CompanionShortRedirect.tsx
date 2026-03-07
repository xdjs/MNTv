import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MusicNerdLogo from "@/components/MusicNerdLogo";

export default function CompanionShortRedirect() {
  const { shortId } = useParams<{ shortId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shortId) return;

    (async () => {
      try {
        const { data, error: dbError } = await supabase
          .from("companion_links")
          .select("artist, title, album")
          .eq("short_id", shortId)
          .maybeSingle();

        if (dbError) {
          console.error("[CompanionShort] DB error:", dbError);
          setError("Could not load link.");
          return;
        }
        if (!data) {
          console.error("[CompanionShort] No row for short_id:", shortId);
          setError("Link not found or expired.");
          return;
        }

        // Build the real:: trackId and go to companion, preserving query params
        // (tier, listen count) so the companion page shows the correct nuggets
        const trackId = `real::${encodeURIComponent(data.artist)}::${encodeURIComponent(data.title)}::${encodeURIComponent(data.album || "")}`;
        navigate(`/companion/${trackId}${window.location.search}`, { replace: true });
      } catch (err) {
        console.error("[CompanionShort] Unexpected error:", err);
        setError("Something went wrong.");
      }
    })();
  }, [shortId, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <MusicNerdLogo size={48} />
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
      <MusicNerdLogo size={48} glow />
      <p className="text-sm text-muted-foreground animate-pulse">Loading companion...</p>
    </div>
  );
}

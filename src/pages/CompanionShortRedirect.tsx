import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MusicNerdLogo from "@/components/MusicNerdLogo";

export default function CompanionShortRedirect() {
  const { shortId } = useParams<{ shortId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shortId) return;

    (async () => {
      const { data, error: dbError } = await supabase
        .from("companion_links")
        .select("artist, title, album")
        .eq("short_id", shortId)
        .maybeSingle();

      if (dbError || !data) {
        setError(true);
        return;
      }

      const trackId = `real::${encodeURIComponent(data.artist)}::${encodeURIComponent(data.title)}::${encodeURIComponent(data.album || "")}`;
      navigate(`/companion/${trackId}`, { replace: true });
    })();
  }, [shortId, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <MusicNerdLogo size={48} />
        <p className="text-muted-foreground text-sm">Link not found or expired.</p>
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

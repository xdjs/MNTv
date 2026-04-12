import { useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";

/** Shared "coming soon" placeholder shown on pages that don't yet support
 *  Apple Music (artist detail, album detail). Phase 5 wires the underlying
 *  edge functions; until then, these routes render this stub. */
export default function AppleMusicComingSoon({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl mb-6">{emoji}</p>
        <h1 className="text-2xl font-black text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-sm mb-8">{description}</p>
        <button
          onClick={() => navigate("/browse")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Back to Browse
        </button>
      </div>
    </PageTransition>
  );
}

import { motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";

interface Props {
  active: boolean;
  onToggle: () => void;
}

export default function MusicNerdPill({ active, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="relative flex items-center gap-2 rounded-full px-4 py-2 transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background tv-focus-visible"
      style={{
        background: active
          ? "linear-gradient(135deg, hsl(330 90% 60% / 0.25), hsl(330 90% 60% / 0.1))"
          : "hsl(0 0% 100% / 0.06)",
        border: `1px solid ${active ? "hsl(330 90% 60% / 0.4)" : "hsl(0 0% 100% / 0.1)"}`,
        boxShadow: active
          ? "0 0 20px hsl(330 90% 60% / 0.2), 0 0 60px hsl(330 90% 60% / 0.08)"
          : "none",
      }}
    >
      <motion.div
        animate={{ scale: active ? [1, 1.15, 1] : 1 }}
        transition={{ duration: 0.4 }}
      >
        <MusicNerdLogo size={18} glow={active} />
      </motion.div>
      <span
        className="text-xs font-bold uppercase tracking-wider"
        style={{
          fontFamily: "'Nunito Sans', sans-serif",
          color: active ? "hsl(330 90% 60%)" : "hsl(0 0% 100% / 0.4)",
        }}
      >
        Nerd
      </span>
      {/* Dot indicator */}
      <motion.div
        className="h-1.5 w-1.5 rounded-full"
        animate={{
          backgroundColor: active ? "hsl(330, 90%, 60%)" : "hsl(0, 0%, 40%)",
          scale: active ? [1, 1.4, 1] : 1,
        }}
        transition={{ duration: 0.3 }}
      />
    </button>
  );
}

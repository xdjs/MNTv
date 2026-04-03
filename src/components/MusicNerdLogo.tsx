import musicNerdLogo from "@/assets/musicnerd-logo.ico";

interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
  glowColor?: string;
}

export default function MusicNerdLogo({ size = 64, className = "", glow = false, glowColor }: LogoProps) {
  return (
    <img
      src={musicNerdLogo}
      alt="MusicNerd TV"
      width={size}
      height={size}
      className={`inline-block rounded-full ${glow && !glowColor ? "neon-glow" : ""} ${className}`}
      style={{
        imageRendering: "auto",
        background: "transparent",
        ...(glowColor ? { filter: `drop-shadow(0 0 8px ${glowColor}) drop-shadow(0 0 20px ${glowColor}40)` } : {}),
      }}
    />
  );
}

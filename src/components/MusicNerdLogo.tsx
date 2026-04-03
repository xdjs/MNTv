import musicNerdLogo from "@/assets/musicnerd-logo.png";

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
      className={`inline-block rounded-full ${glow ? "neon-glow" : ""} ${className}`}
      style={{ imageRendering: "auto" }}
    />
  );
}

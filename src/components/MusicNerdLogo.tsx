import musicNerdLogo from "@/assets/musicnerd-logo.ico";

interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export default function MusicNerdLogo({ size = 64, className = "", glow = false }: LogoProps) {
  return (
    <img
      src={musicNerdLogo}
      alt="MusicNerd TV"
      width={size}
      height={size}
      className={`inline-block ${glow ? "neon-glow" : ""} ${className}`}
      style={{ imageRendering: "auto" }}
    />
  );
}

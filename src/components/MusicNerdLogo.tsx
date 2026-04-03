import musicNerdLogo from "@/assets/musicnerd-logo.png";

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
      className={`inline-block rounded-full ${className}`}
      style={{
        imageRendering: "auto",
        ...(glow ? {
          boxShadow: "0 0 8px hsl(var(--neon-glow) / 0.6), 0 0 20px hsl(var(--neon-glow) / 0.3)",
          transition: "box-shadow 0.4s ease",
        } : {}),
      }}
    />
  );
}

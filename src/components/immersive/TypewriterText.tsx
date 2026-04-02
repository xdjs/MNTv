import { useState, useEffect, useRef } from "react";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  onComplete?: () => void;
  paused?: boolean;
  as?: "p" | "h1" | "h2" | "h3" | "span";
}

export default function TypewriterText({
  text,
  speed = 30,
  delay = 0,
  className = "",
  onComplete,
  paused = false,
  as: Tag = "p",
}: TypewriterTextProps) {
  const [charIndex, setCharIndex] = useState(0);
  const [started, setStarted] = useState(delay === 0);
  const completeFiredRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setCharIndex(0);
    setStarted(delay === 0);
    completeFiredRef.current = false;
  }, [text, delay]);

  useEffect(() => {
    if (delay <= 0 || started) return;
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [delay, started]);

  useEffect(() => {
    if (!started || paused || charIndex >= text.length) return;
    const timer = setInterval(() => {
      setCharIndex((prev) => {
        const next = prev + 1;
        if (next >= text.length) clearInterval(timer);
        return next;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [started, paused, speed, text.length, charIndex]);

  useEffect(() => {
    if (charIndex >= text.length && text.length > 0 && !completeFiredRef.current) {
      completeFiredRef.current = true;
      onCompleteRef.current?.();
    }
  }, [charIndex, text.length]);

  // Render with a wider fade wave — 8 chars fading in, creating a visible "materializing" effect
  const FADE_WIDTH = 8;
  const solidEnd = Math.max(0, charIndex - FADE_WIDTH);
  const revealed = text.slice(0, solidEnd);
  const fading = text.slice(solidEnd, charIndex);
  const hidden = text.slice(charIndex);

  return (
    <Tag className={className}>
      <span>{revealed}</span>
      <span style={{ opacity: 0.6, transition: "opacity 0.2s ease-out" }}>{fading}</span>
      <span style={{ opacity: 0 }}>{hidden}</span>
    </Tag>
  );
}

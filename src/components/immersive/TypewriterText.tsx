import { useState, useEffect, useRef, useCallback } from "react";

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
  const pausedRef = useRef(paused);
  const textLenRef = useRef(text.length);
  onCompleteRef.current = onComplete;
  pausedRef.current = paused;
  textLenRef.current = text.length;

  // Reset on text change
  useEffect(() => {
    setCharIndex(0);
    setStarted(delay === 0);
    completeFiredRef.current = false;
  }, [text, delay]);

  // Start delay
  useEffect(() => {
    if (delay <= 0 || started) return;
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [delay, started]);

  // Single stable interval — reads paused/length from refs to avoid recreation
  useEffect(() => {
    if (!started || paused) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return; // skip tick while paused
      setCharIndex((prev) => {
        if (prev >= textLenRef.current) {
          clearInterval(timer);
          if (!completeFiredRef.current) {
            completeFiredRef.current = true;
            onCompleteRef.current?.();
          }
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [started, paused, speed]);

  // Render with fade wave
  const FADE_WIDTH = 8;
  const solidEnd = Math.max(0, charIndex - FADE_WIDTH);
  const revealed = text.slice(0, solidEnd);
  const fading = text.slice(solidEnd, charIndex);
  const hidden = text.slice(charIndex);

  const isComplete = charIndex >= text.length;

  return (
    <Tag className={className}>
      {isComplete ? (
        text
      ) : (
        <>
          <span>{revealed}</span>
          <span style={{ opacity: 0.7, transition: "opacity 0.15s ease-out" }}>{fading}</span>
        </>
      )}
    </Tag>
  );
}

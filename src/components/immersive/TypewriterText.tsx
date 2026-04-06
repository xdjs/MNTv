import { useState, useEffect, useRef } from "react";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  onComplete?: () => void;
  paused?: boolean;
  as?: "p" | "h1" | "h2" | "h3" | "span";
}

export default function TypewriterText({
  text,
  speed = 30,
  delay = 0,
  className = "",
  style,
  onComplete,
  paused = false,
  as: Tag = "p",
}: TypewriterTextProps) {
  const [charIndex, setCharIndex] = useState(0);
  const [started, setStarted] = useState(delay === 0);
  const completeFiredRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const pausedRef = useRef(paused);
  onCompleteRef.current = onComplete;
  pausedRef.current = paused;

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

  // Advance character index on interval — no side-effects inside the
  // setState updater (concurrent-mode safe).
  useEffect(() => {
    if (!started || paused) return;
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setCharIndex((prev) => (prev >= text.length ? prev : prev + 1));
    }, speed);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [started, paused, speed, text]);

  // Fire onComplete and stop the interval when the full string is typed.
  useEffect(() => {
    if (charIndex >= text.length && text.length > 0 && !completeFiredRef.current) {
      completeFiredRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onCompleteRef.current?.();
    }
  }, [charIndex, text.length]);

  const visible = text.slice(0, charIndex);

  return (
    <Tag className={className} style={style}>
      {visible}
    </Tag>
  );
}

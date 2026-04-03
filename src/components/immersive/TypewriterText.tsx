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
  const onCompleteRef = useRef(onComplete);
  const pausedRef = useRef(paused);
  const textLenRef = useRef(text.length);
  onCompleteRef.current = onComplete;
  pausedRef.current = paused;
  textLenRef.current = text.length;

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
    if (!started || paused) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
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

  // Simple reveal: only show characters up to charIndex. Nothing else.
  const visible = text.slice(0, charIndex);

  return (
    <Tag className={className} style={style}>
      {visible}
    </Tag>
  );
}

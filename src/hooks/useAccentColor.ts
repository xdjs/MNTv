import { useEffect, useRef } from "react";

/**
 * Extracts the dominant vibrant colour from an image URL using an offscreen canvas,
 * then injects it as --primary / --neon-glow / --ring CSS variables on :root.
 *
 * Falls back to the default pink (330 90% 60%) if extraction fails.
 */

const DEFAULT_HSL = "330 90% 60%";
const FALLBACK_TIMEOUT = 3000; // ms before we apply fallback

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Score a colour for vibrancy: prefer high saturation, mid lightness */
function vibrancyScore(s: number, l: number): number {
  if (l < 15 || l > 85) return 0; // too dark or too light
  if (s < 25) return 0; // too grey
  return s * (1 - Math.abs(l - 55) / 55);
}

export function extractDominantHsl(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const fallback = () => resolve(DEFAULT_HSL);
    const timer = setTimeout(fallback, FALLBACK_TIMEOUT);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        const SIZE = 64; // sample at 64x64 for speed
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(DEFAULT_HSL); return; }

        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // Bucket colours into 8-level quantisation bins
        type Bucket = { r: number; g: number; b: number; count: number };
        const buckets = new Map<string, Bucket>();

        for (let i = 0; i < data.length; i += 4) {
          const r = Math.round(data[i] / 32) * 32;
          const g = Math.round(data[i + 1] / 32) * 32;
          const b = Math.round(data[i + 2] / 32) * 32;
          const key = `${r},${g},${b}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.r += data[i]; existing.g += data[i + 1]; existing.b += data[i + 2]; existing.count++;
          } else {
            buckets.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], count: 1 });
          }
        }

        let bestHsl = DEFAULT_HSL;
        let bestScore = -1;

        for (const b of buckets.values()) {
          const avgR = b.r / b.count;
          const avgG = b.g / b.count;
          const avgB = b.b / b.count;
          const [h, s, l] = rgbToHsl(avgR, avgG, avgB);
          const score = vibrancyScore(s, l) * Math.log(b.count + 1);
          if (score > bestScore) {
            bestScore = score;
            // Boost saturation slightly and normalise lightness for UI use
            bestHsl = `${h} ${Math.min(95, s + 10)}% ${Math.max(50, Math.min(65, l))}%`;
          }
        }

        resolve(bestHsl);
      } catch {
        resolve(DEFAULT_HSL);
      }
    };

    img.onerror = () => { clearTimeout(timer); resolve(DEFAULT_HSL); };
    img.src = imageUrl;
  });
}

/** Injects the accent HSL string as CSS variables on :root with a smooth transition */
export function applyAccentColor(hsl: string) {
  const root = document.documentElement;
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--neon-glow", hsl);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--accent", hsl);
  root.style.setProperty("--sidebar-primary", hsl);
  root.style.setProperty("--sidebar-ring", hsl);
}

/**
 * React hook: given a cover art URL, extracts the dominant colour and
 * applies it to the global CSS variables. Reverts to default on unmount.
 */
export function useAccentColor(imageUrl: string | undefined) {
  const prevHsl = useRef(DEFAULT_HSL);

  useEffect(() => {
    if (!imageUrl) {
      applyAccentColor(DEFAULT_HSL);
      return;
    }

    let cancelled = false;
    extractDominantHsl(imageUrl).then((hsl) => {
      if (cancelled) return;
      prevHsl.current = hsl;
      applyAccentColor(hsl);
    });

    return () => {
      cancelled = true;
      applyAccentColor(DEFAULT_HSL);
    };
  }, [imageUrl]);
}

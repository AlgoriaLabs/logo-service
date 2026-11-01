// Colour helpers: hex parsing, WCAG contrast, and a palette fixer that keeps every logo legible
// whatever colours the LLM proposed.

import type { Palette } from "./types.js";

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = HEX.exec(value.trim());
  if (!match || match[1] === undefined) return undefined;
  const raw = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${raw.toUpperCase()}`;
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background`. */
export function onColor(background: string): string {
  return contrast("#FFFFFF", background) >= contrast("#111111", background) ? "#FFFFFF" : "#111111";
}

/** Mixes `hex` toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const mixed = channels(hex).map((c) => Math.round(c + (target - c) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export const DARK_BACKGROUND = "#0B0F19";

/**
 * Makes a palette safe: valid hex everywhere, a light background, text that passes 4.5:1, and a
 * primary that is visible on the background (at least 2:1, darkened if needed).
 */
export function fixPalette(input: Partial<Record<keyof Palette, unknown>>, fallback: Palette): Palette {
  let background = normalizeHex(input.background) ?? fallback.background;
  if (luminance(background) < 0.75) background = "#FFFFFF"; // logos are delivered on light; dark is a variant
  let primary = normalizeHex(input.primary) ?? fallback.primary;
  for (let i = 0; i < 6 && contrast(primary, background) < 2; i++) primary = shade(primary, -0.2);
  let secondary = normalizeHex(input.secondary) ?? fallback.secondary;
  if (secondary === primary) secondary = shade(primary, 0.45);
  let ink = normalizeHex(input.ink) ?? fallback.ink;
  if (contrast(ink, background) < 4.5) ink = "#111827";
  return { primary, secondary, ink, background };
}

/** The palette used for the dark-background variant: light text, primary lifted if it disappears. */
export function darkVariant(palette: Palette): Palette {
  // A near-black primary would only turn muddy grey when lifted: invert it to near-white instead.
  let primary = luminance(palette.primary) < 0.03 ? "#F8FAFC" : palette.primary;
  for (let i = 0; i < 6 && contrast(primary, DARK_BACKGROUND) < 2.2; i++) primary = shade(primary, 0.25);
  let secondary = palette.secondary;
  for (let i = 0; i < 6 && contrast(secondary, DARK_BACKGROUND) < 1.8; i++) secondary = shade(secondary, 0.25);
  return { primary, secondary, ink: "#F8FAFC", background: DARK_BACKGROUND };
}

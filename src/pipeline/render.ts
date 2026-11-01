// Draws a LogoSpec as a self-contained SVG: no fonts, scripts, links or external references.
//
// Units: the mark lives in a 100×100 box; text is converted to outlines with opentype.js. Three
// variants per logo: "light" (for light backgrounds), "dark" (for dark backgrounds) and "mark"
// (the symbol alone, for favicons and avatars).

import opentype from "opentype.js";
import { icons, loadFont } from "./catalog.js";
import { contrast, darkVariant, onColor, shade } from "./color.js";
import { hashString, rng } from "./design.js";
import type { Container, Generator, LogoSpec, Palette, TextCase } from "./types.js";

export type Variant = "light" | "dark" | "mark";

const n = (value: number) => (Math.round(value * 100) / 100).toString();

export function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Piece {
  svg: string;
  box: Box;
}

// ---------- containers ----------

const CONTENT: Readonly<Record<Container, { cx: number; cy: number; size: number }>> = {
  none: { cx: 50, cy: 50, size: 100 },
  circle: { cx: 50, cy: 50, size: 56 },
  rounded: { cx: 50, cy: 50, size: 60 },
  squircle: { cx: 50, cy: 50, size: 60 },
  hexagon: { cx: 50, cy: 50, size: 52 },
  diamond: { cx: 50, cy: 50, size: 44 },
  shield: { cx: 50, cy: 45, size: 46 },
  blob: { cx: 50, cy: 50, size: 54 },
};

function blobPath(seed: number): string {
  const random = rng(seed);
  const points = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 44 + random() * 6;
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as const;
  });
  // Closed Catmull-Rom spline through the points, as cubic Béziers.
  let d = `M${n(points[0]![0])},${n(points[0]![1])}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;
    const p3 = points[(i + 2) % points.length]!;
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)},${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)},${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])},${n(p2[1])}`;
  }
  return `${d}Z`;
}

function containerShape(container: Container, seed: number): string | undefined {
  switch (container) {
    case "none":
      return undefined;
    case "circle":
      return `<circle cx="50" cy="50" r="50"/>`;
    case "rounded":
      return `<rect x="0" y="0" width="100" height="100" rx="22"/>`;
    case "squircle":
      return `<path d="M50,0C88,0 100,12 100,50C100,88 88,100 50,100C12,100 0,88 0,50C0,12 12,0 50,0Z"/>`;
    case "hexagon":
      return `<path d="M50,0L93.3,25L93.3,75L50,100L6.7,75L6.7,25Z"/>`;
    case "diamond":
      return `<path d="M50,3L97,50L50,97L3,50Z"/>`;
    case "shield":
      return `<path d="M50,0L94,14C94,58 78,84 50,100C22,84 6,58 6,14Z"/>`;
    case "blob":
      return `<path d="${blobPath(seed)}"/>`;
  }
}

// ---------- mark contents ----------

const ICON_ATTRS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "points"]);

function iconSvg(name: string, cx: number, cy: number, size: number, color: string): string {
  const nodes = icons()[name] ?? icons()["sparkles"]!;
  const scale = size / 24;
  const children = nodes
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .filter(([key]) => ICON_ATTRS.has(key))
        .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
        .join(" ");
      const fill = attrs["fill"] === "currentColor" ? ` fill="${color}"` : "";
      return `<${tag} ${attributes}${fill}/>`;
    })
    .join("");
  return `<g transform="translate(${n(cx - size / 2)},${n(cy - size / 2)}) scale(${n(scale)})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</g>`;
}

/** Characters the font can't draw are transliterated (ğ → g) or dropped. */
export function drawableText(font: opentype.Font, text: string): string {
  let out = "";
  for (const char of text) {
    if (char === " " || font.charToGlyphIndex(char) > 0) out += char;
    else {
      const plain = char.normalize("NFD").replace(/[̀-ͯ]/g, "").replace("ı", "i");
      if (plain && [...plain].every((c) => font.charToGlyphIndex(c) > 0)) out += plain;
    }
  }
  return out.trim() || "Logo";
}

function applyCase(text: string, textCase: TextCase): string {
  switch (textCase) {
    case "lower":
      return text.toLowerCase();
    case "upper":
      return text.toUpperCase();
    case "title":
      return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    case "as-is":
      return text;
  }
}

interface TextOutline {
  d: string;
  box: Box;
  capHeight: number;
}

/** Text as one outline path, baseline at y = 0, starting at x = 0. */
function textOutline(fontId: string, text: string, fontSize: number, tracking: number): TextOutline {
  const font = loadFont(fontId);
  // Glyph-by-glyph layout with GPOS/kern kerning. opentype.js's own shaper (font.getPath) throws on
  // some GSUB lookups, and logos need no ligatures or complex shaping.
  const glyphs = [...drawableText(font, text)].map((char) => font.charToGlyph(char));
  const scale = fontSize / font.unitsPerEm;
  const path = new opentype.Path();
  let x = 0;
  glyphs.forEach((glyph, index) => {
    path.extend(glyph.getPath(x, 0, fontSize));
    const next = glyphs[index + 1];
    let kern = 0;
    if (next) {
      try {
        kern = font.getKerningValue(glyph, next);
      } catch {
        kern = 0;
      }
    }
    x += ((glyph.advanceWidth ?? font.unitsPerEm * 0.5) + kern) * scale + (next ? tracking * fontSize : 0);
  });
  const bb = path.getBoundingBox();
  const capUnits = (font.tables["os2"] as { sCapHeight?: number } | undefined)?.sCapHeight || font.unitsPerEm * 0.7;
  return { d: path.toPathData(2), box: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 }, capHeight: (capUnits / font.unitsPerEm) * fontSize };
}

/** Font size at which the font's capital letters are `cap` units tall. */
function sizeForCap(fontId: string, cap: number): number {
  const font = loadFont(fontId);
  const capUnits = (font.tables["os2"] as { sCapHeight?: number } | undefined)?.sCapHeight || font.unitsPerEm * 0.7;
  return (cap * font.unitsPerEm) / capUnits;
}

function monogramSvg(letters: string, fontId: string, cx: number, cy: number, size: number, color: string): string {
  const probe = textOutline(fontId, letters, 100, 0);
  const width = probe.box.x2 - probe.box.x1;
  const height = probe.box.y2 - probe.box.y1;
  const scale = Math.min((size * 0.82) / width, (size * 0.66) / height);
  const tx = cx - ((probe.box.x1 + probe.box.x2) / 2) * scale;
  const ty = cy - ((probe.box.y1 + probe.box.y2) / 2) * scale;
  return `<path transform="translate(${n(tx)},${n(ty)}) scale(${n(scale)})" d="${probe.d}" fill="${color}"/>`;
}

function geometricSvg(generator: Generator, cx: number, cy: number, s: number, c1: string, c2: string, seed: number): string {
  const random = rng(seed);
  const x0 = cx - s / 2;
  const y0 = cy - s / 2;
  switch (generator) {
    case "orbit": {
      const tilt = Math.round(-35 + random() * 20);
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 0.27)}" fill="${c1}"/><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(s * 0.46)}" ry="${n(s * 0.17)}" fill="none" stroke="${c2}" stroke-width="${n(s * 0.055)}" transform="rotate(${tilt} ${n(cx)} ${n(cy)})"/><circle cx="${n(cx + s * 0.36)}" cy="${n(cy - s * 0.3)}" r="${n(s * 0.065)}" fill="${c2}"/>`;
    }
    case "stack": {
      const layer = (dy: number, color: string, opacity: number) =>
        `<path d="M${n(cx)},${n(y0 + s * 0.12 + dy)}L${n(x0 + s * 0.94)},${n(y0 + s * 0.34 + dy)}L${n(cx)},${n(y0 + s * 0.56 + dy)}L${n(x0 + s * 0.06)},${n(y0 + s * 0.34 + dy)}Z" fill="${color}" opacity="${opacity}"/>`;
      return layer(s * 0.32, c2, 0.55) + layer(s * 0.16, c2, 0.85) + layer(0, c1, 1);
    }
    case "facets": {
      const r = s * 0.48;
      const pts = Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos(((60 * i - 90) * Math.PI) / 180), cy + r * Math.sin(((60 * i - 90) * Math.PI) / 180)] as const);
      return pts
        .map((p, i) => {
          const q = pts[(i + 1) % 6]!;
          const color = i % 2 === 0 ? c1 : c2;
          return `<path d="M${n(cx)},${n(cy)}L${n(p[0])},${n(p[1])}L${n(q[0])},${n(q[1])}Z" fill="${color}" stroke="${color}" stroke-width="0.6" stroke-linejoin="round"/>`;
        })
        .join("");
    }
    case "pulse": {
      const arcs = [0.18, 0.31, 0.44]
        .map((k, i) => {
          const r = s * k;
          return `<path d="M${n(cx - r)},${n(cy)}A${n(r)},${n(r)} 0 0 1 ${n(cx)},${n(cy - r)}" fill="none" stroke="${i === 2 ? c2 : c1}" stroke-width="${n(s * 0.075)}" stroke-linecap="round" transform="translate(${n(s * 0.12)},${n(s * 0.12)})"/>`;
        })
        .join("");
      return `${arcs}<circle cx="${n(cx - s * 0.06)}" cy="${n(cy + s * 0.06)}" r="${n(s * 0.075)}" fill="${c1}"/>`;
    }
    case "bloom": {
      const petals = 5 + Math.floor(random() * 2);
      return Array.from({ length: petals }, (_, i) => {
        const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
        return `<circle cx="${n(cx + Math.cos(angle) * s * 0.2)}" cy="${n(cy + Math.sin(angle) * s * 0.2)}" r="${n(s * 0.22)}" fill="${i % 2 === 0 ? c1 : c2}" opacity="0.82"/>`;
      }).join("");
    }
    case "split": {
      const r = s * 0.44;
      return `<g transform="rotate(${Math.round(30 + random() * 30)} ${n(cx)} ${n(cy)})"><path d="M${n(cx - r)},${n(cy)}A${n(r)},${n(r)} 0 0 1 ${n(cx + r)},${n(cy)}Z" fill="${c1}"/><path d="M${n(cx - r)},${n(cy + s * 0.06)}A${n(r)},${n(r)} 0 0 0 ${n(cx + r)},${n(cy + s * 0.06)}Z" fill="${c2}"/></g>`;
    }
    case "grid": {
      const cell = s / 3;
      const on = new Set<number>();
      while (on.size < 5) on.add(Math.floor(random() * 9));
      return Array.from({ length: 9 }, (_, i) => {
        const x = x0 + (i % 3) * cell + cell * 0.12;
        const y = y0 + Math.floor(i / 3) * cell + cell * 0.12;
        return `<rect x="${n(x)}" y="${n(y)}" width="${n(cell * 0.76)}" height="${n(cell * 0.76)}" rx="${n(cell * 0.2)}" fill="${on.has(i) ? c1 : c2}"${on.has(i) ? "" : ' opacity="0.45"'}/>`;
      }).join("");
    }
    case "spark": {
      const star = (x: number, y: number, r: number, color: string) => {
        const k = r * 0.22;
        return `<path d="M${n(x)},${n(y - r)}C${n(x + k)},${n(y - k)} ${n(x + k)},${n(y - k)} ${n(x + r)},${n(y)}C${n(x + k)},${n(y + k)} ${n(x + k)},${n(y + k)} ${n(x)},${n(y + r)}C${n(x - k)},${n(y + k)} ${n(x - k)},${n(y + k)} ${n(x - r)},${n(y)}C${n(x - k)},${n(y - k)} ${n(x - k)},${n(y - k)} ${n(x)},${n(y - r)}Z" fill="${color}"/>`;
      };
      return star(cx - s * 0.06, cy + s * 0.04, s * 0.42, c1) + star(cx + s * 0.32, cy - s * 0.3, s * 0.14, c2);
    }
  }
}

function markPiece(spec: LogoSpec, palette: Palette, seed: number): Piece {
  const { container, kind } = spec.mark;
  const shape = containerShape(container, seed);
  const area = CONTENT[container];
  let svg = "";
  let content: string;
  let accent: string;
  if (shape) {
    svg += shape.replace("/>", ` fill="${palette.primary}"/>`);
    content = onColor(palette.primary);
    // Second tone inside a container: the secondary colour if it stands out, else a tint of the primary.
    accent = contrast(palette.secondary, palette.primary) >= 1.8 ? palette.secondary : shade(palette.primary, content === "#FFFFFF" ? 0.55 : -0.55);
    if (spec.mark.ring) {
      svg += `<g transform="translate(50,50) scale(0.86) translate(-50,-50)">${shape.replace("/>", ` fill="none" stroke="${accent}" stroke-width="3"/>`)}</g>`;
    }
  } else {
    content = palette.primary;
    accent = palette.secondary;
  }
  if (kind === "icon") svg += iconSvg(spec.mark.icon ?? "sparkles", area.cx, area.cy, area.size, content);
  else if (kind === "monogram") svg += monogramSvg(spec.mark.letters ?? "L", spec.wordmark.font, area.cx, area.cy, area.size, content);
  else if (kind === "geometric") svg += geometricSvg(spec.mark.generator ?? "orbit", area.cx, area.cy, shape ? area.size * 1.1 : area.size, content, accent, seed);
  return { svg: `<g>${svg}</g>`, box: { x1: 0, y1: 0, x2: 100, y2: 100 } };
}

function wordPiece(spec: LogoSpec, palette: Palette, cap: number): Piece & { capHeight: number } {
  const { font, tracking, accent } = spec.wordmark;
  const text = applyCase(spec.wordmark.text, spec.wordmark.case);
  const outline = textOutline(font, text, sizeForCap(font, cap), tracking);
  let svg = `<path d="${outline.d}" fill="${palette.ink}"/>`;
  const box = { ...outline.box };
  const c = outline.capHeight;
  if (accent === "dot") {
    const r = c * 0.13;
    const x = box.x2 + r * 1.6;
    svg += `<circle cx="${n(x)}" cy="${n(-r)}" r="${n(r)}" fill="${palette.primary}"/>`;
    box.x2 = x + r;
  } else if (accent === "underline") {
    const y = c * 0.28;
    svg += `<rect x="${n(box.x1)}" y="${n(y)}" width="${n(box.x2 - box.x1)}" height="${n(c * 0.11)}" rx="${n(c * 0.055)}" fill="${palette.primary}"/>`;
    box.y2 = Math.max(box.y2, y + c * 0.11);
  } else if (accent === "bar") {
    // A cursor-like block after the name (a bar in front reads as the letter "I").
    const w = c * 0.5;
    const h = c * 0.14;
    const x = box.x2 + c * 0.14;
    svg += `<rect x="${n(x)}" y="${n(-h)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 3)}" fill="${palette.primary}"/>`;
    box.x2 = x + w;
  }
  return { svg, box, capHeight: c };
}

const translate = (piece: Piece, dx: number, dy: number): Piece => ({
  svg: `<g transform="translate(${n(dx)},${n(dy)})">${piece.svg}</g>`,
  box: { x1: piece.box.x1 + dx, y1: piece.box.y1 + dy, x2: piece.box.x2 + dx, y2: piece.box.y2 + dy },
});

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

/** Renders one variant, or undefined for "mark" when the logo has no symbol. */
export function renderLogo(spec: LogoSpec, variant: Variant, label: string): RenderedSvg | undefined {
  const palette = variant === "dark" ? darkVariant(spec.palette) : spec.palette;
  const seed = hashString(JSON.stringify(spec.mark) + spec.title);
  const hasMark = spec.mark.kind !== "none";
  if (variant === "mark" && !hasMark) return undefined;

  const pieces: Piece[] = [];
  const layout = variant === "mark" ? "mark-only" : spec.layout;
  if (layout === "mark-only" || !hasMark) {
    if (hasMark) pieces.push(markPiece(spec, palette, seed));
    else pieces.push(wordPiece(spec, palette, 60));
  } else if (layout === "horizontal") {
    const mark = markPiece(spec, palette, seed);
    const word = wordPiece(spec, palette, 40);
    pieces.push(mark, translate(word, 100 + 24 - word.box.x1, 50 + word.capHeight / 2));
  } else if (layout === "stacked") {
    const mark = markPiece(spec, palette, seed);
    const word = wordPiece(spec, palette, 26);
    const wordWidth = word.box.x2 - word.box.x1;
    pieces.push(mark, translate(word, 50 - word.box.x1 - wordWidth / 2, 100 + 22 + word.capHeight));
  } else {
    pieces.push(wordPiece(spec, palette, 60));
  }

  const box = pieces.reduce<Box>(
    (acc, piece) => ({ x1: Math.min(acc.x1, piece.box.x1), y1: Math.min(acc.y1, piece.box.y1), x2: Math.max(acc.x2, piece.box.x2), y2: Math.max(acc.y2, piece.box.y2) }),
    { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
  );
  const pad = Math.max(box.x2 - box.x1, box.y2 - box.y1) * 0.08;
  const x = box.x1 - pad;
  const y = box.y1 - pad;
  const width = box.x2 - box.x1 + pad * 2;
  const height = box.y2 - box.y1 + pad * 2;
  const pixelScale = 512 / Math.max(width, height);
  const title = escapeXml(`${label}${variant === "dark" ? " (dark background)" : variant === "mark" ? " (symbol)" : ""}`);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(width)} ${n(height)}" width="${Math.round(width * pixelScale)}" height="${Math.round(height * pixelScale)}" role="img" aria-label="${title}">` +
    `<title>${title}</title>${pieces.map((piece) => piece.svg).join("")}</svg>`;
  return { svg, width: width * pixelScale, height: height * pixelScale };
}

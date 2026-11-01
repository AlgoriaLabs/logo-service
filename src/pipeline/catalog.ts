// The design catalog: fonts, per-style rules, icons and the keyword → icon shortlist.
//
// Fonts are SIL OFL families from Fontsource, icons are Lucide (ISC). Both allow use in logos, and
// the renderer turns glyphs into paths, so the delivered SVGs need no font files.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import opentype from "opentype.js";
import type { Accent, Container, Generator, Layout, MarkKind, Style } from "./types.js";

const require = createRequire(import.meta.url);

export interface FontEntry {
  id: string;
  family: string;
  /** Fontsource package directory name. */
  pkg: string;
  weight: number;
  look: string;
}

export const FONTS: readonly FontEntry[] = [
  { id: "inter-500", family: "Inter", pkg: "inter", weight: 500, look: "neutral grotesk, clean" },
  { id: "inter-800", family: "Inter", pkg: "inter", weight: 800, look: "heavy neutral grotesk" },
  { id: "outfit-500", family: "Outfit", pkg: "outfit", weight: 500, look: "friendly geometric, light" },
  { id: "outfit-700", family: "Outfit", pkg: "outfit", weight: 700, look: "friendly geometric, bold" },
  { id: "sora-600", family: "Sora", pkg: "sora", weight: 600, look: "wide modern sans" },
  { id: "space-grotesk-600", family: "Space Grotesk", pkg: "space-grotesk", weight: 600, look: "quirky technical grotesk" },
  { id: "montserrat-700", family: "Montserrat", pkg: "montserrat", weight: 700, look: "urban geometric, strong" },
  { id: "montserrat-800", family: "Montserrat", pkg: "montserrat", weight: 800, look: "urban geometric, extra bold" },
  { id: "poppins-600", family: "Poppins", pkg: "poppins", weight: 600, look: "round geometric, approachable" },
  { id: "syne-700", family: "Syne", pkg: "syne", weight: 700, look: "expressive, editorial" },
  { id: "playfair-display-700", family: "Playfair Display", pkg: "playfair-display", weight: 700, look: "high-contrast serif, elegant" },
  { id: "dm-serif-display-400", family: "DM Serif Display", pkg: "dm-serif-display", weight: 400, look: "classic display serif" },
  { id: "archivo-black-400", family: "Archivo Black", pkg: "archivo-black", weight: 400, look: "ultra heavy grotesk, punchy" },
  { id: "fredoka-600", family: "Fredoka", pkg: "fredoka", weight: 600, look: "rounded, playful" },
  { id: "righteous-400", family: "Righteous", pkg: "righteous", weight: 400, look: "retro rounded display" },
  { id: "jetbrains-mono-600", family: "JetBrains Mono", pkg: "jetbrains-mono", weight: 600, look: "monospace, developer" },
  { id: "orbitron-700", family: "Orbitron", pkg: "orbitron", weight: 700, look: "futuristic, squared" },
];

export interface StyleRules {
  guide: string;
  kinds: readonly MarkKind[];
  containers: readonly Container[];
  layouts: readonly Layout[];
  accents: readonly Accent[];
  fonts: readonly string[];
  generators: readonly Generator[];
  ring: boolean;
  /** Fallback palettes: primary, secondary, ink, background. */
  palettes: readonly (readonly [string, string, string, string])[];
}

export const STYLE_RULES: Readonly<Record<Style, StyleRules>> = {
  minimal: {
    guide: "Restrained and quiet: one simple mark, lots of space, one strong colour plus near-black text.",
    kinds: ["icon", "geometric", "monogram"],
    containers: ["none", "circle", "rounded"],
    layouts: ["horizontal", "stacked", "mark-only"],
    accents: ["none", "dot"],
    fonts: ["inter-500", "outfit-500", "sora-600", "space-grotesk-600"],
    generators: ["orbit", "split", "pulse", "spark"],
    ring: false,
    palettes: [["#111827", "#6B7280", "#111827", "#FFFFFF"], ["#2563EB", "#93C5FD", "#0F172A", "#FFFFFF"], ["#0F766E", "#5EEAD4", "#111827", "#FFFFFF"]],
  },
  geometric: {
    guide: "Built from circles, triangles and grids: a constructed abstract symbol with two tones.",
    kinds: ["geometric", "icon"],
    containers: ["none", "hexagon", "diamond", "circle"],
    layouts: ["horizontal", "stacked", "mark-only"],
    accents: ["none", "bar"],
    fonts: ["space-grotesk-600", "outfit-700", "sora-600", "montserrat-700"],
    generators: ["orbit", "stack", "facets", "bloom", "split", "grid"],
    ring: false,
    palettes: [["#7C3AED", "#F59E0B", "#1F2937", "#FFFFFF"], ["#0EA5E9", "#F43F5E", "#0F172A", "#FFFFFF"], ["#16A34A", "#0EA5E9", "#14213D", "#FFFFFF"]],
  },
  lettermark: {
    guide: "Initials as the mark: one or two strong letters, set inside a shape, with confident type.",
    kinds: ["monogram"],
    containers: ["none", "circle", "rounded", "squircle", "hexagon", "shield"],
    layouts: ["mark-only", "horizontal", "stacked"],
    accents: ["none"],
    fonts: ["archivo-black-400", "playfair-display-700", "dm-serif-display-400", "montserrat-800", "syne-700"],
    generators: [],
    ring: false,
    palettes: [["#1E3A8A", "#F59E0B", "#0B1220", "#FFFFFF"], ["#9F1239", "#FDA4AF", "#1F1F1F", "#FFFFFF"], ["#111827", "#10B981", "#111827", "#FFFFFF"]],
  },
  wordmark: {
    guide: "The name itself is the logo: distinctive type, careful spacing and one small accent.",
    kinds: ["none"],
    containers: ["none"],
    layouts: ["wordmark-only"],
    accents: ["none", "dot", "underline", "bar"],
    fonts: ["syne-700", "playfair-display-700", "poppins-600", "space-grotesk-600", "dm-serif-display-400", "montserrat-800"],
    generators: [],
    ring: false,
    palettes: [["#E11D48", "#111827", "#111827", "#FFFFFF"], ["#2563EB", "#111827", "#0F172A", "#FFFFFF"], ["#EA580C", "#1C1917", "#1C1917", "#FFFFFF"]],
  },
  emblem: {
    guide: "A badge or seal: symbol inside a shield or circle with an inner ring, trustworthy and solid.",
    kinds: ["icon", "monogram"],
    containers: ["shield", "circle", "hexagon"],
    layouts: ["stacked", "horizontal", "mark-only"],
    accents: ["none"],
    fonts: ["montserrat-800", "playfair-display-700", "archivo-black-400", "dm-serif-display-400"],
    generators: [],
    ring: true,
    palettes: [["#14532D", "#D4A017", "#14213D", "#FFFFFF"], ["#1E3A8A", "#E5B700", "#0B1220", "#FFFFFF"], ["#7F1D1D", "#F5C04A", "#1F1F1F", "#FFFFFF"]],
  },
  playful: {
    guide: "Friendly and bright: rounded shapes, saturated colours, a mark with personality.",
    kinds: ["icon", "monogram", "geometric"],
    containers: ["blob", "squircle", "circle"],
    layouts: ["horizontal", "stacked"],
    accents: ["none", "dot"],
    fonts: ["fredoka-600", "righteous-400", "poppins-600", "outfit-700"],
    generators: ["bloom", "spark", "grid"],
    ring: false,
    palettes: [["#F97316", "#8B5CF6", "#1F2937", "#FFFFFF"], ["#EC4899", "#22D3EE", "#1E1B4B", "#FFFFFF"], ["#22C55E", "#FACC15", "#14213D", "#FFFFFF"]],
  },
  tech: {
    guide: "Precise and technical: sharp geometry, mono or futuristic type, cool colours with one neon accent.",
    kinds: ["icon", "geometric", "monogram"],
    containers: ["hexagon", "rounded", "none", "diamond"],
    layouts: ["horizontal", "stacked", "mark-only"],
    accents: ["none", "bar", "underline"],
    fonts: ["jetbrains-mono-600", "orbitron-700", "space-grotesk-600", "sora-600"],
    generators: ["facets", "grid", "stack", "pulse"],
    ring: false,
    palettes: [["#0F172A", "#22D3EE", "#0F172A", "#FFFFFF"], ["#4F46E5", "#34D399", "#111827", "#FFFFFF"], ["#18181B", "#A3E635", "#18181B", "#FFFFFF"]],
  },
};

// ---------- fonts ----------

const fontCache = new Map<string, opentype.Font>();

export function fontById(id: string): FontEntry | undefined {
  return FONTS.find((font) => font.id === id);
}

export function fontFile(entry: FontEntry): string {
  const pkgJson = require.resolve(`@fontsource/${entry.pkg}/package.json`);
  return join(dirname(pkgJson), "files", `${entry.pkg}-latin-${entry.weight}-normal.woff`);
}

export function loadFont(id: string): opentype.Font {
  const cached = fontCache.get(id);
  if (cached) return cached;
  const entry = fontById(id);
  if (entry === undefined) throw new Error(`unknown font ${id}`);
  const bytes = readFileSync(fontFile(entry));
  const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  fontCache.set(id, font);
  return font;
}

// ---------- icons ----------

export type IconNode = [string, Record<string, string | number>];

let iconNodes: Record<string, IconNode[]> | undefined;
let iconTags: Record<string, string[]> | undefined;

export function icons(): Record<string, IconNode[]> {
  iconNodes ??= JSON.parse(readFileSync(require.resolve("lucide-static/icon-nodes.json"), "utf8")) as Record<string, IconNode[]>;
  return iconNodes;
}

function tags(): Record<string, string[]> {
  iconTags ??= JSON.parse(readFileSync(require.resolve("lucide-static/tags.json"), "utf8")) as Record<string, string[]>;
  return iconTags;
}

/** Icons that read badly as a logo (UI chrome, arrows, text formatting). */
const ICON_DENY = /^(arrow|chevron|align|text-|heading|list|table|panel|layout|move|corner|pilcrow|square-dashed|between|grip|ellipsis|minus|plus|x$|check$|equal|divide|percent|ratio|scan|scaling|separator|space|strikethrough|subscript|superscript|underline|bold|italic|wrap|indent|remove-formatting|case-|regex|whole-word|replace|spell)/;

/** Common project words → icons that tend to work for them. */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  ai: ["brain", "sparkles", "bot", "cpu", "wand-sparkles"],
  agent: ["bot", "sparkles", "workflow", "radar"],
  llm: ["brain", "message-square", "sparkles"],
  api: ["plug", "webhook", "server", "braces"],
  sdk: ["package", "boxes", "code"],
  cli: ["terminal", "square-terminal", "command"],
  pay: ["wallet", "credit-card", "coins", "banknote"],
  payment: ["wallet", "credit-card", "coins", "receipt"],
  wallet: ["wallet", "key-round", "coins"],
  blockchain: ["blocks", "link", "boxes", "hexagon"],
  crypto: ["coins", "bitcoin", "key-round", "hexagon"],
  stellar: ["star", "orbit", "sparkle", "rocket"],
  search: ["search", "telescope", "compass", "scan-search"],
  discover: ["telescope", "compass", "radar"],
  security: ["shield", "shield-check", "lock", "key"],
  auth: ["key-round", "fingerprint", "lock"],
  data: ["database", "chart-line", "layers"],
  analytics: ["chart-column", "chart-pie", "activity"],
  design: ["pen-tool", "palette", "shapes", "brush"],
  logo: ["pen-tool", "shapes", "palette"],
  image: ["image", "aperture", "camera"],
  chat: ["message-circle", "messages-square"],
  cloud: ["cloud", "cloud-cog", "server"],
  deploy: ["rocket", "cloud-upload", "ship"],
  game: ["gamepad-2", "dice-5", "joystick"],
  music: ["music", "audio-lines", "headphones"],
  video: ["clapperboard", "film", "video"],
  docs: ["book-open", "file-text", "notebook"],
  learn: ["graduation-cap", "book-open", "lightbulb"],
  test: ["flask-conical", "test-tube", "bug"],
  bug: ["bug", "shield-alert"],
  web: ["globe", "earth", "app-window"],
  mobile: ["smartphone", "tablet"],
  email: ["mail", "send", "inbox"],
  map: ["map", "map-pin", "navigation"],
  time: ["clock", "timer", "hourglass"],
  health: ["heart-pulse", "activity", "stethoscope"],
  finance: ["landmark", "piggy-bank", "trending-up"],
  market: ["store", "shopping-bag", "tag"],
  shop: ["shopping-cart", "store", "shopping-bag"],
  social: ["users", "share-2", "heart"],
  network: ["network", "share-2", "waypoints"],
  graph: ["git-fork", "waypoints", "network"],
  git: ["git-branch", "git-merge", "git-fork"],
  file: ["file", "folder", "files"],
  storage: ["hard-drive", "database", "archive"],
  speed: ["zap", "gauge", "rocket"],
  fast: ["zap", "rocket", "gauge"],
  build: ["hammer", "wrench", "construction"],
  tool: ["wrench", "hammer", "toolbox"],
  automation: ["workflow", "bot", "repeat"],
  green: ["leaf", "sprout", "trees"],
  food: ["utensils", "chef-hat", "apple"],
  travel: ["plane", "luggage", "map"],
  home: ["house", "key"],
  space: ["rocket", "orbit", "satellite"],
  verify: ["badge-check", "shield-check", "check-check"],
  reputation: ["star", "award", "badge-check"],
  service: ["concierge-bell", "handshake", "plug"],
};

const GENERIC_ICONS = ["sparkles", "zap", "layers", "box", "rocket", "hexagon", "orbit", "compass", "atom", "infinity", "flame", "leaf", "gem", "feather", "star", "target"];

export function stem(word: string): string {
  return word.toLowerCase().replace(/(ing|ers|er|ed|es|s)$/, "").slice(0, 8);
}

/**
 * Up to `limit` Lucide icon names relevant to the keywords, best first. Deterministic: same keywords,
 * same list. The LLM may only choose from this list.
 */
export function iconShortlist(keywords: readonly string[], limit = 48): string[] {
  const nodes = icons();
  const allTags = tags();
  const scores = new Map<string, number>();
  const add = (name: string, score: number) => {
    if (nodes[name] === undefined || ICON_DENY.test(name)) return;
    scores.set(name, (scores.get(name) ?? 0) + score);
  };

  keywords.forEach((keyword, rank) => {
    const weight = Math.max(1, 10 - rank) / 10;
    const lower = keyword.toLowerCase();
    for (const synonym of SYNONYMS[lower] ?? SYNONYMS[stem(lower)] ?? []) add(synonym, 3 * weight);
    const s = stem(lower);
    if (s.length < 3) return;
    for (const [name, tagList] of Object.entries(allTags)) {
      const parts = name.split("-");
      if (parts.some((part) => stem(part) === s)) add(name, 2 * weight);
      else if (tagList.some((tag) => stem(tag) === s)) add(name, 1 * weight);
    }
  });

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  for (const name of GENERIC_ICONS) if (!ranked.includes(name) && nodes[name]) ranked.push(name);
  return ranked.slice(0, limit);
}

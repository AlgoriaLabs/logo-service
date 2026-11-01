// Shared types for the logo pipeline: the job input, the project digest, the brand brief and the
// logo spec the renderer draws. A spec is plain data with whitelisted values only, so whatever a
// repository's README says, the renderer can only ever draw shapes from the catalog.

export const STYLES = ["minimal", "geometric", "lettermark", "wordmark", "emblem", "playful", "tech"] as const;
export type Style = (typeof STYLES)[number];

export const MARK_KINDS = ["icon", "monogram", "geometric", "none"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export const CONTAINERS = ["none", "circle", "rounded", "squircle", "hexagon", "diamond", "shield", "blob"] as const;
export type Container = (typeof CONTAINERS)[number];

export const LAYOUTS = ["horizontal", "stacked", "mark-only", "wordmark-only"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const GENERATORS = ["orbit", "stack", "facets", "pulse", "bloom", "split", "grid", "spark"] as const;
export type Generator = (typeof GENERATORS)[number];

export const ACCENTS = ["none", "dot", "underline", "bar"] as const;
export type Accent = (typeof ACCENTS)[number];

export const CASES = ["as-is", "lower", "upper", "title"] as const;
export type TextCase = (typeof CASES)[number];

export interface JobInput {
  repoUrl: string;
  style: Style;
  count: number;
  brandName?: string;
}

export interface Palette {
  primary: string;
  secondary: string;
  /** Text and outline colour on a light background. */
  ink: string;
  /** The light background the logo is shown on. */
  background: string;
}

export interface LogoSpec {
  title: string;
  rationale: string;
  mark: {
    kind: MarkKind;
    icon?: string;
    letters?: string;
    generator?: Generator;
    container: Container;
    /** Emblem style: a thin inner ring on the container. */
    ring?: boolean;
  };
  wordmark: {
    text: string;
    font: string;
    case: TextCase;
    /** Letter spacing in em, -0.05 to 0.3. */
    tracking: number;
    accent: Accent;
  };
  layout: Layout;
  palette: Palette;
}

export interface ProjectDigest {
  owner: string;
  repo: string;
  url: string;
  name: string;
  description: string;
  topics: string[];
  language: string | undefined;
  homepage: string | undefined;
  keywords: string[];
  readmeExcerpt: string;
  colorHints: string[];
  files: string[];
}

export interface BrandBrief {
  name: string;
  tagline: string;
  summary: string;
  keywords: string[];
}

export interface DesignResult {
  brief: BrandBrief;
  specs: LogoSpec[];
  /** "groq:openai/gpt-oss-120b", or "heuristic" when no LLM answered. */
  generator: string;
}

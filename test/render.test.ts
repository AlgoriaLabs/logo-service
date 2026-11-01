// The renderer draws every combination as a safe, self-contained SVG, and the PDF builds.

import { describe, expect, it } from "vitest";
import { FONTS, STYLE_RULES } from "../src/pipeline/catalog.js";
import { buildPresentation } from "../src/pipeline/pdf.js";
import { drawableText, renderLogo } from "../src/pipeline/render.js";
import { loadFont } from "../src/pipeline/catalog.js";
import { CONTAINERS, GENERATORS, type LogoSpec } from "../src/pipeline/types.js";

const palette = { primary: "#2563EB", secondary: "#F59E0B", ink: "#111827", background: "#FFFFFF" };

function spec(over: Partial<LogoSpec> & { mark?: Partial<LogoSpec["mark"]>; wordmark?: Partial<LogoSpec["wordmark"]> } = {}): LogoSpec {
  return {
    title: "Test",
    rationale: "",
    layout: over.layout ?? "horizontal",
    palette: over.palette ?? palette,
    mark: { kind: "icon", icon: "rocket", container: "circle", ...over.mark },
    wordmark: { text: "Acme Labs", font: "inter-500", case: "as-is", tracking: 0, accent: "none", ...over.wordmark },
  };
}

function assertSafe(svg: string) {
  expect(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"")).toBe(true);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  expect(svg).not.toMatch(/<script|<image|<foreignObject|href=|url\(|<text/i);
}

describe("renderLogo", () => {
  it("renders every container × mark kind × layout", () => {
    for (const container of CONTAINERS)
      for (const kind of ["icon", "monogram", "geometric"] as const)
        for (const layout of ["horizontal", "stacked", "mark-only"] as const) {
          const s = spec({ layout, mark: { kind, container, letters: "AL", generator: "orbit", ring: container === "shield" } });
          for (const variant of ["light", "dark", "mark"] as const) assertSafe(renderLogo(s, variant, "Acme")!.svg);
        }
  });

  it("renders every generator, font and accent", () => {
    for (const generator of GENERATORS) assertSafe(renderLogo(spec({ mark: { kind: "geometric", generator, container: "none" } }), "light", "Acme")!.svg);
    for (const font of FONTS)
      for (const accent of ["none", "dot", "underline", "bar"] as const)
        assertSafe(renderLogo(spec({ layout: "wordmark-only", mark: { kind: "none", container: "none" }, wordmark: { font: font.id, accent, case: "upper", tracking: 0.1 } }), "light", "Acme")!.svg);
  });

  it("has no symbol variant for a pure wordmark", () => {
    expect(renderLogo(spec({ layout: "wordmark-only", mark: { kind: "none", container: "none" } }), "mark", "Acme")).toBeUndefined();
  });

  it("escapes the label and transliterates characters the font lacks", () => {
    const out = renderLogo(spec({ wordmark: { text: "Çağrı Şen" } }), "light", `<b>"x"</b>`)!;
    assertSafe(out.svg);
    expect(out.svg).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    expect(drawableText(loadFont("inter-500"), "ğş")).toBe("gs"); // latin subset: no ğ or ş glyphs
  });

  it("every style's fonts exist in the catalog", () => {
    for (const rules of Object.values(STYLE_RULES)) for (const id of rules.fonts) expect(FONTS.some((f) => f.id === id), id).toBe(true);
  });
});

describe("buildPresentation", () => {
  it("builds a PDF with the logos as vectors", async () => {
    const s = spec();
    const pdf = await buildPresentation({
      brief: { name: "Acme Labs", tagline: "Tools", summary: "Acme makes tools.", keywords: ["tools"] },
      repoUrl: "https://github.com/acme/labs",
      style: "minimal",
      generator: "heuristic",
      createdAt: new Date("2026-10-28T00:00:00Z"),
      logos: [{ spec: s, light: renderLogo(s, "light", "Acme")!, dark: renderLogo(s, "dark", "Acme")!, mark: renderLogo(s, "mark", "Acme") }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});

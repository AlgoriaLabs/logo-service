// Builds the PDF presentation: a cover with the brand brief, one page per concept (light and dark
// backgrounds, symbol sizes, palette, typeface), and a credits page. Logos stay vector in the PDF
// (svg-to-pdfkit), so no browser is needed and the file stays small.

import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { FONTS, fontFile, fontById } from "./catalog.js";
import { DARK_BACKGROUND } from "./color.js";
import type { RenderedSvg } from "./render.js";
import type { BrandBrief, LogoSpec } from "./types.js";

export interface PresentationLogo {
  spec: LogoSpec;
  light: RenderedSvg;
  dark: RenderedSvg;
  mark: RenderedSvg | undefined;
}

export interface PresentationInput {
  brief: BrandBrief;
  repoUrl: string;
  style: string;
  generator: string;
  createdAt: Date;
  logos: PresentationLogo[];
}

const PAGE = { width: 842, height: 595, margin: 48 };
const GRAY = "#6B7280";
const LINE = "#E5E7EB";
const TEXT = "#111827";

function fit(doc: PDFKit.PDFDocument, image: RenderedSvg, x: number, y: number, w: number, h: number, pad: number) {
  const scale = Math.min((w - pad * 2) / image.width, (h - pad * 2) / image.height);
  const iw = image.width * scale;
  const ih = image.height * scale;
  SVGtoPDF(doc, image.svg, x + (w - iw) / 2, y + (h - ih) / 2, { width: iw, height: ih, preserveAspectRatio: "xMidYMid meet" });
}

function interFile(weight: number): string {
  const entry = FONTS.find((font) => font.pkg === "inter" && font.weight === weight) ?? { id: `inter-${weight}`, family: "Inter", pkg: "inter", weight, look: "" };
  return fontFile(entry);
}

export function buildPresentation(input: PresentationInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: PAGE.margin, autoFirstPage: false, info: { Title: `${input.brief.name} — logo concepts`, Creator: "Stellar Logo Agent" } });
  doc.registerFont("body", interFile(500));
  doc.registerFont("bold", interFile(800));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { margin } = PAGE;
  const contentWidth = PAGE.width - margin * 2;
  const accent = input.logos[0]?.spec.palette.primary ?? TEXT;

  // ---------- cover ----------
  doc.addPage();
  doc.rect(0, 0, 10, PAGE.height).fill(accent);
  doc.font("bold").fontSize(40).fillColor(TEXT).text(input.brief.name, margin, 70, { width: contentWidth });
  doc.font("body").fontSize(16).fillColor(GRAY).text(input.brief.tagline, { width: contentWidth });
  doc.moveDown(1.2);
  doc.font("body").fontSize(11).fillColor(TEXT).text(input.brief.summary, { width: 520, lineGap: 3 });
  doc.moveDown(1.2);
  const meta: [string, string][] = [
    ["Repository", input.repoUrl],
    ["Style", input.style],
    ["Concepts", String(input.logos.length)],
    ["Keywords", input.brief.keywords.join(", ") || "—"],
    ["Date", input.createdAt.toISOString().slice(0, 10)],
  ];
  for (const [label, value] of meta) {
    const y = doc.y;
    doc.font("bold").fontSize(9).fillColor(GRAY).text(label.toUpperCase(), margin, y, { width: 90 });
    doc.font("body").fontSize(10).fillColor(TEXT).text(value, margin + 96, y, { width: contentWidth - 96 });
    doc.moveDown(0.4);
  }
  const thumbs = input.logos.slice(0, 6);
  const thumbW = (contentWidth - (thumbs.length - 1) * 12) / Math.max(1, thumbs.length);
  const thumbY = PAGE.height - margin - 110;
  thumbs.forEach((logo, i) => {
    const x = margin + i * (thumbW + 12);
    doc.roundedRect(x, thumbY, thumbW, 110, 8).lineWidth(0.6).strokeColor(LINE).stroke();
    fit(doc, logo.light, x, thumbY, thumbW, 110, 14);
  });

  // ---------- one page per concept ----------
  input.logos.forEach((logo, index) => {
    const { spec } = logo;
    doc.addPage();
    doc.font("bold").fontSize(9).fillColor(GRAY).text(`CONCEPT ${index + 1} OF ${input.logos.length}`, margin, margin);
    doc.font("bold").fontSize(20).fillColor(TEXT).text(spec.title, margin, margin + 14, { width: contentWidth });
    if (spec.rationale) doc.font("body").fontSize(10.5).fillColor(GRAY).text(spec.rationale, margin, doc.y + 4, { width: 620 });

    const top = 132;
    const leftW = 470;
    const panelH = PAGE.height - top - margin;
    doc.roundedRect(margin, top, leftW, panelH, 10).fill(spec.palette.background);
    doc.roundedRect(margin, top, leftW, panelH, 10).lineWidth(0.6).strokeColor(LINE).stroke();
    fit(doc, logo.light, margin, top, leftW, panelH, 48);

    const rx = margin + leftW + 20;
    const rw = PAGE.width - margin - rx;
    doc.roundedRect(rx, top, rw, 150, 10).fill(DARK_BACKGROUND);
    fit(doc, logo.dark, rx, top, rw, 150, 22);

    let y = top + 166;
    if (logo.mark) {
      doc.font("bold").fontSize(8).fillColor(GRAY).text("SYMBOL SIZES", rx, y);
      y += 14;
      let x = rx;
      for (const size of [64, 40, 24, 16]) {
        fit(doc, logo.mark, x, y + (64 - size) / 2, size, size, 0);
        x += size + 18;
      }
      y += 76;
    }

    doc.font("bold").fontSize(8).fillColor(GRAY).text("PALETTE", rx, y);
    y += 14;
    const swatches: [string, string][] = [["Primary", spec.palette.primary], ["Secondary", spec.palette.secondary], ["Ink", spec.palette.ink]];
    const sw = (rw - 2 * 10) / 3;
    swatches.forEach(([name, hex], i) => {
      const x = rx + i * (sw + 10);
      doc.roundedRect(x, y, sw, 34, 6).fill(hex);
      doc.roundedRect(x, y, sw, 34, 6).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font("body").fontSize(8).fillColor(TEXT).text(`${name} ${hex}`, x, y + 40, { width: sw });
    });
    y += 64;

    const font = fontById(spec.wordmark.font);
    doc.font("bold").fontSize(8).fillColor(GRAY).text("TYPEFACE", rx, y);
    doc.font("body").fontSize(10).fillColor(TEXT).text(font ? `${font.family} ${font.weight}` : spec.wordmark.font, rx, y + 13, { width: rw });
    doc.font("bold").fontSize(8).fillColor(GRAY).text("LAYOUT", rx, y + 34);
    doc.font("body").fontSize(10).fillColor(TEXT).text(`${spec.layout}${spec.mark.kind !== "none" ? ` · ${spec.mark.kind}${spec.mark.icon ? ` (${spec.mark.icon})` : ""}` : ""}`, rx, y + 47, { width: rw });
  });

  // ---------- credits ----------
  doc.addPage();
  doc.font("bold").fontSize(20).fillColor(TEXT).text("Notes", margin, margin);
  doc.moveDown(0.8);
  const notes = [
    "These are first concepts generated from the public repository. Check that a name and mark are free to use (trademark search) before adopting them.",
    "Every SVG is self-contained: text is converted to outlines, so no font files are needed. Each concept comes in a light-background, a dark-background and, where it has one, a symbol-only version.",
    "Icons: Lucide (ISC licence). Typefaces: Google Fonts via Fontsource (SIL Open Font License). Both allow use in logos.",
    `Designed by Stellar Logo Agent (${input.generator}).`,
  ];
  for (const note of notes) {
    doc.font("body").fontSize(11).fillColor(TEXT).text(`•  ${note}`, { width: 600, lineGap: 3 });
    doc.moveDown(0.6);
  }

  doc.end();
  return done;
}

// Minimal typings for svg-to-pdfkit, which ships none.
declare module "svg-to-pdfkit" {
  interface SvgToPdfOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    assumePt?: boolean;
  }
  export default function SVGtoPDF(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, options?: SvgToPdfOptions): void;
}

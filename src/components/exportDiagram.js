// The ESM build of jsPDF lazy-`import()`s canvg/dompurify/html2canvas for its
// .html() plugin. Those dynamic imports force rollup into multi-chunk output,
// which the Mendix widget bundler (single output.file) rejects. The UMD build is
// the same library without them — and we only ever need addImage/text/save.
import jsPDFModule from "jspdf/dist/jspdf.umd.min.js";

const JsPDF = jsPDFModule.jsPDF || jsPDFModule.default || jsPDFModule;

// bpmn-js emits an SVG sized in CSS pixels; PDF pages are measured in mm.
const PX_TO_MM = 25.4 / 96;

// The SVG is rasterised before it goes into the PDF. Drawing at 2× the on-screen
// size keeps node labels readable when the page is zoomed or printed.
const RASTER_SCALE = 2;

// getBBox() ignores filters, so the node drop-shadows sit outside the bbox that
// bpmn-js writes into the viewBox. A few px of padding stops them being clipped.
const SVG_PADDING = 12;

const A4_PORTRAIT  = { width: 210, height: 297 };
const A4_LANDSCAPE = { width: 297, height: 210 };
const PAGE_MARGIN  = 10;
const HEADER_RULE_Y = 25;   // horizontal rule under the title
const CONTENT_TOP   = 32;   // first mm the diagram may occupy

// ── Small helpers ────────────────────────────────────────────────────────────
export function sanitizeFileName(name) {
    const cleaned = String(name || "")
        .replace(/[\\/:*?"<>|]+/g, "")   // characters no OS accepts in a filename
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    return cleaned || "Library_Hierarchy";
}

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatToday() {
    return new Date().toLocaleString(undefined, {
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
    });
}

export function downloadBlob(blob, fileName) {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ── SVG acquisition / post-processing ────────────────────────────────────────

/**
 * Pull the SVG for whatever is currently visible on the canvas.
 *
 * Collapsed branches are hidden with inline `display: none`, which saveSVG
 * carries over and getBBox() excludes — so an export always matches what the
 * user sees. HTML overlays (the collapse toggles) are not part of the SVG
 * layer and are therefore never exported.
 */
export async function getDiagramSVG(modeler) {
    if (!modeler) throw new Error("The diagram is not ready yet.");

    const { svg } = await modeler.saveSVG();
    const size    = readSvgSize(svg);

    if (!size || !(size.width > 0) || !(size.height > 0)) {
        throw new Error("There is nothing on the canvas to export.");
    }

    // The external DTD reference is useless here and makes some SVG consumers
    // (and <img> decoding) noisier than it needs to be.
    return padSVG(svg.replace(/<!DOCTYPE[^>]*>\s*/i, ""), SVG_PADDING);
}

function readSvgSize(svg) {
    const openTag = svg.match(/<svg\b[^>]*>/i);
    if (!openTag) return null;

    const width  = parseFloat((openTag[0].match(/\swidth="([^"]+)"/i)  || [])[1]);
    const height = parseFloat((openTag[0].match(/\sheight="([^"]+)"/i) || [])[1]);
    if (!isFinite(width) || !isFinite(height)) return null;

    return { width, height };
}

/** Grow width/height/viewBox by `pad` px on every side. */
function padSVG(svg, pad) {
    const openTag = svg.match(/<svg\b[^>]*>/i);
    if (!openTag) return svg;

    const viewBox = (openTag[0].match(/\sviewBox="([^"]+)"/i) || [])[1];
    const size    = readSvgSize(svg);
    if (!viewBox || !size) return svg;

    const [x, y, w, h] = viewBox.trim().split(/[\s,]+/).map(Number);
    if ([x, y, w, h].some(n => !isFinite(n))) return svg;

    const patched = openTag[0]
        .replace(/\swidth="[^"]*"/i,   ` width="${size.width + pad * 2}"`)
        .replace(/\sheight="[^"]*"/i,  ` height="${size.height + pad * 2}"`)
        .replace(/\sviewBox="[^"]*"/i,
            ` viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"`);

    return svg.replace(openTag[0], patched);
}

/** Load an SVG string into a decoded <img>, resolved once it is safe to draw. */
function svgToImage(svg) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();

        img.onload = () => {
            const done = () => resolve({
                image:  img,
                width:  img.naturalWidth  || img.width,
                height: img.naturalHeight || img.height,
                release: () => URL.revokeObjectURL(url)
            });
            // decode() guarantees the bitmap is ready; older browsers just draw.
            if (img.decode) img.decode().then(done, done);
            else done();
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("The diagram image could not be rendered."));
        };

        img.src = url;
    });
}

/** Rasterise the diagram onto an opaque white canvas and return a PNG data URL. */
async function svgToPng(svg) {
    const { image, width, height, release } = await svgToImage(svg);
    try {
        const canvas  = document.createElement("canvas");
        canvas.width  = Math.max(1, Math.round(width  * RASTER_SCALE));
        canvas.height = Math.max(1, Math.round(height * RASTER_SCALE));

        const ctx = canvas.getContext("2d");
        // Without this the PNG is transparent, which renders as black in some
        // PDF viewers.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        return { dataUrl: canvas.toDataURL("image/png"), width, height };
    } finally {
        release();
    }
}

// ── Exporters ───────────────────────────────────────────────────────────────

export async function exportAsSVG(modeler, baseName) {
    const svg = await getDiagramSVG(modeler);
    downloadBlob(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
        `${sanitizeFileName(baseName)}.svg`
    );
}

export async function exportAsPDF(modeler, baseName, title) {
    const svg = await getDiagramSVG(modeler);
    const { dataUrl, width, height } = await svgToPng(svg);

    const page = width > height ? A4_LANDSCAPE : A4_PORTRAIT;
    const pdf  = new JsPDF({
        orientation: width > height ? "landscape" : "portrait",
        unit:        "mm",
        format:      "a4"
    });

    const heading = title || baseName || "Library Hierarchy";
    pdf.setProperties({ title: heading });

    // Header: title, generated-on stamp, rule.
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(heading, page.width / 2, 18, { align: "center", maxWidth: page.width - 2 * PAGE_MARGIN });

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120);
    pdf.text(formatToday(), page.width - PAGE_MARGIN, HEADER_RULE_Y - 3, { align: "right" });
    pdf.setTextColor(0);

    pdf.setDrawColor(200);
    pdf.line(PAGE_MARGIN, HEADER_RULE_Y, page.width - PAGE_MARGIN, HEADER_RULE_Y);

    // Fit the diagram into the area below the header, never upscaling it.
    const availWidth  = page.width  - 2 * PAGE_MARGIN;
    const availHeight = page.height - CONTENT_TOP - PAGE_MARGIN;
    const diagramWmm  = width  * PX_TO_MM;
    const diagramHmm  = height * PX_TO_MM;
    const ratio       = Math.min(availWidth / diagramWmm, availHeight / diagramHmm, 1);
    const finalWidth  = diagramWmm * ratio;
    const finalHeight = diagramHmm * ratio;

    pdf.addImage(
        dataUrl, "PNG",
        (page.width - finalWidth) / 2,
        CONTENT_TOP + (availHeight - finalHeight) / 2,
        finalWidth, finalHeight
    );

    pdf.save(`${sanitizeFileName(baseName)}.pdf`);
}

/**
 * Build a standalone HTML document around the diagram. The SVG is inlined, so
 * the file needs no companion assets and prints cleanly on its own.
 */
function buildHtmlDocument(svg, title) {
    const heading = escapeHtml(title || "Library Hierarchy");
    // Strip the XML prolog — inside HTML the SVG is parsed as HTML, not XML.
    const inlineSvg = svg.replace(/<\?xml[^>]*\?>\s*/i, "").trim();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #f4f6fa;
    color: #1a2744;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .lhw-export {
    max-width: 1400px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #e2e6ee;
    border-radius: 12px;
    padding: 20px 24px 28px;
  }
  .lhw-export-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid #e2e6ee;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .lhw-export-title { font-size: 18px; font-weight: 700; margin: 0; }
  .lhw-export-meta  { font-size: 12px; color: #6b7a99; white-space: nowrap; }
  .lhw-export-canvas { text-align: center; }
  .lhw-export-canvas svg { max-width: 100%; height: auto; }
  @media print {
    @page { size: auto; margin: 12mm; }
    body { background: #ffffff; padding: 0; }
    .lhw-export { border: 0; border-radius: 0; padding: 0; max-width: none; }
    .lhw-export-canvas svg { max-width: 100%; max-height: 100%; }
  }
</style>
</head>
<body>
<div class="lhw-export">
  <div class="lhw-export-header">
    <h1 class="lhw-export-title">${heading}</h1>
    <div class="lhw-export-meta">Generated ${escapeHtml(formatToday())}</div>
  </div>
  <div class="lhw-export-canvas">${inlineSvg}</div>
</div>
</body>
</html>`;
}

export async function exportAsHTML(modeler, baseName, title) {
    const svg = await getDiagramSVG(modeler);
    downloadBlob(
        new Blob([buildHtmlDocument(svg, title)], { type: "text/html;charset=utf-8" }),
        `${sanitizeFileName(baseName)}.html`
    );
}

/**
 * Print through an offscreen iframe rather than window.open, so popup blockers
 * never swallow it. Falls back to a new tab if the iframe cannot be printed.
 */
export async function printDiagram(modeler, title) {
    const svg  = await getDiagramSVG(modeler);
    const html = buildHtmlDocument(svg, title);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    // Kept on-screen-but-offset rather than hidden: a display:none or
    // visibility:hidden iframe prints blank in some browsers.
    iframe.style.cssText =
        "position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;";
    document.body.appendChild(iframe);

    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    // srcdoc (rather than document.write) means the load event below can only
    // fire once the diagram is actually in the iframe.
    let printed = false;
    iframe.onload = () => {
        if (printed) return;
        printed = true;

        const win = iframe.contentWindow;
        if (!win) { remove(); return; }

        try {
            win.addEventListener("afterprint", remove);
            win.focus();
            win.print();
            // Not every browser fires afterprint; clean up eventually regardless.
            setTimeout(remove, 60000);
        } catch (err) {
            remove();
            const tab = window.open("", "_blank");
            if (!tab) throw new Error("Printing was blocked by the browser.");
            tab.document.write(html);
            tab.document.close();
            tab.focus();
            tab.print();
        }
    };

    iframe.srcdoc = html;
}

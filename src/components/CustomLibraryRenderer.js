import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { attr as svgAttr, create as svgCreate, append as svgAppend } from "tiny-svg";
import { is } from "bpmn-js/lib/util/ModelUtil";

const HIGH_PRIORITY = 1500;

// ── Design tokens (Figma) ────────────────────────────────────────────────────
const ROOT_BG        = "#1e2d4a";   // dark navy — root node
const ROOT_DECOR     = "#2e3f5e";   // decorative circle on root
const ROOT_TITLE     = "#ffffff";
const ROOT_SUBTITLE  = "#8fa3bf";

const CHILD_BG       = "#ffffff";   // white — child library
const CHILD_BORDER   = "#2cb5b5";   // teal border
const CHILD_DECOR    = "#f5e6d0";   // warm cream decorative circle
const CHILD_TITLE    = "#1a2744";   // dark navy text
const CHILD_SUBTITLE = "#6b7a99";   // muted blue-grey

const NODE_RADIUS    = 10;
const NODE_SHADOW    = "rgba(30,45,74,0.18)";

// ── Helper: compute depth from incoming connections ──────────────────────────
function getDepth(element) {
    let depth = 0;
    let current = element;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const incoming = current.incoming || [];
        if (!incoming.length) break;
        const parentConn = incoming[0];
        current = parentConn && parentConn.source;
        depth++;
        if (depth > 20) break;
    }
    return depth;
}

class CustomLibraryRenderer extends BaseRenderer {
    constructor(eventBus, bpmnRenderer) {
        super(eventBus, HIGH_PRIORITY);
        this.bpmnRenderer = bpmnRenderer;
    }

    canRender(element) {
        return (
            is(element, "bpmn:SubProcess") &&
            element.businessObject.get &&
            element.businessObject.get("library:libraryName")
        );
    }

    drawShape(parentNode, element) {
        const { width, height } = element;
        const bo          = element.businessObject;
        const libraryName = bo.get("library:libraryName") || bo.name || "";
        const libraryId   = bo.get("library:libraryId")   || "";
        const isRoot      = libraryId === "root";
        const depth       = isRoot ? 0 : getDepth(element);

        // 1. Render base shape then hide it (bpmn-js internals need it)
        const baseShape = this.bpmnRenderer.drawShape(parentNode, element);
        svgAttr(baseShape, { stroke: "none", fill: "none", "stroke-width": 0 });

        // 2. Drop-shadow filter
        const filterId = `lib-shadow-${element.id}`;
        const defsF = svgCreate("defs");
        defsF.innerHTML = `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="${NODE_SHADOW}" />
        </filter>`;
        svgAppend(parentNode, defsF);

        // 3. Clip path (rounded rect) — keeps decorative circle inside card
        const clipId = `lib-clip-${element.id}`;
        const defsC = svgCreate("defs");
        defsC.innerHTML = `<clipPath id="${clipId}">
            <rect x="0" y="0" width="${width}" height="${height}"
                  rx="${NODE_RADIUS}" ry="${NODE_RADIUS}" />
        </clipPath>`;
        svgAppend(parentNode, defsC);

        // 4. Card background
        const card = svgCreate("rect");
        svgAttr(card, {
            x: 0, y: 0, width, height,
            rx: NODE_RADIUS, ry: NODE_RADIUS,
            fill:           isRoot ? ROOT_BG   : CHILD_BG,
            stroke:         isRoot ? "none"    : CHILD_BORDER,
            "stroke-width": isRoot ? 0         : 2,
            filter:         `url(#${filterId})`
        });
        svgAppend(parentNode, card);

        // 5. Decorative circle — top-right corner, clipped
        const cR = Math.round(height * 0.52);
        const circ = svgCreate("circle");
        svgAttr(circ, {
            cx: width - 4, cy: 4, r: cR,
            fill:        isRoot ? ROOT_DECOR : CHILD_DECOR,
            opacity:     isRoot ? 0.7        : 0.9,
            "clip-path": `url(#${clipId})`
        });
        svgAppend(parentNode, circ);

        // 6. Title text
        const titleEl = svgCreate("text");
        svgAttr(titleEl, {
            x: 16, y: height / 2 - 5,
            fill:                isRoot ? ROOT_TITLE  : CHILD_TITLE,
            "font-size":         "13px",
            "font-weight":       "700",
            "font-family":       "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
            "dominant-baseline": "auto",
            "pointer-events":    "none"
        });
        const maxChars = Math.floor((width - 44) / 7.5);
        titleEl.textContent = libraryName.length > maxChars
            ? libraryName.slice(0, maxChars - 1) + "…"
            : libraryName;
        svgAppend(parentNode, titleEl);

        // 7. Subtitle text
        const subEl = svgCreate("text");
        svgAttr(subEl, {
            x: 16, y: height / 2 + 13,
            fill:                isRoot ? ROOT_SUBTITLE : CHILD_SUBTITLE,
            "font-size":         "11px",
            "font-weight":       "400",
            "font-family":       "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
            "dominant-baseline": "auto",
            "pointer-events":    "none"
        });
        subEl.textContent = isRoot ? "Framework Root" : "Library";
        svgAppend(parentNode, subEl);

        return baseShape;
    }
    // No drawConnection / canRenderConnection — bpmn-js default arrows are used as-is
}

CustomLibraryRenderer.$inject = ["eventBus", "bpmnRenderer"];

export default {
    __init__: ["customLibraryRenderer"],
    customLibraryRenderer: ["type", CustomLibraryRenderer]
};
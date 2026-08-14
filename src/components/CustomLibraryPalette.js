import { createLibraryShape } from "./createLibraryShape";

class CustomLibraryPalette {
    constructor(bpmnFactory, create, elementFactory, elementRegistry, palette, translate, handTool, lassoTool, spaceTool, globalConnect) {
        this.bpmnFactory    = bpmnFactory;
        this.create         = create;
        this.elementFactory = elementFactory;
        this.elementRegistry= elementRegistry;
        this.translate      = translate;
        this.handTool       = handTool;
        this.lassoTool      = lassoTool;
        this.spaceTool      = spaceTool;
        this.globalConnect  = globalConnect;

        palette.registerProvider(this);
    }

    getPaletteEntries() {
        const { bpmnFactory, create, elementFactory, elementRegistry, handTool, lassoTool, spaceTool, globalConnect } = this;

        function createLibrary() {
            return function(event) {
                create.start(event, createLibraryShape(bpmnFactory, elementFactory, elementRegistry));
            };
        }

        return {
            // ── Navigation tools ──────────────────────────────────────────
            "hand-tool": {
                group:     "tools",
                className: "bpmn-icon-hand-tool",
                title:     "Move",
                action: {
                    click(event) { handTool.activateHand(event); }
                }
            },
            "lasso-tool": {
                group:     "tools",
                className: "bpmn-icon-lasso-tool",
                title:     "Lasso",
                action: {
                    click(event) { lassoTool.activateSelection(event); }
                }
            },
            "space-tool": {
                group:     "tools",
                className: "bpmn-icon-space-tool",
                title:     "Space",
                action: {
                    click(event) { spaceTool.activateSelection(event); }
                }
            },
            "global-connect-tool": {
                group:     "tools",
                className: "bpmn-icon-connection-multi",
                title:     "Connect",
                action: {
                    click(event) { globalConnect.start(event); }
                }
            },

            // ── Separator ─────────────────────────────────────────────────
            "tool-separator": {
                group:     "tools",
                separator: true
            },

            // ── Create library ────────────────────────────────────────────
            "create.library": {
                group:     "library",
                className: "bpmn-icon-task",
                title:     "Add Library",
                action: {
                    dragstart: createLibrary(),
                    click:     createLibrary()
                }
            }
        };
    }
}

CustomLibraryPalette.$inject = [
    "bpmnFactory",
    "create",
    "elementFactory",
    "elementRegistry",
    "palette",
    "translate",
    "handTool",
    "lassoTool",
    "spaceTool",
    "globalConnect"
];

export default {
    __init__: ["customLibraryPalette"],
    customLibraryPalette: ["type", CustomLibraryPalette]
};
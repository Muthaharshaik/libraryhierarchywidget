class CustomLibraryPalette {
    constructor(bpmnFactory, create, elementFactory, palette, translate, handTool, lassoTool, spaceTool, globalConnect) {
        this.bpmnFactory    = bpmnFactory;
        this.create         = create;
        this.elementFactory = elementFactory;
        this.translate      = translate;
        this.handTool       = handTool;
        this.lassoTool      = lassoTool;
        this.spaceTool      = spaceTool;
        this.globalConnect  = globalConnect;

        palette.registerProvider(this);
    }

    getPaletteEntries() {
        const { bpmnFactory, create, elementFactory, handTool, lassoTool, spaceTool, globalConnect } = this;

        function createLibrary() {
            return function(event) {
                const businessObject = bpmnFactory.create("bpmn:SubProcess", {
                    name: "New Library"
                });
                businessObject.set("library:libraryName", "New Library");
                businessObject.set("library:libraryId",   `lib_${Date.now()}`);

                const shape = elementFactory.createShape({
                    type: "bpmn:SubProcess",
                    businessObject,
                    width:  260,
                    height: 60
                });
                create.start(event, shape);
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
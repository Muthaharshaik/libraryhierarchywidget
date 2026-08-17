import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";

/**
 * Read-only guard for the library hierarchy.
 *
 * Only registered when the widget is read-only (explicit readOnly flag or the
 * framework locked by another user), so every editing gesture can be vetoed
 * unconditionally. Navigation stays untouched: panning the diagram, zooming,
 * selecting a node, the collapse toggles and "go to library" keep working.
 */

// Above the modelling rules in CustomLibraryRules, so a "no" always wins.
const PRIORITY = 5000;

// Rules diagram-js consults before it lets an element be moved, resized,
// connected, deleted or created. Returning false here cancels the gesture at
// its start — the node never ghosts across the canvas.
const BLOCKED_RULES = [
    "elements.move",
    "elements.create",
    "elements.delete",
    "elements.align",
    "elements.distribute",
    "element.copy",
    "shape.create",
    "shape.attach",
    "shape.resize",
    "shape.replace",
    "connection.start",
    "connection.create",
    "connection.reconnect",
    "connection.updateWaypoints"
];

// Drag gestures that edit the diagram. Cancelled on start for the few features
// that act without asking the rules first (connector segments, space tool).
// "hand" and "lasso" are deliberately absent — panning and selecting are
// useful while read-only.
const BLOCKED_DRAGS = [
    "shape.move.start",
    "resize.start",
    "create.start",
    "connect.start",
    "global-connect.start",
    "bendpoint.move.start",
    "connectionSegment.move.start",
    "spaceTool.start",
    "spaceTool.selection.start"
];

class CustomLibraryReadOnly extends RuleProvider {
    constructor(eventBus) {
        super(eventBus);
        eventBus.on(BLOCKED_DRAGS, PRIORITY, () => false);
    }

    init() {
        this.addRule(BLOCKED_RULES, PRIORITY, () => false);
    }
}

CustomLibraryReadOnly.$inject = ["eventBus"];

export default {
    __init__: ["customLibraryReadOnly"],
    customLibraryReadOnly: ["type", CustomLibraryReadOnly]
};

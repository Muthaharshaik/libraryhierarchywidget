import { is } from "bpmn-js/lib/util/ModelUtil";

/**
 * Top-down placement for libraries appended from the context pad.
 *
 * diagram-js' AutoPlace (priority 100) and bpmn-js' BpmnAutoPlace (priority
 * 1000) both drop the new shape to the *right* of its source. A library
 * hierarchy reads top-down — children sit under their parent, siblings spread
 * sideways — so this provider answers first and the others never run.
 */
const HIGH_PRIORITY = 1500;

const V_GAP = 80;   // vertical gap between levels — matches the importer
const H_GAP = 60;   // horizontal gap between siblings — matches the importer
const PAD   = 20;   // breathing room when testing a slot for overlap

function getDirectChildren(element) {
    return (element.outgoing || [])
        .filter(conn => conn.type === "bpmn:SequenceFlow")
        .map(conn => conn.target)
        .filter(Boolean);
}

// Connections have waypoints instead of bounds; the root has neither a parent
// nor coordinates. Neither can collide with anything.
function isPlacedShape(element) {
    return !!element &&
        !element.waypoints &&
        element.type !== "label" &&
        !!element.parent &&
        typeof element.x === "number";
}

function overlaps(a, b) {
    return a.x < b.x + b.width  + PAD &&
           a.x + a.width  + PAD > b.x &&
           a.y < b.y + b.height + PAD &&
           a.y + a.height + PAD > b.y;
}

function placeBelow(source, shape, elementRegistry) {
    const siblings = getDirectChildren(source).filter(isPlacedShape);

    // First child: centred under the parent. Later children: join the row the
    // existing siblings already form, to the right of the last one.
    let x = source.x + (source.width - shape.width) / 2;
    let y = source.y + source.height + V_GAP;

    if (siblings.length) {
        x = Math.max(...siblings.map(s => s.x + s.width)) + H_GAP;
        y = Math.min(...siblings.map(s => s.y));
    }

    const others = elementRegistry.getAll()
        .filter(el => isPlacedShape(el) && el !== source && el !== shape);

    // Slide right until the slot is free. The canvas is unbounded, so a gap
    // always turns up; the guard is only there to rule out a runaway loop.
    const bounds = { x, y, width: shape.width, height: shape.height };
    for (let guard = 0; guard < 200 && others.some(o => overlaps(bounds, o)); guard++) {
        bounds.x += shape.width + H_GAP;
    }

    // AutoPlace expects the centre of the new shape.
    return {
        x: bounds.x + shape.width  / 2,
        y: bounds.y + shape.height / 2
    };
}

class CustomLibraryAutoPlace {
    constructor(eventBus, elementRegistry) {
        eventBus.on("autoPlace", HIGH_PRIORITY, (context) => {
            const { shape, source } = context;

            // Returning undefined hands the decision back to the default
            // providers — anything that is not a library keeps BPMN behaviour.
            if (!is(source, "bpmn:SubProcess") || !is(shape, "bpmn:SubProcess")) {
                return;
            }

            return placeBelow(source, shape, elementRegistry);
        });
    }
}

CustomLibraryAutoPlace.$inject = ["eventBus", "elementRegistry"];

export default {
    __init__: ["customLibraryAutoPlace"],
    customLibraryAutoPlace: ["type", CustomLibraryAutoPlace]
};

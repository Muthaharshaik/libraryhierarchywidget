/**
 * Builds a library node (a bpmn:SubProcess carrying the library: attributes).
 *
 * Shared by the palette and the context pad so a library dragged in from the
 * left panel and one appended straight off a node are byte-for-byte identical
 * in the saved XML.
 */
export const NODE_WIDTH  = 260;
export const NODE_HEIGHT = 60;

const DEFAULT_NAME = "New Library";

/**
 * Timestamp ids collide when two nodes are created inside the same millisecond
 * (append-then-append, or an automated flow), so the registry gets a look-in.
 */
function nextLibraryId(elementRegistry) {
    const base = `lib_${Date.now()}`;
    if (!elementRegistry) return base;

    const taken = new Set();
    elementRegistry.getAll().forEach(el => {
        const libraryId = el.businessObject?.get?.("library:libraryId");
        if (libraryId) taken.add(libraryId);
    });

    if (!taken.has(base)) return base;

    let suffix = 2;
    while (taken.has(`${base}_${suffix}`)) suffix++;
    return `${base}_${suffix}`;
}

export function createLibraryShape(bpmnFactory, elementFactory, elementRegistry) {
    const businessObject = bpmnFactory.create("bpmn:SubProcess", {
        name: DEFAULT_NAME
    });
    businessObject.set("library:libraryName", DEFAULT_NAME);
    businessObject.set("library:libraryId",   nextLibraryId(elementRegistry));

    return elementFactory.createShape({
        type: "bpmn:SubProcess",
        businessObject,
        width:  NODE_WIDTH,
        height: NODE_HEIGHT
    });
}

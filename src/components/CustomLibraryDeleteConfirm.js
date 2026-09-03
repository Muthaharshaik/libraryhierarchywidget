import { is } from "bpmn-js/lib/util/ModelUtil";

/**
 * Confirmation gate for deleting library nodes.
 *
 * Removing a library that already lives in the framework also takes its
 * processes and process maps with it, so that delete has to be confirmed.
 * A library drawn in this editing session exists only in the undo stack —
 * nothing is attached to it yet — so it is removed straight away.
 *
 * Every delete gesture (our context pad entry, the bpmn-js one, the Delete
 * key, cut) ends up in modeling.removeElements, so that single method is
 * wrapped rather than each of the entry points. When confirmation is needed
 * the call is parked and `library.confirm-delete` is fired for the React
 * widget to show the dialog; confirm() replays the parked call, cancel()
 * drops it. Nothing reaches the command stack until then, so cancelling
 * leaves undo/redo exactly as it was.
 */
class CustomLibraryDeleteConfirm {
    constructor(eventBus, modeling, elementRegistry) {
        this._eventBus        = eventBus;
        this._modeling        = modeling;
        this._elementRegistry = elementRegistry;

        // library:libraryId values known to exist in the framework. Refreshed by
        // the widget after every load from Mendix and after every save.
        this._savedLibraryIds = new Set();

        // Elements waiting on the user's answer, or null.
        this._pending = null;

        const removeElements = modeling.removeElements.bind(modeling);
        this._removeElements = removeElements;

        modeling.removeElements = (elements) => {
            const saved = this._savedLibraries(elements);

            if (!saved.length) {
                removeElements(elements);
                return;
            }

            // A dialog is already up for an earlier gesture — let the user answer
            // that one instead of silently replacing it.
            if (this._pending) return;

            this._pending = elements.slice();

            eventBus.fire("library.confirm-delete", {
                libraryNames: saved.map(el =>
                    el.businessObject.get("library:libraryName") ||
                    el.businessObject.name ||
                    "this library"
                )
            });
        };

        eventBus.on("diagram.destroy", () => {
            delete modeling.removeElements;   // back to the prototype method
            this._pending = null;
        });
    }

    /**
     * Marks every library currently on the canvas as stored in the framework.
     * Called after a load from Mendix and after a successful save — from then
     * on, deleting one of them asks first.
     */
    markCanvasAsSaved() {
        const saved = new Set();
        this._elementRegistry.getAll().forEach(element => {
            const libraryId = this._libraryId(element);
            if (libraryId) saved.add(libraryId);
        });
        this._savedLibraryIds = saved;
    }

    hasPending() {
        return this._pending !== null;
    }

    /** User pressed Delete in the dialog. */
    confirm() {
        const pending = this._pending;
        this._pending = null;
        if (!pending) return;

        // A pending delete survives the dialog being open, during which the
        // canvas may have changed (undo, a fresh import) — only remove what is
        // still there.
        const elements = pending.filter(el => this._elementRegistry.get(el.id));
        if (elements.length) this._removeElements(elements);
    }

    /** User dismissed the dialog. */
    cancel() {
        this._pending = null;
    }

    _libraryId(element) {
        if (!is(element, "bpmn:SubProcess")) return null;
        return element.businessObject?.get?.("library:libraryId") || null;
    }

    _savedLibraries(elements) {
        return (elements || []).filter(element => {
            const libraryId = this._libraryId(element);
            return libraryId && this._savedLibraryIds.has(libraryId);
        });
    }
}

CustomLibraryDeleteConfirm.$inject = ["eventBus", "modeling", "elementRegistry"];

export default {
    __init__: ["customLibraryDeleteConfirm"],
    customLibraryDeleteConfirm: ["type", CustomLibraryDeleteConfirm]
};

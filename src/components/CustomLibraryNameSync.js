import { is } from "bpmn-js/lib/util/ModelUtil";

/**
 * Keeps library:libraryName in sync with the element's name.
 *
 * Direct editing (double-click rename) updates only businessObject.name, which
 * would leave library:libraryName holding the name the node had when it was
 * created. The widget itself only checks library:libraryName for existence, but
 * the saved XML is read outside the widget, so both must agree.
 */
class CustomLibraryNameSync {
    constructor(eventBus, modeling) {
        // postExecute (not postExecuted) so the follow-up update joins the same
        // command-stack entry — one undo reverts the rename completely.
        eventBus.on(
            [
                "commandStack.element.updateLabel.postExecute",
                "commandStack.element.updateProperties.postExecute"
            ],
            (event) => {
                const element = event.context.element;
                if (!element || !is(element, "bpmn:SubProcess")) return;

                const bo = element.businessObject;
                if (!bo.get || !bo.get("library:libraryId")) return;

                const name = bo.name || "";

                // Also the recursion guard: the nested updateProperties below
                // re-enters this handler, and by then the two already match.
                if (bo.get("library:libraryName") === name) return;

                modeling.updateProperties(element, {
                    "library:libraryName": name
                });
            }
        );
    }
}

CustomLibraryNameSync.$inject = ["eventBus", "modeling"];

export default {
    __init__: ["customLibraryNameSync"],
    customLibraryNameSync: ["type", CustomLibraryNameSync]
};

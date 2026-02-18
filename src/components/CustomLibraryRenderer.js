import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { attr as svgAttr } from "tiny-svg";
import { is } from "bpmn-js/lib/util/ModelUtil";

const HIGH_PRIORITY = 1500;

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
        const shape = this.bpmnRenderer.drawShape(parentNode, element);

        if (
            is(element, "bpmn:SubProcess") &&
            element.businessObject.get("library:libraryName")
        ) {
            svgAttr(shape, {
                stroke: "#4A90E2",
                strokeWidth: 2,
                fill: "#E8F4FF"
            });
        }

        return shape;
    }
}

CustomLibraryRenderer.$inject = ["eventBus", "bpmnRenderer"];

export default {
    __init__: ["customLibraryRenderer"],
    customLibraryRenderer: ["type", CustomLibraryRenderer]
};

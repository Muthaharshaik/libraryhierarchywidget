import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import {
    append as svgAppend,
    attr as svgAttr,
    create as svgCreate
} from "tiny-svg";
import { is } from "bpmn-js/lib/util/ModelUtil";

const HIGH_PRIORITY = 1500;

/**
 * Custom Renderer for Library elements
 * Renders libraries with a book icon and custom styling
 */
class CustomLibraryRenderer extends BaseRenderer {
    constructor(eventBus, bpmnRenderer) {
        super(eventBus, HIGH_PRIORITY);
        this.bpmnRenderer = bpmnRenderer;
    }

    canRender(element) {
        // Render SubProcesses that have library attributes
        return is(element, "bpmn:SubProcess") && 
               element.businessObject.get &&
               element.businessObject.get("library:libraryName");
    }

    drawShape(parentNode, element) {
        // First, let the default renderer draw the shape
        const shape = this.bpmnRenderer.drawShape(parentNode, element);
        
        if (is(element, 'bpmn:SubProcess') && element.businessObject.get('library:libraryName')) {
            // Prevent drill-down (disable double-click navigation)
            element.collapsed = undefined;
            
            // Style the shape with library-specific colors
            svgAttr(shape, {
                stroke: "#4A90E2",
                strokeWidth: 2,
                fill: "#E8F4FF"
            });

            // Remove markers after a short delay to ensure they're rendered first
            setTimeout(() => {
                this.removeSubProcessMarkers(parentNode);
            }, 10);
        }

        return shape;
    }

    // Add this NEW method right after drawShape
    removeSubProcessMarkers(parentNode) {
        // Find and remove all marker elements
        const markers = parentNode.querySelectorAll('[data-marker]');
        markers.forEach(m => m.remove());
        
        // Find the visual group
        const visualGroup = parentNode.querySelector('.djs-visual');
        if (visualGroup) {
            // Remove any rect that's 14x14 (that's the plus icon background)
            const rects = visualGroup.querySelectorAll('rect[width="14"][height="14"]');
            rects.forEach(r => r.remove());
            
            // Remove any path with the plus icon pattern
            const paths = visualGroup.querySelectorAll('path');
            paths.forEach(path => {
                const d = path.getAttribute('d');
                if (d && (d.includes('M122') || d.includes('M 122'))) {
                    path.remove();
                }
            });
        }
    }
    getShapePath(shape) {
        if (is(shape, 'bpmn:SubProcess') && shape.businessObject.get('library:libraryName')) {
            // Return sharp rectangle path (relative coordinates)
            const width = shape.width;
            const height = shape.height;
            
            return [
                ['M', 0, 0],           // Move to top-left
                ['l', width, 0],       // Line to top-right
                ['l', 0, height],      // Line to bottom-right
                ['l', -width, 0],      // Line to bottom-left
                ['z']                  // Close path back to start
            ];
        }
        
        return this.bpmnRenderer.getShapePath(shape);
    }
}

CustomLibraryRenderer.$inject = ["eventBus", "bpmnRenderer"];

// Export as module
export default {
    __init__: ["customLibraryRenderer"],
    customLibraryRenderer: ["type", CustomLibraryRenderer]
};
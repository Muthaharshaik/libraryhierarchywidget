import { is } from 'bpmn-js/lib/util/ModelUtil';
import { createLibraryShape } from './createLibraryShape';

class CustomLibraryContextPad {
    constructor(contextPad, modeling, connect, eventBus, commandStack,
                bpmnFactory, elementFactory, elementRegistry, autoPlace, create) {
        this.modeling       = modeling;
        this.connect        = connect;
        this.eventBus       = eventBus;
        this.commandStack   = commandStack; // ⭐ Store it
        this.bpmnFactory    = bpmnFactory;
        this.elementFactory = elementFactory;
        this.elementRegistry= elementRegistry;
        this.autoPlace      = autoPlace;
        this.create         = create;

        contextPad.registerProvider(1100, this);
    }

    getContextPadEntries(element) {
        const { modeling, connect, eventBus, commandStack,           // ⭐ Destructure from this
                bpmnFactory, elementFactory, elementRegistry, autoPlace, create } = this;

        if (!is(element, 'bpmn:SubProcess') ||
            !element.businessObject.get('library:libraryName')) {
            return {};
        }

        const widgetContainer = document.querySelector('.library-hierarchy-widget');
        const isLocked = widgetContainer?.getAttribute('data-locked') === 'true';

        // A collapsed parent hides its whole subtree, and that state lives in the
        // React widget — ask it to expand so the new child does not land in a
        // hidden row.
        function ensureExpanded(element) {
            eventBus.fire('library.ensure-expanded', { elementId: element.id });
        }

        function newLibrary() {
            return createLibraryShape(bpmnFactory, elementFactory, elementRegistry);
        }

        if (!isLocked) {
            return {
                // Child library straight off the node: click drops it in place,
                // dragging lets you pick the spot. Either way the parent link is
                // created for you — no palette drag plus manual connect.
                'append-library': {
                    group: 'model',
                    className: 'custom-append-library-icon',
                    title: 'Add library',
                    action: {
                        click: function(event, element) {
                            ensureExpanded(element);
                            autoPlace.append(element, newLibrary());
                        },
                        dragstart: function(event, element) {
                            ensureExpanded(element);
                            create.start(event, newLibrary(), { source: element });
                        }
                    }
                },
                'connect': {
                    group: 'connect',
                    className: 'bpmn-icon-connection-multi',
                    title: 'Connect',
                    action: {
                        click: function(event, element) {
                            connect.start(event, element);
                        }
                    }
                },
                'delete': {
                    group: 'edit',
                    className: 'bpmn-icon-trash',
                    title: 'Remove',
                    action: {
                        click: function(event, element) {
                            modeling.removeElements([element]);
                        }
                    }
                },
                'open-library': {
                    group: 'edit',
                    className: 'custom-open-library-icon',
                    title: 'Go to Library',
                    action: {
                        click: function(event, element) {
                            // ⭐ Now commandStack is available
                            const isDirty = commandStack.canUndo();

                            if (isDirty) {
                                eventBus.fire('library.unsaved-warning');
                                return;
                            }

                            const libraryId = element.businessObject.get('library:libraryId');
                            if (libraryId) {
                                eventBus.fire('library.open', {
                                    libraryId: libraryId
                                });
                            }
                        }
                    }
                }
            };
        }

        return {};
    }
}

CustomLibraryContextPad.$inject = [
    'contextPad',
    'modeling',
    'connect',
    'eventBus',
    'commandStack',
    'bpmnFactory',
    'elementFactory',
    'elementRegistry',
    'autoPlace',
    'create'
];

export default {
    __init__: ['customLibraryContextPad'],
    customLibraryContextPad: ['type', CustomLibraryContextPad]
};

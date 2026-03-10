import { is } from 'bpmn-js/lib/util/ModelUtil';

class CustomLibraryContextPad {
    constructor(contextPad, modeling, connect, eventBus, commandStack) {
        this.modeling = modeling;
        this.connect = connect;
        this.eventBus = eventBus;
        this.commandStack = commandStack; // ⭐ Store it
        
        contextPad.registerProvider(1100, this);
    }

    getContextPadEntries(element) {
        const { modeling, connect, eventBus, commandStack } = this; // ⭐ Destructure from this

        if (!is(element, 'bpmn:SubProcess') || 
            !element.businessObject.get('library:libraryName')) {
            return {};
        }

        const widgetContainer = document.querySelector('.library-hierarchy-widget');
        const isLocked = widgetContainer?.getAttribute('data-locked') === 'true';

        if (!isLocked) {
            return {
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

CustomLibraryContextPad.$inject = ['contextPad', 'modeling', 'connect', 'eventBus', 'commandStack'];

export default {
    __init__: ['customLibraryContextPad'],
    customLibraryContextPad: ['type', CustomLibraryContextPad]
};

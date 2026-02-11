/**
 * Custom BPMN Moddle Extension for Library elements
 * This defines the custom attributes for libraries
 */
export const libraryModdle = {
    name: "library",
    uri: "http://lowcodelabs/schema/library",
    prefix: "library",
    types: [
        {
            name: "Library",
            extends: ["bpmn:SubProcess"],
            properties: [
                {
                    name: "libraryId",
                    type: "String",
                    isAttr: true
                },
                {
                    name: "libraryName",
                    type: "String",
                    isAttr: true
                },
                {
                    name: "frameworkId",
                    type: "String",
                    isAttr: true
                },
                {
                    name: "description",
                    type: "String",
                    isAttr: true
                }
            ]
        }
    ]
};
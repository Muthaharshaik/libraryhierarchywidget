/**
 * Custom BPMN Moddle Extension for Library elements
 * This defines the custom attributes for libraries
 */
export const libraryModdle = {
    name: "library",
    uri: "http://lowcodelabs/schema/library",
    prefix: "library",
    // Required, even though this package serialises no elements of its own.
    // moddle-xml picks the element tag name from the *owning package* of a type's
    // descriptor, and `extends: ["bpmn:SubProcess"]` below re-homes that descriptor
    // from the bpmn package onto this one. Without the alias, SubProcess loses the
    // lower-case first letter and every export writes <bpmn:SubProcess> instead of
    // the spec's <bpmn:subProcess>. Attribute names are unaffected either way.
    xml: {
        tagAlias: "lowerCase"
    },
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

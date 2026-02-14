import { createElement, useEffect, useRef, useCallback} from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import "./ui/LibraryHierarchyWidget.css";
import downloadIcon from "./assets/download-svgrepo-com.svg"
import saveIcon from "./assets/save-svgrepo-com.svg"
import undoIcon from "./assets/undo-svgrepo-com.svg"
import redoIcon from "./assets/redo-svgrepo-com.svg"
import dotsIcon from "./assets/three-dots-svgrepo-com.svg"
import sendIcon from "./assets/send-2-svgrepo-com.svg"

export function LibraryHierarchyWidget(props) {
    const {
        libraryXML,
        frameworkName,
        onLibraryClick,
        onSaveXML,
        readOnly
    } = props;

    const containerRef = useRef(null);
    const modelerRef = useRef(null);
    const lastImportedXmlRef = useRef(null);

    const generateDefaultXML = (name) => {
        const frameworkNameValue = name || "Framework Root";
        return `<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                    xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
                    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                    xmlns:library="http://lowcodelabs/schema/library"
                    id="Definitions_1" 
                    targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:subProcess id="SubProcess_Root" name="${frameworkNameValue}" library:libraryId="root" library:libraryName="${frameworkNameValue}">
    </bpmn:subProcess>
    </bpmn:process>
    <bpmndi:BPMNDiagram id="BPMNDiagram_1">
        <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="SubProcess_Root_di" bpmnElement="SubProcess_Root">
            <dc:Bounds x="200" y="100" width="260" height="60"/>
        </bpmndi:BPMNShape>
        </bpmndi:BPMNPlane>
    </bpmndi:BPMNDiagram>
    </bpmn:definitions>`;
    };

    /**
     * Initialize the BPMN Modeler with custom modules
     */
    useEffect(() => {
        if (!containerRef.current) return;

        // Destroy existing modeler if any
        if (modelerRef.current) {
            modelerRef.current.destroy();
            modelerRef.current = null;
        }

        const modeler = new BpmnModeler({
            container: containerRef.current,
            additionalModules: [
                require("./components/CustomPaletteProvider"), 
                require("./components/CustomLibraryPalette"),
                require("./components/CustomLibraryRenderer"),
                require("./components/CustomLibraryRules"),
                require("./components/CustomLibraryContextPad")
            ],
            moddleExtensions: {
                library: require("./components/libraryModdle").libraryModdle
            }
        });

        modelerRef.current = modeler;
        

        // Import initial XML
        const xmlToLoad = libraryXML?.value || generateDefaultXML(frameworkName?.value);
        lastImportedXmlRef.current = xmlToLoad;

        modeler
            .importXML(xmlToLoad)
            .then(({ warnings }) => {
                if (warnings.length) {
                    console.warn("BPMN Import Warnings:", warnings);
                }

                const canvas = modeler.get("canvas");
                canvas.zoom("fit-viewport");

                // Set up event listeners
                const eventBus = modeler.get("eventBus");
                
                // Listen for element clicks (library selection)
                eventBus.on("element.click", (event) => {
                    const { element } = event;
                    if (element.type === "bpmn:SubProcess" && element.businessObject.get("library:libraryId")) {
                        const libraryId = element.businessObject.get("library:libraryId");
                        if (onLibraryClick && onLibraryClick.canExecute) {
                            onLibraryClick.execute();
                        }
                    }
                });

                // Listen for changes to auto-save
                if (onSaveXML && onSaveXML.canExecute && !readOnly) {
                    eventBus.on("commandStack.changed", () => {
                        exportAndSaveXML();
                    });
                }
            })
            .catch(err => {
                console.error("Error importing BPMN diagram:", err);
            });

        // Cleanup on unmount
        return () => {
            if (modelerRef.current) {
                modelerRef.current.destroy();
            }
        };
    }, []); // Run once on mount

    /**
     * Update root library name when frameworkName changes
     */
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!frameworkName?.value) return;
        if (libraryXML?.value) return; // Don't override if XML already exists

        // Update the root library name
        const elementRegistry = modelerRef.current.get('elementRegistry');
        const modeling = modelerRef.current.get('modeling');
        const rootElement = elementRegistry.get('SubProcess_Root');
        
        if (rootElement) {
            modeling.updateProperties(rootElement, {
                name: frameworkName.value,
                'library:libraryName': frameworkName.value
            });
        }
    }, [frameworkName?.value, libraryXML?.value]);

    /**
     * Handle XML updates from Mendix
     */
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!libraryXML?.value) return;

        // Skip if XML hasn't changed
        if (libraryXML.value === lastImportedXmlRef.current) {
            return;
        }

        console.log("Importing new library hierarchy XML");
        lastImportedXmlRef.current = libraryXML.value;

        modelerRef.current
            .importXML(libraryXML.value)
            .then(() => {
                const canvas = modelerRef.current.get("canvas");
                canvas.zoom("fit-viewport");
            })
            .catch(err => {
                console.error("Error updating BPMN diagram:", err);
            });
    }, [libraryXML?.value]);

    /**
     * Validate diagram before saving
     */
    const validateDiagram = useCallback(() => {
        if (!modelerRef.current) return { valid: true, errors: [] };

        const elementRegistry = modelerRef.current.get('elementRegistry');
        const errors = [];
        
        // Get all elements
        const allElements = elementRegistry.getAll();
        
        // Check each library for multiple parents
        allElements.forEach(element => {
            if (element.type === 'bpmn:SubProcess' && 
                element.businessObject.get('library:libraryId')) {
                
                const incomingCount = element.incoming ? element.incoming.length : 0;
                
                if (incomingCount > 1) {
                    errors.push( "A library must not have more than one parent library.");
                }
            }
        });
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }, []);


    /**
     * Export current diagram as XML and save to Mendix
     */
    const exportAndSaveXML = useCallback(() => {
        if (!modelerRef.current || !onSaveXML || !onSaveXML.canExecute) return;

        // Validate before saving
        const validation = validateDiagram();
        
        if (!validation.valid) {
            // Show error message
            showValidationError(validation.errors);
            return;
        }

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                libraryXML?.setValue(xml);
                onSaveXML.execute();
            })
            .catch(err => {
                console.error("Error exporting BPMN XML:", err);
            });
    }, [libraryXML, onSaveXML, validateDiagram]);


    /**
     * Show validation errors
     */
    const showValidationError = useCallback((errors) => {
        if (!containerRef.current) return;
        
        // Remove existing error messages
        const existingErrors = containerRef.current.querySelectorAll('.validation-error-overlay');
        existingErrors.forEach(error => error.remove());
        
        // Create error overlay
        const overlay = document.createElement('div');
        overlay.className = 'validation-error-overlay';
        
        const errorHeader = document.createElement('div');
        errorHeader.className = 'validation-error-header';
        errorHeader.innerHTML = `
                <span class="icon">⚠️</span>
                <span>Alert</span>
        `;
        
        const errorContent = document.createElement('div');
        errorContent.className = 'validation-error-content';
        errors.forEach(error => {
            const errorLine = document.createElement('div');
            errorLine.textContent = error;
            errorLine.style.marginBottom = '8px';
            errorContent.appendChild(errorLine);
        });
        
        const closeButton = document.createElement('button');
        closeButton.className = 'validation-error-close';
        closeButton.innerHTML = '×';
        closeButton.onclick = () => overlay.remove();
        
        overlay.appendChild(closeButton);
        overlay.appendChild(errorHeader);
        overlay.appendChild(errorContent);
        
        containerRef.current.appendChild(overlay);

        const timeout = setTimeout(() => {
            overlay.remove();
        }, 4000);
        
        // Clear timer if manually closed
        closeButton.onclick = () => {
            clearTimeout(timeout);
            overlay.remove();
        };
    }, []);

    /**
     * Handle Undo
     */
    const handleUndo = useCallback(() => {
        if (!modelerRef.current) return;
        const commandStack = modelerRef.current.get('commandStack');
        if (commandStack.canUndo()) {
            commandStack.undo()
        }
    },[])

    /**
     * Handle Redo
     */
    const handleRedo = useCallback(() => {
        if (!modelerRef.current) return;

        const commandStack = modelerRef.current.get('commandStack');
        if (commandStack.canRedo()) {
            commandStack.redo();
        }
    }, []);

    /**
     * Download current diagram as BPMN file
     */
    const downloadBPMN = useCallback(() => {
        if (!modelerRef.current) return;

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                // Create a blob from the XML
                const blob = new Blob([xml], { type: 'application/bpmn+xml' });
                
                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                // Use framework name for filename, or default
                const fileName = frameworkName?.value 
                    ? `${frameworkName.value.replace(/\s+/g, '_')}_Library_Hierarchy.bpmn`
                    : 'Library_Hierarchy.bpmn';
                
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                
                // Cleanup
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch(err => {
                console.error("Error downloading BPMN:", err);
            });
    }, [frameworkName]);


    return (
        <div className="library-hierarchy-widget">
            <div className="library-hierarchy-header">
                <h3>{frameworkName?.value || "Library Hierarchy"}</h3>
                {!readOnly && (
                    <div className="header-buttons">
                        <button 
                            className="btn-save"
                            onClick={exportAndSaveXML}
                        >
                            <span>
                                <img src={saveIcon} alt="SaveFramework" style={{width:'18px',height:'18px', position:'relative', top:'-1.5px'}}></img>
                                Save Framework
                            </span>

                        </button>

                        <button
                           className="btn-change"
                           onClick={handleUndo}
                        >
                            <img src={undoIcon} alt="Undo Changes" style={{width:'16px', height:'16px'}}/>
                        </button>

                        <button
                           className="btn-change"
                           onClick={handleRedo}
                        >
                            <img src={redoIcon} alt="Redo Changes" style={{width:'16px', height:'16px'}}/>
                        </button>
                        
                        <button
                           className="btn-save"
                        >
                            <span>
                                <img src={sendIcon} alt="Move Libraries" title="Move Libraries" style={{width:'18px', height:'18px',position:'relative', top:'-1.5px'}}/>
                                Move Libraries
                            </span>
                        </button>
                        
                        <button 
                            className="btn-download"
                            onClick={downloadBPMN}
                        >
                            <span>
                                <img src={downloadIcon} alt="DownloadBPMN" style={{width:'18px',height:'18px'}}></img>
                                Download BPMN
                            </span>
                        </button>
                    </div>
                )}
            </div>
            <div 
                ref={containerRef} 
                className="bpmn-library-container"
                style={{ 
                    height: "600px", 
                    width: "100%",
                    border: "1px solid #ccc",
                    backgroundColor: "#fafafa"
                }}
            />
        </div>
    );
}
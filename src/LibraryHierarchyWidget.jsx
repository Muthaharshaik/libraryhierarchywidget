import { createElement, useEffect, useRef, useCallback, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import "./ui/LibraryHierarchyWidget.css";
import downloadIcon from "./assets/download-svgrepo-com.svg"
import saveIcon from "./assets/save-svgrepo-com.svg"
import undoIcon from "./assets/undo-svgrepo-com.svg"
import redoIcon from "./assets/redo-svgrepo-com.svg"
import dotsIcon from "./assets/three-dots-svgrepo-com.svg"
import pdfIcon from "./assets/document-svgrepo-com.svg"
import svgIcon from "./assets/image-svgrepo-com.svg"
import htmlIcon from "./assets/html-tag-svgrepo-com.svg"
import printIcon from "./assets/print-svgrepo-com.svg"

export function LibraryHierarchyWidget(props) {
    const {
        libraryXML,
        frameworkName,
        clickedLibraryId,
        onLibraryClick,
        onSaveXML,
        readOnly,
        currentUserEmail,
        lockedUserEmail
    } = props;

    const containerRef = useRef(null);
    const modelerRef = useRef(null);
    const lastImportedXmlRef = useRef(null);
    const actionRef = useRef(null);
    const [pendingLibraryId, setPendingLibraryId] = useState(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportRef = useRef(null);

    // Determine if current user can edit
    // Determine if current user can edit
    const isLockedByAnotherUser = useCallback(() => {
        // Wait for values to load
        if (currentUserEmail?.status === "loading" || 
            lockedUserEmail?.status === "loading") {
            return true; // Block while loading
        }

        // ✅ NEW LOGIC: If no one is checked out (empty), EVERYONE is read-only
        if (!lockedUserEmail?.value || !lockedUserEmail.value.trim()) {
            return true; // No checkout = read-only for all
        }
        
        // If current user email not available, block
        if (!currentUserEmail?.value || !currentUserEmail.value.trim()) {
            return true;
        }
        
        // Compare emails - only the checked-out user can edit
        const currentEmail = currentUserEmail.value.toLowerCase().trim();
        const lockedEmail = lockedUserEmail.value.toLowerCase().trim();
        
        // If current user IS the checked-out user, they can edit
        return currentEmail !== lockedEmail;
    }, [currentUserEmail?.value, currentUserEmail?.status, 
        lockedUserEmail?.value, lockedUserEmail?.status]);

    // Computed readonly state
    const isReadOnly = readOnly || isLockedByAnotherUser();

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

    // Watch for when attribute is ready
    useEffect(() => {
        if (pendingLibraryId && 
            clickedLibraryId && 
            clickedLibraryId.status === "available") {
            
            console.info('Setting pending library ID:', pendingLibraryId);
            clickedLibraryId.setValue(pendingLibraryId);
            
            // Execute action
            setTimeout(() => {
                if (actionRef.current && actionRef.current.canExecute) {
                    actionRef.current.execute();
                }
                // Clear pending
                setPendingLibraryId(null);
            }, 100);
        }
    }, [pendingLibraryId, clickedLibraryId?.status]);

    useEffect(() => {
        actionRef.current = onLibraryClick;
    }, [onLibraryClick]);

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

                // Disable editing if read-only or locked
                if (isReadOnly) {
                    const eventBus = modeler.get('eventBus');
                    
                    // Block all modeling operations
                    eventBus.on('commandStack.execute', 10000, (event) => {
                        if (isReadOnly) {
                            event.stopPropagation();
                            return false;
                        }
                    });
                }

                // Set up event listeners
                const eventBus = modeler.get("eventBus");
                
                eventBus.on("element.dblclick", (event) => {
                    const { element } = event;

                    if (element.type === "bpmn:SubProcess" &&
                        element.businessObject.get("library:libraryId")) {

                        // ✅ If user CAN edit (checked out by them), allow inline editing
                        if (!isReadOnly) {
                            // Enable direct editing (rename)
                            const directEditing = modeler.get("directEditing");
                            directEditing.activate(element);
                            return;
                        }

                        // ✅ If user CANNOT edit, prevent editing and navigate
                        event.stopPropagation();
                        event.preventDefault();
                        
                        // Cancel any editing that might have started
                        const directEditing = modeler.get("directEditing");
                        directEditing.cancel();
                        
                        const libraryId = element.businessObject.get("library:libraryId");
                        console.info('Library clicked (read-only):', libraryId);
                        setPendingLibraryId(libraryId);
                    }
                });

                // // Listen for changes to auto-save (only if editable)
                // if (onSaveXML && onSaveXML.canExecute && !isReadOnly) {
                //     eventBus.on("commandStack.changed", () => {
                //         exportAndSaveXML();
                //     });
                // }
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
    }, [isReadOnly]); // Re-initialize when lock status changes

    /**
     * Update root library name when frameworkName changes
     */
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!frameworkName?.value) return;
        if (libraryXML?.value) return;

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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (exportRef.current && !exportRef.current.contains(event.target)) {
                setShowExportMenu(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    /**
     * Validate diagram before saving
     */
    const validateDiagram = useCallback(() => {
        if (!modelerRef.current) return { valid: true, errors: [] };

        const elementRegistry = modelerRef.current.get('elementRegistry');
        const errors = [];
        const allElements = elementRegistry.getAll();
        
        allElements.forEach(element => {
            if (element.type === 'bpmn:SubProcess' && 
                element.businessObject.get('library:libraryId')) {
                
                const incomingCount = element.incoming ? element.incoming.length : 0;
                
                if (incomingCount > 1) {
                    errors.push("A library must not have more than one parent library.");
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
        if (isReadOnly) return; // Don't save if locked

        const validation = validateDiagram();
        
        if (!validation.valid) {
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
    }, [libraryXML, onSaveXML, validateDiagram, isReadOnly]);

    /**
     * Show validation errors
     */
    const showValidationError = useCallback((errors) => {
        if (!containerRef.current) return;
        
        const existingErrors = containerRef.current.querySelectorAll('.validation-error-overlay');
        existingErrors.forEach(error => error.remove());
        
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
        
        overlay.appendChild(closeButton);
        overlay.appendChild(errorHeader);
        overlay.appendChild(errorContent);
        
        containerRef.current.appendChild(overlay);

        const timeout = setTimeout(() => {
            overlay.remove();
        }, 4000);
        
        closeButton.onclick = () => {
            clearTimeout(timeout);
            overlay.remove();
        };
    }, []);

    /**
     * Handle Undo
     */
    const handleUndo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return;
        const commandStack = modelerRef.current.get('commandStack');
        if (commandStack.canUndo()) {
            commandStack.undo();
        }
    }, [isReadOnly]);

    /**
     * Handle Redo
     */
    const handleRedo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return;
        const commandStack = modelerRef.current.get('commandStack');
        if (commandStack.canRedo()) {
            commandStack.redo();
        }
    }, [isReadOnly]);

    const showUnsavedWarning = () => {
        if (!containerRef.current) return;

        const overlay = document.createElement("div");
        overlay.className = "validation-error-overlay";
        overlay.innerHTML = `
            <div class="validation-error-header">
                <span>⚠️ Unsaved Changes</span>
            </div>
            <div class="validation-error-content">
                Please save the framework before opening a library.
            </div>
        `;

        containerRef.current.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();
        }, 5000);
    };

    /**
     * Download current diagram as BPMN file
     */
    const downloadBPMN = useCallback(() => {
        if (!modelerRef.current) return;

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                const blob = new Blob([xml], { type: 'application/bpmn+xml' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                const fileName = frameworkName?.value 
                    ? `${frameworkName.value.replace(/\s+/g, '_')}_Library_Hierarchy.bpmn`
                    : 'Library_Hierarchy.bpmn';
                
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch(err => {
                console.error("Error downloading BPMN:", err);
            });
    }, [frameworkName]);

return (
    <div className="library-hierarchy-widget" data-locked={isLockedByAnotherUser()}>
        <div className="library-hierarchy-header">
            <h3 style={{visibility:'hidden'}}>{frameworkName?.value || "Library Hierarchy"}</h3>
            
            {/* Show full buttons if NOT locked, only export if locked */}
            <div className="header-buttons">
                {!isReadOnly && (
                    <div className="editable-buttons">
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
                           title="Undo"
                        >
                            <img src={undoIcon} alt="Undo Changes" style={{width:'16px', height:'16px'}}/>
                        </button>

                        <button
                           className="btn-change"
                           onClick={handleRedo}
                           title="Redo"
                        >
                            <img src={redoIcon} alt="Redo Changes" style={{width:'16px', height:'16px'}}/>
                        </button>
                    </div>
                )}
                
                {/* Export menu - always visible */}
                <div className="export-wrapper" ref={exportRef}>
                    <button
                        className="btn-change"
                        onClick={() => setShowExportMenu(prev => !prev)}
                        title="Export"
                    >
                        <img
                            src={dotsIcon}
                            alt="Export"
                            style={{ width: "16px", height: "16px" }}
                        />
                    </button>

                    {showExportMenu && (
                        <div className="export-dropdown">
                             <div className="export-header">Export as</div>
                                <div
                                    className="export-item"
                                    onClick={() => {
                                        downloadBPMN();
                                        setShowExportMenu(false);
                                    }}
                                >
                                    <img src={downloadIcon} alt="BPMN" className="export-icon" />
                                    <span>BPMN</span>
                                </div>

                            <div className="export-item">
                                <img src={pdfIcon} alt="PDF" className="export-icon" />
                                <span>PDF</span>
                            </div>
                            <div className="export-item">
                                <img src={svgIcon} alt="SVG" className="export-icon" />
                                <span>SVG</span>
                            </div>
                            <div className="export-item">
                                 <img src={htmlIcon} alt="HTML" className="export-icon" />
                                 <span>HTML</span>
                            </div>
                            <div className="export-item">
                                 <img src={printIcon} alt="PRINT" className="export-icon"/>
                                 <span>PRINT</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        <div 
            ref={containerRef} 
            className="bpmn-library-container"
            style={{ 
                height: "600px", 
                width: "100%",
                border: "1px solid #ccc",
                backgroundColor: "#fafafa",
                opacity: isLockedByAnotherUser() ? 0.7 : 1
            }}
        />
    </div>
);
}
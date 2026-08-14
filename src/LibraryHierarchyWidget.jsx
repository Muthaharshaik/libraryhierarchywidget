import { createElement, useEffect, useRef, useCallback, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import "./ui/LibraryHierarchyWidget.css";
import downloadIcon from "./assets/download-svgrepo-com.svg";
import importIcon   from "./assets/import-svgrepo-com.svg";
import saveIcon     from "./assets/save-svgrepo-com.svg";
import undoIcon     from "./assets/undo-svgrepo-com.svg";
import redoIcon     from "./assets/redo-svgrepo-com.svg";
import dotsIcon     from "./assets/three-dots-svgrepo-com.svg";
import pdfIcon      from "./assets/document-svgrepo-com.svg";
import svgIcon      from "./assets/image-svgrepo-com.svg";
import htmlIcon     from "./assets/html-tag-svgrepo-com.svg";
import printIcon    from "./assets/print-svgrepo-com.svg";
import { transformPrimeBpmn } from "./components/PrimeBpmnImporter";

// ── Toggle button colours ─────────────────────────────────────────────────────
const TOGGLE_BG_EXPANDED  = "#2cb5b5";
const TOGGLE_BG_COLLAPSED = "#e07b3a";
const TOGGLE_SIZE         = 22;

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

    const containerRef       = useRef(null);
    const modelerRef         = useRef(null);
    const lastImportedXmlRef = useRef(null);
    const actionRef          = useRef(null);
    const [pendingLibraryId, setPendingLibraryId] = useState(null);
    const [showExportMenu, setShowExportMenu]     = useState(false);
    const exportRef = useRef(null);

    // Import: hidden file input + the parsed-but-not-yet-applied candidate.
    const fileInputRef = useRef(null);
    const [pendingImport, setPendingImport] = useState(null);

    // Collapse state: Map<elementId, boolean> — true = collapsed
    const collapseStateRef = useRef(new Map());

    // ── Lock check ────────────────────────────────────────────────────────────
    const isLockedByAnotherUser = useCallback(() => {
        if (currentUserEmail?.status === "loading" ||
            lockedUserEmail?.status === "loading") return true;
        if (!lockedUserEmail?.value || !lockedUserEmail.value.trim()) return true;
        if (!currentUserEmail?.value || !currentUserEmail.value.trim()) return true;
        return currentUserEmail.value.toLowerCase().trim() !==
               lockedUserEmail.value.toLowerCase().trim();
    }, [currentUserEmail?.value, currentUserEmail?.status,
        lockedUserEmail?.value,  lockedUserEmail?.status]);

    const isReadOnly = readOnly || isLockedByAnotherUser();

    // ── Default XML ───────────────────────────────────────────────────────────
    const generateDefaultXML = (name) => {
        const n = name || "Framework Root";
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
    <bpmn:subProcess id="SubProcess_Root" name="${n}"
                     library:libraryId="root"
                     library:libraryName="${n}">
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

    // ── Helpers ───────────────────────────────────────────────────────────────
    function getDirectChildren(element) {
        return (element.outgoing || [])
            .filter(c => c.type === "bpmn:SequenceFlow")
            .map(c => c.target)
            .filter(Boolean);
    }

    function collectDescendants(element, collapseState) {
        const nodeIds       = new Set();
        const connectionIds = new Set();
        const queue         = [...getDirectChildren(element)];
        while (queue.length) {
            const child = queue.shift();
            if (!child || nodeIds.has(child.id)) continue;
            nodeIds.add(child.id);
            (child.incoming || [])
                .filter(c => c.type === "bpmn:SequenceFlow")
                .forEach(c => connectionIds.add(c.id));
            if (!collapseState.get(child.id)) {
                queue.push(...getDirectChildren(child));
            }
        }
        return { nodeIds, connectionIds };
    }

    function setElementVisibility(container, elementId, visible) {
        const gfx = container.querySelector(`[data-element-id="${elementId}"]`);
        if (gfx) gfx.style.display = visible ? "" : "none";
    }

    // FIX 1 — hide/show overlay buttons alongside their shapes
    function setOverlayVisibility(container, elementId, visible) {
        const searchRoot = container.closest(".bjs-container") || container;
        const btn = searchRoot.querySelector(
            `button[data-collapse-id="${elementId}"]`
        );
        if (btn) {
            const overlayDiv = btn.closest(".djs-overlay");
            if (overlayDiv) overlayDiv.style.display = visible ? "" : "none";
        }
    }

    // ── Build toggle button ───────────────────────────────────────────────────
    const buildToggleButton = (elementId, isCollapsed, childCount) => {
        const btn = document.createElement("button");
        btn.setAttribute("data-collapse-id", elementId);
        const bg   = isCollapsed ? TOGGLE_BG_COLLAPSED : TOGGLE_BG_EXPANDED;
        const icon = isCollapsed ? `▶ ${childCount}` : "▼";
        btn.style.cssText = `
            width: ${TOGGLE_SIZE}px;
            height: ${TOGGLE_SIZE}px;
            border-radius: 50%;
            border: 2px solid #ffffff;
            background: ${bg};
            color: #ffffff;
            font-size: ${isCollapsed ? "7px" : "10px"};
            font-weight: 700;
            font-family: Arial, sans-serif;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            line-height: 1;
            box-shadow: 0 1px 4px rgba(0,0,0,0.25);
            transition: opacity 0.15s;
            pointer-events: all;
        `;
        btn.textContent = icon;
        btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.8"; });
        btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });
        return btn;
    };

    // ── Refresh overlays ──────────────────────────────────────────────────────
    const refreshOverlays = useCallback((modeler) => {
        if (!modeler) return;
        const overlays        = modeler.get("overlays");
        const elementRegistry = modeler.get("elementRegistry");
        const collapseState   = collapseStateRef.current;

        try { overlays.remove({ type: "collapse-toggle" }); } catch (_) {}

        // FIX 2 — build set of all hidden node IDs, skip overlays for them
        const hiddenIds = new Set();
        elementRegistry.getAll().forEach(element => {
            if (collapseState.get(element.id) === true) {
                const { nodeIds } = collectDescendants(element, collapseState);
                nodeIds.forEach(id => hiddenIds.add(id));
            }
        });

        elementRegistry.getAll().forEach(element => {
            if (element.type !== "bpmn:SubProcess") return;
            if (!element.businessObject.get("library:libraryId") &&
                !element.businessObject.get("library:libraryName")) return;

            const children = getDirectChildren(element);
            if (children.length === 0) return;

            // Skip nodes that are hidden inside a collapsed parent
            if (hiddenIds.has(element.id)) return;

            const isCollapsed = collapseState.get(element.id) === true;
            const btn = buildToggleButton(element.id, isCollapsed, children.length);

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                handleToggleCollapse(element.id, modeler);
            });

            overlays.add(element.id, "collapse-toggle", {
                position: {
                    bottom: 4,
                    left:   element.width / 2 - TOGGLE_SIZE / 2
                },
                html: btn
            });
        });
    }, []);

    // ── Core collapse / expand ────────────────────────────────────────────────
    const handleToggleCollapse = useCallback((elementId, modeler) => {
        const mod = modeler || modelerRef.current;
        if (!mod) return;

        const elementRegistry = mod.get("elementRegistry");
        const container       = containerRef.current;
        const collapseState   = collapseStateRef.current;

        const element = elementRegistry.get(elementId);
        if (!element) return;

        const wasCollapsed = collapseState.get(elementId) === true;
        const nowCollapsed = !wasCollapsed;
        collapseState.set(elementId, nowCollapsed);

        if (nowCollapsed) {
            // FIX 1 — hide overlay buttons alongside shapes
            const { nodeIds, connectionIds } = collectDescendants(element, collapseState);
            nodeIds.forEach(id => {
                setElementVisibility(container, id, false);
                setOverlayVisibility(container, id, false);
            });
            connectionIds.forEach(id => setElementVisibility(container, id, false));
            (element.outgoing || [])
                .filter(c => c.type === "bpmn:SequenceFlow")
                .forEach(c => setElementVisibility(container, c.id, false));
        } else {
            // FIX 3 — recursively restore descendants, respecting each node's own collapse state
            const restoreDescendants = (el) => {
                const children = getDirectChildren(el);
                children.forEach(child => {
                    setElementVisibility(container, child.id, true);
                    (child.incoming || [])
                        .filter(c => c.type === "bpmn:SequenceFlow" && c.source?.id === el.id)
                        .forEach(c => setElementVisibility(container, c.id, true));
                    setOverlayVisibility(container, child.id, true);
                    if (!collapseState.get(child.id)) {
                        restoreDescendants(child);
                    }
                });
            };

            restoreDescendants(element);

            (element.outgoing || [])
                .filter(c => c.type === "bpmn:SequenceFlow")
                .forEach(c => setElementVisibility(container, c.id, true));
        }

        refreshOverlays(mod);
    }, [refreshOverlays]);

    // ── Pending navigation ────────────────────────────────────────────────────
    useEffect(() => {
        if (pendingLibraryId &&
            clickedLibraryId &&
            clickedLibraryId.status === "available") {
            clickedLibraryId.setValue(pendingLibraryId);
            setTimeout(() => {
                if (actionRef.current && actionRef.current.canExecute) {
                    actionRef.current.execute();
                }
                setPendingLibraryId(null);
            }, 100);
        }
    }, [pendingLibraryId, clickedLibraryId?.status]);

    useEffect(() => { actionRef.current = onLibraryClick; }, [onLibraryClick]);

    // ── Modeler init ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;

        collapseStateRef.current = new Map();

        if (modelerRef.current) {
            modelerRef.current.destroy();
            modelerRef.current = null;
        }

        const CustomPaletteProvider   = require("./components/CustomPaletteProvider");
        const CustomLibraryPalette    = require("./components/CustomLibraryPalette");
        const CustomLibraryRendererMod= require("./components/CustomLibraryRenderer");
        const CustomLibraryRules      = require("./components/CustomLibraryRules");
        const CustomLibraryContextPad = require("./components/CustomLibraryContextPad");
        const CustomLibraryNameSync   = require("./components/CustomLibraryNameSync");

        const modeler = new BpmnModeler({
            container: containerRef.current,
            additionalModules: [
                CustomPaletteProvider,
                CustomLibraryPalette,
                CustomLibraryRendererMod,
                CustomLibraryRules,
                CustomLibraryContextPad,
                CustomLibraryNameSync
            ],
            moddleExtensions: {
                library: require("./components/libraryModdle").libraryModdle
            }
        });

        modelerRef.current = modeler;

        const xmlToLoad = libraryXML?.value || generateDefaultXML(frameworkName?.value);
        lastImportedXmlRef.current = xmlToLoad;

        modeler
            .importXML(xmlToLoad)
            .then(({ warnings }) => {
                if (warnings.length) console.warn("BPMN Import Warnings:", warnings);

                const canvas   = modeler.get("canvas");
                const eventBus = modeler.get("eventBus");
                canvas.zoom("fit-viewport");

                refreshOverlays(modeler);

                eventBus.on("elements.changed",  () => refreshOverlays(modeler));
                eventBus.on("shape.added",        () => refreshOverlays(modeler));
                eventBus.on("connection.added",   () => refreshOverlays(modeler));
                eventBus.on("shape.removed",      () => refreshOverlays(modeler));
                eventBus.on("connection.removed", () => refreshOverlays(modeler));

                if (isReadOnly) {
                    eventBus.on("commandStack.execute", 10000, (event) => {
                        event.stopPropagation();
                        return false;
                    });
                }

                eventBus.on("library.unsaved-warning", () => showUnsavedWarning());

                eventBus.on("library.open", (event) => {
                    setPendingLibraryId(event.libraryId);
                });

                eventBus.on("element.dblclick", (event) => {
                    const { element } = event;
                    if (element.type === "bpmn:SubProcess" &&
                        element.businessObject.get("library:libraryId")) {
                        if (!isReadOnly) {
                            modeler.get("directEditing").activate(element);
                            return;
                        }
                        event.stopPropagation();
                        event.preventDefault();
                        modeler.get("directEditing").cancel();
                        setPendingLibraryId(element.businessObject.get("library:libraryId"));
                    }
                });
            })
            .catch(err => console.error("Error importing BPMN diagram:", err));

        return () => {
            if (modelerRef.current) modelerRef.current.destroy();
        };
    }, [isReadOnly]);

    // ── Framework name update ─────────────────────────────────────────────────
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!frameworkName?.value) return;
        if (libraryXML?.value) return;
        const elementRegistry = modelerRef.current.get("elementRegistry");
        const modeling        = modelerRef.current.get("modeling");
        const rootElement     = elementRegistry.get("SubProcess_Root");
        if (rootElement) {
            modeling.updateProperties(rootElement, {
                name: frameworkName.value,
                "library:libraryName": frameworkName.value
            });
        }
    }, [frameworkName?.value, libraryXML?.value]);

    // ── XML updates from Mendix ───────────────────────────────────────────────
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!libraryXML?.value) return;
        if (libraryXML.value === lastImportedXmlRef.current) return;

        lastImportedXmlRef.current = libraryXML.value;
        collapseStateRef.current   = new Map();

        modelerRef.current
            .importXML(libraryXML.value)
            .then(() => {
                modelerRef.current.get("canvas").zoom("fit-viewport");
                refreshOverlays(modelerRef.current);
            })
            .catch(err => console.error("Error updating BPMN diagram:", err));
    }, [libraryXML?.value]);

    // ── Close export menu on outside click ───────────────────────────────────
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ── Validation ────────────────────────────────────────────────────────────
    const validateDiagram = useCallback(() => {
        if (!modelerRef.current) return { valid: true, errors: [] };
        const errors = [];
        modelerRef.current.get("elementRegistry").getAll().forEach(element => {
            if (element.type === "bpmn:SubProcess" &&
                element.businessObject.get("library:libraryId")) {
                if ((element.incoming || []).length > 1) {
                    errors.push("A library must not have more than one parent library.");
                }
            }
        });
        return { valid: errors.length === 0, errors };
    }, []);

    // ── Save ──────────────────────────────────────────────────────────────────
    const exportAndSaveXML = useCallback(() => {
        if (!modelerRef.current || !onSaveXML || !onSaveXML.canExecute) return;
        if (isReadOnly) return;
        const validation = validateDiagram();
        if (!validation.valid) { showValidationError(validation.errors); return; }
        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => { libraryXML?.setValue(xml); onSaveXML.execute(); })
            .catch(err => console.error("Error exporting BPMN XML:", err));
    }, [libraryXML, onSaveXML, validateDiagram, isReadOnly]);

    // ── Validation overlay ────────────────────────────────────────────────────
    const showValidationError = useCallback((errors) => {
        if (!containerRef.current) return;
        containerRef.current.querySelectorAll(".validation-error-overlay")
            .forEach(e => e.remove());
        const overlay     = document.createElement("div");
        overlay.className = "validation-error-overlay";
        const header      = document.createElement("div");
        header.className  = "validation-error-header";
        header.innerHTML  = `<span class="icon">⚠️</span><span>Alert</span>`;
        const content     = document.createElement("div");
        content.className = "validation-error-content";
        errors.forEach(err => {
            const line = document.createElement("div");
            line.textContent       = err;
            line.style.marginBottom = "8px";
            content.appendChild(line);
        });
        const close       = document.createElement("button");
        close.className   = "validation-error-close";
        close.innerHTML   = "×";
        overlay.appendChild(close);
        overlay.appendChild(header);
        overlay.appendChild(content);
        containerRef.current.appendChild(overlay);
        const t = setTimeout(() => overlay.remove(), 4000);
        close.onclick = () => { clearTimeout(t); overlay.remove(); };
    }, []);

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    const handleUndo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return;
        const cs = modelerRef.current.get("commandStack");
        if (cs.canUndo()) cs.undo();
    }, [isReadOnly]);

    const handleRedo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return;
        const cs = modelerRef.current.get("commandStack");
        if (cs.canRedo()) cs.redo();
    }, [isReadOnly]);

    // ── Unsaved warning ───────────────────────────────────────────────────────
    const showUnsavedWarning = () => {
        if (!containerRef.current) return;
        const overlay     = document.createElement("div");
        overlay.className = "validation-error-overlay";
        overlay.innerHTML = `
            <div class="validation-error-header"><span>⚠️ Unsaved Changes</span></div>
            <div class="validation-error-content">Please save the framework before opening a library.</div>`;
        containerRef.current.appendChild(overlay);
        setTimeout(() => overlay.remove(), 5000);
    };

    // ── Download BPMN ─────────────────────────────────────────────────────────
    const downloadBPMN = useCallback(() => {
        if (!modelerRef.current) return;
        modelerRef.current.saveXML({ format: true }).then(({ xml }) => {
            const blob = new Blob([xml], { type: "application/bpmn+xml" });
            const url  = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href  = url;
            link.download = frameworkName?.value
                ? `${frameworkName.value.replace(/\s+/g, "_")}_Library_Hierarchy.bpmn`
                : "Library_Hierarchy.bpmn";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }).catch(err => console.error("Error downloading BPMN:", err));
    }, [frameworkName]);

    // ── Info overlay (import results) ─────────────────────────────────────────
    const showInfoOverlay = useCallback((title, lines, timeout = 6000) => {
        if (!containerRef.current) return;
        containerRef.current.querySelectorAll(".validation-error-overlay")
            .forEach(e => e.remove());

        const overlay     = document.createElement("div");
        overlay.className = "validation-error-overlay info";

        const header      = document.createElement("div");
        header.className  = "validation-error-header";
        header.innerHTML  = `<span class="icon">✓</span><span></span>`;
        header.lastChild.textContent = title;

        const content     = document.createElement("div");
        content.className = "validation-error-content";
        lines.forEach(text => {
            const line = document.createElement("div");
            line.textContent        = text;
            line.style.marginBottom = "4px";
            content.appendChild(line);
        });

        const close       = document.createElement("button");
        close.className   = "validation-error-close";
        close.innerHTML   = "×";

        overlay.appendChild(close);
        overlay.appendChild(header);
        overlay.appendChild(content);
        containerRef.current.appendChild(overlay);

        const t = setTimeout(() => overlay.remove(), timeout);
        close.onclick = () => { clearTimeout(t); overlay.remove(); };
    }, []);

    // ── Import BPMN ───────────────────────────────────────────────────────────
    const handleImportClick = useCallback(() => {
        if (isReadOnly) return;
        // Reset value so re-picking the same file still fires change.
        if (fileInputRef.current) fileInputRef.current.value = "";
        fileInputRef.current?.click();
    }, [isReadOnly]);

    const handleFileSelected = useCallback((event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onerror = () => showValidationError(["Could not read the selected file."]);
        reader.onload  = () => {
            try {
                const { xml, stats } = transformPrimeBpmn(String(reader.result));
                setPendingImport({ fileName: file.name, xml, stats });
            } catch (err) {
                showValidationError([err.message || "Could not import this BPMN file."]);
            }
        };
        reader.readAsText(file);
    }, [showValidationError]);

    const applyImport = useCallback(() => {
        const candidate = pendingImport;
        if (!candidate || !modelerRef.current) return;
        setPendingImport(null);

        collapseStateRef.current = new Map();
        // Keep the ref pointing at what is actually on the canvas.
        lastImportedXmlRef.current = candidate.xml;

        modelerRef.current
            .importXML(candidate.xml)
            .then(({ warnings }) => {
                if (warnings.length) console.warn("BPMN Import Warnings:", warnings);
                modelerRef.current.get("canvas").zoom("fit-viewport");
                refreshOverlays(modelerRef.current);

                const s     = candidate.stats;
                const lines = [
                    `${s.libraryCount} libraries and ${s.linkCount} links loaded.`
                ];
                if (s.unconnectedCount) {
                    lines.push(`${s.unconnectedCount} ${s.unconnectedCount === 1 ? "library is" : "libraries are"} not connected to anything — link ${s.unconnectedCount === 1 ? "it" : "them"} as needed.`);
                }
                if (s.generatedPositions) {
                    lines.push(`${s.generatedPositions} ${s.generatedPositions === 1 ? "node" : "nodes"} had no saved position and were placed below the diagram.`);
                }
                if (s.droppedFlowCount) {
                    lines.push(`${s.droppedFlowCount} incomplete ${s.droppedFlowCount === 1 ? "connector was" : "connectors were"} skipped.`);
                }
                if (s.skippedFlowNodes) {
                    lines.push(`${s.skippedFlowNodes} events/gateways were skipped — a library hierarchy holds libraries only.`);
                }
                lines.push("Press Save Framework to keep this import.");

                showInfoOverlay("Import complete", lines, 12000);
            })
            .catch(err => {
                console.error("Error importing BPMN diagram:", err);
                showValidationError([
                    "The file could not be loaded onto the canvas.",
                    err.message || "Unknown error."
                ]);
            });
    }, [pendingImport, refreshOverlays, showInfoOverlay, showValidationError]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="library-hierarchy-widget" data-locked={isLockedByAnotherUser()}>
            <div className="library-hierarchy-header">
                <h3 style={{ visibility: "hidden" }}>{frameworkName?.value || "Library Hierarchy"}</h3>
                <div className="header-buttons">
                    {!isReadOnly && (
                        <div className="editable-buttons">
                            <button className="btn-save" onClick={exportAndSaveXML}>
                                <span>
                                    <img src={saveIcon} alt="Save" style={{ width: "18px", height: "18px", position: "relative", top: "-1.5px" }} />
                                    Save Framework
                                </span>
                            </button>
                            <button className="btn-change" onClick={handleImportClick} title="Import BPMN">
                                <span>
                                    <img src={importIcon} alt="Import" style={{ width: "16px", height: "16px", position: "relative", top: "-1px" }} />
                                    Import Framework
                                </span>
                            </button>
                            <button className="btn-change" onClick={handleUndo} title="Undo">
                                <img src={undoIcon} alt="Undo" style={{ width: "16px", height: "16px" }} />
                            </button>
                            <button className="btn-change" onClick={handleRedo} title="Redo">
                                <img src={redoIcon} alt="Redo" style={{ width: "16px", height: "16px" }} />
                            </button>
                        </div>
                    )}
                    <div className="export-wrapper" ref={exportRef}>
                        <button className="btn-change" onClick={() => setShowExportMenu(prev => !prev)} title="Export">
                            <img src={dotsIcon} alt="Export" style={{ width: "16px", height: "16px" }} />
                        </button>
                        {showExportMenu && (
                            <div className="export-dropdown">
                                <div className="export-header">Export as</div>
                                <div className="export-item" onClick={() => { downloadBPMN(); setShowExportMenu(false); }}>
                                    <img src={downloadIcon} alt="BPMN" className="export-icon" /><span>BPMN</span>
                                </div>
                                <div className="export-item">
                                    <img src={pdfIcon}  alt="PDF"   className="export-icon" /><span>PDF</span>
                                </div>
                                <div className="export-item">
                                    <img src={svgIcon}  alt="SVG"   className="export-icon" /><span>SVG</span>
                                </div>
                                <div className="export-item">
                                    <img src={htmlIcon} alt="HTML"  className="export-icon" /><span>HTML</span>
                                </div>
                                <div className="export-item">
                                    <img src={printIcon} alt="Print" className="export-icon" /><span>PRINT</span>
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
                    height:          "600px",
                    width:           "100%",
                    border:          "1px solid #ccc",
                    backgroundColor: "#fafafa",
                    opacity:         isLockedByAnotherUser() ? 0.7 : 1
                }}
            />

            <input
                ref={fileInputRef}
                type="file"
                accept=".bpmn,.xml,text/xml,application/xml"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />

            {pendingImport && (
                <div className="import-confirm-backdrop">
                    <div className="import-confirm">
                        <div className="import-confirm-title">Replace current hierarchy?</div>
                        <div className="import-confirm-body">
                            <div className="import-confirm-file">{pendingImport.fileName}</div>
                            <div>
                                Found {pendingImport.stats.libraryCount} libraries
                                and {pendingImport.stats.linkCount} links.
                            </div>
                            <div className="import-confirm-warn">
                                This replaces everything currently on the canvas and cannot be
                                undone. Nothing is written to the framework until you press
                                Save Framework, so leaving the page without saving keeps the
                                existing hierarchy.
                            </div>
                        </div>
                        <div className="import-confirm-actions">
                            <button className="import-btn-cancel" onClick={() => setPendingImport(null)}>
                                Cancel
                            </button>
                            <button className="import-btn-confirm" onClick={applyImport}>
                                Import
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
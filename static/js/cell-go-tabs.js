(() => {
    "use strict";

    let proteinDataPromise = null;
    const initializedTabs = new Set();
    const tabInitializationPromises = new Map();
    let domainStructureLoadPromise = null;
    let structureFrameMessageHandler = null;

    function proteinHeadingHtml(protein) {
        const name = protein.protein_name || protein.gene_name || protein.protein_id || "";
        const gene = protein.gene_name || protein.protein_id || "";
        const details = [
            protein.uniprot_acc && `UniProt: ${protein.uniprot_acc}`,
            protein.entry_name,
            protein.organism,
            protein.length && `${protein.length} aa`
        ].filter(Boolean);

        return `
            <header class="cell-tab-protein-heading">
                <h2>${escapeHtml(name)} (${escapeHtml(gene)})</h2>
                ${details.length ? `<p>${escapeHtml(details[0])}${details.length > 1 ? ` · ${details.slice(1).map(escapeHtml).join(" · ")}` : ""}</p>` : ""}
            </header>
        `;
    }

    function setupColumnResizer(container, firstPanel, handle, secondPanel, minPanelWidth, minWindowWidth = 1050) {
        if (!container || !firstPanel || !handle || !secondPanel) return;

        const handleWidth = 8;
        const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
        const clampWidth = width => Math.max(
            minPanelWidth,
            Math.min(container.clientWidth - minPanelWidth - handleWidth - gap * 2, width)
        );
        const resize = width => {
            const firstWidth = clampWidth(width);
            container.style.gridTemplateColumns = `${firstWidth}px ${handleWidth}px minmax(0, 1fr)`;
            handle.setAttribute(
                "aria-valuenow",
                String(Math.round(firstWidth / Math.max(1, container.clientWidth - handleWidth - gap * 2) * 100))
            );
            window.dispatchEvent(new Event("resize"));
            if (typeof pdbViewer !== "undefined" && pdbViewer?.plugin?.handleResize) {
                pdbViewer.plugin.handleResize();
            }
        };

        handle.addEventListener("pointerdown", event => {
            if (window.matchMedia(`(max-width: ${minWindowWidth}px)`).matches) return;
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            document.body.classList.add("resizing-columns");
            const move = pointerEvent => {
                resize(pointerEvent.clientX - container.getBoundingClientRect().left - handleWidth / 2);
            };
            const finish = () => {
                document.body.classList.remove("resizing-columns");
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", finish);
                handle.removeEventListener("pointercancel", finish);
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", finish);
            handle.addEventListener("pointercancel", finish);
        });

        handle.addEventListener("keydown", event => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            resize(firstPanel.getBoundingClientRect().width + direction * 24);
        });
    }

    function setTabMessage(tabId, message, isError = false) {
        const panel = document.getElementById(tabId);
        if (!panel) {
            return;
        }

        const content = panel.querySelector(".cell-tab-loading");
        if (content) {
            content.textContent = message;
            content.classList.toggle("cell-tab-error", isError);
            return;
        }

        let error = panel.querySelector(".cell-tab-error");
        if (!error) {
            error = document.createElement("p");
            error.className = "cell-tab-error";
            panel.prepend(error);
        }
        error.textContent = message;
    }

    async function loadProteinData() {
        if (!proteinDataPromise) {
            proteinDataPromise = fetch(
                `/api/protein/${encodeURIComponent(window.CELL_PROTEIN_ID)}`
            ).then(async response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                if (!data.protein) {
                    throw new Error("The API response is missing protein information.");
                }

                window.currentProteinData = data;
                window.currentData = { ...data, ...data.protein };
                window.currentProtein = data.protein;
                window.currentProteinId = data.protein.protein_id;
                window.currentProteinLength = Number(data.protein.length || 0);
                window.currentProteinSequence = data.protein.sequence || "";
                window.currentProteinFeatures = data.features || [];
                window.currentDomains = data.domains || [];
                window.activeFeatureCategories = [];

                return data;
            }).catch(error => {
                proteinDataPromise = null;
                throw error;
            });
        }

        return proteinDataPromise;
    }

    function getStructureChoices(data) {
        const proteinId = encodeURIComponent(data.protein.protein_id);
        const predicted = data.predicted_structures || {};
        const choices = (data.structures || []).map(structure => ({
            label: structure.pdb_id || "PDB",
            id: structure.pdb_id || "",
            url: structure.pdb_url,
            originalUrl: structure.pdb_url,
            source: "pdb",
            metadata: structure
        }));

        if (predicted.alphafold?.local_pdb_path) {
            choices.push({
                label: "AlphaFold",
                id: predicted.alphafold.uniprot_id || data.protein.protein_id,
                url: `/data/alphafold/${proteinId}.pdb`,
                originalUrl: predicted.alphafold.pdb_url || predicted.alphafold.cif_url,
                source: "alphafold",
                metadata: predicted.alphafold
            });
        }
        if (predicted.alphafill?.cif_url) {
            choices.push({
                label: "AlphaFill",
                id: predicted.alphafill.uniprot_id || data.protein.protein_id,
                url: predicted.alphafill.cif_url,
                originalUrl: predicted.alphafill.cif_url,
                source: "alphafill",
                metadata: predicted.alphafill
            });
        }
        if (predicted.swiss_model?.local_pdb_path) {
            choices.push({
                label: "SWISS-MODEL",
                id: predicted.swiss_model.uniprot_id || data.protein.protein_id,
                url: `/data/swiss_model/${proteinId}.pdb`,
                originalUrl: predicted.swiss_model.coordinates_url,
                source: "swiss_model",
                metadata: predicted.swiss_model
            });
        }

        return choices.filter(choice => choice.url);
    }

    async function renderDomainTab(data) {
        const protein = data.protein;
        const domains = normalizeDomainRecords(data.domains || []);
        const choices = getStructureChoices(data);
        const requestedUrl = new URLSearchParams(window.location.search).get("structure");
        const selectedStructure = choices.find(choice =>
            choice.url === requestedUrl || choice.originalUrl === requestedUrl
        );
        const active = selectedStructure || data.active_structure;
        const activeIndex = Math.max(
            0,
            choices.findIndex(choice =>
                choice.url === active?.url
                || choice.originalUrl === active?.url
                || choice.source === active?.source
            )
        );

        document.getElementById("cellDomainContent").innerHTML = `
            ${proteinHeadingHtml(protein)}
            <div class="cell-domain-workspace">
                <section class="cell-domain-track">
                    <div class="cell-domain-track-header">
                        <h3>Domain Architecture</h3>
                        <span>${domains.length} domains</span>
                    </div>
                    <div id="domainExplorerTrack">
                        ${renderDomainExplorerArchitecture(domains, Number(protein.length || 0))}
                    </div>
                    <div id="domainExplorerInfo" class="domain-explorer-info">
                        <p>Select a domain to view its position in the 3D structure.</p>
                    </div>
                </section>
                <div class="cellgo-resize-handle" role="separator" aria-label="Resize domain and structure panels" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="80" aria-valuenow="60" tabindex="0"></div>
                <section class="cell-domain-structure">
                    <div class="cell-domain-viewer-toolbar" aria-label="Mol* viewer controls">
                        <button type="button" data-domain-view-action="reset">Reset view</button>
                        <button type="button" data-domain-view-action="cartoon">Cartoon</button>
                        <button type="button" data-domain-view-action="surface">Surface</button>
                        <button type="button" data-domain-view-action="confidence">pLDDT confidence score</button>
                        <button type="button" data-domain-view-action="fullscreen">Fullscreen</button>
                        <span id="domainViewerControlStatus" role="status" aria-live="polite"></span>
                    </div>
                    <aside id="domainPlddtLegend" class="cell-domain-plddt-legend" aria-label="AlphaFold pLDDT color range" ${choices[activeIndex]?.source === "alphafold" ? "" : "hidden"}>
                        <strong>pLDDT confidence score (0–100)</strong>
                        <div class="plddt-legend-gradient" role="img" aria-label="Low scores are red, transitioning through white to blue at high scores."></div>
                        <div class="plddt-legend-ticks" aria-hidden="true">
                            <span style="left: 0%">0</span><span style="left: 50%">50</span><span style="left: 70%">70</span><span style="left: 90%">90</span><span style="left: 100%">100</span>
                        </div>
                        <div class="plddt-legend-ranges">
                            &lt;50 very low · 50–70 low · 70–90 confident · ≥90 very high
                        </div>
                    </aside>
                    <label class="cell-domain-structure-label" for="cellDomainStructureSelect">PDB / Structure file</label>
                    <select id="cellDomainStructureSelect" ${choices.length ? "" : "disabled"}>
                        ${choices.length
                            ? choices.map((choice, index) => `
                                <option value="${index}" ${index === activeIndex ? "selected" : ""}>
                                    ${escapeHtml(choice.label)}
                                </option>
                            `).join("")
                            : `<option value="">No structure file is currently available.</option>`}
                    </select>
                    <div id="pdb-viewer" class="cell-domain-pdb-viewer"></div>
                </section>
            </div>
        `;

        setupColumnResizer(
            document.querySelector(".cell-domain-workspace"),
            document.querySelector(".cell-domain-track"),
            document.querySelector(".cell-domain-workspace .cellgo-resize-handle"),
            document.querySelector(".cell-domain-structure"),
            240,
            1050
        );

        const structureSelect = document.getElementById("cellDomainStructureSelect");
        const confidenceButton = document.querySelector('[data-domain-view-action="confidence"]');
        confidenceButton.disabled = choices[activeIndex]?.source !== "alphafold";
        confidenceButton.title = "Color directly by per-residue pLDDT scores in the AlphaFold PDB B-factor field.";
        document.querySelectorAll("[data-domain-view-action]").forEach(button => {
            button.addEventListener("click", async () => {
                const action = button.dataset.domainViewAction;
                const status = document.getElementById("domainViewerControlStatus");
                const actions = {
                    reset: () => window.molstarControls.resetCamera(pdbViewer),
                    cartoon: () => window.molstarControls.setCartoon(pdbViewer),
                    surface: () => window.molstarControls.setSurface(pdbViewer),
                    confidence: () => window.molstarControls.setConfidence(pdbViewer),
                    fullscreen: () => window.molstarControls.toggleFullscreen(
                        document.querySelector(".cell-domain-structure")
                    )
                };
                button.disabled = true;
                if (status) {
                    status.textContent = action === "reset" || action === "fullscreen"
                        ? ""
                        : "Updating structure representation…";
                }
                try {
                    await actions[action]();
                    if (status) status.textContent = "";
                }
                catch (error) {
                    console.error("Mol* viewer control failed:", error);
                    if (status) status.textContent = error.message;
                }
                finally {
                    button.disabled = action === "confidence"
                        && window.currentStructureSource !== "alphafold";
                }
            });
        });
        structureSelect.addEventListener("change", async () => {
            const choice = choices[Number(structureSelect.value)];
            if (!choice) return;
            confidenceButton.disabled = choice.source !== "alphafold";
            document.getElementById("domainPlddtLegend").hidden = choice.source !== "alphafold";
            try {
                await loadDomainStructure(choice);
            }
            catch (error) {
                console.error("Failed to switch domain structure:", error);
                const info = document.getElementById("domainExplorerInfo");
                if (info) {
                    info.textContent = `Failed to load structure: ${error.message}`;
                }
            }
        });

        if (choices.length) {
            await loadDomainStructure(choices[activeIndex]);
        }
    }

    async function loadDomainStructure(choice) {
        if (!choice?.url) return;
        if (domainStructureLoadPromise) {
            return domainStructureLoadPromise;
        }

        const structureSelect = document.getElementById("cellDomainStructureSelect");
        if (structureSelect) {
            structureSelect.disabled = true;
        }

        domainStructureLoadPromise = (async () => {
            window.setStructureLoading(true, "Initializing structure viewer…");
            window.molstarControls.resetConfidence(pdbViewer);
            setCurrentPDB(choice.id, choice.url);
            window.currentStructureSource = choice.source;
            const ready = await initViewer();
            if (!ready) {
                const message = "Mol* structure viewer initialization failed. Check the browser console.";
                window.setStructureLoading(false, message, true);
                return false;
            }
            const loaded = await showPDBStructure(choice.url);
            if (!loaded) return;
            const selection = window.currentDomainSelection;
            if (selection) {
                await highlightStructureRange(selection.start, selection.end);
            }
        })();

        try {
            await domainStructureLoadPromise;
        }
        finally {
            domainStructureLoadPromise = null;
            if (structureSelect) {
                structureSelect.disabled = false;
            }
        }
    }

    function renderStructureTab(data) {
        const protein = data.protein;
        const choices = getStructureChoices(data);
        const formatMetric = (value, digits) => {
            if (value === null || value === undefined || value === "") {
                return "—";
            }
            const numericValue = Number(value);
            return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : "—";
        };
        const requestedUrl = new URLSearchParams(window.location.search).get("structure");
        const active = choices.find(choice =>
            choice.url === requestedUrl || choice.originalUrl === requestedUrl
        )
            || choices.find(choice => choice.source === data.active_structure?.source)
            || choices.find(choice => choice.url)
            || null;
        const activeIndex = choices.indexOf(active);

        const renderViewerControls = () => `
            <div class="cell-tab-viewer-controls" aria-label="Structure viewer controls">
                <button type="button" data-embedded-viewer-action="reset" disabled>Reset view</button>
                <button type="button" data-embedded-viewer-action="cartoon" disabled>Cartoon</button>
                <button type="button" data-embedded-viewer-action="surface" disabled>Surface</button>
                <button type="button" data-embedded-viewer-action="confidence" disabled>pLDDT confidence</button>
                <button type="button" data-embedded-viewer-action="fullscreen" disabled>Fullscreen</button>
                <span id="cellPdbControlStatus" role="status" aria-live="polite"></span>
            </div>
        `;

        const renderConfidenceLegend = choice => `
            <aside class="cell-tab-plddt-legend" aria-label="AlphaFold pLDDT color range" ${choice?.source === "alphafold" ? "" : "hidden"}>
                <strong>pLDDT confidence score (0–100)</strong>
                <div class="cell-tab-plddt-gradient" role="img" aria-label="Low scores are red, transitioning through white to blue at high scores."></div>
                <div class="cell-tab-plddt-ticks" aria-hidden="true">
                    <span style="left: 0%">0</span><span style="left: 50%">50</span><span style="left: 70%">70</span><span style="left: 90%">90</span><span style="left: 100%">100</span>
                </div>
                <div class="cell-tab-plddt-ranges">
                    &lt;50 very low · 50–70 low · 70–90 confident · ≥90 very high
                </div>
            </aside>
        `;

        const renderMetadata = choice => {
            if (!choice) {
                return `<p class="cell-tab-metadata-empty">No structure file is currently available.</p>`;
            }

            if (choice.source === "alphafold") {
                return `
                    <div class="cell-tab-metadata-source-row">
                        <span class="cell-tab-metadata-source">Selected: ${escapeHtml(choice.label)}</span>
                        ${renderViewerControls()}
                    </div>
                    <dl>
                        <div><dt>Mean pLDDT</dt><dd>${formatMetric(choice.metadata?.confidence_avg, 1)}</dd></div>
                    </dl>
                `;
            }

            if (choice.source === "swiss_model") {
                const coverage = choice.metadata?.coverage;
                const coveragePercent = coverage === null || coverage === undefined || coverage === ""
                    ? "—"
                    : `${formatMetric(Number(coverage) * 100, 1)}%`;
                return `
                    <div class="cell-tab-metadata-source-row">
                        <span class="cell-tab-metadata-source">Selected: ${escapeHtml(choice.label)}</span>
                        ${renderViewerControls()}
                    </div>
                    <dl>
                        <div><dt>QMEAN</dt><dd>${formatMetric(choice.metadata?.qmean, 3)}</dd></div>
                        <div><dt>GMQE</dt><dd>${formatMetric(choice.metadata?.gmqe, 3)}</dd></div>
                        <div><dt>Coverage</dt><dd>${coveragePercent}</dd></div>
                    </dl>
                `;
            }

            return `
                <div class="cell-tab-metadata-source-row">
                    <span class="cell-tab-metadata-source">Selected: ${escapeHtml(choice.label)}</span>
                    ${renderViewerControls()}
                </div>
                <p class="cell-tab-metadata-empty">${choice.source === "pdb" ? "Experimental structure; no predicted model quality score." : "No quality metrics are available for this source."}</p>
            `;
        };

        if (active?.url) {
            currentPdbId = active.id || null;
            currentPdbUrl = active.url;
            window.currentStructureSource = active.source || null;
        }

        document.getElementById("cellPdbContent").innerHTML = `
            ${proteinHeadingHtml(protein)}
            <div class="cell-tab-structure-header">
                <section id="cellPdbMetadata" class="cell-tab-metadata" aria-live="polite">
                    ${renderMetadata(active)}
                </section>
                ${renderConfidenceLegend(active)}
                <div class="cell-tab-structure-picker">
                    <label class="cell-tab-structure-select-label" for="cellPdbStructureSelect">Select a structure source</label>
                    <select id="cellPdbStructureSelect" class="cell-tab-structure-select" disabled>
                        ${choices.length
                            ? choices.map((choice, index) => `
                                <option value="${index}" ${index === activeIndex ? "selected" : ""}>
                                    ${escapeHtml(choice.label)}
                                </option>
                            `).join("")
                            : `<option value="">No structure file is currently available.</option>`}
                    </select>
                </div>
            </div>
            <iframe id="cellPdbFrame" class="cell-tab-feature-frame" title="Structure Viewer" allowfullscreen></iframe>
        `;

        const frame = document.getElementById("cellPdbFrame");
        let selectedChoice = active;
        const updateViewerControls = (enabled, loading = false) => {
            document.querySelectorAll("#cellPdbContent [data-embedded-viewer-action]").forEach(button => {
                button.disabled = !enabled
                    || loading
                    || (button.dataset.embeddedViewerAction === "confidence" && selectedChoice?.source !== "alphafold");
            });
        };
        if (structureFrameMessageHandler) {
            window.removeEventListener("message", structureFrameMessageHandler);
        }
        structureFrameMessageHandler = event => {
            if (
                event.source !== frame.contentWindow
                || event.origin !== window.location.origin
                || event.data?.type !== "structure-viewer-state"
            ) {
                return;
            }
            const loading = event.data.state === "loading";
            const structureSelect = document.getElementById("cellPdbStructureSelect");
            if (structureSelect) structureSelect.disabled = loading || choices.length === 0;
            updateViewerControls(event.data.state === "ready", loading);
        };
        window.addEventListener("message", structureFrameMessageHandler);
        frame.addEventListener("load", () => frame.contentWindow?.dispatchEvent(new Event("resize")));
        document.getElementById("cellPdbMetadata").addEventListener("click", async event => {
            const button = event.target.closest("[data-embedded-viewer-action]");
            if (!button || button.disabled) return;

            const embeddedWindow = frame.contentWindow;
            const controls = embeddedWindow?.molstarControls;
            const viewer = embeddedWindow?.pdbViewer;
            const actions = {
                reset: () => controls.resetCamera(viewer),
                cartoon: () => controls.setCartoon(viewer),
                surface: () => controls.setSurface(viewer),
                confidence: () => controls.setConfidence(viewer),
                fullscreen: () => controls.toggleFullscreen(
                    embeddedWindow.document.getElementById("pdb-full-viewer")
                )
            };
            const status = document.getElementById("cellPdbControlStatus");
            updateViewerControls(false, true);
            if (status) status.textContent = "Updating structure view…";
            try {
                await actions[button.dataset.embeddedViewerAction]();
                if (status) status.textContent = "";
            } catch (error) {
                console.error("PDB Viewer control failed:", error);
                if (status) status.textContent = error.message || String(error);
            } finally {
                updateViewerControls(true);
            }
        });
        document.getElementById("cellPdbStructureSelect").addEventListener("change", event => {
            const choice = choices[Number(event.currentTarget.value)];
            if (!choice) return;
            event.currentTarget.disabled = true;
            selectedChoice = choice;
            document.querySelector(".cell-tab-plddt-legend").hidden = choice.source !== "alphafold";
            updateViewerControls(false, true);
            document.getElementById("cellPdbMetadata").innerHTML = renderMetadata(choice);
            setCurrentPDB(choice.id, choice.url);
            window.currentStructureSource = choice.source;
            openPDBViewer(frame.contentWindow);
        });

        return { frame, active };
    }

    function renderSequenceTab(data) {
        const protein = data.protein;
        const content = document.getElementById("cellSequenceContent");
        content.innerHTML = `
            ${proteinHeadingHtml(protein)}
            <iframe id="cellSequenceFrame" class="cell-tab-feature-frame" title="Sequence and 3D Viewer"></iframe>
        `;
        return document.getElementById("cellSequenceFrame");
    }

    function renderPapersTab(data) {
        const protein = data.protein;
        document.getElementById("cellPapersContent").innerHTML = `
            <h2>${escapeHtml(protein.protein_name || protein.gene_name || protein.protein_id)} Papers</h2>
            <iframe id="cellPapersFrame" class="cell-tab-feature-frame" title="Papers"></iframe>
        `;
        return document.getElementById("cellPapersFrame");
    }

    function renderNetworkTab(data) {
        const protein = data.protein;
        document.getElementById("cellNetworkContent").innerHTML = `
            ${proteinHeadingHtml(protein)}
            <iframe id="cellNetworkFrame" class="cell-tab-feature-frame" title="Network"></iframe>
        `;
        return document.getElementById("cellNetworkFrame");
    }

    async function initializeTab(tabId, data) {
        switch (tabId) {
            case "domain":
                await renderDomainTab(data);
                return;
            case "pdbviewer": {
                const { frame, active } = renderStructureTab(data);
                if (active?.url) {
                    openPDBViewer(frame.contentWindow);
                } else {
                    throw new Error("No experimental or predicted structure is available for the current protein.");
                }
                return;
            }
            case "sequence": {
                const frame = renderSequenceTab(data);
                await openSequenceView(frame.contentWindow);
                return;
            }
            case "papers": {
                const frame = renderPapersTab(data);
                openExpandedView(frame.contentWindow);
                return;
            }
            case "network": {
                const frame = renderNetworkTab(data);
                if (data.protein.gene_name) {
                    openNetworkWindow(data.protein.gene_name, frame.contentWindow);
                } else {
                    throw new Error("No gene name is available for the current protein; cannot load the network.");
                }
                return;
            }
            default:
                return;
        }
    }

    window.loadCellGoTab = async function (tabId) {
        if (tabId === "cell_go" || initializedTabs.has(tabId)) {
            return;
        }

        const existingInitialization = tabInitializationPromises.get(tabId);
        if (existingInitialization) {
            return existingInitialization;
        }

        const initialization = (async () => {
            try {
                const data = await loadProteinData();
                await initializeTab(tabId, data);
                initializedTabs.add(tabId);
            }
            catch (error) {
                console.error(`Failed to load tab ${tabId}:`, error);
                setTabMessage(tabId, `Failed to load: ${error.message}`, true);
            }
            finally {
                tabInitializationPromises.delete(tabId);
            }
        })();

        tabInitializationPromises.set(tabId, initialization);
        return initialization;
    };

    window.addEventListener("DOMContentLoaded", () => {
        setupColumnResizer(
            document.getElementById("cellGoWorkspace"),
            document.getElementById("cell-container"),
            document.querySelector("#cellGoWorkspace .cellgo-resize-handle"),
            document.querySelector("#cellGoWorkspace .go-panel"),
            240,
            900
        );
    });
})();

// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 04. Mol* structure viewer (init, load, modal)
// ============================================================

async function initViewer() {
    console.log("===== initViewer =====");

    const container = document.getElementById("pdb-viewer");
    console.log("PDB container:", container);

    if (!container) {
        console.warn("No #pdb-viewer container");
        return false;
    }

    if (typeof molstar === "undefined") {
        console.error("Mol* library not loaded");
        return false;
    }

    if (pdbViewer) {
        console.log("Mol* already initialized");
        return true;
    }

    try {
        pdbViewer = await molstar.Viewer.create("pdb-viewer", {
            layoutIsExpanded: false,
            layoutShowControls: false,
            layoutShowSequence: false,
            layoutShowLog: false,
            layoutShowRemoteState: false,
            collapseLeftPanel: true,
            collapseRightPanel: true
        });

        console.log("Mol* viewer ready:", pdbViewer);

        // Default select/highlight edge color is green, which clashes
        // with other green accents in the UI — switch to the app's
        // amber accent (#FFD54F, already used for "selected" state
        // elsewhere, e.g. the network view's .keep-selected nodes) for
        // visual consistency. Non-fatal if it fails.
        //setStructureSelectionColor(0xE91E63, 0xE91E63)  // Pink
        // setStructureSelectionColor(0x00BCD4, 0x00BCD4)  // Cyan
        // setStructureSelectionColor(0xFFD54F, 0xFFD54F); // Yellow
        setStructureSelectionColor(0xE91E63, 0x00BCD4)  // Selection = amber, mouse hover = cyan
        return true;
    }
    catch (error) {
        console.error("Mol* initialization error:", error);
        pdbViewer = null;
        return false;
    }
}

// ------------------------------------------------------------
// Change the color used for selected/interactive-selection
// residues (green by default). Pass a 24-bit hex number, e.g.
// 0xFFD54F for amber, 0xE91E63 for pink, 0x00BCD4 for cyan.
//
// The selection/highlight visuals in Mol* are drawn as an EDGE
// (outline) effect, controlled by the `marking` prop group —
// NOT `renderer.selectColor` (that prop exists but isn't what
// actually paints the on-screen highlight, confirmed by testing:
// setting it took effect with no error, but the outline stayed
// green until `marking.selectEdgeColor` was changed instead).
//
//   marking.selectEdgeColor    — persistent "select" state (green by default)
//   marking.highlightEdgeColor — transient mouseover highlight (also green by default)
// ------------------------------------------------------------

function setStructureSelectionColor(selectHexColor, highlightHexColor) {
    if (!pdbViewer || !pdbViewer.plugin || !pdbViewer.plugin.canvas3d) {
        console.warn("Mol* viewer has not been initialized; cannot set selection color.");
        return false;
    }

    try {
        const marking = pdbViewer.plugin.canvas3d.props.marking;

        const nextMarking = { ...marking };

        if (selectHexColor !== undefined && selectHexColor !== null) {
            nextMarking.selectEdgeColor = selectHexColor;
        }

        if (highlightHexColor !== undefined && highlightHexColor !== null) {
            nextMarking.highlightEdgeColor = highlightHexColor;
        }

        pdbViewer.plugin.canvas3d.setProps({ marking: nextMarking });

        console.log(
            "Selection/highlight edge color set to:",
            "select=#" + nextMarking.selectEdgeColor.toString(16).padStart(6, "0"),
            "highlight=#" + nextMarking.highlightEdgeColor.toString(16).padStart(6, "0")
        );
        return true;
    }
    catch (error) {
        console.error("Failed to set selection color:", error);
        return false;
    }
}

window.setStructureSelectionColor = setStructureSelectionColor;

let structureLoadControls = [];
let structureLoadingActive = false;

function setStructureLoadStatus(message, isError = false) {
    const container = document.getElementById("pdb-viewer");
    if (!container) return;

    let status = document.getElementById("structure-load-status");
    if (!status) {
        status = document.createElement("div");
        status.id = "structure-load-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        container.append(status);
    }

    status.setAttribute("role", isError ? "alert" : "status");
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
    status.textContent = message;
}

function setStructureLoading(isLoading, message = "", isError = false) {
    document.getElementById("pdb-viewer")?.setAttribute("aria-busy", String(isLoading));
    if (isLoading && !structureLoadingActive) {
        structureLoadingActive = true;
        structureLoadControls = Array.from(document.querySelectorAll(
            '[onclick*="showPDBStructure"], #cellDomainStructureSelect, [data-structure-index], [data-domain-view-action], [data-viewer-action]'
        )).map(control => {
            const state = {
                control,
                disabled: "disabled" in control ? control.disabled : undefined,
                tabIndex: control.getAttribute("tabindex"),
                ariaDisabled: control.getAttribute("aria-disabled"),
                pointerEvents: control.style.pointerEvents
            };
            if ("disabled" in control) control.disabled = true;
            else control.setAttribute("tabindex", "-1");
            control.setAttribute("aria-disabled", "true");
            control.style.pointerEvents = "none";
            return state;
        });
    } else if (!isLoading && structureLoadingActive) {
        structureLoadingActive = false;
        for (const state of structureLoadControls) {
            if (!state.control.isConnected) continue;
            if (state.disabled !== undefined) state.control.disabled = state.disabled;
            if (state.tabIndex === null) state.control.removeAttribute("tabindex");
            else state.control.setAttribute("tabindex", state.tabIndex);
            if (state.ariaDisabled === null) state.control.removeAttribute("aria-disabled");
            else state.control.setAttribute("aria-disabled", state.ariaDisabled);
            state.control.style.pointerEvents = state.pointerEvents;
        }
        structureLoadControls = [];
    }

    setStructureLoadStatus(message, isError);
}

window.setStructureLoading = setStructureLoading;

async function clearPDBViewer() {
    if (!pdbViewer) {
        return;
    }

    try {
        if (pdbViewer.plugin && typeof pdbViewer.plugin.clear === "function") {
            await pdbViewer.plugin.clear();
        }
    }
    catch (error) {
        console.warn("Mol* clear failed:", error);
    }
}

async function showPDBStructure(pdb_url) {
    console.log("Loading structure:", pdb_url);

    if (!pdb_url) {
        const message = "No structure file was specified.";
        console.warn(message);
        setStructureLoading(false, message, true);
        return false;
    }

    const structureSource = window.currentStructureSource;
    const proteinId = window.currentProteinId
        || (window.currentProtein && (window.currentProtein.protein_id || window.currentProtein.uniprot_acc));
    const structureUrl = ["alphafold", "swiss_model"].includes(structureSource) && proteinId
        ? `/data/${structureSource === "alphafold" ? "alphafold" : "swiss_model"}/${encodeURIComponent(proteinId)}.pdb`
        : pdb_url;
    currentPdbUrl = structureUrl;

    const match = String(pdb_url).match(/\/([^\/]+)\.(pdb|cif)$/i);

    if (match) {
        currentPdbId = match[1].replace(/\.(pdb|cif)$/i, "");
    }

    console.log("currentPdbId:", currentPdbId);
    console.log("currentPdbUrl:", currentPdbUrl);

    setStructureLoading(true, "Initializing structure viewer…");
    if (!pdbViewer) {
        const ready = await initViewer();

        if (!ready) {
            const message = "Mol* viewer initialization failed; the structure could not be loaded.";
            console.error(message);
            setStructureLoading(false, message, true);
            return false;
        }
    }

    // ------------------------------------------------------------
    // Sanity-check the response BEFORE handing it to Mol*.
    // A 404/500 page, an empty body, or a mislabeled format makes
    // Mol*'s internal preset builder throw a cryptic, uncatchable
    // "Cannot read properties of undefined (reading 'entry')"
    // deep inside its own async state-transaction — so we verify
    // it looks like real structure data first and fail loudly here
    // instead.
    // ------------------------------------------------------------
    setStructureLoadStatus("Downloading structure file…");
    let rawText;

    try {
        let probe;
        try {
            probe = await fetch(structureUrl);
        } catch (error) {
            throw new Error(`Could not connect to or read the structure file: ${error.message || error}`);
        }

        if (!probe.ok) {
            if (probe.status === 404 || probe.status === 410) {
                throw new Error(`Structure file not found (HTTP ${probe.status}): ${structureUrl}`);
            }
            throw new Error(`Structure file request failed (HTTP ${probe.status}): ${structureUrl}`);
        }

        rawText = await probe.text();
    }
    catch (error) {
        console.error("Structure fetch failed:", pdb_url, error);
        setStructureLoading(false, error.message || String(error), true);
        return false;
    }

    const lowerUrl = String(structureUrl).toLowerCase();
    const ext = lowerUrl.endsWith(".cif") || lowerUrl.endsWith(".mmcif") ? "mmcif" : "pdb";

    if (!isLikelyStructureFile(rawText, ext)) {
        const message = `Incorrect file format: the response is not a valid ${ext === "mmcif" ? "mmCIF" : "PDB"} structure file.`;
        console.error(message, structureUrl, rawText.slice(0, 200));
        setStructureLoading(false, message, true);
        return false;
    }

    try {
        await clearPDBViewer();

        setStructureLoadStatus("Parsing structure and building the 3D view…");
        let data;
        try {
            data = await pdbViewer.plugin.builders.data.download({
                url: structureUrl,
                isBinary: false
            });
        } catch (error) {
            throw new Error(`Mol* failed to download structure data: ${error.message || error}`);
        }

        let trajectory;
        try {
            trajectory = await pdbViewer.plugin.builders.structure.parseTrajectory(data, ext);
        } catch (error) {
            throw new Error(`Mol* could not parse this structure file: ${error.message || error}`);
        }

        console.log("Mol* data:", data);

        try {
            await pdbViewer.plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");
        } catch (error) {
            throw new Error(`Mol* failed to create the structure view: ${error.message || error}`);
        }

        console.log("Structure loaded:", pdb_url);
        setStructureLoading(false);
        return true;
    }
    catch (error) {
        console.error("Load structure failed:", pdb_url, error);
        setStructureLoading(false, error.message || String(error), true);
        return false;
    }
}

// Rough content sniff — not a full parser, just enough to catch the
// common failure mode of receiving an HTML error page or an empty
// body where a structure file was expected.
function isLikelyStructureFile(text, ext) {
    if (!text || !text.trim()) {
        return false;
    }

    const head = text.trimStart().slice(0, 500);

    // Obvious non-structure responses (Flask error pages, SPA shells, etc.)
    if (/^<(!doctype|html)/i.test(head)) {
        return false;
    }

    if (ext === "mmcif") {
        return /^data_/im.test(head) || /^_\w/m.test(head) || head.includes("loop_");
    }

    // Legacy PDB format
    return /^(HEADER|ATOM|HETATM|REMARK|TITLE|COMPND|MODEL)\b/m.test(head);
}

function setCurrentPDB(pdbId, pdbUrl) {
    currentPdbId = pdbId || null;
    currentPdbUrl = pdbUrl || null;
    if (pdbId === "AlphaFold") {
        window.currentStructureSource = "alphafold";
    } else if (pdbId === "SWISS-MODEL") {
        window.currentStructureSource = "swiss_model";
    } else if (pdbId === "AlphaFill") {
        window.currentStructureSource = "alphafill";
    } else if (pdbId) {
        window.currentStructureSource = "pdb";
    }

    console.log("Current PDB:", currentPdbId, currentPdbUrl);
}

// ------------------------------------------------------------
// Highlight a residue range in the 3D structure (e.g. clicking a
// domain segment in the domain track, or a lysine site).
//
// This needs Mol*'s internal selection/interactivity API, which —
// when Mol* is loaded via <script src="molstar.js"> instead of a
// bundler — is only reachable through the `molstar.lib` namespace
// (added in relatively recent Mol* releases) or, in even newer
// builds, through a higher-level `viewer.structureInteractivity`
// helper. Which one (if either) is available depends on your
// molstar.js version, so this tries several strategies in order
// and logs a clear diagnostic if none of them work — check the
// console output to see exactly what your bundle exposes.
// ------------------------------------------------------------

async function highlightStructureRange(startResidue, endResidue, options = {}) {
    if (!pdbViewer || !pdbViewer.plugin) {
        console.warn("Mol* viewer has not been initialized; cannot highlight the residue range.");
        return false;
    }

    const chainId = options.chainId || undefined; // undefined = any chain
    const plugin = pdbViewer.plugin;

    // --------------------------------------------------------
    // Strategy 1: newer Viewer.structureInteractivity helper
    // (added specifically "to make it easy to highlight/select
    // elements on the loaded structure"). Confirmed parameter
    // shape from the official docs example:
    //   viewer.structureInteractivity({
    //     elements: { beg_auth_seq_id: 10, end_auth_seq_id: 50 },
    //     action: 'select',
    //   });
    // auth_asym_id (chain) is included only when we actually have
    // one — it's not in the documented minimal example, so treat
    // it as a best-effort addition rather than a confirmed field.
    // --------------------------------------------------------
    if (typeof pdbViewer.structureInteractivity === "function") {
        try {
            const elements = {
                beg_auth_seq_id: startResidue,
                end_auth_seq_id: endResidue
            };

            if (chainId) {
                elements.auth_asym_id = chainId;
            }

            await pdbViewer.structureInteractivity({
                elements: elements,
                action: "select"
            });

            console.log("Highlighted via Viewer.structureInteractivity:", elements);

            // Best-effort: also try to move the camera to the selection.
            // 'select' alone only tints the residues green — it doesn't
            // necessarily zoom the camera. This second call is optional
            // and non-fatal if 'focus' isn't a supported action value.
            try {
                await pdbViewer.structureInteractivity({
                    elements: elements,
                    action: "focus"
                });
            }
            catch (focusError) {
                console.warn("Could not focus the camera on the selected range (the selection itself succeeded):", focusError);
            }

            return true;
        }
        catch (error) {
            console.warn("structureInteractivity call failed; trying another approach:", error);
        }
    }

    // --------------------------------------------------------
    // Strategy 2: molstar.lib low-level API
    // (compileIdListSelection + selection manager)
    // --------------------------------------------------------
    const lib = (typeof molstar !== "undefined") ? molstar.lib : undefined;

    if (!lib) {
        console.error(
            "molstar.lib is not exported by this molstar.js build, so the selection/highlighting API cannot be called programmatically.\n" +
            "Run `console.log(pdbViewer)` and `console.log(molstar.lib)` in the console to check what your Mol* version actually provides, " +
            "then report the results so this function can be adjusted to match."
        );
        return false;
    }

    try {
        // Nested paths under molstar.lib can vary between versions. Check common known locations here;
        // if none are found, print the entire lib for comparison and adjustment.
        const idListModule =
            lib?.molScript?.util?.idList ??
            lib?.["mol-script"]?.util?.["id-list"] ??
            lib?.molScriptUtilIdList;

        if (!idListModule || typeof idListModule.compileIdListSelection !== "function") {
            console.error(
                "Could not find compileIdListSelection in molstar.lib. The actual molstar.lib contents are shown below; " +
                "please report the key structure of this object:",
                lib
            );
            return false;
        }

        const rangeSpec = chainId
            ? `${chainId} ${startResidue}-${endResidue}`
            : `${startResidue}-${endResidue}`;

        const query = idListModule.compileIdListSelection(rangeSpec, "auth");

        plugin.managers.structure.selection.fromCompiledQuery("set", query);

        // Also move the camera to the range and highlight it.
        const sel = plugin.managers.structure.selection.getStructure(
            plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data
        );

        if (sel && sel.loci) {
            plugin.managers.structure.focus.setFromLoci(sel.loci);
            plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: sel.loci });
        }

        console.log("Highlighted via molstar.lib:", rangeSpec);
        return true;
    }
    catch (error) {
        console.error("Failed to highlight the residue range through molstar.lib:", error);
        return false;
    }
}

window.highlightStructureRange = highlightStructureRange;

// ------------------------------------------------------------
// Full-window (popout) PDB viewer
// ------------------------------------------------------------

window.openPDBViewer = function (targetWindow = null) {
    if (!targetWindow) {
        window.openProteinTabView("pdbviewer");
        return;
    }

    console.log("Open PDB Viewer");
    console.log("PDB ID:", currentPdbId);
    console.log("PDB URL:", currentPdbUrl);

    // IMPORTANT: pass the full structure URL, not just the ID.
    // Predicted structures (AlphaFold/AlphaFill/SWISS-MODEL) only
    // ever have currentPdbId set to a literal source-name string
    // ("AlphaFold", etc.) — that's not a usable file path, only
    // currentPdbUrl is. The popout route resolves the URL itself
    // (see /structure-viewer in app.py), so this works uniformly
    // for experimental PDB structures and every predicted-structure
    // source alike.
    if (!currentPdbUrl) {
        alert("No PDB structure is available.");
        return;
    }

    const proteinId = window.currentProteinId
        || (window.currentProtein && (window.currentProtein.protein_id || window.currentProtein.uniprot_acc));
    const structureUrl = ["alphafold", "swiss_model"].includes(window.currentStructureSource) && proteinId
        ? `/data/${window.currentStructureSource === "alphafold" ? "alphafold" : "swiss_model"}/${encodeURIComponent(proteinId)}.pdb`
        : currentPdbUrl;
    const viewerQuery = new URLSearchParams({ url: structureUrl });
    if (window.currentStructureSource) {
        viewerQuery.set("source", window.currentStructureSource);
    }
    const protein = window.currentProtein || {};
    const structureChoices = [];
    const proteinData = window.currentProteinData || window.currentData || {};
    (proteinData.structures || []).forEach(structure => {
        if (structure.pdb_url) {
            structureChoices.push({
                label: `PDB ${structure.pdb_id || ""}`.trim(),
                url: structure.pdb_url,
                source: "pdb"
            });
        }
    });

    const predicted = proteinData.predicted_structures || {};
    const encodedProteinId = encodeURIComponent(protein.protein_id || proteinId || "");
    if (predicted.alphafold?.local_pdb_path) {
        structureChoices.push({
            label: "AlphaFold",
            url: `/data/alphafold/${encodedProteinId}.pdb`,
            source: "alphafold"
        });
    }
    if (predicted.alphafill?.cif_url) {
        structureChoices.push({
            label: "AlphaFill",
            url: predicted.alphafill.cif_url,
            source: "alphafill"
        });
    }
    if (predicted.swiss_model?.local_pdb_path) {
        structureChoices.push({
            label: "SWISS-MODEL",
            url: `/data/swiss_model/${encodedProteinId}.pdb`,
            source: "swiss_model"
        });
    }
    viewerQuery.set("protein", protein.protein_name || protein.gene_name || "");
    viewerQuery.set("gene", protein.gene_name || "");
    viewerQuery.set("uniprot", protein.uniprot_acc || protein.protein_id || "");
    viewerQuery.set("entry", protein.entry_name || "");
    viewerQuery.set("organism", protein.organism || "");
    viewerQuery.set("length", protein.length || "");
    viewerQuery.set("structures", JSON.stringify(structureChoices));
    const viewerUrl = `/structure-viewer?${viewerQuery.toString()}`;
    console.log("Viewer URL:", viewerUrl);

    if (targetWindow) {
        targetWindow.location.href = new URL(viewerUrl, window.location.href).href;
        return;
    }

    window.open(viewerUrl, "_blank", "width=1400,height=900,scrollbars=yes,resizable=yes");
};

// ------------------------------------------------------------
// Predicted-structure detail modal
// ------------------------------------------------------------

function showModelDetail(source) {
    const model = currentData?.predicted_structures?.[source];

    if (!model) {
        return;
    }

    const modal = document.getElementById("structureModal");
    const title = document.getElementById("modalTitle");
    const details = document.getElementById("modalDetails");
    const modalViewerSlot = document.getElementById("modalViewer");

    if (!modal) {
        console.warn("structureModal not found");
        return;
    }

    let structureUrl = "";
    let detailHtml = "";

    if (source === "alphafold") {
        if (title) {
            title.textContent = `AlphaFold predicted structure — ${model.protein_id}`;
        }

        structureUrl = model.pdb_url;

        detailHtml = `
            <p><strong>Model version:</strong>${escapeHtml(model.model_version || "—")}</p>
            <p><strong>Mean pLDDT confidence score:</strong>${model.confidence_avg ? Number(model.confidence_avg).toFixed(1) : "—"}</p>
            <p><strong>Updated:</strong>${escapeHtml(model.updated_at || "—")}</p>
        `;
    }
    else if (source === "alphafill") {
        if (title) {
            title.textContent = `AlphaFill predicted structure — ${model.protein_id}`;
        }

        structureUrl = model.cif_url;

        let ligands = [];

        try {
            ligands = JSON.parse(model.ligands || "[]");
        }
        catch (e) {
            ligands = [];
        }

        detailHtml = `
            <p><strong>Hit count:</strong>${escapeHtml(model.hit_count ?? "—")}</p>
            <p><strong>Ligands：</strong>${ligands.length ? escapeHtml(ligands.join(", ")) : "—"}</p>
            <p><strong>Updated:</strong>${escapeHtml(model.updated_at || "—")}</p>
        `;
    }
    else if (source === "swiss_model") {
        if (title) {
            title.textContent = `SWISS-MODEL predicted structure — ${model.protein_id}`;
        }

        structureUrl = model.coordinates_url;

        detailHtml = `
            <p><strong>Template:</strong>${escapeHtml(model.template || "—")}</p>
            <p><strong>QMEAN：</strong>${model.qmean ? Number(model.qmean).toFixed(2) : "—"}</p>
            <p><strong>GMQE：</strong>${model.gmqe ? Number(model.gmqe).toFixed(2) : "—"}</p>
            <p><strong>Coverage:</strong>${model.coverage ? (Number(model.coverage) * 100).toFixed(1) + "%" : "—"}</p>
        `;
    }

    if (details) {
        details.innerHTML = detailHtml;
    }

    // Move the live viewer element into the modal, remembering where it came from
    const viewerContainer = document.getElementById("pdb-viewer");

    if (viewerContainer && modalViewerSlot && !viewerOriginalParent) {
        viewerOriginalParent = viewerContainer.parentNode;
        viewerPlaceholder = document.createComment("viewer-placeholder");
        viewerOriginalParent.replaceChild(viewerPlaceholder, viewerContainer);
        modalViewerSlot.appendChild(viewerContainer);
    }

    modal.style.display = "flex";

    if (structureUrl) {
        window.currentStructureSource = source;
        showPDBStructure(structureUrl);
    }
}

function closeStructureModal() {
    const modal = document.getElementById("structureModal");

    if (modal) {
        modal.style.display = "none";
    }

    const viewerContainer = document.getElementById("pdb-viewer");

    if (viewerContainer && viewerOriginalParent && viewerPlaceholder) {
        viewerOriginalParent.replaceChild(viewerContainer, viewerPlaceholder);
        viewerOriginalParent = null;
        viewerPlaceholder = null;
    }
}

window.showPDBStructure = showPDBStructure;
window.setCurrentPDB = setCurrentPDB;
window.showModelDetail = showModelDetail;
window.closeStructureModal = closeStructureModal;
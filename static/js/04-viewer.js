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
            collapseLeftPanel: true,
            collapseRightPanel: true
        });

        console.log("Mol* viewer ready:", pdbViewer);

        // Default select/highlight edge color is green, which clashes
        // with other green accents in the UI — switch to the app's
        // amber accent (#FFD54F, already used for "selected" state
        // elsewhere, e.g. the network view's .keep-selected nodes) for
        // visual consistency. Non-fatal if it fails.
        //setStructureSelectionColor(0xE91E63, 0xE91E63)  // 粉紅
        // setStructureSelectionColor(0x00BCD4, 0x00BCD4)  // 青色
        // setStructureSelectionColor(0xFFD54F, 0xFFD54F); // 黃色
        setStructureSelectionColor(0xE91E63, 0x00BCD4)  // 選取=琥珀，滑鼠 hover=青
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
        console.warn("Mol* viewer 尚未初始化，無法設定選取顏色");
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
        console.error("設定選取顏色失敗：", error);
        return false;
    }
}

window.setStructureSelectionColor = setStructureSelectionColor;

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
        console.warn("Empty PDB URL");
        return;
    }

    currentPdbUrl = pdb_url;

    const match = String(pdb_url).match(/\/([^\/]+)\.(pdb|cif)$/i);

    if (match) {
        currentPdbId = match[1].replace(/\.(pdb|cif)$/i, "");
    }

    console.log("currentPdbId:", currentPdbId);
    console.log("currentPdbUrl:", currentPdbUrl);

    if (!pdbViewer) {
        const ready = await initViewer();

        if (!ready) {
            console.error("Mol* viewer not initialized");
            return;
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
    let rawText;

    try {
        const probe = await fetch(pdb_url);

        if (!probe.ok) {
            throw new Error(`HTTP ${probe.status} for ${pdb_url}`);
        }

        rawText = await probe.text();
    }
    catch (error) {
        console.error("Structure fetch failed:", pdb_url, error);
        alert(`無法下載結構檔案：${error.message}`);
        return;
    }

    const ext = String(pdb_url).toLowerCase().endsWith(".cif") ? "mmcif" : "pdb";

    if (!isLikelyStructureFile(rawText, ext)) {
        console.error(
            "回應內容看起來不是有效的",
            ext === "mmcif" ? "mmCIF" : "PDB",
            "檔案（可能是 404 頁面、空內容或格式判斷錯誤）：",
            pdb_url,
            "\nFirst 200 chars:",
            rawText.slice(0, 200)
        );
        alert("載入結構失敗：伺服器回傳的內容不是有效的結構檔（可能是路徑錯誤或格式判斷有誤，請查看主控台）。");
        return;
    }

    try {
        await clearPDBViewer();

        const data = await pdbViewer.plugin.builders.data.download({
            url: pdb_url,
            isBinary: false
        });

        console.log("Mol* data:", data);

        const trajectory = await pdbViewer.plugin.builders.structure.parseTrajectory(data, ext);

        await pdbViewer.plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");

        console.log("Structure loaded:", pdb_url);
    }
    catch (error) {
        console.error("Load structure failed:", pdb_url, error);
        alert(`載入結構失敗：${error.message || error}`);
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
        console.warn("Mol* viewer 尚未初始化，無法高亮殘基範圍");
        return false;
    }

    const chainId = options.chainId || undefined; // undefined = 不限鏈
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
                console.warn("鏡頭 focus 到選取範圍失敗（不影響已完成的選取）：", focusError);
            }

            return true;
        }
        catch (error) {
            console.warn("structureInteractivity 呼叫失敗，改嘗試其他方式：", error);
        }
    }

    // --------------------------------------------------------
    // Strategy 2: molstar.lib low-level API
    // (compileIdListSelection + selection manager)
    // --------------------------------------------------------
    const lib = (typeof molstar !== "undefined") ? molstar.lib : undefined;

    if (!lib) {
        console.error(
            "molstar.lib 沒有被目前這份 molstar.js 匯出，無法用程式呼叫選取/高亮 API。\n" +
            "請在主控台執行 `console.log(pdbViewer)` 和 `console.log(molstar.lib)` 確認你的 Mol* 版本實際提供什麼，" +
            "再回報給我，我可以照實際結構調整這支函式。"
        );
        return false;
    }

    try {
        // 不同版本 molstar.lib 底下的巢狀路徑可能不同，這裡列出已知常見位置，
        // 找不到就把整個 lib 印出來，方便對照調整。
        const idListModule =
            lib?.molScript?.util?.idList ??
            lib?.["mol-script"]?.util?.["id-list"] ??
            lib?.molScriptUtilIdList;

        if (!idListModule || typeof idListModule.compileIdListSelection !== "function") {
            console.error(
                "在 molstar.lib 裡找不到 compileIdListSelection，實際的 molstar.lib 內容如下，" +
                "請把這個物件的 key 結構回報給我：",
                lib
            );
            return false;
        }

        const rangeSpec = chainId
            ? `${chainId} ${startResidue}-${endResidue}`
            : `${startResidue}-${endResidue}`;

        const query = idListModule.compileIdListSelection(rangeSpec, "auth");

        plugin.managers.structure.selection.fromCompiledQuery("set", query);

        // 順便把鏡頭帶過去，並用高亮色標出來
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
        console.error("透過 molstar.lib 高亮殘基範圍失敗：", error);
        return false;
    }
}

window.highlightStructureRange = highlightStructureRange;

// ------------------------------------------------------------
// Full-window (popout) PDB viewer
// ------------------------------------------------------------

window.openPDBViewer = function () {
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
        alert("沒有 PDB structure");
        return;
    }

    const viewerUrl = `/structure-viewer?url=${encodeURIComponent(currentPdbUrl)}`;
    console.log("Viewer URL:", viewerUrl);

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
            title.textContent = `AlphaFold 預測結構 — ${model.protein_id}`;
        }

        structureUrl = model.pdb_url;

        detailHtml = `
            <p><strong>模型版本：</strong>${escapeHtml(model.model_version || "—")}</p>
            <p><strong>平均 pLDDT 信心分數：</strong>${model.confidence_avg ? Number(model.confidence_avg).toFixed(1) : "—"}</p>
            <p><strong>更新時間：</strong>${escapeHtml(model.updated_at || "—")}</p>
        `;
    }
    else if (source === "alphafill") {
        if (title) {
            title.textContent = `AlphaFill 預測結構 — ${model.protein_id}`;
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
            <p><strong>Hit 數量：</strong>${escapeHtml(model.hit_count ?? "—")}</p>
            <p><strong>Ligands：</strong>${ligands.length ? escapeHtml(ligands.join(", ")) : "—"}</p>
            <p><strong>更新時間：</strong>${escapeHtml(model.updated_at || "—")}</p>
        `;
    }
    else if (source === "swiss_model") {
        if (title) {
            title.textContent = `SWISS-MODEL 預測結構 — ${model.protein_id}`;
        }

        structureUrl = model.coordinates_url;

        detailHtml = `
            <p><strong>模板：</strong>${escapeHtml(model.template || "—")}</p>
            <p><strong>QMEAN：</strong>${model.qmean ? Number(model.qmean).toFixed(2) : "—"}</p>
            <p><strong>GMQE：</strong>${model.gmqe ? Number(model.gmqe).toFixed(2) : "—"}</p>
            <p><strong>覆蓋率：</strong>${model.coverage ? (Number(model.coverage) * 100).toFixed(1) + "%" : "—"}</p>
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
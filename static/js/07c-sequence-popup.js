// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 07c. Expanded view: sequence on the left; Mol* at upper right; feature list at lower right.
//
// Sections inside openSequenceView() (top to bottom):
//   Fetch data / resource URLs / feature subcategories (filtering and sorting) / write window (HTML + CSS)
//   3D coverage / SIFTS (UniProt ↔ PDB numbering) / Mol* selection and focus / water molecules
//   Redraw sequence and list / select (single or multiple ranges)
//   Ubiquitination sites (Ub/UBL) / Lys surface accessibility (SASA)
//   3D → sequence, position details, nearby ligands / motif search / distance measurement / evidence details
//   Category buttons and subcategory dropdown / font size / draggable divider
//   Load Mol* / structure menu and switching (automatically updates when the main page changes PDB)
//
// Dependencies: escapeHtml, renderSequence (07-papers-sequence.js),
//       evidenceHtml / ecoListeners（07b-evidence.js）、
//       window.MOLSTAR_JS / MOLSTAR_CSS, currentPdbUrl / currentPdbId from state.js.
// Tests: see tests/README.md.
// ============================================================

// ============================================================
// Sequence + Mol* popup
//   Left: sequence; upper right: Mol*; lower right: feature list
//   Click a sequence residue or list item → select and focus in Mol* (SIFTS maps UniProt to PDB numbering)
// ============================================================
async function openSequenceView(targetWindow = null) {
    if (!targetWindow) {
        window.openProteinTabView("sequence");
        return;
    }

    // Open synchronously after the user clicks; otherwise the browser may block the pop-up.
    const embedded = Boolean(targetWindow);
    const win = targetWindow || window.open("", "_blank", "width=1400,height=850,scrollbars=yes,resizable=yes");
    if (!win) {
        alert("The browser blocked the pop-up. Allow pop-ups and try again.");
        return;
    }
    win.document.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2em;color:#888">Loading…</body></html>`);

    // ---------------- Fetch data ----------------
    let data = window.currentProteinData || window.currentData || null;

    if (!data || !data.protein) {
        const cur = window.currentProtein
            || (typeof currentProtein !== "undefined" ? currentProtein : null);
        const pid = cur && (cur.protein_id || cur.uniprot_acc);

        if (!pid) {
            if (!embedded) win.close();
            alert("Protein data has not been loaded. Select a protein first.");
            return;
        }

        try {
            const res = await fetch(`/api/protein/${encodeURIComponent(pid)}`);
            data = await res.json();

            const pp = data.protein;
            window.currentProteinData = data;
            window.currentData = data;
            window.currentProtein = pp;
            window.currentProteinSequence = pp.sequence || "";
            window.currentProteinFeatures = data.features || [];
        } catch (e) {
            console.error("[UKW] Failed to reload protein data:", e);
            if (!embedded) win.close();
            return;
        }
    }

    const p = data.protein || window.currentProtein || {};
    const seq = window.currentProteinSequence || p.sequence || "";
    const features = (Array.isArray(window.currentProteinFeatures) && window.currentProteinFeatures.length)
        ? window.currentProteinFeatures
        : (data.features || []);
    // ---- Structure source: prefer the PDB currently selected on the main page (state.js: currentPdbId / currentPdbUrl) ----
    function guessFormat(url) {
        return /\.(cif|mmcif|bcif)(\?|$)/i.test(url || "") ? "mmcif" : "pdb";
    }

    function localModelUrl(source) {
        const route = source === "alphafold" ? "alphafold" : "swiss_model";
        return `/data/${route}/${encodeURIComponent(p.protein_id)}.pdb`;
    }

    function structureFromMain() {
        const url = (typeof currentPdbUrl !== "undefined" && currentPdbUrl) || null;
        const id = (typeof currentPdbId !== "undefined" && currentPdbId) || "";
        if (!url) return null;

        const act = data.active_structure;
        if (act && act.url === url) {
            return ["alphafold", "swiss_model"].includes(act.source)
                ? { ...act, url: localModelUrl(act.source) }
                : act;
        }

        const rec = (data.structures || []).find(r =>
            r.pdb_url === url || (id && String(r.pdb_id).toUpperCase() === String(id).toUpperCase()));
        if (rec) {
            return { source: "pdb", id: rec.pdb_id, url: rec.pdb_url || url, format: guessFormat(rec.pdb_url || url) };
        }

        const source = window.currentStructureSource;
        if (["alphafold", "swiss_model"].includes(source)) {
            return { source, id, url: localModelUrl(source), format: "pdb" };
        }

        return {
            source: /^[0-9][A-Za-z0-9]{3}$/.test(id) ? "pdb" : "other",
            id, url, format: guessFormat(url)
        };
    }

    let structure = structureFromMain() || data.active_structure || null;   // {source, id, url, format}
    if (structure && ["alphafold", "swiss_model"].includes(structure.source)) {
        structure = { ...structure, url: localModelUrl(structure.source) };
    }

    if (!seq) {
        console.error("[UKW] No sequence is available to display.");
        if (embedded) {
            win.document.body.textContent = "No sequence is available for the current protein.";
        } else {
            win.close();
        }
        return;
    }

    // ---------------- Resource URLs ----------------
    const MOLSTAR_JS_URL = new URL(window.MOLSTAR_JS || "/static/molstar/molstar.js", location.origin).href;
    const MOLSTAR_CSS_URL = new URL(window.MOLSTAR_CSS || "/static/molstar/molstar.css", location.origin).href;

    // Reuse the main-page CSS (same sequence, button, and category colors).
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
    const styles = stylesheets
        .map(n => n.tagName === "LINK" ? `<link rel="stylesheet" href="${n.href}">` : n.outerHTML)
        .join("\n");
    const hasSequenceStyles = stylesheets.some(node =>
        node.tagName === "LINK"
        && new URL(node.href, document.baseURI).pathname.endsWith("/css/style.css")
    );
    const sequenceStyles = hasSequenceStyles
        ? ""
        : `<link rel="stylesheet" href="${window.SEQUENCE_STYLE_URL || new URL("/static/css/style.css", location.origin).href}">`;

    const categories = [
        ["structural", "Structure"],
        ["localization", "Localization"],
        ["functional", "Functional"],
        ["modification", "Modification"],
        ["variation", "Variation"]
    ];

    let active = [...(window.activeFeatureCategories || [])];
    let pick = null;   // {start, end}

    // ---------------- Feature subcategories (feature type): filtering and sorting ----------------
    const typeSel = {};   // {category: Set(feature_type)}; an empty set means all subcategories in that category.
    categories.forEach(([k]) => { typeSel[k] = new Set(); });

    const catDef = data.feature_categories || window.FEATURE_CATEGORIES || {};
    const typeOrder = {};   // Sort by category order, then subcategory order within each category.
    (function () {
        let n = 0;
        categories.forEach(([k]) => {
            const types = Array.isArray(catDef[k])
                ? catDef[k]
                : Object.keys(window.FEATURE_TYPE_TO_CATEGORY).filter(t => window.FEATURE_TYPE_TO_CATEGORY[t] === k);
            types.forEach(t => { if (!(t in typeOrder)) typeOrder[t] = n++; });
        });
    })();

    const validFeatures = features.filter(ft => {
        const st = Number(ft.start_pos);
        return Number.isFinite(st) && st >= 1;
    });

    // Assign a fixed color to each feature type; avoid yellow so it is not confused with the selection color.
    const TYPE_PALETTE = ["#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171",
        "#38bdf8", "#e879f9", "#4ade80", "#fb7185", "#818cf8", "#22d3ee", "#c084fc", "#f9a8d4",
        "#86efac", "#93c5fd", "#fdba74", "#5eead4", "#d8b4fe"];

    const presentTypes = [...new Set(validFeatures.map(ft => ft.feature_type))]
        .sort((a, b) => (typeOrder[a] ?? 999) - (typeOrder[b] ?? 999));
    const typeColor = {};
    presentTypes.forEach((t, i) => { typeColor[t] = TYPE_PALETTE[i % TYPE_PALETTE.length]; });

    // Put broad feature types (such as CHAIN) first; write their styles before narrower types (such as HELIX), which override them.
    function injectTypeColors() {
        const st = doc.createElement("style");
        st.id = "type-colors";
        st.textContent = presentTypes
            .map(t => `#seq-box .res.feature-${String(t).toLowerCase()} { background:${typeColor[t]}; }`)
            .join("\n");
        doc.head.appendChild(st);
    }

    function visibleFeatures() {
        return validFeatures.filter(ft => {
            const cat = window.FEATURE_TYPE_TO_CATEGORY[ft.feature_type];
            if (active.length && !active.includes(cat)) return false;
            const sel = typeSel[cat];
            return !sel || sel.size === 0 || sel.has(ft.feature_type);
        });
    }

    function sortFeatures(list) {
        return list.slice().sort((a, b) =>
            (typeOrder[a.feature_type] ?? 999) - (typeOrder[b.feature_type] ?? 999)
            || String(a.feature_type).localeCompare(String(b.feature_type))
            || Number(a.start_pos) - Number(b.start_pos)
            || Number(a.end_pos || a.start_pos) - Number(b.end_pos || b.start_pos));
    }

    // ---------------- Write to the window ----------------
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(p.protein_name || "")} (${escapeHtml(p.gene_name || "")}) - Sequence + 3D</title>
${styles}
${sequenceStyles}
<link rel="stylesheet" href="${MOLSTAR_CSS_URL}">
<style>
    ${embedded ? "#sequence-heading { display:none; }" : ""}
    html, body { height:100%; margin:0; background:#fff; color:#222;
        font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif; }

    #app { display:grid; grid-template-columns:2fr 6px 1fr; height:100vh; }
    #left, #right { min-width:0; min-height:0; }
    #left { overflow:auto; padding:12px 14px; }
    #right { display:grid; grid-template-rows:60% 6px 1fr; }

    .splitter { background:#e5e7eb; transition:background .15s; }
    .splitter:hover, .splitter.dragging { background:#2563eb; }
    #split-v { cursor:col-resize; }
    #split-h { cursor:row-resize; }
    body.dragging-v, body.dragging-v * { cursor:col-resize !important; user-select:none; }
    body.dragging-h, body.dragging-h * { cursor:row-resize !important; user-select:none; }
    body.dragging-v #mol-host, body.dragging-h #mol-host { pointer-events:none; }

    #seq-box { overflow-x:auto; font-size:var(--seq-size,15px); }
    #seq-box .res { font-size:inherit; cursor:pointer; }
    #seq-box .res.picked { background:#facc15 !important; outline:2px solid #111; border-radius:2px; opacity:1 !important; }
    /* 3D structure coverage: underline residues present in the structure in blue; dim those absent. */
    #seq-box .res.has-3d { border-bottom:3px solid #2563eb; }
    #seq-box .res.no-3d { opacity:.4; }
    .list-item.no-3d-item { opacity:.5; }
    .list-item.no-3d-item .list-head span::after { content:" · no 3D"; color:#999; font-size:.85em; }
    #cov-info { color:#555; font-size:.85em; margin:2px 0 6px; }
    #cov-info .cov-bar { display:inline-block; width:22px; border-bottom:3px solid #2563eb; vertical-align:middle; margin-right:4px; }

    #mol { position:relative; min-height:0; background:#f3f4f6; overflow:hidden; }
    #mol-host { position:absolute; inset:0; }
    #mol-toolbar { position:absolute; top:6px; left:6px; right:6px; z-index:1000;
        display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:6px;
        pointer-events:none; }
    #pdb-picker, #structure-controls { position:relative; pointer-events:auto; }
    #pdb-picker select { padding:3px 6px; border:1px solid #ccc; border-radius:5px; background:#fff; font-size:.85em; max-width:220px; }
    #structure-controls { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px; }
    #structure-controls button { padding:4px 6px; border:1px solid #c7cdd4; border-radius:5px;
        background:#fff; color:#344054; cursor:pointer; font-size:.75em; }
    #structure-controls button:disabled { opacity:.5; cursor:not-allowed; }
    #structure-control-status { flex-basis:100%; min-height:1em; color:#667085; text-align:right; font-size:.72em; }
    #structure-details { position:absolute; top:42px; left:6px; z-index:1000; max-width:calc(100% - 12px);
        padding:5px 8px; border:1px solid #d0d5dd; border-radius:5px; background:rgba(255,255,255,.94);
        color:#344054; font-size:.72em; pointer-events:none; }
    #structure-details[hidden] { display:none; }
    #structure-details dl { display:flex; flex-wrap:wrap; gap:2px 12px; margin:0; }
    #structure-details dl div { display:flex; gap:4px; }
    #structure-details dt { color:#667085; }
    #structure-details dd { margin:0; font-weight:600; }
    #sequence-plddt-legend strong { display:block; font-size:.95em; }
    #sequence-plddt-gradient { height:8px; margin:3px 0 2px; border:1px solid rgba(52,64,84,.2);
        border-radius:5px; background:linear-gradient(90deg,#bf2222 0%,#fff 50%,#3361e1 100%); }
    #sequence-plddt-ranges { color:#667085; font-size:.9em; }
    #mol-msg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        color:#888; z-index:5; pointer-events:none; text-align:center; padding:1em; }
    #list-wrap { display:flex; flex-direction:column; min-height:0; min-width:0; position:relative; z-index:20; }
    #list-head { padding:6px 10px; border-bottom:1px solid #e5e7eb; background:#fafafa; }
    #list-head .feature-category-bar { margin:0; }
    .cat-hint { color:#999; font-size:.75em; margin-top:4px; }
    #list { flex:1; min-height:0; overflow:auto; padding:8px 12px; }

    .cat-wrap { position:relative; display:inline-flex; }
    .cat-wrap .feature-category-btn { border-radius:6px 0 0 6px; }
    .cat-caret { padding:5px 7px; border:1px solid var(--cd, #999); border-left:0; border-radius:0 6px 6px 0;
        background:var(--cl, #eee); color:var(--cd, #333); cursor:pointer; font-size:.8em; }
    .cat-wrap.active .cat-caret { background:var(--cd, #333); color:#fff; }
    .cat-panel { display:none; position:absolute; top:calc(100% + 4px); left:0; z-index:3000; min-width:210px; max-height:280px;
        overflow:auto; background:#fff; border:1px solid #ccc; border-radius:8px; padding:6px 8px; box-shadow:0 6px 18px rgba(0,0,0,.18); }
    .cat-panel.align-right { left:auto; right:0; }
    .cat-wrap.open .cat-panel { display:block; }
    .cat-panel-tools { display:flex; gap:12px; font-size:.8em; margin-bottom:4px; }
    .cat-panel-tools a { color:#2563eb; cursor:pointer; }
    .cat-opt { display:flex; align-items:center; gap:6px; padding:2px 0; font-size:.85em; cursor:pointer; white-space:nowrap; }
    .cat-opt em { margin-left:auto; color:#888; font-style:normal; font-size:.9em; }
    .cat-empty, .cat-note { color:#888; font-size:.8em; padding:2px 0; }
    .type-head { position:sticky; top:-8px; background:#fff; z-index:1; margin:8px 0 2px; padding:3px 4px; font-weight:600; font-size:.85em;
        color:var(--cd, #333); border-bottom:2px solid var(--cd, #ccc); }
    .type-head span { color:#888; font-weight:400; }
    .type-head { display:flex; align-items:center; gap:6px; }
    .sw { display:inline-block; width:12px; height:12px; border-radius:3px; flex:none; border:1px solid rgba(0,0,0,.15); }
    .type-pick, .opt-pick { border:1px solid #bbb; background:#fff; border-radius:4px; cursor:pointer; font-size:.78em; padding:1px 6px; color:#333; }
    .type-pick { margin-left:auto; }
    .type-pick:hover, .opt-pick:hover { background:#facc15; border-color:#111; }

    /* Ubiquitination sites */
    .ub-wrap { position:relative; display:inline-flex; margin-left:6px; }
    .ub-btn, .ub-caret { padding:5px 12px; border:1px solid #374151; background:#f3f4f6; color:#374151; cursor:pointer; }
    .ub-btn { border-radius:6px 0 0 6px; }
    .ub-caret { padding:5px 7px; border-left:0; border-radius:0 6px 6px 0; font-size:.8em; }
    .ub-wrap.active .ub-btn, .ub-wrap.active .ub-caret { background:#374151; color:#fff; }
    .ub-btn:disabled { opacity:.5; cursor:not-allowed; }
    .ub-panel { display:none; position:absolute; top:calc(100% + 4px); left:0; z-index:3000; min-width:230px; max-height:300px; overflow:auto;
        background:#fff; border:1px solid #ccc; border-radius:8px; padding:6px 8px; box-shadow:0 6px 18px rgba(0,0,0,.18); }
    .ub-panel.align-right { left:auto; right:0; }
    .ub-wrap.open .ub-panel { display:block; }
    .ub-opt { display:flex; align-items:center; gap:6px; padding:2px 0; font-size:.85em; cursor:pointer; white-space:nowrap; }
    .ub-opt em { margin-left:auto; color:#888; font-style:normal; }
    .ub-panel-tools { display:flex; gap:12px; font-size:.8em; margin-bottom:4px; }
    .ub-panel-tools a { color:#2563eb; cursor:pointer; }
    #seq-box .res.sasa-exp  { box-shadow:inset 0 5px 0 #16a34a; }
    #seq-box .res.sasa-part { box-shadow:inset 0 5px 0 #d97706; }
    #seq-box .res.sasa-bur  { box-shadow:inset 0 5px 0 #64748b; }
    .motif-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:6px 0; }
    #motif-input { flex:1; min-width:170px; padding:4px 8px; border:1px solid #ccc; border-radius:6px; font-family:monospace; }
    #motif-preset { padding:4px 6px; border:1px solid #ccc; border-radius:6px; max-width:170px; }
    #motif-status { font-size:.82em; color:#666; }
    #seq-box .res.motif-hit { text-decoration:underline wavy #c026d3; text-decoration-thickness:2px; text-underline-offset:3px; }
    #btn-measure.on { background:#2563eb; color:#fff; border-color:#2563eb; }
    #measure-info { padding:6px 10px; background:#f0f9ff; border-bottom:1px solid #e5e7eb; font-size:.85em; line-height:1.6; }
    #measure-info a { color:#2563eb; cursor:pointer; margin-right:10px; }
    #measure-info .m-val { font-weight:700; }
    #pos-info { max-height:40%; overflow:auto; padding:6px 10px; background:#fffdf5; border-bottom:1px solid #e5e7eb; font-size:.85em; }
    #pos-info .pos-head { display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap; }
    #pos-info .pos-head b { font-size:1.15em; }
    #pos-info .pos-x { margin-left:auto; cursor:pointer; color:#888; padding:0 4px; }
    #pos-info .pos-x:hover { color:#111; }
    #pos-info .pos-tag { border:1px solid #999; border-radius:10px; padding:0 7px; font-size:.85em; }
    #pos-info .pos-feat { border-left:4px solid #ccc; padding:2px 8px; margin:3px 0; }
    #pos-info .pos-feat .muted { color:#666; }
    #pos-info .pos-sub { color:#888; font-size:.85em; margin-top:4px; }
    .sasa-sum { font-size:.82em; color:#444; line-height:1.55; padding:4px 6px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:6px; margin:6px 0; }
    .sasa-chip { font-weight:700; }
    .ub-group { margin:6px 0 2px; font-size:.75em; color:#666; font-weight:600; border-bottom:1px solid #eee; }
    .ub-empty { color:#888; font-size:.85em; padding:6px 4px; }
    .ub-note { color:#555; font-size:.8em; margin-left:6px; align-self:center; }
    #seq-box .res.ub-site { outline:2px solid var(--ubc, #111); outline-offset:-2px; font-weight:800; border-radius:3px; }
    #seq-box .res.ub-site.ub-warn { outline-style:dashed; }
    #seq-box .res.ub-site.ubl-site { outline-style:dotted; outline-width:3px; }
    #seq-box .res.picked.ub-site { outline:3px solid #111; }
    .ub-item .list-note { line-height:1.5; }
    .ub-item a { color:#2563eb; }

    h1 { font-size:1.15em; margin:0 0 .2em; }
    .toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:10px 0; }
    .list-item { padding:6px 10px; margin:4px 0; border-left:4px solid #ccc; cursor:pointer; border-radius:4px; }
    .list-item:hover { background:#f3f4f6; }
    .list-item.picked { background:#fef9c3; }
    .list-item[data-category] { border-left-color:var(--cd, #ccc); }
    .list-head { display:flex; justify-content:space-between; gap:8px; }
    .list-note { color:#666; font-size:.85em; }
    #pick-info { color:#2563eb; font-size:.9em; min-height:1.2em; }
</style>
</head>
<body>
<div id="app">
    <div id="left">
        <header id="sequence-heading">
            <h1>${escapeHtml(p.protein_name || p.gene_name || "")}
                <span style="font-weight:400;color:#888;">(${escapeHtml(p.gene_name || "")})</span></h1>
            <div style="color:#888;">UniProt: ${escapeHtml(p.uniprot_acc || "")} · ${escapeHtml(p.entry_name || "")} · ${escapeHtml(p.organism || "")} · ${escapeHtml(p.length || seq.length)} aa</div>
        </header>
        <div class="toolbar">
            <label style="display:flex;align-items:center;gap:6px;">Font size
                <input type="range" id="seq-size" min="10" max="32" value="15">
                <span id="seq-size-val">15px</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;">
                <input type="checkbox" id="auto-zoom"> Auto-focus
            </label>
            <label style="display:flex;align-items:center;gap:4px;" title="When selecting a residue, also show ligands / ions within 4.5 Å (for example, a ligand at a BINDING site)">
                <input type="checkbox" id="show-lig" checked> Show nearby ligands
            </label>
            <label style="display:flex;align-items:center;gap:4px;" title="Show full ECO evidence descriptions in the list (always shown in the position details panel)">
                <input type="checkbox" id="show-evd"> Show evidence details
            </label>
            <button type="button" class="copy-btn" id="btn-clear">Clear selection</button>
            <button type="button" class="copy-btn" id="btn-measure" title="Click two residues in sequence to measure the distance">📏 Measure distance</button>
            <button type="button" class="copy-btn" id="btn-copy">📋 Copy</button>
        </div>
        <div class="motif-row">
            <input type="text" id="motif-input" placeholder="Motif (regular expression), e.g. K..K or N[^P][ST]" spellcheck="false">
            <select id="motif-preset" title="Common motif examples">
                <option value="">Examples…</option>
                <option value="[VILMFAP]K.[DE]">SUMO ψKxE</option>
                <option value="N[^P][ST]">N-glycosylation N-X-S/T</option>
                <option value="K..K">K..K</option>
                <option value="KEN">KEN box</option>
                <option value="R..L....N">D-box</option>
                <option value="[RK][RK].[ST]">PKA site</option>
            </select>
            <button type="button" class="copy-btn" id="motif-go">Search</button>
            <button type="button" class="copy-btn" id="motif-clear">Clear</button>
            <span id="motif-status"></span>
        </div>
        <div id="pick-info"></div>
        <div id="cov-info"></div>
        <div id="seq-box" class="seq-wrap"></div>
    </div>

    <div id="split-v" class="splitter"></div>

    <div id="right">
        <div id="mol">
            <div id="mol-toolbar">
                <div id="pdb-picker"><select id="pdb-select" title="Switch structure"></select></div>
                <div id="structure-controls" aria-label="Structure viewer controls">
                    <button type="button" data-structure-action="cartoon" disabled>Cartoon</button>
                    <button type="button" data-structure-action="surface" disabled>Surface</button>
                    <button type="button" data-structure-action="confidence" disabled>pLDDT confidence</button>
                    <button type="button" data-structure-action="fullscreen" disabled>Fullscreen</button>
                    <span id="structure-control-status" role="status" aria-live="polite"></span>
                </div>
            </div>
            <div id="structure-details" hidden></div>
            <div id="mol-msg">${structure ? "Loading 3D structure…" : "No 3D structure is available for this protein."}</div>
            <div id="mol-host"></div>
        </div>
        <div id="split-h" class="splitter"></div>
        <div id="list-wrap">
            <div id="list-head">
                <div class="feature-category-bar">
                    ${categories.map(([k, l]) => `
                        <span class="cat-wrap" data-category="${k}">
                            <button type="button" class="feature-category-btn" data-category="${k}">${l}</button><button type="button" class="cat-caret" title="Filter subcategories">▾</button>
                            <div class="cat-panel" id="panel-${k}"></div>
                        </span>`).join("")}
                    <span class="ub-wrap" id="ub-wrap">
                        <button type="button" class="ub-btn" id="ub-toggle" title="Mark ubiquitin / ubiquitin-like (SUMO, NEDD8, ISG15…) modification sites">Ub/UBL sites</button><button type="button" class="ub-caret" id="ub-caret" title="Filter by linkage type">▾</button>
                        <div class="ub-panel" id="ub-panel"></div>
                    </span>
                    <span class="ub-wrap" id="sasa-wrap">
                        <button type="button" class="ub-btn" id="sasa-toggle" title="Surface accessibility (SASA) of each Lys in the 3D structure, cross-referenced with Ub/UBL sites">Lys accessibility</button><button type="button" class="ub-caret" id="sasa-caret" title="Select all">▾</button>
                        <div class="ub-panel" id="sasa-panel"></div>
                    </span>
                </div>
                <div class="cat-hint">▾ Expand to filter subcategories (none selected = show all in the category); the list is grouped and sorted by subcategory</div>
            </div>
            <div id="pos-info" style="display:none"></div>
            <div id="measure-info" style="display:none"></div>
            <div id="list"></div>
        </div>
    </div>
</div>
</body>
</html>`);
    win.document.close();

    const doc = win.document;
    const seqBox = doc.getElementById("seq-box");
    const listBox = doc.getElementById("list");
    const info = doc.getElementById("pick-info");
    const msg = doc.getElementById("mol-msg");
    const structureDetails = doc.getElementById("structure-details");
    const structureControlStatus = doc.getElementById("structure-control-status");

    let viewer = null;
    let loadToken = 0;         // Discard stale asynchronous results when switching structures.
    let siftsMap = null;       // UniProt → PDB mapping (needed only for PDB structures).
    let infoBase = "";

    // ---------------- 3D coverage (mark clickable positions on the sequence) ----------------
    let coverage = null;   // Uint8Array; index = UniProt position; 1 = present in the 3D structure.
    // Get the set of residues with actual atoms in the loaded structure: "chain:auth_seq_id".
    function getObservedResidues() {
        try {
            const mol = getStructureData();
            if (!mol) return null;

            const S = win.molstar.lib.structure;
            const SE = S.StructureElement;
            const SP = S.StructureProperties;
            const loc = SE.Location.create(mol);
            const set = new Set();

            for (const unit of mol.units) {
                const els = unit.elements;
                for (let i = 0; i < els.length; i++) {
                    loc.unit = unit;
                    loc.element = els[i];
                    if (isWaterAt(SP, loc)) continue;   // Water molecules are excluded from selection and coverage calculations.
                    set.add(SP.chain.auth_asym_id(loc) + ":" + SP.residue.auth_seq_id(loc));
                }
            }
            return set;
        } catch (e) {
            console.warn("[UKW] Could not read structure residues; falling back to SIFTS ranges:", e);
            return null;
        }
    }

    function computeCoverage() {
        coverage = new Uint8Array(seq.length + 2);
        if (!structure) return;

        if (structure.source !== "pdb") {
            coverage.fill(1);   // Predicted models such as AlphaFold cover the full sequence.
            return;
        }

        const observed = getObservedResidues();

        (siftsMap || []).forEach(m => {
            const a = Math.max(1, m.unpStart);
            const b = Math.min(seq.length, m.unpEnd);
            for (let u = a; u <= b; u++) {
                const auth = m.authStart + (u - m.unpStart);
                if (!observed || observed.has(m.chain + ":" + auth)) coverage[u] = 1;
            }
        });
    }

    function hasCoverage(s, e) {
        if (!coverage) return true;   // Do not dim anything until the mapping has loaded.
        for (let i = s; i <= e; i++) if (coverage[i]) return true;
        return false;
    }

    function applyCoverageClass() {
        if (!coverage || !structure || structure.source !== "pdb") return;   // No need to mark full-length coverage.
        seqBox.querySelectorAll(".res").forEach(el => {
            const ok = coverage[Number(el.dataset.position)] === 1;
            el.classList.toggle("has-3d", ok);
            el.classList.toggle("no-3d", !ok);
        });
    }

    function renderCoverageInfo() {
        const box = doc.getElementById("cov-info");
        if (!box || !coverage) return;

        if (!structure) { box.textContent = ""; return; }

        if (structure.source !== "pdb") {
            box.textContent = `3D: ${structure.source} predicted structure (full-length coverage)`;
            return;
        }

        const ranges = [];
        let start = null;
        for (let i = 1; i <= seq.length + 1; i++) {
            if (coverage[i] === 1 && start === null) start = i;
            if (coverage[i] !== 1 && start !== null) { ranges.push([start, i - 1]); start = null; }
        }

        const total = ranges.reduce((n, r) => n + (r[1] - r[0] + 1), 0);
        if (!ranges.length) {
            let why = "No mapped range";
            if (siftsStatus.reason.startsWith("fetch-failed")) {
                why = "SIFTS lookup failed (" + siftsStatus.reason.slice(13) + ")";
            } else if (siftsStatus.reason === "acc-mismatch") {
                why = `SIFTS maps this PDB to ${siftsStatus.keys.join(", ")}, which does not match the current protein (${p.uniprot_acc || p.protein_id || "?"})`;
            } else if (siftsStatus.reason === "no-uniprot") {
                why = "SIFTS has no UniProt mapping for this PDB";
            }
            box.innerHTML = `PDB ${escapeHtml(String(structure.id || ""))}：${escapeHtml(why)}`;
            return;
        }

        const text = ranges.map(r => r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`).join("、");

        box.innerHTML = `<span class="cov-bar"></span>PDB ${escapeHtml(String(structure.id || ""))} coverage: ${escapeHtml(text)} (${total} / ${seq.length} aa)`;
    }

    function setInfo(base, note = "") {
        infoBase = base;
        info.textContent = base + note;
    }

    // ---------------- SIFTS: UniProt position → PDB chain / auth_seq_id ----------------
    let siftsStatus = { ok: false, reason: "", keys: [], used: "" };

    async function loadSifts(st = structure) {
        const myToken = loadToken;
        if (!st || st.source !== "pdb") return;

        const pdbId = String(st.id || "").toLowerCase().slice(0, 4);

        try {
            const res = await fetch(`https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/${pdbId}`);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const json = await res.json();
            if (myToken !== loadToken) return;

            const uni = json[pdbId]?.UniProt || {};
            const keys = Object.keys(uni);

            const cands = [p.uniprot_acc, p.protein_id, p.primary_acc, p.accession]
                .filter(Boolean)
                .map(x => String(x).trim().toUpperCase());
            const candsBase = cands.map(x => x.split("-")[0]);
            const hit = keys.find(k => cands.includes(k.toUpperCase()) || candsBase.includes(k.toUpperCase()));

            console.log("[UKW] UniProt entries returned by SIFTS:", keys, "; current protein:", cands);

            siftsStatus = { ok: !!hit, reason: "", keys, used: hit || "" };

            if (!hit) {
                siftsMap = [];
                siftsStatus.reason = keys.length ? "acc-mismatch" : "no-uniprot";
                return;
            }

            // If an endpoint's author_residue_number is null, infer it from the other endpoint and the segment length.
            siftsMap = (uni[hit].mappings || []).map(m => {
                const span = m.unp_end - m.unp_start;
                let a = m.start?.author_residue_number;
                let b = m.end?.author_residue_number;

                if (a == null && b != null) a = b - span;
                else if (b == null && a != null) b = a + span;
                else if (a == null && b == null) {
                    a = m.start?.residue_number;
                    b = (a != null) ? a + span : null;
                }

                return { chain: m.chain_id, unpStart: m.unp_start, unpEnd: m.unp_end, authStart: a, authEnd: b };
            }).filter(m => m.authStart != null);

            console.log("[UKW] SIFTS mapping:", siftsMap);
        } catch (e) {
            if (myToken !== loadToken) return;
            console.error("[UKW] Failed to retrieve SIFTS:", e);
            siftsMap = [];
            siftsStatus = { ok: false, reason: "fetch-failed:" + (e.message || e), keys: [], used: "" };
        }
    }

    // UniProt ranges → rules [{chain, useAuth, a, b}].
    function buildRules(start, end) {
        // Non-PDB structures (such as AlphaFold): numbering matches UniProt; use label_seq_id.
        if (!structure || structure.source !== "pdb") {
            return [{ chain: null, useAuth: false, a: start, b: end }];
        }

        if (!siftsMap || !siftsMap.length) return [];

        const rules = [];

        siftsMap.forEach(m => {
            const s = Math.max(start, m.unpStart);
            const e = Math.min(end, m.unpEnd);
            if (s > e) return;

            rules.push({
                chain: m.chain,
                useAuth: true,
                a: m.authStart + (s - m.unpStart),
                b: m.authStart + (e - m.unpStart)
            });
        });

        return rules;
    }

    // ---------------- Mol*: selection and focus ----------------
    function getStructureData() {
        return viewer?.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data || null;
    }

    // Traverse atoms and build Loci from chain and residue numbers (without relying on structureInteractivity / MolScript).
    function buildLoci(mol, rules) {
        const S = win.molstar.lib.structure;
        const SE = S.StructureElement;
        const SP = S.StructureProperties;

        const loc = SE.Location.create(mol);
        const parts = [];

        for (const unit of mol.units) {
            const els = unit.elements;
            const idx = [];

            for (let i = 0; i < els.length; i++) {
                loc.unit = unit;
                loc.element = els[i];
                if (isWaterAt(SP, loc)) continue;   // Water molecules are excluded from selection and coverage calculations.

                const chain = SP.chain.auth_asym_id(loc);
                const num = SP.residue.auth_seq_id(loc);
                const labelNum = SP.residue.label_seq_id(loc);

                for (const r of rules) {
                    if (r.chain && r.chain !== chain) continue;
                    const n = r.useAuth ? num : labelNum;
                    if (n >= r.a && n <= r.b) {
                        idx.push(i);
                        break;
                    }
                }
            }

            if (idx.length) parts.push({ unit, indices: Int32Array.from(idx) });
        }

        return parts.length ? SE.Loci(mol, parts) : null;
    }

    // Select multiple UniProt ranges at once, synchronizing the sequence and 3D view.
    function showRangesInMolstar(ranges) {
        if (!viewer) return;

        try {
            const plugin = viewer.plugin;
            const mol = getStructureData();
            if (!mol) return;

            plugin.managers.interactivity.lociSelects.deselectAll();
            plugin.managers.structure.selection.clear();

            const rules = ranges.flatMap(([a, b]) => buildRules(a, b));
            console.log(`[UKW] ${ranges.length} UniProt ranges → rules`, rules);

            if (!rules.length) {
                setInfo(infoBase, "(This position is outside the 3D structure range.)");
                return;
            }

            const loci = buildLoci(mol, rules);

            if (!loci) {
                console.warn("[UKW] No matching atoms found in the structure", rules);
                setInfo(infoBase, "(This position is outside the 3D structure range.)");
                return;
            }

            const size = win.molstar.lib.structure.StructureElement.Loci.size(loci);
            console.log(`[UKW] Selected ${size} / ${mol.elementCount} atoms`);

            // Also show nearby ligands (such as ligands at BINDING sites) and metal ions.
            let finalLoci = loci;
            let ligText = "";
            if (doc.getElementById("show-lig")?.checked) {
                try {
                    const lg = nearbyLigands(mol, rules, 4.5);
                    if (lg) {
                        finalLoci = win.molstar.lib.structure.StructureElement.Loci.union(loci, lg.loci);
                        ligText = `; Ligands: ${lg.comps.join(", ")}`;
                    }
                } catch (e) { console.warn("[UKW] Failed to search for nearby ligands:", e); }
            }

            setInfo(infoBase, `（3D：${size} atoms${ligText}）`);

            plugin.managers.structure.selection.fromLoci("set", finalLoci);
            try { plugin.managers.structure.focus.setFromLoci(finalLoci); } catch (e) { /* Skip on older versions. */ }
            // Do not move the camera by default; zoom in only when Auto-focus is enabled.
            if (doc.getElementById("auto-zoom")?.checked) {
                plugin.managers.camera.focusLoci(finalLoci);
            }
        } catch (err) {
            console.error("[UKW] Mol* annotation failed:", err);
        }
    }

    // ---------------- Water molecules ----------------
    const WATER_NAMES = new Set(["HOH", "WAT", "H2O", "DOD", "TIP", "TIP3", "SOL"]);

    function isWaterAt(SP, loc) {
        try {
            const fn = (SP.atom && SP.atom.label_comp_id) || (SP.residue && SP.residue.label_comp_id);
            return fn ? WATER_NAMES.has(String(fn(loc)).toUpperCase()) : false;
        } catch (e) {
            return false;
        }
    }

    // Remove water components after loading a PDB (do not display or include in selections).
    async function removeWater() {
        try {
            const plugin = viewer.plugin;
            const h = plugin.managers.structure.hierarchy;
            await new Promise(r => setTimeout(r, 0));   // Wait for the hierarchy to synchronize.

            const waters = [];
            h.current.structures.forEach(st => {
                st.components.forEach(c => {
                    const key = String(c.key || "");
                    const label = String(c.cell?.obj?.label || "");
                    if (/water/i.test(key) || /^water$/i.test(label)) waters.push(c);
                });
            });

            if (waters.length) {
                await h.remove(waters);
                console.log(`[UKW] Removed ${waters.length} water components.`);
            }
        } catch (e) {
            console.warn("[UKW] Failed to remove water molecules:", e);
        }
    }

    // 3D appearance: pale gray base with a bright contrasting selection color (edit the color codes as needed).
    const COLOR_BASE      = 0xB8C0CC;   // Base: pale blue-gray.
    const COLOR_SELECT    = 0xFACC15;   // Selection: yellow (matches the sequence on the left).
    const COLOR_HIGHLIGHT = 0xFF3D9A;   // Hover: hot pink.

    function applyViewerStyle() {
        if (!viewer) return;
        const plugin = viewer.plugin;

        try {
            plugin.canvas3d?.setProps({
                renderer: {
                    selectColor: COLOR_SELECT,
                    highlightColor: COLOR_HIGHLIGHT,
                    selectStrength: 0.9,
                    highlightStrength: 0.5
                }
            });
        } catch (e) { console.warn("[UKW] Failed to set selection color:", e); }

        try {
            const st = plugin.managers.structure.hierarchy.current.structures[0];
            if (st) {
                plugin.managers.structure.component.updateRepresentationsTheme(
                    st.components.filter(c => !/ligand|ion|branched/i.test(String(c.key || ""))),   // Keep element colors for ligands and ions.
                    { color: "uniform", colorParams: { value: COLOR_BASE } }
                );
            }
        } catch (e) { console.warn("[UKW] Failed to set base color:", e); }
    }

    function clearMolstar() {
        try { viewer?.plugin.managers.structure.focus.clear(); } catch (e) { /* ignore */ }
        try {
            viewer?.plugin.managers.interactivity.lociSelects.deselectAll();
            viewer?.plugin.managers.structure.selection.clear();
        } catch (e) { /* ignore */ }
    }

    // ---------------- Left: sequence ----------------
    function applyPickClass() {
        seqBox.querySelectorAll(".res.picked").forEach(el => el.classList.remove("picked"));
        listBox.querySelectorAll(".list-item.picked").forEach(el => el.classList.remove("picked"));
        if (!pick) return;

        const posSet = new Set();
        const keySet = new Set();
        pick.ranges.forEach(([a, b]) => {
            keySet.add(a + "-" + b);
            for (let i = a; i <= b; i++) posSet.add(i);
        });

        seqBox.querySelectorAll(".res").forEach(el => {
            if (posSet.has(Number(el.dataset.position))) el.classList.add("picked");
        });

        listBox.querySelectorAll(".list-item").forEach(el => {
            if (keySet.has(el.dataset.start + "-" + el.dataset.end)) el.classList.add("picked");
        });
    }

    function redrawSequence() {
        seqBox.innerHTML = renderSequence(seq, visibleFeatures(), active);
        applyCoverageClass();
        applyUbClass();
        applySasaClass();
        applyMotifClass();
        applyPickClass();
    }

    // ---------------- Lower right: feature list ----------------
    function redrawList() {
        // Show all when no categories are selected; group by subcategory and sort each group by position.
        const list = sortFeatures(visibleFeatures());

        if (!list.length) {
            listBox.innerHTML = buildMotifListHtml() + buildSasaListHtml() + buildUbListHtml() + `<div style="color:#888;padding:8px">No matching UniProt features.</div>`;
            applyPickClass();
            return;
        }

        const counts = {};
        list.forEach(ft => { counts[ft.feature_type] = (counts[ft.feature_type] || 0) + 1; });

        let html = "";
        let lastType = null;

        list.forEach(ft => {
            const st = Number(ft.start_pos);
            const en = Number(ft.end_pos || ft.start_pos);
            const cat = window.FEATURE_TYPE_TO_CATEGORY[ft.feature_type] || "other";

            if (ft.feature_type !== lastType) {
                lastType = ft.feature_type;
                const tc = typeColor[ft.feature_type] || "#ccc";
                html += `<div class="type-head" data-category="${cat}" style="border-bottom-color:${tc}">
                    <i class="sw" style="background:${tc}"></i>${escapeHtml(ft.feature_type || "")} <span>(${counts[ft.feature_type]})</span>
                    <button type="button" class="type-pick" data-pick-type="${escapeHtml(ft.feature_type || "")}" title="Select all positions in this subcategory (sequence + 3D)">◎ Select all</button>
                </div>`;
            }

            html += `
                <div class="list-item${hasCoverage(st, en) ? "" : " no-3d-item"}" data-category="${cat}" data-start="${st}" data-end="${en}" style="border-left-color:${typeColor[ft.feature_type] || "#ccc"}">
                    <div class="list-head">
                        <strong>${escapeHtml(ft.feature_type || "")}</strong>
                        <span>${st === en ? st : st + "–" + en}</span>
                    </div>
                    ${ft.note_text ? `<div class="list-note">${escapeHtml(ft.note_text)}</div>` : ""}
                    ${ligNames(ft).length ? `<div class="list-note">Ligands: ${escapeHtml(ligNames(ft).join(", "))}</div>` : ""}
                    ${evidenceHtml(ft, { full: showEvidenceFull, cap: showEvidenceFull ? 99 : 2 })}
                </div>`;
        });

        listBox.innerHTML = buildMotifListHtml() + buildSasaListHtml() + buildUbListHtml() + html;
        applyPickClass();
    }

    // ---------------- Selection (shared by sequence and list) ----------------
    function rangesKey(ranges) {
        return ranges.map(r => r[0] + "-" + r[1]).join(",");
    }

    // ranges: [[start, end], ...] (UniProt positions); shared by single- and multi-range selections.
    function setPickRanges(ranges, opts = {}) {
        const { scroll = true, label = "" } = opts;

        const start = Math.min(...ranges.map(r => r[0]));
        const end = Math.max(...ranges.map(r => r[1]));
        pick = { start, end, ranges, key: rangesKey(ranges) };

        const posSet = new Set();
        ranges.forEach(([a, b]) => { for (let i = a; i <= b; i++) posSet.add(i); });

        if (ranges.length === 1 && !label) {
            setInfo(start === end
                ? `Selected: ${seq[start - 1] || ""}${start}`
                : `Selected: ${start}–${end} (${end - start + 1} aa)`);
        } else {
            setInfo(`Selected: ${label || "multiple ranges"} (${ranges.length} ranges, ${posSet.size} aa total)`);
        }

        applyPickClass();

        if (scroll) {
            seqBox.querySelector(`.res[data-position="${start}"]`)
                ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        }

        showRangesInMolstar(ranges);
        renderPosInfo();
    }

    function setPick(start, end, scrollSeq = true) {
        setPickRanges([[start, end]], { scroll: scrollSeq });
    }

    function clearPick() {
        pick = null;
        setInfo("");
        applyPickClass();
        clearMolstar();
        renderPosInfo();
    }

    // Normalize into unique ranges sorted by position.
    function uniqueRanges(list) {
        const seen = new Set();
        return list
            .map(ft => [Number(ft.start_pos), Number(ft.end_pos || ft.start_pos)])
            .filter(r => { const k = r[0] + "-" + r[1]; if (seen.has(k)) return false; seen.add(k); return true; })
            .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    }

    function togglePickRanges(ranges, label) {
        if (!ranges.length) return;
        if (pick && pick.key === rangesKey(ranges)) clearPick();
        else setPickRanges(ranges, { scroll: true, label });
    }

    // Select all positions for a feature type at once: sequence + 3D.
    function selectType(type) {
        const list = validFeatures.filter(ft => ft.feature_type === type);
        if (!list.length) return;

        const cat = window.FEATURE_TYPE_TO_CATEGORY[type];
        if (cat) {
            let changed = false;
            if (!active.includes(cat)) { active.push(cat); changed = true; }
            if (typeSel[cat].size && !typeSel[cat].has(type)) { typeSel[cat].add(type); changed = true; }
            if (changed) refreshAll();
        }

        togglePickRanges(uniqueRanges(list), `All ${type}`);
    }

    // Select all currently displayed positions in a category (only checked subcategories, if any).
    function selectCategory(k) {
        const list = validFeatures.filter(ft =>
            window.FEATURE_TYPE_TO_CATEGORY[ft.feature_type] === k
            && (typeSel[k].size === 0 || typeSel[k].has(ft.feature_type)));

        if (!list.length) return;
        if (!active.includes(k)) { active.push(k); refreshAll(); }

        const name = (categories.find(c => c[0] === k) || [k, k])[1];
        togglePickRanges(uniqueRanges(list), `All ${name}`);
    }

    // Click a residue in the sequence.
    seqBox.addEventListener("click", e => {
        const r = e.target.closest(".res");
        if (!r) return;

        const pos = Number(r.dataset.position);

        if (measureMode) { addMeasure(pos); return; }

        if (pick && pick.key === rangesKey([[pos, pos]])) {
            clearPick();
        } else {
            setPick(pos, pos, false);
        }
    });

    // Click a list item.
    listBox.addEventListener("click", e => {
        const item = e.target.closest(".list-item");
        if (!item) return;

        const s0 = Number(item.dataset.start);
        const t0 = Number(item.dataset.end);

        if (measureMode && s0 === t0) { addMeasure(s0); return; }

        if (pick && pick.key === rangesKey([[s0, t0]])) {
            clearPick();
        } else {
            setPick(s0, t0, true);
        }
    });

    // Select-all button (◎ in the list header and dropdown panel).
    doc.addEventListener("click", e => {
        const b = e.target.closest ? e.target.closest("[data-pick-type]") : null;
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        selectType(b.dataset.pickType);
    });

    // ============================================================
    // Ubiquitination sites (ub_relations: modified_lysine when this protein is the substrate; color-coded by linkage type).
    // ============================================================
    const UB_KEYS  = ["K48", "K63", "K11", "K29", "K27", "K33", "K6", "M1", "Mono", "Other"];
    const UBL_KEYS = ["SUMO1", "SUMO2", "SUMO3", "SUMO", "NEDD8", "ISG15", "UFM1", "URM1", "FAT10", "ATG12", "UBL"];
    const UB_ORDER = [...UB_KEYS, ...UBL_KEYS];
    const UB_COLOR = {
        K48: "#ef4444", K63: "#2563eb", K11: "#16a34a", K29: "#9333ea", K27: "#0891b2",
        K33: "#db2777", K6: "#ea580c", M1: "#0f766e", Mono: "#6b7280", Other: "#111827",
        SUMO1: "#b45309", SUMO2: "#65a30d", SUMO3: "#365314", SUMO: "#84cc16",
        NEDD8: "#0284c7", ISG15: "#be185d", UFM1: "#7e22ce", URM1: "#475569",
        FAT10: "#b91c1c", ATG12: "#a16207", UBL: "#78716c"
    };
    const UB_NAME = {
        K48: "K48 linkage", K63: "K63 linkage", K11: "K11 linkage", K29: "K29 linkage", K27: "K27 linkage", K33: "K33 linkage",
        K6: "K6 linkage", M1: "M1 linear linkage", Mono: "Monoubiquitination", Other: "Other / unspecified",
        SUMO1: "SUMO1", SUMO2: "SUMO2", SUMO3: "SUMO3", SUMO: "SUMO (unspecified)",
        NEDD8: "NEDD8", ISG15: "ISG15", UFM1: "UFM1", URM1: "URM1", FAT10: "FAT10", ATG12: "ATG12",
        UBL: "Other ubiquitin-like modifier"
    };

    function isUBL(key) { return UBL_KEYS.includes(key); }
    function ubGroupLabel(key) { return isUBL(key) ? UB_NAME[key] : "Ub · " + UB_NAME[key]; }

    // Identify the modifier from the UniProt CROSSLNK annotation: "interchain with G-Cter in XXX".
    function ublFromNote(note) {
        const m = /\bin (ubiquitin|SUMO[123]?|NEDD8|ISG15|UFM1|URM1|FAT10|ATG12)\b/i.exec(note);
        if (m) {
            const x = m[1].toUpperCase();
            return x === "UBIQUITIN" ? "ubiquitin" : x;
        }
        if (/interchain with G-Cter in [A-Za-z0-9\-]+/i.test(note)) return "UBL";   // Other ubiquitin-like modifiers with G-Cter (e.g. Pup).
        return null;
    }

    function parseLinkage(t) {
        t = String(t || "");
        const sm = /SUMO\s*-?\s*([123])?/i.exec(t);
        if (sm) return "SUMO" + (sm[1] || "");
        const um = /\b(NEDD8|ISG15|UFM1|URM1|FAT10|ATG12)\b/i.exec(t);
        if (um) return um[1].toUpperCase();
        const m = /(?:K|Lys)\s*-?\s*(6|11|27|29|33|48|63)\b/i.exec(t);
        if (m) return "K" + m[1];
        if (/M1|linear|LUBAC/i.test(t)) return "M1";
        if (/mono/i.test(t)) return "Mono";
        return "Other";
    }

    function ubSortLinks(arr) {
        return arr.slice().sort((a, b) => UB_ORDER.indexOf(a) - UB_ORDER.indexOf(b));
    }

    function pmidLinks(v) {
        const ids = String(v || "").match(/\d{5,9}/g) || [];
        return ids.map(id => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noopener noreferrer">PMID:${id}</a>`).join(" ");
    }

    function relText(r) {
        if (r.__uniprot) return "UniProt CROSSLNK：" + r.note;
        const parts = [String(r.functional_outcome || "").toLowerCase().startsWith("deub") ? "Deubiquitination" : "Ubiquitination"];
        if (r.e1_id) parts.push("E1: " + r.e1_id);
        if (r.e2_id) parts.push("E2: " + r.e2_id);
        if (r.e3_id) parts.push("E3: " + r.e3_id);
        if (r.dub_id) parts.push("DUB: " + r.dub_id);
        if (r.ub_type) parts.push(r.ub_type);
        return parts.join(" · ");
    }

    const ubSites = (function () {
        const rels = Array.isArray(data.ub_relations) ? data.ub_relations : [];
        const ids = [p.gene_name, p.protein_id, p.uniprot_acc].filter(Boolean).map(x => String(x).toUpperCase());
        const map = new Map();

        rels.forEach(r => {
            if (!r || !ids.includes(String(r.substrate_id || "").toUpperCase())) return;   // Keep only records where this protein is the substrate.

            const text = String(r.modified_lysine || "");
            const positions = [];
            const re = /(?:^|[^A-Za-z])(?:K|Lys|Lysine)\s*-?\s*(\d+)/gi;
            let m;
            while ((m = re.exec(text))) positions.push(Number(m[1]));
            if (!positions.length && /^\s*\d+(\s*[,;\/]\s*\d+)*\s*$/.test(text)) {
                text.split(/[,;\/]/).forEach(x => positions.push(Number(x)));
            }

            const link = parseLinkage(r.ub_type);

            positions.forEach(pos => {
                if (!(pos >= 1 && pos <= seq.length)) return;
                let site = map.get(pos);
                if (!site) {
                    site = { pos, aa: seq[pos - 1], linkages: [], rels: [] };
                    map.set(pos, site);
                }
                if (!site.linkages.includes(link)) site.linkages.push(link);
                site.rels.push(r);
            });
        });

        // ---- UniProt CROSSLNK（Modification）：「interchain with G-Cter in ubiquitin / SUMO / NEDD8 …」 ----
        // If this protein contains ubiquitin sequences (e.g. UBB / UBC / UBA52 / RPS27A), infer linkage type (K6, K11, etc.) from the position within each repeat.
        const ubiRepeats = [];
        {
            const key = "MQIFVKTLTGKT";
            let i = seq.indexOf(key);
            while (i >= 0) { ubiRepeats.push(i); i = seq.indexOf(key, i + 1); }
        }
        function ubiUnitPos(pos) {
            let u = null;
            ubiRepeats.forEach(i => { const v = pos - i; if (v >= 1 && v <= 76) u = v; });
            return u;
        }

        features.forEach(ft => {
            if (String(ft.feature_type || "").toUpperCase() !== "CROSSLNK") return;

            const note = String(ft.note_text || (ft.notes && ft.notes[0] && ft.notes[0].note_text) || "");
            const mod = ublFromNote(note);
            if (!mod) return;

            const pos = Number(ft.start_pos);
            if (!(pos >= 1 && pos <= seq.length)) return;

            let link = "Other";
            if (mod !== "ubiquitin") {
                link = mod;                       // For SUMO / NEDD8 / ISG15, use the modifier itself as the category.
            } else if (/Met-Gly/i.test(note)) {
                link = "M1";
            } else {
                const u = ubiUnitPos(pos);
                if (u && [6, 11, 27, 29, 33, 48, 63].includes(u) && seq[pos - 1] === "K") link = "K" + u;
            }

            let site = map.get(pos);
            if (!site) {
                site = { pos, aa: seq[pos - 1], linkages: [], rels: [] };
                map.set(pos, site);
            }
            if (!site.linkages.includes(link)) site.linkages.push(link);
            site.fromUniprot = true;
            site.rels.push({ __uniprot: true, note, ft, functional_outcome: "Ubiquitination" });
        });

        const list = [...map.values()].sort((a, b) => a.pos - b.pos);
        list.forEach(site => {
            // Remove "Other" when a specific linkage type is already known.
            if (site.linkages.length > 1) site.linkages = site.linkages.filter(l => l !== "Other");
            site.linkages = ubSortLinks(site.linkages);
            site.primary = site.linkages[0];
            // This position is not Lys (UniProt CROSSLNK may refer to Cys/Ser/Thr/Met; do not warn).
            site.warn = !site.fromUniprot && site.aa !== "K" && !(site.linkages.includes("M1") && site.aa === "M");
        });
        return list;
    })();

    let ubActive = false;
    const ubSel = new Set();   // Empty set = all linkage types.

    function visibleUbSites() {
        if (!ubActive) return [];
        return ubSites.filter(st => ubSel.size === 0 || st.linkages.some(l => ubSel.has(l)));
    }

    function applyUbClass() {
        visibleUbSites().forEach(st => {
            const el = seqBox.querySelector(`.res[data-position="${st.pos}"]`);
            if (!el) return;
            el.classList.add("ub-site");
            if (st.warn) el.classList.add("ub-warn");
            if (isUBL(st.primary)) el.classList.add("ubl-site");
            el.style.setProperty("--ubc", UB_COLOR[st.primary] || "#111");
            el.title += ` | Ub ${st.linkages.join("/")}: ` + st.rels.slice(0, 3).map(relText).join("；");
        });
    }

    function buildUbListHtml() {
        if (!ubActive) return "";

        const sites = visibleUbSites();
        if (!sites.length) return `<div class="ub-empty">No matching ubiquitination site records for this protein.</div>`;

        let html = "";

        UB_ORDER.forEach(link => {
            const group = sites.filter(st => st.primary === link);
            if (!group.length) return;

            const color = UB_COLOR[link];
            html += `<div class="type-head ub-head" style="border-bottom-color:${color}">
                <i class="sw" style="background:${color}"></i>${escapeHtml(ubGroupLabel(link))} <span>(${group.length})</span>
                <button type="button" class="type-pick" data-pick-ub="${link}" title="Select all sites in this category (sequence + 3D)">◎ Select all</button>
            </div>`;

            group.forEach(st => {
                const lines = st.rels.slice(0, 4).map(r => {
                    const pm = pmidLinks(r.reference_pmid);
                    return `${escapeHtml(relText(r))}${r.source_db ? " · " + escapeHtml(String(r.source_db)) : ""}${pm ? " · " + pm : ""}${r.__uniprot && r.ft ? evidenceHtml(r.ft, { full: false }) : ""}`;
                });
                if (st.rels.length > 4) lines.push(`…${st.rels.length} records total`);

                html += `
                <div class="list-item ub-item${hasCoverage(st.pos, st.pos) ? "" : " no-3d-item"}" data-start="${st.pos}" data-end="${st.pos}" style="border-left-color:${color}">
                    <div class="list-head">
                        <strong>${escapeHtml(st.aa)}${st.pos}${st.warn ? " ⚠" : ""}</strong>
                        <span>${escapeHtml(st.linkages.map(l => UB_NAME[l]).join(" / "))}${sasaBadge(st.pos)}</span>
                    </div>
                    <div class="list-note">${lines.join("<br>")}</div>
                </div>`;
            });
        });

        return html;
    }

    function ubOptionRows(counts) {
        const row = l => `
                <label class="ub-opt">
                    <input type="checkbox" data-link="${l}">
                    <i class="sw" style="background:${UB_COLOR[l]}"></i>
                    <span>${escapeHtml(UB_NAME[l])}</span><em>${counts[l]}</em>
                    <button type="button" class="opt-pick" data-pick-ub="${l}" title="Select all sites for “${escapeHtml(UB_NAME[l])}” (sequence + 3D)">◎</button>
                </label>`;

        const ub = UB_KEYS.filter(l => counts[l]);
        const ubl = UBL_KEYS.filter(l => counts[l]);

        let html = "";
        if (ub.length) html += `<div class="ub-group">Ubiquitin</div>` + ub.map(row).join("");
        if (ubl.length) html += `<div class="ub-group">Ubiquitin-like modifiers (UBL)</div>` + ubl.map(row).join("");
        return html;
    }

    function buildUbPanel() {
        const panel = doc.getElementById("ub-panel");
        const btn = doc.getElementById("ub-toggle");
        if (!panel || !btn) return;

        if (!ubSites.length) {
            panel.innerHTML = `<div class="cat-empty">No recorded ubiquitination sites for this protein.</div>`;
            btn.disabled = true;
            btn.textContent = "Ub/UBL sites (0)";
            return;
        }

        const counts = {};
        ubSites.forEach(st => st.linkages.forEach(l => { counts[l] = (counts[l] || 0) + 1; }));

        panel.innerHTML = `
            <div class="ub-panel-tools">
                <a data-ub-act="pickall" title="Select all ubiquitination sites (sequence + 3D)">◎ Select all sites</a>
                <a data-ub-act="none">Clear filter</a>
            </div>
            ${ubOptionRows(counts)}
            <div class="cat-note">None selected = show all; solid border = ubiquitin; dotted border = ubiquitin-like modifier; dashed ⚠ = position is not Lys, please verify; sources include UniProt CROSSLNK</div>`;

        btn.textContent = `Ub/UBL sites (${ubSites.length})`;
    }

    function updateUbUI() {
        const wrap = doc.getElementById("ub-wrap");
        const btn = doc.getElementById("ub-toggle");
        if (!wrap || !btn || btn.disabled) return;

        wrap.classList.toggle("active", ubActive);
        const n = ubActive ? visibleUbSites().length : ubSites.length;
        btn.textContent = `Ub/UBL sites (${n})`;

        doc.querySelectorAll("#ub-panel input[data-link]").forEach(cb => {
            cb.checked = ubSel.has(cb.dataset.link);
        });
    }

    function selectUb(link) {
        const list = ubSites.filter(st => !link || st.linkages.includes(link));
        if (!list.length) return;

        if (!ubActive) { ubActive = true; refreshAll(); }

        const ranges = list.map(st => [st.pos, st.pos]);
        togglePickRanges(ranges, link ? `${UB_NAME[link]} sites` : "All ubiquitin / ubiquitin-like modifier sites");
    }

    // Toggle.
    doc.getElementById("ub-toggle").addEventListener("click", () => {
        ubActive = !ubActive;
        if (!ubActive) ubSel.clear();
        refreshAll();
    });

    // Dropdown.
    doc.getElementById("ub-caret").addEventListener("click", e => {
        e.stopPropagation();
        const wrap = doc.getElementById("ub-wrap");
        const willOpen = !wrap.classList.contains("open");
        closePanels();
        if (willOpen) {
            const panel = doc.getElementById("ub-panel");
            panel.classList.remove("align-right");
            wrap.classList.add("open");
            if (wrap.getBoundingClientRect().left + panel.offsetWidth > win.innerWidth - 8) {
                panel.classList.add("align-right");
            }
        }
    });

    // Selecting a linkage type enables the feature automatically.
    doc.addEventListener("change", e => {
        const cb = e.target.closest ? e.target.closest(".ub-opt input[data-link]") : null;
        if (!cb) return;
        if (cb.checked) ubSel.add(cb.dataset.link); else ubSel.delete(cb.dataset.link);
        ubActive = true;
        refreshAll();
    });

    // ◎ Select all and panel tools.
    doc.addEventListener("click", e => {
        if (!e.target.closest) return;

        const pk = e.target.closest("[data-pick-ub]");
        if (pk) {
            e.preventDefault();
            e.stopPropagation();
            selectUb(pk.dataset.pickUb);
            return;
        }

        const act = e.target.closest("[data-ub-act]");
        if (!act) return;

        if (act.dataset.ubAct === "pickall") selectUb(null);
        if (act.dataset.ubAct === "none") { ubSel.clear(); refreshAll(); }
    });

    // ============================================================
    // Lys surface accessibility (SASA, Shrake–Rupley), cross-referenced with Ub/UBL sites.
    //   - Calculated from the loaded 3D structure (exclude water and hydrogen; other chains and ligands act as occluders).
    //   - Calculate both the full complex and the individual chain; a large difference indicates an interface position.
    //   - Relative accessibility = SASA / theoretical maximum for the amino acid (Tien 2013).
    // ============================================================
    const MAX_ASA = { ALA:129, ARG:274, ASN:195, ASP:193, CYS:167, GLU:223, GLN:225, GLY:104, HIS:224, ILE:197,
        LEU:201, LYS:236, MET:224, PHE:240, PRO:159, SER:155, THR:172, TRP:285, TYR:263, VAL:174 };
    const SASA_EXPOSED = 0.25, SASA_PARTIAL = 0.10;
    const PLDDT_MIN = 70;   // AlphaFold: values below this threshold are considered low confidence.
    const SASA_NAME = { exp: "Exposed", part: "Partially exposed", bur: "Buried" };
    const SASA_COLOR = { exp: "#16a34a", part: "#d97706", bur: "#64748b" };

    let sasaActive = false;
    let sasaData = null;      // Map: UniProt position → {pos, aa, rel, relChain, cls, interface, chains:[...]}.
    let sasaStatus = "";      // "" | computing | done | none | error
    const ubByPos = new Map(ubSites.map(st => [st.pos, st]));

    function sasaClass(rel) { return rel >= SASA_EXPOSED ? "exp" : (rel >= SASA_PARTIAL ? "part" : "bur"); }
    function pct(x) { return Math.round(x * 100); }

    function computeSasa() {
        const mol = getStructureData();
        if (!mol || !structure) return null;

        const S = win.molstar.lib.structure;
        const SE = S.StructureElement;
        const SP = S.StructureProperties;
        const loc = SE.Location.create(mol);
        const isPdb = structure.source === "pdb";
        // For AlphaFold (and AlphaFill, which reuses its B-factor), the B-factor field stores each residue's pLDDT.
        const usePlddt = structure.source === "alphafold" || structure.source === "alphafill";
        const ubPosSet = new Set(ubSites.map(x => x.pos));

        const PROBE = 1.4, NPTS = 96, CELL = 6.8;
        const RAD = { C: 1.70, N: 1.55, O: 1.52, S: 1.80, P: 1.80, SE: 1.90 };

        function unpFor(chain, auth, label) {
            if (!isPdb) return label > 0 ? label : null;
            for (const m of (siftsMap || [])) {
                if (m.chain === chain && auth >= m.authStart && auth <= m.authEnd) return m.unpStart + (auth - m.authStart);
            }
            return null;
        }

        const xs = [], ys = [], zs = [], rs = [], us = [], tg = [];
        const residues = new Map();

        for (const unit of mol.units) {
            const els = unit.elements;
            for (let i = 0; i < els.length; i++) {
                loc.unit = unit;
                loc.element = els[i];

                const comp = String(SP.atom.label_comp_id(loc)).toUpperCase();
                if (WATER_NAMES.has(comp)) continue;

                const el = String(SP.atom.type_symbol(loc)).toUpperCase();
                if (el === "H" || el === "D") continue;

                const alt = SP.atom.label_alt_id(loc);
                if (alt && alt !== "A") continue;

                xs.push(SP.atom.x(loc));
                ys.push(SP.atom.y(loc));
                zs.push(SP.atom.z(loc));
                rs.push(RAD[el] || 1.70);
                us.push(unit.id);

                const chain = SP.chain.auth_asym_id(loc);
                const auth = SP.residue.auth_seq_id(loc);
                const label = SP.residue.label_seq_id(loc);
                const unp = unpFor(chain, auth, label);

                let rec = null;
                if (unp !== null && (comp === "LYS" || ubPosSet.has(unp))) {
                    const ins = SP.residue.pdbx_PDB_ins_code ? (SP.residue.pdbx_PDB_ins_code(loc) || "") : "";
                    const key = unit.id + "|" + auth + "|" + ins;
                    rec = residues.get(key);
                    if (!rec) {
                        rec = { chain, auth, unp, comp, abs: 0, absChain: 0, atoms: [], plddt: usePlddt ? SP.atom.B_iso_or_equiv(loc) : null };
                        residues.set(key, rec);
                    }
                    rec.atoms.push(xs.length - 1);
                }
                tg.push(rec);
            }
        }

        const n = xs.length;
        if (!n) return new Map();

        // Points distributed uniformly on a sphere.
        const pts = [];
        const ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < NPTS; i++) {
            const y = 1 - (i / (NPTS - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            pts.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
        }

        // Spatial grid.
        const grid = new Map();
        const cellKey = (ix, iy, iz) => ((ix + 512) << 20) | ((iy + 512) << 10) | (iz + 512);
        for (let i = 0; i < n; i++) {
            const k = cellKey(Math.floor(xs[i] / CELL), Math.floor(ys[i] / CELL), Math.floor(zs[i] / CELL));
            let arr = grid.get(k);
            if (!arr) { arr = []; grid.set(k, arr); }
            arr.push(i);
        }

        for (let i = 0; i < n; i++) {
            const rec = tg[i];
            if (!rec) continue;

            const cx = Math.floor(xs[i] / CELL), cy = Math.floor(ys[i] / CELL), cz = Math.floor(zs[i] / CELL);
            const nb = [];
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                const arr = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
                if (!arr) continue;
                for (const j of arr) {
                    if (j === i) continue;
                    const lim = rs[i] + rs[j] + 2 * PROBE;
                    const ddx = xs[i] - xs[j], ddy = ys[i] - ys[j], ddz = zs[i] - zs[j];
                    if (ddx * ddx + ddy * ddy + ddz * ddz < lim * lim) nb.push(j);
                }
            }

            const R = rs[i] + PROBE;
            let accAll = 0, accCh = 0;

            for (const pt of pts) {
                const px = xs[i] + R * pt[0], py = ys[i] + R * pt[1], pz = zs[i] + R * pt[2];
                let occAll = false, occCh = false;

                for (const j of nb) {
                    const rj = rs[j] + PROBE;
                    const ex = px - xs[j], ey = py - ys[j], ez = pz - zs[j];
                    if (ex * ex + ey * ey + ez * ez < rj * rj) {
                        occAll = true;
                        if (us[j] === us[i]) { occCh = true; break; }
                    }
                }

                if (!occAll) accAll++;
                if (!occCh) accCh++;
            }

            const area = 4 * Math.PI * R * R / NPTS;
            rec.abs += area * accAll;
            rec.absChain += area * accCh;
        }

        // Aggregate by UniProt position (take the maximum across chains; exposed in any chain counts as exposed).
        const out = new Map();
        residues.forEach(rec => {
            const maxAsa = MAX_ASA[rec.comp] || MAX_ASA.LYS;
            const chainRec = { chain: rec.chain, auth: rec.auth, abs: rec.abs, rel: rec.abs / maxAsa,
                absChain: rec.absChain, relChain: rec.absChain / maxAsa };

            let d = out.get(rec.unp);
            if (!d) { d = { pos: rec.unp, aa: seq[rec.unp - 1] || "?", comp: rec.comp, plddt: rec.plddt, chains: [] }; out.set(rec.unp, d); }
            d.chains.push(chainRec);
        });

        out.forEach(d => {
            const best = d.chains.reduce((a, b) => (b.rel > a.rel ? b : a));
            d.best = best;
            d.rel = best.rel;
            d.relChain = Math.max(...d.chains.map(c => c.relChain));
            d.cls = sasaClass(d.rel);
            d.interface = (d.relChain - d.rel) >= 0.15;
            d.lowConf = usePlddt && d.plddt != null && d.plddt < PLDDT_MIN;
        });

        return out;
    }

    function startSasa(token) {
        if (!structure) return;
        sasaStatus = "computing";
        updateSasaUI();

        setTimeout(() => {
            if (token !== loadToken) return;
            try {
                sasaData = computeSasa();
                sasaStatus = (sasaData && sasaData.size) ? "done" : "none";
                if (sasaData)                 console.log(`[UKW] SASA: ${sasaData.size} residues`, sasaData);
            } catch (e) {
                console.error("[UKW] SASA calculation failed:", e);
                sasaData = null;
                sasaStatus = "error";
            }
            updateSasaUI();
            redrawSequence();
            redrawList();
            renderPosInfo();
        }, 30);
    }

    // Groups: all Lys / exposed / buried / exposed and buried known sites / candidates / interface.
    function sasaGroups() {
        const g = { exp: [], bur: [], ubExp: [], ubBur: [], cand: [], iface: [] };
        if (!sasaData) return g;

        sasaData.forEach(d => {
            const ub = ubByPos.get(d.pos);
            if (d.aa === "K") {
                if (d.cls === "exp") g.exp.push(d);
                if (d.cls === "bur") g.bur.push(d);
                if (d.cls === "exp" && !ub && !d.lowConf) g.cand.push(d);   // Exclude low-confidence (pLDDT) sites from candidates.
                if (d.interface) g.iface.push(d);
            }
            if (ub) {
                if (d.cls === "exp") g.ubExp.push(d);
                if (d.cls === "bur") g.ubBur.push(d);
            }
        });

        Object.values(g).forEach(arr => arr.sort((a, b) => a.pos - b.pos));
        return g;
    }

    const SASA_GROUP_NAME = {
        exp: "All exposed Lys",
        bur: "All buried Lys",
        ubExp: "Known exposed Ub/UBL sites",
        ubBur: "Known buried sites (⚠ worth verifying)",
        cand: "Exposed Lys with no record (candidate)",
        iface: "Lys occluded by the complex (interface)"
    };

    function sasaBadge(pos) {
        if (!sasaData) return "";
        const d = sasaData.get(pos);
        if (!d) return "";
        return ` · <b style="color:${SASA_COLOR[d.cls]}">${SASA_NAME[d.cls]} ${pct(d.rel)}%${d.lowConf ? " (low confidence)" : ""}</b>`;
    }

    function applySasaClass() {
        if (!sasaActive || !sasaData) return;
        sasaData.forEach(d => {
            const el = seqBox.querySelector(`.res[data-position="${d.pos}"]`);
            if (!el) return;
            el.classList.add("sasa-" + d.cls);
            el.title += ` | SASA ${pct(d.rel)}%（${SASA_NAME[d.cls]}）`;
        });
    }

    function sasaItemHtml(d) {
        const ub = ubByPos.get(d.pos);
        const note = [
            `SASA ${Math.round(d.best.abs)} Å²（chain ${escapeHtml(String(d.best.chain))}）`,
            `Single chain ${pct(d.relChain)}%`,
            d.plddt != null ? `pLDDT ${Math.round(d.plddt)}${d.lowConf ? " (low confidence)" : ""}` : "",
            d.interface ? "Occluded at complex interface" : "",
            ub ? "Known: " + escapeHtml(ub.linkages.map(l => UB_NAME[l]).join(" / ")) : ""
        ].filter(Boolean).join(" · ");

        return `
            <div class="list-item sasa-item${hasCoverage(d.pos, d.pos) ? "" : " no-3d-item"}" data-start="${d.pos}" data-end="${d.pos}" style="border-left-color:${SASA_COLOR[d.cls]}">
                <div class="list-head">
                    <strong>${escapeHtml(d.aa)}${d.pos}</strong>
                    <span class="sasa-chip" style="color:${SASA_COLOR[d.cls]}">${SASA_NAME[d.cls]} ${pct(d.rel)}%</span>
                </div>
                <div class="list-note">${note}</div>
            </div>`;
    }

    function buildSasaListHtml() {
        if (!sasaActive) return "";
        if (sasaStatus === "computing" || !sasaStatus) return `<div class="ub-empty">Calculating Lys accessibility… (load a 3D structure first)</div>`;
        if (sasaStatus === "error") return `<div class="ub-empty">Failed to calculate Lys accessibility. See the console.</div>`;
        if (!sasaData || !sasaData.size) return `<div class="ub-empty">No Lys residues in this structure could be mapped to UniProt positions; accessibility cannot be calculated.</div>`;

        const g = sasaGroups();
        const lys = [...sasaData.values()].filter(d => d.aa === "K");
        const cnt = c => lys.filter(d => d.cls === c).length;
        const ubInStruct = ubSites.filter(st => sasaData.has(st.pos)).length;
        const lowLys = lys.filter(d => d.lowConf).length;

        let html = `<div class="sasa-sum">
            Lys residues in this structure: <b>${lys.length}</b> (
            <span style="color:${SASA_COLOR.exp}">exposed ${cnt("exp")}</span>,
            <span style="color:${SASA_COLOR.part}">partially exposed ${cnt("part")}</span>,
            <span style="color:${SASA_COLOR.bur}">buried ${cnt("bur")}</span>)<br>
            Of ${ubSites.length} known Ub/UBL sites, <b>${ubInStruct}</b> are in this structure;
            ${g.ubExp.length} exposed, ${g.ubBur.length} buried<br>
            ${lowLys ? `Low-confidence Lys (pLDDT &lt; ${PLDDT_MIN}): ${lowLys} (accessibility is unreliable; excluded from candidates)<br>` : ""}
            <span style="color:#888">Exposed ≥ ${pct(SASA_EXPOSED)}%, partially exposed ${pct(SASA_PARTIAL)}–${pct(SASA_EXPOSED)}%, buried &lt; ${pct(SASA_PARTIAL)}% (relative to maximum accessible surface area)</span>
        </div>`;

        const section = (key, title, color, list, cap) => {
            if (!list.length) return "";
            const shown = cap ? list.slice(0, cap) : list;
            return `<div class="type-head" style="border-bottom-color:${color}">
                    <i class="sw" style="background:${color}"></i>${escapeHtml(title)} <span>(${list.length})</span>
                    <button type="button" class="type-pick" data-pick-sasa="${key}" title="Select all (sequence + 3D)">◎ Select all</button>
                </div>` + shown.map(sasaItemHtml).join("")
                + (cap && list.length > cap ? `<div class="ub-empty">…${list.length - cap} more; use ◎ Select all</div>` : "");
        };

        const knownAll = ubSites.map(st => sasaData.get(st.pos)).filter(Boolean).sort((a, b) => a.pos - b.pos);
        html += section("known", "Accessibility of known Ub/UBL sites", "#374151", knownAll, 0);
        html += section("cand", SASA_GROUP_NAME.cand, SASA_COLOR.exp, g.cand, 30);
        return html;
    }

    function buildSasaPanel() {
        const panel = doc.getElementById("sasa-panel");
        if (!panel) return;

        if (sasaStatus === "computing" || !sasaStatus) {
            panel.innerHTML = `<div class="cat-empty">${structure ? "Calculating… wait for the 3D structure to finish loading." : "No 3D structure."}</div>`;
            return;
        }
        if (!sasaData || !sasaData.size) {
            panel.innerHTML = `<div class="cat-empty">No Lys residues can be mapped in this structure.</div>`;
            return;
        }

        const g = sasaGroups();
        const color = { exp: SASA_COLOR.exp, bur: SASA_COLOR.bur, ubExp: SASA_COLOR.exp, ubBur: "#dc2626", cand: SASA_COLOR.part, iface: "#7c3aed" };
        const row = k => `
            <div class="ub-opt" data-pick-sasa="${k}">
                <i class="sw" style="background:${color[k]}"></i>
                <span>${escapeHtml(SASA_GROUP_NAME[k])}</span><em>${g[k].length}</em>
                <button type="button" class="opt-pick" data-pick-sasa="${k}" title="Select (sequence + 3D)">◎</button>
            </div>`;

        panel.innerHTML = `
            <div class="cat-note">Color bars above sequence: <b style="color:${SASA_COLOR.exp}">green = exposed</b>, <b style="color:${SASA_COLOR.part}">orange = partially exposed</b>, <b style="color:${SASA_COLOR.bur}">gray = buried</b></div>
            ${["exp", "bur", "ubExp", "ubBur", "cand", "iface"].map(row).join("")}
            <div class="cat-note">“Interface” = exposed in the individual chain but occluded by another chain in the complex.</div>`;
    }

    function updateSasaUI() {
        const wrap = doc.getElementById("sasa-wrap");
        const btn = doc.getElementById("sasa-toggle");
        if (!wrap || !btn) return;

        wrap.classList.toggle("active", sasaActive);
        btn.textContent = sasaStatus === "computing" ? "Lys accessibility …"
            : (sasaStatus === "done" && sasaData ? `Lys accessibility (${[...sasaData.values()].filter(d => d.aa === "K").length})` : "Lys accessibility");
        buildSasaPanel();
    }

    function selectSasa(key) {
        if (!sasaData) return;

        let list;
        if (key === "known") list = ubSites.map(st => sasaData.get(st.pos)).filter(Boolean);
        else list = sasaGroups()[key] || [];
        if (!list.length) return;

        if (!sasaActive) { sasaActive = true; refreshAll(); }
        togglePickRanges(list.map(d => [d.pos, d.pos]), key === "known" ? "Known Ub/UBL sites" : SASA_GROUP_NAME[key]);
    }

    doc.getElementById("sasa-toggle").addEventListener("click", () => {
        sasaActive = !sasaActive;
        refreshAll();
    });

    doc.getElementById("sasa-caret").addEventListener("click", e => {
        e.stopPropagation();
        const wrap = doc.getElementById("sasa-wrap");
        const willOpen = !wrap.classList.contains("open");
        closePanels();
        if (willOpen) {
            const panel = doc.getElementById("sasa-panel");
            panel.classList.remove("align-right");
            wrap.classList.add("open");
            if (wrap.getBoundingClientRect().left + panel.offsetWidth > win.innerWidth - 8) {
                panel.classList.add("align-right");
            }
        }
    });

    doc.addEventListener("click", e => {
        const b = e.target.closest ? e.target.closest("[data-pick-sasa]") : null;
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        selectSasa(b.dataset.pickSasa);
    });

    // ============================================================
    // 3D → sequence, position details panel, nearby ligands.
    // ============================================================
    // Structure residue → UniProt position.
    function uniprotPosFor(chain, auth, label) {
        if (!structure) return null;
        if (structure.source !== "pdb") return label > 0 ? label : null;
        for (const m of (siftsMap || [])) {
            if (m.chain === chain && auth >= m.authStart && auth <= m.authEnd) return m.unpStart + (auth - m.authStart);
        }
        return null;
    }

    function onMolClick(ev) {
        try {
            const loci = ev && ev.current && ev.current.loci;
            if (!loci) return;

            const S = win.molstar.lib.structure;
            const SE = S.StructureElement;
            const SP = S.StructureProperties;
            if (!SE.Loci.is(loci)) return;
            if (ev.button !== undefined && !(ev.button & 1)) return;   // Handle only the left mouse button.

            const l = SE.Loci.getFirstLocation(loci);
            if (!l) return;

            const comp = String(SP.atom.label_comp_id(l)).toUpperCase();
            if (WATER_NAMES.has(comp)) return;

            let nonPoly = false;
            try { nonPoly = SP.entity.type(l) === "non-polymer"; } catch (e) { /* ignore */ }

            if (nonPoly) {
                setInfo(`3D selection: ligand ${comp} (chain ${SP.chain.auth_asym_id(l)})`);
                return;
            }

            const pos = uniprotPosFor(SP.chain.auth_asym_id(l), SP.residue.auth_seq_id(l), SP.residue.label_seq_id(l));
            if (!pos) {
                setInfo(`3D selection: ${comp} ${SP.residue.auth_seq_id(l)} (not mapped to the UniProt sequence)`);
                return;
            }

            if (measureMode) { addMeasure(pos); return; }

            if (pick && pick.key === rangesKey([[pos, pos]])) clearPick();
            else setPickRanges([[pos, pos]], { scroll: true });
        } catch (e) {
            console.warn("[UKW] Failed to handle 3D selection:", e);
        }
    }

    function ligNames(ft) {
        return [...new Set((ft.ligands || []).map(x => x.ligand_name || x.ligand_label).filter(Boolean))];
    }

    // When a single residue is selected, list UniProt features, Ub/UBL sites, and accessibility covering that position.
    function renderPosInfo() {
        const box = doc.getElementById("pos-info");
        if (!box) return;

        if (!pick || pick.ranges.length !== 1 || pick.start !== pick.end) {
            box.style.display = "none";
            box.innerHTML = "";
            return;
        }

        const pos = pick.start;
        const aa = seq[pos - 1] || "?";
        const feats = sortFeatures(validFeatures.filter(ft =>
            pos >= Number(ft.start_pos) && pos <= Number(ft.end_pos || ft.start_pos)));

        const ub = ubByPos.get(pos);
        const ubTag = ub
            ? `<span class="pos-tag" style="border-color:${UB_COLOR[ub.primary]};color:${UB_COLOR[ub.primary]}">${escapeHtml(ub.linkages.map(l => UB_NAME[l]).join(" / "))}</span>`
            : "";

        const featHtml = feats.length
            ? feats.map(ft => {
                const st = Number(ft.start_pos), en = Number(ft.end_pos || ft.start_pos);
                const lig = ligNames(ft);
                return `<div class="pos-feat" style="border-left-color:${typeColor[ft.feature_type] || "#ccc"}">
                    <strong>${escapeHtml(ft.feature_type || "")}</strong> ${st === en ? st : st + "–" + en}
                    ${ft.note_text ? `<span class="muted">${escapeHtml(ft.note_text)}</span>` : ""}
                    ${lig.length ? `<div class="muted">Ligands: ${escapeHtml(lig.join(", "))}</div>` : ""}
                    ${evidenceHtml(ft, { full: true })}
                </div>`;
            }).join("")
            : `<div class="pos-sub">No UniProt feature covers this position.</div>`;

        box.innerHTML = `
            <div class="pos-head">
                <b>${escapeHtml(aa)}${pos}</b>${ubTag}${sasaBadge(pos)}
                <span class="pos-x" data-pos-close title="Close">✕</span>
            </div>
            <div class="pos-sub">UniProt features covering this position (${feats.length})</div>
            ${featHtml}`;
        box.style.display = "block";
    }

    doc.addEventListener("click", e => {
        if (e.target.closest && e.target.closest("[data-pos-close]")) clearPick();
    });

    // Find ligands / ions within cutoff Å of selected residues (non-polymer entities; exclude water).
    function nearbyLigands(mol, rules, cutoff) {
        const S = win.molstar.lib.structure;
        const SE = S.StructureElement;
        const SP = S.StructureProperties;
        const loc = SE.Location.create(mol);

        const tx = [], ty = [], tz = [];
        const ligAtoms = [];

        for (const unit of mol.units) {
            const els = unit.elements;
            for (let i = 0; i < els.length; i++) {
                loc.unit = unit;
                loc.element = els[i];

                const comp = String(SP.atom.label_comp_id(loc)).toUpperCase();
                if (WATER_NAMES.has(comp)) continue;

                const el = String(SP.atom.type_symbol(loc)).toUpperCase();
                if (el === "H" || el === "D") continue;

                const alt = SP.atom.label_alt_id(loc);
                if (alt && alt !== "A") continue;

                let nonPoly = false;
                try { nonPoly = SP.entity.type(loc) === "non-polymer"; } catch (e) { /* ignore */ }

                if (nonPoly) {
                    ligAtoms.push({
                        unit, i, comp,
                        x: SP.atom.x(loc), y: SP.atom.y(loc), z: SP.atom.z(loc),
                        key: unit.id + "|" + SP.residue.auth_seq_id(loc) + "|" + comp
                    });
                    continue;
                }

                const chain = SP.chain.auth_asym_id(loc);
                const num = SP.residue.auth_seq_id(loc);
                const labelNum = SP.residue.label_seq_id(loc);

                for (const r of rules) {
                    if (r.chain && r.chain !== chain) continue;
                    const nn = r.useAuth ? num : labelNum;
                    if (nn >= r.a && nn <= r.b) {
                        tx.push(SP.atom.x(loc)); ty.push(SP.atom.y(loc)); tz.push(SP.atom.z(loc));
                        break;
                    }
                }
            }
        }

        if (!tx.length || !ligAtoms.length) return null;

        const c2 = cutoff * cutoff;
        const near = new Set();

        for (const a of ligAtoms) {
            if (near.has(a.key)) continue;
            for (let t = 0; t < tx.length; t++) {
                const dx = a.x - tx[t], dy = a.y - ty[t], dz = a.z - tz[t];
                if (dx * dx + dy * dy + dz * dz <= c2) { near.add(a.key); break; }
            }
        }

        if (!near.size) return null;

        const byUnit = new Map();
        const comps = new Set();

        ligAtoms.forEach(a => {
            if (!near.has(a.key)) return;
            comps.add(a.comp);
            let e = byUnit.get(a.unit);
            if (!e) { e = { unit: a.unit, indices: [] }; byUnit.set(a.unit, e); }
            e.indices.push(a.i);
        });

        const parts = [...byUnit.values()].map(e => ({ unit: e.unit, indices: Int32Array.from(e.indices) }));
        return { loci: SE.Loci(mol, parts), comps: [...comps] };
    }

    // Apply immediately to the current selection when "Show nearby ligands" is toggled.
    doc.getElementById("show-lig").addEventListener("change", () => {
        if (pick) showRangesInMolstar(pick.ranges);
    });

    // ============================================================
    // Sequence motif search (regular expressions; overlapping matches are allowed).
    // ============================================================
    let motifHits = [];       // [{start, end, text}]（1-based）
    let motifPattern = "";
    let motifError = "";

    function setMotifStatus(t) {
        const el = doc.getElementById("motif-status");
        if (el) el.textContent = t;
    }

    function runMotif(pat) {
        pat = String(pat || "").trim();
        motifPattern = pat;
        motifHits = [];
        motifError = "";

        if (pat) {
            let re = null;
            try {
                re = new RegExp("(?=(" + pat + "))", "gi");   // Lookahead also finds overlapping matches.
            } catch (e) {
                motifError = "Invalid pattern: " + e.message;
            }

            if (re) {
                let m, guard = 0;
                while ((m = re.exec(seq)) !== null) {
                    re.lastIndex = m.index + 1;
                    const t = m[1];
                    if (t && t.length) motifHits.push({ start: m.index + 1, end: m.index + t.length, text: t });
                    if (++guard > 20000 || re.lastIndex > seq.length) break;
                }
            }
        }

        setMotifStatus(motifError || (pat ? `${motifHits.length} matches` : ""));
        redrawSequence();
        redrawList();
    }

    function applyMotifClass() {
        if (!motifHits.length) return;
        const set = new Set();
        motifHits.forEach(h => { for (let i = h.start; i <= h.end; i++) set.add(i); });

        seqBox.querySelectorAll(".res").forEach(el => {
            if (set.has(Number(el.dataset.position))) {
                el.classList.add("motif-hit");
                el.title += ` | Motif ${motifPattern}`;
            }
        });
    }

    function buildMotifListHtml() {
        if (!motifPattern) return "";
        if (motifError) return `<div class="ub-empty">${escapeHtml(motifError)}</div>`;

        const color = "#c026d3";
        if (!motifHits.length) return `<div class="ub-empty">Motif <code>${escapeHtml(motifPattern)}</code>: no matching positions.</div>`;

        const CAP = 100;
        let html = `<div class="type-head" style="border-bottom-color:${color}">
            <i class="sw" style="background:${color}"></i>Motif <code>${escapeHtml(motifPattern)}</code> <span>(${motifHits.length})</span>
            <button type="button" class="type-pick" data-pick-motif title="Select all matching positions (sequence + 3D)">◎ Select all</button>
        </div>`;

        motifHits.slice(0, CAP).forEach(h => {
            const known = [];
            for (let p = h.start; p <= h.end; p++) if (ubByPos.has(p)) known.push(`${seq[p - 1]}${p}`);

            html += `
            <div class="list-item motif-item${hasCoverage(h.start, h.end) ? "" : " no-3d-item"}" data-start="${h.start}" data-end="${h.end}" style="border-left-color:${color}">
                <div class="list-head">
                    <strong style="font-family:monospace">${escapeHtml(h.text)}</strong>
                    <span>${h.start === h.end ? h.start : h.start + "–" + h.end}</span>
                </div>
                ${known.length ? `<div class="list-note">Includes known Ub/UBL sites: ${escapeHtml(known.join(", "))}</div>` : ""}
            </div>`;
        });

        if (motifHits.length > CAP) html += `<div class="ub-empty">…${motifHits.length - CAP} more; use ◎ Select all</div>`;
        return html;
    }

    doc.getElementById("motif-go").addEventListener("click", () => runMotif(doc.getElementById("motif-input").value));
    doc.getElementById("motif-input").addEventListener("keydown", e => { if (e.key === "Enter") runMotif(e.target.value); });
    doc.getElementById("motif-clear").addEventListener("click", () => {
        doc.getElementById("motif-input").value = "";
        doc.getElementById("motif-preset").value = "";
        runMotif("");
    });
    doc.getElementById("motif-preset").addEventListener("change", e => {
        if (!e.target.value) return;
        doc.getElementById("motif-input").value = e.target.value;
        runMotif(e.target.value);
    });
    doc.addEventListener("click", e => {
        if (e.target.closest && e.target.closest("[data-pick-motif]") && motifHits.length) {
            e.preventDefault();
            e.stopPropagation();
            togglePickRanges(motifHits.map(h => [h.start, h.end]), `Motif ${motifPattern}`);
        }
    });

    // ============================================================
    // Distance measurement: in measurement mode, click two residues in sequence (sequence, single-residue list item, or 3D view).
    // ============================================================
    let measureMode = false;
    let measureSel = [];
    let measureKind = "ca";      // Which line to draw in 3D: ca / min.
    let lastMeasure = null;

    // Get the heavy atoms for a UniProt position in the structure (including coordinates and atom names).
    function residueAtoms(mol, pos) {
        const rules = buildRules(pos, pos);
        if (!rules.length) return [];

        const S = win.molstar.lib.structure;
        const SE = S.StructureElement;
        const SP = S.StructureProperties;
        const loc = SE.Location.create(mol);
        const out = [];

        for (const unit of mol.units) {
            const els = unit.elements;
            for (let i = 0; i < els.length; i++) {
                loc.unit = unit;
                loc.element = els[i];

                const comp = String(SP.atom.label_comp_id(loc)).toUpperCase();
                if (WATER_NAMES.has(comp)) continue;

                const el = String(SP.atom.type_symbol(loc)).toUpperCase();
                if (el === "H" || el === "D") continue;

                const alt = SP.atom.label_alt_id(loc);
                if (alt && alt !== "A") continue;

                const chain = SP.chain.auth_asym_id(loc);
                const num = SP.residue.auth_seq_id(loc);
                const labelNum = SP.residue.label_seq_id(loc);

                for (const r of rules) {
                    if (r.chain && r.chain !== chain) continue;
                    const nn = r.useAuth ? num : labelNum;
                    if (nn >= r.a && nn <= r.b) {
                        out.push({
                            unit, i, uid: unit.id, chain, comp,
                            name: String(SP.atom.label_atom_id(loc)),
                            x: SP.atom.x(loc), y: SP.atom.y(loc), z: SP.atom.z(loc)
                        });
                        break;
                    }
                }
            }
        }
        return out;
    }

    function atomDist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); }

    function measurePair(a, b) {
        const mol = getStructureData();
        if (!mol) return { error: "The 3D structure has not loaded." };

        const A = residueAtoms(mol, a);
        const B = residueAtoms(mol, b);
        const nameA = `${seq[a - 1] || "?"}${a}`, nameB = `${seq[b - 1] || "?"}${b}`;

        if (!A.length) return { error: `${nameA} is outside the 3D structure range.` };
        if (!B.length) return { error: `${nameB} is outside the 3D structure range.` };

        const group = atoms => {
            const m = new Map();
            atoms.forEach(x => { if (!m.has(x.uid)) m.set(x.uid, []); m.get(x.uid).push(x); });
            return m;
        };
        const gA = group(A), gB = group(B);

        let best = null;
        const tryPair = (ga, gb, cross) => {
            let min = null;
            ga.forEach(p => gb.forEach(q => {
                const d = atomDist(p, q);
                if (!min || d < min.d) min = { d, a: p, b: q };
            }));
            if (min && (!best || min.d < best.min.d)) best = { min, ga, gb, cross };
        };

        // Prefer comparisons within the same chain; compare across chains only if the residues are in different chains.
        gA.forEach((ga, uid) => { if (gB.has(uid)) tryPair(ga, gB.get(uid), false); });
        if (!best) gA.forEach(ga => gB.forEach(gb => tryPair(ga, gb, true)));
        if (!best) return { error: "No measurable atoms were found." };

        const pa = best.ga.find(x => x.name === "CA");
        const pb = best.gb.find(x => x.name === "CA");

        return {
            nameA, nameB,
            min: best.min,
            ca: (pa && pb) ? { d: atomDist(pa, pb), a: pa, b: pb } : null,
            cross: best.cross,
            instances: Math.max(gA.size, gB.size)
        };
    }

    function clearMeasureLine() {
        try {
            const m = viewer && viewer.plugin.managers.structure.measurement;
            if (m && typeof m.clear === "function") m.clear();
        } catch (e) { console.warn("[UKW] Failed to clear distance lines:", e); }
    }

    function drawMeasureLine() {
        clearMeasureLine();
        if (!viewer || !lastMeasure || lastMeasure.error) return;

        try {
            const pair = measureKind === "ca" ? (lastMeasure.ca || lastMeasure.min) : lastMeasure.min;
            const mol = getStructureData();
            const SE = win.molstar.lib.structure.StructureElement;

            const lociA = SE.Loci(mol, [{ unit: pair.a.unit, indices: Int32Array.of(pair.a.i) }]);
            const lociB = SE.Loci(mol, [{ unit: pair.b.unit, indices: Int32Array.of(pair.b.i) }]);
            viewer.plugin.managers.structure.measurement.addDistance(lociA, lociB);
        } catch (e) {
            console.warn("[UKW] Failed to draw 3D distance line:", e);
        }
    }

    function renderMeasure() {
        const box = doc.getElementById("measure-info");
        if (!box) return;

        if (!measureMode && !lastMeasure) { box.style.display = "none"; box.innerHTML = ""; return; }

        let body = "";
        if (lastMeasure && lastMeasure.error) {
            body = `<span style="color:#b91c1c">${escapeHtml(lastMeasure.error)}</span>`;
        } else if (lastMeasure) {
            const m = lastMeasure;
            body = `
                <b>${escapeHtml(m.nameA)} ↔ ${escapeHtml(m.nameB)}</b>${m.cross ? " (across chains)" : ""}<br>
                ${m.ca ? `Cα–Cα：<span class="m-val">${m.ca.d.toFixed(2)} Å</span><br>` : ""}
                Nearest atoms: <span class="m-val">${m.min.d.toFixed(2)} Å</span>
                （${escapeHtml(m.nameA)} ${escapeHtml(m.min.a.name)} ↔ ${escapeHtml(m.nameB)} ${escapeHtml(m.min.b.name)}）
                ${m.instances > 1 ? `<br><span style="color:#888">The structure contains ${m.instances} chains; the nearest pair is shown.</span>` : ""}
                <br>
                <label><input type="radio" name="mkind" value="ca" ${measureKind === "ca" ? "checked" : ""}> Draw Cα line in 3D</label>
                <label><input type="radio" name="mkind" value="min" ${measureKind === "min" ? "checked" : ""}> Draw nearest-atom line</label>`;
        } else if (measureSel.length === 1) {
            body = `Selected <b>${escapeHtml((seq[measureSel[0] - 1] || "?") + measureSel[0])}</b>; click another residue.`;
        } else {
            body = "Measurement mode: click two residues in sequence (in the sequence, a single-residue list item, or the 3D view).";
        }

        box.innerHTML = `${body}<div><a data-measure-clear>Clear</a><a data-measure-exit>Exit measurement</a></div>`;
        box.style.display = "block";
    }

    function setMeasureMode(on) {
        measureMode = on;
        doc.getElementById("btn-measure").classList.toggle("on", on);
        measureSel = [];
        lastMeasure = null;
        clearMeasureLine();
        renderMeasure();
    }

    function addMeasure(pos) {
        if (measureSel.length >= 2) {
            measureSel = [];
            lastMeasure = null;
            clearMeasureLine();
        }
        if (measureSel[0] === pos) return;

        measureSel.push(pos);

        if (measureSel.length === 1) {
            setPickRanges([[pos, pos]], { scroll: false });
            renderMeasure();
            return;
        }

        const [a, b] = measureSel;
        setPickRanges([[a, a], [b, b]], { scroll: false, label: `Distance: ${seq[a - 1] || "?"}${a} ↔ ${seq[b - 1] || "?"}${b}` });
        lastMeasure = measurePair(a, b);
        drawMeasureLine();
        renderMeasure();
    }

    doc.getElementById("btn-measure").addEventListener("click", () => setMeasureMode(!measureMode));

    doc.addEventListener("click", e => {
        const t = e.target.closest ? e.target : null;
        if (!t) return;
        if (t.closest("[data-measure-clear]")) {
            measureSel = [];
            lastMeasure = null;
            clearMeasureLine();
            renderMeasure();
        }
        if (t.closest("[data-measure-exit]")) setMeasureMode(false);
    });

    doc.addEventListener("change", e => {
        if (e.target && e.target.name === "mkind") {
            measureKind = e.target.value;
            drawMeasureLine();
        }
    });

    // ---------------- Evidence details (ECO) ----------------
    let showEvidenceFull = false;

    doc.getElementById("show-evd").addEventListener("change", e => {
        showEvidenceFull = e.target.checked;
        redrawList();
    });

    // Redraw when a new ECO label is found (automatically unsubscribe when the window closes).
    const onEcoLoaded = () => {
        if (win.closed) { ecoListeners.delete(onEcoLoaded); return; }
        redrawList();
        renderPosInfo();
    };
    ecoListeners.add(onEcoLoaded);

    // ---------------- Category buttons + subcategory dropdown ----------------
    function buildPanels() {
        categories.forEach(([k]) => {
            const panel = doc.getElementById("panel-" + k);
            if (!panel) return;

            const counts = {};
            validFeatures.forEach(ft => {
                if (window.FEATURE_TYPE_TO_CATEGORY[ft.feature_type] === k) {
                    counts[ft.feature_type] = (counts[ft.feature_type] || 0) + 1;
                }
            });

            const types = Object.keys(counts).sort((a, b) => (typeOrder[a] ?? 999) - (typeOrder[b] ?? 999));

            if (!types.length) {
                panel.innerHTML = `<div class="cat-empty">This protein has no features in this category.</div>`;
                return;
            }

            panel.innerHTML = `
                <div class="cat-panel-tools"><a data-act="all">Select all</a><a data-act="none">Clear</a><a data-act="pick" title="Select all positions in this category (sequence + 3D)">◎ Select category</a></div>
                ${types.map(t => `
                    <label class="cat-opt">
                        <input type="checkbox" data-type="${escapeHtml(t)}">
                        <i class="sw" style="background:${typeColor[t] || "#ccc"}"></i>
                        <span>${escapeHtml(t)}</span><em>${counts[t]}</em>
                        <button type="button" class="opt-pick" data-pick-type="${escapeHtml(t)}" title="Select all positions for “${escapeHtml(t)}” (sequence + 3D)">◎</button>
                    </label>`).join("")}
                <div class="cat-note">None selected = show all subcategories.</div>`;
        });
    }

    function refreshAll() {
        categories.forEach(([k, label]) => {
            const on = active.includes(k);
            const wrap = doc.querySelector(`.cat-wrap[data-category="${k}"]`);
            const btn = doc.querySelector(`.feature-category-btn[data-category="${k}"]`);
            if (wrap) wrap.classList.toggle("active", on);
            if (btn) {
                btn.classList.toggle("active", on);
                btn.textContent = typeSel[k].size ? `${label} (${typeSel[k].size})` : label;
            }
            doc.querySelectorAll(`#panel-${k} input[data-type]`).forEach(cb => {
                cb.checked = typeSel[k].has(cb.dataset.type);
            });
        });

        updateUbUI();
        updateSasaUI();
        redrawSequence();
        redrawList();
    }

    function closePanels() {
        doc.querySelectorAll(".cat-wrap.open, .ub-wrap.open").forEach(w => w.classList.remove("open"));
    }

    // Category buttons: toggle a category; when turned off, also clear its selected subcategories.
    doc.querySelectorAll(".feature-category-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const c = btn.dataset.category;
            const i = active.indexOf(c);
            if (i >= 0) { active.splice(i, 1); typeSel[c].clear(); } else active.push(c);
            refreshAll();
        });
    });

    // Dropdown arrow: expand / collapse the subcategory panel.
    doc.querySelectorAll(".cat-caret").forEach(caret => {
        caret.addEventListener("click", e => {
            e.stopPropagation();
            const wrap = caret.closest(".cat-wrap");
            const willOpen = !wrap.classList.contains("open");
            closePanels();
            if (willOpen) {
                const panel = wrap.querySelector(".cat-panel");
                panel.classList.remove("align-right");
                wrap.classList.add("open");
                if (wrap.getBoundingClientRect().left + panel.offsetWidth > win.innerWidth - 8) {
                    panel.classList.add("align-right");
                }
            }
        });
    });

    doc.addEventListener("click", e => {
        if (!e.target.closest(".cat-wrap, .ub-wrap")) closePanels();
    });

    // Selecting a subcategory automatically enables its category.
    doc.addEventListener("change", e => {
        const cb = e.target.closest ? e.target.closest(".cat-opt input[data-type]") : null;
        if (!cb) return;

        const k = cb.closest(".cat-wrap").dataset.category;
        if (cb.checked) typeSel[k].add(cb.dataset.type); else typeSel[k].delete(cb.dataset.type);
        if (!active.includes(k)) active.push(k);
        refreshAll();
    });

    // Select all / clear.
    doc.addEventListener("click", e => {
        const act = e.target.closest ? e.target.closest(".cat-panel-tools a") : null;
        if (!act) return;

        const wrap = act.closest(".cat-wrap");
        const k = wrap.dataset.category;

        if (act.dataset.act === "pick") {
            selectCategory(k);
            return;
        }

        typeSel[k].clear();
        if (act.dataset.act === "all") {
            wrap.querySelectorAll("input[data-type]").forEach(cb => typeSel[k].add(cb.dataset.type));
            if (!active.includes(k)) active.push(k);
        }
        refreshAll();
    });

    doc.getElementById("btn-clear").addEventListener("click", clearPick);

    doc.getElementById("btn-copy").addEventListener("click", async () => {
        try {
            await win.navigator.clipboard.writeText(seq);
            doc.getElementById("btn-copy").textContent = "Copied ✓";
        } catch (e) {
            console.error("Copy failed:", e);
        }
    });

    // ---------------- Font size ----------------
    doc.getElementById("seq-size").addEventListener("input", function () {
        seqBox.style.setProperty("--seq-size", this.value + "px");
        doc.getElementById("seq-size-val").textContent = this.value + "px";
    });

    // ---------------- Draggable divider ----------------
    function resizeMolstar() {
        try { viewer?.plugin.handleResize(); } catch (e) { /* ignore */ }
        win.dispatchEvent(new win.Event("resize"));
    }

    function makeSplitter(el, axis) {
        const app = doc.getElementById("app");
        const right = doc.getElementById("right");

        el.addEventListener("mousedown", e => {
            e.preventDefault();
            el.classList.add("dragging");
            doc.body.classList.add(axis === "v" ? "dragging-v" : "dragging-h");

            const onMove = ev => {
                if (axis === "v") {
                    const rect = app.getBoundingClientRect();
                    let leftW = ev.clientX - rect.left;
                    leftW = Math.max(250, Math.min(rect.width - 250, leftW));
                    app.style.gridTemplateColumns = `${leftW}px 6px 1fr`;
                } else {
                    const rect = right.getBoundingClientRect();
                    let topH = ev.clientY - rect.top;
                    topH = Math.max(120, Math.min(rect.height - 100, topH));
                    right.style.gridTemplateRows = `${topH}px 6px 1fr`;
                }
                resizeMolstar();
            };

            const onUp = () => {
                el.classList.remove("dragging");
                doc.body.classList.remove("dragging-v", "dragging-h");
                doc.removeEventListener("mousemove", onMove);
                doc.removeEventListener("mouseup", onUp);
                resizeMolstar();
            };

            doc.addEventListener("mousemove", onMove);
            doc.addEventListener("mouseup", onUp);
        });
    }

    makeSplitter(doc.getElementById("split-v"), "v");
    makeSplitter(doc.getElementById("split-h"), "h");

    // ---------------- Initial view ----------------
    injectTypeColors();
    buildPanels();
    buildUbPanel();
    refreshAll();

    // ---------------- Load Mol* ----------------
    function loadScript(src, isLoaded) {
        return new Promise((resolve, reject) => {
            if (isLoaded()) { resolve(); return; }
            const sc = doc.createElement("script");
            sc.src = src;
            sc.onload = resolve;
            sc.onerror = () => reject(new Error("Failed to load: " + src));
            doc.head.appendChild(sc);
        });
    }

    let viewerPromise = null;

    function ensureViewer() {
        if (viewerPromise) return viewerPromise;

        viewerPromise = (async () => {
            await loadScript(MOLSTAR_JS_URL, () => win.molstar?.Viewer);
            await loadScript(
                new URL("/static/js/molstar-controls.js", location.origin).href,
                () => win.molstarControls
            );

            viewer = await win.molstar.Viewer.create(doc.getElementById("mol-host"), {
                layoutIsExpanded: false,
                layoutShowControls: false,
                layoutShowRemoteState: false,
                layoutShowSequence: false,
                layoutShowLog: false,
                layoutShowLeftPanel: false,
                viewportShowExpand: false,
                viewportShowSelectionMode: false,
                viewportShowAnimation: false
            });

            // 3D → sequence: clicking a residue in 3D scrolls to and marks it in the sequence.
            try {
                viewer.plugin.behaviors.interaction.click.subscribe(ev => onMolClick(ev));
            } catch (e) { console.warn("[UKW] Could not subscribe to 3D selection events:", e); }

            return viewer;
        })();

        viewerPromise.catch(() => { viewerPromise = null; });
        return viewerPromise;
    }

    // ---------------- Structure menu (PDB / predicted models) ----------------
    const pdbSelect = doc.getElementById("pdb-select");
    let structureOptions = [];

    function formatMetric(value, digits) {
        if (value === null || value === undefined || value === "") return "—";
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : "—";
    }

    function renderStructureDetails(st) {
        if (!st || !["alphafold", "swiss_model"].includes(st.source)) {
            structureDetails.hidden = true;
            structureDetails.innerHTML = "";
            return;
        }

        const metadata = st.metadata || data.predicted_structures?.[st.source] || {};
        if (st.source === "alphafold") {
            structureDetails.innerHTML = `
                <dl><div><dt>Mean pLDDT</dt><dd>${formatMetric(metadata.confidence_avg, 1)}</dd></div></dl>
                <div id="sequence-plddt-legend">
                    <strong>pLDDT confidence score (0–100)</strong>
                    <div id="sequence-plddt-gradient" role="img" aria-label="Low confidence is red, high confidence is blue"></div>
                    <div id="sequence-plddt-ranges">&lt;50 Very low · 50–70 Low · 70–90 Confident · ≥90 Very high</div>
                </div>
            `;
        } else {
            const coverage = metadata.coverage;
            const coveragePercent = coverage === null || coverage === undefined || coverage === ""
                ? "—"
                : `${formatMetric(Number(coverage) * 100, 1)}%`;
            structureDetails.innerHTML = `
                <dl>
                    <div><dt>QMEAN</dt><dd>${formatMetric(metadata.qmean, 3)}</dd></div>
                    <div><dt>GMQE</dt><dd>${formatMetric(metadata.gmqe, 3)}</dd></div>
                    <div><dt>Coverage</dt><dd>${coveragePercent}</dd></div>
                </dl>
            `;
        }
        structureDetails.hidden = false;
    }

    function updateStructureControls(ready = false) {
        doc.querySelectorAll("[data-structure-action]").forEach(button => {
            button.disabled = !ready
                || (button.dataset.structureAction === "confidence" && structure?.source !== "alphafold");
        });
    }

    doc.getElementById("structure-controls").addEventListener("click", async event => {
        const button = event.target.closest("[data-structure-action]");
        if (!button || button.disabled) return;

        const action = button.dataset.structureAction;
        const actions = {
            cartoon: () => win.molstarControls.setCartoon(viewer),
            surface: () => win.molstarControls.setSurface(viewer),
            confidence: () => win.molstarControls.setConfidence(viewer),
            fullscreen: () => win.molstarControls.toggleFullscreen(doc.getElementById("mol"))
        };
        updateStructureControls(false);
        structureControlStatus.textContent = action === "fullscreen" ? "" : "Updating structure view…";
        try {
            await actions[action]();
            structureControlStatus.textContent = "";
        } catch (error) {
            console.error("[UKW] Structure viewer control failed:", error);
            structureControlStatus.textContent = error.message || String(error);
        } finally {
            updateStructureControls(Boolean(viewer?.plugin?.managers?.structure?.hierarchy?.current?.structures?.length));
        }
    });

    function buildStructureOptions() {
        const opts = [];

        (data.structures || []).forEach(r => {
            if (!r.pdb_url) return;
            opts.push({
                label: `PDB ${r.pdb_id}`,
                st: { source: "pdb", id: r.pdb_id, url: r.pdb_url, format: guessFormat(r.pdb_url) }
            });
        });

        const ps = data.predicted_structures || {};

        if (ps.alphafold) {
            const u = ps.alphafold.local_pdb_path
                ? localModelUrl("alphafold")
                : (ps.alphafold.pdb_url || ps.alphafold.cif_url);
            if (u) opts.push({
                label: "AlphaFold",
                st: { source: "alphafold", id: ps.alphafold.uniprot_id, url: u, format: guessFormat(u), metadata: ps.alphafold }
            });
        }
        if (ps.alphafill && ps.alphafill.cif_url) {
            opts.push({ label: "AlphaFill", st: { source: "alphafill", id: ps.alphafill.uniprot_id, url: ps.alphafill.cif_url, format: "mmcif" } });
        }
        if (ps.swiss_model && ps.swiss_model.coordinates_url) {
            const u = ps.swiss_model.local_pdb_path
                ? localModelUrl("swiss_model")
                : ps.swiss_model.coordinates_url;
            opts.push({ label: "SWISS-MODEL", st: { source: "swiss_model", id: ps.swiss_model.uniprot_id, url: u, format: "pdb", metadata: ps.swiss_model } });
        }

        structureOptions = opts;
    }

    function syncSelect() {
        if (!structure) {
            pdbSelect.innerHTML = structureOptions.length ? "" : `<option>No structure</option>`;
        }

        // Add the current structure if it is not in the list (for example, if the main page selected a file outside the list).
        if (structure && !structureOptions.some(o => o.st.url === structure.url)) {
            structureOptions.unshift({
                label: `${structure.source === "pdb" ? "PDB " : ""}${structure.id || "structure"}`,
                st: structure
            });
        }

        pdbSelect.innerHTML = structureOptions
            .map((o, i) => `<option value="${i}">${escapeHtml(o.label)}</option>`).join("");

        if (structure) {
            const idx = structureOptions.findIndex(o => o.st.url === structure.url);
            if (idx >= 0) pdbSelect.value = String(idx);
        }
    }

    // When switching or first loading a structure, reset mappings and coverage, then reapply the current selection after loading.
    async function switchStructure(st) {
        const token = ++loadToken;

        structure = st || null;
        siftsMap = null;
        siftsStatus = { ok: false, reason: "", keys: [], used: "" };
        coverage = null;
        sasaData = null;
        sasaStatus = "";
        structureControlStatus.textContent = "";
        updateStructureControls(false);
        renderStructureDetails(structure);

        doc.getElementById("cov-info").textContent = "";
        measureSel = [];
        lastMeasure = null;
        renderMeasure();
        renderPosInfo();
        syncSelect();
        redrawSequence();
        redrawList();

        if (!structure || !structure.url) {
            try { viewer?.plugin.managers.structure.focus.clear(); await viewer?.plugin.clear(); } catch (e) { /* ignore */ }
            msg.style.display = "flex";
            msg.textContent = "No 3D structure is available for this protein.";
            return;
        }

        msg.style.display = "flex";
        msg.textContent = "Loading 3D structure…";

        try {
            await ensureViewer();
            if (token !== loadToken) return;

            win.molstarControls.resetConfidence(viewer);
            try { viewer.plugin.managers.structure.focus.clear(); } catch (e) { /* ignore */ }
            await viewer.plugin.clear();
            if (token !== loadToken) return;

            const url = structure.source === "swiss_model"
                ? new URL(localModelUrl("swiss_model"), location.origin).href
                : new URL(structure.url, location.origin).href;
            const isBinary = /\.bcif(\?|$)/i.test(url);
            const format = isBinary ? "mmcif" : (structure.format || guessFormat(url));

            await Promise.all([
                viewer.loadStructureFromUrl(url, format, isBinary),
                loadSifts(structure)
            ]);
            if (token !== loadToken) return;

            await removeWater();
            if (token !== loadToken) return;

            msg.style.display = "none";
            updateStructureControls(true);
            applyViewerStyle();
            resizeMolstar();

            computeCoverage();
            applyCoverageClass();
            renderCoverageInfo();
            redrawList();
            startSasa(token);

            if (pick) showRangesInMolstar(pick.ranges);
        } catch (err) {
            if (token !== loadToken) return;
            console.error("[UKW] Mol* failed to load:", err, "\nstructure:", structure);
            msg.style.display = "flex";
            msg.textContent = "Failed to load 3D structure: " + (err.message || err);
        }
    }

    // Switch manually in the window.
    pdbSelect.addEventListener("change", () => {
        const o = structureOptions[Number(pdbSelect.value)];
        if (o) switchStructure(o.st);
    });

    // When a new PDB is selected on the main page (currentPdbUrl changes), automatically update the structure in this window.
    let lastMainUrl = (typeof currentPdbUrl !== "undefined" && currentPdbUrl) || null;

    const mainWatcher = setInterval(() => {
        if (win.closed) { clearInterval(mainWatcher); return; }

        const u = (typeof currentPdbUrl !== "undefined" && currentPdbUrl) || null;
        if (!u || u === lastMainUrl) return;

        lastMainUrl = u;
        const st = structureFromMain();
        if (st && (!structure || st.url !== structure.url)) switchStructure(st);
    }, 400);

    buildStructureOptions();
    switchStructure(structure);
}

window.openSequenceView = openSequenceView;

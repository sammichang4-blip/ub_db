
// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 06. Renderers: experimental/predicted structures, domains,
//     GO functions, E1-E2-E3-substrate relations
// ============================================================

function renderStructures(structures) {
    if (!Array.isArray(structures) || structures.length === 0) {
        return `<p style="color:var(--ink-dim)">No structure data is available in the database.</p>`;
    }

    const rows = structures.map(s => {
        const pdbId = s.pdb_id || "";
        const pdbUrl = s.pdb_url || "";

        return `
            <tr>
                <td>
                    ${pdbUrl
                        ? `<a class="pdb-link" href="${escapeHtml(pdbUrl)}"
                                onclick="setCurrentPDB('${escapeHtml(pdbId)}', '${escapeHtml(pdbUrl)}'); showPDBStructure('${escapeHtml(pdbUrl)}'); return false;">
                                ${escapeHtml(pdbId)}
                            </a>`
                        : escapeHtml(pdbId)}
                </td>
                <td>${escapeHtml(s.method || "")}</td>
                <td>${s.resolution_A ? escapeHtml(s.resolution_A) : "—"}</td>
                <td>${escapeHtml(s.chains || "")}</td>
                <td>${escapeHtml(s.title || "")}</td>
                <td>
                    ${pdbUrl
                        ? `<a class="pdb-download" href="${escapeHtml(pdbUrl)}" download="${escapeHtml(pdbId)}.pdb"
                                title="Download ${escapeHtml(pdbId)} PDB file">💾</a>`
                        : "—"}
                </td>
            </tr>
        `;
    }).join("");

    return `
        <table>
            <thead>
                <tr>
                    <th>PDB ID</th>
                    <th>Method</th>
                    <th>Resolution (Å)</th>
                    <th>Chain</th>
                    <th>Title</th>
                    <th>Download</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderPredictedStructures(predicted) {
    if (!predicted) {
        return "";
    }

    const rows = [];

    // --- AlphaFold ---
    if (predicted.alphafold) {
        const af = predicted.alphafold;
        const confidence = af.confidence_avg ? Number(af.confidence_avg).toFixed(1) : "—";

        rows.push(`
            <tr>
                <td>AlphaFold</td>
                <td>
                    ${af.pdb_url
                        ? `<a class="pdb-link" href="${escapeHtml(af.pdb_url)}"
                                onclick="setCurrentPDB('AlphaFold', '${escapeHtml(af.pdb_url)}'); showPDBStructure('${escapeHtml(af.pdb_url)}'); return false;">View</a>`
                        : "—"}
                </td>
                <td>version ${escapeHtml(af.model_version || "")}</td>
                <td>pLDDT: ${confidence}</td>
                <td>
                    ${af.pdb_url
                        ? `<a class="pdb-download" href="${escapeHtml(af.pdb_url)}" download="${escapeHtml(af.protein_id)}_alphafold.pdb" title="Download AlphaFold PDB">💾</a>`
                        : "—"}
                </td>
            </tr>
        `);
    }

    // --- AlphaFill ---
    if (predicted.alphafill) {
        const afl = predicted.alphafill;
        let ligands = [];

        try {
            ligands = JSON.parse(afl.ligands || "[]");
        }
        catch (error) {
            ligands = [];
        }

        const ligandText = ligands.length ? ligands.join(", ") : "—";

        rows.push(`
            <tr>
                <td>AlphaFill</td>
                <td>
                    ${afl.cif_url
                        ? `<a class="pdb-link" href="${escapeHtml(afl.cif_url)}"
                                onclick="setCurrentPDB('AlphaFill', '${escapeHtml(afl.cif_url)}'); showPDBStructure('${escapeHtml(afl.cif_url)}'); return false;">
                                ${escapeHtml(afl.hit_count || 0)} hit(s)
                            </a>`
                        : `${escapeHtml(afl.hit_count || 0)} hit(s)`}
                </td>
                <td>ligands: ${escapeHtml(ligandText)}</td>
                <td>—</td>
                <td>
                    ${afl.cif_url
                        ? `<a class="pdb-download" href="${escapeHtml(afl.cif_url)}" download="${escapeHtml(afl.protein_id)}_alphafill.cif" title="Download AlphaFill CIF">💾</a>`
                        : "—"}
                </td>
            </tr>
        `);
    }

    // --- SWISS-MODEL ---
    if (predicted.swiss_model) {
        const sm = predicted.swiss_model;
        const qmean = sm.qmean ? Number(sm.qmean).toFixed(2) : "—";

        rows.push(`
            <tr>
                <td>SWISS-MODEL</td>
                <td>
                    ${sm.coordinates_url
                        ? `<a class="pdb-link" href="${escapeHtml(sm.coordinates_url)}"
                                onclick="setCurrentPDB('SWISS-MODEL', '${escapeHtml(sm.coordinates_url)}'); showPDBStructure('${escapeHtml(sm.coordinates_url)}'); return false;">View</a>`
                        : "—"}
                </td>
                <td>${escapeHtml(sm.template || "")}</td>
                <td>QMEAN: ${qmean}</td>
                <td>
                    ${sm.coordinates_url
                        ? `<a class="pdb-download" href="${escapeHtml(sm.coordinates_url)}" download="${escapeHtml(sm.protein_id)}_swissmodel.pdb" title="Download SWISS-MODEL PDB">💾</a>`
                        : "—"}
                </td>
            </tr>
        `);
    }

    if (rows.length === 0) {
        return `<p style="color:var(--ink-dim)">No predicted structure data is available in the database.</p>`;
    }

    return `
        <table>
            <thead>
                <tr>
                    <th>Source</th>
                    <th>Model information</th>
                    <th>Template / ligands</th>
                    <th>Confidence score</th>
                    <th>Download</th>
                </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
        </table>
    `;
}


/* ============================================================
 * GO Functions
 * ============================================================ */
// ------------------------------------------------------------------
// Cell GO Viewer — replaces the original renderFunctions tag list.
// ------------------------------------------------------------------
// Color-code GO evidence codes: experimental > phylogenetic > sequence similarity > literature/manual curation > computational.
const EVIDENCE_CATEGORY = {
    // Experimental evidence (most reliable) — green
    EXP: "exp", IDA: "exp", IPI: "exp", IMP: "exp", IGI: "exp", IEP: "exp",
    HTP: "exp", HDA: "exp", HMP: "exp", HGI: "exp", HEP: "exp",
    // Phylogenetic inference — blue
    IBA: "phylo", IBD: "phylo", IKR: "phylo", IRD: "phylo",
    // Sequence/database similarity inference — purple
    ISS: "seq", ISO: "seq", ISA: "seq", ISM: "seq", IGC: "seq", RCA: "seq",
    // Literature/manual curator judgment — orange
    TAS: "author", NAS: "author", IC: "author", ND: "author",
    // Computational annotation only (not manually reviewed) — gray
    IEA: "auto",
};

const CELLGO_LEGEND = `
    <div class="cellgo-legend">
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--exp"></i>Experimental evidence</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--phylo"></i>Phylogenetic</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--seq"></i>Sequence similarity inference</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--author"></i>Literature/manual curation</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--auto"></i>Computational (IEA)</span>
    </div>
`;

function evidenceClass(code) {
    const cat = EVIDENCE_CATEGORY[(code || "").toUpperCase()];
    return cat ? `cellgo-evidence--${cat}` : "cellgo-evidence--other";
}

let _cellgoSvgTextPromise = null;
function _getCellSvgText() {
    if (!_cellgoSvgTextPromise) {
        _cellgoSvgTextPromise = fetch("/static/img/Animal_cells.svg").then(r => r.text());
    }
    return _cellgoSvgTextPromise;
}

function renderCellGoView(functions) {

    if (!Array.isArray(functions) || functions.length === 0) {
        return `<p style="color:var(--ink-dim)">No GO annotations are available in the database.</p>`;
    }

    const groups = { C: [], F: [], P: []  };
    functions.forEach(f => {
        const key = (f.aspect || "").charAt(0).toUpperCase();
        if (groups[key]) groups[key].push(f);
    });

    function label(f) {
        return f.term_name || f.go_term || f.go_name || f.name || "";
    }

    // Molecular Function / Biological Process: display as before; no organelles are mapped.
    function renderStaticGroup(title, items) {
        if (!items.length) return "";
        return `
            <div class="cellgo-group">
                <h4>${title}</h4>
                <div class="cellgo-taglist">
                    ${items.map(f => `
                        <span class="cellgo-tag" title="${f.go_id || ""}">
                            ${label(f)}
                            ${f.evidence_code ? `<span class="cellgo-evidence ${evidenceClass(f.evidence_code)}">${f.evidence_code}</span>` : ""}
                        </span>
                        
                    `).join("")}
                </div>
            </div>
        `;
    }

    // Cellular Component: list of organelles that can be highlighted.
    function renderMappableGroup(title, items) {
        if (!items.length) return "";
        return `
            <div class="cellgo-group">
                <h4>${title}</h4>
                <ul class="cellgo-list" data-role="cellgo-list-C">
                    ${items.map(f => {
                        const slIds = Array.isArray(f.sl_ids) ? f.sl_ids : [];
                        const mappable = slIds.length > 0;
                        return `
                            <li class="${mappable ? "mappable" : ""}" ${mappable ? `data-sl="${slIds.join(",")}"` : ""}>
                                ${label(f)}
                                <span class="cellgo-goid">${f.go_id || ""}</span>
                                ${f.evidence_code ? `<span class="cellgo-evidence ${evidenceClass(f.evidence_code)}">${f.evidence_code}</span>` : ""}
                            </li>
                        `;
                    }).join("")}
                </ul>
            </div>
        `;
    }

    return `
        <div class="cellgo-header">
            <div class="cellgo-hint">
                After the page loads, the corresponding organelles are highlighted in sequence. Hover over an organelle in the diagram to show related GO functions on the right, and vice versa.
                ${CELLGO_LEGEND}
            </div>
            <button type="button" class="cellgo-expand-btn" data-role="cellgo-expand">🔍 Expand</button>
        </div>
        <div class="cellgo-layout">
            <div class="cellgo-cell-panel" data-role="cellgo-cell-panel">
                <div class="cellgo-loading">Loading cell diagram...</div>
            </div>
            <div class="cellgo-go-panel">
                ${renderMappableGroup("Cellular Component (highlightable organelles)", groups.C)}
                ${renderStaticGroup("Molecular Function", groups.F)}
                ${renderStaticGroup("Biological Process", groups.P)}
                
            </div>
        </div>
    `;
}

// Call after inserting into the DOM: inject the SVG, run the automatic tour, and bind bidirectional hover.
async function initCellGoView(container,proteinId) {
    if (!container) return;
    const cellPanel = container.querySelector('[data-role="cellgo-cell-panel"]');
    const listC = container.querySelector('[data-role="cellgo-list-C"]');
    const expandBtn = container.querySelector('[data-role="cellgo-expand"]');

    if (!cellPanel) return;

    // ---- Expand button: open the full cell_go_view in a new window ----
    if (expandBtn && proteinId) {
        expandBtn.addEventListener("click", () => {
            window.openProteinTabView("cell_go", proteinId);
        });
    }

    let svgRoot;
    try {
        cellPanel.innerHTML = await _getCellSvgText();
        svgRoot = cellPanel.querySelector("svg");
    } catch (err) {
        cellPanel.innerHTML = `<div class="cellgo-loading">Failed to load the cell diagram.</div>`;
        return;
    }

    const splitSl = (str) => (str || "").split(",").filter(Boolean);

    function setGlow(slIds, classNames, on) {
        for (const slId of slIds) {
            svgRoot.querySelectorAll(`[id="${CSS.escape(slId)}"]`).forEach((node) => {
                classNames.forEach((cls) => node.classList.toggle(cls, on));
            });
        }
    }

    if (!listC) return;
    const items = Array.from(listC.querySelectorAll("li.mappable"));
    if (!items.length) return;

    // ---- Automatic tour, in sequence ----
    const STEP_MS = 1300;
    let i = 0;
    function step() {
        if (i > 0) {
            const prev = items[i - 1];
            prev.classList.remove("active");
            setGlow(splitSl(prev.dataset.sl), ["sl-glow-strong", "sl-glow-pulse"], false);
        }
        if (i >= items.length) {
            items.forEach((li) => setGlow(splitSl(li.dataset.sl), ["sl-glow-soft"], true));
            return;
        }
        const li = items[i];
        li.classList.add("active");
        setGlow(splitSl(li.dataset.sl), ["sl-glow-strong", "sl-glow-pulse"], true);
        i += 1;
        setTimeout(step, STEP_MS);
    }
    step();

    // ---- Bidirectional hover: organelles in the diagram <-> list ----
    cellPanel.addEventListener("mouseover", (e) => {
        const g = e.target.closest('[id^="SL"]');
        if (!g) return;
        setGlow([g.id], ["sl-glow-strong"], true);
        items.forEach((li) => { if (splitSl(li.dataset.sl).includes(g.id)) li.classList.add("active"); });
    });
    cellPanel.addEventListener("mouseout", (e) => {
        const g = e.target.closest('[id^="SL"]');
        if (!g) return;
        if (e.relatedTarget && g.contains(e.relatedTarget)) return;
        setGlow([g.id], ["sl-glow-strong"], false);
        items.forEach((li) => { if (splitSl(li.dataset.sl).includes(g.id)) li.classList.remove("active"); });
    });
    listC.addEventListener("mouseover", (e) => {
        const li = e.target.closest("li.mappable");
        if (!li) return;
        li.classList.add("active");
        setGlow(splitSl(li.dataset.sl), ["sl-glow-strong"], true);
    });
    listC.addEventListener("mouseout", (e) => {
        const li = e.target.closest("li.mappable");
        if (!li) return;
        li.classList.remove("active");
        setGlow(splitSl(li.dataset.sl), ["sl-glow-strong"], false);
    });
}


function renderEvidence(evidence, reference_pmid) {
    let html = "";

    if (evidence) {
        html += `<div class="evidence-text">${escapeHtml(evidence)}</div>`;
    }

    if (reference_pmid) {
        const pmids = String(reference_pmid).split(/[;, ]+/).filter(x => x.trim());

        html += `
            <div class="pmid-links">
                📚 Evidence:
                ${pmids.map(id => `
                    <a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/" target="_blank" rel="noopener noreferrer">
                        PMID:${escapeHtml(id)}
                    </a>
                `).join(",")}
            </div>
        `;
    }

    return html;
}

function renderRelations(relations, protein) {
    if (!Array.isArray(relations) || relations.length === 0) {
        return `
            <p style="color:var(--ink-dim)">
                No E1–E2–E3 relationship chain is currently recorded in the database with this protein as the substrate.
                <br>
                (Ubiquitin itself is usually a modifier rather than a substrate; try an example substrate protein such as TP53.)
            </p>
        `;
    }

    return relations.map(r => `
        <div class="chain-row">
            <span class="chain-node e1">${escapeHtml(r.e1_gene || r.e1_id || "?")} (E1)</span>
            <span class="chain-arrow">→</span>
            <span class="chain-node e2">${escapeHtml(r.e2_gene || r.e2_id || "?")} (E2)</span>
            <span class="chain-arrow">→</span>
            <span class="chain-node e3">
                ${escapeHtml(r.e3_gene || r.e3_id || "?")}
                (E3${r.e3_subfamily ? ", " + escapeHtml(r.e3_subfamily) : ""})
            </span>
            <span class="chain-arrow">→</span>
            <span class="chain-node sub">${escapeHtml(r.substrate_id)} (substrate)</span>

            <div class="chain-meta">
                <strong>Type:</strong>${escapeHtml(r.ub_type || "—")}<br>
                <strong>Modified lysine:</strong>${escapeHtml(r.modified_lysine || "—")}<br>
                <strong>Outcome:</strong>${escapeHtml(r.functional_outcome || "—")}<br>
                ${renderEvidence(r.evidence, r.reference_pmid)}<br>
                <em>Source: ${escapeHtml(r.source_db || "—")}</em>
            </div>
        </div>
    `).join("");
}
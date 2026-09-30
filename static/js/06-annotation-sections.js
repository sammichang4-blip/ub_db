
// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 06. Renderers: experimental/predicted structures, domains,
//     GO functions, E1-E2-E3-substrate relations
// ============================================================

function renderStructures(structures) {
    if (!Array.isArray(structures) || structures.length === 0) {
        return `<p style="color:var(--ink-dim)">目前資料庫中無結構資料。</p>`;
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
                    <th>方法</th>
                    <th>解析度 Å</th>
                    <th>鏈</th>
                    <th>標題</th>
                    <th>下載</th>
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
                                onclick="setCurrentPDB('AlphaFold', '${escapeHtml(af.pdb_url)}'); showPDBStructure('${escapeHtml(af.pdb_url)}'); return false;">檢視</a>`
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
                                onclick="setCurrentPDB('SWISS-MODEL', '${escapeHtml(sm.coordinates_url)}'); showPDBStructure('${escapeHtml(sm.coordinates_url)}'); return false;">檢視</a>`
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
        return `<p style="color:var(--ink-dim)">目前資料庫中無預測結構資料。</p>`;
    }

    return `
        <table>
            <thead>
                <tr>
                    <th>來源</th>
                    <th>模型資訊</th>
                    <th>模板 / Ligands</th>
                    <th>信心分數</th>
                    <th>下載</th>
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
// Cell GO Viewer —— 取代原本 renderFunctions 的 tag 清單
// ------------------------------------------------------------------
// GO evidence code 分類上色：實驗證據 > 系統發生學 > 序列比對推論 > 人工文獻 > 電腦自動
const EVIDENCE_CATEGORY = {
    // 實驗證據（最可靠）－ 綠色
    EXP: "exp", IDA: "exp", IPI: "exp", IMP: "exp", IGI: "exp", IEP: "exp",
    HTP: "exp", HDA: "exp", HMP: "exp", HGI: "exp", HEP: "exp",
    // 系統發生學推論 － 藍色
    IBA: "phylo", IBD: "phylo", IKR: "phylo", IRD: "phylo",
    // 序列/資料庫比對推論 － 紫色
    ISS: "seq", ISO: "seq", ISA: "seq", ISM: "seq", IGC: "seq", RCA: "seq",
    // 人工文獻／curator 判斷 － 橘色
    TAS: "author", NAS: "author", IC: "author", ND: "author",
    // 純電腦自動註解（未經人工審核）－ 灰色
    IEA: "auto",
};

const CELLGO_LEGEND = `
    <div class="cellgo-legend">
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--exp"></i>實驗證據</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--phylo"></i>系統發生學</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--seq"></i>序列比對推論</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--author"></i>文獻／人工判斷</span>
        <span class="cellgo-legend-item"><i class="cellgo-evidence cellgo-evidence--auto"></i>電腦自動 (IEA)</span>
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
        return `<p style="color:var(--ink-dim)">目前資料庫中無 GO 註解。</p>`;
    }

    const groups = { C: [], F: [], P: []  };
    functions.forEach(f => {
        const key = (f.aspect || "").charAt(0).toUpperCase();
        if (groups[key]) groups[key].push(f);
    });

    function label(f) {
        return f.term_name || f.go_term || f.go_name || f.name || "";
    }

    // Molecular Function / Biological Process：跟原本一樣純展示，沒有對應胞器
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

    // Cellular Component：可以點亮胞器的清單
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
                頁面載入後會依序自動點亮對應的胞器；滑鼠移到圖上的胞器，右側會對應到相關的 GO function（反之亦然）。
                ${CELLGO_LEGEND}
            </div>
            <button type="button" class="cellgo-expand-btn" data-role="cellgo-expand">🔍 放大檢視</button>
        </div>
        <div class="cellgo-layout">
            <div class="cellgo-cell-panel" data-role="cellgo-cell-panel">
                <div class="cellgo-loading">細胞圖載入中...</div>
            </div>
            <div class="cellgo-go-panel">
                ${renderMappableGroup("Cellular Component（可點亮胞器）", groups.C)}
                ${renderStaticGroup("Molecular Function", groups.F)}
                ${renderStaticGroup("Biological Process", groups.P)}
                
            </div>
        </div>
    `;
}

// 插入 DOM 之後呼叫：注入 SVG、跑自動導覽、綁雙向 hover
async function initCellGoView(container,proteinId) {
    if (!container) return;
    const cellPanel = container.querySelector('[data-role="cellgo-cell-panel"]');
    const listC = container.querySelector('[data-role="cellgo-list-C"]');
    const expandBtn = container.querySelector('[data-role="cellgo-expand"]');

    if (!cellPanel) return;

    // ---- 放大按鈕：開新視窗秀完整版 cell_go_view ----
    if (expandBtn && proteinId) {
        expandBtn.addEventListener("click", () => {
            const url = `/protein/${encodeURIComponent(proteinId)}/cell-view`;
            window.open(
                url,
                "cellGoViewWindow",
                "width=1200,height=850,menubar=no,toolbar=no,location=no,status=no"
            );
        });
    }

    let svgRoot;
    try {
        cellPanel.innerHTML = await _getCellSvgText();
        svgRoot = cellPanel.querySelector("svg");
    } catch (err) {
        cellPanel.innerHTML = `<div class="cellgo-loading">細胞圖載入失敗</div>`;
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

    // ---- 依序自動導覽 ----
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

    // ---- 雙向 hover：圖上胞器 <-> 清單 ----
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
                此蛋白質目前在資料庫中沒有記錄作為 substrate 的 E1–E2–E3 關係鏈。
                <br>
                （ubiquitin 本身通常作為修飾分子而非 substrate；請改查 TP53 等範例受質蛋白）
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
                <strong>類型：</strong>${escapeHtml(r.ub_type || "—")}<br>
                <strong>修飾 Lysine：</strong>${escapeHtml(r.modified_lysine || "—")}<br>
                <strong>結果：</strong>${escapeHtml(r.functional_outcome || "—")}<br>
                ${renderEvidence(r.evidence, r.reference_pmid)}<br>
                <em>資料來源：${escapeHtml(r.source_db || "—")}</em>
            </div>
        </div>
    `).join("");
}
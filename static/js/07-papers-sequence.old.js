// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 07. Renderers: functional description, papers list,
//     sequence track, copy-sequence, expanded paper popup,
//     sequence + Mol* popup (SIFTS mapping)
//
// 依賴（由其他檔案提供）：
//   escapeHtml, highlightSearch, showCopyMessage,
//   LYSINE_SITES, currentSearchKeyword
// index.html 建議提供：
//   window.MOLSTAR_JS  = "{{ url_for('static', filename='molstar/molstar.js') }}";
//   window.MOLSTAR_CSS = "{{ url_for('static', filename='molstar/molstar.css') }}";
// ============================================================

// ------------------------------------------------------------
// Functional description
// ------------------------------------------------------------
function renderDescription(desc) {
    if (!desc) {
        return `<p style="color:var(--ink-dim)">No functional description.</p>`;
    }

    desc = desc.replace(/\{ECO:[^}]+\}/g, "");
    desc = desc.replace(/\s+/g, " ").trim();

    const blocks = desc.match(/.*?\(PubMed:[^)]+\)\./g) || [desc];

    let html = "";
    let index = 1;

    blocks.forEach(block => {
        const pmids = [...block.matchAll(/PubMed:(\d+)/g)].map(m => m[1]);
        const text = block.replace(/\(PubMed:[^)]+\)\./g, "").trim();

        html += `
            <div class="function-card">
                <div class="function-title">
                    <span class="function-index">${index}.</span>
                    ${escapeHtml(text)}
                    📚
                    ${pmids.map(id => `
                        <a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noopener noreferrer">PMID:${id}</a>
                    `).join(",")}
                </div>
            </div>
        `;
        index++;
    });

    return html;
}

// ------------------------------------------------------------
// Papers list
// ------------------------------------------------------------
function renderPapers(papers, options = {}) {
    if (!Array.isArray(papers) || papers.length === 0) {
        return `<p style="color:var(--ink-dim)">No recent papers found.</p>`;
    }

    const expandAll = options.expandAll === true;
    const VISIBLE_COUNT = 5;

    let html = "";

    papers.forEach((paper, i) => {
        const meta = [paper.journal, paper.pub_date || paper.pub_year]
            .filter(Boolean)
            .map(escapeHtml)
            .join(" · ");

        const hiddenClass = (!expandAll && i >= VISIBLE_COUNT) ? "paper-hidden" : "";

        html += `
            <div class="function-card paper-card ${hiddenClass}">
                <div class="function-title">
                    <span class="function-index">${i + 1}.</span>
                    <a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(paper.pmid)}/" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(paper.title)}
                    </a>
                    <div>
                        <span style="color:var(--ink-dim); font-size:0.85em;">
                            * ${meta}
                            · score: ${escapeHtml(paper.relevance_score)}
                            ${paper.matched_term ? `· matched: ${escapeHtml(paper.matched_term)}` : ""}
                        </span>
                    </div>
                </div>
            </div>
        `;
    });

    if (!expandAll && papers.length > VISIBLE_COUNT) {
        html += `
            <button class="show-more-btn" onclick="toggleMorePapers(this)">
                顯示更多（還有 ${papers.length - VISIBLE_COUNT} 篇）
            </button>
        `;
    }

    return html;
}

function toggleMorePapers(btn) {
    const container = btn.closest(".scroll-box");
    if (!container) return;

    const hiddenPapers = container.querySelectorAll(".paper-hidden");
    const isExpanded = btn.dataset.expanded === "true";

    hiddenPapers.forEach(el => {
        el.style.display = isExpanded ? "none" : "block";
    });

    btn.dataset.expanded = (!isExpanded).toString();
    btn.textContent = isExpanded
        ? `顯示更多（還有 ${hiddenPapers.length} 篇）`
        : "收起";
}

// ------------------------------------------------------------
// Expanded ("popup window") paper view with a year-range filter
// ------------------------------------------------------------
function openExpandedView() {
    const data = window.currentData || window.currentProteinData;
    const p = window.currentProtein || (data && data.protein);

    if (!p || !data) {
        console.error("尚未載入蛋白質資料");
        return;
    }

    const win = window.open("", "_blank", "width=900,height=800,scrollbars=yes,resizable=yes");
    if (!win) {
        alert("瀏覽器封鎖了彈出視窗，請允許彈出視窗後再試一次。");
        return;
    }

    function getPaperDate(paper) {
        const value = paper.pub_date || paper.publication_date || paper.date || paper.year;
        if (!value) return null;

        if (/^\d{4}$/.test(String(value))) {
            return new Date(Number(value), 0, 1);
        }

        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    function filterPapersByYears(papers, years) {
        if (!Array.isArray(papers)) return [];

        const now = new Date();
        const startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - years);

        return papers.filter(paper => {
            const d = getPaperDate(paper);
            return d && d >= startDate && d <= now;
        });
    }

    function filterPapersByYear(papers, year) {
        return Array.isArray(papers)
            ? papers.filter(paper => Number(paper.pub_year) === Number(year))
            : [];
    }

    function showPapers(papers) {
        const container = win.document.getElementById("papers-container");
        const count = win.document.getElementById("paper-count");
        if (container) container.innerHTML = renderPapers(papers, { expandAll: true });
        if (count) count.textContent = `${papers.length} 篇`;
    }

    const initialYears = 1;
    const initialPapers = filterPapersByYears(data.papers, initialYears);
    const papersHtml = renderPapers(initialPapers, { expandAll: true });
    const descHtml = renderDescription(p.description);

    win.document.write(`
        <!DOCTYPE html>
        <html lang="zh-Hant">
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(p.protein_name)} (${escapeHtml(p.gene_name)}) - 詳細資料</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif; max-width:900px; margin:0 auto; padding:2em; line-height:1.6; color:#222; background:#fff; }
                h1 { font-size:1.4em; margin-bottom:0.3em; }
                h5 { margin-top:1.5em; margin-bottom:0.8em; }
                .function-card { padding:0.6em 0; border-bottom:1px solid #eee; }
                .function-index { font-weight:600; margin-right:0.4em; }
                a { color:#2563eb; }
                .paper-filter { margin:15px 0 20px 0; padding:14px 18px; background:#f7f7f7; border:1px solid #ddd; border-radius:8px; }
                .paper-filter-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
                .paper-filter-title { font-weight:600; }
                #paper-years-label { font-weight:600; color:#2563eb; }
                #paper-count { color:#777; font-size:0.9em; margin-left:8px; }
                #paper-years { width:100%; cursor:pointer; }
                .year-scale { display:flex; justify-content:space-between; color:#777; font-size:0.8em; margin-top:3px; }
                .year-buttons { margin-top:12px; display:flex; flex-wrap:wrap; gap:5px; align-items:center; }
                .year-btn { padding:4px 9px; border:1px solid #ccc; background:#fff; border-radius:5px; cursor:pointer; }
                .year-btn:hover { background:#eee; }
                .year-btn.active { background:#2563eb; color:white; border-color:#2563eb; }
            </style>
        </head>
        <body>
            <h1>${escapeHtml(p.protein_name)} <span style="font-weight:400; color:#888;">(${escapeHtml(p.gene_name)})</span></h1>
            <p style="color:#888;">
                UniProt: ${escapeHtml(p.uniprot_acc)} · ${escapeHtml(p.entry_name || "")} · ${escapeHtml(p.organism)} · ${escapeHtml(p.length)} aa
            </p>

            <b>Gene alias:</b>
            ${highlightSearch(
                (p.gene_alias || []).map(a => a.gene_alias).join(" ; "),
                currentSearchKeyword
            )}
            <p>
            <b>Protein alias:</b>
            ${highlightSearch(
                (p.protein_alias || []).map(a => a.alias_name).join(" ; "),
                currentSearchKeyword
            )}

            <h5>📄 相關論文（PubMed，近期）</h5>

            <div class="paper-filter">
                <div class="paper-filter-header">
                    <span class="paper-filter-title">論文時間範圍</span>
                    <span>
                        最近 <span id="paper-years-label">1 年</span>
                        <span id="paper-count">${initialPapers.length} 篇</span>
                    </span>
                </div>

                <input type="range" id="paper-years" min="1" max="10" step="1" value="1">

                <div class="year-scale">
                    <span>1 年</span><span>2 年</span><span>3 年</span><span>4 年</span><span>5 年</span>
                    <span>6 年</span><span>7 年</span><span>8 年</span><span>9 年</span><span>10 年</span>
                </div>

                <div class="year-buttons">
                    <button class="year-btn active" data-year="all">全部（依滑桿）</button>
                    依年份：
                    ${[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]
                        .map(year => `<button class="year-btn" data-year="${year}">${year}</button>`)
                        .join("")}
                </div>
            </div>

            <div id="papers-container">${papersHtml}</div>

            <h5 style="color:#888;">🗂 功能描述（UniProt，較舊）</h5>
            ${descHtml}
        </body>
        </html>
    `);

    win.document.close();

    const slider = win.document.getElementById("paper-years");
    const yearLabel = win.document.getElementById("paper-years-label");

    if (slider) {
        slider.addEventListener("input", function () {
            const years = Number(this.value);
            if (yearLabel) yearLabel.textContent = `${years} 年`;

            win.document.querySelectorAll(".year-btn").forEach(btn => btn.classList.remove("active"));
            const allBtn = win.document.querySelector('.year-btn[data-year="all"]');
            if (allBtn) allBtn.classList.add("active");

            showPapers(filterPapersByYears(data.papers, years));
        });
    }

    const yearButtons = win.document.querySelectorAll(".year-btn");

    yearButtons.forEach(btn => {
        btn.addEventListener("click", function () {
            yearButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const year = btn.dataset.year;

            if (year === "all") {
                if (slider) showPapers(filterPapersByYears(data.papers, Number(slider.value)));
            } else {
                showPapers(filterPapersByYear(data.papers, year));
            }
        });
    });
}

// ------------------------------------------------------------
// Feature type → category map
// ------------------------------------------------------------
window.FEATURE_TYPE_TO_CATEGORY = window.FEATURE_TYPE_TO_CATEGORY || {};

(function buildFeatureTypeCategoryMap() {
    const categories = (typeof FEATURE_CATEGORIES !== "undefined")
        ? FEATURE_CATEGORIES
        : (window.FEATURE_CATEGORIES || {
            structural: ["CHAIN", "PEPTIDE", "PROPEP", "DOMAIN", "REGION", "REPEAT", "COILED", "HELIX", "STRAND", "TURN"],
            localization: ["SIGNAL", "TRANSIT", "TRANSMEM", "TOPO_DOM", "INTRAMEM"],
            functional: ["ACT_SITE", "BINDING", "SITE", "DNA_BIND", "ZN_FING", "MOTIF"],
            modification: ["MOD_RES", "CARBOHYD", "LIPID", "DISULFID", "CROSSLNK", "NON_STD", "NON_TER", "INIT_MET"],
            variation: ["VARIANT", "VAR_SEQ", "MUTAGEN", "CONFLICT", "COMPBIAS"]
        });

    Object.entries(categories).forEach(([category, types]) => {
        if (!Array.isArray(types)) return;
        types.forEach(type => {
            window.FEATURE_TYPE_TO_CATEGORY[type] = category;
        });
    });
})();

// ------------------------------------------------------------
// Feature details (list under the sequence)
// ------------------------------------------------------------
// ------------------------------------------------------------
// Evidence（UniProt feature 的證據）：ECO 說明 + PubMed 等連結
//   例：evidence = "ECO:0007744|PubMed:23186163"
// ------------------------------------------------------------
const ECO_LABELS = {
    "ECO:0000269": "experimental evidence used in manual assertion",
    "ECO:0000250": "sequence similarity evidence used in manual assertion",
    "ECO:0000255": "match to sequence model evidence used in manual assertion",
    "ECO:0000305": "curator inference used in manual assertion",
    "ECO:0000303": "non-traceable author statement used in manual assertion",
    "ECO:0000312": "imported information used in manual assertion",
    "ECO:0000244": "combinatorial evidence used in manual assertion",
    "ECO:0007744": "combinatorial computational and experimental evidence used in manual assertion",
    "ECO:0000256": "match to sequence model evidence used in automatic assertion",
    "ECO:0000259": "match to InterPro member signature evidence used in automatic assertion",
    "ECO:0000501": "evidence used in automatic assertion",
    "ECO:0000313": "imported information used in automatic assertion",
    "ECO:0000213": "combinatorial evidence used in automatic assertion",
    "ECO:0007829": "combinatorial computational and experimental evidence used in automatic assertion",
    "ECO:0007669": "computational evidence used in automatic assertion"
};

const ecoCache = {};            // 不在內建表中的 ECO 代碼，向 QuickGO 查詢後快取
const ecoPending = new Set();
const ecoListeners = new Set(); // 查到新名稱後，通知畫面重繪

function ecoLabel(code) {
    code = String(code || "").trim().toUpperCase();
    if (ECO_LABELS[code]) return ECO_LABELS[code];
    if (ecoCache[code]) return ecoCache[code];

    if (/^ECO:\d+$/.test(code) && !ecoPending.has(code)) {
        ecoPending.add(code);
        fetch(`https://www.ebi.ac.uk/QuickGO/services/ontology/eco/terms/${encodeURIComponent(code)}`,
              { headers: { Accept: "application/json" } })
            .then(r => (r.ok ? r.json() : null))
            .then(j => {
                const name = j && j.results && j.results[0] && j.results[0].name;
                if (name) {
                    ecoCache[code] = name;
                    ecoListeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
                }
            })
            .catch(() => { /* 查不到就只顯示代碼 */ });
    }
    return "";
}

// 把一個 feature 的 evidence 整理成 [{eco, db, acc}]
function parseEvidence(ft) {
    const rows = Array.isArray(ft && ft.evidence) ? ft.evidence : [];
    const out = [];
    const seen = new Set();

    const push = (eco, db, acc) => {
        eco = String(eco || "").trim();
        db = String(db || "").trim();
        acc = String(acc || "").trim();
        if (!eco && !db && !acc) return;
        const key = eco + "|" + db + "|" + acc;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ eco, db, acc });
    };

    rows.forEach(r => {
        const raw = String(r.raw_evidence || "");
        const complete = r.evidence_code && (r.database_name || !raw.includes("|"));

        if (complete) {
            push(r.evidence_code, r.database_name, r.accession);
            return;
        }

        // 例："ECO:0007744|PubMed:23186163"（可能以逗號串接多筆）
        raw.split(",").forEach(chunk => {
            const parts = chunk.split("|").map(x => x.trim()).filter(Boolean);
            const eco = parts.find(x => /^ECO:\d+/i.test(x)) || r.evidence_code || "";
            const other = parts.find(x => !/^ECO:/i.test(x) && x.includes(":"));
            let db = r.database_name || "", acc = r.accession || "";
            if (other) {
                const i = other.indexOf(":");
                db = db || other.slice(0, i);
                acc = acc || other.slice(i + 1);
            }
            push(eco, db, acc);
        });
    });

    return out;
}

function evidenceLink(db, acc) {
    if (!db && !acc) return "";
    const label = escapeHtml(`${db}${db && acc ? ":" : ""}${acc}`);
    const a = encodeURIComponent(acc);

    if (/^pubmed$/i.test(db) && /^\d+$/.test(acc)) {
        return `<a href="https://pubmed.ncbi.nlm.nih.gov/${a}/" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (/^uniprotkb$/i.test(db) && acc) {
        return `<a href="https://www.uniprot.org/uniprotkb/${a}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (/^pdb$/i.test(db) && acc) {
        return `<a href="https://www.rcsb.org/structure/${a}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (/^prosite-prorule$/i.test(db) && acc) {
        return `<a href="https://prosite.expasy.org/rule/${a}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
}

// opts.full：顯示 ECO 完整說明（每筆一行）；opts.cap：最多顯示幾筆
function evidenceHtml(ft, opts = {}) {
    const ev = parseEvidence(ft);
    if (!ev.length) return "";

    const cap = opts.cap || 99;
    const shown = ev.slice(0, cap);

    const items = shown.map(e => {
        const parts = [];

        if (e.eco) {
            const lab = ecoLabel(e.eco);
            parts.push(`<span title="${escapeHtml(lab || e.eco)}" style="border:1px solid #aaa;border-radius:8px;padding:0 5px;cursor:help">${escapeHtml(e.eco)}</span>`
                + (opts.full && lab ? ` <span style="color:#666">${escapeHtml(lab)}</span>` : ""));
        }

        const link = evidenceLink(e.db, e.acc);
        if (link) parts.push(link);

        return parts.join(" · ");
    });

    if (ev.length > shown.length) items.push(`…另有 ${ev.length - shown.length} 筆`);

    return `<div class="ukw-evd" style="font-size:.85em;color:#555;margin-top:2px">證據：${items.join(opts.full ? "<br>" : "；")}</div>`;
}

function buildFeatureDetailsHtml(features = [], categories = []) {
    if (categories.length === 0) return "";

    const list = features.filter(f =>
        categories.includes(window.FEATURE_TYPE_TO_CATEGORY[f.feature_type])
    );

    if (!list.length) {
        return `<div class="feature-empty">目前選取的分類沒有此蛋白質的 UniProt Feature。</div>`;
    }

    return list.map(feature => {
        const start = Number(feature.start_pos);
        const end = Number(feature.end_pos || feature.start_pos);
        const location = start === end ? `${start}` : `${start}–${end}`;
        const category = window.FEATURE_TYPE_TO_CATEGORY[feature.feature_type];

        return `
            <div class="feature-item" data-category="${category}" data-feature-id="${escapeHtml(String(feature.feature_id ?? ""))}">
                <div class="feature-item-header">
                    <strong>${escapeHtml(feature.feature_type || "Unknown")}</strong>
                    <span class="feature-location">${location}</span>
                </div>
                ${feature.note_text ? `<div class="feature-note">${escapeHtml(feature.note_text)}</div>` : ""}
                ${evidenceHtml(feature, { full: true })}
            </div>`;
    }).join("");
}

function renderFeatureDetails(features = []) {
    const box = document.getElementById("feature-details");
    if (!box) return;

    const categories = window.activeFeatureCategories || [];
    const html = buildFeatureDetailsHtml(features, categories);

    box.style.display = html ? "block" : "none";
    box.innerHTML = html;
}

// ------------------------------------------------------------
// Sequence track (60-residue lines, 10-residue ruler groups)
// ------------------------------------------------------------
function renderSequence(seq, features = [], categories = window.activeFeatureCategories || []) {
    if (!seq) return "";

    const lineLength = 60;
    const groupSize = 10;
    const activeCategories = categories;

    // 先過濾一次，避免每個殘基都掃全部 features
    const usableFeatures = features.filter(feature => {
        const start = Number(feature.start_pos);
        if (!Number.isFinite(start) || start < 1) return false;
        if (activeCategories.length === 0) return false;   // 沒選分類就不標色
        return activeCategories.includes(window.FEATURE_TYPE_TO_CATEGORY[feature.feature_type]);
    });

    let html = "";

    for (let lineStart = 0; lineStart < seq.length; lineStart += lineLength) {

        const lineEnd = Math.min(lineStart + lineLength, seq.length);

        let rulerHtml = "";
        let residueHtml = "";

        for (let groupStart = lineStart; groupStart < lineEnd; groupStart += groupSize) {

            const groupEnd = Math.min(groupStart + groupSize, lineEnd);
            const groupNumber = groupEnd;

            rulerHtml += `
                <div class="seq-group seq-ruler-group">
                    ${Array.from({ length: groupEnd - groupStart }, (_, j) => {
                        const pos = groupStart + j + 1;
                        return `<span class="ruler-cell">${pos === groupNumber && pos % groupSize === 0 ? pos : ""}</span>`;
                    }).join("")}
                </div>
            `;

            let groupResidues = "";

            for (let i = groupStart; i < groupEnd; i++) {

                const pos = i + 1;
                const aa = seq[i];

                let cls = "res";
                const titleParts = [`位置 ${pos}: ${aa}`];

                // 已知多泛素鏈接 Lysine
                if (typeof LYSINE_SITES !== "undefined" && LYSINE_SITES.includes(pos) && aa === "K") {
                    cls += " lys-site";
                    titleParts.push("已知多泛素鏈接 Lysine");
                }

                // C-terminal Gly-Gly
                if (pos >= seq.length - 1 && aa === "G") {
                    cls += " gg-site";
                    titleParts.push("C-terminal Gly-Gly");
                }

                // UniProt FT features
                usableFeatures.forEach(feature => {
                    const start = Number(feature.start_pos);
                    const end = Number(feature.end_pos || feature.start_pos);

                    if (pos < start || pos > end) return;

                    const type = feature.feature_type;
                    const category = window.FEATURE_TYPE_TO_CATEGORY[type];

                    if (category && !cls.includes(` cat-${category}`)) {
                        cls += ` cat-${category}`;
                    }

                    cls += ` feature-${String(type).toLowerCase()}`;

                    titleParts.push(type + (feature.note_text ? `: ${feature.note_text}` : ""));
                });

                groupResidues += `<span class="${cls}" data-position="${pos}" title="${escapeHtml(titleParts.join(" | "))}">${escapeHtml(aa)}</span>`;
            }

            residueHtml += `<div class="seq-group seq-residue-group">${groupResidues}</div>`;
        }

        html += `
            <div class="seq-line-block">
                <div class="seq-ruler">${rulerHtml}</div>
                <div class="seq-line">${residueHtml}</div>
            </div>
        `;
    }

    return html;
}

// ------------------------------------------------------------
// Re-render sequence (main page)
// ------------------------------------------------------------
function renderAndUpdateSequence(sequence) {
    const seqBox = document.getElementById("protein-sequence");

    if (!seqBox) {
        console.error("[UKW] 找不到 #protein-sequence");
        return;
    }

    let savedSequence = typeof sequence === "string" ? sequence.trim() : "";

    if (savedSequence) {
        seqBox.dataset.sequence = savedSequence;
        window.currentProteinSequence = savedSequence;
    } else {
        savedSequence = seqBox.dataset.sequence || window.currentProteinSequence || "";
    }

    if (!savedSequence && window.currentProtein) {
        const protein = window.currentProtein;
        savedSequence = protein.sequence || protein.protein_sequence || protein.canonical_sequence || "";
    }

    if (!savedSequence) {
        savedSequence = Array.from(seqBox.querySelectorAll(".res"))
            .map(residue => residue.textContent || "")
            .join("");
    }

    if (!savedSequence) {
        console.error("[UKW] 找不到原始 sequence。");
        return;
    }

    seqBox.dataset.sequence = savedSequence;
    window.currentProteinSequence = savedSequence;

    const features = Array.isArray(window.currentProteinFeatures)
        ? window.currentProteinFeatures
        : [];

    seqBox.innerHTML = renderSequence(savedSequence, features);
    renderFeatureDetails(features);

    document.querySelectorAll(".feature-category-btn").forEach(button => {
        button.classList.toggle(
            "active",
            (window.activeFeatureCategories || []).includes(button.dataset.category)
        );
    });
}

// ------------------------------------------------------------
// Active feature categories — multi-select
// ------------------------------------------------------------
window.activeFeatureCategories = Array.isArray(window.activeFeatureCategories)
    ? window.activeFeatureCategories
    : [];

function toggleFeatureCategory(category) {
    const validCategories = ["structural", "localization", "functional", "modification", "variation"];

    if (!validCategories.includes(category)) {
        console.error("[UKW] 未知的 Feature 分類：", category);
        return;
    }

    const categories = window.activeFeatureCategories;
    const index = categories.indexOf(category);

    if (index >= 0) {
        categories.splice(index, 1);
    } else {
        categories.push(category);
    }

    document.querySelectorAll(".feature-category-btn").forEach(button => {
        const on = categories.includes(button.dataset.category);
        button.classList.toggle("active", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
    });

    const seqBox = document.getElementById("protein-sequence");
    if (seqBox) {
        renderAndUpdateSequence(seqBox.dataset.sequence || window.currentProteinSequence || "");
    } else {
        console.error("[UKW] 找不到 #protein-sequence；分類狀態已更新，但無法重繪序列。");
    }
}

window.toggleFeatureCategory = toggleFeatureCategory;

// 若按鈕沒有 inline onclick，使用事件代理；有 inline onclick 則不重複切換。
if (!window.__ukwFeatureCategoryDelegationInstalled) {
    document.addEventListener("click", function (event) {
        const button = event.target.closest("button");
        if (!button) return;

        const labelToCategory = {
            "structure": "structural",
            "structural": "structural",
            "localization": "localization",
            "functional": "functional",
            "modification": "modification",
            "variation": "variation"
        };

        const label = (button.textContent || "").trim().toLowerCase();
        const category = button.dataset.category || labelToCategory[label];
        const looksLikeCategoryButton = button.classList.contains("feature-category-btn")
            || Boolean(button.dataset.category)
            || Object.prototype.hasOwnProperty.call(labelToCategory, label);

        if (!looksLikeCategoryButton || !category) return;

        // 只處理主頁面的按鈕（彈出視窗有自己的事件）
        if (event.target.ownerDocument !== document) return;

        const inlineHandler = button.getAttribute("onclick") || "";
        if (/toggleFeatureCategory\s*\(/.test(inlineHandler)) return;

        event.preventDefault();
        window.toggleFeatureCategory(category);
    });
    window.__ukwFeatureCategoryDelegationInstalled = true;
}

// ------------------------------------------------------------
// Copy sequence
// ------------------------------------------------------------
async function copySequence() {
    const seqBox = document.getElementById("protein-sequence");

    if (!seqBox) {
        console.error("找不到 #protein-sequence");
        return;
    }

    const sequence = seqBox.dataset.sequence || "";

    if (!sequence) {
        console.error("Sequence 是空的");
        return;
    }

    try {
        await navigator.clipboard.writeText(sequence);
        showCopyMessage("Sequence copied ✓");
    } catch (error) {
        console.error("Copy sequence failed:", error);

        const textarea = document.createElement("textarea");
        textarea.value = sequence;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand("copy");
            showCopyMessage("Sequence copied ✓");
        } catch (e) {
            console.error("Fallback copy failed:", e);
        }

        document.body.removeChild(textarea);
    }
}

// ============================================================
// Sequence + Mol* popup
//   左：序列　右上：Mol*　右下：feature 清單
//   點序列胺基酸或清單項目 → 在 Mol* 選取並聚焦（UniProt→PDB 用 SIFTS 換算）
// ============================================================
async function openSequenceView() {

    // 必須在使用者點擊後同步開窗，否則會被瀏覽器擋掉
    const win = window.open("", "_blank", "width=1400,height=850,scrollbars=yes,resizable=yes");
    if (!win) {
        alert("瀏覽器封鎖了彈出視窗，請允許彈出視窗後再試一次。");
        return;
    }
    win.document.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2em;color:#888">載入中…</body></html>`);

    // ---------------- 取得資料 ----------------
    let data = window.currentProteinData || window.currentData || null;

    if (!data || !data.protein) {
        const cur = window.currentProtein
            || (typeof currentProtein !== "undefined" ? currentProtein : null);
        const pid = cur && (cur.protein_id || cur.uniprot_acc);

        if (!pid) {
            win.close();
            alert("尚未載入蛋白質資料，請先選擇一個蛋白質。");
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
            console.error("[UKW] 重新載入蛋白質資料失敗：", e);
            win.close();
            return;
        }
    }

    const p = data.protein || window.currentProtein || {};
    const seq = window.currentProteinSequence || p.sequence || "";
    const features = (Array.isArray(window.currentProteinFeatures) && window.currentProteinFeatures.length)
        ? window.currentProteinFeatures
        : (data.features || []);
    // ---- 結構來源：優先使用主頁面目前選到的 PDB（state.js: currentPdbId / currentPdbUrl） ----
    function guessFormat(url) {
        return /\.(cif|mmcif|bcif)(\?|$)/i.test(url || "") ? "mmcif" : "pdb";
    }

    function structureFromMain() {
        const url = (typeof currentPdbUrl !== "undefined" && currentPdbUrl) || null;
        const id = (typeof currentPdbId !== "undefined" && currentPdbId) || "";
        if (!url) return null;

        const act = data.active_structure;
        if (act && act.url === url) return act;

        const rec = (data.structures || []).find(r =>
            r.pdb_url === url || (id && String(r.pdb_id).toUpperCase() === String(id).toUpperCase()));
        if (rec) {
            return { source: "pdb", id: rec.pdb_id, url: rec.pdb_url || url, format: guessFormat(rec.pdb_url || url) };
        }

        return {
            source: /^[0-9][A-Za-z0-9]{3}$/.test(id) ? "pdb" : "other",
            id, url, format: guessFormat(url)
        };
    }

    let structure = structureFromMain() || data.active_structure || null;   // {source, id, url, format}

    if (!seq) {
        console.error("[UKW] 沒有 sequence 可顯示");
        win.close();
        return;
    }

    // ---------------- 資源網址 ----------------
    const MOLSTAR_JS_URL = new URL(window.MOLSTAR_JS || "/static/molstar/molstar.js", location.origin).href;
    const MOLSTAR_CSS_URL = new URL(window.MOLSTAR_CSS || "/static/molstar/molstar.css", location.origin).href;

    // 沿用主頁面 CSS（序列、按鈕、分類顏色一致）
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(n => n.tagName === "LINK" ? `<link rel="stylesheet" href="${n.href}">` : n.outerHTML)
        .join("\n");

    const categories = [
        ["structural", "Structure"],
        ["localization", "Localization"],
        ["functional", "Functional"],
        ["modification", "Modification"],
        ["variation", "Variation"]
    ];

    let active = [...(window.activeFeatureCategories || [])];
    let pick = null;   // {start, end}

    // ---------------- 分類細項（feature type）：篩選與排序 ----------------
    const typeSel = {};   // {category: Set(feature_type)}；空集合 = 該分類全部細項
    categories.forEach(([k]) => { typeSel[k] = new Set(); });

    const catDef = data.feature_categories || window.FEATURE_CATEGORIES || {};
    const typeOrder = {};   // 排序依據：分類順序 → 分類內細項順序
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

    // 每個細項（feature type）一個固定顏色；排除黃色系，避免與「選取」的黃色混淆
    const TYPE_PALETTE = ["#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171",
        "#38bdf8", "#e879f9", "#4ade80", "#fb7185", "#818cf8", "#22d3ee", "#c084fc", "#f9a8d4",
        "#86efac", "#93c5fd", "#fdba74", "#5eead4", "#d8b4fe"];

    const presentTypes = [...new Set(validFeatures.map(ft => ft.feature_type))]
        .sort((a, b) => (typeOrder[a] ?? 999) - (typeOrder[b] ?? 999));
    const typeColor = {};
    presentTypes.forEach((t, i) => { typeColor[t] = TYPE_PALETTE[i % TYPE_PALETTE.length]; });

    // 範圍大的細項（如 CHAIN）排在前面、樣式先寫，細項（HELIX 等）後寫而蓋過它
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

    // ---------------- 寫入視窗 ----------------
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(p.protein_name || "")} (${escapeHtml(p.gene_name || "")}) - Sequence + 3D</title>
${styles}
<link rel="stylesheet" href="${MOLSTAR_CSS_URL}">
<style>
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
    /* 3D 結構覆蓋：有結構的殘基加藍色底線，沒有的變淡 */
    #seq-box .res.has-3d { border-bottom:3px solid #2563eb; }
    #seq-box .res.no-3d { opacity:.4; }
    .list-item.no-3d-item { opacity:.5; }
    .list-item.no-3d-item .list-head span::after { content:" · 無 3D"; color:#999; font-size:.85em; }
    #cov-info { color:#555; font-size:.85em; margin:2px 0 6px; }
    #cov-info .cov-bar { display:inline-block; width:22px; border-bottom:3px solid #2563eb; vertical-align:middle; margin-right:4px; }

    #mol { position:relative; min-height:0; background:#f3f4f6; overflow:hidden; }
    #mol-host { position:absolute; inset:0; }
    #pdb-picker { position:absolute; top:6px; left:6px; z-index:1000; }
    #pdb-picker select { padding:3px 6px; border:1px solid #ccc; border-radius:5px; background:#fff; font-size:.85em; max-width:220px; }
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

    /* 泛素化位點 */
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
        <h1>${escapeHtml(p.protein_name || "")}
            <span style="font-weight:400;color:#888;">(${escapeHtml(p.gene_name || "")})</span></h1>
        <div style="color:#888;">UniProt: ${escapeHtml(p.uniprot_acc || "")} · ${escapeHtml(p.length || seq.length)} aa</div>
        <div class="toolbar">
            <label style="display:flex;align-items:center;gap:6px;">字體大小
                <input type="range" id="seq-size" min="10" max="32" value="15">
                <span id="seq-size-val">15px</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;">
                <input type="checkbox" id="auto-zoom"> 自動聚焦
            </label>
            <label style="display:flex;align-items:center;gap:4px;" title="選取殘基時，一併顯示 4.5 Å 內的配體 / 離子（例如 BINDING 位點的配體）">
                <input type="checkbox" id="show-lig" checked> 顯示鄰近配體
            </label>
            <label style="display:flex;align-items:center;gap:4px;" title="清單中顯示 ECO 證據的完整說明（位置資訊面板一律顯示）">
                <input type="checkbox" id="show-evd"> 顯示證據說明
            </label>
            <button type="button" class="copy-btn" id="btn-clear">清除選取</button>
            <button type="button" class="copy-btn" id="btn-measure" title="依序點兩個殘基，顯示距離">📏 測距</button>
            <button type="button" class="copy-btn" id="btn-copy">📋 Copy</button>
        </div>
        <div class="motif-row">
            <input type="text" id="motif-input" placeholder="Motif（正規表示式），例：K..K 或 N[^P][ST]" spellcheck="false">
            <select id="motif-preset" title="常用 motif 範例">
                <option value="">範例…</option>
                <option value="[VILMFAP]K.[DE]">SUMO ψKxE</option>
                <option value="N[^P][ST]">N-糖基化 N-X-S/T</option>
                <option value="K..K">K..K</option>
                <option value="KEN">KEN box</option>
                <option value="R..L....N">D-box</option>
                <option value="[RK][RK].[ST]">PKA 位點</option>
            </select>
            <button type="button" class="copy-btn" id="motif-go">搜尋</button>
            <button type="button" class="copy-btn" id="motif-clear">清除</button>
            <span id="motif-status"></span>
        </div>
        <div id="pick-info"></div>
        <div id="cov-info"></div>
        <div id="seq-box" class="seq-wrap"></div>
    </div>

    <div id="split-v" class="splitter"></div>

    <div id="right">
        <div id="mol">
            <div id="pdb-picker"><select id="pdb-select" title="切換結構"></select></div>
            <div id="mol-msg">${structure ? "載入 3D 結構中…" : "此蛋白質沒有可用的 3D 結構"}</div>
            <div id="mol-host"></div>
        </div>
        <div id="split-h" class="splitter"></div>
        <div id="list-wrap">
            <div id="list-head">
                <div class="feature-category-bar">
                    ${categories.map(([k, l]) => `
                        <span class="cat-wrap" data-category="${k}">
                            <button type="button" class="feature-category-btn" data-category="${k}">${l}</button><button type="button" class="cat-caret" title="篩選細項">▾</button>
                            <div class="cat-panel" id="panel-${k}"></div>
                        </span>`).join("")}
                    <span class="ub-wrap" id="ub-wrap">
                        <button type="button" class="ub-btn" id="ub-toggle" title="標示泛素／類泛素（SUMO、NEDD8、ISG15…）修飾位點">Ub/UBL 位點</button><button type="button" class="ub-caret" id="ub-caret" title="依鏈型篩選">▾</button>
                        <div class="ub-panel" id="ub-panel"></div>
                    </span>
                    <span class="ub-wrap" id="sasa-wrap">
                        <button type="button" class="ub-btn" id="sasa-toggle" title="3D 結構上每個 Lys 的表面可及性（SASA），並與 Ub/UBL 位點交叉比對">Lys 可及性</button><button type="button" class="ub-caret" id="sasa-caret" title="一鍵選取">▾</button>
                        <div class="ub-panel" id="sasa-panel"></div>
                    </span>
                </div>
                <div class="cat-hint">▾ 展開可篩選細項（未勾選＝顯示該分類全部）；清單依細項分組排序</div>
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

    let viewer = null;
    let loadToken = 0;         // 切換結構時用來丟棄過期的非同步結果
    let siftsMap = null;       // UniProt → PDB 對應表（只有 PDB 結構需要）
    let infoBase = "";

    // ---------------- 3D 覆蓋範圍（序列上標示可點選的部分） ----------------
    let coverage = null;   // Uint8Array，index = UniProt 位置，1 = 有 3D 結構

    // 取得載入結構中「真的有原子」的殘基集合："chain:auth_seq_id"
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
                    if (isWaterAt(SP, loc)) continue;   // 水分子不參與選取與覆蓋計算
                    set.add(SP.chain.auth_asym_id(loc) + ":" + SP.residue.auth_seq_id(loc));
                }
            }
            return set;
        } catch (e) {
            console.warn("[UKW] 無法讀取結構殘基，改用 SIFTS 範圍：", e);
            return null;
        }
    }

    function computeCoverage() {
        coverage = new Uint8Array(seq.length + 2);
        if (!structure) return;

        if (structure.source !== "pdb") {
            coverage.fill(1);   // AlphaFold 等預測模型涵蓋全長
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
        if (!coverage) return true;   // 尚未載入對應表前不要變淡
        for (let i = s; i <= e; i++) if (coverage[i]) return true;
        return false;
    }

    function applyCoverageClass() {
        if (!coverage || !structure || structure.source !== "pdb") return;   // 全長覆蓋就不用標示
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
            box.textContent = `3D：${structure.source} 預測結構（涵蓋全長）`;
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
            let why = "無對應範圍";
            if (siftsStatus.reason.startsWith("fetch-failed")) {
                why = "SIFTS 查詢失敗（" + siftsStatus.reason.slice(13) + "）";
            } else if (siftsStatus.reason === "acc-mismatch") {
                why = `SIFTS 中此 PDB 對應的是 ${siftsStatus.keys.join(", ")}，與目前蛋白質（${p.uniprot_acc || p.protein_id || "?"}）不符`;
            } else if (siftsStatus.reason === "no-uniprot") {
                why = "SIFTS 沒有此 PDB 的 UniProt 對應資料";
            }
            box.innerHTML = `PDB ${escapeHtml(String(structure.id || ""))}：${escapeHtml(why)}`;
            return;
        }

        const text = ranges.map(r => r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`).join("、");

        box.innerHTML = `<span class="cov-bar"></span>PDB ${escapeHtml(String(structure.id || ""))} 覆蓋：${escapeHtml(text)}（${total} / ${seq.length} aa）`;
    }

    function setInfo(base, note = "") {
        infoBase = base;
        info.textContent = base + note;
    }

    // ---------------- SIFTS：UniProt 位置 → PDB chain / auth_seq_id ----------------
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

            console.log("[UKW] SIFTS 回傳的 UniProt：", keys, "；目前蛋白質：", cands);

            siftsStatus = { ok: !!hit, reason: "", keys, used: hit || "" };

            if (!hit) {
                siftsMap = [];
                siftsStatus.reason = keys.length ? "acc-mismatch" : "no-uniprot";
                return;
            }

            // 未解出的端點 author_residue_number 為 null，用另一端與區段長度推算
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

            console.log("[UKW] SIFTS 對應表：", siftsMap);
        } catch (e) {
            if (myToken !== loadToken) return;
            console.error("[UKW] SIFTS 取得失敗：", e);
            siftsMap = [];
            siftsStatus = { ok: false, reason: "fetch-failed:" + (e.message || e), keys: [], used: "" };
        }
    }

    // UniProt 區間 → 規則 [{chain, useAuth, a, b}]
    function buildRules(start, end) {
        // 非 PDB（AlphaFold 等）：編號與 UniProt 一致，用 label_seq_id
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

    // ---------------- Mol*：選取與聚焦 ----------------
    function getStructureData() {
        return viewer?.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data || null;
    }

    // 自己走訪原子，依 chain 與殘基編號組出 Loci（不依賴 structureInteractivity / MolScript）
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
                if (isWaterAt(SP, loc)) continue;   // 水分子不參與選取與覆蓋計算

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

    function showInMolstar(start, end) {
        showRangesInMolstar([[start, end]]);
    }

    // 一次選取多段（UniProt 區間）：序列與 3D 同步
    function showRangesInMolstar(ranges) {
        if (!viewer) return;

        try {
            const plugin = viewer.plugin;
            const mol = getStructureData();
            if (!mol) return;

            plugin.managers.interactivity.lociSelects.deselectAll();
            plugin.managers.structure.selection.clear();

            const rules = ranges.flatMap(([a, b]) => buildRules(a, b));
            console.log(`[UKW] UniProt ${ranges.length} 段 → rules`, rules);

            if (!rules.length) {
                setInfo(infoBase, "（此位置不在 3D 結構範圍內）");
                return;
            }

            const loci = buildLoci(mol, rules);

            if (!loci) {
                console.warn("[UKW] 在結構中找不到符合的原子", rules);
                setInfo(infoBase, "（此位置不在 3D 結構範圍內）");
                return;
            }

            const size = win.molstar.lib.structure.StructureElement.Loci.size(loci);
            console.log(`[UKW] 選到 ${size} / ${mol.elementCount} atoms`);

            // 一併顯示鄰近配體（如 BINDING 位點的配體、金屬離子）
            let finalLoci = loci;
            let ligText = "";
            if (doc.getElementById("show-lig")?.checked) {
                try {
                    const lg = nearbyLigands(mol, rules, 4.5);
                    if (lg) {
                        finalLoci = win.molstar.lib.structure.StructureElement.Loci.union(loci, lg.loci);
                        ligText = `；配體：${lg.comps.join(", ")}`;
                    }
                } catch (e) { console.warn("[UKW] 鄰近配體搜尋失敗：", e); }
            }

            setInfo(infoBase, `（3D：${size} atoms${ligText}）`);

            plugin.managers.structure.selection.fromLoci("set", finalLoci);
            try { plugin.managers.structure.focus.setFromLoci(finalLoci); } catch (e) { /* 舊版略過 */ }
            // 預設不移動相機；勾選「自動聚焦」才會拉近
            if (doc.getElementById("auto-zoom")?.checked) {
                plugin.managers.camera.focusLoci(finalLoci);
            }
        } catch (err) {
            console.error("[UKW] Mol* 標註失敗：", err);
        }
    }

    // ---------------- 水分子 ----------------
    const WATER_NAMES = new Set(["HOH", "WAT", "H2O", "DOD", "TIP", "TIP3", "SOL"]);

    function isWaterAt(SP, loc) {
        try {
            const fn = (SP.atom && SP.atom.label_comp_id) || (SP.residue && SP.residue.label_comp_id);
            return fn ? WATER_NAMES.has(String(fn(loc)).toUpperCase()) : false;
        } catch (e) {
            return false;
        }
    }

    // 載入 PDB 後移除水分子的 component（不顯示、也不佔用選取）
    async function removeWater() {
        try {
            const plugin = viewer.plugin;
            const h = plugin.managers.structure.hierarchy;
            await new Promise(r => setTimeout(r, 0));   // 等 hierarchy 同步

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
                console.log(`[UKW] 已移除水分子 component：${waters.length} 個`);
            }
        } catch (e) {
            console.warn("[UKW] 移除水分子失敗：", e);
        }
    }

    // 3D 外觀：底圖淡灰，選取用鮮豔對比色（改色號即可）
    const COLOR_BASE      = 0xB8C0CC;   // 底圖：淡灰藍
    const COLOR_SELECT    = 0xFACC15;   // 選取：黃（與左邊序列同色）
    const COLOR_HIGHLIGHT = 0xFF3D9A;   // 滑鼠移過：桃紅

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
        } catch (e) { console.warn("[UKW] 設定選取色失敗：", e); }

        try {
            const st = plugin.managers.structure.hierarchy.current.structures[0];
            if (st) {
                plugin.managers.structure.component.updateRepresentationsTheme(
                    st.components.filter(c => !/ligand|ion|branched/i.test(String(c.key || ""))),   // 配體與離子保留元素色
                    { color: "uniform", colorParams: { value: COLOR_BASE } }
                );
            }
        } catch (e) { console.warn("[UKW] 設定底圖顏色失敗：", e); }
    }

    function clearMolstar() {
        try { viewer?.plugin.managers.structure.focus.clear(); } catch (e) { /* ignore */ }
        try {
            viewer?.plugin.managers.interactivity.lociSelects.deselectAll();
            viewer?.plugin.managers.structure.selection.clear();
        } catch (e) { /* ignore */ }
    }

    // ---------------- 左：序列 ----------------
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

    // ---------------- 右下：feature 清單 ----------------
    function redrawList() {
        // 沒有選任何分類時顯示全部；依細項分組、細項內依位置排序
        const list = sortFeatures(visibleFeatures());

        if (!list.length) {
            listBox.innerHTML = buildMotifListHtml() + buildSasaListHtml() + buildUbListHtml() + `<div style="color:#888;padding:8px">沒有符合的 UniProt Feature。</div>`;
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
                    <button type="button" class="type-pick" data-pick-type="${escapeHtml(ft.feature_type || "")}" title="選取此細項全部位置（序列＋3D）">◎ 選取全部</button>
                </div>`;
            }

            html += `
                <div class="list-item${hasCoverage(st, en) ? "" : " no-3d-item"}" data-category="${cat}" data-start="${st}" data-end="${en}" style="border-left-color:${typeColor[ft.feature_type] || "#ccc"}">
                    <div class="list-head">
                        <strong>${escapeHtml(ft.feature_type || "")}</strong>
                        <span>${st === en ? st : st + "–" + en}</span>
                    </div>
                    ${ft.note_text ? `<div class="list-note">${escapeHtml(ft.note_text)}</div>` : ""}
                    ${ligNames(ft).length ? `<div class="list-note">配體：${escapeHtml(ligNames(ft).join("、"))}</div>` : ""}
                    ${evidenceHtml(ft, { full: showEvidenceFull, cap: showEvidenceFull ? 99 : 2 })}
                </div>`;
        });

        listBox.innerHTML = buildMotifListHtml() + buildSasaListHtml() + buildUbListHtml() + html;
        applyPickClass();
    }

    // ---------------- 選取（序列與清單共用） ----------------
    function rangesKey(ranges) {
        return ranges.map(r => r[0] + "-" + r[1]).join(",");
    }

    // ranges: [[start, end], ...]（UniProt 位置）。單段或多段共用
    function setPickRanges(ranges, opts = {}) {
        const { scroll = true, label = "" } = opts;

        const start = Math.min(...ranges.map(r => r[0]));
        const end = Math.max(...ranges.map(r => r[1]));
        pick = { start, end, ranges, key: rangesKey(ranges) };

        const posSet = new Set();
        ranges.forEach(([a, b]) => { for (let i = a; i <= b; i++) posSet.add(i); });

        if (ranges.length === 1 && !label) {
            setInfo(start === end
                ? `選取：${seq[start - 1] || ""}${start}`
                : `選取：${start}–${end}（${end - start + 1} aa）`);
        } else {
            setInfo(`選取：${label || "多段"}（${ranges.length} 段，共 ${posSet.size} aa）`);
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

    // 整理成不重複、依位置排序的區段
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

    // 一鍵選取某個細項（feature type）的所有位置：序列 + 3D
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

        togglePickRanges(uniqueRanges(list), `${type} 全部`);
    }

    // 一鍵選取某分類目前顯示的所有細項（有勾選細項時只含勾選的）
    function selectCategory(k) {
        const list = validFeatures.filter(ft =>
            window.FEATURE_TYPE_TO_CATEGORY[ft.feature_type] === k
            && (typeSel[k].size === 0 || typeSel[k].has(ft.feature_type)));

        if (!list.length) return;
        if (!active.includes(k)) { active.push(k); refreshAll(); }

        const name = (categories.find(c => c[0] === k) || [k, k])[1];
        togglePickRanges(uniqueRanges(list), `${name} 全部`);
    }

    // 點序列上的胺基酸
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

    // 點清單項目
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

    // 一鍵選取按鈕（清單標題與下拉面板的 ◎）
    doc.addEventListener("click", e => {
        const b = e.target.closest ? e.target.closest("[data-pick-type]") : null;
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        selectType(b.dataset.pickType);
    });

    // ============================================================
    // 泛素化位點（ub_relations：本蛋白質為受質時的 modified_lysine，依鏈型分色）
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
        K48: "K48 鏈", K63: "K63 鏈", K11: "K11 鏈", K29: "K29 鏈", K27: "K27 鏈", K33: "K33 鏈",
        K6: "K6 鏈", M1: "M1 線性鏈", Mono: "單泛素化", Other: "其他／未標示",
        SUMO1: "SUMO1", SUMO2: "SUMO2", SUMO3: "SUMO3", SUMO: "SUMO（未分型）",
        NEDD8: "NEDD8", ISG15: "ISG15", UFM1: "UFM1", URM1: "URM1", FAT10: "FAT10", ATG12: "ATG12",
        UBL: "其他類泛素"
    };

    function isUBL(key) { return UBL_KEYS.includes(key); }
    function ubGroupLabel(key) { return isUBL(key) ? UB_NAME[key] : "Ub · " + UB_NAME[key]; }

    // 從 UniProt CROSSLNK 註解辨識修飾物：「interchain with G-Cter in XXX」
    function ublFromNote(note) {
        const m = /\bin (ubiquitin|SUMO[123]?|NEDD8|ISG15|UFM1|URM1|FAT10|ATG12)\b/i.exec(note);
        if (m) {
            const x = m[1].toUpperCase();
            return x === "UBIQUITIN" ? "ubiquitin" : x;
        }
        if (/interchain with G-Cter in [A-Za-z0-9\-]+/i.test(note)) return "UBL";   // 其他 G-Cter 類泛素（如 Pup）
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
        const parts = [String(r.functional_outcome || "").toLowerCase().startsWith("deub") ? "去泛素化" : "泛素化"];
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
            if (!r || !ids.includes(String(r.substrate_id || "").toUpperCase())) return;   // 只取「本蛋白質是受質」的紀錄

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
        // 本蛋白質若含泛素序列（如 UBB / UBC / UBA52 / RPS27A），用重複單元內的位置判斷鏈型（K6、K11…）
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
                link = mod;                       // SUMO / NEDD8 / ISG15 … 直接以修飾物為類別
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
            // 已有明確鏈型時，去掉「其他」
            if (site.linkages.length > 1) site.linkages = site.linkages.filter(l => l !== "Other");
            site.linkages = ubSortLinks(site.linkages);
            site.primary = site.linkages[0];
            // 該位置不是 Lys（UniProt CROSSLNK 可能是 Cys/Ser/Thr/Met，不警告）
            site.warn = !site.fromUniprot && site.aa !== "K" && !(site.linkages.includes("M1") && site.aa === "M");
        });
        return list;
    })();

    let ubActive = false;
    const ubSel = new Set();   // 空集合 = 全部鏈型

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
        if (!sites.length) return `<div class="ub-empty">此蛋白質沒有符合的泛素化位點記錄。</div>`;

        let html = "";

        UB_ORDER.forEach(link => {
            const group = sites.filter(st => st.primary === link);
            if (!group.length) return;

            const color = UB_COLOR[link];
            html += `<div class="type-head ub-head" style="border-bottom-color:${color}">
                <i class="sw" style="background:${color}"></i>${escapeHtml(ubGroupLabel(link))} <span>(${group.length})</span>
                <button type="button" class="type-pick" data-pick-ub="${link}" title="選取此類別全部位點（序列＋3D）">◎ 選取全部</button>
            </div>`;

            group.forEach(st => {
                const lines = st.rels.slice(0, 4).map(r => {
                    const pm = pmidLinks(r.reference_pmid);
                    return `${escapeHtml(relText(r))}${r.source_db ? " · " + escapeHtml(String(r.source_db)) : ""}${pm ? " · " + pm : ""}${r.__uniprot && r.ft ? evidenceHtml(r.ft, { full: false }) : ""}`;
                });
                if (st.rels.length > 4) lines.push(`…共 ${st.rels.length} 筆`);

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
                    <button type="button" class="opt-pick" data-pick-ub="${l}" title="選取「${escapeHtml(UB_NAME[l])}」全部位點（序列＋3D）">◎</button>
                </label>`;

        const ub = UB_KEYS.filter(l => counts[l]);
        const ubl = UBL_KEYS.filter(l => counts[l]);

        let html = "";
        if (ub.length) html += `<div class="ub-group">泛素（Ubiquitin）</div>` + ub.map(row).join("");
        if (ubl.length) html += `<div class="ub-group">類泛素（UBL）</div>` + ubl.map(row).join("");
        return html;
    }

    function buildUbPanel() {
        const panel = doc.getElementById("ub-panel");
        const btn = doc.getElementById("ub-toggle");
        if (!panel || !btn) return;

        if (!ubSites.length) {
            panel.innerHTML = `<div class="cat-empty">此蛋白質沒有已記錄的泛素化位點</div>`;
            btn.disabled = true;
            btn.textContent = "Ub/UBL 位點 (0)";
            return;
        }

        const counts = {};
        ubSites.forEach(st => st.linkages.forEach(l => { counts[l] = (counts[l] || 0) + 1; }));

        panel.innerHTML = `
            <div class="ub-panel-tools">
                <a data-ub-act="pickall" title="選取全部泛素化位點（序列＋3D）">◎ 選取全部位點</a>
                <a data-ub-act="none">清除篩選</a>
            </div>
            ${ubOptionRows(counts)}
            <div class="cat-note">未勾選＝顯示全部；實線框＝泛素、點線框＝類泛素；虛線 ⚠＝該位置不是 Lys，請核對；來源含 UniProt CROSSLNK</div>`;

        btn.textContent = `Ub/UBL 位點 (${ubSites.length})`;
    }

    function updateUbUI() {
        const wrap = doc.getElementById("ub-wrap");
        const btn = doc.getElementById("ub-toggle");
        if (!wrap || !btn || btn.disabled) return;

        wrap.classList.toggle("active", ubActive);
        const n = ubActive ? visibleUbSites().length : ubSites.length;
        btn.textContent = `Ub/UBL 位點 (${n})`;

        doc.querySelectorAll("#ub-panel input[data-link]").forEach(cb => {
            cb.checked = ubSel.has(cb.dataset.link);
        });
    }

    function selectUb(link) {
        const list = ubSites.filter(st => !link || st.linkages.includes(link));
        if (!list.length) return;

        if (!ubActive) { ubActive = true; refreshAll(); }

        const ranges = list.map(st => [st.pos, st.pos]);
        togglePickRanges(ranges, link ? `${UB_NAME[link]} 位點` : "泛素／類泛素位點全部");
    }

    // 開關
    doc.getElementById("ub-toggle").addEventListener("click", () => {
        ubActive = !ubActive;
        if (!ubActive) ubSel.clear();
        refreshAll();
    });

    // 下拉
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

    // 勾選鏈型：自動啟用
    doc.addEventListener("change", e => {
        const cb = e.target.closest ? e.target.closest(".ub-opt input[data-link]") : null;
        if (!cb) return;
        if (cb.checked) ubSel.add(cb.dataset.link); else ubSel.delete(cb.dataset.link);
        ubActive = true;
        refreshAll();
    });

    // ◎ 一鍵選取、面板工具
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
    // Lys 表面可及性（SASA, Shrake-Rupley）與 Ub/UBL 位點交叉比對
    //   - 以載入的 3D 結構計算（排除水與氫；其他鏈與配體視為遮蔽物）
    //   - 同時算「整個複合體」與「只有同一條鏈」兩種，差異大 = 位於介面
    //   - 相對可及性 = SASA / 該胺基酸理論最大值（Tien 2013）
    // ============================================================
    const MAX_ASA = { ALA:129, ARG:274, ASN:195, ASP:193, CYS:167, GLU:223, GLN:225, GLY:104, HIS:224, ILE:197,
        LEU:201, LYS:236, MET:224, PHE:240, PRO:159, SER:155, THR:172, TRP:285, TYR:263, VAL:174 };
    const SASA_EXPOSED = 0.25, SASA_PARTIAL = 0.10;
    const PLDDT_MIN = 70;   // AlphaFold：低於此值視為低信心
    const SASA_NAME = { exp: "暴露", part: "部分暴露", bur: "埋藏" };
    const SASA_COLOR = { exp: "#16a34a", part: "#d97706", bur: "#64748b" };

    let sasaActive = false;
    let sasaData = null;      // Map: UniProt 位置 → {pos, aa, rel, relChain, cls, interface, chains:[...]}
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
        // AlphaFold（與沿用其 B-factor 的 AlphaFill）的 B-factor 欄位就是每個殘基的 pLDDT
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

        // 球面上均勻分布的點
        const pts = [];
        const ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < NPTS; i++) {
            const y = 1 - (i / (NPTS - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            pts.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
        }

        // 空間格網
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

        // 依 UniProt 位置彙整（多條鏈取最大值＝只要有一條鏈暴露就算暴露）
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
                if (sasaData) console.log(`[UKW] SASA：${sasaData.size} 個殘基`, sasaData);
            } catch (e) {
                console.error("[UKW] SASA 計算失敗：", e);
                sasaData = null;
                sasaStatus = "error";
            }
            updateSasaUI();
            redrawSequence();
            redrawList();
            renderPosInfo();
        }, 30);
    }

    // 分組：全部 Lys / 暴露 / 埋藏 / 已知位點的暴露與埋藏 / 候選 / 介面
    function sasaGroups() {
        const g = { exp: [], bur: [], ubExp: [], ubBur: [], cand: [], iface: [] };
        if (!sasaData) return g;

        sasaData.forEach(d => {
            const ub = ubByPos.get(d.pos);
            if (d.aa === "K") {
                if (d.cls === "exp") g.exp.push(d);
                if (d.cls === "bur") g.bur.push(d);
                if (d.cls === "exp" && !ub && !d.lowConf) g.cand.push(d);   // 低信心（pLDDT）不列入候選
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
        exp: "全部暴露的 Lys",
        bur: "全部埋藏的 Lys",
        ubExp: "暴露的已知 Ub/UBL 位點",
        ubBur: "埋藏的已知位點（⚠ 值得核對）",
        cand: "暴露但無記錄的 Lys（候選）",
        iface: "因複合體而被遮蔽的 Lys（介面）"
    };

    function sasaBadge(pos) {
        if (!sasaData) return "";
        const d = sasaData.get(pos);
        if (!d) return "";
        return ` · <b style="color:${SASA_COLOR[d.cls]}">${SASA_NAME[d.cls]} ${pct(d.rel)}%${d.lowConf ? "（低信心）" : ""}</b>`;
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
            `單鏈 ${pct(d.relChain)}%`,
            d.plddt != null ? `pLDDT ${Math.round(d.plddt)}${d.lowConf ? "（低信心）" : ""}` : "",
            d.interface ? "複合體介面遮蔽" : "",
            ub ? "已知：" + escapeHtml(ub.linkages.map(l => UB_NAME[l]).join(" / ")) : ""
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
        if (sasaStatus === "computing" || !sasaStatus) return `<div class="ub-empty">Lys 可及性計算中…（需先載入 3D 結構）</div>`;
        if (sasaStatus === "error") return `<div class="ub-empty">Lys 可及性計算失敗，請看 Console。</div>`;
        if (!sasaData || !sasaData.size) return `<div class="ub-empty">此結構沒有可對應到 UniProt 位置的 Lys，無法計算可及性。</div>`;

        const g = sasaGroups();
        const lys = [...sasaData.values()].filter(d => d.aa === "K");
        const cnt = c => lys.filter(d => d.cls === c).length;
        const ubInStruct = ubSites.filter(st => sasaData.has(st.pos)).length;
        const lowLys = lys.filter(d => d.lowConf).length;

        let html = `<div class="sasa-sum">
            Lys 在此結構內：<b>${lys.length}</b> 個（
            <span style="color:${SASA_COLOR.exp}">暴露 ${cnt("exp")}</span>、
            <span style="color:${SASA_COLOR.part}">部分 ${cnt("part")}</span>、
            <span style="color:${SASA_COLOR.bur}">埋藏 ${cnt("bur")}</span>）<br>
            已知 Ub/UBL 位點（共 ${ubSites.length}）中，位於此結構內：<b>${ubInStruct}</b> 個；
            暴露 ${g.ubExp.length}、埋藏 ${g.ubBur.length}<br>
            ${lowLys ? `低信心（pLDDT &lt; ${PLDDT_MIN}）的 Lys：${lowLys} 個（可及性不可靠，不列入候選）<br>` : ""}
            <span style="color:#888">暴露 ≥ ${pct(SASA_EXPOSED)}%、部分 ${pct(SASA_PARTIAL)}–${pct(SASA_EXPOSED)}%、埋藏 &lt; ${pct(SASA_PARTIAL)}%（相對最大可及面積）</span>
        </div>`;

        const section = (key, title, color, list, cap) => {
            if (!list.length) return "";
            const shown = cap ? list.slice(0, cap) : list;
            return `<div class="type-head" style="border-bottom-color:${color}">
                    <i class="sw" style="background:${color}"></i>${escapeHtml(title)} <span>(${list.length})</span>
                    <button type="button" class="type-pick" data-pick-sasa="${key}" title="選取全部（序列＋3D）">◎ 選取全部</button>
                </div>` + shown.map(sasaItemHtml).join("")
                + (cap && list.length > cap ? `<div class="ub-empty">…另有 ${list.length - cap} 個，請用 ◎ 選取全部</div>` : "");
        };

        const knownAll = ubSites.map(st => sasaData.get(st.pos)).filter(Boolean).sort((a, b) => a.pos - b.pos);
        html += section("known", "已知 Ub/UBL 位點的可及性", "#374151", knownAll, 0);
        html += section("cand", SASA_GROUP_NAME.cand, SASA_COLOR.exp, g.cand, 30);
        return html;
    }

    function buildSasaPanel() {
        const panel = doc.getElementById("sasa-panel");
        if (!panel) return;

        if (sasaStatus === "computing" || !sasaStatus) {
            panel.innerHTML = `<div class="cat-empty">${structure ? "計算中…請等 3D 結構載入完成" : "沒有 3D 結構"}</div>`;
            return;
        }
        if (!sasaData || !sasaData.size) {
            panel.innerHTML = `<div class="cat-empty">此結構沒有可對應的 Lys</div>`;
            return;
        }

        const g = sasaGroups();
        const color = { exp: SASA_COLOR.exp, bur: SASA_COLOR.bur, ubExp: SASA_COLOR.exp, ubBur: "#dc2626", cand: SASA_COLOR.part, iface: "#7c3aed" };
        const row = k => `
            <div class="ub-opt" data-pick-sasa="${k}">
                <i class="sw" style="background:${color[k]}"></i>
                <span>${escapeHtml(SASA_GROUP_NAME[k])}</span><em>${g[k].length}</em>
                <button type="button" class="opt-pick" data-pick-sasa="${k}" title="選取（序列＋3D）">◎</button>
            </div>`;

        panel.innerHTML = `
            <div class="cat-note">序列上方色條：<b style="color:${SASA_COLOR.exp}">綠＝暴露</b>、<b style="color:${SASA_COLOR.part}">橘＝部分</b>、<b style="color:${SASA_COLOR.bur}">灰＝埋藏</b></div>
            ${["exp", "bur", "ubExp", "ubBur", "cand", "iface"].map(row).join("")}
            <div class="cat-note">「介面」＝單鏈時暴露、但在複合體中被其他鏈遮蔽。</div>`;
    }

    function updateSasaUI() {
        const wrap = doc.getElementById("sasa-wrap");
        const btn = doc.getElementById("sasa-toggle");
        if (!wrap || !btn) return;

        wrap.classList.toggle("active", sasaActive);
        btn.textContent = sasaStatus === "computing" ? "Lys 可及性 …"
            : (sasaStatus === "done" && sasaData ? `Lys 可及性 (${[...sasaData.values()].filter(d => d.aa === "K").length})` : "Lys 可及性");
        buildSasaPanel();
    }

    function selectSasa(key) {
        if (!sasaData) return;

        let list;
        if (key === "known") list = ubSites.map(st => sasaData.get(st.pos)).filter(Boolean);
        else list = sasaGroups()[key] || [];
        if (!list.length) return;

        if (!sasaActive) { sasaActive = true; refreshAll(); }
        togglePickRanges(list.map(d => [d.pos, d.pos]), key === "known" ? "已知 Ub/UBL 位點" : SASA_GROUP_NAME[key]);
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
    // 3D → 序列、位置資訊面板、鄰近配體
    // ============================================================
    // 結構殘基 → UniProt 位置
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
            if (ev.button !== undefined && !(ev.button & 1)) return;   // 只處理左鍵

            const l = SE.Loci.getFirstLocation(loci);
            if (!l) return;

            const comp = String(SP.atom.label_comp_id(l)).toUpperCase();
            if (WATER_NAMES.has(comp)) return;

            let nonPoly = false;
            try { nonPoly = SP.entity.type(l) === "non-polymer"; } catch (e) { /* ignore */ }

            if (nonPoly) {
                setInfo(`3D 點選：配體 ${comp}（chain ${SP.chain.auth_asym_id(l)}）`);
                return;
            }

            const pos = uniprotPosFor(SP.chain.auth_asym_id(l), SP.residue.auth_seq_id(l), SP.residue.label_seq_id(l));
            if (!pos) {
                setInfo(`3D 點選：${comp} ${SP.residue.auth_seq_id(l)}（不在 UniProt 序列對應內）`);
                return;
            }

            if (measureMode) { addMeasure(pos); return; }

            if (pick && pick.key === rangesKey([[pos, pos]])) clearPick();
            else setPickRanges([[pos, pos]], { scroll: true });
        } catch (e) {
            console.warn("[UKW] 3D 點選處理失敗：", e);
        }
    }

    function ligNames(ft) {
        return [...new Set((ft.ligands || []).map(x => x.ligand_name || x.ligand_label).filter(Boolean))];
    }

    // 單一殘基被選取時，列出覆蓋該位置的 UniProt feature、Ub/UBL 位點與可及性
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
                    ${lig.length ? `<div class="muted">配體：${escapeHtml(lig.join("、"))}</div>` : ""}
                    ${evidenceHtml(ft, { full: true })}
                </div>`;
            }).join("")
            : `<div class="pos-sub">沒有 UniProt feature 覆蓋此位置</div>`;

        box.innerHTML = `
            <div class="pos-head">
                <b>${escapeHtml(aa)}${pos}</b>${ubTag}${sasaBadge(pos)}
                <span class="pos-x" data-pos-close title="關閉">✕</span>
            </div>
            <div class="pos-sub">覆蓋此位置的 UniProt Feature（${feats.length}）</div>
            ${featHtml}`;
        box.style.display = "block";
    }

    doc.addEventListener("click", e => {
        if (e.target.closest && e.target.closest("[data-pos-close]")) clearPick();
    });

    // 搜尋選取殘基周圍 cutoff Å 內的配體 / 離子（非聚合物實體，不含水）
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

    // 切換「顯示鄰近配體」時，立即套用到目前選取
    doc.getElementById("show-lig").addEventListener("change", () => {
        if (pick) showRangesInMolstar(pick.ranges);
    });

    // ============================================================
    // 序列 motif 搜尋（正規表示式；可重疊比對）
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
                re = new RegExp("(?=(" + pat + "))", "gi");   // lookahead：連續重疊的位置也找得到
            } catch (e) {
                motifError = "規則無效：" + e.message;
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

        setMotifStatus(motifError || (pat ? `${motifHits.length} 個符合` : ""));
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
        if (!motifHits.length) return `<div class="ub-empty">Motif <code>${escapeHtml(motifPattern)}</code>：沒有符合的位置。</div>`;

        const CAP = 100;
        let html = `<div class="type-head" style="border-bottom-color:${color}">
            <i class="sw" style="background:${color}"></i>Motif <code>${escapeHtml(motifPattern)}</code> <span>(${motifHits.length})</span>
            <button type="button" class="type-pick" data-pick-motif title="選取全部符合的位置（序列＋3D）">◎ 選取全部</button>
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
                ${known.length ? `<div class="list-note">含已知 Ub/UBL 位點：${escapeHtml(known.join("、"))}</div>` : ""}
            </div>`;
        });

        if (motifHits.length > CAP) html += `<div class="ub-empty">…另有 ${motifHits.length - CAP} 個，請用 ◎ 選取全部</div>`;
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
    // 距離量測：測距模式下依序點兩個殘基（序列、清單單一殘基或 3D）
    // ============================================================
    let measureMode = false;
    let measureSel = [];
    let measureKind = "ca";      // 3D 上畫哪條線：ca / min
    let lastMeasure = null;

    // 取得某 UniProt 位置在結構中的重原子（含座標與原子名稱）
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
        if (!mol) return { error: "3D 結構尚未載入" };

        const A = residueAtoms(mol, a);
        const B = residueAtoms(mol, b);
        const nameA = `${seq[a - 1] || "?"}${a}`, nameB = `${seq[b - 1] || "?"}${b}`;

        if (!A.length) return { error: `${nameA} 不在 3D 結構範圍內` };
        if (!B.length) return { error: `${nameB} 不在 3D 結構範圍內` };

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

        // 優先比較同一條鏈內；若兩個殘基不在同一條鏈才比跨鏈
        gA.forEach((ga, uid) => { if (gB.has(uid)) tryPair(ga, gB.get(uid), false); });
        if (!best) gA.forEach(ga => gB.forEach(gb => tryPair(ga, gb, true)));
        if (!best) return { error: "找不到可量測的原子" };

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
        } catch (e) { console.warn("[UKW] 清除測距線失敗：", e); }
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
            console.warn("[UKW] 3D 距離線繪製失敗：", e);
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
                <b>${escapeHtml(m.nameA)} ↔ ${escapeHtml(m.nameB)}</b>${m.cross ? "（跨鏈）" : ""}<br>
                ${m.ca ? `Cα–Cα：<span class="m-val">${m.ca.d.toFixed(2)} Å</span><br>` : ""}
                最近原子：<span class="m-val">${m.min.d.toFixed(2)} Å</span>
                （${escapeHtml(m.nameA)} ${escapeHtml(m.min.a.name)} ↔ ${escapeHtml(m.nameB)} ${escapeHtml(m.min.b.name)}）
                ${m.instances > 1 ? `<br><span style="color:#888">結構含 ${m.instances} 條鏈，已取最近的一組</span>` : ""}
                <br>
                <label><input type="radio" name="mkind" value="ca" ${measureKind === "ca" ? "checked" : ""}> 3D 畫 Cα 線</label>
                <label><input type="radio" name="mkind" value="min" ${measureKind === "min" ? "checked" : ""}> 畫最近原子線</label>`;
        } else if (measureSel.length === 1) {
            body = `已選 <b>${escapeHtml((seq[measureSel[0] - 1] || "?") + measureSel[0])}</b>，請再點另一個殘基。`;
        } else {
            body = "測距模式：依序點兩個殘基（序列、清單中的單一殘基或 3D 皆可）。";
        }

        box.innerHTML = `${body}<div><a data-measure-clear>清除</a><a data-measure-exit>離開測距</a></div>`;
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
        setPickRanges([[a, a], [b, b]], { scroll: false, label: `測距 ${seq[a - 1] || "?"}${a} ↔ ${seq[b - 1] || "?"}${b}` });
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

    // ---------------- 證據說明（ECO）顯示 ----------------
    let showEvidenceFull = false;

    doc.getElementById("show-evd").addEventListener("change", e => {
        showEvidenceFull = e.target.checked;
        redrawList();
    });

    // 查到新的 ECO 名稱時重繪（視窗關閉後自動取消訂閱）
    const onEcoLoaded = () => {
        if (win.closed) { ecoListeners.delete(onEcoLoaded); return; }
        redrawList();
        renderPosInfo();
    };
    ecoListeners.add(onEcoLoaded);

    // ---------------- 分類按鈕 + 細項下拉 ----------------
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
                panel.innerHTML = `<div class="cat-empty">此蛋白質沒有此分類的 feature</div>`;
                return;
            }

            panel.innerHTML = `
                <div class="cat-panel-tools"><a data-act="all">全選</a><a data-act="none">清除</a><a data-act="pick" title="選取此分類全部位置（序列＋3D）">◎ 選取此分類</a></div>
                ${types.map(t => `
                    <label class="cat-opt">
                        <input type="checkbox" data-type="${escapeHtml(t)}">
                        <i class="sw" style="background:${typeColor[t] || "#ccc"}"></i>
                        <span>${escapeHtml(t)}</span><em>${counts[t]}</em>
                        <button type="button" class="opt-pick" data-pick-type="${escapeHtml(t)}" title="選取「${escapeHtml(t)}」全部位置（序列＋3D）">◎</button>
                    </label>`).join("")}
                <div class="cat-note">未勾選＝顯示全部細項</div>`;
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

    // 分類按鈕：開關分類；關閉時一併清掉該分類的細項選取
    doc.querySelectorAll(".feature-category-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const c = btn.dataset.category;
            const i = active.indexOf(c);
            if (i >= 0) { active.splice(i, 1); typeSel[c].clear(); } else active.push(c);
            refreshAll();
        });
    });

    // 下拉箭頭：展開 / 收合細項面板
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

    // 勾選細項：自動啟用所屬分類
    doc.addEventListener("change", e => {
        const cb = e.target.closest ? e.target.closest(".cat-opt input[data-type]") : null;
        if (!cb) return;

        const k = cb.closest(".cat-wrap").dataset.category;
        if (cb.checked) typeSel[k].add(cb.dataset.type); else typeSel[k].delete(cb.dataset.type);
        if (!active.includes(k)) active.push(k);
        refreshAll();
    });

    // 全選 / 清除
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

    // ---------------- 字體大小 ----------------
    doc.getElementById("seq-size").addEventListener("input", function () {
        seqBox.style.setProperty("--seq-size", this.value + "px");
        doc.getElementById("seq-size-val").textContent = this.value + "px";
    });

    // ---------------- 可拖曳分隔線 ----------------
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

    // ---------------- 初始畫面 ----------------
    injectTypeColors();
    buildPanels();
    buildUbPanel();
    refreshAll();

    // ---------------- 載入 Mol* ----------------
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (win.molstar && win.molstar.Viewer) { resolve(); return; }
            const sc = doc.createElement("script");
            sc.src = src;
            sc.onload = resolve;
            sc.onerror = () => reject(new Error("載入失敗：" + src));
            doc.head.appendChild(sc);
        });
    }

    let viewerPromise = null;

    function ensureViewer() {
        if (viewerPromise) return viewerPromise;

        viewerPromise = (async () => {
            await loadScript(MOLSTAR_JS_URL);

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

            // 3D → 序列：點 3D 上的殘基，序列捲動並標示
            try {
                viewer.plugin.behaviors.interaction.click.subscribe(ev => onMolClick(ev));
            } catch (e) { console.warn("[UKW] 無法訂閱 3D 點選事件：", e); }

            return viewer;
        })();

        viewerPromise.catch(() => { viewerPromise = null; });
        return viewerPromise;
    }

    // ---------------- 結構選單（PDB / 預測模型） ----------------
    const pdbSelect = doc.getElementById("pdb-select");
    let structureOptions = [];

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
            const u = ps.alphafold.pdb_url || ps.alphafold.cif_url;
            if (u) opts.push({
                label: "AlphaFold",
                st: { source: "alphafold", id: ps.alphafold.uniprot_id, url: u, format: ps.alphafold.pdb_url ? "pdb" : "mmcif" }
            });
        }
        if (ps.alphafill && ps.alphafill.cif_url) {
            opts.push({ label: "AlphaFill", st: { source: "alphafill", id: ps.alphafill.uniprot_id, url: ps.alphafill.cif_url, format: "mmcif" } });
        }
        if (ps.swiss_model && ps.swiss_model.coordinates_url) {
            opts.push({ label: "SWISS-MODEL", st: { source: "swiss_model", id: ps.swiss_model.uniprot_id, url: ps.swiss_model.coordinates_url, format: "pdb" } });
        }

        structureOptions = opts;
    }

    function syncSelect() {
        if (!structure) {
            pdbSelect.innerHTML = structureOptions.length ? "" : `<option>無結構</option>`;
        }

        // 目前結構不在清單中就補上（例如主頁面選到清單外的檔案）
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

    // 切換（或首次載入）結構：重置對應表與覆蓋範圍，重新載入後再套用目前選取
    async function switchStructure(st) {
        const token = ++loadToken;

        structure = st || null;
        siftsMap = null;
        siftsStatus = { ok: false, reason: "", keys: [], used: "" };
        coverage = null;
        sasaData = null;
        sasaStatus = "";

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
            msg.textContent = "此蛋白質沒有可用的 3D 結構";
            return;
        }

        msg.style.display = "flex";
        msg.textContent = "載入 3D 結構中…";

        try {
            await ensureViewer();
            if (token !== loadToken) return;

            try { viewer.plugin.managers.structure.focus.clear(); } catch (e) { /* ignore */ }
            await viewer.plugin.clear();
            if (token !== loadToken) return;

            const url = new URL(structure.url, location.origin).href;
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
            console.error("[UKW] Mol* 載入失敗：", err, "\nstructure:", structure);
            msg.style.display = "flex";
            msg.textContent = "3D 結構載入失敗：" + (err.message || err);
        }
    }

    // 視窗內手動切換
    pdbSelect.addEventListener("change", () => {
        const o = structureOptions[Number(pdbSelect.value)];
        if (o) switchStructure(o.st);
    });

    // 主頁面點選新的 PDB（currentPdbUrl 變動）→ 自動更新視窗內的結構
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
window.copySequence = copySequence;
window.openExpandedView = openExpandedView;
window.toggleMorePapers = toggleMorePapers;
window.renderAndUpdateSequence = renderAndUpdateSequence;

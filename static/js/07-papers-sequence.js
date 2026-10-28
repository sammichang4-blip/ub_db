// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 07. Renderers: functional description, papers list,
//     sequence track, copy-sequence, expanded paper popup
//
// File responsibilities (load in order; the order does not affect execution because calls happen only when used):
//   07-papers-sequence.js    This file: functional description, papers, sequence tracks, main-page feature details
//   07b-evidence.js          Evidence: ECO descriptions and links to PubMed, etc.
//   07c-sequence-popup.js    Expanded view: sequence + Mol* + feature list + Ub/SASA/motifs/distance measurement
//
// Dependencies (provided by other files):
//   escapeHtml, highlightSearch, showCopyMessage,
//   LYSINE_SITES, currentSearchKeyword
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
                Show more (${papers.length - VISIBLE_COUNT} more)
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
        ? `Show more (${hiddenPapers.length} more)`
        : "Show less";
}

// ------------------------------------------------------------
// Expanded ("popup window") paper view with a year-range filter
// ------------------------------------------------------------
function openExpandedView(targetWindow = null) {
    if (!targetWindow) {
        window.openProteinTabView("papers");
        return;
    }

    const data = window.currentData || window.currentProteinData;
    const p = window.currentProtein || (data && data.protein);

    if (!p || !data) {
        console.error("Protein data has not been loaded.");
        return;
    }

    const win = targetWindow || window.open("", "_blank", "width=900,height=800,scrollbars=yes,resizable=yes");
    if (!win) {
        alert("The browser blocked the pop-up. Allow pop-ups and try again.");
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
        if (count) count.textContent = `${papers.length} papers`;
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
            <title>${escapeHtml(p.protein_name)} (${escapeHtml(p.gene_name)}) - Details</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif; max-width:900px; margin:0 auto; padding:${targetWindow ? "0 1em 1em" : "2em"}; line-height:1.6; color:#222; background:#fff; }
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

            <h5>📄 Recent related papers (PubMed)</h5>

            <div class="paper-filter">
                <div class="paper-filter-header">
                    <span class="paper-filter-title">Publication date range</span>
                    <span>
                        Last <span id="paper-years-label">1 year</span>
                        <span id="paper-count">${initialPapers.length} papers</span>
                    </span>
                </div>

                <input type="range" id="paper-years" min="1" max="10" step="1" value="1">

                <div class="year-scale">
                    <span>1 year</span><span>2 years</span><span>3 years</span><span>4 years</span><span>5 years</span>
                    <span>6 years</span><span>7 years</span><span>8 years</span><span>9 years</span><span>10 years</span>
                </div>

                <div class="year-buttons">
                    <button class="year-btn active" data-year="all">All (use slider)</button>
                    By year:
                    ${[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]
                        .map(year => `<button class="year-btn" data-year="${year}">${year}</button>`)
                        .join("")}
                </div>
            </div>

            <div id="papers-container">${papersHtml}</div>

            <h5 style="color:#888;">🗂 Functional description (UniProt, older)</h5>
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
            if (yearLabel) yearLabel.textContent = `${years} ${years === 1 ? "year" : "years"}`;

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
function buildFeatureDetailsHtml(features = [], categories = []) {
    if (categories.length === 0) return "";

    const list = features.filter(f =>
        categories.includes(window.FEATURE_TYPE_TO_CATEGORY[f.feature_type])
    );

    if (!list.length) {
        return `<div class="feature-empty">No UniProt features are available for this protein in the selected categories.</div>`;
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
function cTerminalGgPositions(seq, features) {
    const positions = new Set();
    features.forEach(feature => {
        if (String(feature.feature_type || "").toUpperCase() !== "CHAIN") return;

        const start = Number(feature.start_pos);
        const end = Number(feature.end_pos || feature.start_pos);
        if (!Number.isInteger(start) || !Number.isInteger(end)
            || start < 1 || end - start < 1 || end > seq.length) return;
        if (seq[end - 2] === "G" && seq[end - 1] === "G") {
            positions.add(end - 1);
            positions.add(end);
        }
    });
    return positions;
}

function renderSequence(seq, features = [], categories = window.activeFeatureCategories || []) {
    if (!seq) return "";

    const lineLength = 60;
    const groupSize = 10;
    const activeCategories = categories;
    const ggPositions = cTerminalGgPositions(seq, features);

    // Filter once so we do not scan all features for every residue.
    const usableFeatures = features.filter(feature => {
        const start = Number(feature.start_pos);
        if (!Number.isFinite(start) || start < 1) return false;
        if (activeCategories.length === 0) return false;   // Do not color anything if no categories are selected.
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
                const titleParts = [`Position ${pos}: ${aa}`];

                // Known polyubiquitin-linked lysine.
                if (typeof LYSINE_SITES !== "undefined" && LYSINE_SITES.includes(pos) && aa === "K") {
                    cls += " lys-site";
                    titleParts.push("Known polyubiquitin-linked lysine");
                }

                if (ggPositions.has(pos)) {
                    cls += " gg-site";
                    titleParts.push("C-terminal Gly-Gly (site of covalent attachment to the substrate)");
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
        console.error("[UKW] Could not find #protein-sequence.");
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
        console.error("[UKW] Could not find the original sequence.");
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
        console.error("[UKW] Unknown feature category:", category);
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
        console.error("[UKW] Could not find #protein-sequence; category state was updated, but the sequence could not be redrawn.");
    }
}

window.toggleFeatureCategory = toggleFeatureCategory;

// Use event delegation if the button has no inline onclick; avoid toggling twice if it does.
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

        // Handle only main-page buttons (the pop-up has its own event handler).
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
        console.error("Could not find #protein-sequence.");
        return;
    }

    const sequence = seqBox.dataset.sequence || "";

    if (!sequence) {
        console.error("Sequence is empty.");
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

window.copySequence = copySequence;
window.openExpandedView = openExpandedView;
window.toggleMorePapers = toggleMorePapers;
window.renderAndUpdateSequence = renderAndUpdateSequence;

// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 07. Renderers: functional description, papers list,
//     sequence track, copy-sequence, expanded paper popup
// ============================================================

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

    if (!container) {
        return;
    }

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
    const data = currentData;
    const p = currentProtein;

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

        if (!value) {
            return null;
        }

        if (/^\d{4}$/.test(String(value))) {
            return new Date(Number(value), 0, 1);
        }

        const d = new Date(value);

        if (!isNaN(d.getTime())) {
            return d;
        }

        return null;
    }

    function filterPapersByYears(papers, years) {
        if (!Array.isArray(papers)) {
            return [];
        }

        const now = new Date();
        const startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - years);

        return papers.filter(paper => {
            const paperDate = getPaperDate(paper);

            if (!paperDate) {
                return false;
            }

            return paperDate >= startDate && paperDate <= now;
        });
    }

    function filterPapersByYear(papers, year) {
        return Array.isArray(papers)
            ? papers.filter(paper => Number(paper.pub_year) === Number(year))
            : [];
    }

    function updatePapers(years) {
        const papers = filterPapersByYears(data.papers, years);
        const papersHtml = renderPapers(papers, { expandAll: true });

        const container = win.document.getElementById("papers-container");
        const count = win.document.getElementById("paper-count");

        if (container) {
            container.innerHTML = papersHtml;
        }

        if (count) {
            count.textContent = `${papers.length} 篇`;
        }
    }

    function updatePapersByYear(year) {
        const papers = filterPapersByYear(data.papers, year);
        const papersHtml = renderPapers(papers, { expandAll: true });

        const container = win.document.getElementById("papers-container");
        const count = win.document.getElementById("paper-count");

        if (container) {
            container.innerHTML = papersHtml;
        }

        if (count) {
            count.textContent = `${papers.length} 篇`;
        }
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

            if (yearLabel) {
                yearLabel.textContent = `${years} 年`;
            }

            win.document.querySelectorAll(".year-btn").forEach(btn => btn.classList.remove("active"));

            const allBtn = win.document.querySelector('.year-btn[data-year="all"]');

            if (allBtn) {
                allBtn.classList.add("active");
            }

            updatePapers(years);
        });
    }

    const yearButtons = win.document.querySelectorAll(".year-btn");

    yearButtons.forEach(btn => {
        btn.addEventListener("click", function () {
            yearButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const year = btn.dataset.year;

            if (year === "all") {
                if (slider) {
                    updatePapers(Number(slider.value));
                }
            }
            else {
                updatePapersByYear(year);
            }
        });
    });
}

// ------------------------------------------------------------
// Sequence track (60-residue lines, 10-residue ruler groups)
// ------------------------------------------------------------

function renderSequence(seq) {
    if (!seq) {
        return "";
    }

    const lineLength = 60;
    const groupSize = 10;

    let html = "";

    for (let lineStart = 0; lineStart < seq.length; lineStart += lineLength) {
        // Ruler
        let ruler = "";

        for (let j = groupSize; j <= lineLength; j += groupSize) {
            const pos = lineStart + j;

            if (pos <= seq.length) {
                ruler += `<span class="ruler-num">${String(pos).padStart(groupSize, " ")}</span>`;
            }
        }

        html += `<div class="seq-ruler">${ruler}</div>`;

        // Residues
        let lineHtml = "";
        const lineEnd = Math.min(lineStart + lineLength, seq.length);

        for (let i = lineStart; i < lineEnd; i++) {
            const pos = i + 1;
            const aa = seq[i];

            let cls = "res";

            // Known ubiquitin chain-linkage lysine
            if (LYSINE_SITES.includes(pos) && aa === "K") {
                cls += " lys-site";
            }

            // C-terminal Gly-Gly
            if (pos >= seq.length - 1 && aa === "G") {
                cls += " gg-site";
            }

            lineHtml += `<span class="${cls}" title="位置 ${pos}: ${aa}">${aa}</span>`;

            if (pos % groupSize === 0) {
                lineHtml += " ";
            }
        }

        html += `<div class="seq-line">${lineHtml}</div>`;
    }

    return html;
}

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
    }
    catch (error) {
        console.error("Copy sequence failed:", error);

        // Fallback for browsers/contexts without Clipboard API access
        const textarea = document.createElement("textarea");
        textarea.value = sequence;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand("copy");
            showCopyMessage("Sequence copied ✓");
        }
        catch (e) {
            console.error("Fallback copy failed:", e);
        }

        document.body.removeChild(textarea);
    }
}

window.copySequence = copySequence;
window.openExpandedView = openExpandedView;
window.toggleMorePapers = toggleMorePapers;

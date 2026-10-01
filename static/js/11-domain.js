/* ============================================================
 * UKW - 11-domain.js
 *
 * Domain Architecture + Domain Explorer
 *
 * Dependencies:
 *   escapeHtml()
 *   highlightStructureRange()
 *
 * Data:
 *   window.currentDomains
 *   window.currentProteinLength
 *
 * 配色邏輯(v2):
 *   - 顏色代表「domain 家族」:以 InterPro ID 為準,沒有的退回用名稱
 *   - 同一條 track 內重複的同家族 domain:同色 + 依序變亮 + 標序號
 *   - segment 之間有白色分隔線
 *   - 同一資料庫內位置重疊的 domain 自動分成多層 (lanes)
 *   - Hover:高亮「同家族」或「位置重疊」的 domain,其餘變淡
 * ============================================================ */
window.currentDomains = window.currentDomains || [];
window.currentProteinLength =
    Number(window.currentProteinLength || 0);

// ============================================================
// Domain colors
// ============================================================

// 色盲友善色盤 (Okabe-Ito + 3 色)。超過就用灰色,避免花花綠綠。
const DOMAIN_FAMILY_PALETTE = [
    "#E69F00",
    "#56B4E9",
    "#009E73",
    "#D55E00",
    "#0072B2",
    "#CC79A7",
    "#8E6BBF",
    "#7FB069",
    "#E07A5F",
    "#c9b800"
];

const DOMAIN_OVERFLOW_COLOR = "#9ca3af";

// 保留舊的 per-source 色盤,目前只用在 fallback
const DOMAIN_SOURCE_COLORS = {
    Unknown: [
        "#6b7280",
        "#9ca3af",
        "#d1d5db"
    ]
};

// 目前蛋白質 family key -> color
window.currentDomainColorMap = window.currentDomainColorMap || {};


// ============================================================
// Source order
// ============================================================

const DOMAIN_SOURCE_ORDER = [
    "InterPro",
    "Pfam",
    "Gene3D",
    "CDD",
    "SMART",
    "PANTHER",
    "SUPFAM",
    "TIGRFAM",
    "HAMAP",
    "PROSITE",
    "PRINTS",
    "Other"
];


// ============================================================
// 一次性注入 hover / 分隔線樣式
// ============================================================

(function injectDomainStyle() {

    if (document.getElementById("ukw-domain-style")) return;

    const style = document.createElement("style");
    style.id = "ukw-domain-style";

    style.textContent = `
        .domain-track { position: relative; }

        .domain-seg {
            position: absolute;
            box-sizing: border-box;
            border: 1px solid #fff;          /* 白色分隔線 */
            border-radius: 3px;
            transition: opacity .12s ease, filter .12s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-size: 10px;
            font-weight: 700;
            color: #fff;
            text-shadow: 0 0 2px rgba(0,0,0,.55);
            user-select: none;
        }

        .domain-seg.dim { opacity: .22; }
        .domain-seg.hl  { filter: brightness(1.05) saturate(1.1); z-index: 2;
                          box-shadow: 0 0 0 1.5px rgba(0,0,0,.45); }

        .domain-swatch {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            margin-right: 6px;
            vertical-align: middle;
        }
    `;

    document.head.appendChild(style);

})();


// ============================================================
// Domain family key (統一 domain 身分)
// ============================================================

function getInterProId(d) {

    // 1) 若有獨立欄位就直接用
    const direct =
        d.interpro_id ||
        d.interpro_acc ||
        d.interpro_accession ||
        d.ipr_id ||
        d.ipr ||
        (d.source_db === "InterPro" ? d.accession : "") ||
        "";

    if (direct) return String(direct).trim();

    // 2) 從 description 文字解析,例如 "InterPro accession: IPR015157"
    const desc = String(d.description || "");

    const labeled = desc.match(/InterPro\s*accession\s*:\s*(IPR\d{6})/i);
    if (labeled) return labeled[1].toUpperCase();

    // 3) 退而求其次:description 內第一個 IPR 編號
    const any = desc.match(/\bIPR\d{6}\b/i);
    if (any) return any[0].toUpperCase();

    return "";
}

function getDomainFamilyKey(d) {

    const ipr = getInterProId(d);

    if (ipr) return "IPR:" + ipr;

    const name = String(
        d.domain_name || d.name || d.accession || "unknown"
    ).trim().toLowerCase();

    return "NAME:" + name;
}


// ============================================================
// 建立「這個蛋白質」的 family -> color 對照
// 依 domain 在序列上第一次出現的順序分配色盤
// ============================================================

function buildDomainColorMap(domains) {

    const map = {};

    if (!Array.isArray(domains)) {
        window.currentDomainColorMap = map;
        return map;
    }

    const sorted = domains.slice().sort(
        (a, b) => Number(a.start_pos) - Number(b.start_pos)
    );

    let next = 0;

    sorted.forEach(d => {

        const key = getDomainFamilyKey(d);

        if (map[key]) return;

        map[key] =
            next < DOMAIN_FAMILY_PALETTE.length
                ? DOMAIN_FAMILY_PALETTE[next]
                : DOMAIN_OVERFLOW_COLOR;

        next++;

    });

    window.currentDomainColorMap = map;

    return map;
}

function getFamilyColor(domain) {

    const map = window.currentDomainColorMap || {};

    return map[getDomainFamilyKey(domain)] || DOMAIN_OVERFLOW_COLOR;
}


// ============================================================
// Group domains by source
// ============================================================

function groupDomainsBySource(domains) {

    const grouped = {};

    if (!Array.isArray(domains)) {
        return grouped;
    }

    domains.forEach(d => {

        const source = d.source_db || "Unknown";

        if (!grouped[source]) {
            grouped[source] = [];
        }

        grouped[source].push(d);

    });

    Object.values(grouped).forEach(arr => {

        arr.sort((a, b) => {

            return Number(a.start_pos) - Number(b.start_pos);

        });

    });

    return grouped;
}


// ============================================================
// 重疊的 domain 分層 (lane assignment)
// ============================================================

function assignLanes(domains) {

    const laneEnds = [];
    const lanes = [];

    domains.forEach(d => {

        const start = Number(d.start_pos);
        const end = Number(d.end_pos);

        let lane = laneEnds.findIndex(e => e < start);

        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(end);
        } else {
            laneEnds[lane] = end;
        }

        lanes.push(lane);

    });

    return {
        lanes,
        laneCount: Math.max(laneEnds.length, 1)
    };
}


// ============================================================
// Domain segment
// ============================================================

function createDomainSegment(
    domain,
    proteinLength,
    opts
) {

    opts = opts || {};

    const start = Number(domain.start_pos);
    const end = Number(domain.end_pos);

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 1 ||
        end < start ||
        proteinLength <= 0
    ) {
        return "";
    }

    const left =
        ((start - 1) / proteinLength) * 100;

    const width =
        ((end - start + 1) / proteinLength) * 100;

    const source =
        domain.source_db || "Unknown";

    const domainName =
        domain.domain_name ||
        domain.name ||
        "Unnamed domain";

    const accession =
        domain.accession || "";

    const ipr = getInterProId(domain);

    const familyKey = getDomainFamilyKey(domain);

    const color = getFamilyColor(domain);

    // 同家族第 n 個重複:疊一層半透明白色讓它變亮
    const repeatIdx = opts.repeatIdx || 0;
    const repeatTotal = opts.repeatTotal || 1;
    const lane = opts.lane || 0;
    const laneCount = opts.laneCount || 1;

    const lighten = (repeatIdx % 3) * 0.2;

    const bgImage =
        lighten > 0
            ? `linear-gradient(rgba(255,255,255,${lighten}),rgba(255,255,255,${lighten}))`
            : "none";

    const laneTop = (lane / laneCount) * 100;
    const laneHeight = 100 / laneCount;

    // 重複 domain 且 segment 夠寬才顯示序號
    const label =
        repeatTotal > 1 && width >= 3 && laneCount === 1
            ? String(repeatIdx + 1)
            : "";

    const tip =
        `${domainName}` +
        `\n${source}${accession ? " · " + accession : ""}` +
        (ipr && ipr !== accession ? `\nInterPro: ${ipr}` : "") +
        `\n${start}-${end}` +
        (repeatTotal > 1
            ? `\n(repeat ${repeatIdx + 1}/${repeatTotal})`
            : "");

    return `
        <div
            class="domain-seg"
            data-family="${escapeHtml(familyKey)}"
            data-start="${start}"
            data-end="${end}"
            style="
                left:${left}%;
                width:${Math.max(width, 0.4)}%;
                top:${laneTop}%;
                height:${laneHeight}%;
                background-color:${color};
                background-image:${bgImage};
                cursor:pointer;
            "
            title="${escapeHtml(tip)}"
            onclick="selectDomain(
                ${start},
                ${end},
                '${encodeURIComponent(domainName)}',
                '${encodeURIComponent(source)}',
                '${encodeURIComponent(accession)}'
            )"
        >${label}</div>
    `;
}


// ============================================================
// Render one source track
// ============================================================

function renderDomainSourceTrack(
    source,
    domains,
    proteinLength
) {

    // 同家族在這條 track 的總數 / 目前序號
    const totals = {};

    domains.forEach(d => {
        const k = getDomainFamilyKey(d);
        totals[k] = (totals[k] || 0) + 1;
    });

    const seen = {};

    const { lanes, laneCount } = assignLanes(domains);

    const segments = domains.map(
        (domain, index) => {

            const k = getDomainFamilyKey(domain);

            const repeatIdx = seen[k] || 0;
            seen[k] = repeatIdx + 1;

            return createDomainSegment(
                domain,
                proteinLength,
                {
                    repeatIdx,
                    repeatTotal: totals[k],
                    lane: lanes[index],
                    laneCount
                }
            );

        }
    ).join("");

    // 有多層時把 track 拉高,讓每層都看得到
    const trackStyle =
        laneCount > 1
            ? `style="height:${laneCount * 14}px;"`
            : "";

    return `
        <div class="domain-source-row">

            <div class="domain-source-label">

                ${escapeHtml(source)}

                <span class="domain-count">
                    ${domains.length}
                </span>

            </div>

            <div class="domain-track" ${trackStyle}>

                ${segments}

            </div>

        </div>
    `;
}


// ============================================================
// Render domain list
// ============================================================

function renderDomainList(
    grouped,
    sources
) {

    let html = "";

    sources.forEach(source => {

        const domains = grouped[source];

        domains.forEach(domain => {

            const start =
                Number(domain.start_pos);

            const end =
                Number(domain.end_pos);

            const domainName =
                domain.domain_name ||
                domain.name ||
                "Domain";

            const accession =
                domain.accession || "";

            const color = getFamilyColor(domain);

            html += `
                <div
                    class="domain-list-item"
                    style="cursor:pointer;"
                    onclick="selectDomain(
                        ${start},
                        ${end},
                        '${encodeURIComponent(domainName)}',
                        '${encodeURIComponent(source)}',
                        '${encodeURIComponent(accession)}'
                    )"
                    title="點擊在 3D 結構中高亮此 domain"
                >

                    <span>

                        <strong>
                            <span
                                class="domain-swatch"
                                style="background:${color};"
                            ></span>${escapeHtml(domainName)}
                        </strong>

                        <br>

                        <span class="acc">

                            ${escapeHtml(source)}

                            ${accession
                                ? ` · ${escapeHtml(accession)}`
                                : ""
                            }

                        </span>

                    </span>

                    <span>

                        aa ${start} – ${end}

                    </span>

                </div>
            `;

        });

    });

    return html;
}


// ============================================================
// 共用:排序 source
// ============================================================

function sortDomainSources(grouped) {

    return Object.keys(grouped).sort((a, b) => {

        const ia = DOMAIN_SOURCE_ORDER.indexOf(a);
        const ib = DOMAIN_SOURCE_ORDER.indexOf(b);

        if (ia === -1 && ib === -1) {
            return a.localeCompare(b);
        }

        if (ia === -1) return 1;
        if (ib === -1) return -1;

        return ia - ib;
    });
}


// ============================================================
// Main renderDomains()
// ============================================================

function renderDomains(
    domains,
    proteinLength
) {

    if (
        !Array.isArray(domains) ||
        domains.length === 0
    ) {

        return `
            <p style="color:var(--ink-dim)">
                目前資料庫中無 domain 資料。
            </p>
        `;
    }

    if (
        !proteinLength ||
        proteinLength <= 0
    ) {

        return `
            <p>
                Protein length unavailable.
            </p>
        `;
    }


    // --------------------------------------------------------
    // Store globally
    // --------------------------------------------------------

    window.currentDomains = domains;
    window.currentProteinLength = Number(proteinLength);


    // --------------------------------------------------------
    // 先建立 family -> color 對照(所有資料庫共用)
    // --------------------------------------------------------

    buildDomainColorMap(domains);


    // --------------------------------------------------------
    // Group + sort source
    // --------------------------------------------------------

    const grouped = groupDomainsBySource(domains);

    const sources = sortDomainSources(grouped);


    // --------------------------------------------------------
    // Tracks
    // --------------------------------------------------------

    const tracks =
        sources.map(source => {

            return renderDomainSourceTrack(
                source,
                grouped[source],
                proteinLength
            );

        }).join("");

    // --------------------------------------------------------
    // List
    // --------------------------------------------------------

    const list =
        renderDomainList(
            grouped,
            sources
        );

    // --------------------------------------------------------
    // Return
    // --------------------------------------------------------

    return `

        <div class="domain-architecture">

            <div class="domain-architecture-title">

                <span>
                    Domain Architecture
                </span>

                <button
                    class="icon-btn domain-expand-btn"
                    onclick="openDomainExplorer()"
                    title="Expand Domain Explorer"
                    type="button"
                >
                    🔍
                </button>

            </div>


            <div class="domain-axis">

                <span>1</span>

                <span>
                    ${Math.round(
                        proteinLength * 0.25
                    )}
                </span>

                <span>
                    ${Math.round(
                        proteinLength * 0.5
                    )}
                </span>

                <span>
                    ${Math.round(
                        proteinLength * 0.75
                    )}
                </span>

                <span>
                    ${proteinLength}
                </span>

            </div>


            ${tracks}

        </div>


        <div class="domain-list">

            ${list}

        </div>
    `;
}

// ============================================================
// Domain Explorer 專用 Architecture
// 不包含 Expand button
// ============================================================

function renderDomainExplorerArchitecture(domains, proteinLength) {

    if (!Array.isArray(domains) || domains.length === 0) {
        return `
            <p style="color:var(--ink-dim)">
                目前資料庫中無 domain 資料。
            </p>
        `;
    }

    if (!proteinLength || proteinLength <= 0) {
        return `
            <p style="color:var(--ink-dim)">
                Protein length unavailable.
            </p>
        `;
    }

    // 確保顏色對照存在且與目前 domains 一致
    buildDomainColorMap(domains);

    const grouped = groupDomainsBySource(domains);

    const sources = sortDomainSources(grouped);

    const tracks = sources.map(source => {

        return renderDomainSourceTrack(
            source,
            grouped[source],
            proteinLength
        );

    }).join("");

    const list = renderDomainList(
        grouped,
        sources
    );

    return `
        <div class="domain-explorer-architecture">

            <div class="domain-explorer-axis">

                <span>1</span>

                <span>
                    ${Math.round(proteinLength * 0.25)}
                </span>

                <span>
                    ${Math.round(proteinLength * 0.5)}
                </span>

                <span>
                    ${Math.round(proteinLength * 0.75)}
                </span>

                <span>
                    ${proteinLength}
                </span>

            </div>

            <div class="domain-explorer-tracks">
                ${tracks}
            </div>

            <div class="domain-explorer-list">

                <h4>Domain Details</h4>

                ${list}

            </div>

        </div>
    `;
}


// ============================================================
// Hover 高亮:同家族 或 位置重疊 的 domain(跨資料庫)
// 用 event delegation,不用每個 segment 綁事件
// ============================================================

function getDomainHoverScope(seg) {

    return (
        seg.closest(".domain-explorer-architecture") ||
        seg.closest(".domain-architecture") ||
        document
    );
}

document.addEventListener("mouseover", event => {

    const seg = event.target.closest?.(".domain-seg");

    if (!seg) return;

    const scope = getDomainHoverScope(seg);

    const family = seg.dataset.family;
    const s = Number(seg.dataset.start);
    const e = Number(seg.dataset.end);
    const len = e - s + 1;

    scope.querySelectorAll(".domain-seg").forEach(other => {

        const os = Number(other.dataset.start);
        const oe = Number(other.dataset.end);

        const overlap =
            Math.min(e, oe) - Math.max(s, os) + 1;

        const sameFamily = other.dataset.family === family;

        // 重疊超過 hover 對象 50% 才算「對應」,避免只擦到邊就亮
        const overlapping =
            overlap > 0 && overlap / len >= 0.5;

        const hit = other === seg || sameFamily || overlapping;

        other.classList.toggle("hl", hit);
        other.classList.toggle("dim", !hit);

    });

});

document.addEventListener("mouseout", event => {

    const seg = event.target.closest?.(".domain-seg");

    if (!seg) return;

    // 滑到另一個 segment 時交給 mouseover 處理
    const to = event.relatedTarget?.closest?.(".domain-seg");

    if (to) return;

    getDomainHoverScope(seg)
        .querySelectorAll(".domain-seg")
        .forEach(o => o.classList.remove("hl", "dim"));

});


// ============================================================
// Domain Explorer
// ============================================================
function openDomainExplorer() {

    console.log("===== OPEN DOMAIN EXPLORER =====");

    const modal =
        document.getElementById("domainExplorerModal");

    if (!modal) {
        console.error("domainExplorerModal not found");
        return;
    }

    // ---------------------------------------------------------
    // Protein length
    // ---------------------------------------------------------

    let proteinLength =
    Number(window.currentProteinLength || 0);

    if (currentProtein) {

        if (typeof currentProtein === "string") {

            proteinLength = currentProtein.length;

        } else {

            proteinLength = Number(
                currentProtein.length ||
                currentProtein.sequence_length ||
                currentProtein.protein_length ||
                0
            );

            if (!proteinLength && currentProtein.sequence) {
                proteinLength =
                    currentProtein.sequence.length;
            }
        }
    }

    if (!proteinLength && currentData) {

        proteinLength = Number(
            currentData.length ||
            currentData.sequence_length ||
            currentData.protein_length ||
            0
        );

        if (
            !proteinLength &&
            currentData.sequence
        ) {
            proteinLength =
                currentData.sequence.length;
        }
    }

    if (!proteinLength) {

        console.error(
            "Protein length unavailable"
        );

        alert(
            "無法取得目前蛋白質的 sequence length。"
        );

        return;
    }

    // ---------------------------------------------------------
    // Domain data
    // ---------------------------------------------------------

    const domains =
        Array.isArray(currentDomains)
            ? currentDomains
            : [];

    if (domains.length === 0) {

        console.warn("No domain data");

        alert("目前蛋白質沒有 Domain 資料。");

        return;
    }

    // ---------------------------------------------------------
    // Protein name
    // ---------------------------------------------------------

    const proteinName =
        currentData?.protein_name ||
        currentData?.gene_name ||
        currentData?.entry_name ||
        currentData?.uniprot_acc ||
        currentProteinId ||
        "Protein";

    // ---------------------------------------------------------
    // Modal title
    // ---------------------------------------------------------

    const title =
        document.getElementById(
            "domainExplorerTitle"
        );

    if (title) {

        title.innerHTML = `
            <strong>Domain Explorer</strong>
            <span class="domain-explorer-protein">
                ${escapeHtml(proteinName)}
            </span>
        `;
    }

    // ---------------------------------------------------------
    // 左側 Domain
    // ---------------------------------------------------------

    const domainContainer =
        document.getElementById(
            "domainExplorerTrack"
        );

    if (domainContainer) {

        domainContainer.innerHTML =
            renderDomainExplorerArchitecture(
                domains,
                proteinLength
            );

    } else {

        console.error(
            "domainExplorerDomains not found"
        );

    }

    // ---------------------------------------------------------
    // Open modal
    // ---------------------------------------------------------

    modal.classList.add("show");

    // ---------------------------------------------------------
    // Load PDB viewer
    // ---------------------------------------------------------

    loadDomainExplorerPDB();

}

async function loadDomainExplorerPDB() {

    console.log("===== loadDomainExplorerPDB =====");

    const viewerContainer = document.getElementById("domainExplorerPDB");

    if (!viewerContainer) {
        console.error("#domainExplorerPDB not found");
        return;
    }

    // --------------------------------------------------------
    // 找目前 structure（PDB 或 fallback 出來的預測結構都算）
    // --------------------------------------------------------
    let pdbUrl = currentPdbUrl || null;

    if (!pdbUrl && currentData) {
        // 先找實驗結構
        const structures = currentData.structures || [];
        const structure = Array.isArray(structures)
            ? structures.find(s => s.pdb_url)
            : null;

        if (structure) {
            pdbUrl = structure.pdb_url;
        } else if (currentData.active_structure?.url) {
            // 沒有 PDB 就吃後端已經決定好的 fallback (AlphaFold/AlphaFill/SWISS-MODEL)
            pdbUrl = currentData.active_structure.url;
        }
    }

    if (!pdbUrl) {
        viewerContainer.innerHTML = `
            <div class="domain-pdb-empty">
                <div style="font-size:42px;">🧬</div>
                <p>目前沒有可用的 PDB structure</p>
            </div>
        `;
        return;
    }

    console.log("Domain Explorer PDB:", pdbUrl);

    // --------------------------------------------------------
    // 找主 Mol* container
    // --------------------------------------------------------
    const mainViewer = document.getElementById("pdb-viewer");

    if (!mainViewer) {
        console.error("#pdb-viewer not found");
        return;
    }

    // --------------------------------------------------------
    // 確保 Mol* 已初始化
    // --------------------------------------------------------
    if (!pdbViewer) {
        const ready = await initViewer();
        if (!ready) {
            console.error("Mol* initialization failed");
            return;
        }
    }

    // --------------------------------------------------------
    // 把 viewer 搬到 Explorer —— 搬之前先記住原位置！
    // --------------------------------------------------------
    if (mainViewer.parentElement !== viewerContainer) {

        viewerOriginalParent = mainViewer.parentElement;

        viewerPlaceholder = document.createElement("div");
        viewerPlaceholder.style.display = "none";

        // 在原本的位置插入一個佔位元素，之後才知道要搬回哪個位置的哪個地方
        viewerOriginalParent.insertBefore(viewerPlaceholder, mainViewer);

        viewerContainer.appendChild(mainViewer);
    }

    mainViewer.style.width = "100%";
    mainViewer.style.height = "100%";

    // --------------------------------------------------------
    // 載入 structure
    // --------------------------------------------------------
    await showPDBStructure(pdbUrl);

    // Mol* 的 canvas 是依掛載當下容器尺寸建立的，
    // 搬動/改尺寸後必須強制它重新計算，否則畫面容易是空的
    requestAnimationFrame(() => {
        if (pdbViewer?.plugin?.layout?.events?.updated) {
            pdbViewer.plugin.layout.events.updated.next(void 0);
        }
        window.dispatchEvent(new Event("resize"));
    });

    console.log("Domain Explorer PDB loaded");
}

function closeDomainExplorer() {

    const modal = document.getElementById("domainExplorerModal");

    if (modal) {
        modal.classList.remove("show");
    }

    const mainViewer = document.getElementById("pdb-viewer");

    if (mainViewer && viewerOriginalParent && viewerPlaceholder) {

        viewerOriginalParent.replaceChild(mainViewer, viewerPlaceholder);

        mainViewer.style.width = "";
        mainViewer.style.height = "";

        viewerOriginalParent = null;
        viewerPlaceholder = null;

        // 搬回主畫面後也要重新 resize 一次
        requestAnimationFrame(() => {
            if (pdbViewer?.plugin?.layout?.events?.updated) {
                pdbViewer.plugin.layout.events.updated.next(void 0);
            }
            window.dispatchEvent(new Event("resize"));
        });
    }
}
// ============================================================
// Select Domain
// ============================================================

function selectDomain(
    start,
    end,
    encodedName,
    encodedSource,
    encodedAccession
) {

    const domainName =
        decodeURIComponent(
            encodedName || ""
        );

    const source =
        decodeURIComponent(
            encodedSource || ""
        );

    const accession =
        decodeURIComponent(
            encodedAccession || ""
        );


    // --------------------------------------------------------
    // 3D structure highlight
    // --------------------------------------------------------

    if (
        typeof window.highlightStructureRange ===
        "function"
    ) {

        window.highlightStructureRange(
            start,
            end
        );

    } else {

        console.warn(
            "highlightStructureRange() not available."
        );

    }


    // --------------------------------------------------------
    // Explorer info
    // --------------------------------------------------------

    const info =
        document.getElementById(
            "domainExplorerInfo"
        );

    if (info) {

        info.innerHTML = `

            <div class="selected-domain">

                <div class="selected-domain-name">

                    ${escapeHtml(domainName)}

                </div>


                <div class="selected-domain-source">

                    ${escapeHtml(source)}

                    ${accession
                        ? ` · ${escapeHtml(accession)}`
                        : ""
                    }

                </div>


                <div class="selected-domain-pos">

                    Residues ${start} – ${end}

                </div>

            </div>

        `;
    }
}

// ============================================================
// ESC key closes explorer
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closeDomainExplorer();

        }

    }
);

// ============================================================
// Global exports
// ============================================================

window.renderDomains = renderDomains;

window.openDomainExplorer = openDomainExplorer;
window.closeDomainExplorer = closeDomainExplorer;

window.selectDomain = selectDomain;

window.groupDomainsBySource = groupDomainsBySource;
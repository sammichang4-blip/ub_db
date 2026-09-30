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
 * ============================================================ */
window.currentDomains = window.currentDomains || [];
window.currentProteinLength =
    Number(window.currentProteinLength || 0);

// ============================================================
// Domain colors
// ============================================================

const DOMAIN_SOURCE_COLORS = {

    InterPro: [
        "#2563eb",
        "#3b82f6",
        "#60a5fa",
        "#93c5fd",
        "#1d4ed8"
    ],

    Pfam: [
        "#f29e17",
        "#f603a9",
        "#ccebb2",
        "#abe8f4",
        "#f5ed0e"
    ],

    SMART: [
        "#9333ea",
        "#55d4f7",
        "#ee7690",
        "#d2e93d",
        "#7e22ce"
    ],

    PROSITE: [
        "#ea580c",
        "#f97316",
        "#fb923c",
        "#fdba74",
        "#c2410c"
    ],

    PANTHER: [
        "#0891b2",
        "#06b6d4",
        "#22d3ee",
        "#67e8f9",
        "#0e7490"
    ],

    SUPERFAMILY: [
        "#db2777",
        "#ec4899",
        "#f472b6",
        "#f9a8d4",
        "#be185d"
    ],

    Gene3D: [
        "#e3f664",
        "#dfcd09",
        "#c36e28",
        "#ece671",
        "#1536f3"
    ],

    PRINTS: [
        "#db2777",
        "#ecf501",
        "#1df405",
        "#580af4",
        "#fa9a09"
    ],

    TIGRFAMs: [
        "#ca8a04",
        "#eab308",
        "#facc15",
        "#fde047",
        "#a16207"
    ],

    CDD: [
        "#475569",
        "#64748b",
        "#94a3b8",
        "#cbd5e1",
        "#334155"
    ],

    Unknown: [
        "#6b7280",
        "#9ca3af",
        "#d1d5db"
    ]
};


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
// Get source color
// ============================================================

function getDomainColor(source, index) {

    const colors =
        DOMAIN_SOURCE_COLORS[source] ||
        DOMAIN_SOURCE_COLORS.Unknown;

    return colors[index % colors.length];
}


// ============================================================
// Domain segment
// ============================================================

function createDomainSegment(
    domain,
    proteinLength,
    index
) {

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

    const color =
        getDomainColor(source, index);

    return `
        <div
            class="domain-seg"
            style="
                left:${left}%;
                width:${Math.max(width, 0.4)}%;
                background:${color};
                cursor:pointer;
            "
            title="${escapeHtml(domainName)}
${escapeHtml(source)}
${start}-${end}"
            onclick="selectDomain(
                ${start},
                ${end},
                '${encodeURIComponent(domainName)}',
                '${encodeURIComponent(source)}',
                '${encodeURIComponent(accession)}'
            )"
        ></div>
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

    const segments = domains.map(
        (domain, index) => {

            return createDomainSegment(
                domain,
                proteinLength,
                index
            );

        }
    ).join("");

    return `
        <div class="domain-source-row">

            <div class="domain-source-label">

                ${escapeHtml(source)}

                <span class="domain-count">
                    ${domains.length}
                </span>

            </div>

            <div class="domain-track">

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
                            ${escapeHtml(domainName)}
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
    // Group
    // --------------------------------------------------------

    const grouped = groupDomainsBySource(domains);


    // --------------------------------------------------------
    // Sort source
    // --------------------------------------------------------

    const sources =
        Object.keys(grouped).sort(
            (a, b) => {

                const ia =
                    DOMAIN_SOURCE_ORDER.indexOf(a);

                const ib =
                    DOMAIN_SOURCE_ORDER.indexOf(b);

                if (
                    ia === -1 &&
                    ib === -1
                ) {
                    return a.localeCompare(b);
                }

                if (ia === -1) {
                    return 1;
                }

                if (ib === -1) {
                    return -1;
                }

                return ia - ib;

            }
        );


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

    const grouped = groupDomainsBySource(domains);

    const sources = Object.keys(grouped).sort((a, b) => {

        const ia = DOMAIN_SOURCE_ORDER.indexOf(a);
        const ib = DOMAIN_SOURCE_ORDER.indexOf(b);

        if (ia === -1 && ib === -1) {
            return a.localeCompare(b);
        }

        if (ia === -1) return 1;
        if (ib === -1) return -1;

        return ia - ib;
    });

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
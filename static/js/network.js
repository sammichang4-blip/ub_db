let cy = null;

// =====================================================
// Network editor state
// =====================================================

let editMode = false;

// 保存目前 network 的完整原始 elements
let originalElements = [];
// =====================================================
// Complex badge overlay
// =====================================================

let complexBadges = {};   // nodeId -> badge div

function getComplexBadgeLayer() {

    const cyContainer = document.getElementById("bigcy");
    if (getComputedStyle(cyContainer).position === "static") {
        cyContainer.style.position = "relative";
    }

    let layer = document.getElementById("complex-badge-layer");
    if (!layer) {
        layer = document.createElement("div");
        layer.id = "complex-badge-layer";
        layer.style.position = "absolute";
        layer.style.top = "0";
        layer.style.left = "0";
        layer.style.width = "100%";
        layer.style.height = "100%";
        layer.style.pointerEvents = "none";
        layer.style.zIndex = "10";

        cyContainer.appendChild(layer);
    }
    return layer;
}

function refreshComplexBadges() {

    if (!cy) {
        return;
    }

    const layer = getComplexBadgeLayer();
    const currentIds = new Set();

    cy.nodes().forEach(node => {

        const count = node.data("complex_count") || 0;

        if (count <= 0) {
            return;
        }

        const id = node.id();
        currentIds.add(id);

        let badge = complexBadges[id];

        if (!badge) {

            badge = document.createElement("div");

            badge.style.position = "absolute";
            badge.style.minWidth = "12px";
            badge.style.height = "15px";
            badge.style.padding = "0 4px";
            badge.style.borderRadius = "9px";
            badge.style.background = "#f45a5a";
            badge.style.color = "#080808";
            badge.style.fontSize = "11px";
            badge.style.fontWeight = "bold";
            badge.style.display = "flex";
            badge.style.alignItems = "center";
            badge.style.justifyContent = "center";
            badge.style.border = "1px solid #ecec86";
            badge.style.cursor = "pointer";
            badge.style.pointerEvents = "auto";
            badge.style.transform = "translate(-50%, -50%)";
            badge.title = "所屬 complex";

            badge.onclick = (evt) => {
                evt.stopPropagation();
                queryComplexOnClick(id);
            };

            layer.appendChild(badge);

            complexBadges[id] = badge;
        }

        badge.textContent = count;

        const pos = node.renderedPosition();
        const w = node.renderedWidth();
        const h = node.renderedHeight();

        // 定位在 node 右上角
        badge.style.left = `${pos.x + w / 18}px`;
        badge.style.top = `${pos.y - h / 2}px`;
    });

    // 移除對應 node 已經不存在的 badge
    Object.keys(complexBadges).forEach(id => {

        if (!currentIds.has(id)) {

            complexBadges[id].remove();

            delete complexBadges[id];
        }
    });
}


function clearComplexBadges() {

    Object.values(complexBadges).forEach(badge => badge.remove());

    complexBadges = {};
}

function queryComplexOnClick(proteinId) {

    fetch(`/api/complexes/${encodeURIComponent(proteinId)}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            console.log("complexes:", data);
            showComplexPanel(proteinId, data);
        })

        .catch(error => {
            console.error("Failed to query complexes:", error);
        });
}

function createComplexPanel() {
    let panel = document.getElementById("complex-panel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "complex-panel";
        panel.style.position = "fixed";
        panel.style.zIndex = "99999";
        panel.style.top = "80px";
        panel.style.left = "20px";     // 跟 interaction-panel（右側）分開放左側
        panel.style.width = "340px";
        panel.style.maxHeight = "70vh";
        panel.style.overflowY = "auto";
        panel.style.padding = "16px 18px";
        panel.style.background = "#151f28";
        panel.style.color = "#e6e2d6";
        panel.style.border = "1px solid #c9a24b";
        panel.style.borderRadius = "8px";
        panel.style.boxShadow = "0 8px 25px rgba(0,0,0,.45)";
        panel.style.fontSize = "13px";
        panel.style.lineHeight = "1.5";
        panel.style.display = "none";
        document.body.appendChild(panel);
    }
    return panel;
}

// =====================================================
// Format GO Function
// =====================================================

function formatGoFunctions(value) {

    if (!value) {
        return "-";
    }

    return String(value)
        .split(";")
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => `
            <div style="
                margin-bottom:4px;
                padding-left:10px;
                position:relative;
            ">
                <span style="
                    position:absolute;
                    left:0;
                    color:#c9a24b;
                ">•</span>
                ${x}
            </div>
        `)
        .join("");
}


// =====================================================
// Convert PMID to PubMed links
// =====================================================

function linkifyPMID(text) {

    if (!text) {
        return "-";
    }

    return String(text).replace(
        /\bPMID[:\s]*([0-9]+)\b/gi,
        function(match, pmid) {

            return `
                <a
                    href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="
                        color:#c9a24b;
                        text-decoration:none;
                        font-weight:bold;
                    "
                >
                    PMID:${pmid}
                </a>
            `;
        }
    );
}


// =====================================================
// Format PMID field
// 例如：29729098;29729098;29729098
// =====================================================

function formatPMIDs(value) {

    if (!value) {
        return "-";
    }

    const pmids = String(value)
        .split(/[;,]/)
        .map(x => x.trim())
        .filter(Boolean);

    if (pmids.length === 0) {
        return "-";
    }

    // 去除重複 PMID
    const uniquePMIDs = [
        ...new Set(pmids)
    ];

    return uniquePMIDs
        .map(pmid => {

            // 如果資料本身只有數字
            if (/^\d+$/.test(pmid)) {

                return `
                    <a
                        href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style="
                            color:#c9a24b;
                            text-decoration:none;
                            font-weight:bold;
                        "
                    >
                        PMID:${pmid}
                    </a>
                `;
            }

            // 如果資料已經包含 PMID:
            return linkifyPMID(pmid);

        })
        .join("<br>");
}

// =====================================================
// badge 點擊後的面板（跟 edge 那組平行的另一組，避免互相蓋掉）
// =====================================================
function showComplexPanel(proteinId, data) {
    const panel = createComplexPanel();
    const closeBtnHtml = `
        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:8px;
        ">
            <div style="font-size:16px;font-weight:bold;color:#c9a24b;">
                ${proteinId} — Complexes
            </div>
            <span
                id="complex-panel-close"
                style="cursor:pointer;color:#93a3ac;font-size:16px;padding:0 4px;"
            >✕</span>
        </div>
    `;
    if (!data || data.length === 0) {
        panel.innerHTML = closeBtnHtml + `
            <div style="color:#93a3ac;">No complex found</div>
        `;
    } else {
        // =====================================================
        // Complex Records
        // =====================================================

        const records = data.map(row => `

            <div style="
                border-top:1px solid #32444f;
                padding-top:10px;
                margin-top:10px;
            ">

                <!-- Complex Name -->
                <div style="
                    font-weight:bold;
                    color:#c9a24b;
                    font-size:15px;
                ">
                    ${row.complex_name || "-"}
                </div>


                <!-- Organism / Cell line -->
                <div style="
                    color:#93a3ac;
                    margin-top:3px;
                ">
                    ${row.organism || "-"}
                    ${row.cell_line
                        ? ` · ${row.cell_line}`
                        : ""
                    }
                </div>


                <!-- Role -->
                <div style="margin-top:8px;">
                    <b>Role : </b>
                    ${row.complex_role || "-"}
                </div>


                <!-- Stoichiometry -->
                <div style="margin-top:6px;">
                    <b>Stoichiometry : </b>
                    ${row.stoichiometry || "-"}
                </div>


                <!-- GO Function -->
                <div style="
                    margin-top:8px;
                ">
                    <b>GO Function :</b>

                    <div style="
                        margin-top:5px;
                        color:#e6e2d6;
                    ">
                        ${formatGoFunctions(
                            row.functions_go_name
                        )}
                    </div>
                </div>


                <!-- Comment -->
                <div style="
                    margin-top:8px;
                ">
                    <b>Comment :</b>

                    <div style="
                        margin-top:4px;
                        line-height:1.6;
                    ">
                        ${linkifyPMID(
                            row.comment_complex
                        )}
                    </div>
                </div>


                <!-- Disease -->
                <div style="
                    margin-top:8px;
                ">
                    <b>Disease :</b>

                    <div style="
                        margin-top:4px;
                        line-height:1.6;
                    ">
                        ${linkifyPMID(
                            row.comment_disease
                        )}
                    </div>
                </div>


                <!-- Drug -->
                <div style="
                    margin-top:8px;
                ">
                    <b>Drug :</b>

                    <div style="
                        margin-top:4px;
                        line-height:1.6;
                    ">
                        ${linkifyPMID(
                            row.comment_drug
                        )}
                    </div>
                </div>


                <!-- Function PMID -->
                <div style="
                    margin-top:8px;
                ">
                    <div style="
                        margin-top:4px;
                        line-height:1.7;
                    ">
                        ${formatPMIDs(
                            row.functions_pmid
                        )}
                    </div>
                </div>


                <!-- Source -->
                <div style="
                    margin-top:8px;
                ">
                    <b>Source :</b>
                    ${row.source_db || "-"}
                </div>

            </div>

        `).join("");

        panel.innerHTML =
            closeBtnHtml + records;

        panel.style.display = "block";

        const closeBtn =
            document.getElementById(
                "complex-panel-close"
            );

        if (closeBtn) {
            closeBtn.onclick =
                hideComplexPanel;
        }}}


function hideComplexPanel() {
    const panel = document.getElementById("complex-panel");

    if (panel) {
        panel.style.display = "none";
    }
}
// =====================================================
// Interaction panel (click-triggered, 可釘住)
// =====================================================

function createInteractionPanel() {
    let panel = document.getElementById("interaction-panel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "interaction-panel";
        panel.style.position = "fixed";
        panel.style.zIndex = "99999";
        panel.style.top = "80px";
        panel.style.right = "20px";
        panel.style.width = "340px";
        panel.style.maxHeight = "70vh";
        panel.style.overflowY = "auto";
        panel.style.padding = "16px 18px";
        panel.style.background = "#151f28";
        panel.style.color = "#e6e2d6";
        panel.style.border = "1px solid #c9a24b";
        panel.style.borderRadius = "8px";
        panel.style.boxShadow = "0 8px 25px rgba(0,0,0,.45)";
        panel.style.fontSize = "13px";
        panel.style.lineHeight = "1.5";
        panel.style.display = "none";
        document.body.appendChild(panel);
    }
    return panel;
}


function showInteractionPanel(data) {
    const panel = createInteractionPanel();
    const closeBtnHtml = `
        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:8px;
        ">
            <div style="font-size:16px;font-weight:bold;color:#c9a24b;">
                Interaction Detail
            </div>
            <span
                id="interaction-panel-close"
                style="cursor:pointer;color:#93a3ac;font-size:16px;padding:0 4px;"
            >✕</span>
        </div>
    `;

    if (!data || data.length === 0) {
        panel.innerHTML = closeBtnHtml + `
            <div style="color:#93a3ac;">No interaction evidence</div>
        `;
    } else {
        const records = data.map(row => {
            const pmids = (row.reference_pmid || "")
                .split(/[;,]/)
                .map(p => p.trim())
                .filter(Boolean);
            return `
                <div style="
                    border-top:1px solid #32444f;
                    padding-top:10px;
                    margin-top:10px;">
                    <div style="font-weight:bold;color:#c9a24b;">
                        ${row.protein_a} → ${row.protein_b}
                    </div>

                    <div style="color:#93a3ac;margin-top:2px;">
                        ${row.interaction_type || "-"}
                        ${row.direction ? `（${row.direction}）` : ""}
                    </div>

                    <div style="margin-top:6px;">
                        <b>Evidence : </b>${row.evidence || "-"}
                    </div>

                    <div style="margin-top:6px;">
                        <b>Modification : </b>${row.modification || "-"}
                    </div>

                    <div style="margin-top:6px;">
                        <b>Source DB : </b>${row.source_db || "-"}
                    </div>

                    <div style="margin-top:6px;">
                        <b>References : </b>
                        ${
                    pmids.length
                    ? pmids.map(p => `
                        
                        <a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(p)}/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="color:#c9a24b;">${p}</a>
                    `).join("<br>")
                    : "-"
                }
                    </div>
                </div>
            `;
        }).join("");
        panel.innerHTML = closeBtnHtml + records;
    }
    panel.style.display = "block";
    const closeBtn = document.getElementById("interaction-panel-close");
    if (closeBtn) {
        closeBtn.onclick = hideInteractionPanel;
    }
}


function hideInteractionPanel() {

    const panel = document.getElementById("interaction-panel");

    if (panel) {
        panel.style.display = "none";
    }
}

function queryUbiquitinInteractionOnClick(source, target, interactionType) {

    const allowedTypes = [
        "E1-E2",
        "E2-E3",
        "E3-substrate",
        "DUB-substrate"
    ];

    if (!allowedTypes.includes(interactionType)) {
        return;
    }

    const url =
        `/api/ubiquitin-interaction` +
        `?protein_a=${encodeURIComponent(source)}` +
        `&protein_b=${encodeURIComponent(target)}` +
        `&interaction_type=${encodeURIComponent(interactionType)}`;

    fetch(url)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            console.log("ubiquitin_interaction (click):", data);
            showInteractionPanel(data);
        })
        .catch(error => {
            console.error("Failed to query ubiquitin_interaction (click):", error);
        });
}

// =====================================================
// Interaction tooltip
// =====================================================

function createInteractionTooltip() {

    let tooltip =
        document.getElementById("interaction-tooltip");

    if (!tooltip) {

        tooltip = document.createElement("div");

        tooltip.id = "interaction-tooltip";

        tooltip.style.position = "fixed";
        tooltip.style.zIndex = "99999";

        tooltip.style.minWidth = "280px";
        tooltip.style.maxWidth = "400px";

        tooltip.style.padding = "14px 16px";

        tooltip.style.background = "#151f28";
        tooltip.style.color = "#e6e2d6";

        tooltip.style.border =
            "1px solid #c9a24b";

        tooltip.style.borderRadius = "6px";

        tooltip.style.boxShadow =
            "0 8px 25px rgba(0,0,0,.35)";

        tooltip.style.fontSize = "13px";
        tooltip.style.lineHeight = "1.5";

        tooltip.style.pointerEvents = "none";

        tooltip.style.display = "none";

        document.body.appendChild(tooltip);
    }

    return tooltip;
}
// =====================================================
// Show interaction tooltip
// =====================================================

function showInteractionTooltip(event, data) {
    const tooltip =
        createInteractionTooltip();
    if (!data || data.length === 0) {
        tooltip.innerHTML = `
            <div style="
                font-size:16px;
                font-weight:bold;
                color:#c9a24b;
            ">
                No interaction evidence
            </div>
        `;
    } else {
        const first = data[0];
        // 收集所有 PMID
        const pmids = [
            ...new Set(
                data
                    .flatMap(row =>
                        (row.reference_pmid || "")
                            .split(/[;,]/)
                    )
                    .map(p => p.trim())
                    .filter(Boolean)
            )
        ];

        tooltip.innerHTML = `

            <div style="
                font-size:16px;
                font-weight:bold;
                color:#c9a24b;
            ">
                ${first.protein_a}
                →
                ${first.protein_b}
            </div>

            <div style="
                color:#93a3ac;
                margin-top:3px;
            ">
                ${first.interaction_type || "-"}
            </div>

            <hr style="
                border:0;
                border-top:1px solid #32444f;
                margin:10px 0;
            ">

            <div>
                <b>Evidence</b><br>
                ${first.evidence || "-"}
            </div>

            <div>
                <b>Experimental system</b><br>
                ${first.experimental_system || "-"}
            </div>

            <div>
                <b>System type</b><br>
                ${first.experimental_system_type || "-"}
            </div>

            <div>
                <b>Confidence</b><br>
                ${first.confidence || "-"}
            </div>

            <div>
                <b>Score</b><br>
                ${first.score ?? "-"}
            </div>

            <div>
                <b>Modification</b><br>
                ${first.modification || "-"}
            </div>

            <div>
                <b>Source</b><br>
                ${first.source_db || "-"}
            </div>

            <div>
                <b>References</b><br>
                ${
                    pmids.length
                    ? pmids
                        .map(p => `PMID: ${p}`)
                        .join("<br>")
                    : "-"
                }
            </div>
        `;
    }

    tooltip.style.left =
        `${event.clientX + 15}px`;

    tooltip.style.top =
        `${event.clientY + 15}px`;

    tooltip.style.display = "block";
}
// =====================================================
// Hide interaction tooltip
// =====================================================
function hideInteractionTooltip() {
    const tooltip =
        document.getElementById(
            "interaction-tooltip"
        );

    if (tooltip) {
        tooltip.style.display = "none";
    }
}

// =====================================================
// Query ubiquitin_interaction
// =====================================================
function queryUbiquitinInteraction(
    source,
    target,
    interactionType,
    event
) {

    const allowedTypes = [
        "E1-E2",
        "E2-E3",
        "E3-substrate",
        "DUB-substrate"
    ];

    if (
        !allowedTypes.includes(
            interactionType
        )
    ) {
        return;
    }

    const url =
        `/api/ubiquitin-interaction` +
        `?protein_a=${encodeURIComponent(source)}` +
        `&protein_b=${encodeURIComponent(target)}` +
        `&interaction_type=${encodeURIComponent(interactionType)}`;

    fetch(url)

        .then(res => {

            if (!res.ok) {

                throw new Error(
                    `HTTP ${res.status}`
                );

            }

            return res.json();

        })

        .then(data => {

            console.log(
                "ubiquitin_interaction:",
                data
            );

            showInteractionTooltip(
                event,
                data
            );

        })

        .catch(error => {

            console.error(
                "Failed to query ubiquitin_interaction:",
                error
            );

        });
}
// =====================================================
// Update editor toolbar
// =====================================================
function updateEditorToolbar() {
    const button =
        document.getElementById(
            "editModeBtn"
        );

    if (!button) {
        return;
    }

    if (editMode) {
        button.textContent =
            "✓ Edit Mode";
        button.classList.add(
            "active"
        );
    } else {
        button.textContent =
            "✎ Edit Mode";

        button.classList.remove(
            "active"
        );
    }
}

// =====================================================
// Load initial network
// =====================================================
function loadNetwork(gene) {

    console.log("loadNetwork:", gene);
    console.log(
        document.getElementById("bigcy")
    );

    fetch(
        `/api/network/${encodeURIComponent(gene)}?level=1`
    )

    .then(res => {

        if (!res.ok) {

            throw new Error(
                `HTTP ${res.status}`
            );

        }

        return res.json();

    })

    .then(data => {

        const elements = [];
        // ==========================================
        // Nodes
        // ==========================================

        data.nodes.forEach(n => {

            elements.push({
                data: n
            });

        });
        // ==========================================
        // Edges
        // ==========================================
        data.edges.forEach(e => {
            /*
             * 預期 API edge 可以有：
             *
             * {
             *   id: "...",
             *   source: "...",
             *   target: "...",
             *   interaction_type: "E3_SUBSTRATE",
             *   ubiquitin_linkages: ["K48", "K63"]
             * }
             *
             * 如果沒有 ubiquitin_linkages，
             * 仍然可以正常顯示 network。
             */
            elements.push({
                data: e
            });

        });
        // ==========================================
        // 保存原始 network
        // ==========================================
        originalElements =
            structuredClone(elements);
        // ==========================================
        // 如果已有 Cytoscape，先 destroy
        // ==========================================
        if (cy) {
            clearComplexBadges();
            cy.destroy();
            cy = null;
        }
        // ==========================================
        // 建立 Cytoscape
        // ==========================================
        cy = cytoscape({
            container:
                document.getElementById("bigcy"),

            elements: elements,
            // ======================================
            // Layout
            // ======================================
            layout: {

                name: "cose",

                directed: true,

                spacingFactor: 1.5,

                animate: true,

                animationDuration: 500
            },
            // ======================================
            // Style
            // ======================================
            style: [
                // ----------------------------------
                // Default Node
                // ----------------------------------
                {
                    selector: "node",
                    style: {

                        "label":
                            "data(label)",

                        "text-valign":
                            "center",

                        "text-halign":
                            "center",

                        "width": 80,

                        "height": 80,

                        "font-size": 14,

                        "font-weight": "bold",

                        "text-wrap": "wrap",

                        "text-max-width": 70,

                        "color": "#ffffff",

                        "border-width": 2,

                        "border-color": "#ffffff",

                        "border-opacity": 0.35,


                        // --------------------------
                        // 增加可點擊區域
                        // --------------------------

                        "overlay-opacity": 0,

                        "overlay-padding": 12
                    }
                },
                // ==================================
                // E1
                // ==================================
                {
                    selector:
                        "node[type='E1']",

                    style: {

                        "shape":
                            "hexagon",

                        "background-color":
                            "#228B22",

                        "width": 80,

                        "height": 80
                    }
                },
                // ==================================
                // E2
                // ==================================
                {
                    selector:
                        "node[type='E2']",

                    style: {

                        "shape":
                            "diamond",

                        "background-color":
                            "#00BCD4",

                        "width": 80,

                        "height": 80
                    }
                },
                // ==================================
                // E3
                // ==================================

                {
                    selector:
                        "node[type='E3']",

                    style: {

                        "shape":
                            "ellipse",

                        "background-color":
                            "#7E57C2",

                        "width": 80,

                        "height": 80
                    }
                },
                // ==================================
                // DUB
                // ==================================

                {
                    selector:
                        "node[type='DUB']",

                    style: {

                        "shape":
                            "octagon",

                        "background-color":
                            "#F28C28",

                        "width": 80,

                        "height": 80
                    }
                },
                // ==================================
                // Substrate
                // ==================================
                {
                    selector:
                        "node[type='substrate']",

                    style: {

                        "shape":
                            "rectangle",

                        "background-color":
                            "#C9A227",

                        "width": 90,

                        "height": 65,

                        "color": "#ffffff"
                    }
                },
                // ==================================
                // Edge - Default
                // ==================================
                {
                    selector: "edge",

                    style: {

                        "width": 2,
                        "line-style": "solid",

                        "line-color": "#888888",

                        "opacity": 1,

                        // --------------------------
                        // 有方向箭頭
                        // --------------------------

                        "target-arrow-shape":
                            "triangle",

                        "target-arrow-color":
                            "#888888",

                        "curve-style":
                            "bezier",

                        // --------------------------
                        // Edge label
                        // --------------------------

                        "label":
                            "data(edge_label)",

                        "font-size": 11,

                        "font-weight": "bold",

                        "color": "#444444",

                        "text-background-color":
                            "#ffffff",

                        "text-background-opacity": 0.85,

                        "text-background-padding": 3,

                        "text-rotation":
                            "autorotate",

                        "text-margin-y": -8
                    }
                },
                // ==================================
                // E1 → E2
                // ==================================
                {
                    selector:
                        "edge[interaction_type='E1-E2']",

                    style: {

                        "width": 3,

                        "line-style": "solid",

                        "line-color":
                            "#888888",

                        "target-arrow-color":
                            "#888888",

                        "target-arrow-shape":
                            "triangle",

                        "label":
                            "data(edge_label)"
                    }
                },
                // ==================================
                // E2 → E3
                // ==================================
                {
                    selector:
                        "edge[interaction_type='E2-E3']",

                    style: {

                        "width": 3,
                        "line-style": "solid",

                        "line-color":
                            "#888888",

                        "target-arrow-color":
                            "#888888",

                        "target-arrow-shape":
                            "triangle",

                        "label":
                            "data(edge_label)"
                    }
                },
                // ==================================
                // E3 → Substrate
                // ==================================
                {
                    selector:
                        "edge[interaction_type='E3-substrate']",

                    style: {

                        // E3-substrate 是主要關係
                        "width": 5,
                        "line-style": "solid",

                        "line-color":
                            "#888888",

                        "target-arrow-color":
                            "#888888",

                        "target-arrow-shape":
                            "triangle",

                        "label":
                            "data(edge_label)",

                        "font-size": 12,

                        "font-weight":
                            "bold",

                        "color":
                            "#5E35B1",

                        "text-background-color":
                            "#ffffff",

                        "text-background-opacity":
                            0.95,

                        "text-background-padding":
                            4
                    }
                },
                // ==================================
                // DUB → Substrate
                // ==================================
                {
                    selector:
                        "edge[interaction_type='DUB-SUBSTRATE']",

                    style: {

                        "width": 3,

                        "line-style":
                            "dashed",

                        "line-color":
                            "#F28C28",

                        "target-arrow-color":
                            "#F28C28",

                        "target-arrow-shape":
                            "triangle",

                        "label":
                            "data(edge_label)",

                        "font-size": 11,

                        "font-weight":
                            "bold",

                        "color":
                            "#E65100",

                        "text-background-color":
                            "#ffffff",

                        "text-background-opacity":
                            0.9,

                        "text-background-padding":
                            3
                    }
                },
                // ==================================
                // Selected
                // ==================================
                {
                    selector:
                        ".keep-selected",

                    style: {

                        "border-width": 6,

                        "border-color":
                            "#FFD54F",

                        "border-opacity": 1,

                        "overlay-color":
                            "#FFD54F",

                        "overlay-opacity": 0.15,

                        "overlay-padding": 12
                    }
                },
                // ==================================
                // Selected node
                // ==================================

                {
                    selector:
                        "node:selected",

                    style: {

                        "border-width": 5,

                        "border-color":
                            "#FFD54F"
                    }
                }
            ]
        });
        // ==========================================
        // Console
        // ==========================================
        console.log(
            "initial nodes:",
            cy.nodes().length
        );

        console.log(
            "initial edges:",
            cy.edges().length
        );
        // ==========================================
        // Complex badges
        // ==========================================
        cy.on(
            "pan zoom drag position add remove",
            refreshComplexBadges
        );

        cy.on(
            "layoutstop",
            refreshComplexBadges
        );

        console.log(
            "Refreshing complex badges...",
            refreshComplexBadges
        );

        refreshComplexBadges();
        // ==========================================
        // Node click
        // ==========================================
        cy.on(
            "tap",
            "node",
            function(evt) {

                const node =
                    evt.target;

                const id =
                    node.data("id");

                const type =
                    node.data("type");

                console.log(
                    "NODE TAP:",
                    {
                        id: id,
                        type: type,
                        editMode: editMode
                    }
                );


                // ==================================
                // Edit Mode
                // ==================================

                if (editMode) {

                    toggleKeepSelection(node);

                    return;
                }


                // ==================================
                // Normal Mode
                // ==================================

                expandNode(id);
            }
        );


        // ==========================================
        // Edge click
        // ==========================================

        cy.on(
            "tap",
            "edge",
            function(evt) {

                // Edit Mode 只允許操作 node
                if (editMode) {

                    return;
                }


                const edge =
                    evt.target;

                const source =
                    edge.data("source");

                const target =
                    edge.data("target");

                const interactionType =
                    edge.data(
                        "interaction_type"
                    );

                const linkages =
                    edge.data(
                        "ubiquitin_linkages"
                    );


                console.log(
                    "Edge tap:",
                    {
                        source,
                        target,
                        interactionType,
                        linkages
                    }
                );


                queryUbiquitinInteractionOnClick(
                    source,
                    target,
                    interactionType
                );
            }
        );


        // ==========================================
        // Edge mouseover
        // ==========================================

        cy.on(
            "mouseover",
            "edge",
            function(evt) {

                const edge =
                    evt.target;

                const source =
                    edge.data("source");

                const target =
                    edge.data("target");

                const interactionType =
                    edge.data(
                        "interaction_type"
                    );


                console.log(
                    "Edge hover:",
                    {
                        source,
                        target,
                        interactionType
                    }
                );


                queryUbiquitinInteraction(
                    source,
                    target,
                    interactionType,
                    evt.originalEvent
                );

            }
        );


        // ==========================================
        // Edge mouseout
        // ==========================================

        cy.on(
            "mouseout",
            "edge",
            function() {

                hideInteractionTooltip();

            }
        );

    })

    .catch(error => {

        console.error(
            "loadNetwork error:",
            error
        );

    });
}


// =====================================================
// Toggle Keep Selection
// Node-only selection
// =====================================================

function toggleKeepSelection(node) {

    if (!editMode) {
        console.log("Edit Mode OFF");
        return;
    }

    // Edit Mode 只允許 Node
    if (!node || node.group() !== "nodes") {
        return;
    }

    const id = node.id();
    const type = node.data("type");

    // ==========================================
    // 已選取 → 取消
    // ==========================================

    if (node.hasClass("keep-selected")) {

        node.removeClass("keep-selected");
        node.unselect();

        console.log(
            "取消保留 Node:",
            id,
            type
        );

    }

    // ==========================================
    // 未選取 → 加入保留
    // ==========================================

    else {

        node.addClass("keep-selected");
        node.select();

        console.log(
            "加入保留 Node:",
            id,
            type
        );
    }

    updateSelectionCount();
}

// =====================================================
// Update Selection Count
// =====================================================

function updateSelectionCount() {

    const count =
        cy
            ? cy.nodes(".keep-selected").length
            : 0;

    const counter =
        document.getElementById(
            "network-selection-count"
        );

    if (counter) {

        counter.textContent =
            `Selected: ${count} node${count === 1 ? "" : "s"}`;
    }

    console.log(
        "Selected nodes:",
        count
    );
}
// =====================================================
// Clear Node Selection
// =====================================================

function clearNetworkSelection() {

    console.log(
        "Clear Node Selection clicked"
    );

    if (!cy) {

        console.warn(
            "Clear Selection: Cytoscape 尚未建立"
        );

        return;
    }

    // ==========================================
    // 只清除 Node selection
    // ==========================================

    cy.nodes()
        .removeClass("keep-selected");

    cy.nodes()
        .unselect();

    updateSelectionCount();

    console.log(
        "Node selection cleared"
    );
}

// =====================================================
// Keep Selected Nodes
// =====================================================

function keepSelected() {

    if (!cy) {

        alert(
            "Network 尚未建立"
        );

        return;
    }

    if (!editMode) {

        alert(
            "請先開啟 Edit Mode"
        );

        return;
    }

    // ==========================================
    // 取得被選取的 Node
    // ==========================================

    const selectedNodes =
        cy.nodes(".keep-selected");

    if (selectedNodes.length === 0) {

        alert(
            "請先點選要保留的 Node"
        );

        return;
    }

    // ==========================================
    // 建立保留 Node ID
    // ==========================================

    const keepNodeIds =
        new Set();

    selectedNodes.forEach(node => {

        keepNodeIds.add(
            node.id()
        );

    });

    console.log(
        "Keep nodes:",
        [...keepNodeIds]
    );

    // ==========================================
    // 移除沒有被選取的 Node
    // ==========================================

    cy.nodes().forEach(node => {

        if (
            !keepNodeIds.has(
                node.id()
            )
        ) {

            node.remove();
        }

    });

    // ==========================================
    // Edge：
    //
    // 只保留 source / target
    // 都存在的 Edge
    // ==========================================

    cy.edges().forEach(edge => {

        const source =
            edge.data("source");

        const target =
            edge.data("target");

        const nodesBothKept =
            keepNodeIds.has(source) &&
            keepNodeIds.has(target);

        if (!nodesBothKept) {

            edge.remove();
        }

    });

    // ==========================================
    // 清除選取樣式
    // ==========================================

    cy.nodes()
        .removeClass("keep-selected");

    cy.nodes()
        .unselect();

    updateSelectionCount();

    // ==========================================
    // Layout
    // ==========================================

    cy.layout({

        name: "breadthfirst",

        directed: true,

        spacingFactor: 1.5,

        fit: true,

        padding: 30

    }).run();

    console.log(
        "Keep Selected Nodes completed:",
        "nodes =",
        cy.nodes().length,
        "edges =",
        cy.edges().length
    );
}

// =====================================================
// Remove Unselected
// Backward compatibility
// =====================================================

function removeUnselected() {

    console.log(
        "Remove Unselected → Keep Selected Nodes"
    );

    keepSelected();
}



// =====================================================
// Restore Network
// =====================================================

window.restoreNetwork = function() {

    if (!cy) {

        alert(
            "Network 尚未建立"
        );

        return;
    }


    hideInteractionTooltip();


    // ==========================================
    // 清除目前 network
    // ==========================================

    cy.elements().remove();


    // ==========================================
    // 恢復原始 network
    // ==========================================

    cy.add(
        structuredClone(
            originalElements
        )
    );


    // ==========================================
    // 清除選取
    // ==========================================

    clearNetworkSelection();


    // ==========================================
    // Layout
    // ==========================================

    cy.layout({

        name: "breadthfirst",

        directed: true,

        spacingFactor: 1.5,

        fit: true,

        padding: 30

    }).run();


    console.log(
        "Network restored:",
        cy.nodes().length,
        "nodes,",
        cy.edges().length,
        "edges"
    );
};


// =====================================================
// Expand node
// =====================================================
function expandNode(id) {

    console.log(
        "expand:",
        id
    );

    fetch(
        `/api/network/${encodeURIComponent(id)}?level=2`
    )
    .then(res => {
        if (!res.ok) {
            throw new Error(
                `HTTP ${res.status}`
            );
        }
        return res.json();
    })
    .then(data => {
        const newElements = [];
        // ==========================================
        // Nodes
        // ==========================================
        data.nodes.forEach(n => {
            if (
                cy.getElementById(n.id).length
            ) {
                return;
            }
            newElements.push({
                data: n
            });
        });
        // ==========================================
        // Edges
        // ==========================================
        data.edges.forEach(e => {
            if (
                cy.getElementById(e.id).length
            ) {
                return;
            }
            newElements.push({
                data: e
            });
        });
        // ==========================================
        // Add
        // ==========================================
        cy.add(
            newElements
        );
        // ==========================================
        // 更新 Restore 的基準
        // ==========================================
        originalElements =
            cy.elements().jsons();
        // ==========================================
        // Layout
        // ==========================================
        cy.layout({
            name: "breadthfirst",
            directed: true,
            spacingFactor: 1.5
        }).run();
        console.log(
            "nodes:",
            cy.nodes().length
        );
        console.log(
            "edges:",
            cy.edges().length
        );
    })

    .catch(error => {

        console.error(
            "expandNode error:",
            error
        );

    });
}
// =====================================================
// Change layout
// =====================================================
window.changeLayout = function(type) {

    if (!cy) {

        console.log(
            "Cytoscape not ready"
        );

        return;
    }


    cy.stop();


    let option = {

        name: type,

        animate: true,

        fit: true,

        padding: 30

    };


    switch(type) {

        case "breadthfirst":

            option.directed = true;

            option.spacingFactor = 1.5;

            break;


        case "dagre":

            option.rankDir = "LR";

            option.nodeSep = 100;

            option.rankSep = 150;

            break;


        case "cose":

            option.idealEdgeLength = 150;

            option.nodeRepulsion = 8000;

            break;

    }


    cy.layout(option).run();
};


// =====================================================
// Open network window
// =====================================================

function openNetworkWindow(gene) {

    window.open(

        `/network/${encodeURIComponent(gene)}`,

        "_blank",

        "width=1500,height=900"

    );
}


// =====================================================
// Export PNG
// =====================================================

window.exportPNG = function() {

    console.log(
        "exportPNG click",
        cy
    );


    if (!cy) {

        alert(
            "Network 尚未建立"
        );

        return;
    }


    const png =
        cy.png({

            full: true,

            scale: 3

        });


    const a =
        document.createElement("a");


    a.href = png;

    a.download =
        "network.png";

    a.click();
};

// =====================================================
// Network Editor Toolbar
// =====================================================

function createNetworkEditorToolbar() {

    console.log(
        "createNetworkEditorToolbar()"
    );

    const cyContainer =
        document.getElementById("bigcy");

    if (!cyContainer) {

        console.error(
            "#bigcy not found"
        );

        return;
    }


    // ==========================================
    // 如果不存在就建立
    // ==========================================

    let toolbar =
        document.getElementById(
            "network-editor-toolbar"
        );


    if (!toolbar) {

        toolbar =
            document.createElement("div");

        toolbar.id =
            "network-editor-toolbar";


        toolbar.innerHTML = `

            <div class="network-editor-title">
                Network Editor
            </div>

            <span
                id="network-selection-count"
                style="
                    margin-left:10px;
                    margin-right:10px;
                    color:#93a3ac;
                    font-size:13px;
                ">
                Selected: 0 nodes
            </span>

            <button
                id="keepSelectedBtn"
                type="button">
                ✓ Keep Selected Nodes
            </button>

            <button
                id="clearSelectionBtn"
                type="button">
                Clear Selection
            </button>

            <button
                id="restoreNetworkBtn"
                type="button">
                ↻ Restore All
            </button>

            <button
                id="exitEditBtn"
                type="button">
                Exit Edit
            </button>

        `;


        // ==========================================
        // 插入到 Cytoscape 上方
        // ==========================================

        cyContainer.parentNode.insertBefore(
            toolbar,
            cyContainer
        );


        // ==========================================
        // Button events
        // ==========================================

        document
            .getElementById("keepSelectedBtn")
            .onclick =
            keepSelected;


        document
            .getElementById("clearSelectionBtn")
            .onclick =
            clearNetworkSelection;


        document
            .getElementById("restoreNetworkBtn")
            .onclick =
            restoreNetwork;


        document
            .getElementById("exitEditBtn")
            .onclick =
            exitEditMode;


        console.log(
            "Network Editor Toolbar created"
        );
    }


    // ==========================================
    // 顯示 Toolbar
    // ==========================================

    toolbar.style.display =
        "flex";
}


// =====================================================
// Hide Network Editor Toolbar
// =====================================================

function hideNetworkEditorToolbar() {

    const toolbar =
        document.getElementById(
            "network-editor-toolbar"
        );


    if (toolbar) {

        toolbar.style.display =
            "none";
    }
}

// =====================================================
// Enter Edit Mode
// =====================================================

window.enterEditMode = function() {

    console.log(
        "Enter Edit Mode clicked"
    );

    if (!cy) {

        alert(
            "Network 尚未建立"
        );

        return;
    }

    if (editMode) {

        console.log(
            "Already in Edit Mode"
        );

        return;
    }

    // ==========================================
    // 開啟 Edit Mode
    // ==========================================

    editMode = true;

    // ==========================================
    // 清除之前 selection
    // ==========================================

    clearNetworkSelection();

    // ==========================================
    // 建立 Toolbar
    // ==========================================

    createNetworkEditorToolbar();

    // ==========================================
    // Edit Mode 視覺效果
    // ==========================================

    cy.nodes().style(
        "overlay-opacity",
        0.15
    );

    // Edge 淡化
    cy.edges().style(
        "opacity",
        0.25
    );

    updateSelectionCount();

    console.log(
        "Edit Mode: ON"
    );
};

// =====================================================
// Exit Edit Mode
// =====================================================

window.exitEditMode = function() {

    console.log(
        "Exit Edit Mode clicked"
    );

    if (!cy) {

        editMode = false;

        hideNetworkEditorToolbar();

        return;
    }

    // ==========================================
    // 關閉 Edit Mode
    // ==========================================

    editMode = false;

    // ==========================================
    // 清除 selection
    // ==========================================

    clearNetworkSelection();

    // ==========================================
    // 恢復 Node overlay
    // ==========================================

    cy.nodes().style(
        "overlay-opacity",
        0
    );

    // ==========================================
    // 恢復 Edge
    // ==========================================

    cy.edges().style(
        "opacity",
        1
    );

    // ==========================================
    // 隱藏 Toolbar
    // ==========================================

    hideNetworkEditorToolbar();

    console.log(
        "Edit Mode: OFF"
    );
};
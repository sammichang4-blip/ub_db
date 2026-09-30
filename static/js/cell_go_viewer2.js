(function () {
    "use strict";

    const state = {
        svgRoot: null,

        goTermsByAspect: {
            C: [],
            F: [],
            P: []
        },

        introTimer: null,

        // Inspector currently selected SVG node
        selectedSlId: null
        
    };


    document.addEventListener("DOMContentLoaded", init);


    // ================================================================
    // INIT
    // ================================================================

    async function init() {

        const [svgOk] = await Promise.all([
            loadSvg(),
            loadGoTerms()
        ]);

        if (!svgOk) {
            return;
        }

        renderGoLists();

        createInspector();

        wireHoverInteractions();

        wireSvgInspector();

        playIntroSequence();
    }


    // ================================================================
    // LOAD SVG
    // ================================================================

    async function loadSvg() {

        const container =
            document.getElementById("cell-container");

        if (!container) {
            console.error(
                "[UKW] #cell-container not found"
            );

            return false;
        }

        try {

            const res =
                await fetch(window.CELL_SVG_URL);

            if (!res.ok) {
                throw new Error(
                    "svg fetch failed: " + res.status
                );
            }

            const svgText =
                await res.text();

            container.innerHTML =
                svgText;

            state.svgRoot =
                container.querySelector("svg");

            console.log(
                "[UKW] SVG loaded:",
                !!state.svgRoot
            );


            if (state.svgRoot) {

                const slNodes =
                    state.svgRoot.querySelectorAll(
                        '[id^="SL"]'
                    );

                console.log(
                    "[UKW] SL nodes:",
                    slNodes.length
                );

                console.log(
                    "[UKW] Example SL:",
                    slNodes[0]?.id
                );
            }


            return !!state.svgRoot;

        } catch (err) {

            console.error(
                "[UKW] SVG ERROR:",
                err
            );

            container.innerHTML =
                '<div class="loading">' +
                '細胞圖載入失敗：' +
                escapeHtml(err.message) +
                "</div>";

            return false;
        }
    }


    // ================================================================
    // LOAD GO
    // ================================================================

    async function loadGoTerms() {

        try {

            const res =
                await fetch(window.GO_API_URL);

            if (!res.ok) {
                throw new Error(
                    "go fetch failed: " +
                    res.status
                );
            }

            const data =
                await res.json();

            const grouped = {
                C: [],
                F: [],
                P: []
            };


            for (
                const term of data.go_terms || []
            ) {

                const aspect =
                    grouped[term.aspect]
                        ? term.aspect
                        : "P";

                grouped[aspect].push(term);
            }


            state.goTermsByAspect =
                grouped;

            console.log(
                "[UKW] GO terms:",
                grouped
            );

            return true;

        } catch (err) {

            console.error(
                "[UKW] GO ERROR:",
                err
            );

            return false;
        }
    }


    // ================================================================
    // RENDER GO LIST
    // ================================================================

    function renderGoLists() {

        renderOneList(
            "go-list-C",
            state.goTermsByAspect.C,
            true
        );

        renderOneList(
            "go-list-F",
            state.goTermsByAspect.F,
            false
        );

        renderOneList(
            "go-list-P",
            state.goTermsByAspect.P,
            false
        );
    }


    function renderOneList(ulId, terms, allowMapping) {

        const ul = document.getElementById(ulId);
        if (!ul) return;

        ul.innerHTML = "";

        // Cellular Component：有 SVG mapping 排前面，沒有排最後
        const sortedTerms = [...terms].sort((a, b) => {

            const aMapped =
                allowMapping &&
                (
                    (Array.isArray(a.sl_ids) && a.sl_ids.length > 0) ||
                    (typeof a.sl_ids === "string" && a.sl_ids.trim() !== "")
                );

            const bMapped =
                allowMapping &&
                (
                    (Array.isArray(b.sl_ids) && b.sl_ids.length > 0) ||
                    (typeof b.sl_ids === "string" && b.sl_ids.trim() !== "")
                );

            if (aMapped !== bMapped) {
                return bMapped - aMapped; // true 在前
            }

            // 同一群內再依名稱排序
            const aName = a.term_name || a.name || "";
            const bName = b.term_name || b.name || "";

            return aName.localeCompare(bName);
        });

        if (!sortedTerms.length) {
            const li = document.createElement("li");
            li.textContent = "（沒有資料）";
            li.style.color = "#aaa";
            ul.appendChild(li);
            return;
        }

        for (const term of sortedTerms) {

            let rawSlIds = [];


            if (allowMapping) {

                if (
                    Array.isArray(term.sl_ids)
                ) {

                    rawSlIds =
                        term.sl_ids;

                } else if (
                    typeof term.sl_ids ===
                    "string"
                ) {

                    rawSlIds =
                        term.sl_ids.split(",");
                }
            }


            const slIds =
                rawSlIds
                    .map(normalizeSlId)
                    .filter(Boolean);


            const li =
                document.createElement("li");


            li.innerHTML =
                escapeHtml(
                    term.term_name ||
                    term.name ||
                    "(unnamed)"
                ) +

                '<span class="go-id">' +
                escapeHtml(
                    term.go_id || ""
                ) +
                "</span>" +

                (
                    term.evidence
                        ? '<span class="go-evidence">' +
                          escapeHtml(
                              term.evidence
                          ) +
                          "</span>"
                        : ""
                );


            if (slIds.length) {

                li.classList.add(
                    "mappable"
                );

                li.dataset.sl =
                    slIds.join(",");

                // 儲存 GO 資訊給 Inspector
                li.dataset.goId =
                    term.go_id || "";

                li.dataset.goName =
                    term.term_name ||
                    term.name ||
                    "";

                li.dataset.aspect =
                    term.aspect || "C";
            }


            ul.appendChild(li);
        }
    }


    // ================================================================
    // INTRO ANIMATION
    // ================================================================

    function playIntroSequence() {

        const items =
            Array.from(
                document.querySelectorAll(
                    "#go-list-C li.mappable"
                )
            );

        if (!items.length) {
            return;
        }


        const STEP_MS = 1300;

        let i = 0;


        function step() {

            if (i > 0) {

                const prev =
                    items[i - 1];

                prev.classList.remove(
                    "active"
                );

                setGlow(
                    splitSl(prev.dataset.sl),
                    [
                        "sl-glow-strong",
                        "sl-glow-pulse"
                    ],
                    false
                );
            }


            if(i>=items.length){

                // 導覽結束全部熄燈
                document.querySelectorAll(
                    "#go-list-C li.active"
                ).forEach(el=>el.classList.remove("active"));

                setGlow(
                    items
                        .flatMap(li=>splitSl(li.dataset.sl)),
                    ["sl-glow-strong","sl-glow-pulse","sl-glow-soft"],
                    false
                );

                return;
            }


            const li =
                items[i];

            li.classList.add(
                "active"
            );


            li.scrollIntoView({
                block: "nearest",
                behavior: "smooth"
            });


            setGlow(
                splitSl(
                    li.dataset.sl
                ),
                [
                    "sl-glow-strong",
                    "sl-glow-pulse"
                ],
                true
            );


            i += 1;


            state.introTimer =
                setTimeout(
                    step,
                    STEP_MS
                );
        }


        step();
    }


    // ================================================================
    // GO LIST ↔ SVG HOVER
    // ================================================================

    function wireHoverInteractions() {

        const container =
            document.getElementById(
                "cell-container"
            );


        if (!container) {
            return;
        }


        // ------------------------------------------------------------
        // SVG hover
        // ------------------------------------------------------------

        container.addEventListener(
            "mouseover",
            (e) => {

                const g =
                    e.target.closest(
                        '[id^="SL"]'
                    );

                if (!g) {
                    return;
                }


                highlightBySlId(
                    g.id,
                    true
                );
            }
        );


        container.addEventListener(
            "mouseout",
            (e) => {

                const g =
                    e.target.closest(
                        '[id^="SL"]'
                    );

                if (!g) {
                    return;
                }


                if (
                    e.relatedTarget &&
                    g.contains(
                        e.relatedTarget
                    )
                ) {
                    return;
                }


                // 被 Inspector 選中的胞器不要因 hover out 消失
                if (
                    state.selectedSlId ===
                    normalizeSlId(g.id)
                ) {
                    return;
                }


                highlightBySlId(
                    g.id,
                    false
                );
            }
        );


        // ------------------------------------------------------------
        // GO list
        // ------------------------------------------------------------

        const list =
            document.getElementById(
                "go-list-C"
            );

        if (!list) {
            return;
        }


        list.addEventListener(
            "mouseover",
            (e) => {

                const li =
                    e.target.closest(
                        "li.mappable"
                    );

                if (
                    !li ||
                    !list.contains(li)
                ) {
                    return;
                }


                li.classList.add(
                    "active"
                );


                setGlow(
                    splitSl(
                        li.dataset.sl
                    ),
                    ["sl-glow-strong"],
                    true
                );
            }
        );


        list.addEventListener(
            "mouseout",
            (e) => {

                const li =
                    e.target.closest(
                        "li.mappable"
                    );

                if (
                    !li ||
                    !list.contains(li)
                ) {
                    return;
                }


                if (
                    e.relatedTarget &&
                    li.contains(
                        e.relatedTarget
                    )
                ) {
                    return;
                }


                li.classList.remove(
                    "active"
                );


                setGlow(
                    splitSl(
                        li.dataset.sl
                    ),
                    ["sl-glow-strong"],
                    false
                );
            }
        );


        // ------------------------------------------------------------
        // GO click
        // ------------------------------------------------------------

        list.addEventListener(
            "click",
            (e) => {

                const li =
                    e.target.closest(
                        "li.mappable"
                    );

                if (!li) {
                    return;
                }


                const slIds =
                    splitSl(
                        li.dataset.sl
                    );


                // 選擇第一個 mapping
                if (slIds.length) {

                    selectSvgNode(
                        slIds[0]
                    );
                }
            }
        );
    }


    // ================================================================
    // SVG INSPECTOR
    // ================================================================
    function findGoByNodeName(name){

        const target=name.trim().toLowerCase();

        return state.goTermsByAspect.C.filter(term=>{

            const termName=(term.term_name||term.name||"")
                .trim()
                .toLowerCase();

            return termName===target;
        });
    }
    function getDeepestSLNode(event){

    const path = event.composedPath();

    for(const el of path){

            if(
                el instanceof SVGGElement &&
                el.id &&
                el.id.startsWith("SL")
            ){
                return el;   // 第一個就是最深層
            }
        }

        return null;
    }

    function wireSvgInspector(){

        if(!state.svgRoot) return;

        state.svgRoot.addEventListener("click",e=>{

            const node = getDeepestSLNode(e);

            if(!node) return;

            e.preventDefault();
            e.stopPropagation();

            const slId=normalizeSlId(node.id);

            if(state.selectedSlId){

                setGlow(
                    [state.selectedSlId],
                    ["sl-selected"],
                    false
                );
            }

            state.selectedSlId=slId;

            setGlow(
                [slId],
                ["sl-selected"],
                true
            );

            highlightGoTerms(slId);

            // ⭐只有 GO list 有的才秀 Description
            showCellDetail(slId);
        });
    }
    // ================================================================
    // SELECT SVG NODE
    // ================================================================

    function selectSvgNode(slId) {

        const normalizedId =
            normalizeSlId(slId);


        if (!normalizedId) {
            return;
        }


        // 清掉上一個 selection
        if (
            state.selectedSlId &&
            state.selectedSlId !==
                normalizedId
        ) {

            setGlow(
                [state.selectedSlId],
                ["sl-selected"],
                false
            );
        }


        state.selectedSlId =
            normalizedId;


        // 藍色 selection
        setGlow(
            [normalizedId],
            ["sl-selected"],
            true
        );


        // 找 GO 對應
        const goTerms =
            findGoTermsBySlId(
                normalizedId
            );


        // 更新右側 GO list
        highlightGoTerms(
            normalizedId
        );


        // 更新 Inspector
        updateInspector(
            normalizedId,
            goTerms
        );


        console.log(
            "[UKW] Inspector:",
            normalizedId,
            goTerms
        );
    }


    // ================================================================
    // FIND GO TERMS
    // ================================================================

    function findGoTermsBySlId(slId) {

        const normalizedId =
            normalizeSlId(slId);


        const results = [];


        for (
            const term of
            state.goTermsByAspect.C
        ) {

            let ids = [];


            if (
                Array.isArray(
                    term.sl_ids
                )
            ) {

                ids =
                    term.sl_ids;

            } else if (
                typeof term.sl_ids ===
                "string"
            ) {

                ids =
                    term.sl_ids.split(",");
            }


            ids =
                ids
                    .map(normalizeSlId)
                    .filter(Boolean);


            if (
                ids.includes(
                    normalizedId
                )
            ) {

                results.push(term);
            }
        }


        return results;
    }


    // ================================================================
    // HIGHLIGHT GO TERMS
    // ================================================================

    function highlightGoTerms(slId) {

        const normalizedId =
            normalizeSlId(slId);


        document
            .querySelectorAll(
                "#go-list-C li.mappable"
            )
            .forEach((li) => {

                const ids =
                    splitSl(
                        li.dataset.sl
                    );


                const matched =
                    ids.includes(
                        normalizedId
                    );


                li.classList.toggle(
                    "inspector-active",
                    matched
                );
            });
    }


    // ================================================================
    // UPDATE INSPECTOR
    // ================================================================

    function updateInspector(
        slId,
        goTerms
    ) {

        const panel =
            document.getElementById(
                "svg-inspector"
            );


        if (!panel) {
            return;
        }


        const node =
            state.svgRoot.querySelector(
                `[id="${CSS.escape(slId)}"]`
            );


        if (!node) {

            panel.innerHTML =
                `
                <div class="inspector-empty">
                    SVG node not found:
                    ${escapeHtml(slId)}
                </div>
                `;

            return;
        }


        // SVG 原始座標
        let bbox = null;


        try {

            bbox =
                node.getBBox();

        } catch (err) {

            console.warn(
                "[UKW] getBBox failed:",
                err
            );
        }


        const x =
            bbox
                ? formatNumber(bbox.x)
                : "—";

        const y =
            bbox
                ? formatNumber(bbox.y)
                : "—";

        const width =
            bbox
                ? formatNumber(bbox.width)
                : "—";

        const height =
            bbox
                ? formatNumber(bbox.height)
                : "—";

        const centerX =
            bbox
                ? formatNumber(
                    bbox.x +
                    bbox.width / 2
                )
                : "—";

        const centerY =
            bbox
                ? formatNumber(
                    bbox.y +
                    bbox.height / 2
                )
                : "—";


        // ------------------------------------------------------------
        // GO HTML
        // ------------------------------------------------------------

        let goHtml = "";


        if (!goTerms.length) {

            goHtml =
                `
                <div class="inspector-no-go">
                    No GO Cellular Component
                    mapping
                </div>
                `;

        } else {

            goHtml =
                goTerms
                    .map((term) => {

                        const goId =
                            escapeHtml(
                                term.go_id ||
                                ""
                            );

                        const name =
                            escapeHtml(
                                term.term_name ||
                                term.name ||
                                ""
                            );

                        const evidence =
                            term.evidence
                                ? `
                                <span class="inspector-evidence">
                                    ${escapeHtml(
                                        term.evidence
                                    )}
                                </span>
                                `
                                : "";


                        return `
                        <div class="inspector-go-item">

                            <div class="inspector-go-id">
                                ${goId}
                            </div>

                            <div class="inspector-go-name">
                                ${name}
                            </div>

                            ${evidence}

                        </div>
                        `;
                    })
                    .join("");
        }


        // ------------------------------------------------------------
        // Inspector HTML
        // ------------------------------------------------------------

        panel.innerHTML =
            `
            <div class="inspector-title">
                SVG Inspector
            </div>


            <div class="inspector-section">

                <div class="inspector-label">
                    SL ID
                </div>

                <div class="inspector-value inspector-sl">
                    ${escapeHtml(slId)}
                </div>

            </div>


            <div class="inspector-section">

                <div class="inspector-label">
                    GO Cellular Component
                </div>

                <div class="inspector-go-list">

                    ${goHtml}

                </div>

            </div>


            <div class="inspector-section">

                <div class="inspector-label">
                    SVG Coordinates
                </div>


                <div class="inspector-grid">

                    <div>
                        <span>X</span>
                        <strong>${x}</strong>
                    </div>

                    <div>
                        <span>Y</span>
                        <strong>${y}</strong>
                    </div>

                    <div>
                        <span>Width</span>
                        <strong>${width}</strong>
                    </div>

                    <div>
                        <span>Height</span>
                        <strong>${height}</strong>
                    </div>

                    <div>
                        <span>Center X</span>
                        <strong>${centerX}</strong>
                    </div>

                    <div>
                        <span>Center Y</span>
                        <strong>${centerY}</strong>
                    </div>

                </div>

            </div>
            `;


        // ------------------------------------------------------------
        // Scroll Inspector into view
        // ------------------------------------------------------------

        panel.scrollIntoView({
            block: "nearest",
            behavior: "smooth"
        });
    }


    // ================================================================
    // CREATE INSPECTOR
    // ================================================================

    function createInspector() {

        let panel =
            document.getElementById(
                "svg-inspector"
            );


        if (panel) {
            return;
        }


        panel =
            document.createElement("div");

        panel.id =
            "svg-inspector";

        panel.className =
            "svg-inspector";

        panel.innerHTML =
            `
            <div class="inspector-title">
                SVG Inspector
            </div>

            <div class="inspector-empty">
                點擊左側 SVG 胞器
            </div>
            `;


        /*
         * 優先放在 cell-container 後面
         */
        const container =
            document.getElementById(
                "cell-container"
            );


        if (
            container &&
            container.parentNode
        ) {

            container.parentNode.insertBefore(
                panel,
                container.nextSibling
            );

        } else {

            document.body.appendChild(
                panel
            );
        }
    }


    // ================================================================
    // HIGHLIGHT SVG
    // ================================================================

    function highlightBySlId(
        slId,
        on
    ) {

        const normalizedId =
            normalizeSlId(slId);


        setGlow(
            [normalizedId],
            ["sl-glow-strong"],
            on
        );


        document
            .querySelectorAll(
                "#go-list-C li.mappable"
            )
            .forEach((el) => {

                const ids =
                    splitSl(
                        el.dataset.sl
                    );


                if (
                    ids.includes(
                        normalizedId
                    )
                ) {

                    el.classList.toggle(
                        "active",
                        on
                    );
                }
            });
    }


    // ================================================================
    // SET GLOW
    // ================================================================

    function setGlow(
        slIds,
        classNames,
        on
    ) {

        if (!state.svgRoot) {
            return;
        }


        for (
            const rawId of slIds
        ) {

            const slId =
                normalizeSlId(rawId);


            const node =
                state.svgRoot.querySelector(
                    `[id="${CSS.escape(slId)}"]`
                );


            if (!node) {

                console.warn(
                    "[UKW] SVG node NOT FOUND:",
                    rawId,
                    "→",
                    slId
                );

                continue;
            }


            console.log(
                "[UKW] SVG node FOUND:",
                rawId,
                "→",
                node.id
            );


            // Group
            classNames.forEach(
                (cls) => {

                    node.classList.toggle(
                        cls,
                        on
                    );
                }
            );


            // 真正畫圖的 SVG elements
            node
                .querySelectorAll(
                    "path, rect, ellipse, circle, polygon, polyline"
                )
                .forEach((child) => {

                    classNames.forEach(
                        (cls) => {

                            child.classList.toggle(
                                cls,
                                on
                            );
                        }
                    );
                });
        }
    }


    // ================================================================
    // ID NORMALIZATION
    // ================================================================

    function normalizeSlId(slId) {

        if (!slId) {
            return "";
        }


        return String(slId)
            .trim()
            .toUpperCase();
    }


    function splitSl(str) {

        return (str || "")
            .split(",")
            .map(normalizeSlId)
            .filter(Boolean);
    }


    // ================================================================
    // UTILITIES
    // ================================================================
    function hasGoMapping(slId){

    const id = normalizeSlId(slId);

    return state.goTermsByAspect.C.some(term=>{

        let ids=[];

        if(Array.isArray(term.sl_ids))
            ids=term.sl_ids;

        else if(typeof term.sl_ids==="string")
            ids=term.sl_ids.split(",");

        return ids
            .map(normalizeSlId)
            .includes(id);
    });
}

    function getSvgAnnotation(slId){

    const node=state.svgRoot.querySelector(
        `[id="${CSS.escape(slId)}"]`
    );

    if(!node) return null;

    return{

        node,

        name:
            node.querySelector(".subcell_name")
            ?.textContent.trim()||"",

        description:
            node.querySelector(".subcell_description")
            ?.textContent.trim()||""
    };
}

    function showCellDetail(slId){

    if(!hasGoMapping(slId)) return;

    const data=getSvgAnnotation(slId);

    if(!data) return;

    let card=document.getElementById("cell-detail-card");

    if(!card){

        card=document.createElement("div");

        card.id="cell-detail-card";

        document
            .getElementById("cell-container")
            .appendChild(card);
    }

    card.innerHTML=`

        <div class="cell-detail-title">
            ${escapeHtml(data.name)}
        </div>

        <div class="cell-detail-sl">
            ${escapeHtml(slId)}
        </div>

        <div class="cell-detail-description">
            ${escapeHtml(data.description)}
        </div>
    `;
}



    function formatNumber(value) {

        if (
            typeof value !==
            "number" ||
            !Number.isFinite(value)
        ) {

            return "—";
        }


        return value.toFixed(2);
    }


    function escapeHtml(str) {

        return String(str)
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            )
            .replace(
                /"/g,
                "&quot;"
            );
    }

})();

function getSvgSubcellAnnotation(slId) {
    if (!state.svgRoot) return null;

    const id = normalizeSlId(slId);

    const node = state.svgRoot.querySelector(
        `[id="${CSS.escape(id)}"]`
    );

    if (!node) {
        console.warn("[UKW] SVG node not found:", id);
        return null;
    }

    const nameEl = node.querySelector(
        ".subcell_name[property='name']"
    );

    const descriptionEl = node.querySelector(
        ".subcell_description[property='description']"
    );

    const name = nameEl
        ? nameEl.textContent.trim()
        : "";

    const description = descriptionEl
        ? descriptionEl.textContent.trim()
        : "";

    return {
        sl_id: id,
        name,
        description,
        node
    };
}

function showSvgDescription(slId) {

    const annotation = getSvgSubcellAnnotation(slId);

    if (!annotation) return;

    const {
        node,
        name,
        description
    } = annotation;

    const layer = createCellAnnotation();

    if (!layer) return;

    layer.innerHTML = "";

    const bbox = node.getBBox();

    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    const boxWidth = 330;
    const boxHeight = 150;

    const vb = state.svgRoot.viewBox.baseVal;

    let x = centerX + 30;
    let y = centerY - boxHeight / 2;

    /*
     * 如果右邊放不下，就放左邊
     */
    if (x + boxWidth > vb.x + vb.width) {
        x = centerX - boxWidth - 30;
    }

    /*
     * 上下邊界
     */
    if (y < vb.y + 10) {
        y = vb.y + 10;
    }

    if (y + boxHeight > vb.y + vb.height - 10) {
        y = vb.y + vb.height - boxHeight - 10;
    }

    const ns = "http://www.w3.org/2000/svg";

    /*
     * connector
     */
    const line = document.createElementNS(ns, "line");

    line.setAttribute("x1", centerX);
    line.setAttribute("y1", centerY);

    line.setAttribute("x2", x);
    line.setAttribute("y2", y + 30);

    line.setAttribute(
        "class",
        "ukw-description-line"
    );

    layer.appendChild(line);

    /*
     * background
     */
    const rect = document.createElementNS(ns, "rect");

    rect.setAttribute("x", x);
    rect.setAttribute("y", y);

    rect.setAttribute("width", boxWidth);
    rect.setAttribute("height", boxHeight);

    rect.setAttribute("rx", "10");

    rect.setAttribute(
        "class",
        "ukw-description-box"
    );

    layer.appendChild(rect);

    /*
     * Name
     */
    const title = document.createElementNS(ns, "text");

    title.setAttribute("x", x + 18);
    title.setAttribute("y", y + 27);

    title.setAttribute(
        "class",
        "ukw-description-title"
    );

    title.textContent = name || "Unknown";

    layer.appendChild(title);

    /*
     * SL ID
     */
    const sl = document.createElementNS(ns, "text");

    sl.setAttribute("x", x + 18);
    sl.setAttribute("y", y + 46);

    sl.setAttribute(
        "class",
        "ukw-description-sl"
    );

    sl.textContent = slId;

    layer.appendChild(sl);

    /*
     * Description
     */
    const foreignObject =
        document.createElementNS(
            "http://www.w3.org/2000/svg",
            "foreignObject"
        );

    foreignObject.setAttribute(
        "x",
        x + 15
    );

    foreignObject.setAttribute(
        "y",
        y + 55
    );

    foreignObject.setAttribute(
        "width",
        boxWidth - 30
    );

    foreignObject.setAttribute(
        "height",
        boxHeight - 65
    );

    const div = document.createElement("div");

    div.className =
        "ukw-description-text";

    div.textContent =
        description || "No description available.";

    foreignObject.appendChild(div);

    layer.appendChild(foreignObject);
}


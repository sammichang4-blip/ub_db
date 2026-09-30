(function () {
    "use strict";

    // ================================================================
    // STATE
    // ================================================================

    const state = {
        svgRoot: null,

        goTermsByAspect: {
            C: [],
            F: [],
            P: []
        },

        // Click selected cell
        selectedSlId: null,

        // Intro animation timer
        introTimer: null,

        // GO list hover → possibly multiple SVG cells
        hoverSlIds: [],

        // SVG cell hover
        cellHoverSlId: null
    };


    // ================================================================
    // INIT
    // ================================================================

    document.addEventListener(
        "DOMContentLoaded",
        init
    );


    async function init() {

        const [svgOk, goOk] =
            await Promise.all([
                loadSvg(),
                loadGoTerms()
            ]);


        if (!svgOk) {
            console.error(
                "[UKW] SVG loading failed."
            );
            return;
        }


        if (!goOk) {
            console.error(
                "[UKW] GO loading failed."
            );
            return;
        }


        renderGoLists();

        wireGoListInteractions();

        wireCellInteractions();

        playIntroSequence();
    }


    // ================================================================
    // LOAD SVG
    // ================================================================

    async function loadSvg() {

        const container =
            document.getElementById(
                "cell-container"
            );


        if (!container) {

            console.error(
                "[UKW] #cell-container not found."
            );

            return false;
        }


        if (!window.CELL_SVG_URL) {

            console.error(
                "[UKW] CELL_SVG_URL is not defined."
            );

            return false;
        }


        try {

            console.log(
                "[UKW] SVG URL:",
                window.CELL_SVG_URL
            );


            const res =
                await fetch(
                    window.CELL_SVG_URL,
                    {
                        method: "GET",
                        cache: "no-cache"
                    }
                );


            console.log(
                "[UKW] SVG HTTP status:",
                res.status
            );


            if (!res.ok) {

                throw new Error(
                    `SVG fetch failed: ${res.status} ${res.statusText}`
                );
            }


            const svgText =
                await res.text();


            if (!svgText.includes("<svg")) {

                throw new Error(
                    "Response does not appear to be an SVG document."
                );
            }


            container.innerHTML =
                svgText;


            state.svgRoot =
                container.querySelector("svg");


            if (!state.svgRoot) {

                throw new Error(
                    "No <svg> element found."
                );
            }


            console.log(
                "[UKW] SVG loaded."
            );


            console.log(
                "[UKW] SVG SL nodes:",
                state.svgRoot.querySelectorAll(
                    "g.subcellular_location[id^='SL']"
                ).length
            );


            return true;

        } catch (err) {

            console.error(
                "[UKW] SVG ERROR:",
                err
            );


            container.innerHTML = `
                <div class="loading">
                    細胞圖載入失敗：
                    ${escapeHtml(err.message)}
                </div>
            `;


            return false;
        }
    }


    // ================================================================
    // LOAD GO
    // ================================================================

    async function loadGoTerms() {

        if (!window.GO_API_URL) {

            console.error(
                "[UKW] GO_API_URL is not defined."
            );

            return false;
        }


        try {

            const res =
                await fetch(
                    window.GO_API_URL,
                    {
                        cache: "no-cache"
                    }
                );


            if (!res.ok) {

                throw new Error(
                    `GO fetch failed: ${res.status}`
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
                "[UKW] GO loaded:",
                {
                    C: grouped.C.length,
                    F: grouped.F.length,
                    P: grouped.P.length
                }
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
    // RENDER GO LISTS
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


    // ================================================================
    // HAS SVG MAPPING
    // ================================================================

    function hasSvgMapping(term) {

        if (!term || !state.svgRoot) {
            return false;
        }


        const nodes =
            getSvgNodesForGoTerm(term);


        return nodes.length > 0;
    }


    // ================================================================
    // RENDER ONE GO LIST
    // ================================================================

    function renderOneList(
        ulId,
        terms,
        allowMapping
    ) {

        const ul =
            document.getElementById(
                ulId
            );


        if (!ul) {
            return;
        }


        ul.innerHTML = "";


        const sortedTerms =
            [...terms].sort(
                (a, b) => {

                    if (!allowMapping) {

                        return getTermName(a)
                            .localeCompare(
                                getTermName(b)
                            );
                    }


                    const aMapped =
                        hasSvgMapping(a);


                    const bMapped =
                        hasSvgMapping(b);


                    if (
                        aMapped !== bMapped
                    ) {

                        return bMapped - aMapped;
                    }


                    return getTermName(a)
                        .localeCompare(
                            getTermName(b)
                        );
                }
            );


        if (!sortedTerms.length) {

            const li =
                document.createElement("li");


            li.textContent =
                "（沒有資料）";


            ul.appendChild(li);

            return;
        }


        let dividerInserted =
            false;


        for (
            const term of sortedTerms
        ) {

            const mapped =
                allowMapping &&
                hasSvgMapping(term);


            const slIds =
                mapped
                    ? getTermSlIds(term)
                    : [];


            /*
             * --------------------------------------------------------
             * Divider
             * --------------------------------------------------------
             */

            if (
                allowMapping &&
                !mapped &&
                !dividerInserted
            ) {

                const divider =
                    document.createElement("li");


                divider.className =
                    "go-divider";


                divider.textContent =
                    "No Cell Mapping";


                ul.appendChild(
                    divider
                );


                dividerInserted =
                    true;
            }


            /*
             * --------------------------------------------------------
             * LI
             * --------------------------------------------------------
             */

            const li =
                document.createElement("li");


            li.innerHTML = `
                <span class="go-term-name">
                    ${escapeHtml(
                        getTermName(term)
                    )}
                </span>

                <span class="go-id">
                    ${escapeHtml(
                        term.go_id || ""
                    )}
                </span>

                ${
                    term.evidence
                        ? `
                        <span class="go-evidence">
                            ${escapeHtml(
                                term.evidence
                            )}
                        </span>
                        `
                        : ""
                }
            `;


            /*
             * GO ID
             *
             * 所有 C/F/P 都建立
             * 因此全部可以 click → QuickGO
             */

            li.dataset.goId =
                term.go_id || "";


            li.dataset.goName =
                getTermName(term);


            li.dataset.aspect =
                term.aspect || "P";


            /*
             * C + SVG mapping
             */

            if (mapped) {

                li.classList.add(
                    "mappable"
                );


                li.dataset.sl =
                    slIds.join(",");
            }


            ul.appendChild(li);
        }
    }


    // ================================================================
    // GO TERM HELPERS
    // ================================================================

    function getTermName(term) {

        return (
            term?.term_name ||
            term?.name ||
            ""
        ).trim();
    }


    function getTermSlIds(term) {

        if (
            Array.isArray(term?.sl_ids)
        ) {

            return term.sl_ids
                .map(normalizeSlId)
                .filter(Boolean);
        }


        if (
            typeof term?.sl_ids === "string"
        ) {

            return term.sl_ids
                .split(",")
                .map(normalizeSlId)
                .filter(Boolean);
        }


        return [];
    }


    // ================================================================
    // FIND GO TERM
    // ================================================================

    function findGoTermById(goId) {

        if (!goId) {
            return null;
        }


        for (
            const aspect of ["C", "F", "P"]
        ) {

            const term =
                state.goTermsByAspect[aspect]
                    .find(
                        t =>
                            t.go_id === goId
                    );


            if (term) {
                return term;
            }
        }


        return null;
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


        const STEP_MS = 1200;

        let index = 0;


        function clearItem(li) {

            if (!li) {
                return;
            }


            li.classList.remove(
                "active"
            );


            setIntroGlow(
                splitSl(li.dataset.sl),
                false
            );
        }


        function step() {

            if (index > 0) {

                clearItem(
                    items[index - 1]
                );
            }


            if (
                index >= items.length
            ) {

                items.forEach(
                    clearItem
                );


                state.introTimer =
                    null;


                console.log(
                    "[UKW] GO intro completed."
                );


                return;
            }


            const li =
                items[index];


            li.classList.add(
                "active"
            );


            li.scrollIntoView({
                block: "nearest",
                behavior: "smooth"
            });


            setIntroGlow(
                splitSl(li.dataset.sl),
                true
            );


            index += 1;


            state.introTimer =
                setTimeout(
                    step,
                    STEP_MS
                );
        }


        step();
    }


    // ================================================================
    // STOP INTRO
    // ================================================================

    function stopIntroSequence() {

        if (state.introTimer) {

            clearTimeout(
                state.introTimer
            );

            state.introTimer = null;
        }


        document
            .querySelectorAll(
                "#go-list-C li.active"
            )
            .forEach(li => {

                li.classList.remove(
                    "active"
                );


                setIntroGlow(
                    splitSl(li.dataset.sl),
                    false
                );
            });
    }


    // ================================================================
    // CLEAR GO HOVER
    // ================================================================

    function clearExplorerHover() {

        if (
            state.hoverSlIds.length > 0
        ) {

            setGlow(
                state.hoverSlIds,
                false
            );
        }


        state.hoverSlIds = [];


        /*
         * 如果目前沒有 selected cell，
         * 就恢復/關閉 description
         */

        if (
            state.selectedSlId
        ) {

            const selectedNode =
                findSvgNodeById(
                    state.selectedSlId
                );


            if (selectedNode) {

                showCellDescription(
                    selectedNode
                );

                return;
            }
        }


        if (
            !state.cellHoverSlId
        ) {

            hideCellDescription();
        }
    }


    // ================================================================
    // GO LIST INTERACTION
    // ================================================================

    function wireGoListInteractions() {

        const selector = `
            #go-list-C li[data-go-id],
            #go-list-F li[data-go-id],
            #go-list-P li[data-go-id]
        `;


        document
            .querySelectorAll(selector)
            .forEach(li => {


                // ----------------------------------------------------
                // MOUSE ENTER
                // ----------------------------------------------------

                li.addEventListener(
                    "mouseenter",
                    () => {

                        stopIntroSequence();


                        const aspect =
                            li.dataset.aspect;


                        /*
                         * 只有 Cellular Component
                         * 有 SVG hover
                         */

                        if (
                            aspect !== "C"
                        ) {
                            return;
                        }


                        const term =
                            findGoTermById(
                                li.dataset.goId
                            );


                        if (!term) {
                            return;
                        }


                        clearExplorerHover();


                        const svgNodes =
                            getSvgNodesForGoTerm(
                                term
                            );


                        if (
                            !svgNodes.length
                        ) {

                            return;
                        }


                        state.hoverSlIds =
                            svgNodes
                                .map(
                                    node =>
                                        normalizeSlId(
                                            node.getAttribute(
                                                "id"
                                            )
                                        )
                                )
                                .filter(Boolean);


                        setGlow(
                            state.hoverSlIds,
                            true
                        );


                        /*
                         * 第一個 mapped cell
                         * 顯示 description
                         */

                        showCellDescription(
                            svgNodes[0]
                        );
                    }
                );


                // ----------------------------------------------------
                // MOUSE LEAVE
                // ----------------------------------------------------

                li.addEventListener(
                    "mouseleave",
                    () => {

                        clearExplorerHover();
                    }
                );


                // ----------------------------------------------------
                // CLICK → QuickGO
                // ----------------------------------------------------

                li.addEventListener(
                    "click",
                    () => {

                        stopIntroSequence();


                        const goId =
                            li.dataset.goId;


                        if (!goId) {
                            return;
                        }


                        clearExplorerHover();


                        const url =
                            `https://www.ebi.ac.uk/QuickGO/term/${encodeURIComponent(goId)}`;


                        window.open(
                            url,
                            "_blank",
                            "noopener,noreferrer"
                        );
                    }
                );
            });
    }


    // ================================================================
    // CELL INTERACTION
    // ================================================================

    function wireCellInteractions() {

        if (!state.svgRoot) {
            return;
        }


        // ============================================================
        // CLICK
        // ============================================================

        state.svgRoot.addEventListener(
            "click",
            event => {

                const node =
                    getDeepestSLNode(event);


                if (!node) {
                    return;
                }


                stopIntroSequence();


                event.stopPropagation();


                selectCellNode(node);
            }
        );


        // ============================================================
        // MOUSEOVER
        // ============================================================

        state.svgRoot.addEventListener(
            "mouseover",
            event => {

                const node =
                    getDeepestSLNode(event);


                if (!node) {
                    return;
                }


                const related =
                    event.relatedTarget;


                /*
                 * 如果只是從同一個 <g>
                 * 的 child 移到另一個 child，
                 * 不算真正離開
                 */

                if (
                    related &&
                    node.contains(related)
                ) {

                    return;
                }


                stopIntroSequence();


                const slId =
                    normalizeSlId(
                        node.getAttribute("id")
                    );


                state.cellHoverSlId =
                    slId;


                showCellDescription(
                    node
                );


                setGlow(
                    node,
                    true
                );
            }
        );


        // ============================================================
        // MOUSEOUT
        // ============================================================

        state.svgRoot.addEventListener(
            "mouseout",
            event => {

                const node =
                    getDeepestSLNode(event);


                if (!node) {
                    return;
                }


                const related =
                    event.relatedTarget;


                /*
                 * 還在同一個 SVG <g>
                 * 裡面，不是真的離開
                 */

                if (
                    related &&
                    node.contains(related)
                ) {

                    return;
                }


                setGlow(
                    node,
                    false
                );


                state.cellHoverSlId =
                    null;


                /*
                 * ----------------------------------------------------
                 * 最重要的邏輯
                 *
                 * 沒有 selected cell
                 * 且沒有 GO hover
                 * → description 消失
                 *
                 * 有 selected cell
                 * → description 保留
                 * ----------------------------------------------------
                 */

                if (
                    !state.selectedSlId &&
                    state.hoverSlIds.length === 0
                ) {

                    hideCellDescription();
                }
            }
        );
    }


    // ================================================================
    // GET DEEPEST SVG CELL
    // ================================================================

    function getDeepestSLNode(event) {

        const path =
            event.composedPath
                ? event.composedPath()
                : [];


        for (
            const el of path
        ) {

            if (
                !(
                    el instanceof SVGGElement
                )
            ) {

                continue;
            }


            const id =
                el.getAttribute("id") ||
                "";


            const cls =
                el.getAttribute("class") ||
                "";


            if (
                cls
                    .split(/\s+/)
                    .includes(
                        "subcellular_location"
                    ) &&
                /^SL-?\d+$/i.test(id)
            ) {

                return el;
            }
        }


        return null;
    }


    // ================================================================
    // CELL DESCRIPTION
    // ================================================================

    function hideCellDescription() {

        const card =
            document.getElementById(
                "cell-detail-card"
            );


        if (!card) {
            return;
        }


        card.classList.remove(
            "visible"
        );
    }


    function showCellDescription(node) {

        if (!node) {
            return;
        }


        const meta =
            getSvgMetadata(node);


        if (
            !meta.name &&
            !meta.description
        ) {

            hideCellDescription();

            return;
        }


        let card =
            document.getElementById(
                "cell-detail-card"
            );


        if (!card) {
            card = document.createElement("div");
            card.id = "cell-detail-card";

            /*
            * Description Card 放在 cell-panel，
            * 不要放在 #cell-container 裡。
            */
            const panel = document.querySelector(".cell-panel");

            if (!panel) {
                console.error("[UKW] .cell-panel not found.");
                return;
            }

            panel.appendChild(card);
        }


        card.innerHTML = `
            <div class="cell-detail-title">
                ${escapeHtml(meta.name)}
            </div>

            <div class="cell-detail-sl">
                ${escapeHtml(meta.slId)}
            </div>

            <div class="cell-detail-description">
                ${
                    meta.description
                        ? escapeHtml(
                            meta.description
                        )
                        : "No description available."
                }
            </div>
        `;


        card.classList.add(
            "visible"
        );
    }


    // ================================================================
    // SELECT CELL
    // ================================================================

    function selectCellNode(node) {

        if (!node) {
            return;
        }


        clearSelectedCell();


        const slId =
            normalizeSlId(
                node.getAttribute("id")
            );


        state.selectedSlId =
            slId;


        node.classList.add(
            "sl-selected"
        );


        /*
         * Click 後 description 保留
         */

        showCellDescription(
            node
        );


        /*
         * 找對應 GO Cellular Component
         */

        const meta =
            getSvgMetadata(
                node
            );


        const term =
            findGoByNodeName(
                meta.name
            );


        if (term) {

            highlightGoTerms(
                [term]
            );


            scrollToGoTerm(
                [term]
            );

        } else {

            highlightGoTerms(
                []
            );
        }
    }


    // ================================================================
    // CLEAR SELECTED CELL
    // ================================================================

    function clearSelectedCell() {

        if (
            state.selectedSlId
        ) {

            const node =
                findSvgNodeById(
                    state.selectedSlId
                );


            if (node) {

                node.classList.remove(
                    "sl-selected"
                );

                node.classList.remove(
                    "sl-glow-strong"
                );

                node.classList.remove(
                    "sl-glow-pulse"
                );

                node.classList.remove(
                    "explorer-hover"
                );

                node.classList.remove(
                    "sl-hover"
                );
            }
        }


        state.selectedSlId =
            null;


        document
            .querySelectorAll(
                "#go-list-C li.inspector-active"
            )
            .forEach(
                li =>
                    li.classList.remove(
                        "inspector-active"
                    )
            );
    }


    // ================================================================
    // SVG METADATA
    // ================================================================

    function getSvgMetadata(node) {

        if (!node) {

            return {
                slId: "",
                name: "",
                description: "",
                node: null
            };
        }


        let nameElement = null;
        let descriptionElement = null;


        /*
         * 不依賴 :scope
         * 直接找 child
         */

        for (
            const child of node.children
        ) {

            if (
                child.getAttribute(
                    "property"
                ) === "name"
            ) {

                nameElement =
                    child;
            }


            if (
                child.getAttribute(
                    "property"
                ) === "description"
            ) {

                descriptionElement =
                    child;
            }
        }


        return {

            slId:
                normalizeSlId(
                    node.getAttribute(
                        "id"
                    ) || ""
                ),


            name:
                nameElement
                    ? nameElement.textContent.trim()
                    : "",


            description:
                descriptionElement
                    ? descriptionElement.textContent.trim()
                    : "",


            node
        };
    }


    // ================================================================
    // FIND GO BY SVG NAME
    // ================================================================

    function findGoByNodeName(name) {

        const target =
            normalizeName(name);


        if (!target) {
            return null;
        }


        const terms =
            state.goTermsByAspect.C || [];


        for (
            const term of terms
        ) {

            if (
                normalizeName(
                    getTermName(term)
                ) === target
            ) {

                return term;
            }
        }


        return null;
    }


    // ================================================================
    // FIND SVG NODES FOR GO TERM
    // ================================================================

    function getSvgNodesForGoTerm(term) {

        if (
            !term ||
            !state.svgRoot
        ) {

            return [];
        }


        const nodes = [];


        // ------------------------------------------------------------
        // 1. Mapping SL IDs
        // ------------------------------------------------------------

        const slIds =
            getTermSlIds(term);


        for (
            const slId of slIds
        ) {

            const node =
                findSvgNodeById(
                    slId
                );


            if (
                node &&
                node.classList.contains(
                    "subcellular_location"
                ) &&
                !nodes.includes(node)
            ) {

                nodes.push(node);
            }
        }


        // ------------------------------------------------------------
        // 2. Fallback: GO term name
        // ------------------------------------------------------------

        if (
            nodes.length === 0
        ) {

            const target =
                normalizeName(
                    getTermName(term)
                );


            if (target) {

                const svgNodes =
                    state.svgRoot.querySelectorAll(
                        "g.subcellular_location"
                    );


                for (
                    const node of svgNodes
                ) {

                    const meta =
                        getSvgMetadata(
                            node
                        );


                    if (
                        normalizeName(
                            meta.name
                        ) === target
                    ) {

                        nodes.push(
                            node
                        );
                    }
                }
            }
        }


        return nodes;
    }


    // ================================================================
    // FIND SVG NODE BY ID
    // ================================================================

    function findSvgNodeById(slId) {

        if (!state.svgRoot) {
            return null;
        }


        const id =
            normalizeSlId(
                slId
            );


        if (!id) {
            return null;
        }


        return state.svgRoot.querySelector(
            `[id="${CSS.escape(id)}"]`
        );
    }


    // ================================================================
    // HIGHLIGHT GO TERMS
    // ================================================================

    function highlightGoTerms(
        goTerms
    ) {

        const ids =
            new Set(
                (goTerms || [])
                    .map(
                        term =>
                            term?.go_id
                    )
                    .filter(Boolean)
            );


        document
            .querySelectorAll(
                "#go-list-C li.mappable"
            )
            .forEach(
                li => {

                    li.classList.toggle(
                        "inspector-active",
                        ids.has(
                            li.dataset.goId
                        )
                    );
                }
            );
    }


    // ================================================================
    // SCROLL GO LIST
    // ================================================================

    function scrollToGoTerm(
        goTerms
    ) {

        if (
            !Array.isArray(goTerms) ||
            !goTerms.length
        ) {

            return;
        }


        const goIds =
            new Set(
                goTerms
                    .map(
                        term =>
                            term?.go_id
                    )
                    .filter(Boolean)
            );


        const li =
            Array.from(
                document.querySelectorAll(
                    "#go-list-C li.mappable"
                )
            ).find(
                element =>
                    goIds.has(
                        element.dataset.goId
                    )
            );


        if (!li) {
            return;
        }


        li.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });


        li.classList.add(
            "explorer-active"
        );


        window.setTimeout(
            () => {

                li.classList.remove(
                    "explorer-active"
                );

            },
            1500
        );
    }


    // ================================================================
    // SVG GLOW
    // ================================================================

    function setIntroGlow(
        target,
        enabled
    ) {

        const nodes =
            resolveSvgNodes(
                target
            );


        nodes.forEach(
            node => {

                node.classList.toggle(
                    "sl-glow-strong",
                    enabled
                );

                node.classList.toggle(
                    "sl-glow-pulse",
                    enabled
                );

                node.classList.toggle(
                    "sl-glow-soft",
                    enabled
                );
            }
        );
    }


    function setGlow(
        target,
        enabled
    ) {

        const nodes =
            resolveSvgNodes(
                target
            );


        nodes.forEach(
            node => {

                node.classList.toggle(
                    "explorer-hover",
                    enabled
                );

                node.classList.toggle(
                    "sl-hover",
                    enabled
                );
            }
        );
    }


    // ================================================================
    // RESOLVE SVG NODES
    // ================================================================

    function resolveSvgNodes(
        target
    ) {

        if (!target) {
            return [];
        }


        if (
            target instanceof Element
        ) {

            return [target];
        }


        if (
            typeof target === "string"
        ) {

            const node =
                findSvgNodeById(
                    target
                );


            return node
                ? [node]
                : [];
        }


        if (
            Array.isArray(target)
        ) {

            return target
                .map(
                    item => {

                        if (
                            item instanceof Element
                        ) {

                            return item;
                        }


                        return findSvgNodeById(
                            item
                        );
                    }
                )
                .filter(Boolean);
        }


        return [];
    }


    // ================================================================
    // NORMALIZE SL ID
    // ================================================================

    function normalizeSlId(
        value
    ) {

        if (value == null) {
            return "";
        }


        let id =
            String(value).trim();


        id =
            id.replace(
                /^#/,
                ""
            );


        id =
            id.replace(
                /^SL-/i,
                "SL"
            );


        return id;
    }


    function splitSl(
        value
    ) {

        if (
            Array.isArray(value)
        ) {

            return value
                .map(
                    normalizeSlId
                )
                .filter(Boolean);
        }


        return String(
            value || ""
        )
            .split(",")
            .map(
                normalizeSlId
            )
            .filter(Boolean);
    }


    // ================================================================
    // NORMALIZE NAME
    // ================================================================

    function normalizeName(
        value
    ) {

        return String(
            value || ""
        )
            .trim()
            .toLowerCase()
            .replace(
                /\s+/g,
                " "
            );
    }


    // ================================================================
    // ESCAPE HTML
    // ================================================================

    function escapeHtml(
        value
    ) {

        return String(
            value ?? ""
        )
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
            )
            .replace(
                /'/g,
                "&#039;"
            );
    }

})();
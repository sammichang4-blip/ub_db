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
        introReady: false,
        introRequested: false,

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

        state.introReady = true;
        if (
            state.introRequested ||
            document.getElementById("cell_go")?.classList.contains("active")
        ) {
            playIntroSequence();
        }
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

            installSvgHoverStyles();

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
                    Failed to load cell diagram:
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
                "(No data)";


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
                        <span class="go-evidence ${evidenceClass(term.evidence)}">
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
             * Build all C/F/P lists,
             * so all terms can be clicked → QuickGO.
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

        stopIntroSequence();

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

    window.startCellGoIntro = function () {
        if (!state.introReady) {
            state.introRequested = true;
            return;
        }

        state.introRequested = false;
        playIntroSequence();
    };


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
         * If no cell is currently selected,
         * restore / close the description.
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
                         * Only Cellular Component
                         * has SVG hover.
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

                        console.debug("[UKW] GO → SVG hover mapping", {
                            goId: term.go_id || term.goId || term.id || "",
                            goName: getTermName(term),
                            slIds: svgNodes.map(node => node.getAttribute("id")),
                            svgUrl: window.CELL_SVG_URL
                        });

                        if (!svgNodes.length) {
                            console.warn("[UKW] No SVG mapping for GO term", {
                                goId: term.go_id || term.goId || term.id || "",
                                goName: getTermName(term)
                            });
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
                         * Show the description
                         * for the first mapped cell.
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
                 * Moving from one child to another within the same <g>
                 * does not count as actually leaving.
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
                 * The pointer is still within the same SVG <g>;
                 * it has not actually left.
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
                 * Most important logic:
                 *
                 * No selected cell
                 * and no GO hover
                 * → hide the description.
                 *
                 * A cell is selected
                 * → keep the description visible.
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
            * Place the description card in cell-panel,
            * not inside #cell-container.
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


        if (isInteriorNode(node)) {
          setInteriorOverlay("select", true);
        } else {
            node.classList.add("sl-selected");
        }


        /*
         * Keep the description visible after a click.
         */

        showCellDescription(
            node
        );


        /*
         * Find the corresponding GO Cellular Component.
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
        setInteriorOverlay("select", false);
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
            return { slId: "", name: "", description: "", node: null };
        }

        // Use the text nodes inside each SL group as the SVG names and descriptions.
        // <text class="subcell_name" property="name">Cytosol</text>
        // <text class="subcell_description" property="description">...</text>
        // Do not rely on text visibility or whitespace in the class attribute string.
        const nameElement = Array.from(
            node.querySelectorAll("text.subcell_name[property='name'], text[property='name']")
        ).find(element => {
            const owner = getOwningSlNode(element);
            return !owner || owner === node;
        }) || null;

        const descriptionElement = Array.from(
            node.querySelectorAll("text.subcell_description[property='description'], text[property='description']")
        ).find(element => {
            const owner = getOwningSlNode(element);
            return !owner || owner === node;
        }) || null;

        return {
            slId: normalizeSlId(node.getAttribute("id") || ""),
            name: nameElement ? nameElement.textContent.trim() : "",
            description: descriptionElement ? descriptionElement.textContent.trim() : "",
            node
        };
    }

    // Walk up from the SVG subcell_name text node to find the SL group that owns the name.
    function getOwningSlNode(element) {
        let current = element;
        while (current && current !== state.svgRoot) {
            if (
                current.tagName &&
                current.tagName.toLowerCase() === "g" &&
                current.classList &&
                current.classList.contains("subcellular_location") &&
                /^SL/i.test(current.getAttribute("id") || "")
            ) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    // Locate the SL ID directly from the name in <text class="subcell_name"> in the SVG.
    function findSvgNodesByName(name) {
        if (!state.svgRoot) return [];
        const target = normalizeName(name);
        if (!target) return [];

        const found = [];
        const nameElements = state.svgRoot.querySelectorAll(
            "text.subcell_name[property='name'], text[property='name']"
        );

        for (const element of nameElements) {
            if (normalizeName(element.textContent) !== target) continue;
            const node = getOwningSlNode(element);
            if (node) found.push(node);
        }
        return uniqueNodes(found);
    }

    function findSvgNodeByName(name) {
        return findSvgNodesByName(name)[0] || null;
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

    // GO IDs are stable even when the API label and SVG label differ slightly.
    // These are verified against the bundled Animal_cells.svg SL groups.
    const GO_TO_SVG_SL = {
        "GO:0005829": ["SL0091"], // cytosol
        "GO:0005737": ["SL0086"], // cytoplasm (parent group of cytosol)
        "GO:0010008": ["SL0101"], // endosome membrane
        "GO:0030867": ["SL0235"]  // rough endoplasmic reticulum membrane
    };

    const SVG_NAME_ALIASES = {
        "cytosol": ["Cytosol"],
        "cytoplasm": ["Cytoplasm"],
        "endosome membrane": ["Endosome membrane"],
        "rough endoplasmic reticulum membrane": ["Rough endoplasmic reticulum membrane"]
    };

    function normalizeGoId(value) {
        const raw = String(value || "").trim().toUpperCase();
        const match = raw.match(/(?:GO[:_ -]?)?(\d{7})/);
        return match ? `GO:${match[1]}` : raw;
    }

    function getSvgNodesForGoTerm(term) {
        if (!term || !state.svgRoot) return [];

        // GO IDs are preferred. Accept common API spellings such as go_id,
        // goId, id, GO_0005829, or a bare seven-digit GO number.
        const goId = normalizeGoId(term.go_id || term.goId || term.id || term.go_term_id || "");
        const mappedIds = GO_TO_SVG_SL[goId] || [];
        const idNodes = mappedIds.map(id => findSvgNodeById(id)).filter(Boolean);
        if (idNodes.length) return expandForVisibleGeometry(idNodes);

        // If an API field contains the ID under another key, scan the known
        // identifiers before falling back to labels.
        const possibleIds = [term.go_id, term.goId, term.id, term.go_term_id]
            .map(normalizeGoId);
        for (const candidateId of possibleIds) {
            const ids = GO_TO_SVG_SL[candidateId] || [];
            const nodes = ids.map(id => findSvgNodeById(id)).filter(Boolean);
            if (nodes.length) return expandForVisibleGeometry(nodes);
        }

        // Exact label matching uses the SL group that owns the text, rather
        // than an ancestor group or the first nested text encountered.
        const targetName = normalizeName(getTermName(term));
        const aliases = SVG_NAME_ALIASES[targetName] || [];
        const namesToTry = [targetName, ...aliases.map(normalizeName)];
        for (const candidateName of [...new Set(namesToTry)].filter(Boolean)) {
            const matches = findSvgNodesByName(candidateName);
            if (matches.length) return expandForVisibleGeometry(matches);
        }

        // API-provided SL IDs are the final fallback.
        const apiNodes = getTermSlIds(term).map(id => findSvgNodeById(id)).filter(Boolean);
        return expandForVisibleGeometry(apiNodes);
    }

    // An SL group may be a semantic/container node with no drawable geometry.
    // In Animal_cells.svg, SL0086 (Cytoplasm) contains SL0091 (Cytosol), and
    // the visible cytoplasm/cytosol silhouette is drawn by SL0091. Keep the
    // semantic parent in the result (for its description), and also include
    // descendant SL groups that actually own visible shapes for highlighting.
    function expandForVisibleGeometry(nodes) {
        const result = [];
        for (const node of uniqueNodes(nodes)) {
            result.push(node);
            if (hasDirectSvgGeometry(node)) continue;

            const descendants = Array.from(node.querySelectorAll(
                "g.subcellular_location[id^='SL']"
            ));
            const drawableDescendants = descendants.filter(hasDirectSvgGeometry);
            result.push(...drawableDescendants);
        }
        return uniqueNodes(result);
    }

    function hasDirectSvgGeometry(node) {
        if (!node) return false;
        const shapeSelector = "path, ellipse, polygon, rect, circle, polyline, line, image, use";
        return Array.from(node.children || []).some(child => {
            if (child.matches && child.matches(shapeSelector)) return true;
            // Some SVGs wrap a shape in a plain <g>; do not cross into a nested
            // SL group, because that geometry belongs to the nested location.
            if (child.tagName && child.tagName.toLowerCase() === "g" &&
                !(child.classList && child.classList.contains("subcellular_location"))) {
                return !!child.querySelector(shapeSelector);
            }
            return false;
        });
    }

    function uniqueNodes(nodes) {
        return [...new Set(nodes.filter(Boolean))];
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


        const candidate = state.svgRoot.querySelector(
            `[id="${CSS.escape(id)}"]`
        );

        return candidate &&
            candidate.classList &&
            candidate.classList.contains("subcellular_location")
                ? candidate
                : null;
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


    const INTERIOR_SL_IDS = ["SL0086", "SL0091"];          // Cytoplasm, Cytosol
    const INTERIOR_OVERLAY_CLASS = "cell-interior-overlay";
    const interiorSources = new Set();                      // "intro" | "hover" | "select"
    
    function isInteriorNode(node) {
        return !!node &&
            INTERIOR_SL_IDS.includes(normalizeSlId(node.getAttribute("id")));
    }
    
    // The three sources (automatic highlighting / hover / click) share one overlay.
    // Show it when any source is active; remove it only when all are inactive, so they do not clear one another.
    function setInteriorOverlay(source, enabled) {
    
        if (enabled) {
            interiorSources.add(source);
        } else {
            interiorSources.delete(source);
        }
    
        refreshInteriorOverlay();
    }
    
    function refreshInteriorOverlay() {
    
        if (!state.svgRoot) {
            return;
        }
    
        const existing =
            state.svgRoot.querySelector(`.${INTERIOR_OVERLAY_CLASS}`);
    
        if (interiorSources.size === 0) {
            if (existing) {
                existing.remove();
            }
            return;
        }
    
        if (existing) {
            return;
        }
    
        const base = state.svgRoot.querySelector("#path_2_");
    
        if (!base) {
            console.warn("[UKW] Cell interior path (path_2_) not found.");
            return;
        }
    
        const overlay = base.cloneNode(false);
    
        overlay.removeAttribute("id");
        overlay.setAttribute("class", INTERIOR_OVERLAY_CLASS);
        overlay.setAttribute("fill", "#FF8C00");
        overlay.setAttribute("fill-opacity", "0.35");
        overlay.setAttribute("stroke", "none");
        overlay.setAttribute("pointer-events", "none");
    
        // Place after SL0198 (the perinuclear region, a white ellipse):
        // cover path_2_, the cell cortex, and the perinuclear region, while remaining below the cytoskeleton, nucleus, and
        // other organelles. If SL0198 is not found, fall back to immediately after path_2_.
        const anchor = findSvgNodeById("SL0198") || base;
    
        anchor.parentNode.insertBefore(overlay, anchor.nextSibling);
    }
    
    // ================================================================
    // SVG GLOW
    // ================================================================    
    function setIntroGlow(target, enabled) {
    
        const nodes = resolveSvgNodes(target);
    
        // Cytoplasm / Cytosol: fill only, without an outline glow
        // (the outline glow would fall on the path_2_ boundary and look like the cell membrane).
        if (nodes.some(isInteriorNode)) {
            setInteriorOverlay("intro", enabled);
        }
    
        nodes
            .filter(node => !isInteriorNode(node))
            .forEach(node => {
    
                node.classList.toggle("sl-glow-strong", enabled);
                node.classList.toggle("sl-glow-pulse", enabled);
                node.classList.toggle("sl-glow-soft", enabled);
            });
    }


    function installSvgHoverStyles() {
        if (!state.svgRoot || state.svgRoot.querySelector("#ukw-go-hover-style")) return;
        const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.setAttribute("id", "ukw-go-hover-style");
        style.textContent = `
            .ukw-go-shape-highlight {
                stroke: #ff3b30 !important;
                stroke-width: 3.2 !important;
                filter: drop-shadow(0 0 3px rgba(255, 59, 48, 0.95)) !important;
                vector-effect: non-scaling-stroke;
            }
            /* Cytoplasm/Cytosol share the cell-interior silhouette in Animal_cells.svg.
               Fill that silhouette so the highlight is not mistaken for the membrane. */
            
            }
        `;
        state.svgRoot.insertBefore(style, state.svgRoot.firstChild);
    }

    // Return actual drawable SVG elements belonging to this SL group and its
    // nested SL groups. This avoids relying on inherited group CSS to highlight
    // the Cytoplasm parent, whose visible silhouette is drawn by child SL0091.
    function getDrawableElements(node) {
        if (!node) return [];
        const shapeSelector = "path, ellipse, polygon, rect, circle, polyline, line, image, use";
        const found = [];

        function walk(parent) {
            for (const child of Array.from(parent.children || [])) {
                if (child.matches && child.matches(shapeSelector)) {
                    found.push(child);
                    continue;
                }
                // A nested SL group is a separate semantic location. Do not
                // accidentally highlight its shapes unless that SL group was
                // independently selected by expandForVisibleGeometry().
                if (child.tagName && child.tagName.toLowerCase() === "g" &&
                    child.classList && child.classList.contains("subcellular_location")) {
                    continue;
                }
                if (child.children && child.children.length) walk(child);
            }
        }

        walk(node);
        return found;
    }

    
    function setGlow(target, enabled) {
    
        const requestedNodes = resolveSvgNodes(target);
    
        if (requestedNodes.some(isInteriorNode)) {
            setInteriorOverlay("hover", enabled);
        }
    
        const others = requestedNodes.filter(node => !isInteriorNode(node));
    
        const nodes = uniqueNodes(
            others.flatMap(node => expandForVisibleGeometry([node]))
        );
    
        const shapes = uniqueNodes(nodes.flatMap(getDrawableElements));
    
        nodes.forEach(node => {
            node.classList.toggle("explorer-hover", enabled);
            node.classList.toggle("sl-hover", enabled);
            node.classList.toggle("ukw-go-highlight", enabled);
        });
    
        // [FIX] This previously called shape.classList.toggle("coloured", ...),
        // which permanently removed the "coloured" class already present in the SVG when turned off. Removed.
        shapes.forEach(shape => {
            shape.classList.toggle("ukw-go-shape-highlight", enabled);
        });
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
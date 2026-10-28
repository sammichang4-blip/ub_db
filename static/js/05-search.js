// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 05. Search, result list, protein loading
// ============================================================

// ============================================================
// Global state
// ============================================================

// Search / protein
window.currentProteinId = window.currentProteinId || null;
window.currentData = window.currentData || null;
window.currentProtein = window.currentProtein || null;
window.currentDomains = window.currentDomains || [];

// ============================================================
// Enzyme class state
// ============================================================

// Complete enzyme class data returned by the API,
// for example, all E3 enzymes.
window.currentEnzymeClass = null;
window.currentEnzymeData = [];

// Data currently displayed on screen.
window.currentDisplayedData = [];

// Subfamily filter
window.currentSubfamilyFilter = null;

// No PDB filter
window.currentNoPDBFilter = false;

// ============================================================
// Search
// ============================================================
async function doSearch(q) {

    q = String(q || "").trim();
    currentSearchKeyword = q.trim();

    console.log("Search:", q);

    if (!q) {
        return;
    }

    try {

        const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}`
        );

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        // Clear enzyme filter state when searching.
        window.currentEnzymeClass = null;
        window.currentEnzymeData = [];
        window.currentDisplayedData = [];

        window.currentSubfamilyFilter = null;
        window.currentNoPDBFilter = false;

        renderResults(data, q);

        if (data.length > 0) {

            await loadProtein(data[0].protein_id);

        } else if (detailPane) {

            detailPane.innerHTML = `
                <div class="empty-state">
                    <p>
                        No proteins found matching "${escapeHtml(q)}".
                    </p>
                </div>
            `;
        }

    }
    catch (error) {

        console.error("Search failed:", error);

        if (detailPane) {

            detailPane.innerHTML = `
                <div class="empty-state">
                    <p>
                        Search failed:
                        ${escapeHtml(error.message)}
                    </p>
                </div>
            `;
        }
    }
}

// ============================================================
// Search highlight
// ============================================================

function highlightSearch(text, keyword) {

    text = String(text || "");
    keyword = String(keyword || "").trim();

    if (!keyword) {
        return escapeHtml(text);
    }

    const safeText = escapeHtml(text);

    const safeKeyword =
        keyword.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    const regex =
        new RegExp(`(${safeKeyword})`, "gi");

    return safeText.replace(
        regex,
        `<mark class="search-highlight">$1</mark>`
    );
}

// ============================================================
// Render search results
// ============================================================
function renderResults(items, keyword = "") {
    if (!resultsList) {
        return;
    }

    const title = document.querySelector(".pane-title");

    if (title) {
        title.textContent = "";
    }

    // --------------------------------------------------------
    // Clear the subfamily filter.
    // --------------------------------------------------------

    const filterBar = document.getElementById("subfamily-filters");

    if (filterBar) {

        filterBar.innerHTML = "";
        filterBar.style.display = "none";
    }

    // --------------------------------------------------------
    // Clear previous search results.
    // --------------------------------------------------------
    resultsList.innerHTML = "";

    if (!Array.isArray(items)) {
        return;
    }

    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------
    items.forEach(item => {
        const li = document.createElement("li");

        li.className = "result-item";

        li.dataset.proteinId = item.protein_id;

        if (
            item.protein_id === currentProteinId
        ) {
            li.classList.add("active");
        }

        li.innerHTML = `
            <div class="gene">
                ${highlightSearch(
                    item.gene_name ||
                    item.uniprot_acc ||
                    "",
                    keyword
                )}
            </div>

            <div class="name">
                ${highlightSearch(
                    item.protein_name || "",
                    keyword
                )}
            </div>
        `;

        li.addEventListener(
            "click",
            () => {
                loadProtein(item.protein_id);
            }
        );

        resultsList.appendChild(li);
    });
}

// ============================================================
// Update active result
// ============================================================
function updateActiveResult() {

    if (!resultsList) {
        return;
    }

    document
        .querySelectorAll(".result-item")
        .forEach(el => {

            const isCurrent =
                el.dataset.proteinId ===
                currentProteinId;

            el.classList.toggle(
                "active",
                isCurrent
            );
        });
}

// ============================================================
// Load single protein
// ============================================================

async function loadProtein(proteinId) {

    if (!proteinId) {
        return;
    }

    console.log(
        "Loading protein:",
        proteinId
    );

    currentProteinId = proteinId;

    // --------------------------------------------------------
    // Update the active item on the left.
    // --------------------------------------------------------

    document
        .querySelectorAll(".result-item")
        .forEach(el => {

            el.classList.remove("active");

        });


    const activeItem =
        document.querySelector(
            `.result-item[data-protein-id="${CSS.escape(proteinId)}"]`
        );

    if (activeItem) {
        activeItem.classList.add("active");
    }

    try {

        const res =
            await fetch(
                `/api/protein/${encodeURIComponent(proteinId)}`
            );

        if (!res.ok) {
            throw new Error(
                `HTTP ${res.status}`
            );
        }

        const data = await res.json();

        // ----------------------------------------------------
        // Store the current protein data.
        // ----------------------------------------------------

        currentData = data;

        currentProtein = data.protein;

        currentDomains = data.domains || [];

        // ----------------------------------------------------
        // Render detail
        // ----------------------------------------------------

        renderDetail(data);

        // ----------------------------------------------------
        // Cell GO
        // ----------------------------------------------------

        const cellGoPanel =
            document.getElementById(
                `cellgo-panel-${data.protein.protein_id}`
            );

        if (cellGoPanel) {

            initCellGoView(
                cellGoPanel,
                data.protein.protein_id
            );
        }

    }
    catch (error) {

        console.error(
            "Load protein failed:",
            error
        );

        if (detailPane) {

            detailPane.innerHTML = `
                <div class="empty-state">
                    <p>
                        Failed to load:
                        ${escapeHtml(error.message)}
                    </p>
                </div>
            `;
        }
    }
}

// ============================================================
// Load enzyme class
// ============================================================
//
// currentEnzymeData always stores the complete class.
//
// For example:
// E3 API → currentEnzymeData = all E3 enzymes.
//
// Filtering later never modifies currentEnzymeData.
// ============================================================

async function loadProteinClass(enzymeClass) {

    try {

        console.log(
            "Loading enzyme class:",
            enzymeClass
        );

        const res =
            await fetch(
                `/api/enzyme/${encodeURIComponent(enzymeClass)}`
            );

        if (!res.ok) {
            throw new Error(
                `HTTP ${res.status}`
            );
        }

        const data = await res.json();


        if (!resultsList) {
            return;
        }

        // ----------------------------------------------------
        // Store the complete data.
        // ----------------------------------------------------

        window.currentEnzymeClass = enzymeClass;

        window.currentEnzymeData =
            Array.isArray(data)
                ? data
                : [];

        // ----------------------------------------------------
        // Reset filters
        // ----------------------------------------------------

        window.currentSubfamilyFilter = null;

        window.currentNoPDBFilter = false;

        // ----------------------------------------------------
        // Display all data for now.
        // ----------------------------------------------------

        window.currentDisplayedData = window.currentEnzymeData;

        // ----------------------------------------------------
        // Title
        // ----------------------------------------------------

        const title =
            document.querySelector(
                ".pane-title"
            );

        if (title) {

            title.innerHTML =
                `${escapeHtml(enzymeClass)} ` +
                `(${window.currentEnzymeData.length})`;
        }
        // ----------------------------------------------------
        // Render subfamily
        // ----------------------------------------------------

        renderSubfamilyFilters(
            enzymeClass,
            window.currentEnzymeData
        );

        // ----------------------------------------------------
        // Render list
        // ----------------------------------------------------

        renderEnzymeList(
            window.currentEnzymeData
        );

        // ----------------------------------------------------
        // Load first protein
        // ----------------------------------------------------

        if (
            window.currentEnzymeData.length > 0
        ) {

            await loadProtein(
                window.currentEnzymeData[0].protein_id
            );
        }

    }
    catch (error) {

        console.error(
            "Load enzyme class failed:",
            error
        );
    }
}

// ============================================================
// Get current filtered data
// ============================================================
//
// All filters are centralized here.
//
// currentEnzymeData
//        ↓
//     No PDB
//        ↓
//   Subfamily
//        ↓
// currentDisplayedData
// ============================================================

function getCurrentFilteredData() {

    let data =
        Array.isArray(window.currentEnzymeData)
            ? window.currentEnzymeData
            : [];

    // --------------------------------------------------------
    // No PDB
    // --------------------------------------------------------

    if (
        window.currentNoPDBFilter
    ) {

        data =
            data.filter(
                p => Number(p.has_pdb) === 0
            );
    }

    // --------------------------------------------------------
    // Subfamily
    // --------------------------------------------------------

    if (
        window.currentSubfamilyFilter
    ) {

        data =
            data.filter(
                p =>
                    p.enzyme_subfamily ===
                    window.currentSubfamilyFilter
            );
    }

    // --------------------------------------------------------
    // Store the data currently displayed.
    // --------------------------------------------------------

    window.currentDisplayedData =
        data;


    return data;
}

// ============================================================
// Render Subfamily filters
// ============================================================
//
// Show the subfamily filter only for E3 / DUB.
//
// Normal mode:
//     Use the complete enzyme class data.
//
// No-PDB mode:
//     Use only data where has_pdb = 0.
//
// Therefore, subfamilies with no No-PDB results are not shown.
// ============================================================

function renderSubfamilyFilters(
    enzymeClass,
    data
) {

    let filterBar =
        document.getElementById(
            "subfamily-filters"
        );

    // --------------------------------------------------------
    // Create it if it does not exist.
    // --------------------------------------------------------

    if (!filterBar) {

        filterBar =  document.createElement("div");

        filterBar.id = "subfamily-filters";

        const title =
            document.querySelector(
                ".pane-title"
            );

        if (
            title &&
            title.parentElement
        ) {

            title.parentElement.insertBefore(
                filterBar,
                title.nextSibling
            );
        }
    }

    // --------------------------------------------------------
    // Show only for E3 / DUB.
    // --------------------------------------------------------

    const showFilters =
        enzymeClass === "E3" ||
        enzymeClass === "DUB";


    if (!showFilters) {

        filterBar.style.display =
            "none";

        filterBar.innerHTML = "";

        return;
    }

    // ========================================================
    // Important:
    //
    // Do not use the complete class data in No-PDB mode.
    //
    // Even if the caller passes full data,
    // ensure here that only No-PDB entries remain.
    // ========================================================

    let filterData =
        Array.isArray(data)
            ? [...data]
            : [];

    if (window.currentNoPDBFilter) {

        filterData =
            filterData.filter(
                p => Number(p.has_pdb) === 0
            );
    }

    // --------------------------------------------------------
    // Build the subfamily list.
    // --------------------------------------------------------

    const subfamilies =
        Array.from(
            new Set(
                filterData
                    .map(
                        p =>
                            p.enzyme_subfamily
                    )
                    .filter(
                        s =>
                            s &&
                            String(s).trim() !== ""
                    )
            )
        )
        .sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    "en",
                    {
                        numeric: true
                    }
                )
        );

    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------

    filterBar.style.display = "block";

    filterBar.innerHTML = "";


    const label = document.createElement("div");

    label.className = "filter-label";

    label.textContent = "Subfamily";


    const select = document.createElement("select");

    select.className = "subfamily-select";

    // --------------------------------------------------------
    // All
    // --------------------------------------------------------

    const allOption = document.createElement("option");

    allOption.value = "";

    allOption.textContent = "All";

    select.appendChild(
        allOption
    );

    // --------------------------------------------------------
    // Subfamilies
    // --------------------------------------------------------

    subfamilies.forEach(
        sf => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = sf;

            option.textContent = sf;

            select.appendChild(
                option
            );
        }
    );

    // --------------------------------------------------------
    // Keep the current selection.
    // --------------------------------------------------------

    select.value = window.currentSubfamilyFilter || "";

    // --------------------------------------------------------
    // Change
    // --------------------------------------------------------

    select.addEventListener(
        "change",
        function () {

            filterBySubfamily(
                this.value || null
            );
        }
    );


    filterBar.appendChild(
        label
    );

    filterBar.appendChild(
        select
    );
}

// ============================================================
// Load enzyme class - No PDB
// ============================================================

async function loadProteinClassNoPDB(enzymeClass) {

    console.log(
        "Loading No-PDB:",
        enzymeClass
    );

    try {

        let data;

        // ====================================================
        // 1. Use the complete class data already loaded.
        // ====================================================

        if (
            window.currentEnzymeClass === enzymeClass &&
            Array.isArray(window.currentEnzymeData) &&
            window.currentEnzymeData.length > 0
        ) {

            console.log(
                "Using existing enzyme data:",
                enzymeClass
            );

            data =
                window.currentEnzymeData;
        }

        // ====================================================
        // 2. If this class has not been loaded yet, request it from the API.
        // ====================================================

        else {

            console.log(
                "Fetching enzyme data for No-PDB:",
                enzymeClass
            );

            const res =
                await fetch(
                    `/api/enzyme/${encodeURIComponent(enzymeClass)}`
                );

            if (!res.ok) {

                throw new Error(
                    `HTTP ${res.status}`
                );
            }

            data = await res.json();

            if (!Array.isArray(data)) {
                data = [];
            }

            // ------------------------------------------------
            // Store the complete class data.
            // ------------------------------------------------

            window.currentEnzymeClass = enzymeClass;

            window.currentEnzymeData = data;
        }

        // ====================================================
        // 3. Set filter state.
        // ====================================================

        window.currentNoPDBFilter = true;

        window.currentSubfamilyFilter = null;

        // ====================================================
        // 4. Get the No-PDB data.
        // ====================================================

        const filtered =
            data.filter(
                p => Number(p.has_pdb) === 0
            );

        // ====================================================
        // 5. Store the data currently displayed.
        // ====================================================

        window.currentDisplayedData = filtered;

        // ====================================================
        // 6. Title
        // ====================================================

        const title =
            document.querySelector(
                ".pane-title"
            );

        if (title) {

            title.innerHTML =
                `${escapeHtml(enzymeClass)} ` +
                `No Experimental PDB (${filtered.length})`;
        }

        // ====================================================
        // 7. Subfamily
        //
        // Use only No-PDB data.
        // ====================================================

        renderSubfamilyFilters(
            enzymeClass,
            filtered
        );

        // ====================================================
        // 8. Render
        // ====================================================

        renderEnzymeList(
            filtered
        );

        // ====================================================
        // 9. Load first protein
        // ====================================================

        if (filtered.length > 0) {

            await loadProtein(
                filtered[0].protein_id
            );
        }

    }
    catch (error) {

        console.error(
            "Load No-PDB enzyme class failed:",
            error
        );
    }
}

// ============================================================
// Filter by Subfamily
// ============================================================
//
// Do not call the API again.
// Do not filter currentEnzymeData directly.
// Always use getCurrentFilteredData().
//
// As a result:
//
// E3
// ↓
// No PDB
// ↓
// TRIM
//
// This returns:
//
// E3 ∩ No PDB ∩ TRIM
// ============================================================

function filterBySubfamily(
    encodedSubfamily
) {

    // --------------------------------------------------------
    // Set the subfamily.
    // --------------------------------------------------------

    window.currentSubfamilyFilter =
        encodedSubfamily === null
            ? null
            : decodeURIComponent(
                encodedSubfamily
            );

    // --------------------------------------------------------
    // Get the intersection of all filters.
    // --------------------------------------------------------

    const filtered = getCurrentFilteredData();

    // --------------------------------------------------------
    // Update the subfamily selector.
    // --------------------------------------------------------

    renderSubfamilyFilters(
        window.currentEnzymeClass,
        window.currentEnzymeData
    );

    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------

    renderEnzymeList(
        filtered
    );

    // --------------------------------------------------------
    // Title
    // --------------------------------------------------------

    const title =
        document.querySelector(
            ".pane-title"
        );

    if (title) {

        let titleText =
            escapeHtml(
                window.currentEnzymeClass
            );

        if (
            window.currentNoPDBFilter
        ) {

            titleText +=  " No PDB";
        }


        titleText += ` (${filtered.length})`;


        title.innerHTML = titleText;
    }

    // --------------------------------------------------------
    // If the current protein is not in the filtered results,
    // load the first one.
    // --------------------------------------------------------

    if (filtered.length > 0) {

        const currentExists =
            filtered.some(
                p =>
                    p.protein_id ===
                    window.currentProteinId
            );


        if (!currentExists) {

            loadProtein(
                filtered[0].protein_id
            );
        }
    }
}

// ============================================================
// Render enzyme list
// ============================================================

function renderEnzymeList(data) {

    if (!resultsList) {
        return;
    }

    resultsList.innerHTML = "";

    if (!Array.isArray(data)) {
        return;
    }

    data.forEach(p => {

        const li = document.createElement("li");

        li.className = "result-item";

        li.dataset.proteinId =  p.protein_id;

        // ----------------------------------------------------
        // Active
        // ----------------------------------------------------

        if (
            p.protein_id === window.currentProteinId
        ) {

            li.classList.add(
                "active"
            );
        }

        // ----------------------------------------------------
        // HTML
        // ----------------------------------------------------

        li.innerHTML = `
            <div class="gene">
                ${escapeHtml(
                    p.gene_name || ""
                )}
            </div>

            <div class="name">
                ${escapeHtml(
                    p.protein_name || ""
                )}
            </div>

            <div class="name">
                ${escapeHtml(
                    p.uniprot_acc || ""
                )}
            </div>

            <div class="name">
                ${escapeHtml(
                    p.enzyme_subfamily || ""
                )}
            </div>
        `;

        // ----------------------------------------------------
        // Click
        // ----------------------------------------------------

        li.addEventListener(
            "click",
            () => {

                loadProtein(
                    p.protein_id
                );
            }
        );

        resultsList.appendChild(
            li
        );
    });
}

// ============================================================
// Export functions
// ============================================================

window.loadProtein = loadProtein;

window.loadProteinClass =  loadProteinClass;

window.loadProteinClassNoPDB = loadProteinClassNoPDB;

window.filterBySubfamily = filterBySubfamily;

window.renderEnzymeList =renderEnzymeList;

window.renderSubfamilyFilters = renderSubfamilyFilters;
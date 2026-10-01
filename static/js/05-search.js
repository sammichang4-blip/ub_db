// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 05. Search, result list, protein loading
// ============================================================


// ============================================================
// Global state
// ============================================================

// 搜尋 / Protein
window.currentProteinId = window.currentProteinId || null;
window.currentData = window.currentData || null;
window.currentProtein = window.currentProtein || null;
window.currentDomains = window.currentDomains || [];


// ============================================================
// Enzyme class state
// ============================================================

// API 回來的「完整 enzyme class 資料」
// 例如：全部 E3
window.currentEnzymeClass = null;
window.currentEnzymeData = [];

// 目前實際顯示在畫面的資料
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

        // 搜尋時清除 enzyme filter 狀態
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
                        找不到符合「${escapeHtml(q)}」的蛋白質。
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
                        搜尋失敗：
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

    const title =
        document.querySelector(".pane-title");

    if (title) {
        title.textContent = "";
    }


    // --------------------------------------------------------
    // 清掉 subfamily filter
    // --------------------------------------------------------

    const filterBar =
        document.getElementById("subfamily-filters");

    if (filterBar) {

        filterBar.innerHTML = "";
        filterBar.style.display = "none";
    }


    // --------------------------------------------------------
    // 清掉舊搜尋結果
    // --------------------------------------------------------

    resultsList.innerHTML = "";


    if (!Array.isArray(items)) {
        return;
    }


    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------

    items.forEach(item => {

        const li =
            document.createElement("li");

        li.className = "result-item";

        li.dataset.proteinId =
            item.protein_id;


        if (
            item.protein_id ===
            currentProteinId
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
    // 更新左側 active
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


        const data =
            await res.json();


        // ----------------------------------------------------
        // 儲存目前 protein data
        // ----------------------------------------------------

        currentData = data;

        currentProtein =
            data.protein;

        currentDomains =
            data.domains || [];


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
                        載入失敗：
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
// currentEnzymeData 永遠保存「完整 class」
//
// 例如：
// E3 API → currentEnzymeData = 全部 E3
//
// 不論後面怎麼 filter，都不修改 currentEnzymeData。
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


        const data =
            await res.json();


        if (!resultsList) {
            return;
        }


        // ----------------------------------------------------
        // 保存完整資料
        // ----------------------------------------------------

        window.currentEnzymeClass =
            enzymeClass;

        window.currentEnzymeData =
            Array.isArray(data)
                ? data
                : [];


        // ----------------------------------------------------
        // Reset filters
        // ----------------------------------------------------

        window.currentSubfamilyFilter =
            null;

        window.currentNoPDBFilter =
            false;


        // ----------------------------------------------------
        // 目前顯示資料 = 全部
        // ----------------------------------------------------

        window.currentDisplayedData =
            window.currentEnzymeData;


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
// 所有 filter 都集中在這裡。
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
    // 保存目前顯示資料
    // --------------------------------------------------------

    window.currentDisplayedData =
        data;


    return data;
}


// ============================================================
// Render Subfamily filters
// ============================================================
//
// 只有 E3 / DUB 顯示 subfamily filter
//
// 注意：
// 這裡使用「完整 enzyme class data」建立 subfamily。
// 不使用 filtered data。
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
    // 如果不存在就建立
    // --------------------------------------------------------

    if (!filterBar) {

        filterBar =
            document.createElement("div");

        filterBar.id =
            "subfamily-filters";


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
    // 只有 E3 / DUB 顯示
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


    // --------------------------------------------------------
    // 建立 subfamily list
    // --------------------------------------------------------

    const subfamilies =
        Array.from(
            new Set(
                data
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

    filterBar.style.display =
        "block";

    filterBar.innerHTML = "";


    const label =
        document.createElement("div");

    label.className =
        "filter-label";

    label.textContent =
        "Subfamily";


    const select =
        document.createElement("select");

    select.className =
        "subfamily-select";


    // --------------------------------------------------------
    // All
    // --------------------------------------------------------

    const allOption =
        document.createElement("option");

    allOption.value = "";

    allOption.textContent =
        "全部";

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

            option.value =
                sf;

            option.textContent =
                sf;

            select.appendChild(
                option
            );
        }
    );


    // --------------------------------------------------------
    // 保留目前選擇
    // --------------------------------------------------------

    select.value =
        window.currentSubfamilyFilter || "";


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


    filterBar.appendChild(label);

    filterBar.appendChild(select);
}


// ============================================================
// Load enzyme class - No PDB
// ============================================================
//
// 不重新打 API。
// 如果目前不是該 class，才先 load class。
//
// 然後：
// currentEnzymeData
//        ↓
// has_pdb = 0
//        ↓
// render
// ============================================================

async function loadProteinClassNoPDB(enzymeClass) {

    console.log("Loading No-PDB:", enzymeClass);

    try {

        let data;


        // ====================================================
        // 1. 如果目前已經是同一個 enzyme class
        //    直接使用現有完整資料
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

            data = window.currentEnzymeData;

        }

        // ====================================================
        // 2. 如果目前沒有這個 class
        //    直接 API
        //
        //    注意：
        //    這裡「不要」呼叫 loadProteinClass()
        //    因為 loadProteinClass() 會先 render 全部資料
        // ====================================================

        else {

            console.log(
                "Fetching enzyme data for No-PDB:",
                enzymeClass
            );

            const res = await fetch(
                `/api/enzyme/${encodeURIComponent(enzymeClass)}`
            );

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            data = await res.json();

            if (!Array.isArray(data)) {
                data = [];
            }


            // ------------------------------------------------
            // 保存完整 class data
            // ------------------------------------------------

            window.currentEnzymeClass =
                enzymeClass;

            window.currentEnzymeData =
                data;
        }


        // ====================================================
        // 3. 設定 filter
        // ====================================================

        window.currentNoPDBFilter = true;

        window.currentSubfamilyFilter = null;


        // ====================================================
        // 4. 直接從完整資料取得 No-PDB
        // ====================================================

        const filtered =
            data.filter(
                p => Number(p.has_pdb) === 0
            );


        // ====================================================
        // 5. 更新目前顯示資料
        // ====================================================

        window.currentDisplayedData =
            filtered;


        // ====================================================
        // 6. 更新 title
        // ====================================================

        const title =
            document.querySelector(".pane-title");

        if (title) {

            title.innerHTML =
                `${escapeHtml(enzymeClass)} 無PDB (${filtered.length})`;
        }


        // ====================================================
        // 7. Subfamily filter
        //
        // 使用完整 class data 建立選單
        // ====================================================

        renderSubfamilyFilters(
            enzymeClass,
            window.currentEnzymeData
        );


        // ====================================================
        // 8. 直接 render No-PDB
        //
        // 這裡是第一次 render
        // 所以不會先出現全部 E3
        // ====================================================

        renderEnzymeList(
            filtered
        );


        // ====================================================
        // 9. Load 第一個 No-PDB protein
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
// 不重新打 API。
// 不直接從 currentEnzymeData 自己 filter。
// 一律透過 getCurrentFilteredData()。
//
// 因此：
//
// E3
// ↓
// No PDB
// ↓
// TRIM
//
// 會得到：
//
// E3 ∩ No PDB ∩ TRIM
// ============================================================

function filterBySubfamily(
    encodedSubfamily
) {

    // --------------------------------------------------------
    // 設定 subfamily
    // --------------------------------------------------------

    window.currentSubfamilyFilter =
        encodedSubfamily === null
            ? null
            : decodeURIComponent(
                encodedSubfamily
            );


    // --------------------------------------------------------
    // 取得所有 filter 的交集
    // --------------------------------------------------------

    const filtered =
        getCurrentFilteredData();


    // --------------------------------------------------------
    // 更新 subfamily select
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

            titleText +=
                " 無PDB";
        }


        titleText +=
            ` (${filtered.length})`;


        title.innerHTML =
            titleText;
    }


    // --------------------------------------------------------
    // 如果目前蛋白不在 filtered 裡
    // 就載入第一個
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

        const li =
            document.createElement("li");


        li.className =
            "result-item";


        li.dataset.proteinId =
            p.protein_id;


        // ----------------------------------------------------
        // Active
        // ----------------------------------------------------

        if (
            p.protein_id ===
            window.currentProteinId
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



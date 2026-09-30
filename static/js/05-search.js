// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 05. Search, result list, protein loading
// ============================================================

async function doSearch(q) {
    q = String(q || "").trim();
    console.log("Search:", q);

    if (!q) {
        return;
    }

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        renderResults(data, q);

        if (data.length > 0) {
            await loadProtein(data[0].protein_id);
        }
        else if (detailPane) {
            detailPane.innerHTML = `
                <div class="empty-state">
                    <p>找不到符合「${escapeHtml(q)}」的蛋白質。</p>
                </div>
            `;
        }
    }
    catch (error) {
        console.error("Search failed:", error);

        if (detailPane) {
            detailPane.innerHTML = `
                <div class="empty-state">
                    <p>搜尋失敗：${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }
}

function highlightSearch(text, keyword) {
    text = String(text || "");
    keyword = String(keyword || "").trim();

    if (!keyword) {
        return escapeHtml(text);
    }

    const safeText = escapeHtml(text);
    const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(`(${safeKeyword})`, "gi");

    return safeText.replace(
        regex,
        `<mark class="search-highlight">$1</mark>`
    );
}

function renderResults(items, keyword = "") {
    if (!resultsList) {
        return;
    }
    document.querySelector(".pane-title").textContent = "";

    // 清掉上一次的左側子家族按鈕
    if (subfamilyFilters) {
        subfamilyFilters.innerHTML = "";
        subfamilyFilters.style.display = "none";
    }

    // 清掉搜尋結果（避免等待 API 時看到舊資料）
    if (resultsList) {
        resultsList.innerHTML = "";
    }

    if (!Array.isArray(items)) {
        return;
    }

    items.forEach(item => {
        const li = document.createElement("li");
        li.className = "result-item";

        if (item.protein_id === currentProteinId) {
            li.classList.add("active");
        }

        li.innerHTML = `
            <div class="gene">
                ${highlightSearch(
                    item.gene_name || item.uniprot_acc || "",
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


        li.addEventListener("click", () => {
            loadProtein(item.protein_id);
        });

        resultsList.appendChild(li);
    });
}

function updateActiveResult() {
    if (!resultsList) {
        return;
    }

    document.querySelectorAll(".result-item").forEach(el => {
        const isCurrent = el.dataset.proteinId === currentProteinId;
        el.classList.toggle("active", isCurrent);
    });
}

async function loadProtein(proteinId) {
    if (!proteinId) {
        return;
    }

    console.log("Loading protein:", proteinId);

    currentProteinId = proteinId;

    document.querySelectorAll(".result-item").forEach(el => {
        el.classList.remove("active");
    });

    try {
        const res = await fetch(`/api/protein/${encodeURIComponent(proteinId)}`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        currentData = data;
        currentProtein = data.protein;
        currentDomains = data.domains || [];
        
        renderDetail(data);
        initCellGoView(document.getElementById(`cellgo-panel-${data.protein.protein_id}`), 
        
        data.protein.protein_id      
        );  // <-- 加在這裡
        }
    catch (error) {
        console.error("Load protein failed:", error);

        if (detailPane) {
            detailPane.innerHTML = `
                <div class="empty-state">
                    <p>載入失敗：${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }
}

// 記住最近一次載入的整批資料，篩選 subfamily 時直接用這份、不用重打 API
window.currentEnzymeClass = null;
window.currentEnzymeData = [];
window.currentSubfamilyFilter = null;

async function loadProteinClass(enzymeClass) {
    try {
        const res = await fetch(`/api/enzyme/${encodeURIComponent(enzymeClass)}`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!resultsList) {
            return;
        }

        window.currentEnzymeClass = enzymeClass;
        window.currentEnzymeData = data;
        window.currentSubfamilyFilter = null; // 每次重新選 class 都重置篩選

        const title = document.querySelector(".pane-title");

        if (title) {
            title.innerHTML = `${escapeHtml(enzymeClass)} (${data.length})`;
        }

        renderSubfamilyFilters(enzymeClass, data);
        renderEnzymeList(data);
        if (data.length > 0) {
            await loadProtein(data[0].protein_id);
        }
    }
    catch (error) {
        console.error("Load enzyme class failed:", error);
    }
}

// ============================================================
// Subfamily 篩選按鈕：只有 E3 / DUB 顯示
// ============================================================
function renderSubfamilyFilters(enzymeClass, data) {

    let filterBar = document.getElementById("subfamily-filters");

    if (!filterBar) {
        filterBar = document.createElement("div");
        filterBar.id = "subfamily-filters";

        const title = document.querySelector(".pane-title");

        if (title && title.parentElement) {
            title.parentElement.insertBefore(filterBar, title.nextSibling);
        }
    }

    const showFilters = enzymeClass === "E3" || enzymeClass === "DUB";

    if (!showFilters) {
        filterBar.style.display = "none";
        filterBar.innerHTML = "";
        return;
    }

    const subfamilies = Array.from(
        new Set(
            data
                .map(p => p.enzyme_subfamily)
                .filter(s => s && s.trim() !== "")
        )
    ).sort((a,b)=>a.localeCompare(b,"en",{numeric:true}));

    filterBar.style.display = "block";
    filterBar.innerHTML = "";

    const label = document.createElement("div");
    label.className = "filter-label";
    label.textContent = "Subfamily";

    const select = document.createElement("select");
    select.className = "subfamily-select";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "全部";
    select.appendChild(allOption);

    subfamilies.forEach(sf => {
        const option = document.createElement("option");
        option.value = sf;
        option.textContent = sf;
        select.appendChild(option);
    });

    select.value = window.currentSubfamilyFilter || "";

    select.addEventListener("change", function () {
        filterBySubfamily(this.value || null);
    });

    filterBar.appendChild(label);
    filterBar.appendChild(select);
}

// ============================================================
// Select No Exp PDB structuresub family Button
// ============================================================
async function loadProteinClassNoPDB(enzymeClass) {

    await loadProteinClass(enzymeClass);

    const filtered = window.currentEnzymeData.filter(
        p => Number(p.has_pdb) === 0
    );

    renderEnzymeList(filtered);
    if (filtered.length > 0) {
        await loadProtein(filtered[0].protein_id);
    }

    const title = document.querySelector(".pane-title");

    if (title) {
        title.innerHTML = `${enzymeClass} 無PDB (${filtered.length})`;
    }

    // 保留目前篩選資料
    window.currentEnzymeData = filtered;

    renderSubfamilyFilters(enzymeClass, filtered);
}

// ============================================================
// 點擊 subfamily 按鈕 → 前端過濾，不重打 API
// ============================================================
function filterBySubfamily(encodedSubfamily) {

    window.currentSubfamilyFilter =
        encodedSubfamily === null ? null : decodeURIComponent(encodedSubfamily);

    // 重新畫按鈕（更新 active 狀態）
    renderSubfamilyFilters(window.currentEnzymeClass, window.currentEnzymeData);

    const filtered = window.currentSubfamilyFilter
        ? window.currentEnzymeData.filter(
              p => p.enzyme_subfamily === window.currentSubfamilyFilter
          )
        : window.currentEnzymeData;

    renderEnzymeList(filtered);


    const title = document.querySelector(".pane-title");

    if (title) {
        title.innerHTML = `${escapeHtml(window.currentEnzymeClass)} (${filtered.length})`;
    }
}

// ============================================================
// 清單渲染（從原本 forEach 抽出來，篩選/初次載入都共用）
// ============================================================
function renderEnzymeList(data) {

    resultsList.innerHTML = "";

    data.forEach(p => {
        const li = document.createElement("li");
        li.className = "result-item";
        li.dataset.proteinId = p.protein_id;

        li.innerHTML = `
            <div class="gene">${escapeHtml(p.gene_name || "")}</div>
            <div class="name">${escapeHtml(p.protein_name || "")}</div>
            <div class="name">${escapeHtml(p.uniprot_acc || "")}</div>
            <div class="name">${escapeHtml(p.enzyme_subfamily || "")}</div>
        `;

        li.addEventListener("click", () => {
            loadProtein(p.protein_id);
        });

        resultsList.appendChild(li);
    });
}

window.loadProtein = loadProtein;
window.loadProteinClass = loadProteinClass;

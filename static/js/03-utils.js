// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 03. Utilities: DOM caching, HTML escaping, copy toast
// ============================================================

function cacheDOM() {
    resultsList = document.getElementById("resultsList");
    detailPane = document.getElementById("detailPane");
    subfamilyFilters = document.getElementById("subfamily-filters");
    searchForm = document.getElementById("searchForm");
    searchInput = document.getElementById("searchInput");
}

function escapeHtml(str) {
    if (str === null || str === undefined) {
        return "";
    }
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showCopyMessage(msg) {
    let box = document.querySelector(".copy-message");

    if (!box) {
        box = document.createElement("div");
        box.className = "copy-message";
        document.body.appendChild(box);
    }

    box.innerText = msg;
    box.style.opacity = "1";

    setTimeout(() => {
        box.style.opacity = "0";
    }, 1500);
}

function openProteinTabView(tabId, proteinId = null) {
    if (window.CELL_PROTEIN_ID && typeof window.switchCellGoTab === "function") {
        window.switchCellGoTab(tabId);
        return;
    }

    const protein = window.currentProtein
        || (typeof currentProtein !== "undefined" ? currentProtein : null);
    const id = proteinId
        || window.CELL_PROTEIN_ID
        || (protein && (protein.protein_id || protein.uniprot_acc));

    if (!id) {
        console.error(`Cannot open tab ${tabId}: protein ID is missing.`);
        return;
    }

    const targetUrl = new URL(
        `/protein/${encodeURIComponent(id)}/cell-view`,
        window.location.origin
    );
    targetUrl.searchParams.set("tab", tabId);

    const selectedStructure = typeof currentPdbUrl !== "undefined"
        ? currentPdbUrl
        : null;
    if (selectedStructure && ["domain", "pdbviewer"].includes(tabId)) {
        targetUrl.searchParams.set("structure", selectedStructure);
    }

    const url = targetUrl.href;
    window.open(url, "_blank", "width=1500,height=950,scrollbars=yes,resizable=yes");
}

window.openProteinTabView = openProteinTabView;

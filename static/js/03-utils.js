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

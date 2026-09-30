// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 10. Entry point — wires up the search form and boots the app
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
    console.log("===== UKW JS initialized =====");

    cacheDOM();

    if (searchForm) {
        searchForm.addEventListener("submit", event => {
            event.preventDefault();

            const q = searchInput ? searchInput.value.trim() : "";

            doSearch(q);
        });
    }

    if (searchInput && searchInput.value.trim()) {
        doSearch(searchInput.value.trim());
    }

    console.log("DOM initialized");
});

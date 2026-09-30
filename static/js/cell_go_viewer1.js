/* cell_go_viewer.js
 * -----------------
 * 1. 把 Animal_cells.svg 用 fetch 抓回來、inline 塞進頁面（這樣才能用 JS/CSS
 *    直接控制裡面每個 <g id="SLxxxx"> 胞器區塊）。
 * 2. 打 /api/protein/<accession>/go 拿這顆蛋白質的 GO function，秀在右側清單。
 * 3. 頁面載入完成後，依序自動點亮每個「有對應到胞器」的 GO function（跑馬燈式導覽）。
 * 4. 導覽結束後，滑鼠移到圖上的胞器 <-> 滑鼠移到右側清單項目，兩邊互相對應發亮。
 */

(function () {
  "use strict";

  const state = {
    svgRoot: null,          // inline 進來的 <svg> 根節點
    goTermsByAspect: { C: [], F: [], P: [] },
    introTimer: null,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const [svgOk] = await Promise.all([loadSvg(), loadGoTerms()]);
    if (!svgOk) return; // 圖都載不出來就不用繼續了

    renderGoLists();
    wireHoverInteractions();
    playIntroSequence();
  }

  // ------------------------------------------------------------------ //
  // 載入 / 注入 SVG
  // ------------------------------------------------------------------ //
async function loadSvg() {

    const container = document.getElementById("cell-container");

    try {

        const res = await fetch(window.CELL_SVG_URL);

        if (!res.ok) {
            throw new Error("svg fetch failed: " + res.status);
        }

        const svgText = await res.text();

        container.innerHTML = svgText;

        state.svgRoot = container.querySelector("svg");

        console.log(
            "[UKW] SVG loaded:",
            !!state.svgRoot
        );

        if (state.svgRoot) {

            const slNodes =
                state.svgRoot.querySelectorAll('[id^="SL"]');

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

        console.error("[UKW] SVG ERROR:", err);

        container.innerHTML =
            '<div class="loading">細胞圖載入失敗：' +
            escapeHtml(err.message) +
            "</div>";

        return false;
    }
}

  // ------------------------------------------------------------------ //
  // 載入 GO function 資料
  // ------------------------------------------------------------------ //
  async function loadGoTerms() {
    try {
      const res = await fetch(window.GO_API_URL);
      if (!res.ok) throw new Error("go fetch failed: " + res.status);
      const data = await res.json();
      const grouped = { C: [], F: [], P: [] };
      for (const term of data.go_terms || []) {
        const aspect = grouped[term.aspect] ? term.aspect : "P";
        grouped[aspect].push(term);
      }
      state.goTermsByAspect = grouped;
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // ------------------------------------------------------------------ //
  // 畫右側清單
  // ------------------------------------------------------------------ //
  function renderGoLists() {
    renderOneList("go-list-C", state.goTermsByAspect.C, true);
    renderOneList("go-list-F", state.goTermsByAspect.F, false);
    renderOneList("go-list-P", state.goTermsByAspect.P, false);
  }

function renderOneList(ulId, terms, allowMapping) {

    const ul = document.getElementById(ulId);

    if (!ul) return;

    ul.innerHTML = "";

    if (!terms.length) {

        const li = document.createElement("li");

        li.textContent = "（沒有資料）";

        li.style.color = "#aaa";

        ul.appendChild(li);

        return;
    }

    for (const term of terms) {

        let rawSlIds = [];

        if (allowMapping) {

            if (Array.isArray(term.sl_ids)) {

                rawSlIds = term.sl_ids;

            } else if (typeof term.sl_ids === "string") {

                rawSlIds = term.sl_ids.split(",");
            }
        }

        const slIds = rawSlIds
            .map(normalizeSlId)
            .filter(Boolean);

        const li = document.createElement("li");

        li.innerHTML =
            escapeHtml(
                term.term_name ||
                term.name ||
                "(unnamed)"
            ) +
            '<span class="go-id">' +
            escapeHtml(term.go_id || "") +
            "</span>" +
            (
                term.evidence
                    ? '<span class="go-evidence">' +
                      escapeHtml(term.evidence) +
                      "</span>"
                    : ""
            );

        if (slIds.length) {

            li.classList.add("mappable");

            li.dataset.sl = slIds.join(",");
        }

        ul.appendChild(li);
    }
}

  // ------------------------------------------------------------------ //
  // 依序自動導覽：一個一個把有對應胞器的 GO term 點亮
  // ------------------------------------------------------------------ //
  function playIntroSequence() {
    const items = Array.from(document.querySelectorAll("#go-list-C li.mappable"));
    if (!items.length) return;

    const STEP_MS = 1300;
    let i = 0;

    function step() {
      // 清掉上一個的強光跟 active 狀態
      if (i > 0) {
        const prev = items[i - 1];
        prev.classList.remove("active");
        setGlow(splitSl(prev.dataset.sl), ["sl-glow-strong", "sl-glow-pulse"], false);
      }

      if (i >= items.length) {
        // 導覽結束：所有有對應到的胞器都留一個淡淡的常駐光暈，方便之後 hover 探索
        for (const li of items) {
          setGlow(splitSl(li.dataset.sl), ["sl-glow-soft"], true);
        }
        return;
      }

      const li = items[i];
      li.classList.add("active");
      li.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setGlow(splitSl(li.dataset.sl), ["sl-glow-strong", "sl-glow-pulse"], true);

      i += 1;
      state.introTimer = setTimeout(step, STEP_MS);
    }

    step();
  }

  // ------------------------------------------------------------------ //
  // 雙向 hover：圖上胞器 <-> 右側清單
  // ------------------------------------------------------------------ //
  function wireHoverInteractions() {
    const container = document.getElementById("cell-container");

    container.addEventListener("mouseover", (e) => {
      const g = e.target.closest('[id^="SL"]');
      if (!g) return;
      highlightBySlId(g.id, true);
    });
    container.addEventListener("mouseout", (e) => {
      const g = e.target.closest('[id^="SL"]');
      if (!g) return;
      // 如果滑鼠只是移到同一個胞器內的子節點，不算離開
      if (e.relatedTarget && g.contains(e.relatedTarget)) return;
      highlightBySlId(g.id, false);
    });

    const list = document.getElementById("go-list-C");
    list.addEventListener("mouseover", (e) => {

      const li = e.target.closest("li.mappable");

      if (!li || !list.contains(li)) return;

      li.classList.add("active");

      const slIds = splitSl(li.dataset.sl);

      console.log(
          "[UKW] GO hover:",
          li.dataset.sl,
          "→",
          slIds
      );

      setGlow(
          slIds,
          ["sl-glow-strong"],
          true
      );
  });

  list.addEventListener("mouseout", (e) => {

        const li = e.target.closest("li.mappable");

        if (!li || !list.contains(li)) return;

        // 如果只是從 li 裡面的 span 移到另一個子元素，
        // 不要馬上關掉
        if (e.relatedTarget && li.contains(e.relatedTarget)) {
            return;
        }

        li.classList.remove("active");

        setGlow(
            splitSl(li.dataset.sl),
            ["sl-glow-strong"],
            false
        );
    });

    // 觸控裝置沒有 hover：點一下清單項目，暫時亮 1.8 秒
    list.addEventListener("click", (e) => {
      const li = e.target.closest("li.mappable");
      if (!li) return;
      setGlow(splitSl(li.dataset.sl), ["sl-glow-strong"], true);
      setTimeout(() => setGlow(splitSl(li.dataset.sl), ["sl-glow-strong"], false), 1800);
    });
  }

function highlightBySlId(slId, on) {

    const normalizedId = normalizeSlId(slId);

    setGlow(
        [normalizedId],
        ["sl-glow-strong"],
        on
    );

    document
        .querySelectorAll("#go-list-C li.mappable")
        .forEach((el) => {

            const ids = splitSl(el.dataset.sl);

            if (ids.includes(normalizedId)) {
                el.classList.toggle("active", on);
            }
        });
}

  // ------------------------------------------------------------------ //
  // 小工具
  // ------------------------------------------------------------------ //
  function normalizeSlId(slId) {

    if (!slId) return "";

    return String(slId)
        .trim()
        .toUpperCase();
  }

  function splitSl(str) {
    return (str || "")
        .split(",")
        .map(id => normalizeSlId(id))
        .filter(Boolean);
  }

function setGlow(slIds, classNames, on) {
    if (!state.svgRoot) return;

    for (const rawId of slIds) {

        const slId = normalizeSlId(rawId);

        const node = state.svgRoot.querySelector(
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

        // group 本身
        for (const cls of classNames) {
            node.classList.toggle(cls, on);
        }

        // group 裡真正繪圖的元素
        node.querySelectorAll(
            "path, rect, ellipse, circle, polygon, polyline"
        ).forEach((child) => {

            for (const cls of classNames) {
                child.classList.toggle(cls, on);
            }

        });
    }
}

  function cssEscape(str) {
    return window.CSS && CSS.escape ? CSS.escape(str) : str.replace(/([^\w-])/g, "\\$1");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  })();


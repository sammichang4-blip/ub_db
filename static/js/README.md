# UKW 前端 JS 拆分說明

原本單一的 `app.js` 已依功能拆成 10 個檔案。這些**不是** ES modules —
因為 HTML 裡大量用 `onclick="loadProtein(...)"`、`onclick="changeLayout('dagre')"`
這類內嵌呼叫，函式必須留在全域作用域才能被找到，所以維持原本的
「多個 `<script>` 標籤、共用全域作用域」寫法，只是把邏輯依功能切開。

## 檔案清單與職責

| 檔案 | 內容 |
|---|---|
| `01-constants.js` | `LYSINE_SITES` 常數 |
| `02-state.js` | 所有全域狀態變數（DOM 參照、目前選取的蛋白質、Mol*/Cytoscape 實例等）|
| `03-utils.js` | `cacheDOM`、`escapeHtml`、`showCopyMessage` 共用工具 |
| `04-viewer.js` | Mol* 3D 結構檢視器：初始化、載入結構、放大視窗、預測結構 modal |
| `05-search.js` | 搜尋框、搜尋結果列表、`loadProtein` / `loadProteinClass` |
| `06-annotation-sections.js` | 結構表格、domain 架構圖、GO 功能標籤、E1-E2-E3-substrate 關係鏈渲染 |
| `07-papers-sequence.js` | 功能描述、論文列表（含展開更多）、序列軌道、複製序列、放大論文檢視彈窗 |
| `08-detail.js` | `renderDetail`：組出整個右側詳細面板，串接上面所有 renderer |
| `09-network.js` | Cytoscape 交互關係網路：載入、展開節點、切換版面、匯出 PNG |
| `10-main.js` | `DOMContentLoaded` 進入點，掛上搜尋表單事件 |

## HTML 載入順序（必須照這個順序）

```html
<script src="/static/js/01-constants.js"></script>
<script src="/static/js/02-state.js"></script>
<script src="/static/js/03-utils.js"></script>
<script src="/static/js/04-viewer.js"></script>
<script src="/static/js/05-search.js"></script>
<script src="/static/js/06-annotation-sections.js"></script>
<script src="/static/js/07-papers-sequence.js"></script>
<script src="/static/js/08-detail.js"></script>
<script src="/static/js/09-network.js"></script>
<script src="/static/js/10-main.js"></script>
```

依賴關係大致是：`state`/`utils` 最先載入 → 各 renderer（04–07, 09）
→ `08-detail.js`（會用到前面所有 renderer）→ `10-main.js`（最後掛
DOMContentLoaded）。這個順序也符合表格中的檔名編號。

## 順手修正的一個既有 bug

`openExpandedView()`（現在在 `07-papers-sequence.js`）原本用到變數
`p`（例如 `p.protein_name`、`p.description`），但函式裡從未宣告
`p`，只宣告了 `data`。這在瀏覽器裡會直接丟出
`ReferenceError: p is not defined`，代表「🔍 放大檢視」這個按鈕原本
是壞的。拆檔時補上了 `const p = currentProtein;`，讓它讀取目前載入
的蛋白質資料，行為symmetry於彈窗標題／描述使用的其他地方。若這不是
你要的修法（例如你原本想從 `data.protein` 取值），跟我說一聲，我再
調整。

其餘邏輯（HTML 結構、CSS class、API 路徑、Mol*/Cytoscape 設定）都
逐行對照過，沒有做行為變更，只有重新排版讓每支檔案讀起來更緊湊。

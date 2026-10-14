# UKW 前端 JavaScript 維護指南

前端腳本由 `templates/index.html` 以多個 `<script>` 標籤載入，並共用瀏覽器全域作用域；這些檔案不是 ES modules。HTML 中有內嵌事件處理器，且不同腳本會直接呼叫彼此的函式，因此載入順序屬於執行需求。

## 檔案職責

| 檔案 | 主要職責 |
|---|---|
| `01-constants.js` | 共用常數，例如 lysine 位點資料 |
| `02-state.js` | 前端共享狀態與 DOM 參照 |
| `03-utils.js` | 共用 DOM、字串與呈現工具 |
| `04-viewer.js` | Mol* 結構檢視器與結構載入 |
| `05-search.js` | 搜尋結果、蛋白質載入、酵素分類與篩選 |
| `06-annotation-sections.js` | 結構、domain、GO 與泛素化關係區塊 |
| `07-papers-sequence.js` | 功能描述、論文、序列與相關檢視器 |
| `08-detail.js` | 組合並呈現蛋白質詳細資料面板 |
| `09-network.js` | Cytoscape 交互作用網路 |
| `10-main.js` | 搜尋表單等頁面初始化事件 |
| `11-domain.js` | Domain Explorer 互動與呈現 |
| `cell_go_viewer.js` | Cell GO 細胞定位檢視器 |
| `network.js`, `network_1.js` | 網路頁面相關腳本；使用前請確認模板引用哪個版本 |
| `cell_go_viewer1.js`, `cell_go_viewer2.js` | Cell GO 檢視器的其他版本；使用前請確認模板引用狀況 |

`*.old.js` 為舊版檔案，不應新增至正式載入清單。

## `index.html` 載入順序

目前 `templates/index.html` 依以下順序載入主頁腳本：

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
<script src="/static/js/11-domain.js"></script>
```

修改載入順序前，先確認腳本間的全域變數與函式依賴。若新增 `<script>`，請同時確認模板路徑正確，並在瀏覽器開發者工具檢查載入錯誤與 console 例外。

## 修改指引

- 搜尋、清單篩選與蛋白質載入邏輯放在 `05-search.js`；詳細面板的組裝放在 `08-detail.js`。
- 重用既有的共用狀態與工具，避免在多個檔案建立互相矛盾的全域狀態。
- HTML 使用 `onclick` 呼叫的函式必須維持在全域可存取；若改用模組或事件委派，需同步調整模板中的事件綁定。
- 修改 API 呼叫時，核對 Flask 路由及 JSON 欄位，並測試空結果、錯誤回應與正常資料。
- 修改結構檢視器或網路圖時，確認 Mol*、Cytoscape.js 的載入順序及依賴資源仍可取得。

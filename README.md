# ubiquitin_web — 泛素知識庫（UKW）

整合泛素與泛素樣系統的知識庫及網頁平台。
本平台彙整 UniProt、InterPro/Pfam、GO、PDB、Reactome、BioGRID、IntAct、CORUM、PhosphoSitePlus 等來源的資料，並提供可搜尋的知識圖譜。
功能包含蛋白質搜尋、E1–E2–E3–受質關係網路、3D 結構、結構域架構、GO／細胞定位對應，以及結合序列資料與 3D 結構的分析視窗。

[English](README.en.md)

> 開發者：Sammi Chang（中央研究院生物化學研究所）
> 狀態：原型，持續開發中。介面使用繁體中文。

---

## 目錄

- [功能概覽](#功能概覽)
- [詳細頁面元件](#詳細頁面元件)
- [資料規模與來源](#資料規模與來源)
- [系統架構](#系統架構)
- [前端檔案](#前端檔案)
- [路由與 API](#路由與-api)
- [資料庫](#資料庫)
- [快速開始](#快速開始)
- [展開檢視：序列與 3D](#展開檢視序列與-3d)
- [測試](#測試)
- [開發路線圖](#開發路線圖)
- [已知限制與問題](#已知限制與問題)
- [授權與引用](#授權與引用)

---

## 功能概覽

| 模組 | 說明 |
|---|---|
| 搜尋 | 依基因名稱、蛋白質名稱、別名或資料庫 ID 搜尋。搜尋結果會標示符合的關鍵字；ID 會透過 `identifier_table` 對應至 UniProt。 |
| 酵素分類瀏覽器 | 列出所有 E1、E2、E3 與 DUB 成員。E3 與 DUB 可依子家族篩選，也可只顯示沒有實驗 PDB 結構的蛋白質。 |
| 關係網路 | 使用 Cytoscape.js 呈現網路，並以不同形狀與顏色區分 E1、E2、E3、DUB 與受質節點。點選節點可展開下一層。提供七種配置、全螢幕模式與 PNG 匯出。 |
| 3D 結構 | 使用 Mol*；優先載入 PDB，其次為 AlphaFold、AlphaFill 與 SWISS-MODEL。結構可在獨立視窗中開啟。 |
| 結構域架構 | 依來源資料庫（InterPro、Pfam、Gene3D、CDD、SMART 等）顯示結構域軌道。可搭配 3D 檢視器使用 Domain Explorer。 |
| GO／細胞定位 | 左側顯示細胞結構圖，右側顯示 GO 清單（F/P/C）。細胞組成（Cellular Component）會對應至胞器並以醒目方式標示，兩側支援滑鼠游標互動。 |
| 文獻 | 顯示相關 PubMed 文獻，依關聯性排序，並可依年份篩選。 |
| 序列 | 依類別為 UniProt features 著色，並標示泛素化位點。可開啟含有序列、3D 檢視器與 feature 清單的展開視窗。 |
| 關係鏈 | 顯示 E1 → E2 → E3 → 受質，以及修飾的 Lys 殘基、鏈型、結果、證據與 PMID。 |

---

## 詳細頁面元件

選取蛋白質後，右側詳細頁（`renderDetail()`）由上而下包含以下區塊：

1. **結構檢視器**（Mol*）與**關係網路**（Cytoscape），並排顯示。
2. **結構表格**：實驗結構（PDB ID、方法、解析度、鏈、標題與下載連結）及預測結構（AlphaFold 平均 pLDDT、AlphaFill 命中數與配體、SWISS-MODEL 模板與 QMEAN）。點選 PDB ID 或 **View** 可在 Mol* 載入結構。
3. **結構域架構**。
4. **蛋白質資訊**：名稱、UniProt、物種、長度、基因與蛋白質別名、相關文獻，以及 UniProt 功能描述。
5. **序列**：五種 feature 類別（結構、定位、功能、修飾、變異）、與多聚泛素鏈相關的已知離胺酸殘基（K6、K11、K27、K29、K33、K48、K63），以及 C 端 Gly-Gly 基序。
6. **GO 與細胞胞器對應**。
7. **E1–E2–E3–受質關係鏈**。

載入結構時，應用程式會先下載檔案並檢查內容是否符合 PDB/mmCIF 格式，再交由 Mol* 處理。如果收到 404 頁面或空檔案，會顯示警告，避免 Mol* 產生難以理解的內部錯誤。

---

## 資料規模與來源

原型目前的統計數字（取自履歷；實際筆數請以資料庫為準）：

| 項目 | 數量 |
|---|---:|
| 蛋白質 | 20,652 |
| 關係（PPI、E3–受質、DUB–受質） | 202,735 |
| PDB 結構紀錄（解析後） | 134,145 |

| 類別 | 來源 |
|---|---|
| 蛋白質、序列、features、別名 | UniProt |
| 結構域 | InterPro、Pfam 及其成員資料庫 |
| 功能註解 | GO / GOA |
| 結構 | RCSB PDB、AlphaFold DB、AlphaFill、SWISS-MODEL |
| 交互作用／複合體／路徑 | BioGRID、IntAct、CORUM、Reactome |
| 修飾位點 | PhosphoSitePlus |
| 文獻 | PubMed |
| 細胞圖 | SwissBioPics（動物細胞） |
| 位置對應／證據名稱 | PDBe SIFTS、EBI QuickGO |

各資料來源均有其授權條款；使用或散布資料前，請先確認相關條款。

---

## 系統架構

```
資料來源 ─► ETL（Python / Biopython）─► SQLite ─► Flask ─► 瀏覽器（原生 JavaScript）
                                             │                    ├─ Cytoscape.js
                                             └─ 規劃中：PostgreSQL ├─ Mol*
                                                                  └─ SwissBioPics SVG
```

- **後端**：Python 與 Flask；使用 SQLite（規劃遷移至 PostgreSQL）。
- **ETL**：以 Biopython 為基礎的 UniProt 解析器，保留證據欄位並正規化跨資料庫 ID。
- **PubMed 關聯性**：比對蛋白質／基因名稱與別名，並依結構域關鍵字加分（`relevance_score`）。
- **GO 至胞器對應**：後端函式 `map_go_term_to_sl()` 將細胞組成對應至 SwissBioPics SL ID（`sl_ids`）。
- **前端**：不使用框架；各檔案透過全域函式與 `window` 狀態互相呼叫。

---

## 前端檔案

| 檔案 | 內容 |
|---|---|
| `01` constants | `LYSINE_SITES`、`FEATURE_CATEGORIES` |
| `02` state | DOM 參照、全域狀態、Mol*／Cytoscape 狀態 |
| `03-utils.js` | `cacheDOM()`、`escapeHtml()` 等工具函式 |
| `04` viewer | Mol* 初始化、結構載入、結構彈出視窗、展開的 `/structure-viewer` |
| `05` search | 搜尋、蛋白質載入、酵素分類與子家族／No-PDB 篩選 |
| `06` renderers | 結構表格、預測結構表格、內嵌 GO／Cell 檢視器、關係鏈 |
| `07-papers-sequence.js` | 功能描述、文獻、序列軌道、主頁 feature 詳細資料 |
| `07b-evidence.js` | 證據：ECO 說明，以及 PubMed 和其他資源的連結 |
| `07c-sequence-popup.js` | 展開檢視：序列 + Mol* + feature 清單 + 分析工具 |
| `08-detail.js` | `renderDetail()`，組合完整詳細頁並啟動 Mol* 與網路 |
| `09` network | Cytoscape 網路、配置、展開、全螢幕模式、PNG 匯出 |
| `10` main | 進入點：綁定搜尋表單 |
| `11-domain.js` | 結構域架構、顏色邏輯、Domain Explorer |
| Cell viewer 頁面腳本 | 獨立 `/protein/<id>/cell-view` 頁面的 SVG 與 GO 互動 |

> 請以實際檔名為準；除 `03-utils.js`、`08-detail.js` 與 `11-domain.js` 外，其他名稱是依檔案標頭推測。

**載入順序**：先載入 constants、state 與 utils（其他檔案在載入時會使用 `FEATURE_CATEGORIES` 與全域狀態）；最後載入 `10` main。
`07-papers-sequence.js`、`07b` 與 `07c` 之間的呼叫發生於執行期間，因此載入順序不影響功能。

**結構域顏色規則**（`11-domain.js`）：相同 InterPro ID 或名稱的結構域會使用相同顏色（以 Union-Find 合併別名），且不同蛋白質之間的顏色保持一致。同一家族的重複結構域會逐漸變淡；重疊的結構域會自動排列至不同列。滑鼠游標移至結構域上時，會醒目標示同一家族或重疊比例至少 50% 的結構域。

---

## 路由與 API

| 路由 | 說明 |
|---|---|
| `GET /api/search?q=` | 搜尋蛋白質 |
| `GET /api/protein/<protein_id>` | 取得單一蛋白質的完整資訊（接受 UniProt ID；若查無資料，會改用 `identifier_table` 查找） |
| `GET /api/enzyme/<class>` | 取得某酵素分類（E1/E2/E3/DUB）的所有成員，包含 `enzyme_subfamily` 與 `has_pdb` |
| `GET /api/network/<gene>?level=1\|2` | 取得關係網路的節點與邊；展開時使用 level 2 |
| GO API（由頁面變數 `GO_API_URL` 指定） | 提供 Cell 檢視器頁面使用的 GO 清單，欄位包含 `go_id`、`term_name`、`aspect`、`evidence` 與 `sl_ids` |
| `GET /network/<gene>` | 全螢幕網路頁面 |
| `GET /structure-viewer?url=` | 獨立 3D 檢視器頁面（接受實驗或預測結構的完整 URL） |
| `GET /protein/<id>/cell-view` | 完整細胞胞器與 GO 對應頁面 |
| `/static/img/Animal_cells.svg` | 細胞結構圖 |

履歷列出六個 REST 端點。上表依前端程式碼整理；請補上實際的 GO API 路徑及其他尚未列出的端點。

`/api/protein/<id>` 回傳：`protein`（包含別名）、`structures`、`predicted_structures`、`active_structure`
（Mol* 依此順序載入：PDB > AlphaFold > AlphaFill > SWISS-MODEL）、`domains`、`features`
（包含 `notes`、`evidence`、`ligands` 與 `category`）、`feature_categories`、`feature_type_counts`、
`feature_category_counts`、`functions`（GO，包含 `sl_ids`）、`ub_relations` 與 `papers`。

---

## 資料庫

| 類別 | 資料表 |
|---|---|
| 蛋白質 | `proteins`、`protein_alias`、`gene_alias`、`identifier_table` |
| 功能與結構 | `domains`、`go_functions`、`structures`、`alphafold_models`、`alphafill_models`、`swiss_models` |
| UniProt features | `protein_feature`、`feature_note`、`feature_evidence`、`feature_ligand` |
| 酵素與關係 | `enzymes`、`ub_relations`、`ubiquitin_interaction`、`network_edge` |
| 複合體 | `complexes`、`complex_component`、`complex_hierarchy`、`complex_pubmed` |
| 文獻 | `papers`、`paper_proteins` |

`ub_relations` 記錄 E1/E2/E3/DUB、受質、修飾的 Lys 殘基、鏈型（`ub_type`）、功能結果、證據與 PMID。
完整結構請參閱資料庫 DDL。

---

## 快速開始

> 以下是一般 Flask 專案的安裝步驟，請依實際檔名與資料庫位置調整。

```bash
git clone <repo-url> ubiquitin_web
cd ubiquitin_web

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# SQLite 檔案未納入版本控制：請放在預期的專案位置，或使用 ETL 重新建立。
flask run            # 或 python app.py
# http://127.0.0.1:5050/
```

**前端函式庫**：Cytoscape.js（包含 dagre 配置）與 Mol* 透過 `<script>` 標籤載入。
目前 Mol* 版本為 **5.10.1**。請固定版本，不要使用 `@latest`；將檢視器建置檔放入 `static/molstar/`，並在 `index.html` 中提供展開視窗所需的路徑：

```html
<script>
  window.MOLSTAR_JS  = "{{ url_for('static', filename='molstar/molstar.js') }}";
  window.MOLSTAR_CSS = "{{ url_for('static', filename='molstar/molstar.css') }}";
</script>
```

**資料更新**：ETL 會下載 UniProt、PDB 等大型檔案。若下載時間較長，請避免電腦進入睡眠，並確認檔案已完整下載；未完成的下載可能造成解析錯誤。

---

## 展開檢視：序列與 3D

點選序列區塊中的 **🔍 Expand**，即可開啟新視窗：左側顯示序列，右上方顯示 Mol*，右下方顯示 feature 清單。分隔線可拖曳調整。

- **Features**：五種類別各有 subtype 子選單，每個 subtype 使用自己的顏色。清單依 subtype 分組與排序。可一次選取某 subtype 或整個類別的所有位置（序列與 3D 檢視中的選取會同步）。
- **雙向互動**：點選序列或清單項目可在 3D 中選取；在 3D 中點選殘基，會自動捲動至序列中的對應位置並醒目標示，同時列出涵蓋該位置的所有 features。
- **證據**：提供 ECO 代碼說明，以及 PubMed、UniProtKB、PDB 和其他資源的連結（例如 `ECO:0007744|PubMed:23186163`）。
- **泛素與泛素樣修飾位點**：資料來自 `ub_relations` 與 UniProt `CROSSLNK`；依鏈型著色（K48、K63、K11、K29、K27、K33、K6、M1 與單泛素化）。亦支援 SUMO1/2/3、NEDD8、ISG15、UFM1、URM1、FAT10 與 ATG12。
- **3D 分析**：將 UniProt 位置對應至 PDB 殘基編號（SIFTS）；比較離胺酸的溶劑可及表面積（SASA）與已知位點，並依 pLDDT 篩除低信心度的 AlphaFold 候選位點。選取位點時也會顯示距離 4.5 Å 內的配體與離子；水分子會隱藏。
- **切換結構**：可在視窗中切換 PDB 與預測結構；主頁變更 PDB 時，展開視窗也會自動更新。
- **工具**：基序搜尋（正規表示式，例如 `K..K` 與 `N[^P][ST]`）及距離測量（Cα–Cα 與最近原子距離）。

---

## 測試

展開檢視有一套不需瀏覽器的自動化測試（jsdom + 模擬 Mol*），涵蓋完整工作流程、Mol* API 缺漏、結構不存在、資料缺漏與 AlphaFold 雙鏈模型。

```bash
cd tests
npm install
npm test
```

測試**不涵蓋**真實 Mol* 或外部服務的行為與版面；發布前請在真實瀏覽器中驗證。詳情請參閱 [`tests/README.md`](tests/README.md)。
主頁其他模組（搜尋、網路、Domain 與 Cell GO）目前沒有自動化測試。

---

## 開發路線圖

以下項目仍在規劃中，**尚未實作**：

- 將 SQLite 遷移至 PostgreSQL。
- 使用 LLM 從文獻擷取關係，並加入以 RAG 為基礎的文獻檢索。
- 知識圖譜推論：使用圖神經網路預測交互作用，並使用知識圖譜嵌入。
- 整合科學 AI agent（用於假說生成）與蛋白質基礎模型。
- 展開檢視：支援匯出（CSV、FASTA、PyMOL／ChimeraX 選取指令）、計算所有胺基酸的可及性、評估變異對結構的影響，以及新增二級結構與結構域軌道。

---

## 已知限制與問題

- **主頁的結構域／殘基醒目標示（`highlightStructureRange`）**：目前直接將 UniProt 位置當作 PDB `auth_seq_id` 使用，未轉換殘基編號。
  此外，以 Mol* 5.10.1 測試展開檢視時發現，`structureInteractivity` 會選取整個結構。
  主頁使用相同呼叫，因此可能也有此問題。展開檢視目前使用 SIFTS 對應並直接建立選取範圍；可考慮將此方法移植至主頁。
- 本專案由單一開發者維護，尚未驗證多人使用與正式環境部署。
- SASA、距離及其他數值由前端根據載入的座標計算。AlphaFold 低信心度區域不可靠，且尚未與 FreeSASA 等工具比較。
- UniProt `CROSSLNK` 不記錄泛素鏈型。只有泛素本身（UBB、UBC、UBA52、RPS27A）可依重複單元位置推測。
- 已知修飾位點被埋藏，不代表資料錯誤；可能是構形變化或結構狀態不同所致。
- 本應用程式依賴外部服務（PDBe SIFTS、QuickGO）。若服務無法使用，可能缺少位置覆蓋資訊與部分 ECO 說明。

---

## 授權與引用

- 程式碼授權：尚待指定（例如 MIT）。
- 資料授權：依各來源資料庫的條款規範。
- 引用：待發表後補上。

若使用本專案，也請一併引用上方列出的資料來源。

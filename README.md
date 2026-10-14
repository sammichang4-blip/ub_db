# Ubiquitin Knowledge Warehouse (UKW)

UKW 是以 Flask、SQLite 和原生 JavaScript 建置的泛素相關蛋白質查詢介面。系統整合蛋白質註解、結構、domain、GO、蛋白質交互作用與泛素化關係，並提供本機網頁供查詢與瀏覽。

## 功能

- 依基因名稱、蛋白質名稱、UniProt accession 與別名搜尋蛋白質。
- 瀏覽 UB、UBL、E1、E2、E3、DUB 分類，並依酵素 subfamily 或是否有實驗 PDB 結構篩選。
- 檢視蛋白質基本資料、序列、domain、GO 註解、論文及結構資料。
- 使用 Mol* 檢視蛋白質 3D 結構，並瀏覽 domain 與細胞定位資訊。
- 瀏覽 E1-E2-E3-substrate、DUB-substrate 和其他交互作用網路。
- 使用 SQLite 作為本機查詢資料庫。

## 技術與資料來源

- 後端：Python、Flask、SQLite
- 前端：HTML、CSS、原生 JavaScript、Mol*、Cytoscape.js
- `download/` 目前提供 UniProt、Reactome、BioGRID、CORUM、IntAct、STRING、UbiBrowser 與 PhosphoSitePlus 的資料下載模組。結構資料由本機 PDB/CIF 檔案及資料庫記錄提供；專案目前沒有獨立的 RCSB PDB 下載模組。實際可顯示的內容取決於已匯入的資料與可用檔案。

## 啟動網頁

需要 Python 3 和一份已建置、且包含應用程式所需資料表的 SQLite 資料庫。建立虛擬環境並安裝 Flask：

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install Flask
```

目前 `app.py` 將網頁使用的資料庫路徑固定為專案目錄上一層的 `data/db/ubiquitin.db`。請先將資料庫放在該位置，再從專案根目錄啟動：

```sh
python app.py
```

開啟 <http://127.0.0.1:5050/>。目前伺服器以 Flask debug 模式啟動，僅供本機開發使用。

## 資料庫與設定

請留意目前程式中有兩組不同的資料庫路徑：

- 網頁查詢：`app.py` 使用固定路徑 `../data/db/ubiquitin.db`，不讀取 `config.sys` 的資料庫設定。
- 資料匯入設定：`config.sys` 的 `[database] path` 目前設為 `../data_new/ubiquitin.db`，由 `config.py` 讀取為 `DATABASE_PATH`。

此外，`db.py` 目前匯入 `config.DB_PATH`，但 `config.py` 定義的是 `DATABASE_PATH`，沒有定義 `DB_PATH`。因此任何匯入 `db.py` 的資料初始化或匯入流程都會在載入階段失敗，需先統一設定名稱與資料庫路徑。`requirement.txt` 目前只有 `ca-certificates` 和 `certifi`，並非完整的 pip 相依套件清單；網頁啟動至少需要另外安裝 Flask。

資料表定義位於 `schema.sql` 與 `schema.py`。主要資料表包含 `proteins`、`structures`、`domains`、`go_functions`、`enzymes`、`ub_relations`、`protein_alias`、`gene_alias`、`identifier_table` 和 `ubiquitin_interaction`。

## 專案結構

```text
app.py                  Flask 網頁與 JSON API
config.py, config.sys   資料下載及匯入設定
schema.py, schema.sql   SQLite schema
download/               外部資料下載模組
load/                   資料載入模組
static/css/              網頁樣式
static/js/               前端互動與資料呈現
static/molstar/          Mol* 檢視器資源
templates/               Flask HTML 模板
neo4j_import_csv/        Neo4j 匯入 CSV 範例或輸出
```

前端 JavaScript 檔案職責與載入順序請見 [`static/js/README.md`](static/js/README.md)。

## 主要頁面與 API

| 路徑 | 用途 |
|---|---|
| `/` | 蛋白質搜尋與詳細資料頁面 |
| `/network/<gene>` | 指定基因的交互作用網路頁面 |
| `/pdb/<pdbid>` | 以 PDB ID 開啟結構檢視器 |
| `/structure-viewer?url=<path>` | 以站內 PDB/CIF 路徑開啟結構檢視器 |
| `/protein/<protein_id>/cell-view` | 蛋白質的 Cell GO 頁面 |
| `/api/search?q=<keyword>` | 搜尋蛋白質與別名 |
| `/api/protein/<protein_id>` | 取得蛋白質詳細資料 |
| `/api/enzyme/<enzyme_class>` | 取得 UB、UBL、E1、E2、E3 或 DUB 清單 |
| `/api/network/<gene>` | 取得泛素化網路節點與關係 |
| `/api/complexes/<gene_name>` | 取得基因相關蛋白質複合體 |
| `/api/protein/<protein_id>/cell-go` | 取得蛋白質的 GO 細胞定位資料 |
| `/api/ubiquitin-interaction?protein_a=...&protein_b=...&interaction_type=...` | 查詢兩個蛋白質之間的指定交互作用 |

## 資料與使用注意事項

- 本專案提供的是資料整合與瀏覽程式；外部資料的授權、版本、下載及更新頻率依各來源規範與 `config.sys` 設定為準。
- 結構檢視器使用的 PDB 和 CIF 檔案預設位於專案上一層的 `data/pdb` 與 `data/cif`。
- 不要將 Flask debug server 直接暴露在公開網路上。

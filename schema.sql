-- ============================================================
-- Ubiquitin 本地查詢資料庫 schema
-- 適用 SQLite / 可轉 PostgreSQL (型別需微調 TEXT->VARCHAR 等)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. proteins：蛋白質基本資料（序列 / 功能敘述來源：UniProt）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proteins (
    protein_id      TEXT PRIMARY KEY,      -- 內部主鍵，用 UniProt accession，如 P0CG47
    uniprot_acc     TEXT UNIQUE NOT NULL,  -- UniProt accession
    entry_name      TEXT,                  -- UniProt entry name，如 UBB_HUMAN
    gene_name       TEXT,                  -- 基因名稱，如 UBB / UBC / UBA52 / RPS27A
    protein_name    TEXT,                  -- 蛋白質全名
    organism        TEXT,                  -- 物種，如 Homo sapiens
    taxon_id        INTEGER,
    sequence        TEXT NOT NULL,         -- FASTA 胺基酸序列（成熟蛋白）
    length          INTEGER,               -- 序列長度
    mol_weight      REAL,                  -- 分子量 (Da)
    description     TEXT,                  -- 功能簡述（UniProt Function section 摘要）
    is_polyprotein  INTEGER DEFAULT 0,     -- 是否為前驅多聚蛋白（如 UBB/UBC 需被切割）
    protein_category TEXT DEFAULT 'Protein';
    last_updated    TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 2. structures：3D結構資訊（來源：RCSB PDB / PDBe）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS structures (
    structure_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id      TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    pdb_id          TEXT NOT NULL,         -- 如 1UBQ
    title           TEXT,
    method          TEXT,                  -- X-RAY DIFFRACTION / SOLUTION NMR / ELECTRON MICROSCOPY
    resolution_A    REAL,                  -- 解析度 (Å)，NMR 結構可為 NULL
    chains          TEXT,                  -- 鏈別，如 'A' 或 'A,B'
    deposit_date    TEXT,
    pdb_url         TEXT,                  -- 下載連結 (files.rcsb.org)
    UNIQUE(protein_id, pdb_id)
);

-- ------------------------------------------------------------
-- 3. domains：domain / motif 架構（來源：InterPro / Pfam / SMART / PROSITE）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
    domain_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id      TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    source_db       TEXT NOT NULL,         -- Pfam / InterPro / SMART / PROSITE
    accession       TEXT NOT NULL,         -- 如 PF00240 (ubiquitin domain)
    domain_name     TEXT,                  -- 如 'Ubiquitin domain'
    start_pos       INTEGER,
    end_pos         INTEGER,
    evalue          REAL,
    description     TEXT
);

-- ------------------------------------------------------------
-- 4. go_functions：GO功能註解（來源：Gene Ontology / GOA @ EBI）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS go_functions (
    go_row_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id      TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    go_id           TEXT NOT NULL,         -- 如 GO:0031386
    go_term         TEXT,                  -- 如 'protein tag'
    aspect          TEXT,                  -- P=Biological Process, F=Molecular Function, C=Cellular Component
    evidence_code   TEXT                   -- 如 IDA, IEA, TAS...
);

-- ------------------------------------------------------------
-- 5. enzymes：E1 / E2 / E3 / DUB 主索引
--    （來源：UniProt + UbiBrowser + Reactome + Literature）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enzymes (
    enzyme_id           TEXT PRIMARY KEY,      -- UniProt accession

    gene_name           TEXT NOT NULL,
    protein_name        TEXT,

    enzyme_class        TEXT NOT NULL
        CHECK (enzyme_class IN ('E1','E2','E3','DUB')),

    enzyme_subfamily    TEXT,                  -- USP / OTU / JAMM / RING / HECT / RBR / F-box...
    enzyme_family       TEXT,                  -- CRL / TRIM / MARCH / UBE2E ...
    catalytic_type      TEXT,                  -- Cysteine protease / Metalloprotease
    domain_architecture TEXT,                  -- F-box+WD40、TRAF-like+USP catalytic domain...
    modifier_system TEXT DEFAULT 'Ubiquitin';
    
    organism            TEXT DEFAULT 'Homo sapiens',
    uniprot_reviewed    INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_enzyme_class
ON enzymes(enzyme_class);

CREATE INDEX IF NOT EXISTS idx_enzyme_subfamily
ON enzymes(enzyme_subfamily);

CREATE INDEX IF NOT EXISTS idx_enzyme_family
ON enzymes(enzyme_family);

-- ------------------------------------------------------------
-- 6. ub_relations：E1–E2–E3–Substrate 泛素化關係鏈
--    （來源：UbiBrowser 2.0 / iUUCD 2.0 / PhosphoSitePlus / 文獻)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ub_relations (
    relation_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    e1_id             TEXT REFERENCES enzymes(enzyme_id),
    e2_id             TEXT REFERENCES enzymes(enzyme_id),
    e3_id             TEXT REFERENCES enzymes(enzyme_id),
    substrate_id      TEXT NOT NULL REFERENCES proteins(protein_id),
    ub_type           TEXT,                -- 如 K48-linked polyUb / K63-linked / mono-Ub
    modified_lysine    TEXT,               -- 受質上被修飾的 Lys 位點（若已知）
    functional_outcome TEXT,               -- 如 'proteasomal degradation', 'signaling'
    evidence            TEXT,              -- 實驗證據簡述
    reference_pmid      TEXT,
    source_db            TEXT,             -- UbiBrowser / iUUCD / literature
    dub_id                 TEXT REFERENCES enzymes(enzyme_id)
);

-- 索引，加速常用查詢
CREATE INDEX IF NOT EXISTS idx_protein_gene ON proteins(gene_name);
CREATE INDEX IF NOT EXISTS idx_domain_protein ON domains(protein_id);
CREATE INDEX IF NOT EXISTS idx_structure_protein ON structures(protein_id);
CREATE INDEX IF NOT EXISTS idx_relation_substrate ON ub_relations(substrate_id);

-- ------------------------------------------------------------
-- 7. protein_alias：蛋白質的其他名稱
--    （來源：UniProt DE 欄位的 AltName / Short / Contains / Includes）
--    注意：RecName:Full（主要名稱）已經存在 proteins.protein_name，
--    這裡只存「其他」名稱，不重複存主要名稱。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protein_alias (
    alias_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id   TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    alias_name   TEXT NOT NULL,
    alias_type   TEXT,                 -- 如 RecName:Short / AltName:Full / Contains:Full
    source       TEXT DEFAULT 'UniProt',
    FOREIGN KEY(protein_id)
    REFERENCES proteins(protein_id)
    UNIQUE(protein_id, alias_name, alias_type)
);

-- ------------------------------------------------------------
-- 8. gene_alias：基因的其他名稱
--    （來源：UniProt GN 欄位的 Synonyms，以及第二個以後的 Name）
--    注意：第一個基因的 Name（主要名稱）已經存在 proteins.gene_name，
--    這裡只存「其他」名稱。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gene_alias (
    alias_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id   TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    gene_alias   TEXT NOT NULL,
    source       TEXT DEFAULT 'UniProt',
    FOREIGN KEY(protein_id)
    REFERENCES proteins(protein_id)
    UNIQUE(protein_id, gene_alias)
);

-- ------------------------------------------------------------
-- 9. identifier_table：跨資料庫的識別碼對照
--    （來源：UniProt AC 欄位的全部 accession（含次要/已合併的），
--     以及 DR 欄位的跨資料庫交叉引用，如 RefSeq / Ensembl / GeneID / HGNC）
--    注意：GO 已存在 go_functions，PDB 已存在 structures，
--    這裡不重複存這兩種，避免跟專用表打架。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identifier_table (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id   TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    db           TEXT NOT NULL,        -- 如 UniProt / RefSeq / Ensembl / GeneID / HGNC ...
    identifier   TEXT NOT NULL,
    FOREIGN KEY(protein_id)
    REFERENCES proteins(protein_id)
    UNIQUE(protein_id, db, identifier)
);

CREATE INDEX IF NOT EXISTS idx_protein_alias_protein ON protein_alias(protein_id);
CREATE INDEX IF NOT EXISTS idx_gene_alias_protein ON gene_alias(protein_id);
CREATE INDEX IF NOT EXISTS idx_identifier_protein ON identifier_table(protein_id);
CREATE INDEX IF NOT EXISTS idx_identifier_db_id ON identifier_table(db, identifier);

-- ------------------------------------------------------------
-- 10. ubiquitin_interaction table
--    （專門存 BioGRID / IntAct)
-- ------------------------------------------------------------

CREATE TABLE ubiquitin_interaction (
    interaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_a TEXT NOT NULL
        REFERENCES proteins(protein_id),
    protein_b TEXT NOT NULL
        REFERENCES proteins(protein_id),
    interaction_type TEXT NOT NULL,  
    /*
    E1-E2
    E2-E3
    E3-substrate
    DUB-substrate
    PPI
    */
    direction TEXT,
    /*
    E1->E2
    E2->E3
    E3->substrate
    DUB->substrate
    */
    experimental_system TEXT,
    experimental_system_type TEXT,
    evidence TEXT,
    confidence TEXT,
    score REAL,
    modification TEXT,
    source_db TEXT,
    reference_pmid TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 11. network_edge table
--    （這張表是給 React/Cytoscape 使用)
-- ------------------------------------------------------------

CREATE TABLE network_edge (

    edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT
        REFERENCES proteins(protein_id),
    target_id TEXT
        REFERENCES proteins(protein_id),
    edge_type TEXT,
    /*
    E1-E2
    E2-E3
    E3-substrate
    DUB-substrate
    */
    direction TEXT,
    confidence TEXT,
    evidence_count INTEGER,
    source_db TEXT
);
-- ------------------------------------------------------------
-- 12. complexes：蛋白質複合物主表（來源：Reactome）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complexes (
    complex_id      TEXT PRIMARY KEY,
    complex_name    TEXT NOT NULL,

    complex_class   TEXT,      -- CRL1 / CRL4 / APC/C / Proteasome / Other

    organism        TEXT DEFAULT 'Homo sapiens',
    source_db       TEXT DEFAULT 'Reactome'
);

CREATE INDEX IF NOT EXISTS idx_complex_class
ON complexes(complex_class);
-- ------------------------------------------------------------
-- 13. complex_component：複合物成員（多對多）
--    participants 欄位可能是 UniProt 蛋白質或 ChEBI 小分子，
--    若為已收錄的 UniProt 蛋白，protein_id 一併填入以利 JOIN；
--    ChEBI 或未收錄蛋白則 protein_id 留 NULL。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complex_component (
    component_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id           TEXT NOT NULL REFERENCES complexes(complex_id) ON DELETE CASCADE,
    component_db         TEXT NOT NULL,   -- UniProt / ChEBI
    component_accession  TEXT NOT NULL,   -- 如 P08603 / 28879
    protein_id            TEXT REFERENCES proteins(protein_id),
    UNIQUE(complex_id, component_db, component_accession)
);

-- ------------------------------------------------------------
-- 14. complex_hierarchy：複合物之間的上下層關係
--    （對應 participatingComplex 欄位，如子複合物屬於某個更大複合物）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complex_hierarchy (
    hierarchy_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    child_complex_id  TEXT NOT NULL REFERENCES complexes(complex_id) ON DELETE CASCADE,
    parent_complex_id TEXT NOT NULL,       -- 如 R-ALL-1006146，可能是跨物種聚合ID，不強制外鍵
    UNIQUE(child_complex_id, parent_complex_id)
);

-- ------------------------------------------------------------
-- 15. complex_pubmed：同一個 relation 可以有很多 evidence
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complex_pubmed (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id   TEXT NOT NULL REFERENCES complexes(complex_id) ON DELETE CASCADE,
    pubmed_id    TEXT NOT NULL,
    UNIQUE(complex_id, pubmed_id)
);


BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "alphafill_models" (
	"protein_id"	TEXT,
	"uniprot_id"	TEXT,
	"hit_count"	INTEGER,
	"ligands"	TEXT,
	"cif_url"	TEXT,
	"local_cif_path"	TEXT,
	"status"	TEXT,
	"updated_at"	TEXT,
	PRIMARY KEY("protein_id")
);
CREATE TABLE IF NOT EXISTS "alphafold_models" (
	"protein_id"	TEXT,
	"uniprot_id"	TEXT,
	"model_version"	TEXT,
	"confidence_avg"	REAL,
	"pdb_url"	TEXT,
	"cif_url"	TEXT,
	"local_pdb_path"	TEXT,
	"status"	TEXT,
	"updated_at"	TEXT,
	PRIMARY KEY("protein_id")
);

CREATE TABLE IF NOT EXISTS "swiss_models" (
	"protein_id"	TEXT,
	"uniprot_id"	TEXT,
	"template"	TEXT,
	"qmean"	REAL,
	"gmqe"	REAL,
	"coverage"	REAL,
	"coordinates_url"	TEXT,
	"local_pdb_path"	TEXT,
	"status"	TEXT,
	"updated_at"	TEXT,
	PRIMARY KEY("protein_id")
);

CREATE INDEX IF NOT EXISTS idx_component_complex ON complex_component(complex_id);
CREATE INDEX IF NOT EXISTS idx_component_protein ON complex_component(protein_id);
CREATE INDEX IF NOT EXISTS idx_component_accession ON complex_component(component_db, component_accession);
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON complex_hierarchy(parent_complex_id);
CREATE INDEX IF NOT EXISTS idx_pubmed_complex ON complex_pubmed(complex_id);


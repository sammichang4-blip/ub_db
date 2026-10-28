-- ============================================================
-- Local Ubiquitin database schema
-- Designed for SQLite; adaptable to PostgreSQL with minor type changes (e.g., TEXT to VARCHAR).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. proteins: basic protein information (sequence and functional description from UniProt)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proteins (
    protein_id      TEXT PRIMARY KEY,      -- Internal primary key; uses the UniProt accession, e.g., P0CG47
    uniprot_acc     TEXT UNIQUE NOT NULL,  -- UniProt accession
    entry_name      TEXT,                  -- UniProt entry name, e.g., UBB_HUMAN
    gene_name       TEXT,                  -- Gene name, e.g., UBB / UBC / UBA52 / RPS27A
    protein_name    TEXT,                  -- Full protein name
    organism        TEXT,                  -- Organism, e.g., Homo sapiens
    taxon_id        INTEGER,
    sequence        TEXT NOT NULL,         -- FASTA amino acid sequence (mature protein)
    length          INTEGER,               -- Sequence length
    mol_weight      REAL,                  -- Molecular weight (Da)
    description     TEXT,                  -- Functional summary (from the UniProt Function section)
    is_polyprotein  INTEGER DEFAULT 0,     -- Whether this is a polyprotein precursor (e.g., UBB/UBC, which require cleavage)
    protein_category TEXT DEFAULT 'Protein',
    last_updated    TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 2. structures: 3D structure information (from RCSB PDB / PDBe)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS structures (
    structure_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id      TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    pdb_id          TEXT NOT NULL,         -- e.g., 1UBQ
    title           TEXT,
    method          TEXT,                  -- X-RAY DIFFRACTION / SOLUTION NMR / ELECTRON MICROSCOPY
    resolution_A    REAL,                  -- Resolution (Å); may be NULL for NMR structures
    chains          TEXT,                  -- Chain IDs, e.g., 'A' or 'A,B'
    deposit_date    TEXT,
    pdb_url         TEXT,                  -- Download URL (files.rcsb.org)
    UNIQUE(protein_id, pdb_id)
);

-- ------------------------------------------------------------
-- 3. domains: domain / motif architecture (from InterPro / Pfam / SMART / PROSITE)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
    domain_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id      TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    source_db       TEXT NOT NULL,         -- Pfam / InterPro / SMART / PROSITE
    accession       TEXT NOT NULL,         -- e.g., PF00240 (ubiquitin domain)
    domain_name     TEXT,                  -- e.g., 'Ubiquitin domain'
    start_pos       INTEGER,
    end_pos         INTEGER,
    evalue          REAL,
    description     TEXT
);

-- ------------------------------------------------------------
-- 4. go_functions: GO annotations (from Gene Ontology / GOA @ EBI)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS go_functions (
    go_row_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id      TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    go_id           TEXT NOT NULL,         -- e.g., GO:0031386
    go_term         TEXT,                  -- e.g., 'protein tag'
    aspect          TEXT,                  -- P=Biological Process, F=Molecular Function, C=Cellular Component
    evidence_code   TEXT                   -- e.g., IDA, IEA, TAS...
);

-- ------------------------------------------------------------
-- 5. enzymes: primary index for E1 / E2 / E3 / DUB
--    (from UniProt + UbiBrowser + Reactome + literature)
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
-- 6. ub_relations: E1–E2–E3–substrate ubiquitination relationship chain
--    (from UbiBrowser 2.0 / iUUCD 2.0 / PhosphoSitePlus / literature)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ub_relations (
    relation_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    e1_id             TEXT REFERENCES enzymes(enzyme_id),
    e2_id             TEXT REFERENCES enzymes(enzyme_id),
    e3_id             TEXT REFERENCES enzymes(enzyme_id),
    substrate_id      TEXT NOT NULL REFERENCES proteins(protein_id),
    ub_type           TEXT,                -- e.g., K48-linked polyUb / K63-linked / mono-Ub
    modified_lysine    TEXT,               -- Modified Lys site on the substrate, if known
    functional_outcome TEXT,               -- e.g., 'proteasomal degradation', 'signaling'
    evidence            TEXT,              -- Experimental evidence summary
    reference_pmid      TEXT,
    source_db            TEXT,             -- UbiBrowser / iUUCD / literature
    dub_id                 TEXT REFERENCES enzymes(enzyme_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_protein_gene ON proteins(gene_name);
CREATE INDEX IF NOT EXISTS idx_domain_protein ON domains(protein_id);
CREATE INDEX IF NOT EXISTS idx_structure_protein ON structures(protein_id);
CREATE INDEX IF NOT EXISTS idx_relation_substrate ON ub_relations(substrate_id);

-- ------------------------------------------------------------
-- 7. protein_alias: alternative protein names
--    (from UniProt DE fields: AltName / Short / Contains / Includes)
--    Note: RecName:Full (the primary name) is already stored in proteins.protein_name.
--    This table stores only alternative names and does not duplicate the primary name.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protein_alias (
    alias_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id   TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    alias_name   TEXT NOT NULL,
    alias_type   TEXT,                 -- e.g., RecName:Short / AltName:Full / Contains:Full
    source       TEXT DEFAULT 'UniProt',
    FOREIGN KEY(protein_id)
    REFERENCES proteins(protein_id)
    UNIQUE(protein_id, alias_name, alias_type)
);

-- ------------------------------------------------------------
-- 8. gene_alias: alternative gene names
--    (from UniProt GN field Synonyms and all Name values after the first)
--    Note: the first gene Name (the primary name) is already stored in proteins.gene_name.
--    This table stores only alternative names.
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
-- 9. identifier_table: cross-database identifier mappings
--    (all accessions from the UniProt AC field, including secondary/merged accessions,
--     and cross-references from the DR field, such as RefSeq / Ensembl / GeneID / HGNC)
--    Note: GO and PDB records are already stored in go_functions and structures,
--    respectively, so they are not duplicated here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identifier_table (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    protein_id   TEXT NOT NULL REFERENCES proteins(protein_id) ON DELETE CASCADE,
    db           TEXT NOT NULL,        -- e.g., UniProt / RefSeq / Ensembl / GeneID / HGNC ...
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
--    (stores BioGRID / IntAct records)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ubiquitin_interaction (
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
--    (used by React/Cytoscape)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS network_edge (

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
-- 12. complexes: protein complex master table (from Reactome)
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
-- 13. complex_component: complex members (many-to-many)
--    The participants field may contain UniProt proteins or ChEBI small molecules.
--    For a UniProt protein present in this database, also populate protein_id for JOINs.
--    For ChEBI entries or proteins not present in the database, leave protein_id NULL.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complex_component (
    component_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id           TEXT NOT NULL REFERENCES complexes(complex_id) ON DELETE CASCADE,
    component_db         TEXT NOT NULL,   -- UniProt / ChEBI
    component_accession  TEXT NOT NULL,   -- e.g., P08603 / 28879
    protein_id            TEXT REFERENCES proteins(protein_id),
    UNIQUE(complex_id, component_db, component_accession)
);

-- ------------------------------------------------------------
-- 14. complex_hierarchy: parent-child relationships between complexes
--    (maps the participatingComplex field, e.g., a subcomplex belonging to a larger complex)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complex_hierarchy (
    hierarchy_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    child_complex_id  TEXT NOT NULL REFERENCES complexes(complex_id) ON DELETE CASCADE,
    parent_complex_id TEXT NOT NULL,       -- e.g., R-ALL-1006146; may be a cross-species aggregate ID, so no foreign key is enforced
    UNIQUE(child_complex_id, parent_complex_id)
);

-- ------------------------------------------------------------
-- 15. complex_pubmed: a relation may have multiple evidence records
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

-- ============================================================
-- 1. protein_feature
-- ============================================================

CREATE TABLE IF NOT EXISTS protein_feature (
    feature_id INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id TEXT NOT NULL,

    feature_type TEXT NOT NULL,

    start_pos INTEGER,
    end_pos INTEGER,

    location_raw TEXT,

    uniprot_feature_id TEXT,

    raw_feature TEXT,

    source TEXT NOT NULL DEFAULT 'UniProt',
    source_version TEXT,

    FOREIGN KEY (protein_id)
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CHECK (
        start_pos IS NULL
        OR start_pos >= 1
    ),

    CHECK (
        end_pos IS NULL
        OR end_pos >= start_pos
    )
);


-- ============================================================
-- 2. feature_note
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_note (
    note_id INTEGER PRIMARY KEY AUTOINCREMENT,

    feature_id INTEGER NOT NULL,

    note_text TEXT NOT NULL,

    FOREIGN KEY (feature_id)
        REFERENCES protein_feature(feature_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- ============================================================
-- 3. feature_evidence
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_evidence (
    feature_evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,

    feature_id INTEGER NOT NULL,

    evidence_code TEXT,

    database_name TEXT,

    accession TEXT,

    raw_evidence TEXT,

    FOREIGN KEY (feature_id)
        REFERENCES protein_feature(feature_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- ============================================================
-- 4. feature_ligand
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_ligand (
    feature_ligand_id INTEGER PRIMARY KEY AUTOINCREMENT,

    feature_id INTEGER NOT NULL,

    ligand_name TEXT,

    ligand_id TEXT,

    ligand_label TEXT,

    ligand_note TEXT,

    ligand_part TEXT,

    ligand_part_id TEXT,

    ligand_part_note TEXT,

    FOREIGN KEY (feature_id)
        REFERENCES protein_feature(feature_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- ============================================================
-- INDEXES
-- ============================================================

-- protein_feature
CREATE INDEX IF NOT EXISTS idx_protein_feature_protein
ON protein_feature(protein_id);

CREATE INDEX IF NOT EXISTS idx_protein_feature_type
ON protein_feature(feature_type);

CREATE INDEX IF NOT EXISTS idx_protein_feature_protein_type
ON protein_feature(protein_id, feature_type);

CREATE INDEX IF NOT EXISTS idx_protein_feature_uniprot_id
ON protein_feature(uniprot_feature_id);


-- feature_note
CREATE INDEX IF NOT EXISTS idx_feature_note_feature
ON feature_note(feature_id);


-- feature_evidence
CREATE INDEX IF NOT EXISTS idx_feature_evidence_feature
ON feature_evidence(feature_id);

CREATE INDEX IF NOT EXISTS idx_feature_evidence_database_accession
ON feature_evidence(database_name, accession);

CREATE INDEX IF NOT EXISTS idx_feature_evidence_code
ON feature_evidence(evidence_code);


-- feature_ligand
CREATE INDEX IF NOT EXISTS idx_feature_ligand_feature
ON feature_ligand(feature_id);

CREATE INDEX IF NOT EXISTS idx_feature_ligand_id
ON feature_ligand(ligand_id);

CREATE INDEX IF NOT EXISTS idx_feature_ligand_part_id
ON feature_ligand(ligand_part_id);


-- ============================================================
-- UNIQUE INDEXES
-- ============================================================

-- A UniProt feature ID should be unique within a protein.
CREATE UNIQUE INDEX IF NOT EXISTS
idx_protein_feature_uniprot_id_unique
ON protein_feature(protein_id, uniprot_feature_id)
WHERE uniprot_feature_id IS NOT NULL;


-- Prevent duplicated notes for the same feature.
CREATE UNIQUE INDEX IF NOT EXISTS
idx_feature_note_unique
ON feature_note(feature_id, note_text);


-- Prevent duplicated evidence for the same feature.
CREATE UNIQUE INDEX IF NOT EXISTS
idx_feature_evidence_unique
ON feature_evidence(
    feature_id,
    evidence_code,
    database_name,
    accession
);
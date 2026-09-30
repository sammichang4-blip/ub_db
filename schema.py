# ============================================================
# UKW - Ubiquitin Knowledge Warehouse
# SQLite Database Schema
#
# Human-only data pipeline
#
# Main data layers:
#   1. proteins
#   2. structures
#   3. domains
#   4. go_functions
#   5. enzymes
#   6. ub_relations
#   7. protein_alias
#   8. gene_alias
#   9. identifier_table
#  10. ubiquitin_interaction
#  11. network_edge
#  12. complexes
#  13. complex_component
#  14. complex_hierarchy
#  15. complex_pubmed
#  16. source_database
#
# Sources:
#   UniProt
#   Reactome
#   UbiBrowser
#   BioGRID
#   PhosphoSitePlus
#   CORUM
#   IntAct
#   STRING
#
# ============================================================

from db import get_connection


SCHEMA = r"""

PRAGMA foreign_keys = ON;


-- ============================================================
-- 1. proteins
-- ============================================================
-- Core protein table.
-- Primary identity = UniProt accession.
-- Human proteins only.
-- ============================================================

CREATE TABLE IF NOT EXISTS proteins (

    protein_id      TEXT PRIMARY KEY,

    uniprot_acc     TEXT UNIQUE NOT NULL,

    entry_name      TEXT,

    gene_name       TEXT,

    protein_name    TEXT,

    organism        TEXT,

    taxon_id        INTEGER,

    sequence        TEXT NOT NULL,

    length          INTEGER,

    mol_weight      REAL,

    description     TEXT,

    is_polyprotein  INTEGER DEFAULT 0,

    last_updated    TEXT DEFAULT (datetime('now'))
);


CREATE INDEX IF NOT EXISTS idx_protein_acc
ON proteins(uniprot_acc);


CREATE INDEX IF NOT EXISTS idx_protein_gene
ON proteins(gene_name);


CREATE INDEX IF NOT EXISTS idx_protein_taxon
ON proteins(taxon_id);


-- ============================================================
-- 2. structures
-- ============================================================
-- Protein structure information.
-- Sources:
--   RCSB PDB
--   PDBe
-- ============================================================

CREATE TABLE IF NOT EXISTS structures (

    structure_id    INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id      TEXT NOT NULL
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE,

    pdb_id          TEXT NOT NULL,

    title           TEXT,

    method          TEXT,

    resolution_A    REAL,

    chains          TEXT,

    deposit_date    TEXT,

    pdb_url         TEXT,

    UNIQUE(
        protein_id,
        pdb_id
    )
);


CREATE INDEX IF NOT EXISTS idx_structure_protein
ON structures(protein_id);


CREATE INDEX IF NOT EXISTS idx_structure_pdb
ON structures(pdb_id);


-- ============================================================
-- 3. domains
-- ============================================================
-- Domain / motif annotation.
--
-- Sources:
--   InterPro
--   Pfam
--   SMART
--   PROSITE
-- ============================================================

CREATE TABLE IF NOT EXISTS domains (

    domain_id       INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id      TEXT NOT NULL
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE,

    source_db       TEXT NOT NULL,

    accession       TEXT NOT NULL,

    domain_name     TEXT,

    start_pos       INTEGER,

    end_pos         INTEGER,

    evalue          REAL,

    description     TEXT
);


CREATE INDEX IF NOT EXISTS idx_domain_protein
ON domains(protein_id);


CREATE INDEX IF NOT EXISTS idx_domain_source
ON domains(source_db);


CREATE INDEX IF NOT EXISTS idx_domain_accession
ON domains(accession);


-- ============================================================
-- 4. go_functions
-- ============================================================
-- Gene Ontology annotation.
--
-- Source:
--   GO / GOA / UniProt
-- ============================================================

CREATE TABLE IF NOT EXISTS go_functions (

    go_row_id       INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id      TEXT NOT NULL
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE,

    go_id           TEXT NOT NULL,

    go_term         TEXT,

    aspect          TEXT,

    evidence_code   TEXT,

    UNIQUE(
        protein_id,
        go_id,
        aspect,
        evidence_code
    )
);


CREATE INDEX IF NOT EXISTS idx_go_protein
ON go_functions(protein_id);


CREATE INDEX IF NOT EXISTS idx_go_id
ON go_functions(go_id);


-- ============================================================
-- 5. enzymes
-- ============================================================
-- E1 / E2 / E3 / DUB
--
-- enzyme_id = UniProt accession
--
-- Human only.
-- ============================================================

CREATE TABLE IF NOT EXISTS enzymes (

    enzyme_id          TEXT PRIMARY KEY,

    gene_name          TEXT,

    protein_name       TEXT,

    enzyme_class       TEXT NOT NULL
        CHECK (
            enzyme_class IN
            ('E1','E2','E3','DUB')
        ),

    enzyme_subfamily   TEXT,

    organism           TEXT
);


CREATE INDEX IF NOT EXISTS idx_enzyme_class
ON enzymes(enzyme_class);


CREATE INDEX IF NOT EXISTS idx_enzyme_gene
ON enzymes(gene_name);


CREATE INDEX IF NOT EXISTS idx_enzyme_subfamily
ON enzymes(enzyme_subfamily);


-- ============================================================
-- 6. ub_relations
-- ============================================================
-- Main biological ubiquitination relationship table.
--
-- E1 → E2 → E3 → Substrate
-- DUB → Substrate
--
-- IMPORTANT:
-- A relation can have:
--
--   e1_id
--   e2_id
--   e3_id
--   substrate_id
--   dub_id
--
-- depending on the evidence available from the source.
--
-- Sources:
--   UbiBrowser
--   PhosphoSitePlus
--   Reactome
--   literature
-- ============================================================

CREATE TABLE ub_relations (

    relation_id INTEGER PRIMARY KEY AUTOINCREMENT,

    e1_id TEXT REFERENCES enzymes(enzyme_id),
    e2_id TEXT REFERENCES enzymes(enzyme_id),
    e3_id TEXT REFERENCES enzymes(enzyme_id),

    dub_id TEXT REFERENCES enzymes(enzyme_id),

    substrate_id TEXT NOT NULL
        REFERENCES proteins(protein_id),

    ub_type TEXT,

    modified_lysine TEXT,

    functional_outcome TEXT,

    evidence TEXT,

    evidence_type TEXT,

    confidence REAL,

    reference_pmid TEXT,

    source_db TEXT,

    source_record_id TEXT,

    source_url TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_relation_substrate
ON ub_relations(substrate_id);


CREATE INDEX IF NOT EXISTS idx_relation_e1
ON ub_relations(e1_id);


CREATE INDEX IF NOT EXISTS idx_relation_e2
ON ub_relations(e2_id);


CREATE INDEX IF NOT EXISTS idx_relation_e3
ON ub_relations(e3_id);


CREATE INDEX IF NOT EXISTS idx_relation_dub
ON ub_relations(dub_id);


CREATE INDEX IF NOT EXISTS idx_relation_source
ON ub_relations(source_db);


CREATE INDEX IF NOT EXISTS idx_relation_pmid
ON ub_relations(reference_pmid);


CREATE INDEX IF NOT EXISTS idx_relation_ubtype
ON ub_relations(ub_type);


CREATE INDEX IF NOT EXISTS idx_relation_lysine
ON ub_relations(modified_lysine);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_ub_relation_unique
ON ub_relations (
    COALESCE(e1_id, ''),
    COALESCE(e2_id, ''),
    COALESCE(e3_id, ''),
    COALESCE(dub_id, ''),
    COALESCE(substrate_id, ''),
    COALESCE(ub_type, ''),
    COALESCE(modified_lysine, ''),
    COALESCE(source_db, ''),
    COALESCE(source_record_id, '')
);
-- ============================================================
-- 7. protein_alias
-- ============================================================
-- Alternative protein names.
--
-- Source:
--   UniProt
--
-- Main RecName:Full is already stored in proteins.protein_name.
-- ============================================================

CREATE TABLE IF NOT EXISTS protein_alias (

    alias_id       INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id     TEXT NOT NULL
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE,

    alias_name     TEXT NOT NULL,

    alias_type     TEXT,

    source         TEXT DEFAULT 'UniProt',

    UNIQUE(
        protein_id,
        alias_name,
        alias_type
    )
);


CREATE INDEX IF NOT EXISTS idx_protein_alias_protein
ON protein_alias(protein_id);


CREATE INDEX IF NOT EXISTS idx_protein_alias_name
ON protein_alias(alias_name);


-- ============================================================
-- 8. gene_alias
-- ============================================================
-- Alternative gene names.
--
-- Source:
--   UniProt GN
-- ============================================================

CREATE TABLE IF NOT EXISTS gene_alias (

    alias_id       INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id     TEXT NOT NULL
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE,

    gene_alias     TEXT NOT NULL,

    source         TEXT DEFAULT 'UniProt',

    UNIQUE(
        protein_id,
        gene_alias
    )
);


CREATE INDEX IF NOT EXISTS idx_gene_alias_protein
ON gene_alias(protein_id);


CREATE INDEX IF NOT EXISTS idx_gene_alias_name
ON gene_alias(gene_alias);


-- ============================================================
-- 9. identifier_table
-- ============================================================
-- Cross-database identifiers.
--
-- Examples:
--
--   UniProt
--   RefSeq
--   Ensembl
--   GeneID
--   HGNC
--   STRING
--   BioGRID
--   IntAct
--   Reactome
--   etc.
--
-- GO and PDB are NOT duplicated here because they have
-- dedicated tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS identifier_table (

    id           INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_id   TEXT NOT NULL
        REFERENCES proteins(protein_id)
        ON DELETE CASCADE,

    db           TEXT NOT NULL,

    identifier   TEXT NOT NULL,

    UNIQUE(
        protein_id,
        db,
        identifier
    )
);


CREATE INDEX IF NOT EXISTS idx_identifier_protein
ON identifier_table(protein_id);


CREATE INDEX IF NOT EXISTS idx_identifier_db_id
ON identifier_table(
    db,
    identifier
);


-- ============================================================
-- 10. ubiquitin_interaction
-- ============================================================
-- Experimental interaction evidence.
--
-- Sources:
--   BioGRID
--   IntAct
--   STRING
--
-- This table is intentionally separated from ub_relations.
--
-- ub_relations =
--     biological ubiquitination relationship
--
-- ubiquitin_interaction =
--     experimental / PPI evidence
-- ============================================================

CREATE TABLE IF NOT EXISTS ubiquitin_interaction (

    interaction_id INTEGER PRIMARY KEY AUTOINCREMENT,

    protein_a TEXT NOT NULL
        REFERENCES proteins(protein_id),

    protein_b TEXT NOT NULL
        REFERENCES proteins(protein_id),

    interaction_type TEXT NOT NULL,

    direction TEXT,

    experimental_system TEXT,

    experimental_system_type TEXT,

    evidence TEXT,

    evidence_type TEXT,
    confidence TEXT,
    confidence_type TEXT,

    score REAL,

    modification TEXT,

    source_db TEXT,
    source_record_id    TEXT,
    source_url  TEXT,

    reference_pmid TEXT,

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(
        protein_a,
        protein_b,
        interaction_type,
        source_db,
        reference_pmid
    )
);


CREATE INDEX IF NOT EXISTS idx_interaction_a
ON ubiquitin_interaction(protein_a);


CREATE INDEX IF NOT EXISTS idx_interaction_b
ON ubiquitin_interaction(protein_b);


CREATE INDEX IF NOT EXISTS idx_interaction_type
ON ubiquitin_interaction(interaction_type);


CREATE INDEX IF NOT EXISTS idx_interaction_source
ON ubiquitin_interaction(source_db);


CREATE INDEX IF NOT EXISTS idx_interaction_pmid
ON ubiquitin_interaction(reference_pmid);


-- ============================================================
-- 11. network_edge
-- ============================================================
-- Derived table for Cytoscape / React frontend.
--
-- This table should be generated from:
--
--   ub_relations
--   ubiquitin_interaction
--   complexes
--
-- It is NOT the primary evidence table.
-- ============================================================

CREATE TABLE IF NOT EXISTS network_edge (

    edge_id INTEGER PRIMARY KEY AUTOINCREMENT,

    source_id TEXT
        REFERENCES proteins(protein_id),

    target_id TEXT
        REFERENCES proteins(protein_id),

    edge_type TEXT,

    direction TEXT,

    confidence TEXT,

    evidence_count INTEGER,

    source_db TEXT,

    UNIQUE(
        source_id,
        target_id,
        edge_type,
        source_db
    )
);


CREATE INDEX IF NOT EXISTS idx_network_source
ON network_edge(source_id);


CREATE INDEX IF NOT EXISTS idx_network_target
ON network_edge(target_id);


CREATE INDEX IF NOT EXISTS idx_network_type
ON network_edge(edge_type);


-- ============================================================
-- 12. complexes
-- ============================================================
-- Protein complex master table.
--
-- Main source:
--   CORUM
--   Reactome
--
-- complex_id should preferably preserve source identifier.
--
-- Examples:
--   R-HSA-xxxxx
--   CORUM:xxxxx
-- ============================================================

CREATE TABLE IF NOT EXISTS complexes (

    complex_id     TEXT PRIMARY KEY,

    complex_name   TEXT NOT NULL,

    organism       TEXT,

    source_db      TEXT
);


CREATE INDEX IF NOT EXISTS idx_complex_source
ON complexes(source_db);


CREATE INDEX IF NOT EXISTS idx_complex_organism
ON complexes(organism);


-- ============================================================
-- 13. complex_component
-- ============================================================
-- Complex ↔ protein relationship.
--
-- component_db:
--   UniProt
--   ChEBI
--   CORUM
--   etc.
--
-- For human protein components:
--   protein_id = UniProt accession
-- ============================================================

CREATE TABLE IF NOT EXISTS complex_component (

    component_id        INTEGER PRIMARY KEY AUTOINCREMENT,

    complex_id           TEXT NOT NULL
        REFERENCES complexes(complex_id)
        ON DELETE CASCADE,

    component_db         TEXT NOT NULL,

    component_accession  TEXT NOT NULL,

    protein_id           TEXT
        REFERENCES proteins(protein_id),

    UNIQUE(
        complex_id,
        component_db,
        component_accession
    )
);


CREATE INDEX IF NOT EXISTS idx_component_complex
ON complex_component(complex_id);


CREATE INDEX IF NOT EXISTS idx_component_protein
ON complex_component(protein_id);


CREATE INDEX IF NOT EXISTS idx_component_accession
ON complex_component(
    component_db,
    component_accession
);


-- ============================================================
-- 14. complex_hierarchy
-- ============================================================
-- Complex → parent complex
--
-- Reactome:
--   participatingComplex
--
-- parent_complex_id is intentionally NOT a foreign key because
-- it can point to a generic R-ALL identifier.
-- ============================================================

CREATE TABLE IF NOT EXISTS complex_hierarchy (

    hierarchy_id      INTEGER PRIMARY KEY AUTOINCREMENT,

    child_complex_id  TEXT NOT NULL
        REFERENCES complexes(complex_id)
        ON DELETE CASCADE,

    parent_complex_id TEXT NOT NULL,

    UNIQUE(
        child_complex_id,
        parent_complex_id
    )
);


CREATE INDEX IF NOT EXISTS idx_hierarchy_child
ON complex_hierarchy(child_complex_id);


CREATE INDEX IF NOT EXISTS idx_hierarchy_parent
ON complex_hierarchy(parent_complex_id);


-- ============================================================
-- 15. complex_pubmed
-- ============================================================
-- Complex ↔ PubMed references.
-- ============================================================

CREATE TABLE IF NOT EXISTS complex_pubmed (

    id           INTEGER PRIMARY KEY AUTOINCREMENT,

    complex_id   TEXT NOT NULL
        REFERENCES complexes(complex_id)
        ON DELETE CASCADE,

    pubmed_id    TEXT NOT NULL,

    UNIQUE(
        complex_id,
        pubmed_id
    )
);


CREATE INDEX IF NOT EXISTS idx_pubmed_complex
ON complex_pubmed(complex_id);


CREATE INDEX IF NOT EXISTS idx_pubmed_id
ON complex_pubmed(pubmed_id);


-- ============================================================
-- 16. source_database
-- ============================================================
-- Optional but strongly recommended.
--
-- Records which database contributed which record.
--
-- This allows:
--
--   UbiBrowser
--   BioGRID
--   IntAct
--   STRING
--   Reactome
--   PhosphoSitePlus
--   CORUM
--
-- to be merged without creating duplicate biological records.
-- ============================================================
CREATE TABLE IF NOT EXISTS source_database (

    source_id INTEGER PRIMARY KEY AUTOINCREMENT,

    source_name TEXT NOT NULL,

    source_version TEXT,

    download_url TEXT,

    downloaded_at TIMESTAMP,

    record_count INTEGER DEFAULT 0,

    status TEXT DEFAULT 'SUCCESS'
        CHECK (
            status IN (
                'SUCCESS',
                'FAILED',
                'PARTIAL',
                'DOWNLOADING'
            )
        ),

    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
        source_name,
        source_version
    )
);

CREATE INDEX IF NOT EXISTS
idx_source_database_name
ON source_database(source_name);


CREATE INDEX IF NOT EXISTS
idx_source_database_status
ON source_database(status);


CREATE INDEX IF NOT EXISTS
idx_source_database_updated
ON source_database(updated_at);


"""


def init_db():

    conn = get_connection()

    try:

        # SQLite foreign key enforcement is connection-specific.
        conn.execute("PRAGMA foreign_keys = ON;")

        conn.executescript(SCHEMA)

        conn.commit()

    finally:

        conn.close()


if __name__ == "__main__":

    init_db()

    print("============================================================")
    print("UKW database initialized successfully.")
    print("Human-only schema ready.")
    print("============================================================")
# ubiquitin_web — Ubiquitin Knowledge Warehouse (UKW)

An integrated knowledge base and web platform for the ubiquitin and ubiquitin-like (UBL) systems.
It combines UniProt, InterPro/Pfam, GO, PDB, Reactome, BioGRID, IntAct, CORUM and PhosphoSitePlus into a queryable
knowledge graph, with protein search, E1–E2–E3–substrate networks, 3D structures, domain architecture,
GO/organelle mapping, and a sequence-plus-3D analysis window.

[Project README](README.md)

> Developer: Sammi Chang (Institute of Biological Chemistry, Academia Sinica)
> Status: prototype, under active development. The interface is in English.

## Features

| Module | Description |
|---|---|
| Search | By gene, protein name, alias or any integrated identifier (normalized to UniProt via `identifier_table`); matches are highlighted |
| Enzyme classes | Browse all E1/E2/E3/DUB members; E3 and DUB can be filtered by subfamily, or to proteins without an experimental PDB |
| Relation network | Cytoscape.js; distinct shape and color for E1/E2/E3/DUB/substrate; click a node to expand; 7 layouts; full-screen and PNG export |
| 3D structure | Mol\*; PDB first, then AlphaFold, AlphaFill, SWISS-MODEL; pop-out viewer |
| Domain architecture | One track per source database (InterPro, Pfam, Gene3D, CDD, SMART, …); Domain Explorer with 3D |
| GO / cell mapping | Subcellular diagram beside GO terms (F/P/C); Cellular Component terms light up organelles; two-way hover |
| Papers | PubMed, ranked by relevance, filterable by year |
| Sequence | UniProt feature categories, ubiquitination sites; expandable to a sequence + 3D + feature-list window |
| Relation chains | E1 → E2 → E3 → substrate with modified Lys, chain type, outcome, evidence and PMIDs |

Before a structure is handed to Mol\*, the file content is downloaded and sniffed (PDB/mmCIF); a 404 page or empty body is reported directly.

## Data

Prototype figures from the CV (the database is authoritative): 20,652 proteins · 202,735 relations (PPI, E3–substrate, DUB–substrate) · 134,145 parsed PDB records.

Sources: UniProt · InterPro/Pfam · GO/GOA · RCSB PDB, AlphaFold DB, AlphaFill, SWISS-MODEL · BioGRID, IntAct, CORUM, Reactome ·
PhosphoSitePlus · PubMed · SwissBioPics · PDBe SIFTS · EBI QuickGO. Each source has its own license.

## Architecture

```
Sources ─► ETL (Python / Biopython) ─► SQLite ─► Flask ─► Browser (plain JavaScript)
                                          │                 ├─ Cytoscape.js
                                          └─ planned: PostgreSQL ├─ Mol*
                                                            └─ SwissBioPics SVG
```

PubMed relevance uses protein/gene names and aliases plus domain-keyword scoring. The backend maps GO Cellular Component terms to SwissBioPics SL IDs (`sl_ids`).

### Front-end files

| File | Content |
|---|---|
| `01` constants | `LYSINE_SITES`, `FEATURE_CATEGORIES` |
| `02` state | DOM references and global state |
| `03-utils.js` | `cacheDOM()`, `escapeHtml()`, … |
| `04` viewer | Mol\* init/load, structure modal, `/structure-viewer` |
| `05` search | Search, protein loading, enzyme classes and filters |
| `06` renderers | Structure tables, GO/cell view, relation chains |
| `07-papers-sequence.js` | Description, papers, sequence track |
| `07b-evidence.js` | ECO names and evidence links |
| `07c-sequence-popup.js` | Sequence + Mol\* analysis window |
| `08-detail.js` | `renderDetail()` |
| `09` network | Cytoscape network |
| `10` main | Entry point |
| `11-domain.js` | Domain architecture and Domain Explorer |

Constants, state and utils must load first; the entry point last. File names other than `03-utils.js`, `08-detail.js` and `11-domain.js` are inferred from file headers.

## Routes

| Route | Description |
|---|---|
| `GET /api/search?q=` | Search |
| `GET /api/protein/<id>` | One protein with features (notes, evidence, ligands), structures, domains, GO, relations, papers |
| `GET /api/enzyme/<class>` | Members of E1/E2/E3/DUB with `enzyme_subfamily`, `has_pdb` |
| `GET /api/network/<gene>?level=1\|2` | Network nodes and edges |
| GO API (`GO_API_URL` in the page) | GO terms for the cell view |
| `GET /network/<gene>`, `/structure-viewer?url=`, `/protein/<id>/cell-view` | Pop-out pages |

The CV lists 6 endpoints; the table is derived from the front-end code. Add the actual GO API path and any others.

## Quick start

Generic Flask steps; adjust to your setup.

```bash
git clone <repo-url> ubiquitin_web && cd ubiquitin_web
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
flask run            # or: python app.py
```

Mol\* 5.10.1 is used; pin the version. Put the viewer build in `static/molstar/` and expose it:

```html
<script>
  window.MOLSTAR_JS  = "{{ url_for('static', filename='molstar/molstar.js') }}";
  window.MOLSTAR_CSS = "{{ url_for('static', filename='molstar/molstar.css') }}";
</script>
```

ETL downloads large files: keep the machine awake and verify the files are complete.

## Expanded sequence + 3D window

Feature categories with per-type filters and colors; one-click selection of all positions of a type; two-way linking between sequence, list and 3D;
evidence with ECO names and PubMed links; Ub/UBL sites (from `ub_relations` and UniProt `CROSSLNK`) colored by chain type, including SUMO, NEDD8, ISG15 and others;
SIFTS mapping between UniProt and PDB numbering; Lys solvent accessibility with pLDDT filtering; nearby ligands; waters hidden;
structure switching that follows the main page; regular-expression motif search; distance measurement.

## Tests

A browser-free suite (jsdom with a fake Mol\*) covers the expanded window: `cd tests && npm install && npm test`.
It does not cover real Mol\* behavior, layout or external services, and the other modules (search, network, domain, cell GO) have no automated tests.

## Roadmap (planned, not implemented)

PostgreSQL migration · LLM-based literature extraction and RAG · knowledge-graph reasoning (GNN link prediction, embeddings) ·
scientific AI agent and protein foundation models · export (CSV, FASTA, PyMOL/ChimeraX), all-residue accessibility, variant structural impact, secondary-structure and domain tracks.

## Known limitations

- **Main-page domain/residue highlight (`highlightStructureRange`)** passes UniProt positions straight to `auth_seq_id` with no numbering conversion, and in Mol\* 5.10.1 `structureInteractivity` selected the whole structure in the expanded window tests. The main page uses the same call, so it likely has the same problem. The expanded window now uses SIFTS mapping and its own selection builder, which could be ported.
- Single-developer prototype; not validated for multi-user deployment.
- SASA and distances come from the loaded coordinates; unreliable in low-confidence AlphaFold regions and not benchmarked against FreeSASA.
- UniProt `CROSSLNK` does not state the chain type; it can only be inferred for ubiquitin itself (UBB, UBC, UBA52, RPS27A).
- A buried known site is not necessarily an error.
- Depends on PDBe SIFTS and QuickGO.

## License and citation

Code license: (to be added). Data: per each source's terms. Citation: (to be added).

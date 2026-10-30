#!/usr/bin/env python3
"""
app.py - Ubiquitin local query database web interface
Usage:
    pip install flask --break-system-packages
    python seed_data.py      # Create/fill the database first
    python app.py            # Start the server; default is http://127.0.0.1:5050
"""

import sqlite3
import os
import json
from urllib.parse import unquote
from flask import Flask, jsonify, render_template, request, g , abort
from flask import send_from_directory
import posixpath

# --- Added: Cell GO Viewer GO term -> SVG organelle ID mapping table ---
from go_sl_mapping import annotate_go_terms, map_go_term_to_sl


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "data/db", "ubiquitin.db"))

# File system path: send_from_directory locates the actual .pdb / .cif files.
# Build an absolute path with BASE_DIR so Flask can find the files regardless of the working directory.
PDB_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "pdb"))
CIF_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "cif"))
ALPHAFOLD_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "alphafold"))
SWISS_MODEL_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "swiss_model"))

# URL path allowlist: validates the value passed via /structure-viewer?url=...
# corresponding to routes /data/pdb/<filename> and /data/cif/<filename>
# independent of the actual disk location of PDB_DIR; keep the URL prefix and do not use "../"
ALLOWED_STRUCTURE_PREFIXES = (
    "/data/pdb/",
    "/data/cif/",
    "/data/alphafold/",
    "/data/swiss_model/",
)

app = Flask(__name__)

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

@app.route("/")
def index():
    return render_template("index.html")

def _is_safe_structure_url(url: str) -> bool:
    """Only allow same-site relative paths pointing to the PDB/CIF static directories;
    reject external domains, protocol-relative URLs (//host/...), and path traversal."""
    if not url or "://" in url or url.startswith("//"):
        return False
    if not url.startswith(ALLOWED_STRUCTURE_PREFIXES):
        return False
    normalized = posixpath.normpath(url)
    return normalized.startswith(ALLOWED_STRUCTURE_PREFIXES)


@app.route("/structure-viewer")
def structure_viewer():
    raw_url = request.args.get("url", "")
    pdb_url = unquote(raw_url)

    if not _is_safe_structure_url(pdb_url):
        abort(400, description="Invalid or disallowed structure URL")

    try:
        requested_structures = json.loads(request.args.get("structures", "[]"))
    except json.JSONDecodeError:
        abort(400, description="Invalid structure choices")

    structure_sources = {"pdb", "alphafold", "alphafill", "swiss_model"}
    structure_options = []
    if isinstance(requested_structures, list):
        for choice in requested_structures:
            if not isinstance(choice, dict):
                continue
            url = choice.get("url")
            source = choice.get("source")
            if not isinstance(url, str) or not _is_safe_structure_url(url):
                continue
            if not isinstance(source, str) or source not in structure_sources:
                continue
            structure_options.append({
                "label": str(choice.get("label") or source),
                "url": url,
                "source": source,
            })

    if not any(choice["url"] == pdb_url for choice in structure_options):
        source = request.args.get("source", "")
        if source not in structure_sources:
            source = "pdb"
        structure_options.insert(0, {
            "label": source,
            "url": pdb_url,
            "source": source,
        })

    return render_template(
        "pdb.html",
        pdb_url=pdb_url,
        structure_source=request.args.get("source", ""),
        protein_name=request.args.get("protein", ""),
        gene_name=request.args.get("gene", ""),
        uniprot_acc=request.args.get("uniprot", ""),
        entry_name=request.args.get("entry", ""),
        organism=request.args.get("organism", ""),
        protein_length=request.args.get("length", ""),
        structure_options=structure_options,
    )


# Keep the legacy route for the case where only the PDB ID is known (for example, a shared link),
# so it can construct the correct path itself instead of treating the bare ID as a URL
@app.route("/pdb/<pdbid>")
def pdb_viewer(pdbid):
    pdb_url = f"/data/pdb/{pdbid}.pdb"
    return render_template(
        "pdb.html",
        pdb_url=pdb_url,
        structure_source="pdb",
        protein_name="",
        gene_name="",
        uniprot_acc="",
        entry_name="",
        organism="",
        protein_length="",
        structure_options=[{"label": pdbid, "url": pdb_url, "source": "pdb"}],
    )

@app.route("/data/pdb/<filename>")
def serve_pdb(filename):
    print("PDB request:", filename)
    return send_from_directory(
        PDB_DIR,
        filename,
        mimetype="chemical/x-pdb"
    )

@app.route("/data/cif/<filename>")
def serve_cif(filename):
    print("CIF request:", filename)
    return send_from_directory(
        CIF_DIR,
        filename,
        mimetype="chemical/x-mmcif"
    )


@app.route("/data/alphafold/<filename>")
def serve_alphafold_structure(filename):
    return send_from_directory(
        ALPHAFOLD_DIR,
        filename,
        mimetype="chemical/x-pdb",
    )


@app.route("/data/swiss_model/<filename>")
def serve_swiss_model_structure(filename):
    return send_from_directory(
        SWISS_MODEL_DIR,
        filename,
        mimetype="chemical/x-pdb",
    )

@app.route("/network/<gene>")
def show_network(gene):
    return render_template(
        "network.html",
        protein=gene
    )

@app.route("/api/network/<gene>")
def network(gene):

    limit = 500
    level = request.args.get("level", default=1, type=int)

    db = get_db()

    nodes = {}
    edges = {}

    if level == 1:
        sql = """
        SELECT e1_id, e2_id, e3_id, substrate_id, dub_id, functional_outcome
        FROM ub_relations
        WHERE (e1_id=? OR e2_id=? OR e3_id=? OR substrate_id=? OR dub_id=?) AND (functional_outcome ="Ubiquitination" OR functional_outcome ="Deubiquitination")
        LIMIT ?
        """
        rows = db.execute(sql, (gene, gene, gene, gene, gene, limit)).fetchall()
    else:
        sql = """
        SELECT e1_id, e2_id, e3_id, substrate_id, dub_id
        FROM ub_relations
        WHERE (e3_id=? OR substrate_id=?) AND (functional_outcome ="Ubiquitination" OR functional_outcome ="Deubiquitination")
        LIMIT ?
        """
        rows = db.execute(sql, (gene, gene, limit)).fetchall()

    def add_node(name, node_type):
        if name is None:
            return
        if name not in nodes:
            nodes[name] = {
                "id": name,
                "type": node_type,      # Keep a single type field for the frontend
                "_roles": [node_type],  # Internal list (serializable) tracking all roles
            }
        elif node_type not in nodes[name]["_roles"]:
            nodes[name]["_roles"].append(node_type)

    def add_edge(source, target, interaction_type):
        if not source or not target:
            return
        edge_id = f"{source}-{target}-{interaction_type}"
        edges[edge_id] = {
            "id": edge_id,
            "source": source,
            "target": target,
            "interaction_type": interaction_type,
        }

    for r in rows:
        e1, e2, e3 = r["e1_id"], r["e2_id"], r["e3_id"]
        sub, dub = r["substrate_id"], r["dub_id"]

        if e1: add_node(e1, "E1")
        if e2: add_node(e2, "E2")
        if e3: add_node(e3, "E3")
        if sub: add_node(sub, "substrate")
        if dub: add_node(dub, "DUB")

        add_edge(e1, e2, "E1-E2")
        add_edge(e2, e3, "E2-E3")
        add_edge(e3, sub, "E3-substrate")
        add_edge(dub, sub, "DUB-substrate")

    # Query how many complexes each node belongs to
    if nodes:
        placeholders = ",".join(["?"] * len(nodes))
        count_sql = f"""
            SELECT gene_name, COUNT(DISTINCT complex_id) AS cnt
            FROM complex_members
            WHERE gene_name IN ({placeholders})
            GROUP BY gene_name
        """
        count_rows = db.execute(count_sql, list(nodes.keys())).fetchall()
        counts = {r["gene_name"]: r["cnt"] for r in count_rows}

        for name, node in nodes.items():
            roles = node.pop("_roles")
            node["label"] = f"{name}\n({'/'.join(sorted(roles))})"
            node["type"] = "/".join(sorted(roles))  # If a node has multiple roles, update type as well
            node["complex_count"] = counts.get(name, 0)

    return jsonify({
        "nodes": list(nodes.values()),
        "edges": list(edges.values()), 
        "level": level,
        "count": len(nodes)
    })

@app.route("/api/ubiquitin-interaction")
def ubiquitin_interaction():
    protein_a = request.args.get("protein_a")
    protein_b = request.args.get("protein_b")
    interaction_type = request.args.get("interaction_type")

    if not protein_a or not protein_b or not interaction_type:
        return jsonify({"error": "Missing protein_a / protein_b / interaction_type"}), 400

    db = get_db()
    sql = """

    SELECT
        protein_a,
        protein_b,
        interaction_type,
        direction,
        experimental_system,
        experimental_system_type,
        evidence,
        confidence,
        score,
        modification,
        source_db,
        reference_pmid

    FROM ubiquitin_interaction

    WHERE
        interaction_type = ?
        AND (
            (protein_a=? AND protein_b=?)
            OR
            (protein_a=? AND protein_b=?)
        )

    ORDER BY
        CASE confidence
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
        END,
        score DESC

    """

    rows = db.execute(
        sql,
        (
            interaction_type,
            protein_a,
            protein_b,
            protein_b,
            protein_a
        )
    ).fetchall()

    results = [dict(r) for r in rows]

    return jsonify(results)

@app.route("/api/complexes/<gene_name>")
def api_complexes(gene_name):

    db = get_db()

    sql = """
        SELECT
            c.complex_id,
            c.complex_name,
            c.synonyms,
            c.organism,
            c.cell_line,
            c.pmid,
            c.comment_complex,
            c.comment_disease,
            c.comment_drug,
            c.purification_methods,
            c.source_db,
            c.functions_pmid,
            c.functions_go_name,

            cm.gene_name,
            cm.protein_name,
            cm.complex_role,
            cm.stoichiometry

        FROM complex_members cm

        JOIN complexes c
            ON cm.complex_id = c.complex_id

        WHERE cm.gene_name = ?

        ORDER BY c.complex_name
    """

    rows = db.execute(sql, (gene_name,)).fetchall()

    return jsonify([dict(r) for r in rows])

@app.route("/api/enzyme/<enzyme_class>")
def get_enzyme_class(enzyme_class):

    db = get_db()

    # -------------------------
    # E1 / E2 / E3 / DUB
    # -------------------------
    if enzyme_class in ("E1", "E2", "E3", "DUB"):

        rows = db.execute(
            """
            SELECT
                p.protein_id,
                p.gene_name,
                p.protein_name,
                p.uniprot_acc,
                e.enzyme_class,
                e.enzyme_subfamily,

                CASE
                    WHEN COUNT(s.protein_id) > 0 THEN 1
                    ELSE 0
                END AS has_pdb

            FROM enzymes e

            JOIN proteins p
                ON p.protein_id = e.enzyme_id

            LEFT JOIN structures s
                ON s.protein_id = p.protein_id
                AND s.pdb_id IS NOT NULL

            WHERE e.enzyme_class = ?

            GROUP BY
                p.protein_id,
                p.gene_name,
                p.protein_name,
                p.uniprot_acc,
                e.enzyme_class,
                e.enzyme_subfamily

            ORDER BY p.gene_name;
            """,
            (enzyme_class,)
        ).fetchall()

    # -------------------------
    # Ubiquitin / UBL
    # -------------------------
    elif enzyme_class in ("UBL", "UB"):

        if enzyme_class == "UB":
            rows = db.execute(
                """
                SELECT
                    p.protein_id,
                    p.gene_name,
                    p.protein_name,
                    p.uniprot_acc,
                    p.protein_category,
                    CASE WHEN COUNT(s.protein_id) > 0 THEN 1 ELSE 0 END AS has_pdb
                FROM proteins p
                LEFT JOIN structures s
                    ON s.protein_id = p.protein_id
                    AND s.pdb_id IS NOT NULL
                WHERE p.protein_category = 'Ubiquitin'
                GROUP BY p.protein_id, p.gene_name, p.protein_name,
                        p.uniprot_acc, p.protein_category
                ORDER BY p.gene_name;
                """
            ).fetchall()

        else:  # UBL
            rows = db.execute(
                """
                SELECT
                    p.protein_id,
                    p.gene_name,
                    p.protein_name,
                    p.uniprot_acc,
                    p.protein_category,
                    CASE WHEN COUNT(s.protein_id) > 0 THEN 1 ELSE 0 END AS has_pdb
                FROM proteins p
                LEFT JOIN structures s
                    ON s.protein_id = p.protein_id
                    AND s.pdb_id IS NOT NULL
                WHERE p.protein_category IN ('UBL', 'Non-conjugatable UBL')
                GROUP BY p.protein_id, p.gene_name, p.protein_name,
                        p.uniprot_acc, p.protein_category
                ORDER BY p.gene_name;
                """
            ).fetchall()

    return jsonify([dict(r) for r in rows])
@app.route("/api/search")
def api_search():
    """
    Fuzzy protein search:

    Search sources:
      1. proteins:
         - gene_name
         - protein_name
         - uniprot_acc
         - entry_name

      2. protein_alias:
         - alias_name

      3. gene_alias:
         - gene_alias

    A match in any field finds the corresponding protein.

    Returns:
      - protein basic information

    Example: searching BRCA1:
      {
        protein_id,
        uniprot_acc,
        gene_name,
        protein_name,
        organism
      }
    """

    q = request.args.get("q", "").strip()

    if not q:
        return jsonify([])

    db = get_db()
    prefix = f"{q}%"

    rows = db.execute(
        """
        SELECT
            p.protein_id,
            p.uniprot_acc,
            p.gene_name,
            p.protein_name,
            p.organism,
            p.entry_name

        FROM proteins p

        WHERE
               p.gene_name LIKE ? COLLATE NOCASE
            OR p.protein_name LIKE ? COLLATE NOCASE
            OR p.uniprot_acc LIKE ? COLLATE NOCASE
            OR p.entry_name LIKE ? COLLATE NOCASE
            OR EXISTS (
                SELECT 1
                FROM protein_alias pa
                WHERE pa.protein_id = p.protein_id
                  AND pa.alias_name LIKE ? COLLATE NOCASE
            )
            OR EXISTS (
                SELECT 1
                FROM gene_alias ga
                WHERE ga.protein_id = p.protein_id
                  AND ga.gene_alias LIKE ? COLLATE NOCASE
            )

        ORDER BY p.gene_name
        """,
        (
            prefix,
            prefix,
            prefix,
            prefix,
            prefix,
            prefix,
        ),
    ).fetchall()

    return jsonify([dict(row) for row in rows])

@app.route("/api/protein/<protein_id>")
def api_protein_detail(protein_id):
    """
    Return complete information for a single protein:

    Basic information
    alias
    Structure
    predicted structures
    domain
    UniProt FT features
    GO function
    papers
    E1-E2-E3-substrate / DUB relations
    """

    db = get_db()

    # ---------------------------------------------------------
    # 1. First check the canonical UniProt protein_id directly
    # ---------------------------------------------------------
    protein = db.execute(
        """
        SELECT *
        FROM proteins
        WHERE protein_id = ?
        """,
        (protein_id,)
    ).fetchone()

    # ---------------------------------------------------------
    # 2. If not found, check identifier_table
    # ---------------------------------------------------------
    if protein is None:

        input_id = protein_id

        identifier_row = db.execute(
            """
            SELECT
                protein_id,
                db,
                identifier
            FROM identifier_table
            WHERE identifier = ?
            LIMIT 1
            """,
            (protein_id,)
        ).fetchone()

        if identifier_row is not None:

            protein_id = identifier_row["protein_id"]

            protein = db.execute(
                """
                SELECT *
                FROM proteins
                WHERE protein_id = ?
                """,
                (protein_id,)
            ).fetchone()

            if protein is None:

                return jsonify({
                    "error": "identifier found, but the corresponding protein does not exist",
                    "input_id": input_id,
                    "identifier_db": identifier_row["db"],
                    "identifier": identifier_row["identifier"],
                    "protein_id": protein_id
                }), 404

        else:

            return jsonify({
                "error": "Protein not found",
                "protein_id": protein_id
            }), 404

    # ---------------------------------------------------------
    # 3. Protein alias
    # ---------------------------------------------------------
    protein_aliases = db.execute(
        """
        SELECT DISTINCT
            alias_name,
            alias_type,
            source
        FROM protein_alias
        WHERE protein_id = ?
          AND alias_type NOT IN (
              'AltName:EC',
              'RecName:EC',
              'Includes:RecName:EC'
          )
        ORDER BY alias_name
        """,
        (protein_id,)
    ).fetchall()

    # ---------------------------------------------------------
    # 4. Gene alias
    # ---------------------------------------------------------
    gene_aliases = db.execute(
        """
        SELECT DISTINCT
            gene_alias,
            source
        FROM gene_alias
        WHERE protein_id = ?
        ORDER BY gene_alias
        """,
        (protein_id,)
    ).fetchall()

    # ---------------------------------------------------------
    # 5. Add aliases into the protein object
    # ---------------------------------------------------------
    protein_out = dict(protein)

    protein_out["protein_alias"] = [
        dict(r)
        for r in protein_aliases
    ]

    protein_out["gene_alias"] = [
        dict(r)
        for r in gene_aliases
    ]

    # =========================================================
    # 6. UniProt FT Features
    # =========================================================
    #
    # protein_feature
    #      │
    #      ├── feature_note
    #      ├── feature_evidence
    #      └── feature_ligand
    #
    # API:
    #
    # features: [
    #   {
    #       feature_id,
    #       feature_type,
    #       start_pos,
    #       end_pos,
    #       location_raw,
    #       uniprot_feature_id,
    #       raw_feature,
    #       source,
    #       source_version,
    #       notes: [],
    #       evidence: [],
    #       ligands: []
    #   }
    # ]
    # =========================================================

    feature_rows = db.execute(
        """
        SELECT
            feature_id,
            protein_id,
            feature_type,
            start_pos,
            end_pos,
            location_raw,
            uniprot_feature_id,
            raw_feature,
            source,
            source_version
        FROM protein_feature
        WHERE protein_id = ?
        ORDER BY
            CASE
                WHEN start_pos IS NULL THEN 1
                ELSE 0
            END,
            start_pos,
            end_pos,
            feature_type,
            feature_id
        """,
        (protein_id,)
    ).fetchall()

    features_out = []

    for feature_row in feature_rows:

        feature = dict(feature_row)

        feature_id = feature["feature_id"]

        # -----------------------------------------------------
        # Feature notes
        # -----------------------------------------------------
        note_rows = db.execute(
            """
            SELECT
                note_id,
                note_text
            FROM feature_note
            WHERE feature_id = ?
            ORDER BY note_id
            """,
            (feature_id,)
        ).fetchall()

        feature["notes"] = [
            dict(r)
            for r in note_rows
        ]

        # -----------------------------------------------------
        # Convenience field:
        # first note
        #
        # The frontend can directly use feature.note_text
        # No need to access notes[0] each time
        # -----------------------------------------------------
        feature["note_text"] = (
            feature["notes"][0]["note_text"]
            if feature["notes"]
            else None
        )

        # -----------------------------------------------------
        # Feature evidence
        # -----------------------------------------------------
        evidence_rows = db.execute(
            """
            SELECT
                feature_evidence_id,
                evidence_code,
                database_name,
                accession,
                raw_evidence
            FROM feature_evidence
            WHERE feature_id = ?
            ORDER BY feature_evidence_id
            """,
            (feature_id,)
        ).fetchall()

        feature["evidence"] = [
            dict(r)
            for r in evidence_rows
        ]

        # -----------------------------------------------------
        # Feature ligands
        # -----------------------------------------------------
        ligand_rows = db.execute(
            """
            SELECT
                feature_ligand_id,
                ligand_name,
                ligand_id,
                ligand_label,
                ligand_note,
                ligand_part,
                ligand_part_id,
                ligand_part_note
            FROM feature_ligand
            WHERE feature_id = ?
            ORDER BY feature_ligand_id
            """,
            (feature_id,)
        ).fetchall()

        feature["ligands"] = [
            dict(r)
            for r in ligand_rows
        ]

        features_out.append(feature)

    # =========================================================
    # 6A. FT summary / category counts
    # =========================================================

    feature_type_counts = db.execute(
        """
        SELECT
            feature_type,
            COUNT(*) AS count
        FROM protein_feature
        WHERE protein_id = ?
        GROUP BY feature_type
        ORDER BY feature_type
        """,
        (protein_id,)
    ).fetchall()

    feature_type_counts_out = {
        r["feature_type"]: r["count"]
        for r in feature_type_counts
    }

    # ---------------------------------------------------------
    # 6B. 5 FT categories
    #
    # Note:
    # The DB does not need to store category.
    # The API can classify them uniformly.
    # ---------------------------------------------------------

    feature_categories = {

        "structural": [
            "CHAIN",
            "PEPTIDE",
            "PROPEP",
            "DOMAIN",
            "REGION",
            "REPEAT",
            "COILED",
            "HELIX",
            "STRAND",
            "TURN"
        ],

        "localization": [
            "SIGNAL",
            "TRANSIT",
            "TRANSMEM",
            "TOPO_DOM",
            "INTRAMEM"
        ],

        "functional": [
            "ACT_SITE",
            "BINDING",
            "SITE",
            "DNA_BIND",
            "ZN_FING",
            "MOTIF"
        ],

        "modification": [
            "MOD_RES",
            "CARBOHYD",
            "LIPID",
            "DISULFID",
            "CROSSLNK",
            "NON_STD",
            "NON_TER",
            "INIT_MET"
        ],

        "variation": [
            "VARIANT",
            "VAR_SEQ",
            "MUTAGEN",
            "CONFLICT",
            "COMPBIAS"
        ]
    }

    feature_type_to_category = {}

    for category, types in feature_categories.items():

        for feature_type in types:
            feature_type_to_category[feature_type] = category

    # ---------------------------------------------------------
    # Add category to each feature
    # ---------------------------------------------------------

    for feature in features_out:

        feature_type = feature["feature_type"]

        feature["category"] = (
            feature_type_to_category.get(
                feature_type,
                "other"
            )
        )

    # =========================================================
    # 6C. Category counts
    # =========================================================

    feature_category_counts = {
        category: 0
        for category in feature_categories
    }

    feature_category_counts["other"] = 0

    for feature in features_out:

        category = feature["category"]

        feature_category_counts[category] = (
            feature_category_counts.get(category, 0) + 1
        )

    # ---------------------------------------------------------
    # 7. Structures
    # ---------------------------------------------------------
    structures = db.execute(
        """
        SELECT *
        FROM structures
        WHERE protein_id = ?
        ORDER BY pdb_id
        """,
        (protein_id,)
    ).fetchall()

    # ---------------------------------------------------------
    # 8. Predicted structures
    # ---------------------------------------------------------
    alphafold = db.execute(
        """
        SELECT *
        FROM alphafold_models
        WHERE protein_id = ?
          AND status = 'ok'
        """,
        (protein_id,)
    ).fetchone()

    alphafill = db.execute(
        """
        SELECT *
        FROM alphafill_models
        WHERE protein_id = ?
          AND status = 'ok'
        """,
        (protein_id,)
    ).fetchone()

    swiss_model = db.execute(
        """
        SELECT *
        FROM swiss_models
        WHERE protein_id = ?
          AND status = 'ok'
        """,
        (protein_id,)
    ).fetchone()

    # ---------------------------------------------------------
    # 9. Domains
    # ---------------------------------------------------------
    domains = db.execute(
        """
        SELECT *
        FROM domains
        WHERE protein_id = ?
        ORDER BY source_db, start_pos
        """,
        (protein_id,)
    ).fetchall()

    # ---------------------------------------------------------
    # 10. GO functions
    # ---------------------------------------------------------
    functions = db.execute(
        """
        SELECT *
        FROM go_functions
        WHERE protein_id = ?
        ORDER BY aspect
        """,
        (protein_id,)
    ).fetchall()

    functions_out = []

    for r in functions:

        f = dict(r)

        f["sl_ids"] = map_go_term_to_sl(
            go_id=f.get("go_id"),
            term_name=f.get("go_term"),
        )

        functions_out.append(f)

    # ---------------------------------------------------------
    # 11. Papers
    # ---------------------------------------------------------
    papers = db.execute(
        """
        SELECT
            pa.pmid,
            pa.title,
            pa.journal,
            pa.pub_date,
            pa.pub_year,
            pp.relevance_score,
            pp.matched_term,
            pp.match_location
        FROM paper_proteins pp
        JOIN papers pa
            ON pa.pmid = pp.pmid
        WHERE pp.protein_id = ?
          AND pp.relevance_score >= 3
        ORDER BY
            pp.relevance_score DESC,
            pa.pub_date DESC
        """,
        (protein_id,)
    ).fetchall()

    # ---------------------------------------------------------
    # 12. Ubiquitination / Deubiquitination relations
    # ---------------------------------------------------------
    gene_name = (
        protein["gene_name"]
        if protein
        else protein_id
    )

    as_substrate = db.execute(
        """
        SELECT
            r.e1_id,
            r.e2_id,
            r.e3_id,
            r.substrate_id,
            r.ub_type,
            r.modified_lysine,
            r.functional_outcome,
            r.evidence,
            r.reference_pmid,
            r.source_db,
            r.dub_id
        FROM ub_relations r
        WHERE (
               r.e1_id = ?
            OR r.e2_id = ?
            OR r.e3_id = ?
            OR r.substrate_id = ?
        )
        AND (
               r.functional_outcome = "Ubiquitination"
            OR r.functional_outcome = "Deubiquitination"
        )
        """,
        (
            gene_name,
            gene_name,
            gene_name,
            gene_name
        )
    ).fetchall()

    # ---------------------------------------------------------
    # 13. Decide which structure the Mol* viewer should load
    #
    # Priority:
    # PDB > AlphaFold > AlphaFill > SWISS-MODEL
    # ---------------------------------------------------------
    active_structure = None

    pdb_with_url = next(
        (
            dict(r)
            for r in structures
            if r["pdb_url"]
        ),
        None
    )

    if pdb_with_url:

        active_structure = {
            "source": "pdb",
            "id": pdb_with_url["pdb_id"],
            "url": pdb_with_url["pdb_url"],
            "format": "pdb",
        }

    elif alphafold and (
        alphafold["pdb_url"]
        or alphafold["cif_url"]
    ):

        active_structure = {
            "source": "alphafold",
            "id": alphafold["uniprot_id"],
            "url": (
                alphafold["pdb_url"]
                or alphafold["cif_url"]
            ),
            "format": (
                "pdb"
                if alphafold["pdb_url"]
                else "mmcif"
            ),
        }

    elif alphafill and alphafill["cif_url"]:

        active_structure = {
            "source": "alphafill",
            "id": alphafill["uniprot_id"],
            "url": alphafill["cif_url"],
            "format": "mmcif",
        }

    elif swiss_model and swiss_model["coordinates_url"]:

        active_structure = {
            "source": "swiss_model",
            "id": swiss_model["uniprot_id"],
            "url": swiss_model["coordinates_url"],
            "format": "pdb",
        }

    # =========================================================
    # 14. API response
    # =========================================================

    return jsonify({

        # -----------------------------------------------------
        # Protein
        # -----------------------------------------------------
        "protein": protein_out,

        # -----------------------------------------------------
        # Structures
        # -----------------------------------------------------
        "structures": [
            dict(r)
            for r in structures
        ],

        # -----------------------------------------------------
        # Predicted structures
        # -----------------------------------------------------
        "predicted_structures": {

            "alphafold": (
                dict(alphafold)
                if alphafold
                else None
            ),

            "alphafill": (
                dict(alphafill)
                if alphafill
                else None
            ),

            "swiss_model": (
                dict(swiss_model)
                if swiss_model
                else None
            ),
        },

        "active_structure": active_structure,

        # -----------------------------------------------------
        # Existing domains
        # -----------------------------------------------------
        "domains": [
            dict(r)
            for r in domains
        ],

        # -----------------------------------------------------
        # UniProt FT
        # -----------------------------------------------------
        "features": features_out,

        "feature_categories": feature_categories,

        "feature_type_to_category":
            feature_type_to_category,

        "feature_type_counts":
            feature_type_counts_out,

        "feature_category_counts":
            feature_category_counts,

        # -----------------------------------------------------
        # GO
        # -----------------------------------------------------
        "functions": functions_out,

        # -----------------------------------------------------
        # Ubiquitination / DUB
        # -----------------------------------------------------
        "ub_relations": [
            dict(r)
            for r in as_substrate
        ],

        # -----------------------------------------------------
        # Papers
        # -----------------------------------------------------
        "papers": [
            dict(r)
            for r in papers
        ],
    })

# =====================================================================
# Cell GO Viewer: Animal_cells.svg on the left + GO function list on the right
# =====================================================================

def _normalize_go_aspect(raw_aspect):
    """go_functions.aspect may contain 'C'/'F'/'P', or full strings such as
    'cellular_component' / 'molecular_function' / 'biological_process'; normalize them to a single letter.
    (Note: do not rely only on the first letter because 'molecular_function' starts with 'm' rather than 'f'; use keyword matching.)"""
    raw = (raw_aspect or "").strip().lower()
    if raw in ("c", "cc") or "cellular" in raw:
        return "C"
    if raw in ("f", "mf") or "molecular" in raw:
        return "F"
    if raw in ("p", "bp") or "biological" in raw:
        return "P"
    return "P"


def _normalize_go_row(row):
    """Convert one row from the go_functions table into the fixed format expected by the cell_go_viewer frontend.
    This tries common field names to avoid being tightly coupled to the actual column names in seed_data.py;
    if your go_functions columns differ from the guesses here, update the term_name / go_id_val lines below to match the real column names."""
    d = dict(row)
    go_id_val = d.get("go_id") or d.get("go_term_id") or d.get("goid")
    term_name = (
        d.get("term_name")
        or d.get("go_term")
        or d.get("go_name")
        or d.get("name")
        or d.get("term")
        or d.get("description")
        or ""
    )
    evidence = d.get("evidence") or d.get("evidence_code")
    return {
        "go_id": go_id_val,
        "term_name": term_name,
        "aspect": _normalize_go_aspect(d.get("aspect")),
        "evidence": evidence,
    }


@app.route("/protein/<protein_id>/cell-view")
def protein_cell_view(protein_id):
    """Page with Animal_cells.svg on the left and the GO function list on the right."""
    db = get_db()
    protein = db.execute(
        "SELECT * FROM proteins WHERE protein_id = ?", (protein_id,)
    ).fetchone()
    if protein is None:
        abort(404, description="Protein not found")

    protein = dict(protein)
    label = protein.get("gene_name") or protein.get("protein_name") or protein_id

    return render_template(
        "cell_go_view.html",
        protein_id=protein_id,
        protein_label=label,
        protein_name=protein.get("protein_name") or label,
        gene_name=protein.get("gene_name") or protein_id,
        uniprot_acc=protein.get("uniprot_acc") or protein_id,
        entry_name=protein.get("entry_name") or "",
        organism=protein.get("organism") or "",
        protein_length=protein.get("length") or len(protein.get("sequence") or ""),
    )


@app.route("/api/protein/<protein_id>/cell-go")
def api_protein_cell_go(protein_id):
    """API for cell_go_viewer.js: returns the GO functions for this protein,
    already mapped to the corresponding SVG organelle IDs (sl_ids) via go_sl_mapping."""
    db = get_db()

    protein = db.execute(
        "SELECT * FROM proteins WHERE protein_id = ?", (protein_id,)
    ).fetchone()
    if protein is None:
        return jsonify({"error": "Protein not found"}), 404

    rows = db.execute(
        "SELECT * FROM go_functions WHERE protein_id = ? ORDER BY aspect",
        (protein_id,),
    ).fetchall()

    go_terms = [_normalize_go_row(r) for r in rows]
    go_terms = annotate_go_terms(go_terms)  # Add the sl_ids for each term

    protein = dict(protein)
    return jsonify(
        {
            "protein_id": protein_id,
            "protein_label": protein.get("gene_name")
            or protein.get("protein_name")
            or protein_id,
            "go_terms": go_terms,
        }
    )

if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print("Database not found; please run: python seed_data.py")
    app.run(host="127.0.0.1", port=5050, debug=True)

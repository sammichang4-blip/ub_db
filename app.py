#!/usr/bin/env python3
"""
app.py - Ubiquitin 本地查詢資料庫 Web 介面
執行方式：
    pip install flask --break-system-packages
    python seed_data.py      # 先建立/填入資料庫
    python app.py            # 啟動伺服器，預設 http://127.0.0.1:5050
"""

import sqlite3
import os
from flask import Flask, jsonify, render_template, request, g , abort
from flask import send_from_directory
from urllib.parse import unquote
import posixpath

# --- 新增：Cell GO Viewer 用的 GO term -> SVG 胞器 id 對照表 ---
from go_sl_mapping import annotate_go_terms, map_go_term_to_sl


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "data/db", "ubiquitin.db"))

# 檔案系統路徑：send_from_directory 用來找實體 .pdb / .cif 檔案的地方。
# 用 BASE_DIR 組成絕對路徑，這樣不管從哪個工作目錄啟動 Flask 都找得到。
PDB_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "pdb"))
CIF_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "cif"))

# URL 路徑白名單：驗證 /structure-viewer?url=... 傳進來的值，
# 對應的是路由 /data/pdb/<filename> 與 /data/cif/<filename>，
# 跟 PDB_DIR 實際在磁碟上的位置無關，維持 URL 前綴、不要用 "../"
ALLOWED_STRUCTURE_PREFIXES = ("/data/pdb/", "/data/cif/")

app = Flask(__name__)

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
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
    """只允許站內、指向 PDB/CIF 靜態目錄的相對路徑，
    擋掉外部網域、protocol-relative（//host/...）與路徑跳脫。"""
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

    return render_template("pdb.html", pdb_url=pdb_url)


# 保留舊路由給「只知道 PDB ID」的情境（例如直接分享連結），
# 但要它自己組出正確路徑，而不是把裸 ID 當網址用
@app.route("/pdb/<pdbid>")
def pdb_viewer(pdbid):
    pdb_url = f"/data/pdb/{pdbid}.pdb"
    return render_template("pdb.html", pdb_url=pdb_url)

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
                "type": node_type,      # 保留單一 type 欄位給前端用
                "_roles": [node_type],  # 內部用 list（可序列化）記錄所有角色
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

    # 查詢每個 node 所屬 complex 數量
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
            node["type"] = "/".join(sorted(roles))  # 若身兼多角色，type 也一併更新
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
        return jsonify({"error": "缺少 protein_a / protein_b / interaction_type"}), 400

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
    """依 gene name / protein name / uniprot accession 模糊搜尋蛋白質；
       若 proteins 表查無資料，依序查詢 protein_alias、gene_alias、identifier_table，
       只要任一表查到資料就回傳（格式與原本 proteins 查詢結果相同）"""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    db = get_db()
    prefix = f"{q}%"

    rows = db.execute(
        """SELECT protein_id, uniprot_acc, gene_name, protein_name, organism
           FROM proteins
           WHERE gene_name LIKE ? COLLATE NOCASE
             OR protein_name LIKE ? COLLATE NOCASE
             OR uniprot_acc LIKE ? COLLATE NOCASE
           ORDER BY gene_name""",
        (prefix, prefix, prefix),
    ).fetchall()

    row = rows[0] if rows else None


    if row:
        return jsonify([dict(r) for r in rows])

    # 查無資料，改查 protein_alias

    rows = db.execute(
        """SELECT p.protein_id, p.uniprot_acc, p.gene_name, p.protein_name, p.organism
           FROM protein_alias a
           JOIN proteins p ON p.protein_id = a.protein_id
           WHERE a.alias_name LIKE ? COLLATE NOCASE
           ORDER BY p.gene_name""",
        (prefix,),
    ).fetchall()

    if rows:
        return jsonify([dict(r) for r in rows])

    # 再查無資料，改查 gene_alias
    rows = db.execute(
        """SELECT p.protein_id, p.uniprot_acc, p.gene_name, p.protein_name, p.organism
           FROM gene_alias a
           JOIN proteins p ON p.protein_id = a.protein_id
           WHERE a.gene_alias LIKE ? COLLATE NOCASE
           ORDER BY p.gene_name""",
        (prefix,),
    ).fetchall()
    if rows:
        return jsonify([dict(r) for r in rows])

    # 最後查 identifier_table
    rows = db.execute(
        """SELECT p.protein_id, p.uniprot_acc, p.gene_name, p.protein_name, p.organism
           FROM identifier_table i
           JOIN proteins p ON p.protein_id = i.protein_id
           WHERE i.identifier LIKE ? COLLATE NOCASE
           ORDER BY p.gene_name""",
        (prefix,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/protein/<protein_id>")
def api_protein_detail(protein_id):
    """回傳單一蛋白質完整資訊：基本資料/結構/domain/GO功能/E1-E2-E3-substrate"""
    db = get_db()

    protein = db.execute(
        "SELECT * FROM proteins WHERE protein_id = ?", (protein_id,)
    ).fetchone()

    if protein is None:
        return jsonify({"error": "找不到此蛋白質"}), 404

    structures = db.execute(
        "SELECT * FROM structures WHERE protein_id = ? ORDER BY pdb_id", (protein_id,)
    ).fetchall()

    alphafold = db.execute(
        "SELECT * FROM alphafold_models WHERE protein_id=? AND status='ok'", (protein_id,)
    ).fetchone()
    alphafill = db.execute(
        "SELECT * FROM alphafill_models WHERE protein_id=? AND status='ok'", (protein_id,)
    ).fetchone()
    swiss_model = db.execute(
        "SELECT * FROM swiss_models WHERE protein_id=? AND status='ok'", (protein_id,)
    ).fetchone()

    domains = db.execute(
        "SELECT * FROM domains WHERE protein_id = ? ORDER BY source_db AND start_pos", (protein_id,)
    ).fetchall()

    functions = db.execute(
        "SELECT * FROM go_functions WHERE protein_id = ? ORDER BY aspect", (protein_id,)
    ).fetchall()

    # --- 新增：幫每一筆 GO function 補上對應的 SVG 胞器 id ---
    functions_out = []
    for r in functions:
        f = dict(r)
        f["sl_ids"] = map_go_term_to_sl(
            go_id=f.get("go_id"),
            term_name=f.get("go_term"),
        )
        functions_out.append(f)

    papers = db.execute("""
            SELECT pa.pmid, pa.title, pa.journal, pa.pub_date, pa.pub_year,
                pp.relevance_score, pp.matched_term, pp.match_location
            FROM paper_proteins pp
            JOIN papers pa ON pa.pmid = pp.pmid
            WHERE pp.protein_id = ? AND pp.relevance_score >= 3
            ORDER BY pp.relevance_score DESC, pa.pub_date DESC
        """, (protein_id,)).fetchall()

    gene_name = protein["gene_name"] if protein else protein_id

    as_substrate = db.execute(
        """
        SELECT
            r.e1_id, r.e2_id, r.e3_id, r.substrate_id,
            r.ub_type, r.modified_lysine, r.functional_outcome,
            r.evidence, r.reference_pmid, r.source_db,r.dub_id
        FROM ub_relations r
        WHERE (r.e1_id = ? OR r.e2_id = ? OR r.e3_id = ? OR r.substrate_id = ?) AND (functional_outcome ="Ubiquitination" OR functional_outcome ="Deubiquitination")
        """,
        (gene_name, gene_name, gene_name, gene_name)
    ).fetchall()

    # --- 決定 Mol* viewer 要載入哪個結構 ---
    # 優先序：實驗結構 (PDB) > AlphaFold > AlphaFill > SWISS-MODEL
    active_structure = None

    pdb_with_url = next(
        (dict(r) for r in structures if r["pdb_url"]), None
    )

    if pdb_with_url:
        active_structure = {
            "source": "pdb",
            "id": pdb_with_url["pdb_id"],
            "url": pdb_with_url["pdb_url"],
            "format": "pdb",
        }
    elif alphafold and (alphafold["pdb_url"] or alphafold["cif_url"]):
        active_structure = {
            "source": "alphafold",
            "id": alphafold["uniprot_id"],
            "url": alphafold["pdb_url"] or alphafold["cif_url"],
            "format": "pdb" if alphafold["pdb_url"] else "mmcif",
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
    # 都沒有的話 active_structure 保持 None，前端顯示「無可用結構」

    return jsonify({
        "protein": dict(protein),
        "structures": [dict(r) for r in structures],
        "predicted_structures": {
            "alphafold": dict(alphafold) if alphafold else None,
            "alphafill": dict(alphafill) if alphafill else None,
            "swiss_model": dict(swiss_model) if swiss_model else None,
        },
        "active_structure": active_structure,
        "domains": [dict(r) for r in domains],
        "functions": functions_out,
        "ub_relations": [dict(r) for r in as_substrate],
        "papers": [dict(r) for r in papers],
    })


# =====================================================================
# Cell GO Viewer：Animal_cells.svg 左側 + GO function 清單右側對照
# =====================================================================

def _normalize_go_aspect(raw_aspect):
    """go_functions.aspect 可能存 'C'/'F'/'P'，也可能存
    'cellular_component' / 'molecular_function' / 'biological_process'
    這種完整字串，統一轉成單一字母。（注意：不能只看開頭字母，
    'molecular_function' 開頭是 'm' 不是 'f'，要用關鍵字判斷。）"""
    raw = (raw_aspect or "").strip().lower()
    if raw in ("c", "cc") or "cellular" in raw:
        return "C"
    if raw in ("f", "mf") or "molecular" in raw:
        return "F"
    if raw in ("p", "bp") or "biological" in raw:
        return "P"
    return "P"


def _normalize_go_row(row):
    """把 go_functions 表的一列轉成 cell_go_viewer 前端要吃的固定格式。
    這裡用「常見欄位名稱都試一遍」的方式，避免要跟 seed_data.py 的實際
    欄位名稱綁死；如果你的 go_functions 表欄位跟這裡猜的都不一樣，
    把下面 term_name / go_id_val 那兩行改成你實際的欄位名即可。"""
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
    """左側 Animal_cells.svg + 右側 GO function 清單的頁面。"""
    db = get_db()
    protein = db.execute(
        "SELECT * FROM proteins WHERE protein_id = ?", (protein_id,)
    ).fetchone()
    if protein is None:
        abort(404, description="找不到此蛋白質")

    protein = dict(protein)
    label = protein.get("gene_name") or protein.get("protein_name") or protein_id

    return render_template(
        "cell_go_view.html",
        protein_id=protein_id,
        protein_label=label,
    )


@app.route("/api/protein/<protein_id>/cell-go")
def api_protein_cell_go(protein_id):
    """給 cell_go_viewer.js 打的 API：回傳這顆蛋白質的 GO function，
    並且已經用 go_sl_mapping 對照好對應的 SVG 胞器 id (sl_ids)。"""
    db = get_db()

    protein = db.execute(
        "SELECT * FROM proteins WHERE protein_id = ?", (protein_id,)
    ).fetchone()
    if protein is None:
        return jsonify({"error": "找不到此蛋白質"}), 404

    rows = db.execute(
        "SELECT * FROM go_functions WHERE protein_id = ? ORDER BY aspect",
        (protein_id,),
    ).fetchall()

    go_terms = [_normalize_go_row(r) for r in rows]
    go_terms = annotate_go_terms(go_terms)  # 補上每個 term 的 sl_ids

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
        print("找不到資料庫，請先執行： python seed_data.py")
    app.run(host="127.0.0.1", port=5050, debug=True)

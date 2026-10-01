import sqlite3
from pathlib import Path


DB_PATH = "../data/db/ubiquitin.db"
OUTPUT_FILE = "enzyme.txt"


def normalize_enzyme_ids(db_path, output_file):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    cur = conn.cursor()

    # ---------------------------------------------------------
    # 取得所有 enzymes
    # ---------------------------------------------------------
    enzymes = cur.execute(
        """
        SELECT
            enzyme_id,
            gene_name,
            protein_name,
            enzyme_class,
            enzyme_subfamily
        FROM enzymes
        ORDER BY enzyme_class, enzyme_id
        """
    ).fetchall()

    updated = []
    not_found = []

    for enzyme in enzymes:

        old_id = enzyme["enzyme_id"]

        # -----------------------------------------------------
        # 1. 先確認 enzyme_id 是否已經是 canonical protein_id
        # -----------------------------------------------------
        protein = cur.execute(
            """
            SELECT
                protein_id,
                protein_name
            FROM proteins
            WHERE protein_id = ?
            """,
            (old_id,)
        ).fetchone()

        if protein:
            # 已經是 canonical ID，不需要更新
            continue

        # -----------------------------------------------------
        # 2. proteins 找不到
        #    → 到 identifier_table 找 alternative / legacy ID
        # -----------------------------------------------------
        identifiers = cur.execute(
            """
            SELECT
                it.protein_id,
                it.db,
                it.identifier,
                p.protein_name
            FROM identifier_table it
            JOIN proteins p
                ON p.protein_id = it.protein_id
            WHERE it.identifier = ?
            """,
            (old_id,)
        ).fetchall()

        if not identifiers:
            not_found.append({
                "enzyme_id": old_id,
                "gene_name": enzyme["gene_name"],
                "protein_name": enzyme["protein_name"],
                "enzyme_class": enzyme["enzyme_class"],
            })
            continue

        # -----------------------------------------------------
        # 3. identifier_table 找到 mapping
        # -----------------------------------------------------
        if len(identifiers) > 1:

            print(
                f"[WARNING] Multiple mappings for {old_id}:"
            )

            for row in identifiers:
                print(
                    f"    {row['db']} "
                    f"{row['identifier']} "
                    f"-> {row['protein_id']}"
                )

            # 為避免錯誤更新，這裡不自動處理
            continue

        row = identifiers[0]

        new_id = row["protein_id"]
        protein_name = row["protein_name"]

        # -----------------------------------------------------
        # 4. 更新 enzymes.enzyme_id
        # -----------------------------------------------------
        try:

            cur.execute(
                """
                UPDATE enzymes
                SET enzyme_id = ?
                WHERE enzyme_id = ?
                """,
                (new_id, old_id)
            )

            # -------------------------------------------------
            # 5. 記錄成功更新
            # -------------------------------------------------
            updated.append({
                "old_id": old_id,
                "new_id": new_id,
                "protein_name": protein_name,
                "db": row["db"],
                "enzyme_class": enzyme["enzyme_class"],
            })

            print(
                f"[UPDATED] "
                f"{old_id} -> {new_id} "
                f"({protein_name})"
            )

        except sqlite3.IntegrityError as e:

            print(
                f"[ERROR] Cannot update "
                f"{old_id} -> {new_id}: {e}"
            )

    # ---------------------------------------------------------
    # Commit database changes
    # ---------------------------------------------------------
    conn.commit()

    # ---------------------------------------------------------
    # 寫入 enzyme.txt
    # ---------------------------------------------------------
    with open(output_file, "w", encoding="utf-8") as f:

        f.write("# Updated enzyme IDs\n")
        f.write(
            "# old_enzyme_id\tnew_enzyme_id\tprotein_name\t"
            "identifier_db\tenzyme_class\n"
        )

        for item in updated:
            f.write(
                f"{item['old_id']}\t"
                f"{item['new_id']}\t"
                f"{item['protein_name'] or ''}\t"
                f"{item['db']}\t"
                f"{item['enzyme_class']}\n"
            )

        f.write("\n# Not found\n")
        f.write(
            "# enzyme_id\tgene_name\tprotein_name\tenzyme_class\n"
        )

        for item in not_found:
            f.write(
                f"{item['enzyme_id']}\t"
                f"{item['gene_name'] or ''}\t"
                f"{item['protein_name'] or ''}\t"
                f"{item['enzyme_class']}\n"
            )

    # ---------------------------------------------------------
    # Summary
    # ---------------------------------------------------------
    print()
    print("=" * 60)
    print("Normalization finished")
    print("=" * 60)
    print(f"Total enzymes       : {len(enzymes)}")
    print(f"Updated             : {len(updated)}")
    print(f"Not found           : {len(not_found)}")
    print(f"Output              : {output_file}")

    conn.close()


if __name__ == "__main__":
    normalize_enzyme_ids(
        DB_PATH,
        OUTPUT_FILE
    )
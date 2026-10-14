import sqlite3
import re
import shutil
from datetime import datetime

DB_PATH = "../data/db/ubiquitin.db"


# ============================================================
# 1. Backup database
# ============================================================

backup_path = (
    f"ubiquitin_backup_before_alias_clean_"
    f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
)

shutil.copy2(DB_PATH, backup_path)

print(f"Database backup:")
print(f"  {backup_path}")


# ============================================================
# 2. Remove ECO evidence annotation
# ============================================================

def clean_evidence_tag(text):
    """
    Remove UniProt ECO evidence annotations.

    Example:
        MYST-1 {ECO:0000303|Ref.5}
        ->
        MYST-1

        hMOF {ECO:0000303|PubMed:21691301}
        ->
        hMOF

        2.3.1.- {ECO:0000269|PubMed:17189187,
                 ECO:0000269|PubMed:19854137}
        ->
        2.3.1.-
    """

    if not text:
        return text

    # Remove every {...} block that starts with ECO:
    text = re.sub(
        r"\s*\{ECO:[^}]*\}",
        "",
        text
    )

    return text.strip()


# ============================================================
# 3. Connect database
# ============================================================

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

try:

    cursor = conn.cursor()

    # ========================================================
    # A. Clean protein_alias
    # ========================================================

    print("\n========================================")
    print("Cleaning protein_alias")
    print("========================================")

    rows = cursor.execute(
        """
        SELECT
            alias_id,
            protein_id,
            alias_name,
            alias_type,
            source
        FROM protein_alias
        ORDER BY alias_id
        """
    ).fetchall()

    cleaned_protein_alias = {}

    changed_count = 0
    duplicate_count = 0

    for row in rows:

        old_name = row["alias_name"]

        new_name = clean_evidence_tag(old_name)

        key = (
            row["protein_id"],
            new_name,
            row["alias_type"]
        )

        # ----------------------------------------------------
        # ECO was removed
        # ----------------------------------------------------

        if old_name != new_name:

            changed_count += 1

            print(
                f"[protein_alias] "
                f"{old_name}  ->  {new_name}"
            )

        # ----------------------------------------------------
        # Check duplicate after cleaning
        # ----------------------------------------------------

        if key in cleaned_protein_alias:

            duplicate_count += 1

            print(
                f"[protein_alias] DUPLICATE removed: "
                f"{row['protein_id']} | "
                f"{new_name} | "
                f"{row['alias_type']}"
            )

            continue

        cleaned_protein_alias[key] = {
            "protein_id": row["protein_id"],
            "alias_name": new_name,
            "alias_type": row["alias_type"],
            "source": row["source"]
        }


    print(
        f"\nprotein_alias:"
        f"\n  原始資料：{len(rows)}"
        f"\n  ECO 清理：{changed_count}"
        f"\n  重複移除：{duplicate_count}"
        f"\n  最終資料：{len(cleaned_protein_alias)}"
    )


    # ========================================================
    # B. Clean gene_alias
    # ========================================================

    print("\n========================================")
    print("Cleaning gene_alias")
    print("========================================")

    rows = cursor.execute(
        """
        SELECT
            alias_id,
            protein_id,
            gene_alias,
            source
        FROM gene_alias
        ORDER BY alias_id
        """
    ).fetchall()

    cleaned_gene_alias = {}

    changed_count = 0
    duplicate_count = 0

    for row in rows:

        old_name = row["gene_alias"]

        new_name = clean_evidence_tag(old_name)

        key = (
            row["protein_id"],
            new_name
        )

        # ----------------------------------------------------
        # ECO was removed
        # ----------------------------------------------------

        if old_name != new_name:

            changed_count += 1

            print(
                f"[gene_alias] "
                f"{old_name}  ->  {new_name}"
            )

        # ----------------------------------------------------
        # Check duplicate after cleaning
        # ----------------------------------------------------

        if key in cleaned_gene_alias:

            duplicate_count += 1

            print(
                f"[gene_alias] DUPLICATE removed: "
                f"{row['protein_id']} | "
                f"{new_name}"
            )

            continue

        cleaned_gene_alias[key] = {
            "protein_id": row["protein_id"],
            "gene_alias": new_name,
            "source": row["source"]
        }


    print(
        f"\ngene_alias:"
        f"\n  原始資料：{len(rows)}"
        f"\n  ECO 清理：{changed_count}"
        f"\n  重複移除：{duplicate_count}"
        f"\n  最終資料：{len(cleaned_gene_alias)}"
    )


    # ========================================================
    # 4. Transaction
    # ========================================================

    print("\n========================================")
    print("Writing cleaned data")
    print("========================================")

    # --------------------------------------------------------
    # protein_alias
    # --------------------------------------------------------

    cursor.execute(
        "DELETE FROM protein_alias"
    )

    cursor.executemany(
        """
        INSERT INTO protein_alias
        (
            protein_id,
            alias_name,
            alias_type,
            source
        )
        VALUES (?, ?, ?, ?)
        """,
        [
            (
                x["protein_id"],
                x["alias_name"],
                x["alias_type"],
                x["source"]
            )
            for x in cleaned_protein_alias.values()
        ]
    )


    # --------------------------------------------------------
    # gene_alias
    # --------------------------------------------------------

    cursor.execute(
        "DELETE FROM gene_alias"
    )

    cursor.executemany(
        """
        INSERT INTO gene_alias
        (
            protein_id,
            gene_alias,
            source
        )
        VALUES (?, ?, ?)
        """,
        [
            (
                x["protein_id"],
                x["gene_alias"],
                x["source"]
            )
            for x in cleaned_gene_alias.values()
        ]
    )


    # ========================================================
    # 5. Commit
    # ========================================================

    conn.commit()

    print("\n========================================")
    print("DONE")
    print("========================================")

except Exception as e:

    conn.rollback()

    print("\n========================================")
    print("ERROR")
    print("========================================")

    print(e)

    print("\nTransaction rollback completed.")

    raise

finally:

    conn.close()
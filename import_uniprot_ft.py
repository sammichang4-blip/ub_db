#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UKW - Import UniProt FT annotations
====================================

Input:
    UP000005640_9606.dat

Database:
    ubiquitin.db

Tables:
    protein_feature
    feature_note
    feature_evidence
    feature_ligand

Features:
    - Parse all UniProt FT records
    - Parse multi-line qualifiers
    - Preserve raw FT block
    - Parse /note
    - Parse /evidence
    - Parse /id
    - Parse BINDING ligand qualifiers
    - Avoid duplicated import
    - Foreign-key safe
    - Transaction based
"""

import sqlite3
import re
import sys
from pathlib import Path


# ============================================================
# Configuration
# ============================================================

DAT_FILE = Path("../data/UP000005640_9606.dat")
DB_FILE = Path("../data/db/ubiquitin.db")


# ============================================================
# SQL
# ============================================================

CREATE_TABLES_SQL = """

PRAGMA foreign_keys = ON;


-- ============================================================
-- protein_feature
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
-- feature_note
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
-- feature_evidence
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
-- feature_ligand
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
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_protein_feature_protein
ON protein_feature(protein_id);

CREATE INDEX IF NOT EXISTS idx_protein_feature_type
ON protein_feature(feature_type);

CREATE INDEX IF NOT EXISTS idx_protein_feature_protein_type
ON protein_feature(protein_id, feature_type);

CREATE INDEX IF NOT EXISTS idx_protein_feature_uniprot_id
ON protein_feature(uniprot_feature_id);


CREATE INDEX IF NOT EXISTS idx_feature_note_feature
ON feature_note(feature_id);


CREATE INDEX IF NOT EXISTS idx_feature_evidence_feature
ON feature_evidence(feature_id);

CREATE INDEX IF NOT EXISTS idx_feature_evidence_database_accession
ON feature_evidence(database_name, accession);

CREATE INDEX IF NOT EXISTS idx_feature_evidence_code
ON feature_evidence(evidence_code);


CREATE INDEX IF NOT EXISTS idx_feature_ligand_feature
ON feature_ligand(feature_id);

CREATE INDEX IF NOT EXISTS idx_feature_ligand_id
ON feature_ligand(ligand_id);

CREATE INDEX IF NOT EXISTS idx_feature_ligand_part_id
ON feature_ligand(ligand_part_id);


-- ============================================================
-- Unique indexes
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
idx_protein_feature_uniprot_id_unique
ON protein_feature(protein_id, uniprot_feature_id)
WHERE uniprot_feature_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
idx_feature_note_unique
ON feature_note(feature_id, note_text);


CREATE UNIQUE INDEX IF NOT EXISTS
idx_feature_evidence_unique
ON feature_evidence(
    feature_id,
    evidence_code,
    database_name,
    accession
);

"""


# ============================================================
# Regex
# ============================================================

RE_ID = re.compile(
    r"^ID\s+(\S+)"
)

RE_AC = re.compile(
    r"^AC\s+(.+)"
)

RE_FT = re.compile(
    r"^FT\s{3}(\S+)\s*(.*)$"
)

RE_QUALIFIER = re.compile(
    r"^/([A-Za-z0-9_]+)(?:=(.*))?$"
)

RE_LOCATION_SINGLE = re.compile(
    r"^<?(\d+)>?$"
)

RE_LOCATION_RANGE = re.compile(
    r"^<?(\d+)\.\.>?(\d+)$"
)


# ============================================================
# Helper functions
# ============================================================

def clean_quoted_value(value):
    """
    Remove surrounding quotes and normalize whitespace.
    """
    if value is None:
        return None

    value = value.strip()

    if value.startswith('"'):
        value = value[1:]

    if value.endswith('"'):
        value = value[:-1]

    value = re.sub(r"\s+", " ", value)

    return value.strip()


def parse_location(location):
    """
    Parse UniProt FT location.

    Examples:
        54
        1..76
        <1..76
        1..>100

    Returns:
        start_pos
        end_pos
    """

    location = location.strip()

    # Single position
    m = RE_LOCATION_SINGLE.match(location)

    if m:
        pos = int(m.group(1))
        return pos, pos

    # Range
    m = RE_LOCATION_RANGE.match(location)

    if m:
        start_pos = int(m.group(1))
        end_pos = int(m.group(2))
        return start_pos, end_pos

    return None, None


def parse_evidence(raw_evidence):
    """
    Parse:

        ECO:0000269|PubMed:16443603

    Returns list of:
        evidence_code
        database_name
        accession
        raw_evidence
    """

    results = []

    if not raw_evidence:
        return results

    # Evidence may contain comma-separated references
    # and line breaks already normalized.
    parts = [
        x.strip()
        for x in raw_evidence.split(",")
        if x.strip()
    ]

    for part in parts:

        tokens = part.split("|")

        evidence_code = None
        database_name = None
        accession = None

        for token in tokens:

            token = token.strip()

            if token.startswith("ECO:"):
                evidence_code = token

            elif ":" in token:
                db, acc = token.split(":", 1)

                database_name = db.strip()
                accession = acc.strip()

        results.append({
            "evidence_code": evidence_code,
            "database_name": database_name,
            "accession": accession,
            "raw_evidence": part
        })

    return results


def parse_qualifiers(lines):
    """
    Parse UniProt FT qualifier lines.

    Example:

        /note="Phosphoserine; by PINK1"
        /evidence="ECO:0000269|PubMed:12345"

    Handles continuation lines.

    Returns:

        {
            "note": [...],
            "evidence": [...],
            "id": [...],
            ...
        }
    """

    qualifiers = {}

    current_key = None
    current_value = []

    def save_current():

        nonlocal current_key
        nonlocal current_value

        if current_key is None:
            return

        value = " ".join(current_value)

        value = clean_quoted_value(value)

        qualifiers.setdefault(current_key, []).append(value)

        current_key = None
        current_value = []

    for line in lines:

        # Remove FT prefix
        if line.startswith("FT"):
            content = line[2:]
        else:
            content = line

        content = content.rstrip("\n")

        # Remove indentation
        content = content.strip()

        if not content:
            continue

        # New qualifier
        if content.startswith("/"):

            save_current()

            m = RE_QUALIFIER.match(content)

            if not m:
                continue

            current_key = m.group(1)

            value = m.group(2)

            if value is None:
                current_value = []
            else:
                current_value = [value]

        else:
            # Continuation of previous qualifier
            if current_key is not None:
                current_value.append(content)

    save_current()

    return qualifiers


def extract_accession(record_lines):
    """
    Extract primary UniProt accession from AC line.
    """

    accessions = []

    for line in record_lines:

        m = RE_AC.match(line)

        if not m:
            continue

        values = m.group(1)

        values = values.replace(";", " ")

        for acc in values.split():

            acc = acc.strip()

            if acc:
                accessions.append(acc)

    if accessions:
        return accessions[0]

    return None


def extract_entry_name(record_lines):
    """
    Extract UniProt entry name from ID line.
    """

    for line in record_lines:

        m = RE_ID.match(line)

        if m:
            return m.group(1)

    return None


# ============================================================
# FT parser
# ============================================================

def parse_ft_features(record_lines):
    """
    Parse all FT blocks from one UniProt record.

    Returns list of dictionaries.
    """

    features = []

    current_feature = None
    current_qualifier_lines = []

    def save_feature():

        nonlocal current_feature
        nonlocal current_qualifier_lines

        if current_feature is None:
            return

        qualifiers = parse_qualifiers(current_qualifier_lines)

        current_feature["qualifiers"] = qualifiers

        features.append(current_feature)

        current_feature = None
        current_qualifier_lines = []

    for line in record_lines:

        if line.startswith("FT   "):

            content = line[5:].rstrip("\n")

            # New FT feature:
            #
            # FT   DOMAIN        1..76
            #
            # The first 8 characters contain the feature type field.
            #
            feature_type = content[:15].strip()
            location = content[15:].strip()

            if feature_type:

                save_feature()

                start_pos, end_pos = parse_location(location)

                current_feature = {
                    "feature_type": feature_type,
                    "location_raw": location,
                    "start_pos": start_pos,
                    "end_pos": end_pos,
                    "raw_lines": [line.rstrip("\n")]
                }

            else:

                if current_feature is not None:
                    current_qualifier_lines.append(
                        line.rstrip("\n")
                    )

                    current_feature["raw_lines"].append(
                        line.rstrip("\n")
                    )

        elif line.startswith("FT"):

            if current_feature is not None:

                current_qualifier_lines.append(
                    line.rstrip("\n")
                )

                current_feature["raw_lines"].append(
                    line.rstrip("\n")
                )

        else:

            # End of FT section / unrelated line
            continue

    save_feature()

    return features


# ============================================================
# Record parser
# ============================================================

def parse_records(dat_file):
    """
    Yield one UniProt record at a time.
    """

    record = []

    with dat_file.open(
        "r",
        encoding="utf-8",
        errors="replace"
    ) as fh:

        for line in fh:

            if line.startswith("//"):

                if record:
                    yield record

                record = []

            else:
                record.append(line.rstrip("\n"))

        if record:
            yield record


# ============================================================
# Protein resolver
# ============================================================

def resolve_protein_id(conn, accession):
    """
    Resolve UniProt accession to existing UKW proteins.protein_id.

    Priority:
        1. proteins.uniprot_acc
        2. identifier_table(db='UniProt')

    Returns:
        protein_id or None
    """

    if not accession:
        return None

    # --------------------------------------------------------
    # 1. proteins.uniprot_acc
    # --------------------------------------------------------

    row = conn.execute(
        """
        SELECT protein_id
        FROM proteins
        WHERE uniprot_acc = ?
        LIMIT 1
        """,
        (accession,)
    ).fetchone()

    if row:
        return row["protein_id"]

    # --------------------------------------------------------
    # 2. identifier_table
    # --------------------------------------------------------

    try:

        row = conn.execute(
            """
            SELECT protein_id
            FROM identifier_table
            WHERE db = ?
              AND identifier = ?
            LIMIT 1
            """,
            ("UniProt", accession)
        ).fetchone()

        if row:
            return row["protein_id"]

    except sqlite3.OperationalError:

        # identifier_table may not exist in some databases.
        pass

    return None


# ============================================================
# Insert feature
# ============================================================

def insert_feature(
    conn,
    protein_id,
    feature,
    source_version
):
    """
    Insert one protein_feature.

    Returns:
        feature_id
    """

    qualifiers = feature.get("qualifiers", {})

    uniprot_feature_id = None

    if "id" in qualifiers:
        if qualifiers["id"]:
            uniprot_feature_id = qualifiers["id"][0]

    raw_feature = "\n".join(
        feature.get("raw_lines", [])
    )

    # --------------------------------------------------------
    # Existing feature with UniProt ID
    # --------------------------------------------------------

    if uniprot_feature_id:

        row = conn.execute(
            """
            SELECT feature_id
            FROM protein_feature
            WHERE protein_id = ?
              AND uniprot_feature_id = ?
            LIMIT 1
            """,
            (
                protein_id,
                uniprot_feature_id
            )
        ).fetchone()

        if row:

            return row["feature_id"]

    # --------------------------------------------------------
    # Insert
    # --------------------------------------------------------

    cursor = conn.execute(
        """
        INSERT INTO protein_feature (
            protein_id,
            feature_type,
            start_pos,
            end_pos,
            location_raw,
            uniprot_feature_id,
            raw_feature,
            source,
            source_version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'UniProt', ?)
        """,
        (
            protein_id,
            feature["feature_type"],
            feature["start_pos"],
            feature["end_pos"],
            feature["location_raw"],
            uniprot_feature_id,
            raw_feature,
            source_version
        )
    )

    return cursor.lastrowid


# ============================================================
# Insert notes
# ============================================================

def insert_notes(
    conn,
    feature_id,
    qualifiers
):

    notes = qualifiers.get("note", [])

    for note in notes:

        if not note:
            continue

        conn.execute(
            """
            INSERT OR IGNORE INTO feature_note (
                feature_id,
                note_text
            )
            VALUES (?, ?)
            """,
            (
                feature_id,
                note
            )
        )


# ============================================================
# Insert evidence
# ============================================================

def insert_evidence(
    conn,
    feature_id,
    qualifiers
):

    evidence_values = qualifiers.get(
        "evidence",
        []
    )

    for raw_value in evidence_values:

        evidence_list = parse_evidence(
            raw_value
        )

        for evidence in evidence_list:

            conn.execute(
                """
                INSERT OR IGNORE INTO feature_evidence (
                    feature_id,
                    evidence_code,
                    database_name,
                    accession,
                    raw_evidence
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    feature_id,
                    evidence["evidence_code"],
                    evidence["database_name"],
                    evidence["accession"],
                    evidence["raw_evidence"]
                )
            )


# ============================================================
# Insert ligand
# ============================================================

def insert_ligands(
    conn,
    feature_id,
    qualifiers
):
    """
    BINDING ligand qualifiers.

    Current UniProt qualifiers:

        /ligand
        /ligand_id
        /ligand_label
        /ligand_note
        /ligand_part
        /ligand_part_id
        /ligand_part_note
    """

    ligands = qualifiers.get(
        "ligand",
        []
    )

    ligand_ids = qualifiers.get(
        "ligand_id",
        []
    )

    ligand_labels = qualifiers.get(
        "ligand_label",
        []
    )

    ligand_notes = qualifiers.get(
        "ligand_note",
        []
    )

    ligand_parts = qualifiers.get(
        "ligand_part",
        []
    )

    ligand_part_ids = qualifiers.get(
        "ligand_part_id",
        []
    )

    ligand_part_notes = qualifiers.get(
        "ligand_part_note",
        []
    )

    # --------------------------------------------------------
    # If there is no /ligand but there are ligand qualifiers,
    # still create a row.
    # --------------------------------------------------------

    max_len = max(
        len(ligands),
        len(ligand_ids),
        len(ligand_labels),
        len(ligand_notes),
        len(ligand_parts),
        len(ligand_part_ids),
        len(ligand_part_notes),
        0
    )

    for i in range(max_len):

        ligand_name = (
            ligands[i]
            if i < len(ligands)
            else None
        )

        ligand_id = (
            ligand_ids[i]
            if i < len(ligand_ids)
            else None
        )

        ligand_label = (
            ligand_labels[i]
            if i < len(ligand_labels)
            else None
        )

        ligand_note = (
            ligand_notes[i]
            if i < len(ligand_notes)
            else None
        )

        ligand_part = (
            ligand_parts[i]
            if i < len(ligand_parts)
            else None
        )

        ligand_part_id = (
            ligand_part_ids[i]
            if i < len(ligand_part_ids)
            else None
        )

        ligand_part_note = (
            ligand_part_notes[i]
            if i < len(ligand_part_notes)
            else None
        )

        conn.execute(
            """
            INSERT INTO feature_ligand (
                feature_id,
                ligand_name,
                ligand_id,
                ligand_label,
                ligand_note,
                ligand_part,
                ligand_part_id,
                ligand_part_note
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                feature_id,
                ligand_name,
                ligand_id,
                ligand_label,
                ligand_note,
                ligand_part,
                ligand_part_id,
                ligand_part_note
            )
        )


# ============================================================
# Main import
# ============================================================

def main():

    print("=" * 70)
    print("UKW - UniProt FT Import")
    print("=" * 70)

    # --------------------------------------------------------
    # Check files
    # --------------------------------------------------------

    if not DAT_FILE.exists():

        print(
            f"ERROR: UniProt DAT file not found:\n"
            f"  {DAT_FILE}"
        )

        sys.exit(1)

    if not DB_FILE.exists():

        print(
            f"ERROR: SQLite database not found:\n"
            f"  {DB_FILE}"
        )

        sys.exit(1)

    print(f"DAT : {DAT_FILE}")
    print(f"DB  : {DB_FILE}")
    print()

    # --------------------------------------------------------
    # Connect database
    # --------------------------------------------------------

    conn = sqlite3.connect(
        DB_FILE
    )

    conn.row_factory = sqlite3.Row

    conn.execute(
        "PRAGMA foreign_keys = ON"
    )

    # --------------------------------------------------------
    # Create tables
    # --------------------------------------------------------

    conn.executescript(
        CREATE_TABLES_SQL
    )

    conn.commit()

    # --------------------------------------------------------
    # Statistics
    # --------------------------------------------------------

    stats = {
        "records": 0,
        "proteins_found": 0,
        "proteins_missing": 0,
        "features": 0,
        "notes": 0,
        "evidence": 0,
        "ligands": 0,
    }

    missing_accessions = []

    # --------------------------------------------------------
    # Import
    # --------------------------------------------------------

    try:

        for record_lines in parse_records(
            DAT_FILE
        ):

            stats["records"] += 1

            accession = extract_accession(
                record_lines
            )

            entry_name = extract_entry_name(
                record_lines
            )

            if not accession:

                continue

            protein_id = resolve_protein_id(
                conn,
                accession
            )

            if protein_id is None:

                stats["proteins_missing"] += 1

                missing_accessions.append(
                    accession
                )

                continue

            stats["proteins_found"] += 1

            # ------------------------------------------------
            # Parse FT
            # ------------------------------------------------

            features = parse_ft_features(
                record_lines
            )

            if not features:
                continue

            # ------------------------------------------------
            # UniProt release/version
            # ------------------------------------------------
            #
            # We do not assume a release number from filename.
            # Keep source_version NULL for now.
            #

            source_version = None

            # ------------------------------------------------
            # Insert
            # ------------------------------------------------

            for feature in features:

                feature_id = insert_feature(
                    conn,
                    protein_id,
                    feature,
                    source_version
                )

                stats["features"] += 1

                qualifiers = feature.get(
                    "qualifiers",
                    {}
                )

                before = conn.total_changes

                insert_notes(
                    conn,
                    feature_id,
                    qualifiers
                )

                stats["notes"] += (
                    conn.total_changes - before
                )

                before = conn.total_changes

                insert_evidence(
                    conn,
                    feature_id,
                    qualifiers
                )

                stats["evidence"] += (
                    conn.total_changes - before
                )

                before = conn.total_changes

                insert_ligands(
                    conn,
                    feature_id,
                    qualifiers
                )

                stats["ligands"] += (
                    conn.total_changes - before
                )

            # ------------------------------------------------
            # Commit per protein
            # ------------------------------------------------

            conn.commit()

            if stats["records"] % 1000 == 0:

                print(
                    f"Processed records: "
                    f"{stats['records']:,}"
                )

    except Exception:

        conn.rollback()

        print()
        print("ERROR: Import failed.")
        print("Transaction rolled back.")

        raise

    finally:

        conn.close()

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    print()
    print("=" * 70)
    print("IMPORT COMPLETE")
    print("=" * 70)

    print(
        f"UniProt records       : "
        f"{stats['records']:,}"
    )

    print(
        f"Proteins matched      : "
        f"{stats['proteins_found']:,}"
    )

    print(
        f"Proteins not matched  : "
        f"{stats['proteins_missing']:,}"
    )

    print(
        f"FT features processed : "
        f"{stats['features']:,}"
    )

    print(
        f"Notes inserted        : "
        f"{stats['notes']:,}"
    )

    print(
        f"Evidence inserted     : "
        f"{stats['evidence']:,}"
    )

    print(
        f"Ligands inserted      : "
        f"{stats['ligands']:,}"
    )

    # --------------------------------------------------------
    # Missing protein report
    # --------------------------------------------------------

    if missing_accessions:

        missing_file = Path(
            "uniprot_ft_missing_proteins.txt"
        )

        with missing_file.open(
            "w",
            encoding="utf-8"
        ) as fh:

            for accession in sorted(
                set(missing_accessions)
            ):
                fh.write(
                    accession + "\n"
                )

        print()
        print(
            f"Missing protein list: "
            f"{missing_file}"
        )


if __name__ == "__main__":
    main()
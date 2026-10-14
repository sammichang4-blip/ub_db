#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UKW - UniProt FT Parser

Input:
    UP000005640_9606.dat

Output:
    ft.txt

功能：
1. 逐一解析 UniProt protein entry
2. 取得 protein accession
3. 解析所有 FT records
4. 支援跨行 /note、/evidence、/ligand、/id 等 qualifier
5. 保留完整 raw FT block
6. 每一個 FT feature 輸出一筆 TSV
"""

import re
from pathlib import Path


# ============================================================
# Configuration
# ============================================================

INPUT_FILE = Path("../data/UP000005640_9606.dat")
OUTPUT_FILE = Path("ft.txt")


# ============================================================
# Utility
# ============================================================

def clean_qualifier_value(value):
    """
    清理 UniProt qualifier：
        /note="abc
        def"

    -> abc def

    保留文字內容，但把跨行空白合併。
    """
    value = value.strip()

    # Remove surrounding quotes
    if value.startswith('"'):
        value = value[1:]

    if value.endswith('"'):
        value = value[:-1]

    # UniProt continuation lines may contain line breaks
    value = re.sub(r"\s+", " ", value)

    return value.strip()


def parse_location(location):
    """
    解析 UniProt FT location。

    Examples:
        54
        1..76
        76..229
        <1..43
        44..423
        5
        1
    """

    location = location.strip()

    # Remove uncertainty / boundary symbols
    clean = location.replace("<", "").replace(">", "")

    # Simple range
    m = re.match(r"^(\d+)\.\.(\d+)$", clean)

    if m:
        return int(m.group(1)), int(m.group(2))

    # Single residue
    m = re.match(r"^(\d+)$", clean)

    if m:
        pos = int(m.group(1))
        return pos, pos

    # Handle locations such as:
    # 1..76
    # 6..?
    # ?..76
    m = re.match(r"^(\d+)\.\.(\d+|\?)$", clean)

    if m:
        start = int(m.group(1))
        end = None if m.group(2) == "?" else int(m.group(2))
        return start, end

    return None, None


# ============================================================
# Parse qualifier block
# ============================================================

def parse_qualifiers(lines):
    """
    Parse UniProt FT qualifier lines.

    Example:

        /note="Phosphoserine; by PINK1"
        /evidence="ECO:0000269|PubMed:24660806,
        ECO:0000269|PubMed:24751536"

    Returns:

        {
            "note": "...",
            "evidence": "...",
            "id": "...",
            ...
        }
    """

    qualifiers = {}

    current_key = None
    current_value = []

    def save_current():
        nonlocal current_key, current_value

        if current_key is None:
            return

        value = " ".join(current_value)
        value = clean_qualifier_value(value)

        # Multiple same qualifier:
        #
        # /note="..."
        # /note="..."
        #
        # preserve as list
        if current_key in qualifiers:

            if isinstance(qualifiers[current_key], list):
                qualifiers[current_key].append(value)
            else:
                qualifiers[current_key] = [
                    qualifiers[current_key],
                    value
                ]

        else:
            qualifiers[current_key] = value

        current_key = None
        current_value = []

    for line in lines:

        stripped = line.strip()

        if not stripped:
            continue

        # New qualifier
        m = re.match(r'^/([A-Za-z0-9_]+)=(.*)$', stripped)

        if m:
            save_current()

            current_key = m.group(1)
            current_value = [m.group(2)]

        else:
            # Continuation of previous qualifier
            if current_key is not None:
                current_value.append(stripped)

    save_current()

    return qualifiers


# ============================================================
# Parse one FT block
# ============================================================

def parse_ft_block(block_lines):
    """
    Parse:

        FT   DOMAIN          1..76
        FT                   /note="Ubiquitin-like 1"
        FT                   /evidence="..."

    """

    if not block_lines:
        return None

    first = block_lines[0]

    # UniProt FT feature line
    #
    # FT   DOMAIN          1..76
    #
    m = re.match(
        r"^FT\s{3}(\S+)\s+(\S+)",
        first
    )

    if not m:
        return None

    feature_type = m.group(1)
    location = m.group(2)

    start_pos, end_pos = parse_location(location)

    qualifier_lines = []

    for line in block_lines[1:]:
        # Remove "FT" prefix
        if line.startswith("FT"):
            qualifier_lines.append(line[2:])

    qualifiers = parse_qualifiers(qualifier_lines)

    return {
        "feature_type": feature_type,
        "location": location,
        "start_pos": start_pos,
        "end_pos": end_pos,
        "qualifiers": qualifiers,
        "raw_block": "\n".join(block_lines)
    }


# ============================================================
# Parse UniProt entry
# ============================================================

def parse_entry(entry_lines):
    """
    Parse one UniProt entry.

    Returns:
        accession
        entry_name
        features
    """

    accession = None
    entry_name = None

    # --------------------------------------------------------
    # ID
    # --------------------------------------------------------

    for line in entry_lines:

        if line.startswith("ID"):
            parts = line.split()

            if len(parts) >= 2:
                entry_name = parts[1]

        # ----------------------------------------------------
        # AC
        # ----------------------------------------------------

        elif line.startswith("AC"):
            ac_text = line[5:].strip()

            # AC can contain:
            # P12345;
            # Q12345; Q67890;
            accessions = [
                x.strip()
                for x in ac_text.split(";")
                if x.strip()
            ]

            if accessions:
                accession = accessions[0]

            # First accession is canonical UniProt accession.
            # Stop searching.
            if accession:
                break

    # --------------------------------------------------------
    # FT blocks
    # --------------------------------------------------------

    features = []

    current_block = []

    for line in entry_lines:

        if line.startswith("FT"):

            # New FT feature starts when:
            #
            # FT   DOMAIN
            # FT   CHAIN
            # FT   ACT_SITE
            #
            # but NOT:
            #
            # FT                   /note=
            # FT                   /evidence=

            if re.match(r"^FT\s{3}\S+", line):

                # Save previous feature
                if current_block:

                    feature = parse_ft_block(current_block)

                    if feature:
                        features.append(feature)

                current_block = [line]

            elif current_block:
                # Continuation / qualifier
                current_block.append(line)

    # Save last feature
    if current_block:

        feature = parse_ft_block(current_block)

        if feature:
            features.append(feature)

    return {
        "accession": accession,
        "entry_name": entry_name,
        "features": features
    }


# ============================================================
# Parse complete DAT file
# ============================================================

def parse_dat_file(path):

    entries = []

    current_entry = []

    with path.open("r", encoding="utf-8") as f:

        for line in f:

            line = line.rstrip("\n")

            # End of UniProt entry
            if line == "//":

                if current_entry:

                    entry = parse_entry(current_entry)

                    if entry["accession"]:
                        entries.append(entry)

                current_entry = []

            else:
                current_entry.append(line)

    # Handle file without //
    if current_entry:

        entry = parse_entry(current_entry)

        if entry["accession"]:
            entries.append(entry)

    return entries


# ============================================================
# Format qualifier
# ============================================================

def format_qualifier(value):

    if isinstance(value, list):
        return " || ".join(value)

    return value or ""


# ============================================================
# Write ft.txt
# ============================================================

def write_ft_txt(entries, output_file):

    total_features = 0

    with output_file.open(
        "w",
        encoding="utf-8"
    ) as out:

        # Header
        out.write(
            "protein_id\t"
            "entry_name\t"
            "feature_type\t"
            "start_pos\t"
            "end_pos\t"
            "feature_id\t"
            "note\t"
            "ligand\t"
            "ligand_id\t"
            "evidence\t"
            "raw_block\n"
        )

        for entry in entries:

            protein_id = entry["accession"]
            entry_name = entry["entry_name"]

            for feature in entry["features"]:

                q = feature["qualifiers"]

                feature_id = format_qualifier(
                    q.get("id", "")
                )

                note = format_qualifier(
                    q.get("note", "")
                )

                ligand = format_qualifier(
                    q.get("ligand", "")
                )

                ligand_id = format_qualifier(
                    q.get("ligand_id", "")
                )

                evidence = format_qualifier(
                    q.get("evidence", "")
                )

                raw_block = feature["raw_block"]

                # Keep ft.txt one feature per line
                raw_block = raw_block.replace(
                    "\n",
                    " <FT_CONT> "
                )

                # Avoid tabs breaking TSV
                raw_block = raw_block.replace(
                    "\t",
                    " "
                )

                out.write(
                    f"{protein_id}\t"
                    f"{entry_name or ''}\t"
                    f"{feature['feature_type']}\t"
                    f"{feature['start_pos'] or ''}\t"
                    f"{feature['end_pos'] or ''}\t"
                    f"{feature_id}\t"
                    f"{note}\t"
                    f"{ligand}\t"
                    f"{ligand_id}\t"
                    f"{evidence}\t"
                    f"{raw_block}\n"
                )

                total_features += 1

    return total_features


# ============================================================
# Main
# ============================================================

def main():

    if not INPUT_FILE.exists():

        print(
            f"[ERROR] Input file not found: "
            f"{INPUT_FILE}"
        )

        return

    print("=" * 70)
    print("UKW - UniProt FT Parser")
    print("=" * 70)

    print(f"Input : {INPUT_FILE}")
    print(f"Output: {OUTPUT_FILE}")
    print()

    entries = parse_dat_file(INPUT_FILE)

    print(f"Protein entries : {len(entries):,}")

    total_features = write_ft_txt(
        entries,
        OUTPUT_FILE
    )

    print(
        f"FT features     : {total_features:,}"
    )

    print()
    print("Done.")
    print(f"Output written to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
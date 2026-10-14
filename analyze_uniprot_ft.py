#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UKW - UniProt FT Schema Analyzer

分析 UP000005640_9606.dat 中所有 FT 的結構。

輸出：
    columns.txt

格式：

[ACT_SITE]
  - evidence
  - note

[BINDING]
  - evidence
  - ligand
  - ligand_id
  - note

[CROSSLNK]
  - evidence
  - note

[VARIANT]
  - id
  - note
  - evidence

目的：
    只列出「不重複」的 FT type 與 qualifier，
    用來評估 database schema。
"""

from pathlib import Path
import re


# ============================================================
# Configuration
# ============================================================

INPUT_FILE = Path("../data/UP000005640_9606.dat")
OUTPUT_FILE = Path("columns.txt")


# ============================================================
# Data structure
# ============================================================

# {
#     "DOMAIN": {"note", "evidence"},
#     "BINDING": {"note", "ligand", "ligand_id", "evidence"},
#     ...
# }

ft_structure = {}


# ============================================================
# Parse qualifier lines
# ============================================================

def extract_qualifier_names(lines):
    """
    只抓 qualifier 名稱。

    例如：

        /note="..."
        /evidence="..."
        /ligand="arginine"
        /ligand_id="ChEBI:CHEBI:32696"

    回傳：

        {"note", "evidence", "ligand", "ligand_id"}
    """

    qualifiers = set()

    for line in lines:

        stripped = line.strip()

        match = re.match(
            r"^/([A-Za-z0-9_]+)=",
            stripped
        )

        if match:

            qualifiers.add(
                match.group(1)
            )

    return qualifiers


# ============================================================
# Process one FT block
# ============================================================

def process_ft_block(block):

    if not block:
        return

    first_line = block[0]

    # --------------------------------------------------------
    # FT type
    # --------------------------------------------------------

    match = re.match(
        r"^FT\s{3}(\S+)",
        first_line
    )

    if not match:
        return

    ft_type = match.group(1)

    # --------------------------------------------------------
    # Initialize
    # --------------------------------------------------------

    if ft_type not in ft_structure:

        ft_structure[ft_type] = set()

    # --------------------------------------------------------
    # Qualifier lines
    # --------------------------------------------------------

    qualifier_lines = []

    for line in block[1:]:

        if line.startswith("FT"):

            qualifier_lines.append(
                line[2:]
            )

    # --------------------------------------------------------
    # Extract unique qualifier names
    # --------------------------------------------------------

    qualifiers = extract_qualifier_names(
        qualifier_lines
    )

    ft_structure[
        ft_type
    ].update(
        qualifiers
    )


# ============================================================
# Parse DAT
# ============================================================

def analyze_dat_file(path):

    current_block = []

    with path.open(
        "r",
        encoding="utf-8"
    ) as f:

        for raw_line in f:

            line = raw_line.rstrip("\n")

            # ------------------------------------------------
            # New FT
            # ------------------------------------------------

            if re.match(
                r"^FT\s{3}\S+",
                line
            ):

                # Save previous FT
                if current_block:

                    process_ft_block(
                        current_block
                    )

                current_block = [
                    line
                ]

            # ------------------------------------------------
            # FT continuation
            # ------------------------------------------------

            elif line.startswith("FT"):

                if current_block:

                    current_block.append(
                        line
                    )

            # ------------------------------------------------
            # Other lines
            # ------------------------------------------------

            else:

                continue

    # --------------------------------------------------------
    # Last block
    # --------------------------------------------------------

    if current_block:

        process_ft_block(
            current_block
        )


# ============================================================
# Write columns.txt
# ============================================================

def write_output(path):

    with path.open(
        "w",
        encoding="utf-8"
    ) as out:

        out.write(
            "UKW - UniProt FT Schema\n"
        )

        out.write(
            "=" * 70 + "\n\n"
        )

        out.write(
            "Unique FT types and their qualifiers\n"
        )

        out.write(
            "Qualifiers are listed only once per FT type.\n\n"
        )

        # ----------------------------------------------------
        # FT types alphabetically
        # ----------------------------------------------------

        for ft_type in sorted(
            ft_structure
        ):

            out.write(
                f"[{ft_type}]\n"
            )

            qualifiers = ft_structure[
                ft_type
            ]

            if qualifiers:

                for qualifier in sorted(
                    qualifiers
                ):

                    out.write(
                        f"  - /{qualifier}\n"
                    )

            else:

                out.write(
                    "  - (no qualifiers)\n"
                )

            out.write("\n")

        # ----------------------------------------------------
        # Global qualifier list
        # ----------------------------------------------------

        all_qualifiers = set()

        for qualifiers in ft_structure.values():

            all_qualifiers.update(
                qualifiers
            )

        out.write(
            "=" * 70 + "\n"
        )

        out.write(
            "ALL UNIQUE QUALIFIERS\n"
        )

        out.write(
            "=" * 70 + "\n\n"
        )

        for qualifier in sorted(
            all_qualifiers
        ):

            out.write(
                f"/{qualifier}\n"
            )

        out.write("\n")

        # ----------------------------------------------------
        # Summary
        # ----------------------------------------------------

        out.write(
            "=" * 70 + "\n"
        )

        out.write(
            "SUMMARY\n"
        )

        out.write(
            "=" * 70 + "\n\n"
        )

        out.write(
            f"FT types: {len(ft_structure)}\n"
        )

        out.write(
            f"Unique qualifiers: "
            f"{len(all_qualifiers)}\n"
        )


# ============================================================
# Main
# ============================================================

def main():

    print("=" * 70)
    print("UKW - UniProt FT Schema Analyzer")
    print("=" * 70)

    if not INPUT_FILE.exists():

        print(
            f"[ERROR] File not found: "
            f"{INPUT_FILE}"
        )

        return

    analyze_dat_file(
        INPUT_FILE
    )

    write_output(
        OUTPUT_FILE
    )

    print()
    print(
        f"FT types found: "
        f"{len(ft_structure)}"
    )

    all_qualifiers = set()

    for qualifiers in ft_structure.values():

        all_qualifiers.update(
            qualifiers
        )

    print(
        f"Unique qualifiers: "
        f"{len(all_qualifiers)}"
    )

    print(
        f"Output: {OUTPUT_FILE}"
    )

    print("Done.")


if __name__ == "__main__":
    main()
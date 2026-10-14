#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
paper_domain_miner.py

UKW - Paper Domain Miner
========================

Phase 1 + Phase 1.5

Goal
----
Find papers related to a specific protein and identify papers
that contain useful evidence for:

    - domain architecture
    - domain boundaries
    - amino-acid ranges
    - residues
    - mutations
    - isoforms
    - constructs
    - protein structures
    - PDB IDs
    - figure captions
    - tables
    - mechanistic information

Important
---------
This version DOES NOT write to protein_domains.

It writes:

    paper_domain.txt

The workflow is:

    SQLite protein
        |
        +--> identity queries
        |
        +--> evidence queries
        |
        +--> mutation queries
        |
        +--> structure/domain queries
        |
        +--> protein-specific queries
        |
        +--> known PMID seeds
        |
        v
    merge / deduplicate
        |
        v
    Europe PMC metadata
        |
        v
    fullTextXML if PMCID available
        |
        +--> title
        +--> abstract
        +--> body
        +--> sections
        +--> figures / captions
        +--> tables
        |
        v
    evidence-aware scoring
        |
        v
    paper_domain.txt


Example
-------
python paper_domain_miner.py \
    --db ../data/db/ubiquitin.db \
    --protein P22314


Recommended first run
---------------------
python paper_domain_miner.py \
    --db ../data/db/ubiquitin.db \
    --protein P22314 \
    --limit 100 \
    --max-papers 50 \
    --min-score 10 \
    --year-from 2000 \
    --year-to 2026 \
    --output paper_domain.txt
"""

import argparse
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET

from datetime import datetime
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


# ============================================================
# Configuration
# ============================================================

EPMC_SEARCH_URL = (
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
)

EPMC_FULLTEXT_BASE = (
    "https://www.ebi.ac.uk/europepmc/webservices/rest"
)

USER_AGENT = (
    "UKW-paper-domain-miner/2.0 "
    "(protein-domain-literature-mining)"
)

REQUEST_DELAY = 0.25


# ============================================================
# Known papers
# ============================================================
#
# These are high-confidence seed papers.
#
# This is intentional:
# UKW literature mining is an evidence curation task.
#
# If we already know that a paper is important for a protein,
# we should not depend entirely on a keyword search to rediscover
# it.
#
# ============================================================

KNOWN_PAPER_IDS = {

    # UBA1 / P22314
    "P22314": {
        "37950858": (
            "UBA1 domain architecture and VEXAS mutation mapping"
        ),
        "33536262": (
            "UBA1 mutations and VEXAS / autoinflammatory disease"
        ),
    },

}


# ============================================================
# Generic evidence terms
# ============================================================

DOMAIN_TERMS = {

    "domain": 7,
    "domains": 7,

    "domain architecture": 12,
    "protein architecture": 12,

    "domain boundary": 14,
    "domain boundaries": 14,

    "boundary": 5,
    "boundaries": 5,

    "architecture": 5,

    "region": 3,
    "motif": 4,
}


STRUCTURE_TERMS = {

    "crystal structure": 14,
    "cryo-em": 14,
    "cryo em": 14,
    "cryoelectron microscopy": 12,

    "structural basis": 13,
    "protein structure": 11,

    "structure of": 8,

    "three-dimensional structure": 10,
    "3d structure": 8,

    "atomic structure": 10,
    "molecular structure": 8,

    "structure-function": 8,
    "structure function": 8,

    "pdb": 10,
}


MUTATION_TERMS = {

    "mutation": 8,
    "mutations": 8,

    "variant": 7,
    "variants": 7,

    "mutant": 6,
    "mutants": 6,

    "missense": 8,
    "substitution": 5,

    "amino acid": 7,
    "amino-acid": 7,

    "residue": 8,
    "residues": 8,

    "mutation mapping": 12,
    "mutational": 6,
}


ISOFORM_TERMS = {

    "isoform": 8,
    "isoforms": 8,

    "alternative isoform": 10,
    "alternative splicing": 5,

    "translation initiation": 5,
    "start codon": 5,
}


CONSTRUCT_TERMS = {

    "construct": 7,
    "constructs": 7,

    "truncation": 7,
    "truncated": 6,

    "deletion mutant": 7,
    "deletion mutants": 7,

    "expression construct": 6,
    "recombinant": 4,
}


MECHANISTIC_TERMS = {

    "catalytic": 6,
    "catalysis": 6,

    "active site": 8,

    "enzymatic activity": 6,

    "mechanism": 5,
    "mechanistic": 5,

    "binding site": 5,
    "interaction interface": 6,
    "interface": 3,
}


# ============================================================
# Negative terms
# ============================================================

CLINICAL_NEGATIVE_TERMS = {

    "patient": -2,
    "patients": -2,

    "cohort": -3,

    "clinical": -2,
    "diagnosis": -2,
    "diagnostic": -2,

    "treatment": -2,
    "therapy": -2,

    "prognosis": -2,

    "case report": -4,
    "retrospective": -4,

    "clinical features": -3,
    "hematologic": -2,
}


LOW_VALUE_TERMS = {

    "survival": -4,
    "quality of life": -4,

    "healthcare": -4,
    "hospitalization": -4,

    "epidemiology": -4,
}


# ============================================================
# Generic query terms
# ============================================================

GENERIC_EVIDENCE_TERMS = [

    "domain",
    "\"domain architecture\"",
    "\"domain boundary\"",

    "structure",
    "\"structural basis\"",
    "\"crystal structure\"",
    "\"cryo-EM\"",

    "residue",
    "residues",

    "\"amino acid\"",

    "mutation",
    "mutations",

    "variant",
    "variants",

    "isoform",

    "construct",
    "truncation",

    "PDB",
]


# ============================================================
# Enzyme family terms
# ============================================================

E1_TERMS = [

    "E1",
    "\"E1 enzyme\"",

    "\"ubiquitin-activating enzyme\"",

    "UBA1",

    "\"ubiquitin activating enzyme\"",

    "adenylation",
    "thioester",
    "transthioesterification",
]


E2_TERMS = [

    "E2",
    "\"E2 enzyme\"",

    "\"ubiquitin-conjugating enzyme\"",

    "UBC",

    "transthioesterification",
]


E3_TERMS = [

    "E3",
    "\"E3 ligase\"",
    "\"ubiquitin ligase\"",

    "substrate recognition",
]


DUB_TERMS = [

    "DUB",
    "\"deubiquitinating enzyme\"",
    "deubiquitinase",
    "deubiquitination",
]


# ============================================================
# Protein-specific terms
# ============================================================

UBA1_SPECIFIC_TERMS = [

    "UBA1",
    "UBE1",

    "UBA1a",
    "UBA1b",
    "UBA1c",

    "IAD",
    "FCCH",
    "AAD",
    "SCCH",
    "UFD",
    "NLS",

    "M1",
    "M41",
    "M67",

    "Met41",
    "Met67",

    "Cys632",

    "VEXAS",
]


# ============================================================
# HTTP
# ============================================================

def http_get(
    url,
    timeout=30,
    retries=2,
):
    """
    GET URL with retry.

    Returns:
        bytes
        None
    """

    for attempt in range(
        retries + 1
    ):

        request = Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": (
                    "application/xml,"
                    "text/xml,"
                    "application/json,"
                    "*/*"
                ),
            },
        )

        try:

            with urlopen(
                request,
                timeout=timeout,
            ) as response:

                return response.read()

        except HTTPError as e:

            if attempt >= retries:

                print(
                    f"[HTTP ERROR] "
                    f"{e.code}: {e.reason}",
                    file=sys.stderr,
                )

                return None

            time.sleep(
                1.0 * (attempt + 1)
            )

        except URLError as e:

            if attempt >= retries:

                print(
                    f"[URL ERROR] "
                    f"{e.reason}",
                    file=sys.stderr,
                )

                return None

            time.sleep(
                1.0 * (attempt + 1)
            )

        except Exception as e:

            if attempt >= retries:

                print(
                    f"[ERROR] HTTP request failed: "
                    f"{e}",
                    file=sys.stderr,
                )

                return None

            time.sleep(
                1.0 * (attempt + 1)
            )

    return None


# ============================================================
# Text utilities
# ============================================================

def normalize_text(text):
    if not text:
        return ""

    text = text.lower()

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def clean_text(text):
    if not text:
        return ""

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def xml_text(element):
    if element is None:
        return ""

    return clean_text(
        " ".join(
            element.itertext()
        )
    )


def local_tag(tag):
    """
    Remove XML namespace.
    """

    if "}" in tag:
        return tag.rsplit(
            "}",
            1
        )[-1]

    return tag


# ============================================================
# Database
# ============================================================

def get_connection(db_path):

    conn = sqlite3.connect(
        db_path
    )

    conn.row_factory = sqlite3.Row

    return conn


def get_protein(
    conn,
    accession,
):

    sql = """
        SELECT
            protein_id,
            uniprot_acc,
            entry_name,
            gene_name,
            protein_name,
            organism,
            taxon_id,
            sequence,
            length
        FROM proteins
        WHERE uniprot_acc = ?
           OR protein_id = ?
        LIMIT 1
    """

    return conn.execute(
        sql,
        (
            accession,
            accession,
        ),
    ).fetchone()


def get_aliases(
    conn,
    protein_id,
):

    aliases = set()

    # --------------------------------------------------------
    # protein_alias
    # --------------------------------------------------------

    try:

        rows = conn.execute(
            """
            SELECT alias_name
            FROM protein_alias
            WHERE protein_id = ?
            """,
            (protein_id,),
        ).fetchall()

        for row in rows:

            value = row["alias_name"]

            if value:
                aliases.add(
                    value.strip()
                )

    except sqlite3.OperationalError:
        pass

    # --------------------------------------------------------
    # gene_alias
    # --------------------------------------------------------

    try:

        rows = conn.execute(
            """
            SELECT gene_alias
            FROM gene_alias
            WHERE protein_id = ?
            """,
            (protein_id,),
        ).fetchall()

        for row in rows:

            value = row["gene_alias"]

            if value:
                aliases.add(
                    value.strip()
                )

    except sqlite3.OperationalError:
        pass

    return sorted(
        aliases,
        key=lambda x: x.lower(),
    )


def get_enzyme_info(
    conn,
    protein_id,
):

    try:

        row = conn.execute(
            """
            SELECT
                enzyme_id,
                gene_name,
                enzyme_class,
                enzyme_subfamily,
                enzyme_family
            FROM enzymes
            WHERE enzyme_id = ?
            LIMIT 1
            """,
            (protein_id,),
        ).fetchone()

        if row:
            return dict(row)

    except sqlite3.OperationalError:
        pass

    return None


# ============================================================
# Search term helpers
# ============================================================

def quote_term(term):

    term = term.strip()

    if not term:
        return ""

    if (
        term.startswith('"')
        and term.endswith('"')
    ):
        return term

    if " " in term:
        return f'"{term}"'

    return term


def unique_terms(
    terms,
):

    seen = set()
    result = []

    for term in terms:

        key = normalize_text(
            term
        )

        if not key:
            continue

        if key not in seen:

            seen.add(key)
            result.append(term)

    return result


def build_identity_terms(
    protein,
    aliases,
):

    terms = []

    for key in [
        "uniprot_acc",
        "gene_name",
        "protein_name",
        "entry_name",
    ]:

        value = protein[key]

        if value:
            terms.append(
                value.strip()
            )

    terms.extend(
        aliases
    )

    return unique_terms(
        terms
    )


def get_family_terms(
    enzyme_info,
):

    if not enzyme_info:
        return []

    enzyme_class = (
        enzyme_info.get(
            "enzyme_class"
        )
        or ""
    ).upper()

    subfamily = (
        enzyme_info.get(
            "enzyme_subfamily"
        )
        or ""
    ).upper()

    family = (
        enzyme_info.get(
            "enzyme_family"
        )
        or ""
    ).upper()

    terms = []

    if enzyme_class == "E1":

        terms.extend(
            E1_TERMS
        )

    elif enzyme_class == "E2":

        terms.extend(
            E2_TERMS
        )

    elif enzyme_class == "E3":

        terms.extend(
            E3_TERMS
        )

        if (
            "HECT" in subfamily
            or "HECT" in family
        ):

            terms.extend([
                "HECT",
                "\"HECT domain\"",
            ])

        if (
            "RING" in subfamily
            or "RING" in family
        ):

            terms.extend([
                "RING",
                "\"RING domain\"",
            ])

        if (
            "RBR" in subfamily
            or "RBR" in family
        ):

            terms.extend([
                "RBR",
                "\"RBR ligase\"",
                "RING1",
                "IBR",
                "RING2",
            ])

    elif enzyme_class == "DUB":

        terms.extend(
            DUB_TERMS
        )

    return unique_terms(
        terms
    )


def get_protein_specific_terms(
    protein,
):

    gene = (
        protein["gene_name"]
        or ""
    ).upper()

    accession = (
        protein["uniprot_acc"]
        or ""
    ).upper()

    if (
        gene == "UBA1"
        or accession == "P22314"
    ):

        return UBA1_SPECIFIC_TERMS

    return []


# ============================================================
# Build MULTIPLE queries
# ============================================================

def build_search_queries(
    protein,
    aliases,
    enzyme_info=None,
    year_from=None,
    year_to=None,
):
    """
    Build multiple independent search queries.

    This is the critical change from the previous version.

    We DO NOT require:

        identity AND evidence

    in one single query.

    Instead:

        Query A:
            identity

        Query B:
            identity + domain

        Query C:
            identity + mutation

        Query D:
            identity + structure

        Query E:
            protein-specific terms

    Results are merged later.

    This prevents important papers from being lost because
    a keyword occurs only in the full text / figure caption.
    """

    identity_terms = build_identity_terms(
        protein,
        aliases,
    )

    if not identity_terms:
        return []

    identity = " OR ".join(
        quote_term(x)
        for x in identity_terms
    )

    family_terms = get_family_terms(
        enzyme_info
    )

    specific_terms = (
        get_protein_specific_terms(
            protein
        )
    )

    queries = []

    # --------------------------------------------------------
    # 1. Broad identity query
    # --------------------------------------------------------

    queries.append(
        f"({identity})"
    )

    # --------------------------------------------------------
    # 2. Identity + generic evidence
    # --------------------------------------------------------

    generic_evidence = " OR ".join(
        quote_term(x)
        for x in GENERIC_EVIDENCE_TERMS
    )

    queries.append(
        f"({identity}) AND "
        f"({generic_evidence})"
    )

    # --------------------------------------------------------
    # 3. Identity + mutation
    # --------------------------------------------------------

    mutation_query = " OR ".join([
        "mutation",
        "mutations",
        "variant",
        "variants",
        "residue",
        "residues",
        "\"amino acid\"",
        "missense",
    ])

    queries.append(
        f"({identity}) AND "
        f"({mutation_query})"
    )

    # --------------------------------------------------------
    # 4. Identity + structure
    # --------------------------------------------------------

    structure_query = " OR ".join([
        "structure",
        "\"structural basis\"",
        "\"crystal structure\"",
        "\"cryo-EM\"",
        "PDB",
        "construct",
    ])

    queries.append(
        f"({identity}) AND "
        f"({structure_query})"
    )

    # --------------------------------------------------------
    # 5. Identity + domain
    # --------------------------------------------------------

    domain_query = " OR ".join([
        "domain",
        "\"domain architecture\"",
        "\"domain boundary\"",
        "architecture",
    ])

    queries.append(
        f"({identity}) AND "
        f"({domain_query})"
    )

    # --------------------------------------------------------
    # 6. Family-specific query
    # --------------------------------------------------------

    if family_terms:

        family_query = " OR ".join(
            quote_term(x)
            for x in family_terms
        )

        queries.append(
            f"({identity}) AND "
            f"({family_query})"
        )

    # --------------------------------------------------------
    # 7. Protein-specific query
    # --------------------------------------------------------

    if specific_terms:

        specific_query = " OR ".join(
            quote_term(x)
            for x in specific_terms
        )

        queries.append(
            f"({identity}) AND "
            f"({specific_query})"
        )

    # --------------------------------------------------------
    # 8. UBA1-specific VEXAS query
    # --------------------------------------------------------

    gene = (
        protein["gene_name"]
        or ""
    ).upper()

    accession = (
        protein["uniprot_acc"]
        or ""
    ).upper()

    if (
        gene == "UBA1"
        or accession == "P22314"
    ):

        queries.extend([

            "UBA1 AND VEXAS",

            "UBA1 AND mutation",

            "UBA1 AND domain",

            "UBA1 AND structure",

            "UBA1 AND isoform",

            "UBA1 AND residue",

            "\"ubiquitin activating enzyme\" "
            "AND VEXAS",

        ])

    # --------------------------------------------------------
    # Date filter
    # --------------------------------------------------------

    final_queries = []

    for query in queries:

        if year_from is not None:

            if year_to is None:
                year_to = datetime.now().year

            query += (
                f" AND FIRST_PDATE:"
                f"[{year_from}-01-01 TO "
                f"{year_to}-12-31]"
            )

        final_queries.append(
            query
        )

    # Deduplicate
    return unique_terms(
        final_queries
    )


# ============================================================
# Europe PMC search
# ============================================================

def search_europe_pmc(
    query,
    page_size=100,
):
    """
    Search Europe PMC.

    resultType=core provides richer publication metadata,
    including abstract and full-text links where available.
    """

    params = {
        "query": query,
        "format": "xml",
        "pageSize": page_size,
        "resultType": "core",
    }

    url = (
        EPMC_SEARCH_URL
        + "?"
        + urlencode(params)
    )

    data = http_get(
        url
    )

    if not data:
        return []

    try:

        root = ET.fromstring(
            data
        )

    except ET.ParseError as e:

        print(
            "[ERROR] Europe PMC XML parse failed:",
            e,
            file=sys.stderr,
        )

        return []

    results = []

    result_list = root.find(
        "resultList"
    )

    if result_list is None:
        return []

    for result in result_list.findall(
        "result"
    ):

        record = {}

        record["pmid"] = xml_text(
            result.find("pmid")
        )

        record["pmcid"] = xml_text(
            result.find("pmcid")
        )

        record["title"] = xml_text(
            result.find("title")
        )

        record["authorString"] = xml_text(
            result.find("authorString")
        )

        record["journalTitle"] = xml_text(
            result.find("journalTitle")
        )

        record["pubYear"] = xml_text(
            result.find("pubYear")
        )

        record["firstPublicationDate"] = (
            xml_text(
                result.find(
                    "firstPublicationDate"
                )
            )
        )

        record["abstract"] = xml_text(
            result.find("abstractText")
        )

        record["doi"] = ""

        # ----------------------------------------------------
        # Article IDs
        # ----------------------------------------------------

        for node in result.findall(
            "./articleIds/articleId"
        ):

            id_type = (
                node.attrib.get(
                    "type",
                    ""
                ).lower()
            )

            value = xml_text(
                node
            )

            if id_type == "doi":
                record["doi"] = value

        # ----------------------------------------------------
        # Publication types
        # ----------------------------------------------------

        publication_types = []

        for node in result.findall(
            "./pubTypeList/pubType"
        ):

            value = xml_text(
                node
            )

            if value:
                publication_types.append(
                    value
                )

        record["publication_types"] = (
            publication_types
        )

        # ----------------------------------------------------
        # Open access
        # ----------------------------------------------------

        record["isOpenAccess"] = xml_text(
            result.find(
                "isOpenAccess"
            )
        )

        record["inEPMC"] = xml_text(
            result.find(
                "inEPMC"
            )
        )

        record["fullTextUrl"] = ""

        # ----------------------------------------------------
        # Full-text links
        # ----------------------------------------------------

        for node in result.iter():

            if local_tag(
                node.tag
            ) != "fullTextUrl":

                continue

            url_value = node.attrib.get(
                "url",
                ""
            )

            if url_value:
                record[
                    "fullTextUrl"
                ] = url_value

                break

        if record["pmcid"]:

            record["pmcid_url"] = (
                "https://pmc.ncbi.nlm.nih.gov/articles/"
                + record["pmcid"]
                + "/"
            )

            record[
                "fulltext_xml_url"
            ] = (
                EPMC_FULLTEXT_BASE
                + "/"
                + record["pmcid"]
                + "/fullTextXML"
            )

        else:

            record["pmcid_url"] = ""
            record[
                "fulltext_xml_url"
            ] = ""

        results.append(
            record
        )

    return results


# ============================================================
# Fetch full-text XML
# ============================================================

def fetch_fulltext_xml(
    pmcid,
):
    """
    Fetch full-text XML from Europe PMC.

    Endpoint:
        /{PMCID}/fullTextXML

    Europe PMC documents this endpoint for full-text
    articles available in its full-text collection.
    """

    if not pmcid:
        return None

    pmcid = pmcid.strip()

    if not pmcid.upper().startswith(
        "PMC"
    ):
        pmcid = "PMC" + pmcid

    url = (
        EPMC_FULLTEXT_BASE
        + "/"
        + pmcid
        + "/fullTextXML"
    )

    data = http_get(
        url,
        timeout=40,
        retries=1,
    )

    if not data:
        return None

    try:

        root = ET.fromstring(
            data
        )

        return root

    except ET.ParseError as e:

        print(
            f"[WARNING] Full-text XML parse failed "
            f"for {pmcid}: {e}",
            file=sys.stderr,
        )

        return None


# ============================================================
# Full text extraction
# ============================================================

def extract_fulltext_components(
    root,
):
    """
    Extract structured components from JATS XML.

    Returns:

        {
            "fulltext": "...",
            "title": "...",
            "abstract": "...",
            "body": "...",
            "figures": [
                {
                    "label": "...",
                    "caption": "...",
                    "text": "..."
                }
            ],
            "tables": [
                {
                    "label": "...",
                    "caption": "...",
                    "text": "..."
                }
            ],
            "sections": [
                {
                    "title": "...",
                    "text": "..."
                }
            ]
        }
    """

    data = {
        "fulltext": "",
        "title": "",
        "abstract": "",
        "body": "",
        "figures": [],
        "tables": [],
        "sections": [],
    }

    if root is None:
        return data

    # --------------------------------------------------------
    # Article title
    # --------------------------------------------------------

    for element in root.iter():

        if local_tag(
            element.tag
        ) == "article-title":

            value = xml_text(
                element
            )

            if value:

                data["title"] = value

                break

    # --------------------------------------------------------
    # Abstract
    # --------------------------------------------------------

    abstracts = []

    for element in root.iter():

        if local_tag(
            element.tag
        ) == "abstract":

            value = xml_text(
                element
            )

            if value:
                abstracts.append(
                    value
                )

    if abstracts:

        data["abstract"] = " ".join(
            abstracts
        )

    # --------------------------------------------------------
    # Body
    # --------------------------------------------------------

    for element in root.iter():

        if local_tag(
            element.tag
        ) == "body":

            data["body"] = xml_text(
                element
            )

            break

    # --------------------------------------------------------
    # Sections
    # --------------------------------------------------------

    for sec in root.iter():

        if local_tag(
            sec.tag
        ) != "sec":

            continue

        title = ""

        for child in sec:

            if local_tag(
                child.tag
            ) == "title":

                title = xml_text(
                    child
                )

                break

        text = xml_text(
            sec
        )

        if text:

            data["sections"].append({
                "title": title,
                "text": text,
            })

    # --------------------------------------------------------
    # Figures
    # --------------------------------------------------------

    for fig in root.iter():

        if local_tag(
            fig.tag
        ) != "fig":

            continue

        label = ""
        caption = ""

        for child in fig:

            child_tag = local_tag(
                child.tag
            )

            if child_tag == "label":

                label = xml_text(
                    child
                )

            elif child_tag == "caption":

                caption = xml_text(
                    child
                )

        fig_text = xml_text(
            fig
        )

        data["figures"].append({
            "label": label,
            "caption": caption,
            "text": fig_text,
        })

    # --------------------------------------------------------
    # Tables
    # --------------------------------------------------------

    for table_wrap in root.iter():

        if local_tag(
            table_wrap.tag
        ) != "table-wrap":

            continue

        label = ""
        caption = ""

        for child in table_wrap:

            child_tag = local_tag(
                child.tag
            )

            if child_tag == "label":

                label = xml_text(
                    child
                )

            elif child_tag == "caption":

                caption = xml_text(
                    child
                )

        table_text = xml_text(
            table_wrap
        )

        data["tables"].append({
            "label": label,
            "caption": caption,
            "text": table_text,
        })

    # --------------------------------------------------------
    # Full text
    # --------------------------------------------------------

    parts = []

    for key in [
        "title",
        "abstract",
        "body",
    ]:

        if data[key]:
            parts.append(
                data[key]
            )

    for section in data[
        "sections"
    ]:

        if section["text"]:
            parts.append(
                section["text"]
            )

    for fig in data[
        "figures"
    ]:

        if fig["text"]:
            parts.append(
                fig["text"]
            )

    for table in data[
        "tables"
    ]:

        if table["text"]:
            parts.append(
                table["text"]
            )

    data["fulltext"] = " ".join(
        parts
    )

    return data


# ============================================================
# Regex evidence
# ============================================================

RESIDUE_PATTERNS = [

    # p.Met41Thr
    re.compile(
        r"\bp\.[A-Z][a-z]{2}\d+[A-Z][a-z]{2}\b"
    ),

    # p.M41T
    re.compile(
        r"\bp\.[A-Z]\d+[A-Z]\b"
    ),

    # Met41Thr
    re.compile(
        r"\b[A-Z][a-z]{2}\d+[A-Z][a-z]{2}\b"
    ),

    # M41T
    re.compile(
        r"\b[A-Z]\d+[A-Z]\b"
    ),
]


RANGE_PATTERNS = [

    re.compile(
        r"\bresidues?\s+\d+\s*[-–]\s*\d+\b",
        re.I,
    ),

    re.compile(
        r"\bamino acids?\s+\d+\s*[-–]\s*\d+\b",
        re.I,
    ),

    re.compile(
        r"\baa\s+\d+\s*[-–]\s*\d+\b",
        re.I,
    ),

    re.compile(
        r"\b\d+\s*[-–]\s*\d+\s*(?:aa|amino acids?)\b",
        re.I,
    ),
]


PDB_PATTERN = re.compile(
    r"\b(?:PDB|PDB ID|PDB code)"
    r"\s*[:#]?\s*"
    r"[0-9][A-Za-z0-9]{3}\b",
    re.I,
)


def detect_residue_patterns(
    text,
):

    matches = []

    for pattern in RESIDUE_PATTERNS:

        for match in pattern.findall(
            text
        ):

            if match not in matches:
                matches.append(
                    match
                )

    return matches


def detect_range_patterns(
    text,
):

    matches = []

    for pattern in RANGE_PATTERNS:

        for match in pattern.findall(
            text
        ):

            if match not in matches:
                matches.append(
                    match
                )

    return matches


def detect_pdb(
    text,
):

    matches = []

    for match in PDB_PATTERN.findall(
        text
    ):

        if match not in matches:

            matches.append(
                match
            )

    return matches


# ============================================================
# Find evidence contexts
# ============================================================

def extract_keyword_contexts(
    text,
    keywords,
    window=220,
    max_contexts=30,
):
    """
    Return snippets around keyword hits.

    Used especially for:
        IAD
        FCCH
        AAD
        SCCH
        UFD
        UBA1a/b/c
        M41/M67
        VEXAS
        mutations
        residues
    """

    contexts = []

    if not text:
        return contexts

    lower = text.lower()

    for keyword in keywords:

        keyword_norm = keyword.lower()

        start = 0

        while True:

            pos = lower.find(
                keyword_norm,
                start,
            )

            if pos < 0:
                break

            left = max(
                0,
                pos - window,
            )

            right = min(
                len(text),
                pos + len(keyword) + window,
            )

            snippet = clean_text(
                text[left:right]
            )

            contexts.append({
                "keyword": keyword,
                "snippet": snippet,
            })

            if len(contexts) >= max_contexts:
                return contexts

            start = (
                pos
                + len(keyword_norm)
            )

    return contexts


# ============================================================
# Score terms
# ============================================================

def add_term_scores(
    text,
    term_dict,
    reasons,
):

    score = 0

    for term, value in term_dict.items():

        normalized = normalize_text(
            term
        )

        if normalized in text:

            score += value

            sign = (
                "+"
                if value >= 0
                else ""
            )

            reasons.append(
                f"{sign}{value}: {term}"
            )

    return score


# ============================================================
# Protein identity score
# ============================================================

def protein_identity_score(
    text,
    title,
    protein,
    aliases,
):

    score = 0
    reasons = []

    title_norm = normalize_text(
        title
    )

    accession = normalize_text(
        protein["uniprot_acc"]
        or ""
    )

    gene = normalize_text(
        protein["gene_name"]
        or ""
    )

    protein_name = normalize_text(
        protein["protein_name"]
        or ""
    )

    # --------------------------------------------------------
    # UniProt accession
    # --------------------------------------------------------

    if (
        accession
        and accession in text
    ):

        score += 20

        reasons.append(
            f"+20: UniProt accession "
            f"{accession}"
        )

    # --------------------------------------------------------
    # Gene
    # --------------------------------------------------------

    if gene:

        if gene in title_norm:

            score += 20

            reasons.append(
                f"+20: gene {gene} in title"
            )

        elif gene in text:

            score += 10

            reasons.append(
                f"+10: gene {gene}"
            )

    # --------------------------------------------------------
    # Protein name
    # --------------------------------------------------------

    if protein_name:

        short_name = (
            protein_name[:100]
        )

        if (
            len(short_name) > 5
            and short_name in text
        ):

            score += 5

            reasons.append(
                "+5: protein name"
            )

    # --------------------------------------------------------
    # Aliases
    # --------------------------------------------------------

    alias_hits = []

    for alias in aliases:

        alias_norm = normalize_text(
            alias
        )

        if (
            alias_norm
            and len(alias_norm) >= 3
            and alias_norm in text
        ):

            alias_hits.append(
                alias
            )

    if alias_hits:

        bonus = min(
            10,
            len(alias_hits) * 2,
        )

        score += bonus

        reasons.append(
            f"+{bonus}: aliases "
            f"{', '.join(alias_hits[:5])}"
        )

    return (
        score,
        reasons,
    )


# ============================================================
# Full evidence scoring
# ============================================================

def score_paper(
    paper,
    protein,
    aliases,
    fulltext_data=None,
):

    title = paper.get(
        "title",
        "",
    )

    abstract = paper.get(
        "abstract",
        "",
    )

    # --------------------------------------------------------
    # Use FULL TEXT if available.
    # --------------------------------------------------------

    if fulltext_data:

        title_full = (
            fulltext_data.get(
                "title",
                ""
            )
        )

        abstract_full = (
            fulltext_data.get(
                "abstract",
                ""
            )
        )

        body = (
            fulltext_data.get(
                "body",
                ""
            )
        )

        fulltext = (
            fulltext_data.get(
                "fulltext",
                ""
            )
        )

        combined = normalize_text(
            " ".join([
                title,
                abstract,
                title_full,
                abstract_full,
                body,
                fulltext,
            ])
        )

    else:

        combined = normalize_text(
            " ".join([
                title,
                abstract,
            ])
        )

    score = 0
    reasons = []

    # --------------------------------------------------------
    # Identity
    # --------------------------------------------------------

    s, r = protein_identity_score(
        combined,
        title,
        protein,
        aliases,
    )

    score += s
    reasons.extend(
        r
    )

    # --------------------------------------------------------
    # Generic evidence
    # --------------------------------------------------------

    score += add_term_scores(
        combined,
        DOMAIN_TERMS,
        reasons,
    )

    score += add_term_scores(
        combined,
        STRUCTURE_TERMS,
        reasons,
    )

    score += add_term_scores(
        combined,
        MUTATION_TERMS,
        reasons,
    )

    score += add_term_scores(
        combined,
        ISOFORM_TERMS,
        reasons,
    )

    score += add_term_scores(
        combined,
        CONSTRUCT_TERMS,
        reasons,
    )

    score += add_term_scores(
        combined,
        MECHANISTIC_TERMS,
        reasons,
    )

    # --------------------------------------------------------
    # Negative
    # --------------------------------------------------------

    score += add_term_scores(
        combined,
        CLINICAL_NEGATIVE_TERMS,
        reasons,
    )

    score += add_term_scores(
        combined,
        LOW_VALUE_TERMS,
        reasons,
    )

    # --------------------------------------------------------
    # Residue
    # --------------------------------------------------------

    residue_hits = detect_residue_patterns(
        combined
    )

    if residue_hits:

        bonus = min(
            25,
            len(residue_hits) * 3,
        )

        score += bonus

        reasons.append(
            f"+{bonus}: residue/mutation "
            f"patterns ({len(residue_hits)} hits)"
        )

    # --------------------------------------------------------
    # Range
    # --------------------------------------------------------

    range_hits = detect_range_patterns(
        combined
    )

    if range_hits:

        bonus = min(
            20,
            len(range_hits) * 3,
        )

        score += bonus

        reasons.append(
            f"+{bonus}: amino-acid ranges "
            f"({len(range_hits)} hits)"
        )

    # --------------------------------------------------------
    # PDB
    # --------------------------------------------------------

    pdb_hits = detect_pdb(
        combined
    )

    if pdb_hits:

        bonus = min(
            25,
            len(pdb_hits) * 5,
        )

        score += bonus

        reasons.append(
            f"+{bonus}: PDB references "
            f"({len(pdb_hits)} hits)"
        )

    # --------------------------------------------------------
    # UBA1-specific
    # --------------------------------------------------------

    gene = (
        protein["gene_name"]
        or ""
    ).upper()

    accession = (
        protein["uniprot_acc"]
        or ""
    ).upper()

    uba1_hits = []

    if (
        gene == "UBA1"
        or accession == "P22314"
    ):

        uba1_terms = {

            "uba1": 8,

            "iad": 8,
            "fcch": 8,
            "aad": 8,
            "scch": 8,
            "ufd": 8,

            "uba1a": 10,
            "uba1b": 10,
            "uba1c": 10,

            "met41": 8,
            "met67": 8,

            "cys632": 10,

            "vexas": 8,
        }

        for term, value in uba1_terms.items():

            if term in combined:

                score += value

                uba1_hits.append(
                    term
                )

                reasons.append(
                    f"+{value}: UBA1-specific "
                    f"{term}"
                )

    # --------------------------------------------------------
    # Full-text bonus
    # --------------------------------------------------------

    if fulltext_data:

        score += 8

        reasons.append(
            "+8: full-text XML available"
        )

    # --------------------------------------------------------
    # Figure caption bonus
    # --------------------------------------------------------

    figure_count = 0
    figure_hit_count = 0

    if fulltext_data:

        figures = fulltext_data.get(
            "figures",
            []
        )

        figure_count = len(
            figures
        )

        evidence_keywords = [
            "uba1",
            "domain",
            "mutation",
            "residue",
            "isoform",
            "iad",
            "fcch",
            "aad",
            "scch",
            "ufd",
            "m41",
            "m67",
        ]

        for fig in figures:

            caption = normalize_text(
                fig.get(
                    "caption",
                    ""
                )
            )

            if any(
                keyword in caption
                for keyword in evidence_keywords
            ):

                figure_hit_count += 1

        if figure_hit_count:

            bonus = min(
                30,
                figure_hit_count * 10,
            )

            score += bonus

            reasons.append(
                f"+{bonus}: evidence in "
                f"figure caption(s)"
            )

    # --------------------------------------------------------
    # Table bonus
    # --------------------------------------------------------

    table_count = 0
    table_hit_count = 0

    if fulltext_data:

        tables = fulltext_data.get(
            "tables",
            []
        )

        table_count = len(
            tables
        )

        evidence_keywords = [
            "uba1",
            "mutation",
            "variant",
            "domain",
            "residue",
            "isoform",
        ]

        for table in tables:

            table_text = normalize_text(
                table.get(
                    "text",
                    ""
                )
            )

            if any(
                keyword in table_text
                for keyword in evidence_keywords
            ):

                table_hit_count += 1

        if table_hit_count:

            bonus = min(
                20,
                table_hit_count * 5,
            )

            score += bonus

            reasons.append(
                f"+{bonus}: evidence in "
                f"table(s)"
            )

    # --------------------------------------------------------
    # Evidence category count
    # --------------------------------------------------------

    has_domain = any(
        x in combined
        for x in [
            "domain",
            "architecture",
            "iad",
            "fcch",
            "aad",
            "scch",
            "ufd",
        ]
    )

    has_structure = any(
        x in combined
        for x in [
            "structure",
            "structural",
            "pdb",
            "cryo-em",
            "crystal",
        ]
    )

    has_mutation = any(
        x in combined
        for x in [
            "mutation",
            "mutations",
            "variant",
            "variants",
            "residue",
            "amino acid",
            "missense",
        ]
    )

    has_isoform = any(
        x in combined
        for x in [
            "isoform",
            "isoforms",
            "uba1a",
            "uba1b",
            "uba1c",
        ]
    )

    has_construct = any(
        x in combined
        for x in [
            "construct",
            "constructs",
            "truncation",
            "truncated",
        ]
    )

    evidence_categories = sum([
        has_domain,
        has_structure,
        has_mutation,
        has_isoform,
        has_construct,
    ])

    if evidence_categories >= 2:

        score += 10

        reasons.append(
            f"+10: multiple evidence "
            f"categories ({evidence_categories})"
        )

    if evidence_categories >= 3:

        score += 10

        reasons.append(
            f"+10: strong multi-category "
            f"evidence ({evidence_categories})"
        )

    # --------------------------------------------------------
    # Title evidence
    # --------------------------------------------------------

    title_norm = normalize_text(
        title
    )

    title_terms = [
        "structure",
        "domain",
        "mutation",
        "variant",
        "residue",
        "isoform",
        "architecture",
        "catalytic",
    ]

    title_hits = [
        term
        for term in title_terms
        if term in title_norm
    ]

    if title_hits:

        bonus = min(
            12,
            len(title_hits) * 3,
        )

        score += bonus

        reasons.append(
            f"+{bonus}: evidence terms "
            f"in title "
            f"({', '.join(title_hits)})"
        )

    # --------------------------------------------------------
    # Publication type
    # --------------------------------------------------------

    pub_types = [
        normalize_text(x)
        for x in paper.get(
            "publication_types",
            []
        )
    ]

    if any(
        "review" in x
        for x in pub_types
    ):

        # DO NOT reject review.
        reasons.append(
            "+0: review retained as "
            "secondary evidence"
        )

    # --------------------------------------------------------
    # Full-text evidence contexts
    # --------------------------------------------------------

    evidence_contexts = []

    if fulltext_data:

        fulltext_for_context = (
            fulltext_data.get(
                "fulltext",
                ""
            )
        )

        keywords = [

            "UBA1",

            "IAD",
            "FCCH",
            "AAD",
            "SCCH",
            "UFD",

            "UBA1a",
            "UBA1b",
            "UBA1c",

            "M41",
            "M67",

            "Cys632",

            "mutation",
            "mutations",

            "residue",
            "residues",

            "domain",

            "VEXAS",
        ]

        evidence_contexts = (
            extract_keyword_contexts(
                fulltext_for_context,
                keywords,
                window=240,
                max_contexts=40,
            )
        )

    return {
        "score": score,
        "reasons": reasons,

        "residue_hits": residue_hits,
        "range_hits": range_hits,
        "pdb_hits": pdb_hits,

        "uba1_hits": uba1_hits,

        "figure_count": figure_count,
        "figure_hit_count": figure_hit_count,

        "table_count": table_count,
        "table_hit_count": table_hit_count,

        "evidence_categories": (
            evidence_categories
        ),

        "evidence_contexts": (
            evidence_contexts
        ),
    }


# ============================================================
# Classification
# ============================================================

def classify_paper(
    paper,
    score_info,
):

    title = normalize_text(
        paper.get(
            "title",
            ""
        )
    )

    abstract = normalize_text(
        paper.get(
            "abstract",
            ""
        )
    )

    text = (
        title
        + " "
        + abstract
    )

    if score_info[
        "figure_hit_count"
    ]:

        return (
            "fulltext_figure_evidence"
        )

    if score_info[
        "table_hit_count"
    ]:

        return (
            "fulltext_table_evidence"
        )

    if (
        "crystal structure" in text
        or "cryo-em" in text
        or "structural basis" in text
        or score_info[
            "pdb_hits"
        ]
    ):

        return "structural"

    if (
        "domain architecture" in text
        or "domain boundary" in text
        or "protein architecture" in text
        or any(
            x in text
            for x in [
                "iad",
                "fcch",
                "aad",
                "scch",
                "ufd",
            ]
        )
    ):

        return "domain_architecture"

    if (
        "mutation" in text
        or "mutations" in text
        or "variant" in text
        or "variants" in text
        or score_info[
            "residue_hits"
        ]
    ):

        return "mutation"

    if (
        "isoform" in text
        or "uba1a" in text
        or "uba1b" in text
        or "uba1c" in text
    ):

        return "isoform"

    if (
        "construct" in text
        or "truncation" in text
    ):

        return "construct"

    pub_types = [
        normalize_text(x)
        for x in paper.get(
            "publication_types",
            []
        )
    ]

    if any(
        "review" in x
        for x in pub_types
    ):

        return "review"

    return "other"


# ============================================================
# Metadata fetch by PMID
# ============================================================

def fetch_paper_by_pmid(
    pmid,
):

    query = (
        f"EXT_ID:{pmid}"
    )

    params = {
        "query": query,
        "format": "xml",
        "pageSize": 1,
        "resultType": "core",
    }

    url = (
        EPMC_SEARCH_URL
        + "?"
        + urlencode(params)
    )

    data = http_get(
        url
    )

    if not data:
        return None

    try:

        root = ET.fromstring(
            data
        )

    except ET.ParseError:

        return None

    result = root.find(
        "./resultList/result"
    )

    if result is None:
        return None

    record = {}

    record["pmid"] = xml_text(
        result.find("pmid")
    )

    record["pmcid"] = xml_text(
        result.find("pmcid")
    )

    record["title"] = xml_text(
        result.find("title")
    )

    record["authorString"] = xml_text(
        result.find("authorString")
    )

    record["journalTitle"] = xml_text(
        result.find("journalTitle")
    )

    record["pubYear"] = xml_text(
        result.find("pubYear")
    )

    record["firstPublicationDate"] = (
        xml_text(
            result.find(
                "firstPublicationDate"
            )
        )
    )

    record["abstract"] = xml_text(
        result.find(
            "abstractText"
        )
    )

    record["doi"] = ""

    for node in result.findall(
        "./articleIds/articleId"
    ):

        id_type = (
            node.attrib.get(
                "type",
                ""
            ).lower()
        )

        value = xml_text(
            node
        )

        if id_type == "doi":
            record["doi"] = value

    record["publication_types"] = []

    for node in result.findall(
        "./pubTypeList/pubType"
    ):

        value = xml_text(
            node
        )

        if value:
            record[
                "publication_types"
            ].append(value)

    if record["pmcid"]:

        record["pmcid_url"] = (
            "https://pmc.ncbi.nlm.nih.gov/articles/"
            + record["pmcid"]
            + "/"
        )

        record[
            "fulltext_xml_url"
        ] = (
            EPMC_FULLTEXT_BASE
            + "/"
            + record["pmcid"]
            + "/fullTextXML"
        )

    else:

        record["pmcid_url"] = ""
        record[
            "fulltext_xml_url"
        ] = ""

    return record


# ============================================================
# Merge papers
# ============================================================

def paper_key(
    paper,
):

    pmid = (
        paper.get(
            "pmid",
            ""
        )
        or ""
    ).strip()

    if pmid:
        return (
            "PMID:"
            + pmid
        )

    doi = (
        paper.get(
            "doi",
            ""
        )
        or ""
    ).strip().lower()

    if doi:
        return (
            "DOI:"
            + doi
        )

    title = normalize_text(
        paper.get(
            "title",
            ""
        )
    )

    return (
        "TITLE:"
        + title
    )


def merge_papers(
    papers,
):

    merged = {}

    for paper in papers:

        key = paper_key(
            paper
        )

        if key not in merged:

            merged[key] = paper

        else:

            old = merged[key]

            # Prefer non-empty metadata.
            for field in [
                "pmid",
                "pmcid",
                "title",
                "abstract",
                "doi",
                "journalTitle",
                "pubYear",
                "authorString",
                "fullTextUrl",
                "fulltext_xml_url",
                "pmcid_url",
            ]:

                if (
                    not old.get(field)
                    and paper.get(field)
                ):

                    old[field] = (
                        paper[field]
                    )

            # Merge publication types.
            old_types = set(
                old.get(
                    "publication_types",
                    []
                )
            )

            for value in paper.get(
                "publication_types",
                []
            ):

                old_types.add(
                    value
                )

            old[
                "publication_types"
            ] = sorted(
                old_types
            )

    return list(
        merged.values()
    )


# ============================================================
# Known PMID loading
# ============================================================

def add_known_papers(
    protein,
    papers,
):

    accession = (
        protein["uniprot_acc"]
        or ""
    )

    known = KNOWN_PAPER_IDS.get(
        accession,
        {}
    )

    if not known:
        return papers

    existing_pmids = set()

    for paper in papers:

        pmid = (
            paper.get(
                "pmid",
                ""
            )
            or ""
        )

        if pmid:
            existing_pmids.add(
                pmid
            )

    print()
    print(
        "Checking known high-confidence "
        "paper seeds..."
    )

    for pmid, reason in known.items():

        if pmid in existing_pmids:

            print(
                f"  [KNOWN] PMID {pmid} "
                f"already found"
            )

            continue

        print(
            f"  [KNOWN] Fetching PMID {pmid} "
            f"({reason})"
        )

        paper = fetch_paper_by_pmid(
            pmid
        )

        if paper:

            paper[
                "known_seed"
            ] = True

            paper[
                "known_seed_reason"
            ] = reason

            papers.append(
                paper
            )

        else:

            print(
                f"  [WARNING] "
                f"Could not fetch PMID {pmid}"
            )

        time.sleep(
            REQUEST_DELAY
        )

    return papers


# ============================================================
# Output
# ============================================================

def write_output(
    output_path,
    protein,
    aliases,
    enzyme_info,
    queries,
    all_papers,
    selected_papers,
    args,
):

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as f:

        # ====================================================
        # Header
        # ====================================================

        f.write(
            "============================================================\n"
        )

        f.write(
            "UKW PAPER DOMAIN MINER\n"
        )

        f.write(
            "Phase 1 + Phase 1.5\n"
        )

        f.write(
            "Multi-query retrieval + Full-text / Figure evidence\n"
        )

        f.write(
            "============================================================\n\n"
        )

        f.write(
            "Generated: "
            + datetime.now().isoformat(
                timespec="seconds"
            )
            + "\n"
        )

        f.write(
            f"Database: {args.db}\n"
        )

        f.write(
            f"Protein requested: "
            f"{args.protein}\n"
        )

        f.write("\n")

        # ====================================================
        # Protein
        # ====================================================

        f.write(
            "============================================================\n"
        )

        f.write(
            "PROTEIN\n"
        )

        f.write(
            "============================================================\n"
        )

        for key in [
            "protein_id",
            "uniprot_acc",
            "entry_name",
            "gene_name",
            "protein_name",
            "organism",
            "taxon_id",
            "length",
        ]:

            f.write(
                f"{key}: "
                f"{protein[key] or ''}\n"
            )

        f.write("\n")

        f.write(
            "Aliases:\n"
        )

        if aliases:

            for alias in aliases:

                f.write(
                    f"  - {alias}\n"
                )

        else:

            f.write(
                "  - None\n"
            )

        f.write("\n")

        # ====================================================
        # Enzyme
        # ====================================================

        f.write(
            "Enzyme classification:\n"
        )

        if enzyme_info:

            for key in [
                "enzyme_id",
                "enzyme_class",
                "enzyme_subfamily",
                "enzyme_family",
            ]:

                f.write(
                    f"  {key}: "
                    f"{enzyme_info.get(key) or ''}\n"
                )

        else:

            f.write(
                "  None\n"
            )

        f.write("\n")

        # ====================================================
        # Queries
        # ====================================================

        f.write(
            "============================================================\n"
        )

        f.write(
            "EUROPE PMC QUERIES\n"
        )

        f.write(
            "============================================================\n"
        )

        for i, query in enumerate(
            queries,
            start=1,
        ):

            f.write(
                f"\nQUERY #{i}\n"
            )

            f.write(
                query
            )

            f.write("\n")

        # ====================================================
        # Statistics
        # ====================================================

        f.write("\n")
        f.write(
            "============================================================\n"
        )

        f.write(
            "SEARCH STATISTICS\n"
        )

        f.write(
            "============================================================\n\n"
        )

        f.write(
            f"Raw merged papers: "
            f"{len(all_papers)}\n"
        )

        f.write(
            f"Selected papers: "
            f"{len(selected_papers)}\n"
        )

        f.write(
            f"Minimum score: "
            f"{args.min_score}\n"
        )

        f.write(
            f"Max selected papers: "
            f"{args.max_papers}\n"
        )

        f.write("\n")

        # ====================================================
        # Selected papers
        # ====================================================

        f.write(
            "============================================================\n"
        )

        f.write(
            "SELECTED PAPERS\n"
        )

        f.write(
            "============================================================\n"
        )

        if not selected_papers:

            f.write(
                "\nNO PAPERS PASSED THE SELECTION THRESHOLD.\n"
            )

        for index, paper in enumerate(
            selected_papers,
            start=1,
        ):

            f.write("\n")

            f.write(
                "------------------------------------------------------------\n"
            )

            f.write(
                f"SELECTED PAPER #{index}\n"
            )

            f.write(
                "------------------------------------------------------------\n"
            )

            f.write(
                f"Score: "
                f"{paper.get('selection_score', 0)}\n"
            )

            f.write(
                f"Evidence class: "
                f"{paper.get('evidence_class', '')}\n"
            )

            f.write(
                f"PMID: "
                f"{paper.get('pmid', '')}\n"
            )

            f.write(
                f"PMCID: "
                f"{paper.get('pmcid', '')}\n"
            )

            f.write(
                f"DOI: "
                f"{paper.get('doi', '')}\n"
            )

            f.write(
                f"Year: "
                f"{paper.get('pubYear', '')}\n"
            )

            f.write(
                f"Journal: "
                f"{paper.get('journalTitle', '')}\n"
            )

            f.write(
                f"Title: "
                f"{paper.get('title', '')}\n"
            )

            f.write(
                f"Known seed: "
                f"{paper.get('known_seed', False)}\n"
            )

            if paper.get(
                "known_seed_reason"
            ):

                f.write(
                    f"Known seed reason: "
                    f"{paper['known_seed_reason']}\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # Selection reasons
            # ------------------------------------------------

            f.write(
                "Selection reasons:\n"
            )

            for reason in paper.get(
                "selection_reasons",
                [],
            ):

                f.write(
                    f"  {reason}\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # Residues
            # ------------------------------------------------

            f.write(
                "Detected residue / mutation patterns:\n"
            )

            if paper.get(
                "residue_hits"
            ):

                for hit in paper[
                    "residue_hits"
                ]:

                    f.write(
                        f"  - {hit}\n"
                    )

            else:

                f.write(
                    "  - None\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # Ranges
            # ------------------------------------------------

            f.write(
                "Detected amino-acid ranges:\n"
            )

            if paper.get(
                "range_hits"
            ):

                for hit in paper[
                    "range_hits"
                ]:

                    f.write(
                        f"  - {hit}\n"
                    )

            else:

                f.write(
                    "  - None\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # PDB
            # ------------------------------------------------

            f.write(
                "Detected PDB references:\n"
            )

            if paper.get(
                "pdb_hits"
            ):

                for hit in paper[
                    "pdb_hits"
                ]:

                    f.write(
                        f"  - {hit}\n"
                    )

            else:

                f.write(
                    "  - None\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # UBA1-specific
            # ------------------------------------------------

            f.write(
                "Detected UBA1-specific signals:\n"
            )

            if paper.get(
                "uba1_hits"
            ):

                for hit in paper[
                    "uba1_hits"
                ]:

                    f.write(
                        f"  - {hit}\n"
                    )

            else:

                f.write(
                    "  - None\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # Figures
            # ------------------------------------------------

            f.write(
                f"Figure count: "
                f"{paper.get('figure_count', 0)}\n"
            )

            f.write(
                f"Figure evidence hits: "
                f"{paper.get('figure_hit_count', 0)}\n"
            )

            # ------------------------------------------------
            # Tables
            # ------------------------------------------------

            f.write(
                f"Table count: "
                f"{paper.get('table_count', 0)}\n"
            )

            f.write(
                f"Table evidence hits: "
                f"{paper.get('table_hit_count', 0)}\n"
            )

            f.write("\n")

            # ------------------------------------------------
            # Full text status
            # ------------------------------------------------

            f.write(
                f"Full-text XML available: "
                f"{paper.get('fulltext_available', False)}\n"
            )

            f.write(
                f"PMCID URL: "
                f"{paper.get('pmcid_url', '')}\n"
            )

            f.write(
                f"Full-text XML URL: "
                f"{paper.get('fulltext_xml_url', '')}\n"
            )

            f.write("\n")

            # ------------------------------------------------
            # Publication type
            # ------------------------------------------------

            f.write(
                "Publication types:\n"
            )

            for value in paper.get(
                "publication_types",
                [],
            ):

                f.write(
                    f"  - {value}\n"
                )

            f.write("\n")

            # ------------------------------------------------
            # Abstract
            # ------------------------------------------------

            f.write(
                "ABSTRACT\n"
            )

            f.write(
                paper.get(
                    "abstract",
                    "",
                )
            )

            f.write("\n\n")

            # ------------------------------------------------
            # Figure captions
            # ------------------------------------------------

            figures = paper.get(
                "fulltext_figures",
                []
            )

            if figures:

                f.write(
                    "============================================================\n"
                )

                f.write(
                    "FIGURE CAPTIONS\n"
                )

                f.write(
                    "============================================================\n"
                )

                for fig_index, fig in enumerate(
                    figures,
                    start=1,
                ):

                    label = fig.get(
                        "label",
                        ""
                    )

                    caption = fig.get(
                        "caption",
                        ""
                    )

                    fig_text = fig.get(
                        "text",
                        ""
                    )

                    f.write("\n")

                    f.write(
                        f"FIGURE #{fig_index} "
                        f"{label}\n"
                    )

                    f.write(
                        f"Caption:\n"
                    )

                    f.write(
                        caption
                    )

                    f.write("\n")

                    # Only show full figure XML-derived
                    # text if different from caption.
                    if (
                        fig_text
                        and fig_text != caption
                    ):

                        f.write(
                            "Figure text:\n"
                        )

                        f.write(
                            fig_text
                        )

                        f.write("\n")

            # ------------------------------------------------
            # Tables
            # ------------------------------------------------

            tables = paper.get(
                "fulltext_tables",
                []
            )

            if tables:

                f.write("\n")

                f.write(
                    "============================================================\n"
                )

                f.write(
                    "TABLES\n"
                )

                f.write(
                    "============================================================\n"
                )

                for table_index, table in enumerate(
                    tables,
                    start=1,
                ):

                    f.write("\n")

                    f.write(
                        f"TABLE #{table_index} "
                        f"{table.get('label', '')}\n"
                    )

                    f.write(
                        "Caption:\n"
                    )

                    f.write(
                        table.get(
                            "caption",
                            ""
                        )
                    )

                    f.write("\n")

                    f.write(
                        "Table text:\n"
                    )

                    f.write(
                        table.get(
                            "text",
                            ""
                        )
                    )

                    f.write("\n")

            # ------------------------------------------------
            # Evidence contexts
            # ------------------------------------------------

            contexts = paper.get(
                "evidence_contexts",
                []
            )

            if contexts:

                f.write("\n")

                f.write(
                    "============================================================\n"
                )

                f.write(
                    "EVIDENCE CONTEXTS\n"
                )

                f.write(
                    "============================================================\n"
                )

                for context in contexts:

                    f.write("\n")

                    f.write(
                        f"[{context['keyword']}]\n"
                    )

                    f.write(
                        context[
                            "snippet"
                        ]
                    )

                    f.write("\n")

        # ====================================================
        # All papers
        # ====================================================

        f.write("\n")
        f.write(
            "============================================================\n"
        )

        f.write(
            "ALL MERGED SEARCH RESULTS\n"
        )

        f.write(
            "============================================================\n"
        )

        for index, paper in enumerate(
            all_papers,
            start=1,
        ):

            f.write("\n")

            f.write(
                f"[{index}] "
                f"score="
                f"{paper.get('selection_score', 0)} "
                f"class="
                f"{paper.get('evidence_class', '')}\n"
            )

            f.write(
                f"PMID: "
                f"{paper.get('pmid', '')}\n"
            )

            f.write(
                f"PMCID: "
                f"{paper.get('pmcid', '')}\n"
            )

            f.write(
                f"DOI: "
                f"{paper.get('doi', '')}\n"
            )

            f.write(
                f"Year: "
                f"{paper.get('pubYear', '')}\n"
            )

            f.write(
                f"Title: "
                f"{paper.get('title', '')}\n"
            )

            f.write(
                f"Full text: "
                f"{paper.get('fulltext_available', False)}\n"
            )

            f.write(
                f"Figures: "
                f"{paper.get('figure_count', 0)} "
                f"("
                f"{paper.get('figure_hit_count', 0)} evidence hits"
                f")\n"
            )

            f.write(
                f"Tables: "
                f"{paper.get('table_count', 0)} "
                f"("
                f"{paper.get('table_hit_count', 0)} evidence hits"
                f")\n"
            )

            f.write(
                f"URL: "
                f"{paper.get('pmcid_url', '')}\n"
            )

        # ====================================================
        # End
        # ====================================================

        f.write("\n")

        f.write(
            "============================================================\n"
        )

        f.write(
            "END\n"
        )

        f.write(
            "============================================================\n"
        )


# ============================================================
# Main
# ============================================================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "UKW protein-domain literature miner "
            "with full-text and figure-caption retrieval."
        )
    )

    parser.add_argument(
        "--db",
        required=True,
        help="Path to ubiquitin.db",
    )

    parser.add_argument(
        "--protein",
        required=True,
        help=(
            "UniProt accession or protein_id, "
            "e.g. P22314"
        ),
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help=(
            "Maximum results per Europe PMC query "
            "(default: 100)"
        ),
    )

    parser.add_argument(
        "--max-papers",
        type=int,
        default=50,
        help=(
            "Maximum selected papers "
            "(default: 50)"
        ),
    )

    parser.add_argument(
        "--min-score",
        type=int,
        default=10,
        help=(
            "Minimum selection score "
            "(default: 10)"
        ),
    )

    parser.add_argument(
        "--year-from",
        type=int,
        default=2000,
        help=(
            "Publication year lower bound "
            "(default: 2000)"
        ),
    )

    parser.add_argument(
        "--year-to",
        type=int,
        default=datetime.now().year,
        help=(
            "Publication year upper bound "
            "(default: current year)"
        ),
    )

    parser.add_argument(
        "--output",
        default="paper_domain.txt",
        help=(
            "Output file "
            "(default: paper_domain.txt)"
        ),
    )

    parser.add_argument(
        "--no-fulltext",
        action="store_true",
        help=(
            "Do not retrieve full-text XML"
        ),
    )

    args = parser.parse_args()

    print()
    print(
        "============================================================"
    )

    print(
        "UKW PAPER DOMAIN MINER v2"
    )

    print(
        "Multi-query + Full-text + Figure Caption"
    )

    print(
        "============================================================"
    )

    print(
        f"Database : {args.db}"
    )

    print(
        f"Protein  : {args.protein}"
    )

    print()

    # ========================================================
    # DB
    # ========================================================

    try:

        conn = get_connection(
            args.db
        )

    except Exception as e:

        print(
            f"[ERROR] Cannot open database: {e}",
            file=sys.stderr,
        )

        sys.exit(1)

    # ========================================================
    # Protein
    # ========================================================

    protein = get_protein(
        conn,
        args.protein,
    )

    if protein is None:

        print(
            "[ERROR] Protein not found."
        )

        conn.close()

        sys.exit(1)

    print(
        "Protein:"
    )

    print(
        f"  UniProt    : "
        f"{protein['uniprot_acc']}"
    )

    print(
        f"  Gene       : "
        f"{protein['gene_name']}"
    )

    print(
        f"  Protein    : "
        f"{protein['protein_name']}"
    )

    print(
        f"  Length     : "
        f"{protein['length']}"
    )

    print()

    # ========================================================
    # Aliases
    # ========================================================

    aliases = get_aliases(
        conn,
        protein["protein_id"],
    )

    print(
        f"Aliases: {len(aliases)}"
    )

    for alias in aliases[:20]:

        print(
            f"  - {alias}"
        )

    if len(aliases) > 20:

        print(
            f"  ... "
            f"{len(aliases) - 20} more"
        )

    print()

    # ========================================================
    # Enzyme info
    # ========================================================

    enzyme_info = get_enzyme_info(
        conn,
        protein["protein_id"],
    )

    if enzyme_info:

        print(
            "Enzyme classification:"
        )

        print(
            f"  class     : "
            f"{enzyme_info.get('enzyme_class')}"
        )

        print(
            f"  subfamily : "
            f"{enzyme_info.get('enzyme_subfamily')}"
        )

        print(
            f"  family    : "
            f"{enzyme_info.get('enzyme_family')}"
        )

    else:

        print(
            "Enzyme classification: "
            "not found"
        )

    print()

    # ========================================================
    # Build queries
    # ========================================================

    queries = build_search_queries(
        protein,
        aliases,
        enzyme_info,
        year_from=args.year_from,
        year_to=args.year_to,
    )

    print(
        f"Generated {len(queries)} search queries."
    )

    print()

    # ========================================================
    # Search all queries
    # ========================================================

    raw_papers = []

    for index, query in enumerate(
        queries,
        start=1,
    ):

        print(
            f"[QUERY {index}/{len(queries)}]"
        )

        print(
            query
        )

        results = search_europe_pmc(
            query,
            page_size=args.limit,
        )

        print(
            f"  -> {len(results)} results"
        )

        raw_papers.extend(
            results
        )

        print()

        time.sleep(
            REQUEST_DELAY
        )

    # ========================================================
    # Merge
    # ========================================================

    papers = merge_papers(
        raw_papers
    )

    print(
        f"After merge/deduplication: "
        f"{len(papers)} papers"
    )

    # ========================================================
    # Add known papers
    # ========================================================

    papers = add_known_papers(
        protein,
        papers,
    )

    # Re-merge because known papers may already exist.
    papers = merge_papers(
        papers
    )

    print(
        f"After known-paper seeds: "
        f"{len(papers)} papers"
    )

    print()

    # ========================================================
    # Full-text retrieval
    # ========================================================

    if args.no_fulltext:

        print(
            "Full-text retrieval disabled."
        )

    else:

        print(
            "Retrieving full-text XML where available..."
        )

    processed = []

    for index, paper in enumerate(
        papers,
        start=1,
    ):

        pmid = paper.get(
            "pmid",
            ""
        )

        pmcid = paper.get(
            "pmcid",
            ""
        )

        print(
            f"[{index:03d}/{len(papers):03d}] "
            f"PMID={pmid} "
            f"PMCID={pmcid or '-'}"
        )

        fulltext_data = None

        if (
            not args.no_fulltext
            and pmcid
        ):

            root = fetch_fulltext_xml(
                pmcid
            )

            if root is not None:

                fulltext_data = (
                    extract_fulltext_components(
                        root
                    )
                )

                paper[
                    "fulltext_available"
                ] = True

                paper[
                    "fulltext_figures"
                ] = fulltext_data.get(
                    "figures",
                    []
                )

                paper[
                    "fulltext_tables"
                ] = fulltext_data.get(
                    "tables",
                    []
                )

                print(
                    "      full-text XML: YES"
                )

                print(
                    f"      figures: "
                    f"{len(fulltext_data.get('figures', []))}"
                )

                print(
                    f"      tables: "
                    f"{len(fulltext_data.get('tables', []))}"
                )

            else:

                paper[
                    "fulltext_available"
                ] = False

                paper[
                    "fulltext_figures"
                ] = []

                paper[
                    "fulltext_tables"
                ] = []

                print(
                    "      full-text XML: NO"
                )

        else:

            paper[
                "fulltext_available"
            ] = False

            paper[
                "fulltext_figures"
            ] = []

            paper[
                "fulltext_tables"
            ] = []

        # ----------------------------------------------------
        # Score
        # ----------------------------------------------------

        score_info = score_paper(
            paper,
            protein,
            aliases,
            fulltext_data,
        )

        paper[
            "selection_score"
        ] = score_info[
            "score"
        ]

        paper[
            "selection_reasons"
        ] = score_info[
            "reasons"
        ]

        paper[
            "residue_hits"
        ] = score_info[
            "residue_hits"
        ]

        paper[
            "range_hits"
        ] = score_info[
            "range_hits"
        ]

        paper[
            "pdb_hits"
        ] = score_info[
            "pdb_hits"
        ]

        paper[
            "uba1_hits"
        ] = score_info[
            "uba1_hits"
        ]

        paper[
            "figure_count"
        ] = score_info[
            "figure_count"
        ]

        paper[
            "figure_hit_count"
        ] = score_info[
            "figure_hit_count"
        ]

        paper[
            "table_count"
        ] = score_info[
            "table_count"
        ]

        paper[
            "table_hit_count"
        ] = score_info[
            "table_hit_count"
        ]

        paper[
            "evidence_categories"
        ] = score_info[
            "evidence_categories"
        ]

        paper[
            "evidence_contexts"
        ] = score_info[
            "evidence_contexts"
        ]

        paper[
            "evidence_class"
        ] = classify_paper(
            paper,
            score_info,
        )

        processed.append(
            paper
        )

        time.sleep(
            REQUEST_DELAY
        )

    # ========================================================
    # Sort
    # ========================================================

    processed.sort(
        key=lambda p: (
            p.get(
                "selection_score",
                0
            ),
            1
            if p.get(
                "fulltext_available",
                False
            )
            else 0,
            int(
                p.get(
                    "pubYear",
                    "0"
                )
                or 0
            ),
        ),
        reverse=True,
    )

    # ========================================================
    # Selected
    # ========================================================

    selected = [
        paper
        for paper in processed
        if paper.get(
            "selection_score",
            0
        ) >= args.min_score
    ]

    selected = selected[
        :args.max_papers
    ]

    # ========================================================
    # Console summary
    # ========================================================

    print()
    print(
        "============================================================"
    )

    print(
        "SELECTED PAPERS"
    )

    print(
        "============================================================"
    )

    if not selected:

        print(
            "NO PAPERS PASSED THRESHOLD."
        )

    for index, paper in enumerate(
        selected,
        start=1,
    ):

        print(
            f"{index:02d}. "
            f"score={paper.get('selection_score', 0):>3} "
            f"class="
            f"{paper.get('evidence_class', ''):<28} "
            f"PMID="
            f"{paper.get('pmid', '')} "
            f"{paper.get('title', '')[:100]}"
        )

    # ========================================================
    # Explicit check for Koster / PMID 37950858
    # ========================================================

    print()
    print(
        "Checking target paper PMID 37950858..."
    )

    target = None

    for paper in processed:

        if (
            paper.get("pmid")
            == "37950858"
        ):

            target = paper
            break

    if target:

        print(
            "  FOUND"
        )

        print(
            f"  Title : "
            f"{target.get('title', '')}"
        )

        print(
            f"  PMCID : "
            f"{target.get('pmcid', '')}"
        )

        print(
            f"  Score : "
            f"{target.get('selection_score', 0)}"
        )

        print(
            f"  Class : "
            f"{target.get('evidence_class', '')}"
        )

        print(
            f"  Full text : "
            f"{target.get('fulltext_available', False)}"
        )

        print(
            f"  Figures : "
            f"{target.get('figure_count', 0)}"
        )

        print(
            f"  Figure evidence hits : "
            f"{target.get('figure_hit_count', 0)}"
        )

        uba1_hits = target.get(
            "uba1_hits",
            []
        )

        if uba1_hits:

            print(
                "  UBA1 signals:"
            )

            print(
                "    "
                + ", ".join(
                    uba1_hits
                )
            )

    else:

        print(
            "  NOT FOUND"
        )

        print(
            "  This means the PMID seed retrieval "
            "failed and should be investigated."
        )

    # ========================================================
    # Write
    # ========================================================

    write_output(
        args.output,
        protein,
        aliases,
        enzyme_info,
        queries,
        processed,
        selected,
        args,
    )

    print()
    print(
        "============================================================"
    )

    print(
        "DONE"
    )

    print(
        "============================================================"
    )

    print(
        f"Raw search results : "
        f"{len(raw_papers)}"
    )

    print(
        f"Merged papers     : "
        f"{len(processed)}"
    )

    print(
        f"Selected papers   : "
        f"{len(selected)}"
    )

    print(
        f"Output            : "
        f"{args.output}"
    )

    print()

    conn.close()


# ============================================================
# Entry
# ============================================================

if __name__ == "__main__":

    main()
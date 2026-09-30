# config.py
#
# UKW central configuration
# All database URLs / versions / output directories
# should be controlled by config.sys
#

from pathlib import Path
import configparser
import certifi
from configparser import ConfigParser


# ============================================================
# Project root
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent


# ============================================================
# config.sys
# ============================================================

CONFIG_FILE = PROJECT_ROOT / "config.sys"
cfg = ConfigParser(interpolation=None)
cfg.read(CONFIG_FILE, encoding="utf-8")

if not CONFIG_FILE.exists():
    raise FileNotFoundError(
        f"config.sys not found: {CONFIG_FILE}"
    )


config = configparser.ConfigParser()

read_files = config.read(
    CONFIG_FILE,
    encoding="utf-8"
)

if not read_files:
    raise RuntimeError(
        f"Unable to read config.sys: {CONFIG_FILE}"
    )


# ============================================================
# Helper functions
# ============================================================

def get(
    section,
    option,
    default=None,
):
    """
    Read a string value from config.sys.
    """

    if config.has_option(section, option):
        value = config.get(
            section,
            option
        ).strip()

        if value:
            return value

    return default


def get_int(
    section,
    option,
    default,
):
    """
    Read integer from config.sys.
    """

    value = get(
        section,
        option,
        None
    )

    if value is None:
        return default

    try:
        return int(value)

    except ValueError:
        raise ValueError(
            f"[{section}] {option} "
            f"must be integer, got: {value}"
        )


def get_bool(
    section,
    option,
    default=False,
):
    """
    Read boolean from config.sys.
    """

    value = get(
        section,
        option,
        None
    )

    if value is None:
        return default

    return value.lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def get_path(
    section,
    option,
    default,
):
    """
    Read project-relative path.
    """

    value = get(
        section,
        option,
        default
    )

    path = Path(value)

    if not path.is_absolute():
        path = PROJECT_ROOT / path

    return path


# ============================================================
# General
# ============================================================

USER_AGENT = get(
    "general",
    "user_agent",
    "UKW-Human-Database/1.0"
)

REQUEST_TIMEOUT = get_int(
    "general",
    "request_timeout",
    120
)

MAX_RETRIES = get_int(
    "general",
    "max_retries",
    3
)

RETRY_DELAY = get_int(
    "general",
    "retry_delay",
    5
)


# ============================================================
# SSL / Certificate
# ============================================================

CA_BUNDLE = certifi.where()


# ============================================================
# Database
# ============================================================

DATABASE_PATH = get_path(
    "database",
    "path",
    "data/ukw/ubiquitin.db"
)


# ============================================================
# UniProt
# ============================================================

UNIPROT_BASE_URL = get(
    "uniprot",
    "base_url",
    "https://ftp.uniprot.org/pub/databases/uniprot/current_release/knowledgebase/complete"
)

UNIPROT_VERSION = get(
    "uniprot",
    "version",
    ""
)

UNIPROT_PROTEOME_FILE = get(
    "uniprot",
    "proteome_file",
    "uniprot_sprot.dat.gz"
)

UNIPROT_FASTA_FILE = get(
    "uniprot",
    "fasta_file",
    "uniprot_sprot.fasta.gz"
)

UNIPROT_OUTPUT_DIR = get_path(
    "uniprot",
    "output_dir",
    "data/raw/uniprot"
)


# ============================================================
# Reactome
# ============================================================

REACTOME_BASE = get(
    "reactome",
    "base_url",
    "https://reactome.org/ContentService"
)

REACTOME_VERSION_URL = get(
    "reactome",
    "version_url",
    f"{REACTOME_BASE}/data/database/version"
)

REACTOME_DOWNLOAD_BASE = get(
    "reactome",
    "download_base",
    "https://reactome.org/download"
)

REACTOME_VERSION = get(
    "reactome",
    "version",
    ""
)

REACTOME_OUTPUT_DIR = get_path(
    "reactome",
    "output_dir",
    "data/raw/reactome"
)


# ============================================================
# BioGRID
# ============================================================

BIOGRID_BASE_URL = get(
    "biogrid",
    "base_url",
    "https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive"
)

BIOGRID_VERSION = get(
    "biogrid",
    "version",
    "5.0.260"
)

BIOGRID_FILENAME = get(
    "biogrid",
    "filename",
    f"BIOGRID-ORGANISM-{BIOGRID_VERSION}.tab3.zip"
)

BIOGRID_OUTPUT_DIR = get_path(
    "biogrid",
    "output_dir",
    "data/raw/biogrid"
)


# ============================================================
# CORUM
# ============================================================

CORUM_BASE_URL = get(
    "corum",
    "base_url",
    "https://mips.helmholtz-muenchen.de/fastapi-corum"
)

CORUM_DOWNLOAD_ENDPOINT = get(
    "corum",
    "download_endpoint",
    "/public/file/download_current_file"
)

CORUM_FILE_ID = get(
    "corum",
    "file_id",
    "human"
)

CORUM_FILE_FORMAT = get(
    "corum",
    "file_format",
    "txt"
)

CORUM_VERSION = get(
    "corum",
    "version",
    ""
)

CORUM_OUTPUT_DIR = get_path(
    "corum",
    "output_dir",
    "data/raw/corum"
)

# ============================================================
# IntAct
# ============================================================

INTACT_BASE_URL = get(
    "intact",
    "base_url",
    "https://www.ebi.ac.uk/Tools/webservices/psicquic/intact/webservices/current/search/query",
)

INTACT_QUERY = get(
    "intact",
    "query",
    "taxidA:9606 AND taxidB:9606",
)

INTACT_FORMAT = get(
    "intact",
    "format",
    "tab27",
)

INTACT_PAGE_SIZE = get_int(
    "intact",
    "page_size",
    5000,
)

INTACT_VERSION = get(
    "intact",
    "version",
    "current",
)

INTACT_OUTPUT_FILE = get_path(
    "intact",
    "output_file",
    "data/raw/intact/intact_human_mitab27.txt",
)

INTACT_OUTPUT_DIR = INTACT_OUTPUT_FILE.parent

# ---------- STRING ----------

STRING_BASE_URL = cfg["stringdb"]["base_url"].rstrip("/")
STRING_SPECIES = cfg["stringdb"]["species"]
STRING_VERSION = cfg["stringdb"]["version"].strip()
STRING_OUTPUT_DIR = Path(cfg["stringdb"]["output_dir"])
STRING_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================
# UbiBrowser
# ============================================================

UBIBROWSER_URL_E3 = cfg["ubibrowser"]["base_url_e3"].strip()
UBIBROWSER_URL_DUB = cfg["ubibrowser"]["base_url_dub"].strip()
UBIBROWSER_SPECIES = cfg["ubibrowser"]["ubibrowser_species"]
UBIBROWSER_OUTPUT_DIR = Path(cfg["ubibrowser"]["output_dir"])
UBIBROWSER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UBIBROWSER_VERSION = cfg["ubibrowser"]["ubibrowser_version"].strip()

# ============================================================
# PhosphoSitePlus
# ============================================================

PHOSPHOSITEPLUS_BASE_URL = get(
    "phosphositeplus",
    "base_url",
    ""
)

PHOSPHOSITEPLUS_VERSION = get(
    "phosphositeplus",
    "version",
    ""
)

PHOSPHOSITEPLUS_OUTPUT_DIR = get_path(
    "phosphositeplus",
    "output_dir",
    "data/raw/phosphositeplus"
)


# ============================================================
# UKW
# ============================================================

UKW_DATA_DIR = get_path(
    "ukw",
    "data_dir",
    "data"
)

UKW_RAW_DIR = get_path(
    "ukw",
    "raw_dir",
    "data/raw"
)

UKW_DB_DIR = get_path(
    "ukw",
    "db_dir",
    "data/ukw"
)


# ============================================================
# Logging
# ============================================================

LOG_DIR = get_path(
    "logging",
    "log_dir",
    "logs"
)

LOG_LEVEL = get(
    "logging",
    "level",
    "INFO"
)


# ============================================================
# Create required directories
# ============================================================

for directory in [
    UNIPROT_OUTPUT_DIR,
    REACTOME_OUTPUT_DIR,
    BIOGRID_OUTPUT_DIR,
    CORUM_OUTPUT_DIR,
    INTACT_OUTPUT_DIR,
    STRING_OUTPUT_DIR,
    UBIBROWSER_OUTPUT_DIR,
    PHOSPHOSITEPLUS_OUTPUT_DIR,
    UKW_DATA_DIR,
    UKW_RAW_DIR,
    UKW_DB_DIR,
    LOG_DIR,
]:
    directory.mkdir(
        parents=True,
        exist_ok=True
    )


# ============================================================
# Configuration test
# ============================================================

if __name__ == "__main__":

    print("=" * 70)
    print("UKW configuration")
    print("=" * 70)

    print(f"PROJECT_ROOT          : {PROJECT_ROOT}")
    print(f"CONFIG_FILE           : {CONFIG_FILE}")

    print()
    print("[General]")
    print(f"USER_AGENT            : {USER_AGENT}")
    print(f"REQUEST_TIMEOUT       : {REQUEST_TIMEOUT}")
    print(f"MAX_RETRIES           : {MAX_RETRIES}")
    print(f"RETRY_DELAY           : {RETRY_DELAY}")

    print()
    print("[SSL]")
    print(f"CA_BUNDLE             : {CA_BUNDLE}")

    print()
    print("[Database]")
    print(f"DATABASE_PATH         : {DATABASE_PATH}")

    print()
    print("[UniProt]")
    print(f"UNIPROT_BASE_URL      : {UNIPROT_BASE_URL}")
    print(f"UNIPROT_VERSION       : {UNIPROT_VERSION}")
    print(f"UNIPROT_OUTPUT_DIR    : {UNIPROT_OUTPUT_DIR}")

    print()
    print("[Reactome]")
    print(f"REACTOME_BASE         : {REACTOME_BASE}")
    print(f"REACTOME_VERSION_URL  : {REACTOME_VERSION_URL}")
    print(f"REACTOME_DOWNLOAD_BASE: {REACTOME_DOWNLOAD_BASE}")
    print(f"REACTOME_VERSION      : {REACTOME_VERSION}")
    print(f"REACTOME_OUTPUT_DIR   : {REACTOME_OUTPUT_DIR}")

    print()
    print("[BioGRID]")
    print(f"BIOGRID_BASE_URL      : {BIOGRID_BASE_URL}")
    print(f"BIOGRID_VERSION       : {BIOGRID_VERSION}")
    print(f"BIOGRID_FILENAME      : {BIOGRID_FILENAME}")
    print(f"BIOGRID_OUTPUT_DIR    : {BIOGRID_OUTPUT_DIR}")

    print()
    print("[CORUM]")
    print(f"CORUM_BASE_URL        : {CORUM_BASE_URL}")
    print(f"CORUM_DOWNLOAD_ENDPOINT: {CORUM_DOWNLOAD_ENDPOINT}")
    print(f"CORUM_FILE_ID         : {CORUM_FILE_ID}")
    print(f"CORUM_FILE_FORMAT     : {CORUM_FILE_FORMAT}")
    print(f"CORUM_VERSION         : {CORUM_VERSION}")
    print(f"CORUM_OUTPUT_DIR      : {CORUM_OUTPUT_DIR}")

    print()
    print("[IntAct]")
    print(f"INTACT_BASE_URL       : {INTACT_BASE_URL}")
    print(f"INTACT_OUTPUT_DIR     : {INTACT_OUTPUT_DIR}")

    print()
    print("[STRING]")
    print(f"STRING_BASE_URL       : {STRING_BASE_URL}")
    print(f"STRING_VERSION        : {STRING_VERSION}")
    print(f"STRING_SPECIES        : {STRING_SPECIES}")
    print(f"STRING_OUTPUT_DIR     : {STRING_OUTPUT_DIR}")

    print()
    print("[UbiBrowser]")
    print(f"UBIBROWSER_BASE_URL   : {UBIBROWSER_URL_E3}")
    print(f"UBIBROWSER_OUTPUT_DIR : {UBIBROWSER_OUTPUT_DIR}")

    print()
    print("[PhosphoSitePlus]")
    print(
        f"PHOSPHOSITEPLUS_BASE_URL: "
        f"{PHOSPHOSITEPLUS_BASE_URL}"
    )
    print(
        f"PHOSPHOSITEPLUS_OUTPUT_DIR: "
        f"{PHOSPHOSITEPLUS_OUTPUT_DIR}"
    )

    print()
    print("[UKW]")
    print(f"UKW_DATA_DIR          : {UKW_DATA_DIR}")
    print(f"UKW_RAW_DIR           : {UKW_RAW_DIR}")
    print(f"UKW_DB_DIR            : {UKW_DB_DIR}")

    print()
    print("[Logging]")
    print(f"LOG_DIR               : {LOG_DIR}")
    print(f"LOG_LEVEL             : {LOG_LEVEL}")

    print()
    print("Configuration loaded successfully.")
    print("=" * 70)
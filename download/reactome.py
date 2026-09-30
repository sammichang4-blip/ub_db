# download/reactome.py

from pathlib import Path
import time
import requests
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import (
    REACTOME_BASE,
    REACTOME_DOWNLOAD_URL,
    REACTOME_VERSION_URL,
    REACTOME_OUTPUT_DIR,
    REACTOME_UNIPROT_PATHWAY_FILE,
    REACTOME_UNIPROT_REACTION_FILE,
    USER_AGENT,
    REQUEST_TIMEOUT,
    MAX_RETRIES,
)


# ============================================================
# Reactome configuration
# ============================================================

RAW_DIR = Path(REACTOME_OUTPUT_DIR)


# ============================================================
# Session
# ============================================================

def create_session():

    session = requests.Session()

    session.headers.update({
        "User-Agent": USER_AGENT
    })

    return session


# ============================================================
# Get Reactome version
# ============================================================

def get_reactome_version(session):

    print(
        "[Reactome] Checking database version..."
    )

    print(
        f"[Reactome] URL: {REACTOME_VERSION_URL}"
    )

    response = session.get(
        REACTOME_VERSION_URL,
        timeout=REQUEST_TIMEOUT,
    )

    print(
        f"[Reactome] HTTP status: "
        f"{response.status_code}"
    )

    response.raise_for_status()

    version = response.text.strip()

    print(
        f"[Reactome] Database version: "
        f"{version}"
    )

    return version


# ============================================================
# Download file
# ============================================================

def download_file(
    session,
    url,
    output_path,
):

    output_path = Path(output_path)

    print()
    print(
        f"[Reactome] Downloading:"
    )

    print(
        f"  URL : {url}"
    )

    print(
        f"  OUT : {output_path}"
    )

    last_error = None

    for attempt in range(
        1,
        MAX_RETRIES + 1
    ):

        try:

            print(
                f"[Reactome] Attempt "
                f"{attempt}/{MAX_RETRIES}"
            )

            response = session.get(
                url,
                timeout=REQUEST_TIMEOUT,
                stream=True,
            )

            print(
                f"[Reactome] HTTP status: "
                f"{response.status_code}"
            )

            response.raise_for_status()

            content_type = (
                response.headers.get(
                    "Content-Type",
                    ""
                )
            )

            print(
                f"[Reactome] Content-Type: "
                f"{content_type}"
            )

            output_path.parent.mkdir(
                parents=True,
                exist_ok=True
            )

            temp_path = output_path.with_suffix(
                output_path.suffix + ".part"
            )

            total_size = 0

            with temp_path.open(
                "wb"
            ) as f:

                for chunk in response.iter_content(
                    chunk_size=1024 * 1024
                ):

                    if not chunk:
                        continue

                    f.write(chunk)

                    total_size += len(chunk)

            if total_size == 0:

                raise RuntimeError(
                    "Downloaded file is empty"
                )

            temp_path.replace(
                output_path
            )

            print(
                f"[Reactome] Saved: "
                f"{output_path}"
            )

            print(
                f"[Reactome] Size: "
                f"{total_size:,} bytes"
            )

            return output_path

        except Exception as e:

            last_error = e

            print(
                f"[Reactome] ERROR: {e}"
            )

            if attempt < MAX_RETRIES:

                print(
                    "[Reactome] Retrying..."
                )

                time.sleep(2)

    raise RuntimeError(
        f"Failed to download Reactome file: "
        f"{url}\n"
        f"Last error: {last_error}"
    )


# ============================================================
# Download UniProt -> Reactome pathway mapping
# ============================================================

def download_uniprot_pathways(
    session
):

    filename = (
        REACTOME_UNIPROT_PATHWAY_FILE
    )

    output_path = (
        RAW_DIR / filename
    )

    # Reactome download-data mapping
    url = (
    f"{REACTOME_DOWNLOAD_URL.rstrip('/')}/"
    f"{filename}"
    )
    

    return download_file(
        session,
        url,
        output_path,
    )


# ============================================================
# Download UniProt -> Reactome reactions
# ============================================================

def download_uniprot_reactions(
    session
):

    filename = (
        REACTOME_UNIPROT_REACTION_FILE
    )

    output_path = (
        RAW_DIR / filename
    )

    url = (
    f"{REACTOME_DOWNLOAD_URL.rstrip('/')}/"
    f"{filename}"
    )

    return download_file(
        session,
        url,
        output_path,
    )


# ============================================================
# Main downloader
# ============================================================

def download_reactome():

    print("=" * 70)
    print("UKW - Reactome Downloader")
    print("=" * 70)

    RAW_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    print(
        f"[Reactome] Output directory:"
    )

    print(
        f"  {RAW_DIR}"
    )

    session = create_session()

    # --------------------------------------------------------
    # 1. Get database version
    # --------------------------------------------------------

    version = get_reactome_version(
        session
    )

    print()

    # --------------------------------------------------------
    # 2. Download pathway mapping
    # --------------------------------------------------------

    pathway_file = (
        download_uniprot_pathways(
            session
        )
    )

    # --------------------------------------------------------
    # 3. Download reaction mapping
    # --------------------------------------------------------

    reaction_file = (
        download_uniprot_reactions(
            session
        )
    )

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    print()
    print("=" * 70)
    print("Reactome Download Summary")
    print("=" * 70)

    print(
        f"Database version : {version}"
    )

    print(
        f"Pathway mapping  : {pathway_file}"
    )

    print(
        f"Reaction mapping : {reaction_file}"
    )

    print(
        f"Output directory : {RAW_DIR}"
    )

    print("=" * 70)

    return {
        "version": version,
        "pathway_file": pathway_file,
        "reaction_file": reaction_file,
        "output_dir": RAW_DIR,
    }


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":

    download_reactome()
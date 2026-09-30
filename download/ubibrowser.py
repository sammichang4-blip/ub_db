# download/ubibrowser.py

from pathlib import Path
import sys
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import (
    UBIBROWSER_URL_E3,
    UBIBROWSER_URL_DUB,
    UBIBROWSER_SPECIES,
    UBIBROWSER_VERSION,
    UBIBROWSER_OUTPUT_DIR,
    USER_AGENT,
    REQUEST_TIMEOUT,
)

CHUNK_SIZE = 1024 * 1024


def _download_one(url, output_file):
    print(f"[UbiBrowser] Downloading\nURL: {url}")

    response = requests.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
        stream=True,
    )
    response.raise_for_status()

    total = int(response.headers.get("Content-Length", 0))
    downloaded = 0

    with open(output_file, "wb") as fh:
        for chunk in response.iter_content(CHUNK_SIZE):
            if not chunk:
                continue
            fh.write(chunk)
            downloaded += len(chunk)
            if total:
                percent = downloaded * 100 / total
                print(f"\r{percent:6.2f}% ({downloaded:,}/{total:,})", end="")

    print(f"\nSaved: {output_file}")
    return output_file


def download_ubibrowser():
    """
    Download UbiBrowser E3- and DUB-substrate interaction datasets
    for the configured species.
    """
    if not UBIBROWSER_URL_E3 or not UBIBROWSER_URL_DUB:
        raise RuntimeError(
            "UbiBrowser download URLs are not configured.\n"
            "Please set [ubibrowser] base_url_e3 / base_url_dub in config.sys."
        )

    UBIBROWSER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    species = UBIBROWSER_SPECIES or "H.sapiens"

    e3_file = UBIBROWSER_OUTPUT_DIR / f"{species}.E3.{UBIBROWSER_VERSION or 'v2'}.txt.gz"
    dub_file = UBIBROWSER_OUTPUT_DIR / f"{species}.DUB.{UBIBROWSER_VERSION or 'v2'}.txt.gz"

    _download_one(UBIBROWSER_URL_E3, e3_file)
    _download_one(UBIBROWSER_URL_DUB, dub_file)

    return e3_file, dub_file


if __name__ == "__main__":
    download_ubibrowser()
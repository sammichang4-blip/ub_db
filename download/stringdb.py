# download/stringdb.py
from pathlib import Path
import requests
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import (
    USER_AGENT,
    REQUEST_TIMEOUT,
    STRING_BASE_URL,
    STRING_SPECIES,
    STRING_VERSION,
    STRING_OUTPUT_DIR,
)


def build_string_url(physical=True):
    """Build STRING download URL."""

    version = STRING_VERSION or "12.0"

    if physical:
        folder = f"protein.physical.links.v{version}"
        filename = f"{STRING_SPECIES}.protein.physical.links.v{version}.txt.gz"
    else:
        folder = f"protein.links.v{version}"
        filename = f"{STRING_SPECIES}.protein.links.v{version}.txt.gz"

    return f"{STRING_BASE_URL}/{folder}/{filename}"


def download_stringdb(output_file=None, physical=True):
    """
    Download STRING human interaction file.

    Parameters
    ----------
    output_file : str | Path | None
    physical : bool
        True -> protein.physical.links
        False -> protein.links
    """

    version = STRING_VERSION or "12.0"

    if output_file is None:

        if physical:
            output_file = STRING_OUTPUT_DIR / (
                f"string_physical_v{version}.txt.gz"
            )
        else:
            output_file = STRING_OUTPUT_DIR / (
                f"string_all_v{version}.txt.gz"
            )

    output_file = Path(output_file)

    url = build_string_url(physical)

    print(f"[STRING] Downloading")
    print(f"URL: {url}")

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

        for chunk in response.iter_content(1024 * 1024):

            if not chunk:
                continue

            fh.write(chunk)
            downloaded += len(chunk)

            if total:
                percent = downloaded * 100 / total
                print(
                    f"\r{percent:6.2f}% "
                    f"({downloaded:,}/{total:,})",
                    end="",
                )

    print(f"\nSaved: {output_file}")

    return output_file


if __name__ == "__main__":

    download_stringdb(physical=True)


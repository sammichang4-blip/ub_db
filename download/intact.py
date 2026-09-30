# download/intact.py

from pathlib import Path
from urllib.parse import quote
import time
import requests
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import (
    USER_AGENT,
    REQUEST_TIMEOUT,
    MAX_RETRIES,
    RETRY_DELAY,
    INTACT_BASE_URL,
    INTACT_QUERY,
    INTACT_FORMAT,
    INTACT_PAGE_SIZE,
    INTACT_OUTPUT_FILE,
)


# ============================================================
# IntAct Human MITAB downloader
# ============================================================

def download_intact():

    output_file = Path(
        INTACT_OUTPUT_FILE
    )

    output_file.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    temp_file = output_file.with_suffix(
        output_file.suffix + ".part"
    )

    if temp_file.exists():
        temp_file.unlink()

    # --------------------------------------------------------
    # Encode MIQL query
    # --------------------------------------------------------

    encoded_query = quote(
        INTACT_QUERY,
        safe=""
    )

    total_records = 0
    page = 0

    print("=" * 70)
    print("UKW - IntAct Human Downloader")
    print("=" * 70)

    print(
        f"[IntAct] Query: {INTACT_QUERY}"
    )

    print(
        f"[IntAct] Format: {INTACT_FORMAT}"
    )

    print(
        f"[IntAct] Page size: {INTACT_PAGE_SIZE}"
    )

    print(
        f"[IntAct] Output: {output_file}"
    )

    # --------------------------------------------------------
    # Open output
    # --------------------------------------------------------

    with open(
        temp_file,
        "w",
        encoding="utf-8",
        newline=""
    ) as out:

        while True:

            first_result = (
                page * INTACT_PAGE_SIZE
            )

            url = (
                f"{INTACT_BASE_URL.rstrip('/')}"
                f"/{encoded_query}"
            )

            params = {
                "firstResult": first_result,
                "maxResults": INTACT_PAGE_SIZE,
                "format": INTACT_FORMAT,
            }

            print()
            print(
                f"[IntAct] Page {page + 1}"
            )

            print(
                f"[IntAct] firstResult="
                f"{first_result}"
            )

            response = None

            # ------------------------------------------------
            # Retry
            # ------------------------------------------------

            for attempt in range(
                1,
                MAX_RETRIES + 1
            ):

                try:

                    response = requests.get(
                        url,
                        params=params,
                        headers={
                            "User-Agent": USER_AGENT,
                            "Accept": "text/plain",
                        },
                        timeout=REQUEST_TIMEOUT,
                    )

                    print(
                        f"[IntAct] HTTP status: "
                        f"{response.status_code}"
                    )

                    response.raise_for_status()

                    break

                except Exception as exc:

                    print(
                        f"[IntAct] ERROR: {exc}"
                    )

                    if attempt >= MAX_RETRIES:

                        raise RuntimeError(
                            "IntAct download failed"
                        ) from exc

                    print(
                        f"[IntAct] Retrying "
                        f"in {RETRY_DELAY} seconds..."
                    )

                    time.sleep(
                        RETRY_DELAY
                    )

            # ------------------------------------------------
            # Get data
            # ------------------------------------------------

            text = response.text

            if not text.strip():

                print(
                    "[IntAct] No more records."
                )

                break

            lines = text.splitlines()

            # ------------------------------------------------
            # Write records
            # ------------------------------------------------

            record_count = 0

            for line in lines:

                if not line.strip():
                    continue

                # MITAB comments / metadata
                if line.startswith("#"):
                    continue

                out.write(
                    line.rstrip("\r\n")
                    + "\n"
                )

                record_count += 1

            total_records += record_count

            print(
                f"[IntAct] Records: "
                f"{record_count:,}"
            )

            print(
                f"[IntAct] Total: "
                f"{total_records:,}"
            )

            # ------------------------------------------------
            # End condition
            # ------------------------------------------------

            if record_count < INTACT_PAGE_SIZE:

                print(
                    "[IntAct] Final page reached."
                )

                break

            page += 1

    # --------------------------------------------------------
    # Validate output
    # --------------------------------------------------------

    if not temp_file.exists():

        raise RuntimeError(
            "IntAct output file was not created"
        )

    file_size = temp_file.stat().st_size

    if file_size == 0:

        temp_file.unlink()

        raise RuntimeError(
            "IntAct output file is empty"
        )

    # --------------------------------------------------------
    # Validate MITAB header
    # --------------------------------------------------------

    with open(
        temp_file,
        "r",
        encoding="utf-8"
    ) as fh:

        first_line = fh.readline().strip()

    if not first_line:

        temp_file.unlink()

        raise RuntimeError(
            "IntAct output has no header/data"
        )

    # --------------------------------------------------------
    # Atomic rename
    # --------------------------------------------------------

    temp_file.replace(
        output_file
    )

    print()
    print("=" * 70)
    print("IntAct download completed")
    print("=" * 70)

    print(
        f"[IntAct] Records: "
        f"{total_records:,}"
    )

    print(
        f"[IntAct] Size: "
        f"{file_size:,} bytes"
    )

    print(
        f"[IntAct] File: "
        f"{output_file}"
    )

    print("=" * 70)

    return output_file


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":

    download_intact()
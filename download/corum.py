# download/corum.py

from pathlib import Path
import subprocess
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import (
    CORUM_BASE_URL,
    CORUM_DOWNLOAD_ENDPOINT,
    CORUM_FILE_ID,
    CORUM_FILE_FORMAT,
    CORUM_OUTPUT_DIR,
)


def download_corum():

    output_dir = Path(CORUM_OUTPUT_DIR)

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        output_dir / "corum_human.txt"
    )

    temp_file = (
        output_dir / "corum_human.txt.part"
    )

    url = (
        f"{CORUM_BASE_URL.rstrip('/')}"
        f"{CORUM_DOWNLOAD_ENDPOINT}"
        f"?file_id={CORUM_FILE_ID}"
        f"&file_format={CORUM_FILE_FORMAT}"
    )

    print("=" * 70)
    print("UKW - CORUM Downloader")
    print("=" * 70)

    print(
        f"[CORUM] URL:\n{url}"
    )

    print(
        f"[CORUM] Output:\n{output_file}"
    )

    # --------------------------------------------------------
    # Remove old temporary file
    # --------------------------------------------------------

    if temp_file.exists():

        temp_file.unlink()

    # --------------------------------------------------------
    # Download using curl
    #
    # We use curl because this CORUM host has a TLS
    # certificate-chain compatibility issue with the
    # current Python/Miniforge requests environment.
    #
    # HTTPS verification remains enabled.
    # --------------------------------------------------------

    command = [
        "curl",
        "--fail",
        "--location",
        "--show-error",
        "--silent",
        "--output",
        str(temp_file),
        url,
    ]

    print(
        "[CORUM] Downloading..."
    )

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
    )

    # --------------------------------------------------------
    # Check curl
    # --------------------------------------------------------

    if result.returncode != 0:

        if temp_file.exists():
            temp_file.unlink()

        print(
            "[CORUM] ERROR: curl failed"
        )

        if result.stderr:
            print(result.stderr)

        raise RuntimeError(
            "CORUM download failed"
        )

    # --------------------------------------------------------
    # Check file
    # --------------------------------------------------------

    if not temp_file.exists():

        raise RuntimeError(
            "CORUM download finished but "
            "output file was not created"
        )

    file_size = temp_file.stat().st_size

    if file_size == 0:

        temp_file.unlink()

        raise RuntimeError(
            "CORUM downloaded file is empty"
        )

    # --------------------------------------------------------
    # Validate header
    # --------------------------------------------------------

    with temp_file.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as f:

        header = f.readline().strip()

    required_columns = [
        "complex_id",
        "complex_name",
        "organism",
        "subunits_uniprot_id",
    ]

    missing = [
        column
        for column in required_columns
        if column not in header
    ]

    if missing:

        temp_file.unlink()

        raise RuntimeError(
            "Downloaded CORUM file does not appear "
            "to be a valid CORUM Human dataset.\n"
            f"Missing columns: {missing}"
        )

    # --------------------------------------------------------
    # Atomic rename
    # --------------------------------------------------------

    temp_file.replace(
        output_file
    )

    print(
        "[CORUM] Download completed"
    )

    print(
        f"[CORUM] File: {output_file}"
    )

    print(
        f"[CORUM] Size: {file_size:,} bytes"
    )

    print(
        "[CORUM] Header validation: OK"
    )

    print("=" * 70)

    return output_file


if __name__ == "__main__":

    download_corum()
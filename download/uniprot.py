# download/uniprot.py

from pathlib import Path
import requests
import time
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

BASE_URL = "https://rest.uniprot.org/uniprotkb/search"

HUMAN_QUERY = (
    "(organism_id:9606) AND (reviewed:true)"
)


def download_uniprot(
    output_file,
    format="txt",
    batch_size=500,
):
    """
    Download human reviewed UniProtKB entries.

    Human:
        organism_id:9606

    Reviewed:
        reviewed:true

    Output:
        UniProt flat file (.dat)
    """

    output_file = Path(output_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("Downloading UniProtKB")
    print("=" * 70)

    print(f"Query : {HUMAN_QUERY}")
    print(f"Output: {output_file}")

    headers = {
        "User-Agent": "UKW-Human-Database/1.0",
    }

    params = {
        "query": HUMAN_QUERY,
        "format": format,
        "size": batch_size,
    }

    total = 0
    cursor = None

    with output_file.open("w", encoding="utf-8") as fout:

        while True:

            request_params = params.copy()

            if cursor:
                request_params["cursor"] = cursor

            print(
                f"\nDownloading batch "
                f"(cursor={'yes' if cursor else 'initial'})..."
            )

            response = requests.get(
                BASE_URL,
                params=request_params,
                headers=headers,
                timeout=120,
            )

            response.raise_for_status()

            text = response.text

            if not text.strip():
                break

            fout.write(text)

            # Count entries approximately by ID lines
            batch_count = text.count("\nID   ")

            total += batch_count

            print(
                f"Batch entries: {batch_count}"
            )

            print(
                f"Total entries: {total}"
            )

            # UniProt pagination
            next_url = response.links.get("next", {}).get("url")

            if not next_url:
                break

            # Parse cursor from next URL
            from urllib.parse import urlparse, parse_qs

            parsed = urlparse(next_url)
            query_params = parse_qs(parsed.query)

            next_cursor = query_params.get("cursor", [None])[0]

            if not next_cursor:
                break

            cursor = next_cursor

            time.sleep(0.2)

    print("\n" + "=" * 70)
    print("UniProt download completed")
    print(f"Estimated entries: {total}")
    print(f"File: {output_file}")
    print("=" * 70)

    return output_file


if __name__ == "__main__":

    download_uniprot(
        "data/raw/uniprot_human_reviewed.dat"
    )
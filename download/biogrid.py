# download/biogrid.py

from pathlib import Path
import configparser
import requests
import zipfile
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


# --------------------------------------------------
# Config
# --------------------------------------------------

CONFIG_FILE = Path("config.sys")


def load_biogrid_config(config_file=CONFIG_FILE):
    config = configparser.ConfigParser()

    if not config_file.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_file}"
        )

    config.read(config_file, encoding="utf-8")

    if "biogrid" not in config:
        raise RuntimeError(
            "Missing [biogrid] section in config.sys"
        )

    cfg = config["biogrid"]

    return {
        "base_url": cfg.get(
            "base_url",
            "https://downloads.thebiogrid.org/Download/BioGRID/Release-Archive"
        ).rstrip("/"),

        "version": cfg.get("version"),

        "filename": cfg.get(
            "filename",
            "BIOGRID-ORGANISM-{version}.tab3.zip"
        ),

        "output_dir": cfg.get(
            "output_dir",
            "data/raw/biogrid"
        ),
    }


# --------------------------------------------------
# Download BioGRID
# --------------------------------------------------

def download_biogrid(config_file=CONFIG_FILE):

    cfg = load_biogrid_config(config_file)

    base_url = cfg["base_url"]
    version = cfg["version"]
    filename = cfg["filename"].format(
        version=version
    )
    output_dir = Path(cfg["output_dir"])

    if not version:
        raise RuntimeError(
            "BioGRID version is not configured in config.sys"
        )

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------
    # Build URL
    # --------------------------------------------------

    url = (
        f"{base_url}/"
        f"BIOGRID-{version}/"
        f"{filename}"
    )

    zip_path = output_dir / filename

    print("=" * 60)
    print("[BioGRID] Configuration")
    print("=" * 60)

    print(f"[BioGRID] version     : {version}")
    print(f"[BioGRID] filename    : {filename}")
    print(f"[BioGRID] output_dir  : {output_dir}")
    print(f"[BioGRID] URL         : {url}")

    print()
    print("[BioGRID] downloading...")

    # --------------------------------------------------
    # Download
    # --------------------------------------------------

    response = requests.get(
        url,
        timeout=120,
        headers={
            "User-Agent": "UKW-Human-Database/1.0"
        },
        allow_redirects=True,
    )

    print(
        f"[BioGRID] HTTP status: "
        f"{response.status_code}"
    )

    print(
        f"[BioGRID] Content-Type: "
        f"{response.headers.get('Content-Type')}"
    )

    print(
        f"[BioGRID] Content-Length: "
        f"{len(response.content):,}"
    )

    response.raise_for_status()

    # --------------------------------------------------
    # Check ZIP signature
    # --------------------------------------------------

    if not response.content.startswith(b"PK"):

        preview = response.content[:200]

        print(
            "[BioGRID] ERROR: downloaded file is NOT ZIP"
        )

        print(
            "[BioGRID] First bytes:"
        )

        print(preview)

        raise RuntimeError(
            "BioGRID download is not a ZIP file. "
            "Check URL / access permission / release version."
        )

    # --------------------------------------------------
    # Save
    # --------------------------------------------------

    zip_path.write_bytes(
        response.content
    )

    print(
        f"[BioGRID] saved: {zip_path}"
    )

    # --------------------------------------------------
    # Validate ZIP
    # --------------------------------------------------

    if not zipfile.is_zipfile(zip_path):

        raise RuntimeError(
            f"Downloaded BioGRID file is corrupted: "
            f"{zip_path}"
        )

    print(
        "[BioGRID] ZIP validation OK"
    )

    # --------------------------------------------------
    # Extract
    # --------------------------------------------------

    with zipfile.ZipFile(
        zip_path,
        "r"
    ) as z:

        names = z.namelist()

        print(
            "[BioGRID] files:"
        )

        for name in names:
            print(
                f"  {name}"
            )

        z.extractall(
            output_dir
        )

    print(
        "[BioGRID] extraction completed"
    )

    print("=" * 60)

    return {
        "zip": zip_path,
        "files": names,
        "version": version,
        "url": url,
    }


# --------------------------------------------------
# Main
# --------------------------------------------------

if __name__ == "__main__":

    download_biogrid()
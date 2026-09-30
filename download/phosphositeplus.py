# download/phosphositeplus.py

from pathlib import Path
from config import PSP_FILE
import sys

# 把專案根目錄加入 Python 搜尋路徑
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

def get_phosphositeplus_file():

    path = Path(PSP_FILE)

    if not path.exists():

        raise FileNotFoundError(
            f"PhosphoSitePlus file not found:\n"
            f"{path}\n\n"
            "Download the authorized PSP file "
            "from PhosphoSitePlus and place it "
            "at this path."
        )

    return path

# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":

    get_phosphositeplus_file()
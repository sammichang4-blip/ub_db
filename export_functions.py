import os
import re

def extract_js_functions(filepath):
    """精準提取 JavaScript 檔案中的函式名稱"""
    functions = []
    
    # 💡 修正後：只包含固定寬度或標準匹配的正規表示式
    patterns = [
        # 1. 標準函式: function funcName( 或 async function funcName(
        r'(?:async\s+)?function\s+([a-zA-Z0-9_\$]+)\s*\(',
        # 2. 箭頭函式/匿名函式指派: const funcName = ( 或 let funcName = async (
        r'(?:const|let|var)\s+([a-zA-Z0-9_\$]+)\s*=\s*(?:async\s*)?\(',
        # 3. 物件字面值或類別方法: methodName(a, b) {
        r'\b([a-zA-Z0-9_\$]+)\s*.*?\s*\{'
    ]
    
    combined_pattern = re.compile('|'.join(patterns))
    
    # 用來排除誤判的 JS 內建關鍵字
    js_keywords = {'if', 'for', 'while', 'switch', 'catch', 'each', 'function'}
    
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            # 排除註解行
            if line.startswith("//") or line.startswith("*") or line.startswith("/*"):
                continue
                
            match = combined_pattern.search(line)
            if match:
                # 找出真正匹配到群組的非空字串
                func_name = next((g for g in match.groups() if g), None)
                
                # 💡 修正後：在這裡用 Python 檢查來過濾 if/for 這些關鍵字
                if func_name and func_name not in js_keywords:
                    if func_name not in functions:
                        functions.append(func_name)
                    
    return sorted(functions)

def main():
    md_output = [
        "# ⚡ JavaScript 函式清單總覽",
        "\n本報告自動彙整專案中所有 `.js` 檔案內定義的 Function 名稱。\n",
        "## 📊 檔案摘要統計",
        "| 檔案路徑 | 函式數量 |",
        "| :--- | :--- |"
    ]
    
    details_output = ["\n## 📂 各檔案詳細函式清單\n"]
    total_functions = 0
    
    for root, dirs, files in os.walk("."):
        # 排除不需要掃描的常見資料夾
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__', 'node_modules', 'venv', '.vscode', 'dist')]
        
        for file in files:
            if file.lower().endswith('.js'):
                filepath = os.path.join(root, file).replace("\\", "/")
                funcs = extract_js_functions(filepath)
                
                if funcs:
                    total_functions += len(funcs)
                    md_output.append(f"| `{filepath}` | **{len(funcs)}** 個 |")
                    
                    details_output.append(f"### 📄 `{filepath}`")
                    for f_name in funcs:
                        details_output.append(f"- ⚡ `{f_name}()`")
                    details_output.append("")
                else:
                    md_output.append(f"| `{filepath}` | *無偵測到函式* |")

    # 在摘要前插入總計
    md_output.insert(3, f"**🎯 專案總計偵測到： {total_functions} 個 JavaScript 函式**\n")
    
    # 彙整並寫入 function.md
    final_md = md_output + details_output
    with open("function.md", "w", encoding="utf-8") as f:
        f.write("\n".join(final_md))
    
    print("🎉 成功！所有 .js 的函式名稱已儲存至 function.md")

if __name__ == "__main__":
    main()
import os
import re
import ast

def parse_python(filepath):
    results = []
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        try:
            node = ast.parse(f.read(), filename=filepath)
            for child in ast.iter_child_nodes(node):
                if isinstance(child, ast.FunctionDef):
                    results.append(f"  - ⚡ **[函式]** `{child.name}()`")
                elif isinstance(child, ast.ClassDef):
                    results.append(f"  - 📦 **[類別]** `{child.name}`")
                    for sub in child.body:
                        if isinstance(sub, ast.FunctionDef):
                            results.append(f"    - ⚡ **[方法]** `{sub.name}()`")
                elif isinstance(child, ast.Assign):
                    for target in child.targets:
                        if isinstance(target, ast.Name):
                            results.append(f"  - 🔹 **[變數]** `{target.id}`")
        except Exception as e:
            results.append(f"  - ❌ *解析失敗: {e}*")
    return results

def parse_javascript(filepath):
    results = []
    func_pattern = re.compile(r'(?:function\s+([a-zA-Z0-9_\(]+)\vert{}([a-zA-Z0-9_\)]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_\(]+)\s*=>\vert{}class\s+([a-zA-Z0-9_\)]+))')
    var_pattern = re.compile(r'(?:var|let|const)\s+([a-zA-Z0-9_\$]+)\s*=')
    
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            f_match = func_pattern.search(line)
            if f_match:
                name = f_match.group(1) or f_match.group(2) or f_match.group(3)
                if "class" in line:
                    results.append(f"  - 📦 **[類別]** `{name}`")
                else:
                    results.append(f"  - ⚡ **[函式/箭頭函式]** `{name}()`")
                continue
            v_match = var_pattern.search(line)
            if v_match:
                results.append(f"  - 🔹 **[變數]** `{v_match.group(1)}`")
    return results

def parse_css(filepath):
    results = []
    selector_pattern = re.compile(r'([.#][a-zA-Z0-9_-]+)(?:\s*,\s*[.#][a-zA-Z0-9_-]+)*\s*\{')
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
        matches = selector_pattern.findall(content)
        selectors = sorted(list(set(matches)))
        for selector in selectors:
            results.append(f"  - 🎨 **[選擇器]** `{selector}`")
    return results

def parse_html_or_svg(filepath, file_type):
    results = []
    id_pattern = re.compile(r'id=["\']([^"\']+)["\']')
    class_pattern = re.compile(r'class=["\']([^"\']+)["\']')
    
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            id_match = id_pattern.search(line)
            class_match = class_pattern.search(line)
            if id_match:
                results.append(f"  - 🆔 **[ID 節點]** `#{id_match.group(1)}`")
            if class_match:
                for cls in class_match.group(1).split():
                    results.append(f"  - ✨ **[Class 樣式]** `.{cls}`")
    return results

def main():
    target_extensions = {
        '.py': parse_python,
        '.js': parse_javascript,
        '.css': parse_css,
        '.html': lambda fp: parse_html_or_svg(fp, 'HTML'),
        '.svg': lambda fp: parse_html_or_svg(fp, 'SVG')
    }
    
    md_output = [
        "# 📋 專案程式碼結構分析報告",
        "\n本報告自動掃描專案目錄下的原始碼檔案，並將結構彙整。\n",
        "## 🔍 掃描統計與摘要",
        "| 檔案路徑 | 類型 | 分析摘要 |",
        "| :--- | :--- | :--- |"
    ]
    
    details_output = ["\n## 📂 檔案結構詳細清單\n"]
    
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__', 'node_modules', 'venv', '.vscode')]
        
        for file in files:
            # 💡 修正這裡：先用 [1] 取得副檔名，再執行 .lower()
            ext = os.path.splitext(file)[1].lower()
            if ext in target_extensions:
                filepath = os.path.join(root, file).replace("\\", "/")
                
                # 執行對應的分析器
                parser = target_extensions[ext]
                items = parser(filepath)
                
                if items:
                    # 加入摘要表格
                    md_output.append(f"| `{filepath}` | `{ext.upper()[1:]}` | 找到 {len(items)} 個結構實體 |")
                    # 加入詳細清單
                    details_output.append(f"### 📄 檔案: `{filepath}`")
                    details_output.extend(items)
                    details_output.append("")
                else:
                    md_output.append(f"| `{filepath}` | `{ext.upper()[1:]}` | *無偵測到特定結構* |")

    # 彙整寫入檔案
    final_md = md_output + details_output
    with open("report.md", "w", encoding="utf-8") as f:
        f.write("\n".join(final_md))
    
    print("🎉 報告已成功生成至當前目錄下的 report.md！")

if __name__ == "__main__":
    main()
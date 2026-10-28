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
                    results.append(f"  - ⚡ **[Function]** `{child.name}()`")
                elif isinstance(child, ast.ClassDef):
                    results.append(f"  - 📦 **[Class]** `{child.name}`")
                    for sub in child.body:
                        if isinstance(sub, ast.FunctionDef):
                            results.append(f"    - ⚡ **[Method]** `{sub.name}()`")
                elif isinstance(child, ast.Assign):
                    for target in child.targets:
                        if isinstance(target, ast.Name):
                            results.append(f"  - 🔹 **[Variable]** `{target.id}`")
        except Exception as e:
            results.append(f"  - ❌ *Parse failed: {e}*")
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
                    results.append(f"  - 📦 **[Class]** `{name}`")
                else:
                    results.append(f"  - ⚡ **[Function/Arrow Function]** `{name}()`")
                continue
            v_match = var_pattern.search(line)
            if v_match:
                results.append(f"  - 🔹 **[Variable]** `{v_match.group(1)}`")
    return results

def parse_css(filepath):
    results = []
    selector_pattern = re.compile(r'([.#][a-zA-Z0-9_-]+)(?:\s*,\s*[.#][a-zA-Z0-9_-]+)*\s*\{')
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
        matches = selector_pattern.findall(content)
        selectors = sorted(list(set(matches)))
        for selector in selectors:
            results.append(f"  - 🎨 **[Selector]** `{selector}`")
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
                results.append(f"  - 🆔 **[ID Node]** `#{id_match.group(1)}`")
            if class_match:
                for cls in class_match.group(1).split():
                    results.append(f"  - ✨ **[Class Style]** `.{cls}`")
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
        "# 📋 Project Code Structure Analysis Report",
        "\nThis report automatically scans the project directory for source files and consolidates their structure.\n",
        "## 🔍 Scan Statistics and Summary",
        "| File path | Type | Analysis summary |",
        "| :--- | :--- | :--- |"
    ]
    
    details_output = ["\n## 📂 Detailed File Structure List\n"]
    
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__', 'node_modules', 'venv', '.vscode')]
        
        for file in files:
            # 💡 Fix here: first use [1] to get the extension, then call .lower()
            ext = os.path.splitext(file)[1].lower()
            if ext in target_extensions:
                filepath = os.path.join(root, file).replace("\\", "/")
                
                # Execute the corresponding analyzer
                parser = target_extensions[ext]
                items = parser(filepath)
                
                if items:
                    # Add to the summary table
                    md_output.append(f"| `{filepath}` | `{ext.upper()[1:]}` | Found {len(items)} structural entities |")
                    # Add to the detailed list
                    details_output.append(f"### 📄 File: `{filepath}`")
                    details_output.extend(items)
                    details_output.append("")
                else:
                    md_output.append(f"| `{filepath}` | `{ext.upper()[1:]}` | *No specific structure detected* |")

    # Combine and write the report file
    final_md = md_output + details_output
    with open("report.md", "w", encoding="utf-8") as f:
        f.write("\n".join(final_md))
    
    print("🎉 Report generated successfully in the current directory as report.md!")

if __name__ == "__main__":
    main()
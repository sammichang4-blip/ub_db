import os
import re

def extract_js_functions(filepath):
    """Precisely extract function names from JavaScript files."""
    functions = []
    
    # 💡 Updated: only fixed-width or standard regex patterns are used
    patterns = [
        # 1. Standard function: function funcName( or async function funcName(
        r'(?:async\s+)?function\s+([a-zA-Z0-9_\$]+)\s*\(',
        # 2. Arrow function / anonymous function assignment: const funcName = ( or let funcName = async (
        r'(?:const|let|var)\s+([a-zA-Z0-9_\$]+)\s*=\s*(?:async\s*)?\(',
        # 3. Object literal or class method: methodName(a, b) {
        r'\b([a-zA-Z0-9_\$]+)\s*.*?\s*\{'
    ]
    
    combined_pattern = re.compile('|'.join(patterns))
    
    # Used to exclude falsely matched built-in JS keywords
    js_keywords = {'if', 'for', 'while', 'switch', 'catch', 'each', 'function'}
    
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            # Exclude comment lines
            if line.startswith("//") or line.startswith("*") or line.startswith("/*"):
                continue
                
            match = combined_pattern.search(line)
            if match:
                # Find the actual non-empty captured group match
                func_name = next((g for g in match.groups() if g), None)
                
                # 💡 Updated: use Python checks here to filter keywords such as if/for
                if func_name and func_name not in js_keywords:
                    if func_name not in functions:
                        functions.append(func_name)
                    
    return sorted(functions)

def main():
    md_output = [
        "# ⚡ JavaScript Function Inventory",
        "\nThis report automatically aggregates the Function names defined in all `.js` files in the project.\n",
        "## 📊 File Summary Statistics",
        "| File path | Function count |",
        "| :--- | :--- |"
    ]
    
    details_output = ["\n## 📂 Detailed Function List by File\n"]
    total_functions = 0
    
    for root, dirs, files in os.walk("."):
        # Exclude common directories that do not need scanning
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__', 'node_modules', 'venv', '.vscode', 'dist')]
        
        for file in files:
            if file.lower().endswith('.js'):
                filepath = os.path.join(root, file).replace("\\", "/")
                funcs = extract_js_functions(filepath)
                
                if funcs:
                    total_functions += len(funcs)
                    md_output.append(f"| `{filepath}` | **{len(funcs)}** |")
                    
                    details_output.append(f"### 📄 `{filepath}`")
                    for f_name in funcs:
                        details_output.append(f"- ⚡ `{f_name}()`")
                    details_output.append("")
                else:
                    md_output.append(f"| `{filepath}` | *No function detected* |")

    # Insert the total before the summary
    md_output.insert(3, f"**🎯 Project total detected: {total_functions} JavaScript functions**\n")
    
    # Consolidate and write function.md
    final_md = md_output + details_output
    with open("function.md", "w", encoding="utf-8") as f:
        f.write("\n".join(final_md))
    
    print("🎉 Success! All `.js` function names have been saved to function.md")

if __name__ == "__main__":
    main()
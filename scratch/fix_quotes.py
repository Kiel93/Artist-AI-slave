import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

for f_name in os.listdir(nodes_dir):
    if f_name.endswith('.tsx'):
        filepath = os.path.join(nodes_dir, f_name)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if "\\'" in content:
            content = content.replace("\\'", "'")
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Fixed escaped quotes in {f_name}")

import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def extract_handles(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    handles = re.findall(r'<Handle[^>]*>', content)
    
    issues = []
    for h in handles:
        # Check for !left-[-16px]
        if '!left-[-16px]' in h:
             issues.append(f"Bad offset (!left-[-16px]): {h}")
        elif 'Position.Left' in h and '!left-[-24px]' not in h:
             issues.append(f"Missing !left-[-24px]: {h}")
             
        if 'Position.Right' in h and '!right-[-10px]' not in h:
             issues.append(f"Missing !right-[-10px]: {h}")
             
        # Check for inline style missing width, height, borderColor, borderWidth
        if 'style={{' not in h:
             issues.append(f"Missing style object: {h}")
        else:
             if 'width:' not in h or 'height:' not in h or 'borderColor:' not in h or 'borderWidth:' not in h:
                  issues.append(f"Incomplete style object: {h}")
        
        # Check for forbidden !w-4 !h-4 !border-none (if they aren't the '+' handle)
        if '!w-4' in h or '!h-4' in h:
             if 'image-plus' not in h and '+' not in h: # The '+' handle uses !w-5 !h-5 usually
                  issues.append(f"Uses legacy !w-4 !h-4: {h}")

    if issues:
        print(f"\n--- {os.path.basename(filepath)} ---")
        for i in issues:
             print(f" - {i}")

for f in os.listdir(nodes_dir):
    if f.endswith('.tsx'):
        extract_handles(os.path.join(nodes_dir, f))

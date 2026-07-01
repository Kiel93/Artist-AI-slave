import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. Remove aspect-square and aspect-video
    content = re.sub(r'\baspect-square\b\s*', '', content)
    content = re.sub(r'\baspect-video\b\s*', '', content)
    # clean up any leftover double spaces in class names
    content = re.sub(r'className="([^"]*)\s{2,}([^"]*)"', r'className="\1 \2"', content)

    # 2. Fix Left Handles missing !left-[-...
    # We look for <Handle ... position={Position.Left} ... />
    def left_handle_replacer(match):
        handle = match.group(0)
        if '!left-[-' not in handle:
            # Inject !left-[-16px] into className
            if 'className="' in handle:
                handle = re.sub(r'className="([^"]*)"', r'className="\1 !left-[-16px]"', handle)
            else:
                handle = handle.replace('<Handle ', '<Handle className="!left-[-16px]" ')
        return handle

    content = re.sub(r'<Handle[^>]+position=\{Position\.Left\}[^>]*>', left_handle_replacer, content)

    # 3. Fix Right Handles missing !right-[-...
    def right_handle_replacer(match):
        handle = match.group(0)
        if '!right-[-' not in handle:
            # Inject !right-[-10px] into className
            if 'className="' in handle:
                handle = re.sub(r'className="([^"]*)"', r'className="\1 !right-[-10px]"', handle)
            else:
                handle = handle.replace('<Handle ', '<Handle className="!right-[-10px]" ')
        return handle

    content = re.sub(r'<Handle[^>]+position=\{Position\.Right\}[^>]*>', right_handle_replacer, content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {os.path.basename(filepath)}")

for f in os.listdir(nodes_dir):
    if f.endswith('.tsx'):
        fix_file(os.path.join(nodes_dir, f))

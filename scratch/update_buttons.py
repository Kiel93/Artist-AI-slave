import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def update_action_buttons(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    def replacer(match):
        full_class = match.group(1)
        
        # Don't modify transparent buttons or tiny buttons
        if 'bg-transparent' in full_class or 'p-3' in full_class or 'p-1.5' in full_class or 'p-4' in full_class or 'p-1' in full_class:
            return match.group(0)

        # Only modify action buttons
        if 'bg-' in full_class and '600' in full_class and 'font-bold' in full_class and 'shadow-lg' in full_class:
            # Extract color
            color_match = re.search(r'bg-([a-z]+)-600', full_class)
            if not color_match:
                return match.group(0)
            color = color_match.group(1)

            # Determine layout width
            layout_w = 'w-full' if 'w-full' in full_class else 'flex-1' if 'flex-1' in full_class else ''
            if not layout_w and 'nodrag' in full_class:
                layout_w = 'w-full' # Default
            
            # Determine gap
            gap_match = re.search(r'gap-(\d)', full_class)
            gap = f"gap-{gap_match.group(1)}" if gap_match else "gap-2"

            new_class = f"nodrag {layout_w} py-2.5 bg-{color}-600 hover:bg-{color}-500 border-b-4 border-{color}-800 active:border-b-0 active:translate-y-1 text-white text-sm font-bold rounded-xl shadow-lg flex items-center justify-center {gap} disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 transition-all".strip()
            
            # Replace multiple spaces
            new_class = re.sub(r'\s+', ' ', new_class)
            
            return match.group(0).replace(full_class, new_class)
            
        return match.group(0)

    # Match className attributes inside buttons
    new_content = re.sub(r'<button[^>]*className="([^"]+)"[^>]*>', replacer, content)

    if new_content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(filepath)}")

for f_name in os.listdir(nodes_dir):
    if f_name.endswith('.tsx'):
        update_action_buttons(os.path.join(nodes_dir, f_name))

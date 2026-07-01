import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def get_node_colors(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the top div's bg/border color which indicates the semantic type
    # e.g., <div className="bg-emerald-900/20 px-4 py-3 flex items-center justify-between border-b border-emerald-500/20 rounded-t-lg">
    header_color = None
    header_match = re.search(r'bg-([a-z]+)-\d{3}/\d+', content)
    if header_match:
        header_color = header_match.group(1)

    # Find the primary action button
    # e.g., <button ... className="nodrag flex-1 py-2 bg-blue-600 hover:bg-blue-500
    button_color = None
    button_match = re.search(r'<button[^>]+className="[^"]*bg-([a-z]+)-\d{3}[^"]*"[^>]*>\s*(?:<[^>]+>\s*)?[A-Z\s]+', content)
    if button_match:
        button_color = button_match.group(1)

    # Find transparent Open Editor button
    has_clear_button = False
    if 'Open Editor' in content:
        if 'bg-transparent' in content or ('bg-' not in re.search(r'<button[^>]*>[\s\S]*?Open Editor', content).group(0)):
            # Need to be more precise:
            btn_match = re.search(r'<button[^>]+className="([^"]+)"[^>]*>\s*Open Editor', content)
            if btn_match:
                classes = btn_match.group(1)
                if 'bg-' not in classes or 'hover:bg-' in classes and len(re.findall(r'\bbg-', classes)) == 0:
                     has_clear_button = True
                else:
                    # check if the bg is transparent
                    if 'bg-transparent' in classes or 'hover:bg' in classes and 'bg-' not in classes.replace('hover:bg', ''):
                        has_clear_button = True
        
    print(f"{os.path.basename(filepath)}: Header={header_color}, Button={button_color}, HasClearBtn={'Yes' if has_clear_button else 'N/A' if 'Open Editor' not in content else 'No'}")

for f in os.listdir(nodes_dir):
    if f.endswith('.tsx'):
        get_node_colors(os.path.join(nodes_dir, f))

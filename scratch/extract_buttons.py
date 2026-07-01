import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def get_action_buttons():
    for f_name in os.listdir(nodes_dir):
        if not f_name.endswith('.tsx'): continue
        filepath = os.path.join(nodes_dir, f_name)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find buttons that are primary action buttons (usually at the bottom, generating/executing something)
        # Avoid "Open Editor" buttons which are clear buttons.
        # Avoid download/view grid buttons.
        
        button_matches = re.finditer(r'<button[^>]*className="([^"]+)"[^>]*>([\s\S]*?)</button>', content)
        for match in button_matches:
            classes = match.group(1)
            inner_html = match.group(2)
            
            # Skip transparent clear buttons or small icon buttons
            if 'bg-transparent' in classes or 'p-3' in classes or 'p-1.5' in classes or 'p-4' in classes:
                 continue
                 
            # Action buttons usually have 'flex-1', 'w-full', 'bg-<color>-600', 'font-bold'
            if 'bg-' in classes and '600' in classes and 'font-bold' in classes:
                print(f"{f_name}: {classes}")
                
get_action_buttons()

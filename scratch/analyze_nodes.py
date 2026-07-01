import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def check_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    issues = []
    
    # Check for overflow-y-auto
    if 'overflow-y-auto' in content:
        issues.append("Contains 'overflow-y-auto' (violates No Scrollbar Rule)")

    # Check for aspect-square or aspect-video in image containers
    if re.search(r'aspect-(square|video)', content):
        issues.append("Contains fixed aspect ratio 'aspect-square' or 'aspect-video' (violates Image Display rule)")
        
    # Check Handles missing offset
    handles = re.findall(r'<Handle[^>]+>', content)
    for handle in handles:
        if 'Position.Left' in handle and '!left-[-' not in handle:
            issues.append(f"Left Handle missing offset (!left-[-XXpx]): {handle[:50]}...")
        if 'Position.Right' in handle and '!right-[-' not in handle:
            issues.append(f"Right Handle missing offset (!right-[-XXpx]): {handle[:50]}...")
            
    # Check action buttons for semantic color mismatch
    # Just a simple heuristic for now
    if '<button' in content and 'bg-' in content:
        pass # Too complex for regex, I'll review manually

    # Check for download buttons not in overlay
    if 'download' in content and 'group-hover:opacity-100' not in content:
        issues.append("Download button might not be in a group-hover overlay")
        
    if issues:
        print(f"\n--- {os.path.basename(filepath)} ---")
        for i in issues:
            print(f" - {i}")

for f in os.listdir(nodes_dir):
    if f.endswith('.tsx'):
        check_file(os.path.join(nodes_dir, f))

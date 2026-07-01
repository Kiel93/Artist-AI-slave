import os
import re

nodes_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src\components\nodes"

def fix_handles(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # Fix 1: !left-[-16px] -> !left-[-24px]
    content = content.replace("!left-[-16px]", "!left-[-24px]")
    
    # Fix 2: Legacy styling in handles
    # For GeneralImageGenerationNode
    content = re.sub(
        r'style=\{\{\s*backgroundColor:\s*h\.color\s*\}\}\s*className=\{`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !left-\[-24px\]`\}',
        r'className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: \'16px\', height: \'16px\', backgroundColor: h.color, borderColor: \'#14532d\', borderWidth: \'2px\' }}',
        content
    )

    # For CompoundNode
    content = re.sub(
        r'className=\{`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !(left-\[-24px\]|right-\[-10px\]) \$\{pinType === \'image\' \? \'!bg-\[#22c55e\]\' : \'!bg-\[#3b82f6\]\'\}`\}',
        r'className={`!min-w-0 !min-h-0 rounded-full !\1`} style={{ width: \'16px\', height: \'16px\', backgroundColor: pinType === \'image\' ? \'#22c55e\' : \'#3b82f6\', borderColor: pinType === \'image\' ? \'#14532d\' : \'#1e3a8a\', borderWidth: \'2px\' }}',
        content
    )
    
    # For GraphInputNode and GraphOutputNode
    content = re.sub(
        r'className=\{`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !(left-\[-24px\]|right-\[-10px\]) \$\{pinColor\}`\}',
        r'className={`!min-w-0 !min-h-0 rounded-full !\1`} style={{ width: \'16px\', height: \'16px\', backgroundColor: pinColor.includes(\'blue\') ? \'#3b82f6\' : pinColor.includes(\'emerald\') ? \'#22c55e\' : pinColor.includes(\'red\') ? \'#ef4444\' : \'#a855f7\', borderColor: pinColor.includes(\'blue\') ? \'#1e3a8a\' : pinColor.includes(\'emerald\') ? \'#14532d\' : pinColor.includes(\'red\') ? \'#7f1d1d\' : \'#581c87\', borderWidth: \'2px\' }}',
        content
    )

    # For ImageEditorNode (hardcoded green)
    content = re.sub(
        r'className="!w-4 !h-4 !bg-\[#22c55e\] !border-none !left-\[-24px\]"',
        r'className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: \'16px\', height: \'16px\', backgroundColor: \'#22c55e\', borderColor: \'#14532d\', borderWidth: \'2px\' }}',
        content
    )

    # For PromptConnectorNode (hardcoded blue with dynamic scale)
    content = re.sub(
        r'className=\{`!w-4 !h-4 !bg-blue-500 !border-none !min-w-0 !min-h-0 !left-\[-24px\] transition-all duration-200 \$\{\s*isConnected \? "!scale-110" : ""\s*\}\`\}\s*style=\{\{ top: "50%", transform: "translateY\(-50%\)" \}\}',
        r'className={`!min-w-0 !min-h-0 rounded-full !left-[-24px] transition-all duration-200 ${isConnected ? "!scale-110" : ""}`} style={{ width: \'16px\', height: \'16px\', backgroundColor: \'#3b82f6\', borderColor: \'#1e3a8a\', borderWidth: \'2px\', top: \'50%\', transform: \'translateY(-50%)\' }}',
        content
    )
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {os.path.basename(filepath)}")

for f in os.listdir(nodes_dir):
    if f.endswith('.tsx'):
        fix_handles(os.path.join(nodes_dir, f))

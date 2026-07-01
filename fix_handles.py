import os, re

files = [f for f in os.listdir('src/components/nodes') if f.endswith('.tsx')]

colors = {
    'blue': "style={{ width: '16px', height: '16px', backgroundColor: '#3b82f6', borderColor: '#1e3a8a', borderWidth: '2px' }}",
    'green': "style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }}",
    'red': "style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderColor: '#7f1d1d', borderWidth: '2px' }}",
    'purple': "style={{ width: '16px', height: '16px', backgroundColor: '#a855f7', borderColor: '#581c87', borderWidth: '2px' }}"
}

for file in files:
    path = f'src/components/nodes/{file}'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    def handle_replacer(match):
        attrs = match.group(1)
        type_m = re.search(r'type="([^"]+)"', attrs)
        pos_m = re.search(r'position={([^}]+)}', attrs)
        id_m = re.search(r'id="([^"]+)"', attrs)
        
        if not type_m or not pos_m or not id_m: return match.group(0)
        
        t = type_m.group(1)
        p = pos_m.group(1)
        i = id_m.group(1)
        
        color = 'blue'
        if 'image' in i or 'img' in i: color = 'green'
        if i in ['value', 'zoom', 'opacity', 'feather', 'intensity', 'threshold']: color = 'red'
        if i in ['mask']: color = 'purple'
        
        cls = '!min-w-0 !min-h-0 rounded-full'
        if t == 'target':
            if '!left-[-24px]' in attrs: cls += ' !left-[-16px]'
        
        return f'<Handle type="{t}" position={{{p}}} id="{i}" className="{cls}" {colors[color]} />'

    new_content = re.sub(r'<Handle\s+([^>]+)/>', handle_replacer, content)
    
    # Fix common flex rows to be relative so Handles position correctly within them
    new_content = new_content.replace('className="flex justify-between items-center"', 'className="relative flex justify-between items-center w-full"')
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {file}")

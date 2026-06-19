import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. Replace complex fallback chains with standard properties
    # Node reading text
    content = re.sub(r'sourceNode\.data\.outputText\s*\|\|\s*sourceNode\.data\.refinedText\s*\|\|\s*sourceNode\.data\.text\s*\|\|\s*sourceNode\.data\.bakedStyle\s*\|\|\s*sourceNode\.data\.prompt\s*(\|\|\s*"")?', r'sourceNode.data.text\1', content)
    content = re.sub(r'sourceNode\.data\.outputText\s*\|\|\s*sourceNode\.data\.refinedText\s*\|\|\s*sourceNode\.data\.text\s*\|\|\s*sourceNode\.data\.bakedStyle\s*(\|\|\s*"")?', r'sourceNode.data.text\1', content)
    content = re.sub(r'sourceNode\.data\.outputText\s*\|\|\s*sourceNode\.data\.text\s*\|\|\s*sourceNode\.data\.bakedStyle\s*(\|\|\s*"")?', r'sourceNode.data.text\1', content)
    
    # Node reading image
    content = re.sub(r'sourceNode\.data\.outputImage\s*\|\|\s*sourceNode\.data\.imageUrl\s*\|\|\s*sourceNode\.data\.resultUrl\s*\|\|\s*sourceNode\.data\.image\s*(\|\|\s*"")?', r'sourceNode.data.image\1', content)
    
    # Fallback init state variables
    content = re.sub(r'data\.outputText\s*\|\|\s*data\.refinedText\s*\|\|\s*""', r'data.text || ""', content)
    content = re.sub(r'data\.outputText\s*\|\|\s*data\.explainedText\s*\|\|\s*""', r'data.text || ""', content)
    content = re.sub(r'data\.outputText\s*\|\|\s*data\.bakedStyle\s*\|\|\s*""', r'data.text || ""', content)
    content = re.sub(r'data\.outputText\s*\|\|\s*data\.text\s*\|\|\s*""', r'data.text || ""', content)
    content = re.sub(r'data\.outputImage\s*\|\|\s*data\.resultUrl\s*\|\|\s*null', r'data.image || null', content)
    content = re.sub(r'data\.outputImage\s*\|\|\s*data\.resultUrl\s*\|\|\s*data\.imageUrl', r'data.image', content)
    
    # map generator AssetManager logic
    content = re.sub(r'node\.data\.outputImage\s*\|\|\s*node\.data\.resultUrl\s*\|\|\s*node\.data\.imageUrl', r'node.data.image', content)
    content = re.sub(r'vNode\.data\.outputImage\s*\|\|\s*vNode\.data\.resultUrl\s*\|\|\s*vNode\.data\.imageUrl', r'vNode.data.image', content)
    content = re.sub(r'targetNode\.data\.outputImage\s*\|\|\s*targetNode\.data\.resultUrl\s*\|\|\s*targetNode\.data\.imageUrl', r'targetNode.data.image', content)
    content = re.sub(r'n\.data\.outputImage\s*\|\|\s*n\.data\.resultUrl\s*\|\|\s*n\.data\.imageUrl', r'n.data.image', content)

    # node-executor specific
    content = re.sub(r'nodeData\.outputText\s*\|\|\s*nodeData\.text\s*\|\|\s*""', r'nodeData.text || ""', content)
    content = re.sub(r'srcOut\.outputText\s*\|\|\s*srcOut\.refinedText\s*\|\|\s*srcOut\.text\s*\|\|\s*srcOut\.bakedStyle\s*\|\|\s*""', r'srcOut.text || ""', content)
    
    # PromptConnectorNode specific
    content = re.sub(r'\(node\?\.data as any\)\?\.outputText\s*\|\|\s*\(node\?\.data as any\)\?\.refinedText\s*\|\|\s*\(node\?\.data as any\)\?\.text\s*\|\|\s*\(node\?\.data as any\)\?\.bakedStyle(\s*\|\|\s*"")?', r'(node?.data as any)?.text\1', content)

    # 2. Replace writes to outputText with text, and outputImage with image
    content = re.sub(r'outputText:', r'text:', content)
    content = re.sub(r'outputImage:', r'image:', content)
    content = re.sub(r'outputImages:', r'images:', content)
    
    # 3. Replace data accesses
    content = re.sub(r'data\.outputText', r'data.text', content)
    content = re.sub(r'data\.outputImage', r'data.image', content)
    content = re.sub(r'data\.outputImages', r'data.images', content)
    content = re.sub(r'srcOut\.outputText', r'srcOut.text', content)
    content = re.sub(r'srcOut\.outputImage', r'srcOut.image', content)
    
    # 4. Replace variable names for consistency
    # setOutputText -> setText, outputText -> text
    content = re.sub(r'const \[outputText,\s*setOutputText\]', r'const [text, setText]', content)
    content = re.sub(r'setOutputText\(', r'setText(', content)
    content = re.sub(r'(?<![A-Za-z0-9_])outputText(?![A-Za-z0-9_])', r'text', content)
    
    content = re.sub(r'const \[outputImage,\s*setOutputImage\]', r'const [image, setImage]', content)
    content = re.sub(r'setOutputImage\(', r'setImage(', content)
    content = re.sub(r'(?<![A-Za-z0-9_])outputImage(?![A-Za-z0-9_])', r'image', content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

def main():
    root_dir = r"c:\Users\Admin\.gemini\antigravity\scratch\artist-assistant\src"
    for subdir, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = os.path.join(subdir, file)
                process_file(filepath)

if __name__ == "__main__":
    main()

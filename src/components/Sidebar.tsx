"use client";

import { useState, useEffect } from "react";
import { get, set } from "idb-keyval";
import { MessageSquare, Link2, Palette, Image as ImageIcon, Sparkles, ImageDown, PenTool, Box, Search, Scissors, Eraser, LogIn, LogOut, Layers, Trash2, Download, Upload } from "lucide-react";

const NODE_TYPES = [
  {
    type: "graphInput",
    label: "Graph Input",
    icon: <LogIn className="w-5 h-5 text-gray-400" />,
    description: "Route external data into Compound Node",
    isCompoundExclusive: true,
  },
  {
    type: "graphOutput",
    label: "Graph Output",
    icon: <LogOut className="w-5 h-5 text-gray-400" />,
    description: "Route data to Compound Node exterior",
    isCompoundExclusive: true,
  },
  {
    type: "prompt",
    label: "Prompt",
    icon: <MessageSquare className="w-5 h-5 text-blue-400" />,
    description: "Raw prompt fragment",
  },
  {
    type: "promptConnector",
    label: "Prompt Connector",
    icon: <Link2 className="w-5 h-5 text-blue-500" />,
    description: "Chain multiple prompts together",
  },
  {
    type: "styleInsert",
    label: "Style Insert",
    icon: <Palette className="w-5 h-5 text-pink-400" />,
    description: "Define artistic style parameters",
  },
  {
    type: "referenceImage",
    label: "Reference Image",
    icon: <ImageIcon className="w-5 h-5 text-green-400" />,
    description: "Upload local image references",
  },

  {
    type: "isometricDraw",
    label: "Isometric Sheet",
    icon: <Box className="w-5 h-5 text-teal-400" />,
    description: "4-directional isometric sprite sheet",
  },
  {
    type: "geminiRefiner",
    label: "Gemini Refiner",
    icon: <Sparkles className="w-5 h-5 text-yellow-400" />,
    description: "Refine prompt/style via LLM",
  },
  {
    type: "imageExplained",
    label: "Image Analyzer",
    icon: <Search className="w-5 h-5 text-emerald-400" />,
    description: "Describe an image in detail",
  },
  {
    type: "generalImageGeneration",
    label: "Image Generation",
    icon: <ImageDown className="w-5 h-5 text-purple-400" />,
    description: "Generate final image",
  },
  {
    type: "tilesetGenerator",
    label: "Tileset Generator",
    icon: <ImageIcon className="w-5 h-5 text-indigo-400" />,
    description: "Generate tilesets using standard plot",
  },
  {
    type: "isometricHexSlicer",
    label: "Hex Slicer",
    icon: <Box className="w-5 h-5 text-emerald-400" />,
    description: "Slice image into isometric hex tiles",
  },
  {
    type: "tileCutter",
    label: "Tile Cutter",
    icon: <Scissors className="w-5 h-5 text-emerald-400" />,
    description: "Cut custom ground tiles from images",
  },
  {
    type: "assetGenerator",
    label: "Asset Gen (Chroma)",
    icon: <PenTool className="w-5 h-5 text-indigo-400" />,
    description: "Generate & extract assets via chromakeying",
  },
  {
    type: "shadowExtractor",
    label: "Shadow Extractor",
    icon: <ImageIcon className="w-5 h-5 text-emerald-400" />,
    description: "Extract black subject from white background",
  },
  {
    type: "imageEditor",
    label: "Image Editor",
    icon: <ImageIcon className="w-5 h-5 text-emerald-400" />,
    description: "Basic image manipulation",
  },
  {
    type: "backgroundRemover",
    label: "Background Remover",
    icon: <Eraser className="w-5 h-5 text-pink-400" />,
    description: "Remove background via client AI",
  },
];

export default function Sidebar() {
  const [isCompoundContext, setIsCompoundContext] = useState(false);
  const [activeTab, setActiveTab] = useState<"core" | "custom">("core");
  const [customNodes, setCustomNodes] = useState<any[]>([]);

  const loadCustomNodes = async () => {
    try {
      const stored = await get("artist-assistant-custom-nodes");
      if (stored) {
        setCustomNodes(stored);
      } else {
        // Fallback migration from localStorage if exists
        const localStored = localStorage.getItem("artist-assistant-custom-nodes");
        if (localStored) {
          const parsed = JSON.parse(localStored);
          setCustomNodes(parsed);
          await set("artist-assistant-custom-nodes", parsed);
          localStorage.removeItem("artist-assistant-custom-nodes"); // Cleanup
        } else {
          setCustomNodes([]);
        }
      }
    } catch (e) {
      console.error("Failed to load custom nodes", e);
    }
  };

  useEffect(() => {
    loadCustomNodes();
    
    const handleContextChange = (e: any) => setIsCompoundContext(e.detail.isCompound);
    const handleCustomNodesUpdated = () => loadCustomNodes();
    
    window.addEventListener('graphPathChanged', handleContextChange);
    window.addEventListener('customNodesUpdated', handleCustomNodesUpdated);
    
    return () => {
      window.removeEventListener('graphPathChanged', handleContextChange);
      window.removeEventListener('customNodesUpdated', handleCustomNodesUpdated);
    };
  }, []);

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string, isCustom: boolean = false, customData?: any) => {
    if (isCustom && customData) {
      event.dataTransfer.setData("application/reactflow-custom", JSON.stringify(customData));
    } else {
      event.dataTransfer.setData("application/reactflow", nodeType);
    }
    event.dataTransfer.effectAllowed = "move";
  };

  const deleteCustomNode = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customNodes.filter(n => n.id !== id);
    setCustomNodes(updated);
    await set("artist-assistant-custom-nodes", updated);
  };

  const importCustomNodes = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedNodes = JSON.parse(content);
        if (Array.isArray(importedNodes)) {
          const newCustomNodes = [...customNodes, ...importedNodes];
          
          // Ensure unique IDs
          const uniqueNodes = newCustomNodes.reduce((acc, current) => {
            const exists = acc.find((item: any) => item.id === current.id);
            if (!exists) {
              return acc.concat([current]);
            } else {
              current.id = `lib-node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
              return acc.concat([current]);
            }
          }, []);
          
          setCustomNodes(uniqueNodes);
          set("artist-assistant-custom-nodes", uniqueNodes).catch(console.error);
        } else {
          alert("Invalid file format. Expected an array of nodes.");
        }
      } catch (err) {
        alert("Failed to parse the file.");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; 
  };

  const visibleNodes = NODE_TYPES.filter(n => !n.isCompoundExclusive || isCompoundContext);

  return (
    <aside className="w-72 bg-[var(--color-blender-panel)] border-l border-[var(--color-blender-border)] flex flex-col h-full shadow-xl z-10">
      <div className="p-4 border-b border-[var(--color-blender-border)] pb-0">
        <h2 className="text-lg font-semibold text-white tracking-wide">Library</h2>
        
        <div className="flex mt-3 border-b border-gray-700">
          <button 
            className={`flex-1 pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'core' ? 'border-[var(--color-blender-accent)] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('core')}
          >
            Core Tools
          </button>
          <button 
            className={`flex-1 pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'custom' ? 'border-[var(--color-blender-accent)] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('custom')}
          >
            Custom
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'core' && visibleNodes.map((node) => (
          <div
            key={node.type}
            className="group flex flex-col p-3 bg-[var(--color-blender-node-bg)] border border-[var(--color-blender-border)] rounded-sm cursor-grab hover:border-[var(--color-blender-accent)] hover:shadow-sm transition-all duration-200"
            onDragStart={(event) => onDragStart(event, node.type)}
            draggable
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="p-1.5 bg-black/20 rounded-sm group-hover:bg-black/40 transition-colors border border-transparent group-hover:border-[var(--color-blender-border)]">
                {node.icon}
              </div>
              <span className="font-medium text-gray-200">{node.label}</span>
            </div>
            <p className="text-[10px] font-mono text-gray-500 pl-[42px] leading-tight uppercase tracking-wide">
              {node.description}
            </p>
          </div>
        ))}

        {activeTab === 'custom' && (
          <div className="mb-3">
            <label className="flex items-center justify-center gap-1.5 bg-[var(--color-blender-node-bg)] hover:bg-[var(--color-blender-hover)] text-gray-300 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide border border-[var(--color-blender-border)] transition-colors cursor-pointer w-full">
              <Upload className="w-3.5 h-3.5" /> Import Nodes
              <input type="file" accept=".json" className="hidden" onChange={importCustomNodes} />
            </label>
          </div>
        )}

        {activeTab === 'custom' && (
          customNodes.length > 0 ? (
            customNodes.map((node) => (
              <div
                key={node.id}
                className="group flex flex-col p-3 bg-black/20 border border-[var(--color-blender-border)] rounded-sm cursor-grab hover:border-[var(--color-blender-accent)] hover:shadow-sm transition-all duration-200 relative"
                onDragStart={(event) => onDragStart(event, 'compound', true, node.data)}
                draggable
              >
                <button 
                  onClick={(e) => deleteCustomNode(node.id, e)}
                  className="absolute top-2 right-2 p-1 bg-black/40 hover:bg-red-500/80 text-gray-400 hover:text-white rounded-sm transition-colors opacity-0 group-hover:opacity-100 border border-[var(--color-blender-border)]"
                  title="Delete from library"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-1.5 bg-black/30 rounded-sm group-hover:bg-black/50 transition-colors border border-transparent group-hover:border-[var(--color-blender-border)]">
                    <Layers className="w-5 h-5 text-[var(--color-blender-accent)]" />
                  </div>
                  <span className="font-medium text-gray-200 pr-6">{node.data.label || 'Custom Node'}</span>
                </div>
                <p className="text-[10px] font-mono text-gray-500 pl-[42px] leading-tight uppercase tracking-wide">
                  {node.data.internalNodes?.length || 0} internal nodes
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No custom nodes saved.</p>
              <p className="text-xs mt-1 opacity-70">Group nodes and save them to reuse across projects.</p>
            </div>
          )
        )}
      </div>
    </aside>
  );
}

"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Link2, Palette, Image as ImageIcon, Sparkles, ImageDown, PenTool, Box, Search, Scissors, Eraser, LogIn, LogOut, Layers, Trash2 } from "lucide-react";

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

  const loadCustomNodes = () => {
    try {
      const stored = localStorage.getItem("artist-assistant-custom-nodes");
      if (stored) {
        setCustomNodes(JSON.parse(stored));
      } else {
        setCustomNodes([]);
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

  const deleteCustomNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customNodes.filter(n => n.id !== id);
    setCustomNodes(updated);
    localStorage.setItem("artist-assistant-custom-nodes", JSON.stringify(updated));
  };

  const visibleNodes = NODE_TYPES.filter(n => !n.isCompoundExclusive || isCompoundContext);

  return (
    <aside className="w-72 bg-[var(--color-blender-panel)] border-l border-[var(--color-blender-border)] flex flex-col h-full shadow-xl z-10">
      <div className="p-4 border-b border-[var(--color-blender-border)] pb-0">
        <h2 className="text-lg font-semibold text-white tracking-wide">Library</h2>
        
        <div className="flex mt-3 border-b border-gray-700">
          <button 
            className={`flex-1 pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'core' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('core')}
          >
            Core Tools
          </button>
          <button 
            className={`flex-1 pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'custom' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
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
            className="group flex flex-col p-3 bg-[var(--color-blender-node-bg)] border border-[var(--color-blender-border)] rounded-lg cursor-grab hover:border-[var(--color-blender-accent)] hover:shadow-md transition-all duration-200"
            onDragStart={(event) => onDragStart(event, node.type)}
            draggable
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="p-1.5 bg-black/20 rounded-md group-hover:bg-black/40 transition-colors">
                {node.icon}
              </div>
              <span className="font-medium text-gray-200">{node.label}</span>
            </div>
            <p className="text-xs text-gray-500 pl-[42px] leading-tight">
              {node.description}
            </p>
          </div>
        ))}

        {activeTab === 'custom' && (
          customNodes.length > 0 ? (
            customNodes.map((node) => (
              <div
                key={node.id}
                className="group flex flex-col p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg cursor-grab hover:border-purple-500 hover:shadow-md transition-all duration-200 relative"
                onDragStart={(event) => onDragStart(event, 'compound', true, node.data)}
                draggable
              >
                <button 
                  onClick={(e) => deleteCustomNode(node.id, e)}
                  className="absolute top-2 right-2 p-1 bg-black/40 hover:bg-red-500/80 text-gray-400 hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete from library"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-1.5 bg-purple-500/20 rounded-md group-hover:bg-purple-500/40 transition-colors">
                    <Layers className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="font-medium text-gray-200 pr-6">{node.data.label || 'Custom Node'}</span>
                </div>
                <p className="text-xs text-purple-300/60 pl-[42px] leading-tight">
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

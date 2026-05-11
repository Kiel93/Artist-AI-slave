"use client";

import { MessageSquare, Link2, Palette, Image as ImageIcon, Sparkles, ImageDown, PenTool, Box, Search, Scissors, Eraser } from "lucide-react";

const NODE_TYPES = [
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
    type: "sketchToImage",
    label: "Sketch Constraint",
    icon: <PenTool className="w-5 h-5 text-orange-400" />,
    description: "Forces AI to strictly follow sketch",
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
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    description: "Central node: Refines inputs (Optional)",
  },
  {
    type: "imageExplained",
    label: "Image Analyzer",
    icon: <Search className="w-5 h-5 text-emerald-400" />,
    description: "Describe an image in detail",
  },
  {
    type: "plenxAiOutput",
    label: "PlenxAI Output",
    icon: <ImageDown className="w-5 h-5 text-blue-400" />,
    description: "Final generated image destination",
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
    icon: <Scissors className="w-5 h-5 text-emerald-400" />,
    description: "Dice standard plot into tiles",
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
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="w-72 bg-[var(--color-blender-panel)] border-l border-[var(--color-blender-border)] flex flex-col h-full shadow-xl z-10">
      <div className="p-4 border-b border-[var(--color-blender-border)]">
        <h2 className="text-lg font-semibold text-white tracking-wide">Node Library</h2>
        <p className="text-xs text-gray-400 mt-1">Drag tools onto the canvas</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {NODE_TYPES.map((node) => (
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
      </div>
    </aside>
  );
}

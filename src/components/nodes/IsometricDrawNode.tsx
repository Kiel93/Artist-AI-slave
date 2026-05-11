import { useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Box } from "lucide-react";

const ISO_PROMPT = "Create an isometric asset sheet of the subject. Show the subject from 4 different isometric angles (Northwest, Southwest, Northeast, Southeast). Render against a solid white background with no environmental context. Perfect for 2D game engines.";

export default function IsometricDrawNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();

  useEffect(() => {
    if (data.text !== ISO_PROMPT) {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: ISO_PROMPT } } : n))
      );
    }
  }, [id, data.text, setNodes]);

  return (
    <div className={`w-64 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected 
        ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" 
        : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-3 py-2 flex items-center gap-2 border-b border-emerald-500/20 rounded-t-lg">
        <Box className="w-4 h-4 text-emerald-400" />
        <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Isometric Sheet</span>
      </div>
      <div className="p-3">
        <p className="text-[10px] text-gray-400 leading-tight">
          Forces the generator to output a 4-directional isometric sprite sheet with no background.
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0"
      />
    </div>
  );
}

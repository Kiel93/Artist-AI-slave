import { useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { PenTool } from "lucide-react";

const SKETCH_PROMPT = "Strictly follow the composition, subject, and poses of the provided sketch. Do not alter the fundamental layout or add elements that contradict the sketch. Act as a paintover artist refining the provided lines into a fully rendered image.";

export default function SketchToImageNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();

  useEffect(() => {
    if (data.outputText !== SKETCH_PROMPT) {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, outputText: SKETCH_PROMPT } } : n))
      );
    }
  }, [id, data.outputText, setNodes]);

  return (
    <div className={`w-64 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected 
        ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" 
        : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-3 py-2 flex items-center gap-2 border-b border-emerald-500/20 rounded-t-lg">
        <PenTool className="w-4 h-4 text-emerald-400" />
        <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Sketch Constraint</span>
      </div>
      <div className="p-3">
        <p className="text-[10px] text-gray-400 leading-tight">
          Applies strict constraints to the generator to follow your connected reference image exactly as a sketch/paintover.
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0 !right-[-10px]"
      />
    </div>
  );
}

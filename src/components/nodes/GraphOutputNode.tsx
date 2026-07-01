import { useEffect } from "react";
import { Handle, Position, useReactFlow, useEdges } from "reactflow";
import { LogOut } from "lucide-react";

export default function GraphOutputNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  const edges = useEdges();

  const outputType = data.outputType || "image";

  useEffect(() => {
    // Find the first incoming edge to this node
    const incomingEdge = edges.find(e => e.target === id);
    if (incomingEdge && incomingEdge.sourceHandle) {
      const autoType = (incomingEdge.sourceHandle.includes('image') || incomingEdge.sourceHandle.includes('img')) ? 'image' : 'text';
      if (autoType !== outputType) {
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, outputType: autoType } } : n));
      }
    }
  }, [edges, id, outputType, setNodes]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, outputType: e.target.value } } : n));
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, pinLabel: e.target.value } } : n));
  };

  const pinColor = outputType === "image" ? "!bg-[#22c55e]" : "!bg-[#3b82f6]";

  return (
    <div className={`w-48 bg-[#1a1525] rounded-lg shadow-xl relative ${
      selected 
        ? "outline outline-2 outline-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.3)]" 
        : "border border-gray-600/50"
    }`}>
      <div className="bg-gray-800/50 px-3 py-2 flex items-center gap-2 border-b border-gray-600/30 rounded-t-lg">
        <LogOut className="w-4 h-4 text-gray-400" />
        <span className="font-bold text-[10px] text-gray-200 uppercase tracking-wider">Graph Output</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Top Panel: Inputs */}
        <div className="flex flex-col gap-1 pb-1">
          <div className="relative flex items-center h-6">
            <Handle
              type="target"
              position={Position.Left}
              id={outputType}
              className={`!min-w-0 !min-h-0 rounded-full !left-[-24px]`} style={{ width: '16px', height: '16px', backgroundColor: pinColor.includes('blue') ? '#3b82f6' : pinColor.includes('emerald') ? '#22c55e' : pinColor.includes('red') ? '#ef4444' : '#a855f7', borderColor: pinColor.includes('blue') ? '#1e3a8a' : pinColor.includes('emerald') ? '#14532d' : pinColor.includes('red') ? '#7f1d1d' : '#581c87', borderWidth: '2px' }}
            />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Input</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Pin Label</label>
          <input 
            type="text"
            className="nodrag w-full bg-black/40 text-gray-200 text-xs p-1.5 rounded border border-gray-600/50 focus:border-purple-400 focus:outline-none"
            placeholder="e.g. Final Result"
            value={data.pinLabel || ""}
            onChange={handleLabelChange}
          />
        </div>
        
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Output Type</label>
          <select 
            className="w-full bg-black/40 text-gray-200 text-xs p-1.5 rounded border border-gray-600/50 focus:border-gray-400 focus:outline-none nodrag"
            value={outputType}
            onChange={handleTypeChange}
          >
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </div>
      </div>

    </div>
  );
}

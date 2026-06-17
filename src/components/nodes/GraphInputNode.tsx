import { useEffect } from "react";
import { Handle, Position, useReactFlow, useEdges } from "reactflow";
import { LogIn } from "lucide-react";

export default function GraphInputNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  const edges = useEdges();

  const inputType = data.inputType || "text";

  useEffect(() => {
    // Find the first outgoing edge from this node
    const outgoingEdge = edges.find(e => e.source === id);
    if (outgoingEdge && outgoingEdge.targetHandle) {
      const autoType = (outgoingEdge.targetHandle.includes('image') || outgoingEdge.targetHandle.includes('img')) ? 'image' : 'text';
      if (autoType !== inputType) {
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, inputType: autoType } } : n));
      }
    }
  }, [edges, id, inputType, setNodes]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, inputType: e.target.value } } : n));
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, pinLabel: e.target.value } } : n));
  };

  const pinColor = inputType === "image" ? "!bg-[#22c55e]" : "!bg-[#3b82f6]";

  return (
    <div className={`w-48 bg-[#1a1525] rounded-lg shadow-xl relative ${
      selected 
        ? "outline outline-2 outline-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.3)]" 
        : "border border-gray-600/50"
    }`}>
      <div className="bg-gray-800/50 px-3 py-2 flex items-center gap-2 border-b border-gray-600/30 rounded-t-lg">
        <LogIn className="w-4 h-4 text-gray-400" />
        <span className="font-bold text-[10px] text-gray-200 uppercase tracking-wider">Graph Input</span>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Pin Label</label>
          <input 
            type="text"
            className="nodrag w-full bg-black/40 text-gray-200 text-xs p-1.5 rounded border border-gray-600/50 focus:border-purple-400 focus:outline-none"
            placeholder="e.g. Reference Image"
            value={data.pinLabel || ""}
            onChange={handleLabelChange}
          />
        </div>
        
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Input Type</label>
          <select 
            className="w-full bg-black/40 text-gray-200 text-xs p-1.5 rounded border border-gray-600/50 focus:border-gray-400 focus:outline-none nodrag"
            value={inputType}
            onChange={handleTypeChange}
          >
            <option value="text">Text (Prompt/Style)</option>
            <option value="image">Image (Reference)</option>
          </select>
        </div>
      </div>

      {/* Output handle for internal connections */}
      <Handle
        type="source"
        position={Position.Right}
        id={inputType} // The source handle emits the selected type
        className={`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !right-[-10px] ${pinColor}`}
      />
    </div>
  );
}

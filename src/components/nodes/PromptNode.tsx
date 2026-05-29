import { Handle, Position, useReactFlow } from "reactflow";
import { MessageSquare } from "lucide-react";

export default function PromptNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  return (
    <div className={`w-64 bg-[#1a1525] rounded-md shadow-xl group transition-all duration-200 ${
      selected 
        ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" 
        : "border-2 border-blue-500/30"
    }`}>
      <div className="bg-blue-900/20 px-3 py-2 flex items-center gap-2 border-b border-blue-500/20 rounded-t-md">
        <MessageSquare className="w-4 h-4 text-blue-400" />
        <span className="font-bold text-xs text-blue-100 uppercase tracking-wider">Prompt Fragment</span>
      </div>
      <div className="p-3">
        <textarea
          className="nodrag w-full bg-[var(--color-blender-input)] text-gray-300 text-sm border border-[var(--color-blender-border)] rounded-sm p-2 focus:outline-none focus:border-[var(--color-blender-accent)] resize-none overflow-hidden"
          placeholder="Enter prompt text..."
          value={data.outputText || data.text || ""}
          maxLength={500}
          rows={3}
          onInput={(e: any) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onChange={(e) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, outputText: e.target.value } } : node
              )
            );
          }}
          ref={(el) => {
            if (el) {
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }
          }}
        />
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

import { Handle, Position, useReactFlow } from "reactflow";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, useRef } from "react";

export default function PromptNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  const [localText, setLocalText] = useState(data.text || "");
  const [isCollapsed, setIsCollapsed] = useState((data.text || "").length > 100);
  const [showToggle, setShowToggle] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync from external data changes (e.g. undo/redo, loading)
  useEffect(() => {
    if (data.text !== undefined && data.text !== localText) {
      setLocalText(data.text);
    }
  }, [data.text]);

  useEffect(() => {
    if (textareaRef.current) {
      // Temporarily set to auto to get true scrollHeight for the content
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      
      if (scrollH > 80) {
        setShowToggle(true);
      } else {
        setShowToggle(false);
        if (isCollapsed) setIsCollapsed(false); // Reset if content deleted
      }

      if (isCollapsed && scrollH > 80) {
        // Clear inline height to let rows={3} dictate the size
        textareaRef.current.style.height = ''; 
      } else {
        // Expand to fit content
        textareaRef.current.style.height = scrollH + 'px';
      }
    }
  }, [localText, isCollapsed]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalText(newVal);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, text: newVal } } : node
      )
    );
  };
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
      <div className="p-4 relative">
        {showToggle && (
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute top-5 right-5 hover:text-white transition-colors bg-[#1a1525] p-0.5 rounded shadow-sm text-gray-400 z-10 border border-blue-500/20"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        )}
        <textarea
          ref={textareaRef}
          className={`nodrag w-full bg-black/40 text-gray-200 text-sm border border-blue-500/20 rounded-sm p-2 ${showToggle ? 'pr-7' : ''} focus:outline-none focus:border-blue-500/60 resize-none overflow-hidden transition-all`}
          placeholder="Enter prompt text..."
          value={localText}
          rows={3}
          onChange={handleChange}
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

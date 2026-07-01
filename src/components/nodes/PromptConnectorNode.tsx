import { useState, useEffect, useCallback } from "react";
import { Handle, Position, useReactFlow, useNodes, useEdges } from "reactflow";
import { Link2, MessageSquare, PlusCircle, ChevronDown, ChevronUp } from "lucide-react";

export default function PromptConnectorNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [collapsedStates, setCollapsedStates] = useState<Record<string, boolean>>({});
  const { setNodes, setEdges } = useReactFlow();
  const nodes = useNodes();
  const allEdges = useEdges();
  
  // Read state directly from React Flow node data (Master Blueprint)
  const handles: string[] = data.handles || ["text-h0", "text-h1"];
  const editableTexts: Record<string, string> = data.editableTexts || { "text-h0": "", "text-h1": "" };
  const everConnected: Record<string, boolean> = data.everConnected || {};

  // 1. Tracking "Ever Connected" status for handles
  useEffect(() => {
    const connectedHandleIds = allEdges
      .filter(e => e.target === id && e.targetHandle !== "text-plus")
      .map(e => e.targetHandle);
    
    let changed = false;
    const nextEver = { ...everConnected };
    connectedHandleIds.forEach(h => {
      if (h && !nextEver[h]) {
        nextEver[h] = true;
        changed = true;
      }
    });
    
    if (changed) {
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, everConnected: nextEver } 
      } : n));
    }
  }, [allEdges, id, everConnected, setNodes]);

  // 2. Handle Auto-Deletion
  useEffect(() => {
    const edges = allEdges.filter(e => e.target === id);
    const connectedHandleIds = edges.map(e => e.targetHandle);

    // Handle removal of disconnected handles
    const nextHandles = handles.filter(h => {
      const isConnected = connectedHandleIds.includes(h);
      const isInitial = h === "text-h0" || h === "text-h1";
      const hasBeenUsed = everConnected[h];
      
      if (isConnected) return true;
      if (isInitial && !hasBeenUsed) return true;
      return false;
    });

    if (nextHandles.length !== handles.length) {
      const nextTexts = { ...editableTexts };
      handles.forEach(h => {
        if (!nextHandles.includes(h)) delete nextTexts[h];
      });

      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, handles: nextHandles, editableTexts: nextTexts } 
      } : n));
    }
  }, [allEdges, id, handles, everConnected, editableTexts, setNodes]);

  const updateEditable = (key: string, text: string) => {
    setNodes(nds => nds.map(n => n.id === id ? { 
      ...n, 
      data: { ...n.data, editableTexts: { ...(n.data.editableTexts || {}), [key]: text } } 
    } : n));
  };

  const getFragmentText = (handleId: string) => {
    const edge = allEdges.find(e => e.target === id && e.targetHandle === handleId);
    if (!edge) return null;
    const node = nodes.find(n => n.id === edge.source);
    return (node?.data as any)?.text || "";
  };

  // Compute final concatenated prompt
  useEffect(() => {
    const parts: string[] = [];
    
    handles.forEach(h => {
      if (editableTexts[h]) parts.push(editableTexts[h]);
      const fragText = getFragmentText(h);
      if (fragText !== null) parts.push(fragText);
    });
    
    const combinedText = parts.filter(t => t).join(" ");
    if (data.text !== combinedText) {
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, text: combinedText } } : n));
    }
  }, [handles, editableTexts, nodes, allEdges, id, setNodes, data.text]);

  const COLORS = [
    'bg-blue-500/20 border-blue-500/50 text-blue-200',
    'bg-emerald-500/20 border-emerald-500/50 text-emerald-200',
    'bg-emerald-500/20 border-emerald-500/50 text-emerald-200',
    'bg-amber-500/20 border-amber-500/50 text-amber-200',
    'bg-rose-500/20 border-rose-500/50 text-rose-200',
  ];

  return (
    <div className={`w-80 bg-[#1a1525] rounded-lg shadow-2xl border-2 transition-all duration-200 relative ${
      selected ? "border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" : "border-blue-500/30"
    }`}>
      <div className="bg-blue-900/20 px-3 py-2 flex items-center justify-between border-b border-blue-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-xs text-blue-100 uppercase tracking-wider">Prompt Connector</span>
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-visible">
        {/* Dynamic Handle Slots */}
        {handles.map((hId, idx) => {
          const fragText = getFragmentText(hId);
          const isConnected = fragText !== null;
          
          return (
            <div key={hId} className="space-y-2 group/slot">
              {/* Per-handle Context Textbox */}
              <textarea
                className="nodrag w-full min-h-[30px] bg-transparent text-gray-400 text-sm p-1 focus:outline-none focus:ring-1 focus:ring-blue-500/30 rounded resize-none placeholder:text-gray-600 overflow-hidden"
                placeholder="Type additional context..."
                value={editableTexts[hId] || ""}
                onInput={(e: any) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onChange={(e) => updateEditable(hId, e.target.value)}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
              />

              {/* Receiver Box */}
              <div className="relative">
                {/* Receiver Handle */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={hId}
                  className={`!min-w-0 !min-h-0 rounded-full !left-[-24px] transition-all duration-200 ${isConnected ? "!scale-110" : ""}`} style={{ width: '16px', height: '16px', backgroundColor: '#3b82f6', borderColor: '#1e3a8a', borderWidth: '2px', top: '50%', transform: 'translateY(-50%)' }}
                  title={`Input ${hId}`}
                />

                {isConnected ? (
                  <div className={`relative px-3 py-2.5 rounded-lg border text-xs font-medium leading-relaxed shadow-sm transition-all ${COLORS[idx % COLORS.length]}`}>
                    <div className="flex items-center justify-between mb-1 opacity-60">
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        <span>Linked Fragment</span>
                      </div>
                      {fragText && fragText.length > 100 && (
                        <button 
                          onClick={() => setCollapsedStates(prev => ({ ...prev, [hId]: !prev[hId] }))}
                          className="absolute top-1 right-1 hover:text-white transition-colors bg-[#1a1525]/80 p-0.5 rounded shadow-sm"
                        >
                          {collapsedStates[hId] === false ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    <div className={`leading-snug ${collapsedStates[hId] !== false ? "max-h-12 overflow-hidden" : ""}`}>
                      {fragText || <span className="italic opacity-40 text-[10px]">No text content...</span>}
                    </div>
                  </div>
                ) : (
                  <div className="h-16 w-full bg-[#1b253b] rounded-xl border border-blue-500/10 shadow-inner"></div>
                )}
              </div>
            </div>
          );
        })}

        {/* The "+" Spawner Handle */}
        <div className="relative h-6 mt-2">
          <Handle
            type="target"
            position={Position.Left}
            id="text-plus"
            className="!min-w-0 !min-h-0 rounded-full !left-[-24px] cursor-crosshair hover:scale-110 transition-transform shadow-md !flex items-center justify-center"
            style={{ width: '16px', height: '16px', backgroundColor: '#3b82f6', borderColor: '#1e3a8a', borderWidth: '2px', top: '50%', transform: 'translateY(-50%)' }}
            title="Drop wire here to add a new input"
          >
            <span className="text-[#121826] font-black text-[14px] leading-none mt-[-1px]">+</span>
          </Handle>
        </div>
      </div>

      {/* Main Output Handle */}
      <Handle type="source" position={Position.Right} id="text" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#3b82f6', borderColor: '#1e3a8a', borderWidth: '2px' }} />
    </div>
  );
}

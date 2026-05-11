import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useNodes, useEdges } from "reactflow";
import { Search, RefreshCw, Image as ImageIcon, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { explainImage } from "@/lib/plenxai";

export default function ImageExplainedNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainedText, setExplainedText] = useState<string>(data.explainedText || "");
  const [showRawRequest, setShowRawRequest] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const allEdges = useEdges();

  const handles: string[] = data.imageInputs || ["image-0"];
  const everConnected: Record<string, boolean> = data.everConnected || {};

  // 1. Tracking "Ever Connected" status for handles
  useEffect(() => {
    const connectedHandleIds = allEdges
      .filter(e => e.target === id && e.targetHandle !== "image-plus")
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

    const nextHandles = handles.filter(h => {
      const isConnected = connectedHandleIds.includes(h);
      const isInitial = h === "image-0";
      const hasBeenUsed = everConnected[h];
      
      if (isConnected) return true;
      if (isInitial && !hasBeenUsed) return true;
      return false;
    });

    if (nextHandles.length !== handles.length) {
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, imageInputs: nextHandles } 
      } : n));
    }
  }, [allEdges, id, handles, everConnected, setNodes]);

  const getFragmentImage = (handleId: string) => {
    const edge = allEdges.find(e => e.target === id && e.targetHandle === handleId);
    if (!edge) return null;
    const node = nodes.find(n => n.id === edge.source) as any;
    if (!node) return null;
    return node.data.image || node.data.referenceImage || node.data.bakedImage || node.data.imageUrl || null;
  };

  const activeImages = handles.map(h => getFragmentImage(h)).filter(img => img);
  
  const generatedPrompt = `Describe what is going on in these ${Math.max(1, activeImages.length)} image(s) in detail. Focus on composition, character/object detail, and storytelling should any of these elements be present in the image. You must write approximately 1000 characters for each image.`;

  const handleExplain = async () => {
    const apiKey = localStorage.getItem("artist-assistant-image-api");
    if (!apiKey) {
      alert("Please enter PlenxAI API Key in Settings.");
      return;
    }

    if (activeImages.length === 0) {
      alert("No input image found to explain.");
      return;
    }

    setIsExplaining(true);
    try {
      const response = await explainImage(apiKey, activeImages, generatedPrompt);
      if (response.success) {
        setExplainedText(response.text);
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, text: response.text, explainedText: response.text } 
        } : n));
      } else {
        alert("Explanation failed: " + (response.error || response.message || JSON.stringify(response)));
      }
    } catch (error) {
      alert("Error calling Gemini API.");
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div className={`w-80 bg-[#1a1525] rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all duration-200 relative ${
      selected 
        ? "outline outline-5 outline-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,0.6)] border-transparent" 
        : "border-2 border-emerald-500/50"
    }`}>
      <div className="bg-emerald-900/40 px-3 py-2 flex items-center justify-between border-b border-emerald-500/30 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Image Analyzer</span>
        </div>
        {isExplaining && <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />}
      </div>

      <div className="p-3 space-y-4">
        {/* Dynamic Handle Slots */}
        {handles.map((hId, idx) => {
          const fragImg = getFragmentImage(hId);
          const isConnected = fragImg !== null;
          
          return (
            <div key={hId} className="relative group/slot">
              {/* Receiver Handle */}
              <Handle
                type="target"
                position={Position.Left}
                id={hId}
                className={`!w-4 !h-4 !bg-[#22c55e] !border-none !min-w-0 !min-h-0 !left-[-22px] transition-all duration-200 ${
                  isConnected ? "!scale-110" : ""
                }`}
                style={{ top: "50%", transform: "translateY(-50%)" }}
                title={`Image Input ${hId}`}
              />

              {isConnected ? (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 shadow-sm text-emerald-200">
                  <div className="flex items-center gap-2 opacity-80">
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-xs font-medium">Linked Image</span>
                  </div>
                  <div className="w-8 h-8 rounded bg-black/40 border border-emerald-500/20 overflow-hidden flex items-center justify-center">
                    {/* Tiny thumbnail preview if it's base64 or URL */}
                    {fragImg && typeof fragImg === 'string' && (fragImg.startsWith('data:') || fragImg.startsWith('http')) ? (
                      <img src={fragImg} alt="preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-full h-full p-2 opacity-30" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-10 w-full bg-[#141b22] rounded-xl border border-emerald-500/10 shadow-inner flex items-center px-3">
                  <span className="text-xs text-emerald-100/30 italic">Connect an image...</span>
                </div>
              )}
            </div>
          );
        })}

        {/* The "+" Spawner Handle */}
        <div className="relative h-6 mt-2">
          <Handle
            type="target"
            position={Position.Left}
            id="image-plus"
            className="!w-5 !h-5 !bg-[#22c55e] !border-none !flex !items-center !justify-center !min-w-0 !min-h-0 !left-[-24px] cursor-crosshair hover:scale-110 transition-transform shadow-md"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
            title="Drop wire here to add a new image input"
          >
            <span className="text-[#1a1525] font-black text-lg leading-none mt-[-2px] ml-[1px]">+</span>
          </Handle>
        </div>

        {/* Raw Request Toggle */}
        <div className="flex justify-end">
          <button 
            onClick={() => setShowRawRequest(!showRawRequest)}
            className="text-[10px] text-emerald-400/70 hover:text-emerald-300 flex items-center gap-1 transition-colors"
          >
            {showRawRequest ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showRawRequest ? "Hide API Prompt" : "Show API Prompt"}
          </button>
        </div>

        {showRawRequest && (
          <div className="bg-black/60 border border-emerald-500/30 rounded p-2 text-[10px] text-emerald-100/80 font-mono overflow-auto max-h-32">
            <div className="mb-1 text-emerald-400 font-bold">Prompt to PlenxAI:</div>
            {generatedPrompt}
            <div className="mt-1 text-emerald-400/50">Number of images: {activeImages.length}</div>
          </div>
        )}

        <div className="relative group">
          <div className={`min-h-[80px] bg-black/40 border border-emerald-500/20 rounded p-2 text-xs text-emerald-100/70 italic whitespace-pre-wrap ${isCollapsed ? "max-h-32 overflow-hidden" : ""}`}>
            {explainedText || "Click Explain to analyze the images..."}
          </div>
          {explainedText && explainedText.length > 200 && (
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="absolute top-1 right-1 text-emerald-400 hover:text-emerald-300 transition-colors bg-[#1a1525]/80 p-0.5 rounded shadow-sm"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>

        <button 
          onClick={handleExplain}
          disabled={isExplaining}
          className="nodrag w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        >
          {isExplaining ? "Analyzing..." : "EXPLAIN IMAGE"}
        </button>
      </div>

      {/* Output - Text */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0"
      />
    </div>
  );
}

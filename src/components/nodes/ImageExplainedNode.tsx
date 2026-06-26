import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Search, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { TEXT_MODELS } from "@/lib/plenxai";
import { GOOGLE_MODELS } from "@/lib/gemini";

export default function ImageExplainedNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [isExplaining, setIsExplaining] = useState(false);
  const [text, setText] = useState<string>(data.text || "");
  const [showRawRequest, setShowRawRequest] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(data.model || "gemini-2.5-flash");
  const [wordCountLimit, setWordCountLimit] = useState<number>(data.wordCountLimit || 500);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [textProvider, setTextProvider] = useState<"plenxai" | "google">("plenxai");
  
  const { setNodes, getNodes, getEdges } = useReactFlow();

  useEffect(() => {
    setTextProvider((localStorage.getItem("artist-assistant-text-provider") as any) || "plenxai");
    const handleProviderChange = (e: any) => setTextProvider(e.detail);
    window.addEventListener("text-provider-changed", handleProviderChange);
    return () => window.removeEventListener("text-provider-changed", handleProviderChange);
  }, []);

  const activeModels = textProvider === "google" ? GOOGLE_MODELS : TEXT_MODELS;

  const handleWordCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    setWordCountLimit(val);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, wordCountLimit: val } } : n));
  };

  const handleExplain = async () => {
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    
    const imageInputs: string[] = [];
    
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      
      if (edge.targetHandle === 'image') {
        const image = sourceNode.data.image || sourceNode.data.imageUrl || sourceNode.data.image || sourceNode.data.referenceImage || sourceNode.data.bakedImage;
        if (image) imageInputs.push(image);
        if (sourceNode.data.images && Array.isArray(sourceNode.data.images)) {
          imageInputs.push(...sourceNode.data.images);
        }
      }
    });

    if (imageInputs.length === 0) {
      alert("Please connect an image first.");
      return;
    }

    setIsExplaining(true);
    try {
      const { executeImageExplainedNode } = await import("@/lib/node-executor");
      const result = await executeImageExplainedNode(
        { ...data, model: selectedModel, wordCountLimit }, 
        { textInputs: [], imageInputs }, 
        {}
      );

      if (result.success && result.data?.text) {
        setText(result.data.text);
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, text: result.data.text } 
        } : n));
      } else {
        alert("Explanation failed: " + result.error);
      }
    } catch (error) {
      alert("Error calling Gemini executor.");
    } finally {
      setIsExplaining(false);
    }
  };

  const generatedPrompt = `Describe what is going on in these image(s) in detail. Focus on composition, character/object detail, and storytelling should any of these elements be present in the image. You must write approximately ${wordCountLimit} words for each image.`;

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
        {/* Top Panel: Inputs */}
        <div className="flex flex-col gap-1 pb-1">
          <div className="relative flex items-center h-6">
            <Handle
              type="target"
              id="image"
              position={Position.Left}
              className="!w-4 !h-4 !bg-[#22c55e] !border-none !min-w-0 !min-h-0 !left-[-24px]"
            />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Image Input</span>
          </div>
        </div>

        {/* Model Selection */}
        <div className="relative z-20">
          <label className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-bold mb-1 block">Generative Model</label>
          <button 
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="nodrag w-full bg-black/40 border border-emerald-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-emerald-500/40 transition-colors"
          >
            <span className="text-xs text-emerald-100 font-medium">
              {activeModels.find(m => m.id === selectedModel)?.name || "Select Model"}
            </span>
            <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isModelMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-emerald-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in z-30">
              {activeModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setIsModelMenuOpen(false);
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, model: m.id } } : n));
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-emerald-600/20 ${
                    selectedModel === m.id ? 'text-emerald-400 font-bold bg-emerald-600/10' : 'text-emerald-100/70'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Word Count Limit */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-bold mb-1 block">Word Count Limit</label>
          <input 
            type="number"
            value={wordCountLimit}
            onChange={handleWordCountChange}
            className="nodrag w-full bg-black/40 text-emerald-100 text-xs border border-emerald-500/20 rounded px-3 py-2 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
        </div>

        {/* Raw Request Toggle */}
        <div className="flex justify-end mt-2">
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
          </div>
        )}

        <div className="relative group">
          <div className={`min-h-[80px] bg-black/40 border border-emerald-500/20 rounded p-2 text-xs text-emerald-100/70 italic whitespace-pre-wrap ${isCollapsed ? "max-h-32 overflow-hidden" : ""}`}>
            {text || "Click Explain to analyze the images..."}
          </div>
          {text && text.length > 200 && (
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
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0 !right-[-10px]"
      />
    </div>
  );
}

import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { fetchNodePrompt, TEXT_MODELS } from "@/lib/plenxai";
import { GOOGLE_MODELS } from "@/lib/gemini";
import { generateTextUniversal } from "@/lib/llm-router";

export default function GeminiRefinerNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [isRefining, setIsRefining] = useState(false);
  const [outputText, setOutputText] = useState<string>(data.outputText || data.refinedText || "");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(data.model || "gemini-2.5-flash");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [textProvider, setTextProvider] = useState<"plenxai" | "google">("plenxai");
  const { getNodes, getEdges, setNodes } = useReactFlow();

  useEffect(() => {
    setTextProvider((localStorage.getItem("artist-assistant-text-provider") as any) || "plenxai");
    const handleProviderChange = (e: any) => setTextProvider(e.detail);
    window.addEventListener("text-provider-changed", handleProviderChange);
    return () => window.removeEventListener("text-provider-changed", handleProviderChange);
  }, []);

  const activeModels = textProvider === "google" ? GOOGLE_MODELS : TEXT_MODELS;

  const handleRefine = async () => {
    // Gather inputs connected to this node
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    
    const textInputs: string[] = [];
    const imageInputs: string[] = [];
    
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      
      if (edge.targetHandle === 'text') {
        const text = sourceNode.data.outputText || sourceNode.data.text || sourceNode.data.bakedStyle || "";
        if (text) textInputs.push(text);
      } else if (edge.targetHandle === 'image') {
        const image = sourceNode.data.outputImage || sourceNode.data.imageUrl || sourceNode.data.image || sourceNode.data.referenceImage || sourceNode.data.bakedImage;
        if (image) imageInputs.push(image);
        if (sourceNode.data.images && Array.isArray(sourceNode.data.images)) {
          imageInputs.push(...sourceNode.data.images);
        }
      }
    });

    setIsRefining(true);
    
    // Import dynamically to avoid circular dependencies if any, or just import at top.
    // Wait, let's just use the executor directly. We should import it at the top of the file.
    try {
      const { executeGeminiRefinerNode } = await import("@/lib/node-executor");
      const result = await executeGeminiRefinerNode(
        { ...data, model: selectedModel }, 
        { textInputs, imageInputs }, 
        {}
      );
      
      if (result.success && result.data?.outputText) {
        setOutputText(result.data.outputText);
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, outputText: result.data.outputText } 
        } : n));
      } else {
        alert("Refinement failed: " + result.error);
      }
    } catch (error) {
      alert("Error calling Gemini executor.");
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all duration-200 ${
      selected 
        ? "outline outline-5 outline-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,0.6)] border-transparent" 
        : "border-2 border-emerald-500/50"
    }`}>
      <div className="bg-emerald-900/40 px-4 py-3 flex items-center justify-between border-b border-emerald-500/30 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Gemini Refiner</span>
        </div>
        {isRefining && <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />}
      </div>

      <div className="p-4 space-y-3">
        {/* Top Panel: Inputs */}
        <div className="flex flex-col gap-1 pb-1">
          <div className="relative flex items-center h-6">
            <Handle
              type="target"
              id="text"
              position={Position.Left}
              className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0 !left-[-24px]"
            />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Prompt Input</span>
          </div>
          <div className="relative flex items-center h-6">
            <Handle
              type="target"
              id="image"
              position={Position.Left}
              className="!w-4 !h-4 !bg-[#22c55e] !border-none !min-w-0 !min-h-0 !left-[-24px]"
            />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Reference Image</span>
          </div>
        </div>

        <div className="relative group">
          <div className={`min-h-[80px] bg-black/40 border border-emerald-500/20 rounded p-2 text-xs text-emerald-100/70 italic ${isCollapsed ? "max-h-24 overflow-hidden" : ""}`}>
            {outputText || "Connect Prompt/Style nodes and click Refine to polish your prompt..."}
          </div>
          {outputText && outputText.length > 150 && (
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="absolute top-1 right-1 text-emerald-400 hover:text-emerald-300 transition-colors bg-[#1a1525]/80 p-0.5 rounded shadow-sm"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>

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

        <button 
          onClick={handleRefine}
          disabled={isRefining}
          className="nodrag w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        >
          {isRefining ? "Polishing..." : "REFINE PROMPT"}
        </button>

      </div>

      {/* Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0 !right-[-10px]"
      />
    </div>
  );
}

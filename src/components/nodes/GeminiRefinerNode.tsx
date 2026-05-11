import { useState } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Sparkles, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { generateText, fetchNodePrompt } from "@/lib/plenxai";

export default function GeminiRefinerNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinedText, setRefinedText] = useState<string>(data.refinedText || "");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const handleRefine = async () => {
    const apiKey = localStorage.getItem("artist-assistant-image-api");
    if (!apiKey) {
      alert("Please enter PlenxAI API Key in Settings.");
      return;
    }

    // Gather inputs connected to this node
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    
    let promptParts: string[] = [];
    let imageRefs: string[] = [];
    
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      
      if (edge.targetHandle === 'text') {
        const text = sourceNode.data.text || sourceNode.data.bakedStyle || "";
        if (text) promptParts.push(text);
      } else if (edge.targetHandle === 'image') {
        const image = sourceNode.data.imageUrl || sourceNode.data.image || sourceNode.data.referenceImage || sourceNode.data.bakedImage;
        if (image) imageRefs.push(image);
        if (sourceNode.data.images && Array.isArray(sourceNode.data.images)) {
          imageRefs.push(...sourceNode.data.images);
        }
      }
    });

    const rawPrompt = promptParts.join(", ");
    if (!rawPrompt) {
      alert("No input text found to refine.");
      return;
    }

    setIsRefining(true);
    try {
      let systemPrompt = await fetchNodePrompt('GeminiRefinerNode');
      if (!systemPrompt) systemPrompt = `You are a prompt engineer. Refine the user's raw idea into a high-quality, detailed prompt for AI image generation. Output ONLY the refined prompt text.\n\nUser Input:\n{prompt}`;
      
      const finalPrompt = systemPrompt.replace('{prompt}', rawPrompt);

      const response = await generateText(apiKey, finalPrompt, imageRefs.length > 0 ? imageRefs : undefined);
      if (response.success) {
        setRefinedText(response.text);
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, refinedText: response.text } 
        } : n));
      } else {
        alert("Refinement failed: " + (response.error || response.message || JSON.stringify(response)));
      }
    } catch (error) {
      alert("Error calling Gemini API.");
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all duration-200 ${
      selected 
        ? "outline outline-5 outline-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,0.6)] border-transparent" 
        : "border-2 border-purple-500/50"
    }`}>
      <div className="bg-purple-900/40 px-4 py-3 flex items-center justify-between border-b border-purple-500/30 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="font-bold text-xs text-purple-100 uppercase tracking-wider">Gemini Refiner</span>
        </div>
        {isRefining && <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />}
      </div>

      <div className="p-4 space-y-3">
        <div className="relative group">
          <div className={`min-h-[80px] bg-black/40 border border-purple-500/20 rounded p-2 text-xs text-purple-100/70 italic ${isCollapsed ? "max-h-24 overflow-hidden" : ""}`}>
            {refinedText || "Connect Prompt/Style nodes and click Refine to polish your prompt..."}
          </div>
          {refinedText && refinedText.length > 150 && (
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="absolute top-1 right-1 text-purple-400 hover:text-purple-300 transition-colors bg-[#1a1525]/80 p-0.5 rounded shadow-sm"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>

        <button 
          onClick={handleRefine}
          disabled={isRefining}
          className="nodrag w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        >
          {isRefining ? "Polishing..." : "REFINE PROMPT"}
        </button>
      </div>

      {/* Inputs */}
      <Handle
        type="target"
        id="text"
        position={Position.Left}
        style={{ top: '30%' }}
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0"
      />
      <Handle
        type="target"
        id="image"
        position={Position.Left}
        style={{ top: '70%' }}
        className="!w-4 !h-4 !bg-[#22c55e] !border-none !min-w-0 !min-h-0"
      />

      {/* Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0"
      />
    </div>
  );
}

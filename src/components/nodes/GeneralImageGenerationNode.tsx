import { useState, useCallback, useEffect } from "react";
import { Handle, Position, useReactFlow, useUpdateNodeInternals, useEdges } from "reactflow";
import { ImageDown, RefreshCw, Play, AlertCircle, Download, Plus, ChevronDown } from "lucide-react";
import { queueImageGen, getTaskStatus, uploadMediaDirect } from "@/lib/plenxai";

const MODELS = [
  { id: "nano-banana-pro", name: "Nano Banana PRO" },
  { id: "nano-banana-full", name: "Nano Banana Full" },
  { id: "nano-banana-2", name: "Nano Banana 2" },
  { id: "kling-o1-image", name: "Kling O1 Image" },
  { id: "flux-2-pro", name: "Flux 2 Pro" },
  { id: "seedream-5-lite", name: "Seedream 5 Lite" },
  { id: "seedream-4-5", name: "Seedream 4.5" },
  { id: "grok-image", name: "Grok Image" },
  { id: "gpt-image-2", name: "GPT Image 2" }
];

export default function GeneralImageGenerationNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "queueing" | "polling" | "succeeded" | "failed">("idle");
  const [image, setImage] = useState<string | null>(data.image || null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunHash, setLastRunHash] = useState<string>(data.lastRunHash || "");
  const [selectedModel, setSelectedModel] = useState<string>(data.model || MODELS[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [localPrompt, setLocalPrompt] = useState<string>(data.localPrompt || "");
  const imageInputs: string[] = data.imageInputs || ["image-0"];
  
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const allEdges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const incomingTextEdge = allEdges.find(e => e.target === id && e.targetHandle === 'text');
  const hasTextConnection = !!incomingTextEdge;
  const incomingNode = incomingTextEdge ? getNodes().find(n => n.id === incomingTextEdge.source) : null;
  const incomingText = incomingNode ? (incomingNode.data.text || incomingNode.data.outputText || "") : "";
  const displayPrompt = hasTextConnection ? incomingText : localPrompt;

  // Notify React Flow to recalculate handle positions whenever the number of handles changes
  useEffect(() => {
    updateNodeInternals(id);
  }, [imageInputs.length, id, updateNodeInternals]);
  
  // Auto-cleanup disconnected image handles
  useEffect(() => {
    const connectedHandles = allEdges
      .filter(e => e.target === id)
      .map(e => e.targetHandle);
      
    const nextInputs = imageInputs.filter(h => {
      // Keep if it's connected
      if (connectedHandles.includes(h)) return true;
      // Keep the initial handle if nothing is connected to it to provide an empty slot
      if (h === "image-0" && !connectedHandles.includes(h)) return true;
      return false;
    });
    
    if (nextInputs.length !== imageInputs.length) {
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, imageInputs: nextInputs } } : n));
    }
  }, [allEdges, id, imageInputs, setNodes]);

  const generateImage = async () => {
    // 1. Gather Inputs
    const nodes = getNodes();
    const edges = getEdges();
    
    // Find all nodes connected to our input handles
    const incomingEdges = edges.filter(e => e.target === id);
    
    let hasTextConnectionGen = false;
    let incomingTextInput = "";
    const imageInputsGen: string[] = [];

    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;

      if (edge.targetHandle === 'text') {
        hasTextConnectionGen = true;
        incomingTextInput = sourceNode.data.text || sourceNode.data.outputText || "";
      } else if (edge.targetHandle?.startsWith('image-') || edge.targetHandle?.startsWith('img-')) {
        const image = sourceNode.data.image || sourceNode.data.outputImage || sourceNode.data.referenceImage || sourceNode.data.bakedImage;
        if (image) imageInputsGen.push(image);
        if (sourceNode.data.images && Array.isArray(sourceNode.data.images)) {
          imageInputsGen.push(...sourceNode.data.images);
        }
      }
    });

    const finalPrompt = hasTextConnectionGen ? incomingTextInput : localPrompt;
    const currentHash = JSON.stringify({ prompt: finalPrompt, images: imageInputsGen, model: selectedModel });

    // 2. Change Detection
    if (status === 'succeeded' && currentHash === lastRunHash && image) {
      console.log("No changes detected, skipping API call.");
      return;
    }

    // 3. API Call
    const apiKey = localStorage.getItem("artist-assistant-image-api");
    if (!apiKey) {
      setError("Please enter PlenxAI API Key in Settings.");
      setStatus("failed");
      return;
    }

    if (!finalPrompt) {
      setError("No prompt detected. Connect a Prompt or Style node.");
      setStatus("failed");
      return;
    }

    setStatus("queueing");
    setError(null);

    try {
      const { executeGeneralImageGenerationNode } = await import("@/lib/node-executor");
      const result = await executeGeneralImageGenerationNode(
        { ...data, model: selectedModel },
        { textInputs: [finalPrompt], imageInputs: imageInputsGen },
        { apiKey }
      );

      if (result.success && result.data?.image) {
        setImage(result.data.image);
        setStatus("succeeded");
        setLastRunHash(currentHash);
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, image: result.data.image, lastRunHash: currentHash } 
        } : n));
      } else {
        setError(result.error || "Generation failed on server.");
        setStatus("failed");
      }
    } catch (err) {
      setError("Network or execution error.");
      setStatus("failed");
    }
  };


  return (
    <div className={`w-80 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected 
        ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" 
        : "border-2 border-amber-500/30"
    }`}>
      <div className="bg-amber-900/20 px-4 py-3 flex items-center justify-between border-b border-amber-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <ImageDown className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-xs text-amber-100 uppercase tracking-wider">General Image Generation</span>
        </div>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold animate-pulse">{status}</span>
          </div>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        {/* Prompt Input */}
        <div className="relative pb-2">
          <Handle type="target" position={Position.Left} id="text" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#3b82f6', borderColor: '#1e3a8a', borderWidth: '2px' }} />
          {!hasTextConnection ? (
            <textarea
              className="nodrag text-xs w-full bg-black/40 text-gray-200 p-2 rounded border border-blue-500/20 focus:border-blue-500/60 focus:outline-none resize-none"
              placeholder="e.g. 'A futuristic city, neon lights'"
              rows={2}
              value={localPrompt}
              onChange={(e) => {
                setLocalPrompt(e.target.value);
                setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, localPrompt: e.target.value } } : n));
              }}
            />
          ) : (
            <div className="flex items-center h-6">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Prompt Input</span>
            </div>
          )}
        </div>

        {/* Top/Middle: Handles List */}
        <div className="flex flex-col gap-1 pb-1">
          {(() => {
            const handlesToRender = [
              ...imageInputs.map(id => ({ id, color: '#22c55e', isPlus: false })), // Green for images
            ];
            
            // Only show '+' if under 4 images
            if (imageInputs.length < 4) {
              handlesToRender.push({ id: 'image-plus', color: '#22c55e', isPlus: true });
            }

            return handlesToRender.map((h, i) => {
              if (h.isPlus) {
                return (
                  <div key={h.id} className="relative flex items-center h-6 mt-1">
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={h.id}
                      className="!min-w-0 !min-h-0 rounded-full !left-[-24px] cursor-crosshair hover:scale-110 transition-transform shadow-md !flex items-center justify-center"
                      style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }}
                      title="Drop wire here to add a new image input"
                    >
                      <span className="text-[#151b25] font-black text-[14px] leading-none mt-[-1px]">+</span>
                    </Handle>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Add Image</span>
                  </div>
                );
              }

              return (
                <div key={h.id} className="relative flex items-center h-6">
                  <Handle
                    type="target"
                    id={h.id}
                    position={Position.Left}
                    className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: h.color, borderColor: '#14532d', borderWidth: '2px' }}
                  />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                    Reference Image
                  </span>
                </div>
              );
            });
          })()}
        </div>

        {/* Model Selection UI */}
        <div className="relative z-20">
          <label className="text-[10px] uppercase tracking-wider text-blue-400/60 font-bold mb-1 block">Generative Model</label>
          <button 
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="nodrag w-full bg-black/40 border border-blue-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-blue-500/40 transition-colors"
          >
            <span className="text-xs text-blue-100 font-medium">
              {MODELS.find(m => m.id === selectedModel)?.name || "Select Model"}
            </span>
            <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isModelMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-blue-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setIsModelMenuOpen(false);
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, model: m.id } } : n));
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-blue-600/20 ${
                    selectedModel === m.id ? 'text-blue-400 font-bold bg-blue-600/10' : 'text-blue-100/70'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Bottom Panel: Image Preview */}
        <div className="w-full bg-black/50 border border-blue-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative group">
          {image ? (
            <>
              <img src={image} className="w-full h-full object-contain" alt="generated" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <a
                  href={image}
                  download={`generated-${id}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-xl transition-transform hover:scale-105 pointer-events-auto"
                >
                  <Download className="w-6 h-6" />
                </a>
              </div>
            </>
          ) : (
            <>
              {(status === 'queueing' || status === 'polling') ? (
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              ) : (
                <RefreshCw className="w-8 h-8 mb-2 opacity-20 text-blue-500" />
              )}
              <span className="text-sm font-medium text-blue-200/40">
                {status === 'idle' ? 'Awaiting Generation' : status === 'failed' ? 'Error' : 'Generating...'}
              </span>
            </>
          )}
          
          {error && (
            <div className="absolute inset-x-0 bottom-0 bg-red-900/80 p-2 flex items-start gap-2 border-t border-red-500/50">
              <AlertCircle className="w-4 h-4 text-red-200 shrink-0 mt-0.5" />
              <span className="text-[10px] text-red-100">{error}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={generateImage}
            disabled={status === 'queueing' || status === 'polling'}
            style={{ backgroundColor: '#d97706', borderColor: '#92400e' }}
            className="nodrag w-full py-2.5 border-b-4 active:border-b-0 active:translate-y-1 text-white text-sm font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            GENERATE
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image-out" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
    </div>
  );
}

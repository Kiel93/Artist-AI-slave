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

export default function PlenxAIOutputNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "queueing" | "polling" | "succeeded" | "failed">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(data.resultUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunHash, setLastRunHash] = useState<string>(data.lastRunHash || "");
  const [selectedModel, setSelectedModel] = useState<string>(data.model || MODELS[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const imageInputs: string[] = data.imageInputs || ["image-0"];
  
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const allEdges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();

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
    
    let promptParts: string[] = [];
    let imageRefs: string[] = [];

    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;

      if (edge.targetHandle === 'text') {
        const text = sourceNode.data.refinedText || sourceNode.data.text || sourceNode.data.bakedStyle || "";
        if (text) promptParts.push(text);
      } else if (edge.targetHandle?.startsWith('image-') || edge.targetHandle?.startsWith('img-')) {
        const image = sourceNode.data.imageUrl || sourceNode.data.image || sourceNode.data.referenceImage || sourceNode.data.bakedImage;
        if (image) imageRefs.push(image);
        // Also handle StyleInsertNode or bulk images if connected to an image handle
        if (sourceNode.data.images && Array.isArray(sourceNode.data.images)) {
          imageRefs.push(...sourceNode.data.images);
        }
      }
    });

    const finalPrompt = promptParts.join(", ");
    const currentHash = JSON.stringify({ prompt: finalPrompt, images: imageRefs, model: selectedModel });

    // 2. Change Detection
    if (status === 'succeeded' && currentHash === lastRunHash && resultUrl) {
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

    const base64Images = imageRefs.filter(img => img.startsWith('data:image'));
    const urlImages = [...imageRefs.filter(img => !img.startsWith('data:image'))];

    try {
      // Upload base64 images first
      if (base64Images.length > 0) {
        console.log(`Uploading ${base64Images.length} base64 images to PlenxAI...`);
        for (const base64 of base64Images) {
          try {
            const uploadRes = await uploadMediaDirect(apiKey, base64);
            if (uploadRes.success && (uploadRes.url || uploadRes.cdn_url)) {
              urlImages.push(uploadRes.url || uploadRes.cdn_url);
            } else {
              console.warn("Image upload failed:", uploadRes.error);
            }
          } catch (uploadErr) {
            console.error("Error uploading image:", uploadErr);
          }
        }
      }

      const response = await queueImageGen(apiKey, {
        prompt: finalPrompt,
        model: selectedModel,
        references_urls: urlImages.length > 0 ? urlImages : undefined
      });

      if (response.success && response.task_id) {
        setLastRunHash(currentHash);
        startPolling(response.task_id, apiKey, currentHash);
      } else {
        setError(response.error || "Failed to queue generation.");
        setStatus("failed");
      }
    } catch (err) {
      setError("Network error.");
      setStatus("failed");
    }
  };

  const startPolling = async (taskId: string, apiKey: string, currentHash: string) => {
    setStatus("polling");
    
    const poll = async () => {
      try {
        const res = await getTaskStatus(apiKey, taskId);
        console.log("Polling status:", res);
        
        const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
        
        if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
          const finalUrl = res.result_url || (res as any).url || (res as any).image_url;
          setResultUrl(finalUrl);
          setStatus("succeeded");
          // Save to node data
          setNodes(nds => nds.map(n => n.id === id ? { 
            ...n, 
            data: { ...n.data, resultUrl: finalUrl, lastRunHash: currentHash } 
          } : n));
          return true;
        } else if (res.status === 'failed' || (res.status as string) === 'error') {
          setError((res as any).error || (res as any).message || "Generation failed on server.");
          setStatus("failed");
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(interval);
    }, 3000);
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
          <span className="font-bold text-xs text-amber-100 uppercase tracking-wider">PlenxAI Output</span>
        </div>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold animate-pulse">{status}</span>
          </div>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        {/* Top/Middle: Handles List */}
        <div className="flex flex-col gap-1 pb-1">
          {(() => {
            const handlesToRender = [
              { id: 'text', color: '#3b82f6', isPlus: false }, // Blue for text
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
                      className="!w-5 !h-5 !bg-[#22c55e] !border-none !flex !items-center !justify-center !min-w-0 !min-h-0 cursor-crosshair hover:scale-110 transition-transform shadow-md !left-[-24px]"
                      title="Drop wire here to add a new image input"
                    >
                      <span className="text-[#151b25] font-black text-lg leading-none mt-[-2px] ml-[1px]">+</span>
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
                    style={{ backgroundColor: h.color }}
                    className={`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !left-[-24px]`}
                  />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                    {h.id === 'text' ? 'Prompt Input' : `Reference Image`}
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
        <div className="w-full aspect-square bg-black/50 border border-blue-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative">
          {resultUrl ? (
            <img src={resultUrl} className="w-full h-full object-contain" alt="generated" />
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
            className="nodrag flex-[2] py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            GENERATE
          </button>
          {resultUrl && (
            <a 
              href={resultUrl} 
              target="_blank" 
              rel="noreferrer"
              className="nodrag flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded flex items-center justify-center"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

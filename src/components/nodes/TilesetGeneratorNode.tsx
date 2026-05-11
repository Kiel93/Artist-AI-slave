import { useState, useCallback, useEffect } from "react";
import { Handle, Position, useReactFlow, useUpdateNodeInternals, useEdges } from "reactflow";
import { ImageIcon, RefreshCw, Play, AlertCircle, Download, ChevronDown, Eye } from "lucide-react";
import { queueImageGen, getTaskStatus, uploadMediaDirect, fetchNodePrompt } from "@/lib/plenxai";

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

export default function TilesetGeneratorNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "queueing" | "polling" | "succeeded" | "failed">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(data.resultUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunHash, setLastRunHash] = useState<string>(data.lastRunHash || "");
  const [selectedModel, setSelectedModel] = useState<string>(data.model || MODELS[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [localPrompt, setLocalPrompt] = useState<string>(data.localPrompt || "");
  const [showApiPrompt, setShowApiPrompt] = useState(false);
  const [apiPromptPreview, setApiPromptPreview] = useState<string>(data.apiPromptPreview || "");
  
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const generateImage = async () => {
    // Gather Inputs
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    
    let promptParts: string[] = [];
    if (localPrompt) promptParts.push(localPrompt);

    let inputImageUrl = "";

    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      if (edge.targetHandle === 'text') {
        const text = sourceNode.data.refinedText || sourceNode.data.text || sourceNode.data.bakedStyle || "";
        if (text) promptParts.push(text);
      }
      if (edge.targetHandle === 'image') {
        inputImageUrl = sourceNode.data.imageUrl || sourceNode.data.resultUrl || sourceNode.data.image || "";
      }
    });

    const finalPrompt = promptParts.join(", ");
    let systemConstraint = await fetchNodePrompt('TilesetGeneratorNode');
    if (!systemConstraint) {
      systemConstraint = " (CRUCIAL INSTRUCTION: You must strictly adhere to the exact 3D geometry and isometric silhouette of the provided reference blueprint image. Do not alter the outer shape or boundaries. Render the complete island consisting of 13 tokenized tiles and the standalone reference cube. The output must match the reference aspect ratio exactly. DO NOT add padding or borders. Additionally: 1. The top ground surface of the tiles MUST be left completely plain with no noticeable details or large features that cross tile boundaries, or it must use a perfectly seamless uniform texture. 2. The reference cube at the bottom MUST have its side faces rendered as a plain, darker tone texture without any standing out details or complex patterns.)";
    }
    const apiPrompt = finalPrompt + systemConstraint;
    
    setApiPromptPreview(apiPrompt);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, apiPromptPreview: apiPrompt } } : n));

    const currentHash = JSON.stringify({ prompt: apiPrompt, model: selectedModel });

    if (status === 'succeeded' && currentHash === lastRunHash && resultUrl) {
      console.log("No changes detected, skipping API call.");
      return;
    }

    const apiKey = localStorage.getItem("artist-assistant-image-api");
    if (!apiKey) {
      setError("Please enter PlenxAI API Key in Settings.");
      setStatus("failed");
      return;
    }

    if (!finalPrompt) {
      setError("No prompt detected.");
      setStatus("failed");
      return;
    }

    setStatus("queueing");
    setError(null);

    try {
      // Fetch the local default island and upload it to get a CDN URL for the API
      const imgRes = await fetch('/assets/hex-tool/1x1_Island_Default.png');
      const blob = await imgRes.blob();
      const reader = new FileReader();
      const base64Data: string = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const uploadRes = await uploadMediaDirect(apiKey, base64Data);
      const referenceUrl = uploadRes.url || uploadRes.cdn_url;
      
      if (!referenceUrl) {
        throw new Error("Failed to upload reference template to AI server.");
      }

      let additionalReferenceUrl = "";
      if (inputImageUrl) {
        if (inputImageUrl.startsWith('data:image/')) {
          const uploadRes = await uploadMediaDirect(apiKey, inputImageUrl);
          additionalReferenceUrl = uploadRes.url || uploadRes.cdn_url;
        } else if (inputImageUrl.startsWith('blob:')) {
          const imgRes = await fetch(inputImageUrl);
          const blob = await imgRes.blob();
          const reader = new FileReader();
          const base64Data: string = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const uploadRes = await uploadMediaDirect(apiKey, base64Data);
          additionalReferenceUrl = uploadRes.url || uploadRes.cdn_url;
        } else if (inputImageUrl.startsWith('http')) {
          additionalReferenceUrl = inputImageUrl;
        }
      }

      const referencesUrls = [referenceUrl];
      if (additionalReferenceUrl) {
        referencesUrls.push(additionalReferenceUrl);
      }

      const response = await queueImageGen(apiKey, {
        prompt: apiPrompt,
        model: selectedModel,
        resolution: "2k",
        aspect_ratio: "1:1",
        references_urls: referencesUrls
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
        
        const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
        
        if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
          const finalUrl = res.result_url || (res as any).url || (res as any).image_url;
          setResultUrl(finalUrl);
          setStatus("succeeded");
          setNodes(nds => nds.map(n => n.id === id ? { 
            ...n, 
            data: { ...n.data, resultUrl: finalUrl, lastRunHash: currentHash, localPrompt } 
          } : n));
          return true;
        } else if (res.status === 'failed' || (res.status as string) === 'error') {
          setError((res as any).error || (res as any).message || "Generation failed.");
          setStatus("failed");
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    };

    const interval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(interval);
    }, 3000);
  };

  return (
    <div className={`w-80 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected ? "border-2 border-[#fbbf24]" : "border-2 border-indigo-500/30"
    }`}>
      <div className="bg-indigo-900/20 px-4 py-3 flex items-center justify-between border-b border-indigo-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-xs text-indigo-100 uppercase tracking-wider">Tileset Generator</span>
        </div>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold animate-pulse">{status}</span>
          </div>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        {/* Prompt Input */}
        <textarea
          className="nodrag text-xs w-full bg-black/40 text-gray-200 p-2 rounded border border-indigo-500/20 focus:border-indigo-500/60 focus:outline-none resize-none"
          placeholder="Enter theme (e.g., Lava rocks, glowing magma...)"
          rows={3}
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
        />

        {/* Model Selection UI */}
        <div className="relative z-20">
          <label className="text-[10px] uppercase tracking-wider text-indigo-400/60 font-bold mb-1 block">Generative Model</label>
          <button 
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="nodrag w-full bg-black/40 border border-indigo-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-indigo-500/40 transition-colors"
          >
            <span className="text-xs text-indigo-100 font-medium">
              {MODELS.find(m => m.id === selectedModel)?.name || "Select Model"}
            </span>
            <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isModelMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-indigo-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setIsModelMenuOpen(false);
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, model: m.id } } : n));
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-indigo-600/20 ${
                    selectedModel === m.id ? 'text-indigo-400 font-bold bg-indigo-600/10' : 'text-indigo-100/70'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Image Preview */}
        <div className="w-full aspect-square bg-black/50 border border-indigo-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative">
          {resultUrl ? (
            <img src={resultUrl} className="w-full h-full object-contain" alt="generated tileset" />
          ) : (
            <>
              {(status === 'queueing' || status === 'polling') ? (
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              ) : (
                <ImageIcon className="w-8 h-8 mb-2 opacity-20 text-indigo-500" />
              )}
            </>
          )}
          
          {error && (
            <div className="absolute inset-x-0 bottom-0 bg-red-900/80 p-2 flex items-start gap-2 border-t border-red-500/50">
              <AlertCircle className="w-4 h-4 text-red-200 shrink-0 mt-0.5" />
              <span className="text-[10px] text-red-100">{error}</span>
            </div>
          )}
        </div>

        {/* API Prompt Toggle */}
        <div className="pt-1">
          <button 
            onClick={() => setShowApiPrompt(!showApiPrompt)}
            className="nodrag flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
          >
            <Eye className="w-3 h-3" />
            {showApiPrompt ? "Hide API Prompt" : "View API Prompt"}
          </button>
          {showApiPrompt && (
            <div className="mt-2 p-2 bg-black/60 border border-indigo-500/30 rounded text-[10px] text-indigo-200/80 break-words leading-relaxed max-h-24 overflow-y-auto">
              {apiPromptPreview || "Generate first to see the full API prompt..."}
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={generateImage}
            disabled={status === 'queueing' || status === 'polling'}
            className="nodrag flex-[2] py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            GENERATE
          </button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="text" className="!w-4 !h-4 !bg-[#3b82f6] !border-none !left-[-8px]" style={{ top: '35%' }} />
      <Handle type="target" position={Position.Left} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !left-[-8px]" style={{ top: '65%' }} />
      <Handle type="source" position={Position.Right} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !right-[-8px]" />
    </div>
  );
}

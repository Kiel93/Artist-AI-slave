import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { ImageIcon, RefreshCw, Play, AlertCircle, ChevronDown, Eye, PenTool, Download } from "lucide-react";
import { queueImageGen, getTaskStatus, uploadMediaDirect, fetchNodePrompt } from "@/lib/plenxai";

const MODELS = [
  { id: "nano-banana-pro", name: "Nano Banana PRO" },
  { id: "kling-o1-image", name: "Kling O1 Image" },
  { id: "flux-2-pro", name: "Flux 2 Pro" },
];

const RESOLUTIONS = [
  { id: "1k", name: "1K Resolution" },
  { id: "2k", name: "2K Resolution" },
  { id: "4k", name: "4K Resolution" },
  { id: "8k", name: "8K Resolution" }
];

export default function AssetGeneratorNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "queueing" | "polling" | "diffing" | "succeeded" | "failed">("idle");
  const [image, setImage] = useState<string | null>(data.image || null);
  const [basePreviewUrl, setBasePreviewUrl] = useState<string | null>(data.basePreviewUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(data.model || MODELS[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<string>(data.resolution || RESOLUTIONS[0].id);
  const [isResolutionMenuOpen, setIsResolutionMenuOpen] = useState(false);
  const [localPrompt, setLocalPrompt] = useState<string>(data.localPrompt || "");
  const [showApiPrompt, setShowApiPrompt] = useState(false);
  const [apiPromptPreview, setApiPromptPreview] = useState<string>(data.apiPromptPreview || "");
  
  const [threshold, setThreshold] = useState<number>(data.threshold || 30);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(data.generatedUrl || null);
  
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const performChromaKey = (generatedImgUrl: string, currentThreshold: number = threshold): Promise<string> => {
    return new Promise((resolve, reject) => {
      const genImg = new Image();
      genImg.crossOrigin = "anonymous";

      genImg.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const w = genImg.width;
          const h = genImg.height;
          canvas.width = w;
          canvas.height = h;
          
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(genImg, 0, 0);
          const genData = ctx.getImageData(0, 0, w, h);
          const outData = new Uint8ClampedArray(genData.data);
          
          for (let i = 0; i < outData.length; i += 4) {
            const r = outData[i];
            const g = outData[i+1];
            const b = outData[i+2];
            
            const rDist = Math.abs(r - 255);
            const gDist = Math.abs(g - 0);
            const bDist = Math.abs(b - 255);
            
            // Pass 1: Key out strict neon green (#00FF00)
            if (rDist < currentThreshold && gDist < currentThreshold && bDist < currentThreshold) {
              outData[i+3] = 0;
            }
          }

          // Pass 2: Edge Defringing (Color Bleed)
          // Find remaining pixels that are "contaminated" by neon green
          // and replace their color with the nearest "pure" object pixel.
          const defringedData = new Uint8ClampedArray(outData);
          const radius = 3;
          
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              
              if (outData[idx+3] > 0) { // If pixel survived the key
                const r = outData[idx];
                const g = outData[idx+1];
                const b = outData[idx+2];
                
                // Contamination heuristic: Red and Blue are significantly higher than Green
                const isContaminated = (r - g > 40 && b - g > 40);
                
                if (isContaminated) {
                  let foundR = r, foundG = g, foundB = b;
                  let minDistance = 9999;
                  
                  // Search local neighborhood for a pure pixel
                  for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                      const ny = y + dy;
                      const nx = x + dx;
                      if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                        const nIdx = (ny * w + nx) * 4;
                        if (outData[nIdx+3] > 0) {
                          const nr = outData[nIdx];
                          const ng = outData[nIdx+1];
                          const nb = outData[nIdx+2];
                          const nContaminated = (nr - ng > 30 && nb - ng > 30);
                          
                          if (!nContaminated) {
                            const dist = dx*dx + dy*dy;
                            if (dist < minDistance) {
                              minDistance = dist;
                              foundR = nr;
                              foundG = ng;
                              foundB = nb;
                            }
                          }
                        }
                      }
                    }
                  }
                  
                  defringedData[idx] = foundR;
                  defringedData[idx+1] = foundG;
                  defringedData[idx+2] = foundB;
                }
              }
            }
          }
          
          let minX = w, minY = h, maxX = 0, maxY = 0;
          let hasVisiblePixels = false;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              if (defringedData[idx+3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                hasVisiblePixels = true;
              }
            }
          }

          ctx.putImageData(new ImageData(defringedData, w, h), 0, 0);

          if (hasVisiblePixels) {
            const trimmedW = maxX - minX + 1;
            const trimmedH = maxY - minY + 1;
            const trimmedCanvas = document.createElement("canvas");
            trimmedCanvas.width = trimmedW;
            trimmedCanvas.height = trimmedH;
            const trimmedCtx = trimmedCanvas.getContext("2d")!;
            trimmedCtx.drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
            resolve(trimmedCanvas.toDataURL("image/png"));
          } else {
            resolve(canvas.toDataURL("image/png"));
          }
        } catch (e) {
          reject(e);
        }
      };

      genImg.onerror = reject;
      genImg.src = generatedImgUrl;
    });
  };

  const generateAsset = async () => {
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    
    const promptParts: string[] = [];
    if (localPrompt) promptParts.push(localPrompt);

    let styleInput = "";
    let inputImageUrl = "";
    let secondaryImageUrl = "";
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      if (edge.targetHandle === 'text') {
        const text = sourceNode.data.text|| "";
        if (text) promptParts.push(text);
      }
      if (edge.targetHandle === 'style') {
        styleInput = sourceNode.data.text|| "";
      }
      if (edge.targetHandle === 'image') {
        inputImageUrl = sourceNode.data.image|| "";
      }
      if (edge.targetHandle === 'image-2') {
        secondaryImageUrl = sourceNode.data.image|| "";
      }
    });

    if (!inputImageUrl) {
      setError("Please connect a Base Island image.");
      setStatus("failed");
      return;
    }

    const objectPrompt = promptParts.join(", ") || "object";
    const styleString = styleInput ? ` Artstyle: ${styleInput}` : "";
    
    let baseApiPrompt = await fetchNodePrompt('AssetGeneratorNode');
    if (!baseApiPrompt) {
      baseApiPrompt = `You are an artist in the game industry. Generate {object} that would visually match and perfectly sit in the middle of this island. Isolate the {object} and make the background neon green for color keying (#00FF00). IMPORTANT: PRESERVE THE ARTSTYLE AND LIGHTING, DO NOT INCLUDE COMPONENTS FROM REFERENCE IN THE GENERATED IMAGE. USE THe IMAGE 2 AS REFERENCE FOR THE {object}.
Subject: A single isolated {object} rendered in a strict 30-degree isometric perspective.
Style: {style}
Composition: The {object} must be centered, filling 70% of the canvas. DO NOT include the island base or any terrain from the reference image. Generate the {object} as a standalone floating sprite.
Technical Output: Place the object on a solid, flat neon green background (#00FF00). IMPORTANT: Ensure there are no ground shadows, no floor planes, and no "color spill" or neon green glow reflected onto the object. The edges must be sharp and clean for pixel extraction.
Reference: {reference image}.
Spec: resolution:{resolution}. ratio 1:1.`;
    }
    
    const apiPrompt = baseApiPrompt
      .replace(/{object}/g, objectPrompt)
      .replace(/{style}/g, styleString)
      .replace(/1k resolution/gi, `${selectedResolution} resolution`)
      .replace(/{resolution}/gi, selectedResolution);
    
    setApiPromptPreview(apiPrompt);
    setBasePreviewUrl(inputImageUrl);

    const apiKey = localStorage.getItem("artist-assistant-image-api");
    if (!apiKey) {
      setError("Please enter PlenxAI API Key in Settings.");
      setStatus("failed");
      return;
    }

    if (!objectPrompt) {
      setError("No prompt detected.");
      setStatus("failed");
      return;
    }

    setStatus("queueing");
    setError(null);

    try {
      let additionalReferenceUrl = "";
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

      if (!additionalReferenceUrl) {
        throw new Error("Failed to upload base image.");
      }

      const refs = [additionalReferenceUrl];
      
      if (secondaryImageUrl) {
        if (secondaryImageUrl.startsWith('data:image/')) {
          const up2 = await uploadMediaDirect(apiKey, secondaryImageUrl);
          refs.push(up2.url || up2.cdn_url);
        } else if (secondaryImageUrl.startsWith('blob:')) {
          const imgRes = await fetch(secondaryImageUrl);
          const blob = await imgRes.blob();
          const reader = new FileReader();
          const base64Data: string = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const up2 = await uploadMediaDirect(apiKey, base64Data);
          refs.push(up2.url || up2.cdn_url);
        } else if (secondaryImageUrl.startsWith('http')) {
          refs.push(secondaryImageUrl);
        }
      }

      const response = await queueImageGen(apiKey, {
        prompt: apiPrompt,
        model: selectedModel,
        resolution: selectedResolution,
        aspect_ratio: "1:1",
        references_urls: refs
      });

      if (response.success && response.task_id) {
        startPolling(response.task_id, apiKey, additionalReferenceUrl);
      } else {
        setError(response.message || response.error || "Failed to queue generation.");
        setStatus("failed");
      }
    } catch (err: any) {
      setError(err.message || "Network error.");
      setStatus("failed");
    }
  };

  const startPolling = async (taskId: string, apiKey: string, baseImgUrl: string) => {
    setStatus("polling");
    
    const poll = async () => {
      try {
        const res = await getTaskStatus(apiKey, taskId);
        
        const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
        
        if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
          const fetchedGenUrl = res.result_url || (res as any).url || (res as any).image_url;
          setGeneratedUrl(fetchedGenUrl);
          
          setStatus("diffing");
          // Proceed to chroma key!
          try {
            const extractedAssetUrl = await performChromaKey(fetchedGenUrl, threshold);
            setImage(extractedAssetUrl);
            setStatus("succeeded");
            setNodes(nds => nds.map(n => n.id === id ? { 
              ...n, 
              data: { ...n.data, image: extractedAssetUrl, generatedUrl: fetchedGenUrl, threshold } 
            } : n));
          } catch (err) {
            console.error("Chroma key failed after generation:", err);
            setStatus("failed");
          }

          return true;
        } else if (res.status === 'failed' || (res.status as string) === 'error') {
          setError((res as any).error || (res as any).message || "Generation failed.");
          setStatus("failed");
          return true;
        }
        
        return false;
      } catch (err) {
        console.error("Polling error:", err);
        return false; // Keep polling
      }
    };

    const interval = setInterval(async () => {
      const done = await poll();
      if (done) {
        clearInterval(interval);
      }
    }, 3000);
  };

  return (
    <div className={`w-80 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected ? "border-2 border-[#fbbf24]" : "border-2 border-indigo-500/30"
    }`}>
      <div className="bg-indigo-900/20 px-4 py-3 flex flex-col items-center border-b border-indigo-500/20 rounded-t-lg">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-indigo-400" />
            <span className="font-bold text-xs text-indigo-100 uppercase tracking-wider">Asset Gen (Chroma)</span>
          </div>
          {status !== 'idle' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold animate-pulse">{status}</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="relative">
          <Handle type="target" position={Position.Left} id="text" className="!w-4 !h-4 !bg-[#3b82f6] !border-none !left-[-24px] top-1/2" />
          <textarea
            className="nodrag text-xs w-full bg-black/40 text-gray-200 p-2 rounded border border-indigo-500/20 focus:border-indigo-500/60 focus:outline-none resize-none"
            placeholder="e.g. 'A wooden crate', 'A patch of green grass'"
            rows={2}
            value={localPrompt}
            onChange={(e) => {
              setLocalPrompt(e.target.value);
              setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, localPrompt: e.target.value } } : n));
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
           <div className="relative flex items-center h-6">
             <Handle type="target" position={Position.Left} id="style" className="!w-4 !h-4 !bg-[#3b82f6] !border-none !left-[-24px]" />
             <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Style Input</span>
           </div>
           <div className="relative flex items-center h-6">
             <Handle type="target" position={Position.Left} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !left-[-24px]" />
             <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Base Island Image</span>
           </div>
           <div className="relative flex items-center h-6">
             <Handle type="target" position={Position.Left} id="image-2" className="!w-4 !h-4 !bg-[#22c55e] !border-none !left-[-24px]" />
             <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Reference Image</span>
           </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-indigo-200 font-medium">Key Threshold</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-indigo-400">{threshold}</span>
              <button 
                onClick={async () => {
                  if (basePreviewUrl && generatedUrl) {
                    try {
                      setStatus("diffing");
                      const extractedAssetUrl = await performChromaKey(generatedUrl, threshold);
                      setImage(extractedAssetUrl);
                      setStatus("succeeded");
                      setNodes(nds => nds.map(n => n.id === id ? { 
                        ...n, 
                        data: { ...n.data, image: extractedAssetUrl, threshold } 
                      } : n));
                    } catch (err) {
                      console.error(err);
                      setStatus("failed");
                    }
                  }
                }}
                disabled={!generatedUrl || status === 'diffing' || status === 'queueing' || status === 'polling'}
                className="p-1 bg-indigo-500/20 hover:bg-indigo-500/40 rounded transition-colors disabled:opacity-50"
                title="Force Re-calculate Diff"
              >
                <RefreshCw className="w-3 h-3 text-indigo-300" />
              </button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={threshold}
            onChange={async (e) => {
              const newThreshold = parseInt(e.target.value);
              setThreshold(newThreshold);
              
              if (generatedUrl) {
                try {
                  const extractedAssetUrl = await performChromaKey(generatedUrl, newThreshold);
                  setImage(extractedAssetUrl);
                  setNodes(nds => nds.map(n => n.id === id ? { 
                    ...n, 
                    data: { ...n.data, image: extractedAssetUrl, threshold: newThreshold } 
                  } : n));
                } catch (err) {
                  console.error(err);
                }
              }
            }}
            className="nodrag w-full accent-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 relative z-20">
          <div className="relative">
            <button 
              onClick={() => { setIsModelMenuOpen(!isModelMenuOpen); setIsResolutionMenuOpen(false); }}
              className="nodrag w-full bg-black/40 border border-indigo-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-indigo-500/40 transition-colors"
            >
              <span className="text-xs text-indigo-100 font-medium truncate pr-2">
                {MODELS.find(m => m.id === selectedModel)?.name || "Model"}
              </span>
              <ChevronDown className={`w-3 h-3 text-indigo-400 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''} shrink-0`} />
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
                    className={`w-full px-3 py-2 text-left text-[10px] transition-colors hover:bg-indigo-600/20 ${
                      selectedModel === m.id ? 'text-indigo-400 font-bold bg-indigo-600/10' : 'text-indigo-100/70'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button 
              onClick={() => { setIsResolutionMenuOpen(!isResolutionMenuOpen); setIsModelMenuOpen(false); }}
              className="nodrag w-full bg-black/40 border border-indigo-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-indigo-500/40 transition-colors"
            >
              <span className="text-xs text-indigo-100 font-medium truncate pr-2">
                {RESOLUTIONS.find(r => r.id === selectedResolution)?.name || "Res"}
              </span>
              <ChevronDown className={`w-3 h-3 text-indigo-400 transition-transform ${isResolutionMenuOpen ? 'rotate-180' : ''} shrink-0`} />
            </button>
            
            {isResolutionMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-indigo-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedResolution(r.id);
                      setIsResolutionMenuOpen(false);
                      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, resolution: r.id } } : n));
                    }}
                    className={`w-full px-3 py-2 text-left text-[10px] transition-colors hover:bg-indigo-600/20 ${
                      selectedResolution === r.id ? 'text-indigo-400 font-bold bg-indigo-600/10' : 'text-indigo-100/70'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Image Preview */}
        <div 
          className="w-full aspect-square bg-black/50 border border-indigo-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative group"
          style={{
            backgroundImage: image ? `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)` : 'none',
            backgroundSize: '20px 20px'
          }}
        >
          {image ? (
            <>
              <img src={image} className="w-full h-full object-contain drop-shadow-2xl" alt="Extracted Asset" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = image;
                    a.download = `asset-${id}.png`;
                    a.target = '_blank';
                    a.click();
                  }}
                  className="bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-xl transition-transform hover:scale-105 pointer-events-auto"
                >
                  <Download className="w-6 h-6" />
                </button>
              </div>
            </>
          ) : (
            <>
              {(status === 'queueing' || status === 'polling' || status === 'diffing') ? (
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
        
        <div className="flex gap-2 mt-2">
          <button 
            onClick={generateAsset}
            disabled={status !== 'idle' && status !== 'succeeded' && status !== 'failed'}
            className="nodrag flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded shadow-lg flex items-center justify-center gap-1 disabled:opacity-50 transition-all"
          >
            <Play className="w-3 h-3 fill-current" />
            GENERATE & EXTRACT
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !right-[-10px]" />
    </div>
  );
}

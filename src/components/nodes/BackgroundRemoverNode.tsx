import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useEdges, useNodes } from "reactflow";
import { Eraser, Play, RefreshCw, AlertCircle, ImageIcon, Download, ChevronDown } from "lucide-react";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

export default function BackgroundRemoverNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "processing" | "succeeded" | "failed">("idle");
  const [image, setImage] = useState<string | null>(data.image || null);
  const [error, setError] = useState<string | null>(null);
  
  const [method, setMethod] = useState<"ai" | "chroma">(data.method || "ai");
  const [isMethodMenuOpen, setIsMethodMenuOpen] = useState(false);
  const [threshold, setThreshold] = useState<number>(data.threshold || 30);
  const [keyColor, setKeyColor] = useState<string>(data.keyColor || "#00FF00");

  const { getNodes, getEdges, setNodes } = useReactFlow();
  const edgesReactFlow = useEdges();
  const nodesReactFlow = useNodes();

  const getConnectedImageUrl = () => {
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    let inputImageUrl = "";
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      if (edge.targetHandle === 'image') {
        inputImageUrl = sourceNode.data.image || sourceNode.data.outputImage || "";
      }
    });
    return inputImageUrl;
  };

  const performChromaKey = (imageUrl: string, currentThreshold: number, colorHex: string): Promise<string> => {
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
          
          const hex = colorHex.replace('#', '');
          const keyR = parseInt(hex.substring(0, 2), 16);
          const keyG = parseInt(hex.substring(2, 4), 16);
          const keyB = parseInt(hex.substring(4, 6), 16);
          
          for (let i = 0; i < outData.length; i += 4) {
            const r = outData[i];
            const g = outData[i+1];
            const b = outData[i+2];
            
            const rDist = Math.abs(r - keyR);
            const gDist = Math.abs(g - keyG);
            const bDist = Math.abs(b - keyB);
            
            if (rDist < currentThreshold && gDist < currentThreshold && bDist < currentThreshold) {
              outData[i+3] = 0;
            }
          }

          const defringedData = new Uint8ClampedArray(outData);
          const radius = 3;
          
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              
              if (outData[idx+3] > 0) { 
                const r = outData[idx];
                const g = outData[idx+1];
                const b = outData[idx+2];
                
                const distToKey = Math.sqrt(Math.pow(r - keyR, 2) + Math.pow(g - keyG, 2) + Math.pow(b - keyB, 2));
                const isContaminated = distToKey < currentThreshold * 2.5; 
                
                if (isContaminated) {
                  let foundR = r, foundG = g, foundB = b;
                  let minDistance = 9999;
                  
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
                          
                          const nDistToKey = Math.sqrt(Math.pow(nr - keyR, 2) + Math.pow(ng - keyG, 2) + Math.pow(nb - keyB, 2));
                          const nContaminated = nDistToKey < currentThreshold * 2.5;
                          
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
      genImg.src = imageUrl;
    });
  };

  const handleThresholdChange = async (newThreshold: number) => {
    setThreshold(newThreshold);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, threshold: newThreshold } } : n));
    if (method === "chroma") {
      const inputImageUrl = getConnectedImageUrl();
      if (inputImageUrl) {
        try {
          const extractedUrl = await performChromaKey(inputImageUrl, newThreshold, keyColor);
          setImage(extractedUrl);
          setNodes(nds => nds.map(n => n.id === id ? { 
            ...n, 
            data: { ...n.data, image: extractedUrl } 
          } : n));
        } catch (err) {
          console.error(err);
        }
      }
    }
  };

  const handleColorChange = async (newColor: string) => {
    setKeyColor(newColor);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, keyColor: newColor } } : n));
    if (method === "chroma") {
      const inputImageUrl = getConnectedImageUrl();
      if (inputImageUrl) {
        try {
          const extractedUrl = await performChromaKey(inputImageUrl, threshold, newColor);
          setImage(extractedUrl);
          setNodes(nds => nds.map(n => n.id === id ? { 
            ...n, 
            data: { ...n.data, image: extractedUrl } 
          } : n));
        } catch (err) {
          console.error(err);
        }
      }
    }
  };

  const thresholdEdge = edgesReactFlow.find(e => e.target === id && e.targetHandle === 'threshold');
  const thresholdSourceNode = thresholdEdge ? nodesReactFlow.find(n => n.id === thresholdEdge.source) : null;
  const hasThresholdConnection = !!thresholdSourceNode;

  useEffect(() => {
    const dataAny = thresholdSourceNode?.data as any;
    if (hasThresholdConnection && dataAny?.value !== undefined) {
      let val = dataAny.value;
      if (dataAny.mode === 'slider') {
        val = 0 + (val / 100) * (100 - 0);
      }
      const clamped = Math.min(Math.max(val, 0), 100);
      if (clamped !== threshold) {
        handleThresholdChange(clamped);
      }
    }
  }, [hasThresholdConnection, (thresholdSourceNode?.data as any)?.value, id, setNodes, threshold, method, keyColor]);

  const removeBackground = async () => {
    const inputImageUrl = getConnectedImageUrl();

    if (!inputImageUrl) {
      setError("No input image connected.");
      setStatus("failed");
      return;
    }

    setStatus("processing");
    setError(null);

    try {
      if (method === "ai") {
        const blobSource: Blob | string = inputImageUrl;
        
        const blob = await imglyRemoveBackground(blobSource, {
          progress: (key, current, total) => {
            console.log(`Downloading model... ${key} - ${current}/${total}`);
          }
        });

        const reader = new FileReader();
        const base64Url: string = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });

        const trimmedBase64: string = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            let hasVisiblePixels = false;
            
            for (let y = 0; y < canvas.height; y++) {
              for (let x = 0; x < canvas.width; x++) {
                const alpha = data[(y * canvas.width + x) * 4 + 3];
                if (alpha > 10) {
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                  hasVisiblePixels = true;
                }
              }
            }
            
            if (!hasVisiblePixels) {
              resolve(base64Url);
              return;
            }
            
            const padding = 10;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(canvas.width - 1, maxX + padding);
            maxY = Math.min(canvas.height - 1, maxY + padding);
            
            const width = maxX - minX + 1;
            const height = maxY - minY + 1;
            const trimmedCanvas = document.createElement("canvas");
            trimmedCanvas.width = width;
            trimmedCanvas.height = height;
            const tCtx = trimmedCanvas.getContext("2d")!;
            tCtx.putImageData(ctx.getImageData(minX, minY, width, height), 0, 0);
            resolve(trimmedCanvas.toDataURL("image/png"));
          };
          img.src = base64Url;
        });

        setImage(trimmedBase64);
        setStatus("succeeded");
        
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, image: trimmedBase64 } 
        } : n));
      } else {
        const extractedUrl = await performChromaKey(inputImageUrl, threshold, keyColor);
        setImage(extractedUrl);
        setStatus("succeeded");
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, image: extractedUrl, threshold, keyColor } 
        } : n));
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to remove background.");
      setStatus("failed");
    }
  };

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected ? "border-2 border-[#fbbf24]" : "border-2 border-indigo-500/30"
    }`}>
      <div className="bg-indigo-900/20 px-4 py-3 flex items-center justify-between border-b border-indigo-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Eraser className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-xs text-indigo-100 uppercase tracking-wider">BG Remover</span>
        </div>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold animate-pulse">{status}</span>
          </div>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        <div className="flex flex-col gap-2 pb-1">
          <div className="relative flex items-center h-6">
            <Handle type="target" position={Position.Left} id="image" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Image Input</span>
          </div>

          <div className="relative z-20">
            <button 
              onClick={() => setIsMethodMenuOpen(!isMethodMenuOpen)}
              className="nodrag w-full bg-black/40 border border-indigo-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-indigo-500/40 transition-colors"
            >
              <span className="text-xs text-indigo-100 font-medium truncate pr-2">
                {method === "ai" ? "AI Removal" : "Chroma Key"}
              </span>
              <ChevronDown className={`w-3 h-3 text-indigo-400 transition-transform ${isMethodMenuOpen ? 'rotate-180' : ''} shrink-0`} />
            </button>
            
            {isMethodMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-indigo-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in z-50">
                <button
                  onClick={() => {
                    setMethod("ai");
                    setIsMethodMenuOpen(false);
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, method: "ai" } } : n));
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-indigo-600/20 ${
                    method === "ai" ? 'text-indigo-400 font-bold bg-indigo-600/10' : 'text-indigo-100/70'
                  }`}
                >
                  AI Removal
                </button>
                <button
                  onClick={() => {
                    setMethod("chroma");
                    setIsMethodMenuOpen(false);
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, method: "chroma" } } : n));
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-indigo-600/20 ${
                    method === "chroma" ? 'text-indigo-400 font-bold bg-indigo-600/10' : 'text-indigo-100/70'
                  }`}
                >
                  Chroma Key
                </button>
              </div>
            )}
          </div>

          {method === "chroma" && (
            <>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Key Color</span>
                <input 
                  type="color" 
                  value={keyColor} 
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="nodrag w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                />
              </div>

              <div className="space-y-1 relative">
                <div className="relative flex justify-between items-center w-full">
                  <Handle type="target" position={Position.Left} id="threshold" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#f43f5e', borderColor: '#9f1239', borderWidth: '2px' }} />
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Threshold {hasThresholdConnection && <span className="font-normal text-gray-300 ml-1">(0/100)</span>}
                  </span>
                  {!hasThresholdConnection && (
                    <span className="text-[10px] font-bold text-indigo-400">
                      {Number(threshold.toFixed(2))}
                    </span>
                  )}
                </div>
                {!hasThresholdConnection && (
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={threshold}
                    onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
                    className="nodrag w-full"
                    style={{ accentColor: '#f43f5e' }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div 
          className="w-full border border-indigo-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative group"
          style={{
            backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`,
            backgroundSize: '20px 20px'
          }}
        >
          {image ? (
            <>
              <img src={image} className="w-full h-full object-contain" alt="Background Removed" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <a
                  href={image}
                  download={`bg-removed-${id}.png`}
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
              {status === 'processing' ? (
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              ) : (
                <ImageIcon className="w-8 h-8 opacity-20 text-indigo-500" />
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
        
        <div className="flex gap-2">
          <button 
            onClick={removeBackground}
            disabled={status === 'processing'}
            className="nodrag flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1 text-white text-sm font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            PROCESS
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
    </div>
  );
}

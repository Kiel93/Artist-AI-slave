import { useState } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Eraser, Play, RefreshCw, AlertCircle, ImageIcon } from "lucide-react";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

export default function BackgroundRemoverNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "processing" | "succeeded" | "failed">("idle");
  const [outputImage, setOutputImage] = useState<string | null>(data.outputImage || data.resultUrl || null);
  const [error, setError] = useState<string | null>(null);
  
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const removeBackground = async () => {
    // Gather Inputs
    const nodes = getNodes();
    const edges = getEdges();
    const incomingEdges = edges.filter(e => e.target === id);
    
    let inputImageUrl = "";

    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;
      if (edge.targetHandle === 'image') {
        inputImageUrl = sourceNode.data.outputImage || sourceNode.data.imageUrl || sourceNode.data.resultUrl || sourceNode.data.image || "";
      }
    });

    if (!inputImageUrl) {
      setError("No input image connected.");
      setStatus("failed");
      return;
    }

    setStatus("processing");
    setError(null);

    try {
      // Create a blob from the input URL if it's not already
      const blobSource: Blob | string = inputImageUrl;
      
      const blob = await imglyRemoveBackground(blobSource, {
        progress: (key, current, total) => {
          // Could track progress here
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

      setOutputImage(trimmedBase64);
      setStatus("succeeded");
      
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, outputImage: trimmedBase64 } 
      } : n));

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

        {/* Image Preview with checkerboard pattern to show transparency */}
        <div 
          className="w-full aspect-square border border-indigo-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative"
          style={{
            backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`,
            backgroundSize: '20px 20px'
          }}
        >
          {outputImage ? (
            <img src={outputImage} className="w-full h-full object-contain" alt="Background Removed" />
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
            className="nodrag flex-[2] py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            PROCESS
          </button>
          {outputImage && (
            <button
              onClick={() => {
                const a = document.createElement('a');
                a.href = outputImage;
                a.download = `bg-removed-${id}.png`;
                a.target = '_blank';
                a.click();
              }}
              className="nodrag flex-1 py-2 bg-gray-700/80 hover:bg-gray-600 border border-gray-500/50 text-white text-[10px] font-bold rounded shadow-lg transition-colors flex items-center justify-center gap-1"
            >
              DOWNLOAD
            </button>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !right-[-10px]" />
    </div>
  );
}

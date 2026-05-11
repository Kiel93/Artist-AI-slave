import { useState } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Eraser, Play, RefreshCw, AlertCircle, ImageIcon } from "lucide-react";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

export default function BackgroundRemoverNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "processing" | "succeeded" | "failed">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(data.resultUrl || null);
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
        inputImageUrl = sourceNode.data.imageUrl || sourceNode.data.resultUrl || sourceNode.data.image || "";
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
      let blobSource: Blob | string = inputImageUrl;
      
      const blob = await imglyRemoveBackground(blobSource, {
        progress: (key, current, total) => {
          // Could track progress here
          console.log(`Downloading model... ${key} - ${current}/${total}`);
        }
      });

      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStatus("succeeded");
      
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, resultUrl: url, imageUrl: url } 
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
        {/* Image Preview with checkerboard pattern to show transparency */}
        <div 
          className="w-full aspect-square border border-indigo-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative"
          style={{
            backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`,
            backgroundSize: '20px 20px'
          }}
        >
          {resultUrl ? (
            <img src={resultUrl} className="w-full h-full object-contain" alt="Background Removed" />
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
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="image" className="!w-4 !h-4 !bg-[#f59e0b] !border-none !left-[-8px]" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Right} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !right-[-8px]" style={{ top: '50%' }} />
    </div>
  );
}

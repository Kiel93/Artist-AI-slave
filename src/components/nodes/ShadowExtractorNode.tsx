import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useEdges, useNodes } from "reactflow";
import { ImageIcon, Play, RefreshCw, AlertCircle, Download } from "lucide-react";
import { executeNode } from "@/lib/node-executor";

export default function ShadowExtractorNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [status, setStatus] = useState<"idle" | "processing" | "succeeded" | "failed">("idle");
  const [image, setImage] = useState<string | null>(data.image || data.outputImage || null);
  const [error, setError] = useState<string | null>(null);
  const [previewWhiteBg, setPreviewWhiteBg] = useState<boolean>(data.previewWhiteBg || false);
  const [intensity, setIntensity] = useState<number>(data.intensity || 0);
  
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();

  // Register limits
  useEffect(() => {
    if (!data.limits || !data.limits.intensity) {
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, limits: { ...n.data.limits, intensity: { min: -100, max: 100, step: 1 } } } 
      } : n));
    }
  }, []);

  // Handle external value connection
  const intensityEdge = edges.find(e => e.target === id && e.targetHandle === 'intensity');
  const intensitySourceNode = intensityEdge ? nodes.find(n => n.id === intensityEdge.source) : null;
  const hasValueConnection = !!intensitySourceNode;

  useEffect(() => {
    const dataAny = intensitySourceNode?.data as any;
    if (hasValueConnection && dataAny?.value !== undefined) {
      let val = dataAny.value;
      if (dataAny.mode === 'slider') {
        val = -100 + (val / 100) * (100 - -100);
      }
      const clamped = Math.min(Math.max(val, -100), 100);
      if (clamped !== intensity) {
        setIntensity(clamped);
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, intensity: clamped } } : n));
      }
    }
  }, [hasValueConnection, (intensitySourceNode?.data as any)?.value, id, setNodes, intensity]);

  const extractShadow = async () => {
    // Gather Inputs
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

    if (!inputImageUrl) {
      setError("No input image connected.");
      setStatus("failed");
      return;
    }

    setStatus("processing");
    setError(null);

    try {
      const result = await executeNode(
        'shadowExtractor', 
        { ...data, intensity }, 
        { textInputs: [], imageInputs: [inputImageUrl], namedInputs: { image: { image: inputImageUrl } } }, 
        {}
      );
      
      if (result.success && result.data?.image) {
        setImage(result.data.image);
        setStatus("succeeded");
        setNodes(nds => nds.map(n => n.id === id ? { 
          ...n, 
          data: { ...n.data, image: result.data.image, outputImage: result.data.image } 
        } : n));
      } else {
        setError(result.error || "Failed to extract shadow.");
        setStatus("failed");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to extract shadow.");
      setStatus("failed");
    }
  };

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected ? "border-2 border-[#fbbf24]" : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-4 py-3 flex items-center justify-between border-b border-emerald-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Shadow Extractor</span>
        </div>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold animate-pulse">{status}</span>
          </div>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        {/* Top Panel: Inputs */}
        <div className="flex flex-col gap-1 pb-1">
          <div className="relative flex items-center h-6">
            <Handle type="target" position={Position.Left} id="image" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Image Input</span>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="space-y-3">
          <div className="relative flex justify-between items-center w-full">
            <span className="text-[10px] text-emerald-200 font-medium">Preview White BG</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer nodrag"
                checked={previewWhiteBg}
                onChange={(e) => {
                  setPreviewWhiteBg(e.target.checked);
                  setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, previewWhiteBg: e.target.checked } } : n));
                }}
              />
              <div className="w-7 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
          
          <div className="space-y-1 relative">
            <div className="relative flex justify-between items-center w-full">
            <Handle type="target" position={Position.Left} id="intensity" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderColor: '#7f1d1d', borderWidth: '2px' }} />
              <span className="text-[10px] text-emerald-200 font-medium ml-1">Intensity</span>
              <span className="text-[10px] font-bold text-emerald-400">
                {Number(intensity.toFixed(2))} {hasValueConnection && <span className="font-normal text-emerald-200 ml-1">(-100/100)</span>}
              </span>
            </div>
            
            {!hasValueConnection && (
              <input
                type="range"
                min="-100"
                max="100"
                value={intensity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setIntensity(val);
                  setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, intensity: val } } : n));
                }}
                className="nodrag w-full accent-emerald-500"
              />
            )}
          </div>
        </div>

        {/* Image Preview with checkerboard pattern to show transparency */}
        <div 
          className="w-full border border-emerald-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative group"
          style={{
            backgroundColor: previewWhiteBg ? '#ffffff' : 'transparent',
            backgroundImage: previewWhiteBg ? 'none' : `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`,
            backgroundSize: '20px 20px'
          }}
        >
          {image ? (
            <>
              <img src={image} className="w-full h-full object-contain drop-shadow-2xl" alt="Extracted Shadow" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <a
                  href={image}
                  download={`shadow-extracted-${id}.png`}
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
                <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              ) : (
                <ImageIcon className="w-8 h-8 opacity-20 text-emerald-500" />
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
            onClick={extractShadow}
            disabled={status === 'processing'}
            className="nodrag flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 text-white text-sm font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 transition-all"
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

import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent } from "react";
import { Handle, Position, useReactFlow, useEdges } from "reactflow";
import { Scissors, Download, Eye, ChevronUp, ChevronDown } from "lucide-react";

export default function TileCutterNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [zoom, setZoom] = useState(data.zoom ?? 100);
  const [opacity, setOpacity] = useState(data.opacity ?? 0.8);
  const [feather, setFeather] = useState(data.feather ?? 2);
  const [pan, setPan] = useState(data.pan ?? { x: 0, y: 0 });

  const [cutImage, setCutImage] = useState<string | null>(data.outputImage || data.resultUrl || null);
  const [isExpanded, setIsExpanded] = useState(data.isExpanded !== undefined ? data.isExpanded : true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const { getNodes, setNodes } = useReactFlow();
  const allEdges = useEdges();
  const incomingEdges = allEdges.filter(e => e.target === id && e.targetHandle === 'image');

  const sourceNode = incomingEdges.length > 0 ? getNodes().find(n => n.id === incomingEdges[0].source) : null;
  const imageUrl = sourceNode?.data?.outputImage || sourceNode?.data?.resultUrl || sourceNode?.data?.imageUrl;

  const renderPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const baseScale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const renderScale = (zoom / 100) * baseScale;
      // Draw image with pan and zoom
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2); // Center point
      ctx.translate(pan.x, pan.y);
      ctx.scale(renderScale, renderScale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      // Draw the diamond mask overlay using a temporary canvas
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = canvas.height;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (tmpCtx) {
        tmpCtx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);

        tmpCtx.globalCompositeOperation = 'destination-out';

        const cx = tmpCanvas.width / 2;
        const cy = tmpCanvas.height / 2;
        const w = tmpCanvas.width;
        const h = tmpCanvas.height;

        tmpCtx.beginPath();
        tmpCtx.moveTo(cx, 0);
        tmpCtx.lineTo(w, cy);
        tmpCtx.lineTo(cx, h);
        tmpCtx.lineTo(0, cy);
        tmpCtx.closePath();

        if (feather > 1) {
          tmpCtx.shadowColor = 'black';
          tmpCtx.shadowBlur = feather * 3;
        }
        tmpCtx.fill();

        ctx.drawImage(tmpCanvas, 0, 0);
      }
    };
  };

  useEffect(() => {
    renderPreview();
    // Save settings to node data to persist
    setNodes(nds => nds.map(n => n.id === id ? {
      ...n,
      data: { ...n.data, zoom, opacity, feather, pan, isExpanded }
    } : n));
  }, [imageUrl, zoom, opacity, feather, pan, isExpanded]);

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    setPan((prev: { x: number; y: number }) => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev: number) => {
      const newZoom = prev - e.deltaY * 0.5;
      return Math.min(Math.max(newZoom, 100), 500);
    });
  };

  const handleCut = () => {
    if (!imageUrl) return;

    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = 280;
    cutCanvas.height = 140;
    const ctx = cutCanvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      const baseScale = Math.min(cutCanvas.width / img.width, cutCanvas.height / img.height);
      const renderScale = (zoom / 100) * baseScale;
      // 1. Draw transformed image
      ctx.save();
      ctx.translate(cutCanvas.width / 2, cutCanvas.height / 2);
      ctx.translate(pan.x, pan.y);
      ctx.scale(renderScale, renderScale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      // 2. Cut to diamond shape with feathering
      ctx.globalCompositeOperation = 'destination-in';

      const cx = cutCanvas.width / 2;
      const cy = cutCanvas.height / 2;

      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cutCanvas.width, cy);
      ctx.lineTo(cx, cutCanvas.height);
      ctx.lineTo(0, cy);
      ctx.closePath();

      if (feather > 1) {
        ctx.shadowColor = 'black';
        ctx.shadowBlur = feather * 3;
      }
      ctx.fill();

      const resultDataUrl = cutCanvas.toDataURL('image/png');
      setCutImage(resultDataUrl);

      // Expose to output handle
      setNodes(nds => nds.map(n => n.id === id ? {
        ...n,
        data: { ...n.data, outputImage: resultDataUrl }
      } : n));
    };
  };

  return (
    <div className={`w-80 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${selected ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" : "border-2 border-emerald-500/30"}`}>

      <div className="bg-emerald-900/20 px-4 py-3 flex items-center justify-between border-b border-emerald-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Tile Cutter</span>
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="text-emerald-400/60 hover:text-emerald-400 transition-colors">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="relative flex items-center h-6 mt-2 pl-4">
        <Handle type="target" position={Position.Left} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none" />
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Image Input</span>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-emerald-200/80 mb-1">
                <span>Zoom</span>
                <span>{Math.round(zoom)}%</span>
              </div>
              <input type="range" min="100" max="500" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="nodrag w-full accent-emerald-500" />
            </div>

            <div>
              <div className="flex justify-between text-xs text-emerald-200/80 mb-1">
                <span>Mask Opacity</span>
                <span>{Math.round(opacity * 100)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="nodrag w-full accent-emerald-500" />
            </div>

            <div>
              <div className="flex justify-between text-xs text-emerald-200/80 mb-1">
                <span>Feather (px)</span>
                <span>{feather}</span>
              </div>
              <input type="range" min="1" max="5" value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="nodrag w-full accent-emerald-500" />
            </div>
          </div>

          <div className="bg-black/30 border border-emerald-500/20 rounded-lg p-2">
            <div className="text-[10px] text-emerald-200/40 uppercase font-bold mb-2">Input Preview (Pan & Zoom)</div>
            {imageUrl ? (
              <canvas
                ref={canvasRef}
                width={280}
                height={140}
                className="nodrag w-full bg-black cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              />
            ) : (
              <div className="w-full h-[140px] flex flex-col items-center justify-center bg-black/50 text-emerald-200/30">
                <Eye className="w-6 h-6 mb-1 opacity-50" />
                <span className="text-xs">No input connected</span>
              </div>
            )}
          </div>

          {cutImage && (
            <div className="bg-black border border-emerald-500/20 rounded-lg p-2">
              <div className="text-[10px] text-emerald-200/40 uppercase font-bold mb-2">Cut Result</div>
              <img src={cutImage} alt="Cut Result" className="w-full" style={{ imageRendering: 'pixelated' }} />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCut}
              disabled={!imageUrl}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            >
              <Scissors className="w-4 h-4" />
              CUT
            </button>

            {cutImage && (
              <a
                href={cutImage}
                download="Tile_Cut.png"
                className="px-4 py-2 bg-black/50 hover:bg-black/70 border border-emerald-500/30 text-emerald-400 text-sm font-bold rounded shadow-lg flex items-center justify-center transition-all"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="image-out" className="!w-4 !h-4 !bg-[#22c55e] !border-none" />
    </div>
  );
}

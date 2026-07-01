import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent } from "react";
import { Handle, Position, useReactFlow, useEdges, useNodes } from "reactflow";
import { Scissors, Download, Eye, ChevronUp, ChevronDown } from "lucide-react";

export default function TileCutterNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [zoom, setZoom] = useState(data.zoom ?? 100);
  const [opacity, setOpacity] = useState(data.opacity ?? 0.8);
  const [feather, setFeather] = useState(data.feather ?? 2);
  const [pan, setPan] = useState(data.pan ?? { x: 0, y: 0 });

  const [cutImage, setCutImage] = useState<string | null>(data.image || null);
  const [isExpanded, setIsExpanded] = useState(data.isExpanded !== undefined ? data.isExpanded : true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const { getNodes, setNodes } = useReactFlow();
  const allEdges = useEdges();
  const incomingEdges = allEdges.filter(e => e.target === id && e.targetHandle === 'image');

  const edge = incomingEdges.length > 0 ? incomingEdges[0] : null;
  const nodes = useNodes();
  const sourceNode = edge ? nodes.find(n => n.id === edge.source) : null;
  const sourceDataAny = sourceNode?.data as any;
  let imageUrl = sourceDataAny?.image || sourceDataAny?.outputImage || sourceDataAny?.resultUrl || sourceDataAny?.imageUrl;
  if (sourceDataAny?.images && edge?.sourceHandle) {
    imageUrl = sourceDataAny.images[edge.sourceHandle] || imageUrl;
  }

  // Register limits
  useEffect(() => {
    if (!data.limits || !data.limits.zoom) {
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, limits: { 
            ...n.data.limits, 
            zoom: { min: 100, max: 1000, step: 1 },
            opacity: { min: 0, max: 1, step: 0.1 },
            feather: { min: 1, max: 5, step: 1 }
        } } 
      } : n));
    }
  }, []);

  const zoomEdge = allEdges.find(e => e.target === id && e.targetHandle === 'zoom');
  const zoomSourceNode = zoomEdge ? nodes.find(n => n.id === zoomEdge.source) : null;
  const hasZoomConnection = !!zoomSourceNode;
  
  const opacityEdge = allEdges.find(e => e.target === id && e.targetHandle === 'opacity');
  const opacitySourceNode = opacityEdge ? nodes.find(n => n.id === opacityEdge.source) : null;
  const hasOpacityConnection = !!opacitySourceNode;
  
  const featherEdge = allEdges.find(e => e.target === id && e.targetHandle === 'feather');
  const featherSourceNode = featherEdge ? nodes.find(n => n.id === featherEdge.source) : null;
  const hasFeatherConnection = !!featherSourceNode;

  useEffect(() => {
    let shouldUpdate = false;
    let newZoom = zoom;
    let newOpacity = opacity;
    let newFeather = feather;

    const zoomDataAny = zoomSourceNode?.data as any;
    const opacityDataAny = opacitySourceNode?.data as any;
    const featherDataAny = featherSourceNode?.data as any;

    if (hasZoomConnection && zoomDataAny?.value !== undefined) {
      let val = zoomDataAny.value;
      if (zoomDataAny.mode === 'slider') {
        val = 100 + (val / 100) * (1000 - 100);
      }
      val = Math.min(Math.max(val, 100), 1000);
      if (!isNaN(val) && Math.abs(val - zoom) > 0.001) { newZoom = val; shouldUpdate = true; }
    }
    if (hasOpacityConnection && opacityDataAny?.value !== undefined) {
      let val = opacityDataAny.value;
      if (opacityDataAny.mode === 'slider') {
        val = 0 + (val / 100) * (1 - 0);
      }
      val = Math.min(Math.max(val, 0), 1);
      if (!isNaN(val) && Math.abs(val - opacity) > 0.001) { newOpacity = val; shouldUpdate = true; }
    }
    if (hasFeatherConnection && featherDataAny?.value !== undefined) {
      let val = featherDataAny.value;
      if (featherDataAny.mode === 'slider') {
        val = 1 + (val / 100) * (5 - 1);
      }
      val = Math.min(Math.max(val, 1), 5);
      if (!isNaN(val) && Math.abs(val - feather) > 0.001) { newFeather = val; shouldUpdate = true; }
    }

    if (shouldUpdate) {
      setZoom(newZoom);
      setOpacity(newOpacity);
      setFeather(newFeather);
    }
  }, [
    hasZoomConnection, (zoomSourceNode?.data as any)?.value, (zoomSourceNode?.data as any)?.mode, zoom,
    hasOpacityConnection, (opacitySourceNode?.data as any)?.value, (opacitySourceNode?.data as any)?.mode, opacity,
    hasFeatherConnection, (featherSourceNode?.data as any)?.value, (featherSourceNode?.data as any)?.mode, feather,
    id, setNodes
  ]);

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
      return Math.min(Math.max(newZoom, 100), 1000);
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
        data: { ...n.data, image: resultDataUrl }
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

      <div className="p-4 pb-0">
        {/* Top Panel: Inputs */}
        <div className="flex flex-col gap-1">
          <div className="relative flex items-center h-6">
            <Handle type="target" position={Position.Left} id="image" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">Image Input</span>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4 pt-2">
          <div className="space-y-3">
            <div className="space-y-1 relative">
              <div className="relative flex justify-between items-center w-full">
                <Handle type="target" position={Position.Left} id="zoom" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderColor: '#7f1d1d', borderWidth: '2px' }} />
                <span className="text-xs text-emerald-200/80 mb-1 ml-1 font-medium">Zoom</span>
                <span className="text-xs text-emerald-200/80 mb-1">
                  {Number(zoom.toFixed(2))}% {hasZoomConnection && '(100/1000)'}
                </span>
              </div>
              {!hasZoomConnection && (
                <input type="range" min="100" max="1000" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="nodrag w-full accent-emerald-500" />
              )}
            </div>

            <div className="space-y-1 relative">
              <div className="relative flex justify-between items-center w-full">
                <Handle type="target" position={Position.Left} id="opacity" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderColor: '#7f1d1d', borderWidth: '2px' }} />
                <span className="text-xs text-emerald-200/80 mb-1 ml-1 font-medium">Mask Opacity</span>
                <span className="text-xs text-emerald-200/80 mb-1">
                  {Number((opacity * 100).toFixed(2))}% {hasOpacityConnection && '(0/100)'}
                </span>
              </div>
              {!hasOpacityConnection && (
                <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="nodrag w-full accent-emerald-500" />
              )}
            </div>

            <div className="space-y-1 relative">
              <div className="relative flex justify-between items-center w-full">
                <Handle type="target" position={Position.Left} id="feather" className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderColor: '#7f1d1d', borderWidth: '2px' }} />
                <span className="text-xs text-emerald-200/80 mb-1 ml-1 font-medium">Feather (px)</span>
                <span className="text-xs text-emerald-200/80 mb-1">
                  {Number(feather.toFixed(2))} {hasFeatherConnection && '(1/5)'}
                </span>
              </div>
              {!hasFeatherConnection && (
                <input type="range" min="1" max="5" value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="nodrag w-full accent-emerald-500" />
              )}
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
            <div className="bg-black border border-emerald-500/20 rounded-lg p-2 relative group">
              <div className="text-[10px] text-emerald-200/40 uppercase font-bold mb-2">Cut Result</div>
              <div className="relative overflow-hidden rounded">
                <img src={cutImage} alt="Cut Result" className="w-full" style={{ imageRendering: 'pixelated' }} />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <a
                    href={cutImage}
                    download="Tile_Cut.png"
                    className="bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-xl transition-transform hover:scale-105 pointer-events-auto"
                  >
                    <Download className="w-6 h-6" />
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCut}
              disabled={!imageUrl}
              className="nodrag flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 text-white text-sm font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 transition-all"
            >
              <Scissors className="w-4 h-4" />
              CUT
            </button>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} id="image-out" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
    </div>
  );
}

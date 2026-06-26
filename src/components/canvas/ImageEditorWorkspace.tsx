import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Layers, Eye, EyeOff, Move, RotateCw, Maximize, Hand, Search, MousePointer2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Node, Edge } from "reactflow";
import { executeNode } from "@/lib/node-executor";

interface LayerData {
  id: string; // matches handleId
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  name: string;
}

interface WorkspaceProps {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  onExit: () => void;
}

type ToolMode = "select" | "pan" | "zoom";

interface InteractiveState {
  type: "translate" | "rotate" | "scale_uniform" | "scale_handle" | "pan" | "zoom";
  startMouse: { x: number; y: number };
  currentMouse?: { x: number; y: number };
  startValue: any; // Context specific: layer state or viewport state
  handle?: string; // e.g. "nw", "n", "ne", "e", "se", "s", "sw", "w"
}

function TransformPanel({ layer, image, onChange }: { layer: LayerData, image: any, onChange: (updates: Partial<LayerData>) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!layer || !image) return null;
  
  return (
    <div 
      className="absolute bottom-4 right-4 w-56 bg-[#15101f]/90 backdrop-blur-md border border-emerald-500/20 shadow-2xl rounded-lg overflow-hidden z-50"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="bg-black/40 p-2 px-3 flex justify-between items-center cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors" onClick={() => setCollapsed(!collapsed)}>
        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Transform</span>
        {collapsed ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
      </div>
      {!collapsed && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-[10px] text-gray-500 uppercase block mb-1">Res (W)</label>
               <div className="bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-gray-500 cursor-not-allowed font-mono">
                 {Math.round(image.width)}px
               </div>
            </div>
            <div>
               <label className="text-[10px] text-gray-500 uppercase block mb-1">Res (H)</label>
               <div className="bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-gray-500 cursor-not-allowed font-mono">
                 {Math.round(image.height)}px
               </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-[10px] text-gray-500 uppercase block mb-1">Loc X</label>
               <input type="number" value={Math.round(layer.x)} onChange={(e) => onChange({ x: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
            </div>
            <div>
               <label className="text-[10px] text-gray-500 uppercase block mb-1">Loc Y</label>
               <input type="number" value={Math.round(layer.y)} onChange={(e) => onChange({ y: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-[10px] text-gray-500 uppercase block mb-1">Scale W</label>
               <input type="number" step="0.1" value={parseFloat(layer.scaleX.toFixed(3))} onChange={(e) => onChange({ scaleX: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
            </div>
            <div>
               <label className="text-[10px] text-gray-500 uppercase block mb-1">Scale H</label>
               <input type="number" step="0.1" value={parseFloat(layer.scaleY.toFixed(3))} onChange={(e) => onChange({ scaleY: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
            </div>
          </div>

          <div>
             <label className="text-[10px] text-gray-500 uppercase block mb-1">Rotation (deg)</label>
             <input type="number" value={Math.round(layer.rotation)} onChange={(e) => onChange({ rotation: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
          </div>

          <div className="pt-2 border-t border-white/10">
             <div className="flex justify-between items-center mb-1">
               <span className="text-[10px] text-gray-500 uppercase font-bold">Opacity</span>
               <span className="text-[10px] font-mono text-emerald-400">{Math.round(layer.opacity * 100)}%</span>
             </div>
             <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
          </div>

          <div className="pt-2 border-t border-white/10 flex justify-center">
             <button onClick={() => onChange({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })} className="text-[10px] text-gray-400 hover:text-white uppercase tracking-wider underline">Reset Transform</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImageEditorWorkspace({ nodeId, nodes, edges, setNodes, onExit }: WorkspaceProps) {
  const node = nodes.find(n => n.id === nodeId);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [layerImages, setLayerImages] = useState<Record<string, { src: string, width: number, height: number }>>({});
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | null>(null);
  
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [interactive, setInteractive] = useState<InteractiveState | null>(null);
  
  const [viewport, setViewport] = useState({ panX: 0, panY: 0, zoom: 1 });

  // Initialize
  useEffect(() => {
    if (!node) return;
    
    const imageInputs: string[] = node.data.imageInputs || [];
    const savedLayers: any[] = node.data.layers || [];
    const newLayerImages: Record<string, { src: string, width: number, height: number }> = {};
    
    // Load images to get dimensions
    let loadedCount = 0;
    const totalToLoad = imageInputs.length;
    
    const finishInit = () => {
      const mergedLayers: LayerData[] = imageInputs.map((handleId, index) => {
        const existing = savedLayers.find(l => l.id === handleId);
        if (existing) {
          return {
            ...existing,
            scaleX: existing.scaleX !== undefined ? existing.scaleX : (existing.scale !== undefined ? existing.scale : 1),
            scaleY: existing.scaleY !== undefined ? existing.scaleY : (existing.scale !== undefined ? existing.scale : 1),
          };
        }
        
        return {
          id: handleId,
          name: `Layer ${index + 1}`,
          x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: index, visible: true
        };
      });
      
      setLayers(mergedLayers);
      if (!selectedLayerId && mergedLayers.length > 0) {
        setSelectedLayerId(mergedLayers[mergedLayers.length - 1].id);
      }
    };

    if (totalToLoad === 0) finishInit();

    imageInputs.forEach(handleId => {
      const edge = edges.find(e => e.target === nodeId && e.targetHandle === handleId);
      if (edge) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          const imgUrl = sourceNode.data.image || sourceNode.data.outputImage || "";
          if (imgUrl) {
            const img = new Image();
            img.onload = () => {
              newLayerImages[handleId] = { src: imgUrl, width: img.width, height: img.height };
              setLayerImages({ ...newLayerImages });
              loadedCount++;
              if (loadedCount === totalToLoad) finishInit();
            };
            img.onerror = () => {
              loadedCount++;
              if (loadedCount === totalToLoad) finishInit();
            };
            img.src = imgUrl;
            return;
          }
        }
      }
      loadedCount++;
      if (loadedCount === totalToLoad) finishInit();
    });
  }, []); 

  // Auto-sync
  const saveLayersToNode = useCallback(async (newLayers: LayerData[]) => {
    setLayers(newLayers);
    
    let outputImage = node?.data.outputImage;
    try {
      const inputs = { textInputs: [], imageInputs: [], namedInputs: {} as any };
      for (const layer of newLayers) {
         if (layerImages[layer.id]) {
            inputs.namedInputs[layer.id] = { image: layerImages[layer.id].src };
         }
      }
      
      const nodeData = node ? node.data : {};
      const result = await executeNode('imageEditor', { ...nodeData, layers: newLayers }, inputs, {});
      if (result.success && result.data?.image) {
         outputImage = result.data.image;
      }
    } catch (e) {
      console.warn("Failed to auto-update composite", e);
    }
    
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, layers: newLayers, outputImage } } : n));
  }, [nodeId, setNodes, node, layerImages]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toLowerCase();
      if (key === 'v') setToolMode("select");
      else if (key === 'g') setToolMode("select"); // Keep G, R, S acting as interactive triggers
      else if (key === 'r') setToolMode("select");
      else if (key === 's') setToolMode("select");

      if (!selectedLayerId) return;
      const layer = layers.find(l => l.id === selectedLayerId);
      if (!layer) return;

      // Blender-style immediate interactive mode
      if (key === 'g' || key === 'r' || key === 's') {
        // Need to get mouse position. Since we don't have it, we set a flag that the next mousemove sets the anchor
        setInteractive({
          type: key === 'g' ? 'translate' : (key === 'r' ? 'rotate' : 'scale_uniform'),
          startMouse: { x: NaN, y: NaN }, // wait for first mousemove
          startValue: { ...layer }
        });
      }

      if (e.key === 'Escape' || e.key === 'Enter') {
        if (interactive) {
          if (e.key === 'Escape' && interactive.startValue.x !== undefined) {
             // Revert
             const reverted = layers.map(l => l.id === selectedLayerId ? interactive.startValue : l);
             setLayers(reverted);
          } else {
             // Commit
             saveLayersToNode(layers);
          }
          setInteractive(null);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerId, interactive, layers, toolMode]);

  // Viewport Wheel Handling
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || toolMode === "zoom") {
      // Zoom
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setViewport(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(10, prev.zoom * zoomFactor)) }));
    } else if (e.buttons === 4 || toolMode === "pan") {
      // Pan with wheel drag handled in mouse events, but normal scrolling can pan Y if desired.
      // Here we just let normal wheel pan the canvas if no ctrl
      setViewport(prev => ({ ...prev, panX: prev.panX - e.deltaX, panY: prev.panY - e.deltaY }));
    } else {
       // Default scroll zooms if we want simple behavior, or pans
       const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
       setViewport(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(10, prev.zoom * zoomFactor)) }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || toolMode === "pan") {
      e.preventDefault();
      setInteractive({
        type: "pan",
        startMouse: { x: e.clientX, y: e.clientY },
        startValue: { ...viewport }
      });
      return;
    }

    if (toolMode === "zoom") {
      setInteractive({
        type: "zoom",
        startMouse: { x: e.clientX, y: e.clientY },
        startValue: { ...viewport }
      });
      return;
    }

    if (!selectedLayerId) return;
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return;

    if (toolMode === "select") {
       // If clicking the canvas background, deselect
       setSelectedLayerId(null);
       return;
    }

    // Fallback for pan/zoom if they somehow got here
    setInteractive({
      type: "translate",
      startMouse: { x: e.clientX, y: e.clientY },
      startValue: { ...layer }
    });
  };

  const startInteractive = (e: React.MouseEvent, type: string, layerId: string) => {
    e.stopPropagation();
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    setSelectedLayerId(layerId);
    setInteractive({
      type: type as any,
      startMouse: { x: e.clientX, y: e.clientY },
      startValue: { ...layer }
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!interactive) return;

    if (isNaN(interactive.startMouse.x)) {
       setInteractive({ ...interactive, startMouse: { x: e.clientX, y: e.clientY }, currentMouse: { x: e.clientX, y: e.clientY } });
       return;
    }

    setInteractive(prev => prev ? { ...prev, currentMouse: { x: e.clientX, y: e.clientY } } : null);

    const dx = e.clientX - interactive.startMouse.x;
    const dy = e.clientY - interactive.startMouse.y;

    if (interactive.type === "pan") {
      setViewport({
        ...viewport,
        panX: interactive.startValue.panX + dx,
        panY: interactive.startValue.panY + dy
      });
      return;
    }

    if (interactive.type === "zoom") {
      const zoomDelta = dx * 0.01;
      setViewport({
        ...viewport,
        zoom: Math.max(0.1, Math.min(10, interactive.startValue.zoom + zoomDelta))
      });
      return;
    }

    // Layer transforms
    if (!selectedLayerId) return;

    // Viewport zoom affects how mouse movement translates to layer pixels
    const worldDx = dx / viewport.zoom;
    const worldDy = dy / viewport.zoom;

    const updatedLayers = layers.map(l => {
      if (l.id === selectedLayerId) {
        if (interactive.type === "translate") {
          return { ...l, x: interactive.startValue.x + worldDx, y: interactive.startValue.y + worldDy };
        } else if (interactive.type === "rotate") {
          if (!containerRef.current) return l;
          const rect = containerRef.current.getBoundingClientRect();
          const originX = rect.left + rect.width / 2 + viewport.panX;
          const originY = rect.top + rect.height / 2 + viewport.panY;
          
          const layerScreenX = originX + interactive.startValue.x * viewport.zoom;
          const layerScreenY = originY + interactive.startValue.y * viewport.zoom;
          
          const startAngle = Math.atan2(
            interactive.startMouse.y - layerScreenY, 
            interactive.startMouse.x - layerScreenX
          );
          
          const currentAngle = Math.atan2(
            e.clientY - layerScreenY, 
            e.clientX - layerScreenX
          );
          
          let angleDiff = (currentAngle - startAngle) * 180 / Math.PI;
          if (angleDiff > 180) angleDiff -= 360;
          if (angleDiff < -180) angleDiff += 360;
          
          return { ...l, rotation: interactive.startValue.rotation + angleDiff };
        } else if (interactive.type === "scale_uniform") {
          const scaleDelta = (worldDx - worldDy) * 0.005;
          const sX = Math.max(0.01, interactive.startValue.scaleX + scaleDelta);
          const sY = Math.max(0.01, interactive.startValue.scaleY + scaleDelta);
          return { ...l, scaleX: sX, scaleY: sY };
        } else if (interactive.type === "scale_handle") {
          const h = interactive.handle!;
          let { scaleX, scaleY } = interactive.startValue;
          const imgData = layerImages[l.id];
          if (!imgData) return l;

          // Base dimensions before scale
          const w = imgData.width;
          const h_px = imgData.height;

          // How much we stretched in local space.
          // Since pivot is center, dragging the right edge by dx changes width by dx * 2.
          // Handle rotation? Math is complex. Let's do simple aligned stretching.
          // A real photoshop box rotates, making local delta math tricky. We'll approximate by un-rotating the delta.
          const rad = -l.rotation * Math.PI / 180;
          const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad);
          const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad);

          // Change in width/height
          let deltaW = 0; let deltaH = 0;
          if (h.includes('e')) deltaW = localDx * 2;
          if (h.includes('w')) deltaW = -localDx * 2;
          if (h.includes('s')) deltaH = localDy * 2;
          if (h.includes('n')) deltaH = -localDy * 2;

          let newScaleX = scaleX + (deltaW / w);
          let newScaleY = scaleY + (deltaH / h_px);

          if (e.shiftKey) {
             const maxS = Math.max(Math.abs(newScaleX), Math.abs(newScaleY));
             newScaleX = Math.sign(newScaleX) * maxS || maxS;
             newScaleY = Math.sign(newScaleY) * maxS || maxS;
          }

          return { ...l, scaleX: newScaleX, scaleY: newScaleY };
        }
      }
      return l;
    });
    setLayers(updatedLayers);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (interactive) {
      if (interactive.type !== "pan" && interactive.type !== "zoom") {
        saveLayersToNode(layers);
      }
      setInteractive(null);
    }
  };

  const startHandleDrag = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return;
    setInteractive({
      type: "scale_handle",
      startMouse: { x: e.clientX, y: e.clientY },
      startValue: { ...layer },
      handle
    });
  };

  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  const reorderLayers = (draggedId: string, targetId: string, position: 'top' | 'bottom') => {
    if (draggedId === targetId) return;
    
    let newSorted = [...sortedLayers];
    const draggedIdx = newSorted.findIndex(l => l.id === draggedId);
    if (draggedIdx < 0) return;
    
    const [draggedLayer] = newSorted.splice(draggedIdx, 1);
    
    const targetIdx = newSorted.findIndex(l => l.id === targetId);
    if (targetIdx < 0) return;
    
    const insertIdx = position === 'top' ? targetIdx : targetIdx + 1;
    newSorted.splice(insertIdx, 0, draggedLayer);
    
    const updatedLayers = [...layers];
    newSorted.reverse().forEach((l, i) => {
       const actualLayer = updatedLayers.find(ll => ll.id === l.id);
       if (actualLayer) actualLayer.zIndex = i;
    });
    
    saveLayersToNode(updatedLayers);
  };

  return (
    <div 
      className="absolute inset-0 bg-[#0f0a14] text-white flex flex-col overflow-hidden select-none"
    >
      <div className="h-14 bg-[#1a1525] border-b border-emerald-500/20 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="p-2 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 rounded">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h1 className="font-bold uppercase tracking-widest text-sm text-emerald-100">Image Editor</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Layer Panel */}
        <div className="w-64 bg-[#15101f] border-r border-emerald-500/20 flex flex-col z-40">
          <div className="p-3 border-b border-white/5 bg-black/20">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Layers</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sortedLayers.map(layer => (
              <div 
                key={layer.id}
                draggable
                onDragStart={(e) => {
                   setDraggedLayerId(layer.id);
                   e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                   setDraggedLayerId(null);
                   setDropTargetId(null);
                   setDropPosition(null);
                }}
                onDragOver={(e) => {
                   e.preventDefault();
                   if (draggedLayerId === layer.id) return;
                   const rect = e.currentTarget.getBoundingClientRect();
                   const mid = rect.top + rect.height / 2;
                   setDropTargetId(layer.id);
                   setDropPosition(e.clientY < mid ? 'top' : 'bottom');
                }}
                onDrop={(e) => {
                   e.preventDefault();
                   if (draggedLayerId && dropTargetId && dropPosition) {
                      reorderLayers(draggedLayerId, dropTargetId, dropPosition);
                   }
                   setDraggedLayerId(null);
                   setDropTargetId(null);
                   setDropPosition(null);
                }}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`relative p-2 rounded flex items-center gap-2 cursor-pointer border transition-colors ${selectedLayerId === layer.id ? 'bg-emerald-900/30 border-emerald-500/50' : 'bg-black/20 border-transparent hover:bg-white/5'}`}
              >
                {dropTargetId === layer.id && dropPosition === 'top' && (
                   <div className="absolute top-[-1px] left-0 right-0 h-[2px] bg-amber-400 z-10" />
                )}
                {dropTargetId === layer.id && dropPosition === 'bottom' && (
                   <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-amber-400 z-10" />
                )}
                <div className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing">
                   <GripVertical className="w-4 h-4" />
                </div>
                <div className="w-10 h-10 bg-black/40 rounded flex-shrink-0" style={{ backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`, backgroundSize: '8px 8px' }}>
                  {layerImages[layer.id] && <img src={layerImages[layer.id].src} className="w-full h-full object-contain" draggable={false} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-gray-200">{layer.name}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); const nl = layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l); saveLayersToNode(nl); }} className="p-1 hover:text-white text-gray-400">
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="w-12 bg-[#1a1525] border-r border-emerald-500/20 flex flex-col items-center py-4 gap-4 z-40">
          <button onClick={() => setToolMode("select")} className={`p-2 rounded-lg ${toolMode === "select" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Select (V)"><MousePointer2 className="w-5 h-5" /></button>
          <div className="w-6 h-px bg-white/10 my-1" />
          <button onClick={() => setToolMode("pan")} className={`p-2 rounded-lg ${toolMode === "pan" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Pan"><Hand className="w-5 h-5" /></button>
          <button onClick={() => setToolMode("zoom")} className={`p-2 rounded-lg ${toolMode === "zoom" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Zoom"><Search className="w-5 h-5" /></button>
        </div>

        {/* Central Canvas */}
        <div 
          className="flex-1 relative flex items-center justify-center overflow-hidden cursor-crosshair"
          style={{ backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`, backgroundSize: '32px 32px' }}
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Viewport Transform Wrapper */}
          <div 
            className="absolute origin-center"
            style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}
          >
             {/* Center anchor point representing (0,0) */}
             <div className="absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500/50 rounded-full z-[100] pointer-events-none" />
             
             {[...layers].sort((a, b) => a.zIndex - b.zIndex).map(layer => {
               if (!layer.visible || !layerImages[layer.id]) return null;
               
               const imgData = layerImages[layer.id];
               const isSelected = selectedLayerId === layer.id;
               const showScaleHandles = isSelected && toolMode === "scale";

               return (
                 <div 
                   key={layer.id}
                   className="absolute origin-center"
                   style={{
                     transform: `translate(${layer.x}px, ${layer.y}px) rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
                     width: imgData.width,
                     height: imgData.height,
                     left: -imgData.width / 2,
                     top: -imgData.height / 2,
                     opacity: layer.opacity,
                   }}
                 >
                   <img src={imgData.src} className="w-full h-full pointer-events-none" draggable={false} />
                   
                   {/* Layer Interactions */}
                   {toolMode === "select" && (
                     <>
                       {/* Unselected Layer Click Target */}
                       {!isSelected && (
                         <div 
                           className="absolute inset-0 cursor-pointer pointer-events-auto"
                           onMouseDown={(e) => startInteractive(e, 'translate', layer.id)}
                         />
                       )}

                       {/* Selected Layer Controls */}
                       {isSelected && (
                         <>
                           {/* Rotate Zone (outer padding) */}
                           <div 
                             className="absolute top-1/2 left-1/2 pointer-events-auto"
                             style={{ 
                               width: imgData.width * Math.abs(layer.scaleX) + 48, 
                               height: imgData.height * Math.abs(layer.scaleY) + 48,
                               transform: `translate(-50%, -50%) scale(${1/Math.abs(layer.scaleX)}, ${1/Math.abs(layer.scaleY)})`,
                               cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3'/%3E%3C/svg%3E") 12 12, crosshair`
                             }}
                             onMouseDown={(e) => startInteractive(e, 'rotate', layer.id)}
                           />
                           
                           {/* Translate Zone & Bounding Box */}
                           <div 
                             className="absolute top-1/2 left-1/2 border border-emerald-400 cursor-move pointer-events-auto"
                             style={{ 
                               width: imgData.width * Math.abs(layer.scaleX), 
                               height: imgData.height * Math.abs(layer.scaleY),
                               transform: `translate(-50%, -50%) scale(${1/Math.abs(layer.scaleX)}, ${1/Math.abs(layer.scaleY)})`
                             }}
                             onMouseDown={(e) => startInteractive(e, 'translate', layer.id)}
                           >
                             <div className="absolute inset-0 pointer-events-none">
                               {/* Corners */}
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 -top-1.5 -left-1.5 cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'nw')} />
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 -top-1.5 -right-1.5 cursor-nesw-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'ne')} />
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 -bottom-1.5 -left-1.5 cursor-nesw-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'sw')} />
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 -bottom-1.5 -right-1.5 cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'se')} />
                               
                               {/* Edges */}
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 -top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'n')} />
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 -bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 's')} />
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'w')} />
                               <div className="absolute w-3 h-3 bg-white border-2 border-emerald-500 top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize pointer-events-auto" onMouseDown={(e) => startHandleDrag(e, 'e')} />
                             </div>
                           </div>
                         </>
                       )}
                     </>
                   )}
                 </div>
               );
             })}
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs font-mono text-gray-400 bg-black/60 px-4 py-2 rounded-full border border-white/10 backdrop-blur-sm pointer-events-none">
             <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
             <span className="w-px h-4 bg-white/20" />
             <span><span className="text-white font-bold">V</span> Select</span>
             <span><span className="text-white font-bold">G</span> Move</span>
              <span><span className="text-white font-bold">R</span> Rotate</span>
             <span><span className="text-white font-bold">S</span> Scale</span>
             <span><span className="text-white font-bold">Shift</span> Uniform</span>
          </div>

          {/* Rotation Helper Line */}
          {interactive?.type === "rotate" && interactive.currentMouse && containerRef.current && selectedLayerId && (
             <svg className="absolute inset-0 w-full h-full pointer-events-none z-[200]">
               {(() => {
                  const layer = layers.find(l => l.id === selectedLayerId);
                  if (!layer) return null;
                  const rect = containerRef.current.getBoundingClientRect();
                  const originX = rect.width / 2 + viewport.panX;
                  const originY = rect.height / 2 + viewport.panY;
                  
                  // Need to use startValue.x/y since the layer.x/y doesn't change during rotation, but using startValue is more precise
                  const layerScreenX = originX + interactive.startValue.x * viewport.zoom;
                  const layerScreenY = originY + interactive.startValue.y * viewport.zoom;

                  const mouseLocalX = interactive.currentMouse.x - rect.left;
                  const mouseLocalY = interactive.currentMouse.y - rect.top;

                  return (
                    <>
                       <line 
                         x1={layerScreenX} y1={layerScreenY} 
                         x2={mouseLocalX} y2={mouseLocalY} 
                         stroke="#34d399" strokeWidth="2" strokeDasharray="6 4"
                         className="opacity-70"
                       />
                       <circle cx={layerScreenX} cy={layerScreenY} r="4" fill="#34d399" />
                       <circle cx={mouseLocalX} cy={mouseLocalY} r="4" fill="#34d399" />
                    </>
                  );
               })()}
             </svg>
          )}

          {/* Transform Panel */}
          {selectedLayerId && (
            <TransformPanel 
               layer={layers.find(l => l.id === selectedLayerId)!}
               image={layerImages[selectedLayerId]}
               onChange={(updates) => {
                 const newLayers = layers.map(l => l.id === selectedLayerId ? { ...l, ...updates } : l);
                 saveLayersToNode(newLayers);
               }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

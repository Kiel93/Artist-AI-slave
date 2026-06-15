import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { Settings, Dices, RefreshCw, Trash2, Upload, Download, Image as ImageIcon, Sliders, Box, Scaling, Eye, Pencil, Eraser, Move, ZoomIn, ChevronDown, AlertTriangle, DownloadCloud } from "lucide-react";
import { MapParameters, MapAsset, ObjectAsset, SelectionState } from "./MapGeneratorWorkspace";
import { getTask } from "@/lib/store";
import { exportToUnity } from "@/utils/UnityExporter";

interface ParameterUIProps {
  parameters: MapParameters;
  setParameters: (params: MapParameters) => void;
  groundAsset: MapAsset | null;
  setGroundAsset: (asset: MapAsset | null) => void;
  oceanAsset: MapAsset | null;
  setOceanAsset: (asset: MapAsset | null) => void;
  objectAssets: ObjectAsset[];
  activeSelection: SelectionState;
  setActiveSelection?: (state: SelectionState) => void;
  onRequestReplaceNode?: (assetId: string) => void;
  hasManualEdits: boolean;
  onClearManualEdits: () => void;
  onClearOceanOverrides?: (level: number) => void;
  objectStats?: Record<string, number>;
  decalAssets?: any[];
  setDecalAssets?: (assets: any[]) => void;
  setObjectAssets?: (assets: ObjectAsset[]) => void;
  onSpawnObjects?: (assetId: string, amount: number) => void;
  decalOverrides?: Record<string, any>;
  mapDataRef?: React.MutableRefObject<{ gridLevels: any, objectInstances?: any[] }>;
}

interface ShadowResult {
  url: string;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

const bakeTransformToDataUrl = async (sourceUrl: string, scale: number): Promise<string> => {
  if (!sourceUrl || scale === 1) return sourceUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = img.width * scale;
        const H = img.height * scale;
        if (W <= 0 || H <= 0) {
          resolve(sourceUrl);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, W, H);

        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        console.error("Failed to bake transform", e);
        resolve(sourceUrl);
      }
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
};

const applyShadow = async (sourceUrl: string, enabled: boolean, method: string, blur: number, fade: number, skew: number, opacity: number, scaleX: number, scaleY: number): Promise<ShadowResult | null> => {
  if (!enabled || method !== "simple_transform" || !sourceUrl) return null;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = img.width;
        const H = img.height;

        const sY = Math.max(0.1, scaleY / 100);
        const sX = Math.max(0.1, scaleX / 100);
        const skewRad = skew * Math.PI / 180;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = W;
        tempCanvas.height = H;
        const tempCtx = tempCanvas.getContext("2d")!;

        tempCtx.drawImage(img, 0, 0, W, H);
        tempCtx.globalCompositeOperation = "source-in";
        tempCtx.fillStyle = "rgba(0, 0, 0, 1)";
        tempCtx.fillRect(0, 0, W, H);

        if (fade > 0) {
          tempCtx.globalCompositeOperation = "destination-in";
          const gradient = tempCtx.createLinearGradient(0, 0, 0, H);
          const topAlpha = Math.max(0, 1 - (fade / 100));
          gradient.addColorStop(0, `rgba(0,0,0,${topAlpha})`);
          gradient.addColorStop(1, "rgba(0,0,0,1)");
          tempCtx.fillStyle = gradient;
          tempCtx.fillRect(0, 0, W, H);
        }

        const transformPoint = (x: number, y: number) => {
          return {
            x: x * sX + y * sY * Math.tan(skewRad),
            y: y * sY
          };
        };

        const p1 = transformPoint(0, 0);
        const p2 = transformPoint(W, 0);
        const p3 = transformPoint(0, H);
        const p4 = transformPoint(W, H);

        const minX = Math.min(p1.x, p2.x, p3.x, p4.x) - blur * 2;
        const maxX = Math.max(p1.x, p2.x, p3.x, p4.x) + blur * 2;
        const minY = Math.min(p1.y, p2.y, p3.y, p4.y) - blur * 2;
        const maxY = Math.max(p1.y, p2.y, p3.y, p4.y) + blur * 2;

        const outW = Math.ceil(maxX - minX);
        const outH = Math.ceil(maxY - minY);

        const anchor = transformPoint(W / 2, H);
        const finalAnchorX = anchor.x - minX;
        const finalAnchorY = anchor.y - minY;

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d")!;

        ctx.save();
        ctx.translate(-minX, -minY);
        ctx.transform(sX, 0, sY * Math.tan(skewRad), sY, 0, 0);

        if (blur > 0) ctx.filter = `blur(${blur}px)`;
        ctx.globalAlpha = opacity / 100;
        ctx.drawImage(tempCanvas, 0, 0, W, H);
        ctx.restore();

        resolve({
          url: canvas.toDataURL("image/png"),
          anchorX: finalAnchorX,
          anchorY: finalAnchorY,
          width: outW,
          height: outH
        });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = sourceUrl;
  });
};

function ObjectShadowEditor({ asset, updateAsset }: { asset: ObjectAsset, updateAsset: (id: string, updates: Partial<ObjectAsset>) => void }) {
  const [isMethodMenuOpen, setIsMethodMenuOpen] = useState(false);
  const SHADOW_METHODS = [{ id: "simple_transform", name: "Simple Transform" }];

  const enabled = asset.shadowEnabled || false;
  const method = asset.shadowMethod || "simple_transform";
  const blur = asset.shadowBlur ?? 5;
  const fade = asset.shadowFade ?? 50;
  const skew = asset.shadowSkew ?? -35;
  const opacity = asset.shadowOpacity ?? 30;
  const scaleY = asset.shadowScaleY ?? 33;
  const scaleX = asset.shadowScaleX ?? 100;
  const offsetX = asset.shadowOffsetX ?? 0;
  const offsetY = asset.shadowOffsetY ?? 0;

  useEffect(() => {
    let active = true;
    if (enabled) {
      applyShadow(asset.imageUrl, enabled, method, blur, fade, skew, opacity, scaleX, scaleY)
        .then(result => {
          if (active && result && result.url !== asset.shadowImageUrl) {
            updateAsset(asset.id, {
              shadowImageUrl: result.url,
              shadowAnchorX: result.anchorX,
              shadowAnchorY: result.anchorY,
              shadowWidth: result.width,
              shadowHeight: result.height
            });
          }
        }).catch(err => console.error("Shadow error:", err));
    } else {
      if (asset.shadowImageUrl !== undefined) {
        updateAsset(asset.id, { shadowImageUrl: undefined, shadowAnchorX: undefined, shadowAnchorY: undefined, shadowWidth: undefined, shadowHeight: undefined });
      }
    }
    return () => { active = false; };
  }, [asset.imageUrl, enabled, method, blur, fade, skew, opacity, scaleX, scaleY, asset.id, updateAsset, asset.shadowImageUrl]);

  const saveDefault = () => {
    const defaults = { method, blur, fade, skew, opacity, scaleX, scaleY };
    localStorage.setItem("shadow_defaults", JSON.stringify(defaults));
  };

  const loadDefault = () => {
    const data = localStorage.getItem("shadow_defaults");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        updateAsset(asset.id, {
          shadowMethod: parsed.method,
          shadowBlur: parsed.blur,
          shadowFade: parsed.fade,
          shadowSkew: parsed.skew,
          shadowOpacity: parsed.opacity,
          shadowScaleX: parsed.scaleX ?? 100,
          shadowScaleY: parsed.scaleY ?? 33
        });
      } catch (e) { }
    }
  };

  return (
    <div className="space-y-2 bg-black/20 p-2 rounded border border-indigo-500/10 relative z-20">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-indigo-200 font-medium">Cast Shadow</span>
        <button
          onClick={() => updateAsset(asset.id, { shadowEnabled: !enabled })}
          className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-indigo-500' : 'bg-gray-700'}`}
        >
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4.5 left-0.5' : 'left-0.5 translate-x-0'}`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-2 pt-2 border-t border-indigo-500/20">
          <div className="relative z-30">
            <button
              onClick={() => setIsMethodMenuOpen(!isMethodMenuOpen)}
              className="w-full bg-black/40 border border-indigo-500/20 rounded px-2 py-1 flex items-center justify-between hover:border-indigo-500/40 transition-colors"
            >
              <span className="text-[10px] text-indigo-100 font-medium truncate pr-2">
                {SHADOW_METHODS.find(m => m.id === method)?.name || "Method"}
              </span>
              <ChevronDown className={`w-3 h-3 text-indigo-400 transition-transform ${isMethodMenuOpen ? 'rotate-180' : ''} shrink-0`} />
            </button>

            {isMethodMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-indigo-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in">
                {SHADOW_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      updateAsset(asset.id, { shadowMethod: m.id });
                      setIsMethodMenuOpen(false);
                    }}
                    className={`w-full px-2 py-1 text-left text-[10px] transition-colors hover:bg-indigo-600/20 ${method === m.id ? 'text-indigo-400 font-bold bg-indigo-600/10' : 'text-indigo-100/70'
                      }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Blur</span>
              <span className="text-[10px] text-indigo-300">{blur}px</span>
            </div>
            <input
              type="range" min="0" max="20" value={blur}
              onChange={(e) => updateAsset(asset.id, { shadowBlur: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Fade Length</span>
              <span className="text-[10px] text-indigo-300">{fade}%</span>
            </div>
            <input
              type="range" min="0" max="100" value={fade}
              onChange={(e) => updateAsset(asset.id, { shadowFade: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Skew Angle</span>
              <span className="text-[10px] text-indigo-300">{skew}°</span>
            </div>
            <input
              type="range" min="-90" max="90" value={skew}
              onChange={(e) => updateAsset(asset.id, { shadowSkew: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Opacity</span>
              <span className="text-[10px] text-indigo-300">{opacity}%</span>
            </div>
            <input
              type="range" min="0" max="100" value={opacity}
              onChange={(e) => updateAsset(asset.id, { shadowOpacity: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Scale X (Width)</span>
              <span className="text-[10px] text-indigo-300">{scaleX}%</span>
            </div>
            <input
              type="range" min="0" max="200" value={scaleX}
              onChange={(e) => updateAsset(asset.id, { shadowScaleX: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Scale Y (Length)</span>
              <span className="text-[10px] text-indigo-300">{scaleY}%</span>
            </div>
            <input
              type="range" min="0" max="200" value={scaleY}
              onChange={(e) => updateAsset(asset.id, { shadowScaleY: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Offset X (Left/Right)</span>
              <span className="text-[10px] text-indigo-300">{offsetX}%</span>
            </div>
            <input
              type="range" min="-100" max="100" value={offsetX}
              onChange={(e) => updateAsset(asset.id, { shadowOffsetX: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Offset Y (Up/Down)</span>
              <span className="text-[10px] text-indigo-300">{offsetY}%</span>
            </div>
            <input
              type="range" min="-100" max="100" value={offsetY}
              onChange={(e) => updateAsset(asset.id, { shadowOffsetY: parseInt(e.target.value) })}
              className="w-full h-1 bg-indigo-900/50 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={saveDefault}
              className="flex-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[10px] py-1 rounded transition-colors border border-indigo-500/30"
            >
              Make Default
            </button>
            <button
              onClick={loadDefault}
              className="flex-1 bg-black/40 hover:bg-black/60 text-indigo-200 text-[10px] py-1 rounded transition-colors border border-indigo-500/30"
            >
              Load Default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetFootprintEditor({ asset, onChange, onOffsetChange, groundAsset }: { asset: ObjectAsset, onChange: (baseTiles: { lx: number, ly: number }[]) => void, onOffsetChange: (offset: { x: number, y: number }) => void, groundAsset?: any }) {
  const [gridOpacity, setGridOpacity] = useState(0.5);
  const [activeTool, setActiveTool] = useState<'paint' | 'erase' | 'drag'>('paint');
  const [zoom, setZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [imgDims, setImgDims] = useState({ w: 256, h: 256 });
  const [groundImgWidth, setGroundImgWidth] = useState(256);

  useEffect(() => {
    const img = new Image();
    img.src = asset.imageUrl;
    img.onload = () => {
      setImgDims({ w: img.naturalWidth || 256, h: img.naturalHeight || 256 });
    };
  }, [asset.imageUrl]);

  useEffect(() => {
    if (groundAsset && groundAsset.slices && groundAsset.slices[0]) {
      const img = new Image();
      img.src = groundAsset.slices[0].url;
      img.onload = () => {
        setGroundImgWidth(img.naturalWidth || 256);
      };
    }
  }, [groundAsset]);

  const [dragMode, setDragMode] = useState<'none' | 'grid' | 'pan'>('none');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tempOffset, setTempOffset] = useState({ x: 0, y: 0 });

  const limit = Math.max(3, Math.ceil(8 / zoom));
  const baseTiles = asset.baseTiles || [{ lx: 0, ly: 0 }];
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.max(0.5, Math.min(3.0, z - e.deltaY * 0.002)));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);


  const gridOffset = asset.gridOffset || { x: 0, y: 0 };
  const currentOffset = dragMode === 'grid' ? { x: gridOffset.x + tempOffset.x, y: gridOffset.y + tempOffset.y } : gridOffset;

  const handlePolygonPointerDown = (lx: number, ly: number, e: React.PointerEvent) => {
    e.stopPropagation(); // Prevent background click
    if (e.button === 1) {
      setDragMode('pan');
      setDragStart({ x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === 'drag') {
      setDragMode('grid');
      setDragStart({ x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (activeTool === 'paint') {
      if (!isSelected(lx, ly)) {
        onChange([...baseTiles, { lx, ly }]);
      }
    } else if (activeTool === 'erase') {
      const newTiles = baseTiles.filter(t => t.lx !== lx || t.ly !== ly);
      onChange(newTiles.length > 0 ? newTiles : [{ lx: 0, ly: 0 }]);
    }
  };

  const isSelected = (lx: number, ly: number) => {
    return baseTiles.some(t => t.lx === lx && t.ly === ly);
  };

  const svgW = 260;
  const svgH = 220;

  const baseImgW = imgDims.w * (281 / groundImgWidth);
  const baseImgH = imgDims.h * (281 / groundImgWidth);
  // Calculate a fit scale so that 1.0x zoom guarantees the image fits in the 260x220 window with some padding.
  // The bottom anchor is at 180 (svgH - 40), leaving 180px for height, minus 20px top padding = 160.
  // We leave 20px padding on each side for width, so 220 max width.
  const fitScale = Math.min(220 / baseImgW, 160 / baseImgH, 1.0) || 1.0;
  // Cell dimensions in SVG scale inversely with asset.scale so the image size remains locked
  const dx = (140 / 3) / asset.scale;
  const dy = (70 / 3) / asset.scale;

  const anchorY = svgH / 2 + baseImgH / 2;

  // The origin (0,0) of the grid in SVG space
  const originX = svgW / 2 + currentOffset.x;
  const originY = anchorY + currentOffset.y;

  const handleBgPointerDown = (e: React.PointerEvent) => {
    setDragMode('pan');
    setDragStart({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragMode === 'grid') {
      setTempOffset({
        x: (e.clientX - dragStart.x) / (zoom * fitScale),
        y: (e.clientY - dragStart.y) / (zoom * fitScale)
      });
    } else if (dragMode === 'pan') {
      let newPanX = panOffset.x + (e.clientX - dragStart.x) / (zoom * fitScale);
      let newPanY = panOffset.y + (e.clientY - dragStart.y) / (zoom * fitScale);
      const maxPan = 1.2 * Math.max(baseImgW, baseImgH);
      newPanX = Math.max(-maxPan, Math.min(maxPan, newPanX));
      newPanY = Math.max(-maxPan, Math.min(maxPan, newPanY));
      setPanOffset({ x: newPanX, y: newPanY });
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragMode === 'grid') {
      onOffsetChange({
        x: gridOffset.x + tempOffset.x,
        y: gridOffset.y + tempOffset.y
      });
      setTempOffset({ x: 0, y: 0 });
    }
    setDragMode('none');
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const gridCells = [];
  for (let lx = -limit; lx <= limit; lx++) {
    for (let ly = -limit; ly <= limit; ly++) {
      const cx = originX + (lx - ly) * dx;
      const cy = originY - (lx + ly) * dy; // Inverted Y to match engine

      const pts = [
        `${cx},${cy - dy}`,
        `${cx + dx},${cy}`,
        `${cx},${cy + dy}`,
        `${cx - dx},${cy}`
      ].join(" ");

      gridCells.push(
        <polygon
          key={`${lx}-${ly}`}
          points={pts}
          fill={isSelected(lx, ly) ? "rgba(34, 197, 94, 0.5)" : "transparent"}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="1"
          className={`cursor-pointer transition-colors ${activeTool === 'paint' ? 'hover:fill-green-500/70' : activeTool === 'erase' ? 'hover:fill-red-500/70' : ''}`}
          onPointerDown={(e) => handlePolygonPointerDown(lx, ly, e)}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <label className="text-xs text-gray-400">Base Paint</label>
        </div>
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-[var(--color-blender-border)]">
          <button
            className={`p-1.5 rounded ${activeTool === 'paint' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTool('paint')} title="Paint Tile"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            className={`p-1.5 rounded ${activeTool === 'erase' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTool('erase')} title="Erase Tile"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          <button
            className={`p-1.5 rounded ${activeTool === 'drag' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTool('drag')} title="Align Grid"
          >
            <Move className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative w-full flex justify-center bg-black/20 rounded-lg overflow-hidden border border-[var(--color-blender-border)] cursor-crosshair"
        style={{ height: svgH }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          className="absolute inset-0 origin-center"
          style={{ transform: `scale(${zoom * fitScale}) translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          {/* Bottom Interactive SVG */}
          <svg
            width={svgW} height={svgH} overflow="visible"
            className={`absolute inset-0 z-0 touch-none ${activeTool === 'drag' ? 'cursor-move' : 'cursor-default'}`}
            onPointerDown={handleBgPointerDown}
          >
            {gridCells}
          </svg>

          {/* Preview Image */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {asset.shadowEnabled && asset.shadowImageUrl && (
              <img alt="image"
                src={asset.shadowImageUrl}
                className="absolute max-w-none"
                style={{
                  left: svgW / 2 - (asset.shadowAnchorX! * asset.scale) + ((asset.shadowOffsetX || 0) / 100) * 140 * asset.scale,
                  top: anchorY - (asset.shadowAnchorY! * asset.scale) + ((asset.shadowOffsetY || 0) / 100) * 140 * asset.scale,
                  transformOrigin: '0 0',
                  transform: `scale(${asset.scale})`,
                  width: asset.shadowWidth,
                  height: asset.shadowHeight
                }}
              />
            )}
            <img alt="image"
              src={asset.imageUrl}
              className="absolute drop-shadow-2xl max-w-none"
              style={{
                left: svgW / 2,
                top: anchorY,
                transform: 'translate(-50%, -100%)',
                width: `${imgDims.w * (281 / groundImgWidth)}px`,
                height: `${imgDims.h * (281 / groundImgWidth)}px`,
                objectFit: 'contain',
                objectPosition: 'bottom center'
              }}
            />
          </div>

          {/* Top Overlay SVG */}
          <svg width={svgW} height={svgH} overflow="visible" className="absolute inset-0 z-20 pointer-events-none" style={{ opacity: gridOpacity }}>
            {gridCells}
          </svg>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-1">
        {/* Zoom Slider */}
        <div className="flex items-center gap-2 flex-1">
          <ZoomIn className="w-3 h-3 text-gray-400" />
          <input
            type="range"
            min="0.5" max="3.0" step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
            title="Zoom"
          />
        </div>
        {/* Visibility Slider */}
        <div className="flex items-center gap-2 flex-1">
          <Eye className="w-3 h-3 text-gray-400" />
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={gridOpacity}
            onChange={(e) => setGridOpacity(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
            title="Grid Overlap Opacity"
          />
        </div>
      </div>
    </div>
  );
}

function ObjectSettingsPanel({ objId, objectAssets, updateObjectAsset, removeObjectAsset, onRequestReplaceNode, onSpawnObjects, objectStats = {}, groundAsset }: any) {
  const asset = objectAssets.find((a: ObjectAsset) => a.id === objId);
  const [openSection, setOpenSection] = useState<'base' | 'shadow' | 'spawn' | 'details' | null>('base');

  if (!asset) return <p className="text-sm text-gray-500">Asset not found.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 py-1 border-b border-[var(--color-blender-border)] pb-3">
        <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Asset Name</label>
        <input
          type="text"
          value={asset.name || asset.nodePrompt || "Unnamed Object"}
          onChange={(e) => updateObjectAsset(asset.id, { name: e.target.value })}
          className="w-full bg-black/40 border border-indigo-500/30 rounded p-1.5 text-xs text-indigo-100 focus:outline-none focus:border-indigo-500/80"
          placeholder="Enter asset name..."
        />
      </div>

      <div className="flex flex-col gap-1 py-1 border-b border-[var(--color-blender-border)] pb-3">
        <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Unity Export Type</label>
        <select
          value={asset.unityType || 'mineral'}
          onChange={(e) => updateObjectAsset(asset.id, { unityType: e.target.value as 'mineral' | 'building' })}
          className="w-full bg-black/40 border border-indigo-500/30 rounded p-1.5 text-xs text-indigo-100 focus:outline-none focus:border-indigo-500/80"
        >
          <option value="mineral">Mineral (Obstacle/Resource)</option>
          <option value="building">Building (Structure)</option>
        </select>
      </div>

      <div className="flex items-center justify-between border-b border-[var(--color-blender-border)] pb-2">
        <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider">Object Inspect</h3>
        <div className="flex gap-1">
          <button
            onClick={async () => {
              if (asset.taskId === 'local') return;
              const task = await getTask(asset.taskId);
              if (!task || !task.nodes) return;
              const node = task.nodes.find(n => n.id === asset.nodeId);
              if (node && (node.data.resultUrl || node.data.imageUrl)) {
                updateObjectAsset(asset.id, { imageUrl: node.data.resultUrl || node.data.imageUrl });
              }
            }}
            className={`p-1 ${asset.taskId === 'local' ? 'text-gray-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300'}`}
            title={asset.taskId === 'local' ? "Cannot sync local files" : "Sync with Node"}
            disabled={asset.taskId === 'local'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRequestReplaceNode && onRequestReplaceNode(asset.id)}
            className="text-pink-400 hover:text-pink-300 p-1"
            title="Replace from Node"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <label className="text-yellow-400 hover:text-yellow-300 p-1 cursor-pointer" title="Replace with File">
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  if (event.target?.result) {
                    updateObjectAsset(asset.id, {
                      imageUrl: event.target.result as string,
                      taskId: 'local',
                      nodeId: 'upload',
                      nodePrompt: 'Local Upload'
                    });
                  }
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <button onClick={() => updateObjectAsset(asset.id, { seedOffset: (asset.seedOffset || 0) + 1 })} className="text-emerald-400 hover:text-emerald-300 p-1" title="Vary Placement">
            <Dices className="w-4 h-4" />
          </button>
          <button onClick={() => removeObjectAsset(asset.id)} className="text-red-400 hover:text-red-300 p-1" title="Remove Asset">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenSection(s => s === 'base' ? null : 'base')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Base Painting & Scaling</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openSection === 'base' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'base' && (
          <div className="space-y-4 pt-2">
            <AssetFootprintEditor
              key={asset.id}
              asset={asset}
              groundAsset={groundAsset}
              onChange={(baseTiles) => updateObjectAsset(asset.id, { baseTiles })}
              onOffsetChange={(gridOffset) => updateObjectAsset(asset.id, { gridOffset })}
            />
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-400 flex items-center gap-1"><Scaling className="w-3 h-3" /> Scale</label>
                <span className="text-xs text-indigo-300">{(asset.scale || 1.0).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.1" max="2.0" step="0.1"
                value={asset.scale || 1.0}
                onChange={(e) => updateObjectAsset(asset.id, { scale: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenSection(s => s === 'shadow' ? null : 'shadow')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Cast Shadow</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openSection === 'shadow' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'shadow' && (
          <div className="pt-2">
            <ObjectShadowEditor asset={asset} updateAsset={updateObjectAsset} />
          </div>
        )}
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenSection(s => s === 'spawn' ? null : 'spawn')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Spawn</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openSection === 'spawn' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'spawn' && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Number of Instances to Spawn</label>
              <input
                type="number"
                value={asset.amount || 0}
                onChange={(e) => updateObjectAsset(asset.id, { amount: parseInt(e.target.value) || 0 })}
                className="w-full bg-black/40 border border-indigo-500/30 rounded px-2 py-1.5 text-sm text-white mb-2"
                min="0"
              />
              <button
                onClick={() => onSpawnObjects && onSpawnObjects(asset.id, asset.amount || 0)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-1.5 rounded transition-colors"
              >
                Spawn Instances
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button
          onClick={() => setOpenSection(openSection === 'details' ? null : 'details')}
          className="flex items-center gap-1 w-full text-left"
        >
          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${openSection === 'details' ? '' : '-rotate-90'}`} />
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Details</h3>
        </button>

        {openSection === 'details' && (
          <div className="mt-3 space-y-2 px-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Instances Spawned</span>
              <span className="text-gray-200 font-medium">{objectStats[asset.id] || 0}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Resolution</span>
              <span className="text-gray-200 font-medium">{asset.width && asset.height ? `${asset.width}x${asset.height} px` : 'Unknown'}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">File Size</span>
              <span className="text-gray-200 font-medium">
                {asset.fileSizeBytes
                  ? asset.fileSizeBytes > 1024 * 1024
                    ? `${(asset.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                    : `${(asset.fileSizeBytes / 1024).toFixed(1)} KB`
                  : 'Unknown'}
              </span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default function ParameterUI({
  parameters,
  setParameters,
  groundAsset,
  setGroundAsset,
  oceanAsset,
  setOceanAsset,
  objectAssets,
  setObjectAssets,
  activeSelection,
  setActiveSelection,
  onRequestReplaceNode,
  hasManualEdits,
  onClearManualEdits,
  onSpawnObjects,
  onClearOceanOverrides,
  objectStats = {},
  decalAssets = [],
  setDecalAssets,
  decalOverrides = {},
  mapDataRef
}: ParameterUIProps) {

  const [masks, setMasks] = useState<Record<string, HTMLCanvasElement>>({});
  const [foamMasks, setFoamMasks] = useState<Record<string, HTMLCanvasElement>>({});
  const [generatedOceanTiles, setGeneratedOceanTiles] = useState<Record<string, string>>({});
  const [generatedFoamTiles, setGeneratedFoamTiles] = useState<Record<string, string>>({});
  const [expandedLevels, setExpandedLevels] = useState<Record<number, boolean>>({});
  const [openOceanSection, setOpenOceanSection] = useState<'taper' | 'foam' | 'tiles' | null>('taper');
  const [openGroundSection, setOpenGroundSection] = useState<'tiles' | 'variations' | null>('tiles');
  const [openTileVariation, setOpenTileVariation] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const [exportOcean, setExportOcean] = useState(true);
  const [exportGround, setExportGround] = useState(true);
  const [exportObjects, setExportObjects] = useState(true);
  const [exportGrid, setExportGrid] = useState(true);
  const [exportBlueprints, setExportBlueprints] = useState(false);

  const handleBulkDownload = async (asset: MapAsset, prefix: string) => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();

      const addFileToZip = async (name: string, url: string) => {
        let ext = 'png';
        if (!url.startsWith('data:')) {
          const urlExt = url.split('.').pop()?.split('?')[0];
          if (urlExt && urlExt.length <= 4) ext = urlExt;
        }

        if (url.startsWith('data:')) {
          const base64Data = url.split(',')[1];
          if (base64Data) {
            zip.file(`${name}.${ext}`, base64Data, { base64: true });
            return;
          }
        }

        const res = await fetch(url);
        const blob = await res.blob();
        zip.file(`${name}.${ext}`, blob);
      };

      const createFinalizedVariation = (baseTileUrl: string, variationUrl: string, opacity: number): Promise<string> => {
        return new Promise((resolve, reject) => {
          const origImg = new Image();
          origImg.crossOrigin = 'anonymous';
          origImg.onload = () => {
            const varImg = new Image();
            varImg.crossOrigin = 'anonymous';
            varImg.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = origImg.width;
                canvas.height = origImg.height;
                const ctx = canvas.getContext('2d')!;

                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = origImg.width;
                maskCanvas.height = origImg.height;
                const maskCtx = maskCanvas.getContext('2d')!;

                const anchorX = origImg.width / 2;
                const anchorY = origImg.height / 4;

                maskCtx.translate(anchorX, anchorY);

                maskCtx.beginPath();
                maskCtx.moveTo(0, -origImg.height / 4);
                maskCtx.lineTo(origImg.width / 2, 0);
                maskCtx.lineTo(0, origImg.height / 4);
                maskCtx.lineTo(-origImg.width / 2, 0);
                maskCtx.closePath();
                maskCtx.fillStyle = 'black';
                maskCtx.fill();

                maskCtx.setTransform(1, 0, 0, 1, 0, 0);
                maskCtx.globalCompositeOperation = 'source-in';
                maskCtx.drawImage(varImg, 0, 0);

                ctx.drawImage(origImg, 0, 0);
                ctx.globalAlpha = opacity;
                ctx.drawImage(maskCanvas, 0, 0);

                resolve(canvas.toDataURL('image/png'));
              } catch (e) {
                reject(e);
              }
            };
            varImg.onerror = reject;
            varImg.src = variationUrl;
          };
          origImg.onerror = reject;
          origImg.src = baseTileUrl;
        });
      };

      for (const slice of asset.slices) {
        try {
          await addFileToZip(slice.name, slice.url);

          if (slice.variations) {
            for (let i = 0; i < slice.variations.length; i++) {
              const v = slice.variations[i];
              if (v.url) {
                try {
                  const finalizedUrl = await createFinalizedVariation(slice.url, v.url, v.opacity ?? 1);
                  await addFileToZip(`${slice.name}_Variation${i + 1}`, finalizedUrl);
                } catch (e) {
                  console.error("Failed to finalize variation", e);
                  await addFileToZip(`${slice.name}_Variation${i + 1}`, v.url);
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to add to zip", slice.name, e);
        }
      }

      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });

      const objectUrl = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${prefix}_Tileset.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Bulk download failed", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOceanBulkDownload = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();

      const addDataUrlToZip = async (name: string, url: string) => {
        let ext = 'png';
        if (!url.startsWith('data:')) {
          const urlExt = url.split('.').pop()?.split('?')[0];
          if (urlExt && urlExt.length <= 4) ext = urlExt;
        }

        if (url.startsWith('data:')) {
          const base64Data = url.split(',')[1];
          if (base64Data) {
            zip.file(`${name}.${ext}`, base64Data, { base64: true });
            return;
          }
        }

        try {
          const res = await fetch(url);
          const blob = await res.blob();
          zip.file(`${name}.${ext}`, blob);
        } catch (e) {
          console.error("Failed to fetch", name, e);
        }
      };

      const promises: Promise<any>[] = [];

      // Include the base flat floor if it exists
      if (oceanAsset && oceanAsset.slices.length > 0) {
        promises.push(addDataUrlToZip(`Ocean_Flat_Floor`, oceanAsset.slices[0].url));
      }

      // Add all generated ocean tiles
      for (const [name, url] of Object.entries(generatedOceanTiles)) {
        const exportName = name.startsWith('Ocean_') ? name : `Ocean_${name}`;
        promises.push(addDataUrlToZip(exportName, url));
      }

      // Add all generated foam tiles
      for (const [name, url] of Object.entries(generatedFoamTiles)) {
        const exportName = name.startsWith('foam_') || name.startsWith('Foam_')
          ? `Foam_${name.replace(/^(foam_|Foam_)/, '')}`
          : `Foam_${name}`;
        promises.push(addDataUrlToZip(exportName, url));
      }

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });

      const objectUrl = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `Ocean_Tileset.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Ocean bulk download failed", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUnityExport = async () => {
    setIsDownloading(true);
    try {
      const blob = await exportToUnity({
        mapDataRef,
        oceanAsset,
        groundAsset,
        objectAssets,
        decalOverrides: parameters.decalOverrides || {},
        generatedOceanTiles,
        generatedFoamTiles,
        exportOcean,
        exportGround,
        exportObjects,
        exportGrid,
        exportBlueprints,
        parameters
      });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = 'FarmAdventure_MapExport.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.error('Unity Export failed', e);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const loadedMasks: Record<string, HTMLCanvasElement> = {};
    let loadedCount = 0;
    const oceanTileNames = [
      'Tile_Center', 'Tile_Edge_NorthEast', 'Tile_Edge_NorthWest',
      'Tile_Edge_SouthEast', 'Tile_Edge_SouthWest', 'Tile_InnerCorner_East',
      'Tile_InnerCorner_North', 'Tile_InnerCorner_South', 'Tile_InnerCorner_West',
      'Tile_OutterCorner_East', 'Tile_OutterCorner_North', 'Tile_OutterCorner_South',
      'Tile_OutterCorner_West', 'Mask'
    ];
    oceanTileNames.forEach(tileName => {
      const img = new Image();
      img.src = `/assets/OceanTaper_v2/${tileName === 'Mask' ? 'Mask' : 'Ocean_' + tileName}.png`;
      img.onload = () => {
        // The original masks are black and white. White indicates the tapered area.
        // For multiplying over a base image to colorize:
        const foamCanvas = document.createElement('canvas');
        foamCanvas.width = img.width; foamCanvas.height = img.height;
        const foamCtx = foamCanvas.getContext('2d')!;
        foamCtx.drawImage(img, 0, 0);
        foamCtx.globalCompositeOperation = 'difference';
        foamCtx.fillStyle = 'white';
        foamCtx.fillRect(0, 0, img.width, img.height);
        loadedMasks[`raw_${tileName}`] = foamCanvas;

        loadedMasks[`mask_${tileName}`] = foamCanvas;

        loadedCount++;
        if (loadedCount === oceanTileNames.length) {
          setMasks(loadedMasks);
        }
      };
    });

    const loadedFoamMasks: Record<string, HTMLCanvasElement> = {};
    let loadedFoamCount = 0;
    oceanTileNames.forEach(tileName => {
      if (tileName === 'Mask') return; // no mask for foam
      const img = new Image();
      img.src = `/assets/OceanTaper_v2/Foamtiles/Foam_${tileName}.png`;
      img.onload = () => {
        const foamCanvas = document.createElement('canvas');
        foamCanvas.width = img.width; foamCanvas.height = img.height;
        const foamCtx = foamCanvas.getContext('2d')!;
        foamCtx.drawImage(img, 0, 0);
        loadedFoamMasks[tileName] = foamCanvas;
        loadedFoamCount++;
        if (loadedFoamCount === oceanTileNames.length - 1) { // -1 for 'Mask'
          setFoamMasks(loadedFoamMasks);
        }
      };
    });
  }, []);

  useEffect(() => {
    if (!oceanAsset || !oceanAsset.slices[0] || Object.keys(masks).length < 28) return;

    const baseImg = new Image();
    baseImg.src = oceanAsset.slices[0].url;
    baseImg.onload = () => {
      const newTiles: Record<string, string> = {};
      const canvas = document.createElement('canvas');
      canvas.width = 280; canvas.height = 140; // Force strictly to standard 280x140 grid size
      const ctx = canvas.getContext('2d')!;
      const alphaPerLevel = parameters.oceanDimAmount / parameters.oceanTaperLevels;
      const maskFull = masks['mask_Mask'];

      const maxLvl = Math.max(1, parameters.oceanTaperLevels);
      // We loop to maxLvl + 1 to generate the deepest flat floor
      for (let lvl = 1; lvl <= maxLvl + 1; lvl++) {
        const oceanTileNames = [
          'Tile_Center', 'Tile_Edge_NorthEast', 'Tile_Edge_NorthWest',
          'Tile_Edge_SouthEast', 'Tile_Edge_SouthWest', 'Tile_InnerCorner_East',
          'Tile_InnerCorner_North', 'Tile_InnerCorner_South', 'Tile_InnerCorner_West',
          'Tile_OutterCorner_East', 'Tile_OutterCorner_North', 'Tile_OutterCorner_South',
          'Tile_OutterCorner_West'
        ];
        for (const tileName of oceanTileNames) {
          // For the deepest level, we only need the Center tile
          if (lvl > maxLvl && tileName !== 'Tile_Center') continue;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

          // Standard Ocean Darkening
          const darkenLayers = lvl - 1;
          if (darkenLayers > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(0,0,0,${alphaPerLevel * darkenLayers})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
          const m = masks[`mask_${tileName}`];
          if (m && tileName !== 'Tile_Center' && lvl <= maxLvl) {
            // Mask the taper mask against the base image's alpha to prevent opaque corners
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d')!;
            
            // Invert the mask before applying to reverse tapering direction
            tempCtx.filter = 'invert(100%)';
            tempCtx.drawImage(m, 0, 0, canvas.width, canvas.height);
            tempCtx.filter = 'none';
            
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = alphaPerLevel;
            ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
          const sliceName = `Lvl${lvl}_${tileName}`;
          newTiles[sliceName] = canvas.toDataURL('image/png');
        }
      }
      setGeneratedOceanTiles(newTiles);
    };
  }, [oceanAsset?.slices[0]?.url, parameters.oceanTaperLevels, parameters.oceanDimAmount, masks]);

  useEffect(() => {
    if (!parameters.oceanAddFoam || Object.keys(foamMasks).length < 13 || !oceanAsset || !oceanAsset.slices[0]) {
      setGeneratedFoamTiles({});
      return;
    }

    const baseImg = new Image();
    baseImg.src = oceanAsset.slices[0].url;
    baseImg.onload = () => {
      const newFoamTiles: Record<string, string> = {};
      const canvas = document.createElement('canvas');
      canvas.width = 280; canvas.height = 140;
      const ctx = canvas.getContext('2d')!;

      Object.keys(foamMasks).forEach(tileName => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const m = foamMasks[tileName];
        if (m) {
          // Draw the foam tile
          ctx.drawImage(m, 0, 0, canvas.width, canvas.height);
          // Tint the non-transparent pixels using source-in
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = `hsl(${parameters.oceanFoamColor?.h || 63}, ${parameters.oceanFoamColor?.s || 70}%, ${parameters.oceanFoamColor?.l || 90}%)`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Mask against baseImg to remove stray opaque pixels outside the diamond shape
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

          ctx.globalCompositeOperation = 'source-over';
        }
        newFoamTiles[`foam_${tileName}`] = canvas.toDataURL('image/png');
      });
      setGeneratedFoamTiles(newFoamTiles);
    };
  }, [foamMasks, parameters.oceanAddFoam, parameters.oceanFoamColor, oceanAsset?.slices[0]?.url]);

  const handleMapChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setParameters({
      ...parameters,
      [name]: (type === 'number' || type === 'range') ? Number(value) : value,
    });
  };

  const updateObjectAsset = (id: string, updates: Partial<ObjectAsset>) => {
    setObjectAssets?.(objectAssets.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const removeObjectAsset = (id: string) => {
    setObjectAssets?.(objectAssets.filter(a => a.id !== id));
  };

  const renderMapSettings = () => (
    <div className="space-y-6">
      <div className="relative">
        {hasManualEdits && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 rounded-lg flex flex-col items-center justify-center p-4 text-center border border-yellow-500/30">
            <AlertTriangle className="w-8 h-8 text-yellow-400 mb-2" />
            <h4 className="text-sm font-bold text-gray-200 mb-1">Parameters Locked</h4>
            <p className="text-xs text-gray-400 mb-4">You have manual map edits. Changing procedural parameters will overwrite them.</p>
            <button
              onClick={() => {
                if (window.confirm("Are you sure? This will delete all your painted ground and placed assets!")) {
                  onClearManualEdits();
                }
              }}
              className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-200 border border-yellow-500/50 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
            >
              Clear Edits & Unlock
            </button>
          </div>
        )}

        <div className={`space-y-3 ${hasManualEdits ? 'opacity-30 pointer-events-none' : ''}`}>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-[var(--color-blender-border)] pb-2">Canvas Dimension</h3>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-400">Canvas Width</label>
              <input
                type="number"
                name="canvasWidth"
                min="5"
                max="500"
                value={parameters.canvasWidth || 20}
                onChange={handleMapChange}
                className="w-16 bg-black/40 border border-gray-600 rounded px-1 text-xs text-blue-300 text-right focus:border-blue-500 outline-none"
              />
            </div>
            <input
              type="range" name="canvasWidth" min="5" max="200"
              value={parameters.canvasWidth || 20} onChange={handleMapChange}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-400">Canvas Height</label>
              <input
                type="number"
                name="canvasHeight"
                min="5"
                max="500"
                value={parameters.canvasHeight || 20}
                onChange={handleMapChange}
                className="w-16 bg-black/40 border border-gray-600 rounded px-1 text-xs text-blue-300 text-right focus:border-blue-500 outline-none"
              />
            </div>
            <input
              type="range" name="canvasHeight" min="5" max="200"
              value={parameters.canvasHeight || 20} onChange={handleMapChange}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        <div className={`space-y-3 ${hasManualEdits ? 'opacity-30 pointer-events-none' : ''}`}>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-[var(--color-blender-border)] pb-2">Generate Island</h3>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-400">Island Width</label>
              <input
                type="number"
                name="islandWidth"
                min="5"
                max="500"
                value={parameters.islandWidth || 20}
                onChange={handleMapChange}
                className="w-16 bg-black/40 border border-gray-600 rounded px-1 text-xs text-blue-300 text-right focus:border-blue-500 outline-none"
              />
            </div>
            <input
              type="range" name="islandWidth" min="5" max="200"
              value={parameters.islandWidth || 20} onChange={handleMapChange}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-400">Island Height</label>
              <input
                type="number"
                name="islandHeight"
                min="5"
                max="500"
                value={parameters.islandHeight || 20}
                onChange={handleMapChange}
                className="w-16 bg-black/40 border border-gray-600 rounded px-1 text-xs text-blue-300 text-right focus:border-blue-500 outline-none"
              />
            </div>
            <input
              type="range" name="islandHeight" min="5" max="200"
              value={parameters.islandHeight || 20} onChange={handleMapChange}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-400">Noise Scale</label>
              <span className="text-xs text-blue-300">{parameters.noiseScale.toFixed(2)}</span>
            </div>
            <input
              type="range" name="noiseScale" min="0.01" max="0.5" step="0.01"
              value={parameters.noiseScale} onChange={handleMapChange}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Seed</label>
            <div className="flex gap-2">
              <input
                type="number" name="seed" value={parameters.seed} onChange={handleMapChange}
                className="bg-black/40 border border-gray-600 rounded px-2 py-1.5 text-sm w-full text-gray-200 focus:border-blue-500 outline-none"
              />
              <button
                onClick={() => setParameters({ ...parameters, seed: Math.floor(Math.random() * 10000) })}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded text-xs transition-colors font-medium whitespace-nowrap"
              >
                Random
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="pt-4 border-t border-[var(--color-blender-border)]">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Exporting</h3>

        <div className="space-y-2 mb-4 bg-black/20 p-3 rounded border border-gray-700/50">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={exportOcean} onChange={e => setExportOcean(e.target.checked)} className="rounded bg-black/40 border-gray-600 text-emerald-500 focus:ring-emerald-500/20" />
            <span className="text-xs text-gray-300">Ocean & Foam Tiles</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={exportGround} onChange={e => setExportGround(e.target.checked)} className="rounded bg-black/40 border-gray-600 text-emerald-500 focus:ring-emerald-500/20" />
            <span className="text-xs text-gray-300">Ground Tiles</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={exportObjects} onChange={e => setExportObjects(e.target.checked)} className="rounded bg-black/40 border-gray-600 text-emerald-500 focus:ring-emerald-500/20" />
            <span className="text-xs text-gray-300">Object Assets</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={exportGrid} onChange={e => setExportGrid(e.target.checked)} className="rounded bg-black/40 border-gray-600 text-emerald-500 focus:ring-emerald-500/20" />
            <span className="text-xs text-gray-300">Buildable Grid</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={exportBlueprints} onChange={e => setExportBlueprints(e.target.checked)} className="rounded bg-black/40 border-gray-600 text-emerald-500 focus:ring-emerald-500/20" />
            <span className="text-xs text-gray-300">Include Initial Setup Kit</span>
          </label>
        </div>

        <button
          onClick={handleUnityExport}
          disabled={isDownloading}
          className={`w-full flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 py-2 rounded-lg text-sm font-semibold transition-colors ${isDownloading ? 'opacity-50 animate-pulse' : ''}`}
          title="Export to Unity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11.23 2 10.02 5.01-10.02 5.01-10.02-5.01L11.23 2z" /><path d="M1.2 7.01v10.02L11.22 22v-10l-10.02-4.99z" /><path d="m11.23 11.99 10.02-4.99v10.02l-10.02 5.01v-10.04z" /></svg>
          Export to Unity
        </button>
      </div>
    </div>
  );

  const renderTilesetSlots = (
    asset: MapAsset | null,
    setAsset: (asset: MapAsset) => void,
    type: 'ground' | 'ocean'
  ) => {
    if (!asset) return <p className="text-sm text-gray-500">No {type} asset connected.</p>;

    return (
      <div className="space-y-4 pt-2">
        <div className="text-sm text-gray-400">
          <p><strong>Name:</strong> {asset.taskName}</p>
          <p><strong>Tiles:</strong> {asset.slices.length}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {asset.slices.map((slice, idx) => (
            <div key={idx} className="flex flex-col gap-1 p-2 bg-black/40 border border-[var(--color-blender-border)] rounded relative group">
              <span className="text-[10px] text-gray-400 text-center truncate" title={slice.name}>{slice.name}</span>
              <img src={slice.url} alt={slice.name} className="w-full aspect-square object-contain bg-black/50 rounded" />

              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={slice.url} download={`Tile_${slice.name}.png`} className="p-1 bg-black/80 rounded text-emerald-400 hover:text-emerald-300" title="Download">
                  <Download className="w-3 h-3" />
                </a>
                <label className="p-1 bg-black/80 rounded text-yellow-400 hover:text-yellow-300 cursor-pointer" title="Upload Replacement">
                  <Upload className="w-3 h-3" />
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          const newSlices = [...asset.slices];
                          newSlices[idx] = { ...newSlices[idx], url: event.target.result as string };
                          setAsset({ ...asset, slices: newSlices, taskId: 'local', taskName: 'Local Overrides' });
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGroundSettings = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--color-blender-border)] pb-2">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Ground Settings</h3>
        <div className="flex gap-1">
          {groundAsset && (
            <button
              onClick={async () => {
                const task = await getTask(groundAsset.taskId);
                if (!task || !task.nodes) return;
                const hexSlicerNode = task.nodes.find(n => n.type === 'isometricHexSlicer');
                if (hexSlicerNode && hexSlicerNode.data.slices) {
                  // Preserve variations
                  const newSlices = hexSlicerNode.data.slices.map((newSlice: any, idx: number) => ({
                    ...newSlice,
                    name: newSlice.name.startsWith('Ground_') ? newSlice.name : `Ground_${newSlice.name}`,
                    variations: groundAsset.slices[idx]?.variations ? [...groundAsset.slices[idx].variations] : []
                  }));

                  // Sync variations
                  for (let i = 0; i < newSlices.length; i++) {
                    if (newSlices[i].variations) {
                      for (let j = 0; j < newSlices[i].variations!.length; j++) {
                        const v = newSlices[i].variations![j];
                        if (v.taskId && v.nodeId) {
                          const vTask = await getTask(v.taskId);
                          if (vTask && vTask.nodes) {
                            const vNode = vTask.nodes.find(n => n.id === v.nodeId);
                            if (vNode && (vNode.data.outputImage || vNode.data.resultUrl || vNode.data.imageUrl)) {
                              const rawUrl = vNode.data.outputImage || vNode.data.resultUrl || vNode.data.imageUrl;
                              newSlices[i].variations![j] = {
                                ...v,
                                url: rawUrl
                              };
                            }
                          }
                        }
                      }
                    }
                  }

                  setGroundAsset({ ...groundAsset, slices: newSlices });
                }
              }}
              className="text-emerald-400 hover:text-emerald-300 p-1" title="Sync with Node"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {groundAsset && (
            <button
              onClick={() => handleBulkDownload(groundAsset, 'Ground')}
              className={`text-blue-400 hover:text-blue-300 p-1 ${isDownloading ? 'opacity-50 animate-pulse' : ''}`}
              title="Download Tileset (.zip)"
              disabled={isDownloading}
            >
              <DownloadCloud className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => onRequestReplaceNode?.('ground')} className="text-pink-400 hover:text-pink-300 p-1" title="Replace from Node">
            <ImageIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenGroundSection(s => s === 'tiles' ? null : 'tiles')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Ground Tiles</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openGroundSection === 'tiles' ? 'rotate-180' : ''}`} />
        </button>
        {openGroundSection === 'tiles' && renderTilesetSlots(groundAsset, setGroundAsset as any, 'ground')}
      </div>
    </div>
  );

  const renderGroundVariation = () => {
    const centerSliceIdx = groundAsset?.slices?.findIndex(s => s.name === 'Ground_CenterFill');
    const slice = (centerSliceIdx !== undefined && centerSliceIdx !== -1) ? groundAsset!.slices[centerSliceIdx] : null;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--color-blender-border)] pb-2">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Ground Variation</h3>
        </div>

        {/* Segment 1: Tile Variation */}
        <div className="border-b border-[var(--color-blender-border)] pb-2">
          <h4 className="text-xs font-bold text-amber-400 mb-2 uppercase tracking-wider">Tile Variation</h4>
          {!slice ? (
            <p className="text-xs text-gray-500">CenterFill tile not found.</p>
          ) : (
            <div className="bg-black/20 border border-[var(--color-blender-border)] rounded overflow-hidden p-3 space-y-3">
              {/* Original */}
              <div className="flex items-center gap-3 p-2 bg-black/40 border border-gray-800 rounded">
                <img src={slice.url} className="w-10 h-10 object-contain bg-black/50 rounded border border-gray-700" />
                <div className="flex flex-col flex-1">
                  <span className="text-xs font-bold text-gray-200">Original Tile</span>
                  <span className="text-[10px] text-gray-500">Base</span>
                </div>
              </div>

              {/* Variations */}
              {(slice.variations || []).map((v, vIdx) => {
                const variationId = `ground_variation_${centerSliceIdx}_var_${vIdx}`;
                const isSelected = activeSelection.type === 'ground_variation' && activeSelection.id === variationId;
                return (
                  <div
                    key={vIdx}
                    className={`flex flex-col gap-2 p-2 bg-black/40 border rounded relative group cursor-pointer transition-colors ${isSelected ? 'border-amber-500/60 bg-amber-900/20' : 'border-amber-900/30 hover:border-amber-500/30'}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).tagName.toLowerCase() === 'input' || (e.target as HTMLElement).closest('button')) return;
                      if (setActiveSelection) setActiveSelection({ type: 'ground_variation', id: variationId });
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <img src={v.url} className="w-10 h-10 object-contain bg-black/50 rounded border border-amber-500/30" />
                      <div className="flex flex-col flex-1">
                        <span className="text-xs font-bold text-gray-200">Variation {vIdx + 1}</span>
                      </div>
                      <div className="flex items-center gap-2 mr-6">
                        <button
                          onClick={() => {
                            const origImg = new Image();
                            origImg.crossOrigin = 'anonymous';
                            origImg.onload = () => {
                              const varImg = new Image();
                              varImg.crossOrigin = 'anonymous';
                              varImg.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = origImg.width;
                                canvas.height = origImg.height;
                                const ctx = canvas.getContext('2d')!;

                                const maskCanvas = document.createElement('canvas');
                                maskCanvas.width = origImg.width;
                                maskCanvas.height = origImg.height;
                                const maskCtx = maskCanvas.getContext('2d')!;

                                const anchorX = origImg.width / 2;
                                const anchorY = origImg.height / 4;

                                maskCtx.translate(anchorX, anchorY);

                                maskCtx.beginPath();
                                maskCtx.moveTo(0, -origImg.height / 4);
                                maskCtx.lineTo(origImg.width / 2, 0);
                                maskCtx.lineTo(0, origImg.height / 4);
                                maskCtx.lineTo(-origImg.width / 2, 0);
                                maskCtx.closePath();
                                maskCtx.fillStyle = 'black';
                                maskCtx.fill();

                                maskCtx.setTransform(1, 0, 0, 1, 0, 0);
                                maskCtx.globalCompositeOperation = 'source-in';
                                maskCtx.drawImage(varImg, 0, 0);

                                ctx.drawImage(origImg, 0, 0);
                                ctx.globalAlpha = v.opacity ?? 1;
                                ctx.drawImage(maskCanvas, 0, 0);

                                const a = document.createElement('a');
                                a.href = canvas.toDataURL('image/png');
                                a.download = `${slice.name}_Variation${vIdx + 1}.png`;
                                a.click();
                              };
                              varImg.src = v.url;
                            };
                            origImg.src = slice.url;
                          }}
                          className="p-1 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded text-indigo-300 transition-colors"
                          title="Download Finalized Tile"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] text-gray-400">Factor</span>
                        <input
                          type="number" min="0" max="1" step="0.01"
                          value={v.factor}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const newSlices = [...groundAsset!.slices];
                            const newVars = [...newSlices[centerSliceIdx!].variations!];
                            newVars[vIdx] = { ...newVars[vIdx], factor: isNaN(val) ? 0 : val };
                            newSlices[centerSliceIdx!] = { ...newSlices[centerSliceIdx!], variations: newVars };
                            setGroundAsset!({ ...groundAsset!, slices: newSlices });
                          }}
                          className="w-16 bg-black/40 text-gray-200 p-1 rounded border border-gray-700 text-xs text-right"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const newSlices = [...groundAsset!.slices];
                          newSlices[centerSliceIdx!] = { ...newSlices[centerSliceIdx!], variations: newSlices[centerSliceIdx!].variations!.filter((_, i) => i !== vIdx) };
                          setGroundAsset!({ ...groundAsset!, slices: newSlices });
                        }}
                        className="absolute top-2 right-2 p-1 bg-red-900/80 rounded text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 pt-2 border-t border-amber-900/20 mt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-16">Opacity</span>
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={v.opacity ?? 1}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const newSlices = [...groundAsset!.slices];
                            const newVars = [...newSlices[centerSliceIdx!].variations!];
                            newVars[vIdx] = { ...newVars[vIdx], opacity: isNaN(val) ? 1 : Math.max(0, Math.min(1, val)) };
                            newSlices[centerSliceIdx!] = { ...newSlices[centerSliceIdx!], variations: newVars };
                            setGroundAsset!({ ...groundAsset!, slices: newSlices });
                          }}
                          className="flex-1 accent-amber-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-[10px] text-gray-300 w-6 text-right">{(v.opacity ?? 1).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap w-16">Smoothing</span>
                        <input
                          type="range" min="0" max="100"
                          value={v.seamSmoothing ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            const newSlices = [...groundAsset!.slices];
                            const newVars = [...newSlices[centerSliceIdx!].variations!];
                            newVars[vIdx] = { ...newVars[vIdx], seamSmoothing: isNaN(val) ? 0 : val };
                            newSlices[centerSliceIdx!] = { ...newSlices[centerSliceIdx!], variations: newVars };
                            setGroundAsset!({ ...groundAsset!, slices: newSlices });
                          }}
                          className="flex-1 accent-amber-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-[10px] text-gray-300 w-6 text-right">{v.seamSmoothing ?? 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2 mt-3 pt-2 border-t border-[var(--color-blender-border)]">
                <button onClick={() => onRequestReplaceNode?.(`ground_variation_${centerSliceIdx!}`)} className="flex-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors">
                  <ImageIcon className="w-3 h-3" /> From Node
                </button>
                <label className="flex-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors cursor-pointer">
                  <Upload className="w-3 h-3" /> Upload
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        if (event.target?.result) {
                          const newSlices = [...groundAsset!.slices];
                          if (!newSlices[centerSliceIdx!].variations) newSlices[centerSliceIdx!].variations = [];
                          const rawUrl = event.target.result as string;
                          newSlices[centerSliceIdx!].variations!.push({ url: rawUrl, factor: 0, opacity: 1, seamSmoothing: 0 });
                          setGroundAsset!({ ...groundAsset!, slices: newSlices });
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Segment 2: Dynamic Decals */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Dynamic Decals</h4>
            <label className="text-[10px] bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 px-2 py-1 rounded cursor-pointer transition-colors flex items-center gap-1 border border-amber-500/30">
              <Upload className="w-3 h-3" /> Import Decal
              <input
                type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    if (event.target?.result && setDecalAssets) {
                      const newId = Math.random().toString(36).substr(2, 9);
                      setDecalAssets([...decalAssets, {
                        id: newId,
                        name: file.name,
                        imageUrl: event.target.result as string,
                        size: 1.0,
                        opacity: 1.0,
                        smoothing: 0,
                        baseTiles: []
                      }]);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
          <div className="space-y-2">
            {!decalAssets || decalAssets.length === 0 ? (
              <p className="text-xs text-gray-500">No decals imported.</p>
            ) : (
              decalAssets.map((decal, idx) => (
                <div
                  key={decal.id}
                  className={`p-2 border rounded relative group transition-colors cursor-pointer ${activeSelection.type === 'ground_variation' && activeSelection.id === decal.id ? 'bg-amber-900/20 border-amber-500/60' : 'bg-black/20 border-gray-800 hover:border-amber-500/30'}`}
                  onClick={(e) => {
                    // prevent selecting if interacting with slider or trash
                    if ((e.target as HTMLElement).tagName.toLowerCase() === 'input' || (e.target as HTMLElement).closest('button')) return;
                    if (setActiveSelection) setActiveSelection({ type: 'ground_variation', id: decal.id });
                  }}
                >
                  <div className="flex gap-3 items-center mb-2">
                    <img src={decal.imageUrl} className="w-10 h-10 object-contain bg-black/50 border border-gray-700 rounded" />
                    <div className="flex-1 min-w-0 text-xs font-medium text-gray-200 truncate">{decal.name}</div>
                    <button
                      onClick={() => setDecalAssets && setDecalAssets(decalAssets.filter(d => d.id !== decal.id))}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-12">Size</span>
                      <input
                        type="range" min="0.1" max="3" step="0.1"
                        value={decal.size}
                        onChange={(e) => {
                          if (setDecalAssets) {
                            const newDecals = [...decalAssets];
                            newDecals[idx].size = parseFloat(e.target.value);
                            setDecalAssets(newDecals);
                          }
                        }}
                        className="flex-1 accent-amber-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-300 w-6 text-right">{decal.size.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-12">Opacity</span>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={decal.opacity}
                        onChange={(e) => {
                          if (setDecalAssets) {
                            const newDecals = [...decalAssets];
                            newDecals[idx].opacity = parseFloat(e.target.value);
                            setDecalAssets(newDecals);
                          }
                        }}
                        className="flex-1 accent-amber-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-300 w-6 text-right">{decal.opacity.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-12">Blur</span>
                      <input
                        type="range" min="0" max="20" step="1"
                        value={decal.smoothing}
                        onChange={(e) => {
                          if (setDecalAssets) {
                            const newDecals = [...decalAssets];
                            newDecals[idx].smoothing = parseInt(e.target.value, 10);
                            setDecalAssets(newDecals);
                          }
                        }}
                        className="flex-1 accent-amber-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-300 w-6 text-right">{decal.smoothing}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOceanSettings = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--color-blender-border)] pb-2">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Ocean Floor</h3>
        <div className="flex gap-1">
          {oceanAsset && (
            <button
              onClick={async () => {
                const task = await getTask(oceanAsset.taskId);
                if (!task || !task.nodes) return;
                let targetNode = null;
                if (oceanAsset.nodeId) {
                  targetNode = task.nodes.find(n => n.id === oceanAsset.nodeId);
                } else {
                  targetNode = task.nodes.find(n => n.data && (n.data.outputImage || n.data.resultUrl || n.data.imageUrl));
                }
                if (targetNode) {
                  const imageUrl = targetNode.data.outputImage || targetNode.data.resultUrl || targetNode.data.imageUrl;
                  if (imageUrl) {
                    setOceanAsset({ ...oceanAsset, slices: [{ name: 'Flat_Floor', url: imageUrl }] });
                  }
                }
              }}
              className="text-emerald-400 hover:text-emerald-300 p-1" title="Sync with Node"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {oceanAsset && (
            <button
              onClick={handleOceanBulkDownload}
              className={`text-blue-400 hover:text-blue-300 p-1 ${isDownloading ? 'opacity-50 animate-pulse' : ''}`}
              title="Download Tileset (.zip)"
              disabled={isDownloading}
            >
              <DownloadCloud className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => onRequestReplaceNode?.('ocean')} className="text-pink-400 hover:text-pink-300 p-1" title="Replace from Node">
            <ImageIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenOceanSection(s => s === 'taper' ? null : 'taper')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Taper Settings</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openOceanSection === 'taper' ? 'rotate-180' : ''}`} />
        </button>
        {openOceanSection === 'taper' && (
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-400">Taper Levels</label>
                <span className="text-xs text-blue-300">{parameters.oceanTaperLevels}</span>
              </div>
              <input
                type="range" name="oceanTaperLevels" min="0" max="4" step="1"
                value={parameters.oceanTaperLevels} onChange={handleMapChange}
                className="w-full accent-blue-500"
              />
            </div>

            {parameters.oceanTaperLevels > 0 && (
              <div className="bg-black/20 p-3 rounded border border-[var(--color-blender-border)] space-y-3">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase">Taper Distances</h4>
                {Array.from({ length: parameters.oceanTaperLevels }).map((_, i) => {
                  const lvl = i + 1;
                  const currentWidth = parameters.oceanTaperWidths?.[lvl] || 1;
                  return (
                    <div key={lvl}>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-gray-400">Level {lvl} Width</label>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-blue-300">{currentWidth} tile{currentWidth !== 1 ? 's' : ''}</span>
                          <button
                            onClick={() => onClearOceanOverrides?.(lvl)}
                            className="text-[10px] bg-red-900/40 text-red-300 hover:bg-red-900/60 hover:text-white px-2 py-0.5 rounded border border-red-700/50 transition-colors"
                            title={`Reset painted tiles for Level ${lvl}`}
                          >
                            Reset Paint
                          </button>
                        </div>
                      </div>
                      <input
                        type="range" min="1" max="5" step="1"
                        value={currentWidth}
                        onChange={(e) => setParameters({
                          ...parameters,
                          oceanTaperWidths: { ...(parameters.oceanTaperWidths || {}), [lvl]: parseInt(e.target.value) }
                        })}
                        className="w-full accent-blue-500 h-1"
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-400">Dim Amount</label>
                <span className="text-xs text-blue-300">{(parameters.oceanDimAmount * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" name="oceanDimAmount" min="0" max="1" step="0.05"
                value={parameters.oceanDimAmount} onChange={handleMapChange}
                className="w-full accent-blue-500"
              />
            </div>
            <button
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-1.5 rounded flex items-center justify-center gap-2 transition-colors mt-4"
              onClick={() => {
                // Trigger download tapered collection
                window.dispatchEvent(new CustomEvent('downloadTaperedOcean'));
              }}
            >
              <Download className="w-4 h-4" /> Download Tapered Collection
            </button>
          </div>
        )}
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenOceanSection(s => s === 'foam' ? null : 'foam')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Foam Settings</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openOceanSection === 'foam' ? 'rotate-180' : ''}`} />
        </button>
        {openOceanSection === 'foam' && (
          <div className="space-y-4 pt-2">
            <div className="bg-black/20 rounded border border-[var(--color-blender-border)] overflow-hidden">
              <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white/5 transition-colors">
                <input
                  type="checkbox"
                  checked={parameters.oceanAddFoam || false}
                  onChange={(e) => setParameters({ ...parameters, oceanAddFoam: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-300 font-semibold flex-1">Enable Foam Shoreline</span>
              </label>
              {parameters.oceanAddFoam && (
                <div className="p-3 border-t border-[var(--color-blender-border)]/50 bg-black/10 space-y-3">
                  <div className="text-[10px] uppercase text-gray-500 font-bold mb-2">Foam Color (HSL)</div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-[10px] text-gray-400">Hue</label>
                      <span className="text-[10px] text-blue-300">{parameters.oceanFoamColor?.h || 63}°</span>
                    </div>
                    <input
                      type="range" min="0" max="360" step="1"
                      value={parameters.oceanFoamColor?.h || 63}
                      onChange={(e) => setParameters({ ...parameters, oceanFoamColor: { ...(parameters.oceanFoamColor || { h: 63, s: 70, l: 90 }), h: parseInt(e.target.value) } })}
                      className="w-full accent-blue-500 h-1"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-[10px] text-gray-400">Saturation</label>
                      <span className="text-[10px] text-blue-300">{parameters.oceanFoamColor?.s || 70}%</span>
                    </div>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={parameters.oceanFoamColor?.s || 70}
                      onChange={(e) => setParameters({ ...parameters, oceanFoamColor: { ...(parameters.oceanFoamColor || { h: 63, s: 70, l: 90 }), s: parseInt(e.target.value) } })}
                      className="w-full accent-blue-500 h-1"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-[10px] text-gray-400">Lightness</label>
                      <span className="text-[10px] text-blue-300">{parameters.oceanFoamColor?.l || 90}%</span>
                    </div>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={parameters.oceanFoamColor?.l || 90}
                      onChange={(e) => setParameters({ ...parameters, oceanFoamColor: { ...(parameters.oceanFoamColor || { h: 63, s: 70, l: 90 }), l: parseInt(e.target.value) } })}
                      className="w-full accent-blue-500 h-1"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-[var(--color-blender-border)] pb-2">
        <button onClick={() => setOpenOceanSection(s => s === 'tiles' ? null : 'tiles')} className="w-full flex items-center justify-between py-2 text-indigo-300 hover:text-indigo-200">
          <span className="text-sm font-semibold uppercase tracking-wider">Ocean Tiles</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openOceanSection === 'tiles' ? 'rotate-180' : ''}`} />
        </button>
        {openOceanSection === 'tiles' && (
          <div className="space-y-4 pt-2">
            {/* Base Tile */}
            {oceanAsset && (
              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-2">Base Ocean Tile</h4>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 p-1 bg-black/40 border border-[var(--color-blender-border)] rounded relative group w-24">
                    <span className="text-[9px] text-gray-400 text-center truncate">Base</span>
                    <img alt="image" src={oceanAsset.slices[0].url} className="w-full aspect-square object-contain bg-black/50 rounded" />
                    <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={oceanAsset.slices[0].url} download="OceanBase.png" className="p-1 bg-black/80 rounded text-emerald-400 hover:text-emerald-300">
                        <Download className="w-3 h-3" />
                      </a>
                      <label className="p-1 bg-black/80 rounded text-yellow-400 hover:text-yellow-300 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <input
                          type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              if (event.target?.result) {
                                const newSlices = [...oceanAsset.slices];
                                newSlices[0] = { ...newSlices[0], url: event.target.result as string };
                                setOceanAsset({ ...oceanAsset, slices: newSlices, taskId: 'local', taskName: 'Local Overrides' });
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Taper Levels */}
            {Array.from({ length: parameters.oceanTaperLevels + 1 }).map((_, i) => {
              const lvl = i + 1;
              const isDeepest = lvl > parameters.oceanTaperLevels;
              let oceanTileNames = [
                'Tile_Center', 'Tile_Edge_NorthEast', 'Tile_Edge_NorthWest',
                'Tile_Edge_SouthEast', 'Tile_Edge_SouthWest', 'Tile_InnerCorner_East',
                'Tile_InnerCorner_North', 'Tile_InnerCorner_South', 'Tile_InnerCorner_West',
                'Tile_OutterCorner_East', 'Tile_OutterCorner_North', 'Tile_OutterCorner_South',
                'Tile_OutterCorner_West'
              ];
              if (isDeepest) oceanTileNames = ['Tile_LowerDepth'];

              const isExpanded = expandedLevels[lvl] !== false; // Default true
              return (
                <div key={lvl} className="bg-black/20 rounded border border-[var(--color-blender-border)]">
                  <div
                    className="flex justify-between items-center p-2 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedLevels(prev => ({ ...prev, [lvl]: !isExpanded }))}
                  >
                    <span className="text-xs font-semibold text-gray-300">
                      {isDeepest ? `Deepest Floor (Level ${lvl})` : `Level ${lvl} Tiles`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="p-2 pt-0 grid grid-cols-3 gap-2">
                      {oceanTileNames.map(tileName => {
                        const sliceName = `Lvl${lvl}_${tileName}`;
                        const customSlice = oceanAsset?.slices.find(s => s.name === sliceName);
                        const url = customSlice?.url || generatedOceanTiles[sliceName];
                        if (!url) return null;

                        return (
                          <div key={tileName} className={`flex flex-col gap-1 p-1 bg-black/40 border ${customSlice ? 'border-yellow-500/50' : 'border-[var(--color-blender-border)]'} rounded relative group`}>
                            <span className="text-[9px] text-gray-400 text-center truncate">{sliceName}</span>
                            <img alt="image" src={url} className="w-full aspect-square object-contain bg-black/50 rounded" />
                            <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={url} download={`${sliceName}.png`} className="p-1 bg-black/80 rounded text-emerald-400 hover:text-emerald-300" title="Download">
                                <Download className="w-3 h-3" />
                              </a>
                              <label className="p-1 bg-black/80 rounded text-yellow-400 hover:text-yellow-300 cursor-pointer" title="Upload Override">
                                <Upload className="w-3 h-3" />
                                <input
                                  type="file" accept="image/*" className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      if (event.target?.result && oceanAsset) {
                                        const newSlices = [...oceanAsset.slices];
                                        const existingIdx = newSlices.findIndex(s => s.name === sliceName);
                                        if (existingIdx >= 0) {
                                          newSlices[existingIdx].url = event.target.result as string;
                                        } else {
                                          newSlices.push({ name: sliceName, url: event.target.result as string });
                                        }
                                        setOceanAsset({ ...oceanAsset, slices: newSlices, taskId: oceanAsset.taskId === 'local' ? 'local' : oceanAsset.taskId, taskName: oceanAsset.taskName === 'Local Overrides' ? 'Local Overrides' : oceanAsset.taskName });
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Foam Level Preview */}
            {parameters.oceanAddFoam && (
              <div className="bg-black/20 rounded border border-[var(--color-blender-border)] mt-4">
                <div
                  className="flex justify-between items-center p-2 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedLevels(prev => ({ ...prev, 0: !(prev[0] !== false) }))}
                >
                  <span className="text-xs font-semibold text-gray-300">Foam Layer Tiles</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedLevels[0] !== false ? 'rotate-180' : ''}`} />
                </div>

                {(expandedLevels[0] !== false) && (
                  <div className="p-2 pt-0 grid grid-cols-3 gap-2">
                    {[
                      'Tile_Center', 'Tile_Edge_NorthEast', 'Tile_Edge_NorthWest',
                      'Tile_Edge_SouthEast', 'Tile_Edge_SouthWest', 'Tile_InnerCorner_East',
                      'Tile_InnerCorner_North', 'Tile_InnerCorner_South', 'Tile_InnerCorner_West',
                      'Tile_OutterCorner_East', 'Tile_OutterCorner_North', 'Tile_OutterCorner_South',
                      'Tile_OutterCorner_West'
                    ].map(tileName => {
                      const sliceName = `foam_${tileName}`;
                      const url = generatedFoamTiles[sliceName];
                      if (!url) return null;

                      return (
                        <div key={tileName} className="flex flex-col gap-1 p-1 bg-black/40 border border-[var(--color-blender-border)] rounded relative group">
                          <span className="text-[9px] text-gray-400 text-center truncate">{tileName}</span>
                          <img alt="image" src={url} className="w-full aspect-square object-contain bg-black/50 rounded" />
                          <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a href={url} download={`${sliceName}.png`} className="p-1 bg-black/80 rounded text-emerald-400 hover:text-emerald-300" title="Download">
                              <Download className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderObjectSettings = (objId: string) => {
    return (
      <ObjectSettingsPanel
        objId={objId}
        objectAssets={objectAssets}
        updateObjectAsset={updateObjectAsset}
        removeObjectAsset={removeObjectAsset}
        onRequestReplaceNode={onRequestReplaceNode}
        onSpawnObjects={onSpawnObjects}
        objectStats={objectStats}
        groundAsset={groundAsset}
      />
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1525]">
      <div className="p-4 border-b border-[var(--color-blender-border)]">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          {activeSelection.type === 'map' && <><Sliders className="w-5 h-5 text-blue-400" /> Map Settings</>}
          {activeSelection.type === 'ground' && <><Settings className="w-5 h-5 text-emerald-400" /> Ground Settings</>}
          {activeSelection.type === 'ground_variation' && <><Settings className="w-5 h-5 text-amber-400" /> Surface Appearance</>}
          {activeSelection.type === 'ocean' && <><Settings className="w-5 h-5 text-blue-400" /> Ocean Settings</>}
          {activeSelection.type === 'object' && <><Box className="w-5 h-5 text-indigo-400" /> Object Inspect</>}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeSelection.type === 'map' && renderMapSettings()}
        {activeSelection.type === 'ground' && renderGroundSettings()}
        {activeSelection.type === 'ground_variation' && renderGroundVariation()}
        {activeSelection.type === 'ocean' && renderOceanSettings()}
        {activeSelection.type === 'object' && renderObjectSettings(activeSelection.id)}
      </div>
    </div>
  );
}

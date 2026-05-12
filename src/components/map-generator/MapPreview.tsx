import { useEffect, useRef, useState, PointerEvent } from "react";
import { MapAsset, ObjectAsset, MapParameters, InstanceOverride, SelectionState } from "./MapGeneratorWorkspace";
import { TerrainGenerator, MapGridCell, PlacedObject } from "@/lib/map-engine/TerrainGenerator";
import { Loader2, Grid3X3, AlertTriangle } from "lucide-react";

interface MapPreviewProps {
  groundAsset: MapAsset | null;
  objectAssets: ObjectAsset[];
  parameters: MapParameters;
  instanceOverrides: Record<string, InstanceOverride>;
  setInstanceOverrides: React.Dispatch<React.SetStateAction<Record<string, InstanceOverride>>>;
  setParameters: (p: MapParameters) => void;
  activeSelection?: SelectionState;
}

export default function MapPreview({ 
  groundAsset, 
  objectAssets, 
  parameters, 
  instanceOverrides, 
  setInstanceOverrides,
  setParameters,
  activeSelection
}: MapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [grid, setGrid] = useState<MapGridCell[][]>([]);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [isRendering, setIsRendering] = useState(false);
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [hasClippingAlert, setHasClippingAlert] = useState(false);

  const [draggedInstance, setDraggedInstance] = useState<string | null>(null);
  const [dragSlot, setDragSlot] = useState<InstanceOverride | null>(null);

  // Keep track of render bounds for picking math
  const transformRef = useRef({ offsetX: 0, offsetY: 0, finalScale: 1 });
  // Keep track of rendered objects for hit testing
  const renderedObjectsRef = useRef<{instanceId: string, isoX: number, isoY: number, hitRadius: number}[]>([]);
  // Keep track of occupancy for grid rendering
  const occupancyRef = useRef<Map<string, string[]>>(new Map());

  // Generate grid when parameters or overrides change
  useEffect(() => {
    const rawGrid = TerrainGenerator.generate(parameters.width, parameters.height, parameters.seed, parameters.noiseScale, objectAssets);
    
    // Extract all procedural objects
    const allObjects: PlacedObject[] = [];
    for (let y = 0; y < parameters.height; y++) {
      for (let x = 0; x < parameters.width; x++) {
        allObjects.push(...rawGrid[y][x].objects);
        rawGrid[y][x].objects = []; // Clear
      }
    }

    // Apply overrides and drag state
    for (const obj of allObjects) {
      const isDraggingThis = draggedInstance === obj.instanceId;
      const activeOverride = (isDraggingThis && dragSlot) ? dragSlot : instanceOverrides[obj.instanceId];

      if (activeOverride && (activeOverride as any).deleted) {
        continue;
      }

      const targetCellX = activeOverride ? activeOverride.cellX : obj.cellX;
      const targetCellY = activeOverride ? activeOverride.cellY : obj.cellY;
      const targetLx = activeOverride ? activeOverride.lx : obj.lx;
      const targetLy = activeOverride ? activeOverride.ly : obj.ly;

      if (rawGrid[targetCellY] && rawGrid[targetCellY][targetCellX] && rawGrid[targetCellY][targetCellX].isLand) {
        rawGrid[targetCellY][targetCellX].objects.push({
          ...obj,
          cellX: targetCellX,
          cellY: targetCellY,
          lx: targetLx,
          ly: targetLy
        });
      }
    }

    // Check for clipping
    let isClipping = false;
    const occupancy = new Map<string, string[]>();
    for (let y = 0; y < parameters.height; y++) {
      for (let x = 0; x < parameters.width; x++) {
        for (const obj of rawGrid[y][x].objects) {
          const assetInfo = objectAssets?.find(a => a.id === obj.id);
          const limit = Math.floor(1.5 * (assetInfo?.scale || 1.0));
          const rawBaseTiles = obj.baseTiles || [{lx: 0, ly: 0}];
          let baseTiles = rawBaseTiles.filter((t: {lx: number, ly: number}) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
          if (baseTiles.length === 0) baseTiles = [{lx: 0, ly: 0}];
          
          for (const tile of baseTiles) {
             const gx = x * 3 + obj.lx + tile.lx + 1;
             const gy = y * 3 + obj.ly + tile.ly + 1;
             const key = `${gx},${gy}`;
             if (occupancy.has(key)) {
               isClipping = true;
               occupancy.get(key)!.push(obj.id);
             } else {
               occupancy.set(key, [obj.id]);
             }
          }
        }
      }
    }
    occupancyRef.current = occupancy;
    setHasClippingAlert(isClipping);
    setGrid(rawGrid);
  }, [parameters, objectAssets, instanceOverrides, draggedInstance, dragSlot]);

  // Load images when ground asset changes
  useEffect(() => {
    if (!groundAsset || !groundAsset.slices) {
      setImages({});
      return;
    }

    setIsRendering(true);
    const loadedImages: Record<string, HTMLImageElement> = {};
    
    const slicesCount = groundAsset.slices.length;
    const objectsCount = objectAssets ? objectAssets.length : 0;
    const totalCount = slicesCount + objectsCount;
    let loadedCount = 0;

    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount === totalCount) {
        setImages(loadedImages);
        setIsRendering(false);
      }
    };

    if (totalCount === 0) {
      setImages({});
      setIsRendering(false);
      return;
    }

    groundAsset.slices.forEach(slice => {
      const img = new Image();
      img.onload = () => {
        loadedImages[slice.name] = img;
        checkLoaded();
      };
      img.onerror = () => {
        console.error("Failed to load slice image:", slice.name);
        checkLoaded();
      }
      img.src = slice.url;
    });

    if (objectAssets) {
      objectAssets.forEach(asset => {
        const img = new Image();
        img.onload = () => {
          loadedImages[asset.id] = img;
          checkLoaded();
        };
        img.onerror = () => {
          console.error("Failed to load object image:", asset.id);
          checkLoaded();
        }
        img.src = asset.imageUrl;
      });
    }
  }, [groundAsset, objectAssets]);

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    if (Object.keys(images).length === 0 || grid.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { clientWidth, clientHeight } = containerRef.current;
    canvas.width = clientWidth;
    canvas.height = clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tileHalfWidth = 140;
    const tileHalfHeight = 70;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        const isoX = (col - row) * tileHalfWidth;
        const isoY = (col + row) * tileHalfHeight;
        if (isoX < minX) minX = isoX;
        if (isoX > maxX) maxX = isoX;
        if (isoY < minY) minY = isoY;
        if (isoY > maxY) maxY = isoY;
      }
    }

    const gridWidth = maxX - minX + (tileHalfWidth * 2);
    const gridHeight = maxY - minY + (tileHalfHeight * 4);

    const padding = 50;
    const autoScaleX = (clientWidth - padding * 2) / gridWidth;
    const autoScaleY = (clientHeight - padding * 2) / gridHeight;
    const autoScale = Math.min(autoScaleX, autoScaleY, 1);
    const finalScale = autoScale * zoomMultiplier;

    const offsetX = (clientWidth / 2) - ((minX + maxX) / 2) * finalScale;
    const offsetY = (clientHeight / 2) - ((minY + maxY) / 2) * finalScale - (tileHalfHeight * finalScale);

    transformRef.current = { offsetX, offsetY, finalScale };
    renderedObjectsRef.current = [];

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(finalScale, finalScale);

    const cellsToRender = [];
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        if (grid[row][col].isLand && grid[row][col].tileId) {
          cellsToRender.push({
            ...grid[row][col],
            col, row,
            isoX: (col - row) * tileHalfWidth,
            isoY: (col + row) * tileHalfHeight,
            depth: row + col
          });
        }
      }
    }

    cellsToRender.sort((a, b) => a.depth - b.depth);

    const objectsToRender: any[] = [];

    // PASS 1: Draw Ground and Grid
    for (const cell of cellsToRender) {
      const img = images[cell.tileId!];
      if (img) {
        ctx.drawImage(img, cell.isoX - tileHalfWidth, cell.isoY - tileHalfHeight, 280, 280);
      }

      if (showGrid) {
        ctx.save();
        
        // Draw occupied slots
        for (let lx = -1; lx <= 1; lx++) {
          for (let ly = -1; ly <= 1; ly++) {
            const gx = cell.col * 3 + lx + 1;
            const gy = cell.row * 3 + ly + 1;
            const key = `${gx},${gy}`;
            
            const occupants = occupancyRef.current?.get(key);
            if (occupants && occupants.length > 0) {
              const isSelected = activeSelection?.type === 'object' && occupants.includes(activeSelection.id!);
              ctx.fillStyle = isSelected ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)";
              
              const slotIsoX = cell.isoX + (lx - ly) * (140 / 3);
              const slotIsoY = cell.isoY + (lx + ly) * (70 / 3);
              
              ctx.beginPath();
              ctx.moveTo(slotIsoX, slotIsoY - 70/3);
              ctx.lineTo(slotIsoX + 140/3, slotIsoY);
              ctx.lineTo(slotIsoX, slotIsoY + 70/3);
              ctx.lineTo(slotIsoX - 140/3, slotIsoY);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
        
        ctx.beginPath();
        
        // Draw the 3x3 subgrid lines (9 cells)
        for (let i = -1.5; i <= 1.5; i += 1) {
          // Lines varying ly (constant lx = i)
          const startX1 = cell.isoX + (i + 1.5) * (140 / 3);
          const startY1 = cell.isoY + (i - 1.5) * (70 / 3);
          const endX1 = cell.isoX + (i - 1.5) * (140 / 3);
          const endY1 = cell.isoY + (i + 1.5) * (70 / 3);
          
          ctx.moveTo(startX1, startY1);
          ctx.lineTo(endX1, endY1);

          // Lines varying lx (constant ly = i)
          const startX2 = cell.isoX + (-1.5 - i) * (140 / 3);
          const startY2 = cell.isoY + (-1.5 + i) * (70 / 3);
          const endX2 = cell.isoX + (1.5 - i) * (140 / 3);
          const endY2 = cell.isoY + (1.5 + i) * (70 / 3);

          ctx.moveTo(startX2, startY2);
          ctx.lineTo(endX2, endY2);
        }

        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // Collect objects
      if (cell.objects && cell.objects.length > 0) {
        for (const obj of cell.objects) {
          const objImg = images[obj.id];
          const assetInfo = objectAssets?.find(a => a.id === obj.id);
          
          if (objImg && assetInfo) {
            const slotIsoX = cell.isoX + (obj.lx - obj.ly) * (140 / 3);
            const slotIsoY = cell.isoY + (obj.lx + obj.ly) * (70 / 3);

            const scale = assetInfo.scale || 1.0;
            const aspectRatio = objImg.width / objImg.height;
            
            let objW, objH;
            if (aspectRatio >= 1) {
              objW = 140 * scale;
              objH = (140 / aspectRatio) * scale;
            } else {
              objH = 140 * scale;
              objW = 140 * aspectRatio * scale;
            }
            
            const gridOffsetX = assetInfo.gridOffset?.x || 0;
            const gridOffsetY = assetInfo.gridOffset?.y || 0;
            const imgCenterX = slotIsoX - gridOffsetX * scale;
            const imgBottomY = slotIsoY - gridOffsetY * scale;

            // Global depth of the object based on exact slot coordinates
            const globalGx = cell.col * 3 + obj.lx + 1;
            const globalGy = cell.row * 3 + obj.ly + 1;
            const exactDepth = globalGx + globalGy;

            objectsToRender.push({
              ...obj,
              objImg,
              objW,
              objH,
              imgCenterX,
              imgBottomY,
              exactDepth,
              scale
            });
          }
        }
      }
    }

    // PASS 2: Draw Objects sorted by exact depth
    objectsToRender.sort((a, b) => a.exactDepth - b.exactDepth);

    for (const obj of objectsToRender) {
      ctx.save();
      if (draggedInstance === obj.instanceId) {
        ctx.globalAlpha = 0.7; // Ghost effect when dragging
      }
      ctx.drawImage(obj.objImg, obj.imgCenterX - obj.objW/2, obj.imgBottomY - obj.objH, obj.objW, obj.objH);
      ctx.restore();

      // Save hit-test data
      renderedObjectsRef.current.push({
        instanceId: obj.instanceId,
        isoX: obj.imgCenterX,
        isoY: obj.imgBottomY - obj.objH / 2, // Shift hit center up to the middle of the sprite
        hitRadius: 80 * obj.scale
      });
    }

    ctx.restore();
  }, [grid, images, zoomMultiplier, draggedInstance, showGrid]);

  // Interactivity Handlers
  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { offsetX, offsetY, finalScale } = transformRef.current;
    const isoX = (x - offsetX) / finalScale;
    const isoY = (y - offsetY) / finalScale;

    let closestDist = Infinity;
    let picked = null;

    for (const o of renderedObjectsRef.current) {
      const dx = o.isoX - isoX;
      const dy = o.isoY - isoY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < o.hitRadius && dist < closestDist) {
        closestDist = dist;
        picked = o;
      }
    }

    if (picked) {
      setDraggedInstance(picked.instanceId);
      setDragSlot(null);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!draggedInstance || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { offsetX, offsetY, finalScale } = transformRef.current;
    const isoX = (x - offsetX) / finalScale;
    const isoY = (y - offsetY) / finalScale;

    // Inverse Sub-Grid Math
    const dx = 140 / 3;
    const dy = 70 / 3;
    const gx = Math.round((isoX / dx + isoY / dy) / 2);
    const gy = Math.round((isoY / dy - isoX / dx) / 2);

    const cellX = Math.floor(gx / 3);
    const cellY = Math.floor(gy / 3);
    const lx = gx - cellX * 3 - 1;
    const ly = gy - cellY * 3 - 1;

    setDragSlot({ cellX, cellY, lx, ly });
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (draggedInstance) {
      if (dragSlot) {
        const isValidLand = grid[dragSlot.cellY] && grid[dragSlot.cellY][dragSlot.cellX] && grid[dragSlot.cellY][dragSlot.cellX].isLand;
        
        setInstanceOverrides(prev => ({
          ...prev,
          [draggedInstance]: isValidLand ? dragSlot : { ...dragSlot, deleted: true } as any
        }));
      }
      setDraggedInstance(null);
      setDragSlot(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {!groundAsset ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
          <p>Import a Ground Asset to preview the map</p>
        </div>
      ) : isRendering ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-400">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p className="text-sm">Loading tileset images...</p>
        </div>
      ) : (
        <canvas 
          ref={canvasRef} 
          className={`w-full h-full outline-none touch-none ${draggedInstance ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={(e) => {
            setZoomMultiplier(prev => {
              const delta = e.deltaY < 0 ? 0.1 : -0.1;
              return Math.max(0.1, Math.min(prev + delta, 5));
            });
          }}
        />
      )}
      
      {groundAsset && (
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all z-10 ${showGrid ? 'bg-indigo-600 text-white' : 'bg-[var(--color-blender-panel)] text-gray-400 hover:text-white border border-[var(--color-blender-border)]'}`}
          title="Toggle Grid"
        >
          <Grid3X3 className="w-5 h-5" />
        </button>
      )}

      {hasClippingAlert && (
        <div className="absolute top-4 left-4 bg-red-900/80 text-red-200 px-3 py-2 rounded-lg flex items-center gap-2 shadow-xl border border-red-500/50 backdrop-blur-sm z-10">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div className="flex flex-col">
            <span className="text-sm font-bold">Assets Clipping</span>
            <span className="text-xs opacity-80">Some object footprints are overlapping.</span>
          </div>
        </div>
      )}
    </div>
  );
}

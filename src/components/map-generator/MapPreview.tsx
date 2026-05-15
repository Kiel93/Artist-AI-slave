import { useEffect, useRef, useState, PointerEvent } from "react";
import { MapAsset, ObjectAsset, MapParameters, InstanceOverride, SelectionState } from "./MapGeneratorWorkspace";
import { TerrainGenerator, MapGridCell, PlacedObject } from "@/lib/map-engine/TerrainGenerator";
import { Loader2, Grid3X3, AlertTriangle, MousePointer2, Paintbrush, Eraser, Eye, EyeOff, Layers, Trash2 } from "lucide-react";

interface MapPreviewProps {
  groundAsset: MapAsset | null;
  objectAssets: ObjectAsset[];
  parameters: MapParameters;
  instanceOverrides: Record<string, InstanceOverride>;
  setInstanceOverrides: (overrides: Record<string, InstanceOverride> | ((prev: Record<string, InstanceOverride>) => Record<string, InstanceOverride>)) => void;
  groundOverrides: Record<string, number>;
  setGroundOverrides: (overrides: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  setParameters: (p: MapParameters) => void;
  activeSelection?: SelectionState;
  setActiveSelection?: (s: SelectionState) => void;
  activeTool: 'select' | 'paint' | 'erase';
  setActiveTool: (t: 'select' | 'paint' | 'erase') => void;
  activeLevel: number;
  setActiveLevel: (l: number) => void;
  levels: number[];
  setLevels: React.Dispatch<React.SetStateAction<number[]>>;
}

export default function MapPreview({
  groundAsset,
  objectAssets,
  parameters,
  instanceOverrides,
  setInstanceOverrides,
  groundOverrides,
  setGroundOverrides,
  setParameters,
  activeSelection,
  setActiveSelection,
  activeTool,
  setActiveTool,
  activeLevel,
  setActiveLevel,
  levels,
  setLevels
}: MapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [gridLevels, setGridLevels] = useState<Record<number, MapGridCell[][]>>({});
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [isRendering, setIsRendering] = useState(false);
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const [gridSettings, setGridSettings] = useState({
    show: false,
    showOnlyBuildable: false,
    opacity: 50,
    brightness: 100
  });
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [hasClippingAlert, setHasClippingAlert] = useState(false);
  const [layersExpanded, setLayersExpanded] = useState(true);

  const [draggedInstance, setDraggedInstance] = useState<string | null>(null);
  const [dragSlot, setDragSlot] = useState<InstanceOverride | null>(null);
  const [isErasing, setIsErasing] = useState(false);

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isMapPanning, setIsMapPanning] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const paintStrokesRef = useRef<Record<string, number>>({});
  const [brushPos, setBrushPos] = useState<{ gx: number, gy: number, cellX: number, cellY: number, isValid: boolean, level: number } | null>(null);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const saved = localStorage.getItem('artist_assistant_grid_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setGridSettings(prev => ({
          ...prev,
          opacity: parsed.opacity ?? prev.opacity,
          brightness: parsed.brightness ?? prev.brightness,
          showOnlyBuildable: parsed.showOnlyBuildable ?? prev.showOnlyBuildable
        }));
      } catch (e) { }
    }
  }, []);

  const updateGridSettings = (updates: Partial<typeof gridSettings>) => {
    setGridSettings(prev => {
      const next = { ...prev, ...updates };
      // Save settings when toggled off (or whenever they change actually, except we only save the values)
      localStorage.setItem('artist_assistant_grid_settings', JSON.stringify({
        opacity: next.opacity,
        brightness: next.brightness,
        showOnlyBuildable: next.showOnlyBuildable
      }));
      return next;
    });
  };

  // Keep track of render bounds for picking math
  const transformRef = useRef({ offsetX: 0, offsetY: 0, finalScale: 1 });
  // Keep track of rendered objects for hit testing
  const renderedObjectsRef = useRef<{ id: string, instanceId: string, isoX: number, isoY: number, hitRadius: number }[]>([]);
  // Keep track of occupancy for grid rendering
  const occupancyRef = useRef<Map<string, string[]>>(new Map());

  // Generate grid when parameters or overrides change
  useEffect(() => {
    const rawGridLevels = TerrainGenerator.generate(parameters.width, parameters.height, parameters.seed, parameters.noiseScale, objectAssets, groundOverrides, levels);

    // Extract all procedural objects
    const allObjects: PlacedObject[] = [];
    for (const level of levels) {
      const rawGrid = rawGridLevels[level];
      if (!rawGrid) continue;
      for (let y = 0; y < parameters.height; y++) {
        for (let x = 0; x < parameters.width; x++) {
          allObjects.push(...rawGrid[y][x].objects);
          rawGrid[y][x].objects = []; // Clear
        }
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
      const targetLayer = activeOverride ? (activeOverride as any).layer : obj.layer;

      const rawGrid = rawGridLevels[targetLayer];
      if (rawGrid && rawGrid[targetCellY] && rawGrid[targetCellY][targetCellX] && rawGrid[targetCellY][targetCellX].isLand) {
        rawGrid[targetCellY][targetCellX].objects.push({
          ...obj,
          cellX: targetCellX,
          cellY: targetCellY,
          lx: targetLx,
          ly: targetLy,
          layer: targetLayer
        });
      }
    }

    // Inject user-painted instances
    const proceduralIds = new Set(allObjects.map(o => o.instanceId));
    for (const [id, override] of Object.entries(instanceOverrides)) {
      if (!proceduralIds.has(id)) {
        const isDraggingThis = draggedInstance === id;
        const activeOverride = (isDraggingThis && dragSlot) ? dragSlot : override;

        if ((activeOverride as any).deleted) continue;

        const assetInfo = objectAssets?.find(a => a.id === (override as any).assetId);
        if (!assetInfo) continue;

        const targetLayer = (activeOverride as any).layer || 1;
        const targetCellX = activeOverride.cellX;
        const targetCellY = activeOverride.cellY;

        const rawGrid = rawGridLevels[targetLayer];
        if (rawGrid && rawGrid[targetCellY] && rawGrid[targetCellY][targetCellX] && rawGrid[targetCellY][targetCellX].isLand) {
          rawGrid[targetCellY][targetCellX].objects.push({
            id: assetInfo.id,
            instanceId: id,
            url: assetInfo.imageUrl,
            cellX: targetCellX,
            cellY: targetCellY,
            lx: activeOverride.lx,
            ly: activeOverride.ly,
            layer: targetLayer,
            baseTiles: assetInfo.baseTiles || [{ lx: 0, ly: 0 }]
          });
        }
      }
    }

    // Check for clipping
    let isClipping = false;
    const occupancy = new Map<string, string[]>();
    for (const level of levels) {
      const rawGrid = rawGridLevels[level];
      if (!rawGrid) continue;
      for (let y = 0; y < parameters.height; y++) {
        for (let x = 0; x < parameters.width; x++) {
          for (const obj of rawGrid[y][x].objects) {
            const assetInfo = objectAssets?.find(a => a.id === obj.id);
            const limit = Math.floor(1.5 * (assetInfo?.scale || 1.0));
            const rawBaseTiles = obj.baseTiles || [{ lx: 0, ly: 0 }];
            let baseTiles = rawBaseTiles.filter((t: { lx: number, ly: number }) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
            if (baseTiles.length === 0) baseTiles = [{ lx: 0, ly: 0 }];

            for (const tile of baseTiles) {
              const gx = x * 3 + obj.lx + tile.lx + 1;
              const gy = y * 3 + obj.ly + tile.ly + 1;
              const key = `${gx},${gy}`;
              if (occupancy.has(key)) {
                isClipping = true;
                occupancy.get(key)!.push(obj.instanceId);
              } else {
                occupancy.set(key, [obj.instanceId]);
              }
            }
          }
        }
      }
    }
    occupancyRef.current = occupancy;
    setHasClippingAlert(isClipping);
    setGridLevels(rawGridLevels);
  }, [parameters, objectAssets, instanceOverrides, groundOverrides, draggedInstance, dragSlot, levels]);

  // Load images when ground asset changes
  useEffect(() => {
    if (!groundAsset || !groundAsset.slices) {
      setImages({});
      return;
    }

    setIsRendering(true);
    const loadedImages: Record<string, HTMLImageElement> = {};

    const slicesCount = groundAsset.slices.length;
    let objectsCount = objectAssets ? objectAssets.length : 0;
    if (objectAssets) {
      objectAssets.forEach(asset => {
        if (asset.shadowEnabled && asset.shadowImageUrl) objectsCount++;
      });
    }
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

        if (asset.shadowEnabled && asset.shadowImageUrl) {
          const shadowImg = new Image();
          shadowImg.onload = () => {
            loadedImages[`${asset.id}_shadow`] = shadowImg;
            checkLoaded();
          };
          shadowImg.onerror = () => {
            console.error("Failed to load shadow image:", asset.id);
            checkLoaded();
          }
          shadowImg.src = asset.shadowImageUrl;
        }
      });
    }
  }, [groundAsset, objectAssets]);

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    if (Object.keys(images).length === 0 || Object.keys(gridLevels).length === 0) return;

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

    const grid = gridLevels[1] || [];
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

    const offsetX = (clientWidth / 2) - ((minX + maxX) / 2) * finalScale + panOffset.x;
    const offsetY = (clientHeight / 2) - ((minY + maxY) / 2) * finalScale - (tileHalfHeight * finalScale) + panOffset.y;

    transformRef.current = { offsetX, offsetY, finalScale };
    renderedObjectsRef.current = [];

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(finalScale, finalScale);

    const cellsToRender = [];

    const heightMap: Record<string, number> = {};
    for (const level of levels) {
      const gridLvl = gridLevels[level];
      if (!gridLvl) continue;
      for (let y = 0; y < gridLvl.length; y++) {
        for (let x = 0; x < gridLvl[y].length; x++) {
          if (gridLvl[y][x].isLand) heightMap[`${x},${y}`] = level;
        }
      }
    }

    const checkSubCellBuildable = (cx: number, cy: number, layer: number, lx: number, ly: number) => {
      if (!gridSettings.showOnlyBuildable) return true;

      // Subtile mapping 1-9
      let sub = 0;
      if (ly === -1) {
        if (lx === -1) sub = 1;
        else if (lx === 0) sub = 2;
        else if (lx === 1) sub = 3;
      } else if (ly === 0) {
        if (lx === -1) sub = 4;
        else if (lx === 0) sub = 5;
        else if (lx === 1) sub = 6;
      } else if (ly === 1) {
        if (lx === -1) sub = 7;
        else if (lx === 0) sub = 8;
        else if (lx === 1) sub = 9;
      }

      // 1. Same position (Higher Level)
      const hSame = heightMap[`${cx},${cy}`];
      if (hSame !== undefined && hSame > layer) return false;

      // 2. Tile at col, row-1 (User's "Right", Visual Top-Right)
      const hRight = heightMap[`${cx},${cy - 1}`];
      if (hRight !== undefined && hRight > layer) {
        if ([1, 2, 3, 5, 6, 9].includes(sub)) return false;
      }

      // 3. Tile at col-1, row (User's "Underneath", Visual Top-Left)
      const hUnder = heightMap[`${cx - 1},${cy}`];
      if (hUnder !== undefined && hUnder > layer) {
        if ([1, 4, 5, 7, 8, 9].includes(sub)) return false;
      }

      // 4. Tile at col-1, row-1 (User's "Bottom Right", Visual Top)
      const hBottomRight = heightMap[`${cx - 1},${cy - 1}`];
      if (hBottomRight !== undefined && hBottomRight > layer) {
        return false;
      }

      // Water boundaries check
      const layerGrid = gridLevels[layer];
      if (!layerGrid) return false;
      const isWater = (nx: number, ny: number) => {
        return !layerGrid[ny] || !layerGrid[ny][nx].isLand;
      };

      if (ly === -1 && isWater(cx, cy - 1)) return false;
      if (ly === 1 && isWater(cx, cy + 1)) return false;
      if (lx === -1 && isWater(cx - 1, cy)) return false;
      if (lx === 1 && isWater(cx + 1, cy)) return false;

      if (lx === -1 && ly === -1 && isWater(cx - 1, cy - 1)) return false;
      if (lx === 1 && ly === -1 && isWater(cx + 1, cy - 1)) return false;
      if (lx === -1 && ly === 1 && isWater(cx - 1, cy + 1)) return false;
      if (lx === 1 && ly === 1 && isWater(cx + 1, cy + 1)) return false;

      return true;
    };

    const sortedLevels = [...levels].sort((a, b) => a - b);
    for (const level of sortedLevels) {
      const gridLvl = gridLevels[level];
      if (!gridLvl) continue;

      const yOffset = 0; // Removed elevation offset

      for (let row = 0; row < gridLvl.length; row++) {
        for (let col = 0; col < gridLvl[row].length; col++) {
          if (gridLvl[row][col].isLand && gridLvl[row][col].tileId) {
            const isoX = (col - row) * tileHalfWidth;
            const isoY = (col + row) * tileHalfHeight - yOffset;

            // Frustum Culling
            const screenX = isoX * finalScale + offsetX;
            const screenY = isoY * finalScale + offsetY;

            // Generous bounding box in screen pixels
            const cLeft = screenX - 200 * finalScale;
            const cRight = screenX + 200 * finalScale;
            const cTop = screenY - 1500 * finalScale;
            const cBottom = screenY + 300 * finalScale;

            if (cRight < 0 || cLeft > clientWidth || cBottom < 0 || cTop > clientHeight) {
              continue; // Cull this tile and its objects
            }

            cellsToRender.push({
              ...gridLvl[row][col],
              col, row,
              isoX,
              isoY,
              depth: row + col + (level * 1000),
              isTopFace: heightMap[`${col},${row}`] === level
            });
          }
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

      if (gridSettings.show && cell.isTopFace) {
        ctx.save();

        // Calculate dynamic grid color based on brightness
        const c = Math.round((gridSettings.brightness / 100) * 255);
        const gridColor = `rgba(${c}, ${c}, ${c}, ${gridSettings.opacity / 100})`;
        const fillAlpha = (gridSettings.opacity / 100) * 0.8;

        // Draw occupied slots
        for (let lx = -1; lx <= 1; lx++) {
          for (let ly = -1; ly <= 1; ly++) {
            if (!checkSubCellBuildable(cell.col, cell.row, cell.layer, lx, ly)) continue;

            const gx = cell.col * 3 + lx + 1;
            const gy = cell.row * 3 + ly + 1;
            const key = `${gx},${gy}`;

            const occupants = occupancyRef.current?.get(key);
            if (occupants && occupants.length > 0) {
              const isSelected = activeSelection?.type === 'object' && activeSelection.instanceId && occupants.includes(activeSelection.instanceId);
              ctx.fillStyle = isSelected ? `rgba(34, 197, 94, ${fillAlpha})` : `rgba(239, 68, 68, ${fillAlpha})`;

              const slotIsoX = cell.isoX + (lx - ly) * (140 / 3);
              const slotIsoY = cell.isoY + (lx + ly) * (70 / 3);

              ctx.beginPath();
              ctx.moveTo(slotIsoX, slotIsoY - 70 / 3);
              ctx.lineTo(slotIsoX + 140 / 3, slotIsoY);
              ctx.lineTo(slotIsoX, slotIsoY + 70 / 3);
              ctx.lineTo(slotIsoX - 140 / 3, slotIsoY);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // Draw the individual subgrid outlines to respect buildable toggle
        for (let lx = -1; lx <= 1; lx++) {
          for (let ly = -1; ly <= 1; ly++) {
            const isBuildable = checkSubCellBuildable(cell.col, cell.row, cell.layer, lx, ly);
            
            // If we are not showing buildable overlays, we just skip unbuildable grid lines (legacy behavior)
            // Wait, the user said "Make buildable toggle overlay buildable tiles with light green, non-buildable with light red."
            // So if gridSettings.showOnlyBuildable is false, we just draw the normal lines for EVERYTHING.
            
            if (!gridSettings.showOnlyBuildable && !isBuildable) continue; // Wait, if showOnlyBuildable is false, isBuildable is always true anyway because of checkSubCellBuildable's first line!

            const slotIsoX = cell.isoX + (lx - ly) * (140 / 3);
            const slotIsoY = cell.isoY + (lx + ly) * (70 / 3);

            ctx.beginPath();
            ctx.moveTo(slotIsoX, slotIsoY - 70 / 3);
            ctx.lineTo(slotIsoX + 140 / 3, slotIsoY);
            ctx.lineTo(slotIsoX, slotIsoY + 70 / 3);
            ctx.lineTo(slotIsoX - 140 / 3, slotIsoY);
            ctx.closePath();

            if (gridSettings.showOnlyBuildable) {
              ctx.fillStyle = isBuildable ? `rgba(34, 197, 94, 0.3)` : `rgba(239, 68, 68, 0.3)`;
              ctx.fill();
            }

            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

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

      const assetInfo = objectAssets?.find(a => a.id === obj.id);
      if (assetInfo && assetInfo.shadowEnabled && assetInfo.shadowImageUrl) {
        const shadowImg = images[`${obj.id}_shadow`];
        if (shadowImg && assetInfo.shadowWidth && assetInfo.shadowHeight && assetInfo.shadowAnchorX !== undefined && assetInfo.shadowAnchorY !== undefined) {
          const shadowW = assetInfo.shadowWidth * obj.scale;
          const shadowH = assetInfo.shadowHeight * obj.scale;
          const ox = ((assetInfo.shadowOffsetX || 0) / 100) * obj.objW;
          const oy = ((assetInfo.shadowOffsetY || 0) / 100) * obj.objH;
          const drawX = obj.imgCenterX - assetInfo.shadowAnchorX * obj.scale + ox;
          const drawY = obj.imgBottomY - assetInfo.shadowAnchorY * obj.scale + oy;
          ctx.drawImage(shadowImg, drawX, drawY, shadowW, shadowH);
        }
      }

      if (activeSelection?.type === 'object' && activeSelection.instanceId === obj.instanceId) {
        ctx.shadowColor = '#4f46e5';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(obj.objImg, obj.imgCenterX - obj.objW / 2, obj.imgBottomY - obj.objH, obj.objW, obj.objH);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.drawImage(obj.objImg, obj.imgCenterX - obj.objW / 2, obj.imgBottomY - obj.objH, obj.objW, obj.objH);
      }

      ctx.restore();

      // Save hit-test data
      renderedObjectsRef.current.push({
        id: obj.id,
        instanceId: obj.instanceId,
        isoX: obj.imgCenterX,
        isoY: obj.imgBottomY - obj.objH / 2, // Shift hit center up to the middle of the sprite
        hitRadius: 80 * obj.scale
      });
    }

    // Brush Preview
    if (activeTool === 'paint' && brushPos && (activeSelection?.type === 'object' || activeSelection?.type === 'ground')) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      const tintColor = brushPos.isValid ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';

      const dx = 140 / 3;
      const dy = 70 / 3;

      const renderLevel = activeSelection?.type === 'ground' ? activeLevel : (brushPos.level === 0 ? 1 : brushPos.level);
      const brushYOffset = 0; // Removed elevation offset

      if (activeSelection?.type === 'ground') {
        // Draw 2x2 ground highlight
        ctx.fillStyle = tintColor;
        const cellX = Math.floor((brushPos.gx + 1) / 3);
        const cellY = Math.floor((brushPos.gy + 1) / 3);

        for (let py = 0; py < 2; py++) {
          for (let px = 0; px < 2; px++) {
            const cx = cellX + px;
            const cy = cellY + py;
            const tileIsoX = (cx - cy) * 140;
            const tileIsoY = (cx + cy) * 70 - brushYOffset;

            for (let lx = -1; lx <= 1; lx++) {
              for (let ly = -1; ly <= 1; ly++) {
                const slotIsoX = tileIsoX + (lx - ly) * (140 / 3);
                const slotIsoY = tileIsoY + (lx + ly) * (70 / 3);

                ctx.beginPath();
                ctx.moveTo(slotIsoX, slotIsoY - 70 / 3);
                ctx.lineTo(slotIsoX + 140 / 3, slotIsoY);
                ctx.lineTo(slotIsoX, slotIsoY + 70 / 3);
                ctx.lineTo(slotIsoX - 140 / 3, slotIsoY);
                ctx.closePath();
                ctx.fill();
              }
            }
          }
        }
      } else if (activeSelection?.type === 'object') {
        // Draw object preview
        const objImg = images[activeSelection.id];
        const assetInfo = objectAssets?.find(a => a.id === activeSelection.id);
        if (objImg && assetInfo) {
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

          const slotIsoX = (brushPos.gx - brushPos.gy) * dx;
          const slotIsoY = (brushPos.gx + brushPos.gy) * dy - brushYOffset;

          // Draw footprint grid underneath the image
          const rawBaseTiles = assetInfo.baseTiles || [{ lx: 0, ly: 0 }];
          const limit = Math.floor(1.5 * scale);
          let baseTiles = rawBaseTiles.filter((t: { lx: number, ly: number }) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
          if (baseTiles.length === 0) baseTiles = [{ lx: 0, ly: 0 }];

          ctx.fillStyle = tintColor;
          for (const tile of baseTiles) {
            const tileSlotIsoX = slotIsoX + (tile.lx - tile.ly) * dx;
            const tileSlotIsoY = slotIsoY + (tile.lx + tile.ly) * dy;
             
            ctx.beginPath();
            ctx.moveTo(tileSlotIsoX, tileSlotIsoY - dy);
            ctx.lineTo(tileSlotIsoX + dx, tileSlotIsoY);
            ctx.lineTo(tileSlotIsoX, tileSlotIsoY + dy);
            ctx.lineTo(tileSlotIsoX - dx, tileSlotIsoY);
            ctx.closePath();
            ctx.fill();
          }

          const gridOffsetX = assetInfo.gridOffset?.x || 0;
          const gridOffsetY = assetInfo.gridOffset?.y || 0;
          const imgCenterX = slotIsoX - gridOffsetX * scale;
          const imgBottomY = slotIsoY - gridOffsetY * scale;

          ctx.drawImage(objImg, imgCenterX - objW / 2, imgBottomY - objH, objW, objH);
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [gridLevels, levels, images, zoomMultiplier, draggedInstance, gridSettings, panOffset, activeSelection, activeTool, brushPos]);

  // Interactivity Handlers
  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      setIsMapPanning(true);
      setLastPanPos({ x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

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
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < o.hitRadius && dist < closestDist) {
        closestDist = dist;
        picked = o;
      }
    }

    if (picked) {
      if (activeTool === 'select') {
        setDraggedInstance(picked.instanceId);
        setDragSlot(null);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (setActiveSelection) setActiveSelection({ type: 'object', id: picked.id, instanceId: picked.instanceId });
      } else if (activeTool === 'erase') {
        // Erase object
        setInstanceOverrides(prev => ({
          ...prev,
          [picked.instanceId]: {
            ...(prev[picked.instanceId] || { cellX: 0, cellY: 0, lx: 0, ly: 0 }),
            deleted: true
          }
        }));
      }
    }

    if (activeTool === 'paint' || activeTool === 'erase') {
      setIsPainting(true);
      paintStrokesRef.current = {};
      e.currentTarget.setPointerCapture(e.pointerId);

      const dxGrid = 140 / 3;
      const dyGrid = 70 / 3;
      const gx = Math.round((isoX / dxGrid + isoY / dyGrid) / 2);
      const gy = Math.round((isoY / dyGrid - isoX / dxGrid) / 2);

      applyPaintErase(gx, gy, activeTool);
    }
  };

  const applyPaintErase = (gx: number, gy: number, tool: 'paint' | 'erase') => {
    if (tool === 'paint') {
      if (activeSelection?.type === 'ground') {
        const cellX = Math.floor((gx + 1) / 3);
        const cellY = Math.floor((gy + 1) / 3);
        let hasChanges = false;
        const newStrokes: Record<string, number> = {};
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const key = `${activeLevel},${cellX + dx},${cellY + dy}`;
            if (groundOverrides[key] !== 1 && paintStrokesRef.current[key] !== 1) {
              paintStrokesRef.current[key] = 1;
              newStrokes[key] = 1;
              hasChanges = true;
            }
          }
        }
        if (hasChanges) {
          setGroundOverrides(prev => ({ ...prev, ...newStrokes }));
        }
      } else if (activeSelection?.type === 'object') {
        const cellX = Math.floor(gx / 3);
        const cellY = Math.floor(gy / 3);
        const lx = gx - cellX * 3 - 1;
        const ly = gy - cellY * 3 - 1;

        let maxLevel = 0;
        for (const level of levels) {
          if (gridLevels[level] && gridLevels[level][cellY] && gridLevels[level][cellY][cellX] && gridLevels[level][cellY][cellX].isLand) {
            if (level > maxLevel) maxLevel = level;
          }
        }

        const strokeKey = `obj_${gx}_${gy}`;

        if (!paintStrokesRef.current[strokeKey]) {
          paintStrokesRef.current[strokeKey] = activeLevel;
          const newInstanceId = `painted_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          setInstanceOverrides(prev => ({
            ...prev,
            [newInstanceId]: {
              cellX,
              cellY,
              lx: gx - cellX * 3 - 1,
              ly: gy - cellY * 3 - 1,
              layer: maxLevel === 0 ? 1 : maxLevel,
              assetId: activeSelection.id
            } as any
          }));
        }
      }
    } else if (tool === 'erase') {
      if (activeSelection?.type === 'ground') {
        const cellX = Math.floor((gx + 1) / 3);
        const cellY = Math.floor((gy + 1) / 3);
        const key = `${activeLevel},${cellX},${cellY}`;
        if (groundOverrides[key] !== 0 && paintStrokesRef.current[key] !== 0) {
          paintStrokesRef.current[key] = 0;
          setGroundOverrides(prev => ({ ...prev, [key]: 0 }));
        }
      }
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isMapPanning) {
      const dx = e.clientX - lastPanPos.x;
      const dy = e.clientY - lastPanPos.y;
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPos({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!canvasRef.current) return;

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

    // Check layer bounds validity
    let maxLevel = 0;
    for (const level of levels) {
      if (gridLevels[level] && gridLevels[level][cellY] && gridLevels[level][cellY][cellX] && gridLevels[level][cellY][cellX].isLand) {
        if (level > maxLevel) maxLevel = level;
      }
    }
    const isValid = true;

    setBrushPos({ gx, gy, cellX, cellY, isValid, level: maxLevel });

    if (draggedInstance) {
      setDragSlot({ cellX, cellY, lx, ly, layer: maxLevel === 0 ? 1 : maxLevel });
    } else if (isPainting && activeTool === 'erase') {
      applyPaintErase(gx, gy, activeTool);

      // Hit test for rapid object erasing
      let closestDist = Infinity;
      let picked = null;
      for (const o of renderedObjectsRef.current) {
        const dX = o.isoX - isoX;
        const dY = o.isoY - isoY;
        const dist = Math.sqrt(dX * dX + dY * dY);
        if (dist < o.hitRadius && dist < closestDist) {
          closestDist = dist;
          picked = o;
        }
      }
      if (picked) {
        setInstanceOverrides(prev => ({
          ...prev,
          [picked.instanceId]: {
            ...(prev[picked.instanceId] || { cellX: 0, cellY: 0, lx: 0, ly: 0 }),
            deleted: true
          } as any
        }));
      }
    } else if (isPainting && activeTool !== 'select') {
      applyPaintErase(gx, gy, activeTool as 'paint' | 'erase');
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isMapPanning) {
      setIsMapPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (isPainting) {
      setIsPainting(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (Object.keys(paintStrokesRef.current).length > 0 && activeSelection?.type === 'ground') {
        setGroundOverrides(prev => ({ ...prev, ...paintStrokesRef.current }));
      }
    }
    if (draggedInstance) {
      if (dragSlot) {
        let isDeleted = false;
        if (dragSlot.cellX < 0 || dragSlot.cellX >= parameters.width || dragSlot.cellY < 0 || dragSlot.cellY >= parameters.height) {
          isDeleted = true; // Off grid completely
        }

        setInstanceOverrides(prev => ({
          ...prev,
          [draggedInstance]: { ...(prev[draggedInstance] || {}), ...dragSlot, deleted: isDeleted } as any
        }));
      }
      setDraggedInstance(null);
      setDragSlot(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleDeleteLevel = (e: React.MouseEvent, levelId: number) => {
    e.stopPropagation();
    if (levels.length <= 1) return;

    setLevels(prev => prev.filter(l => l !== levelId));
    if (activeLevel === levelId) {
       const remaining = levels.filter(l => l !== levelId);
       if (remaining.length > 0) setActiveLevel(remaining[remaining.length - 1]);
    }
    
    setGroundOverrides(prev => {
       const next = { ...prev };
       for (const key of Object.keys(next)) {
          if (key.startsWith(`${levelId},`)) {
             next[key] = 0;
          }
       }
       return next;
    });

    setInstanceOverrides(prev => {
       const next = { ...prev };
       for (const key of Object.keys(next)) {
          if (next[key].layer === levelId) {
             next[key] = { ...next[key], deleted: true };
          }
       }
       return next;
    });
  };

  const eraseCursorUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="red" stroke-width="2" fill="rgba(255,0,0,0.3)"/></svg>`;

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {!groundAsset ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
          <p>Import a Ground Asset to preview the map</p>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className={`w-full h-full outline-none touch-none ${isMapPanning || draggedInstance ? 'cursor-grabbing' : (activeTool === 'select' ? 'cursor-grab' : '')}`}
            style={{
              cursor: activeTool === 'erase' ? `url('${eraseCursorUrl}') 12 12, crosshair` : undefined
            }}
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
          {isRendering && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-emerald-400 px-4 py-2 rounded-full border border-emerald-500/30 backdrop-blur-md z-20 flex items-center shadow-lg pointer-events-none">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <p className="text-xs font-bold tracking-wider uppercase">Syncing Assets...</p>
            </div>
          )}
        </>
      )}

      {groundAsset && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          <div className="relative">
            {showGridMenu && (
              <div className="absolute bottom-full right-0 mb-3 w-64 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-lg p-4 shadow-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-200">Show Grid</span>
                  <button
                    onClick={() => updateGridSettings({ show: !gridSettings.show })}
                    className={`w-10 h-5 rounded-full transition-colors relative ${gridSettings.show ? 'bg-indigo-500' : 'bg-gray-600'}`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${gridSettings.show ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Buildable Only</span>
                  <button
                    onClick={() => updateGridSettings({ showOnlyBuildable: !gridSettings.showOnlyBuildable })}
                    className={`w-10 h-5 rounded-full transition-colors relative ${gridSettings.showOnlyBuildable ? 'bg-emerald-500' : 'bg-gray-600'}`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${gridSettings.showOnlyBuildable ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Opacity</span>
                    <span>{gridSettings.opacity}%</span>
                  </div>
                  <input
                    type="range" min="10" max="100" value={gridSettings.opacity}
                    onChange={(e) => updateGridSettings({ opacity: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Brightness</span>
                    <span>{gridSettings.brightness}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" value={gridSettings.brightness}
                    onChange={(e) => updateGridSettings({ brightness: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => setShowGridMenu(!showGridMenu)}
              className={`p-3 rounded-full shadow-lg border border-[var(--color-blender-border)] transition-all ${gridSettings.show ? 'bg-indigo-600 text-white' : 'bg-[var(--color-blender-panel)] text-gray-400 hover:text-white'}`}
              title="Grid Settings"
            >
              <Grid3X3 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {hasClippingAlert && (
        <div className="absolute top-4 left-4 bg-red-900/80 text-red-200 px-3 py-2 rounded-lg flex items-center gap-2 shadow-xl border border-red-500/50 backdrop-blur-sm z-10 pointer-events-none">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div className="flex flex-col">
            <span className="text-sm font-bold">Assets Clipping</span>
            <span className="text-xs opacity-80">Some object footprints are overlapping.</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-lg p-2 shadow-2xl z-10">
        <button
          onClick={() => setActiveTool('select')}
          className={`p-2 rounded-lg transition-colors ${activeTool === 'select' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          title="Select / Move"
        >
          <MousePointer2 className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTool('paint')}
          className={`p-2 rounded-lg transition-colors ${activeTool === 'paint' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          title="Asset Painter"
        >
          <Paintbrush className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTool('erase')}
          className={`p-2 rounded-lg transition-colors ${activeTool === 'erase' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          title="Eraser"
        >
          <Eraser className="w-5 h-5" />
        </button>
      </div>

      {/* Level Menu */}
      {activeSelection?.type === 'ground' && (
        <div className="absolute bottom-4 left-4 flex flex-col items-start z-10">
          {layersExpanded && (
            <div className="mb-2 w-48 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-lg shadow-2xl overflow-hidden flex flex-col-reverse animate-in slide-in-from-bottom-2">
              <button
                onClick={() => setLevels(prev => [...prev, (prev[prev.length - 1] || 0) + 1])}
                className="w-full py-2 text-xs font-bold tracking-wider text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/40 border-t border-[var(--color-blender-border)] flex items-center justify-center gap-1 transition-colors"
              >
                + Add Level
              </button>
              {levels.slice().reverse().map(levelId => (
                <div
                  key={levelId}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-b border-[var(--color-blender-border)] last:border-b-0 ${activeLevel === levelId ? 'bg-indigo-600/20 shadow-[inset_0_0_12px_rgba(79,70,229,0.3)]' : 'hover:bg-white/5'
                    }`}
                  onClick={() => setActiveLevel(levelId)}
                >
                  <span className={`text-xs font-bold tracking-wide ${activeLevel === levelId ? 'text-indigo-300' : 'text-gray-300'}`}>
                    Level {levelId}
                  </span>
                  {levels.length > 1 && (
                    <button 
                       onClick={(e) => handleDeleteLevel(e, levelId)}
                       className="text-gray-500 hover:text-red-400 transition-colors p-1"
                       title="Delete Level"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setLayersExpanded(!layersExpanded)}
            className="flex items-center gap-2 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-full px-4 py-2 shadow-lg hover:bg-white/5 transition-colors"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Levels</span>
          </button>
        </div>
      )}
    </div>
  );
}

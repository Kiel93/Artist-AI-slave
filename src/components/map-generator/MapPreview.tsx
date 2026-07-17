import { useEffect, useRef, useState, PointerEvent, startTransition } from "react";
import { MapAsset, ObjectAsset, MapParameters, InstanceOverride, SelectionState } from "./MapGeneratorWorkspace";
import { TerrainGenerator, MapGridCell, PlacedObject } from "@/lib/map-engine/TerrainGenerator";
import { Loader2, Grid3X3, AlertTriangle, MousePointer2, Paintbrush, Eraser, Eye, EyeOff, Layers, Trash2 } from "lucide-react";

interface MapPreviewProps {
  groundAsset: MapAsset | null;
  objectAssets: ObjectAsset[];
  decalAssets?: any[];
  parameters: MapParameters;
  instanceOverrides: Record<string, InstanceOverride>;
  setInstanceOverrides: (overrides: Record<string, InstanceOverride> | ((prev: Record<string, InstanceOverride>) => Record<string, InstanceOverride>)) => void;
  groundOverrides: Record<string, number>;
  setGroundOverrides: (overrides: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  oceanAsset?: MapAsset | null;
  setParameters: (p: MapParameters) => void;
  oceanOverrides?: Record<string, number>;
  setOceanOverrides?: (overrides: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  decalOverrides?: Record<string, any>;
  setDecalOverrides?: (overrides: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  activeSelection?: SelectionState;
  setActiveSelection?: (s: SelectionState) => void;
  activeTool: 'select' | 'paint' | 'erase';
  setActiveTool: (t: 'select' | 'paint' | 'erase') => void;
  activeLevel: number;
  setActiveLevel: (l: number) => void;
  levels: number[];
  setLevels: React.Dispatch<React.SetStateAction<number[]>>;
  onStatsChange?: (stats: Record<string, number>) => void;
  mapDataRef?: React.MutableRefObject<{ gridLevels: any, objectInstances: any[] }>;
}

type Neighborhood = {
  n: number; e: number; s: number; w: number;
  ne: number; se: number; sw: number; nw: number;
  distN: number; distE: number; distS: number; distW: number;
  distNE: number; distSE: number; distSW: number; distNW: number;
};

const getNeighbors = (
  col: number, row: number, 
  canvasWidth: number, canvasHeight: number, 
  getDist: (cx: number, cy: number) => number, 
  isCurrent: (d: number | undefined) => number,
  fallbackDist: number
): Neighborhood => {
  const distN = col < canvasWidth - 1 ? getDist(col + 1, row) : fallbackDist;
  const distE = row > 0 ? getDist(col, row - 1) : fallbackDist;
  const distS = col > 0 ? getDist(col - 1, row) : fallbackDist;
  const distW = row < canvasHeight - 1 ? getDist(col, row + 1) : fallbackDist;

  const n = isCurrent(distN);
  const e = isCurrent(distE);
  const s = isCurrent(distS);
  const w = isCurrent(distW);

  const distNE = row > 0 && col < canvasWidth - 1 ? getDist(col + 1, row - 1) : fallbackDist;
  const distSE = row > 0 && col > 0 ? getDist(col - 1, row - 1) : fallbackDist;
  const distSW = row < canvasHeight - 1 && col > 0 ? getDist(col - 1, row + 1) : fallbackDist;
  const distNW = row < canvasHeight - 1 && col < canvasWidth - 1 ? getDist(col + 1, row + 1) : fallbackDist;

  const ne = isCurrent(distNE);
  const se = isCurrent(distSE);
  const sw = isCurrent(distSW);
  const nw = isCurrent(distNW);

  return { n, e, s, w, ne, se, sw, nw, distN, distE, distS, distW, distNE, distSE, distSW, distNW };
};

const formatTerrainTileId = (tileIdResult: string): string => {
  if (tileIdResult === 'CenterFill') return 'Center';
  if (tileIdResult.startsWith('InnerCorner')) return 'InnerCorner_' + tileIdResult.substring(11);
  if (tileIdResult.startsWith('Edge')) return 'Edge_' + tileIdResult.substring(4);
  if (tileIdResult.startsWith('OutterCorner')) return 'OutterCorner_' + tileIdResult.substring(12);
  return tileIdResult;
};

const getFoamMaskToDraw = (nb: Neighborhood): string | null => {
  // Hardcoded inner/outer corner overrides
  if (nb.distN === 0 && nb.distW === 0 && nb.distE > 0 && nb.distS > 0) return 'Tile_InnerCorner_South';
  if (nb.distN === 0 && nb.distE === 0 && nb.distW > 0 && nb.distS > 0) return 'Tile_InnerCorner_West';
  if (nb.distS === 0 && nb.distW === 0 && nb.distE > 0 && nb.distN > 0) return 'Tile_InnerCorner_East';
  if (nb.distS === 0 && nb.distE === 0 && nb.distW > 0 && nb.distN > 0) return 'Tile_InnerCorner_North';
  if (nb.distNW === 0 && nb.distN === 1 && nb.distS > 1) return 'Tile_OutterCorner_South';
  if (nb.distNE === 0 && nb.distN === 1 && nb.distS > 1) return 'Tile_OutterCorner_West';
  if (nb.distSW === 0 && nb.distS === 1 && nb.distN > 1) return 'Tile_OutterCorner_East';
  if (nb.distSE === 0 && nb.distS === 1 && nb.distN > 1) return 'Tile_OutterCorner_North';
  
  if (nb.n === 0 && nb.e === 0 && nb.s === 0 && nb.w === 0) return 'Tile_Center';
  
  if (nb.n === 1 && nb.e === 1 && nb.s === 1 && nb.w === 1) {
    const tileIdResult = TerrainGenerator.getTileId(nb.n, nb.e, nb.s, nb.w, nb.ne, nb.se, nb.sw, nb.nw);
    if (tileIdResult) return `Tile_${formatTerrainTileId(tileIdResult)}`;
  } else {
    const tileIdResult = TerrainGenerator.getTileId(nb.n, nb.e, nb.s, nb.w, 1, 1, 1, 1);
    if (tileIdResult) return `Tile_${formatTerrainTileId(tileIdResult)}`;
  }
  return null;
};

// <label>
export default function MapPreview({
  groundAsset,
  objectAssets,
  parameters,
  instanceOverrides,
  setInstanceOverrides,
  groundOverrides,
  setGroundOverrides,
  oceanAsset,
  setParameters,
  oceanOverrides,
  setOceanOverrides,
  decalOverrides,
  setDecalOverrides,
  activeSelection,
  setActiveSelection,
  activeTool,
  setActiveTool,
  activeLevel,
  setActiveLevel,
  levels,
  setLevels,
  onStatsChange,
  decalAssets,
  mapDataRef
}: MapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [gridLevels, setGridLevels] = useState<Record<number, MapGridCell[][]>>({});
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [isRendering, setIsRendering] = useState(false);
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

  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  const [isMapPanning, setIsMapPanning] = useState(false);
  const lastStatsRef = useRef<string>('');
  const [isPainting, setIsPainting] = useState(false);
  const paintStrokesRef = useRef<Record<string, number>>({});
  const [brushPos, setBrushPos] = useState<{ gx: number, gy: number, cellX: number, cellY: number, isValid: boolean, level: number, isoX?: number, isoY?: number } | null>(null);
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

  useEffect(() => {
    setIsCameraInitialized(false);
  }, [parameters.canvasWidth, parameters.canvasHeight]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    if (Object.keys(gridLevels).length === 0) return;
    if (isCameraInitialized) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: clientWidth, height: clientHeight } = entry.contentRect;
      if (clientWidth < 10 || clientHeight < 10) return;

      const tileHalfWidth = 140;
      const tileHalfHeight = 70;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      
      const grid = gridLevels[1] || [];
      for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
          const isoX = (col - row) * tileHalfWidth;
          const isoY = -(col + row) * tileHalfHeight;
          if (isoX < minX) minX = isoX;
          if (isoX > maxX) maxX = isoX;
          if (isoY < minY) minY = isoY;
          if (isoY > maxY) maxY = isoY;
        }
      }

      if (minX === Infinity) return;

      const gridWidth = maxX - minX + (tileHalfWidth * 2);
      const gridHeight = maxY - minY + (tileHalfHeight * 4);

      const padding = 50;
      const autoScaleX = (clientWidth - padding * 2) / gridWidth;
      const autoScaleY = (clientHeight - padding * 2) / gridHeight;
      const autoScale = Math.max(0.1, Math.min(autoScaleX, autoScaleY, 1));

      const offsetX = (clientWidth / 2) - ((minX + maxX) / 2) * autoScale;
      const offsetY = (clientHeight / 2) - ((minY + maxY) / 2) * autoScale - (tileHalfHeight * autoScale);

      setCamera({ x: offsetX, y: offsetY, scale: autoScale });
      setIsCameraInitialized(true);
      observer.disconnect();
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [gridLevels, isCameraInitialized]);

  // Keep track of render bounds for picking math
  const transformRef = useRef({ offsetX: 0, offsetY: 0, finalScale: 1 });
  // Keep track of rendered objects for hit testing
  const renderedObjectsRef = useRef<{ id: string, instanceId: string, isoX: number, isoY: number, objW: number, objH: number }[]>([]);
  // Keep track of occupancy for grid rendering
  const occupancyRef = useRef<Map<string, string[]>>(new Map());

  // Generate grid when parameters or overrides change
  useEffect(() => {
    const rawGridLevels = TerrainGenerator.generate(parameters.canvasWidth, parameters.canvasHeight, parameters.islandWidth, parameters.islandHeight, parameters.seed, parameters.noiseScale, objectAssets, groundOverrides, levels);

    // We add a base level 0 for water plane
    const baseGrid: MapGridCell[][] = [];
    for (let y = 0; y < parameters.canvasHeight; y++) {
      const row: MapGridCell[] = [];
      for (let x = 0; x < parameters.canvasWidth; x++) {
        // Find distance to nearest land on level 1
        let minLandDist = Infinity;
        if (rawGridLevels[1]) {
          if (rawGridLevels[1][y][x].isLand) {
            minLandDist = 0;
          } else {
            // Scan for nearest land (Manhattan distance / Chebyshev distance)
            for (let ly = 0; ly < parameters.canvasHeight; ly++) {
              for (let lx = 0; lx < parameters.canvasWidth; lx++) {
                if (rawGridLevels[1][ly][lx].isLand) {
                  const d = Math.max(Math.abs(lx - x), Math.abs(ly - y));
                  if (d < minLandDist) minLandDist = d;
                }
              }
            }
          }
        }

        let mappedDist = minLandDist;
        if (minLandDist > 0 && parameters.oceanTaperWidths) {
          let currentD = 1;
          let assignedLvl = 1;
          const maxLvl = parameters.oceanTaperLevels || 0;
          while (assignedLvl <= maxLvl) {
            const w = parameters.oceanTaperWidths[assignedLvl] !== undefined ? parameters.oceanTaperWidths[assignedLvl] : (assignedLvl === 0 ? 0 : 1);
            if (w > 0 && minLandDist >= currentD && minLandDist < currentD + w) {
              mappedDist = assignedLvl;
              break;
            }
            if (w > 0) currentD += w;
            assignedLvl++;
          }
          if (assignedLvl > maxLvl) {
            mappedDist = maxLvl + 1; // Beyond the last taper level
          }
        }

        const overrideKey = `${x},${y}`;
        if (oceanOverrides && oceanOverrides[overrideKey] !== undefined) {
          mappedDist = oceanOverrides[overrideKey];
        }

        row.push({ x, y, isLand: false, tileId: 'CenterFill', objects: [], layer: 0, distance: mappedDist, rawDistance: minLandDist } as any);
      }
      baseGrid.push(row);
    }

    // --- ENFORCE CA CONSTRAINTS ON OCEAN DEPTHS ---
    // This prevents 1x1 and 1-wide painted ocean tiles from remaining in the data
    const maxLvl = parameters.oceanTaperLevels || 0;
    for (let d = 1; d <= maxLvl; d++) {
      // 1. Extract boolean mask for current depth level
      const depthMask: boolean[][] = [];
      for (let y = 0; y < parameters.canvasHeight; y++) {
        depthMask[y] = [];
        for (let x = 0; x < parameters.canvasWidth; x++) {
          const cell = baseGrid[y]?.[x];
          depthMask[y][x] = cell ? (cell.distance || 0) <= d : false;
        }
      }

      // 2. Enforce standard CA constraints with double buffering
      let changed = true;
      let passes = 0;
      while (changed && passes < 10) {
        changed = false;
        passes++;
        const newMask = depthMask.map(row => [...row]);
        
        for (let y = 0; y < parameters.canvasHeight; y++) {
          for (let x = 0; x < parameters.canvasWidth; x++) {
            if (!depthMask[y][x]) continue;

            const N = y > 0 && depthMask[y - 1][x];
            const S = y < parameters.canvasHeight - 1 && depthMask[y + 1][x];
            const E = x < parameters.canvasWidth - 1 && depthMask[y][x + 1];
            const W = x > 0 && depthMask[y][x - 1];

            const cardinals = (N ? 1 : 0) + (S ? 1 : 0) + (E ? 1 : 0) + (W ? 1 : 0);

            if (cardinals < 2) {
              newMask[y][x] = false;
              changed = true;
              continue;
            }

            if (cardinals === 2) {
              if (N && S) {
                if (x < parameters.canvasWidth - 1 && !newMask[y][x + 1]) {
                  newMask[y][x + 1] = true;
                  changed = true;
                }
              } else if (E && W) {
                if (y < parameters.canvasHeight - 1 && !newMask[y + 1][x]) {
                  newMask[y + 1][x] = true;
                  changed = true;
                }
              }
            }
          }
        }
        
        for (let y = 0; y < parameters.canvasHeight; y++) {
          for (let x = 0; x < parameters.canvasWidth; x++) {
            depthMask[y][x] = newMask[y][x];
          }
        }
      }

      // 3. Write back to distance map
      for (let y = 0; y < parameters.canvasHeight; y++) {
        for (let x = 0; x < parameters.canvasWidth; x++) {
          const cell = baseGrid[y]?.[x];
          if (!cell) continue;
          if (!depthMask[y]?.[x] && (cell.distance || 0) <= d) {
            cell.distance = d + 1; // Downgrade to lower depth
          } else if (depthMask[y]?.[x] && (cell.distance || 0) > d) {
            cell.distance = d; // Thickened to higher depth
          }
        }
      }
    }

    rawGridLevels[0] = baseGrid;

    // Extract all procedural objects
    // --- PRECOMPUTE TAPER AND FOAM TILES FOR ALL LEVEL 0 CELLS ---
    if (parameters.oceanTaperLevels > 0 || parameters.oceanAddFoam) {
      for (let r = 0; r < parameters.canvasHeight; r++) {
        for (let c = 0; c < parameters.canvasWidth; c++) {
          const cell = baseGrid[r]?.[c];
          if (!cell) continue;

          // Precompute taperTile
          if (parameters.oceanTaperLevels > 0) {
            const maxLvl = parameters.oceanTaperLevels;
            for (let lvl = 1; lvl <= maxLvl + 1; lvl++) {
              if ((cell.distance || 0) >= lvl) {
                let maskToDraw: string | null = null;
                let isUniformDarken = false;

                if ((cell.distance || 0) > lvl) {
                  isUniformDarken = true;
                  cell.taperTile = `Lvl${lvl}_Tile_Center`;
                } else if (lvl > maxLvl) {
                  maskToDraw = 'Tile_Center';
                } else {
                  const isCurrent = (d: number | undefined) => (d !== undefined && d <= lvl) ? 1 : 0;
                  const getDist = (cx: number, cy: number) => {
                    if (cx < 0 || cx >= parameters.canvasWidth || cy < 0 || cy >= parameters.canvasHeight) return 999;
                    return baseGrid[cy]?.[cx]?.distance || 0;
                  };

                  const nb = getNeighbors(c, r, parameters.canvasWidth, parameters.canvasHeight, getDist, isCurrent, 999);

                  if (nb.n === 0 && nb.e === 0 && nb.s === 0 && nb.w === 0) {
                    maskToDraw = 'Tile_Center';
                  } else if (nb.n === 1 && nb.e === 1 && nb.s === 1 && nb.w === 1) {
                    const tileIdResult = TerrainGenerator.getTileId(nb.n, nb.e, nb.s, nb.w, nb.ne, nb.se, nb.sw, nb.nw);
                    if (tileIdResult) maskToDraw = `Tile_${formatTerrainTileId(tileIdResult)}`;
                  } else {
                    const tileIdResult = TerrainGenerator.getTileId(nb.n, nb.e, nb.s, nb.w, 1, 1, 1, 1);
                    if (tileIdResult) maskToDraw = `Tile_${formatTerrainTileId(tileIdResult)}`;
                  }
                }

                if (!isUniformDarken && maskToDraw) {
                  cell.taperTile = `Lvl${lvl}_${maskToDraw}`;
                }
              }
            }
          }

          // Precompute foamTile
          if (parameters.oceanAddFoam) {
            if ((cell as any).rawDistance === 1) {
              const getRawDist = (cx: number, cy: number) => {
                if (cx < 0 || cx >= parameters.canvasWidth || cy < 0 || cy >= parameters.canvasHeight) return 2;
                return (baseGrid[cy]?.[cx] as any)?.rawDistance || 0;
              };

              const isCurrent = (d: number | undefined) => (d !== undefined && d <= 1) ? 1 : 0;
              const nb = getNeighbors(c, r, parameters.canvasWidth, parameters.canvasHeight, getRawDist, isCurrent, (cell as any).rawDistance || 0);
              const foamMaskToDraw = getFoamMaskToDraw(nb);

              if (foamMaskToDraw && foamMaskToDraw !== 'Tile_Center') {
                cell.foamTile = foamMaskToDraw;
              }
            } else if (cell.distance === 0) {
              cell.foamTile = 'Tile_Center';
            }
          }
        }
      }
    }

    // Extract all procedural objects
    const allObjects: PlacedObject[] = [];
    for (const level of levels) {
      const rawGrid = rawGridLevels[level];
      if (!rawGrid) continue;
      for (let y = 0; y < parameters.canvasHeight; y++) {
        for (let x = 0; x < parameters.canvasWidth; x++) {
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
      for (let y = 0; y < parameters.canvasHeight; y++) {
        for (let x = 0; x < parameters.canvasWidth; x++) {
          for (const obj of rawGrid[y][x].objects) {
            const assetInfo = objectAssets?.find(a => a.id === obj.id);
            const rawBaseTiles = obj.baseTiles || [{ lx: 0, ly: 0 }];
            let baseTiles = rawBaseTiles;
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
    if (mapDataRef) {
      mapDataRef.current.gridLevels = rawGridLevels;
    }

    // Count and report stats
    const newStats: Record<string, number> = {};
    const finalObjects: PlacedObject[] = [];
    for (const level of levels) {
      const rawGrid = rawGridLevels[level];
      if (!rawGrid) continue;
      for (let y = 0; y < parameters.canvasHeight; y++) {
        for (let x = 0; x < parameters.canvasWidth; x++) {
          for (const obj of rawGrid[y][x].objects) {
            newStats[obj.id] = (newStats[obj.id] || 0) + 1;
            finalObjects.push(obj);
          }
        }
      }
    }

    if (mapDataRef) {
      mapDataRef.current.objectInstances = finalObjects;
    }
    if (onStatsChange) {
      const statsJson = JSON.stringify(newStats);
      if (lastStatsRef.current !== statsJson) {
        lastStatsRef.current = statsJson;
        onStatsChange(newStats);
      }
    }
  }, [parameters, objectAssets, instanceOverrides, groundOverrides, draggedInstance, dragSlot, levels, oceanOverrides, onStatsChange]);

  // Load images when ground asset changes
  useEffect(() => {
    if (!groundAsset || !groundAsset.slices) {
      setImages({});
      return;
    }

    setIsRendering(true);
    const loadedImages: Record<string, HTMLImageElement> = {};

    // ============================================================================
    // ⚠️ DO NOT MODIFY - PROTECTED OCEAN TILING CODE
    // The tile arrays below are exactly synced to the output strings of the Unity
    // Isometric Tilemap logic inside TerrainGenerator.ts. DO NOT change these names
    // or attempt to decouple them. The physical PNG assets must match this standard.
    // ============================================================================
    const oceanTileNames = [
      'Tile_Center',
      'Tile_Edge_NorthEast', 'Tile_Edge_NorthWest', 'Tile_Edge_SouthEast', 'Tile_Edge_SouthWest',
      'Tile_InnerCorner_East', 'Tile_InnerCorner_North', 'Tile_InnerCorner_South', 'Tile_InnerCorner_West',
      'Tile_OutterCorner_East', 'Tile_OutterCorner_North', 'Tile_OutterCorner_South', 'Tile_OutterCorner_West'
    ];
    const foamTileNames = [
      'Tile_Center',
      'Tile_Edge_NorthEast', 'Tile_Edge_NorthWest', 'Tile_Edge_SouthEast', 'Tile_Edge_SouthWest',
      'Tile_InnerCorner_East', 'Tile_InnerCorner_North', 'Tile_InnerCorner_South', 'Tile_InnerCorner_West',
      'Tile_OutterCorner_East', 'Tile_OutterCorner_North', 'Tile_OutterCorner_South', 'Tile_OutterCorner_West'
    ];

    const slicesCount = groundAsset.slices.length;
    let variationsCount = 0;
    groundAsset.slices.forEach(s => { variationsCount += (s.variations ? s.variations.length : 0); });

    let objectsCount = objectAssets ? objectAssets.length : 0;
    if (objectAssets) {
      objectAssets.forEach(asset => {
        if (asset.shadowEnabled && asset.shadowImageUrl) objectsCount++;
      });
    }

    const maskCount = (parameters.oceanTaperLevels > 0) ? oceanTileNames.length : 0;
    const foamCount = parameters.oceanAddFoam ? foamTileNames.length : 0;
    const oceanSlicesCount = oceanAsset?.slices ? oceanAsset.slices.length : 0;
    const decalCount = decalAssets ? decalAssets.length : 0;
    const totalCount = slicesCount + variationsCount + objectsCount + maskCount + foamCount + oceanSlicesCount + decalCount;
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

    if (decalAssets) {
      decalAssets.forEach(decal => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          loadedImages[`decal_${decal.id}`] = img;
          checkLoaded();
        };
        img.src = decal.imageUrl;
      });
    }

    groundAsset.slices.forEach(slice => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadedImages[slice.name] = img;
        checkLoaded();

        if (slice.variations) {
          slice.variations.forEach((v, vIdx) => {
            const varImg = new Image();
            varImg.crossOrigin = 'anonymous';
            varImg.onload = () => {
              if (slice.name === 'Ground_CenterFill') {
                const origImg = loadedImages[slice.name];
                const canvas = document.createElement('canvas');
                canvas.width = origImg.width;
                canvas.height = origImg.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Create mask canvas
                  const maskCanvas = document.createElement('canvas');
                  maskCanvas.width = origImg.width;
                  maskCanvas.height = origImg.height;
                  const maskCtx = maskCanvas.getContext('2d');

                  if (maskCtx) {
                    const smoothing = v.seamSmoothing ?? 0;
                    if (smoothing > 0) maskCtx.filter = `blur(${smoothing / 10}px)`;

                    const scale = Math.max(0.1, 1 - (smoothing / 1000));
                    const anchorX = origImg.width / 2;
                    const anchorY = origImg.height / 4;

                    maskCtx.translate(anchorX, anchorY);
                    maskCtx.scale(scale, scale);

                    // Draw diamond mask
                    maskCtx.beginPath();
                    maskCtx.moveTo(0, -origImg.height / 4);
                    maskCtx.lineTo(origImg.width / 2, 0);
                    maskCtx.lineTo(0, origImg.height / 4);
                    maskCtx.lineTo(-origImg.width / 2, 0);
                    maskCtx.closePath();
                    maskCtx.fillStyle = 'black';
                    maskCtx.fill();

                    // Reset transform & filter, source-in the variation image
                    maskCtx.setTransform(1, 0, 0, 1, 0, 0);
                    maskCtx.filter = 'none';
                    maskCtx.globalCompositeOperation = 'source-in';
                    maskCtx.drawImage(varImg, 0, 0);

                    // Draw original image, then masked variation over it
                    ctx.drawImage(origImg, 0, 0);
                    ctx.globalAlpha = v.opacity ?? 1;
                    ctx.drawImage(maskCanvas, 0, 0);
                  }

                  const compImg = new Image();
                  compImg.onload = () => {
                    loadedImages[`${slice.name}_var_${vIdx}`] = compImg;
                    checkLoaded();
                  };
                  compImg.src = canvas.toDataURL('image/png');
                  return;
                }
              }
              loadedImages[`${slice.name}_var_${vIdx}`] = varImg;
              checkLoaded();
            };
            varImg.onerror = () => {
              console.error("Failed to load slice variation image:", slice.name, vIdx);
              checkLoaded();
            }
            varImg.src = v.url;
          });
        }
      };
      img.onerror = () => {
        console.error("Failed to load slice image:", slice.name);
        checkLoaded();
        if (slice.variations) {
          slice.variations.forEach(() => checkLoaded());
        }
      }
      img.src = slice.url;
    });

    if (oceanAsset && oceanAsset.slices) {
      oceanAsset.slices.forEach(slice => {
        const img = new Image();
        img.onload = () => {
          loadedImages[`ocean_${slice.name}`] = img;
          checkLoaded();
        };
        img.onerror = () => {
          console.error("Failed to load ocean slice image:", slice.name);
          checkLoaded();
        }
        img.src = slice.url;
      });
    }

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

    if (maskCount > 0) {
      for (const tileName of oceanTileNames) {
        const img = new Image();
        img.src = `/assets/OceanTaper_v2/Ocean_${tileName}.png`;
        img.onload = () => {
          loadedImages[`mask_Tile_${tileName.replace('Tile_', '')}`] = img as any;
          checkLoaded();
        };
        img.onerror = () => checkLoaded();
      }
    }

    if (foamCount > 0) {
      for (const tileName of foamTileNames) {
        const img = new Image();
        img.src = `/assets/OceanTaper_v2/Foamtiles/Foam_${tileName}.png`;
        img.onload = () => {
          const foamCanvas = document.createElement('canvas');
          foamCanvas.width = img.width; foamCanvas.height = img.height;
          const foamCtx = foamCanvas.getContext('2d')!;
          foamCtx.drawImage(img, 0, 0);
          foamCtx.globalCompositeOperation = 'source-in';
          foamCtx.fillStyle = `hsl(${parameters.oceanFoamColor?.h || 63}, ${parameters.oceanFoamColor?.s || 70}%, ${parameters.oceanFoamColor?.l || 90}%)`;
          foamCtx.fillRect(0, 0, img.width, img.height);
          loadedImages[`foam_Tile_${tileName.replace('Tile_', '')}`] = foamCanvas as any;
          checkLoaded();
        };
        img.onerror = () => checkLoaded();
      }
    }
  }, [groundAsset, objectAssets, oceanAsset, parameters, decalAssets]);

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
        const isoY = -(col + row) * tileHalfHeight;
        if (isoX < minX) minX = isoX;
        if (isoX > maxX) maxX = isoX;
        if (isoY < minY) minY = isoY;
        if (isoY > maxY) maxY = isoY;
      }
    }

    const finalScale = camera.scale;
    const offsetX = camera.x;
    const offsetY = camera.y;

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

    const sortedLevels = [0, ...levels].sort((a, b) => a - b);
    for (const level of sortedLevels) {
      const gridLvl = gridLevels[level];
      if (!gridLvl) continue;

      const yOffset = 0; // Removed elevation offset

      for (let row = 0; row < gridLvl.length; row++) {
        for (let col = 0; col < gridLvl[row].length; col++) {
          if ((gridLvl[row][col].isLand || level === 0) && gridLvl[row][col].tileId) {
            const isoX = (col - row) * tileHalfWidth;
            const isoY = -(col + row) * tileHalfHeight - yOffset;

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

            // ⚠️ DO NOT MODIFY - PROTECTED ISOMETRIC TILING LOGIC
            // The depth calculation ensures perfect back-to-front rendering (Painter's Algorithm).
            // Layer serves as primary sort. -(row + col) serves as secondary spatial sort,
            // mapping perfectly to top-to-bottom screen rendering (matching Unity's Transparency Sort Axis).
            cellsToRender.push({
              ...gridLvl[row][col],
              col, row,
              isoX,
              isoY,
              depth: (level * 1000) - (row + col),
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
      let img = null;
      if (cell.layer === 0) {
        img = (oceanAsset?.slices[0] ? images[`ocean_${oceanAsset.slices[0].name}`] : null) || images['ocean'] || (groundAsset?.slices[0] ? images[groundAsset.slices[0].name] : null);
      } else {
        const slice = groundAsset?.slices?.find(s => s.name === ('Ground_' + cell.tileId));
        if (slice && slice.variations && slice.variations.length > 0) {
          const seed = cell.col * 12.9898 + cell.row * 78.233 + (cell.layer || 0) * 13.1313;
          const rand = Math.abs(Math.sin(seed) * 43758.5453);

          let totalFactor = 1;
          slice.variations.forEach(v => { totalFactor += v.factor; });

          if (totalFactor <= 0) {
            img = images['Ground_' + cell.tileId!];
          } else {
            let choiceValue = (rand - Math.floor(rand)) * totalFactor;
            let currentSum = 1;
            if (choiceValue < currentSum) {
              img = images['Ground_' + cell.tileId!];
            } else {
              let chosenVar = 0;
              for (let i = 0; i < slice.variations.length; i++) {
                currentSum += slice.variations[i].factor;
                if (choiceValue < currentSum) {
                  chosenVar = i;
                  break;
                }
              }
              img = images[`Ground_${cell.tileId!}_var_${chosenVar}`] || images['Ground_' + cell.tileId!];
            }
          }
        } else {
          img = images['Ground_' + cell.tileId!];
        }
      }

      const floorDrawW = tileHalfWidth * 2 + 1;
      const floorDrawH = tileHalfHeight * 2 + 1;

      if (img) {
        if (cell.layer === 0) {
          ctx.drawImage(img, cell.isoX - tileHalfWidth, cell.isoY - tileHalfHeight + (tileHalfHeight * 2), floorDrawW, floorDrawH);
        } else {
          const scale = floorDrawW / img.width;
          ctx.drawImage(img, cell.isoX - tileHalfWidth, cell.isoY - tileHalfHeight, floorDrawW, img.height * scale);
        }
      } else if (cell.layer === 0) {
        ctx.save();
        ctx.translate(cell.isoX, cell.isoY + (tileHalfHeight * 2));
        ctx.beginPath();
        ctx.moveTo(0, -tileHalfHeight);
        ctx.lineTo(tileHalfWidth, 0);
        ctx.lineTo(0, tileHalfHeight);
        ctx.lineTo(-tileHalfWidth, 0);
        ctx.closePath();
        ctx.fillStyle = '#1E3A8A';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();
        ctx.restore();
      }

      // Draw Ocean Taper Masks dynamically
      if (cell.layer === 0 && parameters.oceanTaperLevels > 0) {
        const maxLvl = parameters.oceanTaperLevels;
        for (let lvl = 1; lvl <= maxLvl + 1; lvl++) {
          if ((cell.distance || 0) >= lvl) {
            let maskToDraw: string | null = null;
            let isUniformDarken = false;

            if ((cell.distance || 0) > lvl) {
              isUniformDarken = true;
            } else if (lvl > maxLvl) {
              maskToDraw = 'Tile_Center';
            } else {
              const isCurrent = (d: number | undefined) => (d !== undefined && d <= lvl) ? 1 : 0;
              const getDist = (cx: number, cy: number) => {
                if (cx < 0 || cx >= parameters.canvasWidth || cy < 0 || cy >= parameters.canvasHeight) return 999;
                return gridLevels[0]?.[cy]?.[cx]?.distance || 0;
              };

              const nb = getNeighbors(cell.col, cell.row, parameters.canvasWidth, parameters.canvasHeight, getDist, isCurrent, 999);

              if (nb.n === 0 && nb.e === 0 && nb.s === 0 && nb.w === 0) {
                maskToDraw = 'Tile_Center';
              } else if (nb.n === 1 && nb.e === 1 && nb.s === 1 && nb.w === 1) {
                const tileIdResult = TerrainGenerator.getTileId(nb.n, nb.e, nb.s, nb.w, nb.ne, nb.se, nb.sw, nb.nw);
                // ⚠️ DO NOT MODIFY - PROTECTED OCEAN TILING CODE
                if (tileIdResult) maskToDraw = `Tile_${formatTerrainTileId(tileIdResult)}`;
              } else {
                const tileIdResult = TerrainGenerator.getTileId(nb.n, nb.e, nb.s, nb.w, 1, 1, 1, 1);
                // ⚠️ DO NOT MODIFY - PROTECTED OCEAN TILING CODE
                if (tileIdResult) maskToDraw = `Tile_${formatTerrainTileId(tileIdResult)}`;
              }
            }

            if (isUniformDarken) {
              ctx.save();
              ctx.fillStyle = `rgba(0,0,0,${parameters.oceanDimAmount / parameters.oceanTaperLevels})`;
              ctx.translate(cell.isoX, cell.isoY + (tileHalfHeight * 2));
              ctx.beginPath();
              ctx.moveTo(0, -tileHalfHeight);
              ctx.lineTo(tileHalfWidth, 0);
              ctx.lineTo(0, tileHalfHeight);
              ctx.lineTo(-tileHalfWidth, 0);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            } else if (maskToDraw) {
              if (parameters.oceanTaperLevels > 0) {
                const maskImg = images[`mask_${maskToDraw}`];
                if (maskImg) {
                  ctx.save();
                  ctx.globalCompositeOperation = 'multiply';
                  ctx.globalAlpha = parameters.oceanDimAmount / parameters.oceanTaperLevels;
                  ctx.drawImage(maskImg, cell.isoX - tileHalfWidth, cell.isoY - tileHalfHeight + (tileHalfHeight * 2), floorDrawW, floorDrawH);
                  ctx.restore();
                }
              }
            }
          }
        }
      }

      // [FOAM LAYER 1: OUTER COASTLINE]
      if (cell.layer === 0 && parameters.oceanAddFoam && (cell as any).rawDistance === 1) {
        let foamMaskToDraw: string | null = null;
        const getRawDist = (cx: number, cy: number) => {
          if (cx < 0 || cx >= parameters.canvasWidth || cy < 0 || cy >= parameters.canvasHeight) return 2;
          return (gridLevels[0]?.[cy]?.[cx] as any)?.rawDistance || 0;
        };

        const isCurrent = (d: number | undefined) => (d !== undefined && d <= 1) ? 1 : 0;
        const nb = getNeighbors(cell.col, cell.row, parameters.canvasWidth, parameters.canvasHeight, getRawDist, isCurrent, (cell as any).rawDistance || 0);
        foamMaskToDraw = getFoamMaskToDraw(nb);

        if (foamMaskToDraw && foamMaskToDraw !== 'Tile_Center') {
          const foamImg = images[`foam_${foamMaskToDraw}`];
          if (foamImg) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(foamImg, cell.isoX - tileHalfWidth, cell.isoY - tileHalfHeight + (tileHalfHeight * 2), floorDrawW, floorDrawH);
            ctx.restore();
          }
        }
      }

      // [FOAM LAYER 2: INNER GAP FILLER]
      if (cell.layer === 0 && parameters.oceanAddFoam && cell.distance === 0) {
        const foamImg = images['foam_Tile_Center'];
        if (foamImg) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(foamImg, cell.isoX - tileHalfWidth, cell.isoY - tileHalfHeight + (tileHalfHeight * 2), floorDrawW, floorDrawH);
          ctx.restore();
        }
      }

      if (gridSettings.show && cell.isTopFace) {
        ctx.save();

        const c = Math.round((gridSettings.brightness / 100) * 255);
        const gridColor = `rgba(${c}, ${c}, ${c}, ${gridSettings.opacity / 100})`;
        const fillAlpha = (gridSettings.opacity / 100) * 0.8;

        for (let lx = -1; lx <= 1; lx++) {
          for (let ly = -1; ly <= 1; ly++) {
            if (!checkSubCellBuildable(cell.col, cell.row, cell.layer || 1, lx, ly)) continue;

            const gx = cell.col * 3 + lx + 1;
            const gy = cell.row * 3 + ly + 1;
            const key = `${gx},${gy}`;

            const occupants = occupancyRef.current?.get(key);
            if (occupants && occupants.length > 0) {
              const isSelected = activeSelection?.type === 'object' && activeSelection.instanceId && occupants.includes(activeSelection.instanceId);
              ctx.fillStyle = isSelected ? `rgba(34, 197, 94, ${fillAlpha})` : `rgba(239, 68, 68, ${fillAlpha})`;

              const slotIsoX = cell.isoX + (lx - ly) * (140 / 3);
              const slotIsoY = cell.isoY - (lx + ly) * (70 / 3);

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

        for (let lx = -1; lx <= 1; lx++) {
          for (let ly = -1; ly <= 1; ly++) {
            const isBuildable = checkSubCellBuildable(cell.col, cell.row, cell.layer || 1, lx, ly);
            if (!gridSettings.showOnlyBuildable && !isBuildable) continue;
            const slotIsoX = cell.isoX + (lx - ly) * (140 / 3);
            const slotIsoY = cell.isoY - (lx + ly) * (70 / 3);

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

      if (cell.objects && cell.objects.length > 0) {
        for (const obj of cell.objects) {
          const objImg = images[obj.id];
          const assetInfo = objectAssets?.find(a => a.id === obj.id);

          if (objImg && assetInfo) {
            const slotIsoX = cell.isoX + (obj.lx - obj.ly) * (140 / 3);
            const slotIsoY = cell.isoY - (obj.lx + obj.ly) * (70 / 3);

            const scale = assetInfo.scale || 1.0;

            // Calculate base ground scale to match Unity's relative PPU
            let groundImgWidth = 256; // Standard fallback
            if (groundAsset?.slices?.[0]) {
              const groundImgRef = images[groundAsset.slices[0].name];
              if (groundImgRef && groundImgRef.width > 0) {
                groundImgWidth = groundImgRef.width;
              }
            }

            const floorDrawW = 140 * 2 + 1; // 281
            const groundScale = floorDrawW / groundImgWidth;

            const objW = objImg.width * groundScale * scale;
            const objH = objImg.height * groundScale * scale;

            const gridOffsetX = assetInfo.gridOffset?.x || 0;
            const gridOffsetY = assetInfo.gridOffset?.y || 0;
            const imgCenterX = slotIsoX - gridOffsetX * scale;
            const imgBottomY = slotIsoY - gridOffsetY * scale;

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

    // PASS 1.5: Draw Decals
    if (decalOverrides && decalAssets) {
      Object.values(decalOverrides).forEach((decalInstance: any) => {
        if (decalInstance.deleted) return;
        const decalAsset = decalAssets.find(d => d.id === decalInstance.assetId);
        if (!decalAsset) return;

        const decalImg = images[`decal_${decalAsset.id}`];
        if (!decalImg) return;

        let slotIsoX = 0;
        let slotIsoY = 0;

        if (decalInstance.isDynamic) {
          slotIsoX = decalInstance.worldX;
          slotIsoY = decalInstance.worldY;
        } else {
          const cellX = decalInstance.cellX;
          const cellY = decalInstance.cellY;

          const c_isoX = (cellX - cellY) * tileHalfWidth;
          const c_isoY = -(cellX + cellY) * tileHalfHeight;

          slotIsoX = c_isoX + (decalInstance.lx - decalInstance.ly) * (140 / 3);
          slotIsoY = c_isoY - (decalInstance.lx + decalInstance.ly) * (70 / 3);
        }

        ctx.save();
        ctx.globalAlpha = decalAsset.opacity || 1;
        if (decalAsset.smoothing > 0) {
          ctx.filter = `blur(${decalAsset.smoothing}px)`;
        }

        const scale = decalAsset.size || 1;
        const w = decalImg.width * scale;
        const h = decalImg.height * scale;

        ctx.drawImage(decalImg, slotIsoX - w / 2, slotIsoY - h / 2, w, h);
        ctx.restore();
      });
    }

    // PASS 2: Draw Objects sorted by exact depth
    objectsToRender.sort((a, b) => b.exactDepth - a.exactDepth);

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
        objW: obj.objW,
        objH: obj.objH
      });
    }

    // Brush Preview
    if (activeTool === 'paint' && brushPos && (activeSelection?.type === 'object' || activeSelection?.type === 'ground' || activeSelection?.type === 'ocean' || activeSelection?.type === 'ground_variation' || activeSelection?.type === 'dynamic_decal')) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      const tintColor = brushPos.isValid ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';

      const dx = 140 / 3;
      const dy = 70 / 3;

      const brushYOffset = 0; // Removed elevation offset

      if (activeSelection?.type === 'ground' || activeSelection?.type === 'ocean') {
        // Draw 2x2 ground highlight
        ctx.fillStyle = tintColor;
        const cellX = Math.floor((brushPos.gx + 1) / 3);
        const cellY = Math.floor((brushPos.gy + 1) / 3);

        for (let py = 0; py < 2; py++) {
          for (let px = 0; px < 2; px++) {
            const cx = cellX + px;
            const cy = cellY + py;
            const tileIsoX = (cx - cy) * 140;
            const tileIsoY = -(cx + cy) * 70 - brushYOffset;

            for (let lx = -1; lx <= 1; lx++) {
              for (let ly = -1; ly <= 1; ly++) {
                const slotIsoX = tileIsoX + (lx - ly) * (140 / 3);
                const slotIsoY = tileIsoY - (lx + ly) * (70 / 3);

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
      } else if (activeSelection?.type === 'object' || activeSelection?.type === 'ground_variation' || activeSelection?.type === 'dynamic_decal') {
        const id = activeSelection.id || '';
        const assetInfo = activeSelection.type === 'object'
          ? objectAssets?.find(a => a.id === id)
          : decalAssets?.find(a => a.id === id);

        if (assetInfo) {
          const img = images[activeSelection.type === 'object' ? id : `decal_${id}`];
          if (img) {
            const scale = (activeSelection.type === 'object' ? (assetInfo.scale || 1) : (assetInfo.size || 1));
            const isDynamic = activeSelection.type === 'dynamic_decal';
            const slotIsoX = isDynamic && brushPos.isoX !== undefined ? brushPos.isoX : (brushPos.gx - brushPos.gy) * dx;
            const slotIsoY = isDynamic && brushPos.isoY !== undefined ? brushPos.isoY : -(brushPos.gx + brushPos.gy - 2) * dy - brushYOffset;

            ctx.fillStyle = tintColor;
            ctx.beginPath();
            ctx.arc(slotIsoX, slotIsoY, 20 * scale, 0, Math.PI * 2);
            ctx.fill();

            if (activeSelection.type === 'object') {
              let groundImgWidth = 256;
              if (groundAsset?.slices?.[0]) {
                const groundImgRef = images[groundAsset.slices[0].name];
                if (groundImgRef && groundImgRef.width > 0) groundImgWidth = groundImgRef.width;
              }
              const groundScale = (140 * 2 + 1) / groundImgWidth;

              const w = img.width * groundScale * scale;
              const h = img.height * groundScale * scale;
              const gridOffsetX = assetInfo.gridOffset?.x || 0;
              const gridOffsetY = assetInfo.gridOffset?.y || 0;
              const imgCenterX = slotIsoX - gridOffsetX * scale;
              const imgBottomY = slotIsoY - gridOffsetY * scale;

              ctx.drawImage(img, imgCenterX - w / 2, imgBottomY - h, w, h);
            } else {
              const w = img.width * scale;
              const h = img.height * scale;
              ctx.drawImage(img, slotIsoX - w / 2, slotIsoY - h / 2, w, h);
            }
          }
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [gridLevels, levels, images, camera, draggedInstance, gridSettings, activeSelection, activeTool, brushPos]);

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

    let picked = null;

    for (let i = renderedObjectsRef.current.length - 1; i >= 0; i--) {
      const o = renderedObjectsRef.current[i];
      const halfW = o.objW / 2;
      const halfH = o.objH / 2;

      if (isoX >= o.isoX - halfW && isoX <= o.isoX + halfW &&
        isoY >= o.isoY - halfH && isoY <= o.isoY + halfH) {
        picked = o;
        break; // Pick the top-most visible object
      }
    }

    if (picked) {
      if (activeTool === 'select') {
        setDraggedInstance(picked.instanceId);
        setDragSlot(null);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (setActiveSelection) setActiveSelection({ type: 'object', id: picked.id, instanceId: picked.instanceId });
      } else if (activeTool === 'erase' && activeSelection?.type === 'object' && activeSelection.id === picked.id) {
        // Erase object
        startTransition(() => {
          setInstanceOverrides(prev => ({
            ...prev,
            [picked.instanceId]: {
              ...(prev[picked.instanceId] || { cellX: 0, cellY: 0, lx: 0, ly: 0 }),
              deleted: true
            }
          }));
        });
      }
    }

    if (activeTool === 'paint' || activeTool === 'erase') {
      setIsPainting(true);
      paintStrokesRef.current = {};
      e.currentTarget.setPointerCapture(e.pointerId);

      const dxGrid = 140 / 3;
      const dyGrid = 70 / 3;
      const gx = Math.round((isoX / dxGrid - isoY / dyGrid) / 2);
      const gy = Math.round(-(isoX / dxGrid + isoY / dyGrid) / 2);

      applyPaintErase(gx, gy, activeTool, isoX, isoY);
    }
  };

  const applyPaintErase = (gx: number, gy: number, tool: 'paint' | 'erase', isoX?: number, isoY?: number) => {
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
          startTransition(() => {
            setGroundOverrides(prev => ({ ...prev, ...newStrokes }));
          });
        }
      } else if (activeSelection?.type === 'ocean') {
        const cellX = Math.floor((gx + 1) / 3);
        const cellY = Math.floor((gy + 1) / 3);
        let hasChanges = false;
        const newStrokes: Record<string, number> = {};
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const key = `${cellX + dx},${cellY + dy}`;
            if (oceanOverrides && oceanOverrides[key] !== activeLevel && paintStrokesRef.current[key] !== activeLevel) {
              paintStrokesRef.current[key] = activeLevel;
              newStrokes[key] = activeLevel;
              hasChanges = true;
            }
          }
        }
        if (hasChanges && setOceanOverrides) {
          startTransition(() => {
            setOceanOverrides(prev => ({ ...prev, ...newStrokes }));
          });
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
          startTransition(() => {
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
          });
        }
      } else if (activeSelection?.type === 'ground_variation' && activeSelection.id) {
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

        const strokeKey = `decal_${gx}_${gy}`;

        if (!paintStrokesRef.current[strokeKey]) {
          paintStrokesRef.current[strokeKey] = activeLevel;
          const newInstanceId = `decal_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          if (setDecalOverrides) {
            startTransition(() => {
              setDecalOverrides(prev => ({
                ...prev,
                [newInstanceId]: {
                  cellX,
                  cellY,
                  lx,
                  ly,
                  layer: maxLevel === 0 ? 1 : maxLevel,
                  assetId: activeSelection.id
                } as any
              }));
            });
          }
        }
      } else if (activeSelection?.type === 'dynamic_decal' && activeSelection.id && isoX !== undefined && isoY !== undefined) {
        const strokeKey = `dyn_decal_${Math.round(isoX / 20)}_${Math.round(isoY / 20)}`;
        if (!paintStrokesRef.current[strokeKey]) {
          paintStrokesRef.current[strokeKey] = 1;
          const newInstanceId = `dyn_decal_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          if (setDecalOverrides) {
            startTransition(() => {
              setDecalOverrides(prev => ({
                ...prev,
                [newInstanceId]: {
                  isDynamic: true,
                  worldX: isoX,
                  worldY: isoY,
                  layer: 1,
                  assetId: activeSelection.id
                } as any
              }));
            });
          }
        }
      }
    } else if (tool === 'erase') {
      if (activeSelection?.type === 'ground') {
        const cellX = Math.floor((gx + 1) / 3);
        const cellY = Math.floor((gy + 1) / 3);
        const key = `${activeLevel},${cellX},${cellY}`;
        if (groundOverrides[key] !== 0 && paintStrokesRef.current[key] !== 0) {
          paintStrokesRef.current[key] = 0;
          startTransition(() => {
            setGroundOverrides(prev => ({ ...prev, [key]: 0 }));
          });
        }
      } else if (activeSelection?.type === 'ocean') {
        const cellX = Math.floor((gx + 1) / 3);
        const cellY = Math.floor((gy + 1) / 3);
        const key = `${cellX},${cellY}`;
        if (oceanOverrides && oceanOverrides[key] !== undefined && paintStrokesRef.current[key] !== -1) {
          paintStrokesRef.current[key] = -1;
          if (setOceanOverrides) {
            startTransition(() => {
              setOceanOverrides(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            });
          }
        }
      } else if (activeSelection?.type === 'ground_variation' && activeSelection.id) {
        if (setDecalOverrides && decalOverrides) {
          const cellX = Math.floor(gx / 3);
          const cellY = Math.floor(gy / 3);
          const lx = gx - cellX * 3 - 1;
          const ly = gy - cellY * 3 - 1;

          const newOverrides = { ...decalOverrides };
          let erased = false;
          for (const [id, dec] of Object.entries(newOverrides)) {
            if (dec.cellX === cellX && dec.cellY === cellY && dec.lx === lx && dec.ly === ly && dec.assetId === activeSelection.id && !dec.deleted) {
              newOverrides[id] = { ...dec, deleted: true } as any;
              erased = true;
            }
          }
          if (erased) {
            startTransition(() => {
              setDecalOverrides(newOverrides);
            });
          }
        }
      } else if (activeSelection?.type === 'dynamic_decal' && isoX !== undefined && isoY !== undefined) {
        if (setDecalOverrides && decalOverrides) {
          const newOverrides = { ...decalOverrides };
          let erased = false;
          for (const [id, dec] of Object.entries(newOverrides)) {
            if ((dec as any).isDynamic && !dec.deleted && dec.assetId === activeSelection.id) {
              const dx = (dec as any).worldX - isoX;
              const dy = (dec as any).worldY - isoY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 30) {
                newOverrides[id] = { ...dec, deleted: true } as any;
                erased = true;
              }
            }
          }
          if (erased) {
            startTransition(() => {
              setDecalOverrides(newOverrides);
            });
          }
        }
      }
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isMapPanning) {
      const dx = e.clientX - lastPanPos.x;
      const dy = e.clientY - lastPanPos.y;
      setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
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
    const gx = Math.round((isoX / dx - isoY / dy) / 2);
    const gy = Math.round(-(isoX / dx + isoY / dy) / 2);

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

    setBrushPos({ gx, gy, cellX, cellY, isValid, level: maxLevel, isoX, isoY });

    if (draggedInstance) {
      setDragSlot({ cellX, cellY, lx, ly, layer: maxLevel === 0 ? 1 : maxLevel });
    } else if (isPainting && activeTool === 'erase') {
      applyPaintErase(gx, gy, activeTool, isoX, isoY);

      // Hit test for rapid object erasing
      let picked = null;
      for (let i = renderedObjectsRef.current.length - 1; i >= 0; i--) {
        const o = renderedObjectsRef.current[i];
        const halfW = o.objW / 2;
        const halfH = o.objH / 2;

        if (isoX >= o.isoX - halfW && isoX <= o.isoX + halfW &&
          isoY >= o.isoY - halfH && isoY <= o.isoY + halfH) {
          picked = o;
          break;
        }
      }
      if (picked && activeSelection?.type === 'object' && activeSelection.id === picked.id) {
        startTransition(() => {
          setInstanceOverrides(prev => ({
            ...prev,
            [picked.instanceId]: {
              ...(prev[picked.instanceId] || { cellX: 0, cellY: 0, lx: 0, ly: 0 }),
              deleted: true
            } as any
          }));
        });
      }
    } else if (isPainting && activeTool !== 'select') {
      applyPaintErase(gx, gy, activeTool as 'paint' | 'erase', isoX, isoY);
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
        if (dragSlot.cellX < 0 || dragSlot.cellX >= parameters.canvasWidth || dragSlot.cellY < 0 || dragSlot.cellY >= parameters.canvasHeight) {
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
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              const deltaY = e.deltaY;

              setCamera(prev => {
                const minZoom = 0.1; 
                const maxZoom = 5.0; 
                
                // Exponential zoom for smoother zooming at extremes
                const zoomSpeed = prev.scale * 0.15;
                const delta = deltaY < 0 ? zoomSpeed : -zoomSpeed;
                const newScale = Math.max(minZoom, Math.min(prev.scale + delta, maxZoom));
                
                if (newScale === prev.scale) return prev;
                
                // Focal point zoom
                const scaleFactor = newScale / prev.scale;
                const newX = mouseX - (mouseX - prev.x) * scaleFactor;
                const newY = mouseY - (mouseY - prev.y) * scaleFactor;
                
                return { x: newX, y: newY, scale: newScale };
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
      {(activeSelection?.type === 'ground' || activeSelection?.type === 'ocean') && (
        <div className="absolute bottom-4 left-4 flex flex-col items-start z-10">
          {layersExpanded && (
            <div className="mb-2 w-48 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-lg shadow-2xl overflow-hidden flex flex-col-reverse animate-in slide-in-from-bottom-2">
              {activeSelection?.type === 'ground' ? (
                <>
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
                </>
              ) : (
                <>
                  {Array.from({ length: parameters.oceanTaperLevels }).reverse().map((_, i) => {
                    const levelId = parameters.oceanTaperLevels - i;
                    return (
                      <div
                        key={levelId}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-b border-[var(--color-blender-border)] last:border-b-0 ${activeLevel === levelId ? 'bg-indigo-600/20 shadow-[inset_0_0_12px_rgba(79,70,229,0.3)]' : 'hover:bg-white/5'
                          }`}
                        onClick={() => setActiveLevel(levelId)}
                      >
                        <span className={`text-xs font-bold tracking-wide ${activeLevel === levelId ? 'text-indigo-300' : 'text-gray-300'}`}>
                          Depth Layer {levelId}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setLayersExpanded(!layersExpanded)}
            className="flex items-center gap-2 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-full px-4 py-2 shadow-lg hover:bg-white/5 transition-colors"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-200">{activeSelection?.type === 'ocean' ? 'Depths' : 'Levels'}</span>
          </button>
        </div>
      )}
    </div>
  );
}


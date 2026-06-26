import { useState, useEffect, useCallback, useRef } from "react";
import AssetManager from "./AssetManager";
import MapPreview from "./MapPreview";
import ParameterUI from "./ParameterUI";
import { getTask, saveMapData } from "@/lib/store";
import { useHistory } from "@/lib/useHistory";
import { TerrainGenerator } from "@/lib/map-engine/TerrainGenerator";

export interface MapAsset {
  taskId: string;
  taskName: string;
  type: 'ground' | 'ocean';
  nodeId?: string;
  slices: { name: string, url: string, variations?: { url: string, factor: number, taskId?: string, nodeId?: string, opacity?: number, seamSmoothing?: number }[] }[];
}

export interface ObjectAsset {
  id: string;
  taskId: string;
  taskName: string;
  nodeId: string;
  nodePrompt: string;
  name?: string;
  imageUrl: string;
  unityType?: 'mineral' | 'building';
  amount: number;
  allowOnEdge: boolean;
  scale: number;
  seedOffset?: number;
  baseTiles?: { lx: number, ly: number }[];
  gridOffset?: { x: number, y: number };
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  shadowEnabled?: boolean;
  shadowMethod?: string;
  shadowBlur?: number;
  shadowFade?: number;
  shadowSkew?: number;
  shadowOpacity?: number;
  shadowScaleX?: number; // legacy
  shadowScaleY?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowImageUrl?: string;
  shadowAnchorX?: number;
  shadowAnchorY?: number;
  shadowWidth?: number;
  shadowHeight?: number;
}

export interface MapParameters {
  canvasWidth: number;
  canvasHeight: number;
  islandWidth: number;
  islandHeight: number;
  seed: number;
  noiseScale: number;
  oceanTaperLevels: number;
  oceanDimAmount: number;
  oceanAddFoam?: boolean;
  oceanFoamColor?: { h: number, s: number, l: number };
  oceanTaperWidths?: Record<number, number>;
  islandName?: string;
}

export interface DecalAsset {
  id: string;
  name?: string;
  imageUrl: string;
  size: number;
  opacity: number;
  smoothing: number;
  baseTiles: { lx: number, ly: number }[];
  width?: number;
  height?: number;
  fileSizeBytes?: number;
}

export type SelectionState = { type: 'map' } | { type: 'ground' } | { type: 'ocean' } | { type: 'object', id: string, instanceId?: string } | { type: 'ground_variation', id?: string };

export type InstanceOverride = { cellX: number, cellY: number, lx: number, ly: number, deleted?: boolean, layer?: number };

export interface MapState {
  groundAsset: MapAsset | null;
  oceanAsset: MapAsset | null;
  objectAssets: ObjectAsset[];
  decalAssets: DecalAsset[];
  parameters: MapParameters;
  instanceOverrides: Record<string, InstanceOverride>;
  groundOverrides: Record<string, number>;
  oceanOverrides: Record<string, number>;
  decalOverrides: Record<string, InstanceOverride>;
}

export default function MapGeneratorWorkspace({ taskId, isActive = true }: { taskId: string, isActive?: boolean }) {
  const { state: mapState, set: setMapState, undo, redo, clear, canUndo, canRedo } = useHistory<MapState>({
    groundAsset: null,
    oceanAsset: {
      taskId: 'default',
      taskName: 'Default Ocean',
      type: 'ocean',
      nodeId: 'default',
      slices: [{ name: 'Flat_Floor', url: '/assets/OceanTaper_v2/OceanTile.png' }]
    },
    objectAssets: [],
    decalAssets: [],
    parameters: {
      canvasWidth: 20,
      canvasHeight: 20,
      islandWidth: 16,
      islandHeight: 16,
      seed: 12345,
      noiseScale: 0.1,
      oceanTaperLevels: 0,
      oceanDimAmount: 0.5,
      oceanAddFoam: false,
      oceanFoamColor: { h: 63, s: 70, l: 90 }
    },
    instanceOverrides: {},
    groundOverrides: {},
    oceanOverrides: {},
    decalOverrides: {}
  });

  const [activeSelection, setActiveSelection] = useState<SelectionState>({ type: 'map' });
  const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const [activeTool, setActiveTool] = useState<'select' | 'paint' | 'erase'>('select');
  const [activeLevel, setActiveLevel] = useState<number>(1);
  const [levels, setLevels] = useState<number[]>([1]);
  const [objectStats, setObjectStats] = useState<Record<string, number>>({});

  const [panelWidth, setPanelWidth] = useState(320);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);

  const mapDataRef = useRef<{ gridLevels: any, objectInstances: any[] }>({ gridLevels: null, objectInstances: [] });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingPanel) return;
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth >= 320 && newWidth <= 620) {
        setPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsDraggingPanel(false);

    if (isDraggingPanel) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPanel]);

  // Load from store on mount
  useEffect(() => {
    const loadData = async () => {
      const task = await getTask(taskId);
      if (task && task.mapData) {
        let p = task.mapData.parameters || { canvasWidth: 20, canvasHeight: 20, islandWidth: 16, islandHeight: 16, seed: 12345, noiseScale: 0.1, oceanTaperLevels: 0, oceanDimAmount: 0.5, oceanAddFoam: false };
        if (p.width !== undefined) {
          // Migrate old data
          p = {
            canvasWidth: p.width,
            canvasHeight: p.height,
            islandWidth: Math.floor(p.width / 2),
            islandHeight: Math.floor(p.height / 2),
            seed: p.seed,
            noiseScale: p.noiseScale,
            islandName: 'Island_1'
          };
        }
        clear({
          groundAsset: task.mapData.groundAsset || null,
          oceanAsset: task.mapData.oceanAsset || {
            taskId: 'default',
            taskName: 'Default Ocean',
            type: 'ocean',
            nodeId: 'default',
            slices: [{ name: 'Flat_Floor', url: '/assets/OceanTaper_v2/OceanTile.png' }]
          },
          objectAssets: task.mapData.objectAssets || [],
          parameters: p,
          instanceOverrides: task.mapData.instanceOverrides || {},
          groundOverrides: task.mapData.groundOverrides || {},
          oceanOverrides: task.mapData.oceanOverrides || {},
          decalAssets: task.mapData.decalAssets || [],
          decalOverrides: task.mapData.decalOverrides || {}
        });
        if (task.mapData.levels) {
          setLevels(task.mapData.levels);
        }
      }
      setIsLoaded(true);
    };
    loadData();
  }, [taskId, clear]);

  useEffect(() => {
    if (!isLoaded || !taskId) return;
    const saveTimer = setTimeout(() => {
      saveMapData(taskId, { ...mapState, levels });
    }, 500); // Debounce save
    return () => clearTimeout(saveTimer);
  }, [mapState, levels, isLoaded, taskId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isActive === false) return;
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Handle delete selected asset
        if (activeSelection.type === 'object') {
          setMapState(prev => ({
            ...prev,
            instanceOverrides: {
              ...prev.instanceOverrides,
              [activeSelection.instanceId!]: {
                ...(prev.instanceOverrides[activeSelection.instanceId!] || { cellX: 0, cellY: 0, lx: 0, ly: 0 }),
                deleted: true
              }
            }
          }));
          setActiveSelection({ type: 'map' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, activeSelection, setMapState, isActive]);

  const setGroundAsset = useCallback((val: any) => setMapState(p => ({ ...p, groundAsset: typeof val === 'function' ? val(p.groundAsset) : val })), [setMapState]);
  const setOceanAsset = useCallback((val: any) => setMapState(p => ({ ...p, oceanAsset: typeof val === 'function' ? val(p.oceanAsset) : val })), [setMapState]);
  const setObjectAssets = useCallback((assets: ObjectAsset[] | ((prev: ObjectAsset[]) => ObjectAsset[])) => {
    setMapState(prev => ({
      ...prev,
      objectAssets: typeof assets === 'function' ? assets(prev.objectAssets) : assets
    }));
  }, [setMapState]);

  const setDecalAssets = useCallback((assets: DecalAsset[] | ((prev: DecalAsset[]) => DecalAsset[])) => {
    setMapState(prev => ({
      ...prev,
      decalAssets: typeof assets === 'function' ? assets(prev.decalAssets) : assets
    }));
  }, [setMapState]);

  const setParameters = useCallback((params: MapParameters | ((prev: MapParameters) => MapParameters)) => {
    setMapState(p => ({
      ...p,
      parameters: typeof params === 'function' ? params(p.parameters) : params
    }));
  }, [setMapState]);

  const setOceanOverrides = useCallback((overrides: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setMapState(prev => ({
      ...prev,
      oceanOverrides: typeof overrides === 'function' ? overrides(prev.oceanOverrides) : overrides
    }));
  }, [setMapState]);

  const setDecalOverrides = useCallback((overrides: Record<string, InstanceOverride> | ((prev: Record<string, InstanceOverride>) => Record<string, InstanceOverride>)) => {
    setMapState(prev => ({
      ...prev,
      decalOverrides: typeof overrides === 'function' ? overrides(prev.decalOverrides) : overrides
    }));
  }, [setMapState]);
  const setInstanceOverrides = useCallback((val: any) => setMapState(p => ({ ...p, instanceOverrides: typeof val === 'function' ? val(p.instanceOverrides) : val })), [setMapState]);
  const setGroundOverrides = useCallback((val: any) => setMapState(p => ({ ...p, groundOverrides: typeof val === 'function' ? val(p.groundOverrides) : val })), [setMapState]);

  const handleSpawnObjects = useCallback((assetId: string, amount: number) => {
    if (!amount || amount <= 0) return;
    const asset = mapState.objectAssets.find(a => a.id === assetId);
    if (!asset) return;

    const rawGridLevels = TerrainGenerator.generate(
      mapState.parameters.canvasWidth,
      mapState.parameters.canvasHeight,
      mapState.parameters.islandWidth,
      mapState.parameters.islandHeight,
      mapState.parameters.seed,
      mapState.parameters.noiseScale,
      [], // no procedural objects
      mapState.groundOverrides,
      levels
    );

    const occupancy = new Set<string>();
    Object.values(mapState.instanceOverrides).forEach((override: any) => {
      if (!override.deleted) {
        const oAsset = mapState.objectAssets.find(a => a.id === override.assetId);
        const tiles = oAsset?.baseTiles || [{ lx: 0, ly: 0 }];
        tiles.forEach(t => {
          occupancy.add(`${override.cellX * 3 + override.lx + t.lx + 1},${override.cellY * 3 + override.ly + t.ly + 1}`);
        });
      }
    });

    const isSlotValid = (gx: number, gy: number) => {
      const cx = Math.floor(gx / 3);
      const cy = Math.floor(gy / 3);
      if (cy < 0 || cy >= mapState.parameters.canvasHeight || cx < 0 || cx >= mapState.parameters.canvasWidth) return false;

      let topLevel = 1;
      for (const lvl of levels) {
        if (rawGridLevels[lvl]?.[cy]?.[cx]?.isLand) topLevel = lvl;
      }

      const cell = rawGridLevels[topLevel]?.[cy]?.[cx];
      if (!cell || !cell.isLand) return false;
      return !occupancy.has(`${gx},${gy}`);
    };

    const rawBaseTiles = asset.baseTiles && asset.baseTiles.length > 0 ? asset.baseTiles : [{ lx: 0, ly: 0 }];
    const limit = Math.floor(1.5 * (asset.scale || 1.0));
    let baseTiles = rawBaseTiles.filter((t: { lx: number, ly: number }) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
    if (baseTiles.length === 0) baseTiles = [{ lx: 0, ly: 0 }];

    const availablePositions: { gx: number, gy: number }[] = [];
    for (let gy = 0; gy < mapState.parameters.canvasHeight * 3; gy++) {
      for (let gx = 0; gx < mapState.parameters.canvasWidth * 3; gx++) {
        let canPlace = true;
        for (const tile of baseTiles) {
          const tgx = gx + tile.lx;
          const tgy = gy + tile.ly;
          if (!isSlotValid(tgx, tgy)) {
            canPlace = false;
            break;
          }
        }
        if (canPlace) availablePositions.push({ gx, gy });
      }
    }

    const newOverrides = { ...mapState.instanceOverrides };
    let placed = 0;
    while (placed < amount && availablePositions.length > 0) {
      const randIdx = Math.floor(Math.random() * availablePositions.length);
      const pos = availablePositions[randIdx];

      let stillValid = true;
      for (const tile of baseTiles) {
        if (occupancy.has(`${pos.gx + tile.lx},${pos.gy + tile.ly}`)) {
          stillValid = false;
          break;
        }
      }

      if (stillValid) {
        const cx = Math.floor(pos.gx / 3);
        const cy = Math.floor(pos.gy / 3);
        const lx = pos.gx - cx * 3 - 1;
        const ly = pos.gy - cy * 3 - 1;

        let topLevel = 1;
        for (const lvl of levels) {
          if (rawGridLevels[lvl]?.[cy]?.[cx]?.isLand) topLevel = lvl;
        }

        const newId = `spawned_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        newOverrides[newId] = {
          cellX: cx,
          cellY: cy,
          lx, ly,
          layer: topLevel,
          assetId: assetId
        } as any;

        for (const tile of baseTiles) {
          occupancy.add(`${pos.gx + tile.lx},${pos.gy + tile.ly}`);
        }
        placed++;
      }

      availablePositions.splice(randIdx, 1);
    }

    setInstanceOverrides(newOverrides);

  }, [mapState, levels, setInstanceOverrides]);

  if (!isLoaded) return null;

  return (
    <div className="flex h-full w-full bg-[var(--color-blender-bg)] overflow-hidden text-gray-200">
      {/* Left Panel: Assets */}
      <div className="w-72 border-r border-[var(--color-blender-border)] bg-[var(--color-blender-panel)] flex flex-col h-full shrink-0 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.5)]">
        <AssetManager
          groundAsset={mapState.groundAsset}
          setGroundAsset={setGroundAsset}
          oceanAsset={mapState.oceanAsset}
          setOceanAsset={setOceanAsset}
          objectAssets={mapState.objectAssets}
          setObjectAssets={setObjectAssets}
          decalAssets={mapState.decalAssets}
          setDecalAssets={setDecalAssets}
          activeSelection={activeSelection}
          setActiveSelection={setActiveSelection}
          replaceAssetId={replaceAssetId}
          setReplaceAssetId={setReplaceAssetId}
          objectStats={objectStats}
        />
      </div>

      {/* Center Panel: Map Preview */}
      <div className="flex-1 overflow-hidden">
        {mapState.groundAsset ? (
          <MapPreview
            groundAsset={mapState.groundAsset}
            oceanAsset={mapState.oceanAsset}
            objectAssets={mapState.objectAssets}
            decalAssets={mapState.decalAssets}
            parameters={mapState.parameters}
            instanceOverrides={mapState.instanceOverrides}
            setInstanceOverrides={setInstanceOverrides}
            groundOverrides={mapState.groundOverrides}
            setGroundOverrides={setGroundOverrides}
            oceanOverrides={mapState.oceanOverrides}
            setOceanOverrides={setOceanOverrides}
            decalOverrides={mapState.decalOverrides}
            setDecalOverrides={setDecalOverrides}
            activeSelection={activeSelection}
            setActiveSelection={setActiveSelection}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            activeLevel={activeLevel}
            setActiveLevel={setActiveLevel}
            levels={levels}
            setLevels={setLevels}
            setParameters={(p) => {
              setParameters(p);
              setInstanceOverrides({}); // Clear overrides on map change
              setGroundOverrides({});
            }}
            onStatsChange={setObjectStats}
            mapDataRef={mapDataRef}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            Select a ground asset to begin
          </div>
        )}
      </div>

      {/* Right Panel: Parameters */}
      <div
        style={{ width: `${panelWidth}px` }}
        className={`border-l border-[var(--color-blender-border)] bg-[var(--color-blender-panel)] flex flex-col h-full shrink-0 z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.5)] relative ${isDraggingPanel ? 'select-none pointer-events-none' : ''}`}
      >
        <div
          className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[var(--color-blender-accent)] z-50 pointer-events-auto"
          onMouseDown={() => setIsDraggingPanel(true)}
        />
        <ParameterUI
          parameters={mapState.parameters}
          setParameters={setParameters}
          groundAsset={mapState.groundAsset}
          setGroundAsset={setGroundAsset}
          oceanAsset={mapState.oceanAsset}
          setOceanAsset={setOceanAsset}
          objectAssets={mapState.objectAssets}
          setObjectAssets={setObjectAssets}
          decalAssets={mapState.decalAssets}
          setDecalAssets={setDecalAssets}
          decalOverrides={mapState.decalOverrides}
          activeSelection={activeSelection}
          onRequestReplaceNode={(id) => setReplaceAssetId(id)}
          objectStats={objectStats}
          hasManualEdits={Object.keys(mapState.instanceOverrides).length > 0 || Object.keys(mapState.groundOverrides).length > 0}
          onClearManualEdits={() => {
            setInstanceOverrides({});
            setGroundOverrides({});
          }}
          onSpawnObjects={handleSpawnObjects}
          onClearOceanOverrides={(lvl) => {
            setOceanOverrides((prev: Record<string, number>) => {
              const next = { ...prev };
              Object.keys(next).forEach(k => {
                if (next[k] === lvl) delete next[k];
              });
              return next;
            });
          }}
          mapDataRef={mapDataRef}
        />
      </div>
    </div>
  );
}

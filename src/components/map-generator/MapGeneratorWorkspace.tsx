import { useState, useEffect, useCallback } from "react";
import AssetManager from "./AssetManager";
import MapPreview from "./MapPreview";
import ParameterUI from "./ParameterUI";
import { getTask, saveMapData } from "@/lib/store";
import { useHistory } from "@/lib/useHistory";
import { TerrainGenerator } from "@/lib/map-engine/TerrainGenerator";

export interface MapAsset {
  taskId: string;
  taskName: string;
  type: 'ground';
  slices: {name: string, url: string}[];
}

export interface ObjectAsset {
  id: string;
  taskId: string;
  taskName: string;
  nodeId: string;
  nodePrompt: string;
  name?: string;
  imageUrl: string;
  amount: number;
  allowOnEdge: boolean;
  scale: number;
  seedOffset?: number;
  baseTiles?: {lx: number, ly: number}[];
  gridOffset?: {x: number, y: number};
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
  width: number;
  height: number;
  seed: number;
  noiseScale: number;
}

export type SelectionState = { type: 'map' } | { type: 'ground' } | { type: 'object', id: string, instanceId?: string };

export type InstanceOverride = { cellX: number, cellY: number, lx: number, ly: number, deleted?: boolean, layer?: number };

export interface MapState {
  groundAsset: MapAsset | null;
  objectAssets: ObjectAsset[];
  parameters: MapParameters;
  instanceOverrides: Record<string, InstanceOverride>;
  groundOverrides: Record<string, number>;
}

export default function MapGeneratorWorkspace({ taskId }: { taskId: string }) {
  const { state: mapState, set: setMapState, undo, redo, canUndo, canRedo } = useHistory<MapState>({
    groundAsset: null,
    objectAssets: [],
    parameters: {
      width: 20,
      height: 20,
      seed: Math.floor(Math.random() * 10000),
      noiseScale: 0.1,
    },
    instanceOverrides: {},
    groundOverrides: {}
  });

  const [activeSelection, setActiveSelection] = useState<SelectionState>({ type: 'map' });
  const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const [activeTool, setActiveTool] = useState<'select' | 'paint' | 'erase'>('select');
  const [activeLevel, setActiveLevel] = useState<number>(1);
  const [levels, setLevels] = useState<number[]>([1]);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId).then(task => {
      if (task?.mapData) {
        setMapState({
          groundAsset: task.mapData.groundAsset || null,
          parameters: task.mapData.parameters || { width: 20, height: 20, seed: 1234, noiseScale: 0.1 },
          objectAssets: task.mapData.objectAssets || [],
          instanceOverrides: task.mapData.instanceOverrides || {},
          groundOverrides: task.mapData.groundOverrides || {}
        });
      }
      setIsLoaded(true);
    });
  }, [taskId, setMapState]);

  useEffect(() => {
    if (!isLoaded || !taskId) return;
    const saveTimer = setTimeout(() => {
      saveMapData(taskId, mapState);
    }, 500); // Debounce save
    return () => clearTimeout(saveTimer);
  }, [mapState, isLoaded, taskId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
              [activeSelection.id]: {
                ...(prev.instanceOverrides[activeSelection.id] || { cellX: 0, cellY: 0, lx: 0, ly: 0 }),
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
  }, [undo, redo, activeSelection, setMapState]);

  const setGroundAsset = useCallback((val: any) => setMapState(p => ({ ...p, groundAsset: typeof val === 'function' ? val(p.groundAsset) : val })), [setMapState]);
  const setObjectAssets = useCallback((val: any) => setMapState(p => ({ ...p, objectAssets: typeof val === 'function' ? val(p.objectAssets) : val })), [setMapState]);
  const setParameters = useCallback((val: any) => setMapState(p => ({ ...p, parameters: typeof val === 'function' ? val(p.parameters) : val })), [setMapState]);
  const setInstanceOverrides = useCallback((val: any) => setMapState(p => ({ ...p, instanceOverrides: typeof val === 'function' ? val(p.instanceOverrides) : val })), [setMapState]);
  const setGroundOverrides = useCallback((val: any) => setMapState(p => ({ ...p, groundOverrides: typeof val === 'function' ? val(p.groundOverrides) : val })), [setMapState]);

  const handleSpawnObjects = useCallback((assetId: string, amount: number) => {
    if (!amount || amount <= 0) return;
    const asset = mapState.objectAssets.find(a => a.id === assetId);
    if (!asset) return;

    const rawGridLevels = TerrainGenerator.generate(
      mapState.parameters.width,
      mapState.parameters.height,
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
        const tiles = oAsset?.baseTiles || [{lx: 0, ly: 0}];
        tiles.forEach(t => {
           occupancy.add(`${override.cellX * 3 + override.lx + t.lx + 1},${override.cellY * 3 + override.ly + t.ly + 1}`);
        });
      }
    });

    const isSlotValid = (gx: number, gy: number) => {
        const cx = Math.floor(gx / 3);
        const cy = Math.floor(gy / 3);
        if (cy < 0 || cy >= mapState.parameters.height || cx < 0 || cx >= mapState.parameters.width) return false;
        
        let topLevel = 1;
        for (const lvl of levels) {
           if (rawGridLevels[lvl]?.[cy]?.[cx]?.isLand) topLevel = lvl;
        }
        
        const cell = rawGridLevels[topLevel]?.[cy]?.[cx];
        if (!cell || !cell.isLand) return false;
        return !occupancy.has(`${gx},${gy}`);
    };

    const rawBaseTiles = asset.baseTiles && asset.baseTiles.length > 0 ? asset.baseTiles : [{lx: 0, ly: 0}];
    const limit = Math.floor(1.5 * (asset.scale || 1.0));
    let baseTiles = rawBaseTiles.filter((t: {lx: number, ly: number}) => Math.abs(t.lx) <= limit && Math.abs(t.ly) <= limit);
    if (baseTiles.length === 0) baseTiles = [{lx: 0, ly: 0}];

    const availablePositions: {gx: number, gy: number}[] = [];
    for (let gy = 0; gy < mapState.parameters.height * 3; gy++) {
      for (let gx = 0; gx < mapState.parameters.width * 3; gx++) {
         let canPlace = true;
         for (const tile of baseTiles) {
           const tgx = gx + tile.lx;
           const tgy = gy + tile.ly;
           if (!isSlotValid(tgx, tgy)) {
             canPlace = false;
             break;
           }
         }
         if (canPlace) availablePositions.push({gx, gy});
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
         
         const newId = `spawned_${Date.now()}_${Math.floor(Math.random()*1000)}`;
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
          objectAssets={mapState.objectAssets}
          setObjectAssets={setObjectAssets}
          activeSelection={activeSelection}
          setActiveSelection={setActiveSelection}
          replaceAssetId={replaceAssetId}
          setReplaceAssetId={setReplaceAssetId}
        />
      </div>

      {/* Center Panel: Map Preview */}
      <div className="flex-1 overflow-hidden">
        {mapState.groundAsset ? (
          <MapPreview 
            groundAsset={mapState.groundAsset} 
            objectAssets={mapState.objectAssets}
            parameters={mapState.parameters} 
            instanceOverrides={mapState.instanceOverrides}
            setInstanceOverrides={setInstanceOverrides}
            groundOverrides={mapState.groundOverrides}
            setGroundOverrides={setGroundOverrides}
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
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            Select a ground asset to begin
          </div>
        )}
      </div>

      {/* Right Panel: Parameters */}
      <div className="w-80 border-l border-[var(--color-blender-border)] bg-[var(--color-blender-panel)] flex flex-col h-full shrink-0 z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.5)]">
        <ParameterUI 
          parameters={mapState.parameters} 
          setParameters={setParameters} 
          groundAsset={mapState.groundAsset}
          setGroundAsset={setGroundAsset}
          objectAssets={mapState.objectAssets}
          setObjectAssets={setObjectAssets}
          activeSelection={activeSelection}
          onRequestReplaceNode={(id) => setReplaceAssetId(id)}
          hasManualEdits={Object.keys(mapState.instanceOverrides).length > 0 || Object.keys(mapState.groundOverrides).length > 0}
          onClearManualEdits={() => {
            setInstanceOverrides({});
            setGroundOverrides({});
          }}
          onSpawnObjects={handleSpawnObjects}
        />
      </div>
    </div>
  );
}

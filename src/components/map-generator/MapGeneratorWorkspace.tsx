import { useState, useEffect } from "react";
import AssetManager from "./AssetManager";
import MapPreview from "./MapPreview";
import ParameterUI from "./ParameterUI";
import { getTask, saveMapData } from "@/lib/store";

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
}

export interface MapParameters {
  width: number;
  height: number;
  seed: number;
  noiseScale: number;
}

export type SelectionState = { type: 'map' } | { type: 'ground' } | { type: 'object', id: string };

export type InstanceOverride = { cellX: number, cellY: number, lx: number, ly: number };

export default function MapGeneratorWorkspace({ taskId }: { taskId: string }) {
  const [groundAsset, setGroundAsset] = useState<MapAsset | null>(null);
  const [objectAssets, setObjectAssets] = useState<ObjectAsset[]>([]);
  const [activeSelection, setActiveSelection] = useState<SelectionState>({ type: 'map' });
  const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null);
  const [instanceOverrides, setInstanceOverrides] = useState<Record<string, InstanceOverride>>({});
  const [parameters, setParameters] = useState<MapParameters>({
    width: 20,
    height: 20,
    seed: Math.floor(Math.random() * 10000),
    noiseScale: 0.1,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId).then(task => {
      if (task?.mapData) {
        if (task.mapData.groundAsset) setGroundAsset(task.mapData.groundAsset);
        if (task.mapData.parameters) setParameters(task.mapData.parameters);
        if (task.mapData.objectAssets) setObjectAssets(task.mapData.objectAssets);
        if (task.mapData.instanceOverrides) setInstanceOverrides(task.mapData.instanceOverrides);
      }
      setIsLoaded(true);
    });
  }, [taskId]);

  useEffect(() => {
    if (!isLoaded || !taskId) return;
    const saveTimer = setTimeout(() => {
      saveMapData(taskId, { groundAsset, parameters, objectAssets, instanceOverrides });
    }, 500); // Debounce save
    return () => clearTimeout(saveTimer);
  }, [groundAsset, parameters, objectAssets, instanceOverrides, isLoaded, taskId]);

  if (!isLoaded) return null;

  return (
    <div className="flex h-full w-full bg-[var(--color-blender-bg)] overflow-hidden text-gray-200">
      {/* Left Panel: Assets */}
      <div className="w-72 border-r border-[var(--color-blender-border)] bg-[var(--color-blender-panel)] flex flex-col h-full shrink-0 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.5)]">
        <AssetManager 
          groundAsset={groundAsset} 
          setGroundAsset={setGroundAsset} 
          objectAssets={objectAssets}
          setObjectAssets={setObjectAssets}
          activeSelection={activeSelection}
          setActiveSelection={setActiveSelection}
          replaceAssetId={replaceAssetId}
          setReplaceAssetId={setReplaceAssetId}
        />
      </div>

      {/* Center Panel: Map Preview */}
      <div className="flex-1 overflow-hidden">
        {groundAsset ? (
          <MapPreview 
            groundAsset={groundAsset} 
            objectAssets={objectAssets}
            parameters={parameters} 
            instanceOverrides={instanceOverrides}
            setInstanceOverrides={setInstanceOverrides}
            activeSelection={activeSelection}
            setParameters={(p) => {
              setParameters(p);
              setInstanceOverrides({}); // Clear overrides on map change
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
          parameters={parameters} 
          setParameters={setParameters} 
          groundAsset={groundAsset}
          setGroundAsset={setGroundAsset}
          objectAssets={objectAssets}
          setObjectAssets={setObjectAssets}
          activeSelection={activeSelection}
          onRequestReplaceNode={(id) => setReplaceAssetId(id)}
        />
      </div>
    </div>
  );
}

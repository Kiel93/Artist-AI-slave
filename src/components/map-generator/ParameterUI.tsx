import { Settings, Dices, RefreshCw, Trash2, Upload, Image as ImageIcon, Sliders, Box, Scaling } from "lucide-react";
import { MapParameters, MapAsset, ObjectAsset, SelectionState } from "./MapGeneratorWorkspace";
import { getTask } from "@/lib/store";

interface ParameterUIProps {
  parameters: MapParameters;
  setParameters: (params: MapParameters) => void;
  groundAsset: MapAsset | null;
  setGroundAsset: (asset: MapAsset | null) => void;
  objectAssets: ObjectAsset[];
  setObjectAssets: (assets: ObjectAsset[]) => void;
  activeSelection: SelectionState;
  onRequestReplaceNode?: (assetId: string) => void;
}

export default function ParameterUI({ 
  parameters, 
  setParameters, 
  groundAsset,
  setGroundAsset,
  objectAssets,
  setObjectAssets,
  activeSelection,
  onRequestReplaceNode
}: ParameterUIProps) {

  const handleMapChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setParameters({
      ...parameters,
      [name]: (type === 'number' || type === 'range') ? Number(value) : value,
    });
  };

  const updateObjectAsset = (id: string, updates: Partial<ObjectAsset>) => {
    setObjectAssets(objectAssets.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const removeObjectAsset = (id: string) => {
    setObjectAssets(objectAssets.filter(a => a.id !== id));
  };

  const renderMapSettings = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-[var(--color-blender-border)] pb-2">Dimensions</h3>
        
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs text-gray-400">Map Width</label>
            <span className="text-xs text-blue-300">{parameters.width}</span>
          </div>
          <input 
            type="range" name="width" min="5" max="50" 
            value={parameters.width} onChange={handleMapChange}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs text-gray-400">Map Height</label>
            <span className="text-xs text-blue-300">{parameters.height}</span>
          </div>
          <input 
            type="range" name="height" min="5" max="50" 
            value={parameters.height} onChange={handleMapChange}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-[var(--color-blender-border)] pb-2">Terrain Noise</h3>
        
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
  );

  const renderGroundSettings = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--color-blender-border)] pb-2">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Ground Info</h3>
          {groundAsset && (
            <button 
              onClick={async () => {
                const task = await getTask(groundAsset.taskId);
                if (!task || !task.nodes) return;
                const hexSlicerNode = task.nodes.find(n => n.type === 'isometricHexSlicer');
                if (hexSlicerNode && hexSlicerNode.data.slices) {
                  setGroundAsset({ ...groundAsset, slices: hexSlicerNode.data.slices });
                }
              }}
              className="text-emerald-400 hover:text-emerald-300 p-1" 
              title="Sync with Node"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
        {groundAsset ? (
          <div className="text-sm text-gray-400">
            <p><strong>Name:</strong> {groundAsset.taskName}</p>
            <p><strong>Tiles:</strong> {groundAsset.slices.length}</p>
            <p className="mt-4 text-xs italic opacity-70">This asset provides the base foundation layer. The island shape is auto-tiled using these images.</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No ground asset selected.</p>
        )}
      </div>
    </div>
  );

  const renderObjectSettings = (objId: string) => {
    const asset = objectAssets.find(a => a.id === objId);
    if (!asset) return <p className="text-sm text-gray-500">Asset not found.</p>;

    return (
      <div className="space-y-6">
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

        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--color-blender-border)] pb-2">
            <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider">Object Parameters</h3>
            <div className="flex gap-1">
              <button 
                onClick={async () => {
                  if (asset.taskId === 'local') return; // Cannot sync local uploads
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
          
          <div className="flex items-center justify-center py-2">
            <img src={asset.imageUrl} className="max-w-[120px] max-h-[120px] object-contain drop-shadow-2xl" />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Spawn Amount</label>
            <input 
              type="number" 
              value={asset.amount}
              onChange={(e) => updateObjectAsset(asset.id, { amount: parseInt(e.target.value) || 0 })}
              className="w-full bg-black/40 border border-indigo-500/30 rounded px-2 py-1.5 text-sm text-white"
              min="0"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Placement Rule</label>
            <select 
              value={asset.allowOnEdge ? 'edge' : 'center'}
              onChange={(e) => updateObjectAsset(asset.id, { allowOnEdge: e.target.value === 'edge' })}
              className="w-full bg-black/40 border border-indigo-500/30 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="center">Center Only (Fully Flat Tiles)</option>
              <option value="edge">Allow on Edges (Mathematical Center)</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-400 flex items-center gap-1"><Scaling className="w-3 h-3"/> Scale</label>
              <span className="text-xs text-indigo-300">{(asset.scale || 1.0).toFixed(1)}x</span>
            </div>
            <input 
              type="range" 
              min="0.1" max="7.0" step="0.1"
              value={asset.scale || 1.0}
              onChange={(e) => updateObjectAsset(asset.id, { scale: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1525]">
      <div className="p-4 border-b border-[var(--color-blender-border)]">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          {activeSelection.type === 'map' && <><Sliders className="w-5 h-5 text-blue-400" /> Map Settings</>}
          {activeSelection.type === 'ground' && <><Settings className="w-5 h-5 text-emerald-400" /> Ground Settings</>}
          {activeSelection.type === 'object' && <><Box className="w-5 h-5 text-indigo-400" /> Object Settings</>}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeSelection.type === 'map' && renderMapSettings()}
        {activeSelection.type === 'ground' && renderGroundSettings()}
        {activeSelection.type === 'object' && renderObjectSettings(activeSelection.id)}
      </div>
    </div>
  );
}

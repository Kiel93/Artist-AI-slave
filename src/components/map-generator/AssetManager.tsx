import { useState, useEffect } from "react";
import { Folder, Plus, Check, Loader2, Settings, Upload } from "lucide-react";
import { getProjects, Project, Task } from "@/lib/store";
import { MapAsset, ObjectAsset, SelectionState } from "./MapGeneratorWorkspace";

interface AssetManagerProps {
  groundAsset: MapAsset | null;
  setGroundAsset: (asset: MapAsset | null) => void;
  objectAssets: ObjectAsset[];
  setObjectAssets: (assets: ObjectAsset[]) => void;
  activeSelection: SelectionState;
  setActiveSelection: (state: SelectionState) => void;
}

export default function AssetManager({ 
  groundAsset, 
  setGroundAsset, 
  objectAssets, 
  setObjectAssets,
  activeSelection,
  setActiveSelection
}: AssetManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'ground' | 'object'>('ground');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProjects().then(setProjects);
  }, []);

  const openModal = (type: 'ground' | 'object') => {
    setImportType(type);
    setIsImportModalOpen(true);
    setError(null);
  };

  const handleImportGround = async (task: Task) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!task.nodes) throw new Error("Workspace is empty.");
      
      const hexSlicerNode = task.nodes.find(n => n.type === 'isometricHexSlicer');
      if (!hexSlicerNode || !hexSlicerNode.data.slices || hexSlicerNode.data.slices.length === 0) {
        throw new Error("No extracted 13 tiles found in this workspace.");
      }

      setGroundAsset({
        taskId: task.id,
        taskName: task.name,
        type: 'ground',
        slices: hexSlicerNode.data.slices
      });
      setActiveSelection({ type: 'ground' });
      setIsImportModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to import asset.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportObject = async (task: Task, node: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const imageUrl = node.data.resultUrl || node.data.imageUrl;
      if (!imageUrl) throw new Error("This node has no generated image yet.");
      
      const newId = Math.random().toString(36).substr(2, 9);
      const newAsset: ObjectAsset = {
        id: newId,
        taskId: task.id,
        taskName: task.name,
        nodeId: node.id,
        nodePrompt: node.data.localPrompt || "Generated Object",
        imageUrl,
        amount: 5,
        allowOnEdge: false,
        scale: 1.0,
        seedOffset: 0
      };
      
      setObjectAssets([...objectAssets, newAsset]);
      setActiveSelection({ type: 'object', id: newId });
      setIsImportModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to import asset.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const newId = Math.random().toString(36).substr(2, 9);
      const newAsset: ObjectAsset = {
        id: newId,
        taskId: 'local',
        taskName: 'Local Upload',
        nodeId: 'local',
        nodePrompt: file.name,
        name: file.name,
        imageUrl: base64,
        amount: 5,
        allowOnEdge: false,
        scale: 1.0,
        seedOffset: 0
      };
      setObjectAssets([...objectAssets, newAsset]);
      setActiveSelection({ type: 'object', id: newId });
    };
    reader.readAsDataURL(file);
    
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1525]">
      <div className="p-4 border-b border-[var(--color-blender-border)] flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Folder className="w-5 h-5 text-emerald-400" />
          Assets
        </h2>
        <button 
          onClick={() => setActiveSelection({ type: 'map' })}
          className={`p-1.5 rounded transition-colors ${activeSelection.type === 'map' ? 'bg-blue-600/30 text-blue-300' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          title="Map Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Ground Asset Section */}
        <div>
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">Ground Tileset</h3>
          
          {groundAsset ? (
            <button 
              onClick={() => setActiveSelection({ type: 'ground' })}
              className={`w-full text-left bg-black/40 border rounded-lg p-2 transition-all flex items-center gap-3 ${
                activeSelection.type === 'ground' ? 'border-emerald-500/60 bg-emerald-900/20' : 'border-transparent hover:border-emerald-500/30'
              }`}
            >
              <div className="w-10 h-10 bg-black/50 rounded flex items-center justify-center shrink-0 border border-emerald-500/20 overflow-hidden">
                 {groundAsset.slices[0] ? <img src={groundAsset.slices[0].url} className="w-8 h-8 object-contain" /> : null}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-emerald-100 truncate">{groundAsset.taskName}</div>
                <div className="text-[10px] text-gray-500">13 Tiles</div>
              </div>
            </button>
          ) : (
            <button 
              onClick={() => openModal('ground')}
              className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-emerald-500/50 rounded-lg p-3 text-center text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 text-xs"
            >
              <Plus className="w-4 h-4" /> Import Ground
            </button>
          )}
        </div>

        {/* Object Assets Section */}
        <div>
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">Objects</h3>
          
          <div className="space-y-1 mb-2">
            {objectAssets.map(asset => {
              const isSelected = activeSelection.type === 'object' && activeSelection.id === asset.id;
              return (
                <button 
                  key={asset.id}
                  onClick={() => setActiveSelection({ type: 'object', id: asset.id })}
                  className={`w-full text-left bg-black/40 border rounded-lg p-2 transition-all flex items-center gap-3 ${
                    isSelected ? 'border-indigo-500/60 bg-indigo-900/20' : 'border-transparent hover:border-indigo-500/30'
                  }`}
                >
                  <div className="w-10 h-10 bg-black/50 rounded flex items-center justify-center shrink-0 border border-indigo-500/20 overflow-hidden">
                    <img src={asset.imageUrl} className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-indigo-100 truncate" title={asset.name || asset.nodePrompt}>{asset.name || asset.nodePrompt}</div>
                    <div className="text-[10px] text-gray-500 truncate">{asset.amount} instances</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => openModal('object')}
              className="flex-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors border border-indigo-500/30"
            >
              <Plus className="w-3 h-3" /> Add Object
            </button>
            <label className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors border border-emerald-500/30 cursor-pointer">
              <Upload className="w-3 h-3" /> Upload
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-[var(--color-blender-border)] flex justify-between items-center">
              <h3 className="font-bold text-lg text-white">
                Import {importType === 'ground' ? 'Ground Tileset' : 'Object Asset'}
              </h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {error && <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-sm">{error}</div>}
              
              {projects.map(project => (
                <div key={project.id} className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{project.name}</h4>
                  {project.tasks.map(task => {
                    if (!task.nodes) return null;
                    
                    if (importType === 'ground') {
                      const hasGround = task.nodes.some(n => n.type === 'isometricHexSlicer');
                      if (!hasGround) return null;
                      return (
                        <button
                          key={task.id}
                          onClick={() => handleImportGround(task)}
                          disabled={isLoading}
                          className="w-full text-left p-3 rounded bg-black/20 border border-transparent hover:border-emerald-500/40 hover:bg-black/40 transition-all flex items-center justify-between group"
                        >
                          <span className="text-sm text-gray-300 group-hover:text-emerald-100">{task.name}</span>
                          <Check className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100" />
                        </button>
                      );
                    } else {
                      const objectNodes = task.nodes.filter(n => n.type === 'assetGenerator');
                      if (objectNodes.length === 0) return null;
                      
                      return (
                        <div key={task.id} className="bg-black/20 rounded p-2 border border-gray-800">
                          <div className="text-xs text-gray-400 mb-2 px-1">{task.name}</div>
                          <div className="grid grid-cols-4 gap-2">
                            {objectNodes.map(node => {
                              const imageUrl = node.data.resultUrl || node.data.imageUrl;
                              return (
                                <button
                                  key={node.id}
                                  onClick={() => handleImportObject(task, node)}
                                  disabled={isLoading || !imageUrl}
                                  className="aspect-square relative rounded bg-black/40 border border-transparent hover:border-indigo-500/60 hover:bg-indigo-900/40 transition-all flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                                >
                                  {imageUrl ? (
                                    <img src={imageUrl} className="w-full h-full object-contain p-1" />
                                  ) : (
                                    <span className="text-[8px] text-gray-600">No Img</span>
                                  )}
                                  <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Plus className="w-4 h-4 text-white" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

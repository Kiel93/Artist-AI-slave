import { useState, useEffect } from "react";
import { Folder, Plus, Check, Loader2, Settings, Upload, ChevronDown, Download } from "lucide-react";
import { getProjects, Project, Task } from "@/lib/store";
import { MapAsset, ObjectAsset, SelectionState } from "./MapGeneratorWorkspace";

interface AssetManagerProps {
  groundAsset: MapAsset | null;
  setGroundAsset: (asset: MapAsset | null) => void;
  oceanAsset: MapAsset | null;
  setOceanAsset: (asset: MapAsset | null) => void;
  objectAssets: ObjectAsset[];
  setObjectAssets: (assets: ObjectAsset[]) => void;
  decalAssets: any[]; // DecalAsset[]
  setDecalAssets: (assets: any[]) => void;
  activeSelection: SelectionState;
  setActiveSelection: (state: SelectionState) => void;
  replaceAssetId?: string | null;
  setReplaceAssetId?: (id: string | null) => void;
  objectStats?: Record<string, number>;
  currentTaskId?: string;
}

export default function AssetManager({ 
  groundAsset, 
  setGroundAsset, 
  oceanAsset,
  setOceanAsset,
  objectAssets, 
  setObjectAssets,
  decalAssets,
  setDecalAssets,
  activeSelection,
  setActiveSelection,
  replaceAssetId,
  setReplaceAssetId,
  objectStats = {},
  currentTaskId
}: AssetManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'ground' | 'ocean' | 'object' | 'ground_variation' | 'dynamic_decal'>('ground');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isGroundExpanded, setIsGroundExpanded] = useState(true);
  const [isGroundVariationExpanded, setIsGroundVariationExpanded] = useState(true);
  const [isOceanExpanded, setIsOceanExpanded] = useState(true);
  const [isObjectsExpanded, setIsObjectsExpanded] = useState(true);
  const [isDecalsExpanded, setIsDecalsExpanded] = useState(true);

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  type SelectedAssetInfo = {
    task: any;
    node: any;
    importType: 'ground' | 'ocean' | 'object' | 'ground_variation' | 'dynamic_decal';
    imageUrl: string;
    isAlreadyImported: boolean;
  };
  const [selectedAsset, setSelectedAsset] = useState<SelectedAssetInfo | null>(null);

  const loadAndMeasureImage = (url: string): Promise<{ width: number, height: number, sizeBytes: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let sizeBytes = 0;
        if (url.startsWith('data:image/')) {
          const base64Length = url.split(',')[1].length;
          sizeBytes = Math.floor(base64Length * 0.75); // approx base64 size
        }
        resolve({ width: img.width, height: img.height, sizeBytes });
      };
      img.onerror = () => resolve({ width: 0, height: 0, sizeBytes: 0 });
      img.src = url;
    });
  };

  useEffect(() => {
    if (isImportModalOpen) {
      getProjects().then(fetchedProjects => {
        setProjects(fetchedProjects);
        
        const newExpandedProjects: Record<string, boolean> = {};
        const newExpandedTasks: Record<string, boolean> = {};
        
        for (const p of fetchedProjects) {
          let hasCurrentTask = false;
          for (const t of p.tasks) {
            if (t.id === currentTaskId) {
              hasCurrentTask = true;
              newExpandedTasks[t.id] = true;
            } else {
              newExpandedTasks[t.id] = false;
            }
          }
          newExpandedProjects[p.id] = hasCurrentTask;
        }
        
        setExpandedProjects(newExpandedProjects);
        setExpandedTasks(newExpandedTasks);
      });
    }
  }, [isImportModalOpen, currentTaskId]);

  useEffect(() => {
    if (replaceAssetId) {
      if (replaceAssetId === 'ground') {
        setImportType('ground');
      } else if (replaceAssetId === 'ocean') {
        setImportType('ocean');
      } else if (replaceAssetId.startsWith('ground_variation_')) {
        setImportType('ground_variation');
      } else if (replaceAssetId.startsWith('decal_')) {
        setImportType('dynamic_decal');
      } else {
        setImportType('object');
      }
      setIsImportModalOpen(true);
      setError(null);
      setSelectedAsset(null);
    }
  }, [replaceAssetId]);

  const closeModal = () => {
    setIsImportModalOpen(false);
    setSelectedAsset(null);
    if (setReplaceAssetId) setReplaceAssetId(null);
  };

  const openModal = (type: 'ground' | 'ocean' | 'object' | 'dynamic_decal') => {
    setImportType(type);
    setIsImportModalOpen(true);
    setError(null);
    setSelectedAsset(null);
  };

  const handleImportGroundOrOcean = async (task: Task, type: 'ground' | 'ocean', nodeId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!task.nodes) throw new Error("Workspace is empty.");
      
      const node = task.nodes.find(n => n.id === nodeId);
      if (!node) throw new Error("Selected node not found.");

      let slices: any[] = [];
      if (type === 'ground') {
        if (!node.data.slices || node.data.slices.length === 0) {
          throw new Error("No extracted tiles found in this node.");
        }
        slices = node.data.slices.map((s: any) => ({
          ...s,
          name: s.name.startsWith('Ground_') ? s.name : `Ground_${s.name}`
        }));
      } else {
        const imageUrl = node.data.image;
        if (!imageUrl) throw new Error("No image found in this node.");
        slices = [{ name: 'Flat_Floor', url: imageUrl }];
      }

      const newAsset = {
        taskId: task.id,
        taskName: task.name,
        nodeId: node.id,
        type: type,
        slices: slices
      };

      if (type === 'ground') {
        setGroundAsset(newAsset);
        setActiveSelection({ type: 'ground' });
      } else {
        setOceanAsset(newAsset);
        setActiveSelection({ type: 'ocean' });
      }
      closeModal();
    } catch (err: any) {
      setError(err.message || "Failed to import asset.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportObjectOrDecal = async (task: Task, node: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const imageUrl = node.data.image;
      if (!imageUrl) throw new Error("This node has no generated image yet.");
      
      if (replaceAssetId && replaceAssetId.startsWith('ground_variation_')) {
        const sliceIdx = parseInt(replaceAssetId.split('_')[2], 10);
        if (groundAsset && groundAsset.slices[sliceIdx]) {
          const newSlices = [...groundAsset.slices];
          if (!newSlices[sliceIdx].variations) newSlices[sliceIdx] = { ...newSlices[sliceIdx], variations: [] };
          else newSlices[sliceIdx] = { ...newSlices[sliceIdx], variations: [...newSlices[sliceIdx].variations!] };
          newSlices[sliceIdx].variations!.push({ url: imageUrl, factor: 0, taskId: task.id, nodeId: node.id, opacity: 1, seamSmoothing: 0 });
          setGroundAsset({ ...groundAsset, slices: newSlices });
        }
      } else if (replaceAssetId && replaceAssetId.startsWith('decal_')) {
        const decalId = replaceAssetId.substring(6);
        setDecalAssets(decalAssets.map(d => d.id === decalId ? {
          ...d,
          taskId: task.id,
          taskName: task.name,
          nodeId: node.id,
          imageUrl
        } : d));
        setActiveSelection({ type: 'dynamic_decal', id: decalId });
      } else if (replaceAssetId) {
        const stats = await loadAndMeasureImage(imageUrl);
        setObjectAssets(objectAssets.map(a => a.id === replaceAssetId ? {
          ...a,
          taskId: task.id,
          taskName: task.name,
          nodeId: node.id,
          nodePrompt: node.data.localPrompt || "Generated Object",
          imageUrl,
          ...stats
        } : a));
        setActiveSelection({ type: 'object', id: replaceAssetId });
      } else if (importType === 'dynamic_decal') {
        const newId = Math.random().toString(36).substr(2, 9);
        const newDecal = {
          id: newId,
          name: node.data.localPrompt || "Generated Decal",
          imageUrl,
          size: 1.0,
          opacity: 1.0,
          smoothing: 0,
          baseTiles: []
        };
        setDecalAssets([...decalAssets, newDecal]);
        setActiveSelection({ type: 'dynamic_decal', id: newId });
      } else {
        const newId = Math.random().toString(36).substr(2, 9);
        const stats = await loadAndMeasureImage(imageUrl);
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
          seedOffset: 0,
          baseTiles: [{lx: 0, ly: 0}],
          ...stats
        };
        
        setObjectAssets([...objectAssets, newAsset]);
        setActiveSelection({ type: 'object', id: newId });
      }
      closeModal();
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
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const newId = Math.random().toString(36).substr(2, 9);
      const stats = await loadAndMeasureImage(base64);
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
        seedOffset: 0,
        baseTiles: [{lx: 0, ly: 0}],
        ...stats
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
          className={`p-1.5 rounded-sm transition-colors ${activeSelection.type === 'map' ? 'bg-blue-600/30 text-blue-300' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          title="Map Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Ground Asset Section */}
        <div>
          <button 
            onClick={() => setIsGroundExpanded(!isGroundExpanded)}
            className="flex items-center gap-1 w-full text-left mb-2 px-1 hover:text-white"
          >
            <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isGroundExpanded ? '' : '-rotate-90'}`} />
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ground Tileset</h3>
          </button>
          
          {isGroundExpanded && (
            groundAsset ? (
              <div className="space-y-1">
                <button 
                  onClick={() => setActiveSelection({ type: 'ground' })}
                  className={`w-full text-left bg-black/40 border rounded-sm p-2 transition-all flex items-center gap-3 ${
                    (activeSelection.type === 'ground' || activeSelection.type === 'ground_variation' || activeSelection.type === 'dynamic_decal') ? 'border-emerald-500/60 bg-emerald-900/20' : 'border-transparent hover:border-emerald-500/30'
                  }`}
                >
                  <div className="w-10 h-10 bg-black/50 rounded-sm flex items-center justify-center shrink-0 border border-emerald-500/20 overflow-hidden">
                     {groundAsset.slices[0] ? <img alt="image" src={groundAsset.slices[0].url} className="w-8 h-8 object-contain" /> : null}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-emerald-100 truncate">{groundAsset.taskName}</div>
                    <div className="text-[10px] text-gray-500">{groundAsset.slices.length} Tiles</div>
                  </div>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => openModal('ground')}
                className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-emerald-500/50 rounded-sm p-3 text-center text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <Plus className="w-4 h-4" /> Import Ground
              </button>
            )
          )}
        </div>

        {/* Dynamic Decals Section */}
        <div>
          <button 
            onClick={() => setIsDecalsExpanded(!isDecalsExpanded)}
            className="flex items-center gap-1 w-full text-left mb-2 px-1 hover:text-white"
          >
            <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isDecalsExpanded ? '' : '-rotate-90'}`} />
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dynamic Decals</h3>
          </button>

          {isDecalsExpanded && (
            <div className="space-y-1">
              {decalAssets.map((decal) => (
                <div
                  key={decal.id}
                  onClick={() => setActiveSelection({ type: 'dynamic_decal', id: decal.id })}
                  className={`cursor-pointer w-full text-left bg-black/40 border rounded-sm p-2 transition-all flex items-center justify-between group ${
                    activeSelection.type === 'dynamic_decal' && activeSelection.id === decal.id
                      ? 'border-emerald-500/60 bg-emerald-900/20'
                      : 'border-transparent hover:border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-black/50 rounded-sm flex items-center justify-center shrink-0 border border-emerald-500/20 overflow-hidden">
                      <img alt={decal.name} src={decal.imageUrl} className="w-8 h-8 object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-emerald-100 truncate">{decal.name}</div>
                    </div>
                  </div>
                </div>
              ))}

              <button 
                onClick={() => openModal('dynamic_decal')}
                className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-emerald-500/50 rounded-sm p-3 text-center text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 text-xs mt-2"
              >
                <Plus className="w-4 h-4" /> Import Decal
              </button>

              <div className="relative mt-2">
                <input
                  type="file" accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      if (event.target?.result) {
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
                        setActiveSelection({ type: 'dynamic_decal', id: newId });
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <button className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-emerald-500/50 rounded-sm p-3 text-center text-gray-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 text-xs">
                  <Upload className="w-4 h-4" /> Upload Local Image
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Ocean Asset Section */}
        <div>
          <button 
            onClick={() => setIsOceanExpanded(!isOceanExpanded)}
            className="flex items-center gap-1 w-full text-left mb-2 px-1 hover:text-white"
          >
            <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isOceanExpanded ? '' : '-rotate-90'}`} />
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ocean Floor</h3>
          </button>
          
          {isOceanExpanded && (
            oceanAsset ? (
              <button 
                onClick={() => setActiveSelection({ type: 'ocean' })}
                className={`w-full text-left bg-black/40 border rounded-sm p-2 transition-all flex items-center gap-3 ${
                  activeSelection.type === 'ocean' ? 'border-blue-500/60 bg-blue-900/20' : 'border-transparent hover:border-blue-500/30'
                }`}
              >
                <div className="w-10 h-10 bg-black/50 rounded-sm flex items-center justify-center shrink-0 border border-blue-500/20 overflow-hidden">
                   {oceanAsset.slices[0] ? <img alt="image" src={oceanAsset.slices[0].url} className="w-8 h-8 object-contain" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-blue-100 truncate">{oceanAsset.taskName}</div>
                  <div className="text-[10px] text-gray-500">Flat Floor</div>
                </div>
              </button>
            ) : (
              <button 
                onClick={() => openModal('ocean')}
                className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-blue-500/50 rounded-sm p-3 text-center text-gray-400 hover:text-blue-400 transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <Plus className="w-4 h-4" /> Import Ocean
              </button>
            )
          )}
        </div>

        {/* Object Assets Section */}
        <div>
          <button 
            onClick={() => setIsObjectsExpanded(!isObjectsExpanded)}
            className="flex items-center gap-1 w-full text-left mb-2 px-1 hover:text-white"
          >
            <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isObjectsExpanded ? '' : '-rotate-90'}`} />
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Objects</h3>
          </button>
          
          {isObjectsExpanded && (
            <>
              <div className="space-y-1 mb-2">
                {objectAssets.map(asset => {
                  const isSelected = activeSelection.type === 'object' && activeSelection.id === asset.id;
                  const instanceCount = objectStats[asset.id] || 0;
                  return (
                    <button 
                      key={asset.id}
                      onClick={() => setActiveSelection({ type: 'object', id: asset.id })}
                      className={`w-full text-left bg-black/40 border rounded-sm p-2 transition-all flex items-center gap-3 ${
                        isSelected ? 'border-indigo-500/60 bg-indigo-900/20' : 'border-transparent hover:border-indigo-500/30'
                      }`}
                    >
                      <div className="w-10 h-10 bg-black/50 rounded-sm flex items-center justify-center shrink-0 border border-indigo-500/20 overflow-hidden">
                        <img alt="image" src={asset.imageUrl} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-indigo-100 truncate" title={asset.name || asset.nodePrompt}>{asset.name || asset.nodePrompt}</div>
                        <div className="text-[10px] text-gray-500 truncate">{instanceCount} instances</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button 
                onClick={() => openModal('object')}
                className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-indigo-500/50 rounded-sm p-3 text-center text-gray-400 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <Plus className="w-4 h-4" /> Import Object
              </button>
              
              <div className="relative">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <button className="w-full bg-black/20 border border-dashed border-gray-600 hover:border-indigo-500/50 rounded-sm p-3 text-center text-gray-400 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2 text-xs">
                  <Upload className="w-4 h-4" /> Upload Local Image
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 md:p-16 lg:p-24">
          <div className="bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-sm w-full max-w-5xl shadow-2xl flex flex-col h-full max-h-full overflow-hidden">
            <div className="p-4 border-b border-[var(--color-blender-border)] flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-white">
                {replaceAssetId && replaceAssetId.startsWith('ground_variation_') ? 'Import Variation' : replaceAssetId ? 'Replace Object Asset' : `Import ${importType === 'ground' ? 'Ground Tileset' : 'Object Asset'}`}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="flex flex-row flex-1 overflow-hidden min-h-0">
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {error && <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-sm text-red-200 text-sm">{error}</div>}
              
              {projects.map(project => {
                const isProjectExpanded = expandedProjects[project.id];
                return (
                <div key={project.id} className="space-y-2">
                  <div 
                    className="flex items-center gap-2 cursor-pointer hover:text-indigo-400 group"
                    onClick={() => setExpandedProjects(prev => ({ ...prev, [project.id]: !prev[project.id] }))}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isProjectExpanded ? '' : '-rotate-90'}`} />
                    <h4 className="text-xs font-bold text-gray-500 group-hover:text-indigo-400 uppercase tracking-wider select-none">{project.name}</h4>
                  </div>
                  {isProjectExpanded && project.tasks.map(task => {
                    if (!task.nodes) return null;
                    
                    if (importType === 'ground' || importType === 'ocean') {
                      const flattenedNodes = task.nodes.flatMap(n => {
                        if (n.data?.outputImages && Object.keys(n.data.images).length > 0) {
                          return Object.entries(n.data.images).map(([pinId, url]) => {
                            const pinInfo = n.data.outputPins?.find((p: any) => p.id === pinId);
                            const label = pinInfo ? pinInfo.label : pinId;
                            return {
                              ...n,
                              id: `${n.id}-${pinId}`,
                              data: {
                                ...n.data,
                                image: url,
                                localPrompt: label
                              }
                            };
                          });
                        }
                        return [n];
                      });
                      
                      const validNodes = importType === 'ground'
                        ? flattenedNodes.filter(n => n.type === 'isometricHexSlicer' && n.data?.slices?.some((s: any) => s.name === 'Ground_CenterFill' || s.name === 'CenterFill'))
                        : flattenedNodes.filter(n => n.data && (n.data.image));
                        
                      if (validNodes.length === 0) return null;
                      
                      const themeColor = importType === 'ground' ? 'emerald' : 'blue';
                      
                      return (
                        <div key={task.id} className="bg-black/20 rounded-sm border border-gray-800">
                          <div 
                            className="text-xs text-gray-400 px-3 py-2 cursor-pointer hover:bg-black/40 hover:text-indigo-300 flex items-center gap-2 select-none"
                            onClick={() => setExpandedTasks(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                          >
                            <ChevronDown className={`w-3 h-3 transition-transform ${expandedTasks[task.id] ? '' : '-rotate-90'}`} />
                            {task.name}
                          </div>
                          {expandedTasks[task.id] && (
                          <div className="grid gap-2 p-2 pt-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
                            {validNodes.map(node => {
                               let imageUrl = node.data.image;
                               if (importType === 'ground' && node.data.slices) {
                                 const centerFillSlice = node.data.slices.find((s: any) => s.name === 'Ground_CenterFill' || s.name === 'CenterFill');
                                 if (centerFillSlice) {
                                   imageUrl = centerFillSlice.url;
                                 }
                               }
                                 const isSelected = selectedAsset?.node.id === node.id;
                                 return (
                                  <button
                                    key={node.id}
                                    onClick={() => setSelectedAsset({task, node, importType, imageUrl: imageUrl || '', isAlreadyImported: false})}
                                    disabled={isLoading}
                                    className={`aspect-square rounded-sm border hover:border-${themeColor}-500/40 bg-black/40 overflow-hidden group relative flex items-center justify-center transition-all ${
                                      isSelected ? `border-${themeColor}-500 ring-2 ring-${themeColor}-500/50 scale-95` : 'border-transparent'
                                    }`}
                                    title={importType === 'ground' ? "Hex Slicer Node" : "Image Node"}
                                  >
                                    {imageUrl ? (
                                      <img src={imageUrl} alt="preview" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-gray-500 gap-1 bg-black/50">
                                        <Folder className="w-4 h-4" />
                                        Slicer
                                      </div>
                                    )}
                                    <div className={`absolute inset-0 bg-${themeColor}-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center`}>
                                      <Check className={`w-6 h-6 text-${themeColor}-400 drop-shadow-md`} />
                                    </div>
                                  </button>
                                 )
                            })}
                          </div>
                          )}
                        </div>
                      );
                    } else {
                      const objectNodes = task.nodes.flatMap(n => {
                        if (n.data?.outputImages && Object.keys(n.data.images).length > 0) {
                          return Object.entries(n.data.images).map(([pinId, url]) => {
                            const pinInfo = n.data.outputPins?.find((p: any) => p.id === pinId);
                            const label = pinInfo ? pinInfo.label : pinId;
                            return {
                              ...n,
                              id: `${n.id}-${pinId}`,
                              data: {
                                ...n.data,
                                image: url,
                                localPrompt: label
                              }
                            };
                          });
                        }
                        return [n];
                      }).filter(n => n.data && (n.data.image));
                      
                      if (objectNodes.length === 0) return null;
                      
                      return (
                        <div key={task.id} className="bg-black/20 rounded-sm border border-gray-800">
                          <div 
                            className="text-xs text-gray-400 px-3 py-2 cursor-pointer hover:bg-black/40 hover:text-indigo-300 flex items-center gap-2 select-none"
                            onClick={() => setExpandedTasks(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                          >
                            <ChevronDown className={`w-3 h-3 transition-transform ${expandedTasks[task.id] ? '' : '-rotate-90'}`} />
                            {task.name}
                          </div>
                          {expandedTasks[task.id] && (
                          <div className="grid gap-2 p-2 pt-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
                            {objectNodes.map(node => {
                              const imageUrl = node.data.image;
                              const isAlreadyImported = objectAssets.some(a => a.nodeId === node.id);
                              const isSelected = selectedAsset?.node.id === node.id;
                              return (
                                <button
                                  key={node.id}
                                  onClick={() => setSelectedAsset({task, node, importType: 'object', imageUrl: imageUrl || '', isAlreadyImported})}
                                  disabled={isLoading || !imageUrl}
                                  className={`aspect-square relative rounded-sm border transition-all flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${
                                    isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50 scale-95' :
                                    isAlreadyImported 
                                      ? 'bg-emerald-900/30 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                      : 'bg-black/40 border-transparent hover:border-indigo-500/60 hover:bg-indigo-900/40'
                                  }`}
                                >
                                  {imageUrl ? (
                                    <img alt="image" src={imageUrl} className="w-full h-full object-contain p-1" />
                                  ) : (
                                    <span className="text-[8px] text-gray-600">No Img</span>
                                  )}
                                  
                                  {isAlreadyImported && (
                                    <div className="absolute top-1 right-1 bg-emerald-500 text-black rounded-full p-0.5">
                                      <Check className="w-2.5 h-2.5" />
                                    </div>
                                  )}

                                  <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Plus className="w-4 h-4 text-white" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          )}
                        </div>
                      );
                    }
                  })}
                </div>
                );
              })}
            </div>
            
            {/* Preview Pane */}
            <div className="w-72 bg-black/40 border-l border-[var(--color-blender-border)] flex flex-col shrink-0 overflow-y-auto">
              {selectedAsset ? (
                <div className="p-4 flex flex-col h-full">
                  <h4 className="text-sm font-bold text-gray-300 mb-4 pb-2 border-b border-gray-700">Preview</h4>
                  
                  <div className="aspect-square w-full rounded-md border border-gray-700 bg-black/50 overflow-hidden mb-4 relative flex items-center justify-center p-2">
                    {selectedAsset.imageUrl ? (
                      <img src={selectedAsset.imageUrl} className="w-full h-full object-contain" alt="Selected Preview" />
                    ) : (
                      <div className="text-gray-500 text-xs">No Preview</div>
                    )}
                  </div>
                  
                  <div className="space-y-3 flex-1">
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Asset Name</div>
                      <div className="text-sm text-gray-200 truncate" title={selectedAsset.node.data?.localPrompt || selectedAsset.node.id}>
                        {selectedAsset.node.data?.localPrompt || selectedAsset.node.id}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Source Task</div>
                      <div className="text-sm text-gray-300 truncate" title={selectedAsset.task.name}>{selectedAsset.task.name}</div>
                    </div>
                    {selectedAsset.isAlreadyImported && (
                      <div className="bg-emerald-900/30 border border-emerald-500/50 rounded p-2 text-xs text-emerald-300 mt-2 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Already Imported
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => {
                      if (selectedAsset.importType === 'ground' || selectedAsset.importType === 'ocean') {
                        handleImportGroundOrOcean(selectedAsset.task, selectedAsset.importType, selectedAsset.node.id);
                      } else {
                        handleImportObjectOrDecal(selectedAsset.task, selectedAsset.node);
                      }
                    }}
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-sm transition-colors flex justify-center items-center gap-2 mt-4 disabled:opacity-50"
                  >
                    {isLoading ? <span className="animate-pulse">Importing...</span> : <><Download className="w-4 h-4" /> Confirm Import</>}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center opacity-50">
                  <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-400">Select an asset from the gallery to preview it here.</p>
                </div>
              )}
            </div>
            
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

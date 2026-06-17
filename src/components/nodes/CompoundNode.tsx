import { useState } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Play, Layers, RefreshCw, AlertCircle, Grid, X } from "lucide-react";
import { NodeExecutionInput, NodeExecutionContext } from "@/lib/node-executor";

export default function CompoundNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [isGridOpen, setIsGridOpen] = useState(false);
  
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const handleRunPipeline = async () => {
    setIsExecuting(true);
    setError(null);
    setStatus("Running...");

    const internalNodes = data.internalNodes || [];
    const internalEdges = data.internalEdges || [];
    const apiKey = localStorage.getItem("artist-assistant-image-api") || undefined;
    const context: NodeExecutionContext = { apiKey };

    const nodeOutputs: Record<string, any> = {};

    // Map external inputs directly to the internal GraphInputNodes
    const externalEdges = getEdges().filter(e => e.target === id);
    const externalNodes = getNodes();

    externalEdges.forEach(e => {
      const sourceNode = externalNodes.find(n => n.id === e.source);
      if (sourceNode && e.targetHandle) { // targetHandle is the graphInput ID!
        // We directly seed the nodeOutputs for the GraphInputNode
        // GraphInputNode just passes data through, so its 'output' is the external data
        if (!nodeOutputs[e.targetHandle]) {
          nodeOutputs[e.targetHandle] = { outputText: "", outputImage: "" };
        }
        
        if (sourceNode.data.outputImage) {
           nodeOutputs[e.targetHandle].outputImage = sourceNode.data.outputImage;
        } else if (sourceNode.data.outputText) {
           nodeOutputs[e.targetHandle].outputText = sourceNode.data.outputText;
        }
      }
    });

    try {
      const inDegree: Record<string, number> = {};
      const adj: Record<string, string[]> = {};
      
      internalNodes.forEach((n: any) => {
        inDegree[n.id] = 0;
        adj[n.id] = [];
      });

      internalEdges.forEach((e: any) => {
        if (inDegree[e.target] !== undefined) {
          inDegree[e.target]++;
        }
        if (adj[e.source]) {
          adj[e.source].push(e.target);
        }
      });

      const queue: any[] = [];
      internalNodes.forEach((n: any) => {
        if (inDegree[n.id] === 0) queue.push(n);
      });

      let executedCount = 0;

      while (queue.length > 0) {
        const currentNode = queue.shift();
        setStatus(`Executing ${currentNode.type}...`);

        const textInputs: string[] = [];
        const imageInputs: string[] = [];

        const incomingEdges = internalEdges.filter((e: any) => e.target === currentNode.id);
        incomingEdges.forEach((e: any) => {
          const sourceOutput = nodeOutputs[e.source];
          if (sourceOutput) {
            if (e.targetHandle?.includes('text') && sourceOutput.outputText) {
              textInputs.push(sourceOutput.outputText);
            } else if ((e.targetHandle?.includes('image') || e.targetHandle?.includes('img')) && sourceOutput.outputImage) {
              imageInputs.push(sourceOutput.outputImage);
            }
          }
        });

        if (currentNode.type === 'graphInput') {
          // It was already seeded with external data. Just mark as executed.
          executedCount++;
        } else {
          const inputs: NodeExecutionInput = { textInputs, imageInputs };
          
          const { executeNode } = await import("@/lib/node-executor");
          const result = await executeNode(currentNode.type, currentNode.data, inputs, context);

          if (!result.success) {
            throw new Error(`Node ${currentNode.type} failed: ${result.error}`);
          }

          nodeOutputs[currentNode.id] = result.data;
          executedCount++;
        }

        adj[currentNode.id].forEach(neighborId => {
          inDegree[neighborId]--;
          if (inDegree[neighborId] === 0) {
            const neighborNode = internalNodes.find((n: any) => n.id === neighborId);
            if (neighborNode) queue.push(neighborNode);
          }
        });
      }

      setStatus(`Completed (${executedCount} nodes)`);
      
      const outputNodes = internalNodes.filter((n: any) => n.type === 'graphOutput');
      const finalImages: Record<string, string> = {};
      
      outputNodes.forEach((n: any) => {
         const out = nodeOutputs[n.id];
         if (out && out.outputImage) {
           finalImages[n.id] = out.outputImage;
         }
      });
      
      const lastOutput = Object.values(nodeOutputs).reverse().find(o => o.outputImage);
      
      setNodes(nds => nds.map(n => n.id === id ? {
        ...n,
        data: { 
           ...n.data, 
           outputImage: Object.values(finalImages)[0] || (lastOutput ? lastOutput.outputImage : undefined),
           outputImages: Object.keys(finalImages).length > 0 ? finalImages : undefined
        }
      } : n));

    } catch (err: any) {
      setError(err.message || "Pipeline execution failed");
      setStatus("Failed");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all duration-200 relative ${
      selected 
        ? "outline outline-5 outline-[#fbbf24] shadow-[0_0_25px_rgba(251,191,36,0.6)] border-transparent" 
        : "border-2 border-purple-500/50"
    }`}>
      <div className="bg-purple-900/40 px-4 py-3 flex items-center justify-between border-b border-purple-500/30 rounded-t-lg">
        <div className="flex items-center gap-2">
          <input 
            type="text"
            className="nodrag font-bold text-xs text-purple-100 uppercase tracking-wider bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-1 -ml-1 w-full"
            value={data.label || "Compound Node"}
            onChange={(e) => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label: e.target.value } } : n))}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        </div>
        {isExecuting && <RefreshCw className="w-4 h-4 text-purple-400 animate-spin shrink-0" />}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-purple-200/70">
            Internal Nodes: {data.internalNodes?.length || 0}
          </div>
          <div className="text-[10px] text-purple-400/50 italic">
            Double-click to open
          </div>
        </div>

        <button 
          onClick={handleRunPipeline}
          disabled={isExecuting}
          className="nodrag w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              {status}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              RUN PIPELINE
            </>
          )}
        </button>

        {error && (
          <div className="bg-red-900/80 p-2 rounded flex items-start gap-2 border border-red-500/50 mt-2">
            <AlertCircle className="w-4 h-4 text-red-200 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-100">{error}</span>
          </div>
        )}

        {/* Display final output image if available */}
        {data.outputImage && (
          <div className="w-full aspect-square bg-black/50 border border-purple-500/20 rounded overflow-hidden mt-2 relative group">
            <img src={data.outputImage} className="w-full h-full object-contain" alt="Pipeline Output" />
            
            {data.outputImages && Object.keys(data.outputImages).length > 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsGridOpen(true); }}
                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-lg border border-white/10 nodrag"
              >
                <Grid className="w-4 h-4" />
                <span className="text-[10px] font-bold pr-1">View All ({Object.keys(data.outputImages).length})</span>
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1 pt-2 border-t border-purple-500/20">
          {data.inputPins?.map((pin: any) => {
             const pinId = typeof pin === 'string' ? pin : pin.id;
             const pinType = typeof pin === 'string' ? (pin.includes('image') ? 'image' : 'text') : pin.type;
             const pinLabel = typeof pin === 'string' ? pin : pin.label;
             return (
               <div key={pinId} className="relative flex items-center h-6">
                 <Handle
                   type="target"
                   id={pinId}
                   position={Position.Left}
                   className={`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !left-[-24px] ${pinType === 'image' ? '!bg-[#22c55e]' : '!bg-[#3b82f6]'}`}
                 />
                 <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{pinLabel}</span>
               </div>
             );
          })}
        </div>

        <div className="flex flex-col gap-1 pt-2 border-t border-purple-500/20">
          {data.outputPins?.map((pin: any) => {
             const pinId = typeof pin === 'string' ? pin : pin.id;
             const pinType = typeof pin === 'string' ? (pin.includes('image') ? 'image' : 'text') : pin.type;
             const pinLabel = typeof pin === 'string' ? pin : pin.label;
             return (
               <div key={pinId} className="relative flex items-center justify-end h-6">
                 <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{pinLabel}</span>
                 <Handle
                   type="source"
                   id={pinId}
                   position={Position.Right}
                   className={`!w-4 !h-4 !border-none !min-w-0 !min-h-0 !right-[-24px] ${pinType === 'image' ? '!bg-[#22c55e]' : '!bg-[#3b82f6]'}`}
                 />
               </div>
             );
          })}
        </div>
      </div>

      {/* Floating Grid Pop-out */}
      {isGridOpen && data.outputImages && (
        <div 
           className="absolute top-0 right-[-340px] w-80 bg-[#1a1525] border-2 border-purple-500/50 rounded-lg shadow-[0_0_25px_rgba(168,85,247,0.3)] z-50 p-3 nodrag cursor-default"
           onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-3 border-b border-purple-500/30 pb-2">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-purple-100 uppercase tracking-wider">All Outputs</span>
            </div>
            <button onClick={() => setIsGridOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {Object.entries(data.outputImages).map(([pinId, imageUrl]) => {
              const pinInfo = data.outputPins?.find((p: any) => p.id === pinId);
              const label = pinInfo ? pinInfo.label : "Output";
              
              return (
                <div key={pinId} className="flex flex-col gap-1.5">
                  <div className="aspect-square bg-black/60 rounded border border-gray-700/50 overflow-hidden">
                    <img src={imageUrl as string} className="w-full h-full object-cover hover:scale-110 transition-transform duration-300" alt={label} />
                  </div>
                  <span className="text-[9px] text-center text-gray-400 uppercase tracking-wider truncate px-1">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

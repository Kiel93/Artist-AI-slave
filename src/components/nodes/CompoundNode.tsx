import { useState, useRef, useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Play, Layers, RefreshCw, AlertCircle, Grid, X, Download, Copy } from "lucide-react";
import { NodeExecutionInput, NodeExecutionContext } from "@/lib/node-executor";

export default function CompoundNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [isGridOpen, setIsGridOpen] = useState(false);
  
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const runPipelineRef = useRef<(isLiveUpdate: boolean) => void>(() => {});
  const executionCacheRef = useRef<Record<string, { hash: string, output: any }>>({});

  useEffect(() => {
    runPipelineRef.current = handleRunPipeline;
  });

  const handleSliderChange = (pinId: string, internalNodeId: string, newValue: number, targetHandleId?: string) => {
    setNodes(nds => nds.map(n => n.id === id ? {
      ...n,
      data: {
        ...n.data,
        internalNodes: n.data.internalNodes.map((inNode: any) => 
          inNode.id === internalNodeId ? { ...inNode, data: { ...inNode.data, [targetHandleId || 'value']: newValue } } : inNode
        )
      }
    } : n));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runPipelineRef.current(true);
    }, 300);
  };

  const downloadImage = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRunPipeline = async (isLiveUpdate: boolean = false) => {
    setIsExecuting(true);
    setError(null);
    setStatus("Running...");

    const PURE_NODES = ['shadowExtractor', 'tileCutter', 'isometricHexSlicer', 'styleInsert', 'imageEditor'];

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
          nodeOutputs[e.targetHandle] = { text: "", image: "", value: undefined };
        }
        
        const image = sourceNode.data.image || sourceNode.data.outputImage || "";
        const text = sourceNode.data.text|| "";
        const value = sourceNode.data.value;

        if (image) {
           nodeOutputs[e.targetHandle].image = image;
        }
        if (text) {
           nodeOutputs[e.targetHandle].text = text;
        }
        if (value !== undefined) {
           nodeOutputs[e.targetHandle].value = value;
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
        const namedInputs: Record<string, any> = {};

        const incomingEdges = internalEdges.filter((e: any) => e.target === currentNode.id);
        incomingEdges.forEach((e: any) => {
          const sourceOutput = nodeOutputs[e.source];
          if (sourceOutput) {
            let specificImage = sourceOutput.image;
            if (sourceOutput.images && e.sourceHandle && sourceOutput.images[e.sourceHandle]) {
              specificImage = sourceOutput.images[e.sourceHandle];
            }

            if (e.targetHandle?.includes('text') && sourceOutput.text) {
              textInputs.push(sourceOutput.text);
            } else if ((e.targetHandle?.includes('image') || e.targetHandle?.includes('img')) && specificImage) {
              imageInputs.push(specificImage);
            }
            if (e.targetHandle) {
              namedInputs[e.targetHandle] = { ...sourceOutput, image: specificImage || sourceOutput.image };
            }
          }
        });

        if (currentNode.type === 'graphInput') {
          // It was already seeded with external data. Just mark as executed.
          executedCount++;
        } else {
          const inputs: NodeExecutionInput = { textInputs, imageInputs, namedInputs };
          
          const nodeHash = JSON.stringify({ data: currentNode.data, inputs });
          const cached = executionCacheRef.current[currentNode.id];

          if (cached && cached.hash === nodeHash) {
             nodeOutputs[currentNode.id] = cached.output;
             executedCount++;
          } else if (isLiveUpdate && !PURE_NODES.includes(currentNode.type)) {
             // Abort expensive/API node execution during live slider updates!
             // Use stale cached output if available so downstream pure nodes don't break.
             if (cached) {
                nodeOutputs[currentNode.id] = cached.output;
             } else if (currentNode.data.image || currentNode.data.images || currentNode.data.text) {
                nodeOutputs[currentNode.id] = currentNode.data;
                executionCacheRef.current[currentNode.id] = { hash: nodeHash, output: currentNode.data };
             } else {
                throw new Error(`Please click 'Run Pipeline' first to generate ${currentNode.type} assets.`);
             }
             executedCount++;
          } else {
             const { executeNode } = await import("@/lib/node-executor");
             const result = await executeNode(currentNode.type, currentNode.data, inputs, context);

             if (!result.success) {
               throw new Error(`Node ${currentNode.type} failed: ${result.error}`);
             }

             nodeOutputs[currentNode.id] = result.data;
             executionCacheRef.current[currentNode.id] = { hash: nodeHash, output: result.data };
             executedCount++;
          }
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
      const finalTexts: Record<string, string> = {};
      
      outputNodes.forEach((n: any) => {
         const out = nodeOutputs[n.id];
         if (out && out.image) {
           finalImages[n.id] = out.image;
         }
         if (out && out.text) {
           finalTexts[n.id] = out.text;
         }
      });
      
      const lastOutput = Object.values(nodeOutputs).reverse().find(o => o.image);
      const lastTextOutput = Object.values(nodeOutputs).reverse().find(o => o.text);
      
      setNodes(nds => nds.map(n => n.id === id ? {
        ...n,
        data: {
          ...n.data,
          internalNodes: n.data.internalNodes.map((inNode: any) => {
             if (nodeOutputs[inNode.id]) {
                return { ...inNode, data: { ...inNode.data, ...nodeOutputs[inNode.id] } };
             }
             return inNode;
          }),
          image: Object.values(finalImages)[0] || (lastOutput ? lastOutput.image : undefined),
          images: Object.keys(finalImages).length > 0 ? finalImages : undefined,
          text: Object.values(finalTexts)[0] || (lastTextOutput ? lastTextOutput.text : undefined),
          texts: Object.keys(finalTexts).length > 0 ? finalTexts : undefined,
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
        {/* Top Panel: Inputs */}
        {data.inputPins && data.inputPins.length > 0 && (
          <div className="flex flex-col gap-1 pb-1">
            {data.inputPins.map((pin: any) => {
               const pinId = typeof pin === 'string' ? pin : pin.id;
               const pinType = typeof pin === 'string' ? (pin.includes('image') ? 'image' : 'text') : pin.type;
               const pinLabel = typeof pin === 'string' ? pin : pin.label;

               let sliderProps = null;
               if (pinType === 'value') {
                 const outgoingEdges = data.internalEdges?.filter((e: any) => e.source === pinId);
                 if (outgoingEdges) {
                    for (const edge of outgoingEdges) {
                       const targetNode = data.internalNodes?.find((n: any) => n.id === edge.target);
                       if (targetNode) {
                          if (targetNode.type === 'value' && targetNode.data?.mode === 'slider') {
                             sliderProps = { internalNodeId: targetNode.id, value: targetNode.data.value !== undefined ? targetNode.data.value : 0 };
                             break;
                          }
                          if (targetNode.data?.limits && targetNode.data.limits[edge.targetHandle]) {
                             const limits = targetNode.data.limits[edge.targetHandle];
                             const currentVal = targetNode.data[edge.targetHandle] !== undefined ? targetNode.data[edge.targetHandle] : (limits.min || 0);
                             sliderProps = { 
                                internalNodeId: targetNode.id, 
                                handleId: edge.targetHandle,
                                value: currentVal,
                                min: limits.min,
                                max: limits.max,
                                step: limits.step || 1
                             };
                             break;
                          }
                       }
                    }
                 }
               }

               return (
                 <div key={pinId} className="relative flex flex-col justify-center min-h-[24px]">
                   <div className="flex items-center h-6">
                     <Handle
                       type="target"
                       id={pinId}
                       position={Position.Left}
                       className={`!min-w-0 !min-h-0 rounded-full !left-[-24px]`} style={{ width: '16px', height: '16px', backgroundColor: pinType === 'image' ? '#22c55e' : pinType === 'value' ? '#f43f5e' : '#3b82f6', borderColor: pinType === 'image' ? '#14532d' : pinType === 'value' ? '#9f1239' : '#1e3a8a', borderWidth: '2px' }}
                     />
                     <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold ml-2">{pinLabel}</span>
                   </div>
                   {sliderProps && (
                     <div className="pl-2 pr-2 pb-1 w-full mt-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] text-rose-300/70 font-bold uppercase tracking-wider">Value: {Math.round(sliderProps.value)}</span>
                        </div>
                        <input
                          type="range"
                          min={sliderProps.min ?? "0"}
                          max={sliderProps.max ?? "100"}
                          step={sliderProps.step ?? "1"}
                          value={sliderProps.value}
                          onChange={(e) => handleSliderChange(pinId, sliderProps.internalNodeId, parseFloat(e.target.value), sliderProps.handleId)}
                          className="nodrag w-full h-1.5 bg-rose-900/50 rounded-lg appearance-none cursor-pointer border border-rose-500/30"
                          style={{ accentColor: '#f43f5e' }}
                        />
                     </div>
                   )}
                 </div>
               );
            })}
          </div>
        )}

        <div className="text-xs text-purple-200/70 mb-2">
          Internal Nodes: {data.internalNodes?.length || 0}
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('open-workspace', { detail: { id } }));
          }}
          className="w-full py-1.5 mb-2 bg-transparent border border-purple-500/30 text-purple-300 text-xs font-bold uppercase tracking-widest rounded hover:bg-purple-500/10 transition-colors nodrag"
        >
          Open Editor
        </button>

        <button 
          onClick={() => handleRunPipeline(false)}
          disabled={isExecuting}
          className="nodrag w-full py-2.5 bg-purple-600 hover:bg-purple-500 border-b-4 border-purple-800 active:border-b-0 active:translate-y-1 text-white text-sm font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0 disabled:border-b-4 transition-all"
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
        {data.image && (
          <div className="w-full bg-black/50 border border-purple-500/20 rounded overflow-hidden mt-2 relative group">
            <img src={data.image} className="w-full h-full object-contain" alt="Pipeline Output" />
            
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm z-10 pointer-events-none">
                <button 
                  onClick={(e) => { e.stopPropagation(); downloadImage(data.image, "output.png"); }} 
                  className="p-4 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-2xl transform hover:scale-110 transition-all pointer-events-auto"
                >
                  <Download className="w-6 h-6" />
                </button>
            </div>

            {data.images && Object.keys(data.images).length > 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsGridOpen(true); }}
                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-lg border border-white/10 nodrag z-20 pointer-events-auto"
              >
                <Grid className="w-4 h-4" />
                <span className="text-[10px] font-bold pr-1">View All ({Object.keys(data.images).length})</span>
              </button>
            )}
          </div>
        )}

        {/* Display final output text if available but no image */}
        {data.text && !data.image && (
          <div className="w-full h-24 bg-black/50 border border-purple-500/20 rounded mt-2 p-2 relative group overflow-hidden">
            <div className="w-full h-full text-[10px] text-purple-200/80 overflow-hidden whitespace-pre-wrap">
               {data.text}
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm z-10 pointer-events-none">
                <button 
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(data.text); }} 
                  className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl transform hover:scale-110 transition-all pointer-events-auto"
                >
                  <Copy className="w-5 h-5" />
                </button>
            </div>
          </div>
        )}

        <div className="flex flex-col pt-2 mt-2 border-t border-purple-500/20">
          {data.outputPins?.map((pin: any) => {
             const pinId = typeof pin === 'string' ? pin : pin.id;
             const pinType = typeof pin === 'string' ? (pin.includes('image') ? 'image' : 'text') : pin.type;
             const pinLabel = typeof pin === 'string' ? pin : pin.label;
             const hasImage = data.images && data.images[pinId];
             const hasText = data.texts && data.texts[pinId];
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
      {isGridOpen && data.images && (
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
            {Object.entries(data.images).map(([pinId, imageUrl]) => {
              const pinInfo = data.outputPins?.find((p: any) => p.id === pinId);
              const label = pinInfo ? pinInfo.label : "Output";
              
              return (
                <div key={pinId} className="flex flex-col gap-1.5 relative group/img">
                  <div className="bg-black/60 rounded border border-gray-700/50 overflow-hidden relative">
                    <img src={imageUrl as string} className="w-full h-full object-cover hover:scale-110 transition-transform duration-300" alt={label} />
                    
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm z-10 pointer-events-none">
                      <button onClick={(e) => { e.stopPropagation(); downloadImage(imageUrl as string, `${label}.png`); }} className="p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-2xl transform hover:scale-110 transition-all pointer-events-auto">
                        <Download className="w-5 h-5" />
                      </button>
                    </div>

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

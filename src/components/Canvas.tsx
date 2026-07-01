"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  Node,
  Panel,
  SelectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { Trash2, Save, Download } from "lucide-react";
import { getTask, saveTaskFlow } from "@/lib/store";
import { get, set } from "idb-keyval";

import PromptNode from "./nodes/PromptNode";
import PromptConnectorNode from "./nodes/PromptConnectorNode";
import StyleInsertNode from "./nodes/StyleInsertNode";
import ReferenceImageNode from "./nodes/ReferenceImageNode";
import GeneralImageGenerationNode from "./nodes/GeneralImageGenerationNode";
import GeminiRefinerNode from "./nodes/GeminiRefinerNode";
import SketchToImageNode from "./nodes/SketchToImageNode";
import IsometricDrawNode from "./nodes/IsometricDrawNode";
import ImageExplainedNode from "./nodes/ImageExplainedNode";
import TilesetGeneratorNode from "./nodes/TilesetGeneratorNode";
import IsometricHexSlicerNode from "./nodes/IsometricHexSlicerNode";
import BackgroundRemoverNode from "./nodes/BackgroundRemoverNode";
import AssetGeneratorNode from "./nodes/AssetGeneratorNode";
import TileCutterNode from "./nodes/TileCutterNode";
import ShadowExtractorNode from "./nodes/ShadowExtractorNode";
import ImageEditorNode from "./nodes/ImageEditorNode";

import CompoundNode from "./nodes/CompoundNode";
import GraphInputNode from "./nodes/GraphInputNode";
import GraphOutputNode from "./nodes/GraphOutputNode";
import ValueNode from "./nodes/ValueNode";

import ImageEditorWorkspace from "./canvas/ImageEditorWorkspace";

const nodeTypes = {
  prompt: PromptNode,
  promptConnector: PromptConnectorNode,
  styleInsert: StyleInsertNode,
  referenceImage: ReferenceImageNode,
  geminiRefiner: GeminiRefinerNode,
  generalImageGeneration: GeneralImageGenerationNode,
  sketchToImage: SketchToImageNode,
  isometricDraw: IsometricDrawNode,
  imageExplained: ImageExplainedNode,
  tilesetGenerator: TilesetGeneratorNode,
  isometricHexSlicer: IsometricHexSlicerNode,
  backgroundRemover: BackgroundRemoverNode,
  assetGenerator: AssetGeneratorNode,
  tileCutter: TileCutterNode,
  shadowExtractor: ShadowExtractorNode,
  imageEditor: ImageEditorNode,
  compound: CompoundNode,
  graphInput: GraphInputNode,
  graphOutput: GraphOutputNode,
  value: ValueNode,
};

const getId = () => `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const stripExecutionData = (data: any) => {
  if (!data) return data;
  const cleanData = JSON.parse(JSON.stringify(data));
  delete cleanData.outputImage;
  delete cleanData.outputImages;
  delete cleanData.outputText;
  delete cleanData.outputData;
  delete cleanData.error;
  
  if (cleanData.internalNodes && Array.isArray(cleanData.internalNodes)) {
    cleanData.internalNodes = cleanData.internalNodes.map((n: any) => ({
      ...n,
      data: stripExecutionData(n.data)
    }));
  }
  return cleanData;
};

interface CanvasProps {
  taskId: string;
  isActive?: boolean;
}

const initialNodes: Node[] = [
  {
    id: "compound-1",
    type: "compound",
    position: { x: 300, y: 100 },
    data: {
      label: "My Auto Pipeline",
      internalNodes: [
        { id: "p1", type: "prompt", position: { x: 100, y: 100 }, data: { text: "A futuristic cyberpunk city" } },
        { id: "r1", type: "geminiRefiner", position: { x: 400, y: 100 }, data: { model: "gemini-2.5-flash" } },
        { id: "g1", type: "generalImageGeneration", position: { x: 700, y: 100 }, data: { model: "nano-banana-pro" } }
      ],
      internalEdges: [
        { source: "p1", target: "r1", targetHandle: "text" },
        { source: "r1", target: "g1", targetHandle: "text" }
      ],
      inputPins: [],
      outputPins: ["image-out"]
    }
  },
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 100, y: 100 },
    data: { text: "A futuristic city with neon lights" },
  },
  {
    id: "generalImageGen-1",
    type: "generalImageGeneration",
    position: { x: 800, y: 200 },
    data: {},
  },
];

const initialEdges: Edge[] = [
  {
    id: "e-gemini-gen",
    source: "gemini-1",
    target: "generalImageGen-1",
    animated: false,
    style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: '5 5' },
  },
];

export default function Canvas({ taskId, isActive = true }: CanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [graphPath, setGraphPath] = useState<{ id: string; name: string; type?: string }[]>([]);
  const [activeImageEditor, setActiveImageEditor] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [taskName, setTaskName] = useState("");
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);

  // Sub-graph State
  const rootNodesRef = useRef<Node[]>(initialNodes);
  const rootEdgesRef = useRef<Edge[]>(initialEdges);

  // Undo/Redo State
  const [past, setPast] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const copiedNodesRef = useRef<Node[]>([]);
  const copiedEdgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);


  const saveHistory = useCallback(() => {
    setPast(p => [...p, { nodes: nodesRef.current, edges: edgesRef.current }]);
    setFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p;
      const newPast = [...p];
      const previousState = newPast.pop()!;
      setFuture(f => [{ nodes: nodesRef.current, edges: edgesRef.current }, ...f]);
      setNodes(previousState.nodes);
      setEdges(previousState.edges);
      return newPast;
    });
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const newFuture = [...f];
      const nextState = newFuture.shift()!;
      setPast(p => [...p, { nodes: nodesRef.current, edges: edgesRef.current }]);
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      return newFuture;
    });
  }, [setNodes, setEdges]);

  const handleGroupNodes = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected);
    
    if (selectedNodes.length < 2) return;

    saveHistory();

    const selectedIds = new Set(selectedNodes.map(n => n.id));

    // Internal edges are edges where both source and target are selected
    const internalEdges = currentEdges.filter(e => 
      selectedIds.has(e.source) && selectedIds.has(e.target)
    );

    // Pin detection: find edges crossing the boundary inwards
    const inputPins = new Set<string>();
    currentEdges.forEach(e => {
      if (!selectedIds.has(e.source) && selectedIds.has(e.target)) {
        // e.target is inside, e.source is outside. 
        // e.targetHandle tells us what type of input the node is expecting.
        if (e.targetHandle) {
           inputPins.add(e.targetHandle);
        }
      }
    });

    // Fallback default pins if nothing connected
    if (inputPins.size === 0) {
      inputPins.add('text');
      inputPins.add('image');
    }

    // Determine position: average X and Y of selected nodes
    const avgX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length;
    const avgY = selectedNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedNodes.length;

    const compoundNodeId = `compound-${getId()}`;
    const newCompoundNode: Node = {
      id: compoundNodeId,
      type: 'compound',
      position: { x: avgX, y: avgY },
      selected: true,
      data: {
        label: "Compound Node",
        internalNodes: JSON.parse(JSON.stringify(selectedNodes.map(n => ({ ...n, selected: false })))),
        internalEdges: JSON.parse(JSON.stringify(internalEdges)),
        inputPins: Array.from(inputPins),
        outputPins: ["image-out"] // Default output for now
      }
    };

    // Remove selected nodes and internal edges from canvas
    const newNodes: Node[] = currentNodes.filter(n => !selectedIds.has(n.id)).map(n => ({...n, selected: false}));
    newNodes.push(newCompoundNode);

    // Remove any edge that touches a selected node (since we can't easily auto-rewire yet)
    // Actually, any edge that has source OR target in selectedIds must be removed.
    const newEdges = currentEdges.filter(e => 
      !selectedIds.has(e.source) && !selectedIds.has(e.target)
    );

    setNodes(newNodes);
    setEdges(newEdges);
  }, [saveHistory, setNodes, setEdges]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must target canvas area or document body to prevent overriding input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isActive === false) return;

      if (e.ctrlKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        handleGroupNodes();
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleRedo();
      } else if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        const selectedNodes = nodesRef.current.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          copiedNodesRef.current = selectedNodes;
          const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
          copiedEdgesRef.current = edgesRef.current.filter(edge =>
            selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
          );
          navigator.clipboard.writeText('APP_NODES_COPIED').catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, setNodes, setEdges, saveHistory, isActive]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Must target canvas area or document body to prevent overriding input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isActive === false) return;

      if (!e.clipboardData) return;
      
      const items = e.clipboardData.items;
      let hasImage = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          hasImage = true;
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const url = event.target?.result as string;
              
              let position = { x: 100, y: 100 };
              if (reactFlowInstance) {
                 if (typeof reactFlowInstance.screenToFlowPosition === 'function') {
                    position = reactFlowInstance.screenToFlowPosition({ 
                      x: window.innerWidth / 2, 
                      y: window.innerHeight / 2 
                    });
                 } else if (typeof reactFlowInstance.project === 'function') {
                    position = reactFlowInstance.project({ 
                      x: window.innerWidth / 2, 
                      y: window.innerHeight / 2 
                    });
                 }
              }

              const newNode = {
                id: getId(),
                type: 'referenceImage',
                position: {
                   x: position.x - 128, // approx half of node width (w-64 is 256px)
                   y: position.y - 128
                },
                data: { image: url }
              };
              
              saveHistory();
              setNodes((nds) => [...nds.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            break;
          }
        }
      }

      const textData = e.clipboardData.getData('text');
      if (!hasImage && textData === 'APP_NODES_COPIED' && copiedNodesRef.current && copiedNodesRef.current.length > 0) {
        saveHistory();
        const idMapping = new Map<string, string>();
        const newNodes = copiedNodesRef.current.map(n => {
          const newId = getId();
          idMapping.set(n.id, newId);
          const newData = JSON.parse(JSON.stringify(n.data));
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 50, y: n.position.y + 50 },
            selected: true,
            data: newData,
          };
        });

        let finalizedNewNodes = newNodes.map(n => {
          if (n.parentId) {
            if (idMapping.has(n.parentId)) {
              return { ...n, parentId: idMapping.get(n.parentId) };
            } else {
              const { parentId, ...rest } = n;
              return rest;
            }
          }
          return n;
        });

        const newEdges = copiedEdgesRef.current.map(edge => ({
          ...edge,
          id: `e-${getId()}`,
          source: idMapping.get(edge.source) || edge.source,
          target: idMapping.get(edge.target) || edge.target,
          selected: true,
        }));

        setNodes((nds) => {
          const unselected = nds.map(node => ({ ...node, selected: false }));
          return [...unselected, ...finalizedNewNodes];
        });
        setEdges((eds) => {
          const unselected = eds.map(edge => ({ ...edge, selected: false }));
          return [...unselected, ...newEdges];
        });
        e.preventDefault();
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isActive, setNodes, setEdges, saveHistory, reactFlowInstance]);

  useEffect(() => {
    getTask(taskId).then(task => {
      if (task) {
        setTaskName(task.name);
        if (task.nodes && task.nodes.length > 0) {
          // Migration: Rename 'idea' to 'prompt', 'plenxAiOutput' to 'generalImageGeneration'
          let migratedNodes = task.nodes.map(n => {
            if (n.type === 'idea') return { ...n, type: 'prompt' };
            if (n.type === 'plenxAiOutput') return { ...n, type: 'generalImageGeneration' };
            return n;
          });

          // Cleanup: Remove parentId if parent node doesn't exist
          const validNodeIds = new Set(migratedNodes.map(n => n.id));
          migratedNodes = migratedNodes.map(n => {
            if (n.parentId && !validNodeIds.has(n.parentId)) {
              const { parentId, ...rest } = n;
              return rest;
            }
            return n;
          });

          rootNodesRef.current = migratedNodes;
          rootEdgesRef.current = task.edges || [];

          // Only set canvas state if we are at the root level
          setGraphPath(prev => {
            if (prev.length === 0) {
              setNodes(migratedNodes);
              setEdges(task.edges || []);
            }
            return prev;
          });
        }
      }
    }).catch(console.error);
  }, [taskId, setNodes, setEdges]);

  // Clean up unused dynamic handles for specific nodes
  useEffect(() => {
    if (!edges || edges.length === 0 && nodes.length === 0) return;
    
    setNodes(nds => {
      let changed = false;
      const newNodes = nds.map(n => {
        if (n.type === 'imageEditor' && n.data.imageInputs) {
          const connectedHandles = new Set(edges.filter(e => e.target === n.id).map(e => e.targetHandle));
          const newInputs = n.data.imageInputs.filter((handleId: string) => {
            if (handleId === 'image-0') return true; // Keep default handle
            return connectedHandles.has(handleId); // Keep only if connected
          });
          
          if (newInputs.length !== n.data.imageInputs.length) {
            changed = true;
            return {
              ...n,
              data: { ...n.data, imageInputs: newInputs }
            };
          }
        }
        return n;
      });
      return changed ? newNodes : nds;
    });
  }, [edges, setNodes]);

  const getFullRootGraph = useCallback(() => {
    if (graphPath.length === 0) return { rootNodes: nodesRef.current, rootEdges: edgesRef.current };
    
    const cloneRootNodes = JSON.parse(JSON.stringify(rootNodesRef.current));
    const targetId = graphPath[graphPath.length - 1].id;
    
    const updateNodeDeep = (nArray: Node[]) => {
      for (let i = 0; i < nArray.length; i++) {
        if (nArray[i].id === targetId) {
          nArray[i].data.internalNodes = nodesRef.current;
          nArray[i].data.internalEdges = edgesRef.current;
          
          // Dynamically sync pins to exterior Compound Node
          const inputPins = nodesRef.current
            .filter(n => n.type === 'graphInput')
            .map(n => ({
               id: n.id,
               type: n.data.inputType || 'text',
               label: n.data.pinLabel || n.data.inputType || 'Input'
            })); 
            
          const outputPins = nodesRef.current
            .filter(n => n.type === 'graphOutput')
            .map(n => ({
               id: n.id,
               type: n.data.outputType || 'image',
               label: n.data.pinLabel || n.data.outputType || 'Output'
            }));
            
          nArray[i].data.inputPins = inputPins;
          nArray[i].data.outputPins = outputPins;
          
          return true;
        }
        if (nArray[i].data.internalNodes) {
          if (updateNodeDeep(nArray[i].data.internalNodes)) return true;
        }
      }
      return false;
    };
    updateNodeDeep(cloneRootNodes);
    
    return { rootNodes: cloneRootNodes, rootEdges: rootEdgesRef.current }; // preserve outer edges
  }, [graphPath]);

  const openNodeEditor = useCallback((node: Node) => {
    if (node.type === 'compound') {
      const { rootNodes, rootEdges } = getFullRootGraph();
      rootNodesRef.current = rootNodes;
      if (graphPath.length === 0) {
         rootEdgesRef.current = rootEdges;
      }
      
      setPast([]);
      setFuture([]);
      
      setGraphPath(prev => [...prev, { id: node.id, name: node.data.label || 'Compound Node' }]);
      
      const externalEdges = rootEdges.filter(e => e.target === node.id);
      const internalNodes = (node.data.internalNodes || []).map((n: Node) => {
         const cleanNode = n.position ? n : { ...n, position: { x: 0, y: 0 } };
         if (cleanNode.type === 'graphInput') {
            const edge = externalEdges.find(e => e.targetHandle === cleanNode.id);
            if (edge) {
               const sourceNode = rootNodes.find((rn: any) => rn.id === edge.source);
               if (sourceNode) {
                  return {
                     ...cleanNode,
                     data: {
                        ...cleanNode.data,
                        image: sourceNode.data.image || sourceNode.data.outputImage || sourceNode.data.referenceImage || "",
                        text: sourceNode.data.text || sourceNode.data.outputText || ""
                     }
                  };
               }
            }
         }
         return cleanNode;
      });
      
      setNodes(internalNodes);
      setEdges(node.data.internalEdges || []);
    } else if (node.type === 'imageEditor') {
      setActiveImageEditor(node.id);
    }
  }, [getFullRootGraph, graphPath.length, setNodes, setEdges]);

  useEffect(() => {
    const handleOpenWorkspace = (e: any) => {
      const { id } = e.detail;
      const node = nodesRef.current.find(n => n.id === id);
      if (node) {
        openNodeEditor(node);
      }
    };
    window.addEventListener('open-workspace', handleOpenWorkspace);
    return () => window.removeEventListener('open-workspace', handleOpenWorkspace);
  }, [openNodeEditor]);

  const handleSaveToLibrary = useCallback(async () => {
    if (graphPath.length === 0) return;
    
    // Ensure we capture the latest state of the internal nodes/edges into the tree
    const { rootNodes } = getFullRootGraph();
    
    // Find the compound node we are currently inside
    const targetId = graphPath[graphPath.length - 1].id;
    
    const findNodeDeep = (nodesArray: Node[]): Node | null => {
      for (const n of nodesArray) {
        if (n.id === targetId) {
          return n;
        }
        if (n.data?.internalNodes) {
          const found = findNodeDeep(n.data.internalNodes);
          if (found) return found;
        }
      }
      return null;
    };
    
    const currentNode = findNodeDeep(rootNodes);
    
    if (currentNode) {
      try {
        const stored = await get("artist-assistant-custom-nodes");
        let existingNodes = stored || [];
        
        // Handle migration from localStorage if needed
        if (!stored) {
           const localStored = localStorage.getItem("artist-assistant-custom-nodes");
           if (localStored) {
             existingNodes = JSON.parse(localStored);
           }
        }
        
        // Save the compound node. Give it a new unique library ID.
        const libraryNode = {
          id: `lib-node-${Date.now()}`,
          data: stripExecutionData(currentNode.data)
        };
        
        existingNodes.push(libraryNode);
        await set("artist-assistant-custom-nodes", existingNodes);
        
        // Dispatch event to update sidebar
        window.dispatchEvent(new CustomEvent('customNodesUpdated'));
        alert(`Saved "${currentNode.data.label}" to Custom Library!`);
      } catch (err) {
        console.error("Failed to save to library:", err);
        alert("Failed to save to library. Storage error.");
      }
    }
  }, [graphPath, getFullRootGraph]);

  const handleExportNode = useCallback(() => {
    if (graphPath.length === 0) return;
    
    const { rootNodes } = getFullRootGraph();
    const targetId = graphPath[graphPath.length - 1].id;
    let currentNode: any = null;
    
    const findNodeDeep = (nodesArray: Node[]) => {
      for (const n of nodesArray) {
        if (n.id === targetId) {
          currentNode = n;
          return true;
        }
        if (n.data?.internalNodes) {
          if (findNodeDeep(n.data.internalNodes)) return true;
        }
      }
      return false;
    };
    
    findNodeDeep(rootNodes);
    
    if (currentNode) {
      const exportNode = {
        id: `lib-node-${Date.now()}`,
        data: stripExecutionData(currentNode.data)
      };
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify([exportNode], null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      
      // Clean filename
      const safeName = (currentNode.data.label || "compound-node").replace(/[^a-z0-9]/gi, '_').toLowerCase();
      downloadAnchorNode.setAttribute("download", `${safeName}.json`);
      
      document.body.appendChild(downloadAnchorNode); 
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    }
  }, [graphPath, getFullRootGraph]);

  // Dispatch event whenever graphPath changes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('graphPathChanged', { detail: { isCompound: graphPath.length > 0 } }));
  }, [graphPath]);

  // Save changes automatically
  useEffect(() => {
    if (nodes.length > 0 || graphPath.length > 0) {
      const timer = setTimeout(() => {
        const { rootNodes, rootEdges } = getFullRootGraph();
        rootNodesRef.current = rootNodes;
        if (graphPath.length === 0) {
          rootEdgesRef.current = rootEdges;
        }
        saveTaskFlow(taskId, rootNodes, rootEdges).catch(console.error);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [nodes, edges, taskId, getFullRootGraph, graphPath.length]);

  const navigateToLevel = useCallback((index: number) => {
    // Save current view
    const { rootNodes, rootEdges } = getFullRootGraph();
    rootNodesRef.current = rootNodes;
    if (graphPath.length === 0) {
       rootEdgesRef.current = rootEdges;
    }
    
    setPast([]);
    setFuture([]);

    if (index === -1) {
       setGraphPath([]);
       setNodes(rootNodes);
       setEdges(rootEdges);
    } else {
       const newPath = graphPath.slice(0, index + 1);
       setGraphPath(newPath);
       
       const targetId = newPath[newPath.length - 1].id;
       const findNode = (nArray: Node[]): Node | undefined => {
          for (let i = 0; i < nArray.length; i++) {
             if (nArray[i].id === targetId) return nArray[i];
             if (nArray[i].data.internalNodes) {
                const found = findNode(nArray[i].data.internalNodes);
                if (found) return found;
             }
          }
       }
       const targetNode = findNode(rootNodes);
       if (targetNode) {
          const externalEdges = rootEdges.filter(e => e.target === targetNode.id);
          const internalNodes = (targetNode.data.internalNodes || []).map((n: Node) => {
             const cleanNode = n.position ? n : { ...n, position: { x: 0, y: 0 } };
             if (cleanNode.type === 'graphInput') {
                const edge = externalEdges.find(e => e.targetHandle === cleanNode.id);
                if (edge) {
                   const sourceNode = rootNodes.find((rn: any) => rn.id === edge.source);
                   if (sourceNode) {
                      return {
                         ...cleanNode,
                         data: {
                            ...cleanNode.data,
                            image: sourceNode.data.image || sourceNode.data.outputImage || sourceNode.data.referenceImage || "",
                            text: sourceNode.data.text || sourceNode.data.outputText || ""
                         }
                      };
                   }
                }
             }
             return cleanNode;
          });
          setNodes(internalNodes);
          setEdges(targetNode.data.internalEdges || []);
       }
    }
  }, [getFullRootGraph, graphPath, setNodes, setEdges]);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    openNodeEditor(node);
  }, [openNodeEditor]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      saveHistory();
      const isImageInput = params.sourceHandle === 'image';
      const isTextInput = params.sourceHandle === 'text';

      const finalParams = { ...params };

      // Handle dynamic Prompt Connector connection
      if (params.targetHandle === 'text-plus') {
        const newHandleId = `text-dyn-${Date.now()}`;
        finalParams.targetHandle = newHandleId;

        // Mutate target node data to spawn the new handle
        setNodes(nds => nds.map(n => {
          if (n.id === params.target) {
            const currentHandles = n.data.handles || ["text-h0", "text-h1"];
            return {
              ...n,
              data: {
                ...n.data,
                handles: [...currentHandles, newHandleId],
                editableTexts: { ...(n.data.editableTexts || {}), [newHandleId]: "" },
                everConnected: { ...(n.data.everConnected || {}), [newHandleId]: true }
              }
            };
          }
          return n;
        }));
      } else if (params.targetHandle === 'image-plus') {
        const newHandleId = `image-dyn-${Date.now()}`;
        finalParams.targetHandle = newHandleId;

        setNodes(nds => nds.map(n => {
          if (n.id === params.target) {
            const currentHandles = n.data.imageInputs || ["image-0"];
            const maxInputs = n.type === 'imageEditor' ? 50 : 4;
            if (currentHandles.length < maxInputs) {
              return {
                ...n,
                data: {
                  ...n.data,
                  imageInputs: [...currentHandles, newHandleId]
                }
              };
            }
          }
          return n;
        }));
      }

      const targetNode = nodes.find((n) => n.id === params.target);
      const isTargetGemini = targetNode?.type === "geminiRefiner";
      const isValueInput = params.sourceHandle === 'value';

      let strokeColor = "#888";
      if (isImageInput) strokeColor = "#4ade80"; // green-400
      else if (isTextInput) strokeColor = "#60a5fa"; // blue-400
      else if (isValueInput) strokeColor = "#ef4444"; // red-500

      const newEdge = {
        ...finalParams,
        id: `e-${finalParams.source}-${finalParams.sourceHandle}-${finalParams.target}-${finalParams.targetHandle}-${Date.now()}`,
        animated: false,
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray: '5 5'
        },
      };

      setEdges((eds) => {
        // Enforce single connection per target handle
        const filteredEds = eds.filter(e => !(e.target === finalParams.target && e.targetHandle === finalParams.targetHandle));
        return addEdge(newEdge, filteredEds);
      });
    },
    [nodes, setEdges, setNodes, saveHistory]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const customDataStr = event.dataTransfer.getData("application/reactflow-custom");
      if (customDataStr) {
        saveHistory();
        try {
          const customData = JSON.parse(customDataStr);
          const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });

          // Deep copy and generate new ID
          const newNode: Node = {
            id: `compound-${getId()}`,
            type: 'compound',
            position,
            data: JSON.parse(JSON.stringify(customData)),
          };

          setNodes((nds) => nds.concat(newNode));
        } catch (e) {
          console.error("Failed to parse dropped custom node", e);
        }
        return;
      }

      const type = event.dataTransfer.getData("application/reactflow");

      if (typeof type === "undefined" || !type) {
        return;
      }

      saveHistory();

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, saveHistory]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      saveHistory();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [setEdges, saveHistory]
  );

  const onNodeDragStart = useCallback(() => {
    saveHistory();
    setIsDraggingNode(true);
  }, [saveHistory]);

  const onNodeDrag = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
      if (nodeElement && trashRef.current) {
        const nodeRect = nodeElement.getBoundingClientRect();
        const trashRect = trashRef.current.getBoundingClientRect();

        const isIntersecting = !(
          nodeRect.right < trashRect.left ||
          nodeRect.left > trashRect.right ||
          nodeRect.bottom < trashRect.top ||
          nodeRect.top > trashRect.bottom
        );

        if (isIntersecting) {
          nodeElement.classList.add('node-intersecting-trash');
        } else {
          nodeElement.classList.remove('node-intersecting-trash');
        }
      }
    },
    []
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setIsDraggingNode(false);
      const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
      if (nodeElement && trashRef.current) {
        nodeElement.classList.remove('node-intersecting-trash');
        const nodeRect = nodeElement.getBoundingClientRect();
        const trashRect = trashRef.current.getBoundingClientRect();

        const isIntersecting = !(
          nodeRect.right < trashRect.left ||
          nodeRect.left > trashRect.right ||
          nodeRect.bottom < trashRect.top ||
          nodeRect.top > trashRect.bottom
        );

        if (isIntersecting) {
          setNodes((nds) => nds.filter((n) => n.id !== node.id));
          setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
        }
      }
    },
    [setNodes, setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      // 1. Must be output to input
      if (connection.source === connection.target) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return false;

      // 2. Type Match: blue source -> blue target, green source -> green target
      // We check handle IDs: 'text' (blue) or 'image' (green)
      const sHandle = connection.sourceHandle || '';
      const tHandle = connection.targetHandle || '';

      let isSourceText = sHandle.includes('text');
      let isTargetText = tHandle.includes('text') || tHandle.includes('style');
      let isSourceImage = sHandle.includes('image') || sHandle.includes('img');
      let isTargetImage = tHandle.includes('image') || tHandle.includes('img');
      let isSourceValue = sHandle === 'value';
      let isTargetValue = ['intensity', 'threshold', 'zoom', 'opacity', 'feather'].includes(tHandle);

      if (sourceNode.type === 'compound' && sourceNode.data.outputPins) {
        const pin = sourceNode.data.outputPins.find((p: any) => (p.id || p) === sHandle);
        if (pin) {
           const type = typeof pin === 'string' ? (pin.includes('image') ? 'image' : pin.includes('value') ? 'value' : 'text') : pin.type;
           isSourceText = type === 'text';
           isSourceImage = type === 'image';
           isSourceValue = type === 'value';
        }
      }

      if (targetNode.type === 'compound' && targetNode.data.inputPins) {
        const pin = targetNode.data.inputPins.find((p: any) => (p.id || p) === tHandle);
        if (pin) {
           const type = typeof pin === 'string' ? (pin.includes('image') ? 'image' : pin.includes('value') ? 'value' : 'text') : pin.type;
           isTargetText = type === 'text';
           isTargetImage = type === 'image';
           isTargetValue = type === 'value';
        }
      }

      if (isSourceText && isTargetText) return true;
      if (isSourceImage && isTargetImage) return true;
      if (isSourceValue && isTargetValue) return true;

      console.warn(`Invalid connection attempt: source(${sHandle}) to target(${tHandle})`);
      return false;
    },
    [nodes]
  );

  const onNodesDelete = useCallback(() => saveHistory(), [saveHistory]);

  return (
    <div className="flex-grow h-full relative" ref={reactFlowWrapper}>
      {activeImageEditor ? (
        <ImageEditorWorkspace 
          nodeId={activeImageEditor} 
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          onExit={() => setActiveImageEditor(null)} 
        />
      ) : (
      <>
        <ReactFlowProvider>
          <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onEdgeClick={onEdgeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodesDelete={onNodesDelete}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          panOnDrag={[1, 2]}
          selectionOnDrag={true}
          selectionMode={SelectionMode.Partial}
          minZoom={0.1}
          fitView
          className="bg-[var(--color-blender-bg)]"
        >
          <Background
            color="#444"
            gap={20}
            size={1}
            variant={BackgroundVariant.Dots}
          />
          <Controls
            className="bg-[var(--color-blender-panel)] border-[var(--color-blender-border)] fill-white"
            showInteractive={false}
          />
          <Panel position="top-left" className="bg-[var(--color-blender-panel)] px-4 py-2 rounded-sm shadow-sm border border-[var(--color-blender-border)]">
            <div className="flex items-center gap-2 text-white font-medium mb-1">
              <button 
                onClick={() => navigateToLevel(-1)} 
                className={`hover:text-[var(--color-blender-accent)] ${graphPath.length === 0 ? 'text-white font-bold' : 'text-gray-400'}`}
              >
                {taskName || "Workspace"}
              </button>
              
              {graphPath.map((pathItem, index) => (
                <div key={`${pathItem.id}-${index}`} className="flex items-center gap-2">
                  <span className="text-gray-500">/</span>
                  <button 
                    onClick={() => navigateToLevel(index)}
                    className={`hover:text-[var(--color-blender-accent)] ${index === graphPath.length - 1 ? 'text-white font-bold' : 'text-gray-400'}`}
                  >
                    {pathItem.name}
                  </button>
                </div>
              ))}
            </div>

            {graphPath.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[var(--color-blender-border)] flex flex-col gap-2">
                <button
                  onClick={handleSaveToLibrary}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-mono uppercase tracking-wide rounded-sm shadow-sm transition-all w-full justify-center"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save to Custom Library
                </button>
                <button
                  onClick={handleExportNode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-blender-node-bg)] hover:bg-[var(--color-blender-hover)] text-gray-300 border border-[var(--color-blender-border)] text-xs font-mono uppercase tracking-wide rounded-sm shadow-sm transition-all w-full justify-center"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export to JSON
                </button>
              </div>
            )}

            {graphPath.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Connect inputs → Gemini Refiner (optional) → PlenxAI Output
                <br />Click on a connection to remove it.
                <br />Select and press Delete, or drag to Trash.
                <br />Ctrl+Z to Undo, Ctrl+Alt+Z to Redo.
              </p>
            )}
            
            {nodes.filter(n => n.selected).length >= 2 && (
              <div className="mt-3 pt-3 border-t border-[var(--color-blender-border)]">
                <button
                  onClick={handleGroupNodes}
                  className="w-full py-1.5 px-3 bg-amber-700 hover:bg-amber-600 text-white text-xs font-mono uppercase tracking-wide rounded-sm shadow-sm transition-all"
                >
                  Group Selected (Ctrl+G)
                </button>
              </div>
            )}
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>

      {/* Trash Can Dropzone */}
      <div
        ref={trashRef}
        className={`absolute left-[50px] bottom-[50px] w-12 h-12 rounded-sm flex items-center justify-center transition-all duration-300 z-50 border ${isDraggingNode
            ? "bg-red-500/20 border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] opacity-100 scale-100"
            : "opacity-0 scale-90 pointer-events-none"
          }`}
      >
        <Trash2 className={`w-6 h-6 ${isDraggingNode ? "text-red-400 animate-pulse" : "text-gray-500"}`} />
      </div>
      </>
      )}
    </div>
  );
}

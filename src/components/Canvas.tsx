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
import { Trash2 } from "lucide-react";
import { getTask, saveTaskFlow } from "@/lib/store";

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

import CompoundNode from "./nodes/CompoundNode";
import GraphInputNode from "./nodes/GraphInputNode";
import GraphOutputNode from "./nodes/GraphOutputNode";

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
  compound: CompoundNode,
  graphInput: GraphInputNode,
  graphOutput: GraphOutputNode,
};

const getId = () => `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface CanvasProps {
  taskId: string;
}

const initialNodes: Node[] = [
  {
    id: "compound-1",
    type: "compound",
    position: { x: 300, y: 100 },
    data: {
      label: "My Auto Pipeline",
      internalNodes: [
        { id: "p1", type: "prompt", position: { x: 100, y: 100 }, data: { outputText: "A futuristic cyberpunk city" } },
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

export default function Canvas({ taskId }: CanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [taskName, setTaskName] = useState("");
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);

  // Sub-graph State
  const [graphPath, setGraphPath] = useState<{ id: string; name: string }[]>([]);
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
    const newNodes = currentNodes.filter(n => !selectedIds.has(n.id)).map(n => ({...n, selected: false}));
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
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        if (copiedNodesRef.current && copiedNodesRef.current.length > 0) {
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
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, setNodes, setEdges, saveHistory]);

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
    return { rootNodes: cloneRootNodes, rootEdges: rootEdgesRef.current };
  }, [graphPath]);

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
          const internalNodes = (targetNode.data.internalNodes || []).map((n: Node) => n.position ? n : { ...n, position: { x: 0, y: 0 } });
          setNodes(internalNodes);
          setEdges(targetNode.data.internalEdges || []);
       }
    }
  }, [getFullRootGraph, graphPath, setNodes, setEdges]);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'compound') {
      const { rootNodes, rootEdges } = getFullRootGraph();
      rootNodesRef.current = rootNodes;
      if (graphPath.length === 0) {
         rootEdgesRef.current = rootEdges;
      }
      
      setPast([]);
      setFuture([]);
      
      setGraphPath(prev => [...prev, { id: node.id, name: node.data.label || 'Compound Node' }]);
      const internalNodes = (node.data.internalNodes || []).map((n: Node) => n.position ? n : { ...n, position: { x: 0, y: 0 } });
      setNodes(internalNodes);
      setEdges(node.data.internalEdges || []);
    }
  }, [getFullRootGraph, graphPath.length, setNodes, setEdges]);

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
            if (currentHandles.length < 4) {
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

      let strokeColor = "#888";
      if (isImageInput) strokeColor = "#4ade80"; // green-400
      else if (isTextInput) strokeColor = "#60a5fa"; // blue-400

      const newEdge = {
        ...finalParams,
        animated: false,
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray: '5 5'
        },
      };

      setEdges((eds) => addEdge(newEdge, eds));
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

      const isSourceText = sHandle.includes('text');
      const isTargetText = tHandle.includes('text') || tHandle.includes('style');
      const isSourceImage = sHandle.includes('image');
      const isTargetImage = tHandle.includes('image');

      if (isSourceText && isTargetText) return true;
      if (isSourceImage && isTargetImage) return true;

      console.warn(`Invalid connection attempt: source(${sHandle}) to target(${tHandle})`);
      return false;
    },
    [nodes]
  );

  const onNodesDelete = useCallback(() => saveHistory(), [saveHistory]);

  return (
    <div className="flex-grow h-full relative" ref={reactFlowWrapper}>
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
          <Panel position="top-left" className="bg-[var(--color-blender-panel)] px-4 py-2 rounded-md shadow-md border border-[var(--color-blender-border)]">
            <div className="flex items-center gap-2 text-white font-medium mb-1">
              <button 
                onClick={() => navigateToLevel(-1)} 
                className={`hover:text-[var(--color-blender-accent)] ${graphPath.length === 0 ? 'text-white font-bold' : 'text-gray-400'}`}
              >
                {taskName || "Workspace"}
              </button>
              
              {graphPath.map((pathItem, index) => (
                <div key={pathItem.id} className="flex items-center gap-2">
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
                  className="w-full py-1.5 px-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded shadow-lg transition-all"
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
        className={`absolute left-[50px] bottom-[50px] w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 z-50 ${isDraggingNode
            ? "bg-red-500/20 border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] opacity-100 scale-100"
            : "opacity-0 scale-90 pointer-events-none"
          }`}
      >
        <Trash2 className={`w-6 h-6 ${isDraggingNode ? "text-red-400 animate-pulse" : "text-gray-500"}`} />
      </div>
    </div>
  );
}

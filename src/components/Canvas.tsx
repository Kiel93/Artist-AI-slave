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
} from "reactflow";
import "reactflow/dist/style.css";
import { Trash2 } from "lucide-react";
import { getTask, saveTaskFlow } from "@/lib/store";

import PromptNode from "./nodes/PromptNode";
import PromptConnectorNode from "./nodes/PromptConnectorNode";
import StyleInsertNode from "./nodes/StyleInsertNode";
import ReferenceImageNode from "./nodes/ReferenceImageNode";
import PlenxAIOutputNode from "./nodes/PlenxAIOutputNode";
import GeminiRefinerNode from "./nodes/GeminiRefinerNode";
import SketchToImageNode from "./nodes/SketchToImageNode";
import IsometricDrawNode from "./nodes/IsometricDrawNode";
import ImageExplainedNode from "./nodes/ImageExplainedNode";
import TilesetGeneratorNode from "./nodes/TilesetGeneratorNode";
import IsometricHexSlicerNode from "./nodes/IsometricHexSlicerNode";
import BackgroundRemoverNode from "./nodes/BackgroundRemoverNode";
import AssetGeneratorNode from "./nodes/AssetGeneratorNode";

const nodeTypes = {
  prompt: PromptNode,
  promptConnector: PromptConnectorNode,
  styleInsert: StyleInsertNode,
  referenceImage: ReferenceImageNode,
  geminiRefiner: GeminiRefinerNode,
  plenxAiOutput: PlenxAIOutputNode,
  sketchToImage: SketchToImageNode,
  isometricDraw: IsometricDrawNode,
  imageExplained: ImageExplainedNode,
  tilesetGenerator: TilesetGeneratorNode,
  isometricHexSlicer: IsometricHexSlicerNode,
  backgroundRemover: BackgroundRemoverNode,
  assetGenerator: AssetGeneratorNode,
};

const getId = () => `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface CanvasProps {
  taskId: string;
}

const initialNodes: Node[] = [
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 100, y: 100 },
    data: { text: "A futuristic city with neon lights" },
  },
  {
    id: "plenxai-1",
    type: "plenxAiOutput",
    position: { x: 800, y: 200 },
    data: {},
  },
];

const initialEdges: Edge[] = [
  {
    id: "e-gemini-plenxai",
    source: "gemini-1",
    target: "plenxai-1",
    animated: false,
    style: { stroke: "#a855f7", strokeWidth: 2, strokeDasharray: '5 5' },
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

  // Undo/Redo State
  const [past, setPast] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
  const [future, setFuture] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must target canvas area or document body to prevent overriding input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleRedo();
      } else if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    getTask(taskId).then(task => {
      if (task) {
        setTaskName(task.name);
        if (task.nodes && task.nodes.length > 0) {
          // Migration: Rename 'idea' nodes to 'prompt'
          const migratedNodes = task.nodes.map(n => n.type === 'idea' ? { ...n, type: 'prompt' } : n);
          setNodes(migratedNodes);
          setEdges(task.edges || []);
          
        }
      }
    }).catch(console.error);
  }, [taskId, setNodes, setEdges]);

  // Save changes automatically
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        saveTaskFlow(taskId, nodes, edges).catch(console.error);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [nodes, edges, taskId]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      saveHistory();
      const isImageInput = params.sourceHandle === 'image';
      const isTextInput = params.sourceHandle === 'text';
      
      let finalParams = { ...params };
      
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
      const isTargetText = tHandle.includes('text');
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
          onNodesDelete={onNodesDelete}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
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
            <h3 className="text-white font-medium">{taskName || "Workspace"}</h3>
            <p className="text-xs text-gray-400 mt-1">
              Connect inputs → Gemini Refiner (optional) → PlenxAI Output
              <br/>Click on a connection to remove it.
              <br/>Select and press Delete, or drag to Trash.
              <br/>Ctrl+Z to Undo, Ctrl+Alt+Z to Redo.
            </p>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>

      {/* Trash Can Dropzone */}
      <div 
        ref={trashRef}
        className={`absolute left-[50px] bottom-[50px] w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 z-50 ${
          isDraggingNode 
            ? "bg-red-500/20 border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] opacity-100 scale-100" 
            : "opacity-0 scale-90 pointer-events-none"
        }`}
      >
        <Trash2 className={`w-6 h-6 ${isDraggingNode ? "text-red-400 animate-pulse" : "text-gray-500"}`} />
      </div>
    </div>
  );
}

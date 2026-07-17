import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Layers, Eye, EyeOff, Hand, Search, MousePointer2, GripVertical, ChevronDown, ChevronUp, Type, Image as ImageIcon, Plus, Square, Circle, Star as StarIcon, Brush, Trash2, Settings, Undo2, Redo2, SquareDashed, Lasso, PenTool } from "lucide-react";
import { Node, Edge } from "reactflow";
import { executeNode } from "@/lib/node-executor";
import { Stage, Layer, Image as KonvaImage, Transformer, Group, Text as KonvaText, Rect, Circle as KonvaCircle, Star as KonvaStar, Line, Path } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { PathEditorOverlay } from './PathEditorOverlay';

export interface AnchorPoint {
   x: number;
   y: number;
   handleIn?: { x: number, y: number };
   handleOut?: { x: number, y: number };
   type: 'smooth' | 'sharp' | 'asymmetric';
}

interface LayerData {
  id: string; // matches handleId
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  name: string;
  type?: 'image' | 'text' | 'shape' | 'brush' | 'path';
  blendMode?: GlobalCompositeOperation;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  shapeType?: 'rect' | 'circle' | 'star' | 'path';
  points?: number[];
  lines?: { points: number[], size?: number, opacity?: number, hardness?: number }[];
  pathAnchors?: AnchorPoint[];
  pathClosed?: boolean;
  stroke?: string;
  strokeWidth?: number;
  tension?: number;
  radius?: number;
  innerRadius?: number;
  outerRadius?: number;
  numPoints?: number;
  width?: number;
  height?: number;
  filters?: {
    brightness?: number;
    contrast?: number;
    blur?: number;
    sepia?: boolean;
    invert?: boolean;
  };
  rasterMask?: {
    lines: { points: number[], size: number, mode: 'erase' | 'restore', opacity?: number, hardness?: number }[];
    visible: boolean;
    inverted: boolean;
  };
  vectorMask?: {
    pathAnchors: AnchorPoint[];
    pathClosed: boolean;
    visible: boolean;
    inverted: boolean;
  };
  activeEditingTarget?: 'image' | 'rasterMask' | 'vectorMask';
}

const generatePathString = (anchors: AnchorPoint[], closed: boolean) => {
   if (!anchors || anchors.length < 2) return "";
   let d = `M ${anchors[0].x} ${anchors[0].y} `;
   
   const len = closed ? anchors.length : anchors.length - 1;
   for (let i = 0; i < len; i++) {
      const current = anchors[i];
      const next = anchors[(i + 1) % anchors.length];
      
      const cp1x = current.handleOut ? current.handleOut.x : current.x;
      const cp1y = current.handleOut ? current.handleOut.y : current.y;
      const cp2x = next.handleIn ? next.handleIn.x : next.x;
      const cp2y = next.handleIn ? next.handleIn.y : next.y;
      
      d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y} `;
   }
   if (closed) {
      d += "Z";
   }
   return d;
};

const drawPathAnchors = (ctx: any, anchors: AnchorPoint[], reverse: boolean) => {
   if (anchors.length < 2) return;
   
   let sequence = [...anchors];
   if (reverse) {
      sequence = sequence.reverse().map(a => ({
         ...a,
         handleIn: a.handleOut,
         handleOut: a.handleIn
      }));
   }

   ctx.moveTo(sequence[0].x, sequence[0].y);
   for (let i = 0; i < sequence.length; i++) {
      const current = sequence[i];
      const next = sequence[(i + 1) % sequence.length];
      
      const cp1x = current.handleOut ? current.handleOut.x : current.x;
      const cp1y = current.handleOut ? current.handleOut.y : current.y;
      const cp2x = next.handleIn ? next.handleIn.x : next.x;
      const cp2y = next.handleIn ? next.handleIn.y : next.y;
      
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
   }
   ctx.closePath();
}

const applyMaskClip = (ctx: any, mask: any) => {
   if (!mask || !mask.pathAnchors || mask.pathAnchors.length < 2) return;
   
   ctx.beginPath();
   
   if (mask.inverted) {
      // Draw outer boundary (counter-clockwise)
      const size = 99999;
      ctx.moveTo(-size, -size);
      ctx.lineTo(-size, size);
      ctx.lineTo(size, size);
      ctx.lineTo(size, -size);
      ctx.closePath();
      
      // Determine winding of inner mask
      let sum = 0;
      for (let i = 0; i < mask.pathAnchors.length; i++) {
         const p1 = mask.pathAnchors[i];
         const p2 = mask.pathAnchors[(i + 1) % mask.pathAnchors.length];
         sum += (p2.x - p1.x) * (p2.y + p1.y);
      }
      
      const needsReverse = sum > 0;
      drawPathAnchors(ctx, mask.pathAnchors, needsReverse);
   } else {
      drawPathAnchors(ctx, mask.pathAnchors, false);
   }
};

interface WorkspaceProps {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  onExit: () => void;
}

type ToolMode = "select" | "pan" | "zoom" | "brush" | "marquee" | "lasso" | "pen";
const RasterMaskRenderer = ({ mask, width, height }: any) => {
  const [canvas] = useState(() => document.createElement('canvas'));
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!width || !height) return;
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background
    ctx.globalCompositeOperation = 'source-over';
    if (mask.inverted) {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw all strokes
    if (mask.lines) {
      mask.lines.forEach((l: any) => {
        ctx.globalCompositeOperation = l.mode === 'erase' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = l.size || 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (l.opacity !== undefined) {
          ctx.globalAlpha = l.opacity / 100;
        } else {
          ctx.globalAlpha = 1.0;
        }

        if (l.points && l.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(l.points[0], l.points[1]);
          // For a single point click (2 coords), draw a tiny line to make it visible
          if (l.points.length === 2) {
            ctx.lineTo(l.points[0] + 0.1, l.points[1] + 0.1);
          } else {
            for (let i = 2; i < l.points.length; i += 2) {
              ctx.lineTo(l.points[i], l.points[i + 1]);
            }
          }
          ctx.stroke();
        }
      });
    }

    // Trigger a KonvaImage re-render
    setRevision(r => r + 1);
  }, [mask.lines, mask.inverted, width, height, canvas]);

  return (
    <KonvaImage 
      image={canvas} 
      globalCompositeOperation={mask.inverted ? "destination-out" : "destination-in"} 
      listening={false}
    />
  );
};
const URLImage = ({ layer, url, isSelected, onSelect, onChange, width, height, isInteractive }: any) => {
  const [image] = useImage(url, 'anonymous');
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && isInteractive && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, isInteractive]);

  useEffect(() => {
    if (image && shapeRef.current) {
       shapeRef.current.clearCache();
       shapeRef.current.cache({
         pixelRatio: 1,
         hitCanvasDrawAlphaThreshold: 10
       });
    }
  }, [
    image, 
    layer.filters, 
    width, 
    height, 
    layer.scaleX, 
    layer.scaleY, 
    layer.rotation, 
    layer.mask, 
    layer.rasterMask, 
    layer.vectorMask,
    layer.opacity,
    layer.blendMode,
    layer.shadowColor,
    layer.shadowBlur,
    layer.shadowOffsetX,
    layer.shadowOffsetY
  ]);

  if (!image) return null;

  let activeFilters = [];
  if (layer.filters?.brightness !== undefined) activeFilters.push(Konva.Filters.Brighten);
  if (layer.filters?.contrast !== undefined) activeFilters.push(Konva.Filters.Contrast);
  if (layer.filters?.blur !== undefined && layer.filters?.blur > 0) activeFilters.push(Konva.Filters.Blur);
  if (layer.filters?.sepia) activeFilters.push(Konva.Filters.Sepia);
  if (layer.filters?.invert) activeFilters.push(Konva.Filters.Invert);

  return (
    <React.Fragment>
      <Group
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        x={layer.x}
        y={layer.y}
        offsetX={width / 2}
        offsetY={height / 2}
        rotation={layer.rotation}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        draggable={isSelected && isInteractive}
        onDragEnd={(e) => {
          onChange({
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          onChange({
            x: node.x(),
            y: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotation: node.rotation()
          });
        }}
        clipFunc={layer.vectorMask && layer.vectorMask.visible !== false && layer.vectorMask.pathAnchors && layer.vectorMask.pathAnchors.length >= 3 ? (ctx) => applyMaskClip(ctx, layer.vectorMask) : undefined}
      >
        <Group>
          <KonvaImage
            image={image}
            filters={activeFilters.length > 0 ? activeFilters : undefined}
            brightness={layer.filters?.brightness || 0}
            contrast={layer.filters?.contrast || 0}
            blurRadius={layer.filters?.blur || 0}
            width={width}
            height={height}
            opacity={layer.opacity}
            globalCompositeOperation={layer.blendMode || 'source-over'}
            shadowColor={layer.shadowColor}
            shadowBlur={layer.shadowBlur}
            shadowOffsetX={layer.shadowOffsetX}
            shadowOffsetY={layer.shadowOffsetY}
          />
          {layer.rasterMask && layer.rasterMask.visible !== false && (
            <RasterMaskRenderer mask={layer.rasterMask} width={width} height={height} />
          )}
        </Group>
      </Group>
      {isSelected && isInteractive && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => newBox}
          padding={0}
          anchorSize={10}
          anchorCornerRadius={0}
          borderStroke="#10b981"
          anchorStroke="#10b981"
          anchorFill="#ffffff"
        />
      )}
    </React.Fragment>
  );
};

const TextLayerRenderer = ({ layer, isSelected, onSelect, onChange, isInteractive }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && isInteractive && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, isInteractive, layer.text, layer.fontSize, layer.fontFamily, layer.fill]);

  return (
    <React.Fragment>
      <Group
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        draggable={isSelected && isInteractive}
        onDragEnd={(e) => {
          onChange({
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          onChange({
            x: node.x(),
            y: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotation: node.rotation()
          });
        }}
        clipFunc={layer.vectorMask && layer.vectorMask.visible !== false && layer.vectorMask.pathAnchors && layer.vectorMask.pathAnchors.length >= 3 ? (ctx) => applyMaskClip(ctx, layer.vectorMask) : undefined}
      >
        <KonvaText
          text={layer.text || "Double click to edit"}
          fontSize={layer.fontSize || 32}
          fontFamily={layer.fontFamily || "Arial"}
          fill={layer.fill || "#ffffff"}
          opacity={layer.opacity}
          globalCompositeOperation={layer.blendMode || 'source-over'}
          shadowColor={layer.shadowColor}
          shadowBlur={layer.shadowBlur}
          shadowOffsetX={layer.shadowOffsetX}
          shadowOffsetY={layer.shadowOffsetY}
        />
      </Group>
      {isSelected && isInteractive && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => newBox}
          padding={5}
          anchorSize={10}
          anchorCornerRadius={0}
          borderStroke="#10b981"
          anchorStroke="#10b981"
          anchorFill="#ffffff"
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </React.Fragment>
  );
};

const ShapeLayerRenderer = ({ layer, isSelected, onSelect, onChange, isInteractive }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && isInteractive && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, isInteractive, layer.shapeType, layer.width, layer.height, layer.radius, layer.fill, layer.stroke, layer.strokeWidth]);

  const commonProps = {
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth || 0,
    opacity: layer.opacity,
    globalCompositeOperation: layer.blendMode || 'source-over',
    shadowColor: layer.shadowColor,
    shadowBlur: layer.shadowBlur,
    shadowOffsetX: layer.shadowOffsetX,
    shadowOffsetY: layer.shadowOffsetY,
  };

  return (
    <React.Fragment>
      <Group
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        x={layer.x}
        y={layer.y}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        rotation={layer.rotation}
        draggable={isSelected && isInteractive}
        onDragEnd={(e: any) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={(e: any) => {
          const node = shapeRef.current;
          onChange({
            x: node.x(), y: node.y(),
            scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation()
          });
        }}
        clipFunc={layer.vectorMask && layer.vectorMask.visible !== false && layer.vectorMask.pathAnchors && layer.vectorMask.pathAnchors.length >= 3 ? (ctx) => applyMaskClip(ctx, layer.vectorMask) : undefined}
      >
        {layer.shapeType === 'rect' && <Rect {...commonProps} width={layer.width || 100} height={layer.height || 100} offsetX={(layer.width || 100)/2} offsetY={(layer.height || 100)/2} />}
        {layer.shapeType === 'circle' && <KonvaCircle {...commonProps} radius={layer.radius || 50} />}
        {layer.shapeType === 'star' && <KonvaStar {...commonProps} numPoints={layer.numPoints || 5} innerRadius={layer.innerRadius || 25} outerRadius={layer.outerRadius || 50} />}
        {layer.shapeType === 'path' && layer.pathAnchors && layer.pathAnchors.length > 0 && (
           <Path {...commonProps} data={generatePathString(layer.pathAnchors, !!layer.pathClosed)} />
        )}
      </Group>
      
      {isSelected && isInteractive && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => newBox}
          padding={0}
          anchorSize={10}
          anchorCornerRadius={0}
          borderStroke="#10b981"
          anchorStroke="#10b981"
          anchorFill="#ffffff"
        />
      )}
    </React.Fragment>
  );
};

const BrushLayerRenderer = ({ layer, isSelected, onSelect, onChange, isInteractive }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && isInteractive && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, isInteractive, layer.points, layer.stroke, layer.strokeWidth, layer.tension]);

  return (
    <React.Fragment>
      <Group
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        scaleX={layer.scaleX}
        scaleY={layer.scaleY}
        opacity={layer.opacity}
        globalCompositeOperation={layer.blendMode || 'source-over'}
        draggable={isSelected && isInteractive}
        onDragEnd={(e: any) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={(e: any) => {
          const node = shapeRef.current;
          onChange({
            x: node.x(), y: node.y(),
            scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation()
          });
        }}
        clipFunc={layer.vectorMask && layer.vectorMask.visible !== false && layer.vectorMask.pathAnchors && layer.vectorMask.pathAnchors.length >= 3 ? (ctx) => applyMaskClip(ctx, layer.vectorMask) : undefined}
      >
        {layer.points && layer.points.length > 0 && (
          <Line
            points={layer.points}
            stroke={layer.stroke || '#ffffff'}
            strokeWidth={layer.strokeWidth || 5}
            tension={layer.tension !== undefined ? layer.tension : 0.5}
            lineCap="round"
            lineJoin="round"
            shadowColor={layer.shadowColor}
            shadowBlur={layer.shadowBlur}
            shadowOffsetX={layer.shadowOffsetX}
            shadowOffsetY={layer.shadowOffsetY}
          />
        )}
        {layer.lines && layer.lines.map((line: any, i: number) => (
          <Line
            key={i}
            points={line.points}
            stroke={layer.stroke || '#ffffff'}
            strokeWidth={line.size || layer.strokeWidth || 5}
            opacity={line.opacity !== undefined ? line.opacity / 100 : 1}
            tension={layer.tension !== undefined ? layer.tension : 0.5}
            lineCap="round"
            lineJoin="round"
            shadowColor={layer.shadowColor}
            shadowBlur={layer.shadowBlur}
            shadowOffsetX={layer.shadowOffsetX}
            shadowOffsetY={layer.shadowOffsetY}
          />
        ))}
      </Group>
      {isSelected && isInteractive && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => newBox}
          padding={5}
          anchorSize={10}
          anchorCornerRadius={0}
          borderStroke="#10b981"
          anchorStroke="#10b981"
          anchorFill="#ffffff"
        />
      )}
    </React.Fragment>
  );
};

function InspectorPanel({ layer, image, onChange }: { layer: LayerData, image: any, onChange: (updates: Partial<LayerData>) => void }) {
  const [openSections, setOpenSections] = useState({ transform: false, filter: false, effect: false, masking: true });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (!layer) return (
    <div className="w-72 bg-[#15101f] border-r border-emerald-500/20 flex flex-col z-40">
       <div className="p-3 border-b border-white/5 bg-black/20">
         <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Inspector</h2>
       </div>
       <div className="flex-1 flex items-center justify-center text-gray-500 text-xs uppercase p-4 text-center">
         Select a layer to inspect
       </div>
    </div>
  );

  return (
    <div className="w-72 bg-[#15101f] border-r border-emerald-500/20 flex flex-col z-40 overflow-hidden">
      <div className="p-3 border-b border-white/5 bg-black/20 flex-shrink-0">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Inspector</h2>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        
        {/* Transform Section */}
        <div className="border-b border-white/5">
          <div className="bg-black/40 p-2 px-3 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleSection('transform')}>
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Transform</span>
            {openSections.transform ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
          </div>
          {openSections.transform && (
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Loc X</label>
                  <input type="number" value={Math.round(layer.x)} onChange={(e) => onChange({ x: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Loc Y</label>
                  <input type="number" value={Math.round(layer.y)} onChange={(e) => onChange({ y: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Scale W</label>
                  <input type="number" step="0.1" value={parseFloat((layer.scaleX || 1).toFixed(3))} onChange={(e) => onChange({ scaleX: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Scale H</label>
                  <input type="number" step="0.1" value={parseFloat((layer.scaleY || 1).toFixed(3))} onChange={(e) => onChange({ scaleY: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button 
                  onClick={() => onChange({ scaleX: -(layer.scaleX || 1) })}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded py-1 text-[10px] text-gray-300 font-bold uppercase transition-colors"
                >
                  Flip H
                </button>
                <button 
                  onClick={() => onChange({ scaleY: -(layer.scaleY || 1) })}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded py-1 text-[10px] text-gray-300 font-bold uppercase transition-colors"
                >
                  Flip V
                </button>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-1">Rotation (deg)</label>
                <input type="number" value={Math.round(layer.rotation || 0)} onChange={(e) => onChange({ rotation: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs font-mono outline-none transition-colors" />
              </div>

              {layer.type === 'text' && (
                <div className="pt-2 border-t border-white/10 mt-2">
                  <label className="text-[10px] text-emerald-500 uppercase font-bold block mb-1">Text Content</label>
                  <textarea 
                    value={layer.text || ""} 
                    onChange={(e) => onChange({ text: e.target.value })} 
                    className="w-full bg-black/50 border border-emerald-500/30 hover:border-emerald-500 focus:border-emerald-500 rounded px-2 py-1 text-xs outline-none transition-colors min-h-[60px]"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Font Size</label>
                      <input type="number" value={layer.fontSize || 32} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {(layer.type === 'shape' || layer.type === 'brush') && (
                <div className="pt-2 border-t border-white/10 mt-2 space-y-2">
                  {layer.type === 'shape' && (
                    <div>
                      <label className="text-[10px] text-emerald-500 uppercase font-bold block mb-1">Shape Type</label>
                      <select 
                        value={layer.shapeType || 'rect'} 
                        onChange={(e) => onChange({ shapeType: e.target.value as any })}
                        className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none text-gray-200"
                      >
                        <option value="rect">Rectangle</option>
                        <option value="circle">Circle</option>
                        <option value="star">Star</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Stroke Width</label>
                    <input type="number" value={layer.strokeWidth || 0} onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs outline-none" />
                  </div>
                </div>
              )}
              
              <div className="pt-2 flex justify-center">
                 <button onClick={() => onChange({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })} className="text-[10px] text-gray-400 hover:text-white uppercase tracking-wider underline">Reset Transform</button>
              </div>
            </div>
          )}
        </div>

        {/* Filter Section */}
        <div className="border-b border-white/5">
          <div className="bg-black/40 p-2 px-3 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleSection('filter')}>
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Filter</span>
            {openSections.filter ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
          </div>
          {openSections.filter && (
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-1">Blend Mode</label>
                <select 
                  value={layer.blendMode || 'source-over'} 
                  onChange={(e) => onChange({ blendMode: e.target.value as any })}
                  className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs outline-none transition-colors"
                >
                  <option value="source-over">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                  <option value="darken">Darken</option>
                  <option value="lighten">Lighten</option>
                  <option value="color-dodge">Color Dodge</option>
                  <option value="color-burn">Color Burn</option>
                  <option value="hard-light">Hard Light</option>
                  <option value="soft-light">Soft Light</option>
                  <option value="difference">Difference</option>
                  <option value="exclusion">Exclusion</option>
                </select>
              </div>

              <div>
                 <div className="flex justify-between items-center mb-1">
                   <span className="text-[10px] text-gray-500 uppercase font-bold">Opacity</span>
                   <span className="text-[10px] font-mono text-emerald-400">{Math.round((layer.opacity !== undefined ? layer.opacity : 1) * 100)}%</span>
                 </div>
                 <input type="range" min="0" max="1" step="0.01" value={layer.opacity !== undefined ? layer.opacity : 1} onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
              </div>

              {(layer.type === 'text' || layer.type === 'shape' || layer.type === 'brush') && (
                <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                  {layer.type !== 'brush' && (
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Fill</label>
                      <input type="color" value={layer.fill || "#ffffff"} onChange={(e) => onChange({ fill: e.target.value })} className="w-full h-6 bg-black/50 border border-white/10 rounded cursor-pointer" />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Stroke</label>
                    <input type="color" value={layer.stroke || (layer.type === 'brush' ? '#ffffff' : '#000000')} onChange={(e) => onChange({ stroke: e.target.value })} className="w-full h-6 bg-black/50 border border-white/10 rounded cursor-pointer" />
                  </div>
                </div>
              )}

              {(!layer.type || layer.type === 'image') && (
                <div className="pt-2 border-t border-white/10 space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-gray-500 uppercase">Brightness</label>
                      <span className="text-[10px] font-mono text-emerald-400">{Math.round((layer.filters?.brightness || 0) * 100)}%</span>
                    </div>
                    <input type="range" min="-1" max="1" step="0.05" value={layer.filters?.brightness || 0} onChange={(e) => onChange({ filters: { ...(layer.filters || {}), brightness: parseFloat(e.target.value) } })} className="w-full accent-emerald-500" />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-gray-500 uppercase">Contrast</label>
                      <span className="text-[10px] font-mono text-emerald-400">{Math.round((layer.filters?.contrast || 0))}</span>
                    </div>
                    <input type="range" min="-100" max="100" step="1" value={layer.filters?.contrast || 0} onChange={(e) => onChange({ filters: { ...(layer.filters || {}), contrast: parseFloat(e.target.value) } })} className="w-full accent-emerald-500" />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-gray-500 uppercase">Blur</label>
                      <span className="text-[10px] font-mono text-emerald-400">{layer.filters?.blur || 0}px</span>
                    </div>
                    <input type="range" min="0" max="40" step="1" value={layer.filters?.blur || 0} onChange={(e) => onChange({ filters: { ...(layer.filters || {}), blur: parseFloat(e.target.value) } })} className="w-full accent-emerald-500" />
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Special Filters</label>
                    <select
                      value={(layer.filters?.sepia ? 'sepia' : layer.filters?.invert ? 'invert' : 'none')}
                      onChange={(e) => {
                         const val = e.target.value;
                         onChange({ filters: { ...(layer.filters || {}), sepia: val === 'sepia', invert: val === 'invert' } });
                      }}
                      className="w-full bg-black/50 border border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 rounded px-2 py-1 text-xs outline-none transition-colors"
                    >
                      <option value="none">None</option>
                      <option value="sepia">Sepia</option>
                      <option value="invert">Invert</option>
                    </select>
                  </div>
                  
                  {(layer.filters?.brightness || layer.filters?.contrast || layer.filters?.blur || layer.filters?.sepia || layer.filters?.invert) && (
                     <button onClick={() => onChange({ filters: undefined })} className="text-[10px] text-gray-400 hover:text-white uppercase underline mt-2 block w-full text-center">Reset Filters</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Effect Section */}
        <div className="border-b border-white/5">
          <div className="bg-black/40 p-2 px-3 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleSection('effect')}>
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Effect</span>
            {openSections.effect ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
          </div>
          {openSections.effect && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Drop Shadow</label>
                <button 
                  onClick={() => onChange({ shadowColor: layer.shadowColor ? undefined : '#000000', shadowBlur: layer.shadowColor ? 0 : 10, shadowOffsetX: layer.shadowColor ? 0 : 5, shadowOffsetY: layer.shadowColor ? 0 : 5 })}
                  className={`w-8 h-4 rounded-full relative transition-colors ${layer.shadowColor ? 'bg-emerald-500' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${layer.shadowColor ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {layer.shadowColor && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Color</label>
                      <input type="color" value={layer.shadowColor || '#000000'} onChange={(e) => onChange({ shadowColor: e.target.value })} className="w-full h-6 bg-black/50 border border-white/10 rounded cursor-pointer" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Blur</label>
                      <input type="number" value={layer.shadowBlur || 0} onChange={(e) => onChange({ shadowBlur: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Offset X</label>
                      <input type="number" value={layer.shadowOffsetX || 0} onChange={(e) => onChange({ shadowOffsetX: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Offset Y</label>
                      <input type="number" value={layer.shadowOffsetY || 0} onChange={(e) => onChange({ shadowOffsetY: Number(e.target.value) })} className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Masking Section */}
        <div className="border-b border-white/5">
          <div className="bg-black/40 p-2 px-3 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleSection('masking')}>
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Masking</span>
            {openSections.masking ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
          </div>
          {openSections.masking && (
            <div className="p-3 space-y-4">
              {/* Raster Mask Controls */}
              <div>
                <h3 className="text-[10px] text-gray-400 font-bold uppercase mb-2">Raster Mask</h3>
                {!layer.rasterMask ? (
                   <button 
                     onClick={() => onChange({ rasterMask: { lines: [], visible: true, inverted: false }, activeEditingTarget: 'rasterMask' })}
                     className="w-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded py-2 text-xs font-bold transition-colors"
                   >
                     + Add Raster Mask
                   </button>
                ) : (
                   <div className="flex gap-2">
                     <button 
                       onClick={() => onChange({ rasterMask: undefined, activeEditingTarget: 'image' })}
                       className="flex-1 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded py-1 text-[10px] font-bold transition-colors"
                     >
                       Remove
                     </button>
                     <button 
                       onClick={() => onChange({ rasterMask: { ...layer.rasterMask!, inverted: !layer.rasterMask!.inverted } })}
                       className={`flex-1 border rounded py-1 text-[10px] font-bold transition-colors ${layer.rasterMask?.inverted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-gray-300 border-white/10'}`}
                     >
                       {layer.rasterMask?.inverted ? 'Inverted' : 'Invert'}
                     </button>
                     <button 
                       onClick={() => onChange({ rasterMask: { ...layer.rasterMask!, visible: !layer.rasterMask!.visible } })}
                       className="flex-1 bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 rounded py-1 text-[10px] font-bold transition-colors"
                     >
                       {layer.rasterMask?.visible ? 'Hide' : 'Show'}
                     </button>
                   </div>
                )}
              </div>

              {/* Vector Mask Controls */}
              <div>
                <h3 className="text-[10px] text-gray-400 font-bold uppercase mb-2">Vector Mask</h3>
                {!layer.vectorMask ? (
                   <button 
                     onClick={() => onChange({ vectorMask: { pathAnchors: [], pathClosed: false, visible: true, inverted: false }, activeEditingTarget: 'vectorMask' })}
                     className="w-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded py-2 text-xs font-bold transition-colors"
                   >
                     + Add Vector Mask
                   </button>
                ) : (
                   <div className="flex gap-2">
                     <button 
                       onClick={() => onChange({ vectorMask: undefined, activeEditingTarget: 'image' })}
                       className="flex-1 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded py-1 text-[10px] font-bold transition-colors"
                     >
                       Remove
                     </button>
                     <button 
                       onClick={() => onChange({ vectorMask: { ...layer.vectorMask!, inverted: !layer.vectorMask!.inverted } })}
                       className={`flex-1 border rounded py-1 text-[10px] font-bold transition-colors ${layer.vectorMask?.inverted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-gray-300 border-white/10'}`}
                     >
                       {layer.vectorMask?.inverted ? 'Inverted' : 'Invert'}
                     </button>
                     <button 
                       onClick={() => onChange({ vectorMask: { ...layer.vectorMask!, visible: !layer.vectorMask!.visible } })}
                       className="flex-1 bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 rounded py-1 text-[10px] font-bold transition-colors"
                     >
                       {layer.vectorMask?.visible ? 'Hide' : 'Show'}
                     </button>
                   </div>
                )}
              </div>

            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}

export default function ImageEditorWorkspace({ nodeId, nodes, edges, setNodes, onExit }: WorkspaceProps) {
  const node = nodes.find(n => n.id === nodeId);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [layers, setLayers] = useState<LayerData[]>([]);
  
  const [canvasSettings, setCanvasSettings] = useState({
    fillBackground: node?.data?.canvasSettings?.fillBackground || false,
    backgroundColor: node?.data?.canvasSettings?.backgroundColor || '#000000',
    backgroundOpacity: node?.data?.canvasSettings?.backgroundOpacity ?? 1,
  });
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [layerImages, setLayerImages] = useState<Record<string, { src: string, width: number, height: number }>>({});
  const [globalSelection, setGlobalSelection] = useState<{
    type: 'marquee' | 'lasso' | 'path';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    points?: number[];
    pathAnchors?: AnchorPoint[];
  } | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | null>(null);
  
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [brushSettings, setBrushSettings] = useState({ size: 20, opacity: 100, hardness: 100 });
  const [viewport, setViewport] = useState({ panX: 0, panY: 0, zoom: 1 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isDrawing = useRef(false);
  const isMiddlePanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  
  const penDrawState = useRef<{
    isDrawing: boolean;
    activePointIndex: number;
    initialMousePos: { x: number, y: number };
    layerId?: string;
  }>({ isDrawing: false, activePointIndex: -1, initialMousePos: { x: 0, y: 0 } });

  const [historyState, setHistoryState] = useState<{
    stack: { layers: LayerData[], settings: typeof canvasSettings }[],
    index: number
  }>({ stack: [], index: -1 });

  // Initialize Layer Data
  useEffect(() => {
    if (!node) return;
    
    const imageInputs: string[] = (node.data.imageInputs && node.data.imageInputs.length > 0) ? node.data.imageInputs : ["image-0"];
    const savedLayers: any[] = node.data.layers || [];
    const newLayerImages: Record<string, { src: string, width: number, height: number }> = {};
    
    let loadedCount = 0;
    const totalToLoad = imageInputs.length;
    
    const finishInit = () => {
      const mergedLayers: LayerData[] = imageInputs.map((handleId, index) => {
        const existing = savedLayers.find(l => l.id === handleId);
        if (existing) {
          return {
            ...existing,
            scaleX: existing.scaleX !== undefined ? existing.scaleX : (existing.scale !== undefined ? existing.scale : 1),
            scaleY: existing.scaleY !== undefined ? existing.scaleY : (existing.scale !== undefined ? existing.scale : 1),
          };
        }
        
        return {
          id: handleId,
          name: `Layer ${index + 1}`,
          x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: index, visible: true
        };
      });
      
      // Preserve any saved layers that are NOT external image inputs (e.g., text, shapes). Orphaned handles are filtered out.
      const nonImageLayers = savedLayers.filter(l => !imageInputs.includes(l.id) && !l.id.startsWith('image-'));
      mergedLayers.push(...nonImageLayers);
      
      setLayers(mergedLayers);
      setHistoryState({
        stack: [{ layers: JSON.parse(JSON.stringify(mergedLayers)), settings: JSON.parse(JSON.stringify(canvasSettings)) }],
        index: 0
      });

      if (!selectedLayerId && mergedLayers.length > 0) {
        setSelectedLayerId(mergedLayers[mergedLayers.length - 1].id);
      }
    };

    if (totalToLoad === 0) finishInit();

    imageInputs.forEach(handleId => {
      const edge = edges.find(e => e.target === nodeId && e.targetHandle === handleId);
      if (edge) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          const imgUrl = sourceNode.data.image || sourceNode.data.outputImage || "";
          if (imgUrl) {
            const img = new Image();
            img.onload = () => {
              newLayerImages[handleId] = { src: imgUrl, width: img.width, height: img.height };
              setLayerImages({ ...newLayerImages });
              loadedCount++;
              if (loadedCount === totalToLoad) finishInit();
            };
            img.onerror = () => {
              loadedCount++;
              if (loadedCount === totalToLoad) finishInit();
            };
            img.src = imgUrl;
            return;
          }
        }
      }
      loadedCount++;
      if (loadedCount === totalToLoad) finishInit();
    });
  }, []); 

  // Watch Container Dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setDimensions({
        width: entries[0].contentRect.width,
        height: entries[0].contentRect.height,
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);



  // Auto-sync
  const saveLayersToNode = useCallback(async (newLayers: LayerData[], updatedSettings?: any, skipHistory: boolean = false) => {
    const currentSettings = updatedSettings || canvasSettings;
    setLayers(newLayers);
    
    if (!skipHistory) {
      setHistoryState(prev => {
        const sliced = prev.stack.slice(0, prev.index + 1);
        return {
          stack: [...sliced, { layers: JSON.parse(JSON.stringify(newLayers)), settings: JSON.parse(JSON.stringify(currentSettings)) }],
          index: prev.index + 1
        };
      });
    }
    
    let outputImage = node?.data.outputImage;
    try {
      const inputs = { textInputs: [], imageInputs: [], namedInputs: {} as any };
      for (const layer of newLayers) {
         if (layerImages[layer.id]) {
            inputs.namedInputs[layer.id] = { image: layerImages[layer.id].src };
         }
      }
      
      const nodeData = node ? node.data : {};
      const result = await executeNode('imageEditor', { ...nodeData, layers: newLayers, canvasSettings: currentSettings }, inputs, {});
      if (result.success && result.data?.image) {
         outputImage = result.data.image;
      }
    } catch (e) {
      console.warn("Failed to auto-update composite", e);
    }
    
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, layers: newLayers, canvasSettings: currentSettings, outputImage, image: outputImage } } : n));
  }, [nodeId, setNodes, node, layerImages, canvasSettings]);

  // History Navigation
  const undo = useCallback(() => {
    setHistoryState(prev => {
      if (prev.index > 0) {
        const newIndex = prev.index - 1;
        const state = prev.stack[newIndex];
        const clonedLayers = JSON.parse(JSON.stringify(state.layers));
        const clonedSettings = JSON.parse(JSON.stringify(state.settings));
        setLayers(clonedLayers);
        setCanvasSettings(clonedSettings);
        saveLayersToNode(clonedLayers, clonedSettings, true);
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  }, [saveLayersToNode]);

  const redo = useCallback(() => {
    setHistoryState(prev => {
      if (prev.index < prev.stack.length - 1) {
        const newIndex = prev.index + 1;
        const state = prev.stack[newIndex];
        const clonedLayers = JSON.parse(JSON.stringify(state.layers));
        const clonedSettings = JSON.parse(JSON.stringify(state.settings));
        setLayers(clonedLayers);
        setCanvasSettings(clonedSettings);
        saveLayersToNode(clonedLayers, clonedSettings, true);
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  }, [saveLayersToNode]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      
      if (key === 'v') setToolMode("select");
      if (key === 'h') setToolMode("pan");
      if (key === 'z') setToolMode("zoom");
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const updateCanvasSettings = useCallback((updates: Partial<typeof canvasSettings>) => {
     const newSettings = { ...canvasSettings, ...updates };
     setCanvasSettings(newSettings);
     saveLayersToNode(layers, newSettings);
  }, [canvasSettings, layers, saveLayersToNode]);

  // Viewport Wheel Handling
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    if (e.evt.ctrlKey || e.evt.metaKey || toolMode === "zoom") {
      const scaleBy = 1.1;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

      setViewport({
        zoom: newScale,
        panX: pointer.x - mousePointTo.x * newScale,
        panY: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      setViewport({
        ...viewport,
        panX: viewport.panX - e.evt.deltaX,
        panY: viewport.panY - e.evt.deltaY,
      });
    }
  };

  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  const reorderLayers = (draggedId: string, targetId: string, position: 'top' | 'bottom') => {
    if (draggedId === targetId) return;
    
    let newSorted = [...sortedLayers];
    const draggedIdx = newSorted.findIndex(l => l.id === draggedId);
    if (draggedIdx < 0) return;
    
    const [draggedLayer] = newSorted.splice(draggedIdx, 1);
    
    const targetIdx = newSorted.findIndex(l => l.id === targetId);
    if (targetIdx < 0) return;
    
    const insertIdx = position === 'top' ? targetIdx : targetIdx + 1;
    newSorted.splice(insertIdx, 0, draggedLayer);
    
    const updatedLayers = [...layers];
    newSorted.reverse().forEach((l, i) => {
       const actualLayer = updatedLayers.find(ll => ll.id === l.id);
       if (actualLayer) actualLayer.zIndex = i;
    });
    
    saveLayersToNode(updatedLayers);
  };

  let maxWidth = 0;
  let maxHeight = 0;
  for (const layer of layers) {
    if (layerImages[layer.id]) {
      const img = layerImages[layer.id];
      if (img.width > maxWidth) maxWidth = img.width;
      if (img.height > maxHeight) maxHeight = img.height;
    }
  }
  if (maxWidth === 0 || maxHeight === 0) {
    maxWidth = 1024;
    maxHeight = 1024;
  }

  return (
    <div className="absolute inset-0 bg-[#0f0a14] text-white flex flex-col overflow-hidden select-none">
      <div className="h-14 bg-[#1a1525] border-b border-emerald-500/20 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="p-2 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 rounded">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h1 className="font-bold uppercase tracking-widest text-sm text-emerald-100">Image Editor</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="flex items-center bg-black/20 border border-emerald-500/20 rounded mr-2">
            <button 
              onClick={undo}
              disabled={historyState.index <= 0}
              className={`p-2 transition-colors ${historyState.index <= 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-black/40'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-emerald-500/20" />
            <button 
              onClick={redo}
              disabled={historyState.index >= historyState.stack.length - 1}
              className={`p-2 transition-colors ${historyState.index >= historyState.stack.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-black/40'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Canvas Settings */}
          <div className="flex items-center gap-2 relative">
            <span className="text-xs text-gray-400 font-bold tracking-wider">BG</span>
            <button 
              onClick={() => updateCanvasSettings({ fillBackground: !canvasSettings.fillBackground })}
              className={`w-10 h-5 rounded-full relative transition-colors ${canvasSettings.fillBackground ? 'bg-emerald-500' : 'bg-gray-600'}`}
              title="Toggle Background Fill"
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${canvasSettings.fillBackground ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <div className="w-px h-4 bg-emerald-500/20 mx-1" />
            <button 
              onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
              className="flex items-center gap-2 p-2 px-3 text-xs font-bold text-gray-300 hover:text-white bg-black/20 hover:bg-black/40 border border-emerald-500/20 rounded transition-colors"
            >
              <Settings className="w-4 h-4" />
              SETTINGS
            </button>
          
          {settingsMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-[#15101f] border border-emerald-500/30 rounded-lg shadow-xl p-4 z-50">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-500/20 pb-2 mb-3">Background Color</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-300">Color</label>
                  <input type="color" 
                    value={canvasSettings.backgroundColor}
                    onChange={(e) => updateCanvasSettings({ backgroundColor: e.target.value })}
                    className={`w-8 h-8 bg-transparent border-0 p-0 cursor-pointer`}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-300">Opacity</label>
                    <span className="text-xs font-mono text-emerald-400">{Math.round(canvasSettings.backgroundOpacity * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="1" step="0.01" 
                    value={canvasSettings.backgroundOpacity} 
                    onChange={(e) => updateCanvasSettings({ backgroundOpacity: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500" 
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Inspector Panel (Left Sidebar) */}
        <InspectorPanel 
           layer={layers.find(l => l.id === selectedLayerId)!}
           image={selectedLayerId ? layerImages[selectedLayerId] : null}
           onChange={(updates) => {
             if (!selectedLayerId) return;
             const newLayers = layers.map(l => l.id === selectedLayerId ? { ...l, ...updates } : l);
             saveLayersToNode(newLayers);
           }}
        />

        {/* Toolbar */}
        <div className="w-12 bg-[#1a1525] border-r border-emerald-500/20 flex flex-col items-center py-4 gap-4 z-40">
          <button onClick={() => setToolMode("select")} className={`p-2 rounded-lg ${toolMode === "select" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Select (V)"><MousePointer2 className="w-5 h-5" /></button>
          <div className="w-6 h-px bg-white/10 my-1" />

          <button onClick={() => setToolMode("marquee")} className={`p-2 rounded-lg ${toolMode === "marquee" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Marquee Selection (M)"><SquareDashed className="w-5 h-5" /></button>
          <button onClick={() => setToolMode("lasso")} className={`p-2 rounded-lg ${toolMode === "lasso" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Lasso Selection (L)"><Lasso className="w-5 h-5" /></button>
          <div className="w-6 h-px bg-white/10 my-1" />

          <button onClick={() => setToolMode("brush")} className={`p-2 rounded-lg ${toolMode === "brush" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Brush (B)"><Brush className="w-5 h-5" /></button>
          <button onClick={() => setToolMode("pen")} className={`p-2 rounded-lg ${toolMode === "pen" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`} title="Pen Tool (P)"><PenTool className="w-5 h-5" /></button>
          <div className="w-6 h-px bg-white/10 my-1" />
          <button onClick={() => {
             const newId = `text-layer-${Date.now()}`;
             const nl: any = [...layers, {
                id: newId,
                name: `Text Layer`,
                type: 'text',
                text: 'New Text',
                fontSize: 48,
                fontFamily: 'Arial',
                fill: '#ffffff',
                x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: layers.length, visible: true
             }];
             setLayers(nl);
             saveLayersToNode(nl);
             setSelectedLayerId(newId);
             setToolMode("select");
          }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-emerald-500/20" title="Add Text"><Type className="w-5 h-5" /></button>
          
          <button onClick={() => {
             const newId = `shape-layer-${Date.now()}`;
             const nl: any = [...layers, {
                id: newId,
                name: `Rectangle`,
                type: 'shape',
                shapeType: 'rect',
                fill: '#10b981',
                width: 200,
                height: 200,
                x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: layers.length, visible: true
             }];
             setLayers(nl);
             saveLayersToNode(nl);
             setSelectedLayerId(newId);
             setToolMode("select");
          }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-emerald-500/20" title="Add Shape"><Square className="w-5 h-5" /></button>
          
          <button onClick={() => {
             const newId = `shape-layer-${Date.now()}`;
             const nl: any = [...layers, {
                id: newId,
                name: `Path Shape`,
                type: 'shape',
                shapeType: 'path',
                pathAnchors: [],
                pathClosed: false,
                fill: 'transparent',
                stroke: '#10b981',
                strokeWidth: 5,
                x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: layers.length, visible: true
             }];
             setLayers(nl);
             saveLayersToNode(nl);
             setSelectedLayerId(newId);
             setToolMode("pen");
             penDrawState.current = { isDrawing: false, activePointIndex: -1, initialMousePos: { x: 0, y: 0 }, layerId: newId };
          }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-emerald-500/20" title="Add Path"><PenTool className="w-5 h-5" /></button>
          

        </div>
        {/* Central Canvas */}
        <div 
          className="flex-1 relative overflow-hidden"
          style={{ backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`, backgroundSize: '32px 32px' }}
          ref={containerRef}
        >
          {dimensions.width > 0 && (
            <Stage 
               width={dimensions.width} 
               height={dimensions.height}
               onWheel={handleWheel}
               draggable={toolMode === "pan"}
               onDragStart={(e) => {
                  if (e.evt && e.evt.button === 1) {
                     e.target.stopDrag();
                  }
               }}
               onDragEnd={(e) => {
                  if (e.target === e.target.getStage()) {
                     setViewport({ ...viewport, panX: e.target.x(), panY: e.target.y() });
                  }
               }}
               x={viewport.panX}
               y={viewport.panY}
               scaleX={viewport.zoom}
               scaleY={viewport.zoom}
               onMouseDown={(e) => {
                  if (e.evt.button === 1) {
                     e.evt.preventDefault();
                     isMiddlePanning.current = true;
                     lastMousePos.current = { x: e.evt.clientX, y: e.evt.clientY };
                     return;
                  }
                  if (e.evt.button !== 0) return;

                  if (e.target === e.target.getStage() && (toolMode === "select" || (toolMode === "pen" && (e.evt.ctrlKey || e.evt.metaKey)))) {
                     setSelectedLayerId(null);
                     return;
                  }
                  
                  if (toolMode === "pen") {
                     if (e.evt.ctrlKey || e.evt.metaKey) return; // Allow onClick to handle shape selection
                     
                     const stage = e.target.getStage();
                     if (!stage) return;
                     const pos = stage.getPointerPosition();
                     if (!pos) return;
                     const relativeX = (pos.x - viewport.panX) / viewport.zoom - dimensions.width / 2;
                     const relativeY = (pos.y - viewport.panY) / viewport.zoom - dimensions.height / 2;
                   
                     const activeLayer = layers.find(l => l.id === selectedLayerId);
                     const isEditingMask = activeLayer?.activeEditingTarget === 'vectorMask';
                     
                     const img = activeLayer ? layerImages[activeLayer.id] : undefined;
                     const w = img ? img.width : (activeLayer?.width || 0);
                     const h = img ? img.height : (activeLayer?.height || 0);
                     
                     let targetAnchors: AnchorPoint[] | undefined;
                     let targetClosed = false;
                     
                     const node = new Konva.Group({
                        x: activeLayer?.x || 0, y: activeLayer?.y || 0, 
                        scaleX: activeLayer?.scaleX !== undefined ? activeLayer.scaleX : 1, 
                        scaleY: activeLayer?.scaleY !== undefined ? activeLayer.scaleY : 1,
                        rotation: activeLayer?.rotation || 0,
                        offsetX: activeLayer?.type === 'image' || img ? w/2 : 0,
                        offsetY: activeLayer?.type === 'image' || img ? h/2 : 0
                     });
                     
                     // Convert click point to layer's local space
                     const localPt = activeLayer ? node.getTransform().copy().invert().point({ x: relativeX, y: relativeY }) : { x: relativeX, y: relativeY };
                     const newPt: AnchorPoint = { x: localPt.x, y: localPt.y, type: 'sharp' };

                     if (isEditingMask && activeLayer?.vectorMask) {
                        targetAnchors = activeLayer.vectorMask.pathAnchors;
                        targetClosed = !!activeLayer.vectorMask.pathClosed;
                     } else if (activeLayer?.shapeType === 'path') {
                        targetAnchors = activeLayer.pathAnchors;
                        targetClosed = !!activeLayer.pathClosed;
                     }
                     
                     // Check for closure
                     if (targetAnchors && targetAnchors.length > 2 && !targetClosed) {
                       const firstPt = targetAnchors[0];
                       const dist = Math.hypot(firstPt.x - localPt.x, firstPt.y - localPt.y);
                       // We use absolute distance for hit detection
                       const globalFirstPt = node.getTransform().point(firstPt);
                       const globalDist = Math.hypot(globalFirstPt.x - relativeX, globalFirstPt.y - relativeY);
                       
                       if (globalDist < 10 / viewport.zoom) {
                         const nl = layers.map(l => {
                            if (l.id === selectedLayerId) {
                               if (isEditingMask) return { ...l, vectorMask: { ...l.vectorMask!, pathClosed: true } };
                               return { ...l, pathClosed: true };
                            }
                            return l;
                         });
                         setLayers(nl);
                         return;
                       }
                     }
                   
                     if (targetAnchors && !targetClosed) {
                       const newAnchors = [...targetAnchors, newPt];
                       const nl = layers.map(l => {
                          if (l.id === selectedLayerId) {
                             if (isEditingMask) return { ...l, vectorMask: { ...l.vectorMask!, pathAnchors: newAnchors } };
                             return { ...l, pathAnchors: newAnchors };
                          }
                          return l;
                       });
                       setLayers(nl);
                       penDrawState.current = { isDrawing: true, activePointIndex: newAnchors.length - 1, initialMousePos: { x: relativeX, y: relativeY }, layerId: selectedLayerId! };
                     } else {
                       if (activeLayer?.type === 'shape' || isEditingMask) {
                          return;
                       }
                       const newId = `shape-layer-${Date.now()}`;
                       const newLayer: any = {
                          id: newId, name: `Path Shape`, type: 'shape', shapeType: 'path',
                          pathAnchors: [newPt], pathClosed: false,
                          fill: 'transparent', stroke: '#10b981', strokeWidth: 5,
                          x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: layers.length, visible: true
                       };
                       const nl = [...layers, newLayer];
                       setLayers(nl);
                       setSelectedLayerId(newId);
                       penDrawState.current = { isDrawing: true, activePointIndex: 0, initialMousePos: { x: relativeX, y: relativeY }, layerId: newId };
                     }
                     return;
                  }

                  if (toolMode === "marquee" || toolMode === "lasso") {
                     isDrawing.current = true;
                     const stage = e.target.getStage();
                     if (!stage) return;
                     const pos = stage.getPointerPosition();
                     if (!pos) return;
                     const relativeX = (pos.x - viewport.panX) / viewport.zoom - dimensions.width / 2;
                     const relativeY = (pos.y - viewport.panY) / viewport.zoom - dimensions.height / 2;
                     
                     if (toolMode === "marquee") {
                        setGlobalSelection({ type: 'marquee', x: relativeX, y: relativeY, width: 0, height: 0 });
                     } else {
                        setGlobalSelection({ type: 'lasso', points: [relativeX, relativeY] });
                     }
                     return;
                  }
                  if (toolMode === "brush") {
                     isDrawing.current = true;
                     const stage = e.target.getStage();
                     if (!stage) return;
                     const pos = stage.getPointerPosition();
                     if (!pos) return;
                     const relativeX = (pos.x - viewport.panX) / viewport.zoom - dimensions.width / 2;
                     const relativeY = (pos.y - viewport.panY) / viewport.zoom - dimensions.height / 2;
                     
                     const activeLayer = layers.find(l => l.id === selectedLayerId);
                     
                     if (activeLayer && activeLayer.activeEditingTarget === 'rasterMask') {
                       const img = layerImages[activeLayer.id];
                       const w = img ? img.width : (activeLayer.width || 0);
                       const h = img ? img.height : (activeLayer.height || 0);
                       const node = new Konva.Group({
                          x: activeLayer.x || 0, y: activeLayer.y || 0, scaleX: activeLayer.scaleX !== undefined ? activeLayer.scaleX : 1, scaleY: activeLayer.scaleY !== undefined ? activeLayer.scaleY : 1,
                          rotation: activeLayer.rotation || 0,
                          offsetX: activeLayer.type === 'image' || img ? w/2 : 0,
                          offsetY: activeLayer.type === 'image' || img ? h/2 : 0
                       });
                       const transform = node.getTransform().copy().invert();
                       const localPt = transform.point({ x: relativeX, y: relativeY });
                       
                       const newLines = activeLayer.rasterMask?.lines ? [...activeLayer.rasterMask.lines] : [];
                       newLines.push({ points: [localPt.x, localPt.y], size: brushSettings.size, opacity: brushSettings.opacity, hardness: brushSettings.hardness, mode: e.evt.altKey ? 'restore' : 'erase' });

                       const nl = layers.map(l => l.id === selectedLayerId ? { ...l, rasterMask: { ...l.rasterMask!, lines: newLines, visible: true, inverted: !!l.rasterMask?.inverted } } : l);
                       setLayers(nl);
                     } else if (activeLayer && activeLayer.type === 'brush') {
                       const layerX = activeLayer.x || 0;
                       const layerY = activeLayer.y || 0;
                       const ptX = (relativeX - layerX) / (activeLayer.scaleX || 1);
                       const ptY = (relativeY - layerY) / (activeLayer.scaleY || 1);
                       
                       const newLines = activeLayer.lines ? [...activeLayer.lines] : [];
                       newLines.push({ points: [ptX, ptY], size: brushSettings.size, opacity: brushSettings.opacity, hardness: brushSettings.hardness });

                       const nl = layers.map(l => l.id === selectedLayerId ? { ...l, lines: newLines } : l);
                       setLayers(nl);
                     } else {
                       const newId = `brush-layer-${Date.now()}`;
                       const newLayer: any = {
                          id: newId,
                          name: `Brush Layer`,
                          type: 'brush',
                          points: [],
                          lines: [{ points: [relativeX, relativeY], size: brushSettings.size, opacity: brushSettings.opacity, hardness: brushSettings.hardness }],
                          stroke: '#10b981',
                          strokeWidth: 5,
                          tension: 0.5,
                          x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: layers.length, visible: true
                       };
                       const nl = [...layers, newLayer];
                       setLayers(nl);
                       setSelectedLayerId(newId);
                     }
                  }
               }}
               onMouseMove={(e) => {
                  if (isMiddlePanning.current) {
                     e.evt.preventDefault();
                     const dx = e.evt.clientX - lastMousePos.current.x;
                     const dy = e.evt.clientY - lastMousePos.current.y;
                     lastMousePos.current = { x: e.evt.clientX, y: e.evt.clientY };
                     setViewport(prev => ({ 
                       ...prev, 
                       panX: prev.panX + dx, 
                       panY: prev.panY + dy 
                     }));
                     return;
                  }

                  if (toolMode === "pen" && penDrawState.current.isDrawing) {
                     const stage = e.target.getStage();
                     if (!stage) return;
                     const pos = stage.getPointerPosition();
                     if (!pos) return;
                     const relativeX = (pos.x - viewport.panX) / viewport.zoom - dimensions.width / 2;
                     const relativeY = (pos.y - viewport.panY) / viewport.zoom - dimensions.height / 2;
                   
                     const dx = relativeX - penDrawState.current.initialMousePos.x;
                     const dy = relativeY - penDrawState.current.initialMousePos.y;
                   
                     if (Math.hypot(dx, dy) > 2 / viewport.zoom) {
                       setLayers(prev => prev.map(l => {
                          const targetLayerId = penDrawState.current.layerId || selectedLayerId;
                          if (l.id !== targetLayerId) return l;
                          const isEditingMask = l.activeEditingTarget === 'vectorMask';
                          
                          let targetAnchors = isEditingMask ? l.vectorMask?.pathAnchors : l.pathAnchors;
                          if (!targetAnchors) return l;
                          
                          // Transform dx/dy into local space of the layer
                          const img = layerImages[l.id];
                          const w = img ? img.width : (l.width || 0);
                          const h = img ? img.height : (l.height || 0);
                          const node = new Konva.Group({
                             x: l.x || 0, y: l.y || 0, scaleX: l.scaleX !== undefined ? l.scaleX : 1, scaleY: l.scaleY !== undefined ? l.scaleY : 1,
                             rotation: l.rotation || 0,
                             offsetX: l.type === 'image' || img ? w/2 : 0,
                             offsetY: l.type === 'image' || img ? h/2 : 0
                          });
                          const transform = node.getTransform().copy().invert();
                          const localCurrentPos = transform.point({ x: relativeX, y: relativeY });
                          
                          const anchors = [...targetAnchors];
                          const i = penDrawState.current.activePointIndex;
                          if (i < 0 || i >= anchors.length || !anchors[i]) return l;
                          
                          // The handleOut is simply the local mouse position
                          // The handleIn is mirrored
                          const localDx = localCurrentPos.x - anchors[i].x;
                          const localDy = localCurrentPos.y - anchors[i].y;
                          
                          anchors[i] = {
                            ...anchors[i],
                            type: 'smooth',
                            handleOut: { x: localCurrentPos.x, y: localCurrentPos.y },
                            handleIn: { x: anchors[i].x - localDx, y: anchors[i].y - localDy }
                          };
                                                    
                          if (isEditingMask) return { ...l, vectorMask: { ...l.vectorMask!, pathAnchors: anchors } };
                          return { ...l, pathAnchors: anchors };
                       }));
                     }
                     return;
                  }

                  if (isDrawing.current && (toolMode === "marquee" || toolMode === "lasso")) {
                     const stage = e.target.getStage();
                     if (!stage) return;
                     const pos = stage.getPointerPosition();
                     if (!pos) return;
                     const relativeX = (pos.x - viewport.panX) / viewport.zoom - dimensions.width / 2;
                     const relativeY = (pos.y - viewport.panY) / viewport.zoom - dimensions.height / 2;
                     
                     setGlobalSelection(prev => {
                        if (!prev) return prev;
                        if (prev.type === 'marquee' && prev.x !== undefined && prev.y !== undefined) {
                           return { ...prev, width: relativeX - prev.x, height: relativeY - prev.y };
                        }
                        if (prev.type === 'lasso' && prev.points) {
                           return { ...prev, points: [...prev.points, relativeX, relativeY] };
                        }
                        return prev;
                     });
                     return;
                  }

                  if (!isDrawing.current || toolMode !== "brush" || !selectedLayerId) return;
                  const stage = e.target.getStage();
                  if (!stage) return;
                  const pos = stage.getPointerPosition();
                  if (!pos) return;
                  const relativeX = (pos.x - viewport.panX) / viewport.zoom - dimensions.width / 2;
                  const relativeY = (pos.y - viewport.panY) / viewport.zoom - dimensions.height / 2;
                  
                  setLayers(prev => prev.map(l => {
                     if (l.id === selectedLayerId && l.activeEditingTarget === 'rasterMask') {
                        const img = layerImages[l.id];
                        const w = img ? img.width : (l.width || 0);
                        const h = img ? img.height : (l.height || 0);
                        const node = new Konva.Group({
                           x: l.x || 0, y: l.y || 0, scaleX: l.scaleX !== undefined ? l.scaleX : 1, scaleY: l.scaleY !== undefined ? l.scaleY : 1,
                           rotation: l.rotation || 0,
                           offsetX: l.type === 'image' || img ? w/2 : 0,
                           offsetY: l.type === 'image' || img ? h/2 : 0
                        });
                        const transform = node.getTransform().copy().invert();
                        const localPt = transform.point({ x: relativeX, y: relativeY });

                        const lines = l.rasterMask?.lines ? [...l.rasterMask.lines] : [];
                        if (lines.length > 0) {
                            const lastLine = { ...lines[lines.length - 1] };
                            lastLine.points = [...lastLine.points, localPt.x, localPt.y];
                            lines[lines.length - 1] = lastLine;
                        }
                        return { ...l, rasterMask: { ...l.rasterMask!, lines, visible: true, inverted: !!l.rasterMask?.inverted } };
                     } else if (l.id === selectedLayerId && l.type === 'brush') {
                        const layerX = l.x || 0;
                        const layerY = l.y || 0;
                        const ptX = (relativeX - layerX) / (l.scaleX || 1);
                        const ptY = (relativeY - layerY) / (l.scaleY || 1);

                        const lines = l.lines ? [...l.lines] : [];
                        if (lines.length > 0) {
                            const lastLine = { ...lines[lines.length - 1] };
                            lastLine.points = [...lastLine.points, ptX, ptY];
                            lines[lines.length - 1] = lastLine;
                        }
                        return { ...l, lines };
                     }
                     return l;
                  }));
               }}
               onMouseUp={(e) => {
                  if (e.evt.button === 1) {
                     isMiddlePanning.current = false;
                     return;
                  }
                  if (e.evt.button !== 0) return;

                  if (toolMode === "pen") {
                     penDrawState.current.isDrawing = false;
                  }

                  if (isDrawing.current && (toolMode === "marquee" || toolMode === "lasso")) {
                     isDrawing.current = false;
                     return;
                  }

                  if (isDrawing.current && toolMode === "brush") {
                     isDrawing.current = false;
                     // Save final state to Node, but wait a tick for latest layers state
                     setTimeout(() => {
                        setLayers(currentLayers => {
                           saveLayersToNode(currentLayers);
                           return currentLayers;
                        });
                     }, 0);
                  }
               }}
            >
               <Layer>
                 <Group x={dimensions.width / 2} y={dimensions.height / 2}>
                   {canvasSettings.fillBackground && (
                      <Rect
                        x={-100000}
                        y={-100000}
                        width={200000}
                        height={200000}
                        fill={canvasSettings.backgroundColor}
                        opacity={canvasSettings.backgroundOpacity}
                        listening={false}
                      />
                   )}
                   {[...layers].sort((a, b) => a.zIndex - b.zIndex).map(layer => {
                     if (!layer.visible) return null;
                     
                     if (layer.type === 'text') {
                        return (
                           <TextLayerRenderer
                              key={layer.id}
                              layer={layer}
                              isSelected={selectedLayerId === layer.id}
                              isInteractive={toolMode === 'select'}
                              onSelect={() => { if (toolMode === 'select') setSelectedLayerId(layer.id); }}
                              onChange={(updates: any) => {
                                const nl = layers.map(l => l.id === layer.id ? { ...l, ...updates } : l);
                                setLayers(nl);
                                saveLayersToNode(nl);
                              }}
                           />
                        );
                     }

                     if (layer.type === 'shape') {
                        return (
                           <ShapeLayerRenderer
                              key={layer.id}
                              layer={layer}
                              isSelected={selectedLayerId === layer.id}
                              isInteractive={toolMode === 'select'}
                              onSelect={() => { if (toolMode === 'select') setSelectedLayerId(layer.id); }}
                              onChange={(updates: any) => {
                                const nl = layers.map(l => l.id === layer.id ? { ...l, ...updates } : l);
                                setLayers(nl);
                                saveLayersToNode(nl);
                              }}
                           />
                        );
                     }

                     if (layer.type === 'brush') {
                        return (
                           <BrushLayerRenderer
                              key={layer.id}
                              layer={layer}
                              isSelected={selectedLayerId === layer.id}
                              isInteractive={toolMode === 'select'}
                              onSelect={() => { if (toolMode === 'select') setSelectedLayerId(layer.id); }}
                              onChange={(updates: any) => {
                                const nl = layers.map(l => l.id === layer.id ? { ...l, ...updates } : l);
                                setLayers(nl);
                                saveLayersToNode(nl);
                              }}
                           />
                        );
                     }
                     
                     if (!layerImages[layer.id]) return null;
                     return (
                        <URLImage 
                           key={layer.id}
                           layer={layer}
                           url={layerImages[layer.id].src}
                           width={layerImages[layer.id].width}
                           height={layerImages[layer.id].height}
                           isSelected={selectedLayerId === layer.id}
                           isInteractive={toolMode === "select"}
                           onSelect={() => setSelectedLayerId(layer.id)}
                           onChange={(updates: any) => {
                             const newLayers = layers.map(l => l.id === layer.id ? { ...l, ...updates } : l);
                             saveLayersToNode(newLayers);
                           }}
                        />
                     )
                   })}
                   
                   {/* Render Global Selection overlay */}
                   {globalSelection && globalSelection.type === 'marquee' && globalSelection.x !== undefined && globalSelection.y !== undefined && (
                      <Rect
                         x={globalSelection.x}
                         y={globalSelection.y}
                         width={globalSelection.width || 0}
                         height={globalSelection.height || 0}
                         stroke="#ffffff"
                         strokeWidth={1 / viewport.zoom}
                         dash={[5 / viewport.zoom, 5 / viewport.zoom]}
                         listening={false}
                      />
                   )}
                   {globalSelection && globalSelection.type === 'lasso' && globalSelection.points && globalSelection.points.length >= 4 && (
                      <Line
                         points={globalSelection.points}
                         stroke="#ffffff"
                         strokeWidth={1 / viewport.zoom}
                         dash={[5 / viewport.zoom, 5 / viewport.zoom]}
                         closed={!isDrawing.current}
                         listening={false}
                      />
                   )}

                   {/* Render PathEditorOverlay for active layer if pen tool is active */}
                   {toolMode === 'pen' && selectedLayerId && !globalSelection && (
                     (() => {
                        const activeLayer = layers.find(l => l.id === selectedLayerId);
                        if (!activeLayer) return null;
                        
                        const img = layerImages[activeLayer.id];
                        const w = img ? img.width : (activeLayer.width || 0);
                        const h = img ? img.height : (activeLayer.height || 0);
                        const transform = {
                           x: activeLayer.x || 0,
                           y: activeLayer.y || 0,
                           scaleX: activeLayer.scaleX !== undefined ? activeLayer.scaleX : 1,
                           scaleY: activeLayer.scaleY !== undefined ? activeLayer.scaleY : 1,
                           rotation: activeLayer.rotation || 0,
                           offsetX: activeLayer.type === 'image' || img ? w/2 : 0,
                           offsetY: activeLayer.type === 'image' || img ? h/2 : 0
                        };

                        if (activeLayer.shapeType === 'path' && activeLayer.pathAnchors) {
                           return (
                             <PathEditorOverlay
                               anchors={activeLayer.pathAnchors}
                               closed={!!activeLayer.pathClosed}
                               onChange={(newAnchors, closed) => {
                                  const nl = layers.map(l => l.id === selectedLayerId ? { ...l, pathAnchors: newAnchors, pathClosed: closed } : l);
                                  setLayers(nl);
                                  saveLayersToNode(nl);
                               }}
                               transform={transform}
                               isActive={true}
                               isEditingMask={false}
                             />
                           );
                        }

                        if (activeLayer.vectorMask && activeLayer.vectorMask.pathAnchors) {
                           return (
                             <PathEditorOverlay
                               anchors={activeLayer.vectorMask.pathAnchors}
                               closed={!!activeLayer.vectorMask.pathClosed}
                               onChange={(newAnchors, closed) => {
                                  const nl = layers.map(l => l.id === selectedLayerId ? { ...l, vectorMask: { ...l.vectorMask!, pathAnchors: newAnchors, pathClosed: closed } } : l);
                                  setLayers(nl);
                                  saveLayersToNode(nl);
                               }}
                               transform={transform}
                               isActive={true}
                               isEditingMask={true}
                             />
                           );
                        }
                        
                        return null;
                     })()
                   )}
                 </Group>
               </Layer>
            </Stage>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs font-mono text-gray-400 bg-black/60 px-4 py-2 rounded-full border border-white/10 backdrop-blur-sm pointer-events-none z-50">
             <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
             <span className="w-px h-4 bg-white/20" />
             <span><span className="text-white font-bold">V</span> Select</span>
             <span><span className="text-white font-bold text-[10px] border border-white/20 rounded px-1 mr-1">CTRL</span>+ Wheel Zoom</span>
             <span><span className="text-white font-bold text-[10px] border border-white/20 rounded px-1 mr-1">MMB</span> Pan</span>
          </div>

          {/* Transform Panel (Removed - Replaced by left Inspector Panel) */}
        </div>

        {/* Right Sidebar */}
        <div className="w-64 bg-[#15101f] border-l border-emerald-500/20 flex flex-col z-40">
          
          {/* Tool Properties Panel */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-emerald-500/20">
            <div className="p-3 border-b border-white/5 bg-black/20 flex justify-between items-center">
               <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tool Properties</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
               {toolMode === 'brush' ? (
                 <>
                   <div className="space-y-2">
                     <div className="flex justify-between text-xs text-gray-400">
                       <span>Size</span>
                       <span>{brushSettings.size}px</span>
                     </div>
                     <input 
                       type="range" min="1" max="200" value={brushSettings.size}
                       onChange={(e) => setBrushSettings(prev => ({ ...prev, size: parseInt(e.target.value) }))}
                       className="w-full accent-emerald-500"
                     />
                   </div>
                   <div className="space-y-2">
                     <div className="flex justify-between text-xs text-gray-400">
                       <span>Opacity</span>
                       <span>{brushSettings.opacity}%</span>
                     </div>
                     <input 
                       type="range" min="1" max="100" value={brushSettings.opacity}
                       onChange={(e) => setBrushSettings(prev => ({ ...prev, opacity: parseInt(e.target.value) }))}
                       className="w-full accent-emerald-500"
                     />
                   </div>
                   <div className="space-y-2">
                     <div className="flex justify-between text-xs text-gray-400">
                       <span>Hardness (Placeholder)</span>
                       <span>{brushSettings.hardness}%</span>
                     </div>
                     <input 
                       type="range" min="0" max="100" value={brushSettings.hardness}
                       onChange={(e) => setBrushSettings(prev => ({ ...prev, hardness: parseInt(e.target.value) }))}
                       className="w-full accent-emerald-500"
                     />
                   </div>
                 </>
               ) : (
                 <div className="text-xs text-gray-500 text-center mt-4">
                   No properties for selected tool.
                 </div>
               )}
            </div>
          </div>

          {/* Layer Panel */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-white/5 bg-black/20 flex justify-between items-center">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Layers</h2>
            <button onClick={() => {
               const newId = `blank-layer-${Date.now()}`;
               const nl: any = [...layers, {
                  id: newId,
                  name: `Blank Layer`,
                  type: 'brush',
                  points: [],
                  lines: [],
                  stroke: '#10b981',
                  strokeWidth: 5,
                  tension: 0.5,
                  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: layers.length, visible: true
               }];
               setLayers(nl);
               saveLayersToNode(nl);
               setSelectedLayerId(newId);
               setToolMode("brush");
            }} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10" title="New Layer">
               <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sortedLayers.map(layer => (
              <div 
                key={layer.id}
                draggable
                onDragStart={(e) => {
                   setDraggedLayerId(layer.id);
                   e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                   setDraggedLayerId(null);
                   setDropTargetId(null);
                   setDropPosition(null);
                }}
                onDragOver={(e) => {
                   e.preventDefault();
                   if (draggedLayerId === layer.id) return;
                   const rect = e.currentTarget.getBoundingClientRect();
                   const mid = rect.top + rect.height / 2;
                   setDropTargetId(layer.id);
                   setDropPosition(e.clientY < mid ? 'top' : 'bottom');
                }}
                onDrop={(e) => {
                   e.preventDefault();
                   if (draggedLayerId && dropTargetId && dropPosition) {
                      reorderLayers(draggedLayerId, dropTargetId, dropPosition);
                   }
                   setDraggedLayerId(null);
                   setDropTargetId(null);
                   setDropPosition(null);
                }}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`relative p-2 rounded flex items-center gap-2 cursor-pointer border transition-colors ${selectedLayerId === layer.id ? 'bg-emerald-900/30 border-emerald-500/50' : 'bg-black/20 border-transparent hover:bg-white/5'}`}
              >
                {dropTargetId === layer.id && dropPosition === 'top' && (
                   <div className="absolute top-[-1px] left-0 right-0 h-[2px] bg-amber-400 z-10" />
                )}
                {dropTargetId === layer.id && dropPosition === 'bottom' && (
                   <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-amber-400 z-10" />
                )}
                <div className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing">
                   <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex gap-1 items-center flex-shrink-0">
                  <div 
                    onClick={(e) => { e.stopPropagation(); const nl = layers.map(l => l.id === layer.id ? { ...l, activeEditingTarget: 'image' as const } : l); setLayers(nl); setSelectedLayerId(layer.id); }}
                    className={`w-10 h-10 bg-black/40 rounded flex items-center justify-center border-2 transition-colors ${selectedLayerId === layer.id && layer.activeEditingTarget !== 'rasterMask' && layer.activeEditingTarget !== 'vectorMask' ? 'border-emerald-500' : 'border-transparent'}`} 
                    style={(!layer.type || layer.type === 'image') ? { backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`, backgroundSize: '8px 8px' } : {}}
                  >
                    {(!layer.type || layer.type === 'image') && layerImages[layer.id] ? (
                       <img src={layerImages[layer.id].src} className="w-full h-full object-contain" draggable={false} />
                    ) : layer.type === 'text' ? (
                       <Type className="w-5 h-5 text-gray-400" />
                    ) : layer.type === 'shape' ? (
                       layer.shapeType === 'rect' ? <Square className="w-5 h-5 text-gray-400" /> :
                       layer.shapeType === 'circle' ? <Circle className="w-5 h-5 text-gray-400" /> :
                       <StarIcon className="w-5 h-5 text-gray-400" />
                    ) : layer.type === 'brush' ? (
                       <Brush className="w-5 h-5 text-gray-400" />
                    ) : null}
                  </div>
                  
                  {layer.rasterMask && (
                    <div 
                      onClick={(e) => { e.stopPropagation(); const nl = layers.map(l => l.id === layer.id ? { ...l, activeEditingTarget: 'rasterMask' as const } : l); setLayers(nl); setSelectedLayerId(layer.id); setToolMode("brush"); }}
                      className={`w-10 h-10 bg-white rounded flex items-center justify-center border-2 cursor-pointer transition-colors ${selectedLayerId === layer.id && layer.activeEditingTarget === 'rasterMask' ? 'border-emerald-500' : 'border-transparent'}`}
                      title="Raster Mask"
                    >
                      <div className="w-5 h-5 bg-black rounded-full opacity-50" />
                    </div>
                  )}

                  {layer.vectorMask && (
                    <div 
                      onClick={(e) => { e.stopPropagation(); const nl = layers.map(l => l.id === layer.id ? { ...l, activeEditingTarget: 'vectorMask' as const } : l); setLayers(nl); setSelectedLayerId(layer.id); setToolMode("pen"); }}
                      className={`w-10 h-10 bg-black/60 rounded flex items-center justify-center border-2 cursor-pointer transition-colors ${selectedLayerId === layer.id && layer.activeEditingTarget === 'vectorMask' ? 'border-emerald-500' : 'border-transparent'}`}
                      title="Vector Mask"
                    >
                      <PenTool className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-gray-200">{layer.name}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); const nl = layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l); saveLayersToNode(nl); }} className="p-1 hover:text-white text-gray-400">
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                {layer.type && layer.type !== 'image' && (
                  <button onClick={(e) => {
                     e.stopPropagation();
                     const nl = layers.filter(l => l.id !== layer.id);
                     saveLayersToNode(nl);
                     if (selectedLayerId === layer.id) setSelectedLayerId(null);
                  }} className="p-1 hover:text-red-400 text-gray-400" title="Delete Layer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

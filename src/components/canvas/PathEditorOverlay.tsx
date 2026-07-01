import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Group, Circle, Path as KonvaPath, Line } from 'react-konva';
import { AnchorPoint } from './ImageEditorWorkspace';

interface PathEditorOverlayProps {
  anchors: AnchorPoint[];
  closed: boolean;
  onChange: (anchors: AnchorPoint[], closed: boolean) => void;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    offsetX: number;
    offsetY: number;
  };
  isActive: boolean; // whether the pen tool is currently active
  isEditingMask?: boolean;
}

const generateSvgPath = (anchors: AnchorPoint[], closed: boolean) => {
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

export const PathEditorOverlay = ({ anchors, closed, onChange, transform, isActive, isEditingMask }: PathEditorOverlayProps) => {
  const groupRef = useRef<any>(null);
  
  // Local state for active dragging to avoid React re-renders of the main workspace
  const localAnchorsRef = useRef<AnchorPoint[]>([...anchors]);
  const localClosedRef = useRef<boolean>(closed);
  
  // We need local react state to re-render the OVERLAY (handles), but not the main workspace
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [selectedAnchorIndex, setSelectedAnchorIndex] = useState<number | null>(null);

  // Sync ref when props change
  useEffect(() => {
    localAnchorsRef.current = [...anchors];
    localClosedRef.current = closed;
    setRenderTrigger(prev => prev + 1);
  }, [anchors, closed]);

  const commitChanges = useCallback(() => {
    onChange([...localAnchorsRef.current], localClosedRef.current);
  }, [onChange]);
  
  if (!isActive) return null;

  return (
    <Group
      ref={groupRef}
      x={transform.x}
      y={transform.y}
      scaleX={transform.scaleX}
      scaleY={transform.scaleY}
      rotation={transform.rotation}
      offsetX={transform.offsetX}
      offsetY={transform.offsetY}
    >
      {/* Path preview (stroke only) */}
      <KonvaPath
        data={generateSvgPath(localAnchorsRef.current, localClosedRef.current)}
        stroke={isEditingMask ? "#10b981" : "#3b82f6"}
        strokeWidth={2 / transform.scaleX}
        hitStrokeWidth={0} // Disable hit on main path to let segments handle it
      />
      
      {/* Invisible Segment Hit-boxes for future point insertion */}
      {(() => {
        const segments = [];
        const len = localClosedRef.current ? localAnchorsRef.current.length : localAnchorsRef.current.length - 1;
        for (let i = 0; i < len; i++) {
           if (!localAnchorsRef.current[i]) continue;
           const current = localAnchorsRef.current[i];
           const next = localAnchorsRef.current[(i + 1) % localAnchorsRef.current.length];
           
           const cp1x = current.handleOut ? current.handleOut.x : current.x;
           const cp1y = current.handleOut ? current.handleOut.y : current.y;
           const cp2x = next.handleIn ? next.handleIn.x : next.x;
           const cp2y = next.handleIn ? next.handleIn.y : next.y;
           
           const d = `M ${current.x} ${current.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
           segments.push(
              <KonvaPath
                 key={`segment-${i}`}
                 data={d}
                 stroke="transparent"
                 strokeWidth={15 / transform.scaleX}
                 onMouseEnter={() => { document.body.style.cursor = 'crosshair'; }}
                 onMouseLeave={() => { document.body.style.cursor = 'default'; }}
                 onClick={(e) => {
                    e.cancelBubble = true;
                    // Future: Split bezier curve logic goes here!
                    console.log(`Ready for point insertion on segment ${i}`);
                 }}
              />
           );
        }
        return segments;
      })()}
      
      {/* Handles and Anchors */}
      {localAnchorsRef.current.map((anchor, i) => {
         const isSelected = selectedAnchorIndex === i;
         return (
           <React.Fragment key={i}>
             {/* Handle Lines */}
             {isSelected && anchor.handleIn && (
               <Line points={[anchor.x, anchor.y, anchor.handleIn.x, anchor.handleIn.y]} stroke="#a1a1aa" strokeWidth={1 / transform.scaleX} dash={[4 / transform.scaleX, 4 / transform.scaleX]} />
             )}
             {isSelected && anchor.handleOut && (
               <Line points={[anchor.x, anchor.y, anchor.handleOut.x, anchor.handleOut.y]} stroke="#a1a1aa" strokeWidth={1 / transform.scaleX} dash={[4 / transform.scaleX, 4 / transform.scaleX]} />
             )}
             
             {/* Handle In Point */}
             {isSelected && anchor.handleIn && (
               <Circle
                 x={anchor.handleIn.x}
                 y={anchor.handleIn.y}
                 radius={4 / transform.scaleX}
                 fill="#ffffff"
                 stroke="#71717a"
                 strokeWidth={1 / transform.scaleX}
                 draggable
                 onDragMove={(e: any) => {
                   const la = [...localAnchorsRef.current];
                   la[i] = { ...la[i], handleIn: { x: e.target.x(), y: e.target.y() } };
                   if (la[i].type === 'smooth' && la[i].handleOut) {
                      // Mirror handleOut
                      const dx = la[i].x - e.target.x();
                      const dy = la[i].y - e.target.y();
                      la[i].handleOut = { x: la[i].x + dx, y: la[i].y + dy };
                   }
                   localAnchorsRef.current = la;
                   setRenderTrigger(prev => prev + 1);
                 }}
                 onDragEnd={commitChanges}
               />
             )}
             
             {/* Handle Out Point */}
             {isSelected && anchor.handleOut && (
               <Circle
                 x={anchor.handleOut.x}
                 y={anchor.handleOut.y}
                 radius={4 / transform.scaleX}
                 fill="#ffffff"
                 stroke="#71717a"
                 strokeWidth={1 / transform.scaleX}
                 draggable
                 onDragMove={(e: any) => {
                   const la = [...localAnchorsRef.current];
                   la[i] = { ...la[i], handleOut: { x: e.target.x(), y: e.target.y() } };
                   if (la[i].type === 'smooth' && la[i].handleIn) {
                      // Mirror handleIn
                      const dx = la[i].x - e.target.x();
                      const dy = la[i].y - e.target.y();
                      la[i].handleIn = { x: la[i].x + dx, y: la[i].y + dy };
                   }
                   localAnchorsRef.current = la;
                   setRenderTrigger(prev => prev + 1);
                 }}
                 onDragEnd={commitChanges}
               />
             )}
             
             {/* Anchor Point */}
             <Circle
               x={anchor.x}
               y={anchor.y}
               radius={5 / transform.scaleX}
               fill={isSelected ? (isEditingMask ? "#10b981" : "#3b82f6") : "#ffffff"}
               stroke={isEditingMask ? "#10b981" : "#3b82f6"}
               strokeWidth={2 / transform.scaleX}
               draggable
               onClick={(e) => { e.cancelBubble = true; setSelectedAnchorIndex(i); }}
               onDragMove={(e: any) => {
                 const dx = e.target.x() - anchor.x;
                 const dy = e.target.y() - anchor.y;
                 const la = [...localAnchorsRef.current];
                 la[i] = { ...la[i], x: e.target.x(), y: e.target.y() };
                 if (la[i].handleIn) la[i].handleIn = { x: la[i].handleIn!.x + dx, y: la[i].handleIn!.y + dy };
                 if (la[i].handleOut) la[i].handleOut = { x: la[i].handleOut!.x + dx, y: la[i].handleOut!.y + dy };
                 localAnchorsRef.current = la;
                 setRenderTrigger(prev => prev + 1);
               }}
               onDragEnd={commitChanges}
             />
           </React.Fragment>
         );
      })}
    </Group>
  );
};

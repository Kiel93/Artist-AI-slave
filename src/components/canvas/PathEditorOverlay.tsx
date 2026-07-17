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

  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedAnchorIndex !== null && localAnchorsRef.current.length > 0) {
          const newAnchors = [...localAnchorsRef.current];
          newAnchors.splice(selectedAnchorIndex, 1);
          localAnchorsRef.current = newAnchors;
          setSelectedAnchorIndex(null);
          setRenderTrigger(prev => prev + 1);
          onChange(newAnchors, localClosedRef.current); // commit immediately
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, selectedAnchorIndex, onChange]);
  
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
                 onMouseDown={(e) => { e.cancelBubble = true; }}
                 onClick={(e) => {
                    e.cancelBubble = true;
                    const la = [...localAnchorsRef.current];
                    
                    const p0 = current;
                    const p1 = current.handleOut || current;
                    const p2 = next.handleIn || next;
                    const p3 = next;
                    
                    // De Casteljau's algorithm at t=0.5
                    const q1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
                    const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                    const r2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
                    
                    const q2 = { x: (q1.x + m.x) / 2, y: (q1.y + m.y) / 2 };
                    const r1 = { x: (m.x + r2.x) / 2, y: (m.y + r2.y) / 2 };
                    
                    const b = { x: (q2.x + r1.x) / 2, y: (q2.y + r1.y) / 2 };
                    
                    la[i] = { ...la[i], handleOut: q1 };
                    
                    const newPoint: AnchorPoint = {
                      x: b.x, y: b.y, type: 'smooth',
                      handleIn: q2,
                      handleOut: r1
                    };
                    
                    la.splice(i + 1, 0, newPoint);
                    
                    // 'next' point is now shifted by 1 index if it wasn't index 0
                    const nextIndex = (i + 1) % localAnchorsRef.current.length === 0 ? 0 : i + 2;
                    la[nextIndex] = { ...la[nextIndex], handleIn: r2 };
                    
                    localAnchorsRef.current = la;
                    setSelectedAnchorIndex(i + 1);
                    setRenderTrigger(prev => prev + 1);
                    commitChanges();
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
                 onMouseDown={(e) => { e.cancelBubble = true; }}
                 onDragMove={(e: any) => {
                   const la = [...localAnchorsRef.current];
                   if (e.evt.altKey) la[i].type = 'asymmetric';
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
                 onMouseDown={(e) => { e.cancelBubble = true; }}
                 onDragMove={(e: any) => {
                   const la = [...localAnchorsRef.current];
                   if (e.evt.altKey) la[i].type = 'asymmetric';
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
               onMouseDown={(e) => { e.cancelBubble = true; }}
               onClick={(e) => { e.cancelBubble = true; setSelectedAnchorIndex(i); }}
               onDblClick={(e) => {
                 e.cancelBubble = true;
                 const la = [...localAnchorsRef.current];
                 if (la[i].type === 'smooth' || la[i].type === 'asymmetric') {
                   la[i] = { ...la[i], type: 'sharp', handleIn: undefined, handleOut: undefined };
                 } else {
                   la[i] = { 
                     ...la[i], 
                     type: 'smooth', 
                     handleIn: { x: la[i].x - 20, y: la[i].y },
                     handleOut: { x: la[i].x + 20, y: la[i].y }
                   };
                 }
                 localAnchorsRef.current = la;
                 setRenderTrigger(prev => prev + 1);
                 commitChanges();
               }}
               onDragMove={(e: any) => {
                 const la = [...localAnchorsRef.current];
                 if (e.evt.altKey) {
                   la[i] = { 
                     ...la[i], 
                     x: anchor.x,
                     y: anchor.y, 
                     handleOut: { x: e.target.x(), y: e.target.y() },
                     handleIn: la[i].type === 'smooth' ? { x: anchor.x - (e.target.x() - anchor.x), y: anchor.y - (e.target.y() - anchor.y) } : la[i].handleIn
                   };
                   if (!la[i].handleIn) {
                     la[i].handleIn = { x: anchor.x - (e.target.x() - anchor.x), y: anchor.y - (e.target.y() - anchor.y) };
                     la[i].type = 'smooth';
                   } else if (la[i].type === 'sharp') {
                     la[i].type = 'asymmetric';
                   }
                   e.target.x(anchor.x);
                   e.target.y(anchor.y);
                 } else {
                   const dx = e.target.x() - anchor.x;
                   const dy = e.target.y() - anchor.y;
                   la[i] = { ...la[i], x: e.target.x(), y: e.target.y() };
                   if (la[i].handleIn) la[i].handleIn = { x: la[i].handleIn!.x + dx, y: la[i].handleIn!.y + dy };
                   if (la[i].handleOut) la[i].handleOut = { x: la[i].handleOut!.x + dx, y: la[i].handleOut!.y + dy };
                 }
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

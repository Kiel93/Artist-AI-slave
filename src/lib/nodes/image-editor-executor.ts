import { NodeExecutionInput, NodeExecutionContext, NodeExecutionResult } from '../node-executor';

export const executeImageEditorNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const layers = nodeData.layers || [];
  if (layers.length === 0) return { success: true, data: { image: null } };

  // Load all images
  const drawableLayers: { layer: any; img?: HTMLImageElement; width: number; height: number }[] = [];
  
  for (const layer of layers) {
    if (!layer.visible) continue;
    
    if (layer.type === 'text' || layer.type === 'shape' || layer.type === 'brush') {
      drawableLayers.push({ layer, width: 0, height: 0 });
      continue;
    }
    
    // Support both id and handleId for backward compatibility
    const layerId = layer.id || layer.handleId;
    const imageUrl = inputs.namedInputs?.[layerId]?.image;
    
    if (imageUrl) {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = imageUrl;
        });
        drawableLayers.push({ layer, img, width: img.width, height: img.height });
      } catch (e) {
        console.warn(`Failed to load image for layer ${layerId}`);
      }
    }
  }

  if (drawableLayers.length === 0) return { success: true, data: { image: null } };

  let globalMinX = Infinity;
  let globalMinY = Infinity;
  let globalMaxX = -Infinity;
  let globalMaxY = -Infinity;

  const updateBounds = (x: number, y: number) => {
    if (x < globalMinX) globalMinX = x;
    if (x > globalMaxX) globalMaxX = x;
    if (y < globalMinY) globalMinY = y;
    if (y > globalMaxY) globalMaxY = y;
  };

  for (const { layer, img, width, height } of drawableLayers) {
    const isImageLayer = layer.type === 'image' || !!img;
    const w = width || layer.width || 100;
    const h = height || layer.height || 100;
    const offsetX = isImageLayer ? w / 2 : 0;
    const offsetY = isImageLayer ? h / 2 : 0;
    
    const transformPoint = (px: number, py: number) => {
       let x = px - offsetX;
       let y = py - offsetY;
       const sx = layer.scaleX !== undefined ? layer.scaleX : (layer.scale !== undefined ? layer.scale : 1);
       const sy = layer.scaleY !== undefined ? layer.scaleY : (layer.scale !== undefined ? layer.scale : 1);
       x *= sx;
       y *= sy;
       if (layer.rotation) {
         const rad = (layer.rotation * Math.PI) / 180;
         const cos = Math.cos(rad);
         const sin = Math.sin(rad);
         const rx = x * cos - y * sin;
         const ry = x * sin + y * cos;
         x = rx;
         y = ry;
       }
       x += layer.x || 0;
       y += layer.y || 0;
       return { x, y };
    };

    if (layer.type === 'text') {
       const pts = [{x: 0, y: 0}, {x: 400, y: 0}, {x: 400, y: 100}, {x: 0, y: 100}];
       pts.forEach(p => { const tp = transformPoint(p.x, p.y); updateBounds(tp.x, tp.y); });
    } else if (layer.type === 'shape' && layer.shapeType === 'path' && layer.pathAnchors) {
       layer.pathAnchors.forEach((a: any) => {
          const tp = transformPoint(a.x, a.y);
          updateBounds(tp.x, tp.y);
          if (a.handleIn) { const thi = transformPoint(a.handleIn.x, a.handleIn.y); updateBounds(thi.x, thi.y); }
          if (a.handleOut) { const tho = transformPoint(a.handleOut.x, a.handleOut.y); updateBounds(tho.x, tho.y); }
       });
    } else if (layer.type === 'brush') {
       if (layer.points) {
         for (let i = 0; i < layer.points.length; i += 2) {
            const tp = transformPoint(layer.points[i], layer.points[i+1]);
            updateBounds(tp.x, tp.y);
         }
       }
       if (layer.lines) {
         layer.lines.forEach((line: any) => {
           if (line.points) {
             for (let i = 0; i < line.points.length; i += 2) {
                const tp = transformPoint(line.points[i], line.points[i+1]);
                updateBounds(tp.x, tp.y);
             }
           }
         });
       }
    } else {
       let bw = w, bh = h;
       let bx = 0, by = 0;
       if (layer.shapeType === 'rect') { bx = -w/2; by = -h/2; }
       if (layer.shapeType === 'circle') { bx = -(layer.radius||50); by = -(layer.radius||50); bw = (layer.radius||50)*2; bh = (layer.radius||50)*2; }
       if (layer.shapeType === 'star') { const r = layer.outerRadius||50; bx = -r; by = -r; bw = r*2; bh = r*2; }
       
       const pts = [
         {x: bx, y: by}, {x: bx+bw, y: by}, {x: bx+bw, y: by+bh}, {x: bx, y: by+bh}
       ];
       pts.forEach(p => { const tp = transformPoint(p.x, p.y); updateBounds(tp.x, tp.y); });
    }
  }

  if (globalMinX === Infinity) {
     globalMinX = -512; globalMinY = -512; globalMaxX = 512; globalMaxY = 512;
  }
  
  // Add some padding to ensure we don't clip anti-aliased edges
  globalMinX -= 20; globalMinY -= 20;
  globalMaxX += 20; globalMaxY += 20;

  // Enforce a maximum size to avoid creating ridiculously huge canvases (e.g. 10k x 10k)
  const MAX_CANVAS_DIM = 4096;
  let canvasWidth = Math.ceil(globalMaxX - globalMinX);
  let canvasHeight = Math.ceil(globalMaxY - globalMinY);
  
  if (canvasWidth > MAX_CANVAS_DIM) {
     const diff = canvasWidth - MAX_CANVAS_DIM;
     canvasWidth = MAX_CANVAS_DIM;
     globalMinX += diff / 2;
  }
  if (canvasHeight > MAX_CANVAS_DIM) {
     const diff = canvasHeight - MAX_CANVAS_DIM;
     canvasHeight = MAX_CANVAS_DIM;
     globalMinY += diff / 2;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { success: false, error: "Canvas 2D unsupported." };

    // Fill background if specified in settings
    const canvasSettings = nodeData.canvasSettings || {};
    if (canvasSettings.fillBackground && canvasSettings.backgroundColor) {
       ctx.fillStyle = canvasSettings.backgroundColor;
       ctx.globalAlpha = canvasSettings.backgroundOpacity !== undefined ? canvasSettings.backgroundOpacity : 1;
       ctx.fillRect(0, 0, canvasWidth, canvasHeight);
       ctx.globalAlpha = 1;
    }

    // Sort layers by zIndex
    drawableLayers.sort((a, b) => a.layer.zIndex - b.layer.zIndex);

    for (const { layer, img, width, height } of drawableLayers) {
      ctx.save();
      
      const centerX = -globalMinX + (layer.x || 0);
      const centerY = -globalMinY + (layer.y || 0);

      
      ctx.translate(centerX, centerY);
      if (layer.rotation) {
        ctx.rotate((layer.rotation * Math.PI) / 180);
      }
      
      const scaleX = layer.scaleX !== undefined ? layer.scaleX : (layer.scale !== undefined ? layer.scale : 1);
      const scaleY = layer.scaleY !== undefined ? layer.scaleY : (layer.scale !== undefined ? layer.scale : 1);
      if (scaleX !== 1 || scaleY !== 1) {
        ctx.scale(scaleX, scaleY);
      }
      
      const isImageLayer = layer.type === 'image' || !!img;
      const offsetX = isImageLayer ? width / 2 : 0;
      const offsetY = isImageLayer ? height / 2 : 0;
      
      // Translate to the layer's local coordinate origin (top-left for images, center for shapes)
      ctx.translate(-offsetX, -offsetY);

      if (layer.opacity !== undefined) {
        ctx.globalAlpha = layer.opacity;
      }

      if (layer.blendMode) {
        ctx.globalCompositeOperation = layer.blendMode;
      }

      if (layer.shadowColor) {
        ctx.shadowColor = layer.shadowColor;
        ctx.shadowBlur = layer.shadowBlur || 0;
        ctx.shadowOffsetX = layer.shadowOffsetX || 0;
        ctx.shadowOffsetY = layer.shadowOffsetY || 0;
      }
      
      if (layer.mask) {
         ctx.beginPath();
         let isCCW = false;
         
         if (layer.mask.type === 'path' && layer.mask.pathAnchors && layer.mask.pathAnchors.length > 0) {
             const anchors = layer.mask.pathAnchors;
             ctx.moveTo(anchors[0].x, anchors[0].y);
             for (let i = 0; i < anchors.length; i++) {
                 const current = anchors[i];
                 const next = anchors[(i + 1) % anchors.length];
                 if (!layer.mask.pathClosed && i === anchors.length - 1) break;
                 
                 const cp1x = current.handleOut ? current.handleOut.x : current.x;
                 const cp1y = current.handleOut ? current.handleOut.y : current.y;
                 const cp2x = next.handleIn ? next.handleIn.x : next.x;
                 const cp2y = next.handleIn ? next.handleIn.y : next.y;
                 
                 ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
             }
             if (layer.mask.pathClosed) ctx.closePath();
             
             // Check winding order
             let sum = 0;
             for (let i = 0; i < anchors.length; i++) {
                 const current = anchors[i];
                 const next = anchors[(i + 1) % anchors.length];
                 sum += (next.x - current.x) * (next.y + current.y);
             }
             isCCW = sum < 0;
             
         } else if (layer.mask.points && layer.mask.points.length > 0) {
             const pts = layer.mask.points;
             ctx.moveTo(pts[0], pts[1]);
             for (let i = 2; i < pts.length; i += 2) {
                 ctx.lineTo(pts[i], pts[i+1]);
             }
             ctx.closePath();
             
             let sum = 0;
             for (let i = 0; i < pts.length; i += 2) {
                 const x1 = pts[i], y1 = pts[i+1];
                 const x2 = pts[(i+2) % pts.length], y2 = pts[(i+3) % pts.length];
                 sum += (x2 - x1) * (y2 + y1);
             }
             isCCW = sum < 0;
         }

         if (layer.mask.inverted) {
             if (isCCW) {
                 ctx.rect(-canvasWidth*2, -canvasHeight*2, canvasWidth * 4, canvasHeight * 4);
             } else {
                 ctx.rect(canvasWidth*2, -canvasHeight*2, -canvasWidth * 4, canvasHeight * 4);
             }
         }
         ctx.clip();
      }
      
      if (layer.type === 'text') {
        ctx.font = `${layer.fontSize || 32}px ${layer.fontFamily || 'Arial'}`;
        ctx.fillStyle = layer.fill || '#ffffff';
        ctx.textBaseline = 'top';
        ctx.fillText(layer.text || "Double click to edit", 0, 0);
      } else if (layer.type === 'shape') {
        ctx.beginPath();
        if (layer.shapeType === 'rect') {
          const w = layer.width || 100;
          const h = layer.height || 100;
          ctx.rect(-w/2, -h/2, w, h);
        } else if (layer.shapeType === 'circle') {
          ctx.arc(0, 0, layer.radius || 50, 0, Math.PI * 2);
        } else if (layer.shapeType === 'star') {
          const numPoints = layer.numPoints || 5;
          const innerRadius = layer.innerRadius || 25;
          const outerRadius = layer.outerRadius || 50;
          for (let i = 0; i < numPoints * 2; i++) {
            const r = i % 2 === 0 ? outerRadius : innerRadius;
            const a = (Math.PI * i) / numPoints - Math.PI / 2;
            if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
            else ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
          }
          ctx.closePath();
        } else if (layer.shapeType === 'path' && layer.pathAnchors && layer.pathAnchors.length > 0) {
          const anchors = layer.pathAnchors;
          ctx.moveTo(anchors[0].x, anchors[0].y);
          for (let i = 0; i < anchors.length; i++) {
              const current = anchors[i];
              const next = anchors[(i + 1) % anchors.length];
              if (!layer.pathClosed && i === anchors.length - 1) break;
              
              const cp1x = current.handleOut ? current.handleOut.x : current.x;
              const cp1y = current.handleOut ? current.handleOut.y : current.y;
              const cp2x = next.handleIn ? next.handleIn.x : next.x;
              const cp2y = next.handleIn ? next.handleIn.y : next.y;
              
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
          }
          if (layer.pathClosed) ctx.closePath();
        }
        
        if (layer.fill) {
          ctx.fillStyle = layer.fill;
          ctx.fill();
        }
        if (layer.strokeWidth && layer.strokeWidth > 0 && layer.stroke) {
          ctx.strokeStyle = layer.stroke;
          ctx.lineWidth = layer.strokeWidth;
          ctx.stroke();
        }
      } else if (layer.type === 'brush') {
        const baseAlpha = layer.opacity !== undefined ? layer.opacity : 1;
        
        if (layer.points && layer.points.length > 0) {
          ctx.beginPath();
          const pts = layer.points;
          ctx.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) {
            ctx.lineTo(pts[i], pts[i + 1]);
          }
          ctx.strokeStyle = layer.stroke || '#ffffff';
          ctx.lineWidth = layer.strokeWidth || 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        
        if (layer.lines && layer.lines.length > 0) {
          layer.lines.forEach((line: any) => {
            if (line.points && line.points.length > 0) {
              ctx.beginPath();
              ctx.moveTo(line.points[0], line.points[1]);
              if (line.points.length === 2) {
                 ctx.lineTo(line.points[0] + 0.1, line.points[1] + 0.1);
              } else {
                 for (let i = 2; i < line.points.length; i += 2) {
                   ctx.lineTo(line.points[i], line.points[i + 1]);
                 }
              }
              ctx.strokeStyle = layer.stroke || '#ffffff';
              ctx.lineWidth = line.size || layer.strokeWidth || 5;
              ctx.globalAlpha = baseAlpha * (line.opacity !== undefined ? line.opacity / 100 : 1);
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.stroke();
            }
          });
          ctx.globalAlpha = baseAlpha; // reset
        }
      } else if (img) {
        if (layer.filters) {
          const filterTokens = [];
          if (layer.filters.brightness !== undefined) {
             filterTokens.push(`brightness(${(layer.filters.brightness + 1) * 100}%)`);
          }
          if (layer.filters.contrast !== undefined) {
             filterTokens.push(`contrast(${(layer.filters.contrast / 100 + 1) * 100}%)`);
          }
          if (layer.filters.blur !== undefined && layer.filters.blur > 0) {
             filterTokens.push(`blur(${layer.filters.blur}px)`);
          }
          if (layer.filters.sepia) {
             filterTokens.push(`sepia(100%)`);
          }
          if (layer.filters.invert) {
             filterTokens.push(`invert(100%)`);
          }
          if (filterTokens.length > 0) {
             ctx.filter = filterTokens.join(' ');
          }
        }
        
        if (layer.rasterMask && layer.rasterMask.visible !== false) {
          // Use offscreen canvas to apply mask correctly without erasing background
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            if (ctx.filter && ctx.filter !== 'none') {
              tempCtx.filter = ctx.filter;
              ctx.filter = 'none'; // clear from main ctx
            }
            tempCtx.drawImage(img, 0, 0, width, height);
            tempCtx.filter = 'none';
            
            const maskCanvas = document.createElement("canvas");
            maskCanvas.width = width;
            maskCanvas.height = height;
            const maskCtx = maskCanvas.getContext("2d");
            
            if (maskCtx) {
              maskCtx.globalCompositeOperation = 'source-over';
              if (layer.rasterMask.inverted) {
                maskCtx.clearRect(0, 0, width, height);
              } else {
                maskCtx.fillStyle = '#FFFFFF';
                maskCtx.fillRect(0, 0, width, height);
              }

              if (layer.rasterMask.lines) {
                layer.rasterMask.lines.forEach((l: any) => {
                  maskCtx.globalCompositeOperation = l.mode === 'erase' ? 'destination-out' : 'source-over';
                  maskCtx.strokeStyle = '#FFFFFF';
                  maskCtx.lineWidth = l.size || 20;
                  maskCtx.lineCap = 'round';
                  maskCtx.lineJoin = 'round';
                  maskCtx.globalAlpha = l.opacity !== undefined ? l.opacity / 100 : 1.0;

                  if (l.points && l.points.length >= 2) {
                    maskCtx.beginPath();
                    maskCtx.moveTo(l.points[0], l.points[1]);
                    if (l.points.length === 2) {
                      maskCtx.lineTo(l.points[0] + 0.1, l.points[1] + 0.1);
                    } else {
                      for (let i = 2; i < l.points.length; i += 2) {
                        maskCtx.lineTo(l.points[i], l.points[i + 1]);
                      }
                    }
                    maskCtx.stroke();
                  }
                });
              }

              tempCtx.globalCompositeOperation = layer.rasterMask.inverted ? "destination-out" : "destination-in";
              tempCtx.globalAlpha = 1.0;
              tempCtx.drawImage(maskCanvas, 0, 0);
            }
            ctx.drawImage(tempCanvas, 0, 0, width, height);
          }
        } else {
          // Draw image at the local origin (0, 0) since we already translated by -offsetX, -offsetY
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        ctx.filter = 'none';
      }
      
      ctx.restore();
    }

    // Crop transparent pixels
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    let minX = canvasWidth;
    let minY = canvasHeight;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const alpha = data[(y * canvasWidth + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX >= minX && maxY >= minY) {
      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      // Only crop if it actually reduces the size
      if (cropWidth < canvasWidth || cropHeight < canvasHeight) {
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = cropWidth;
          cropCanvas.height = cropHeight;
          const cropCtx = cropCanvas.getContext("2d");
          if (cropCtx) {
            cropCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            return { success: true, data: { image: cropCanvas.toDataURL("image/png") } };
          }
      }
    }

    return { success: true, data: { image: canvas.toDataURL("image/png") } };
  } catch (err: any) {
    return { success: false, error: err.message || "Compositing failed." };
  }
};

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

  let maxWidth = 0;
  let maxHeight = 0;
  for (const { img, width, height } of drawableLayers) {
    if (img) {
      if (width > maxWidth) maxWidth = width;
      if (height > maxHeight) maxHeight = height;
    }
  }

  if (maxWidth === 0 || maxHeight === 0) {
    maxWidth = 1024;
    maxHeight = 1024;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = maxHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { success: false, error: "Canvas 2D unsupported." };



    // Sort layers by zIndex
    drawableLayers.sort((a, b) => a.layer.zIndex - b.layer.zIndex);

    for (const { layer, img, width, height } of drawableLayers) {
      ctx.save();
      
      const centerX = maxWidth / 2 + (layer.x || 0);
      const centerY = maxHeight / 2 + (layer.y || 0);
      
      ctx.translate(centerX, centerY);
      if (layer.rotation) {
        ctx.rotate((layer.rotation * Math.PI) / 180);
      }
      
      const scaleX = layer.scaleX !== undefined ? layer.scaleX : (layer.scale !== undefined ? layer.scale : 1);
      const scaleY = layer.scaleY !== undefined ? layer.scaleY : (layer.scale !== undefined ? layer.scale : 1);
      if (scaleX !== 1 || scaleY !== 1) {
        ctx.scale(scaleX, scaleY);
      }
      
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
      } else if (layer.type === 'brush' && layer.points && layer.points.length > 0) {
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
        
        // Draw image centered at the translated origin
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        
        ctx.filter = 'none';
      }
      
      ctx.restore();
    }

    return { success: true, data: { image: canvas.toDataURL("image/png") } };
  } catch (err: any) {
    return { success: false, error: err.message || "Compositing failed." };
  }
};

import { useState } from "react";
import { Handle, Position, useReactFlow, useEdges } from "reactflow";
import { Scissors, Download, Loader2 } from "lucide-react";

export default function IsometricHexSlicerNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [slices, setSlices] = useState<{name: string, url: string}[]>(data.slices || []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useWallCloning, setUseWallCloning] = useState(data.useWallCloning !== undefined ? data.useWallCloning : true);
  
  const { getNodes, setNodes } = useReactFlow();
  const allEdges = useEdges();
  
  const incomingEdges = allEdges.filter(e => e.target === id && e.targetHandle === 'image');
  
  const processImage = async () => {
    if (incomingEdges.length === 0) return setSlices([]);
    const sourceNode = getNodes().find(n => n.id === incomingEdges[0].source);
    const imageUrl = sourceNode?.data?.resultUrl || sourceNode?.data?.imageUrl;
    if (!imageUrl) return;

    setIsProcessing(true);

    try {
      const guideImg = new Image();
      guideImg.crossOrigin = "anonymous";
      guideImg.src = "/assets/hex-tool/1x1_Island_ColorGuide.png";

      const sourceImg = new Image();
      sourceImg.crossOrigin = "anonymous";
      sourceImg.src = imageUrl;

      await Promise.all([
        new Promise(res => guideImg.onload = res),
        new Promise(res => sourceImg.onload = res)
      ]);

      const targetW = 1212;
      const targetH = 1212;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error("No 2d context");
      canvas.width = targetW;
      canvas.height = targetH;

      const targetAspect = targetW / targetH;
      const sourceAspect = sourceImg.width / sourceImg.height;

      let cropX = 0, cropY = 0, cropW = sourceImg.width, cropH = sourceImg.height;

      if (Math.abs(sourceAspect - targetAspect) > 0.01) {
        if (sourceAspect < targetAspect) {
          cropW = sourceImg.width;
          cropH = sourceImg.width / targetAspect;
          cropY = (sourceImg.height - cropH) / 2;
        } else {
          cropH = sourceImg.height;
          cropW = sourceImg.height * targetAspect;
          cropX = (sourceImg.width - cropW) / 2;
        }
      }

      ctx.drawImage(sourceImg, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
      const sourceData = ctx.getImageData(0, 0, targetW, targetH).data;

      const guideCanvas = document.createElement('canvas');
      guideCanvas.width = targetW;
      guideCanvas.height = targetH;
      const guideCtx = guideCanvas.getContext('2d', { willReadFrequently: true });
      guideCtx?.drawImage(guideImg, 0, 0, targetW, targetH);
      const guideData = guideCtx?.getImageData(0, 0, targetW, targetH).data;

      if (!guideData) throw new Error("Could not read guide data");

      // Find Darkest Color
      let darkestColor = { r: 0, g: 0, b: 0 };
      let minLuma = 255;
      for (let i = 0; i < sourceData.length; i += 4) {
        if (sourceData[i+3] > 128) {
          const luma = (sourceData[i] + sourceData[i+1] + sourceData[i+2]) / 3;
          if (luma < minLuma && luma > 5) {
            minLuma = luma;
            darkestColor = { r: sourceData[i], g: sourceData[i+1], b: sourceData[i+2] };
          }
        }
      }

      const palette = [
        { name: 'Background', r: 0, g: 0, b: 0, ignore: true },
        { name: 'Gray', r: 63, g: 63, b: 63, ignore: true },
        { name: 'TopFace', r: 255, g: 255, b: 0, isCube: true },
        { name: 'LeftSideFace', r: 0, g: 255, b: 128, isCube: true },
        { name: 'RightSideFace', r: 255, g: 0, b: 255, isCube: true },
        { name: 'CenterFill', r: 128, g: 0, b: 255, island: true, immune: [] },
        { name: 'OutterCornerNorth', r: 255, g: 255, b: 0, island: true, immune: ['top'] },
        { name: 'OutterCornerWest', r: 0, g: 0, b: 255, island: true, immune: ['top', 'left'] },
        { name: 'OutterCornerEast', r: 0, g: 255, b: 0, island: true, immune: ['top', 'right'] },
        { name: 'OutterCornerSouth', r: 255, g: 0, b: 0, island: true, immune: ['top', 'left', 'right'] },
        { name: 'InnerCornerNorth', r: 0, g: 128, b: 255, island: true, immune: [] },
        { name: 'InnerCornerWest', r: 128, g: 255, b: 0, island: true, immune: [] },
        { name: 'InnerCornerEast', r: 255, g: 0, b: 128, island: true, immune: [] },
        { name: 'InnerCornerSouth', r: 255, g: 191, b: 0, island: true, immune: [] },
        { name: 'EdgeNorthWest', r: 255, g: 0, b: 255, island: true, immune: ['top'] },
        { name: 'EdgeNorthEast', r: 0, g: 255, b: 255, island: true, immune: ['top'] },
        { name: 'EdgeSouthWest', r: 0, g: 255, b: 128, island: true, immune: ['left'] },
        { name: 'EdgeSouthEast', r: 255, g: 128, b: 0, island: true, immune: ['right'] }
      ];

      const getNearest = (r: number, g: number, b: number, x: number, y: number) => {
        let bestDist = Infinity;
        let bestEntry = palette[0];
        for (const p of palette) {
          if (p.isCube && y < 800) continue;
          if (p.island && y >= 800) continue;
          const dist = (p.r - r)**2 + (p.g - g)**2 + (p.b - b)**2;
          if (dist < bestDist) {
            bestDist = dist;
            bestEntry = p;
          }
        }
        return bestEntry;
      };

      const extracted: Record<string, { bounds: {minX:number, maxX:number, minY:number, maxY:number}, data: ImageData }> = {};
      
      for (const p of palette) {
        if (!p.ignore) {
          extracted[p.name] = {
            bounds: { minX: targetW, maxX: 0, minY: targetH, maxY: 0 },
            data: new ImageData(targetW, targetH)
          };
        }
      }

      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const i = (y * targetW + x) * 4;
          if (guideData[i+3] > 128) {
            const nearest = getNearest(guideData[i], guideData[i+1], guideData[i+2], x, y);
            if (!nearest.ignore) {
              const entry = extracted[nearest.name];
              const r = sourceData[i];
              const g = sourceData[i+1];
              const b = sourceData[i+2];
              
              // Chroma-key out black background fringes
              const isBlack = (r < 15 && g < 15 && b < 15);

              entry.data.data[i] = r;
              entry.data.data[i+1] = g;
              entry.data.data[i+2] = b;
              entry.data.data[i+3] = isBlack ? 0 : 255;
              if (x < entry.bounds.minX) entry.bounds.minX = x;
              if (x > entry.bounds.maxX) entry.bounds.maxX = x;
              if (y < entry.bounds.minY) entry.bounds.minY = y;
              if (y > entry.bounds.maxY) entry.bounds.maxY = y;
            }
          }
        }
      }

      const cubeOffsetX = 466;
      const cubeOffsetY = 851;

      const logicalOffsets: Record<string, {x: number, y: number}> = {
        'CenterFill': {x: 466, y: 332},
        'InnerCornerNorth': {x: 466, y: 192},
        'InnerCornerSouth': {x: 466, y: 472},
        'InnerCornerWest': {x: 186, y: 332},
        'InnerCornerEast': {x: 746, y: 332},
        'EdgeNorthWest': {x: 186, y: 192},
        'EdgeNorthEast': {x: 746, y: 192},
        'EdgeSouthWest': {x: 186, y: 472},
        'EdgeSouthEast': {x: 746, y: 472},
        'OutterCornerWest': {x: 46, y: 402},
        'OutterCornerEast': {x: 886, y: 402},
        'OutterCornerSouth': {x: 606, y: 542},
        'OutterCornerNorth': {x: 326, y: 122}
      };

      const hexPath = new Path2D();
      hexPath.moveTo(140, 0);
      hexPath.lineTo(280, 70);
      hexPath.lineTo(280, 210);
      hexPath.lineTo(140, 280);
      hexPath.lineTo(0, 210);
      hexPath.lineTo(0, 70);
      hexPath.closePath();

      const newSlices: {name: string, url: string}[] = [];

      for (const p of palette) {
        if (!p.island) continue;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 280;
        outCanvas.height = 280;
        const oCtx = outCanvas.getContext('2d');
        if (!oCtx) continue;

        // Hexagon background is now truly transparent, not filled with darkestColor!

        const chunk = extracted[p.name];
        const offset = logicalOffsets[p.name];
        if (!offset) continue; // safety check

        const tileOffsetX = offset.x;
        const tileOffsetY = offset.y;

        // Temp canvas to hold raw ImageData
        const tempC = document.createElement('canvas');
        tempC.width = targetW;
        tempC.height = targetH;
        const tempCtx = tempC.getContext('2d')!;

        // 2. Draw non-immune Cube Faces (either cloned pixels or darkestColor fill)
        ['TopFace', 'LeftSideFace', 'RightSideFace'].forEach(face => {
          const isTop = face === 'TopFace';
          const isLeft = face === 'LeftSideFace';
          const isRight = face === 'RightSideFace';
          if ((isTop && !p.immune?.includes('top')) ||
              (isLeft && !p.immune?.includes('left')) ||
              (isRight && !p.immune?.includes('right'))) {
            
            const faceChunk = extracted[face];
            tempCtx.putImageData(faceChunk.data, 0, 0);

            if (useWallCloning) {
              oCtx.drawImage(
                tempC,
                cubeOffsetX, cubeOffsetY, 280, 280,
                0, 0, 280, 280
              );
            } else {
              // Fill obscured face with darkestColor
              const maskC = document.createElement('canvas');
              maskC.width = 280; maskC.height = 280;
              const mCtx = maskC.getContext('2d')!;
              mCtx.drawImage(tempC, cubeOffsetX, cubeOffsetY, 280, 280, 0, 0, 280, 280);
              mCtx.globalCompositeOperation = 'source-in';
              mCtx.fillStyle = `rgb(${darkestColor.r}, ${darkestColor.g}, ${darkestColor.b})`;
              mCtx.fillRect(0, 0, 280, 280);
              oCtx.drawImage(maskC, 0, 0);
            }
            tempCtx.clearRect(0, 0, targetW, targetH);
          }
        });

        // 3. Draw Island Chunk aligned by its top-left logical coordinate
        tempCtx.putImageData(chunk.data, 0, 0);
        oCtx.drawImage(
          tempC,
          tileOffsetX, tileOffsetY, 280, 280,
          0, 0, 280, 280
        );
        
        // 4. Clip to Hexagon
        oCtx.globalCompositeOperation = 'destination-in';
        oCtx.fill(hexPath);
        oCtx.globalCompositeOperation = 'source-over';

        // 5. Smear (Edge Padding) to fix anti-aliasing seams in Unity
        const imgData = oCtx.getImageData(0, 0, 280, 280);
        let currentData = imgData.data;
        for (let pass = 0; pass < 2; pass++) {
            const nextData = new Uint8ClampedArray(currentData);
            for (let y = 0; y < 280; y++) {
              for (let x = 0; x < 280; x++) {
                const i = (y * 280 + x) * 4;
                if (currentData[i+3] < 255) {
                  let found = false;
                  for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                      if (dx === 0 && dy === 0) continue;
                      const nx = x + dx;
                      const ny = y + dy;
                      if (nx >= 0 && nx < 280 && ny >= 0 && ny < 280) {
                        const ni = (ny * 280 + nx) * 4;
                        if (currentData[ni+3] === 255) {
                          nextData[i] = currentData[ni];
                          nextData[i+1] = currentData[ni+1];
                          nextData[i+2] = currentData[ni+2];
                          nextData[i+3] = 255;
                          found = true;
                          break;
                        }
                      }
                    }
                    if (found) break;
                  }
                }
              }
            }
            currentData = nextData;
        }
        oCtx.putImageData(new ImageData(currentData, 280, 280), 0, 0);

        newSlices.push({ name: p.name, url: outCanvas.toDataURL('image/png') });
      }

      setSlices(newSlices);
      setNodes(nds => nds.map(n => n.id === id ? { 
        ...n, 
        data: { ...n.data, slices: newSlices, sourceImageUrl: imageUrl, useWallCloning } 
      } : n));
    } catch (err) {
      console.error("Slicing failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`w-96 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected ? "border-2 border-[#fbbf24]" : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-4 py-3 flex items-center justify-between border-b border-emerald-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">V2 Token Slicer</span>
        </div>
        {isProcessing && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
      </div>
      
      <div className="p-4 space-y-3">
        <div className="bg-black/30 p-4 border border-emerald-500/20 rounded min-h-[240px] flex items-center justify-center">
          {slices.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 w-full max-h-96 overflow-y-auto pr-1 custom-scrollbar">
              {slices.map((slice, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 group">
                  <a 
                    href={slice.url}
                    download={`Tile_${slice.name}.png`}
                    className="aspect-square w-full border border-emerald-500/30 rounded overflow-hidden bg-black/50 hover:border-emerald-400 hover:scale-105 transition-all cursor-pointer relative block" 
                    title={`Download ${slice.name}`}
                  >
                    <img src={slice.url} className="w-full h-full object-contain" alt={slice.name} />
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Download className="w-4 h-4 text-emerald-400" />
                    </div>
                  </a>
                  <span className="text-[8px] text-emerald-200/60 truncate w-full text-center">{slice.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center">
              <Scissors className="w-10 h-10 text-emerald-500/20 mx-auto mb-2" />
              <p className="text-xs text-emerald-200/40">Connect an image, then click SLICE</p>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between bg-black/30 p-2.5 rounded border border-emerald-500/20">
          <label className="text-xs text-emerald-200/80 font-medium cursor-pointer select-none" onClick={() => setUseWallCloning(!useWallCloning)}>
            Clone Cube Faces
          </label>
          <button 
            onClick={() => setUseWallCloning(!useWallCloning)}
            className={`w-8 h-4 rounded-full transition-colors relative ${useWallCloning ? 'bg-emerald-500' : 'bg-gray-600'}`}
          >
            <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all`} style={{ left: useWallCloning ? '18px' : '2px' }} />
          </button>
        </div>
        
        <button 
          onClick={processImage}
          disabled={isProcessing}
          className="nodrag w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        >
          <Scissors className="w-4 h-4 fill-current" />
          SLICE 13 TILES
        </button>
      </div>

      <Handle type="target" position={Position.Left} id="image" className="!w-4 !h-4 !bg-[#22c55e] !border-none !left-[-8px]" />
      <Handle type="source" position={Position.Right} id="image-out" className="!w-4 !h-4 !bg-[#22c55e] !border-none !right-[-8px]" />
    </div>
  );
}

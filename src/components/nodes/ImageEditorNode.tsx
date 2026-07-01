import { useState, useEffect } from "react";
import { Handle, Position } from "reactflow";
import { ImageIcon, Layers } from "lucide-react";

export default function ImageEditorNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [image, setImage] = useState<string | null>(data.image || data.outputImage || null);
  const imageInputs = data.imageInputs && data.imageInputs.length > 0 ? data.imageInputs : ["image-0"];
  
  useEffect(() => {
    if (data.outputImage && data.outputImage !== image) {
      setImage(data.outputImage);
    }
  }, [data.outputImage]);

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative group ${
      selected ? "border-2 border-[#fbbf24]" : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-4 py-3 flex items-center justify-between border-b border-emerald-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Image Editor</span>
        </div>
      </div>
      
      <div className="p-4 space-y-3 relative z-10">
        {/* Dynamic Handles */}
        <div className="flex flex-col gap-2 relative">
          {imageInputs.map((handleId: string, index: number) => (
            <div key={handleId} className="relative flex items-center h-6">
              <Handle
                type="target"
                position={Position.Left}
                id={handleId}
                className="!min-w-0 !min-h-0 rounded-full !left-[-24px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }}
              />
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                {index === 0 ? "Input Image" : `Layer ${index + 1}`}
              </span>
            </div>
          ))}
          <div className="relative flex items-center h-6">
            <Handle
              type="target"
              position={Position.Left}
              id="image-plus"
              className="!min-w-0 !min-h-0 rounded-full !left-[-24px] cursor-crosshair hover:scale-110 transition-transform shadow-md !flex items-center justify-center"
              style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }}
            >
              <span className="text-[#151b25] font-black text-[14px] leading-none mt-[-1px]">+</span>
            </Handle>
          </div>
        </div>

        {/* Clear Edit Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('open-workspace', { detail: { id } }));
          }}
          className="w-full mb-3 py-1.5 bg-transparent border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-widest rounded hover:bg-emerald-500/10 transition-colors nodrag"
        >
          Open Editor
        </button>

        {/* Image Preview */}
        <div 
          className="w-full border border-emerald-500/20 rounded overflow-hidden flex flex-col items-center justify-center relative"
          style={{
            backgroundImage: `repeating-conic-gradient(#1a1525 0% 25%, #2a2438 0% 50%)`,
            backgroundSize: '20px 20px'
          }}
        >
          {image ? (
            <img src={image} className="w-full h-full object-contain drop-shadow-2xl" alt="Composite" />
          ) : (
            <div className="text-center p-4">
              <ImageIcon className="w-8 h-8 opacity-20 text-emerald-500 mx-auto mb-2" />
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#22c55e', borderColor: '#14532d', borderWidth: '2px' }} />
    </div>
  );
}

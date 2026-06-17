import { useState, useCallback } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Image as ImageIcon, UploadCloud, X } from "lucide-react";

export default function ReferenceImageNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [imagePreview, setImagePreview] = useState<string | null>(data.outputImage || data.imageUrl || null);
  const { setNodes } = useReactFlow();

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setImagePreview(url);
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, outputImage: url } } : node
          )
        );
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, outputImage: null } } : node
      )
    );
  };

  return (
    <div className={`w-64 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected 
        ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" 
        : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-3 py-2 flex items-center gap-2 border-b border-emerald-500/20 rounded-t-lg">
        <ImageIcon className="w-4 h-4 text-emerald-400" />
        <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Image Input</span>
      </div>
      <div className="p-4">
        {imagePreview ? (
          <div className="relative w-full rounded overflow-hidden border border-emerald-500/20 bg-black/50">
            <img src={imagePreview} className="w-full h-auto block" alt="reference" />
            <button 
              onClick={removeImage}
              className="nodrag absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ) : (
          <label className="w-full aspect-video rounded border-2 border-dashed border-emerald-500/20 flex flex-col items-center justify-center hover:border-emerald-500/50 cursor-pointer transition-colors bg-black/20 text-emerald-400/40">
            <UploadCloud className="w-8 h-8 mb-1" />
            <span className="text-xs">Upload Image</span>
            <input type="file" className="hidden nodrag" onChange={handleUpload} accept="image/*" />
          </label>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="!w-4 !h-4 !bg-[#22c55e] !border-none !min-w-0 !min-h-0 !right-[-10px]"
      />
    </div>
  );
}

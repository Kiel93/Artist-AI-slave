import { useState, useCallback } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Palette, UploadCloud, RefreshCw, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import { generateText, fetchNodePrompt } from "@/lib/plenxai";

export default function StyleInsertNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [images, setImages] = useState<string[]>(data.images || []);
  const [isBaking, setIsBaking] = useState(false);
  const [bakedStyle, setBakedStyle] = useState<string>(data.bakedStyle || "");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { setNodes } = useReactFlow();

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && images.length < 4) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newImages = [...images, event.target?.result as string];
        setImages(newImages);
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, images: newImages } } : node
          )
        );
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, images: newImages } } : node
      )
    );
  };

  const bakeStyle = async () => {
    if (images.length === 0) return;
    const apiKey = localStorage.getItem("artist-assistant-image-api");
    if (!apiKey) {
      alert("Please enter a PlenxAI API Key in Settings.");
      return;
    }

    setIsBaking(true);
    try {
      let prompt = await fetchNodePrompt('StyleInsertNode');
      if (!prompt) prompt = "Analyze the artistic style, color palette, lighting, and mood of these images. Create a concise 'Style Signature' (1-2 sentences) that can be used to replicate this style in other prompts.";
      
      const response = await generateText(apiKey, prompt, images);
      if (response.success) {
        setBakedStyle(response.text);
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, bakedStyle: response.text } } : node
          )
        );
      } else {
        alert("Baking failed: " + (response.error || response.message || JSON.stringify(response)));
      }
    } catch (error) {
      console.error(error);
      alert("Error baking style.");
    } finally {
      setIsBaking(false);
    }
  };

  return (
    <div className={`w-72 bg-[#1a1525] rounded-lg shadow-2xl transition-all duration-200 relative ${
      selected 
        ? "border-2 border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.3)]" 
        : "border-2 border-purple-500/30"
    }`}>
      <div className="bg-purple-900/20 px-3 py-2 flex items-center justify-between border-b border-purple-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-400" />
          <span className="font-bold text-xs text-purple-100 uppercase tracking-wider">Style Insert</span>
        </div>
        {bakedStyle && <Sparkles className="w-3 h-3 text-yellow-400 animate-pulse" />}
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative aspect-square rounded bg-black/40 overflow-hidden border border-purple-500/20 group/img flex items-center justify-center">
              <img src={img} className="max-w-full max-h-full object-contain" alt="style" />
              <button 
                onClick={() => removeImage(i)}
                className="nodrag absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          {images.length < 4 && (
            <label className="aspect-square rounded border-2 border-dashed border-purple-500/20 flex flex-col items-center justify-center hover:border-purple-500/50 cursor-pointer transition-colors bg-black/20 text-purple-400/40">
              <UploadCloud className="w-6 h-6" />
              <input type="file" className="hidden nodrag" onChange={handleUpload} accept="image/*" />
            </label>
          )}
        </div>

        {bakedStyle ? (
          <div className="relative group">
            <div className={`bg-black/40 border border-purple-500/20 p-2 rounded text-[10px] text-purple-100/70 italic ${isCollapsed ? "max-h-16 overflow-hidden" : ""}`}>
              "{bakedStyle}"
            </div>
            {bakedStyle.length > 80 && (
              <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute top-1 right-1 text-purple-400 hover:text-purple-300 transition-colors bg-[#1a1525]/80 p-0.5 rounded shadow-sm"
              >
                {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-purple-400/40 text-center">Upload up to 4 images to bake a style signature.</p>
        )}

        <button 
          onClick={bakeStyle}
          disabled={isBaking || images.length === 0}
          className={`nodrag w-full py-2 rounded text-xs font-medium flex items-center justify-center gap-2 transition-all ${
            isBaking 
              ? "bg-purple-600/50 cursor-not-allowed" 
              : "bg-purple-600 hover:bg-purple-500 text-white"
          }`}
        >
          {isBaking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {isBaking ? "Baking Style..." : "Bake Style"}
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!w-4 !h-4 !bg-[#3b82f6] !border-none !min-w-0 !min-h-0"
      />
    </div>
  );
}

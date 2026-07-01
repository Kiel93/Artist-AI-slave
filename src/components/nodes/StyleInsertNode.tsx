import { useState, useCallback, useEffect } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { Palette, UploadCloud, RefreshCw, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import { fetchNodePrompt, TEXT_MODELS } from "@/lib/plenxai";
import { GOOGLE_MODELS } from "@/lib/gemini";
import { generateTextUniversal } from "@/lib/llm-router";

export default function StyleInsertNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const [images, setImages] = useState<string[]>(data.images || []);
  const [isBaking, setIsBaking] = useState(false);
  const [text, setText] = useState<string>(data.text || "");
  const [generatedPrompt, setGeneratedPrompt] = useState<string>(data.generatedPrompt || "");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isPromptCollapsed, setIsPromptCollapsed] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(data.model || "gemini-2.5-flash");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [textProvider, setTextProvider] = useState<"plenxai" | "google">("plenxai");
  const { setNodes } = useReactFlow();

  useEffect(() => {
    setTextProvider((localStorage.getItem("artist-assistant-text-provider") as any) || "plenxai");
    const handleProviderChange = (e: any) => setTextProvider(e.detail);
    window.addEventListener("text-provider-changed", handleProviderChange);
    return () => window.removeEventListener("text-provider-changed", handleProviderChange);
  }, []);

  const activeModels = textProvider === "google" ? GOOGLE_MODELS : TEXT_MODELS;

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

    setIsBaking(true);
    try {
      let prompt = await fetchNodePrompt('StyleInsertNode');
      if (!prompt) prompt = "Analyze the artistic style, color palette, lighting, and mood of these images. Create a concise 'Style Signature' (1-2 sentences) that can be used to replicate this style in other prompts.";
      
      setGeneratedPrompt(prompt);
      setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...node.data, generatedPrompt: prompt } } : node));

      const response = await generateTextUniversal(prompt, images, selectedModel);
      if (response.success && response.text) {
        setText(response.text);
        setNodes((nds) =>
          nds.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, text: response.text } } : node
          )
        );
      } else {
        alert("Baking failed: " + (response.error || (response as any).message || JSON.stringify(response)));
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
        : "border-2 border-emerald-500/30"
    }`}>
      <div className="bg-emerald-900/20 px-3 py-2 flex items-center justify-between border-b border-emerald-500/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-xs text-emerald-100 uppercase tracking-wider">Style Insert</span>
        </div>
        {text && <Sparkles className="w-3 h-3 text-yellow-400 animate-pulse" />}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative rounded bg-black/40 overflow-hidden border border-emerald-500/20 group/img flex items-center justify-center">
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
            <label className="rounded border-2 border-dashed border-emerald-500/20 flex flex-col items-center justify-center hover:border-emerald-500/50 cursor-pointer transition-colors bg-black/20 text-emerald-400/40">
              <UploadCloud className="w-6 h-6" />
              <input type="file" className="hidden nodrag" onChange={handleUpload} accept="image/*" />
            </label>
          )}
        </div>

        <div className="relative z-20">
          <label className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-bold mb-1 block">Generative Model</label>
          <button 
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="nodrag w-full bg-black/40 border border-emerald-500/20 rounded px-3 py-2 flex items-center justify-between hover:border-emerald-500/40 transition-colors"
          >
            <span className="text-xs text-emerald-100 font-medium">
              {activeModels.find(m => m.id === selectedModel)?.name || "Select Model"}
            </span>
            <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isModelMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2230] border border-emerald-500/30 rounded shadow-2xl overflow-hidden animate-in fade-in z-30">
              {activeModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setIsModelMenuOpen(false);
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, model: m.id } } : n));
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-emerald-600/20 ${
                    selectedModel === m.id ? 'text-emerald-400 font-bold bg-emerald-600/10' : 'text-emerald-100/70'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>



        {text ? (
          <div className="relative group">
            <div className={`bg-black/40 border border-emerald-500/20 p-2 rounded text-[10px] text-emerald-100/70 italic whitespace-pre-wrap ${isCollapsed ? "max-h-24 overflow-hidden" : ""}`}>
              <div className="text-emerald-400 font-bold mb-1">Style Signature:</div>
              {text}
            </div>
            {text.length > 80 && (
              <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute top-1 right-1 text-emerald-400 hover:text-emerald-300 transition-colors bg-[#1a1525]/80 p-0.5 rounded shadow-sm"
              >
                {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-emerald-400/40 text-center">Upload up to 4 images to bake a style signature.</p>
        )}

        <button 
          onClick={bakeStyle}
          disabled={isBaking || images.length === 0}
          className={`nodrag w-full py-2 rounded text-xs font-medium flex items-center justify-center gap-2 transition-all ${
            isBaking 
              ? "bg-emerald-600/50 cursor-not-allowed" 
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          }`}
        >
          {isBaking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {isBaking ? "Baking Style..." : "Bake Style"}
        </button>
      </div>

      <Handle type="source" position={Position.Right} id="text" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#3b82f6', borderColor: '#1e3a8a', borderWidth: '2px' }} />
    </div>
  );
}

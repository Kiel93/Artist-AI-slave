import { Handle, Position, useReactFlow } from "reactflow";
import { Hash, Settings2 } from "lucide-react";
import { useState, useEffect } from "react";

export default function ValueNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  const [localValue, setLocalValue] = useState<number>(data.value !== undefined ? data.value : 0);
  const [mode, setMode] = useState<'numeric' | 'slider'>(data.mode || 'numeric');
  
  // Sync from external data changes
  useEffect(() => {
    if (data.value !== undefined && data.value !== localValue) {
      setLocalValue(data.value);
    }
    if (data.mode !== undefined && data.mode !== mode) {
      setMode(data.mode);
    }
  }, [data.value, data.mode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    if (isNaN(newVal)) return;
    
    setLocalValue(newVal);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, value: newVal, mode } } : node
      )
    );
  };

  const toggleMode = () => {
    const newMode = mode === 'numeric' ? 'slider' : 'numeric';
    // Reset value to 50 if switching to slider to prevent out of bounds
    const newVal = newMode === 'slider' ? Math.min(Math.max(localValue, 0), 100) : localValue;
    
    setMode(newMode);
    setLocalValue(newVal);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, value: newVal, mode: newMode } } : node
      )
    );
  };

  return (
    <div 
      className={`w-48 bg-[#1a1525] rounded-md group transition-all duration-200 border-2`}
      style={{
        borderColor: selected ? '#fbbf24' : 'rgba(244, 63, 94, 0.3)',
        boxShadow: selected ? '0 0 20px rgba(251,191,36,0.3)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div 
        className="px-3 py-2 flex items-center justify-between border-b rounded-t-md"
        style={{
          backgroundColor: 'rgba(136, 19, 55, 0.2)',
          borderColor: 'rgba(244, 63, 94, 0.2)'
        }}
      >
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4" style={{ color: '#fb7185' }} />
          <span className="font-bold text-xs uppercase tracking-wider" style={{ color: '#ffe4e6' }}>Value</span>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3 relative">
        <div 
          className="flex items-center justify-between bg-black/30 p-2.5 rounded border"
          style={{ borderColor: 'rgba(251, 113, 133, 0.2)' }}
        >
          <label 
            className="text-xs font-medium cursor-pointer select-none" 
            style={{ color: 'rgba(251, 113, 133, 0.8)' }} 
            onClick={toggleMode}
          >
            {mode === 'numeric' ? 'Numeric Input' : 'Slider (0 - 100)'}
          </label>
          <button
            onClick={toggleMode}
            className={`w-8 h-4 rounded-full transition-colors relative ${mode === 'numeric' ? 'bg-gray-600' : ''}`}
            style={{ backgroundColor: mode === 'slider' ? '#f43f5e' : undefined }}
          >
            <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all`} style={{ left: mode === 'slider' ? '18px' : '2px' }} />
          </button>
        </div>
        
        {mode === 'numeric' ? (
          <div 
            className="bg-black/30 border rounded p-3"
            style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}
          >
            <input
              type="number"
              className="nodrag w-full bg-black/40 font-bold text-lg border rounded p-2 focus:outline-none transition-all text-center"
              style={{ 
                color: '#fb7185', 
                borderColor: 'rgba(244, 63, 94, 0.3)' 
              }}
              placeholder="0.0"
              value={localValue}
              onChange={handleChange}
              onFocus={(e) => e.target.style.borderColor = 'rgba(244, 63, 94, 0.7)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(244, 63, 94, 0.3)'}
            />
          </div>
        ) : (
          <div 
            className="bg-black/30 border rounded p-3 space-y-2"
            style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}
          >
            <div 
              className="text-center font-bold text-2xl"
              style={{ color: '#fb7185' }}
            >
              {Math.round(localValue)}
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={localValue}
              onChange={handleChange}
              className="nodrag w-full"
              style={{ accentColor: '#f43f5e' }}
            />
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="value" className="!min-w-0 !min-h-0 rounded-full !right-[-10px]" style={{ width: '16px', height: '16px', backgroundColor: '#f43f5e', borderColor: '#9f1239', borderWidth: '2px' }} />
    </div>
  );
}

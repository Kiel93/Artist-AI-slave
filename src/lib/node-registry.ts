export type DataType = 'text' | 'image' | 'value';

export interface NodeSchema {
  inputs: Record<string, DataType>;
}

/**
 * Central Node Schema Registry
 * 
 * Maps specific node types and their target handle IDs to explicit data types.
 * This prevents brittle string-matching heuristics across the application.
 */
export const NodeRegistry: Record<string, NodeSchema> = {
  assetGenerator: { 
    inputs: { text: 'text', style: 'text', image: 'image', 'image-2': 'image', threshold: 'value' } 
  },
  backgroundRemover: { 
    inputs: { image: 'image' } 
  },
  geminiRefiner: { 
    inputs: { text: 'text', image: 'image' } 
  },
  generalImageGeneration: { 
    inputs: { text: 'text' } // Dynamic handles (e.g. image-plus) are resolved via fallback
  },
  imageEditor: { 
    inputs: { image: 'image' } // Dynamic handles are resolved via fallback
  },
  imageExplained: { 
    inputs: { image: 'image' } 
  },
  isometricHexSlicer: { 
    inputs: { image: 'image' } 
  },
  shadowExtractor: { 
    inputs: { image: 'image', intensity: 'value' } 
  },
  tileCutter: { 
    inputs: { image: 'image', zoom: 'value', opacity: 'value', feather: 'value' } 
  },
  tilesetGenerator: { 
    inputs: { text: 'text', style: 'text', image: 'image' } 
  }
};

/**
 * Returns the exact data type for a given node's target handle.
 * Utilizes the explicit NodeRegistry first, then cascades to smart string fallbacks
 * for dynamically generated handles (like `text-plus` or `image-2`).
 */
export const getHandleType = (nodeType: string, handleId: string): DataType | null => {
  // 1. Explicit Registry Check
  const schema = NodeRegistry[nodeType];
  if (schema && schema.inputs[handleId]) {
    return schema.inputs[handleId];
  }
  
  // 2. Smart String Fallbacks (for dynamic handles)
  const lowerHandle = handleId.toLowerCase();
  if (lowerHandle.includes('image') || lowerHandle.includes('img')) return 'image';
  if (lowerHandle.includes('text') || lowerHandle.includes('prompt') || lowerHandle.includes('style')) return 'text';
  if (lowerHandle.includes('value')) return 'value';
  
  return null;
};

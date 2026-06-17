import { fetchNodePrompt } from "@/lib/plenxai";
import { generateTextUniversal } from "@/lib/llm-router";
import { queueImageGen, getTaskStatus, uploadMediaDirect } from "@/lib/plenxai";

// Generic types for the executor
export type NodeExecutionContext = {
  apiKey?: string; // PlenxAI API key if available
};

export type NodeExecutionInput = {
  textInputs: string[];
  imageInputs: string[];
};

export type NodeExecutionResult = {
  success: boolean;
  data?: any;
  error?: string;
};

/**
 * Execute a Prompt Node.
 * It's mostly a passthrough since prompt nodes just output their text.
 */
export const executePromptNode = async (
  nodeData: any,
  inputs: NodeExecutionInput,
  context: NodeExecutionContext
): Promise<NodeExecutionResult> => {
  return {
    success: true,
    data: {
      outputText: nodeData.outputText || nodeData.text || ""
    }
  };
};

/**
 * Execute the Gemini Refiner Node.
 */
export const executeGeminiRefinerNode = async (
  nodeData: any,
  inputs: NodeExecutionInput,
  context: NodeExecutionContext
): Promise<NodeExecutionResult> => {
  const rawPrompt = inputs.textInputs.join(", ");
  if (!rawPrompt) {
    return { success: false, error: "No input text found to refine." };
  }

  const model = nodeData.model || "gemini-2.5-flash";

  try {
    let systemPrompt = await fetchNodePrompt('GeminiRefinerNode');
    if (!systemPrompt) {
      systemPrompt = `You are a prompt engineer. Refine the user's raw idea into a high-quality, detailed prompt for AI image generation. Output ONLY the refined prompt text.\n\nUser Input:\n{prompt}`;
    }
    
    const finalPrompt = systemPrompt.replace('{prompt}', rawPrompt);
    const imageRefs = inputs.imageInputs.length > 0 ? inputs.imageInputs : undefined;

    const response = await generateTextUniversal(finalPrompt, imageRefs, model);
    
    if (response.success && response.text) {
      return {
        success: true,
        data: {
          outputText: response.text
        }
      };
    } else {
      return {
        success: false,
        error: response.error || (response as any).message || JSON.stringify(response)
      };
    }
  } catch (error: any) {
    return { success: false, error: error.message || "Error calling Gemini API." };
  }
};

/**
 * Execute the General Image Generation Node.
 * This function waits for polling to complete.
 */
export const executeGeneralImageGenerationNode = async (
  nodeData: any,
  inputs: NodeExecutionInput,
  context: NodeExecutionContext
): Promise<NodeExecutionResult> => {
  const apiKey = context.apiKey;
  if (!apiKey) {
    return { success: false, error: "API Key is missing." };
  }

  const finalPrompt = inputs.textInputs.join(", ");
  if (!finalPrompt) {
    return { success: false, error: "No prompt detected." };
  }

  const model = nodeData.model || "nano-banana-pro";
  
  const base64Images = inputs.imageInputs.filter(img => img.startsWith('data:image'));
  const urlImages = [...inputs.imageInputs.filter(img => !img.startsWith('data:image'))];

  try {
    // Upload base64 images first
    if (base64Images.length > 0) {
      for (const base64 of base64Images) {
        try {
          const uploadRes = await uploadMediaDirect(apiKey, base64);
          if (uploadRes.success && (uploadRes.url || uploadRes.cdn_url)) {
            urlImages.push(uploadRes.url || uploadRes.cdn_url);
          }
        } catch (uploadErr) {
          console.error("Error uploading image:", uploadErr);
        }
      }
    }

    const response = await queueImageGen(apiKey, {
      prompt: finalPrompt,
      model: model,
      references_urls: urlImages.length > 0 ? urlImages : undefined
    });

    if (!response.success || !response.task_id) {
      return { success: false, error: response.error || "Failed to queue generation." };
    }

    const taskId = response.task_id;
    
    // Polling synchronously for headless execution
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await getTaskStatus(apiKey, taskId);
          const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
          
          if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
            clearInterval(interval);
            const finalUrl = res.result_url || (res as any).url || (res as any).image_url;
            resolve({
              success: true,
              data: { outputImage: finalUrl }
            });
          } else if (res.status === 'failed' || (res.status as string) === 'error') {
            clearInterval(interval);
            resolve({
              success: false,
              error: (res as any).error || (res as any).message || "Generation failed on server."
            });
          }
        } catch (e: any) {
          clearInterval(interval);
          resolve({ success: false, error: e.message || "Polling error" });
        }
      }, 3000);
    });

  } catch (err: any) {
    return { success: false, error: err.message || "Network error." };
  }
};

/**
 * Main Execution Router
 */
export const executeNode = async (
  nodeType: string,
  nodeData: any,
  inputs: NodeExecutionInput,
  context: NodeExecutionContext
): Promise<NodeExecutionResult> => {
  switch (nodeType) {
    case 'prompt':
      return executePromptNode(nodeData, inputs, context);
    case 'geminiRefiner':
      return executeGeminiRefinerNode(nodeData, inputs, context);
    case 'generalImageGeneration':
      return executeGeneralImageGenerationNode(nodeData, inputs, context);
    case 'graphInput':
      // GraphInput passes data exactly as it received it (which was seeded from the exterior)
      return { 
        success: true, 
        data: { 
           outputText: inputs.textInputs[0] || "",
           outputImage: inputs.imageInputs[0] || "" 
        } 
      };
    case 'graphOutput':
      // GraphOutput just passes the data to be caught by the CompoundNode finish logic
      return { 
        success: true, 
        data: { 
           outputText: inputs.textInputs.join(" ") || "",
           outputImage: inputs.imageInputs[0] || "" 
        } 
      };
    default:
      return { success: false, error: `Execution for node type '${nodeType}' is not yet implemented headlessly.` };
  }
};

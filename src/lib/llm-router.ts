import { generateText as plenxaiGenerateText, explainImage as plenxaiExplainImage, fetchNodePrompt } from "./plenxai";
import { generateGeminiText } from "./gemini";

export interface LLMRouterResponse {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Universal wrapper to route text generation to either PlenxAI or directly to Google Gemini
 */
export async function generateTextUniversal(prompt: string, images?: string[], model: string = "gemini-2.5-flash"): Promise<LLMRouterResponse> {
  const provider = localStorage.getItem("artist-assistant-text-provider") || "plenxai";
  
  if (provider === "google") {
    const key = localStorage.getItem("artist-assistant-google-api");
    if (!key) return { success: false, error: "Missing Google API Key! Please enter it in the Settings menu." };
    
    let geminiModel = "gemini-2.5-flash";
    
    if (model.includes("pro") || model.includes("gpt") || model.includes("claude")) {
      geminiModel = "gemini-2.5-pro";
    } else if (model.includes("flash")) {
      geminiModel = "gemini-2.5-flash";
    }
    
    const response = await generateGeminiText(key, prompt, images, geminiModel);
    return response;
  } else {
    const key = localStorage.getItem("artist-assistant-image-api");
    if (!key) return { success: false, error: "Missing PlenxAI API Key! Please enter it in the Settings menu." };
    
    const response = await plenxaiGenerateText(key, prompt, images, model);
    return response;
  }
}

/**
 * Universal wrapper for Image Explained node
 */
export async function explainImageUniversal(images: string[], customPrompt?: string, model: string = "gemini-2.5-flash"): Promise<LLMRouterResponse> {
  let prompt = customPrompt;
  if (!prompt) {
    prompt = await fetchNodePrompt('ImageExplainedNode');
  }

  return generateTextUniversal(prompt, images, model);
}

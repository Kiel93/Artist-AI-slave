import { fetchNodePrompt } from "@/lib/plenxai";
import { generateTextUniversal, explainImageUniversal } from "@/lib/llm-router";
import { queueImageGen, getTaskStatus, uploadMediaDirect } from "@/lib/plenxai";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
import { executeImageEditorNode } from "./nodes/image-editor-executor";

// Generic types for the executor
export type NodeExecutionContext = {
  apiKey?: string; // PlenxAI API key if available
};

export type NodeExecutionInput = {
  textInputs: string[];
  imageInputs: string[];
  namedInputs?: Record<string, any>;
};

export type NodeExecutionResult = {
  success: boolean;
  data?: any;
  error?: string;
};

// -------------------------------------------------------------
// HELPER: performChromaKey (Asset Generator)
// -------------------------------------------------------------
const performChromaKey = (generatedImgUrl: string, currentThreshold: number = 30): Promise<string> => {
  return new Promise((resolve, reject) => {
    const genImg = new Image();
    genImg.crossOrigin = "anonymous";
    genImg.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = genImg.width;
        const h = genImg.height;
        canvas.width = w;
        canvas.height = h;
        
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(genImg, 0, 0);
        const genData = ctx.getImageData(0, 0, w, h);
        const outData = new Uint8ClampedArray(genData.data);
        
        for (let i = 0; i < outData.length; i += 4) {
          const r = outData[i];
          const g = outData[i+1];
          const b = outData[i+2];
          const rDist = Math.abs(r - 255);
          const gDist = Math.abs(g - 0);
          const bDist = Math.abs(b - 255);
          if (rDist < currentThreshold && gDist < currentThreshold && bDist < currentThreshold) {
            outData[i+3] = 0;
          }
        }

        const defringedData = new Uint8ClampedArray(outData);
        const radius = 3;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (outData[idx+3] > 0) {
              const r = outData[idx];
              const g = outData[idx+1];
              const b = outData[idx+2];
              const isContaminated = (r - g > 40 && b - g > 40);
              if (isContaminated) {
                let foundR = r, foundG = g, foundB = b;
                let minDistance = 9999;
                for (let dy = -radius; dy <= radius; dy++) {
                  for (let dx = -radius; dx <= radius; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                      const nIdx = (ny * w + nx) * 4;
                      if (outData[nIdx+3] > 0) {
                        const nr = outData[nIdx];
                        const ng = outData[nIdx+1];
                        const nb = outData[nIdx+2];
                        const nContaminated = (nr - ng > 30 && nb - ng > 30);
                        if (!nContaminated) {
                          const dist = dx*dx + dy*dy;
                          if (dist < minDistance) {
                            minDistance = dist;
                            foundR = nr;
                            foundG = ng;
                            foundB = nb;
                          }
                        }
                      }
                    }
                  }
                }
                defringedData[idx] = foundR;
                defringedData[idx+1] = foundG;
                defringedData[idx+2] = foundB;
              }
            }
          }
        }
        
        let minX = w, minY = h, maxX = 0, maxY = 0;
        let hasVisiblePixels = false;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (defringedData[idx+3] > 0) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              hasVisiblePixels = true;
            }
          }
        }

        ctx.putImageData(new ImageData(defringedData, w, h), 0, 0);

        if (hasVisiblePixels) {
          const trimmedW = maxX - minX + 1;
          const trimmedH = maxY - minY + 1;
          const trimmedCanvas = document.createElement("canvas");
          trimmedCanvas.width = trimmedW;
          trimmedCanvas.height = trimmedH;
          const trimmedCtx = trimmedCanvas.getContext("2d")!;
          trimmedCtx.drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
          resolve(trimmedCanvas.toDataURL("image/png"));
        } else {
          resolve(canvas.toDataURL("image/png"));
        }
      } catch (e) {
        reject(e);
      }
    };
    genImg.onerror = reject;
    genImg.src = generatedImgUrl;
  });
};

// -------------------------------------------------------------
// EXISTING EXECUTORS
// -------------------------------------------------------------
export const executePromptNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  return { success: true, data: { text: nodeData.text || "" } };
};

export const executeGeminiRefinerNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const rawPrompt = inputs.textInputs.join(", ");
  if (!rawPrompt) return { success: false, error: "No input text found to refine." };
  const model = nodeData.model || "gemini-2.5-flash";
  try {
    let systemPrompt = await fetchNodePrompt('GeminiRefinerNode');
    if (!systemPrompt) systemPrompt = `You are a prompt engineer. Refine the user's raw idea into a high-quality, detailed prompt for AI image generation. Output ONLY the refined prompt text.\n\nUser Input:\n{prompt}`;
    const finalPrompt = systemPrompt.replace('{prompt}', rawPrompt);
    const imageRefs = inputs.imageInputs.length > 0 ? inputs.imageInputs : undefined;
    const response = await generateTextUniversal(finalPrompt, imageRefs, model);
    if (response.success && response.text) return { success: true, data: { text: response.text } };
    return { success: false, error: response.error || (response as any).message || JSON.stringify(response) };
  } catch (error: any) {
    return { success: false, error: error.message || "Error calling Gemini API." };
  }
};

export const executeImageExplainedNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  if (inputs.imageInputs.length === 0) return { success: false, error: "No input images provided." };
  const model = nodeData.model || "gemini-2.5-flash";
  const wordCountLimit = nodeData.wordCountLimit || 500;
  const generatedPrompt = `Describe what is going on in these ${Math.max(1, inputs.imageInputs.length)} image(s) in detail. Focus on composition, character/object detail, and storytelling should any of these elements be present in the image. You must write approximately ${wordCountLimit} words for each image.`;
  try {
    const response = await explainImageUniversal(inputs.imageInputs, generatedPrompt, model);
    if (response.success && response.text) return { success: true, data: { text: response.text } };
    return { success: false, error: response.error || (response as any).message || JSON.stringify(response) };
  } catch (error: any) {
    return { success: false, error: error.message || "Error calling Gemini API." };
  }
};

export const executeGeneralImageGenerationNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const apiKey = context.apiKey;
  if (!apiKey) return { success: false, error: "API Key is missing." };
  
  const textInputs = [...inputs.textInputs];
  if (nodeData.localPrompt) textInputs.push(nodeData.localPrompt);
  const finalPrompt = textInputs.join(", ");
  
  if (!finalPrompt) return { success: false, error: "No prompt detected." };
  const model = nodeData.model || "nano-banana-pro";
  const base64Images = inputs.imageInputs.filter(img => img.startsWith('data:image'));
  const urlImages = [...inputs.imageInputs.filter(img => !img.startsWith('data:image'))];

  try {
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
    const response = await queueImageGen(apiKey, { prompt: finalPrompt, model: model, references_urls: urlImages.length > 0 ? urlImages : undefined });
    if (!response.success || !response.task_id) return { success: false, error: response.error || "Failed to queue generation." };
    const taskId = response.task_id;
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await getTaskStatus(apiKey, taskId);
          const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
          if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
            clearInterval(interval);
            const finalUrl = res.result_url || (res as any).url || (res as any).image_url;
            resolve({ success: true, data: { image: finalUrl } });
          } else if (res.status === 'failed' || (res.status as string) === 'error') {
            clearInterval(interval);
            resolve({ success: false, error: (res as any).error || (res as any).message || "Generation failed on server." });
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

// -------------------------------------------------------------
// NEW EXECUTORS
// -------------------------------------------------------------

export const executeShadowExtractorNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const inputImageUrl = inputs.namedInputs?.['image']?.image || inputs.imageInputs[0];
  if (!inputImageUrl) return { success: false, error: "No input image connected." };

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = img.width;
        const h = img.height;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve({ success: false, error: "Canvas 2D unsupported." });
        
        // Fill white background first to handle transparent inputs
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
        
        // Draw image over it
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const intensity = inputs.namedInputs?.['intensity']?.value ?? nodeData.intensity ?? 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Strict Grayscale conversion (Luminance)
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const originalAlphaNorm = (255 - Math.round(luminance)) / 255.0;
          let finalAlphaNorm = originalAlphaNorm;
          
          if (intensity < 0) {
            finalAlphaNorm = originalAlphaNorm * ((100 + intensity) / 100.0);
          } else if (intensity > 0) {
            const addedAlpha = originalAlphaNorm * (intensity / 100.0);
            finalAlphaNorm = addedAlpha + originalAlphaNorm * (1.0 - addedAlpha);
          }
          
          // Multiply logic: Set color to black, and alpha to calculated opacity
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = Math.round(finalAlphaNorm * 255);
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve({ success: true, data: { image: canvas.toDataURL("image/png") } });
      } catch (err: any) {
        resolve({ success: false, error: err.message || "Failed to process image." });
      }
    };
    img.onerror = () => resolve({ success: false, error: "Failed to load input image." });
    img.src = inputImageUrl;
  });
};



export const executePromptConnectorNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const handles = nodeData.handles && nodeData.handles.length > 0 ? nodeData.handles : ["text-h0", "text-h1"];
  const editableTexts = nodeData.editableTexts || {};
  const parts: string[] = [];
  handles.forEach((h: string) => {
    if (editableTexts[h]) parts.push(editableTexts[h]);
    if (inputs.namedInputs?.[h]) {
      const srcOut = inputs.namedInputs[h];
      parts.push(srcOut.text || "");
    }
  });
  return { success: true, data: { text: parts.filter(Boolean).join(" ") } };
};

export const executeReferenceImageNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  return { success: true, data: { image: nodeData.image || nodeData.imageUrl || inputs.imageInputs[0] || null } };
};

export const executeIsometricDrawNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  return {
    success: true,
    data: { text: "Create an isometric asset sheet of the subject. Show the subject from 4 different isometric angles (Northwest, Southwest, Northeast, Southeast). Render against a solid white background with no environmental context. Perfect for 2D game engines." }
  };
};

export const executeStyleInsertNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const images = nodeData.images || [];
  const allImages = [...images, ...inputs.imageInputs];
  if (allImages.length === 0) return { success: false, error: "No images provided for style baking." };
  try {
    let prompt = await fetchNodePrompt('StyleInsertNode');
    if (!prompt) prompt = "Analyze the artistic style, color palette, lighting, and mood of these images. Create a concise 'Style Signature' (1-2 sentences) that can be used to replicate this style in other prompts.";
    const response = await generateTextUniversal(prompt, allImages, nodeData.model || "gemini-2.5-flash");
    if (response.success && response.text) return { success: true, data: { text: response.text } };
    return { success: false, error: response.error || "Style baking failed." };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const executeBackgroundRemoverNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const inputImageUrl = inputs.namedInputs?.['image']?.image || inputs.imageInputs[0];
  if (!inputImageUrl) return { success: false, error: "No input image connected." };
  try {
    const blob = await imglyRemoveBackground(inputImageUrl);
    const reader = new FileReader();
    const base64Url: string = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    const trimmedBase64: string = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        let hasVisiblePixels = false;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (data[(y * canvas.width + x) * 4 + 3] > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              hasVisiblePixels = true;
            }
          }
        }
        if (!hasVisiblePixels) return resolve(base64Url);
        const pad = 10;
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(canvas.width - 1, maxX + pad); maxY = Math.min(canvas.height - 1, maxY + pad);
        const w = maxX - minX + 1, h = maxY - minY + 1;
        const trimmed = document.createElement("canvas");
        trimmed.width = w; trimmed.height = h;
        trimmed.getContext("2d")!.putImageData(ctx.getImageData(minX, minY, w, h), 0, 0);
        resolve(trimmed.toDataURL("image/png"));
      };
      img.src = base64Url;
    });
    return { success: true, data: { image: trimmedBase64 } };
  } catch (err: any) {
    return { success: false, error: err.message || "BG removal failed." };
  }
};

export const executeTileCutterNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const imageUrl = inputs.namedInputs?.['image']?.image || inputs.imageInputs[0];
  if (!imageUrl) return { success: false, error: "No input image connected." };
  const zoom = inputs.namedInputs?.['zoom']?.value ?? nodeData.zoom ?? 100;
  const feather = inputs.namedInputs?.['feather']?.value ?? nodeData.feather ?? 2;
  const opacity = inputs.namedInputs?.['opacity']?.value ?? nodeData.opacity ?? 100;
  const pan = nodeData.pan ?? { x: 0, y: 0 };
  
  return new Promise((resolve) => {
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = 280; cutCanvas.height = 140;
    const ctx = cutCanvas.getContext('2d');
    if (!ctx) return resolve({ success: false, error: "Canvas 2D unsupported." });

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      const baseScale = Math.min(cutCanvas.width / img.width, cutCanvas.height / img.height);
      const renderScale = (zoom / 100) * baseScale;
      ctx.save();
      ctx.translate(cutCanvas.width / 2, cutCanvas.height / 2);
      ctx.translate(pan.x, pan.y);
      ctx.scale(renderScale, renderScale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      ctx.globalCompositeOperation = 'destination-in';
      const cx = cutCanvas.width / 2, cy = cutCanvas.height / 2;
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cutCanvas.width, cy);
      ctx.lineTo(cx, cutCanvas.height); ctx.lineTo(0, cy);
      ctx.closePath();
      if (feather > 1) { ctx.shadowColor = 'black'; ctx.shadowBlur = feather * 3; }
      ctx.fill();

      resolve({ success: true, data: { image: cutCanvas.toDataURL('image/png') } });
    };
    img.onerror = () => resolve({ success: false, error: "Failed to load tile image." });
  });
};

export const executeAssetGeneratorNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const apiKey = context.apiKey;
  if (!apiKey) return { success: false, error: "API Key is missing." };

  const promptParts: string[] = [];
  if (inputs.namedInputs?.['text'] && inputs.namedInputs['text'].text) {
    promptParts.push(inputs.namedInputs['text'].text);
  } else if (nodeData.localPrompt) {
    promptParts.push(nodeData.localPrompt);
  }
  
  const objectPrompt = promptParts.join(", ") || "object";
  const styleInput = inputs.namedInputs?.['style']?.text || "";
  const inputImageUrl = inputs.namedInputs?.['image']?.image || "";
  const secondaryImageUrl = inputs.namedInputs?.['image-2']?.image || "";

  if (!inputImageUrl) return { success: false, error: "Base Island image missing." };

  const styleString = styleInput ? ` Artstyle: ${styleInput}` : "";
  let baseApiPrompt = await fetchNodePrompt('AssetGeneratorNode');
  if (!baseApiPrompt) {
    baseApiPrompt = `You are an artist in the game industry. Generate {object} that would visually match and perfectly sit in the middle of this island. Isolate the {object} and make the background neon green for color keying (#00FF00). IMPORTANT: PRESERVE THE ARTSTYLE AND LIGHTING, DO NOT INCLUDE COMPONENTS FROM REFERENCE IN THE GENERATED IMAGE. USE THe IMAGE 2 AS REFERENCE FOR THE {object}.\nSubject: A single isolated {object} rendered in a strict 30-degree isometric perspective.\nStyle: {style}\nComposition: The {object} must be centered, filling 70% of the canvas. DO NOT include the island base or any terrain from the reference image. Generate the {object} as a standalone floating sprite.\nTechnical Output: Place the object on a solid, flat neon green background (#00FF00). IMPORTANT: Ensure there are no ground shadows, no floor planes, and no "color spill" or neon green glow reflected onto the object. The edges must be sharp and clean for pixel extraction.\nReference: {reference image}.\nSpec: resolution:{resolution}. ratio 1:1.`;
  }

  const selectedResolution = nodeData.resolution || "1k";
  const apiPrompt = baseApiPrompt.replace(/{object}/g, objectPrompt).replace(/{style}/g, styleString).replace(/1k resolution/gi, `${selectedResolution} resolution`).replace(/{resolution}/gi, selectedResolution);

  try {
    let refs = [];
    if (inputImageUrl.startsWith('data:image/') || inputImageUrl.startsWith('blob:')) {
      const up = await uploadMediaDirect(apiKey, inputImageUrl);
      refs.push(up.url || up.cdn_url);
    } else { refs.push(inputImageUrl); }

    if (secondaryImageUrl) {
      if (secondaryImageUrl.startsWith('data:image/') || secondaryImageUrl.startsWith('blob:')) {
        const up2 = await uploadMediaDirect(apiKey, secondaryImageUrl);
        refs.push(up2.url || up2.cdn_url);
      } else { refs.push(secondaryImageUrl); }
    }

    const response = await queueImageGen(apiKey, { prompt: apiPrompt, model: nodeData.model || "nano-banana-pro", resolution: selectedResolution, aspect_ratio: "1:1", references_urls: refs });
    if (!response.success || !response.task_id) return { success: false, error: "Failed to queue." };

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await getTaskStatus(apiKey, response.task_id!);
          const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
          if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
            clearInterval(interval);
            const finalUrl = res.result_url || (res as any).url || (res as any).image_url;
            const applyChroma = inputs.namedInputs?.['image-2']?.image ? true : (nodeData.applyChromaKey || false);
            if (applyChroma) {
              const threshold = inputs.namedInputs?.['threshold']?.value ?? nodeData.threshold ?? 30;
              try {
                const extractedAssetUrl = await performChromaKey(finalUrl, threshold);
                resolve({ success: true, data: { image: extractedAssetUrl, generatedUrl: finalUrl } });
              } catch (err: any) {
                resolve({ success: false, error: err.message || "Chroma key failed." });
              }
            } else {
              resolve({ success: true, data: { image: finalUrl } });
            }
          } else if (res.status === 'failed' || (res.status as string) === 'error') {
            clearInterval(interval);
            resolve({ success: false, error: "Generation failed." });
          }
        } catch (e: any) {
          clearInterval(interval);
          resolve({ success: false, error: "Polling error" });
        }
      }, 3000);
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const executeTilesetGeneratorNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const apiKey = context.apiKey;
  if (!apiKey) return { success: false, error: "API Key is missing." };

  const promptParts: string[] = [];
  if (inputs.namedInputs?.['text'] && inputs.namedInputs['text'].text) {
    promptParts.push(inputs.namedInputs['text'].text);
  } else if (nodeData.localPrompt) {
    promptParts.push(nodeData.localPrompt);
  }
  
  const themePrompt = promptParts.join(", ") || "Fantasy terrain";
  const styleString = inputs.namedInputs?.['style']?.text || "Game art";
  const inputImageUrl = inputs.namedInputs?.['image']?.image || "";

  let baseApiPrompt = await fetchNodePrompt('TilesetGeneratorNode');
  if (!baseApiPrompt) {
    baseApiPrompt = `You are a technical game artist... \nTheme: {theme}\nStyle: {style}\nReference: {reference image}\nSpec: resolution:{resolution}. ratio 1:1.`;
  }

  const selectedResolution = nodeData.resolution || "1k";
  const apiPrompt = baseApiPrompt.replace(/{theme}/g, themePrompt).replace(/{style}/g, styleString).replace(/1k resolution/gi, `${selectedResolution} resolution`).replace(/{resolution}/gi, selectedResolution);

  try {
    let refs = [];

    // Fetch and upload the default blueprint (same as frontend)
    const imgRes = await fetch('/assets/hex-tool/1x1_Island_Default.png');
    const blob = await imgRes.blob();
    const reader = new FileReader();
    const base64Data: string = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    const uploadRes = await uploadMediaDirect(apiKey, base64Data);
    const referenceUrl = uploadRes.url || uploadRes.cdn_url;
    if (referenceUrl) refs.push(referenceUrl);

    // Fetch and upload additional custom input image if provided
    if (inputImageUrl) {
      if (inputImageUrl.startsWith('data:image/')) {
        const up = await uploadMediaDirect(apiKey, inputImageUrl);
        refs.push(up.url || up.cdn_url);
      } else if (inputImageUrl.startsWith('blob:')) {
        const customImgRes = await fetch(inputImageUrl);
        const customBlob = await customImgRes.blob();
        const customReader = new FileReader();
        const customBase64: string = await new Promise((resolve) => {
          customReader.onloadend = () => resolve(customReader.result as string);
          customReader.readAsDataURL(customBlob);
        });
        const up = await uploadMediaDirect(apiKey, customBase64);
        refs.push(up.url || up.cdn_url);
      } else {
        refs.push(inputImageUrl); 
      }
    }

    const response = await queueImageGen(apiKey, { prompt: apiPrompt, model: nodeData.model || "nano-banana-pro", resolution: selectedResolution, aspect_ratio: "1:1", references_urls: refs.length > 0 ? refs : undefined });
    if (!response.success || !response.task_id) return { success: false, error: "Failed to queue." };

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await getTaskStatus(apiKey, response.task_id!);
          const isDone = res.status === 'succeeded' || (res.status as string) === 'completed' || (res.status as string) === 'success' || !!res.result_url;
          if (isDone && (res.result_url || (res as any).url || (res as any).image_url)) {
            clearInterval(interval);
            resolve({ success: true, data: { image: res.result_url || (res as any).url || (res as any).image_url } });
          } else if (res.status === 'failed' || (res.status as string) === 'error') {
            clearInterval(interval);
            resolve({ success: false, error: "Generation failed." });
          }
        } catch (e: any) {
          clearInterval(interval);
          resolve({ success: false, error: "Polling error" });
        }
      }, 3000);
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const executeIsometricHexSlicerNode = async (nodeData: any, inputs: NodeExecutionInput, context: NodeExecutionContext): Promise<NodeExecutionResult> => {
  const imageUrl = inputs.namedInputs?.['image']?.image || inputs.imageInputs[0];
  if (!imageUrl) return { success: false, error: "No input image connected." };
  
  return new Promise((resolve) => {
    const guideImg = new Image();
    guideImg.crossOrigin = "anonymous";
    guideImg.src = "/assets/hex-tool/1x1_Island_ColorGuide.png";

    const sourceImg = new Image();
    sourceImg.crossOrigin = "anonymous";
    sourceImg.src = imageUrl;

    Promise.all([
      new Promise(res => guideImg.onload = res),
      new Promise(res => sourceImg.onload = res)
    ]).then(() => {
      const targetW = 1212;
      const targetH = 1212;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve({ success: false, error: "Canvas error" });
      canvas.width = targetW; canvas.height = targetH;
      const targetAspect = targetW / targetH;
      const sourceAspect = sourceImg.width / sourceImg.height;
      let cropX = 0, cropY = 0, cropW = sourceImg.width, cropH = sourceImg.height;
      if (Math.abs(sourceAspect - targetAspect) > 0.01) {
        if (sourceAspect < targetAspect) { cropW = sourceImg.width; cropH = sourceImg.width / targetAspect; cropY = (sourceImg.height - cropH) / 2; }
        else { cropH = sourceImg.height; cropW = sourceImg.height * targetAspect; cropX = (sourceImg.width - cropW) / 2; }
      }
      ctx.drawImage(sourceImg, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
      const sourceData = ctx.getImageData(0, 0, targetW, targetH).data;

      const guideCanvas = document.createElement('canvas');
      guideCanvas.width = targetW; guideCanvas.height = targetH;
      const guideCtx = guideCanvas.getContext('2d', { willReadFrequently: true });
      guideCtx?.drawImage(guideImg, 0, 0, targetW, targetH);
      const guideData = guideCtx?.getImageData(0, 0, targetW, targetH).data;
      if (!guideData) return resolve({ success: false, error: "Guide read error" });

      let darkestColor = { r: 0, g: 0, b: 0 };
      let minLuma = 255;
      for (let i = 0; i < sourceData.length; i += 4) {
        if (sourceData[i + 3] > 128) {
          const luma = (sourceData[i] + sourceData[i + 1] + sourceData[i + 2]) / 3;
          if (luma < minLuma && luma > 5) { minLuma = luma; darkestColor = { r: sourceData[i], g: sourceData[i + 1], b: sourceData[i + 2] }; }
        }
      }

      const palette = [
        { name: 'Background', r: 0, g: 0, b: 0, ignore: true }, { name: 'Gray', r: 63, g: 63, b: 63, ignore: true },
        { name: 'TopFace', r: 255, g: 255, b: 0, isCube: true }, { name: 'LeftSideFace', r: 0, g: 255, b: 128, isCube: true }, { name: 'RightSideFace', r: 255, g: 0, b: 255, isCube: true },
        { name: 'CenterFill', r: 128, g: 0, b: 255, island: true, immune: [] }, { name: 'OutterCornerNorth', r: 255, g: 255, b: 0, island: true, immune: ['top'] },
        { name: 'OutterCornerWest', r: 0, g: 0, b: 255, island: true, immune: ['top', 'left'] }, { name: 'OutterCornerEast', r: 0, g: 255, b: 0, island: true, immune: ['top', 'right'] },
        { name: 'OutterCornerSouth', r: 255, g: 0, b: 0, island: true, immune: ['top', 'left', 'right'] }, { name: 'InnerCornerNorth', r: 0, g: 128, b: 255, island: true, immune: [] },
        { name: 'InnerCornerWest', r: 128, g: 255, b: 0, island: true, immune: [] }, { name: 'InnerCornerEast', r: 255, g: 0, b: 128, island: true, immune: [] },
        { name: 'InnerCornerSouth', r: 255, g: 191, b: 0, island: true, immune: [] }, { name: 'EdgeNorthWest', r: 255, g: 0, b: 255, island: true, immune: ['top'] },
        { name: 'EdgeNorthEast', r: 0, g: 255, b: 255, island: true, immune: ['top'] }, { name: 'EdgeSouthWest', r: 0, g: 255, b: 128, island: true, immune: ['left'] }, { name: 'EdgeSouthEast', r: 255, g: 128, b: 0, island: true, immune: ['right'] }
      ];

      const getNearest = (r: number, g: number, b: number, x: number, y: number) => {
        let bestDist = Infinity, bestEntry = palette[0];
        for (const p of palette) {
          if (p.isCube && y < 800) continue;
          if (p.island && y >= 800) continue;
          const dist = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2;
          if (dist < bestDist) { bestDist = dist; bestEntry = p; }
        }
        return bestEntry;
      };

      const extracted: Record<string, { data: ImageData }> = {};
      for (const p of palette) { if (!p.ignore) extracted[p.name] = { data: new ImageData(targetW, targetH) }; }

      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const i = (y * targetW + x) * 4;
          if (guideData[i + 3] > 128) {
            const nearest = getNearest(guideData[i], guideData[i + 1], guideData[i + 2], x, y);
            if (!nearest.ignore) {
              const entry = extracted[nearest.name];
              const r = sourceData[i], g = sourceData[i + 1], b = sourceData[i + 2];
              const isBlack = (r < 15 && g < 15 && b < 15);
              entry.data.data[i] = r; entry.data.data[i + 1] = g; entry.data.data[i + 2] = b; entry.data.data[i + 3] = isBlack ? 0 : 255;
            }
          }
        }
      }

      const cubeOffsetX = 466, cubeOffsetY = 851;
      const logicalOffsets: Record<string, { x: number, y: number }> = {
        'CenterFill': { x: 466, y: 332 }, 'InnerCornerNorth': { x: 466, y: 192 }, 'InnerCornerSouth': { x: 466, y: 472 },
        'InnerCornerWest': { x: 186, y: 332 }, 'InnerCornerEast': { x: 746, y: 332 }, 'EdgeNorthWest': { x: 186, y: 192 },
        'EdgeNorthEast': { x: 746, y: 192 }, 'EdgeSouthWest': { x: 186, y: 472 }, 'EdgeSouthEast': { x: 746, y: 472 },
        'OutterCornerWest': { x: 46, y: 402 }, 'OutterCornerEast': { x: 886, y: 402 }, 'OutterCornerSouth': { x: 606, y: 542 }, 'OutterCornerNorth': { x: 326, y: 122 }
      };

      const hexPath = new Path2D();
      hexPath.moveTo(140, 0); hexPath.lineTo(280, 70); hexPath.lineTo(280, 210); hexPath.lineTo(140, 280); hexPath.lineTo(0, 210); hexPath.lineTo(0, 70); hexPath.closePath();

      const newSlices: Record<string, string> = {};
      const useWallCloning = nodeData.useWallCloning !== undefined ? nodeData.useWallCloning : true;

      for (const p of palette) {
        if (!p.island) continue;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 280; outCanvas.height = 280;
        const oCtx = outCanvas.getContext('2d');
        if (!oCtx) continue;
        const chunk = extracted[p.name];
        const offset = logicalOffsets[p.name];
        if (!offset) continue;
        const tileOffsetX = offset.x, tileOffsetY = offset.y;
        const tempC = document.createElement('canvas');
        tempC.width = targetW; tempC.height = targetH;
        const tempCtx = tempC.getContext('2d')!;

        ['TopFace', 'LeftSideFace', 'RightSideFace'].forEach(face => {
          const isTop = face === 'TopFace', isLeft = face === 'LeftSideFace', isRight = face === 'RightSideFace';
          if ((isTop && !p.immune?.includes('top')) || (isLeft && !p.immune?.includes('left')) || (isRight && !p.immune?.includes('right'))) {
            const faceChunk = extracted[face];
            tempCtx.putImageData(faceChunk.data, 0, 0);
            if (useWallCloning) { oCtx.drawImage(tempC, cubeOffsetX, cubeOffsetY, 280, 280, 0, 0, 280, 280); }
            else {
              const maskC = document.createElement('canvas'); maskC.width = 280; maskC.height = 280;
              const mCtx = maskC.getContext('2d')!;
              mCtx.drawImage(tempC, cubeOffsetX, cubeOffsetY, 280, 280, 0, 0, 280, 280);
              mCtx.globalCompositeOperation = 'source-in'; mCtx.fillStyle = `rgb(${darkestColor.r}, ${darkestColor.g}, ${darkestColor.b})`; mCtx.fillRect(0, 0, 280, 280);
              oCtx.drawImage(maskC, 0, 0);
            }
            tempCtx.clearRect(0, 0, targetW, targetH);
          }
        });

        tempCtx.putImageData(chunk.data, 0, 0);
        oCtx.drawImage(tempC, tileOffsetX, tileOffsetY, 280, 280, 0, 0, 280, 280);

        oCtx.globalCompositeOperation = 'destination-in';
        oCtx.fill(hexPath);
        oCtx.globalCompositeOperation = 'source-over';

        const imgData = oCtx.getImageData(0, 0, 280, 280);
        let currentData = imgData.data;
        for (let pass = 0; pass < 2; pass++) {
          const nextData = new Uint8ClampedArray(currentData);
          for (let y = 0; y < 280; y++) {
            for (let x = 0; x < 280; x++) {
              const i = (y * 280 + x) * 4;
              if (currentData[i + 3] < 255) {
                let found = false;
                for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < 280 && ny >= 0 && ny < 280) {
                      const ni = (ny * 280 + nx) * 4;
                      if (currentData[ni + 3] === 255) {
                        nextData[i] = currentData[ni]; nextData[i + 1] = currentData[ni + 1]; nextData[i + 2] = currentData[ni + 2]; nextData[i + 3] = 255;
                        found = true; break;
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
        newSlices[p.name] = outCanvas.toDataURL('image/png');
      }

      // Return the slices as outputImages
      // Compound node logic expects image (primary) and maybe outputImages (all)
      resolve({ success: true, data: { images: newSlices, image: Object.values(newSlices)[0] } });
    }).catch(err => {
      resolve({ success: false, error: err.message });
    });
  });
};

// -------------------------------------------------------------
// ROUTER
// -------------------------------------------------------------
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
    case 'imageExplained':
      return executeImageExplainedNode(nodeData, inputs, context);
    case 'generalImageGeneration':
      return executeGeneralImageGenerationNode(nodeData, inputs, context);
    case 'promptConnector':
      return executePromptConnectorNode(nodeData, inputs, context);
    case 'referenceImage':
      return executeReferenceImageNode(nodeData, inputs, context);
    case 'isometricDraw':
      return executeIsometricDrawNode(nodeData, inputs, context);
    case 'styleInsert':
      return executeStyleInsertNode(nodeData, inputs, context);
    case 'backgroundRemover':
      return executeBackgroundRemoverNode(nodeData, inputs, context);
    case 'tileCutter':
      return executeTileCutterNode(nodeData, inputs, context);
    case 'shadowExtractor':
      return executeShadowExtractorNode(nodeData, inputs, context);
    case 'imageEditor':
      return executeImageEditorNode(nodeData, inputs, context);
    case 'assetGenerator':
      return executeAssetGeneratorNode(nodeData, inputs, context);
    case 'tilesetGenerator':
      return executeTilesetGeneratorNode(nodeData, inputs, context);
    case 'isometricHexSlicer':
      return executeIsometricHexSlicerNode(nodeData, inputs, context);
    case 'graphInput':
      return { 
        success: true, 
        data: { 
           text: inputs.textInputs[0] || "",
           image: inputs.imageInputs[0] || "",
           value: inputs.namedInputs?.['value']?.value !== undefined ? inputs.namedInputs['value'].value : undefined
        } 
      };
    case 'graphOutput':
      return { 
        success: true, 
        data: { 
           text: inputs.textInputs.join(" ") || "",
           image: inputs.imageInputs[0] || "",
           value: inputs.namedInputs?.['value']?.value !== undefined ? inputs.namedInputs['value'].value : undefined
        } 
      };
    case 'value':
      const incomingValue = Object.values(inputs.namedInputs || {}).find(i => i.value !== undefined)?.value;
      return {
        success: true,
        data: {
          value: incomingValue !== undefined ? incomingValue : (nodeData.value !== undefined ? nodeData.value : 0)
        }
      };
    default:
      return { success: false, error: `Execution for node type '${nodeType}' is not yet implemented headlessly.` };
  }
};

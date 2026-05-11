const BASE_URL = "/api/plenxai";

export interface GenerationResponse {
  success: boolean;
  task_id?: string;
  status?: string;
  message?: string;
  error?: string;
}

export interface StatusResponse {
  success: boolean;
  task_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result_url: string | null;
  thumbnail_url?: string;
}

export interface TextGenResponse {
  success: boolean;
  text: string;
  model: string;
  error?: string;
  message?: string;
}

export async function queueImageGen(apiKey: string, data: {
  prompt: string;
  model: string;
  resolution?: string;
  aspect_ratio?: string;
  references_urls?: string[];
  negative_prompt?: string;
  images?: string[];
}): Promise<GenerationResponse> {
  const response = await fetch(`${BASE_URL}/generate/image`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function fetchNodePrompt(nodeName: string): Promise<string> {
  try {
    const response = await fetch('/promptForNodes.txt');
    if (!response.ok) return "";
    const text = await response.text();
    
    const header = `[${nodeName}]`;
    const startIndex = text.indexOf(header);
    if (startIndex === -1) return "";
    
    const contentStart = startIndex + header.length;
    const nextHeader = text.indexOf('[', contentStart);
    
    let content = "";
    if (nextHeader === -1) {
      content = text.substring(contentStart);
    } else {
      content = text.substring(contentStart, nextHeader);
    }
    
    return content.trim();
  } catch (err) {
    console.error(`Error fetching node prompt for ${nodeName}:`, err);
    return "";
  }
}

export async function generateText(apiKey: string, prompt: string, images?: string[]): Promise<TextGenResponse> {
  const rawImages = images?.map(img => img.replace(/^data:image\/[a-zA-Z]+;base64,/, ''));
  
  const response = await fetch(`${BASE_URL}/text-gen/generate`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt,
      model: "gemini-2.5-flash",
      images: rawImages,
    }),
  });
  return response.json();
}

export async function explainImage(apiKey: string, images: string[], customPrompt?: string): Promise<TextGenResponse> {
  let prompt = customPrompt;
  if (!prompt) {
    prompt = await fetchNodePrompt('ImageExplainedNode');
  }
  
  const rawImages = images?.map(img => img.replace(/^data:image\/[a-zA-Z]+;base64,/, ''));
  
  const response = await fetch(`${BASE_URL}/text-gen/generate`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt,
      model: "gemini-2.5-flash",
      images: rawImages,
    }),
  });
  return response.json();
}

export interface MediaUploadResponse {
  success: boolean;
  url: string;
  cdn_url: string;
  error?: string;
}

export async function uploadMediaDirect(apiKey: string, base64Data: string): Promise<MediaUploadResponse> {
  const response = await fetch(`${BASE_URL}/media-upload/direct`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_data: base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`,
      media_type: "image",
      push_to_cdn: true
    }),
  });
  return response.json();
}

export async function getTaskStatus(apiKey: string, taskId: string): Promise<StatusResponse> {
  const response = await fetch(`${BASE_URL}/status/${taskId}`, {
    headers: {
      "X-API-Key": apiKey,
    },
  });
  return response.json();
}

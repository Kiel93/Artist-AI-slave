export interface GeminiResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export const GOOGLE_MODELS = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }
];

export async function generateGeminiText(apiKey: string, prompt: string, images?: string[], model: string = "gemini-2.5-flash"): Promise<GeminiResponse> {
  try {
    const parts: any[] = [{ text: prompt }];

    if (images && images.length > 0) {
      images.forEach((img) => {
        // img is expected to be a data URL: data:image/png;base64,iVBORw0KGgo...
        const match = img.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        } else {
          // Fallback if raw base64 is provided without mime prefix (assume png)
          parts.push({
            inlineData: {
              mimeType: "image/png",
              data: img,
            },
          });
        }
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: parts,
          },
        ],
        generationConfig: {
          temperature: 0.7,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || "Google Gemini API error",
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    return {
      success: true,
      text: text,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to connect to Google Gemini API",
    };
  }
}

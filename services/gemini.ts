import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { VoiceType, AppMode, AspectRatio, ImageSize } from "../types";

// The API key is obtained directly from process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const VOICE_MAP: Record<VoiceType, string> = {
  'Puck': 'Puck',
  'Charon': 'Charon',
  'Kore': 'Kore',
  'Fenrir': 'Fenrir',
  'Zephyr': 'Zephyr',
  'Custom': 'Zephyr' // Fallback for custom voice
};

// Returns a fresh GoogleGenAI instance for each API call to ensure latest configuration.
export const getGeminiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Aggressively cleans text for TTS to ensure it's strictly plain text.
 */
function cleanTextForTTS(text: string): string {
  if (!text) return "";
  return text
    .replace(/[*#_~`>]/g, '') // Remove basic markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links keep text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/[^\w\s\u0900-\u097F.,!?]/gi, '') // Remove special symbols but keep English/Hindi characters and basic punctuation
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

export function getSystemInstruction(mode: AppMode, voice: VoiceType, memories: string[] = []) {
  const memoryContext = memories.length > 0 ? `\n\nTHINGS YOU REMEMBER ABOUT THE USER:\n- ${memories.join('\n- ')}` : '';
  
  const modeInstructions: Record<AppMode, string> = {
    'Fast': 'Provide short, direct, decision-focused answers. Prioritize speed and clarity. Use gemini-3-flash-preview.',
    'Deep': 'Provide detailed analysis and reasoning. Break complex problems into steps. Use thinking budget.',
    'Explore': 'Provide multiple perspectives without forcing a decision. Be curious and comprehensive.',
    'Build': 'Provide step-by-step creation guidance (plans, prompts, systems). Focus on implementation.'
  };

  return `You are "priya", an advanced, clean, minimal, and friendly AI assistant.

PERSONALITY & COMMUNICATION:
- Clean, minimal, friendly, and confident.
- Short and clear replies by default.
- You are a native speaker of both English and Hindi.
- Support both English and Hindi. Respond in the language the user uses.
- If the user talks in Hinglish (Hindi written in English script), reply in the same style.
- Use bullets instead of long paragraphs.

${modeInstructions[mode]}
- Voice Persona: ${voice}
${memoryContext}`;
}

export async function generateProImage(prompt: string, config: { aspectRatio: AspectRatio, imageSize: ImageSize }): Promise<string | null> {
  // Key selection check according to mandatory guidelines for Gemini 3 Pro Image
  if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
      if (typeof (window as any).aistudio?.openSelectKey === 'function') {
        // Trigger selection but assume success immediately as per mandatory instruction race condition rule
        (window as any).aistudio.openSelectKey();
      }
    }
  }

  try {
    const genAI = getGeminiClient();
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: config.aspectRatio,
          imageSize: config.imageSize
        }
      }
    });

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error("Creation blocked by safety filters. Try a different description.");
    }

    for (const part of candidate?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from the engine.");
  } catch (error: any) {
    console.error("Pro Image generation failed:", error);
    if (error.message && error.message.includes('entity was not found')) {
       // Reset and re-prompt if key invalid
       if (typeof (window as any).aistudio?.openSelectKey === 'function') {
         (window as any).aistudio.openSelectKey();
       }
    }
    if (error.status === 429) throw new Error("Engine is overwhelmed (Rate Limit). Please wait a moment.");
    throw new Error(error.message || "Failed to generate artifact.");
  }
}

export async function editImage(base64Image: string, prompt: string): Promise<string | null> {
  try {
    const genAI = getGeminiClient();
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: base64Image.split(',')[1] || base64Image, mimeType: 'image/png' } },
          { text: prompt }
        ]
      }
    });

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error("Modification blocked by safety filters.");
    }

    for (const part of candidate?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error: any) {
    console.error("Image edit failed:", error);
    throw new Error(error.message || "Failed to modify image.");
  }
}

export async function generateVideo(prompt: string, startImage?: string): Promise<string | null> {
  if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
      if (typeof (window as any).aistudio?.openSelectKey === 'function') {
        (window as any).aistudio.openSelectKey();
      }
    }
  }

  try {
    const genAI = getGeminiClient();
    const videoConfig: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt || 'A cinematic motion video',
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    };

    if (startImage) {
      videoConfig.image = {
        imageBytes: startImage.split(',')[1] || startImage,
        mimeType: 'image/png'
      };
    }

    let operation = await genAI.models.generateVideos(videoConfig);
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await genAI.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Engine failed to provide a download link for the video.");
    
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error("Video generation failed:", error);
    throw new Error(error.message || "Failed to generate video sequence.");
  }
}

export async function speakText(text: string, voiceType: VoiceType = 'Zephyr'): Promise<string | null> {
  try {
    const genAI = getGeminiClient();
    const voiceName = VOICE_MAP[voiceType] || 'Zephyr';
    
    const cleanedText = cleanTextForTTS(text);
    if (!cleanedText) return null;

    const truncatedText = cleanedText.length > 200 ? cleanedText.substring(0, 200) + "..." : cleanedText;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say this exactly: ${truncatedText}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) return null;
    return audioData;
  } catch (error) {
    console.error("TTS failed:", error);
    return null;
  }
}

export const generateImageFn: FunctionDeclaration = {
  name: 'generate_image',
  parameters: {
    type: Type.OBJECT,
    description: 'Generates a creative image based on a detailed text description.',
    properties: {
      prompt: { type: Type.STRING, description: 'A detailed description of the image to generate.' },
    },
    required: ['prompt'],
  },
};

export const manageMemoryFn: FunctionDeclaration = {
  name: 'manage_memory',
  parameters: {
    type: Type.OBJECT,
    description: 'Updates the long-term memory of the assistant about the user.',
    properties: {
      action: { type: Type.STRING, enum: ['add', 'delete'], description: 'The action to perform on the memory.', },
      content: { type: Type.STRING, description: 'The concise fact or preference to remember or remove.', },
    },
    required: ['action', 'content'],
  },
};

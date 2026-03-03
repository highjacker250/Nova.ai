import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { VoiceType, AppMode, AspectRatio, ImageSize } from "../types";

/* ===========================
   API KEY (VITE SAFE VERSION)
=========================== */

const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    console.error("❌ Gemini API Key missing!");
  }
  return key;
};

export const getGeminiClient = () =>
  new GoogleGenAI({ apiKey: getApiKey() });

/* ===========================
   MODELS (FREE FRIENDLY)
=========================== */

export const TEXT_MODEL = "gemini-1.5-flash";
export const IMAGE_MODEL = "gemini-2.5-flash-image";
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";

/* ===========================
   SYSTEM INSTRUCTION
=========================== */

export function getSystemInstruction(mode: AppMode) {
  const modeInstructions: Record<AppMode, string> = {
    Fast: "Short, fast, clear answers.",
    Deep: "Detailed reasoning and step-by-step explanation.",
    Explore: "Multiple perspectives, no forced conclusion.",
    Build: "Step-by-step practical guidance."
  };

  return `You are Priya, a friendly AI assistant.

- Respond in the same language as the user.
- Keep answers clean and clear.
- Use bullets instead of long paragraphs.

${modeInstructions[mode]}`;
}

/* ===========================
   TEXT GENERATION
=========================== */

export async function generateText(prompt: string) {
  try {
    const genAI = getGeminiClient();

    const response = await genAI.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ parts: [{ text: prompt }] }]
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
  } catch (error: any) {
    if (error.status === 429) {
      return "⚠️ Rate limit reached. Please wait a few seconds.";
    }
    return "⚠️ Something went wrong.";
  }
}

/* ===========================
   IMAGE GENERATION
=========================== */

export async function generateImage(prompt: string) {
  try {
    const genAI = getGeminiClient();

    const response = await genAI.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ parts: [{ text: prompt }] }]
    });

    const part = response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData
    );

    if (!part) return null;

    return `data:image/png;base64,${part.inlineData.data}`;
  } catch (error) {
    console.error("Image error:", error);
    return null;
  }
}

/* ===========================
   TEXT TO SPEECH
=========================== */

export async function speakText(text: string) {
  try {
    const genAI = getGeminiClient();

    const response = await genAI.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO]
      }
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS error:", error);
    return null;
  }
}

/* ===========================
   FUNCTION DECLARATIONS
=========================== */

export const generateImageFn: FunctionDeclaration = {
  name: "generate_image",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING }
    },
    required: ["prompt"]
  }
};

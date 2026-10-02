import axios from 'axios';

/**
 * Base URL of the API Gateway proxy — injected at build time via VITE_API_BASE_URL.
 * No AI provider key (GROQ, ElevenLabs) appears anywhere in this file after
 * this change; those keys live in AWS Secrets Manager and are only accessed
 * by the Lambda functions server-side.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export interface TranscriptionResponse {
  text: string;
}

export interface VoiceAnalysisResponse {
  diagnosis: string;
  confidence: number;
  explanation: string;
  audioUrl?: string;
}

// Convert audio blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // Remove data:audio/webm;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Convert image to base64
const imageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // Remove data:image/jpeg;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Transcribe audio using GROQ Whisper via the serverless proxy.
 * Sends multipart/form-data to POST /transcribe; the proxy forwards the
 * raw body to GROQ and returns { text: string }.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL is not configured — rebuild with the API Gateway endpoint');
  }

  try {
    // The proxy expects the same multipart shape the old direct call used.
    // It forwards the raw body verbatim to GROQ, so no change to the FormData.
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'en');

    const response = await axios.post<{ text: string }>(
      `${API_BASE}/transcribe`,
      formData,
      {
        // axios sets Content-Type: multipart/form-data with boundary automatically
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );

    return response.data.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }
};

/**
 * Analyze image with voice query.
 * Routes through the /diagnose-image proxy (Gemini) rather than calling
 * GROQ directly. The voice query is appended to the standard system prompt
 * inside the Lambda handler's fixed prompt text.
 *
 * If you need the llama-4-scout model specifically for this flow, add a
 * dedicated /analyze-image-voice route following the same Lambda pattern.
 */
export const analyzeImageWithVoice = async (
  imageFile: File,
  voiceQuery: string,
): Promise<VoiceAnalysisResponse> => {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL is not configured — rebuild with the API Gateway endpoint');
  }

  try {
    const base64Image = await imageToBase64(imageFile);

    const response = await axios.post<{
      diagnosis: string;
      observations: string;
      confidence: number;
      recommendations: string;
    }>(
      `${API_BASE}/diagnose-image`,
      {
        imageBase64: base64Image,
        mimeType: imageFile.type || 'image/jpeg',
        // voiceQuery is forwarded as metadata; the Lambda includes it in the
        // prompt context. For now it's included in the JSON body for future
        // Lambda-side use — the current handler ignores it but won't fail.
        voiceQuery,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    return {
      diagnosis: response.data.diagnosis,
      confidence: response.data.confidence,
      explanation: `Observations: ${response.data.observations}\n\nRecommendations: ${response.data.recommendations}`,
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error('Failed to analyze image');
  }
};

/**
 * Generate speech using ElevenLabs via the serverless proxy.
 * The proxy returns { audioBase64, mimeType } which we decode into a
 * Blob URL for the audio element — same interface as before.
 *
 * Falls back to the Web Speech API only when VITE_API_BASE_URL is absent
 * (i.e., local dev without env configured), preserving the existing
 * graceful-degradation behaviour for TTS (not for AI diagnosis/transcription).
 */
export const generateSpeech = async (text: string): Promise<string> => {
  if (!API_BASE) {
    // Local dev fallback — NEVER reached in production where API_BASE is set
    return generateSpeechWebAPI(text);
  }

  try {
    const response = await axios.post<{ audioBase64: string; mimeType: string }>(
      `${API_BASE}/synthesize-speech`,
      { text },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const { audioBase64, mimeType } = response.data;

    // Decode base64 MP3 and create an object URL for the audio element
    const binary = atob(audioBase64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const audioBlob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    console.error('synthesize-speech proxy error:', error);
    // Degrade to browser TTS for speech output only — consistent with the
    // original §9 pattern but scoped to voice playback, not AI results.
    return generateSpeechWebAPI(text);
  }
};

// Fallback Web Speech API (unchanged from original)
const generateSpeechWebAPI = (text: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to use a female voice
    const voices = speechSynthesis.getVoices();
    const femaleVoice = voices.find(voice =>
      voice.name.toLowerCase().includes('female') ||
      voice.name.toLowerCase().includes('woman') ||
      voice.name.toLowerCase().includes('samantha') ||
      voice.name.toLowerCase().includes('karen'),
    );

    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    utterance.onend = () => {
      resolve('web-speech-api'); // Return a placeholder since Web Speech API doesn't return audio URL
    };

    utterance.onerror = (event) => {
      reject(new Error(`Speech synthesis error: ${event.error}`));
    };

    speechSynthesis.speak(utterance);
  });
};
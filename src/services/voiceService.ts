import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;

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

// Transcribe audio using GROQ Whisper
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ API key not configured');
  }

  try {
    // Convert webm to wav for better compatibility
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'en');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }
};

// Analyze image with voice query using GROQ
export const analyzeImageWithVoice = async (
  imageFile: File,
  voiceQuery: string
): Promise<VoiceAnalysisResponse> => {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ API key not configured');
  }

  try {
    const base64Image = await imageToBase64(imageFile);
    
    const systemPrompt = `You are a professional medical AI assistant. Analyze the medical image and respond to the patient's question. 
    Provide a preliminary assessment, key observations, and recommendations. 
    Keep your response conversational and empathetic, as if speaking directly to the patient.
    Format your response as JSON with these fields:
    - diagnosis: string (preliminary findings)
    - confidence: number (0-1)
    - explanation: string (detailed explanation in conversational tone)
    
    Patient's question: ${voiceQuery}`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0]?.message?.content;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          diagnosis: parsed.diagnosis || 'Analysis completed',
          confidence: parsed.confidence || 0.75,
          explanation: parsed.explanation || content,
        };
      }
    } catch (parseError) {
      // Fallback for non-JSON responses
      return {
        diagnosis: 'Medical image analysis completed',
        confidence: 0.75,
        explanation: content,
      };
    }

    return {
      diagnosis: 'Medical image analysis completed',
      confidence: 0.75,
      explanation: content,
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error('Failed to analyze image');
  }
};

// Generate speech using ElevenLabs
export const generateSpeech = async (text: string): Promise<string> => {
  if (!ELEVENLABS_API_KEY) {
    // Fallback to Web Speech API
    return generateSpeechWebAPI(text);
  }

  try {
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', // Rachel voice
      {
        text: text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        responseType: 'blob',
      }
    );

    const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    // Fallback to Web Speech API
    return generateSpeechWebAPI(text);
  }
};

// Fallback Web Speech API
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
      voice.name.toLowerCase().includes('karen')
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
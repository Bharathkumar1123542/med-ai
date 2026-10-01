import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Download } from 'lucide-react';
import { motion } from 'framer-motion';

interface VoiceResponseProps {
  text: string;
  audioUrl?: string;
  isGenerating?: boolean;
}

const VoiceResponse: React.FC<VoiceResponseProps> = ({ 
  text, 
  audioUrl, 
  isGenerating = false 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (audioUrl && audioUrl !== 'web-speech-api') {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      setAudioElement(audio);
      
      return () => {
        audio.pause();
        audio.src = '';
      };
    }
  }, [audioUrl]);

  // Auto-play when audio is ready (if not muted)
  useEffect(() => {
    if (audioUrl && !isMuted && audioElement && !isGenerating) {
      const timer = setTimeout(() => {
        audioElement.play().catch(console.error);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [audioUrl, isMuted, audioElement, isGenerating]);

  const handlePlayPause = () => {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play().catch(console.error);
    }
  };

  const handleDownload = () => {
    if (audioUrl && audioUrl !== 'web-speech-api') {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = 'diagnosis-response.mp3';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioElement && isPlaying) {
      audioElement.pause();
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Volume2 className="h-5 w-5 mr-2 text-blue-600" />
          AI Doctor Response
        </h3>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full transition-colors ${
              isMuted 
                ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          
          {audioUrl && audioUrl !== 'web-speech-api' && (
            <>
              <button
                onClick={handlePlayPause}
                disabled={isGenerating}
                className="p-2 bg-green-100 text-green-600 hover:bg-green-200 rounded-full transition-colors disabled:opacity-50"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              
              <button
                onClick={handleDownload}
                className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                title="Download Audio"
              >
                <Download className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {isGenerating ? (
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-blue-500 rounded-full"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <span className="text-gray-600">Generating response...</span>
        </div>
      ) : (
        <>
          <div className="prose prose-blue max-w-none">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {text}
            </p>
          </div>

          {/* Audio Visualization */}
          {isPlaying && (
            <div className="mt-4 flex items-center justify-center space-x-1">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-blue-500 rounded-full"
                  animate={{
                    height: [4, 16, 4],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </div>
          )}

          {audioUrl && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                {isPlaying ? '🔊 Playing audio response' : '🎵 Audio response ready'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VoiceResponse;
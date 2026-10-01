import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, Trash2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ 
  onRecordingComplete, 
  disabled = false 
}) => {
  const {
    isRecording,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    clearRecording,
    error,
  } = useVoiceRecording();

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Handle audio playback
  useEffect(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      setAudioElement(audio);
      return () => {
        audio.pause();
        audio.src = '';
      };
    }
  }, [audioUrl]);

  // Notify parent when recording is complete
  useEffect(() => {
    if (audioBlob && !isRecording) {
      onRecordingComplete(audioBlob);
    }
  }, [audioBlob, isRecording, onRecordingComplete]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      clearRecording();
      await startRecording();
    }
  };

  const handlePlayPause = () => {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      audioElement.play();
      setIsPlaying(true);
    }
  };

  const handleClear = () => {
    if (audioElement) {
      audioElement.pause();
      setIsPlaying(false);
    }
    clearRecording();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Volume2 className="h-5 w-5 mr-2 text-blue-600" />
          Voice Input
        </h3>
        {isRecording && (
          <div className="flex items-center space-x-2 text-red-600">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-center space-x-4">
        {/* Record Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleToggleRecording}
          disabled={disabled}
          className={`relative p-4 rounded-full transition-all duration-200 ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div
                key="recording"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <MicOff className="h-6 w-6" />
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Mic className="h-6 w-6" />
              </motion.div>
            )}
          </AnimatePresence>
          
          {isRecording && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-red-300"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.button>

        {/* Play/Pause Button */}
        {audioUrl && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlayPause}
            disabled={disabled}
            className="p-3 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors disabled:opacity-50"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </motion.button>
        )}

        {/* Clear Button */}
        {audioUrl && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClear}
            disabled={disabled}
            className="p-3 bg-gray-500 hover:bg-gray-600 text-white rounded-full transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" />
          </motion.button>
        )}
      </div>

      <div className="mt-4 text-center">
        <p className="text-sm text-gray-600">
          {isRecording
            ? 'Recording... Click to stop'
            : audioUrl
            ? 'Recording ready - Click play to review'
            : 'Click the microphone to start recording your question'
          }
        </p>
      </div>

      {/* Audio Waveform Visualization */}
      {isRecording && (
        <div className="mt-4 flex items-center justify-center space-x-1">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 bg-blue-500 rounded-full"
              animate={{
                height: [4, 20, 4],
              }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
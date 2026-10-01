import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Loader, Camera, FileText, Mic } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import Header from '../Layout/Header';
import VoiceRecorder from '../Voice/VoiceRecorder';
import VoiceResponse from '../Voice/VoiceResponse';
import { transcribeAudio, analyzeImageWithVoice, generateSpeech } from '../../services/voiceService';

const VoiceDiagnosisForm: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'input' | 'processing' | 'response'>('input');
  
  // Voice-related state
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [responseAudioUrl, setResponseAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.bmp', '.tiff'],
    },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        setUploadedImage(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    },
  });

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
  };

  const handleVoiceRecording = async (blob: Blob) => {
    setAudioBlob(blob);
    try {
      const transcription = await transcribeAudio(blob);
      setTranscribedText(transcription);
      toast.success('Voice recorded and transcribed successfully!');
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error('Failed to transcribe audio. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadedImage || !patientName.trim()) {
      toast.error('Please provide patient name and upload an image');
      return;
    }

    if (!audioBlob || !transcribedText) {
      toast.error('Please record your voice question');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to submit a diagnosis');
      return;
    }

    setProcessing(true);
    setCurrentStep('processing');

    try {
      // Analyze image with voice query
      const analysis = await analyzeImageWithVoice(uploadedImage, transcribedText);
      setAiResponse(analysis.explanation);

      // Generate speech response
      setIsGeneratingAudio(true);
      try {
        const audioUrl = await generateSpeech(analysis.explanation);
        setResponseAudioUrl(audioUrl);
      } catch (audioError) {
        console.error('Audio generation error:', audioError);
        toast.warn('Voice response generation failed, but text response is available');
      } finally {
        setIsGeneratingAudio(false);
      }

      // Upload image to Supabase Storage
      const fileName = `${user.id}/${Date.now()}-${uploadedImage.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('medical-images')
        .upload(fileName, uploadedImage, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('medical-images')
        .getPublicUrl(fileName);

      // Save diagnosis to database
      const { data, error } = await supabase
        .from('diagnoses')
        .insert({
          user_id: user.id,
          patient_name: patientName.trim(),
          image_url: publicUrl,
          diagnosis: analysis.diagnosis,
          confidence_score: analysis.confidence,
          explanation: `Voice Query: "${transcribedText}"\n\nAI Response: ${analysis.explanation}`,
        })
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw new Error(`Failed to save diagnosis: ${error.message}`);
      }

      // Log audit trail
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'voice_diagnosis_created',
        details: {
          diagnosis_id: data.id,
          patient_name: patientName,
          voice_query: transcribedText,
          confidence_score: analysis.confidence,
        },
        ip_address: 'web-client',
      });

      setCurrentStep('response');
      toast.success('Voice diagnosis completed successfully!');
      
      // Auto-navigate after showing response
      setTimeout(() => {
        navigate(`/diagnosis/${data.id}`);
      }, 10000);

    } catch (error) {
      console.error('Submission error:', error);
      toast.error(`Failed to process diagnosis: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCurrentStep('input');
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setCurrentStep('input');
    setPatientName('');
    setUploadedImage(null);
    setImagePreview(null);
    setAudioBlob(null);
    setTranscribedText('');
    setAiResponse('');
    setResponseAudioUrl(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Header />
      
      <main className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8 text-center"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Voice-Enabled AI Diagnosis
          </h1>
          <p className="text-gray-600 text-lg">
            Speak your concerns and get AI-powered medical insights with voice responses
          </p>
        </motion.div>

        {currentStep === 'input' && (
          <motion.form 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleSubmit}
            className="space-y-8"
          >
            {/* Patient Information */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Patient Information</h2>
              <div>
                <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-2">
                  Patient Name
                </label>
                <input
                  type="text"
                  id="patientName"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter patient name"
                  required
                  disabled={processing}
                />
              </div>
            </div>

            {/* Voice Input */}
            <VoiceRecorder 
              onRecordingComplete={handleVoiceRecording}
              disabled={processing}
            />

            {/* Transcribed Text Display */}
            {transcribedText && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-green-50 p-6 rounded-xl border border-green-200"
              >
                <h3 className="text-lg font-semibold text-green-900 mb-2">Your Question:</h3>
                <p className="text-green-800 italic">"{transcribedText}"</p>
              </motion.div>
            )}

            {/* Image Upload */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Medical Image</h2>
              
              {!imagePreview ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}
                >
                  <input {...getInputProps()} disabled={processing} />
                  <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    {isDragActive ? 'Drop the image here' : 'Upload Medical Image'}
                  </p>
                  <p className="text-gray-600 mb-4">
                    Drag and drop or click to select X-rays, CT scans, MRIs, etc.
                  </p>
                  <p className="text-sm text-gray-500">
                    Supported formats: JPEG, PNG, GIF, BMP, TIFF
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Medical image preview"
                    className="w-full h-96 object-contain bg-gray-50 rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={processing}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                disabled={processing}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processing || !uploadedImage || !patientName.trim() || !transcribedText}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center space-x-2 shadow-lg"
              >
                {processing ? (
                  <>
                    <Loader className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    <span>Get Voice Diagnosis</span>
                  </>
                )}
              </button>
            </div>
          </motion.form>
        )}

        {currentStep === 'processing' && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center py-12"
          >
            <div className="max-w-md mx-auto">
              <div className="mb-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Processing Your Request</h2>
                <p className="text-gray-600">
                  Our AI is analyzing your image and voice query...
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">Voice transcribed</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-600">Analyzing medical image...</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span className="text-sm text-gray-400">Generating voice response...</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 'response' && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">AI Diagnosis Complete</h2>
              <p className="text-gray-600">Here's what our AI found based on your voice query and image</p>
            </div>

            {/* Patient Info Summary */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Patient</p>
                  <p className="font-medium text-gray-900">{patientName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Your Question</p>
                  <p className="font-medium text-gray-900 italic">"{transcribedText}"</p>
                </div>
              </div>
            </div>

            {/* AI Response */}
            <VoiceResponse 
              text={aiResponse}
              audioUrl={responseAudioUrl}
              isGenerating={isGeneratingAudio}
            />

            {/* Action Buttons */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={resetForm}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                New Diagnosis
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                View Dashboard
              </button>
            </div>

            <div className="text-center text-sm text-gray-500">
              <p>You'll be redirected to the detailed report in a few seconds...</p>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default VoiceDiagnosisForm;
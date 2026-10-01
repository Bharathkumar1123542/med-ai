import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Loader, Camera, FileText } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import Header from '../Layout/Header';

const DiagnosisForm: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

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

  const analyzeWithGemini = async (imageBase64: string): Promise<any> => {
    const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `As a medical AI assistant, analyze this medical image and provide:
                  1. A preliminary diagnosis or findings
                  2. Key observations
                  3. Confidence level (0-1)
                  4. Recommendations for further evaluation
                  
                  Format your response as a JSON object with these fields:
                  - diagnosis: string
                  - observations: string
                  - confidence: number (0-1)
                  - recommendations: string
                  
                  Important: This is for educational/assistant purposes only and should not replace professional medical consultation.`
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to analyze image with Gemini API');
    }

    const data = await response.json();
    const textContent = data.candidates[0]?.content?.parts[0]?.text;
    
    if (!textContent) {
      throw new Error('No analysis returned from Gemini API');
    }

    try {
      // Try to parse JSON from the response
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: parse the text response manually
        return {
          diagnosis: textContent.split('\n')[0] || 'Analysis completed',
          observations: textContent,
          confidence: 0.75,
          recommendations: 'Please consult with a healthcare professional for proper evaluation.',
        };
      }
    } catch (parseError) {
      // Fallback for non-JSON responses
      return {
        diagnosis: 'Medical image analysis completed',
        observations: textContent,
        confidence: 0.75,
        recommendations: 'Please consult with a healthcare professional for proper evaluation.',
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadedImage || !patientName.trim()) {
      toast.error('Please provide patient name and upload an image');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to submit a diagnosis');
      return;
    }

    setProcessing(true);

    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const base64Image = base64Data.split(',')[1]; // Remove data:image/jpeg;base64, prefix

        try {
          // Analyze with Gemini
          const analysis = await analyzeWithGemini(base64Image);

          // Upload image to Supabase Storage with user folder structure
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
              explanation: `Observations: ${analysis.observations}\n\nRecommendations: ${analysis.recommendations}`,
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
            action: 'diagnosis_created',
            details: {
              diagnosis_id: data.id,
              patient_name: patientName,
              confidence_score: analysis.confidence,
            },
            ip_address: 'web-client', // In production, get actual IP
          });

          toast.success('Diagnosis completed successfully!');
          navigate(`/diagnosis/${data.id}`);
        } catch (analysisError) {
          console.error('Analysis error:', analysisError);
          toast.error(`Failed to process diagnosis: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
        }
      };

      reader.readAsDataURL(uploadedImage);
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Failed to process diagnosis. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900">New Diagnosis</h1>
          <p className="text-gray-600 mt-2">
            Upload a medical image for AI-powered analysis
          </p>
        </motion.div>

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
              disabled={processing || !uploadedImage || !patientName.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {processing ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5" />
                  <span>Generate Diagnosis</span>
                </>
              )}
            </button>
          </div>
        </motion.form>
      </main>
    </div>
  );
};

export default DiagnosisForm;
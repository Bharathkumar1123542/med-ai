import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Calendar, User, Activity, AlertTriangle, Trash2, MessageCircle, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Header from '../Layout/Header';
import FollowUpModal from './FollowUpModal';
import DeleteConfirmModal from './DeleteConfirmModal';

interface Diagnosis {
  id: string;
  patient_name: string;
  image_url: string;
  diagnosis: string;
  confidence_score: number;
  explanation: string;
  created_at: string;
}

interface FollowUp {
  id: string;
  diagnosis_id: string;
  notes: string;
  status: 'pending' | 'in_progress' | 'resolved';
  created_at: string;
}

const DiagnosisDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchDiagnosis();
    fetchFollowUps();
  }, [id, user]);

  const fetchDiagnosis = async () => {
    if (!id || !user) return;

    try {
      const { data, error } = await supabase
        .from('diagnoses')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setDiagnosis(data);
    } catch (error) {
      console.error('Error fetching diagnosis:', error);
      toast.error('Failed to load diagnosis');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowUps = async () => {
    if (!id || !user) return;

    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('diagnosis_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFollowUps(data || []);
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
    }
  };

  const handleDelete = async () => {
    if (!diagnosis || !user) return;

    setDeleting(true);
    try {
      // Delete follow-ups first
      await supabase
        .from('follow_ups')
        .delete()
        .eq('diagnosis_id', diagnosis.id);

      // Delete the diagnosis
      const { error } = await supabase
        .from('diagnoses')
        .delete()
        .eq('id', diagnosis.id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Delete the image from storage
      const imagePath = diagnosis.image_url.split('/').pop();
      if (imagePath) {
        await supabase.storage
          .from('medical-images')
          .remove([`${user.id}/${imagePath}`]);
      }

      // Log audit trail
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'diagnosis_deleted',
        details: {
          diagnosis_id: diagnosis.id,
          patient_name: diagnosis.patient_name,
        },
        ip_address: 'web-client',
      });

      toast.success('Diagnosis deleted successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting diagnosis:', error);
      toast.error('Failed to delete diagnosis');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleFollowUpAdded = () => {
    fetchFollowUps();
    setShowFollowUpModal(false);
    toast.success('Follow-up added successfully');
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-700 bg-green-100 border-green-200';
    if (score >= 0.6) return 'text-yellow-700 bg-yellow-100 border-yellow-200';
    return 'text-red-700 bg-red-100 border-red-200';
  };

  const getConfidenceIcon = (score: number) => {
    if (score >= 0.8) return <Activity className="h-5 w-5" />;
    if (score >= 0.6) return <Activity className="h-5 w-5" />;
    return <AlertTriangle className="h-5 w-5" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const generatePDF = async () => {
    if (!diagnosis) return;

    try {
      const reportElement = document.getElementById('diagnosis-report');
      if (!reportElement) return;

      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`diagnosis-${diagnosis.patient_name}-${format(new Date(diagnosis.created_at), 'yyyy-MM-dd')}.pdf`);
      toast.success('Report downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="bg-white p-6 rounded-xl">
              <div className="space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!diagnosis) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <p className="text-gray-600">Diagnosis not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-6"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Dashboard</span>
          </button>
          
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Diagnosis Report</h1>
              <p className="text-gray-600 mt-2">
                Generated on {format(new Date(diagnosis.created_at), 'MMMM d, yyyy')}
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowFollowUpModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Add Follow-up</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Printer className="h-4 w-4" />
                <span>Print</span>
              </button>
              <button
                onClick={generatePDF}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div 
          id="diagnosis-report"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6"
        >
          {/* Header */}
          <div className="bg-blue-600 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Medical AI Diagnosis Report</h2>
                <p className="text-blue-100 mt-1">AI-Assisted Medical Image Analysis</p>
              </div>
              <div className="text-right">
                <p className="text-blue-100">Report ID</p>
                <p className="font-mono text-sm">{diagnosis.id.slice(0, 8)}</p>
              </div>
            </div>
          </div>

          {/* Patient Information */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Patient Name</p>
                  <p className="font-medium text-gray-900">{diagnosis.patient_name}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Analysis Date</p>
                  <p className="font-medium text-gray-900">
                    {format(new Date(diagnosis.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Medical Image */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Medical Image</h3>
            <div className="flex justify-center">
              <img
                src={diagnosis.image_url}
                alt="Medical scan"
                className="max-w-full h-96 object-contain bg-gray-50 rounded-lg border"
              />
            </div>
          </div>

          {/* Diagnosis Results */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Analysis Results</h3>
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">Primary Diagnosis</h4>
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${getConfidenceColor(diagnosis.confidence_score)}`}>
                  {getConfidenceIcon(diagnosis.confidence_score)}
                  <span className="text-sm font-medium">
                    {(diagnosis.confidence_score * 100).toFixed(1)}% Confidence
                  </span>
                </div>
              </div>
              <p className="text-gray-900 bg-gray-50 p-4 rounded-lg border">
                {diagnosis.diagnosis}
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Detailed Analysis</h4>
              <div className="text-gray-700 bg-gray-50 p-4 rounded-lg border whitespace-pre-wrap">
                {diagnosis.explanation}
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-6 bg-amber-50 border-t border-amber-200">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-6 w-6 text-amber-600 mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-amber-900">Important Medical Disclaimer</h4>
                <p className="text-amber-800 text-sm mt-1">
                  This AI-generated analysis is for informational and educational purposes only. 
                  It should not be used as a substitute for professional medical advice, diagnosis, 
                  or treatment. Always consult with qualified healthcare professionals for proper 
                  medical evaluation and treatment decisions.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-between items-center text-sm text-gray-600">
              <p>Generated by MedAI Diagnosis System</p>
              <p>Report generated on {format(new Date(), 'MMMM d, yyyy \'at\' h:mm a')}</p>
            </div>
          </div>
        </motion.div>

        {/* Follow-ups Section */}
        {followUps.length > 0 && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Follow-up Notes</h3>
            </div>
            <div className="divide-y divide-gray-200">
              <AnimatePresence>
                {followUps.map((followUp) => (
                  <motion.div
                    key={followUp.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="p-6"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <MessageCircle className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-gray-600">
                          {format(new Date(followUp.created_at), 'MMM d, yyyy \'at\' h:mm a')}
                        </span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(followUp.status)}`}>
                        {followUp.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">{followUp.notes}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </main>

      {/* Modals */}
      <FollowUpModal
        isOpen={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        diagnosisId={diagnosis.id}
        onFollowUpAdded={handleFollowUpAdded}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        patientName={diagnosis.patient_name}
        isDeleting={deleting}
      />
    </div>
  );
};

export default DiagnosisDetail;
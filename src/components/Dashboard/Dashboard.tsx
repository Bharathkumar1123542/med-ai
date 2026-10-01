import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Clock, TrendingUp, Activity, Mic, Camera, MessageCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import Header from '../Layout/Header';
import { toast } from 'react-toastify';

interface Diagnosis {
  id: string;
  patient_name: string;
  diagnosis: string;
  confidence_score: number;
  created_at: string;
}

interface FollowUp {
  id: string;
  diagnosis_id: string;
  status: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    thisWeek: 0,
    avgConfidence: 0,
    pendingFollowUps: 0,
  });

  useEffect(() => {
    fetchDiagnoses();
    fetchFollowUps();
  }, [user]);

  const fetchDiagnoses = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('diagnoses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setDiagnoses(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error('Error fetching diagnoses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowUps = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('id, diagnosis_id, status')
        .eq('user_id', user.id);

      if (error) throw error;
      setFollowUps(data || []);
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
    }
  };

  const calculateStats = (data: Diagnosis[]) => {
    const total = data.length;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const thisWeek = data.filter(d => new Date(d.created_at) > weekAgo).length;
    const avgConfidence = total > 0 
      ? data.reduce((sum, d) => sum + d.confidence_score, 0) / total
      : 0;
    
    const pendingFollowUps = followUps.filter(f => f.status === 'pending').length;

    setStats({ total, thisWeek, avgConfidence, pendingFollowUps });
  };

  const handleQuickDelete = async (diagnosisId: string, patientName: string) => {
    if (!window.confirm(`Are you sure you want to delete the diagnosis for ${patientName}?`)) {
      return;
    }

    try {
      // Delete follow-ups first
      await supabase
        .from('follow_ups')
        .delete()
        .eq('diagnosis_id', diagnosisId);

      // Delete the diagnosis
      const { error } = await supabase
        .from('diagnoses')
        .delete()
        .eq('id', diagnosisId)
        .eq('user_id', user!.id);

      if (error) throw error;

      // Log audit trail
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action: 'diagnosis_deleted',
        details: {
          diagnosis_id: diagnosisId,
          patient_name: patientName,
          deleted_from: 'dashboard',
        },
        ip_address: 'web-client',
      });

      toast.success('Diagnosis deleted successfully');
      fetchDiagnoses(); // Refresh the list
    } catch (error) {
      console.error('Error deleting diagnosis:', error);
      toast.error('Failed to delete diagnosis');
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getDiagnosisFollowUps = (diagnosisId: string) => {
    return followUps.filter(f => f.diagnosis_id === diagnosisId);
  };

  // Recalculate stats when followUps change
  useEffect(() => {
    if (diagnoses.length > 0) {
      calculateStats(diagnoses);
    }
  }, [followUps]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Header />
      
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Welcome to MedAI Diagnosis
          </h1>
          <p className="text-gray-600 text-lg">
            Hello, {user?.user_metadata?.full_name || user?.email}! 
            Choose how you'd like to interact with our AI doctor today.
          </p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
        >
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Diagnoses</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">This Week</p>
                <p className="text-2xl font-bold text-gray-900">{stats.thisWeek}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Activity className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg Confidence</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats.avgConfidence * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-lg">
                <MessageCircle className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Follow-ups</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingFollowUps}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Diagnosis Options */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Start New Diagnosis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Voice Diagnosis Card */}
            <Link
              to="/voice-diagnose"
              className="group bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-xl text-white hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              <div className="flex items-center mb-4">
                <div className="p-3 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                  <Mic className="h-8 w-8" />
                </div>
                <div className="ml-4">
                  <h3 className="text-2xl font-bold">Voice Diagnosis</h3>
                  <p className="text-blue-100">Speak your concerns naturally</p>
                </div>
              </div>
              <p className="text-blue-50 leading-relaxed">
                Upload a medical image and describe your symptoms using voice. 
                Our AI will analyze both and respond with a spoken diagnosis, 
                making the experience more personal and accessible.
              </p>
              <div className="mt-6 flex items-center text-blue-100">
                <span className="text-sm font-medium">Try Voice Diagnosis</span>
                <Plus className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Traditional Diagnosis Card */}
            <Link
              to="/diagnose"
              className="group bg-gradient-to-br from-gray-600 to-gray-700 p-8 rounded-xl text-white hover:from-gray-700 hover:to-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              <div className="flex items-center mb-4">
                <div className="p-3 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                  <Camera className="h-8 w-8" />
                </div>
                <div className="ml-4">
                  <h3 className="text-2xl font-bold">Traditional Diagnosis</h3>
                  <p className="text-gray-200">Text-based analysis</p>
                </div>
              </div>
              <p className="text-gray-100 leading-relaxed">
                Upload medical images for AI analysis using our traditional 
                text-based interface. Perfect for detailed documentation 
                and when voice input isn't available.
              </p>
              <div className="mt-6 flex items-center text-gray-200">
                <span className="text-sm font-medium">Use Traditional Method</span>
                <Plus className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>
        </motion.div>

        {/* Recent Diagnoses */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Diagnoses</h2>
          </div>

          {loading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
                ))}
              </div>
            </div>
          ) : diagnoses.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No diagnoses yet</p>
              <p className="text-sm text-gray-500 mb-6">
                Start your first diagnosis using voice or traditional method above
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {diagnoses.map((diagnosis) => {
                const diagnosisFollowUps = getDiagnosisFollowUps(diagnosis.id);
                const pendingCount = diagnosisFollowUps.filter(f => f.status === 'pending').length;
                
                return (
                  <div key={diagnosis.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">
                            {diagnosis.patient_name}
                          </h3>
                          {pendingCount > 0 && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                              {pendingCount} pending follow-up{pendingCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 mb-2">{diagnosis.diagnosis}</p>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center text-sm text-gray-500">
                            <Clock className="h-4 w-4 mr-1" />
                            {format(new Date(diagnosis.created_at), 'MMM d, yyyy')}
                          </div>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(
                              diagnosis.confidence_score
                            )}`}
                          >
                            {(diagnosis.confidence_score * 100).toFixed(1)}% confidence
                          </span>
                          {diagnosisFollowUps.length > 0 && (
                            <div className="flex items-center text-sm text-gray-500">
                              <MessageCircle className="h-4 w-4 mr-1" />
                              {diagnosisFollowUps.length} follow-up{diagnosisFollowUps.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 flex items-center space-x-2">
                        <button
                          onClick={() => handleQuickDelete(diagnosis.id, diagnosis.patient_name)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete diagnosis"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <Link
                          to={`/diagnosis/${diagnosis.id}`}
                          className="px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
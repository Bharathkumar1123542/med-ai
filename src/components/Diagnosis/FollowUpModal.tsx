import React, { useState } from 'react';
import { X, MessageCircle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-toastify';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnosisId: string;
  onFollowUpAdded: () => void;
}

const FollowUpModal: React.FC<FollowUpModalProps> = ({
  isOpen,
  onClose,
  diagnosisId,
  onFollowUpAdded,
}) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'resolved'>('pending');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!notes.trim() || !user) {
      toast.error('Please enter follow-up notes');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('follow_ups')
        .insert({
          diagnosis_id: diagnosisId,
          notes: notes.trim(),
          status,
          user_id: user.id,
        });

      if (error) {
        console.error('Follow-up insert error:', error);
        throw error;
      }

      // Log audit trail
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'follow_up_added',
        details: {
          diagnosis_id: diagnosisId,
          status,
          notes_length: notes.trim().length,
        },
        ip_address: 'web-client',
      });

      setNotes('');
      setStatus('pending');
      onFollowUpAdded();
      toast.success('Follow-up added successfully!');
    } catch (error) {
      console.error('Error adding follow-up:', error);
      toast.error('Failed to add follow-up. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setNotes('');
      setStatus('pending');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={handleClose}
            />

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MessageCircle className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Add Follow-up Note
                  </h3>
                </div>
                <button
                  onClick={handleClose}
                  disabled={saving}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'pending' | 'in_progress' | 'resolved')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={saving}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                    Follow-up Notes
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Enter follow-up notes, treatment updates, patient progress, etc..."
                    disabled={saving}
                    required
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {notes.length}/500 characters
                  </p>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={saving}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !notes.trim()}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Follow-up</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default FollowUpModal;
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Database {
  public: {
    Tables: {
      diagnoses: {
        Row: {
          id: string;
          user_id: string;
          patient_name: string;
          image_url: string;
          diagnosis: string;
          confidence_score: number;
          explanation: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          patient_name: string;
          image_url: string;
          diagnosis: string;
          confidence_score: number;
          explanation: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          patient_name?: string;
          image_url?: string;
          diagnosis?: string;
          confidence_score?: number;
          explanation?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          details: any;
          ip_address: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          details?: any;
          ip_address: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          details?: any;
          ip_address?: string;
          created_at?: string;
        };
      };
    };
  };
}
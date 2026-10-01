/*
  # Add follow-ups table for diagnosis tracking

  1. New Tables
    - `follow_ups`
      - `id` (uuid, primary key)
      - `diagnosis_id` (uuid, foreign key to diagnoses)
      - `user_id` (uuid, foreign key to auth.users)
      - `notes` (text)
      - `status` (enum: pending, in_progress, resolved)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on follow_ups table
    - Add policies for authenticated users to manage their own follow-ups
    - Users can only access follow-ups for their own diagnoses

  3. Indexes
    - Add indexes for better query performance
*/

-- Create enum type for follow-up status
DO $$ BEGIN
  CREATE TYPE follow_up_status AS ENUM ('pending', 'in_progress', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create follow_ups table
CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notes text NOT NULL,
  status follow_up_status DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Create policies for follow_ups table
CREATE POLICY "Users can read own follow-ups"
  ON follow_ups
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own follow-ups"
  ON follow_ups
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own follow-ups"
  ON follow_ups
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own follow-ups"
  ON follow_ups
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_diagnosis_id ON follow_ups(diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user_id ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_created_at ON follow_ups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);

-- Create trigger to automatically update updated_at on follow_ups table
DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
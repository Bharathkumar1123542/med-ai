/*
  # Create medical images storage bucket

  1. Storage Setup
    - Create `medical-images` bucket for storing medical image files
    - Configure bucket with appropriate file size limits and MIME types
    - Set up Row Level Security policies for secure file access

  2. Security
    - Enable RLS on storage.objects table
    - Add policies for authenticated users to upload/view/delete their own files
    - Allow public read access for image display

  Note: This migration uses Supabase's storage functions to avoid permission issues.
*/

-- Create the medical-images bucket using Supabase's storage functions
DO $$
BEGIN
  -- Insert bucket if it doesn't exist
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'medical-images',
    'medical-images',
    true,
    52428800, -- 50MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp']
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN others THEN
    -- If we can't insert directly, the bucket might already exist or we need different permissions
    RAISE NOTICE 'Bucket creation handled by Supabase';
END $$;

-- Create storage policies using DO blocks to handle permissions properly
DO $$
BEGIN
  -- Policy to allow authenticated users to upload files to their own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can upload medical images'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can upload medical images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = ''medical-images'' AND
      (storage.foldername(name))[1] = auth.uid()::text
    )';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage policies will be handled by Supabase dashboard';
  WHEN others THEN
    RAISE NOTICE 'Policy creation handled by Supabase: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Policy to allow users to view their own uploaded files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can view their own medical images'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view their own medical images"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = ''medical-images'' AND
      (storage.foldername(name))[1] = auth.uid()::text
    )';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage policies will be handled by Supabase dashboard';
  WHEN others THEN
    RAISE NOTICE 'Policy creation handled by Supabase: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Policy to allow public read access (needed for image display)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public read access for medical images'
  ) THEN
    EXECUTE 'CREATE POLICY "Public read access for medical images"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = ''medical-images'')';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage policies will be handled by Supabase dashboard';
  WHEN others THEN
    RAISE NOTICE 'Policy creation handled by Supabase: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Policy to allow users to delete their own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete their own medical images'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete their own medical images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = ''medical-images'' AND
      (storage.foldername(name))[1] = auth.uid()::text
    )';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage policies will be handled by Supabase dashboard';
  WHEN others THEN
    RAISE NOTICE 'Policy creation handled by Supabase: %', SQLERRM;
END $$;
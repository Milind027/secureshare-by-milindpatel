-- Create shares table for metadata (no plaintext data stored)
CREATE TABLE public.shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('aes', 'password', 'rsa-aes')),
  single_view BOOLEAN NOT NULL DEFAULT false,
  blob_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable RLS
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- Anyone can read a share by ID (blobs are encrypted anyway)
CREATE POLICY "Anyone can read shares" ON public.shares
  FOR SELECT USING (true);

-- Anyone can insert shares (anonymous uploads allowed)
CREATE POLICY "Anyone can insert shares" ON public.shares
  FOR INSERT WITH CHECK (true);

-- Anyone can delete shares (for single-view cleanup)
CREATE POLICY "Anyone can delete shares" ON public.shares
  FOR DELETE USING (true);

-- Index on expires_at for cleanup queries
CREATE INDEX idx_shares_expires_at ON public.shares (expires_at);

-- Create encrypted-blobs storage bucket (public read - blobs are encrypted)
INSERT INTO storage.buckets (id, name, public)
VALUES ('encrypted-blobs', 'encrypted-blobs', true);

-- Anyone can read blobs (they're encrypted)
CREATE POLICY "Public read access for encrypted blobs"
ON storage.objects FOR SELECT
USING (bucket_id = 'encrypted-blobs');

-- Anyone can upload blobs
CREATE POLICY "Anyone can upload encrypted blobs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'encrypted-blobs');

-- Anyone can delete blobs (for single-view cleanup)
CREATE POLICY "Anyone can delete encrypted blobs"
ON storage.objects FOR DELETE
USING (bucket_id = 'encrypted-blobs');
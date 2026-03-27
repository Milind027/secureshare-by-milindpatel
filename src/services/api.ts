import { supabase } from '@/integrations/supabase/client';
import type { UploadOptions, ShareResult, DownloadResult, EncryptionMode } from '@/types/share';

export async function uploadBlob(
  blob: Uint8Array,
  options: UploadOptions
): Promise<ShareResult> {
  // Convert Uint8Array to base64
  let binary = '';
  for (let i = 0; i < blob.length; i++) {
    binary += String.fromCharCode(blob[i]);
  }
  const base64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke('upload', {
    body: {
      blob: base64,
      mode: options.mode,
      expiryHours: options.expiryHours,
      singleView: options.singleView,
    },
  });

  if (error) {
    throw new Error(error.message || 'Upload failed');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return { rid: data.rid, expiresAt: data.expiresAt };
}

export async function downloadBlob(rid: string): Promise<DownloadResult> {
  const { data, error } = await supabase.functions.invoke('download', {
    body: null,
    method: 'GET',
    headers: {},
  });

  // Since supabase.functions.invoke doesn't support query params well for GET,
  // we'll use fetch directly
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(
    `${supabaseUrl}/functions/v1/download?rid=${encodeURIComponent(rid)}`,
    {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || `Download failed: ${response.status}`);
  }

  const result = await response.json();

  // Convert base64 back to Uint8Array
  const binaryString = atob(result.blob);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return {
    blob: bytes,
    mode: result.mode as EncryptionMode,
    expiresAt: result.expiresAt,
    singleView: result.singleView,
  };
}

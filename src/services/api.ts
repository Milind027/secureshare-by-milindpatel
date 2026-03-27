import type { UploadOptions, ShareResult, DownloadResult, EncryptionMode } from '@/types/share';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function uploadBlob(
  blob: Uint8Array,
  options: UploadOptions
): Promise<ShareResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      blob: uint8ToBase64(blob),
      mode: options.mode,
      expiryHours: options.expiryHours,
      singleView: options.singleView,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `Upload failed: ${response.status}`);
  }

  return { rid: data.rid, expiresAt: data.expiresAt };
}

export async function downloadBlob(rid: string): Promise<DownloadResult> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/download?rid=${encodeURIComponent(rid)}`,
    {
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `Download failed: ${response.status}`);
  }

  return {
    blob: base64ToUint8(data.blob),
    mode: data.mode as EncryptionMode,
    expiresAt: data.expiresAt,
    singleView: data.singleView,
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blob, mode, expiryHours, singleView } = await req.json();

    // Validate inputs
    if (!blob || typeof blob !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid blob' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validModes = ['aes', 'password', 'rsa-aes'];
    if (!validModes.includes(mode)) {
      return new Response(JSON.stringify({ error: 'Invalid mode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const maxSizeMB = 50;
    const blobSizeBytes = (blob.length * 3) / 4; // approximate base64 decoded size
    if (blobSizeBytes > maxSizeMB * 1024 * 1024) {
      return new Response(JSON.stringify({ error: `Blob exceeds ${maxSizeMB}MB limit` }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hours = Math.min(Math.max(Number(expiryHours) || 24, 1), 168);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Generate a UUID for this share
    const rid = crypto.randomUUID();
    const blobPath = `${rid}.bin`;

    // Decode base64 blob to binary
    const binaryString = atob(blob);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload blob to storage
    const { error: storageError } = await supabase.storage
      .from('encrypted-blobs')
      .upload(blobPath, bytes, {
        contentType: 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      return new Response(JSON.stringify({ error: 'Failed to store blob' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert metadata into shares table
    const { error: dbError } = await supabase
      .from('shares')
      .insert({
        id: rid,
        mode,
        single_view: Boolean(singleView),
        blob_path: blobPath,
        expires_at: expiresAt,
      });

    if (dbError) {
      console.error('DB insert error:', dbError);
      // Clean up storage on DB failure
      await supabase.storage.from('encrypted-blobs').remove([blobPath]);
      return new Response(JSON.stringify({ error: 'Failed to create share record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ rid, expiresAt }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

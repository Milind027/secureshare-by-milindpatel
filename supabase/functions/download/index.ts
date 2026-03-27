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
    const url = new URL(req.url);
    const rid = url.searchParams.get('rid');

    if (!rid) {
      return new Response(JSON.stringify({ error: 'Missing rid parameter' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch share metadata
    const { data: share, error: dbError } = await supabase
      .from('shares')
      .select('*')
      .eq('id', rid)
      .single();

    if (dbError || !share) {
      return new Response(JSON.stringify({ error: 'Not found or expired' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiry
    if (new Date(share.expires_at) < new Date()) {
      // Clean up expired record
      await supabase.from('shares').delete().eq('id', rid);
      await supabase.storage.from('encrypted-blobs').remove([share.blob_path]);
      return new Response(JSON.stringify({ error: 'Not found or expired' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download blob from storage
    const { data: blobData, error: storageError } = await supabase.storage
      .from('encrypted-blobs')
      .download(share.blob_path);

    if (storageError || !blobData) {
      console.error('Storage download error:', storageError);
      return new Response(JSON.stringify({ error: 'Failed to retrieve blob' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert blob to base64
    const arrayBuffer = await blobData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Blob = btoa(binary);

    // If single_view, atomically delete after reading
    if (share.single_view) {
      await supabase.from('shares').delete().eq('id', rid);
      await supabase.storage.from('encrypted-blobs').remove([share.blob_path]);
    }

    return new Response(JSON.stringify({
      blob: base64Blob,
      mode: share.mode,
      expiresAt: share.expires_at,
      singleView: share.single_view,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Download error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const jwt = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse({ error: 'Sign in before requesting account deletion.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Account deletion requests are not configured on the server.' }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
  if (authError || !user?.email) {
    return jsonResponse({ error: 'The signed-in account could not be verified.' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, full_name, role, approved')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (
      !profile ||
      profile.approved !== true ||
      String(profile.role || '').toLowerCase() !== 'field_worker' ||
      String(profile.email || '').trim().toLowerCase() !== user.email.trim().toLowerCase()
    ) {
      return jsonResponse({ error: 'Only an approved BHW account with a matching email can request deletion.' }, 403);
    }

    const { data: existingRequest, error: existingError } = await adminClient
      .from('bhw_account_deletion_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingRequest) {
      return jsonResponse({ request_created: true, request_id: existingRequest.id, already_pending: true });
    }

    const { data: newRequest, error: insertError } = await adminClient
      .from('bhw_account_deletion_requests')
      .insert({
        user_id: user.id,
        requested_by_user_id: user.id,
        full_name: profile.full_name || user.email,
        email: user.email,
        source: 'self',
        status: 'pending',
      })
      .select('id')
      .single();
    if (insertError) {
      if (insertError.code === '23505') {
        const { data: racedRequest, error: raceLookupError } = await adminClient
          .from('bhw_account_deletion_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .maybeSingle();
        if (raceLookupError) throw raceLookupError;
        if (racedRequest) {
          return jsonResponse({ request_created: true, request_id: racedRequest.id, already_pending: true });
        }
      }
      throw insertError;
    }

    return jsonResponse({ request_created: true, request_id: newRequest.id, already_pending: false });
  } catch (error) {
    console.error('Could not create the BHW account deletion request:', error);
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Could not create the account deletion request.',
    }, 500);
  }
});

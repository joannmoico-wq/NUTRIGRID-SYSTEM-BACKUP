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
  if (!jwt) return jsonResponse({ error: 'Sign in before deleting your account.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Account deletion server settings are incomplete.' }, 500);
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
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('email, approved')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Could not verify account deletion approval:', profileError);
    return jsonResponse({ error: 'Could not verify profile approval.' }, 500);
  }
  if (
    !profile ||
    profile.approved !== true ||
    String(profile.email || '').trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    return jsonResponse({ error: 'Only an approved profile with a matching email can be deleted.' }, 403);
  }

  const { error: deletionError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deletionError) {
    console.error('Supabase could not delete the approved account:', deletionError);
    return jsonResponse({ error: 'Supabase could not delete this account.' }, 500);
  }

  return jsonResponse({ deleted: true });
});

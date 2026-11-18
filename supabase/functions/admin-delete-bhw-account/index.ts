import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isUuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Sign in as an admin to delete a BHW account.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'BHW account deletion is not configured on the server.' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let requestId: string | null = null;
  try {
    const token = authorization.slice('Bearer '.length);
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !callerData.user) return jsonResponse(401, { error: 'Your admin session is invalid.' });

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('role, approved')
      .eq('id', callerData.user.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (!callerProfile || callerProfile.approved !== true || String(callerProfile.role).toLowerCase() !== 'admin') {
      return jsonResponse(403, { error: 'Only an approved admin can delete BHW accounts.' });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse(400, { error: 'The request body must be a JSON object.' });
    }

    let deletionRequest: { id: string; user_id: string; status: string } | null = null;
    if (payload.request_id !== undefined) {
      if (!isUuid(payload.request_id)) return jsonResponse(400, { error: 'The deletion request ID is invalid.' });
      const { data, error } = await adminClient
        .from('bhw_account_deletion_requests')
        .select('id, user_id, status')
        .eq('id', payload.request_id)
        .eq('status', 'pending')
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse(404, { error: 'This deletion request is no longer pending.' });
      deletionRequest = data;
    } else if (payload.user_id !== undefined) {
      if (!isUuid(payload.user_id)) return jsonResponse(400, { error: 'The BHW user ID is invalid.' });
      const { data: existing, error: existingError } = await adminClient
        .from('bhw_account_deletion_requests')
        .select('id, user_id, status')
        .eq('user_id', payload.user_id)
        .eq('status', 'pending')
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        deletionRequest = existing;
      } else {
        const { data: targetProfile, error: targetProfileError } = await adminClient
          .from('profiles')
          .select('email, full_name, role')
          .eq('id', payload.user_id)
          .maybeSingle();
        if (targetProfileError) throw targetProfileError;
        if (!targetProfile || String(targetProfile.role || '').toLowerCase() !== 'field_worker') {
          return jsonResponse(404, { error: 'The BHW account was not found.' });
        }
        const { data, error } = await adminClient
          .from('bhw_account_deletion_requests')
          .insert({
            user_id: payload.user_id,
            requested_by_user_id: callerData.user.id,
            full_name: targetProfile.full_name || targetProfile.email,
            email: targetProfile.email,
            source: 'admin',
            status: 'pending',
          })
          .select('id, user_id, status')
          .single();
        if (error) {
          if (error.code !== '23505') throw error;
          const { data: racedRequest, error: raceLookupError } = await adminClient
            .from('bhw_account_deletion_requests')
            .select('id, user_id, status')
            .eq('user_id', payload.user_id)
            .eq('status', 'pending')
            .maybeSingle();
          if (raceLookupError) throw raceLookupError;
          if (!racedRequest) throw error;
          deletionRequest = racedRequest;
        } else {
          deletionRequest = data;
        }
      }
    } else {
      return jsonResponse(400, { error: 'Provide a deletion request ID or BHW user ID.' });
    }

    if (!deletionRequest) return jsonResponse(400, { error: 'The deletion request could not be resolved.' });
    requestId = deletionRequest.id;
    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from('profiles')
      .select('email, role')
      .eq('id', deletionRequest.user_id)
      .maybeSingle();
    if (targetProfileError) throw targetProfileError;
    if (!targetProfile || String(targetProfile.role || '').toLowerCase() !== 'field_worker') {
      return jsonResponse(404, { error: 'The BHW profile was not found.' });
    }

    const { data: claimedRequest, error: claimError } = await adminClient
      .from('bhw_account_deletion_requests')
      .update({
        status: 'processing',
        reviewed_by_user_id: callerData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedRequest) return jsonResponse(409, { error: 'Another admin is already processing this request.' });

    const email = String(targetProfile.email || '').trim().toLowerCase();
    if (!email) throw new Error('The BHW profile has no email address to remove from the allowlist.');

    const { data: allowedEmail, error: allowlistReadError } = await adminClient
      .from('allowed_emails')
      .select('email')
      .ilike('email', email)
      .maybeSingle();
    if (allowlistReadError) throw allowlistReadError;

    if (allowedEmail) {
      const { error: allowlistDeleteError } = await adminClient
        .from('allowed_emails')
        .delete()
        .eq('email', allowedEmail.email);
      if (allowlistDeleteError) throw allowlistDeleteError;
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(deletionRequest.user_id);
    if (deleteUserError) {
      if (allowedEmail) {
        const { error: restoreAllowlistError } = await adminClient
          .from('allowed_emails')
          .insert({ email: allowedEmail.email });
        if (restoreAllowlistError) {
          console.error('Could not restore the BHW email allowlist entry after deletion failed:', restoreAllowlistError);
        }
      }
      throw deleteUserError;
    }

    const { error: completeError } = await adminClient
      .from('bhw_account_deletion_requests')
      .update({ status: 'deleted', reviewed_at: new Date().toISOString() })
      .eq('id', requestId);
    if (completeError) {
      console.error('The BHW Auth user was deleted but the request status could not be updated:', completeError);
      return jsonResponse(500, { error: 'The BHW account was deleted, but the request status could not be saved.' });
    }

    return jsonResponse(200, { deleted: true, records_preserved: true });
  } catch (error) {
    console.error('Admin BHW account deletion failed:', error);
    if (requestId) {
      const { error: releaseError } = await adminClient
        .from('bhw_account_deletion_requests')
        .update({ status: 'pending', reviewed_by_user_id: null, reviewed_at: null })
        .eq('id', requestId)
        .eq('status', 'processing');
      if (releaseError) console.error('Could not release the BHW deletion request for retry:', releaseError);
    }
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Could not delete the BHW account.',
    });
  }
});

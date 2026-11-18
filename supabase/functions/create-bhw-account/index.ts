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

const isValidPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return /^[0-9+() -]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Sign in as an admin to create BHW accounts.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Missing Supabase environment variables for BHW account creation.');
    return jsonResponse(500, { error: 'BHW account creation is not configured on the server.' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let createdAuthUserId: string | null = null;

  try {
    const token = authorization.slice('Bearer '.length);
    const { data: userData, error: userError } = await callerClient.auth.getUser(token);
    if (userError || !userData.user) return jsonResponse(401, { error: 'Your admin session is invalid.' });

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('role, approved')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (!callerProfile || !callerProfile.approved || String(callerProfile.role).toLowerCase() !== 'admin') {
      return jsonResponse(403, { error: 'Only an approved admin can create BHW accounts.' });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse(400, { error: 'The request body must be a JSON object.' });
    }
    const fullName = String(payload.full_name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const usernameName = fullName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'worker';
    const username = `bhw.${usernameName}.${crypto.randomUUID().slice(0, 8)}`;
    const password = String(payload.temporary_password || '');
    const contactNumber = String(payload.contact_number || '').trim();
    const designation = 'Barangay Health Worker';
    const assignedPurok = String(payload.assigned_purok || '');

    if (!fullName) return jsonResponse(400, { error: 'Full name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: 'Enter a valid email address.' });
    }
    if (!/^bhw\.[a-z0-9._-]{2,}$/.test(username)) {
      return jsonResponse(400, { error: 'Username must start with "bhw." followed by at least 2 characters.' });
    }
    if (password.length < 8) return jsonResponse(400, { error: 'Temporary password must be at least 8 characters.' });
    if (!isValidPhoneNumber(contactNumber)) {
      return jsonResponse(400, { error: 'Contact number must contain 7 to 15 digits and no letters.' });
    }
    if (!/^Purok ([1-5]|[6-8][AB]|9|10)$/.test(assignedPurok)) {
      return jsonResponse(400, { error: 'Choose Purok 1 to 5, 6A, 6B, 7A, 7B, 8A, 8B, 9, or 10.' });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, username, role: 'field_worker' },
    });
    if (createError) throw createError;
    if (!created.user) throw new Error('Supabase did not return the new user.');
    createdAuthUserId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      email,
      full_name: fullName,
      username,
      contact_number: contactNumber,
      designation: designation || null,
      assigned_purok: assignedPurok,
      role: 'field_worker',
      approved: true,
      created_by_user_id: userData.user.id,
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { data: allowlistedEmail, error: allowlistReadError } = await adminClient
      .from('allowed_emails')
      .select('email')
      .ilike('email', email)
      .maybeSingle();
    if (allowlistReadError) throw allowlistReadError;
    if (!allowlistedEmail) {
      const { error: allowlistInsertError } = await adminClient
        .from('allowed_emails')
        .insert({ email });
      if (allowlistInsertError) throw allowlistInsertError;
    }

    return jsonResponse(201, {
      account: {
        id: created.user.id,
        full_name: fullName,
        email,
        username,
        contact_number: contactNumber,
        designation,
        assigned_purok: assignedPurok,
        approved: true,
      },
    });
  } catch (error) {
    console.error('BHW account creation failed:', error);
    if (createdAuthUserId) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(createdAuthUserId);
      if (cleanupError) {
        console.error('Could not roll back the incomplete BHW Auth user:', cleanupError);
      }
    }
    const message = error instanceof Error ? error.message : 'Could not create BHW account.';
    return jsonResponse(500, { error: message });
  }
});

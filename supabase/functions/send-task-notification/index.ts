import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let cachedGoogleToken: { value: string; expiresAt: number } | null = null;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}) {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = [
    base64UrlJson({ alg: 'RS256', typ: 'JWT' }),
    base64UrlJson({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ].join('.');
  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error('Could not authenticate with Firebase Cloud Messaging.');
  }

  cachedGoogleToken = {
    value: tokenBody.access_token,
    expiresAt: Date.now() + Number(tokenBody.expires_in || 3600) * 1000,
  };
  return cachedGoogleToken.value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const jwt = authorization?.replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse({ error: 'Sign in as an approved admin.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !serviceAccountJson) {
    return jsonResponse({ error: 'Push notification server settings are incomplete.' }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
  if (authError || !user) return jsonResponse({ error: 'The admin session is invalid.' }, 401);

  let body: { task_id?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Expected a task_id in the request body.' }, 400);
  }
  if (!body.task_id || !/^\d+$/.test(String(body.task_id))) {
    return jsonResponse({ error: 'The task_id is invalid.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminProfile, error: adminError } = await adminClient
    .from('profiles')
    .select('role, approved')
    .eq('id', user.id)
    .maybeSingle();
  if (adminError) return jsonResponse({ error: 'Could not verify admin approval.' }, 500);
  if (adminProfile?.role?.toLowerCase() !== 'admin' || adminProfile.approved !== true) {
    return jsonResponse({ error: 'Only approved admins can send task notifications.' }, 403);
  }

  const { data: task, error: taskError } = await adminClient
    .from('tasks')
    .select('task_id, title, assigned_to_user_id')
    .eq('task_id', body.task_id)
    .maybeSingle();
  if (taskError) return jsonResponse({ error: 'Could not load the assigned task.' }, 500);
  if (!task) return jsonResponse({ error: 'Task not found.' }, 404);

  const { data: recipient, error: recipientError } = await adminClient
    .from('profiles')
    .select('fcm_token')
    .eq('id', task.assigned_to_user_id)
    .maybeSingle();
  if (recipientError) return jsonResponse({ error: 'Could not load the recipient device token.' }, 500);
  if (!recipient?.fcm_token) {
    return jsonResponse({ sent: false, reason: 'device-not-registered' });
  }

  let serviceAccount: { client_email: string; private_key: string; project_id: string };
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    return jsonResponse({ error: 'Firebase service account configuration is invalid.' }, 500);
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
    return jsonResponse({ error: 'Firebase service account configuration is incomplete.' }, 500);
  }

  try {
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const fcmResponse = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: recipient.fcm_token,
            notification: {
              title: 'New task assigned',
              body: task.title || 'Open NutriGrid to view your task.',
            },
            data: {
              task_id: String(task.task_id),
              url: '/',
            },
            webpush: {
              notification: {
                icon: '/icon-192.png',
                badge: '/icon-192.png',
              },
            },
          },
        }),
      },
    );
    if (!fcmResponse.ok) {
      const errorBody = await fcmResponse.text();
      if (
        fcmResponse.status === 404 ||
        errorBody.includes('UNREGISTERED') ||
        errorBody.includes('registration-token-not-registered')
      ) {
        await adminClient
          .from('profiles')
          .update({ fcm_token: null })
          .eq('id', task.assigned_to_user_id);
        return jsonResponse({ sent: false, reason: 'device-token-expired' });
      }
      console.error('FCM rejected a task notification:', fcmResponse.status, errorBody);
      return jsonResponse({ error: 'Firebase rejected the task notification.' }, 502);
    }

    return jsonResponse({ sent: true });
  } catch (error) {
    console.error('Task push notification failed:', error);
    return jsonResponse({ error: 'Could not send the Firebase task notification.' }, 502);
  }
});

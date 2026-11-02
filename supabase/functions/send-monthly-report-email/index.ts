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
  if (!jwt) return jsonResponse({ error: 'Sign in as an approved admin.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromAddress = Deno.env.get('EMAIL_FROM_ADDRESS');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase server settings are incomplete.' }, 500);
  }
  if (!resendApiKey || !fromAddress) {
    return jsonResponse({ error: 'Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM_ADDRESS.' }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
  if (authError || !user) return jsonResponse({ error: 'The admin session is invalid.' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, approved')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return jsonResponse({ error: 'Could not verify admin approval.' }, 500);
  if (profile?.role?.toLowerCase() !== 'admin' || profile.approved !== true) {
    return jsonResponse({ error: 'Only approved admins can email reports.' }, 403);
  }

  let body: {
    recipient?: string;
    subject?: string;
    message?: string;
    fileName?: string;
    pdfBase64?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'The email request body is invalid.' }, 400);
  }

  const recipient = body.recipient?.trim();
  const subject = body.subject?.trim();
  const message = body.message?.trim() || 'Attached is the signed monthly health report.';
  const fileName = body.fileName
    ?.replace(/[^\w .()-]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'signed-monthly-report.pdf';
  const pdfBase64 = body.pdfBase64 || '';
  if (!recipient || recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return jsonResponse({ error: 'Enter a valid recipient email address.' }, 400);
  }
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) {
    return jsonResponse({ error: 'Enter a subject of 1–200 characters.' }, 400);
  }
  if (message.length > 10000) return jsonResponse({ error: 'The message is too long.' }, 400);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
    return jsonResponse({ error: 'The signed PDF attachment is invalid.' }, 400);
  }
  let attachmentContents: string;
  try {
    attachmentContents = atob(pdfBase64);
  } catch {
    return jsonResponse({ error: 'The signed PDF attachment is invalid.' }, 400);
  }
  if (!attachmentContents.startsWith('%PDF-')) {
    return jsonResponse({ error: 'The signed PDF attachment is invalid.' }, 400);
  }
  if (attachmentContents.length > 8 * 1024 * 1024) {
    return jsonResponse({ error: 'The signed PDF must be smaller than 8 MB.' }, 413);
  }

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipient],
      subject,
      text: message,
      attachments: [{
        filename: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
        content: pdfBase64,
        content_type: 'application/pdf',
      }],
    }),
  });
  if (!emailResponse.ok) {
    const responseDetails = await emailResponse.text();
    console.error('Resend rejected monthly report email:', emailResponse.status, responseDetails);
    return jsonResponse({ error: 'The email provider could not send the signed report.' }, 502);
  }

  return jsonResponse({ sent: true });
});

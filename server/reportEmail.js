import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const MAX_REQUEST_BYTES = 11 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let reportTransport;

function respond(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BYTES) {
      const error = new Error('The PDF attachment is too large. Maximum size is 8 MB.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('The email request is not valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getReportTransport(gmailUser, gmailPassword) {
  if (!reportTransport) {
    reportTransport = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
      auth: { user: gmailUser, pass: gmailPassword },
    });
  }
  return reportTransport;
}

export async function handleReportEmail(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    respond(response, 405, { error: 'Use POST to send a report.' });
    return;
  }

  try {
    const authorization = request.headers.authorization || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      respond(response, 401, { error: 'Sign in again before sending a report.' });
      return;
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    const gmailUser = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_APP_PASS;
    if (!supabaseUrl || !supabaseKey || !gmailUser || !gmailPassword) {
      respond(response, 503, { error: 'Report email is not configured on the server.' });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      respond(response, 401, { error: 'Your sign-in session is invalid or expired.' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, role, approved')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) {
      console.error('Could not read the authenticated admin profile:', profileError);
      respond(response, 403, {
        error: 'Could not read your Supabase profile. Verify the profiles table SELECT policy for signed-in users.',
      });
      return;
    }
    if (String(profile.role || '').toLowerCase() !== 'admin' || profile.approved !== true) {
      respond(response, 403, { error: 'Only an approved admin can email reports.' });
      return;
    }

    const body = await readJsonBody(request);
    const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
    const message = typeof body.message === 'string' ? body.message.slice(0, 10000) : '';
    const fileName = typeof body.fileName === 'string'
      ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
      : '';
    const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '';
    if (!EMAIL_PATTERN.test(recipient)) {
      respond(response, 400, { error: 'Enter a valid recipient email address.' });
      return;
    }
    if (!subject || !fileName.toLowerCase().endsWith('.pdf') || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
      respond(response, 400, { error: 'The subject or PDF attachment is invalid.' });
      return;
    }

    const pdf = Buffer.from(pdfBase64, 'base64');
    if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString() !== '%PDF-') {
      respond(response, 400, { error: 'The attached PDF is invalid or exceeds the 8 MB limit.' });
      return;
    }

    const transport = getReportTransport(gmailUser, gmailPassword);
    await transport.sendMail({
      from: {
        name: `${profile.full_name || profile.email || 'Admin'} — NutriGrid`,
        address: gmailUser,
      },
      replyTo: profile.email || user.email || gmailUser,
      to: recipient,
      subject,
      text: message || subject,
      html: `<p>${escapeHtml(message || subject).replace(/\r?\n/g, '<br>')}</p>`,
      attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
    });
    respond(response, 200, { sent: true });
  } catch (error) {
    if (error.statusCode) {
      respond(response, error.statusCode, { error: error.message });
      return;
    }
    console.error('Report email delivery failed:', error);
    respond(response, 502, { error: 'The report could not be sent. Check the SMTP server configuration and try again.' });
  }
}

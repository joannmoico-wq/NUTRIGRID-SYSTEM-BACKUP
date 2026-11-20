import { createClient } from '@supabase/supabase-js';

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://mrfnuaysydeyxlqzzint.supabase.co';
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_Ryv2pQA0tgZe85YSXXgz_g_3eK56vrZ';

if (!url || !key) {
  console.warn('Supabase env vars missing. Check .env.local in the project root.');
}

const unavailableAuth = {
  async getSession() {
    return { data: { session: null }, error: null };
  },
  async getUser() {
    return { data: { user: null }, error: null };
  },
  async signOut() {
    return { error: null };
  },
  async signInWithPassword() {
    return { data: { user: null }, error: new Error('Supabase is not configured. Add VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.') };
  },
  async signInWithOAuth() {
    return { data: { provider: null, url: null }, error: new Error('Supabase is not configured. Add VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.') };
  },
  async signUp() {
    return { data: { user: null }, error: new Error('Supabase is not configured. Add VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.') };
  },
};

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : { auth: unavailableAuth };
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
    return { data: { user: null }, error: new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.') };
  },
  async signUp() {
    return { data: { user: null }, error: new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.') };
  },
};

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : { auth: unavailableAuth };
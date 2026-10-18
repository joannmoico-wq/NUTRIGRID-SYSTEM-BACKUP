import { supabase } from './supabaseClient';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireEmail(contact) {
  const email = contact.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Sign in with your email address.');
  }
  return email;
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('email, full_name, age, role, approved')
    .eq('id', userId)
    .single();
  if (error || !data) {
    throw new Error('Could not load your account. Check your connection and try again.');
  }
  return data;
}

function toUserData(user, profile) {
  return {
    email: profile.email || user.email,
    fullName: profile.full_name || user.user_metadata?.full_name || '',
    age: profile.age ?? user.user_metadata?.age ?? null,
    role: profile.role,
  };
}

export async function registerWithSupabase({ fullName, age, contact, password }) {
  const email = requireEmail(contact);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName.trim(), age: Number(age) } },
  });
  if (error) throw new Error(error.message);
  return { email };
}

export async function signInWithSupabase({ contact, password }) {
  const email = requireEmail(contact);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message
    );
  }

  const profile = await loadProfile(data.user.id);
  if (!profile.approved) {
    await supabase.auth.signOut();
    throw new Error('Your account is waiting for coordinator approval.');
  }
  return toUserData(data.user, profile);
}

export async function restoreSupabaseSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const profile = await loadProfile(session.user.id);
  if (!profile.approved) {
    await supabase.auth.signOut();
    return null;
  }
  return toUserData(session.user, profile);
}

export async function signOutSupabase() {
  await supabase.auth.signOut();
}
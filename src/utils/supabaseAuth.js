import { supabase } from './supabaseClient';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPROVED_PROFILE_CACHE_PREFIX = 'nutrigrid_approved_profile:';

function cacheApprovedProfile(user, profile) {
  const cachedProfile = {
    id: user.id,
    email: profile.email || user.email || '',
    fullName: profile.full_name || user.user_metadata?.full_name || '',
    age: profile.age ?? user.user_metadata?.age ?? null,
    role: profile.role,
    approved: true,
  };
  try {
    localStorage.setItem(
      `${APPROVED_PROFILE_CACHE_PREFIX}${user.id}`,
      JSON.stringify(cachedProfile)
    );
  } catch (error) {
    console.error('Could not cache the approved profile for offline sign-in restoration:', error);
  }
}

function readCachedApprovedProfile(userId) {
  try {
    const cached = JSON.parse(
      localStorage.getItem(`${APPROVED_PROFILE_CACHE_PREFIX}${userId}`) || 'null'
    );
    return cached?.id === userId && cached.approved === true ? cached : null;
  } catch (error) {
    console.error('Could not read the cached approved profile:', error);
    return null;
  }
}

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
  if (error) throw new Error(`Could not load your account: ${error.message}`);
  if (!data) throw new Error('Could not load your account. Check your connection and try again.');
  return data;
}

function isNetworkFailure(error) {
  return !navigator.onLine ||
    /failed to fetch|network|fetch failed|load failed|connection|offline/i.test(error.message || '');
}

function toUserData(user, profile) {
  return {
    id: user.id,
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
  cacheApprovedProfile(data.user, profile);
  return toUserData(data.user, profile);
}

export async function signInWithSupabaseOAuth(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) {
    if (/unsupported provider|provider is not enabled/i.test(error.message)) {
      throw new Error(
        `${provider} sign-in is not enabled in Supabase Auth. Enable the provider and add its OAuth credentials in the Supabase project settings.`
      );
    }
    throw new Error(`Could not start ${provider} sign-in: ${error.message}`);
  }
}

export async function restoreSupabaseSession(existingSession) {
  let session = existingSession;
  if (existingSession === undefined) {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error) throw new Error(`Could not restore sign-in session: ${error.message}`);
    session = sessionData.session;
  }
  if (!session) return null;

  let profile;
  try {
    profile = await loadProfile(session.user.id);
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    const cachedProfile = readCachedApprovedProfile(session.user.id);
    if (!cachedProfile) {
      throw new Error('You are offline and this account has no previously verified profile on this device.');
    }
    return {
      id: cachedProfile.id,
      email: cachedProfile.email,
      fullName: cachedProfile.fullName,
      age: cachedProfile.age,
      role: cachedProfile.role,
    };
  }
  if (!profile.approved) {
    await supabase.auth.signOut();
    try {
      localStorage.removeItem(`${APPROVED_PROFILE_CACHE_PREFIX}${session.user.id}`);
    } catch (error) {
      console.error('Could not clear the cached unapproved profile:', error);
    }
    return null;
  }
  cacheApprovedProfile(session.user, profile);
  return toUserData(session.user, profile);
}

export async function signOutSupabase() {
  await supabase.auth.signOut();
}
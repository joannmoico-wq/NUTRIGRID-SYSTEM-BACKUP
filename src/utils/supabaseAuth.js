import { supabase } from './supabaseClient';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPROVED_PROFILE_CACHE_PREFIX = 'nutrigrid_approved_profile:';
const ACTIVE_PROFILE_CACHE_KEY = 'nutrigrid_active_approved_profile';

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
    localStorage.setItem(ACTIVE_PROFILE_CACHE_KEY, user.id);
  } catch (error) {
    console.error('Could not cache the approved profile for offline sign-in restoration:', error);
  }
}

function readCachedActiveProfile() {
  try {
    const userId = localStorage.getItem(ACTIVE_PROFILE_CACHE_KEY);
    return userId ? readCachedApprovedProfile(userId) : null;
  } catch (error) {
    console.error('Could not read the active offline profile:', error);
    return null;
  }
}

function toCachedUserData(profile) {
  if (!profile?.approved || !profile.id) return null;
  return {
    id: profile.id,
    email: profile.email || '',
    fullName: profile.fullName || '',
    age: profile.age ?? null,
    role: profile.role,
  };
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

export async function restoreSupabaseSession(existingSession, { allowCachedProfile = false } = {}) {
  let session = existingSession;
  if (existingSession === undefined) {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error) throw new Error(`Could not restore sign-in session: ${error.message}`);
    session = sessionData.session;
  }
  if (!session) {
    return navigator.onLine && !allowCachedProfile
      ? null
      : toCachedUserData(readCachedActiveProfile());
  }

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

export async function updateSupabaseProfile(currentUser, { fullName, age }) {
  const normalizedName = String(fullName || '').trim();
  const normalizedAge = Number(age);
  if (!normalizedName) throw new Error('Enter your name before saving.');
  if (!Number.isInteger(normalizedAge) || normalizedAge < 1 || normalizedAge > 120) {
    throw new Error('Enter an age from 1 to 120.');
  }
  if (!currentUser?.id) throw new Error('Sign in before updating your profile.');

  const { error: updateError } = await supabase.rpc('update_own_profile', {
    p_full_name: normalizedName,
    p_age: normalizedAge,
  });
  if (updateError) {
    if (updateError.code === 'PGRST202' || updateError.code === '42883') {
      throw new Error('Profile updates are not enabled in Supabase yet. Run supabase-profile-update-function.sql in the Supabase SQL Editor.');
    }
    throw new Error(`Could not update your profile: ${updateError.message}`);
  }

  const { data, error: readError } = await supabase
    .from('profiles')
    .select('email, full_name, age, role, approved')
    .eq('id', currentUser.id)
    .maybeSingle();
  if (readError) throw new Error(`Could not verify your profile update: ${readError.message}`);
  if (!data) {
    throw new Error('Could not find your profile after saving. Check your profile access settings.');
  }
  if (data.full_name !== normalizedName || Number(data.age) !== normalizedAge) {
    throw new Error('Your profile was not updated. Check that Supabase allows you to update your own profile.');
  }
  if (!data?.approved) throw new Error('Your account is not approved to update its profile.');

  const updatedUser = toUserData({ id: currentUser.id, email: data.email || currentUser.email }, data);
  try {
    localStorage.setItem(
      `${APPROVED_PROFILE_CACHE_PREFIX}${currentUser.id}`,
      JSON.stringify({ ...updatedUser, approved: true })
    );
    localStorage.setItem(ACTIVE_PROFILE_CACHE_KEY, currentUser.id);
  } catch (cacheError) {
    console.error('Could not update the cached profile after saving:', cacheError);
  }
  return updatedUser;
}

export async function signOutSupabase(userId) {
  try {
    localStorage.removeItem(ACTIVE_PROFILE_CACHE_KEY);
    if (userId) localStorage.removeItem(`${APPROVED_PROFILE_CACHE_PREFIX}${userId}`);
  } catch (cacheError) {
    console.error('Could not clear offline profile restoration state:', cacheError);
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
}
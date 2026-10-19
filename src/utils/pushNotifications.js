import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { initializeApp, getApps } from 'firebase/app';
import { supabase } from './supabaseClient';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps()[0] || initializeApp(firebaseConfig);

export async function registerPushToken({ requestPermission = true } = {}) {
  if (!(await isSupported())) return { ok: false, reason: 'unsupported' };
  if (typeof Notification === 'undefined') return { ok: false, reason: 'unsupported' };

  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    !firebaseConfig.messagingSenderId ||
    !firebaseConfig.appId ||
    !import.meta.env.VITE_FIREBASE_VAPID_KEY
  ) {
    throw new Error('Firebase push notification settings are missing from the app configuration.');
  }

  const permission = requestPermission
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope/',
  });
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, reason: 'no-token' };

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify signed-in user: ${userError.message}`);
  if (!user) return { ok: false, reason: 'not-signed-in' };

  const { data: saved, error } = await supabase.rpc('set_my_fcm_token', { p_token: token });
  if (error) throw new Error(`Could not save this device's push token: ${error.message}`);
  if (!saved) throw new Error('No profile row was found for the signed-in user.');

  return { ok: true, token };
}
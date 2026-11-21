import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { initializeApp, getApps } from 'firebase/app';
import { supabase } from './supabaseClient';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps()[0] || initializeApp(firebaseConfig);
let messagingSupportPromise;
let serviceWorkerRegistrationPromise;

const isMessagingSupported = () => {
  if (!messagingSupportPromise) messagingSupportPromise = isSupported();
  return messagingSupportPromise;
};

const getMessagingServiceWorker = () => {
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope/',
      })
      .catch((error) => {
        serviceWorkerRegistrationPromise = null;
        throw error;
      });
  }
  return serviceWorkerRegistrationPromise;
};

export async function preparePushNotifications() {
  if (
    typeof Notification === 'undefined' ||
    !navigator.serviceWorker ||
    !(await isMessagingSupported())
  ) return false;

  await getMessagingServiceWorker();
  return true;
}

export async function listenForPushNotifications(onNotification) {
  if (!(await preparePushNotifications())) return () => {};
  return onMessage(getMessaging(app), (payload) => {
    const title = payload.notification?.title || 'New task assigned';
    const body = payload.notification?.body || 'Open NutriGrid to view your task.';
    void getMessagingServiceWorker().then((registration) =>
      registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `nutrigrid-task-${payload.data?.task_id || 'new'}`,
        data: { url: payload.data?.url || '/', taskId: payload.data?.task_id },
      })
    ).catch((error) => {
      console.error('Could not display the task push notification:', error);
    });
    onNotification?.({ title, body, taskId: payload.data?.task_id });
  });
}

export async function registerPushToken({ requestPermission = true } = {}) {
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

  if (!(await preparePushNotifications())) return { ok: false, reason: 'unsupported' };
  const registration = await getMessagingServiceWorker();
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
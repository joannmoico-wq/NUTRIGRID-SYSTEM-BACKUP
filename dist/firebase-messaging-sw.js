importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAuaBWhUKimzeBL3w6vOeLb-ntNxZ13Q0k',
  projectId: 'nutrigrid-system',
  messagingSenderId: '687061791860',
  appId: '1:687061791860:web:11dc3f64d2035053cacd21',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'New task assigned';
  const body = payload.notification?.body || 'Open NutriGrid to view it.';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `bns-task-${payload.data?.task_id || 'new'}`,
    data: { url: payload.data?.url || '/', taskId: payload.data?.task_id },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (appWindow) {
      await appWindow.focus();
      return;
    }
    await clients.openWindow(event.notification.data?.url || '/');
  })());
});

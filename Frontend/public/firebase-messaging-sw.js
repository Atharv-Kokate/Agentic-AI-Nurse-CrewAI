// Frontend/public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCsEEKPMsVJwvzzurMtLJDZ8gYHhDvag1M",
  authDomain: "aviral---notification.firebaseapp.com",
  projectId: "aviral---notification",
  storageBucket: "aviral---notification.firebasestorage.app",
  messagingSenderId: "213714315994",
  appId: "1:213714315994:web:a822db280f4f89e25093e3"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages from FCM (when app is NOT in foreground)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    // Support both notification and data-only payloads
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Aviral Notification';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'You have a new update',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [100, 50, 100],
        data: payload.data || {},
        tag: payload.data?.tag || 'aviral-notification',
        renotify: true,
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Fallback: generic push event handler (for non-FCM push or edge cases)
self.addEventListener('push', (event) => {
    // If FCM already handled via onBackgroundMessage, this won't fire again for that message.
    // This is a safety net for raw push events.
    console.log('[firebase-messaging-sw.js] Generic push event received:', event);

    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: 'Aviral', body: event.data.text() };
    }

    // Only show if it looks like it wasn't already handled by FCM
    // FCM-handled messages have a 'notification' key at top level
    if (data.notification) return; // FCM already showed it

    const title = data.title || 'Aviral Notification';
    const options = {
        body: data.body || data.message || 'New notification',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [100, 50, 100],
        data: data,
        tag: data.tag || 'aviral-push',
        renotify: true,
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Handle notification clicks — open the app or focus existing tab
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click received:', event);
    event.notification.close();

    // Determine the URL to open
    const clickAction = event.notification.data?.click_action || event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Try to focus an existing window
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('focus' in client) {
                    return client.focus();
                }
            }
            // If no window open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(clickAction);
            }
        })
    );
});

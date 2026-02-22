// Frontend/public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// You will provide these credentials later
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

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/pwa-192x192.png',
        data: payload.data, // Contains click_action
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click Received.', event);
    event.notification.close();

    // Check if click_action is provided in payload.data
    const clickAction = event.notification.data?.click_action;

    // Handle deep linking
    if (clickAction) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                // Check if there is already a window/tab open with the target URL
                for (let i = 0; i < windowClients.length; i++) {
                    const client = windowClients[i];
                    // If so, just focus it.
                    if (client.url === clickAction && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not, then open the target URL in a new window/tab.
                if (clients.openWindow) {
                    return clients.openWindow(clickAction);
                }
            })
        );
    }
});

// Frontend/src/firebase.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
    apiKey: "AIzaSyCsEEKPMsVJwvzzurMtLJDZ8gYHhDvag1M",
    authDomain: "aviral---notification.firebaseapp.com",
    projectId: "aviral---notification",
    storageBucket: "aviral---notification.firebasestorage.app",
    messagingSenderId: "213714315994",
    appId: "1:213714315994:web:a822db280f4f89e25093e3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
export const messaging = getMessaging(app);

const VAPID_KEY = 'BOqy6tuOEJkcVgznUig2jTOBhKUS7tI_Bev6oV5BFRSlD6I9iSUMrSm9GwJ200sWDXvuFnPNb4l_zL9WVCg7yiA';

export const requestForToken = async () => {
    try {
        console.log('[Firebase] Requesting notification permission...');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Firebase] Notification permission denied.');
            return null;
        }
        console.log('[Firebase] Notification permission granted.');

        // Register the Firebase messaging service worker explicitly
        let swRegistration = null;
        if ('serviceWorker' in navigator) {
            try {
                swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                console.log('[Firebase] Service worker registered:', swRegistration.scope);
                // Wait for the SW to be ready
                await navigator.serviceWorker.ready;
            } catch (swErr) {
                console.warn('[Firebase] Service worker registration failed, using default:', swErr);
            }
        }

        // Get FCM token with explicit SW registration
        const tokenOptions = { vapidKey: VAPID_KEY };
        if (swRegistration) {
            tokenOptions.serviceWorkerRegistration = swRegistration;
        }

        const currentToken = await getToken(messaging, tokenOptions);
        if (currentToken) {
            console.log('[Firebase] FCM Token obtained:', currentToken.substring(0, 20) + '...');
            return currentToken;
        } else {
            console.warn('[Firebase] No registration token available.');
            return null;
        }
    } catch (err) {
        console.error('[Firebase] Error getting token:', err);
        return null;
    }
};

// Listen for foreground messages — takes a callback, returns an unsubscribe function
export const onForegroundMessage = (callback) => {
    return onMessage(messaging, (payload) => {
        console.log("[Firebase] Foreground message received:", payload);
        callback(payload);
    });
};

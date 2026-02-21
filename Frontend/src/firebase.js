// Frontend/src/firebase.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// You will provide these credentials later
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

// Initialize Firebase Cloud Messaging and get a reference to the service
export const messaging = getMessaging(app);

export const requestForToken = async () => {
    try {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            try {
                const currentToken = await getToken(messaging, { vapidKey: 'BOqy6tuOEJkcVgznUig2jTOBhKUS7tI_Bev6oV5BFRSlD6I9iSUMrSm9GwJ200sWDXvuFnPNb4l_zL9WVCg7yiA' });
                if (currentToken) {
                    console.log('FCM Token:', currentToken);
                    return currentToken;
                } else {
                    console.log('No registration token available. Request permission to generate one.');
                    alert("Firebase error: No registration token available. Check vapidKey.");
                    return null;
                }
            } catch (tokenErr) {
                console.error("FCM getToken Error:", tokenErr);
                alert("FCM getToken Error: " + tokenErr.message);
                return null;
            }
        } else {
            console.log('Unable to get permission to notify.');
            alert("Permission denied by browser. Check site settings.");
            return null;
        }
    } catch (err) {
        console.log('An error occurred while retrieving token. ', err);
        alert('An error occurred while retrieving token: ' + err.message);
        return null;
    }
};

export const onMessageListener = () =>
    new Promise((resolve) => {
        onMessage(messaging, (payload) => {
            resolve(payload);
        });
    });

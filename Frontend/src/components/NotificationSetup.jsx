import React, { useEffect, useState } from 'react';
import { requestForToken, onMessageListener } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import { Bell, X } from 'lucide-react';

const NotificationSetup = () => {
    const { user, token } = useAuth();
    const [showPrompt, setShowPrompt] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        // Only show prompt if permission is 'default' (not yet asked) AND user is logged in
        if ('Notification' in window && Notification.permission === 'default' && user) {
            setShowPrompt(true);
        } else if ('Notification' in window && Notification.permission === 'granted') {
            // If already granted, try to register quietly in background
            if (user && token && !isRegistered) {
                handleEnableNotifications();
            }
        }
    }, [user, token, isRegistered]);

    const handleEnableNotifications = async () => {
        if (!user) {
            alert("Please log in first to enable notifications!");
            setShowPrompt(false);
            return;
        }
        try {
            const fcmToken = await requestForToken();
            if (fcmToken) {
                await client.post('/notifications/register-token', {
                    user_id: user.id,
                    fcm_token: fcmToken,
                    platform: 'web'
                });
                console.log("FCM Token registered with backend successfully");
                alert("Notifications Enabled Successfully!");
                setIsRegistered(true);
                setShowPrompt(false);
            } else {
                alert("Failed to get FCM token. Please check your browser notification settings or Firebase setup.");
            }
        } catch (error) {
            console.error("Failed to register FCM token with backend", error);
            alert("Error registering token: " + (error.message || "Unknown error"));
        }
    };

    useEffect(() => {
        if (user && token) {
            // Handle foreground messages
            const unsubscribe = onMessageListener().then((payload) => {
                console.log("Foreground message received:", payload);
                if (payload && payload.notification) {
                    if (Notification.permission === 'granted') {
                        new Notification(payload.notification.title, {
                            body: payload.notification.body,
                            icon: '/pwa-192x192.png'
                        });
                    } else {
                        alert(`New Notification: ${payload.notification.title}\n${payload.notification.body}`);
                    }
                }
            }).catch(err => console.log('failed: ', err));
        }
    }, [user, token]);

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-lg shadow-xl border border-slate-200 p-4 z-50 flex items-start space-x-4 animate-in slide-in-from-bottom-5">
            <div className="bg-sky-100 p-2 rounded-full text-sky-600">
                <Bell size={24} />
            </div>
            <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Enable Notifications</h3>
                <p className="text-sm text-slate-500 mt-1">Get instant alerts for patient checkups and critical risks.</p>
                <div className="mt-3 flex space-x-3">
                    <button
                        onClick={handleEnableNotifications}
                        className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                        Allow
                    </button>
                    <button
                        onClick={() => setShowPrompt(false)}
                        className="text-slate-500 hover:text-slate-700 px-4 py-2 rounded-md text-sm transition-colors"
                    >
                        Maybe Later
                    </button>
                </div>
            </div>
            <button onClick={() => setShowPrompt(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
            </button>
        </div>
    );
};

export default NotificationSetup;

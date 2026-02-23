import React, { useEffect, useState } from 'react';
import { requestForToken, onForegroundMessage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import { Bell, X } from 'lucide-react';

const NotificationSetup = () => {
    const { user } = useAuth();
    const [showPrompt, setShowPrompt] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        // Only show prompt if permission is 'default' (not yet asked) AND user is logged in
        const jwtToken = localStorage.getItem('token');
        if ('Notification' in window && Notification.permission === 'default' && user) {
            setShowPrompt(true);
        } else if ('Notification' in window && Notification.permission === 'granted') {
            // If already granted, try to register quietly in background
            if (user && jwtToken && !isRegistered) {
                handleEnableNotifications(true);
            }
        }
    }, [user, isRegistered]);

    const handleEnableNotifications = async (silent = false) => {
        if (!user) {
            if (!silent) alert("Please log in first to enable notifications!");
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
                console.log("[NotificationSetup] FCM Token registered with backend successfully");
                setIsRegistered(true);
                setShowPrompt(false);
            } else {
                if (!silent) console.warn("[NotificationSetup] Failed to get FCM token.");
            }
        } catch (error) {
            console.error("[NotificationSetup] Failed to register FCM token with backend:", error);
        }
    };

    useEffect(() => {
        if (user && localStorage.getItem('token')) {
            // Handle ALL foreground messages (persistent listener, not one-shot)
            const unsubscribe = onForegroundMessage((payload) => {
                console.log("[NotificationSetup] Foreground message received:", payload);
                // Extract title/body from notification field or data field (fallback)
                const title = payload?.notification?.title || payload?.data?.title || 'New Notification';
                const body = payload?.notification?.body || payload?.data?.body || '';
                if (Notification.permission === 'granted') {
                    new Notification(title, {
                        body: body,
                        icon: '/pwa-192x192.png'
                    });
                }
            });

            return () => {
                if (typeof unsubscribe === 'function') unsubscribe();
            };
        }
    }, [user]);

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

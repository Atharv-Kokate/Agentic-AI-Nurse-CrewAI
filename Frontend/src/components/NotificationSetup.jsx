import React, { useEffect } from 'react';
import { requestForToken, onMessageListener } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const NotificationSetup = () => {
    const { user, token } = useAuth();

    useEffect(() => {
        if (user && token) {
            // Request FCM token and register with backend
            const setupNotifications = async () => {
                const fcmToken = await requestForToken();
                if (fcmToken) {
                    try {
                        const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
                        await axios.post(
                            `${API_BASE_URL}/api/v1/notifications/register-token`,
                            {
                                user_id: user.id,
                                fcm_token: fcmToken,
                                platform: 'web'
                            },
                            {
                                headers: { Authorization: `Bearer ${token}` }
                            }
                        );
                        console.log("FCM Token registered with backend successfully");
                    } catch (error) {
                        console.error("Failed to register FCM token with backend", error);
                    }
                }
            };

            setupNotifications();

            // Handle foreground messages
            const unsubscribe = onMessageListener().then((payload) => {
                console.log("Foreground message received:", payload);
                if (payload && payload.notification) {
                    // In a real app, you might use a toast notification library here (like react-toastify)
                    // For simplicity, we use the native Web Notification API if granted
                    if (Notification.permission === 'granted') {
                        new Notification(payload.notification.title, {
                            body: payload.notification.body,
                        });
                    } else {
                        alert(`New Notification: ${payload.notification.title}\n${payload.notification.body}`);
                    }
                }
            }).catch(err => console.log('failed: ', err));

            return () => {
                // Cleanup if needed
            };
        }
    }, [user, token]);

    return null; // This is a logic-only component
};

export default NotificationSetup;

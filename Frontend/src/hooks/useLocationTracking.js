import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';

const useLocationTracking = () => {
    const { user } = useAuth();
    const wsRef = useRef(null);
    const [status, setStatus] = useState('idle'); // idle, connecting, connected, error, disconnected

    useEffect(() => {
        // Only run for PATIENT role (Case insensitive check)
        const role = user?.role?.toUpperCase();
        if (!user || role !== 'PATIENT') {
            setStatus('idle');
            return;
        }

        let watchId = null;
        let pingInterval = null;

        const sendLocation = (coords) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "LOCATION_UPDATE",
                    latitude: coords.latitude,
                    longitude: coords.longitude
                }));
            }
        };

        const connectWebSocket = (patientId) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            let host = window.location.host;
            const apiUrl = import.meta.env.VITE_API_URL;
            if (apiUrl) {
                try {
                    const url = new URL(apiUrl);
                    host = url.host;
                } catch (e) {
                    console.warn("Invalid VITE_API_URL");
                }
            }

            const token = localStorage.getItem('token');
            const wsUrl = `${protocol}//${host}/ws/${patientId}?token=${token}`;

            console.log("Location Tracking: Connecting WS...");
            setStatus('connecting');

            // Close existing connection if any
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
            }

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("Location WS Connected");
                setStatus('connected');

                // Initial Position
                navigator.geolocation.getCurrentPosition(
                    pos => sendLocation(pos.coords),
                    err => console.error(err)
                );

                // Start Ping Loop
                pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "PING" }));
                    }
                }, 25000);
            };

            ws.onmessage = (event) => {
                // Handle PONG or other messages if needed
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'PONG') {
                        // alive
                    }
                } catch (e) { }
            };

            ws.onclose = (event) => {
                console.log(`Location WS Disconnected: Code=${event.code}, Reason=${event.reason}`);
                if (status !== 'idle') setStatus('disconnected');

                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }

                // Reconnect logic
                // Only attempt reconnect if not a normal closure (1000) and still a PATIENT
                if (role === 'PATIENT' && event.code !== 1000) {
                    console.log("Location Tracking: Reconnecting in 5s...");
                    setTimeout(() => {
                        // Check if still mounted/logged in and role is still PATIENT
                        const tokenFromStorage = localStorage.getItem('token');
                        if (tokenFromStorage) {
                            try {
                                const currentRole = JSON.parse(atob(tokenFromStorage.split('.')[1])).role?.toUpperCase();
                                if (currentRole === 'PATIENT') {
                                    connectWebSocket(patientId);
                                }
                            } catch (e) {
                                console.error("Failed to parse token for reconnect check", e);
                            }
                        }
                    }, 5000);
                }
            };

            ws.onerror = (err) => {
                console.error("Location WS Error", err);
                setStatus('error');
            };
        };

        const startTracking = async () => {
            // 1. Get Patient ID
            let currentPatientId = user?.patient_id;
            if (!currentPatientId) {
                try {
                    const meRes = await client.get('/patients/me');
                    currentPatientId = meRes.data.id;
                } catch (err) {
                    console.error("Tracking: Failed to fetch patient ID", err);
                    setStatus('error');
                    return;
                }
            }

            if (!currentPatientId) {
                setStatus('error');
                return;
            }

            if (!navigator.geolocation) {
                console.warn("Geolocation not supported");
                setStatus('error');
                return;
            }

            connectWebSocket(currentPatientId);

            // Start Watch Position
            watchId = navigator.geolocation.watchPosition(
                (position) => sendLocation(position.coords),
                (err) => console.error("Geo Error", err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        };

        startTracking();

        return () => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (pingInterval) clearInterval(pingInterval);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user, status]); // Added status to dependency array to ensure reconnect logic can read latest status

    return { status };
};

export default useLocationTracking;

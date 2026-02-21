import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import { getWsUrl } from '../utils/websocket';

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
            const wsUrl = getWsUrl(patientId);
            console.log("DEBUG: WS URL:", wsUrl);

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
                // Only attempt reconnect if not a normal closure (1000) AND not a policy violation (1008)
                // Also avoid reconnecting on specific app errors if we defined them (e.g., 4001, 4003)
                const isRecoverable = event.code !== 1000 && event.code !== 1008 && event.code < 4000;

                // Track retries to prevent infinite loops
                const now = Date.now();
                if (!window.wsReconnectAttempts) window.wsReconnectAttempts = 0;
                if (!window.wsLastReconnectTime) window.wsLastReconnectTime = 0;

                // Reset retries if last attempt was > 60s ago
                if (now - window.wsLastReconnectTime > 60000) {
                    window.wsReconnectAttempts = 0;
                }

                if (role === 'PATIENT' && isRecoverable) {
                    if (window.wsReconnectAttempts < 5) {
                        window.wsReconnectAttempts++;
                        window.wsLastReconnectTime = now;
                        console.log(`Location Tracking: Reconnecting in 5s... (Attempt ${window.wsReconnectAttempts}/5)`);
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
                    } else {
                        console.error("Location Tracking: Max reconnect attempts reached. Stopping.");
                        setStatus('error');
                    }
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
                { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
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
    }, [user]); // Removed 'status' to prevent re-connect loop

    return { status };
};

export default useLocationTracking;

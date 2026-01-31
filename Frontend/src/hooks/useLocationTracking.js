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

        const startTracking = async () => {
            setStatus('connecting');

            // 1. Get Patient ID
            let patientId = user.patient_id;
            if (!patientId) {
                try {
                    const meRes = await client.get('/patients/me');
                    patientId = meRes.data.id;
                } catch (err) {
                    console.error("Tracking: Failed to fetch patient ID", err);
                    setStatus('error');
                    return;
                }
            }

            if (!patientId) {
                setStatus('error');
                return;
            }

            if (!navigator.geolocation) {
                console.warn("Geolocation not supported");
                setStatus('error');
                return;
            }

            // Connect WS
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

            if (wsRef.current) {
                wsRef.current.close();
            }

            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                console.log("Location WS Connected");
                setStatus('connected');

                // Initial Position
                navigator.geolocation.getCurrentPosition(
                    pos => sendLocation(pos.coords),
                    err => console.error(err)
                );
            };

            wsRef.current.onclose = (event) => {
                console.log(`Location WS Disconnected: Code=${event.code}, Reason=${event.reason}, WasClean=${event.wasClean}`);
                if (status !== 'idle') setStatus('disconnected');
            };

            wsRef.current.onerror = (err) => {
                console.error("Location WS Error", err);
                setStatus('error');
            };

            // Start Watching
            watchId = navigator.geolocation.watchPosition(
                (position) => sendLocation(position.coords),
                (err) => console.error("Geo Error", err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        };

        const sendLocation = (coords) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "LOCATION_UPDATE",
                    latitude: coords.latitude,
                    longitude: coords.longitude
                }));
            }
        };

        startTracking();

        return () => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user]);

    return { status };
};

export default useLocationTracking;

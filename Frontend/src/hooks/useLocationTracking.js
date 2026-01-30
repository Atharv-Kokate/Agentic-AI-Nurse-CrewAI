import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';

const useLocationTracking = () => {
    const { user } = useAuth();
    const wsRef = useRef(null);
    const [isTracking, setIsTracking] = useState(false);

    useEffect(() => {
        // Only run for PATIENT role
        if (!user || user.role !== 'PATIENT') {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
                setIsTracking(false);
            }
            return;
        }

        const startTracking = async () => {
            // 1. Get Patient ID (if we don't have it)
            let patientId = user.patient_id;

            if (!patientId) {
                try {
                    const meRes = await client.get('/patients/me');
                    patientId = meRes.data.id;
                } catch (err) {
                    console.error("Tracking: Failed to fetch patient ID", err);
                    return;
                }
            }

            if (!patientId) return;

            if (!navigator.geolocation) {
                console.warn("Geolocation not supported");
                return;
            }

            // Connect WS
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

            // Determine WS Host
            let host = window.location.host;
            const apiUrl = import.meta.env.VITE_API_URL;
            if (apiUrl) {
                try {
                    const url = new URL(apiUrl);
                    host = url.host;
                } catch (e) {
                    console.warn("Invalid VITE_API_URL, falling back to window.location.host");
                }
            }

            const token = localStorage.getItem('token');
            const wsUrl = `${protocol}//${host}/ws/${patientId}?token=${token}`;

            if (wsRef.current) {
                // Already connected or connecting?
                if (wsRef.current.url === wsUrl && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
                    return;
                }
                wsRef.current.close();
            }

            wsRef.current = new WebSocket(wsUrl);
            setIsTracking(true);

            wsRef.current.onopen = () => {
                console.log("Global Location Tracking Active");
                // Send initial location
                navigator.geolocation.getCurrentPosition(pos => {
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            type: "LOCATION_UPDATE",
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude
                        }));
                    }
                });
            };

            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            type: "LOCATION_UPDATE",
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        }));
                    }
                },
                (err) => console.error("Geo Error", err),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );

            // Cleanup function for this effect cycle
            return () => {
                navigator.geolocation.clearWatch(watchId);
                if (wsRef.current) {
                    wsRef.current.close();
                    wsRef.current = null;
                }
            };
        };

        const cleanupPromise = startTracking();

        return () => {
            // cleanup is handled inside startTracking's return, 
            // but since startTracking is async, we can't return it directly to useEffect.
            // We rely on the outer dependency change to trigger re-run.
            // But we SHOULD clean up the previous WS if user changes.
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user]); // Re-run if user changes (login/logout)
};

export default useLocationTracking;

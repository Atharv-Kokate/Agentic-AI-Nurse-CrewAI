import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, Heart, Thermometer, ShieldAlert, CheckCircle, Loader2,
    Video, Mic, MicOff, Send, Phone, Clock, FileText, User, Sparkles,
    Utensils, ShieldCheck, Trash2, MessageSquare, PhoneCall, AlertTriangle,
    MapPin, Search, X
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import VideoCallModal from '../components/VideoCallModal';
import { getWsUrl } from '../utils/websocket';

const PatientAssessmentMonitor = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('RUNNING');
    const [statusMessage, setStatusMessage] = useState('Initializing...');
    const [pollingData, setPollingData] = useState(null);
    const [userAnswer, setUserAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // History Modals State
    const [showMedicationModal, setShowMedicationModal] = useState(false);
    const [showVitalsModal, setShowVitalsModal] = useState(false);
    const [medicationHistory, setMedicationHistory] = useState([]);
    const [vitalsHistory, setVitalsHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingVitals, setLoadingVitals] = useState(false);

    const [location, setLocation] = useState(null);
    const wsRef = useRef(null);

    // Ref to track last seen interaction ID to avoid reprocessing same q
    const lastInteractionIdRef = useRef(null);

    // WebRTC State
    const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
    const [signalQueue, setSignalQueue] = useState([]);
    const [isInitiator, setIsInitiator] = useState(false);

    // ==========================================
    // MAP & NEARBY SEARCH STATE (Overpass API)
    // ==========================================
    const [mapSearchQuery, setMapSearchQuery] = useState('');
    const [activeMapSearch, setActiveMapSearch] = useState('');
    const [nearbyPlaces, setNearbyPlaces] = useState([]);
    const [searchingPlaces, setSearchingPlaces] = useState(false);
    const [showPlacesList, setShowPlacesList] = useState(false);

    // Rate limiting & caching
    const searchCacheRef = useRef({});
    const lastSearchTimeRef = useRef(0);
    const searchCooldown = 3000; // 3 seconds between searches

    useEffect(() => {
        let isMounted = true;

        // 1. Initial REST Fetch (for immediate state)
        const fetchStatus = async () => {
            try {
                const response = await client.get(`/status/${patientId}`);
                const data = response.data;
                if (isMounted) handleStatusUpdate(data);
            } catch (error) {
                console.error("Polling failed", error);
            }
        };

        fetchStatus();

        // 2. WebSocket Connection
        const wsUrl = getWsUrl(patientId);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to Monitor Stream");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("Monitor WS Received:", data);
                if (data.type === "LOCATION_UPDATE") {
                    setLocation({ lat: data.latitude, lng: data.longitude });
                } else if (data.status) {
                    handleStatusUpdate(data);
                } else if (data.type === 'WEBRTC_SIGNAL') {
                    if (data.payload) {
                        setSignalQueue(prev => [...prev, data.payload]);
                        setIsInitiator(false);
                        setIsVideoCallOpen(true);
                    }
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        ws.onclose = () => console.log("Monitor Stream Closed");

        // Keep polling as backup (every 5s instead of 2s)
        const intervalId = setInterval(fetchStatus, 5000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
            if (wsRef.current) wsRef.current.close();
        };
    }, [patientId]);

    // Get patient's geolocation for map features
    useEffect(() => {
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setLocation(prev => {
                    // Only update if we don't already have a WS-sourced location
                    if (!prev) {
                        return {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                        };
                    }
                    return prev;
                });
            },
            (err) => console.warn("Geolocation error:", err),
            { enableHighAccuracy: true }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const handleStatusUpdate = (data) => {
        if (data.status) {
            setStatus(data.status);
        }

        if (data.current_location && !location) {
            setLocation(data.current_location);
        }

        if (data.status === 'COMPLETED' && data.result) {
            setPollingData({ status: 'COMPLETED', result: data.result });
        }
        else if (data.status === 'WAITING_FOR_INPUT' && data.pending_interaction) {
            if (data.pending_interaction.interaction_id !== lastInteractionIdRef.current) {
                setPollingData(data);
                lastInteractionIdRef.current = data.pending_interaction.interaction_id;
            }
        }
    };

    const handleWebRTCSignal = (signal) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'WEBRTC_SIGNAL',
                payload: signal
            }));
        }
    };

    const startVideoCall = () => {
        setIsInitiator(true);
        setIsVideoCallOpen(true);
    };

    const fetchMedicationHistory = async () => {
        setLoadingHistory(true);
        setMedicationHistory([]);
        setShowMedicationModal(true);
        try {
            const response = await client.get(`/medication/history/${patientId}`);
            setMedicationHistory(response.data);
        } catch (error) {
            console.error("Failed to fetch medication history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const updateMedicationStatus = async (logId, newStatus) => {
        try {
            await client.put(`/medication/log/${logId}`, { status: newStatus });
            setMedicationHistory(prev => prev.map(log =>
                log.id === logId ? { ...log, status: newStatus } : log
            ));
        } catch (error) {
            console.error("Failed to update status", error);
            alert("Failed to update status");
        }
    };

    const fetchVitalsHistory = async () => {
        setLoadingVitals(true);
        setVitalsHistory([]);
        setShowVitalsModal(true);
        try {
            const response = await client.get(`/patients/${patientId}/vitals`);
            setVitalsHistory(response.data);
        } catch (error) {
            console.error("Failed to fetch vitals", error);
        } finally {
            setLoadingVitals(false);
        }
    };

    const handleSubmitAnswer = async (e) => {
        e.preventDefault();
        if (!userAnswer.trim() || !pollingData?.pending_interaction) return;

        setIsSubmitting(true);
        try {
            const interactionId = pollingData.pending_interaction.interaction_id;
            await client.post(`/interaction/${interactionId}`, {
                answer: userAnswer
            });
            setUserAnswer('');
            setStatus('RUNNING');
        } catch (error) {
            console.error("Failed to submit answer", error);
            alert("Failed to send answer. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ==========================================
    // OVERPASS API — India-Optimized Search (FREE, NO API KEY)
    // ==========================================

    const OVERPASS_ENDPOINTS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ];

    const getOverpassQuery = (searchTerm, lat, lng, radiusMeters = 5000) => {
        const lowerTerm = searchTerm.toLowerCase().trim();

        const aliasMap = {
            'hospital': 'hospitals', 'hospitals': 'hospitals',
            'pharmacy': 'pharmacies', 'pharmacies': 'pharmacies',
            'medical store': 'pharmacies', 'medical stores': 'pharmacies',
            'medical': 'pharmacies', 'medicals': 'pharmacies',
            'chemist': 'pharmacies', 'medicine': 'pharmacies', 'dawai': 'pharmacies',
            'clinic': 'clinics', 'clinics': 'clinics',
            'doctor': 'clinics', 'doctors': 'clinics',
            'nursing home': 'hospitals', 'nursing homes': 'hospitals',
            'emergency': 'emergency', 'emergency room': 'emergency',
            'lab': 'labs', 'labs': 'labs', 'pathology': 'labs', 'path lab': 'labs',
            'diagnostic': 'labs', 'diagnostic labs': 'labs',
            'blood bank': 'blood banks', 'blood banks': 'blood banks',
            'dentist': 'dentist', 'dentists': 'dentist', 'dental': 'dentist',
        };

        const resolved = aliasMap[lowerTerm] || lowerTerm;

        const queries = {
            'hospitals': `[out:json][timeout:8];nwr["amenity"="hospital"](around:${radiusMeters},${lat},${lng});out center tags 50;`,
            'pharmacies': `[out:json][timeout:8];(nwr["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});nwr["shop"="chemist"](around:${radiusMeters},${lat},${lng}););out center tags 50;`,
            'clinics': `[out:json][timeout:8];(nwr["amenity"="clinic"](around:${radiusMeters},${lat},${lng});nwr["amenity"="doctors"](around:${radiusMeters},${lat},${lng}););out center tags 50;`,
            'emergency': `[out:json][timeout:8];nwr["amenity"="hospital"]["emergency"="yes"](around:${radiusMeters},${lat},${lng});out center tags 20;`,
            'labs': `[out:json][timeout:8];nwr["healthcare"="laboratory"](around:${radiusMeters},${lat},${lng});out center tags 30;`,
            'blood banks': `[out:json][timeout:8];nwr["healthcare"="blood_donation"](around:${radiusMeters},${lat},${lng});out center tags 20;`,
            'dentist': `[out:json][timeout:8];nwr["amenity"="dentist"](around:${radiusMeters},${lat},${lng});out center tags 30;`,
        };

        if (queries[resolved]) return { query: queries[resolved], type: 'overpass' };
        return { query: searchTerm, type: 'nominatim' };
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const toRad = (val) => (val * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    const searchNominatim = async (query, lat, lng, radiusKm) => {
        const url = `https://nominatim.openstreetmap.org/search?` +
            `q=${encodeURIComponent(query)}+hospital+OR+clinic+OR+pharmacy&` +
            `format=json&limit=20&addressdetails=1&` +
            `viewbox=${lng - 0.05},${lat + 0.05},${lng + 0.05},${lat - 0.05}&bounded=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'NurseAI-HealthApp/1.0' }
        });

        if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
        const data = await response.json();

        return data
            .map(item => {
                const pLat = parseFloat(item.lat);
                const pLng = parseFloat(item.lon);
                const dist = calculateDistance(lat, lng, pLat, pLng);
                return {
                    id: item.place_id,
                    name: item.display_name?.split(',')[0] || item.name || 'Unknown',
                    lat: pLat, lng: pLng,
                    distance: dist,
                    phone: null, website: null,
                    address: item.display_name || null,
                    opening_hours: null, emergency: false,
                    type: item.type || item.class || query,
                    operator: null, brand: null, beds: null,
                    wheelchair: false, nameHindi: null,
                };
            })
            .filter(p => p.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);
    };

    const searchOverpass = async (overpassQuery, endpoint) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const url = `${endpoint}?data=${encodeURIComponent(overpassQuery)}`;
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.status === 429) throw new Error('RATE_LIMITED');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    };

    const searchNearbyPlaces = async (query, radiusKm = 5) => {
        if (!location) {
            alert("Patient location not available yet.");
            return;
        }

        const now = Date.now();
        const timeSinceLastSearch = now - lastSearchTimeRef.current;
        if (timeSinceLastSearch < searchCooldown) {
            const waitTime = Math.ceil((searchCooldown - timeSinceLastSearch) / 1000);
            alert(`Please wait ${waitTime}s before searching again.`);
            return;
        }
        lastSearchTimeRef.current = now;

        const cacheKey = `${query.toLowerCase()}_${radiusKm}_${location.lat.toFixed(3)}_${location.lng.toFixed(3)}`;
        if (searchCacheRef.current[cacheKey]) {
            setActiveMapSearch(query);
            setNearbyPlaces(searchCacheRef.current[cacheKey]);
            setShowPlacesList(true);
            return;
        }

        setSearchingPlaces(true);
        setActiveMapSearch(query);
        setNearbyPlaces([]);
        setShowPlacesList(true);

        const radiusMeters = radiusKm * 1000;
        const { query: searchQuery, type: searchType } = getOverpassQuery(query, location.lat, location.lng, radiusMeters);

        let places = [];
        let success = false;

        if (searchType === 'nominatim') {
            try {
                places = await searchNominatim(query, location.lat, location.lng, radiusKm);
                success = true;
            } catch (err) {
                console.warn("Nominatim failed:", err.message);
            }
        } else {
            for (const endpoint of OVERPASS_ENDPOINTS) {
                if (success) break;
                try {
                    const data = await searchOverpass(searchQuery, endpoint);
                    if (!data.elements) { success = true; continue; }

                    const seen = new Set();
                    places = data.elements
                        .filter(el => {
                            if (!el.tags) return false;
                            const elLat = el.lat || el.center?.lat;
                            const elLng = el.lon || el.center?.lon;
                            if (!elLat || !elLng) return false;
                            const name = el.tags.name || el.tags['name:en'] || el.tags['name:hi'];
                            if (!name) return false;
                            const key = `${name.toLowerCase()}_${elLat.toFixed(3)}_${elLng.toFixed(3)}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        })
                        .map(el => {
                            const pLat = el.lat || el.center?.lat;
                            const pLng = el.lon || el.center?.lon;
                            const dist = calculateDistance(location.lat, location.lng, pLat, pLng);
                            const addrParts = [
                                el.tags['addr:housenumber'], el.tags['addr:street'],
                                el.tags['addr:suburb'] || el.tags['addr:neighbourhood'],
                                el.tags['addr:city'], el.tags['addr:postcode'],
                            ].filter(Boolean);
                            return {
                                id: el.id,
                                name: el.tags.name || el.tags['name:en'] || el.tags['name:hi'],
                                nameHindi: el.tags['name:hi'] || null,
                                lat: pLat, lng: pLng,
                                distance: dist,
                                phone: el.tags.phone || el.tags['contact:phone'] || el.tags['contact:mobile'] || null,
                                website: el.tags.website || el.tags['contact:website'] || null,
                                address: el.tags['addr:full'] || addrParts.join(', ') || null,
                                opening_hours: el.tags.opening_hours === '24/7' ? '24/7 Open' : el.tags.opening_hours || null,
                                emergency: el.tags.emergency === 'yes',
                                wheelchair: el.tags.wheelchair === 'yes',
                                beds: el.tags.beds ? parseInt(el.tags.beds) : null,
                                type: el.tags.amenity || el.tags.healthcare || el.tags.shop || query,
                                operator: el.tags.operator || null,
                                brand: el.tags.brand || null,
                            };
                        })
                        .filter(p => p.distance <= radiusKm)
                        .sort((a, b) => a.distance - b.distance);
                    success = true;
                } catch (error) {
                    if (error.message === 'RATE_LIMITED') {
                        await new Promise(r => setTimeout(r, 2000));
                    } else if (error.name === 'AbortError') {
                        console.warn(`Timed out: ${endpoint}`);
                    } else {
                        console.warn(`Failed: ${endpoint} → ${error.message}`);
                    }
                }
            }
        }

        if (!success && searchType !== 'nominatim') {
            try {
                places = await searchNominatim(query, location.lat, location.lng, radiusKm);
                success = true;
            } catch (err) {
                console.warn("Nominatim fallback also failed:", err.message);
            }
        }

        if (places.length > 0) {
            searchCacheRef.current[cacheKey] = places;
            setTimeout(() => { delete searchCacheRef.current[cacheKey]; }, 5 * 60 * 1000);
        }

        setNearbyPlaces(places);
        setSearchingPlaces(false);
    };

    const handleMapSearch = (e) => {
        e.preventDefault();
        if (!mapSearchQuery.trim()) return;
        searchNearbyPlaces(mapSearchQuery.trim());
    };

    const clearSearch = () => {
        setMapSearchQuery('');
        setActiveMapSearch('');
        setNearbyPlaces([]);
        setShowPlacesList(false);
    };

    // ==========================================
    // RENDER EMERGENCY MAP (only when risk_score > 75)
    // ==========================================
    const renderEmergencyMap = () => {
        if (!location) {
            return (
                <div className="mb-6 h-48 rounded-xl border-2 border-dashed border-red-200 bg-red-50/50 flex flex-col items-center justify-center text-red-400">
                    <div className="rounded-full bg-red-100 p-3 mb-2">
                        <MapPin className="h-6 w-6 opacity-60" />
                    </div>
                    <p className="font-medium text-sm">Acquiring your location for nearby facilities...</p>
                    <p className="text-xs mt-1">Please enable location access.</p>
                </div>
            );
        }

        let mapSrc;
        if (activeMapSearch) {
            mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(activeMapSearch)}+near+${location.lat},${location.lng}&z=14&output=embed`;
        } else {
            mapSrc = `https://maps.google.com/maps?q=hospitals+near+${location.lat},${location.lng}&z=14&output=embed`;
        }

        const quickFilters = [
            { label: '🏥 Hospitals', query: 'hospitals' },
            { label: '💊 Medical Stores', query: 'pharmacies' },
            { label: '🩺 Clinics', query: 'clinics' },
        ];

        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 rounded-xl overflow-hidden border-2 border-red-200 shadow-lg"
            >
                {/* Header */}
                <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-bold text-sm">Nearby Medical Facilities</span>
                    </div>
                    <span className="text-red-200 text-xs">Within 5km radius</span>
                </div>

                {/* Search Bar */}
                <div className="bg-white px-4 py-3 border-b border-slate-100">
                    <form onSubmit={handleMapSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={mapSearchQuery}
                                onChange={(e) => setMapSearchQuery(e.target.value)}
                                placeholder="Search hospitals, medical stores, clinics..."
                                className="w-full rounded-lg border border-slate-200 px-4 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                            />
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        </div>
                        <button
                            type="submit"
                            disabled={searchingPlaces}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50"
                        >
                            {searchingPlaces ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                        </button>
                        {activeMapSearch && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </form>

                    {/* Quick Filter Buttons */}
                    <div className="flex gap-2 mt-2">
                        {quickFilters.map((item) => (
                            <button
                                key={item.query}
                                onClick={() => {
                                    setMapSearchQuery(item.query);
                                    searchNearbyPlaces(item.query);
                                }}
                                disabled={searchingPlaces}
                                className={cn(
                                    "text-xs px-3 py-1.5 rounded-full border transition font-medium",
                                    activeMapSearch === item.query
                                        ? 'bg-red-100 border-red-300 text-red-700 font-bold'
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results Banner */}
                {activeMapSearch && (
                    <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center justify-between text-sm">
                        <span className="text-red-700">
                            {searchingPlaces ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Searching "{activeMapSearch}" within 5km...
                                </span>
                            ) : (
                                <span>
                                    🔍 Found <strong>{nearbyPlaces.length}</strong> "{activeMapSearch}" within 5km
                                </span>
                            )}
                        </span>
                        <a
                            href={`https://www.google.com/maps/search/${encodeURIComponent(activeMapSearch)}/@${location.lat},${location.lng},14z`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-red-600 font-bold hover:underline text-xs"
                        >
                            Open in Google Maps ↗
                        </a>
                    </div>
                )}

                {/* Map iframe */}
                <div className="relative">
                    <div className="absolute top-2 right-2 z-10 bg-white/90 px-2 py-1 rounded text-xs font-bold text-red-700 shadow-sm border border-red-100">
                        {activeMapSearch ? `🔍 ${activeMapSearch.toUpperCase()}` : '🏥 NEARBY HOSPITALS'}
                    </div>
                    <iframe
                        width="100%"
                        height="300"
                        frameBorder="0"
                        scrolling="no"
                        marginHeight="0"
                        marginWidth="0"
                        src={mapSrc}
                        style={{ border: 0 }}
                    ></iframe>
                </div>

                {/* Places List */}
                {showPlacesList && !searchingPlaces && nearbyPlaces.length > 0 && (
                    <div className="bg-white border-t border-slate-100 max-h-72 overflow-y-auto">
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10 flex justify-between items-center">
                            <span>{nearbyPlaces.length} {activeMapSearch} found within 5km</span>
                            <span className="text-slate-400 font-normal normal-case">Source: OpenStreetMap</span>
                        </div>
                        {nearbyPlaces.map((place, idx) => (
                            <div
                                key={`${place.id}-${idx}`}
                                className="px-4 py-3 border-b border-slate-50 hover:bg-red-50/50 transition"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-800 text-sm">{place.name}</span>
                                            {place.nameHindi && place.nameHindi !== place.name && (
                                                <span className="text-xs text-slate-400">({place.nameHindi})</span>
                                            )}
                                            {place.emergency && (
                                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">🚨 EMERGENCY</span>
                                            )}
                                            {place.opening_hours === '24/7 Open' && (
                                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">24/7</span>
                                            )}
                                            {place.wheelchair && (
                                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">♿</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                                            <span className="font-bold text-red-600">
                                                📍 {place.distance < 1
                                                    ? `${(place.distance * 1000).toFixed(0)}m`
                                                    : `${place.distance.toFixed(1)}km`}
                                            </span>
                                            {place.type && (
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 capitalize">
                                                    {place.type.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            {place.beds && <span>🛏 {place.beds} beds</span>}
                                            {place.operator && <span>🏢 {place.operator}</span>}
                                        </div>

                                        {place.address && (
                                            <p className="text-xs text-slate-400 mt-1 truncate">🏠 {place.address}</p>
                                        )}

                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                                            {place.opening_hours && <span>🕐 {place.opening_hours}</span>}
                                            {place.phone && <span>📞 {place.phone}</span>}
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                        <a
                                            href={`https://www.google.com/maps/dir/?api=1&origin=${location.lat},${location.lng}&destination=${place.lat},${place.lng}&travelmode=driving`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition"
                                        >
                                            🧭 Directions
                                        </a>
                                        {place.phone && (
                                            <a
                                                href={`tel:${place.phone}`}
                                                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-green-700 transition"
                                            >
                                                📞 Call
                                            </a>
                                        )}
                                        {place.website && (
                                            <a
                                                href={place.website}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-200 transition"
                                            >
                                                🌐 Website
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Loading */}
                {searchingPlaces && (
                    <div className="bg-white border-t border-slate-100 px-4 py-8 flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-red-600" />
                        <p className="text-sm text-slate-600 font-medium">Searching nearby {activeMapSearch}...</p>
                        <p className="text-xs text-slate-400">Querying OpenStreetMap within 5km radius</p>
                    </div>
                )}

                {/* No results */}
                {showPlacesList && !searchingPlaces && nearbyPlaces.length === 0 && activeMapSearch && (
                    <div className="bg-white border-t border-slate-100 px-4 py-6 text-center">
                        <p className="text-sm text-slate-600">No "{activeMapSearch}" found within 5km on OpenStreetMap.</p>
                        <p className="text-xs text-slate-400 mt-1">Some places may not be mapped yet. Try the Google Maps link above.</p>
                        <div className="flex items-center justify-center gap-3 mt-3">
                            <button
                                onClick={() => searchNearbyPlaces(activeMapSearch, 10)}
                                className="text-xs bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition"
                            >
                                🔄 Expand to 10km
                            </button>
                            <button
                                onClick={() => searchNearbyPlaces(activeMapSearch)}
                                className="text-xs border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition"
                            >
                                Retry 5km
                            </button>
                            <a
                                href={`https://www.google.com/maps/search/${encodeURIComponent(activeMapSearch)}/@${location.lat},${location.lng},14z`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition"
                            >
                                Open Google Maps ↗
                            </a>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="bg-slate-50 px-4 py-3 text-xs text-slate-500 flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>
                        <span className="font-semibold text-slate-600">Your Location:</span>
                        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </span>
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-red-600 font-bold hover:underline"
                    >
                        Open in Maps ↗
                    </a>
                </div>
            </motion.div>
        );
    };

    // ==========================================
    // RENDER CONTENT
    // ==========================================
    const renderContent = () => {
        switch (status) {
            case 'RUNNING':
                return (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="relative h-24 w-24">
                            <div className="absolute inset-0 animate-ping rounded-full bg-sky-400 opacity-20"></div>
                            <div className="flex h-full w-full items-center justify-center rounded-full bg-sky-50 text-sky-500 shadow-inner">
                                <Activity className="h-10 w-10 animate-pulse" />
                            </div>
                        </div>
                        <h2 className="mt-8 text-xl font-semibold text-slate-800">AI Agents Working...</h2>
                        <p className="mt-2 text-center text-slate-500 max-w-md animate-pulse">
                            {statusMessage}
                        </p>
                    </div>
                );

            case 'WAITING_FOR_INPUT':
                return (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-sky-100 bg-sky-50/50 p-8 shadow-sm"
                    >
                        <div className="flex items-start gap-4">
                            <div className="rounded-full bg-white p-3 shadow-sm text-sky-600">
                                <MessageSquare className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">Information Required</h3>
                                <p className="mt-1 text-slate-600">The Symptom Inquiry Agent needs clarification.</p>

                                <div className="mt-6 rounded-xl bg-white p-6 shadow-sm border border-slate-100">
                                    <p className="text-lg font-medium text-slate-800">
                                        {pollingData?.pending_interaction?.question}
                                    </p>
                                </div>

                                <form onSubmit={handleSubmitAnswer} className="mt-6 relative">
                                    <input
                                        type="text"
                                        value={userAnswer}
                                        onChange={(e) => setUserAnswer(e.target.value)}
                                        placeholder="Type your answer here..."
                                        autoFocus
                                        className="w-full rounded-xl border border-slate-200 bg-white p-4 pr-14 text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!userAnswer.trim() || isSubmitting}
                                        className="absolute right-2 top-2 bottom-2 rounded-lg bg-sky-500 px-4 text-white transition-all hover:bg-sky-600 disabled:opacity-50 disabled:hover:bg-sky-500"
                                    >
                                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </motion.div>
                );

            case 'COMPLETED':
                const result = pollingData?.result;
                if (!result) return null;

                const isHighRisk = result.risk_level === 'HIGH' || result.risk_level === 'CRITICAL';
                const riskColor = isHighRisk ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50';
                const riskBorder = isHighRisk ? 'border-red-200' : 'border-emerald-200';
                const showMap = result.risk_score > 75;

                return (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className={cn("glass-panel rounded-2xl border-2 p-8 text-center", riskBorder)}>
                            <div className={cn("mb-4 inline-flex items-center justify-center rounded-full p-4", riskColor)}>
                                {isHighRisk ? <ShieldAlert className="h-10 w-10" /> : <CheckCircle className="h-10 w-10" />}
                            </div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Risk Assessment</h3>
                            <h2 className={cn("mt-2 text-4xl font-black", isHighRisk ? "text-red-900" : "text-emerald-900")}>
                                {result.risk_level}
                                <span className="ml-3 text-2xl font-normal opacity-70">
                                    ({result.risk_score}/100)
                                </span>
                            </h2>
                        </div>

                        {/* HIGH RISK ALERT BANNER */}
                         {/* EMERGENCY MAP — Only shown when risk_score > 75 */}
                        {showMap && renderEmergencyMap()}
                        {showMap && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3"
                            >
                                <div className="bg-red-100 rounded-full p-2">
                                    <AlertTriangle className="h-5 w-5 text-red-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-red-800 text-sm">⚠️ High Risk Detected — Nearby facilities shown below</p>
                                    <p className="text-red-600 text-xs mt-0.5">Hospitals, clinics & medical stores within 5km of your location are displayed for quick access.</p>
                                </div>
                            </motion.div>
                        )}

                        <div className="glass-panel rounded-xl p-8">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Clinical Reasoning</h3>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-700 leading-relaxed">
                                    {(() => {
                                        try {
                                            const r = typeof result.reasoning === 'string' ? JSON.parse(result.reasoning) : result.reasoning;
                                            return r.justification || r.reasoning || JSON.stringify(r, null, 2);
                                        } catch (e) {
                                            return result.reasoning;
                                        }
                                    })()}
                                </p>
                            </div>

                            <div className="mt-8 flex justify-between items-center">
                                <button
                                    onClick={async () => {
                                        if (!confirm("Are you sure you want to escalate this case to the doctor?")) return;
                                        const btn = document.getElementById('escalate-btn');
                                        if (btn) btn.disabled = true;
                                        try {
                                            await client.post('/escalate', { patient_id: patientId });
                                            alert("Doctor has been notified successfully.");
                                        } catch (err) {
                                            alert("Failed to escalate: " + (err.response?.data?.detail || err.message));
                                        } finally {
                                            if (btn) btn.disabled = false;
                                        }
                                    }}
                                    id="escalate-btn"
                                    className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-sm"
                                >
                                    <ShieldAlert className="h-4 w-4" />
                                    Call Doctor
                                </button>

                                <button
                                    onClick={() => navigate('/')}
                                    className="rounded-lg border border-slate-200 px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Return to Dashboard
                                </button>
                            </div>
                        </div>

                        {/* EMERGENCY MAP — Only shown when risk_score > 75 */}
                        {/* {showMap && renderEmergencyMap()} */}
                    </motion.div>
                );

            default:
                return <div>
                    <div>Unknown Status</div>
                </div>;
        }
    };


    // --- Task Planning Logic ---
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [generatingPlan, setGeneratingPlan] = useState(false);

    const fetchDailyTasks = async () => {
        setLoadingTasks(true);
        setShowTaskModal(true);
        try {
            const response = await client.get(`/tasks/${patientId}`);
            setTasks(response.data);
        } catch (error) {
            console.error("Failed to fetch daily tasks", error);
        } finally {
            setLoadingTasks(false);
        }
    };

    const generateAiPlan = async () => {
        setGeneratingPlan(true);
        try {
            const response = await client.post(`/tasks/generate/${patientId}`);
            setTasks(response.data);
        } catch (error) {
            console.error("Failed to generate plan", error);
            const msg = error.response?.data?.detail || "Failed to generate plan. Please try again.";
            alert(msg);
        } finally {
            setGeneratingPlan(false);
        }
    };

    // Manual Task State
    const [isAddingManual, setIsAddingManual] = useState(false);
    const [manualTask, setManualTask] = useState({ description: '', category: 'General' });

    const handleAddManualTask = async () => {
        if (!manualTask.description.trim()) return;
        try {
            const response = await client.post(`/tasks/${patientId}/manual`, {
                task_description: manualTask.description,
                category: manualTask.category
            });
            setTasks([...tasks, response.data]);
            setManualTask({ description: '', category: 'General' });
            setIsAddingManual(false);
        } catch (error) {
            console.error("Failed to add task manually", error);
            alert("Failed to add task.");
        }
    };

    return (
        <div className="mx-auto max-w-3xl pb-12">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <button
                        onClick={() => navigate('/patients')}
                        className="text-slate-400 hover:text-slate-600 text-sm mb-1"
                    >
                        ← Back to Patients
                    </button>
                    <h1 className="text-2xl font-bold text-slate-900">Patient Monitor</h1>
                    <p className="text-slate-500 text-sm">Patient ID: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-xs select-all">{patientId}</span></p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchDailyTasks}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-sm"
                    >
                        📋 Tasks
                    </button>
                    <button
                        onClick={fetchMedicationHistory}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-sm"
                    >
                        💊 Pills
                    </button>
                    <button
                        onClick={fetchVitalsHistory}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-sm"
                    >
                        ❤️ Vitals
                    </button>

                    <div className={cn(
                        "ml-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                        status === 'RUNNING' ? "bg-amber-100 text-amber-700" :
                            status === 'WAITING_FOR_INPUT' ? "bg-sky-100 text-sky-700" :
                                "bg-emerald-100 text-emerald-700"
                    )}>
                        {status.replace(/_/g, " ")}
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={status}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>

            <VideoCallModal
                isOpen={isVideoCallOpen}
                onClose={() => setIsVideoCallOpen(false)}
                onSignal={handleWebRTCSignal}
                signalQueue={signalQueue}
                isInitiator={isInitiator}
            />


            {/* Medication History Modal */}
            {showMedicationModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Medication Tracker</h2>
                            <button onClick={() => setShowMedicationModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingHistory ? (
                                <div className="text-center py-8">Loading...</div>
                            ) : medicationHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No records found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {medicationHistory.map((log) => (
                                        <div key={log.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50">
                                            <div>
                                                <p className="font-semibold text-slate-900">{log.medicine_name}</p>
                                                <p className="text-xs text-slate-500">
                                                    Scheduled: {new Date(log.scheduled_time).toLocaleString(undefined, {
                                                        weekday: 'short', month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {log.status === 'TAKEN' ? (
                                                    <span className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                                        ✅ Taken
                                                    </span>
                                                ) : log.status === 'MISSED' ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-red-600 font-medium bg-red-50 px-3 py-1 rounded-full border border-red-100">
                                                            ❌ Missed
                                                        </span>
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                            className="text-xs text-blue-600 underline hover:text-blue-800"
                                                        >
                                                            Undo
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                            className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition"
                                                        >
                                                            Mark Taken
                                                        </button>
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'MISSED')}
                                                            className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition"
                                                        >
                                                            Missed
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-4 pt-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowMedicationModal(false)}
                                className="text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Tasks Modal */}
            {showTaskModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold">Daily Health Plan</h2>
                                <p className="text-sm text-slate-500">Manage patient's daily routine</p>
                            </div>
                            <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-lg">
                            <div className="text-sm font-medium text-slate-700">
                                Today's Tasks
                            </div>
                            <div className="flex gap-2">
                                <div className="flex gap-2">
                                </div>
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingTasks ? (
                                <div className="text-center py-8">Loading tasks...</div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                    <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                    <p>No tasks scheduled for today.</p>
                                    <button onClick={generateAiPlan} className="text-indigo-600 font-medium hover:underline mt-1">
                                        Generate a plan using AI
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks.map((task) => (
                                        <div key={task.id} className="flex items-start justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 group">
                                            <div className="flex items-start gap-3">
                                                <div className={cn("mt-1 p-2 rounded-lg",
                                                    task.category === 'Diet' ? 'bg-green-100 text-green-700' :
                                                        task.category === 'Exercise' ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'
                                                )}>
                                                    {task.category === 'Diet' ? <Utensils className="h-4 w-4" /> :
                                                        task.category === 'Exercise' ? <Activity className="h-4 w-4" /> :
                                                            <Clock className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-900">{task.task_description}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">{task.category}</span>

                                                        {task.status_patient === 'COMPLETED' ? (
                                                            <span className="text-xs flex items-center gap-1 text-emerald-600 font-bold">
                                                                <CheckCircle className="h-3 w-3" /> Patient Done
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">Patient: Pending</span>
                                                        )}

                                                        {task.status_caretaker === 'VALIDATED' ? (
                                                            <span className="text-xs flex items-center gap-1 text-indigo-600 font-bold border-l pl-2 border-slate-200">
                                                                <ShieldCheck className="h-3 w-3" /> Verified
                                                            </span>
                                                        ) : task.status_caretaker === 'REFUSED' ? (
                                                            <span className="text-xs text-red-500 font-bold border-l pl-2 border-slate-200">
                                                                Rejected
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 border-l pl-2 border-slate-200">
                                                                Unverified
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}


            {/* Vitals History Modal */}
            {showVitalsModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Vitals History</h2>
                            <button onClick={() => setShowVitalsModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingVitals ? (
                                <div className="text-center py-8">Loading...</div>
                            ) : vitalsHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No vitals recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-0 divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                                    <div className="bg-slate-50 p-3 grid grid-cols-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">
                                        <div>Date</div>
                                        <div>BP</div>
                                        <div>HR</div>
                                        <div>Sugar</div>
                                    </div>
                                    {vitalsHistory.map((log) => (
                                        <div key={log.id} className="p-3 grid grid-cols-4 text-sm hover:bg-slate-50 transition-colors">
                                            <div className="text-slate-900 font-medium">
                                                {new Date(log.created_at).toLocaleDateString()}
                                                <div className="text-xs text-slate-400 font-normal">
                                                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <div className="text-slate-600">{log.blood_pressure}</div>
                                            <div className="text-slate-600">{log.heart_rate} <span className="text-xs text-slate-400">bpm</span></div>
                                            <div className="text-slate-600">{log.blood_sugar} <span className="text-xs text-slate-400">mg/dL</span></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-4 pt-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowVitalsModal(false)}
                                className="text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientAssessmentMonitor;
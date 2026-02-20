import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Maximize2, Minimize2 } from 'lucide-react';
import webrtcService from '../services/webrtc';

const VideoCallModal = ({ isOpen, onClose, onSignal, incomingSignal, signalQueue = [], isInitiator }) => {
    const [callState, setCallState] = useState('IDLE'); // IDLE, CALLING, INCOMING, ANSWERING, CONNECTED, ENDED
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    // WebRTC Buffering
    // WebRTC Buffering
    const [offerSignal, setOfferSignal] = useState(null);
    const lastProcessedIndex = useRef(-1); // Track processed signals from queue

    // Initialize based on props
    useEffect(() => {
        if (isOpen) {
            if (isInitiator) {
                startCall();
            } else if (incomingSignal) {
                // If we open receiving a call, initiate incoming state
                // But let the main signal handler effect process the signal
                // setCallState('INCOMING'); 
            }
        } else {
            endCall(false); // Clean up if closed externally
        }
    }, [isOpen, isInitiator]);

    // Handle incoming signals from parent (QUEUE BASED)
    useEffect(() => {
        if (!isOpen || signalQueue.length === 0) return;

        // Only process new signals we haven't seen yet
        const newSignals = signalQueue.slice(lastProcessedIndex.current + 1);

        if (newSignals.length === 0) return;

        console.log(`Processing ${newSignals.length} new signals from queue`);

        // Use a for...of loop to allow await-ing async operations
        const processSignals = async () => {
            for (const signal of newSignals) {
                console.log("Processing Signal:", signal.type);

                if (signal.type === 'offer') {
                    setOfferSignal(signal);
                    if (callState === 'IDLE') {
                        setCallState('INCOMING');
                    }
                }

                // Pass ALL signals to service - it handles buffering internally
                if (isInitiator || callState === 'CONNECTED' || callState === 'ANSWERING') {
                    await webrtcService.handleSignal(signal);
                }

                // For INCOMING state (receiver), handle candidates if needed
                // Note: webrtcService buffers candidates if remoteDescription isn't set
                if (!isInitiator && signal.type === 'candidate') {
                    await webrtcService.handleSignal(signal);
                }
            }
        };

        processSignals();

        // Update tracking ref
        lastProcessedIndex.current = signalQueue.length - 1;

    }, [signalQueue, isOpen, callState]);

    // Handle legacy incoming signals (single) - Keep for backward compat if needed
    useEffect(() => {
        if (!incomingSignal || !isOpen) return;
        // ... (Legacy logic kept but likely unused if queue is used)
    }, [incomingSignal, isOpen]);

    const startCall = async () => {
        setCallState('CALLING');
        try {
            const stream = await webrtcService.startLocalStream();
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            webrtcService.onSignal = (signal) => {
                onSignal(signal);
            };

            webrtcService.onRemoteStream = (stream) => {
                console.log("Setting remote stream to video element");
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                    // Ensure auto play
                    remoteVideoRef.current.play().catch(e => console.error("Remote play error", e));
                }
                setCallState('CONNECTED');
            };

            webrtcService.onConnectionStateChange = (state) => {
                if (state === 'disconnected' || state === 'failed') {
                    endCall();
                }
            };

            await webrtcService.createOffer();
        } catch (error) {
            console.error("Failed to start call:", error);
            endCall();
        }
    };

    const answerCall = async () => {
        setCallState('ANSWERING'); // Show loading/connecting state
        try {
            const stream = await webrtcService.startLocalStream();
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            // Allow time for state update
            await new Promise(r => setTimeout(r, 100));


            webrtcService.onSignal = (signal) => {
                onSignal(signal);
            };

            webrtcService.onRemoteStream = (stream) => {
                console.log("Remote stream received in answerCall");
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                    remoteVideoRef.current.play().catch(e => console.error("Remote play error", e));
                }
                setCallState('CONNECTED'); // Only switch to connected when we have video
            };

            webrtcService.onConnectionStateChange = (state) => {
                if (state === 'disconnected' || state === 'failed') {
                    endCall();
                }
            };

            // 1. Process the original Offer first
            if (offerSignal) {
                console.log("Handling Buffered Offer");
                await webrtcService.handleSignal(offerSignal);
            } else {
                console.warn("No offer signal found when answering!");
            }

            // Note: Candidates were already passed to service and buffered there.
            // Service will auto-process them once offer is set.

            // setCallState('CONNECTED'); // Removed: Moved to onRemoteStream

        } catch (error) {
            console.error("Failed to answer call:", error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                alert("Camera/Microphone permission denied. Please allow access in your browser settings to answer the call.");
            }
            endCall();
        }
    };

    const endCall = (notify = true) => {
        webrtcService.close();
        setCallState('IDLE');
        if (notify) onClose();
    };

    const toggleMute = () => {
        if (webrtcService.localStream) {
            webrtcService.localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (webrtcService.localStream) {
            webrtcService.localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
            setIsVideoOff(!isVideoOff);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backbone"
            >
                <div className="relative h-full w-full max-w-5xl overflow-hidden bg-slate-900 md:h-[80vh] md:rounded-2xl shadow-2xl flex flex-col">

                    {/* Remote Video (Main) */}
                    <div className="relative flex-1 bg-black flex items-center justify-center">
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="h-full w-full object-cover"
                        />
                        {/* Placeholder if no video */}
                        {(callState !== 'CONNECTED') && (
                            <div className="absolute inset-0 flex items-center justify-center text-white">
                                <div className="text-center">
                                    <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-800">
                                        <span className="text-4xl">👨‍⚕️</span>
                                    </div>
                                    <h3 className="text-xl font-semibold">
                                        {callState === 'INCOMING' ? 'Incoming Call...' :
                                            callState === 'CALLING' ? 'Calling...' : 'Connecting...'}
                                    </h3>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Local Video (PiP) */}
                    <div className="absolute right-4 top-4 h-32 w-24 overflow-hidden rounded-xl border-2 border-slate-700 bg-slate-800 shadow-lg md:h-48 md:w-36">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full object-cover"
                        />
                    </div>

                    {/* Controls */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="flex items-center justify-center gap-6">

                            {callState === 'INCOMING' ? (
                                <>
                                    <button
                                        onClick={endCall}
                                        className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <PhoneOff className="h-6 w-6" />
                                    </button>
                                    <button
                                        onClick={answerCall}
                                        className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 animate-pulse"
                                    >
                                        <Phone className="h-6 w-6" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={toggleMute}
                                        className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-700/50 text-white hover:bg-slate-600'}`}
                                    >
                                        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                                    </button>

                                    <button
                                        onClick={endCall}
                                        className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <PhoneOff className="h-6 w-6" />
                                    </button>

                                    <button
                                        onClick={toggleVideo}
                                        className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all ${isVideoOff ? 'bg-white text-slate-900' : 'bg-slate-700/50 text-white hover:bg-slate-600'}`}
                                    >
                                        {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default VideoCallModal;

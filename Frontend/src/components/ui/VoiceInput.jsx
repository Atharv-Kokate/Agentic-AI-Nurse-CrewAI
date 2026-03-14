import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

const VoiceInput = ({
    value,
    onChange,
    placeholder = "Tap the microphone and start speaking...",
    className = "",
    rows = 3
}) => {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setIsSupported(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // Append the new final transcript to the existing value
            if (finalTranscript) {
                const newValue = value ? `${value} ${finalTranscript.trim()}` : finalTranscript.trim();
                onChange(newValue);
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            // Only restart if we intentionally told it to keep listening
            // However, typical behavior is to stop on end to prevent infinite loops on silence
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [value, onChange]);

    const toggleListening = (e) => {
        e.preventDefault(); // Prevent form submission
        if (!isSupported) {
            alert("Your browser does not support voice input. Please type instead.");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (error) {
                console.error("Could not start recognition", error);
                setIsListening(false);
            }
        }
    };

    return (
        <div className={cn("relative", className)}>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={isListening ? "Listening..." : placeholder}
                rows={rows}
                className={cn(
                    "w-full rounded-xl border p-4 pl-4 pr-14 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all",
                    isListening ? "border-sky-500 bg-slate-800 shadow-[0_0_15px_rgba(14,165,233,0.3)]" : "border-slate-700 bg-slate-800",
                )}
            />

            {isSupported && (
                <button
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                        "absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                        isListening
                            ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50"
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
                    )}
                >
                    {isListening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                </button>
            )}
        </div>
    );
};

export default VoiceInput;

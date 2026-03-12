import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Activity, Heart, Frown, Smile, MessageSquare, Loader2 } from 'lucide-react';
import client from '../../api/client';

const MonitoringCheckInCard = ({ patientId, role, onComplete }) => {
    const [checkInId, setCheckInId] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [freeTextValue, setFreeTextValue] = useState("");

    // Fetch pending check-in
    useEffect(() => {
        const fetchPending = async () => {
            try {
                const res = await client.get(`/monitoring/pending/${patientId}?target_role=${role}`);
                if (res.data.check_in_id && res.data.questions.length > 0) {
                    setCheckInId(res.data.check_in_id);
                    setQuestions(res.data.questions);
                }
            } catch (err) {
                console.error("Failed to fetch monitoring questions:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPending();
    }, [patientId, role]);

    const handleAnswer = (answerValue) => {
        const currentQ = questions[currentIndex];

        const newResponse = {
            question_id: currentQ.id,
            answer_value: answerValue,
            notes: currentQ.type === 'FREE_TEXT' ? freeTextValue : null
        };

        setResponses(prev => [...prev, newResponse]);
        setFreeTextValue("");

        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            submitCheckIn([...responses, newResponse]);
        }
    };

    const submitCheckIn = async (finalResponses) => {
        setIsSubmitting(true);
        try {
            await client.post(`/monitoring/submit/${checkInId}?target_role=${role}`, {
                responses: finalResponses
            });
            if (onComplete) onComplete();
        } catch (err) {
            console.error("Failed to submit check-in:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return null;
    if (!checkInId) return null; // Nothing pending

    const currentQ = questions[currentIndex];
    const isCompleted = isSubmitting || currentIndex >= questions.length;

    // Response UI Renderers
    const renderYesNo = () => (
        <div className="flex gap-4 w-full">
            <button onClick={() => handleAnswer("YES")} className="flex-1 py-4 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30 flex flex-col items-center gap-2 transition-all">
                <CheckCircle className="w-8 h-8" />
                <span className="font-semibold">Yes</span>
            </button>
            <button onClick={() => handleAnswer("NO")} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl flex flex-col items-center gap-2 transition-all">
                <XCircle className="w-8 h-8" />
                <span className="font-semibold">No</span>
            </button>
        </div>
    );

    const renderEmojiScale = () => (
        <div className="grid grid-cols-4 gap-2 w-full">
            {[
                { val: "GOOD", icon: <Smile className="w-6 h-6 text-emerald-400" />, label: "Good" },
                { val: "OKAY", icon: <Heart className="w-6 h-6 text-sky-400" />, label: "Okay" },
                { val: "NOT_GREAT", icon: <Activity className="w-6 h-6 text-orange-400" />, label: "Not Great" },
                { val: "BAD", icon: <Frown className="w-6 h-6 text-red-500" />, label: "Bad" }
            ].map(e => (
                <button key={e.val} onClick={() => handleAnswer(e.val)} className="py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex flex-col items-center gap-2 transition-all">
                    {e.icon}
                    <span className="text-xs text-slate-300 font-medium">{e.label}</span>
                </button>
            ))}
        </div>
    );

    const renderComparison = () => (
        <div className="flex flex-col gap-3 w-full">
            {["Better", "Same", "Worse"].map(val => (
                <button key={val} onClick={() => handleAnswer(val.toUpperCase())} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-all">
                    {val}
                </button>
            ))}
        </div>
    );

    const renderFreeText = () => (
        <div className="w-full flex flex-col gap-3">
            <textarea
                value={freeTextValue}
                onChange={(e) => setFreeTextValue(e.target.value)}
                placeholder="Type your notes here..."
                className="w-full p-4 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:border-sky-500 focus:outline-none min-h-[100px]"
            />
            <div className="flex gap-3">
                <button onClick={() => handleAnswer("SKIPPED")} className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition-colors">Skip</button>
                <button onClick={() => handleAnswer(freeTextValue.trim())} disabled={!freeTextValue.trim()} className="flex-1 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors">Submit</button>
            </div>
        </div>
    );

    return (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-sky-500/50 rounded-2xl p-6 shadow-xl shadow-sky-900/20 relative overflow-hidden mb-6">

            {/* Background Accent */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl rounded-full"></div>

            <div className="flex justify-between items-center mb-6 relative z-10">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400">
                        <Activity className="w-4 h-4" />
                    </div>
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        Routine Health Check
                        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] uppercase font-bold animate-pulse">Required</span>
                    </h3>
                </div>
                {!isCompleted && (
                    <span className="text-sm text-slate-400 font-medium">Question {currentIndex + 1} of {questions.length}</span>
                )}
            </div>

            <div className="min-h-[180px] flex flex-col justify-center relative z-10">
                <AnimatePresence mode="wait">
                    {isCompleted ? (
                        <motion.div
                            key="complete"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center text-center gap-3 py-4"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
                                    <p className="text-slate-300">Evaluating responses...</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 mb-2">
                                        <CheckCircle className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-lg font-semibold text-white">Check-in Complete</h4>
                                    <p className="text-sm text-slate-400">Thank you. The nurse has been updated.</p>
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key={currentIndex}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex flex-col gap-6"
                        >
                            <h4 className="text-xl text-slate-100 font-medium leading-snug">
                                {currentQ.text}
                            </h4>

                            <div className="flex justify-center">
                                {currentQ.type === 'YES_NO' && renderYesNo()}
                                {currentQ.type === 'EMOJI_SCALE' && renderEmojiScale()}
                                {currentQ.type === 'COMPARISON' && renderComparison()}
                                {currentQ.type === 'FREE_TEXT' && renderFreeText()}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Progress Bar */}
            {!isCompleted && (
                <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full">
                    <motion.div
                        className="h-full bg-sky-500"
                        initial={{ width: `${(currentIndex / questions.length) * 100}%` }}
                        animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            )}
        </div>
    );
};

export default MonitoringCheckInCard;

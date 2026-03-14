import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Activity, Heart, Frown, Smile, Meh, MessageSquare, Loader2, ChevronRight, Sparkles } from 'lucide-react';
import client from '../../api/client';

const MonitoringCheckInCard = ({ patientId, role, patientName, onComplete }) => {
    const [checkInId, setCheckInId] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
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
            setIsComplete(true);
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
    const progress = ((currentIndex + 1) / questions.length) * 100;

    // Build title
    const title = patientName
        ? `Health Check for ${patientName}`
        : 'Daily Health Check-In';

    // ─── Completed / Submitting State ─────────────────────
    if (isComplete || isSubmitting) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-6 shadow-sm mb-4 overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                <div className="flex flex-col items-center text-center gap-3 py-4 relative z-10">
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
                            <p className="text-slate-600 font-medium">Evaluating your responses...</p>
                        </>
                    ) : (
                        <>
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                                className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center"
                            >
                                <CheckCircle className="w-7 h-7 text-emerald-600" />
                            </motion.div>
                            <h4 className="text-lg font-bold text-slate-800">Check-In Complete!</h4>
                            <p className="text-sm text-slate-500">Thank you — the care team has been updated.</p>
                        </>
                    )}
                </div>
            </motion.div>
        );
    }

    // ─── Response UI Renderers ────────────────────────────
    const renderYesNo = () => (
        <div className="flex gap-3 w-full">
            <button
                onClick={() => handleAnswer("YES")}
                className="flex-1 py-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border-2 border-emerald-200 hover:border-emerald-300 flex flex-col items-center gap-2 transition-all duration-200 active:scale-[0.97] shadow-sm"
            >
                <CheckCircle className="w-7 h-7" />
                <span className="font-semibold text-sm">Yes</span>
            </button>
            <button
                onClick={() => handleAnswer("NO")}
                className="flex-1 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border-2 border-slate-200 hover:border-slate-300 flex flex-col items-center gap-2 transition-all duration-200 active:scale-[0.97] shadow-sm"
            >
                <XCircle className="w-7 h-7" />
                <span className="font-semibold text-sm">No</span>
            </button>
        </div>
    );

    const renderEmojiScale = () => (
        <div className="grid grid-cols-4 gap-2 w-full">
            {[
                { val: "GOOD", emoji: "😊", label: "Good", colors: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 hover:border-emerald-300 text-emerald-700" },
                { val: "OKAY", emoji: "🙂", label: "Okay", colors: "bg-sky-50 hover:bg-sky-100 border-sky-200 hover:border-sky-300 text-sky-700" },
                { val: "NOT_GREAT", emoji: "😐", label: "Not Great", colors: "bg-orange-50 hover:bg-orange-100 border-orange-200 hover:border-orange-300 text-orange-700" },
                { val: "BAD", emoji: "😣", label: "Bad", colors: "bg-red-50 hover:bg-red-100 border-red-200 hover:border-red-300 text-red-700" }
            ].map(e => (
                <button
                    key={e.val}
                    onClick={() => handleAnswer(e.val)}
                    className={`py-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all duration-200 active:scale-[0.95] shadow-sm ${e.colors}`}
                >
                    <span className="text-2xl">{e.emoji}</span>
                    <span className="text-[11px] font-semibold">{e.label}</span>
                </button>
            ))}
        </div>
    );

    const renderComparison = () => (
        <div className="flex gap-2 w-full">
            {[
                { val: "BETTER", label: "Better", emoji: "📈", colors: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700" },
                { val: "SAME", label: "Same", emoji: "➡️", colors: "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600" },
                { val: "WORSE", label: "Worse", emoji: "📉", colors: "bg-red-50 hover:bg-red-100 border-red-200 text-red-700" }
            ].map(v => (
                <button
                    key={v.val}
                    onClick={() => handleAnswer(v.val)}
                    className={`flex-1 py-3.5 rounded-xl border-2 font-semibold text-sm flex flex-col items-center gap-1.5 transition-all duration-200 active:scale-[0.97] shadow-sm ${v.colors}`}
                >
                    <span className="text-xl">{v.emoji}</span>
                    {v.label}
                </button>
            ))}
        </div>
    );

    const renderFreeText = () => (
        <div className="w-full flex flex-col gap-3">
            <textarea
                value={freeTextValue}
                onChange={(e) => setFreeTextValue(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full p-4 rounded-xl bg-white border-2 border-slate-200 text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none min-h-[100px] placeholder:text-slate-400 transition-all"
            />
            <div className="flex gap-3">
                <button
                    onClick={() => handleAnswer("SKIPPED")}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 font-medium text-sm transition-colors"
                >
                    Skip
                </button>
                <button
                    onClick={() => handleAnswer(freeTextValue.trim())}
                    disabled={!freeTextValue.trim()}
                    className="flex-1 py-2.5 bg-sky-500 text-white rounded-xl hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm transition-colors shadow-sm"
                >
                    Submit
                </button>
            </div>
        </div>
    );

    // ─── Main Card ────────────────────────────────────────
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-br from-white to-sky-50/50 border-2 border-sky-200 rounded-2xl p-5 md:p-6 shadow-sm mb-4 overflow-hidden"
        >
            {/* Background Accent */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-sky-100/60 rounded-full blur-3xl" />

            {/* Header */}
            <div className="flex justify-between items-center mb-5 relative z-10">
                <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 shadow-sm">
                        <Activity className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-slate-800 font-bold text-sm md:text-base flex items-center gap-2">
                            {title}
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px] uppercase font-bold tracking-wide animate-pulse">
                                Required
                            </span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {role === 'CARETAKER' ? 'Observational questions about the patient' : 'Quick questions about how you feel'}
                        </p>
                    </div>
                </div>
                <span className="text-sm text-slate-500 font-semibold bg-slate-100 px-2.5 py-1 rounded-lg">
                    {currentIndex + 1} / {questions.length}
                </span>
            </div>

            {/* Question Area */}
            <div className="min-h-[200px] flex flex-col justify-center relative z-10">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.25 }}
                        className="flex flex-col gap-5"
                    >
                        <h4 className="text-lg md:text-xl text-slate-800 font-semibold leading-snug">
                            {currentQ.text}
                        </h4>

                        <div>
                            {currentQ.type === 'YES_NO' && renderYesNo()}
                            {currentQ.type === 'EMOJI_SCALE' && renderEmojiScale()}
                            {currentQ.type === 'COMPARISON' && renderComparison()}
                            {currentQ.type === 'FREE_TEXT' && renderFreeText()}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Progress Bar */}
            <div className="mt-5 relative z-10">
                <div className="h-1.5 bg-slate-100 rounded-full w-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-sky-500 to-teal-500 rounded-full"
                        initial={{ width: `${((currentIndex) / questions.length) * 100}%` }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export default MonitoringCheckInCard;

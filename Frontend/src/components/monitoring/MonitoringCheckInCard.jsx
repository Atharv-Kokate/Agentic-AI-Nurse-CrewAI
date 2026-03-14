import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Activity, Loader2 } from 'lucide-react';
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

    if (isLoading || !checkInId) return null;

    const currentQ = questions[currentIndex];
    const progress = ((currentIndex + 1) / questions.length) * 100;
    const title = patientName ? `Health Check for ${patientName}` : 'Daily Health Check-In';

    // ─── Completed / Submitting ──────────────────────────
    if (isComplete || isSubmitting) {
        return (
            <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6 shadow-sm mb-4">
                <div className="flex flex-col items-center text-center gap-3 py-4">
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
                            <p className="text-slate-600 font-medium">Evaluating responses...</p>
                        </>
                    ) : (
                        <>
                            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                                <CheckCircle className="w-7 h-7 text-emerald-600" />
                            </div>
                            <h4 className="text-lg font-bold text-slate-800">Check-In Complete!</h4>
                            <p className="text-sm text-slate-500">Thank you — the care team has been updated.</p>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ─── Response Renderers ──────────────────────────────
    const renderYesNo = () => (
        <div className="grid grid-cols-2 gap-3">
            <button
                onClick={() => handleAnswer("YES")}
                className="py-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border-2 border-emerald-200 hover:border-emerald-300 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]"
            >
                <CheckCircle className="w-6 h-6" />
                <span className="font-bold text-sm">Yes</span>
            </button>
            <button
                onClick={() => handleAnswer("NO")}
                className="py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border-2 border-slate-200 hover:border-slate-300 flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]"
            >
                <XCircle className="w-6 h-6" />
                <span className="font-bold text-sm">No</span>
            </button>
        </div>
    );

    const renderEmojiScale = () => (
        <div className="grid grid-cols-4 gap-2">
            {[
                { val: "GOOD", emoji: "😊", label: "Good", border: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50" },
                { val: "OKAY", emoji: "🙂", label: "Okay", border: "border-sky-200 hover:border-sky-400 hover:bg-sky-50" },
                { val: "NOT_GREAT", emoji: "😐", label: "Not Great", border: "border-orange-200 hover:border-orange-400 hover:bg-orange-50" },
                { val: "BAD", emoji: "😣", label: "Bad", border: "border-red-200 hover:border-red-400 hover:bg-red-50" }
            ].map(e => (
                <button
                    key={e.val}
                    onClick={() => handleAnswer(e.val)}
                    className={`py-3.5 bg-white rounded-xl border-2 flex flex-col items-center gap-1 transition-all active:scale-95 ${e.border}`}
                >
                    <span className="text-2xl leading-none">{e.emoji}</span>
                    <span className="text-[11px] font-semibold text-slate-600">{e.label}</span>
                </button>
            ))}
        </div>
    );

    const renderComparison = () => (
        <div className="grid grid-cols-3 gap-2">
            {[
                { val: "BETTER", label: "Better", emoji: "📈", border: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50" },
                { val: "SAME", label: "Same", emoji: "➡️", border: "border-slate-200 hover:border-slate-400 hover:bg-slate-50" },
                { val: "WORSE", label: "Worse", emoji: "📉", border: "border-red-200 hover:border-red-400 hover:bg-red-50" }
            ].map(v => (
                <button
                    key={v.val}
                    onClick={() => handleAnswer(v.val)}
                    className={`py-4 bg-white rounded-xl border-2 font-semibold text-sm text-slate-700 flex flex-col items-center gap-1.5 transition-all active:scale-95 ${v.border}`}
                >
                    <span className="text-xl leading-none">{v.emoji}</span>
                    <span>{v.label}</span>
                </button>
            ))}
        </div>
    );

    const renderFreeText = () => (
        <div className="space-y-3">
            <textarea
                value={freeTextValue}
                onChange={(e) => setFreeTextValue(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full p-3 rounded-xl bg-white border-2 border-slate-200 text-slate-800 focus:border-sky-400 focus:outline-none min-h-[80px] placeholder:text-slate-400 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => handleAnswer("SKIPPED")}
                    className="py-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 font-medium text-sm transition-colors"
                >
                    Skip
                </button>
                <button
                    onClick={() => handleAnswer(freeTextValue.trim())}
                    disabled={!freeTextValue.trim()}
                    className="py-2.5 bg-sky-500 text-white rounded-xl hover:bg-sky-600 disabled:opacity-40 font-medium text-sm transition-colors"
                >
                    Submit
                </button>
            </div>
        </div>
    );

    // ─── Card ────────────────────────────────────────────
    return (
        <div className="bg-white border-2 border-sky-200 rounded-2xl shadow-sm mb-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-800 truncate">{title}</h3>
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 text-[9px] uppercase font-bold tracking-wide animate-pulse flex-shrink-0">
                                Required
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {role === 'CARETAKER' ? 'Observational questions about the patient' : 'Quick questions about how you feel'}
                        </p>
                    </div>
                </div>
                <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-1 rounded-lg flex-shrink-0 ml-2">
                    {currentIndex + 1}/{questions.length}
                </span>
            </div>

            {/* Progress Bar */}
            <div className="px-5">
                <div className="h-1 bg-slate-100 rounded-full w-full">
                    <motion.div
                        className="h-full bg-gradient-to-r from-sky-500 to-teal-500 rounded-full"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                </div>
            </div>

            {/* Question + Answers */}
            <div className="px-5 pt-4 pb-5">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                    >
                        <p className="text-base font-medium text-slate-800 leading-relaxed">
                            {currentQ.text}
                        </p>

                        {currentQ.type === 'YES_NO' && renderYesNo()}
                        {currentQ.type === 'EMOJI_SCALE' && renderEmojiScale()}
                        {currentQ.type === 'COMPARISON' && renderComparison()}
                        {currentQ.type === 'FREE_TEXT' && renderFreeText()}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default MonitoringCheckInCard;

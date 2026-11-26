import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudCheck,
  CloudOff,
  Eraser,
  LayoutGrid,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import type { AttemptAnswer, ExamAttempt, Question } from '../types';

interface StartPayload {
  attempt: ExamAttempt;
  exam: {
    id: string;
    title: string;
    subject: string;
    duration: number;
    totalMarks: number;
    passingMarks: number;
    instructions: string;
    settings: {
      negativeMarking: boolean;
      tabSwitchMonitoring: boolean;
    };
  };
  questions: Question[];
  remainingSeconds: number;
  autoSubmitted?: boolean;
}

function formatTimer(seconds: number): string {
  const s = Math.max(0, seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function isQuestionAnswered(ans?: AttemptAnswer): boolean {
  if (!ans) return false;
  if (ans.selectedOptions && ans.selectedOptions.length > 0) return true;
  if (ans.textAnswer && ans.textAnswer.trim().length > 0) return true;
  return false;
}

type PaletteState =
  | 'not_visited'
  | 'not_answered'
  | 'answered'
  | 'marked'
  | 'answered_marked';

function getPaletteState(ans?: AttemptAnswer): PaletteState {
  if (!ans || !ans.visited) return 'not_visited';
  const answered = isQuestionAnswered(ans);
  if (answered && ans.markedForReview) return 'answered_marked';
  if (ans.markedForReview) return 'marked';
  if (answered) return 'answered';
  return 'not_answered';
}

const PALETTE_CLASSES: Record<PaletteState, string> = {
  not_visited: 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400',
  not_answered: 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300',
  answered: 'border-emerald-500 bg-emerald-600 text-white',
  marked: 'border-violet-500 bg-violet-600 text-white',
  answered_marked: 'border-indigo-500 bg-indigo-600 text-white ring-2 ring-amber-400',
};

export function ExamTakingPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [payload, setPayload] = useState<StartPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, AttemptAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [tabSwitches, setTabSwitches] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedInfo, setSubmittedInfo] = useState<{
    message: string;
    resultPublished: boolean;
    resultId: string | null;
    summary?: { obtainedMarks: number; totalMarks: number; percentage: number; passed: boolean };
  } | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  const pendingQueueRef = useRef<Record<string, AttemptAnswer>>({});
  const autoSubmittedRef = useRef(false);

  // Start or resume attempt from authoritative server state
  useEffect(() => {
    if (!examId) return;
    let mounted = true;
    setLoading(true);
    apiRequest<StartPayload>(`/api/attempts/start/${examId}`, { method: 'POST' })
      .then((res) => {
        if (!mounted) return;
        setPayload(res);
        setAnswers(res.attempt.answers || {});
        setRemainingSeconds(res.remainingSeconds);
        setTabSwitches(res.attempt.integritySignals?.length || 0);
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(err instanceof ApiError ? err.message : 'Unable to start examination.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [examId]);

  const flushAnswerToServer = useCallback(
    async (attemptId: string, answer: AttemptAnswer) => {
      setSaveState('saving');
      try {
        const res = await apiRequest<{ remainingSeconds: number }>(
          `/api/attempts/${attemptId}/answer`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              questionId: answer.questionId,
              selectedOptions: answer.selectedOptions,
              textAnswer: answer.textAnswer,
              markedForReview: answer.markedForReview,
              visited: true,
            }),
          }
        );
        delete pendingQueueRef.current[answer.questionId];
        setRemainingSeconds(res.remainingSeconds);
        setSaveState('saved');
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          notify('warning', 'Time expired', err.message);
          navigate('/dashboard', { replace: true });
          return;
        }
        pendingQueueRef.current[answer.questionId] = answer;
        setSaveState('offline');
      }
    },
    [navigate, notify]
  );

  // Retry buffered answers when network reconnects or periodically every 15s
  useEffect(() => {
    if (!payload) return;
    const attemptId = payload.attempt.id;

    const flushPending = () => {
      const queued = Object.values(pendingQueueRef.current);
      for (const ans of queued) {
        void flushAnswerToServer(attemptId, ans);
      }
    };

    window.addEventListener('online', flushPending);
    const interval = window.setInterval(flushPending, 15000);
    return () => {
      window.removeEventListener('online', flushPending);
      window.clearInterval(interval);
    };
  }, [payload, flushAnswerToServer]);

  const submitFinalExam = useCallback(
    async (auto = false) => {
      if (!payload || submitting || submittedInfo) return;
      setSubmitting(true);
      try {
        // Flush any unsynced answers first
        for (const ans of Object.values(pendingQueueRef.current)) {
          await flushAnswerToServer(payload.attempt.id, ans);
        }
        const res = await apiRequest<{
          message: string;
          resultPublished: boolean;
          resultId: string | null;
          summary?: { obtainedMarks: number; totalMarks: number; percentage: number; passed: boolean };
        }>(`/api/attempts/${payload.attempt.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ auto }),
        });
        setConfirmOpen(false);
        setSubmittedInfo(res);
      } catch (err) {
        notify('error', 'Submission failed', err instanceof ApiError ? err.message : undefined);
      } finally {
        setSubmitting(false);
      }
    },
    [payload, submitting, submittedInfo, flushAnswerToServer, notify]
  );

  // Countdown timer synced with server deadline + automatic submission at 0
  useEffect(() => {
    if (!payload || submittedInfo) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            void submitFinalExam(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [payload, submittedInfo, submitFinalExam]);

  // Transparent tab-switch integrity signal listener
  useEffect(() => {
    if (!payload || !payload.exam.settings.tabSwitchMonitoring || submittedInfo) return;
    const attemptId = payload.attempt.id;

    const onVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches((c) => c + 1);
        void apiRequest(`/api/attempts/${attemptId}/signal`, {
          method: 'POST',
          body: JSON.stringify({ type: 'tab_switch', details: 'Browser tab lost visibility' }),
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [payload, submittedInfo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1020]">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Verifying examination eligibility and loading secure session…
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1020] p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cannot Start Examination</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {loadError || 'Examination is unavailable.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/exams')}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2"
          >
            Back to Examinations
          </button>
        </div>
      </div>
    );
  }

  if (submittedInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1020] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-8 text-center space-y-5 shadow-xl"
        >
          <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Examination Submitted
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {submittedInfo.message}
            </p>
          </div>

          {submittedInfo.resultPublished && submittedInfo.summary ? (
            <div className="rounded-xl bg-slate-50 dark:bg-[#0B1020] p-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500">Marks</p>
                <p className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
                  {submittedInfo.summary.obtainedMarks}/{submittedInfo.summary.totalMarks}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Percentage</p>
                <p className="mt-1 font-mono tabular-nums text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  {submittedInfo.summary.percentage}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Outcome</p>
                <p
                  className={`mt-1 text-lg font-bold ${
                    submittedInfo.summary.passed
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {submittedInfo.summary.passed ? 'PASS' : 'FAIL'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-slate-50 dark:bg-[#0B1020] p-4">
              Your responses are securely stored on the server. Final results will appear in My Results once published by your instructor.
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {submittedInfo.resultPublished && submittedInfo.resultId && (
              <button
                type="button"
                onClick={() => navigate(`/results?inspect=${submittedInfo.resultId}`, { replace: true })}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5"
              >
                View Detailed Result
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold"
            >
              Return to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const questions = payload.questions;
  const currentQuestion = questions[currentIndex];
  const currentAns = answers[currentQuestion.id] || {
    questionId: currentQuestion.id,
    markedForReview: false,
    visited: true,
    updatedAt: new Date().toISOString(),
  };

  const updateCurrentAnswer = (patch: Partial<AttemptAnswer>, immediateSync = true) => {
    const next: AttemptAnswer = {
      ...currentAns,
      ...patch,
      questionId: currentQuestion.id,
      visited: true,
      updatedAt: new Date().toISOString(),
    };
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: next }));
    if (immediateSync) {
      void flushAnswerToServer(payload.attempt.id, next);
    } else {
      pendingQueueRef.current[currentQuestion.id] = next;
    }
  };

  const navigateToQuestion = (nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= questions.length) return;
    // Flush current question if pending
    if (pendingQueueRef.current[currentQuestion.id]) {
      void flushAnswerToServer(payload.attempt.id, pendingQueueRef.current[currentQuestion.id]);
    }
    const targetQ = questions[nextIdx];
    setCurrentIndex(nextIdx);
    setAnswers((prev) => {
      if (prev[targetQ.id]?.visited) return prev;
      const visitedEntry: AttemptAnswer = {
        ...(prev[targetQ.id] || { questionId: targetQ.id, markedForReview: false }),
        questionId: targetQ.id,
        visited: true,
        updatedAt: new Date().toISOString(),
      };
      void flushAnswerToServer(payload.attempt.id, visitedEntry);
      return { ...prev, [targetQ.id]: visitedEntry };
    });
    setMobilePaletteOpen(false);
  };

  const toggleSingleOption = (optId: string) => {
    updateCurrentAnswer({ selectedOptions: [optId] }, true);
  };

  const toggleMultiOption = (optId: string) => {
    const existing = currentAns.selectedOptions || [];
    const next = existing.includes(optId)
      ? existing.filter((id) => id !== optId)
      : [...existing, optId];
    updateCurrentAnswer({ selectedOptions: next }, true);
  };

  const clearCurrentAnswer = () => {
    updateCurrentAnswer({ selectedOptions: [], textAnswer: '' }, true);
  };

  const toggleMarkReview = () => {
    updateCurrentAnswer({ markedForReview: !currentAns.markedForReview }, true);
  };

  // Summary counts for confirmation dialog & legend
  const answeredCount = questions.filter((q) => isQuestionAnswered(answers[q.id])).length;
  const unansweredCount = questions.length - answeredCount;
  const markedCount = questions.filter((q) => answers[q.id]?.markedForReview).length;
  const lowTime = remainingSeconds <= 300; // <= 5 mins

  const paletteContent = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Question Palette</h3>
        <span className="font-mono tabular-nums text-xs text-slate-500">
          {answeredCount}/{questions.length} answered
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, idx) => {
          const st = getPaletteState(answers[q.id]);
          const isCurrent = idx === currentIndex;
          return (
            <button
              key={q.id}
              type="button"
              aria-label={`Question ${idx + 1} (${st.replace('_', ' ')})`}
              onClick={() => navigateToQuestion(idx)}
              className={`h-10 rounded-lg border font-mono tabular-nums text-xs font-semibold transition-all ${
                PALETTE_CLASSES[st]
              } ${isCurrent ? 'ring-2 ring-offset-2 ring-indigo-600 dark:ring-offset-[#0F1629]' : ''}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-emerald-600 shrink-0" />
          <span>Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-rose-100 border border-rose-400 dark:bg-rose-950 shrink-0" />
          <span>Not Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-violet-600 shrink-0" />
          <span>Marked Review</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-indigo-600 ring-1 ring-amber-400 shrink-0" />
          <span>Answered &amp; Marked</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shrink-0" />
          <span>Not Visited</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 px-4 transition-colors"
      >
        <Send className="h-4 w-4" />
        <span>Submit Examination</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1020] text-slate-900 dark:text-slate-100">
      {/* Distraction-Free Exam Header */}
      <header className="sticky top-0 z-20 h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1629] px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {payload.exam.subject} · Question {currentIndex + 1} of {questions.length}
          </p>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {payload.exam.title}
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Sync Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {saveState === 'offline' ? (
              <>
                <CloudOff className="h-4 w-4 text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400">Queued offline</span>
              </>
            ) : (
              <>
                <CloudCheck className="h-4 w-4 text-emerald-500" />
                <span>{saveState === 'saving' ? 'Saving…' : 'Saved'}</span>
              </>
            )}
          </div>

          {/* Countdown Timer */}
          <div
            data-testid="exam-timer"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono tabular-nums text-sm font-bold ${
              lowTime
                ? 'border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1020] text-slate-900 dark:text-white'
            }`}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatTimer(remainingSeconds)}</span>
          </div>

          <button
            type="button"
            aria-label="Open question palette"
            onClick={() => setMobilePaletteOpen(true)}
            className="lg:hidden rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1 bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-indigo-600 transition-all duration-300"
          style={{ width: `${Math.round((answeredCount / questions.length) * 100)}%` }}
        />
      </div>

      {lowTime && (
        <div className="bg-rose-600 text-white text-xs font-medium px-4 py-2 text-center">
          Less than 5 minutes remaining. Your answers will automatically submit when the server timer expires.
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Question Canvas */}
        <section className="lg:col-span-8 xl:col-span-9 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5 sm:p-8 flex flex-col justify-between min-h-[520px]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Question {currentIndex + 1} of {questions.length} ·{' '}
                <span className="capitalize">{currentQuestion.questionType.replace('_', ' ')}</span>
              </div>
              <div className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                +{currentQuestion.marks} marks
                {payload.exam.settings.negativeMarking && currentQuestion.negativeMarks > 0
                  ? ` · -${currentQuestion.negativeMarks} wrong`
                  : ''}
              </div>
            </div>

            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.16 }}
              className="space-y-5"
            >
              <p className="text-base sm:text-lg font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                {currentQuestion.questionText}
              </p>

              {currentQuestion.imageUrl && (
                <img
                  src={currentQuestion.imageUrl}
                  alt="Examination figure"
                  referrerPolicy="no-referrer"
                  className="max-h-64 rounded-xl border border-slate-200 dark:border-slate-700 object-contain"
                />
              )}

              {/* MCQ / True-False */}
              {(currentQuestion.questionType === 'mcq' ||
                currentQuestion.questionType === 'true_false') && (
                <div className="space-y-3" role="radiogroup" aria-label="Answer choices">
                  {currentQuestion.options.map((opt, idx) => {
                    const selected = currentAns.selectedOptions?.includes(opt.id) ?? false;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => toggleSingleOption(opt.id)}
                        className={`w-full text-left rounded-xl border p-4 flex items-start gap-3.5 transition-colors ${
                          selected
                            ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span
                          className={`h-6 w-6 rounded-full border text-xs font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                            selected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 text-slate-500'
                          }`}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm sm:text-base leading-snug">{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Multi-Select */}
              {currentQuestion.questionType === 'multi_select' && (
                <div className="space-y-3" role="group" aria-label="Multiple select choices">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select all options that apply.
                  </p>
                  {currentQuestion.options.map((opt, idx) => {
                    const selected = currentAns.selectedOptions?.includes(opt.id) ?? false;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() => toggleMultiOption(opt.id)}
                        className={`w-full text-left rounded-xl border p-4 flex items-start gap-3.5 transition-colors ${
                          selected
                            ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span
                          className={`h-6 w-6 rounded-md border text-xs font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                            selected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 text-slate-500'
                          }`}
                        >
                          {selected ? '✓' : String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm sm:text-base leading-snug">{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Subjective Short / Long Answer */}
              {(currentQuestion.questionType === 'short_answer' ||
                currentQuestion.questionType === 'long_answer') && (
                <div className="space-y-2">
                  <label
                    htmlFor="subjective-response"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-400"
                  >
                    Your Written Response (auto-saves on blur or navigation)
                  </label>
                  <textarea
                    id="subjective-response"
                    rows={currentQuestion.questionType === 'long_answer' ? 8 : 4}
                    value={currentAns.textAnswer || ''}
                    onChange={(e) => updateCurrentAnswer({ textAnswer: e.target.value }, false)}
                    onBlur={() => {
                      if (pendingQueueRef.current[currentQuestion.id]) {
                        void flushAnswerToServer(payload.attempt.id, pendingQueueRef.current[currentQuestion.id]);
                      }
                    }}
                    placeholder="Type your response clearly here…"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1020] p-4 text-sm sm:text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </motion.div>
          </div>

          {/* Bottom Controls */}
          <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleMarkReview}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  currentAns.markedForReview
                    ? 'border-violet-500 bg-violet-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" />
                <span>{currentAns.markedForReview ? 'Marked for Review' : 'Mark for Review'}</span>
              </button>
              <button
                type="button"
                onClick={clearCurrentAnswer}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>Clear Answer</span>
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => navigateToQuestion(currentIndex - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => navigateToQuestion(currentIndex + 1)}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-semibold"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold"
                >
                  <Send className="h-4 w-4" />
                  <span>Review &amp; Submit</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Desktop Sidebar Palette */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-4 sticky top-24">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
            {paletteContent}
          </div>
          {payload.exam.settings.tabSwitchMonitoring && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-4 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Integrity Signal Log
                </p>
                <p className="mt-0.5">
                  Tab switches recorded: <strong className="font-mono tabular-nums">{tabSwitches}</strong>. Recorded transparently for faculty context only.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Question Palette Drawer */}
      <AnimatePresence>
        {mobilePaletteOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobilePaletteOpen(false)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              className="relative z-10 w-80 max-w-[85vw] bg-white dark:bg-[#0F1629] p-5 h-full overflow-y-auto"
            >
              <div className="flex justify-end mb-3">
                <button
                  type="button"
                  aria-label="Close palette"
                  onClick={() => setMobilePaletteOpen(false)}
                  className="p-1.5 text-slate-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {paletteContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Final Submission Confirmation Modal */}
      <ConfirmDialog
        open={confirmOpen}
        title="Submit Examination?"
        description="Once submitted, you cannot modify your answers for this attempt."
        confirmLabel="Confirm Final Submit"
        loading={submitting}
        onConfirm={() => void submitFinalExam(false)}
        onCancel={() => setConfirmOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 dark:bg-[#0B1020] p-4 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Total Questions</span>
            <strong className="font-mono tabular-nums">{questions.length}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Answered</span>
            <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {answeredCount}
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Unanswered</span>
            <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
              {unansweredCount}
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Marked for Review</span>
            <strong className="font-mono tabular-nums text-violet-600 dark:text-violet-400">
              {markedCount}
            </strong>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}

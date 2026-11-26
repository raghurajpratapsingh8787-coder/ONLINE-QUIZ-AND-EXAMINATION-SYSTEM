import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ClipboardCheck, Download, FileCheck, ShieldAlert, X } from 'lucide-react';
import { apiRequest, ApiError, downloadCsvReport } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton';
import type { Exam, ExamAttempt, Question, ResultItem } from '../types';

interface SubmissionRow {
  attemptId: string;
  examId: string;
  examTitle: string;
  subject: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  rollNumber: string;
  attemptNumber: number;
  submittedAt: string;
  status: string;
  integritySignalCount: number;
  result: ResultItem | null;
}

interface DetailedSubmission {
  attempt: ExamAttempt;
  exam: Exam;
  student: { id: string; name: string; email: string; rollNumber?: string; group?: string } | null;
  result: ResultItem | null;
  questions: Question[];
}

export function SubmissionsPage() {
  const { notify } = useToast();
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const [detail, setDetail] = useState<DetailedSubmission | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [grades, setGrades] = useState<Record<string, { marks: number; feedback: string }>>({});
  const [overallFeedback, setOverallFeedback] = useState('');
  const [savingEval, setSavingEval] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await apiRequest<{ submissions: SubmissionRow[] }>(`/api/attempts/submissions/list${qs}`);
      setRows(res.submissions);
    } catch (err) {
      notify('error', 'Failed to load submissions', err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openEvaluation = async (attemptId: string) => {
    setLoadingDetail(true);
    try {
      const res = await apiRequest<DetailedSubmission>(`/api/attempts/submissions/${attemptId}`);
      setDetail(res);
      setOverallFeedback(res.result?.overallFeedback || '');
      const initGrades: Record<string, { marks: number; feedback: string }> = {};
      for (const q of res.questions) {
        if (q.questionType === 'short_answer' || q.questionType === 'long_answer') {
          const ans = res.attempt.answers[q.id];
          initGrades[q.id] = {
            marks: ans?.awardedMarks ?? 0,
            feedback: ans?.teacherFeedback || '',
          };
        }
      }
      setGrades(initGrades);
    } catch (err) {
      notify('error', 'Failed to open submission', err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveEvaluation = async (publishNow: boolean) => {
    if (!detail) return;
    setSavingEval(true);
    try {
      const gradeEntries = Object.entries(grades).map(([questionId, val]) => ({
        questionId,
        awardedMarks: Number(val.marks),
        teacherFeedback: val.feedback,
      }));
      await apiRequest(`/api/attempts/submissions/${detail.attempt.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          grades: gradeEntries,
          overallFeedback,
          publishNow,
        }),
      });
      notify(
        'success',
        publishNow ? 'Evaluation saved & result published' : 'Evaluation saved',
        publishNow ? 'Student has been notified immediately.' : 'You can publish when ready.'
      );
      setDetail(null);
      await loadList();
    } catch (err) {
      notify('error', 'Evaluation failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSavingEval(false);
    }
  };

  const handlePublishSingle = async (resultId: string) => {
    try {
      await apiRequest(`/api/results/${resultId}/publish`, { method: 'POST' });
      notify('success', 'Result published to student');
      await loadList();
    } catch (err) {
      notify('error', 'Could not publish', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Submissions &amp; Subjective Evaluation
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Review student attempts, grade subjective responses, attach faculty feedback, and publish official scores.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadCsvReport('/api/results/export/csv', 'examvault-submissions-report.csv').catch(() =>
              notify('error', 'CSV download failed')
            )
          }
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11182D] hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>Download CSV Report</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
        {(
          [
            ['', 'All Submissions'],
            ['pending_evaluation', 'Pending Grading'],
            ['evaluated', 'Evaluated (Unpublished)'],
            ['published', 'Published'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val || 'all'}
            type="button"
            onClick={() => setStatusFilter(val)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              statusFilter === val
                ? 'bg-white dark:bg-[#11182D] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" />}
          title="No submissions in this queue"
          description="Submitted student examinations for your courses will appear here."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5 font-medium">Student</th>
                <th className="px-5 py-3.5 font-medium">Examination</th>
                <th className="px-5 py-3.5 font-medium text-right">Score</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium text-right">Signals</th>
                <th className="px-5 py-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {rows.map((row) => (
                <tr key={row.attemptId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{row.studentName}</p>
                    <p className="text-xs text-slate-500 font-mono">{row.rollNumber || row.studentEmail}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{row.examTitle}</p>
                    <p className="text-xs text-slate-500">{row.subject}</p>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                    {row.result ? (
                      <>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {row.result.obtainedMarks}/{row.result.totalMarks}
                        </span>
                        <span className="block text-xs text-slate-500">{row.result.percentage}%</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-semibold">
                    {row.result?.resultStatus === 'pending_evaluation' && (
                      <span className="text-amber-600 dark:text-amber-400">
                        Pending Grading ({row.result.subjectivePendingCount})
                      </span>
                    )}
                    {row.result?.resultStatus === 'evaluated' && (
                      <span className="text-indigo-600 dark:text-indigo-400">Evaluated</span>
                    )}
                    {row.result?.resultStatus === 'published' && (
                      <span className="text-emerald-600 dark:text-emerald-400">Published</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-xs">
                    {row.integritySignalCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {row.integritySignalCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-2">
                    <button
                      type="button"
                      onClick={() => void openEvaluation(row.attemptId)}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5"
                    >
                      {row.result?.resultStatus === 'pending_evaluation' ? 'Evaluate' : 'Review'}
                    </button>
                    {row.result?.resultStatus === 'evaluated' && (
                      <button
                        type="button"
                        onClick={() => void handlePublishSingle(row.result!.id)}
                        className="rounded-lg border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold px-3 py-1.5"
                      >
                        Publish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Evaluation Modal */}
      <AnimatePresence>
        {(detail || loadingDetail) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetail(null)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl space-y-5"
            >
              {loadingDetail || !detail ? (
                <p className="py-12 text-center text-sm text-slate-500">Loading submission details…</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {detail.exam.title}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {detail.student?.name} ({detail.student?.rollNumber || detail.student?.email})
                      </h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Close evaluation panel"
                      onClick={() => setDetail(null)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {detail.questions.map((q, idx) => {
                      const ans = detail.attempt.answers[q.id];
                      const isSubjective =
                        q.questionType === 'short_answer' || q.questionType === 'long_answer';
                      return (
                        <div
                          key={q.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Q{idx + 1} · {q.questionType.replace('_', ' ')}
                            </span>
                            <span className="font-mono tabular-nums">Max {q.marks} marks</span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {q.questionText}
                          </p>

                          {isSubjective ? (
                            <div className="space-y-3">
                              <div className="rounded-lg bg-slate-50 dark:bg-[#0B1020] p-3 text-sm text-slate-800 dark:text-slate-200">
                                <p className="text-[11px] font-semibold text-slate-500 mb-1">
                                  Student Response:
                                </p>
                                <p className="whitespace-pre-wrap">
                                  {ans?.textAnswer || '(No response submitted)'}
                                </p>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                <strong>Model Rubric:</strong> {String(q.correctAnswer || '')}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Awarded Marks (0 – {q.marks})
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={q.marks}
                                    step={0.5}
                                    value={grades[q.id]?.marks ?? 0}
                                    onChange={(e) =>
                                      setGrades((prev) => ({
                                        ...prev,
                                        [q.id]: {
                                          marks: Number(e.target.value),
                                          feedback: prev[q.id]?.feedback || '',
                                        },
                                      }))
                                    }
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-1.5 text-sm font-mono tabular-nums"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-xs font-semibold mb-1">
                                    Feedback for Question {idx + 1}
                                  </label>
                                  <input
                                    type="text"
                                    value={grades[q.id]?.feedback || ''}
                                    onChange={(e) =>
                                      setGrades((prev) => ({
                                        ...prev,
                                        [q.id]: {
                                          marks: prev[q.id]?.marks ?? 0,
                                          feedback: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Constructive grading notes…"
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-1.5 text-sm"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                              <p>
                                <strong>Selected:</strong>{' '}
                                {(ans?.selectedOptions || [])
                                  .map((id) => q.options.find((o) => o.id === id)?.text || id)
                                  .join(', ') || 'Unattempted'}
                              </p>
                              <p className="text-emerald-700 dark:text-emerald-400">
                                <strong>Key:</strong>{' '}
                                {(Array.isArray(q.correctAnswer)
                                  ? q.correctAnswer
                                  : [String(q.correctAnswer || '')]
                                )
                                  .map((id) => q.options.find((o) => o.id === id)?.text || id)
                                  .join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label htmlFor="overall-fb" className="block text-xs font-semibold mb-1">
                      Overall Faculty Feedback
                    </label>
                    <textarea
                      id="overall-fb"
                      rows={2}
                      value={overallFeedback}
                      onChange={(e) => setOverallFeedback(e.target.value)}
                      placeholder="Summary feedback shown on the student's published scorecard…"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setDetail(null)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={savingEval}
                      onClick={() => void handleSaveEvaluation(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 px-4 py-2 text-sm font-semibold"
                    >
                      <FileCheck className="h-4 w-4" />
                      <span>Save Draft Evaluation</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingEval}
                      onClick={() => void handleSaveEvaluation(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Save &amp; Publish Result</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

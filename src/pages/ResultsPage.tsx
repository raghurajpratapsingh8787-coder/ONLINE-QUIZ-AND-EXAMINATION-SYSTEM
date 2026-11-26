import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, Download, Eye, GraduationCap, Printer, X, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton';
import { apiRequest, ApiError, downloadCsvReport } from '../lib/api';
import type { ResultItem } from '../types';

interface ResultDetailPayload {
  result: ResultItem;
  exam: {
    id: string;
    title: string;
    subject: string;
    category: string;
    totalMarks: number;
    passingMarks: number;
    allowAnswerReview: boolean;
  };
  student: { id: string; name: string; email: string; rollNumber?: string; group?: string } | null;
  canReviewAnswers: boolean;
  reviewItems: Array<{
    questionId: string;
    questionText: string;
    questionType: string;
    options: Array<{ id: string; text: string }>;
    correctAnswer: string | string[];
    explanation: string;
    marks: number;
    studentSelectedOptions: string[];
    studentTextAnswer: string;
    awardedMarks?: number;
    teacherFeedback?: string;
  }>;
}

export function ResultsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ResultDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openDetail = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      try {
        const res = await apiRequest<ResultDetailPayload>(`/api/results/${id}`);
        setDetail(res);
      } catch (err) {
        notify('error', 'Could not open scorecard', err instanceof ApiError ? err.message : undefined);
      } finally {
        setLoadingDetail(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    let mounted = true;
    apiRequest<{ results: ResultItem[] }>('/api/results')
      .then((res) => {
        if (!mounted) return;
        setResults(res.results);
        const inspectId = searchParams.get('inspect');
        if (inspectId) {
          void openDetail(inspectId);
          searchParams.delete('inspect');
          setSearchParams(searchParams, { replace: true });
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [openDetail, searchParams, setSearchParams]);

  const avgPct =
    results.length > 0
      ? Math.round((results.reduce((s, r) => s + r.percentage, 0) / results.length) * 10) / 10
      : 0;
  const passedCount = results.filter((r) => r.passed).length;

  // Subject-wise chart aggregation
  const subjectMap = new Map<string, { sum: number; count: number }>();
  for (const r of results) {
    const subj = r.subject || 'General';
    const prev = subjectMap.get(subj) || { sum: 0, count: 0 };
    prev.sum += r.percentage;
    prev.count += 1;
    subjectMap.set(subj, prev);
  }
  const subjectChart = Array.from(subjectMap.entries()).map(([subject, s]) => ({
    subject,
    average: Math.round((s.sum / s.count) * 10) / 10,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {user?.role === 'student' ? 'My Results & Answer Review' : 'Examination Results'}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Official scorecards, subject breakdowns, permitted answer explanations, and exportable reports.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11182D] hover:bg-slate-50 dark:hover:bg-slate-800 px-3.5 py-2 text-sm font-medium whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>Print / PDF</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsvReport('/api/results/export/csv', 'examvault-results.csv').catch(() =>
                notify('error', 'Export failed')
              )
            }
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-semibold whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs text-slate-500">Published Results</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {results.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs text-slate-500">Average Percentage</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-indigo-600 dark:text-indigo-400">
            {avgPct}%
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs text-slate-500">Pass Rate</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {results.length ? Math.round((passedCount / results.length) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Subject Performance Chart */}
      {subjectChart.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
            Subject-wise Average Score (%)
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="subject" tick={{ fontSize: 12, fill: '#94A3B8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    border: '1px solid #1E293B',
                    borderRadius: '10px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="average" name="Average (%)" fill="#4F46E5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Results Table */}
      {loading ? (
        <TableSkeleton rows={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="No published results yet"
          description="Results remain private until evaluated and published by your instructor."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5 font-medium">Examination</th>
                {user?.role !== 'student' && <th className="px-5 py-3.5 font-medium">Student</th>}
                <th className="px-5 py-3.5 font-medium text-right">Marks</th>
                <th className="px-5 py-3.5 font-medium text-right">Percentage</th>
                <th className="px-5 py-3.5 font-medium text-right">Correct / Wrong</th>
                <th className="px-5 py-3.5 font-medium text-right">Status</th>
                <th className="px-5 py-3.5 font-medium text-right no-print">Scorecard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {results.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{r.examTitle}</p>
                    <p className="text-xs text-slate-500">{r.subject}</p>
                  </td>
                  {user?.role !== 'student' && (
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{r.studentName}</p>
                      <p className="text-xs text-slate-500 font-mono">{r.rollNumber || r.studentEmail}</p>
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold">
                    {r.obtainedMarks}/{r.totalMarks}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                    {r.percentage}%
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                    {r.correctCount} / {r.incorrectCount}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        r.passed
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {r.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {r.passed ? 'Passed' : 'Failed'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right no-print">
                    <button
                      type="button"
                      onClick={() => void openDetail(r.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detailed Scorecard & Answer Review Modal */}
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
              className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl space-y-6"
            >
              {loadingDetail || !detail ? (
                <p className="py-12 text-center text-sm text-slate-500">Loading detailed scorecard…</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        Official Scorecard · {detail.exam.subject}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {detail.exam.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {detail.student?.name} · {detail.student?.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close scorecard"
                      onClick={() => setDetail(null)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Score Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 dark:bg-[#0B1020] p-4">
                    <div>
                      <p className="text-xs text-slate-500">Obtained</p>
                      <p className="mt-1 font-mono tabular-nums text-lg font-bold">
                        {detail.result.obtainedMarks}/{detail.result.totalMarks}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Percentage</p>
                      <p className="mt-1 font-mono tabular-nums text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {detail.result.percentage}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Time Taken</p>
                      <p className="mt-1 font-mono tabular-nums text-lg font-bold">
                        {Math.max(1, Math.round(detail.result.timeTakenSeconds / 60))}m
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Outcome</p>
                      <p
                        className={`mt-1 text-lg font-bold ${
                          detail.result.passed
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {detail.result.passed ? 'PASSED' : 'FAILED'}
                      </p>
                    </div>
                  </div>

                  {detail.result.overallFeedback && (
                    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 text-sm text-slate-700 dark:text-slate-200">
                      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
                        Faculty Feedback
                      </p>
                      {detail.result.overallFeedback}
                    </div>
                  )}

                  {detail.canReviewAnswers ? (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Answer Review &amp; Explanations
                      </h4>
                      {detail.reviewItems.map((item, idx) => {
                        const formatOpt = (id: string) =>
                          item.options.find((o) => o.id === id)?.text || id;
                        return (
                          <div
                            key={item.questionId}
                            className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-sm"
                          >
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                Q{idx + 1}
                              </span>
                              <span className="font-mono tabular-nums">{item.marks} marks</span>
                            </div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {item.questionText}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              <strong>Your Answer: </strong>
                              {item.studentTextAnswer
                                ? item.studentTextAnswer
                                : item.studentSelectedOptions.length > 0
                                ? item.studentSelectedOptions.map(formatOpt).join(', ')
                                : 'Unattempted'}
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400">
                              <strong>Correct Answer: </strong>
                              {Array.isArray(item.correctAnswer)
                                ? item.correctAnswer.map(formatOpt).join(', ')
                                : formatOpt(item.correctAnswer)}
                            </p>
                            {item.explanation && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                <strong>Explanation: </strong>
                                {item.explanation}
                              </p>
                            )}
                            {item.teacherFeedback && (
                              <p className="text-xs text-indigo-600 dark:text-indigo-400">
                                <strong>Instructor Note ({item.awardedMarks ?? 0}/{item.marks}): </strong>
                                {item.teacherFeedback}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Answer review is disabled for this examination.
                    </p>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

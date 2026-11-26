import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Bell, Calendar, CheckCircle2, Clock, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { DashboardSkeleton, EmptyState } from '../components/ui/Skeleton';
import type { Exam, ResultItem } from '../types';

interface StudentAnalytics {
  stats: {
    activeExams: number;
    upcomingExams: number;
    completedAttempts: number;
    publishedResults: number;
    averagePercentage: number;
    passedCount: number;
  };
  charts: {
    performanceHistory: Array<{ exam: string; percentage: number; obtained: number; total: number }>;
  };
}

export function StudentDashboard() {
  const { user, notifications } = useAuth();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState<StudentAnalytics | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiRequest<StudentAnalytics>('/api/analytics/dashboard'),
      apiRequest<{ exams: Exam[] }>('/api/exams'),
      apiRequest<{ results: ResultItem[] }>('/api/results'),
    ])
      .then(([a, e, r]) => {
        if (!mounted) return;
        setAnalytics(a);
        setExams(e.exams);
        setResults(r.results);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !analytics) return <DashboardSkeleton />;

  const activeExams = exams.filter((e) => e.status === 'active');
  const upcomingExams = exams.filter((e) => e.status === 'scheduled');
  const completedExams = exams.filter((e) => e.status === 'completed' || e.status === 'published');

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {user?.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {user?.department} {user?.group ? `· Cohort ${user.group}` : ''}{' '}
            {user?.rollNumber ? `· Roll ${user.rollNumber}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/exams')}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 transition-colors whitespace-nowrap shrink-0"
        >
          <span>Browse All Exams</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Exams</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-indigo-600 dark:text-indigo-400">
            {analytics.stats.activeExams}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Available to attempt now</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Upcoming Exams</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {analytics.stats.upcomingExams}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Scheduled in your cohort</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed Attempts</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {analytics.stats.completedAttempts}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {analytics.stats.publishedResults} published result(s)
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Average Score</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {analytics.stats.averagePercentage}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {analytics.stats.passedCount} passed assessment(s)
          </p>
        </div>
      </div>

      {/* Currently Active Examinations */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Currently Active Examinations
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Server time validated
          </span>
        </div>

        {activeExams.length === 0 ? (
          <EmptyState
            title="No active examinations right now"
            description="Check your upcoming schedule below or review your published results."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeExams.map((exam) => (
              <div
                key={exam.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {exam.subject} · {exam.category} · {exam.questionCount} questions
                  </p>
                  <h4 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                    {exam.title}
                  </h4>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {exam.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-indigo-500" />
                      {exam.duration}m
                    </span>
                    <span>{exam.totalMarks} marks</span>
                    <span>
                      Attempts: {exam.attemptsUsed ?? 0}/{exam.settings.maxAttempts}
                    </span>
                  </div>

                  {exam.inProgressAttemptId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/exam/${exam.id}/take`)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3.5 py-2 whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Resume Exam</span>
                    </button>
                  ) : exam.eligibility?.eligible ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/exams?inspect=${exam.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Start Exam</span>
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {exam.eligibility?.reason || 'Completed'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming + Recent Results + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Performance Overview
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Score progression across published examinations
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/results')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View All Results
            </button>
          </div>
          {analytics.charts.performanceHistory.length === 0 ? (
            <EmptyState
              title="No published results yet"
              description="Once your submitted examinations are evaluated and published, your score trend will appear here."
            />
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.charts.performanceHistory}>
                  <defs>
                    <linearGradient id="studentPerfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                  <XAxis dataKey="exam" tick={{ fontSize: 11, fill: '#94A3B8' }} />
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
                  <Area
                    type="monotone"
                    dataKey="percentage"
                    name="Score (%)"
                    stroke="#4F46E5"
                    strokeWidth={2.5}
                    fill="url(#studentPerfGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Upcoming Schedule
            </h3>
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingExams.slice(0, 3).map((exam) => (
                <div key={exam.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {exam.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <Calendar className="h-3 w-3" />
                      <span className="font-mono tabular-nums">
                        {new Date(exam.startTime).toLocaleString()}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {exam.duration}m
                  </span>
                </div>
              ))}
              {upcomingExams.length === 0 && (
                <p className="py-3 text-xs text-slate-500">No upcoming scheduled exams.</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Recent Notifications
              </h3>
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View all
              </button>
            </div>
            <div className="mt-3 space-y-2.5">
              {notifications.slice(0, 3).map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 text-xs">
                  <Bell className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {n.title}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 line-clamp-1">{n.message}</p>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-xs text-slate-500">No notifications yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Recent Results & Completed Exams */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Recent Published Results &amp; Completed Exams
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {completedExams.length} completed · {results.length} published
          </span>
        </div>
        {results.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No published results available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="pb-2.5 font-medium">Examination</th>
                  <th className="pb-2.5 font-medium">Subject</th>
                  <th className="pb-2.5 font-medium text-right">Score</th>
                  <th className="pb-2.5 font-medium text-right">Percentage</th>
                  <th className="pb-2.5 font-medium text-right">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {results.slice(0, 5).map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/results?inspect=${r.id}`)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 font-medium text-slate-900 dark:text-slate-100">
                      {r.examTitle}
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-400">{r.subject}</td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {r.obtainedMarks}/{r.totalMarks}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums font-semibold">
                      {r.percentage}%
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          r.passed
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {r.passed ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

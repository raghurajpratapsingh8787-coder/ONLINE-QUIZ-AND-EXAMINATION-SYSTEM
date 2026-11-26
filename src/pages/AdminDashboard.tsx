import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Plus, Settings, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import type { AuditLogItem } from '../types';

interface AdminDashboardData {
  stats: {
    totalStudents: number;
    totalTeachers: number;
    totalExams: number;
    activeExams: number;
    upcomingExams: number;
    completedExams: number;
    totalQuestions: number;
    averageStudentScore: number;
    openIncidents: number;
  };
  charts: {
    registrationGrowth: Array<{ month: string; totalStudents: number }>;
    participationData: Array<{ exam: string; participants: number; avgScore: number }>;
    passFailData: Array<{ name: string; value: number }>;
    subjectPerformance: Array<{
      subject: string;
      averagePercentage: number;
      passRate: number;
      submissions: number;
    }>;
  };
  recentActivity: AuditLogItem[];
}

const PASS_FAIL_COLORS = ['#16A34A', '#DC2626'];

export function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    apiRequest<AdminDashboardData>('/api/analytics/dashboard')
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load analytics.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-5 text-sm text-rose-700 dark:text-rose-300">
        {error || 'Unable to load dashboard.'}
      </div>
    );
  }

  const { stats, charts, recentActivity } = data;

  const kpis = [
    { label: 'Total Students', value: stats.totalStudents, sub: 'Registered active & cohort' },
    { label: 'Total Teachers', value: stats.totalTeachers, sub: 'Authorized faculty examiners' },
    { label: 'Total Examinations', value: stats.totalExams, sub: `${stats.activeExams} active · ${stats.upcomingExams} upcoming` },
    { label: 'Completed Exams', value: stats.completedExams, sub: 'Evaluated or published' },
    { label: 'Question Bank', value: stats.totalQuestions, sub: 'Across all 5 question formats' },
    { label: 'Average Score', value: `${stats.averageStudentScore}%`, sub: 'Platform evaluated mean' },
    { label: 'Active Now', value: stats.activeExams, sub: 'Open student exam windows' },
    { label: 'Open Incidents', value: stats.openIncidents, sub: 'Flagged for admin review' },
  ];

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Platform Administration Overview
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Live institutional telemetry computed from verified examination and user records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/exams')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Manage Exams</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11182D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium px-4 py-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Settings className="h-4 w-4" />
            <span>Platform Settings</span>
          </button>
        </div>
      </div>

      {/* 8 Live KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <p className="mt-2 font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {kpi.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Student Registration Growth */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Student Registration Growth
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cumulative enrolled students by registration month
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.registrationGrowth}>
                <defs>
                  <linearGradient id="studentGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
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
                  dataKey="totalStudents"
                  name="Enrolled Students"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  fill="url(#studentGrowthGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Examination Participation & Average Marks */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Examination Participation &amp; Average Score (%)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Submitted attempts and average score per examination
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.participationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="exam" tick={{ fontSize: 11, fill: '#94A3B8' }} interval={0} />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} />
                <Tooltip
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload as { fullTitle?: string } | undefined;
                    return item?.fullTitle || String(label);
                  }}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    border: '1px solid #1E293B',
                    borderRadius: '10px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="avgScore" name="Avg Score (%)" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="participants" name="Submissions" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Pass/Fail + Subject Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Pass vs. Fail Distribution
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Evaluated examination outcomes
          </p>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.passFailData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={4}
                >
                  {charts.passFailData.map((entry, idx) => (
                    <Cell key={entry.name} fill={PASS_FAIL_COLORS[idx % PASS_FAIL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 text-xs mt-2">
            {charts.passFailData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: PASS_FAIL_COLORS[idx] }}
                />
                <span className="text-slate-600 dark:text-slate-300">
                  {item.name}: <strong className="font-mono tabular-nums">{item.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Subject-wise Performance
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Average score and pass rate by academic discipline
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/analytics')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="pb-2.5 font-medium">Subject</th>
                  <th className="pb-2.5 font-medium text-right">Submissions</th>
                  <th className="pb-2.5 font-medium text-right">Avg Score</th>
                  <th className="pb-2.5 font-medium text-right">Pass Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {charts.subjectPerformance.map((row) => (
                  <tr key={row.subject} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.subject}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {row.submissions}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {row.averagePercentage}%
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {row.passRate}%
                    </td>
                  </tr>
                ))}
                {charts.subjectPerformance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-slate-500">
                      No evaluated subject results yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Recent Platform Activity */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Examination &amp; Security Activity
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Server-recorded audit events across authentication, examinations, and publishing
            </p>
          </div>
          {stats.openIncidents > 0 && (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Review {stats.openIncidents} incident(s)</span>
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {recentActivity.map((log) => (
            <div
              key={log.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {log.action.replace(/_/g, ' ')}
                </span>
                <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {log.actorEmail} ({log.actorRole})
                </span>
              </div>
              <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

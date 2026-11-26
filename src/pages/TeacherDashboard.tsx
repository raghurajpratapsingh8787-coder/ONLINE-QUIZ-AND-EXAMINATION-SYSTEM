import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, BookOpen, ClipboardCheck, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { DashboardSkeleton, EmptyState } from '../components/ui/Skeleton';

interface TeacherDashboardData {
  stats: {
    createdExams: number;
    totalParticipants: number;
    pendingEvaluations: number;
    publishedResults: number;
    averageStudentPerformance: number;
    totalQuestions: number;
  };
  charts: {
    examBreakdown: Array<{
      examId: string;
      title: string;
      submissions: number;
      averagePercentage: number;
      status: string;
    }>;
  };
}

export function TeacherDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiRequest<TeacherDashboardData>('/api/analytics/dashboard')
      .then((res) => mounted && setData(res))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !data) return <DashboardSkeleton />;

  const { stats, charts } = data;

  const kpis = [
    { label: 'Created Examinations', value: stats.createdExams, sub: 'Your authored assessments' },
    { label: 'Total Participants', value: stats.totalParticipants, sub: 'Unique students submitted' },
    { label: 'Pending Evaluations', value: stats.pendingEvaluations, sub: 'Subjective answers awaiting marks' },
    { label: 'Published Results', value: stats.publishedResults, sub: 'Visible to assigned students' },
    { label: 'Average Performance', value: `${stats.averageStudentPerformance}%`, sub: 'Mean score across graded exams' },
    { label: 'Question Bank Size', value: stats.totalQuestions, sub: 'Questions authored by you' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Faculty Examination Workspace</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Author assessments, curate question banks, evaluate subjective responses, and publish scores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/exams?create=1')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Create Exam</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/questions')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11182D] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium px-4 py-2 transition-colors whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-4 w-4" />
            <span>Question Bank</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <p className="mt-2 font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {kpi.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {stats.pendingEvaluations > 0 && (
        <div className="rounded-xl border border-amber-300/70 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {stats.pendingEvaluations} submission(s) waiting for subjective evaluation
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Review written student answers, assign marks and written feedback, and publish final results.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/submissions')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 whitespace-nowrap shrink-0"
          >
            <span>Open Grading Queue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Performance Chart */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Your Examinations Overview
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Average percentage score and total submissions per authored examination
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/submissions')}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          >
            <span>All Submissions</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {charts.examBreakdown.length === 0 ? (
          <EmptyState
            title="No examinations authored yet"
            description="Create your first examination from your question bank to see performance insights."
          />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.examBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="title" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    border: '1px solid #1E293B',
                    borderRadius: '10px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="averagePercentage" name="Average Score (%)" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="submissions" name="Submissions" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

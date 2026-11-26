import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import { apiRequest, downloadCsvReport } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import type { ResultItem } from '../types';

export function AnalyticsPage() {
  const { notify } = useToast();
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiRequest<{ results: ResultItem[] }>('/api/results')
      .then((res) => mounted && setResults(res.results))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <DashboardSkeleton />;

  // Score distribution histogram (0-40, 40-60, 60-80, 80-100)
  const buckets = [
    { band: '0–39%', count: 0 },
    { band: '40–59%', count: 0 },
    { band: '60–79%', count: 0 },
    { band: '80–100%', count: 0 },
  ];
  for (const r of results) {
    if (r.percentage < 40) buckets[0].count++;
    else if (r.percentage < 60) buckets[1].count++;
    else if (r.percentage < 80) buckets[2].count++;
    else buckets[3].count++;
  }

  // Group / cohort breakdown
  const groupStats = new Map<string, { sum: number; count: number; passed: number }>();
  for (const r of results) {
    const g = r.group || 'Unassigned';
    const prev = groupStats.get(g) || { sum: 0, count: 0, passed: 0 };
    prev.sum += r.percentage;
    prev.count += 1;
    if (r.passed) prev.passed += 1;
    groupStats.set(g, prev);
  }
  const cohortChart = Array.from(groupStats.entries()).map(([group, s]) => ({
    group,
    avgScore: Math.round((s.sum / s.count) * 10) / 10,
    passRate: Math.round((s.passed / s.count) * 100),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Institutional Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Score distribution bands and cohort-level examination performance metrics.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadCsvReport('/api/results/export/csv', 'examvault-analytics-export.csv').catch(() =>
              notify('error', 'Failed to export analytics CSV')
            )
          }
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>Export Raw Results CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            Score Band Distribution
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Number of evaluated submissions across percentage brackets
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="band" tick={{ fontSize: 12, fill: '#94A3B8' }} />
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
                <Bar dataKey="count" name="Submissions" fill="#4F46E5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            Cohort Performance &amp; Pass Rate (%)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Comparison of average score and pass percentage by student group
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cohortChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.18} />
                <XAxis dataKey="group" tick={{ fontSize: 12, fill: '#94A3B8' }} />
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
                <Bar dataKey="avgScore" name="Avg Score (%)" fill="#2563EB" radius={[6, 6, 0, 0]} />
                <Bar dataKey="passRate" name="Pass Rate (%)" fill="#16A34A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

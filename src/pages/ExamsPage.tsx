import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton';
import { apiRequest, ApiError } from '../lib/api';
import type { Exam, ExamStatus, Question } from '../types';

const STATUS_STYLE: Record<ExamStatus, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  scheduled: 'text-indigo-600 dark:text-indigo-400',
  published: 'text-blue-600 dark:text-blue-400',
  completed: 'text-slate-600 dark:text-slate-400',
  draft: 'text-amber-600 dark:text-amber-400',
  cancelled: 'text-rose-600 dark:text-rose-400',
};

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExamsPage() {
  const { user, settings } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [exams, setExams] = useState<Exam[]>([]);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Student instructions modal
  const [inspectExam, setInspectExam] = useState<Exam | null>(null);

  // Teacher/Admin exam builder modal
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [deleting, setDeleting] = useState(false);

  const subjects = settings?.subjects || ['Computer Science', 'Database Systems', 'Mathematics', 'Electrical Engineering'];
  const categories = settings?.categories || ['Midterm', 'Final', 'Quiz', 'Practice'];
  const groups = settings?.studentGroups || ['CS-2026', 'EE-2026', 'ME-2026', 'DS-2026'];

  const createDefaultForm = () => {
    const now = Date.now();
    return {
      title: '',
      description: '',
      subject: subjects[0],
      category: categories[0],
      assignedGroups: [groups[0]],
      questionIds: [] as string[],
      duration: settings?.defaultExamDuration || 45,
      totalMarks: 20,
      passingMarks: 10,
      startTime: toLocalDateTimeInput(new Date(now - 10 * 60 * 1000).toISOString()),
      endTime: toLocalDateTimeInput(new Date(now + 24 * 3600 * 1000).toISOString()),
      instructions:
        '1. Read every question carefully.\n2. Answers are saved automatically.\n3. Exam submits automatically when the server timer reaches zero.',
      status: 'active' as ExamStatus,
      settings: {
        randomizeQuestions: false,
        randomizeOptions: false,
        negativeMarking: false,
        maxAttempts: 1,
        publishResultsImmediately: false,
        allowAnswerReview: true,
        tabSwitchMonitoring: true,
      },
    };
  };

  const [form, setForm] = useState(createDefaultForm);

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (statusFilter) qs.set('status', statusFilter);
      const res = await apiRequest<{ exams: Exam[] }>(`/api/exams?${qs.toString()}`);
      setExams(res.exams);

      const inspectId = searchParams.get('inspect');
      if (inspectId) {
        const match = res.exams.find((e) => e.id === inspectId);
        if (match) setInspectExam(match);
      }
    } catch (err) {
      notify('error', 'Failed to load examinations', err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, notify, searchParams]);

  useEffect(() => {
    void fetchExams();
  }, [fetchExams]);

  useEffect(() => {
    if (!isStaff) return;
    apiRequest<{ questions: Question[] }>('/api/questions')
      .then((r) => setBankQuestions(r.questions))
      .catch(() => {});
  }, [isStaff]);

  useEffect(() => {
    if (isStaff && searchParams.get('create') === '1') {
      setEditingId(null);
      setForm(createDefaultForm());
      setBuilderOpen(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  const openCreate = () => {
    setEditingId(null);
    setForm(createDefaultForm());
    setBuilderOpen(true);
  };

  const openEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      description: exam.description,
      subject: exam.subject,
      category: exam.category,
      assignedGroups: exam.assignedGroups,
      questionIds: exam.questionIds,
      duration: exam.duration,
      totalMarks: exam.totalMarks,
      passingMarks: exam.passingMarks,
      startTime: toLocalDateTimeInput(exam.startTime),
      endTime: toLocalDateTimeInput(exam.endTime),
      instructions: exam.instructions,
      status: exam.status,
      settings: { ...exam.settings },
    });
    setBuilderOpen(true);
  };

  const toggleQuestionSelection = (qid: string) => {
    setForm((prev) => {
      const exists = prev.questionIds.includes(qid);
      const nextIds = exists ? prev.questionIds.filter((id) => id !== qid) : [...prev.questionIds, qid];
      const computedTotal = nextIds.reduce((sum, id) => {
        const q = bankQuestions.find((item) => item.id === id);
        return sum + (q?.marks || 0);
      }, 0);
      return {
        ...prev,
        questionIds: nextIds,
        totalMarks: computedTotal > 0 ? computedTotal : prev.totalMarks,
        passingMarks: computedTotal > 0 ? Math.min(prev.passingMarks, Math.ceil(computedTotal * 0.4)) : prev.passingMarks,
      };
    });
  };

  const toggleGroup = (g: string) => {
    setForm((prev) => ({
      ...prev,
      assignedGroups: prev.assignedGroups.includes(g)
        ? prev.assignedGroups.filter((x) => x !== g)
        : [...prev.assignedGroups, g],
    }));
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.questionIds.length === 0) {
      notify('warning', 'Select at least one question from the question bank.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        assignedStudentIds: [],
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      };
      if (editingId) {
        await apiRequest(`/api/exams/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', 'Examination updated');
      } else {
        await apiRequest('/api/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', 'Examination created and assigned students notified');
      }
      setBuilderOpen(false);
      await fetchExams();
    } catch (err) {
      notify('error', 'Failed to save examination', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/exams/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', 'Examination deleted');
      setDeleteTarget(null);
      await fetchExams();
    } catch (err) {
      notify('error', 'Could not delete exam', err instanceof ApiError ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const handlePublishExamResults = async (exam: Exam) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/results/publish/exam/${exam.id}`, {
        method: 'POST',
      });
      notify('success', 'Results published', res.message);
      await fetchExams();
    } catch (err) {
      notify('error', 'Publish blocked', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Examinations</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isStaff
              ? 'Schedule assessments, configure negative marking and randomization, and publish evaluated scores.'
              : 'View your assigned examinations, review instructions, and launch active assessments.'}
          </p>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Create Examination</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search examinations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by examination title or subject…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 overflow-x-auto">
          {(['', 'active', 'scheduled', 'published', 'draft'] as const).map((st) => (
            <button
              key={st || 'all'}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize whitespace-nowrap shrink-0 transition-colors ${
                statusFilter === st
                  ? 'bg-white dark:bg-[#11182D] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="No examinations match this view"
          description={
            isStaff
              ? 'Create a new examination and assign questions from your question bank.'
              : 'No examinations are currently assigned under this filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {exams.map((exam) => (
            <article
              key={exam.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    {exam.subject} · {exam.category} · {exam.questionCount ?? exam.questionIds.length} Qs
                  </span>
                  <span className={`font-semibold capitalize whitespace-nowrap shrink-0 ${STATUS_STYLE[exam.status]}`}>
                    {exam.status}
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                  {exam.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {exam.description}
                </p>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{exam.duration} mins</span>
                  </div>
                  <div>
                    Marks: <strong>{exam.totalMarks}</strong> (Pass {exam.passingMarks})
                  </div>
                  <div className="col-span-2 sm:col-span-1 truncate">
                    Groups: {exam.assignedGroups.join(', ') || 'All'}
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono tabular-nums truncate">
                    {new Date(exam.startTime).toLocaleString()} — {new Date(exam.endTime).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                {isStaff ? (
                  <>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {exam.submissionCount ?? 0} submission(s)
                    </span>
                    <div className="flex items-center gap-2">
                      {exam.status !== 'published' && (exam.submissionCount ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => handlePublishExamResults(exam)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 whitespace-nowrap"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Publish Results</span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Edit ${exam.title}`}
                        onClick={() => openEdit(exam)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${exam.title}`}
                        onClick={() => setDeleteTarget(exam)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Attempts: {exam.attemptsUsed ?? 0}/{exam.settings.maxAttempts}
                      {exam.settings.negativeMarking ? ' · Negative marking ON' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      {exam.hasPublishedResult && exam.publishedResultId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/results?inspect=${exam.publishedResultId}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span>View Result</span>
                        </button>
                      )}
                      {exam.inProgressAttemptId ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/exam/${exam.id}/take`)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3.5 py-2 whitespace-nowrap"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Resume Exam</span>
                        </button>
                      ) : exam.eligibility?.eligible ? (
                        <button
                          type="button"
                          onClick={() => setInspectExam(exam)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 whitespace-nowrap"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>View Instructions &amp; Start</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {exam.eligibility?.reason || 'Not open'}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Student Pre-Exam Instructions Modal */}
      <AnimatePresence>
        {inspectExam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectExam(null)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    Examination Briefing · {inspectExam.subject}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    {inspectExam.title}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close instructions"
                  onClick={() => setInspectExam(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 dark:bg-[#0B1020] p-4 text-center">
                <div>
                  <p className="text-xs text-slate-500">Duration</p>
                  <p className="mt-0.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {inspectExam.duration} min
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Marks</p>
                  <p className="mt-0.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {inspectExam.totalMarks}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Negative Marking</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900 dark:text-white">
                    {inspectExam.settings.negativeMarking ? 'Enabled' : 'None'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Instructions &amp; Integrity Notice
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                  {inspectExam.instructions}
                </p>
                {inspectExam.settings.tabSwitchMonitoring && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2 pt-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                    <span>
                      Transparency notice: Switching browser tabs is recorded as an advisory integrity signal for faculty review, and server time strictly enforces your submission deadline.
                    </span>
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInspectExam(null)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = inspectExam.id;
                    setInspectExam(null);
                    navigate(`/exam/${targetId}/take`);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2"
                >
                  <Play className="h-4 w-4" />
                  <span>Begin Examination</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Teacher/Admin Exam Builder Modal */}
      <AnimatePresence>
        {builderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBuilderOpen(false)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="relative z-10 w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingId ? 'Edit Examination' : 'Create New Examination'}
                </h3>
                <button
                  type="button"
                  aria-label="Close exam builder"
                  onClick={() => setBuilderOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveExam} className="mt-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="ex-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Examination Title
                    </label>
                    <input
                      id="ex-title"
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g., CS-402 Operating Systems Midterm"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="ex-desc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Description
                    </label>
                    <textarea
                      id="ex-desc"
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="ex-subject" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Subject
                    </label>
                    <select
                      id="ex-subject"
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    >
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ex-category" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Category &amp; Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        id="ex-category"
                        value={form.category}
                        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-2.5 py-2 text-sm"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Examination status"
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ExamStatus }))}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-2.5 py-2 text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="active">Active</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ex-start" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Start Date &amp; Time
                    </label>
                    <input
                      id="ex-start"
                      type="datetime-local"
                      required
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="ex-end" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      End Date &amp; Time
                    </label>
                    <input
                      id="ex-end"
                      type="datetime-local"
                      required
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="ex-duration" className="block text-xs font-semibold mb-1">
                      Duration (mins)
                    </label>
                    <input
                      id="ex-duration"
                      type="number"
                      min={5}
                      max={360}
                      required
                      value={form.duration}
                      onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="ex-total" className="block text-xs font-semibold mb-1">
                      Total Marks
                    </label>
                    <input
                      id="ex-total"
                      type="number"
                      min={1}
                      required
                      value={form.totalMarks}
                      onChange={(e) => setForm((f) => ({ ...f, totalMarks: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="ex-pass" className="block text-xs font-semibold mb-1">
                      Passing Marks
                    </label>
                    <input
                      id="ex-pass"
                      type="number"
                      min={0}
                      required
                      value={form.passingMarks}
                      onChange={(e) => setForm((f) => ({ ...f, passingMarks: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="ex-attempts" className="block text-xs font-semibold mb-1">
                      Max Attempts
                    </label>
                    <input
                      id="ex-attempts"
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={form.settings.maxAttempts}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          settings: { ...f.settings, maxAttempts: Number(e.target.value) },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>

                {/* Assigned Groups */}
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Assigned Student Groups / Cohorts
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => {
                      const active = form.assignedGroups.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleGroup(g)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Question Picker */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Select Questions from Bank ({form.questionIds.length} selected)
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {bankQuestions.map((q) => {
                      const checked = form.questionIds.includes(q.id);
                      return (
                        <label
                          key={q.id}
                          className="flex items-start gap-3 p-3 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestionSelection(q.id)}
                            className="mt-0.5 h-4 w-4 accent-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                              {q.questionText}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {q.subject} · {q.questionType.replace('_', ' ')} · {q.marks} marks
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Rule Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  {(
                    [
                      ['randomizeQuestions', 'Randomize question order'],
                      ['randomizeOptions', 'Randomize answer options'],
                      ['negativeMarking', 'Enable negative marking'],
                      ['publishResultsImmediately', 'Publish objective results immediately'],
                      ['allowAnswerReview', 'Allow answer explanation review after publishing'],
                      ['tabSwitchMonitoring', 'Record transparent tab-switch integrity signals'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.settings[key]}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            settings: { ...f.settings, [key]: e.target.checked },
                          }))
                        }
                        className="h-4 w-4 accent-indigo-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <label htmlFor="ex-instr" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Examination Instructions
                  </label>
                  <textarea
                    id="ex-instr"
                    rows={3}
                    value={form.instructions}
                    onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setBuilderOpen(false)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : editingId ? 'Update Examination' : 'Create Examination'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete examination?"
        description={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete Exam"
        destructive
        loading={deleting}
        onConfirm={handleDeleteExam}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

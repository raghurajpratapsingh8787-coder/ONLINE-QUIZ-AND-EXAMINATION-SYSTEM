import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Eye,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton';
import { apiRequest, ApiError } from '../lib/api';
import type { DifficultyLevel, Question, QuestionOption, QuestionType } from '../types';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  multi_select: 'Multiple Select',
  true_false: 'True / False',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
};

const IMPORT_TEMPLATE_SAMPLE = JSON.stringify(
  [
    {
      questionText: 'Which HTTP status code indicates an unauthorized request?',
      questionType: 'mcq',
      subject: 'Computer Science',
      topic: 'HTTP Protocol',
      category: 'Web Engineering',
      difficulty: 'easy',
      options: [
        { id: 'opt-a', text: '401 Unauthorized' },
        { id: 'opt-b', text: '200 OK' },
        { id: 'opt-c', text: '404 Not Found' },
        { id: 'opt-d', text: '500 Internal Server Error' },
      ],
      correctAnswer: 'opt-a',
      marks: 4,
      negativeMarks: 1,
      explanation: '401 indicates missing or invalid authentication credentials.',
    },
  ],
  null,
  2
);

interface QuestionFormState {
  questionText: string;
  questionType: QuestionType;
  subject: string;
  topic: string;
  category: string;
  difficulty: DifficultyLevel;
  options: QuestionOption[];
  correctAnswer: string | string[];
  marks: number;
  negativeMarks: number;
  explanation: string;
  imageUrl: string;
}

const defaultQuestionForm = (defaultSubject = 'Computer Science'): QuestionFormState => ({
  questionText: '',
  questionType: 'mcq',
  subject: defaultSubject,
  topic: '',
  category: 'Midterm',
  difficulty: 'medium',
  options: [
    { id: 'opt-a', text: '' },
    { id: 'opt-b', text: '' },
    { id: 'opt-c', text: '' },
    { id: 'opt-d', text: '' },
  ],
  correctAnswer: 'opt-a',
  marks: 4,
  negativeMarks: 1,
  explanation: '',
  imageUrl: '',
});

export function QuestionBankPage() {
  const { settings } = useAuth();
  const { notify } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionFormState>(() => defaultQuestionForm());
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState(IMPORT_TEMPLATE_SAMPLE);
  const [importing, setImporting] = useState(false);

  const subjects = settings?.subjects || [
    'Computer Science',
    'Database Systems',
    'Mathematics',
    'Electrical Engineering',
  ];
  const categories = settings?.categories || ['Midterm', 'Final', 'Quiz', 'Practice'];

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (subjectFilter) qs.set('subject', subjectFilter);
      if (difficultyFilter) qs.set('difficulty', difficultyFilter);
      if (typeFilter) qs.set('type', typeFilter);
      const res = await apiRequest<{ questions: Question[] }>(`/api/questions?${qs.toString()}`);
      setQuestions(res.questions);
    } catch (err) {
      notify('error', 'Failed to load questions', err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [search, subjectFilter, difficultyFilter, typeFilter, notify]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(defaultQuestionForm(subjects[0]));
    setModalOpen(true);
  };

  const openEditModal = (q: Question) => {
    setEditingId(q.id);
    setForm({
      questionText: q.questionText,
      questionType: q.questionType,
      subject: q.subject,
      topic: q.topic || '',
      category: q.category || 'Midterm',
      difficulty: q.difficulty,
      options:
        q.options.length > 0
          ? q.options
          : q.questionType === 'true_false'
          ? [
              { id: 'true', text: 'True' },
              { id: 'false', text: 'False' },
            ]
          : [],
      correctAnswer: q.correctAnswer ?? '',
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation || '',
      imageUrl: q.imageUrl || '',
    });
    setModalOpen(true);
  };

  const handleTypeChange = (nextType: QuestionType) => {
    if (nextType === 'true_false') {
      setForm((f) => ({
        ...f,
        questionType: nextType,
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correctAnswer: 'true',
      }));
    } else if (nextType === 'mcq') {
      setForm((f) => ({
        ...f,
        questionType: nextType,
        options:
          f.options.length >= 2 && f.questionType !== 'true_false'
            ? f.options
            : [
                { id: 'opt-a', text: '' },
                { id: 'opt-b', text: '' },
                { id: 'opt-c', text: '' },
                { id: 'opt-d', text: '' },
              ],
        correctAnswer: 'opt-a',
      }));
    } else if (nextType === 'multi_select') {
      setForm((f) => ({
        ...f,
        questionType: nextType,
        options:
          f.options.length >= 2 && f.questionType !== 'true_false'
            ? f.options
            : [
                { id: 'opt-a', text: '' },
                { id: 'opt-b', text: '' },
                { id: 'opt-c', text: '' },
                { id: 'opt-d', text: '' },
              ],
        correctAnswer: ['opt-a'],
      }));
    } else {
      setForm((f) => ({
        ...f,
        questionType: nextType,
        options: [],
        correctAnswer: '',
        negativeMarks: 0,
      }));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await apiRequest<{ imageUrl: string }>('/api/questions/upload-image', {
        method: 'POST',
        body: fd,
      });
      setForm((f) => ({ ...f, imageUrl: res.imageUrl }));
      notify('success', 'Image uploaded');
    } catch (err) {
      notify('error', 'Image upload failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        options:
          form.questionType === 'short_answer' || form.questionType === 'long_answer'
            ? []
            : form.options.filter((o) => o.text.trim().length > 0),
        imageUrl: form.imageUrl.trim() || undefined,
      };

      if (editingId) {
        await apiRequest(`/api/questions/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', 'Question updated');
      } else {
        await apiRequest('/api/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', 'Question added to bank');
      }
      setModalOpen(false);
      await fetchQuestions();
    } catch (err) {
      notify('error', 'Could not save question', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/questions/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', 'Question deleted');
      setDeleteTarget(null);
      await fetchQuestions();
    } catch (err) {
      notify('error', 'Delete failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkImport = async () => {
    setImporting(true);
    try {
      const parsed = JSON.parse(importText);
      const items = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Provide a valid JSON array of questions.');
      }
      const res = await apiRequest<{ importedCount: number }>('/api/questions/import', {
        method: 'POST',
        body: JSON.stringify({ questions: items }),
      });
      notify('success', `Imported ${res.importedCount} question(s)`);
      setImportOpen(false);
      await fetchQuestions();
    } catch (err) {
      notify('error', 'Import validation failed', err instanceof Error ? err.message : undefined);
    } finally {
      setImporting(false);
    }
  };

  const toggleMultiCorrect = (optId: string) => {
    setForm((f) => {
      const curr = Array.isArray(f.correctAnswer) ? f.correctAnswer : [];
      const next = curr.includes(optId) ? curr.filter((x) => x !== optId) : [...curr, optId];
      return { ...f, correctAnswer: next };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Question Bank</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Create, preview, filter, and bulk-import questions across MCQ, Multi-Select, True/False, Short, and Long Answer formats.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11182D] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium px-3.5 py-2 whitespace-nowrap shrink-0"
          >
            <Upload className="h-4 w-4" />
            <span>Import Template</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Question</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search questions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question text or topic…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          aria-label="Filter by subject"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] px-3 py-2 text-sm text-slate-900 dark:text-white"
        >
          <option value="">All Subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by difficulty"
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] px-3 py-2 text-sm text-slate-900 dark:text-white"
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select
          aria-label="Filter by question type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] px-3 py-2 text-sm text-slate-900 dark:text-white"
        >
          <option value="">All Question Types</option>
          {Object.entries(QUESTION_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Question List */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="No matching questions found"
          description="Add a new question manually or import a validated JSON question template to populate your question bank."
          action={
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2"
            >
              Add First Question
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] divide-y divide-slate-200 dark:divide-slate-800">
          {questions.map((q) => (
            <div
              key={q.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    {QUESTION_TYPE_LABELS[q.questionType]}
                  </span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>{q.subject}</span>
                  {q.topic && (
                    <>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{q.topic}</span>
                    </>
                  )}
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="capitalize">{q.difficulty}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    +{q.marks} / -{q.negativeMarks} marks
                  </span>
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {q.questionText}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label={`Preview question ${q.id}`}
                  onClick={() => setPreviewQuestion(q)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Edit question ${q.id}`}
                  onClick={() => openEditModal(q)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete question ${q.id}`}
                  onClick={() => setDeleteTarget(q)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Question Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingId ? 'Edit Question' : 'Add New Question'}
                </h3>
                <button
                  type="button"
                  aria-label="Close question modal"
                  onClick={() => setModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveQuestion} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="q-type" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Question Type
                    </label>
                    <select
                      id="q-type"
                      value={form.questionType}
                      onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    >
                      {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="q-subject" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Subject
                    </label>
                    <select
                      id="q-subject"
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
                    <label htmlFor="q-difficulty" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Difficulty
                    </label>
                    <select
                      id="q-difficulty"
                      value={form.difficulty}
                      onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as DifficultyLevel }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="q-topic" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Topic
                    </label>
                    <input
                      id="q-topic"
                      type="text"
                      value={form.topic}
                      onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                      placeholder="e.g., Dynamic Programming"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="q-category" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      id="q-category"
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="q-text" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Question Text
                  </label>
                  <textarea
                    id="q-text"
                    required
                    rows={3}
                    value={form.questionText}
                    onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
                    placeholder="Write a clear, unambiguous examination question..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                  />
                </div>

                {/* Options & Answer Key */}
                {(form.questionType === 'mcq' || form.questionType === 'multi_select') && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Options &amp; Correct Answer ({form.questionType === 'mcq' ? 'select one' : 'select all correct'})
                    </p>
                    {form.options.map((opt, idx) => {
                      const isCorrect =
                        form.questionType === 'mcq'
                          ? form.correctAnswer === opt.id
                          : Array.isArray(form.correctAnswer) && form.correctAnswer.includes(opt.id);
                      return (
                        <div key={opt.id} className="flex items-center gap-2.5">
                          <input
                            type={form.questionType === 'mcq' ? 'radio' : 'checkbox'}
                            name="correct-answer"
                            aria-label={`Mark option ${idx + 1} as correct`}
                            checked={isCorrect}
                            onChange={() =>
                              form.questionType === 'mcq'
                                ? setForm((f) => ({ ...f, correctAnswer: opt.id }))
                                : toggleMultiCorrect(opt.id)
                            }
                            className="h-4 w-4 accent-indigo-600"
                          />
                          <input
                            type="text"
                            required
                            value={opt.text}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                options: f.options.map((o) =>
                                  o.id === opt.id ? { ...o, text: e.target.value } : o
                                ),
                              }))
                            }
                            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-1.5 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {form.questionType === 'true_false' && (
                  <div className="flex items-center gap-6">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Correct Answer:
                    </span>
                    {['true', 'false'].map((val) => (
                      <label key={val} className="inline-flex items-center gap-2 text-sm capitalize cursor-pointer">
                        <input
                          type="radio"
                          name="tf-answer"
                          checked={form.correctAnswer === val}
                          onChange={() => setForm((f) => ({ ...f, correctAnswer: val }))}
                          className="accent-indigo-600"
                        />
                        {val}
                      </label>
                    ))}
                  </div>
                )}

                {(form.questionType === 'short_answer' || form.questionType === 'long_answer') && (
                  <div>
                    <label htmlFor="q-rubric" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Model Answer / Grading Rubric (Faculty Only)
                    </label>
                    <textarea
                      id="q-rubric"
                      required
                      rows={3}
                      value={typeof form.correctAnswer === 'string' ? form.correctAnswer : ''}
                      onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))}
                      placeholder="Key concepts and rubric points expected in a full-credit response..."
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="q-marks" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Marks
                    </label>
                    <input
                      id="q-marks"
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={form.marks}
                      onChange={(e) => setForm((f) => ({ ...f, marks: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="q-neg" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Negative Marks (if enabled on exam)
                    </label>
                    <input
                      id="q-neg"
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.negativeMarks}
                      onChange={(e) => setForm((f) => ({ ...f, negativeMarks: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="q-expl" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Answer Explanation (revealed only after result publication)
                  </label>
                  <textarea
                    id="q-expl"
                    rows={2}
                    value={form.explanation}
                    onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
                    placeholder="Concise rationale for the correct answer..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Optional Diagram / Image Attachment (PNG, JPG, WEBP up to 2MB)
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <ImageIcon className="h-4 w-4" />
                      <span>{uploadingImg ? 'Uploading…' : 'Upload Image'}</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {form.imageUrl && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
                        Attached: {form.imageUrl}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Question'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewQuestion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewQuestion(null)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                    {QUESTION_TYPE_LABELS[previewQuestion.questionType]} · {previewQuestion.subject} · +{previewQuestion.marks} marks
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    Question Preview
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close preview"
                  onClick={() => setPreviewQuestion(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {previewQuestion.questionText}
              </p>
              {previewQuestion.imageUrl && (
                <img
                  src={previewQuestion.imageUrl}
                  alt="Question diagram"
                  referrerPolicy="no-referrer"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-52 object-contain"
                />
              )}
              {previewQuestion.options.length > 0 && (
                <ul className="space-y-2">
                  {previewQuestion.options.map((opt) => {
                    const isCorrect = Array.isArray(previewQuestion.correctAnswer)
                      ? previewQuestion.correctAnswer.includes(opt.id)
                      : previewQuestion.correctAnswer === opt.id;
                    return (
                      <li
                        key={opt.id}
                        className={`rounded-lg border px-3.5 py-2 text-sm flex items-center justify-between ${
                          isCorrect
                            ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{opt.text}</span>
                        {isCorrect && <span className="text-xs font-semibold">Correct</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {previewQuestion.explanation && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 p-3.5 text-xs text-slate-600 dark:text-slate-300">
                  <strong className="font-semibold text-slate-900 dark:text-white">Explanation: </strong>
                  {previewQuestion.explanation}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {importOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setImportOpen(false)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Bulk Import Questions (Validated JSON Template)
                </h3>
                <button
                  type="button"
                  aria-label="Close import modal"
                  onClick={() => setImportOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Paste a JSON array matching the validated question schema below. All fields are validated server-side with Zod before saving.
              </p>
              <textarea
                rows={12}
                aria-label="JSON question template"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1020] p-3 font-mono text-xs text-slate-900 dark:text-slate-100"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleBulkImport}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60"
                >
                  {importing ? 'Validating & Importing…' : 'Import Questions'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete question?"
        description="This permanently removes the question from your question bank."
        confirmLabel="Delete Question"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

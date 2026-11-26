import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router, type Response } from 'express';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { logAudit, questionImageUpload, UPLOAD_DIR, verifyImageMagicBytes } from '../middleware/security';
import { store } from '../repositories/store';
import { bulkImportQuestionsSchema, questionSchema } from '../validators/schemas';

const router = Router();
const SAFE_IMAGE_FILENAME = /^qimg-[0-9a-f-]{36}\.(png|jpg|webp|gif)$/i;

// Serve uploaded question images safely with strict filename regex, path confinement, and nosniff header
router.get('/image/:filename', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const filename = path.basename(req.params.filename);
  if (!SAFE_IMAGE_FILENAME.test(filename)) {
    res.status(400).json({ error: 'Invalid image identifier.' });
    return;
  }
  const resolved = path.resolve(UPLOAD_DIR, filename);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.sendFile(resolved);
});

// All question bank endpoints are restricted to Teacher and Admin roles — Students NEVER access raw bank or answer keys
router.use(requireAuth, requireRole('admin', 'teacher'));

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const subject = typeof req.query.subject === 'string' ? req.query.subject : '';
  const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const category = typeof req.query.category === 'string' ? req.query.category : '';

  let list = store.getQuestions();
  // Teachers only see their own questions (prevent accessing other teachers' restricted data)
  if (req.user!.role === 'teacher') {
    list = list.filter((q) => q.createdBy === req.user!.id);
  }

  if (subject) list = list.filter((q) => q.subject === subject);
  if (difficulty) list = list.filter((q) => q.difficulty === difficulty);
  if (type) list = list.filter((q) => q.questionType === type);
  if (category) list = list.filter((q) => q.category === category);
  if (search) {
    list = list.filter(
      (q) =>
        q.questionText.toLowerCase().includes(search) ||
        q.topic.toLowerCase().includes(search) ||
        q.subject.toLowerCase().includes(search)
    );
  }

  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ questions: list });
});

router.post('/upload-image', questionImageUpload.single('image'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided.' });
    return;
  }
  if (!verifyImageMagicBytes(req.file.path)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      // ignore cleanup failure
    }
    res.status(400).json({ error: 'Uploaded file does not match a valid PNG, JPEG, WEBP, or GIF image signature.' });
    return;
  }
  const imageUrl = `/api/questions/image/${req.file.filename}`;
  res.status(201).json({ imageUrl });
});

router.post('/', (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = questionSchema.parse(req.body);
    const now = new Date().toISOString();
    const created = store.saveQuestion({
      id: `q-${crypto.randomUUID().slice(0, 10)}`,
      createdBy: req.user!.id,
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    logAudit({
      actor: req.user,
      action: 'QUESTION_CREATED',
      resourceType: 'Question',
      resourceId: created.id,
      metadata: { subject: created.subject, type: created.questionType },
    });

    res.status(201).json({ question: created });
  } catch (err) {
    next(err);
  }
});

router.post('/import', (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { questions } = bulkImportQuestionsSchema.parse(req.body);
    const now = new Date().toISOString();
    const imported = questions.map((item) =>
      store.saveQuestion({
        id: `q-${crypto.randomUUID().slice(0, 10)}`,
        createdBy: req.user!.id,
        ...item,
        createdAt: now,
        updatedAt: now,
      })
    );

    logAudit({
      actor: req.user,
      action: 'QUESTIONS_BULK_IMPORTED',
      resourceType: 'Question',
      resourceId: req.user!.id,
      metadata: { count: imported.length },
    });

    res.status(201).json({ importedCount: imported.length, questions: imported });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const existing = store.findQuestionById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    if (req.user!.role === 'teacher' && existing.createdBy !== req.user!.id) {
      res.status(403).json({ error: 'You can only edit questions you created.' });
      return;
    }

    const data = questionSchema.parse(req.body);
    const updated = store.saveQuestion({
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    });
    res.json({ question: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const existing = store.findQuestionById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Question not found.' });
    return;
  }
  if (req.user!.role === 'teacher' && existing.createdBy !== req.user!.id) {
    res.status(403).json({ error: 'You can only delete questions you created.' });
    return;
  }

  store.deleteQuestion(existing.id);
  logAudit({
    actor: req.user,
    action: 'QUESTION_DELETED',
    resourceType: 'Question',
    resourceId: existing.id,
  });

  res.json({ message: 'Question deleted.' });
});

export default router;

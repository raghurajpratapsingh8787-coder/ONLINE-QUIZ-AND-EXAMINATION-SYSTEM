# ExamVault — Online Quiz & Examination System

**Author & Platform Administrator:** Raghuraj Pratap Singh (`raghurajpratapsingh8787@gmail.com`)

A security-first, full-stack Online Quiz and Examination Platform engineered for universities and colleges, supporting **Admin**, **Teacher**, and **Student** roles with MongoDB/Mongoose schemas, JWT authentication, RBAC, real-time Socket.IO notifications, a distraction-free timed examination interface, subjective evaluation workflows, and live analytics.

---

## Architecture Overview

- **Frontend (`/src`)**: React 19 + TypeScript, Tailwind CSS v4 (light & dark themes), Motion (`motion/react`), Recharts, React Router, React Hook Form + Zod, Lucide Icons, Socket.IO Client.
- **Backend (`/backend` & `/server.ts`)**: Node.js + Express + TypeScript, Mongoose ODM (with automatic persistent local repository fallback when `MONGODB_URI` is unset), JWT access & rotated refresh tokens, `bcryptjs` password hashing, Zod validation, Helmet, CORS allowlist, `express-rate-limit`, Multer image uploads, Nodemailer email delivery, Socket.IO live notification hub.

---

## Seeded Demo Accounts

| Role | Name | Email | Default Demo Password |
| :--- | :--- | :--- | :--- |
| **Admin** | Raghuraj Pratap Singh | `raghurajpratapsingh8787@gmail.com` | `Admin@ExamVault2026` |
| **Teacher** | Dr. Meera Deshmukh | `teacher@examvault.edu` | `Teacher@ExamVault2026` |
| **Student** | Aarav Patel | `student@examvault.edu` | `Student@ExamVault2026` |

> **Security Note:** Override `DEMO_ADMIN_PASSWORD`, `DEMO_TEACHER_PASSWORD`, `DEMO_STUDENT_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `MONGODB_URI` in your environment secrets before deploying to production.

---

## Installation & Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and set secrets
cp .env.example .env

# 3. Seed database (also runs automatically on first boot if empty)
npm run seed

# 4. Run full-stack server (Express + Vite + Socket.IO on port 3000)
npm run dev

# 5. Build and start for production
npm run build
npm start
```

---

## Testing

Run the decoupled grading, eligibility, negative marking, sanitization, and CSV export unit test suite:

```bash
npm test
```

Type-check the entire project:

```bash
npm run lint
```

---

## Key REST API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a Student account (teachers and admins are provisioned by Admins)
- `POST /api/auth/login` — Authenticate and receive HttpOnly JWT cookies
- `POST /api/auth/refresh` — Rotate refresh token and issue new access token
- `POST /api/auth/logout` — Revoke refresh token and clear cookies
- `GET /api/auth/me` — Fetch authenticated profile & server time
- `PATCH /api/auth/profile` — Update user profile fields
- `POST /api/auth/change-password` — Update password & invalidate prior sessions
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — Expiring single-use reset flow

### Users (`/api/users`) — Admin / Teacher
- `GET /api/users` — List users (Admin: all; Teacher: students only)
- `POST /api/users` — Admin create account
- `PATCH /api/users/:id` — Admin update role/status
- `DELETE /api/users/:id` — Admin delete user

### Question Bank (`/api/questions`) — Admin / Teacher
- `GET /api/questions` — Filter/search questions (scoped by teacher ownership)
- `POST /api/questions` — Create question (MCQ, Multi-Select, True/False, Short, Long)
- `POST /api/questions/import` — Bulk import validated JSON template
- `POST /api/questions/upload-image` — Controlled Multer image upload (max 2MB)
- `PUT /api/questions/:id` & `DELETE /api/questions/:id`

### Examinations (`/api/exams`)
- `GET /api/exams` — Role-scoped exam listing with server-evaluated student eligibility
- `POST /api/exams`, `PUT /api/exams/:id`, `DELETE /api/exams/:id`

### Attempts & Evaluation (`/api/attempts`)
- `POST /api/attempts/start/:examId` — Start or resume attempt (strips answer keys, applies randomization, computes server deadline)
- `PATCH /api/attempts/:attemptId/answer` — Auto-save answer & review flag
- `POST /api/attempts/:attemptId/signal` — Record transparent tab-switch signal
- `POST /api/attempts/:attemptId/submit` — Concurrency-locked submission & objective auto-grading
- `GET /api/attempts/submissions/list` & `POST /api/attempts/submissions/:attemptId/evaluate`

### Results, Notifications, Analytics & Platform
- `GET /api/results`, `GET /api/results/:id`, `GET /api/results/export/csv`
- `POST /api/results/publish/exam/:examId`, `POST /api/results/:id/publish`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/mark-all-read`
- `GET /api/analytics/dashboard`
- `GET /api/platform/settings`, `PUT /api/platform/settings`, `GET/POST/PATCH /api/platform/incidents`, `GET /api/platform/audit-logs`
